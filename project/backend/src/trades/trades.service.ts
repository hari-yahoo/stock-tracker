import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TradeSide, TradeStatus } from '@prisma/client';
import {
  decimalOutput,
  mapPrismaError,
  nonNegativeDecimalInput,
  parseDate,
  positiveDecimalInput,
} from '../common/api';
import { PrismaService } from '../database/prisma.service';
import { CreateTradeDto } from './trades.dto';

const tradeInclude = {
  account: true,
  instrument: true,
  openingAllocations: true,
  closingAllocations: true,
} satisfies Prisma.TradeInclude;

type TradeResult = Prisma.TradeGetPayload<{ include: typeof tradeInclude }>;

function presentTrade(trade: TradeResult) {
  return {
    ...trade,
    quantityMicros: undefined,
    priceMicros: undefined,
    feesMicros: undefined,
    quantity: decimalOutput(trade.quantityMicros),
    price: decimalOutput(trade.priceMicros),
    fees: decimalOutput(trade.feesMicros),
    openingAllocations: trade.openingAllocations.map((allocation) => ({
      ...allocation,
      quantityMicros: undefined,
      quantity: decimalOutput(allocation.quantityMicros),
    })),
    closingAllocations: trade.closingAllocations.map((allocation) => ({
      ...allocation,
      quantityMicros: undefined,
      quantity: decimalOutput(allocation.quantityMicros),
    })),
  };
}

@Injectable()
export class TradesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: {
    accountId?: string;
    instrumentId?: string;
    status?: TradeStatus;
  }) {
    const status = filters.status ?? TradeStatus.POSTED;
    const trades = await this.prisma.trade.findMany({
      where: {
        accountId: filters.accountId,
        instrumentId: filters.instrumentId,
        status,
      },
      include: tradeInclude,
      orderBy: [{ executedAt: 'desc' }, { recordedAt: 'desc' }],
    });
    return trades.map(presentTrade);
  }

  async get(id: string) {
    const trade = await this.prisma.trade.findUnique({
      where: { id },
      include: tradeInclude,
    });
    if (!trade) throw new NotFoundException('Trade not found');
    return presentTrade(trade);
  }

  async create(dto: CreateTradeDto) {
    const quantityMicros = positiveDecimalInput(dto.quantity, 'quantity');
    const priceMicros = nonNegativeDecimalInput(dto.price, 'price');
    const feesMicros = nonNegativeDecimalInput(dto.fees ?? '0', 'fees');
    const allocations = dto.allocations ?? [];

    if (dto.side === TradeSide.BUY && allocations.length) {
      throw new BadRequestException(
        'BUY trades cannot contain sell allocations',
      );
    }

    const parsedAllocations = allocations.map((allocation) => ({
      openingTradeId: allocation.openingTradeId,
      quantityMicros: positiveDecimalInput(
        allocation.quantity,
        'allocation quantity',
      ),
    }));
    const allocationTotal = parsedAllocations.reduce(
      (total, allocation) => total + allocation.quantityMicros,
      0n,
    );

    if (dto.side === TradeSide.SELL && allocationTotal !== quantityMicros) {
      throw new BadRequestException(
        'SELL allocations must exactly equal the trade quantity',
      );
    }

    try {
      const trade = await this.prisma.$transaction(async (tx) => {
        const created = await tx.trade.create({
          data: {
            accountId: dto.accountId,
            instrumentId: dto.instrumentId,
            side: dto.side,
            quantityMicros,
            priceMicros,
            feesMicros,
            executedAt: parseDate(dto.executedAt, 'executedAt'),
            externalReference: dto.externalReference?.trim() || null,
            notes: dto.notes?.trim() || null,
          },
        });

        for (const allocation of parsedAllocations) {
          await tx.lotAllocation.create({
            data: {
              openingTradeId: allocation.openingTradeId,
              closingTradeId: created.id,
              quantityMicros: allocation.quantityMicros,
            },
          });
        }

        return tx.trade.findUniqueOrThrow({
          where: { id: created.id },
          include: tradeInclude,
        });
      });
      return presentTrade(trade);
    } catch (error) {
      if (error instanceof Error && error.message.includes('allocation')) {
        throw new ConflictException(
          'Sell allocation violates lot, account, instrument, or quantity constraints',
        );
      }
      mapPrismaError(error, 'Trade');
    }
  }

  async void(id: string) {
    try {
      const trade = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.trade.findUnique({
          where: { id },
          include: {
            openingAllocations: {
              where: { closingTrade: { status: TradeStatus.POSTED } },
            },
          },
        });
        if (!existing) throw new NotFoundException('Trade not found');
        if (existing.status === TradeStatus.VOIDED) {
          throw new ConflictException('Trade is already voided');
        }
        if (existing.openingAllocations.length) {
          throw new ConflictException(
            'Cannot void a BUY trade with active sell allocations',
          );
        }
        return tx.trade.update({
          where: { id },
          data: { status: TradeStatus.VOIDED, voidedAt: new Date() },
          include: tradeInclude,
        });
      });
      return presentTrade(trade);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      mapPrismaError(error, 'Trade');
    }
  }
}
