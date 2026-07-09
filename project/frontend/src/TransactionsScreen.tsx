import { type FormEvent, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { formatDate, formatMoney, formatQuantity } from './portfolio-format'
import { createManualTrade, createTradeInstrument, getTradeAccounts, getTradeInstruments, getTrades, saveTradeExitPlan } from './trades'
import type { Trade, TradeAccountOption, TradeInstrumentOption, TradeSide, TradeStatus } from './trades'

function matchesSearch(trade: Trade, query: string) {
  if (!query) return true
  const haystack = [
    trade.instrument.symbol,
    trade.instrument.name,
    trade.instrument.exchange,
    trade.account.name,
    trade.externalReference,
    trade.notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

function tradeValue(trade: Trade) {
  const quantity = Number(trade.quantity)
  const price = Number(trade.price)
  const fees = Number(trade.fees)
  return ((quantity * price) + fees).toFixed(2)
}

function sideTone(side: Trade['side']) {
  return side === 'BUY' ? 'positive' : 'negative'
}

function decimal(value: number) {
  return value.toFixed(6).replace(/\.?0+$/, '')
}

function ManualTradeForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [accounts, setAccounts] = useState<TradeAccountOption[]>([])
  const [instruments, setInstruments] = useState<TradeInstrumentOption[]>([])
  const [side, setSide] = useState<TradeSide>('BUY')
  const [accountId, setAccountId] = useState('')
  const [instrumentId, setInstrumentId] = useState('')
  const [newSymbol, setNewSymbol] = useState('')
  const [newInstrumentName, setNewInstrumentName] = useState('')
  const [newInstrumentType, setNewInstrumentType] = useState<'EQUITY' | 'ETF'>('EQUITY')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [fees, setFees] = useState('0')
  const [executedAt, setExecutedAt] = useState(() => {
    const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    return now.toISOString().slice(0, 16)
  })
  const [externalReference, setExternalReference] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([getTradeAccounts(), getTradeInstruments()])
      .then(([accountRows, instrumentRows]) => {
        setAccounts(accountRows)
        setInstruments(instrumentRows)
        setAccountId((current) => current || accountRows[0]?.id || '')
        setInstrumentId((current) => current || instrumentRows[0]?.id || '')
      })
      .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : 'Could not load accounts and instruments.'))
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      let effectiveInstrumentId = instrumentId
      if (instrumentId === 'NEW') {
        const instrument = await createTradeInstrument({
          symbol: newSymbol.trim(),
          ...(newInstrumentName.trim() ? { name: newInstrumentName.trim() } : {}),
          instrumentType: newInstrumentType,
        })
        effectiveInstrumentId = instrument.id
      }
      let allocations: Array<{ openingTradeId: string; quantity: string }> | undefined
      if (side === 'SELL') {
        const postedTrades = await getTrades('POSTED')
        const buys = postedTrades
          .filter((trade) => trade.side === 'BUY' && trade.accountId === accountId && trade.instrumentId === effectiveInstrumentId)
          .sort((left, right) => new Date(left.executedAt).getTime() - new Date(right.executedAt).getTime())
        let remaining = Number(quantity)
        allocations = []
        for (const buy of buys) {
          const consumed = buy.openingAllocations.reduce((sum, allocation) => sum + Number(allocation.quantity), 0)
          const available = Math.max(0, Number(buy.quantity) - consumed)
          const allocated = Math.min(available, remaining)
          if (allocated > 0) allocations.push({ openingTradeId: buy.id, quantity: decimal(allocated) })
          remaining -= allocated
          if (remaining < 0.0000005) break
        }
        if (remaining >= 0.0000005) throw new Error(`Sell quantity exceeds available lots by ${decimal(remaining)}`)
      }

      await createManualTrade({
        accountId,
        instrumentId: effectiveInstrumentId,
        side,
        quantity,
        price,
        fees: fees || '0',
        executedAt: new Date(executedAt).toISOString(),
        ...(externalReference.trim() ? { externalReference: externalReference.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(allocations ? { allocations } : {}),
      })
      onCreated()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not create transaction.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel manual-trade-panel">
      <div className="panel-heading"><div><span className="section-kicker">New ledger entry</span><h2>Add transaction</h2></div><button type="button" className="secondary-button" onClick={onCancel}>Close</button></div>
      <form className="manual-trade-form" onSubmit={(event) => void submit(event)}>
        <label className="filter-field"><span>Side</span><select value={side} onChange={(event) => { const nextSide = event.target.value as TradeSide; setSide(nextSide); if (nextSide === 'SELL' && instrumentId === 'NEW') setInstrumentId('') }}><option value="BUY">Buy</option><option value="SELL">Sell</option></select></label>
        <label className="filter-field"><span>Account</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)} required><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <label className="filter-field"><span>Instrument</span><select value={instrumentId} onChange={(event) => setInstrumentId(event.target.value)} required><option value="">Select instrument</option>{instruments.map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.symbol} · {instrument.instrumentType}</option>)}{side === 'BUY' && <option value="NEW">＋ Add new NSE instrument</option>}</select></label>
        {instrumentId === 'NEW' && <><label className="search-field"><span>NSE symbol</span><input value={newSymbol} onChange={(event) => setNewSymbol(event.target.value.toUpperCase())} maxLength={32} required /></label><label className="filter-field"><span>Instrument type</span><select value={newInstrumentType} onChange={(event) => setNewInstrumentType(event.target.value as typeof newInstrumentType)}><option value="EQUITY">Equity</option><option value="ETF">ETF</option></select></label><label className="search-field"><span>Instrument name</span><input value={newInstrumentName} onChange={(event) => setNewInstrumentName(event.target.value)} maxLength={200} /></label></>}
        <label className="search-field"><span>Quantity</span><input type="number" min="0.000001" step="0.000001" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
        <label className="search-field"><span>Price</span><input type="number" min="0" step="0.000001" value={price} onChange={(event) => setPrice(event.target.value)} required /></label>
        <label className="search-field"><span>Fees</span><input type="number" min="0" step="0.000001" value={fees} onChange={(event) => setFees(event.target.value)} required /></label>
        <label className="search-field"><span>Executed at</span><input type="datetime-local" value={executedAt} onChange={(event) => setExecutedAt(event.target.value)} required /></label>
        <label className="search-field"><span>External reference</span><input value={externalReference} onChange={(event) => setExternalReference(event.target.value)} maxLength={200} /></label>
        <label className="search-field manual-trade-notes"><span>Notes</span><input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} /></label>
        {side === 'SELL' && <p className="manual-trade-help">The sell will be allocated automatically against available BUY lots using FIFO.</p>}
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={busy || !accountId || !instrumentId}>{busy ? 'Saving…' : `Add ${side.toLowerCase()}`}</button>
      </form>
    </section>
  )
}

function ExitPlanEditor({ trade, onSaved }: { trade: Trade; onSaved: () => void }) {
  const [targetPrice, setTargetPrice] = useState(trade.exitPlan?.targetPrice ?? '')
  const [targetDate, setTargetDate] = useState(trade.exitPlan?.targetDate.slice(0, 10) ?? '')
  const [rationale, setRationale] = useState(trade.exitPlan?.rationale ?? '')
  const [status, setStatus] = useState(trade.exitPlan?.status ?? 'ACTIVE')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await saveTradeExitPlan(trade, {
        targetPrice,
        targetDate: new Date(`${targetDate}T12:00:00`).toISOString(),
        rationale,
        ...(trade.exitPlan ? { status } : {}),
      })
      onSaved()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not save exit plan.')
    } finally { setBusy(false) }
  }

  return (
    <form className="exit-plan-form" onSubmit={(event) => void submit(event)}>
      <span>Exit plan</span>
      <label className="search-field">Target price<input type="number" min="0" step="0.000001" value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} required /></label>
      <label className="search-field">Target date<input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} required /></label>
      <label className="search-field exit-plan-rationale">Rationale<input value={rationale} onChange={(event) => setRationale(event.target.value)} maxLength={5000} required /></label>
      {trade.exitPlan && <label className="filter-field">Status<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="ACTIVE">Active</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></label>}
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button" disabled={busy}>{busy ? 'Saving…' : trade.exitPlan ? 'Update plan' : 'Add exit plan'}</button>
      <small>Planning fields can change; trade quantity, price, side, fees, account, instrument, and execution date remain locked.</small>
    </form>
  )
}

export function TransactionsScreen() {
  const [status, setStatus] = useState<TradeStatus>('POSTED')
  const [trades, setTrades] = useState<Trade[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState('ALL')
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())

  useEffect(() => {
    const controller = new AbortController()
    void getTrades(status, controller.signal)
      .then((result) => {
        setTrades(result)
        setError(null)
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return
        setError(requestError instanceof Error ? requestError.message : 'Unable to load trades.')
      })
      .finally(() => setBusy(false))
    return () => controller.abort()
  }, [status, refreshVersion])

  const accounts = useMemo(
    () => Array.from(new Set(trades.map((trade) => trade.account.name))).sort(),
    [trades],
  )

  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      if (accountFilter !== 'ALL' && trade.account.name !== accountFilter) return false
      if (sideFilter !== 'ALL' && trade.side !== sideFilter) return false
      return matchesSearch(trade, deferredSearch)
    })
  }, [accountFilter, deferredSearch, sideFilter, trades])

  const effectiveSelectedId =
    selectedId && filteredTrades.some((trade) => trade.id === selectedId)
      ? selectedId
      : filteredTrades[0]?.id ?? null

  const selectedTrade =
    filteredTrades.find((trade) => trade.id === effectiveSelectedId) ?? null

  const buyCount = filteredTrades.filter((trade) => trade.side === 'BUY').length
  const sellCount = filteredTrades.filter((trade) => trade.side === 'SELL').length
  const allocatedSellCount = filteredTrades.filter((trade) => trade.closingAllocations.length > 0).length
  const activePlanCount = filteredTrades.filter((trade) => trade.exitPlan?.status === 'ACTIVE').length

  function handleStatusChange(nextStatus: TradeStatus) {
    setBusy(true)
    setStatus(nextStatus)
  }

  return (
    <main className="main-content transactions-page">
      <header className="page-header">
        <div>
          <span className="section-kicker">Execution ledger</span>
          <h1>Transactions</h1>
          <p>Review posted and voided trades, search execution notes, and inspect sell allocations lot by lot.</p>
        </div>
        <button className="primary-button" onClick={() => setShowAdd((visible) => !visible)}>{showAdd ? 'Close form' : 'Add transaction'}</button>
      </header>

      {showAdd && <ManualTradeForm onCancel={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); setStatus('POSTED'); setRefreshVersion((version) => version + 1) }} />}

      <section className="holdings-summary transactions-summary" aria-label="Transactions summary">
        <article className="summary-tile">
          <span>Visible trades</span>
          <strong>{filteredTrades.length}</strong>
          <small>{status === 'POSTED' ? 'Active ledger entries' : 'Voided history entries'}</small>
        </article>
        <article className="summary-tile">
          <span>Buys vs sells</span>
          <strong>{buyCount} / {sellCount}</strong>
          <small>Buy trades compared with sell trades</small>
        </article>
        <article className="summary-tile">
          <span>Allocated sells</span>
          <strong>{allocatedSellCount}</strong>
          <small>Sell trades linked to opening lots</small>
        </article>
        <article className="summary-tile">
          <span>Active exit plans</span>
          <strong>{activePlanCount}</strong>
          <small>Buy trades with an active plan attached</small>
        </article>
      </section>

      <section className="panel holdings-workspace">
        <div className="panel-heading holdings-toolbar">
          <div>
            <span className="section-kicker">Filters</span>
            <h2>Ledger explorer</h2>
          </div>
          <div className="holdings-controls">
            <label className="search-field">
              <span>Search</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Symbol, account, notes, external ref"
              />
            </label>
            <label className="filter-field">
              <span>Status</span>
              <select value={status} onChange={(event) => handleStatusChange(event.target.value as TradeStatus)}>
                <option value="POSTED">Posted</option>
                <option value="VOIDED">Voided</option>
              </select>
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
            <div className="sort-pills" role="tablist" aria-label="Trade side filter">
              {[
                ['ALL', 'All sides'],
                ['BUY', 'Buys'],
                ['SELL', 'Sells'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={sideFilter === value ? 'active' : ''}
                  onClick={() => setSideFilter(value as typeof sideFilter)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error ? (
          <div className="empty-state holdings-empty-state">
            <strong>We couldn’t load the transaction ledger</strong>
            <p>{error}</p>
          </div>
        ) : busy ? (
          <div className="transactions-loading">
            <div className="loading-panel" />
          </div>
        ) : !filteredTrades.length ? (
          <div className="empty-state holdings-empty-state">
            <strong>No transactions match this view</strong>
            <p>Try another status, widen the account filter, or clear the search term.</p>
          </div>
        ) : (
          <div className="holdings-grid transactions-grid">
            <div className="table-scroll holdings-table-wrap">
              <table className="holdings-table transactions-table">
                <thead>
                  <tr>
                    <th>Trade</th>
                    <th>Executed</th>
                    <th>Quantity</th>
                    <th>Price</th>
                    <th>Gross + fees</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.map((trade) => (
                    <tr
                      key={trade.id}
                      className={effectiveSelectedId === trade.id ? 'is-selected' : ''}
                      onClick={() => setSelectedId(trade.id)}
                    >
                      <td>
                        <div className="asset-cell">
                          <span className={`asset-mark asset-mark--${trade.side.toLowerCase()}`}>{trade.side.slice(0, 1)}</span>
                          <span>
                            <strong>{trade.instrument.symbol}</strong>
                            <small>{trade.account.name} · {trade.instrument.exchange}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <strong>{formatDate(trade.executedAt)}</strong>
                        <small className="cell-subtle">{new Date(trade.executedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</small>
                      </td>
                      <td>{formatQuantity(trade.quantity)}</td>
                      <td>{formatMoney(trade.price, trade.instrument.quoteCurrency)}</td>
                      <td>
                        <strong>{formatMoney(tradeValue(trade), trade.instrument.quoteCurrency)}</strong>
                        <small className="cell-subtle">Fees {formatMoney(trade.fees, trade.instrument.quoteCurrency)}</small>
                      </td>
                      <td>
                        <span className={`trade-badge trade-badge--${trade.status.toLowerCase()}`}>{trade.status}</span>
                        <small className={`cell-subtle cell-subtle--${sideTone(trade.side)}`}>{trade.side}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedTrade && (
              <aside className="holding-detail transaction-detail">
                <div className="holding-detail__hero">
                  <span className="section-kicker">Selected trade</span>
                  <h3>{selectedTrade.instrument.symbol}</h3>
                  <p>{selectedTrade.account.name} · {selectedTrade.side} · {selectedTrade.status}</p>
                </div>

                <dl className="holding-stat-list">
                  <div>
                    <dt>Executed</dt>
                    <dd>{formatDate(selectedTrade.executedAt)}</dd>
                  </div>
                  <div>
                    <dt>Recorded</dt>
                    <dd>{formatDate(selectedTrade.recordedAt)}</dd>
                  </div>
                  <div>
                    <dt>Quantity</dt>
                    <dd>{formatQuantity(selectedTrade.quantity)}</dd>
                  </div>
                  <div>
                    <dt>Price</dt>
                    <dd>{formatMoney(selectedTrade.price, selectedTrade.instrument.quoteCurrency)}</dd>
                  </div>
                  <div>
                    <dt>Fees</dt>
                    <dd>{formatMoney(selectedTrade.fees, selectedTrade.instrument.quoteCurrency)}</dd>
                  </div>
                  <div>
                    <dt>External ref</dt>
                    <dd>{selectedTrade.externalReference ?? '—'}</dd>
                  </div>
                </dl>

                {selectedTrade.notes && (
                  <div className="trade-notes">
                    <span>Notes</span>
                    <p>{selectedTrade.notes}</p>
                  </div>
                )}

                {selectedTrade.side === 'BUY' && selectedTrade.status === 'POSTED' && (
                  <ExitPlanEditor key={`${selectedTrade.id}:${selectedTrade.exitPlan?.updatedAt ?? 'new'}`} trade={selectedTrade} onSaved={() => setRefreshVersion((version) => version + 1)} />
                )}

                <div className="holding-lots">
                  <div className="holding-lots__heading">
                    <h4>Allocations</h4>
                    <span>{selectedTrade.closingAllocations.length + selectedTrade.openingAllocations.length}</span>
                  </div>
                  {selectedTrade.closingAllocations.length > 0 ? (
                    selectedTrade.closingAllocations.map((allocation) => (
                      <article className="lot-card" key={allocation.id}>
                        <strong>Sell allocation</strong>
                        <small>{allocation.openingTradeId.slice(0, 8)}</small>
                        <div>
                          <span>Allocated qty</span>
                          <b>{formatQuantity(allocation.quantity)}</b>
                        </div>
                      </article>
                    ))
                  ) : selectedTrade.openingAllocations.length > 0 ? (
                    selectedTrade.openingAllocations.map((allocation) => (
                      <article className="lot-card" key={allocation.id}>
                        <strong>Consumed by sell</strong>
                        <small>{allocation.closingTradeId.slice(0, 8)}</small>
                        <div>
                          <span>Allocated qty</span>
                          <b>{formatQuantity(allocation.quantity)}</b>
                        </div>
                      </article>
                    ))
                  ) : (
                    <article className="lot-card">
                      <strong>No allocations</strong>
                      <small>This trade is not currently linked to another lot.</small>
                    </article>
                  )}
                </div>
              </aside>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
