import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { ExitPlanStatus, TradeSide } from '@prisma/client';
import { AccountsService } from './accounts/accounts.service';
import { AiPromptsService } from './ai-prompts/ai-prompts.service';
import { BackupsService } from './backups/backups.service';
import { decimalOutput } from './common/api';
import { DataTransferService } from './data-transfer/data-transfer.service';
import { PrismaService } from './database/prisma.service';
import { ExitPlansService } from './exit-plans/exit-plans.service';
import { InstrumentsService } from './instruments/instruments.service';
import { PricesService } from './prices/prices.service';
import { PortfolioService } from './portfolio/portfolio.service';
import { TradesService } from './trades/trades.service';
import { ZerodhaPriceProvider } from './prices/zerodha-price-provider';
import { NsePriceProvider } from './prices/nse-price-provider';

describe('ledger API services', () => {
  const databasePath = join(tmpdir(), `stock-tracker-${randomUUID()}.db`);
  let prisma: PrismaService;

  beforeAll(() => {
    const migration = readFileSync(
      join(
        __dirname,
        '..',
        'prisma',
        'migrations',
        '20260707120000_init_trade_ledger',
        'migration.sql',
      ),
      'utf8',
    );
    const database = new DatabaseSync(databasePath);
    database.exec(migration);
    database.close();
    process.env.DATABASE_URL = `file:${databasePath}`;
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    delete process.env.DATABASE_URL;
    for (const suffix of ['', '-shm', '-wal']) {
      rmSync(`${databasePath}${suffix}`, { force: true });
    }
    rmSync(join(tmpdir(), 'backups', basename(databasePath, '.db')), {
      force: true,
      recursive: true,
    });
  });

  it('creates, prices, plans, allocates, and voids ledger records', async () => {
    const accounts = new AccountsService(prisma);
    const instruments = new InstrumentsService(prisma);
    const trades = new TradesService(prisma);
    const plans = new ExitPlansService(prisma);
    const portfolio = new PortfolioService(prisma);
    const prices = new PricesService(
      prisma,
      portfolio,
      new NsePriceProvider(),
      new ZerodhaPriceProvider(),
    );

    const account = await accounts.create({
      name: 'Zerodha',
      reportingCurrency: 'INR',
    });
    const instrument = await instruments.create({
      symbol: 'infy',
      exchange: 'nse',
      quoteCurrency: 'INR',
    });
    const buy = await trades.create({
      accountId: account.id,
      instrumentId: instrument.id,
      side: TradeSide.BUY,
      quantity: '10.5',
      price: '1500.25',
      fees: '20',
      executedAt: '2026-07-07T09:30:00.000Z',
    });

    expect(buy.quantity).toBe('10.5');
    expect(buy.price).toBe('1500.25');

    const plan = await plans.create({
      openingTradeId: buy.id,
      targetPrice: '1600',
      targetDate: '2026-12-05T00:00:00.000Z',
      rationale: 'Expected earnings rerating.',
    });
    expect(plan.status).toBe(ExitPlanStatus.ACTIVE);

    const price = await prices.create({
      instrumentId: instrument.id,
      price: '1688.50',
      capturedAt: '2026-07-07T10:00:00.000Z',
    });
    expect(price.price).toBe('1688.5');

    const sell = await trades.create({
      accountId: account.id,
      instrumentId: instrument.id,
      side: TradeSide.SELL,
      quantity: '4',
      price: '1700',
      executedAt: '2026-12-01T09:30:00.000Z',
      allocations: [{ openingTradeId: buy.id, quantity: '4' }],
    });
    expect(sell.closingAllocations).toHaveLength(1);

    const snapshot = await portfolio.snapshot({
      asOf: '2026-12-01T10:00:00.000Z',
      reportingCurrency: 'INR',
    });
    expect(snapshot.holdings).toHaveLength(1);
    expect(snapshot.holdings[0]).toMatchObject({
      quantity: '6.5',
      costBasis: '9764.005952',
      currentValue: '10975.25',
      unrealizedPnl: '1211.244048',
    });
    expect(snapshot.summary.reportingTotals).toEqual({
      costBasis: '9764.005952',
      currentValue: '10975.25',
      unrealizedPnl: '1211.244048',
      realizedPnl: '791.380952',
    });
    expect(snapshot.alerts.map((alert) => alert.type)).toEqual([
      'TARGET_HIT',
      'APPROACHING',
    ]);

    const usdAccount = await accounts.create({
      name: 'Interactive Brokers',
      reportingCurrency: 'INR',
    });
    const usdInstrument = await instruments.create({
      symbol: 'AAPL',
      exchange: 'NASDAQ',
      quoteCurrency: 'USD',
    });
    await trades.create({
      accountId: usdAccount.id,
      instrumentId: usdInstrument.id,
      side: TradeSide.BUY,
      quantity: '1',
      price: '100',
      executedAt: '2026-07-07T09:30:00.000Z',
    });
    await prices.create({
      instrumentId: usdInstrument.id,
      price: '110',
      capturedAt: '2026-07-07T10:00:00.000Z',
    });
    expect(
      await prices.createFx({
        baseCurrency: 'USD',
        quoteCurrency: 'INR',
        rate: '83.125',
        capturedAt: '2026-07-07T10:00:00.000Z',
      }),
    ).toMatchObject({ rate: '83.125' });

    const multiCurrency = await portfolio.snapshot({
      asOf: '2026-12-01T10:00:00.000Z',
      reportingCurrency: 'INR',
    });
    expect(multiCurrency.summary.accountCount).toBe(2);
    expect(multiCurrency.summary.reportingTotals).toEqual({
      costBasis: '18076.505952',
      currentValue: '20119',
      unrealizedPnl: '2042.494048',
      realizedPnl: '791.380952',
    });

    const transfer = new DataTransferService(prisma);
    const exported = await transfer.exportTrades();
    expect(exported).toContain('INFY');
    expect(exported).toContain(`${buy.id}:4`);

    await expect(
      trades.create({
        accountId: account.id,
        instrumentId: instrument.id,
        side: TradeSide.SELL,
        quantity: '7',
        price: '1700',
        executedAt: '2026-12-02T09:30:00.000Z',
        allocations: [{ openingTradeId: buy.id, quantity: '7' }],
      }),
    ).rejects.toThrow('Sell allocation violates');

    const voidedSell = await trades.void(sell.id);
    expect(voidedSell.status).toBe('VOIDED');

    const voidedBuy = await trades.void(buy.id);
    expect(voidedBuy.status).toBe('VOIDED');
    expect((await plans.get(plan.id)).status).toBe(ExitPlanStatus.CANCELLED);

    // Make the voids later than the requested historical snapshot.
    await prisma.trade.updateMany({
      where: { id: { in: [buy.id, sell.id] } },
      data: { voidedAt: new Date('2026-12-02T10:00:00.000Z') },
    });

    const historicalSnapshot = await portfolio.snapshot({
      asOf: '2026-12-01T10:00:00.000Z',
      reportingCurrency: 'INR',
    });
    expect(
      historicalSnapshot.holdings.find(
        (holding) => holding.instrument.symbol === 'INFY',
      )?.quantity,
    ).toBe('6.5');
    expect(historicalSnapshot.summary.reportingTotals.realizedPnl).toBe(
      '791.380952',
    );

    const csvId = randomUUID();
    const importCsv = [
      'id,account,account_currency,symbol,exchange,instrument_currency,side,quantity,price,fees,executed_at,external_reference,notes,allocations',
      `${csvId},CSV Account,INR,TCS,NSE,INR,BUY,2,100,0,2026-07-01T09:30:00.000Z,CSV-1,,`,
      '',
    ].join('\r\n');
    const countBeforeDryRun = await prisma.trade.count();
    expect(await transfer.importTrades(importCsv, true)).toMatchObject({
      dryRun: true,
      importedTrades: 1,
      createdAccounts: 1,
      createdInstruments: 1,
    });
    expect(await prisma.trade.count()).toBe(countBeforeDryRun);
    expect(await transfer.importTrades(importCsv, false)).toMatchObject({
      dryRun: false,
      importedTrades: 1,
    });
    expect((await transfer.exportTrades()).toString()).toContain('CSV Account');

    const iciciCsv = [
      'Stock Symbol,Company Name,ISIN Code,Action,Quantity,Transaction Price,Brokerage,Transaction Charges,StampDuty,Segment,STT Paid/Not Paid,Remarks,Transaction Date,Exchange,',
      'ICICI,ICICI BANK LIMITED,INE090A01021,Buy,10,100,1,0.5,0.2,TT,STT Paid,icicidirect,01-Jul-2024,NSE,',
      'ICICI,ICICI BANK LIMITED,INE090A01021,Buy,5,120,1,0.5,0.2,TT,STT Paid,Split/bonus,02-Jul-2024,NSE,',
      'ICICI,ICICI BANK LIMITED,INE090A01021,Sell,8,130,1,0.5,0,TT,STT Paid,icicidirect,03-Jul-2024,NSE,',
      '',
    ].join('\r\n');
    expect(await transfer.importIciciDirectTrades(iciciCsv, true)).toMatchObject({
      dryRun: true,
      importedTrades: 3,
      createdAccounts: 1,
      createdInstruments: 1,
      warnings: ['Row 3: corporate action imported as a zero- or stated-cost BUY row'],
    });
    expect(await transfer.importIciciDirectTrades(iciciCsv, false)).toMatchObject({
      dryRun: false,
      importedTrades: 3,
    });
    const importedIciciTrades = await prisma.trade.findMany({
      where: { externalReference: { startsWith: 'ICICIDIRECT:' } },
      include: { closingAllocations: true },
      orderBy: { executedAt: 'asc' },
    });
    expect(importedIciciTrades).toHaveLength(3);
    expect(importedIciciTrades[2].closingAllocations).toHaveLength(1);
    expect(decimalOutput(importedIciciTrades[2].feesMicros)).toBe('1.5');

    const originalFetch = global.fetch;
    process.env.STOCK_TRACKER_PRICE_PROVIDER = 'ZERODHA';
    process.env.ZERODHA_API_KEY = 'kite-key';
    process.env.ZERODHA_ACCESS_TOKEN = 'kite-token';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          'NSE:INFY': { last_price: 1711.45 },
          'NASDAQ:AAPL': { last_price: 112.25 },
          'NSE:ICICI': { last_price: 140.1 },
        },
      }),
    } as Response);
    const refresh = await prices.refreshEndOfDayPrices('MANUAL');
    expect(refresh.provider).toBe('ZERODHA');
    expect(refresh.storedPrices).toBeGreaterThan(0);
    expect(await prisma.priceSnapshot.count()).toBeGreaterThan(2);
    global.fetch = originalFetch;
    delete process.env.STOCK_TRACKER_PRICE_PROVIDER;
    delete process.env.ZERODHA_API_KEY;
    delete process.env.ZERODHA_ACCESS_TOKEN;

    const generatedPrompt = await new AiPromptsService(
      portfolio,
      prisma,
    ).generate({
      reportingCurrency: 'INR',
      asOf: '2026-12-03T10:00:00.000Z',
      additionalInstructions: 'Focus on exit-plan discipline.',
    });
    expect(generatedPrompt.prompt).toContain('Portfolio strategy review request');
    expect(generatedPrompt.prompt).toContain('AAPL');
    expect(generatedPrompt.prompt).toContain('Focus on exit-plan discipline.');
    expect(generatedPrompt.context.holdingCount).toBeGreaterThan(0);

    const backups = new BackupsService(prisma);
    const createdBackup = backups.create('integration-test');
    expect(createdBackup.size).toBeGreaterThan(100);
    const downloaded = backups.download();
    expect(downloaded.data.subarray(0, 16).toString()).toBe(
      'SQLite format 3\u0000',
    );
    expect(await backups.restore(downloaded.data)).toMatchObject({
      restored: true,
    });
    expect(
      await prisma.trade.findUnique({ where: { id: csvId } }),
    ).not.toBeNull();
  });
});
