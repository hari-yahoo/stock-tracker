import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode, SVGProps } from 'react'
import { AiInsights } from './AiInsights'
import { DataTools } from './DataTools'
import { HoldingsScreen } from './HoldingsScreen'
import { SymbolMappingsScreen } from './SymbolMappingsScreen'
import { TransactionsScreen } from './TransactionsScreen'
import { getPortfolio } from './portfolio'
import type { Holding, PortfolioAlert, PortfolioSnapshot } from './portfolio'
import { formatDate, formatMoney, formatQuantity, pnlTone, scaledToFixed } from './portfolio-format'
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

function EmptyHoldings() {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icons.holdings}</div>
      <strong>Your portfolio is ready for its first position</strong>
      <p>Add an account and a BUY trade through the API to see valuation, cost basis, and exit discipline here.</p>
    </div>
  )
}

function HoldingsTable({ holdings }: { holdings: Holding[] }) {
  if (!holdings.length) return <EmptyHoldings />
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Quantity</th>
            <th>Avg. cost</th>
            <th>Market value</th>
            <th>Unrealized P/L</th>
            <th aria-label="Open details" />
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding) => {
            const tone = pnlTone(holding.unrealizedPnl)
            return (
              <tr key={`${holding.account.id}:${holding.instrument.id}`}>
                <td>
                  <div className="asset-cell">
                    <span className="asset-mark">{holding.instrument.symbol.slice(0, 2)}</span>
                    <span>
                      <strong>{holding.instrument.symbol}</strong>
                      <small>{holding.account.name} · {holding.instrument.exchange}</small>
                    </span>
                  </div>
                </td>
                <td>{formatQuantity(holding.quantity)}</td>
                <td>{formatMoney(holding.averageCost, holding.instrument.quoteCurrency)}</td>
                <td>
                  <strong>{formatMoney(holding.currentValue, holding.instrument.quoteCurrency)}</strong>
                  <small className="cell-subtle">
                    {holding.currentPrice
                      ? `${formatMoney(holding.currentPrice, holding.instrument.quoteCurrency)} / share`
                      : 'Price needed'}
                  </small>
                </td>
                <td>
                  <span className={`pnl pnl--${tone}`}>
                    {formatMoney(holding.unrealizedPnl, holding.instrument.quoteCurrency)}
                  </span>
                  <small className={`cell-subtle cell-subtle--${tone}`}>
                    {holding.unrealizedPnlPercent
                      ? `${scaledToFixed(holding.unrealizedPnlPercent)}%`
                      : '—'}
                  </small>
                </td>
                <td><button className="icon-button" aria-label={`View ${holding.instrument.symbol}`}>{icons.chevron}</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
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

function Dashboard({ data, onRefresh, refreshing }: { data: PortfolioSnapshot; onRefresh: () => void; refreshing: boolean }) {
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
        <section className="panel holdings-panel" id="holdings">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Current positions</span>
              <h2>Holdings</h2>
            </div>
            <span className="panel-meta">{data.summary.holdingCount} assets</span>
          </div>
          <HoldingsTable holdings={data.holdings} />
        </section>
        <AlertsPanel alerts={data.alerts} />
      </div>
    </main>
  )
}

function App() {
  const [view, setView] = useState<'dashboard' | 'holdings' | 'transactions' | 'ai' | 'data' | 'mappings'>('dashboard')
  const [data, setData] = useState<PortfolioSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(true)

  const load = useCallback(async (signal?: AbortSignal) => {
    setRefreshing(true)
    try {
      const snapshot = await getPortfolio(signal)
      setData(snapshot)
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
    void getPortfolio(controller.signal)
      .then((snapshot) => {
        setData(snapshot)
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
            <Dashboard data={data} onRefresh={() => void load()} refreshing={refreshing} />
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
