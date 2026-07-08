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

const ICICI_HEADERS = [
  'stock symbol',
  'company name',
  'isin code',
  'action',
  'quantity',
  'transaction price',
  'brokerage',
  'transaction charges',
  'stampduty',
  'segment',
  'stt paid/not paid',
  'remarks',
  'transaction date',
  'exchange',
];

const ZERODHA_HOLDINGS_HEADERS = [
  'symbol',
  'isin',
  'transaction date',
  'transaction type',
  'quantity',
  'price',
];

export interface ImportResult {
  dryRun: boolean;
  importedTrades: number;
  createdAccounts: number;
  createdInstruments: number;
  warnings?: string[];
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

function parseIciciDate(value: string): Date {
  const trimmed = value.trim();
  const match = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(trimmed);
  if (!match) {
    throw new BadRequestException(
      'transaction date must be in DD-MMM-YYYY format',
    );
  }
  const months = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];
  const monthIndex = months.indexOf(match[2].toUpperCase());
  if (monthIndex === -1) {
    throw new BadRequestException(
      'transaction date must contain a valid month abbreviation',
    );
  }
  const date = new Date(
    Date.UTC(Number(match[3]), monthIndex, Number(match[1]), 12, 0, 0),
  );
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('transaction date is invalid');
  }
  return date;
}

function parseZerodhaDate(value: string): Date {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new BadRequestException(
      'transaction date must be in YYYY-MM-DD format',
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException('transaction date is invalid');
  }
  return date;
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

  async importIciciDirectTrades(
    csv: string,
    dryRun: boolean,
  ): Promise<ImportResult> {
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
    const missing = ICICI_HEADERS.filter((header) => !headers.includes(header));
    if (missing.length) {
      throw new BadRequestException(
        `ICICIDirect CSV is missing columns: ${missing.join(', ')}`,
      );
    }

    const parsedRows = rows
      .slice(1)
      .filter((row) => row.some((cell) => cell.trim() !== ''))
      .map((values, index) => {
        const row = rowObject(headers, values);
        return {
          line: index + 2,
          row,
          date: parseIciciDate(row['transaction date'] || ''),
        };
      })
      .sort((left, right) => {
        const byDate = left.date.getTime() - right.date.getTime();
        if (byDate !== 0) return byDate;
        const leftAction = normalizeCode(left.row.action || '');
        const rightAction = normalizeCode(right.row.action || '');
        if (leftAction !== rightAction) {
          return leftAction === TradeSide.BUY ? -1 : 1;
        }
        return left.line - right.line;
      });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const initialAccounts = await tx.account.count();
        const initialInstruments = await tx.instrument.count();
        const warnings: string[] = [];
        let importedTrades = 0;

        for (const entry of parsedRows) {
          try {
            const warning = await this.importIciciDirectRow(
              tx,
              entry.row,
              entry.line,
              entry.date,
            );
            importedTrades += 1;
            if (warning) warnings.push(`Row ${entry.line}: ${warning}`);
          } catch (error) {
            throw new BadRequestException(
              `CSV row ${entry.line}: ${error instanceof Error ? error.message : 'invalid trade'}`,
            );
          }
        }

        const result = {
          dryRun,
          importedTrades,
          createdAccounts: (await tx.account.count()) - initialAccounts,
          createdInstruments:
            (await tx.instrument.count()) - initialInstruments,
          warnings,
        };
        if (dryRun) throw new DryRunRollback(result);
        return result;
      });
    } catch (error) {
      if (error instanceof DryRunRollback) return error.result;
      throw error;
    }
  }

  async importZerodhaHoldings(
    csv: string,
    dryRun: boolean,
  ): Promise<ImportResult> {
    if (!csv.trim()) throw new BadRequestException('CSV file is empty');
    let rows: string[][];
    try {
      rows = parseCsv(csv);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid CSV',
      );
    }
    if (rows.length < 2)
      throw new BadRequestException('CSV has no holding rows');
    const headers = rows[0].map((header) => header.trim().toLowerCase());
    const missing = ZERODHA_HOLDINGS_HEADERS.filter(
      (header) => !headers.includes(header),
    );
    if (missing.length) {
      throw new BadRequestException(
        `Zerodha holdings CSV is missing columns: ${missing.join(', ')}`,
      );
    }

    const parsedRows = rows
      .slice(1)
      .map((values, index) => ({
        line: index + 2,
        row: rowObject(headers, values),
      }))
      .filter((entry) =>
        Object.values(entry.row).some((cell) => cell.trim() !== ''),
      );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const initialAccounts = await tx.account.count();
        const initialInstruments = await tx.instrument.count();
        let importedTrades = 0;

        for (const entry of parsedRows) {
          try {
            await this.importZerodhaHoldingRow(tx, entry.row, entry.line);
            importedTrades += 1;
          } catch (error) {
            throw new BadRequestException(
              `CSV row ${entry.line}: ${error instanceof Error ? error.message : 'invalid holding lot'}`,
            );
          }
        }

        const result = {
          dryRun,
          importedTrades,
          createdAccounts: (await tx.account.count()) - initialAccounts,
          createdInstruments:
            (await tx.instrument.count()) - initialInstruments,
          warnings: [],
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

  private async importIciciDirectRow(
    tx: Prisma.TransactionClient,
    row: Record<string, string>,
    line: number,
    executedAt: Date,
  ): Promise<string | null> {
    const symbol = normalizeCode(row['stock symbol'] || '');
    const exchange = normalizeCode(row.exchange || '');
    const action = normalizeCode(row.action || '');
    const accountName = 'ICICIDirect';
    if (!symbol || !exchange) {
      throw new Error('stock symbol and exchange are required');
    }
    if (action !== TradeSide.BUY && action !== TradeSide.SELL) {
      throw new Error('action must be Buy or Sell');
    }

    const account = await tx.account.upsert({
      where: { name: accountName },
      create: { name: accountName, reportingCurrency: 'INR' },
      update: {},
    });
    const instrument = await tx.instrument.upsert({
      where: { symbol_exchange: { symbol, exchange } },
      create: {
        symbol,
        exchange,
        name: row['company name']?.trim() || null,
        quoteCurrency: 'INR',
      },
      update: {
        name: row['company name']?.trim() || undefined,
      },
    });

    const quantityMicros = positiveDecimalInput(row.quantity, 'quantity');
    const priceMicros = nonNegativeDecimalInput(
      row['transaction price'],
      'transaction price',
    );
    const feesMicros =
      nonNegativeDecimalInput(row.brokerage || '0', 'brokerage') +
      nonNegativeDecimalInput(
        row['transaction charges'] || '0',
        'transaction charges',
      ) +
      nonNegativeDecimalInput(row.stampduty || '0', 'stampduty');

    const remarks = row.remarks?.trim() || '';
    const notes = [
      'Imported from ICICIDirect transactions CSV',
      row.segment?.trim() ? `segment: ${row.segment.trim()}` : '',
      row['stt paid/not paid']?.trim()
        ? `stt: ${row['stt paid/not paid'].trim()}`
        : '',
      remarks ? `remarks: ${remarks}` : '',
      row['isin code']?.trim() ? `isin: ${row['isin code'].trim()}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
    const externalReference = `ICICIDIRECT:${line}`;

    const trade = await tx.trade.create({
      data: {
        accountId: account.id,
        instrumentId: instrument.id,
        side: action,
        quantityMicros,
        priceMicros,
        feesMicros,
        executedAt,
        externalReference,
        notes,
      },
    });

    if (action === TradeSide.BUY) {
      if (/split|bonus/i.test(remarks)) {
        return 'corporate action imported as a zero- or stated-cost BUY row';
      }
      return null;
    }

    const openBuys = await tx.trade.findMany({
      where: {
        accountId: account.id,
        instrumentId: instrument.id,
        side: TradeSide.BUY,
        status: TradeStatus.POSTED,
        executedAt: { lte: executedAt },
      },
      include: {
        openingAllocations: {
          where: { closingTrade: { status: TradeStatus.POSTED } },
        },
      },
      orderBy: [{ executedAt: 'asc' }, { recordedAt: 'asc' }, { id: 'asc' }],
    });

    let remaining = quantityMicros;
    for (const buy of openBuys) {
      const allocated = buy.openingAllocations.reduce(
        (sum, allocation) => sum + allocation.quantityMicros,
        0n,
      );
      const available = buy.quantityMicros - allocated;
      if (available <= 0n) continue;
      const allocatedNow = available < remaining ? available : remaining;
      await tx.lotAllocation.create({
        data: {
          openingTradeId: buy.id,
          closingTradeId: trade.id,
          quantityMicros: allocatedNow,
        },
      });
      remaining -= allocatedNow;
      if (remaining === 0n) break;
    }

    if (remaining > 0n) {
      throw new Error(
        `sell quantity exceeds available BUY lots by ${decimalOutput(remaining)}`,
      );
    }

    return null;
  }

  private async importZerodhaHoldingRow(
    tx: Prisma.TransactionClient,
    row: Record<string, string>,
    line: number,
  ): Promise<void> {
    const symbol = normalizeCode(row.symbol || '');
    const isin = normalizeCode(row.isin || '');
    const transactionType = normalizeCode(row['transaction type'] || '');
    if (!symbol || !isin) throw new Error('symbol and ISIN are required');
    if (!/^[A-Z0-9]{12}$/.test(isin)) {
      throw new Error('ISIN must contain 12 letters or digits');
    }
    if (!['BUY', 'BONUS', 'SPLIT'].includes(transactionType)) {
      throw new Error('transaction type must be BUY, BONUS, or SPLIT');
    }

    const account = await tx.account.upsert({
      where: { name: 'Zerodha' },
      create: { name: 'Zerodha', reportingCurrency: 'INR' },
      update: {},
    });
    const instrument = await tx.instrument.upsert({
      where: { symbol_exchange: { symbol, exchange: 'NSE' } },
      create: {
        symbol,
        exchange: 'NSE',
        quoteCurrency: 'INR',
      },
      update: {},
    });

    await tx.trade.create({
      data: {
        accountId: account.id,
        instrumentId: instrument.id,
        side: TradeSide.BUY,
        quantityMicros: positiveDecimalInput(row.quantity, 'quantity'),
        priceMicros: nonNegativeDecimalInput(row.price, 'price'),
        feesMicros: 0n,
        executedAt: parseZerodhaDate(row['transaction date'] || ''),
        externalReference: `ZERODHA-HOLDINGS:${line}`,
        notes: [
          'Imported from Zerodha current holdings CSV',
          `type: ${transactionType}`,
          `isin: ${isin}`,
        ].join(' | '),
      },
    });
  }
}
