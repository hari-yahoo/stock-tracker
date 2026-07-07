import { Injectable } from '@nestjs/common';
import { ExitPlanStatus, TradeSide, TradeStatus } from '@prisma/client';
import { decimalOutput } from '../common/api';
import {
  divideRounded,
  QUANTITY_SCALE,
  tradeValueMicros,
} from '../common/money';
import { PrismaService } from '../database/prisma.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { GeneratePromptDto } from './ai-prompts.dto';

@Injectable()
export class AiPromptsService {
  constructor(
    private readonly portfolio: PortfolioService,
    private readonly prisma: PrismaService,
  ) {}

  async generate(dto: GeneratePromptDto) {
    const snapshot = await this.portfolio.snapshot({
      asOf: dto.asOf,
      reportingCurrency: dto.reportingCurrency,
    });
    const [plans, buys] = await Promise.all([
      this.prisma.exitPlan.findMany({
        where: {
          status: ExitPlanStatus.ACTIVE,
          openingTrade: { status: TradeStatus.POSTED },
        },
        include: {
          openingTrade: { include: { account: true, instrument: true } },
        },
        orderBy: { targetDate: 'asc' },
      }),
      this.prisma.trade.findMany({
        where: { side: TradeSide.BUY, status: TradeStatus.POSTED },
        include: {
          account: true,
          instrument: true,
          exitPlan: true,
          openingAllocations: {
            where: { closingTrade: { status: TradeStatus.POSTED } },
            include: { closingTrade: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { executedAt: 'desc' },
      }),
    ]);

    const closedLots = buys
      .filter(
        (buy) =>
          buy.openingAllocations.reduce(
            (sum, allocation) => sum + allocation.quantityMicros,
            0n,
          ) >= buy.quantityMicros,
      )
      .slice(0, 20)
      .map((buy) => {
        const proceeds = buy.openingAllocations.reduce(
          (sum, allocation) =>
            sum +
            tradeValueMicros(
              allocation.quantityMicros,
              allocation.closingTrade.priceMicros,
            ),
          0n,
        );
        const sellFees = buy.openingAllocations.reduce(
          (sum, allocation) =>
            sum +
            divideRounded(
              allocation.closingTrade.feesMicros * allocation.quantityMicros,
              allocation.closingTrade.quantityMicros,
            ),
          0n,
        );
        const cost =
          tradeValueMicros(buy.quantityMicros, buy.priceMicros) + buy.feesMicros;
        const averageExit = divideRounded(
          proceeds * QUANTITY_SCALE,
          buy.quantityMicros,
        );
        const actualExitDate = buy.openingAllocations.reduce(
          (latest, allocation) =>
            allocation.closingTrade.executedAt > latest
              ? allocation.closingTrade.executedAt
              : latest,
          buy.executedAt,
        );
        return {
          symbol: buy.instrument.symbol,
          account: buy.account.name,
          currency: buy.instrument.quoteCurrency,
          quantity: decimalOutput(buy.quantityMicros),
          averageEntry: decimalOutput(buy.priceMicros),
          averageExit: decimalOutput(averageExit),
          realizedPnl: decimalOutput(proceeds - sellFees - cost),
          actualExitDate,
          plannedPrice: buy.exitPlan
            ? decimalOutput(buy.exitPlan.targetPriceMicros)
            : null,
          plannedDate: buy.exitPlan?.targetDate ?? null,
        };
      });

    const alertPlans = new Map(
      snapshot.alerts.map((alert) => [
        `${alert.exitPlanId}:${alert.type}`,
        alert,
      ]),
    );
    const holdingsWithoutPlans = snapshot.holdings.filter((holding) =>
      holding.lots.some(
        (lot) => !plans.some((plan) => plan.openingTradeId === lot.openingTradeId),
      ),
    );
    const totals = snapshot.summary.reportingTotals;
    const currency = snapshot.reportingCurrency;
    const lines: string[] = [
      '# Portfolio strategy review request',
      '',
      `Snapshot timestamp: ${new Date(snapshot.asOf).toISOString()}`,
      `Reporting currency: ${currency}`,
      '',
      '## Role and review standard',
      'Act as a cautious, evidence-driven portfolio reviewer. This is decision support, not an instruction to trade. Separate facts from assumptions, state uncertainty clearly, and do not invent live prices, company news, fundamentals, or market conditions that are absent from this prompt.',
      '',
      '## Portfolio summary',
      `- Accounts: ${snapshot.summary.accountCount}`,
      `- Open holdings: ${snapshot.summary.holdingCount}`,
      `- Open lots: ${snapshot.summary.openLotCount}`,
      `- Current value: ${totals.currentValue ?? 'unavailable'} ${currency}`,
      `- Open cost basis: ${totals.costBasis ?? 'unavailable'} ${currency}`,
      `- Unrealized P/L: ${totals.unrealizedPnl ?? 'unavailable'} ${currency}`,
      `- Realized P/L: ${totals.realizedPnl ?? 'unavailable'} ${currency}`,
      '',
      '## Open holdings',
    ];

    if (snapshot.holdings.length === 0) {
      lines.push('- No open holdings.');
    } else {
      for (const holding of snapshot.holdings.slice(0, 100)) {
        lines.push(
          `- ${holding.instrument.symbol} (${holding.instrument.exchange}, ${holding.account.name}): quantity ${holding.quantity}; average cost ${holding.averageCost} ${holding.instrument.quoteCurrency}; current price ${holding.currentPrice ?? 'unavailable'}; market value ${holding.currentValue ?? 'unavailable'}; unrealized P/L ${holding.unrealizedPnl ?? 'unavailable'} (${holding.unrealizedPnlPercent ?? 'unavailable'}%); sector ${holding.instrument.sector ?? 'untagged'}.`,
        );
      }
    }

    lines.push('', '## Active exit plans');
    if (plans.length === 0) {
      lines.push('- No active exit plans.');
    } else {
      for (const plan of plans) {
        const relatedAlerts = [...alertPlans.values()]
          .filter((alert) => alert.exitPlanId === plan.id)
          .map((alert) => alert.type)
          .join(', ');
        lines.push(
          `- ${plan.openingTrade.instrument.symbol} (${plan.openingTrade.account.name}): target ${decimalOutput(plan.targetPriceMicros)} ${plan.openingTrade.instrument.quoteCurrency} by ${plan.targetDate.toISOString().slice(0, 10)}; rationale: ${plan.rationale}; alerts: ${relatedAlerts || 'none'}.`,
        );
      }
    }

    lines.push('', '## Recently closed lots');
    if (closedLots.length === 0) {
      lines.push('- No fully closed lots in the available ledger.');
    } else {
      for (const lot of closedLots) {
        lines.push(
          `- ${lot.symbol} (${lot.account}): quantity ${lot.quantity}; average entry ${lot.averageEntry} ${lot.currency}; average exit ${lot.averageExit}; realized P/L ${lot.realizedPnl}; actual exit ${lot.actualExitDate.toISOString().slice(0, 10)}; planned target ${lot.plannedPrice ?? 'none'}; planned date ${lot.plannedDate?.toISOString().slice(0, 10) ?? 'none'}.`,
        );
      }
    }

    lines.push('', '## Data quality and discipline flags');
    if (snapshot.warnings.length === 0 && holdingsWithoutPlans.length === 0) {
      lines.push('- No known price, FX, or exit-plan coverage gaps.');
    } else {
      snapshot.warnings.forEach((warning) => lines.push(`- ${warning.message}`));
      if (holdingsWithoutPlans.length) {
        lines.push(
          `- ${holdingsWithoutPlans.length} holding(s) contain at least one open lot without an active exit plan: ${holdingsWithoutPlans.map((holding) => holding.instrument.symbol).join(', ')}.`,
        );
      }
    }

    if (dto.additionalInstructions?.trim()) {
      lines.push(
        '',
        '## Additional instructions from the investor',
        dto.additionalInstructions.trim(),
      );
    }

    lines.push(
      '',
      '## Requested output',
      '1. Start with a concise portfolio diagnosis and identify the three most important issues.',
      '2. Review concentration, diversification, position sizing, data gaps, and exit-plan coverage using only the supplied data.',
      '3. Review each active exit plan for internal consistency and possible thesis drift. Do not claim current company facts unless I provide them separately.',
      '4. Compare planned versus actual behavior for closed lots and identify discipline patterns.',
      '5. Provide a prioritized checklist of questions I should research before making any decision.',
      '6. End with a table: symbol, observed risk, missing evidence, exit-plan status, and next review action.',
    );

    return {
      prompt: lines.join('\n'),
      generatedAt: new Date(),
      context: {
        holdingCount: snapshot.holdings.length,
        activeExitPlanCount: plans.length,
        alertCount: snapshot.alerts.length,
        closedLotCount: closedLots.length,
        warningCount: snapshot.warnings.length,
      },
    };
  }
}
