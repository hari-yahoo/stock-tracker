import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TradeSide, TradeStatus } from '@prisma/client';
import {
  nonNegativeDecimalInput,
  normalizeCode,
  normalizeCurrency,
  parseDate,
  positiveDecimalInput,
} from '../common/api';
import { parseCsv, writeCsv } from '../common/csv';
import { decimalOutput } from '../common/api';
import { PrismaService } from '../database/prisma.service';

const HEADERS = [
  'id',
  'account',
  'account_currency',
  'symbol',
  'exchange',
  'instrument_currency',
  'side',
  'quantity',
  'price',
  'fees',
  'executed_at',
  'external_reference',
  'notes',
  'allocations',
];

export interface ImportResult {
  dryRun: boolean;
  importedTrades: number;
  createdAccounts: number;
  createdInstruments: number;
}

class DryRunRollback extends Error {
  constructor(readonly result: ImportResult) {
    super('CSV dry run complete');
  }
}

function rowObject(
  headers: string[],
  values: string[],
): Record<string, string> {
  return Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? '']),
  );
}

@Injectable()
export class DataTransferService {
  constructor(private readonly prisma: PrismaService) {}

  async exportTrades(): Promise<string> {
    const trades = await this.prisma.trade.findMany({
      where: { status: TradeStatus.POSTED },
      include: {
        account: true,
        instrument: true,
        closingAllocations: {
          include: { openingTrade: true },
          orderBy: { id: 'asc' },
        },
      },
      // BUY rows must precede SELL rows so exported lot references can be
      // imported in a single forward pass.
      orderBy: [{ side: 'asc' }, { executedAt: 'asc' }, { id: 'asc' }],
    });

    return writeCsv([
      HEADERS,
      ...trades.map((trade) => [
        trade.id,
        trade.account.name,
        trade.account.reportingCurrency,
        trade.instrument.symbol,
        trade.instrument.exchange,
        trade.instrument.quoteCurrency,
        trade.side,
        decimalOutput(trade.quantityMicros),
        decimalOutput(trade.priceMicros),
        decimalOutput(trade.feesMicros),
        trade.executedAt.toISOString(),
        trade.externalReference ?? '',
        trade.notes ?? '',
        trade.closingAllocations
          .map(
            (allocation) =>
              `${allocation.openingTrade.id}:${decimalOutput(allocation.quantityMicros)}`,
          )
          .join('|'),
      ]),
    ]);
  }

  async importTrades(csv: string, dryRun: boolean): Promise<ImportResult> {
    if (!csv.trim()) throw new BadRequestException('CSV file is empty');
    let rows: string[][];
    try {
      rows = parseCsv(csv);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid CSV',
      );
    }
    if (rows.length < 2) throw new BadRequestException('CSV has no trade rows');
    const headers = rows[0].map((header) => header.trim().toLowerCase());
    const missing = HEADERS.filter((header) => !headers.includes(header));
    if (missing.length) {
      throw new BadRequestException(
        `CSV is missing columns: ${missing.join(', ')}`,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const initialAccounts = new Set(
          (await tx.account.findMany({ select: { name: true } })).map(
            (account) => account.name,
          ),
        );
        const initialInstruments = new Set(
          (
            await tx.instrument.findMany({
              select: { symbol: true, exchange: true },
            })
          ).map((instrument) => `${instrument.symbol}:${instrument.exchange}`),
        );
        let importedTrades = 0;

        for (let index = 1; index < rows.length; index += 1) {
          const line = index + 1;
          const row = rowObject(headers, rows[index]);
          try {
            await this.importRow(tx, row);
            importedTrades += 1;
          } catch (error) {
            throw new BadRequestException(
              `CSV row ${line}: ${error instanceof Error ? error.message : 'invalid trade'}`,
            );
          }
        }

        const accountCount = await tx.account.count();
        const instrumentCount = await tx.instrument.count();
        const result = {
          dryRun,
          importedTrades,
          createdAccounts: accountCount - initialAccounts.size,
          createdInstruments: instrumentCount - initialInstruments.size,
        };
        if (dryRun) throw new DryRunRollback(result);
        return result;
      });
    } catch (error) {
      if (error instanceof DryRunRollback) return error.result;
      throw error;
    }
  }

  private async importRow(
    tx: Prisma.TransactionClient,
    row: Record<string, string>,
  ): Promise<void> {
    const accountName = row.account.trim();
    const symbol = normalizeCode(row.symbol);
    const exchange = normalizeCode(row.exchange);
    if (!accountName || !symbol || !exchange) {
      throw new Error('account, symbol, and exchange are required');
    }
    const side = normalizeCode(row.side);
    if (side !== TradeSide.BUY && side !== TradeSide.SELL) {
      throw new Error('side must be BUY or SELL');
    }

    const account = await tx.account.upsert({
      where: { name: accountName },
      create: {
        name: accountName,
        reportingCurrency: normalizeCurrency(row.account_currency || 'INR'),
      },
      update: {},
    });
    const instrument = await tx.instrument.upsert({
      where: { symbol_exchange: { symbol, exchange } },
      create: {
        symbol,
        exchange,
        quoteCurrency: normalizeCurrency(row.instrument_currency),
      },
      update: {},
    });
    const quantityMicros = positiveDecimalInput(row.quantity, 'quantity');
    const allocations = row.allocations
      ? row.allocations.split('|').map((entry) => {
          const separator = entry.lastIndexOf(':');
          if (separator <= 0) throw new Error('invalid allocation syntax');
          return {
            openingTradeId: entry.slice(0, separator),
            quantityMicros: positiveDecimalInput(
              entry.slice(separator + 1),
              'allocation quantity',
            ),
          };
        })
      : [];
    if (side === TradeSide.BUY && allocations.length) {
      throw new Error('BUY trades cannot contain allocations');
    }
    if (
      side === TradeSide.SELL &&
      allocations.reduce((sum, item) => sum + item.quantityMicros, 0n) !==
        quantityMicros
    ) {
      throw new Error('SELL allocations must exactly equal quantity');
    }

    const trade = await tx.trade.create({
      data: {
        ...(row.id ? { id: row.id } : {}),
        accountId: account.id,
        instrumentId: instrument.id,
        side,
        quantityMicros,
        priceMicros: nonNegativeDecimalInput(row.price, 'price'),
        feesMicros: nonNegativeDecimalInput(row.fees || '0', 'fees'),
        executedAt: parseDate(row.executed_at, 'executed_at'),
        externalReference: row.external_reference.trim() || null,
        notes: row.notes.trim() || null,
      },
    });
    for (const allocation of allocations) {
      await tx.lotAllocation.create({
        data: {
          openingTradeId: allocation.openingTradeId,
          closingTradeId: trade.id,
          quantityMicros: allocation.quantityMicros,
        },
      });
    }
  }
}
