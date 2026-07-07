export type TradeSide = 'BUY' | 'SELL'
export type TradeStatus = 'POSTED' | 'VOIDED'

interface TradeAccount {
  id: string
  name: string
  reportingCurrency: string
}

interface TradeInstrument {
  id: string
  symbol: string
  exchange: string
  name: string | null
  sector: string | null
  quoteCurrency: string
}

interface TradeAllocation {
  id: string
  openingTradeId: string
  closingTradeId: string
  quantity: string
  recordedAt: string
}

interface TradeExitPlan {
  id: string
  openingTradeId: string
  targetDate: string
  targetPrice: string
  rationale: string
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  createdAt: string
  updatedAt: string
}

export interface Trade {
  id: string
  accountId: string
  instrumentId: string
  side: TradeSide
  status: TradeStatus
  executedAt: string
  recordedAt: string
  voidedAt: string | null
  externalReference: string | null
  notes: string | null
  quantity: string
  price: string
  fees: string
  account: TradeAccount
  instrument: TradeInstrument
  openingAllocations: TradeAllocation[]
  closingAllocations: TradeAllocation[]
  exitPlan: TradeExitPlan | null
}

export async function getTrades(status: TradeStatus = 'POSTED', signal?: AbortSignal) {
  const response = await fetch(`/api/trades?status=${status}`, {
    signal,
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? 'Trades API is not available.'
        : `Trades request failed (${response.status}).`,
    )
  }

  return (await response.json()) as Trade[]
}
