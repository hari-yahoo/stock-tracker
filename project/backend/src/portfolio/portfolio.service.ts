import { Injectable } from '@nestjs/common';
import { ExitPlanStatus, Prisma, TradeSide, TradeStatus } from '@prisma/client';
import { decimalOutput, normalizeCurrency, parseDate } from '../common/api';
import {
  divideRounded,
  FX_RATE_SCALE,
  QUANTITY_SCALE,
  tradeValueMicros,
} from '../common/money';
import { PrismaService } from '../database/prisma.service';
import { evaluatePlanAlerts } from './alert-rules';

const buyInclude = {
  account: true,
  instrument: true,
  exitPlan: true,
  openingAllocations: {
    include: { closingTrade: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.TradeInclude;

const sellInclude = {
  instrument: true,
  closingAllocations: {
    include: { openingTrade: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.TradeInclude;

type Buy = Prisma.TradeGetPayload<{ include: typeof buyInclude }>;

interface ScaledPart {
  id: string;
  quantityMicros: bigint;
}

interface HoldingAccumulator {
  account: Buy['account'];
  instrument: Buy['instrument'];
  quantityMicros: bigint;
  costBasisMicros: bigint;
  lots: Array<{
    openingTradeId: string;
    remainingQuantityMicros: bigint;
    remainingCostMicros: bigint;
  }>;
}

interface CurrencyAccumulator {
  costBasisMicros: bigint;
  currentValueMicros: bigint;
  unrealizedPnlMicros: bigint;
  realizedPnlMicros: bigint;
  missingPrice: boolean;
}

function allocateExactly(
  total: bigint,
  parts: ScaledPart[],
): Map<string, bigint> {
  const result = new Map<string, bigint>();
  const totalWeight = parts.reduce(
    (sum, part) => sum + part.quantityMicros,
    0n,
  );
  let allocated = 0n;

  parts.forEach((part, index) => {
    const share =
      index === parts.length - 1
        ? total - allocated
        : divideRounded(total * part.quantityMicros, totalWeight);
    result.set(part.id, share);
    allocated += share;
  });
  return result;
}

function outputAmount(value: bigint | null): string | null {
  return value === null ? null : decimalOutput(value);
}

function activeAt(
  trade: { status: TradeStatus; voidedAt: Date | null },
  asOf: Date,
): boolean {
  return (
    trade.status === TradeStatus.POSTED ||
    (trade.voidedAt !== null && trade.voidedAt > asOf)
  );
}

@Injectable()
export class PortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(options: { asOf?: string; reportingCurrency?: string }) {
    const asOf = options.asOf ? parseDate(options.asOf, 'asOf') : new Date();
    const reportingCurrency = normalizeCurrency(
      options.reportingCurrency ?? 'INR',
    );

    const [buys, sells, prices, fxRates, accountCount] = await Promise.all([
      this.prisma.trade.findMany({
        where: {
          side: TradeSide.BUY,
          executedAt: { lte: asOf },
          OR: [
            { status: TradeStatus.POSTED },
            { status: TradeStatus.VOIDED, voidedAt: { gt: asOf } },
          ],
        },
        include: buyInclude,
        orderBy: [{ executedAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.trade.findMany({
        where: {
          side: TradeSide.SELL,
          executedAt: { lte: asOf },
          OR: [
            { status: TradeStatus.POSTED },
            { status: TradeStatus.VOIDED, voidedAt: { gt: asOf } },
          ],
        },
        include: sellInclude,
        orderBy: [{ executedAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.priceSnapshot.findMany({
        where: { capturedAt: { lte: asOf } },
        orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.fxRateSnapshot.findMany({
        where: { capturedAt: { lte: asOf } },
        orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.account.count(),
    ]);

    const latestPrice = new Map<string, (typeof prices)[number]>();
    for (const price of prices) {
      if (!latestPrice.has(price.instrumentId)) {
        latestPrice.set(price.instrumentId, price);
      }
    }
    const latestFx = new Map<string, (typeof fxRates)[number]>();
    for (const rate of fxRates) {
      const key = `${rate.baseCurrency}:${rate.quoteCurrency}`;
      if (!latestFx.has(key)) latestFx.set(key, rate);
    }

    const allocationCosts = new Map<string, bigint>();
    const remainingCost = new Map<string, bigint>();
    const remainingQuantity = new Map<string, bigint>();

    for (const buy of buys) {
      const soldParts = buy.openingAllocations
        .filter(
          (allocation) =>
            allocation.closingTrade.executedAt <= asOf &&
            activeAt(allocation.closingTrade, asOf),
        )
        .map((allocation) => ({
          id: allocation.id,
          quantityMicros: allocation.quantityMicros,
        }));
      const soldQuantity = soldParts.reduce(
        (sum, part) => sum + part.quantityMicros,
        0n,
      );
      const openQuantity = buy.quantityMicros - soldQuantity;
      const parts = [...soldParts];
      if (openQuantity > 0n) {
        parts.push({ id: `remaining:${buy.id}`, quantityMicros: openQuantity });
      }

      const grossShares = allocateExactly(
        tradeValueMicros(buy.quantityMicros, buy.priceMicros),
        parts,
      );
      const feeShares = allocateExactly(buy.feesMicros, parts);
      for (const allocation of soldParts) {
        allocationCosts.set(
          allocation.id,
          (grossShares.get(allocation.id) ?? 0n) +
            (feeShares.get(allocation.id) ?? 0n),
        );
      }
      remainingQuantity.set(buy.id, openQuantity);
      remainingCost.set(
        buy.id,
        openQuantity > 0n
          ? (grossShares.get(`remaining:${buy.id}`) ?? 0n) +
              (feeShares.get(`remaining:${buy.id}`) ?? 0n)
          : 0n,
      );
    }

    const realizedByCurrency = new Map<string, bigint>();
    for (const sell of sells) {
      const parts = sell.closingAllocations.map((allocation) => ({
        id: allocation.id,
        quantityMicros: allocation.quantityMicros,
      }));
      const proceeds = allocateExactly(
        tradeValueMicros(sell.quantityMicros, sell.priceMicros),
        parts,
      );
      const fees = allocateExactly(sell.feesMicros, parts);
      for (const allocation of sell.closingAllocations) {
        const pnl =
          (proceeds.get(allocation.id) ?? 0n) -
          (fees.get(allocation.id) ?? 0n) -
          (allocationCosts.get(allocation.id) ?? 0n);
        const currency = sell.instrument.quoteCurrency;
        realizedByCurrency.set(
          currency,
          (realizedByCurrency.get(currency) ?? 0n) + pnl,
        );
      }
    }

    const grouped = new Map<string, HoldingAccumulator>();
    for (const buy of buys) {
      const quantityMicros = remainingQuantity.get(buy.id) ?? 0n;
      if (quantityMicros <= 0n) continue;
      const costBasisMicros = remainingCost.get(buy.id) ?? 0n;
      const key = `${buy.accountId}:${buy.instrumentId}`;
      const holding = grouped.get(key) ?? {
        account: buy.account,
        instrument: buy.instrument,
        quantityMicros: 0n,
        costBasisMicros: 0n,
        lots: [],
      };
      holding.quantityMicros += quantityMicros;
      holding.costBasisMicros += costBasisMicros;
      holding.lots.push({
        openingTradeId: buy.id,
        remainingQuantityMicros: quantityMicros,
        remainingCostMicros: costBasisMicros,
      });
      grouped.set(key, holding);
    }

    const warnings: Array<{
      type: 'MISSING_PRICE' | 'MISSING_FX_RATE';
      message: string;
      instrumentId?: string;
      currency?: string;
    }> = [];
    const currencies = new Map<string, CurrencyAccumulator>();
    for (const [currency, realizedPnlMicros] of realizedByCurrency) {
      currencies.set(currency, {
        costBasisMicros: 0n,
        currentValueMicros: 0n,
        unrealizedPnlMicros: 0n,
        realizedPnlMicros,
        missingPrice: false,
      });
    }

    const holdings = [...grouped.values()].map((holding) => {
      const price = latestPrice.get(holding.instrument.id);
      const currentValueMicros = price
        ? tradeValueMicros(holding.quantityMicros, price.priceMicros)
        : null;
      const unrealizedPnlMicros =
        currentValueMicros === null
          ? null
          : currentValueMicros - holding.costBasisMicros;
      const currency = holding.instrument.quoteCurrency;
      const bucket = currencies.get(currency) ?? {
        costBasisMicros: 0n,
        currentValueMicros: 0n,
        unrealizedPnlMicros: 0n,
        realizedPnlMicros: 0n,
        missingPrice: false,
      };
      bucket.costBasisMicros += holding.costBasisMicros;
      if (currentValueMicros === null || unrealizedPnlMicros === null) {
        bucket.missingPrice = true;
        warnings.push({
          type: 'MISSING_PRICE',
          instrumentId: holding.instrument.id,
          message: `No price available for ${holding.instrument.symbol} as of ${asOf.toISOString()}`,
        });
      } else {
        bucket.currentValueMicros += currentValueMicros;
        bucket.unrealizedPnlMicros += unrealizedPnlMicros;
      }
      currencies.set(currency, bucket);

      return {
        account: holding.account,
        instrument: holding.instrument,
        quantity: decimalOutput(holding.quantityMicros),
        averageCost: decimalOutput(
          divideRounded(
            holding.costBasisMicros * QUANTITY_SCALE,
            holding.quantityMicros,
          ),
        ),
        costBasis: decimalOutput(holding.costBasisMicros),
        currentPrice: price ? decimalOutput(price.priceMicros) : null,
        priceCapturedAt: price?.capturedAt ?? null,
        currentValue: outputAmount(currentValueMicros),
        unrealizedPnl: outputAmount(unrealizedPnlMicros),
        unrealizedPnlPercent:
          unrealizedPnlMicros === null || holding.costBasisMicros === 0n
            ? null
            : decimalOutput(
                divideRounded(
                  unrealizedPnlMicros * 100n * QUANTITY_SCALE,
                  holding.costBasisMicros,
                ),
              ),
        lots: holding.lots.map((lot) => ({
          openingTradeId: lot.openingTradeId,
          remainingQuantity: decimalOutput(lot.remainingQuantityMicros),
          remainingCost: decimalOutput(lot.remainingCostMicros),
        })),
      };
    });

    const alerts = buys.flatMap((buy) => {
      if (
        !buy.exitPlan ||
        buy.exitPlan.status !== ExitPlanStatus.ACTIVE ||
        (remainingQuantity.get(buy.id) ?? 0n) <= 0n
      ) {
        return [];
      }
      const price = latestPrice.get(buy.instrumentId);
      return evaluatePlanAlerts({
        asOf,
        targetDate: buy.exitPlan.targetDate,
        currentPriceMicros: price?.priceMicros,
        targetPriceMicros: buy.exitPlan.targetPriceMicros,
      }).map((alert) => ({
        ...alert,
        exitPlanId: buy.exitPlan!.id,
        openingTradeId: buy.id,
        accountId: buy.accountId,
        instrumentId: buy.instrumentId,
        symbol: buy.instrument.symbol,
        targetDate: buy.exitPlan!.targetDate,
        targetPrice: decimalOutput(buy.exitPlan!.targetPriceMicros),
        currentPrice: price ? decimalOutput(price.priceMicros) : null,
      }));
    });

    alerts.sort((left, right) => {
      const severity = { CRITICAL: 0, WARNING: 1 };
      return severity[left.severity] - severity[right.severity];
    });

    const convert = (amount: bigint, currency: string): bigint | null => {
      if (currency === reportingCurrency) return amount;
      const direct = latestFx.get(`${currency}:${reportingCurrency}`);
      if (direct) {
        return divideRounded(amount * direct.rateNanos, FX_RATE_SCALE);
      }
      const inverse = latestFx.get(`${reportingCurrency}:${currency}`);
      if (inverse) {
        return divideRounded(amount * FX_RATE_SCALE, inverse.rateNanos);
      }
      return null;
    };

    let reportingCost = 0n;
    let reportingCurrent = 0n;
    let reportingUnrealized = 0n;
    let reportingRealized = 0n;
    let reportingComplete = true;
    let pricesComplete = true;
    const byCurrency = [...currencies.entries()].map(([currency, bucket]) => {
      const convertedCost = convert(bucket.costBasisMicros, currency);
      const convertedCurrent = convert(bucket.currentValueMicros, currency);
      const convertedUnrealized = convert(bucket.unrealizedPnlMicros, currency);
      const convertedRealized = convert(bucket.realizedPnlMicros, currency);
      if (
        convertedCost === null ||
        convertedCurrent === null ||
        convertedUnrealized === null ||
        convertedRealized === null
      ) {
        reportingComplete = false;
        warnings.push({
          type: 'MISSING_FX_RATE',
          currency,
          message: `No ${currency}/${reportingCurrency} FX rate available as of ${asOf.toISOString()}`,
        });
      } else {
        reportingCost += convertedCost;
        reportingCurrent += convertedCurrent;
        reportingUnrealized += convertedUnrealized;
        reportingRealized += convertedRealized;
      }
      if (bucket.missingPrice) pricesComplete = false;

      return {
        currency,
        costBasis: decimalOutput(bucket.costBasisMicros),
        currentValue: bucket.missingPrice
          ? null
          : decimalOutput(bucket.currentValueMicros),
        unrealizedPnl: bucket.missingPrice
          ? null
          : decimalOutput(bucket.unrealizedPnlMicros),
        realizedPnl: decimalOutput(bucket.realizedPnlMicros),
      };
    });

    return {
      asOf,
      reportingCurrency,
      summary: {
        accountCount,
        holdingCount: holdings.length,
        openLotCount: holdings.reduce(
          (count, holding) => count + holding.lots.length,
          0,
        ),
        byCurrency,
        reportingTotals: {
          costBasis: reportingComplete ? decimalOutput(reportingCost) : null,
          currentValue:
            reportingComplete && pricesComplete
              ? decimalOutput(reportingCurrent)
              : null,
          unrealizedPnl:
            reportingComplete && pricesComplete
              ? decimalOutput(reportingUnrealized)
              : null,
          realizedPnl: reportingComplete
            ? decimalOutput(reportingRealized)
            : null,
        },
      },
      holdings,
      alerts,
      warnings,
    };
  }
}
