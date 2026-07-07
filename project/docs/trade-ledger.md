# Trade ledger and precision rules

## Ledger model

`Trade` is the source of truth. Holdings, average cost, realized profit/loss, and closed positions are projections; they are not independently editable records.

- `BUY` opens inventory and `SELL` reduces it.
- Economic fields on a posted trade are immutable. To correct a trade, void it and append its replacement in the same database transaction.
- Deleting posted trades is prohibited. Draft/import-preview records should remain outside the ledger until confirmed.
- A `LotAllocation` assigns part of a sell to a buy lot. This supports partial exits, sales spanning several lots, and deterministic realized P/L.
- Total active allocations against a buy or sell must never exceed that trade's quantity.
- Both sides of an allocation must have the same account and instrument; the opening side must be `BUY`, and the closing side must be `SELL`.
- An exit plan belongs to a buy lot. A lot is closed when active sell allocations equal its quantity. “Closed positions” are therefore derived rather than stored twice.

Allocation policy is explicit. The API may suggest FIFO allocations, but it must persist the chosen allocations and never silently recalculate old sales when newer trades arrive.

## Numeric representation

No monetary or quantity value crosses the application boundary as a JavaScript `number`.

| Concept | Stored unit | Scale |
| --- | --- | ---: |
| Quantity | millionths of a share | 1,000,000 |
| Price, fee, value | millionths of the instrument's quote currency | 1,000,000 |
| FX rate | billionths of quote currency per one base currency | 1,000,000,000 |

Database columns use signed 64-bit `INTEGER` values and TypeScript uses `bigint`. API decimal values are strings such as `"123.450000"`; JSON responses also serialize database integers as decimal strings.

Inputs with more precision than the relevant scale are rejected. They are never silently truncated. Multiplication uses the full integer intermediate and rounds only when converting back to a stored scale. The rounding rule is nearest, with exact midpoint values rounded away from zero.

Currency codes are uppercase ISO 4217 codes. A trade's currency comes from its instrument and is not repeated on each row. Values in different currencies must not be summed until converted using a persisted `FxRateSnapshot`; reports retain the rate and timestamp used.

## Calculation rules

For an allocation quantity `q`:

- Gross proceeds: `round(q × sell price ÷ quantity scale)`
- Allocated cost: `round(q × buy price ÷ quantity scale)`
- Buy and sell fees are allocated pro rata by quantity. Any rounding remainder is assigned to the final allocation so allocated fees exactly equal trade fees.
- Realized P/L: gross proceeds − allocated cost − allocated buy fees − allocated sell fees
- Open quantity: buy quantity − sum(active allocation quantities)
- Unrealized P/L: current value − remaining allocated cost basis

All ledger writes, voids, replacements, and allocation changes occur inside SQLite transactions. Services must call `assertSqliteInteger` before persisting calculated values.
