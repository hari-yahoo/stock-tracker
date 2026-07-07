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
import { CreateFxRateDto, CreatePriceDto, FxRateQueryDto } from './prices.dto';
import { ZerodhaPriceProvider } from './zerodha-price-provider';

function presentPrice<T extends { priceMicros: bigint }>(price: T) {
  return {
    ...price,
    priceMicros: undefined,
    price: decimalOutput(price.priceMicros),
  };
}

@Injectable()
export class PricesService implements OnModuleInit, OnModuleDestroy {
  private refreshTimer: NodeJS.Timeout | null = null;
  private nextScheduledRefreshAt: Date | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolio: PortfolioService,
    private readonly zerodha: ZerodhaPriceProvider,
  ) {}

  onModuleInit() {
    if (this.isEodRefreshEnabled()) {
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
    const provider = (process.env.STOCK_TRACKER_PRICE_PROVIDER ?? 'DISABLED').toUpperCase();
    return {
      enabled: this.isEodRefreshEnabled(),
      provider,
      configured: provider === 'ZERODHA' ? this.zerodha.isConfigured() : false,
      nextRunAt: this.nextScheduledRefreshAt?.toISOString() ?? null,
      schedule: '18:00 IST daily',
    };
  }

  async refreshEndOfDayPrices(trigger: 'MANUAL' | 'SCHEDULED' = 'MANUAL') {
    const provider = (process.env.STOCK_TRACKER_PRICE_PROVIDER ?? 'DISABLED').toUpperCase();
    if (provider !== 'ZERODHA') {
      throw new BadRequestException(
        'No supported EOD price provider is configured. Set STOCK_TRACKER_PRICE_PROVIDER=ZERODHA.',
      );
    }

    const snapshot = await this.portfolio.snapshot({ reportingCurrency: 'INR' });
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
        exchange: instrument.exchange,
      }));

    if (!instruments.length) {
      return {
        trigger,
        provider,
        requestedInstruments: 0,
        storedPrices: 0,
        missingSymbols: [],
        refreshedAt: new Date().toISOString(),
      };
    }

    const quotes = await this.zerodha.fetchQuotes(instruments);
    const capturedAt = new Date();

    for (const quote of quotes.quotes) {
      await this.prisma.priceSnapshot.create({
        data: {
          instrumentId: quote.instrumentId,
          priceMicros: nonNegativeDecimalInput(quote.price, 'price'),
          capturedAt,
          source: `${quotes.provider}_EOD`,
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

  private scheduleNextRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const nowIst = new Date(now.getTime() + istOffsetMs);
    const nextIst = new Date(nowIst);
    nextIst.setUTCHours(18, 0, 0, 0);
    if (nextIst.getTime() <= nowIst.getTime()) {
      nextIst.setUTCDate(nextIst.getUTCDate() + 1);
    }
    const nextRunAt = new Date(nextIst.getTime() - istOffsetMs);
    this.nextScheduledRefreshAt = nextRunAt;
    this.refreshTimer = setTimeout(async () => {
      try {
        await this.refreshEndOfDayPrices('SCHEDULED');
      } finally {
        this.scheduleNextRefresh();
      }
    }, Math.max(1000, nextRunAt.getTime() - now.getTime()));
  }
}
