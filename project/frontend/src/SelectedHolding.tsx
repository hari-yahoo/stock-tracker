import type { Holding } from './portfolio'
import { formatDate, formatMoney, formatQuantity, pnlTone } from './portfolio-format'

export function SelectedHolding({
  holding,
  mappedSymbol,
  reportingCurrency,
}: {
  holding: Holding
  mappedSymbol: string
  reportingCurrency: string
}) {
  return (
    <aside className="holding-detail">
      <div className="holding-detail__hero">
        <span className="section-kicker">Selected position</span>
        <h3>
          <a
            href={`https://www.screener.in/company/${mappedSymbol}/consolidated/`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {holding.instrument.symbol}
          </a>
        </h3>

        <p>{holding.instrument.name ?? 'Unnamed instrument'} · {holding.account.name}</p>
      </div>

      <dl className="holding-stat-list">
        <div>
          <dt>Instrument type</dt>
          <dd>{holding.instrument.instrumentType}</dd>
        </div>
        <div>
          <dt>Exchange</dt>
          <dd>{holding.instrument.exchange}</dd>
        </div>
        <div>
          <dt>Sector</dt>
          <dd>{holding.instrument.sector ?? 'Unassigned'}</dd>
        </div>
        <div>
          <dt>Quantity</dt>
          <dd>{formatQuantity(holding.quantity)}</dd>
        </div>
        <div>
          <dt>Lots</dt>
          <dd>{holding.lots.length}</dd>
        </div>
        <div>
          <dt>Average cost</dt>
          <dd>{formatMoney(holding.averageCost, holding.instrument.quoteCurrency)}</dd>
        </div>
        <div>
          <dt>Price updated</dt>
          <dd>{holding.priceCapturedAt ? formatDate(holding.priceCapturedAt) : 'No snapshot yet'}</dd>
        </div>
      </dl>

      <div className="holding-valuation">
        <div>
          <span>Current value</span>
          <strong>{formatMoney(holding.currentValue, reportingCurrency)}</strong>
        </div>
        <div>
          <span>Open P/L</span>
          <strong className={`summary-value summary-value--${pnlTone(holding.unrealizedPnl)}`}>
            {formatMoney(holding.unrealizedPnl, reportingCurrency)}
          </strong>
        </div>
      </div>

      <div className="holding-lots">
        <div className="holding-lots__heading">
          <h4>Open lots</h4>
          <span>{holding.lots.length}</span>
        </div>
        {holding.lots.map((lot, index) => (
          <article className="lot-card" key={lot.openingTradeId}>
            <strong>Lot {index + 1}</strong>
            <small>{lot.openingTradeId.slice(0, 8)}</small>
            <div>
              <span>Remaining qty</span>
              <b>{formatQuantity(lot.remainingQuantity)}</b>
            </div>
            <div>
              <span>Remaining cost</span>
              <b>{formatMoney(lot.remainingCost, reportingCurrency)}</b>
            </div>
          </article>
        ))}
      </div>
    </aside>
  )
}
