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
  instrumentType: 'EQUITY' | 'ETF'
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

export interface TradeAccountOption {
  id: string
  name: string
  reportingCurrency: string
}

export type TradeInstrumentOption = TradeInstrument

async function apiError(response: Response) {
  try {
    const body = (await response.json()) as { message?: string | string[] }
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message
    return new Error(message || `Request failed (${response.status})`)
  } catch {
    return new Error(`Request failed (${response.status})`)
  }
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

export async function getTradeAccounts() {
  const response = await fetch('/api/accounts')
  if (!response.ok) throw await apiError(response)
  return (await response.json()) as TradeAccountOption[]
}

export async function getTradeInstruments() {
  const response = await fetch('/api/instruments')
  if (!response.ok) throw await apiError(response)
  return (await response.json()) as TradeInstrumentOption[]
}

export async function createTradeInstrument(input: {
  symbol: string
  name?: string
  instrumentType: TradeInstrument['instrumentType']
}) {
  const response = await fetch('/api/instruments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, exchange: 'NSE', quoteCurrency: 'INR' }),
  })
  if (!response.ok) throw await apiError(response)
  return (await response.json()) as TradeInstrumentOption
}

export async function createManualTrade(input: {
  accountId: string
  instrumentId: string
  side: TradeSide
  quantity: string
  price: string
  fees: string
  executedAt: string
  externalReference?: string
  notes?: string
  allocations?: Array<{ openingTradeId: string; quantity: string }>
}) {
  const response = await fetch('/api/trades', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw await apiError(response)
  return (await response.json()) as Trade
}

export async function saveTradeExitPlan(
  trade: Trade,
  input: { targetPrice: string; targetDate: string; rationale: string; status?: TradeExitPlan['status'] },
) {
  const response = await fetch(trade.exitPlan ? `/api/exit-plans/${trade.exitPlan.id}` : '/api/exit-plans', {
    method: trade.exitPlan ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trade.exitPlan ? input : { ...input, openingTradeId: trade.id }),
  })
  if (!response.ok) throw await apiError(response)
}
