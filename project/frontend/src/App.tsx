import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode, SVGProps } from 'react'
import { AiInsights } from './AiInsights'
import { DataTools } from './DataTools'
import { HoldingsScreen } from './HoldingsScreen'
import { SymbolMappingsScreen } from './SymbolMappingsScreen'
import { TransactionsScreen } from './TransactionsScreen'
import { getPortfolio, getPortfolioHistory } from './portfolio'
import type { PortfolioAlert, PortfolioHistoryPoint, PortfolioSnapshot } from './portfolio'
import { formatDate, formatMoney, pnlTone } from './portfolio-format'
import './App.css'

type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {children}
    </svg>
  )
}

const icons = {
  dashboard: (
    <Icon>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </Icon>
  ),
  holdings: (
    <Icon>
      <path d="M4 19V9m5 10V5m6 14v-7m5 7V3" />
    </Icon>
  ),
  history: (
    <Icon>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5m4-1v5l3 2" />
    </Icon>
  ),
  spark: (
    <Icon>
      <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" />
      <path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" />
    </Icon>
  ),
  settings: (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7L10.5 2h-3l-.7 2-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7L0 10.5v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2.3h3l.7-2 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7 1.5-1Z" />
    </Icon>
  ),
  refresh: (
    <Icon>
      <path d="M20 6v5h-5M4 18v-5h5" />
      <path d="M6.1 9A7 7 0 0 1 18.7 6M17.9 15A7 7 0 0 1 5.3 18" />
    </Icon>
  ),
  arrowUp: (
    <Icon>
      <path d="m6 15 6-6 6 6" />
    </Icon>
  ),
  arrowDown: (
    <Icon>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  ),
  alert: (
    <Icon>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v5m0 3v.1" />
    </Icon>
  ),
  chevron: (
    <Icon>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  ),
}

const navItems = [
  { label: 'Dashboard', icon: icons.dashboard, view: 'dashboard' as const },
  { label: 'Holdings', icon: icons.holdings, view: 'holdings' as const },
  { label: 'Transactions', icon: icons.history, view: 'transactions' as const },
  { label: 'AI Insights', icon: icons.spark, view: 'ai' as const },
  { label: 'Data & backups', icon: icons.settings, view: 'data' as const },
  { label: 'Symbol mappings', icon: icons.refresh, view: 'mappings' as const },
]

function MetricCard({
  eyebrow,
  value,
  detail,
  tone = 'neutral',
  featured = false,
}: {
  eyebrow: string
  value: string
  detail: string
  tone?: 'positive' | 'negative' | 'neutral'
  featured?: boolean
}) {
  return (
    <article className={`metric-card${featured ? ' metric-card--featured' : ''}`}>
      <div className="metric-card__top">
        <span>{eyebrow}</span>
        {featured && <span className="live-pill"><i /> Live</span>}
      </div>
      <strong>{value}</strong>
      <p className={`metric-detail metric-detail--${tone}`}>
        {tone === 'positive' && icons.arrowUp}
        {tone === 'negative' && icons.arrowDown}
        {detail}
      </p>
    </article>
  )
}

const alertLabels: Record<PortfolioAlert['type'], string> = {
  TARGET_HIT: 'Target price reached',
  OVERDUE: 'Exit plan overdue',
  DUE_TODAY: 'Exit due today',
  APPROACHING: 'Exit date approaching',
}

function AlertsPanel({ alerts }: { alerts: PortfolioAlert[] }) {
  return (
    <section className="panel alerts-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Plan accountability</span>
          <h2>Upcoming exits</h2>
        </div>
        {alerts.length > 0 && <span className="count-badge">{alerts.length}</span>}
      </div>
      {alerts.length ? (
        <div className="alert-list">
          {alerts.slice(0, 5).map((alert) => (
            <article className={`alert-item alert-item--${alert.severity.toLowerCase()}`} key={`${alert.exitPlanId}:${alert.type}`}>
              <div className="alert-item__icon">{icons.alert}</div>
              <div>
                <strong>{alert.symbol}</strong>
                <p>{alertLabels[alert.type]}</p>
                <small>
                  {alert.type === 'TARGET_HIT'
                    ? `${formatMoney(alert.currentPrice, alert.currency)} now · ${formatMoney(alert.targetPrice, alert.currency)} target`
                    : `Target date ${formatDate(alert.targetDate)}`}
                </small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="quiet-state">
          <span className="quiet-state__check">✓</span>
          <strong>No exits need attention</strong>
          <p>Active plans will appear here seven days before their target date.</p>
        </div>
      )}
    </section>
  )
}

function toChartNumber(value: string | null) {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function InvestmentValueChart({
  history,
  currency,
}: {
  history: PortfolioHistoryPoint[]
  currency: string
}) {
  const chart = useMemo(() => {
    const points = history
      .map((point) => ({
        ...point,
        invested: toChartNumber(point.investedAmount),
        market: toChartNumber(point.marketValue),
      }))
      .filter((point) => point.invested !== null || point.market !== null)
      .sort((left, right) => new Date(left.asOf).getTime() - new Date(right.asOf).getTime())
    const values = points.flatMap((point) => [point.invested, point.market]).filter((value): value is number => value !== null)
    const maxValue = Math.max(...values, 1)
    const width = 760
    const height = 300
    const padding = { top: 28, right: 28, bottom: 38, left: 58 }
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom
    const x = (index: number) => padding.left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth)
    const y = (value: number) => padding.top + plotHeight - (value / maxValue) * plotHeight
    const pathFor = (key: 'invested' | 'market') => {
      let path = ''
      let started = false
      for (const [index, point] of points.entries()) {
        const value = point[key]
        if (value === null) {
          started = false
          continue
        }
        path += `${started ? 'L' : 'M'} ${x(index).toFixed(2)} ${y(value).toFixed(2)} `
        started = true
      }
      return path
    }
    const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const value = maxValue * ratio
      return { value, y: y(value) }
    })
    return {
      points,
      width,
      height,
      padding,
      plotWidth,
      investedPath: pathFor('invested'),
      marketPath: pathFor('market'),
      grid,
      x,
      y,
    }
  }, [history])

  const latest = chart.points.at(-1)

  return (
    <section className="panel value-chart-panel" aria-label="Invested amount and market value history">
      <div className="panel-heading value-chart-heading">
        <div>
          <span className="section-kicker">Portfolio trajectory</span>
          <h2>Invested amount vs market value</h2>
        </div>
        <div className="chart-legend" aria-hidden="true">
          <span><i className="legend-dot legend-dot--invested" /> Invested</span>
          <span><i className="legend-dot legend-dot--market" /> Market value</span>
        </div>
      </div>
      {chart.points.length ? (
        <div className="value-chart-body">
          <div className="value-chart-summary">
            <div>
              <span>Latest invested</span>
              <strong>{formatMoney(latest?.investedAmount ?? null, currency)}</strong>
            </div>
            <div>
              <span>Latest market value</span>
              <strong>{formatMoney(latest?.marketValue ?? null, currency)}</strong>
            </div>
          </div>
          <div className="value-chart-wrap">
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Line chart comparing invested amount and market value over time">
              {chart.grid.map((line) => (
                <g key={line.value}>
                  <line className="chart-grid-line" x1={chart.padding.left} x2={chart.padding.left + chart.plotWidth} y1={line.y} y2={line.y} />
                  <text className="chart-axis-label" x={chart.padding.left - 10} y={line.y + 4} textAnchor="end">
                    {formatMoney(line.value.toFixed(2), currency)}
                  </text>
                </g>
              ))}
              <path className="chart-line chart-line--invested" d={chart.investedPath} />
              <path className="chart-line chart-line--market" d={chart.marketPath} />
              {chart.points.map((point, index) => (
                <g key={point.asOf}>
                  {point.invested !== null && <circle className="chart-point chart-point--invested" cx={chart.x(index)} cy={chart.y(point.invested)} r="3.8" />}
                  {point.market !== null && <circle className="chart-point chart-point--market" cx={chart.x(index)} cy={chart.y(point.market)} r="3.8" />}
                </g>
              ))}
              {chart.points.length > 1 && (
                <>
                  <text className="chart-axis-label" x={chart.padding.left} y={chart.height - 10} textAnchor="middle">
                    {formatDate(chart.points[0].asOf)}
                  </text>
                  <text className="chart-axis-label" x={chart.padding.left + chart.plotWidth} y={chart.height - 10} textAnchor="middle">
                    {formatDate(chart.points[chart.points.length - 1].asOf)}
                  </text>
                </>
              )}
            </svg>
          </div>
        </div>
      ) : (
        <div className="quiet-state">
          <span className="quiet-state__check">↗</span>
          <strong>No chart data yet</strong>
          <p>Add a BUY trade and price snapshot to start plotting invested amount against market value.</p>
        </div>
      )}
    </section>
  )
}

function Dashboard({
  data,
  history,
  onRefresh,
  refreshing,
}: {
  data: PortfolioSnapshot
  history: PortfolioHistoryPoint[]
  onRefresh: () => void
  refreshing: boolean
}) {
  const totals = data.summary.reportingTotals
  const pnlToneValue = pnlTone(totals.unrealizedPnl)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const lastUpdated = useMemo(
    () => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(data.asOf)),
    [data.asOf],
  )

  return (
    <main className="main-content">
      <header className="page-header">
        <div>
          <span className="section-kicker">Portfolio overview</span>
          <h1>{greeting}, Hari</h1>
          <p>Here’s where your investment plan stands today.</p>
        </div>
        <button className="refresh-button" onClick={onRefresh} disabled={refreshing}>
          <span className={refreshing ? 'is-spinning' : ''}>{icons.refresh}</span>
          {refreshing ? 'Refreshing…' : `Updated ${lastUpdated}`}
        </button>
      </header>

      {data.warnings.length > 0 && (
        <div className="data-warning" role="status">
          {icons.alert}
          <span><strong>Some totals need attention.</strong> {data.warnings[0].message}</span>
        </div>
      )}

      <section className="metrics-grid" aria-label="Portfolio summary">
        <MetricCard eyebrow="Total portfolio value" value={formatMoney(totals.currentValue, data.reportingCurrency)} detail={`${data.summary.holdingCount} holdings across ${data.summary.accountCount} accounts`} featured />
        <MetricCard eyebrow="Unrealized P/L" value={formatMoney(totals.unrealizedPnl, data.reportingCurrency)} detail={totals.unrealizedPnl ? `${pnlToneValue === 'negative' ? '' : '+'}${formatMoney(totals.unrealizedPnl, data.reportingCurrency)} open gain` : 'Add prices to calculate'} tone={pnlToneValue} />
        <MetricCard eyebrow="Realized P/L" value={formatMoney(totals.realizedPnl, data.reportingCurrency)} detail="From allocated closed lots" tone={pnlTone(totals.realizedPnl)} />
        <MetricCard eyebrow="Capital at cost" value={formatMoney(totals.costBasis, data.reportingCurrency)} detail={`${data.summary.openLotCount} open investment lots`} />
      </section>

      <div className="dashboard-grid">
        <InvestmentValueChart history={history} currency={data.reportingCurrency} />
        <AlertsPanel alerts={data.alerts} />
      </div>
    </main>
  )
}

function App() {
  const [view, setView] = useState<'dashboard' | 'holdings' | 'transactions' | 'ai' | 'data' | 'mappings'>('dashboard')
  const [data, setData] = useState<PortfolioSnapshot | null>(null)
  const [history, setHistory] = useState<PortfolioHistoryPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(true)

  const load = useCallback(async (signal?: AbortSignal) => {
    setRefreshing(true)
    try {
      const [snapshot, historyPoints] = await Promise.all([
        getPortfolio(signal),
        getPortfolioHistory(signal),
      ])
      setData(snapshot)
      setHistory(historyPoints)
      setError(null)
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return
      setError(requestError instanceof Error ? requestError.message : 'Unable to load the portfolio.')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      getPortfolio(controller.signal),
      getPortfolioHistory(controller.signal),
    ])
      .then(([snapshot, historyPoints]) => {
        setData(snapshot)
        setHistory(historyPoints)
        setError(null)
      })
      .catch((requestError: unknown) => {
        if (
          requestError instanceof DOMException &&
          requestError.name === 'AbortError'
        ) {
          return
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load the portfolio.',
        )
      })
      .finally(() => setRefreshing(false))
    return () => controller.abort()
  }, [])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><strong>Stock</strong>Tracker</span>
        </div>
        <nav aria-label="Primary navigation">
          {navItems.map((item) => (
            <button key={item.label} type="button" className={item.view === view ? 'active' : ''} aria-current={item.view === view ? 'page' : undefined} disabled={!item.view} title={item.view ? undefined : 'Coming next'} onClick={() => item.view && setView(item.view)}>
              {item.icon}<span>{item.label}</span>{item.view === view && <i className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="profile-card">
          <span className="avatar">HG</span>
          <span><strong>Hari</strong><small>Personal portfolio</small></span>
        </div>
      </aside>

      <div className="workspace" id="top">
        {view === 'ai' ? (
          <AiInsights />
        ) : view === 'transactions' ? (
          <TransactionsScreen />
        ) : view === 'data' ? (
          <DataTools onDataChanged={() => void load()} />
        ) : view === 'mappings' ? (
          <SymbolMappingsScreen />
        ) : error && !data ? (
          <main className="main-content centered-state">
            <div className="error-card">
              <span>{icons.alert}</span>
              <h1>We couldn’t load your portfolio</h1>
              <p>{error}</p>
              <button className="primary-button" onClick={() => void load()}>Try again</button>
            </div>
          </main>
        ) : data ? (
          view === 'holdings' ? (
            <HoldingsScreen data={data} onRefresh={() => void load()} refreshing={refreshing} />
          ) : (
            <Dashboard data={data} history={history} onRefresh={() => void load()} refreshing={refreshing} />
          )
        ) : (
          <main className="main-content loading-state" aria-label="Loading portfolio">
            <div className="loading-header" />
            <div className="loading-metrics">{Array.from({ length: 4 }, (_, index) => <i key={index} />)}</div>
            <div className="loading-panel" />
          </main>
        )}
      </div>
    </div>
  )
}

export default App
