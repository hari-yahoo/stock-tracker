import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  decimalOutput,
  mapPrismaError,
  nonNegativeDecimalInput,
  normalizeCurrency,
  parseDate,
} from '../common/api';
import { formatScaledDecimal, parseScaledDecimal } from '../common/money';
import { PrismaService } from '../database/prisma.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { NsePriceProvider } from './nse-price-provider';
import { CreateFxRateDto, CreatePriceDto, FxRateQueryDto } from './prices.dto';
import { ZerodhaPriceProvider } from './zerodha-price-provider';

function presentPrice<T extends { priceMicros: bigint }>(price: T) {
  return {
    ...price,
    priceMicros: undefined,
    price: decimalOutput(price.priceMicros),
  };
}

type PriceRefreshTrigger = 'MANUAL' | 'SCHEDULED' | 'CATCH_UP';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDateKey(date: Date) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function scheduledAtForIstDay(day: string) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date, 10, 30, 0, 0));
}

function isWorkingDay(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);
  const weekday = date.getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

@Injectable()
export class PricesService implements OnModuleInit, OnModuleDestroy {
  private refreshTimer: NodeJS.Timeout | null = null;
  private nextScheduledRefreshAt: Date | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolio: PortfolioService,
    private readonly nse: NsePriceProvider,
    private readonly zerodha: ZerodhaPriceProvider,
  ) {}

  onModuleInit() {
    if (this.isEodRefreshEnabled()) {
      void this.runMissedDailyPortfolioProcesses();
      this.scheduleNextRefresh();
    }
  }

  onModuleDestroy() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
  }

  async list(instrumentId?: string) {
    const prices = await this.prisma.priceSnapshot.findMany({
      where: { instrumentId },
      include: { instrument: true },
      orderBy: { capturedAt: 'desc' },
      take: 500,
    });
    return prices.map(presentPrice);
  }

  async latest(instrumentId: string) {
    const price = await this.prisma.priceSnapshot.findFirst({
      where: { instrumentId },
      include: { instrument: true },
      orderBy: { capturedAt: 'desc' },
    });
    if (!price) throw new NotFoundException('Price not found');
    return presentPrice(price);
  }

  async create(dto: CreatePriceDto) {
    try {
      const price = await this.prisma.priceSnapshot.create({
        data: {
          instrumentId: dto.instrumentId,
          priceMicros: nonNegativeDecimalInput(dto.price, 'price'),
          capturedAt: dto.capturedAt
            ? parseDate(dto.capturedAt, 'capturedAt')
            : new Date(),
          source: dto.source?.trim().toUpperCase() || 'MANUAL',
        },
        include: { instrument: true },
      });
      return presentPrice(price);
    } catch (error) {
      mapPrismaError(error, 'Price');
    }
  }

  getRefreshStatus() {
    const provider = this.providerName();
    return {
      enabled: this.isEodRefreshEnabled(),
      provider,
      configured:
        provider === 'NSE'
          ? this.nse.isConfigured()
          : provider === 'ZERODHA'
            ? this.zerodha.isConfigured()
            : false,
      nextRunAt: this.nextScheduledRefreshAt?.toISOString() ?? null,
      schedule: '16:00 IST on working days',
    };
  }

  async refreshEndOfDayPrices(
    trigger: PriceRefreshTrigger = 'MANUAL',
    options: { capturedAt?: Date; sourceSuffix?: string } = {},
  ) {
    const provider = this.providerName();
    if (provider !== 'NSE' && provider !== 'ZERODHA') {
      throw new BadRequestException(
        'Unsupported price provider. Use STOCK_TRACKER_PRICE_PROVIDER=NSE or ZERODHA.',
      );
    }

    const snapshot = await this.portfolio.snapshot({
      reportingCurrency: 'INR',
    });
    const seen = new Set<string>();
    const instruments = snapshot.holdings
      .map((holding) => holding.instrument)
      .filter((instrument) => {
        const key = `${instrument.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((instrument) => ({
        id: instrument.id,
        symbol: instrument.symbol,
        exchange: 'NSE',
        instrumentType: instrument.instrumentType,
      }));

    const mappings = await this.prisma.iciciSymbolMapping.findMany({
      where: {
        iciciSymbol: { in: instruments.map((instrument) => instrument.symbol) },
      },
      select: { iciciSymbol: true, nseSymbol: true },
    });
    const nseSymbols = new Map(
      mappings.map((mapping) => [mapping.iciciSymbol, mapping.nseSymbol]),
    );
    const priceInstruments = instruments.map((instrument) => ({
      ...instrument,
      symbol: nseSymbols.get(instrument.symbol) ?? instrument.symbol,
      exchange: 'NSE',
    }));

    const capturedAt = options.capturedAt ?? new Date();

    if (!instruments.length) {
      return {
        trigger,
        provider,
        requestedInstruments: 0,
        storedPrices: 0,
        missingSymbols: [],
        refreshedAt: capturedAt.toISOString(),
      };
    }

    const quotes =
      provider === 'NSE'
        ? await this.nse.fetchQuotes(priceInstruments)
        : await this.zerodha.fetchQuotes(priceInstruments);
    const source = `${quotes.provider}_${options.sourceSuffix ?? 'EOD'}`;

    for (const quote of quotes.quotes) {
      await this.prisma.priceSnapshot.upsert({
        where: {
          instrumentId_capturedAt: {
            instrumentId: quote.instrumentId,
            capturedAt,
          },
        },
        create: {
          instrumentId: quote.instrumentId,
          priceMicros: nonNegativeDecimalInput(quote.price, 'price'),
          capturedAt,
          source,
        },
        update: {
          priceMicros: nonNegativeDecimalInput(quote.price, 'price'),
          source,
        },
      });
    }

    return {
      trigger,
      provider: quotes.provider,
      requestedInstruments: instruments.length,
      storedPrices: quotes.quotes.length,
      missingSymbols: quotes.missingSymbols,
      refreshedAt: capturedAt.toISOString(),
    };
  }

  async runDailyPortfolioProcess(
    trigger: PriceRefreshTrigger = 'MANUAL',
    now = new Date(),
  ) {
    const dueDays = await this.dueWorkingDays(now);
    if (trigger === 'MANUAL' && dueDays.length === 0) {
      dueDays.push(istDateKey(now));
    }
    const processed: Array<{
      asOfDate: string;
      priceRefresh: Awaited<ReturnType<PricesService['refreshEndOfDayPrices']>>;
      portfolioSnapshot: Awaited<
        ReturnType<PortfolioService['recordDailySnapshot']>
      >;
    }> = [];

    for (const asOfDate of dueDays) {
      processed.push(
        await this.runDailyPortfolioProcessForDay(asOfDate, trigger),
      );
    }

    return {
      trigger,
      processedDays: processed.length,
      processed,
      nextRunAt: this.nextScheduledRefreshAt?.toISOString() ?? null,
      schedule: '16:00 IST on working days',
    };
  }

  async listFx(query: FxRateQueryDto) {
    const rates = await this.prisma.fxRateSnapshot.findMany({
      where: {
        baseCurrency: query.baseCurrency
          ? normalizeCurrency(query.baseCurrency)
          : undefined,
        quoteCurrency: query.quoteCurrency
          ? normalizeCurrency(query.quoteCurrency)
          : undefined,
      },
      orderBy: { capturedAt: 'desc' },
      take: 500,
    });
    return rates.map((rate) => ({
      ...rate,
      rateNanos: undefined,
      rate: formatScaledDecimal(rate.rateNanos, 9),
    }));
  }

  async createFx(dto: CreateFxRateDto) {
    const baseCurrency = normalizeCurrency(dto.baseCurrency);
    const quoteCurrency = normalizeCurrency(dto.quoteCurrency);
    if (baseCurrency === quoteCurrency) {
      throw new BadRequestException(
        'baseCurrency and quoteCurrency must differ',
      );
    }
    const rateNanos = parseScaledDecimal(dto.rate, 9);
    if (rateNanos <= 0n) {
      throw new BadRequestException('rate must be positive');
    }

    try {
      const rate = await this.prisma.fxRateSnapshot.create({
        data: {
          baseCurrency,
          quoteCurrency,
          rateNanos,
          capturedAt: dto.capturedAt
            ? parseDate(dto.capturedAt, 'capturedAt')
            : new Date(),
          source: dto.source?.trim().toUpperCase() || 'MANUAL',
        },
      });
      return {
        ...rate,
        rateNanos: undefined,
        rate: formatScaledDecimal(rate.rateNanos, 9),
      };
    } catch (error) {
      mapPrismaError(error, 'FX rate');
    }
  }

  private isEodRefreshEnabled() {
    return process.env.EOD_PRICE_REFRESH_ENABLED === 'true';
  }

  private providerName() {
    return (process.env.STOCK_TRACKER_PRICE_PROVIDER ?? 'NSE').toUpperCase();
  }

  private scheduleNextRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const now = new Date();
    const nextRunAt = this.nextScheduledWorkingDayRun(now);
    this.nextScheduledRefreshAt = nextRunAt;
    this.refreshTimer = setTimeout(
      () => {
        void this.runScheduledRefresh();
      },
      Math.max(1000, nextRunAt.getTime() - now.getTime()),
    );
  }

  private async runScheduledRefresh() {
    try {
      await this.runDailyPortfolioProcess('SCHEDULED');
    } catch (error) {
      console.error('Daily portfolio process failed', error);
    } finally {
      this.scheduleNextRefresh();
    }
  }

  private async runMissedDailyPortfolioProcesses() {
    try {
      await this.runDailyPortfolioProcess('CATCH_UP');
    } catch (error) {
      console.error('Daily portfolio catch-up failed', error);
    }
  }

  private async runDailyPortfolioProcessForDay(
    asOfDate: string,
    trigger: PriceRefreshTrigger,
  ) {
    const scheduledAt = scheduledAtForIstDay(asOfDate);
    const priceRefresh = await this.refreshEndOfDayPrices(trigger, {
      capturedAt: scheduledAt,
      sourceSuffix: 'DAILY',
    });
    const portfolioSnapshot = await this.portfolio.recordDailySnapshot({
      asOf: scheduledAt,
      asOfDate,
      reportingCurrency: 'INR',
      source: `${trigger}_DAILY_PROCESS`,
    });

    return { asOfDate, priceRefresh, portfolioSnapshot };
  }

  private async dueWorkingDays(now: Date) {
    const [latestSnapshotDate, firstActivityDate] = await Promise.all([
      this.portfolio.latestDailySnapshotDate('INR'),
      this.portfolio.firstPortfolioActivityDate(),
    ]);
    const today = istDateKey(now);
    let cursor = latestSnapshotDate
      ? addDays(latestSnapshotDate, 1)
      : istDateKey(firstActivityDate ?? now);
    const dueDays: string[] = [];

    while (cursor <= today) {
      const scheduledAt = scheduledAtForIstDay(cursor);
      if (isWorkingDay(cursor) && scheduledAt <= now) {
        dueDays.push(cursor);
      }
      cursor = addDays(cursor, 1);
    }

    return dueDays;
  }

  private nextScheduledWorkingDayRun(now: Date) {
    let day = istDateKey(now);
    for (;;) {
      const scheduledAt = scheduledAtForIstDay(day);
      if (isWorkingDay(day) && scheduledAt > now) {
        return scheduledAt;
      }
      day = addDays(day, 1);
    }
  }
}
