export type AlertType =
  | 'TARGET_HIT'
  | 'OVERDUE'
  | 'DUE_TODAY'
  | 'APPROACHING'

export interface Account {
  id: string
  name: string
  reportingCurrency: string
}

export interface Instrument {
  id: string
  symbol: string
  exchange: string
  name: string | null
  sector: string | null
  quoteCurrency: string
}

export interface Holding {
  account: Account
  instrument: Instrument
  quantity: string
  averageCost: string
  costBasis: string
  currentPrice: string | null
  priceCapturedAt: string | null
  currentValue: string | null
  unrealizedPnl: string | null
  unrealizedPnlPercent: string | null
  lots: Array<{
    openingTradeId: string
    remainingQuantity: string
    remainingCost: string
  }>
}

export interface PortfolioAlert {
  type: AlertType
  severity: 'CRITICAL' | 'WARNING'
  daysUntilTarget?: number
  exitPlanId: string
  openingTradeId: string
  accountId: string
  instrumentId: string
  symbol: string
  currency: string
  targetDate: string
  targetPrice: string
  currentPrice: string | null
}

export interface PortfolioWarning {
  type: 'MISSING_PRICE' | 'MISSING_FX_RATE'
  message: string
  instrumentId?: string
  currency?: string
}

export interface PortfolioSnapshot {
  asOf: string
  reportingCurrency: string
  summary: {
    accountCount: number
    holdingCount: number
    openLotCount: number
    byCurrency: Array<{
      currency: string
      costBasis: string
      currentValue: string | null
      unrealizedPnl: string | null
      realizedPnl: string
    }>
    reportingTotals: {
      costBasis: string | null
      currentValue: string | null
      unrealizedPnl: string | null
      realizedPnl: string | null
    }
  }
  holdings: Holding[]
  alerts: PortfolioAlert[]
  warnings: PortfolioWarning[]
}

export async function getPortfolio(signal?: AbortSignal) {
  const response = await fetch('/api/portfolio?reportingCurrency=INR', {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? 'Portfolio API is not available.'
        : `Portfolio request failed (${response.status}).`,
    )
  }
  return (await response.json()) as PortfolioSnapshot
}
