import {
  BadRequestException,
  Injectable,
  NotFoundException,
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
import { CreateFxRateDto, CreatePriceDto, FxRateQueryDto } from './prices.dto';

function presentPrice<T extends { priceMicros: bigint }>(price: T) {
  return {
    ...price,
    priceMicros: undefined,
    price: decimalOutput(price.priceMicros),
  };
}

@Injectable()
export class PricesService {
  constructor(private readonly prisma: PrismaService) {}

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
}
