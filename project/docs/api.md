# API

All endpoints are rooted at `/api`. Decimal quantities and money are strings with at most six fractional digits. IDs are UUIDs and timestamps are ISO 8601 strings.

## Accounts

- `GET /accounts`
- `POST /accounts`
- `GET /accounts/:id`
- `PATCH /accounts/:id`
- `DELETE /accounts/:id` — succeeds only when no ledger records reference the account

```json
{ "name": "Zerodha", "reportingCurrency": "INR" }
```

## Instruments

- `GET /instruments`
- `POST /instruments`
- `GET /instruments/:id`
- `PATCH /instruments/:id`

```json
{ "symbol": "INFY", "exchange": "NSE", "quoteCurrency": "INR" }
```

## Trades

- `GET /trades?accountId=&instrumentId=&status=POSTED`
- `POST /trades`
- `GET /trades/:id`
- `POST /trades/:id/void`

BUY example:

```json
{
  "accountId": "uuid",
  "instrumentId": "uuid",
  "side": "BUY",
  "quantity": "10.5",
  "price": "1525.25",
  "fees": "20",
  "executedAt": "2026-07-07T09:30:00.000Z"
}
```

SELL trades must allocate their complete quantity to BUY lots:

```json
{
  "accountId": "uuid",
  "instrumentId": "uuid",
  "side": "SELL",
  "quantity": "4",
  "price": "1700",
  "executedAt": "2026-12-01T09:30:00.000Z",
  "allocations": [{ "openingTradeId": "buy-uuid", "quantity": "4" }]
}
```

Trades cannot be edited or deleted. Voiding preserves the audit record. A BUY with active sell allocations cannot be voided.

## Prices

- `GET /prices?instrumentId=`
- `GET /prices/latest?instrumentId=`
- `POST /prices`

```json
{ "instrumentId": "uuid", "price": "1688.50", "source": "MANUAL" }
```

## Exit plans

- `GET /exit-plans?status=ACTIVE`
- `POST /exit-plans`
- `GET /exit-plans/:id`
- `PATCH /exit-plans/:id`
- `DELETE /exit-plans/:id` — cancels the plan without erasing it

```json
{
  "openingTradeId": "buy-uuid",
  "targetPrice": "1800",
  "targetDate": "2027-01-31T00:00:00.000Z",
  "rationale": "Exit after the expected earnings rerating."
}
```
