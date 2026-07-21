import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { Holding, PortfolioSnapshot } from './portfolio'
import { listIciciSymbolMappings } from './symbol-mappings'
import {
  compareDecimalStrings,
  formatDate,
  formatMoney,
  formatQuantity,
  pnlTone,
  scaledToFixed,
  sumDecimalStrings,
} from './portfolio-format'

function holdingKey(holding: Holding) {
  return `${holding.account.id}:${holding.instrument.id}`
}

function matchesSearch(holding: Holding, query: string) {
  if (!query) return true
  const haystack = [
    holding.instrument.symbol,
    holding.instrument.name,
    holding.instrument.exchange,
    holding.instrument.sector,
    holding.account.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export function HoldingsScreen({
  data,
  onRefresh,
  refreshing,
}: {
  data: PortfolioSnapshot
  onRefresh: () => void
  refreshing: boolean
}) {
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState('ALL')
  const [sectorFilter, setSectorFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState<'value' | 'pnl' | 'symbol' | 'cost'>('value')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [mappedSymbols, setMappedSymbols] = useState<Record<string, string>>({})
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())

  useEffect(() => {
    void listIciciSymbolMappings()
      .then((mappings) => {
        setMappedSymbols(
          Object.fromEntries(mappings.map(({ iciciSymbol, nseSymbol }) => [iciciSymbol, nseSymbol])),
        )
      })
      .catch(() => {
        // Keep using the instrument symbol when mappings cannot be loaded.
      })
  }, [])

  const accounts = useMemo(
    () => Array.from(new Set(data.holdings.map((holding) => holding.account.name))).sort(),
    [data.holdings],
  )
  const sectors = useMemo(
    () =>
      Array.from(
        new Set(
          data.holdings
            .map((holding) => holding.instrument.sector)
            .filter((sector): sector is string => Boolean(sector)),
        ),
      ).sort(),
    [data.holdings],
  )

  const filteredHoldings = useMemo(() => {
    const filtered = data.holdings.filter((holding) => {
      if (accountFilter !== 'ALL' && holding.account.name !== accountFilter) return false
      if (sectorFilter !== 'ALL' && (holding.instrument.sector ?? 'Unassigned') !== sectorFilter) return false
      return matchesSearch(holding, deferredSearch)
    })

    const direction = sortDirection === 'asc' ? 1 : -1

    filtered.sort((left, right) => {
      switch (sortBy) {
        case 'symbol':
          return direction * left.instrument.symbol.localeCompare(right.instrument.symbol)
        case 'cost':
          return direction * compareDecimalStrings(left.costBasis, right.costBasis)
        case 'pnl':
          return direction * compareDecimalStrings(left.unrealizedPnl, right.unrealizedPnl)
        case 'value':
        default:
          return direction * compareDecimalStrings(left.currentValue, right.currentValue)
      }
    })

    return filtered
  }, [accountFilter, data.holdings, deferredSearch, sectorFilter, sortBy, sortDirection])

  const effectiveSelectedKey =
    selectedKey && filteredHoldings.some((holding) => holdingKey(holding) === selectedKey)
      ? selectedKey
      : filteredHoldings[0]
        ? holdingKey(filteredHoldings[0])
        : null

  const selectedHolding =
    filteredHoldings.find((holding) => holdingKey(holding) === effectiveSelectedKey) ?? null
  const visibleCost = sumDecimalStrings(filteredHoldings.map((holding) => holding.costBasis))
  const visibleValue = sumDecimalStrings(filteredHoldings.map((holding) => holding.currentValue))
  const visiblePnl = sumDecimalStrings(filteredHoldings.map((holding) => holding.unrealizedPnl))
  const pricedCount = filteredHoldings.filter((holding) => holding.currentPrice !== null).length
  const missingPriceCount = filteredHoldings.length - pricedCount
  const totalLots = filteredHoldings.reduce((sum, holding) => sum + holding.lots.length, 0)

  function updateSort(nextSort: typeof sortBy) {
    if (nextSort === sortBy) {
      setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSortBy(nextSort)
    setSortDirection(nextSort === 'symbol' ? 'asc' : 'desc')
  }

  return (
    <main className="main-content holdings-page">
      <header className="page-header">
        <div>
          <span className="section-kicker">Position monitor</span>
          <h1>Holdings</h1>
          <p>Search across accounts, inspect lot structure, and spot positions missing price coverage.</p>
        </div>
        <button className="refresh-button" onClick={onRefresh} disabled={refreshing}>
          <span className={refreshing ? 'is-spinning' : ''}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 6v5h-5M4 18v-5h5" />
              <path d="M6.1 9A7 7 0 0 1 18.7 6M17.9 15A7 7 0 0 1 5.3 18" />
            </svg>
          </span>
          {refreshing ? 'Refreshing…' : 'Refresh holdings'}
        </button>
      </header>

      <section className="holdings-summary" aria-label="Filtered holdings summary">
        <article className="summary-tile">
          <span>Visible market value</span>
          <strong>{formatMoney(visibleValue, data.reportingCurrency)}</strong>
          <small>{filteredHoldings.length} positions in this view</small>
        </article>
        <article className="summary-tile">
          <span>Visible cost basis</span>
          <strong>{formatMoney(visibleCost, data.reportingCurrency)}</strong>
          <small>{totalLots} open lots represented</small>
        </article>
        <article className="summary-tile">
          <span>Visible unrealized P/L</span>
          <strong className={`summary-value summary-value--${pnlTone(visiblePnl)}`}>
            {formatMoney(visiblePnl, data.reportingCurrency)}
          </strong>
          <small>{missingPriceCount === 0 ? 'Full price coverage' : `${missingPriceCount} need prices`}</small>
        </article>
        <article className="summary-tile">
          <span>Price coverage</span>
          <strong>{pricedCount}/{filteredHoldings.length || 0}</strong>
          <small>Positions with a current market price</small>
        </article>
      </section>

      <section className="panel holdings-workspace">
        <div className="panel-heading holdings-toolbar">
          <div>
            <span className="section-kicker">Current positions</span>
            <h2>Screen and inspect</h2>
          </div>
          <div className="holdings-controls">
            <label className="search-field">
              <span>Search</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Symbol, company, account, exchange"
              />
            </label>
            <label className="filter-field">
              <span>Account</span>
              <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
                <option value="ALL">All accounts</option>
                {accounts.map((account) => (
                  <option key={account} value={account}>
                    {account}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>Sector</span>
              <select value={sectorFilter} onChange={(event) => setSectorFilter(event.target.value)}>
                <option value="ALL">All sectors</option>
                <option value="Unassigned">Unassigned</option>
                {sectors.map((sector) => (
                  <option key={sector} value={sector}>
                    {sector}
                  </option>
                ))}
              </select>
            </label>
            <div className="sort-pills" role="tablist" aria-label="Holdings sort">
              {[
                ['value', 'Value'],
                ['pnl', 'P/L'],
                ['cost', 'Cost'],
                ['symbol', 'Symbol'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={sortBy === value ? 'active' : ''}
                  onClick={() => updateSort(value as typeof sortBy)}
                >
                  {label}
                  {sortBy === value ? ` ${sortDirection === 'desc' ? '↓' : '↑'}` : ''}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!filteredHoldings.length ? (
          <div className="empty-state holdings-empty-state">
            <div className="empty-state__icon">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 19V9m5 10V5m6 14v-7m5 7V3" />
              </svg>
            </div>
            <strong>No holdings match this filter</strong>
            <p>Try a different search term or widen the account and sector filters.</p>
          </div>
        ) : (
          <div className="holdings-grid">
            <div className="table-scroll holdings-table-wrap">
              <table className="holdings-table">
                <thead>
                  <tr>
                    <th>
                      <button type="button" className="sortable-heading" onClick={() => updateSort('symbol')}>
                        Asset
                      </button>
                    </th>
                    <th>Account</th>
                    <th>Quantity</th>
                    <th>
                      <button type="button" className="sortable-heading" onClick={() => updateSort('cost')}>
                        Cost basis
                      </button>
                    </th>
                    <th>
                      <button type="button" className="sortable-heading" onClick={() => updateSort('value')}>
                        Market value
                      </button>
                    </th>
                    <th>
                      <button type="button" className="sortable-heading" onClick={() => updateSort('pnl')}>
                        Unrealized P/L
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHoldings.map((holding) => {
                    const key = holdingKey(holding)
                    const tone = pnlTone(holding.unrealizedPnl)
                    return (
                      <tr
                        key={key}
                        className={effectiveSelectedKey === key ? 'is-selected' : ''}
                        onClick={() => setSelectedKey(key)}
                      >
                        <td>
                          <div className="asset-cell">
                            <span className="asset-mark">{holding.instrument.symbol.slice(0, 2)}</span>
                            <span>
                              <strong>{holding.instrument.symbol}</strong>
                              <small>{holding.instrument.name ?? holding.instrument.exchange} · {holding.instrument.instrumentType}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          <strong>{holding.account.name}</strong>
                          <small className="cell-subtle">{holding.instrument.exchange}</small>
                        </td>
                        <td>{formatQuantity(holding.quantity)}</td>
                        <td>
                          <strong>{formatMoney(holding.costBasis, data.reportingCurrency)}</strong>
                          <small className="cell-subtle">
                            Avg {formatMoney(holding.averageCost, holding.instrument.quoteCurrency)}
                          </small>
                        </td>
                        <td>
                          <strong>{formatMoney(holding.currentValue, data.reportingCurrency)}</strong>
                          <small className="cell-subtle">
                            {holding.currentPrice
                              ? `${formatMoney(holding.currentPrice, holding.instrument.quoteCurrency)} live`
                              : 'Price needed'}
                          </small>
                        </td>
                        <td>
                          <span className={`pnl pnl--${tone}`}>
                            {formatMoney(holding.unrealizedPnl, data.reportingCurrency)}
                          </span>
                          <small className={`cell-subtle cell-subtle--${tone}`}>
                            {holding.unrealizedPnlPercent
                              ? `${scaledToFixed(holding.unrealizedPnlPercent)}%`
                              : '—'}
                          </small>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {selectedHolding && (
              <aside className="holding-detail">
                <div className="holding-detail__hero">
                  <span className="section-kicker">Selected position</span>
                  <h3>
                    <a href={`https://www.screener.in/company/${mappedSymbols[selectedHolding.instrument.symbol] ?? selectedHolding.instrument.symbol}/consolidated/`} target="_blank" rel="noopener noreferrer">
                      {selectedHolding.instrument.symbol}
                    </a>
                  </h3>
                  
                  <p>{selectedHolding.instrument.name ?? 'Unnamed instrument'} · {selectedHolding.account.name}</p>
                </div>

                  <dl className="holding-stat-list">
                    <div>
                      <dt>Instrument type</dt>
                      <dd>{selectedHolding.instrument.instrumentType}</dd>
                    </div>
                    <div>
                    <dt>Exchange</dt>
                    <dd>{selectedHolding.instrument.exchange}</dd>
                  </div>
                  <div>
                    <dt>Sector</dt>
                    <dd>{selectedHolding.instrument.sector ?? 'Unassigned'}</dd>
                  </div>
                  <div>
                    <dt>Quantity</dt>
                    <dd>{formatQuantity(selectedHolding.quantity)}</dd>
                  </div>
                  <div>
                    <dt>Lots</dt>
                    <dd>{selectedHolding.lots.length}</dd>
                  </div>
                  <div>
                    <dt>Average cost</dt>
                    <dd>{formatMoney(selectedHolding.averageCost, selectedHolding.instrument.quoteCurrency)}</dd>
                  </div>
                  <div>
                    <dt>Price updated</dt>
                    <dd>{selectedHolding.priceCapturedAt ? formatDate(selectedHolding.priceCapturedAt) : 'No snapshot yet'}</dd>
                  </div>
                </dl>

                <div className="holding-valuation">
                  <div>
                    <span>Current value</span>
                    <strong>{formatMoney(selectedHolding.currentValue, data.reportingCurrency)}</strong>
                  </div>
                  <div>
                    <span>Open P/L</span>
                    <strong className={`summary-value summary-value--${pnlTone(selectedHolding.unrealizedPnl)}`}>
                      {formatMoney(selectedHolding.unrealizedPnl, data.reportingCurrency)}
                    </strong>
                  </div>
                </div>

                <div className="holding-lots">
                  <div className="holding-lots__heading">
                    <h4>Open lots</h4>
                    <span>{selectedHolding.lots.length}</span>
                  </div>
                  {selectedHolding.lots.map((lot, index) => (
                    <article className="lot-card" key={lot.openingTradeId}>
                      <strong>Lot {index + 1}</strong>
                      <small>{lot.openingTradeId.slice(0, 8)}</small>
                      <div>
                        <span>Remaining qty</span>
                        <b>{formatQuantity(lot.remainingQuantity)}</b>
                      </div>
                      <div>
                        <span>Remaining cost</span>
                        <b>{formatMoney(lot.remainingCost, data.reportingCurrency)}</b>
                      </div>
                    </article>
                  ))}
                </div>
              </aside>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
