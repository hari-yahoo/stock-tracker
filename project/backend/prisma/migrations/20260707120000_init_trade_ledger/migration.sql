PRAGMA foreign_keys=ON;

CREATE TABLE "accounts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "reporting_currency" TEXT NOT NULL DEFAULT 'INR'
    CHECK (length("reporting_currency") = 3 AND "reporting_currency" = upper("reporting_currency")),
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);

CREATE TABLE "instruments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "symbol" TEXT NOT NULL CHECK (length(trim("symbol")) > 0 AND "symbol" = upper("symbol")),
  "exchange" TEXT NOT NULL CHECK (length(trim("exchange")) > 0 AND "exchange" = upper("exchange")),
  "name" TEXT,
  "sector" TEXT,
  "quote_currency" TEXT NOT NULL
    CHECK (length("quote_currency") = 3 AND "quote_currency" = upper("quote_currency")),
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);

CREATE TABLE "trades" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "account_id" TEXT NOT NULL,
  "instrument_id" TEXT NOT NULL,
  "side" TEXT NOT NULL CHECK ("side" IN ('BUY', 'SELL')),
  "status" TEXT NOT NULL DEFAULT 'POSTED' CHECK ("status" IN ('POSTED', 'VOIDED')),
  "quantity_micros" BIGINT NOT NULL CHECK ("quantity_micros" > 0),
  "price_micros" BIGINT NOT NULL CHECK ("price_micros" >= 0),
  "fees_micros" BIGINT NOT NULL DEFAULT 0 CHECK ("fees_micros" >= 0),
  "executed_at" DATETIME NOT NULL,
  "external_reference" TEXT,
  "notes" TEXT,
  "recorded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voided_at" DATETIME,
  CHECK (("status" = 'POSTED' AND "voided_at" IS NULL) OR ("status" = 'VOIDED' AND "voided_at" IS NOT NULL)),
  CONSTRAINT "trades_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "trades_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "lot_allocations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "opening_trade_id" TEXT NOT NULL,
  "closing_trade_id" TEXT NOT NULL,
  "quantity_micros" BIGINT NOT NULL CHECK ("quantity_micros" > 0),
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("opening_trade_id" <> "closing_trade_id"),
  CONSTRAINT "lot_allocations_opening_trade_id_fkey" FOREIGN KEY ("opening_trade_id") REFERENCES "trades" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "lot_allocations_closing_trade_id_fkey" FOREIGN KEY ("closing_trade_id") REFERENCES "trades" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "exit_plans" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "opening_trade_id" TEXT NOT NULL,
  "target_price_micros" BIGINT NOT NULL CHECK ("target_price_micros" >= 0),
  "target_date" DATETIME NOT NULL,
  "rationale" TEXT NOT NULL CHECK (length(trim("rationale")) > 0),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "exit_plans_opening_trade_id_fkey" FOREIGN KEY ("opening_trade_id") REFERENCES "trades" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "price_snapshots" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "instrument_id" TEXT NOT NULL,
  "price_micros" BIGINT NOT NULL CHECK ("price_micros" >= 0),
  "captured_at" DATETIME NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL' CHECK (length(trim("source")) > 0),
  CONSTRAINT "price_snapshots_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "fx_rate_snapshots" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "base_currency" TEXT NOT NULL CHECK (length("base_currency") = 3 AND "base_currency" = upper("base_currency")),
  "quote_currency" TEXT NOT NULL CHECK (length("quote_currency") = 3 AND "quote_currency" = upper("quote_currency")),
  "rate_nanos" BIGINT NOT NULL CHECK ("rate_nanos" > 0),
  "captured_at" DATETIME NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL' CHECK (length(trim("source")) > 0),
  CHECK ("base_currency" <> "quote_currency")
);

CREATE UNIQUE INDEX "accounts_name_key" ON "accounts"("name");
CREATE INDEX "instruments_symbol_idx" ON "instruments"("symbol");
CREATE UNIQUE INDEX "instruments_symbol_exchange_key" ON "instruments"("symbol", "exchange");
CREATE INDEX "trades_account_id_instrument_id_executed_at_idx" ON "trades"("account_id", "instrument_id", "executed_at");
CREATE INDEX "trades_instrument_id_executed_at_idx" ON "trades"("instrument_id", "executed_at");
CREATE UNIQUE INDEX "trades_account_id_external_reference_key" ON "trades"("account_id", "external_reference");
CREATE INDEX "lot_allocations_closing_trade_id_idx" ON "lot_allocations"("closing_trade_id");
CREATE UNIQUE INDEX "lot_allocations_opening_trade_id_closing_trade_id_key" ON "lot_allocations"("opening_trade_id", "closing_trade_id");
CREATE UNIQUE INDEX "exit_plans_opening_trade_id_key" ON "exit_plans"("opening_trade_id");
CREATE INDEX "exit_plans_status_target_date_idx" ON "exit_plans"("status", "target_date");
CREATE INDEX "price_snapshots_captured_at_idx" ON "price_snapshots"("captured_at");
CREATE UNIQUE INDEX "price_snapshots_instrument_id_captured_at_key" ON "price_snapshots"("instrument_id", "captured_at");
CREATE INDEX "fx_rate_snapshots_captured_at_idx" ON "fx_rate_snapshots"("captured_at");
CREATE UNIQUE INDEX "fx_rate_snapshots_base_currency_quote_currency_captured_at_key" ON "fx_rate_snapshots"("base_currency", "quote_currency", "captured_at");

-- Prisma cannot express these cross-row invariants. Keep them in the migration.
CREATE TRIGGER "lot_allocation_validate_insert"
BEFORE INSERT ON "lot_allocations"
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM "trades" opening
    JOIN "trades" closing
      ON closing."id" = NEW."closing_trade_id"
     AND closing."account_id" = opening."account_id"
     AND closing."instrument_id" = opening."instrument_id"
    WHERE opening."id" = NEW."opening_trade_id"
      AND opening."side" = 'BUY' AND opening."status" = 'POSTED'
      AND closing."side" = 'SELL' AND closing."status" = 'POSTED'
  ) THEN RAISE(ABORT, 'allocation trades must be posted BUY/SELL for the same account and instrument') END;

  SELECT CASE WHEN NEW."quantity_micros" + COALESCE((
    SELECT sum("quantity_micros") FROM "lot_allocations"
    WHERE "opening_trade_id" = NEW."opening_trade_id"
  ), 0) > (SELECT "quantity_micros" FROM "trades" WHERE "id" = NEW."opening_trade_id")
  THEN RAISE(ABORT, 'allocation exceeds opening trade quantity') END;

  SELECT CASE WHEN NEW."quantity_micros" + COALESCE((
    SELECT sum("quantity_micros") FROM "lot_allocations"
    WHERE "closing_trade_id" = NEW."closing_trade_id"
  ), 0) > (SELECT "quantity_micros" FROM "trades" WHERE "id" = NEW."closing_trade_id")
  THEN RAISE(ABORT, 'allocation exceeds closing trade quantity') END;
END;

CREATE TRIGGER "lot_allocation_immutable_update"
BEFORE UPDATE ON "lot_allocations"
BEGIN
  SELECT RAISE(ABORT, 'lot allocations are immutable');
END;

CREATE TRIGGER "lot_allocation_immutable_delete"
BEFORE DELETE ON "lot_allocations"
BEGIN
  SELECT RAISE(ABORT, 'lot allocations are immutable');
END;

CREATE TRIGGER "trade_economic_fields_immutable"
BEFORE UPDATE ON "trades"
WHEN OLD."account_id" <> NEW."account_id"
  OR OLD."instrument_id" <> NEW."instrument_id"
  OR OLD."side" <> NEW."side"
  OR OLD."quantity_micros" <> NEW."quantity_micros"
  OR OLD."price_micros" <> NEW."price_micros"
  OR OLD."fees_micros" <> NEW."fees_micros"
  OR OLD."executed_at" <> NEW."executed_at"
  OR OLD."external_reference" IS NOT NEW."external_reference"
BEGIN
  SELECT RAISE(ABORT, 'posted trade economic fields are immutable');
END;

CREATE TRIGGER "trade_immutable_delete"
BEFORE DELETE ON "trades"
BEGIN
  SELECT RAISE(ABORT, 'posted trades cannot be deleted; void them instead');
END;

CREATE TRIGGER "exit_plan_requires_buy_insert"
BEFORE INSERT ON "exit_plans"
WHEN NOT EXISTS (
  SELECT 1 FROM "trades"
  WHERE "id" = NEW."opening_trade_id" AND "side" = 'BUY' AND "status" = 'POSTED'
)
BEGIN
  SELECT RAISE(ABORT, 'exit plans require a posted BUY trade');
END;

CREATE TRIGGER "exit_plan_requires_buy_update"
BEFORE UPDATE OF "opening_trade_id" ON "exit_plans"
WHEN NOT EXISTS (
  SELECT 1 FROM "trades"
  WHERE "id" = NEW."opening_trade_id" AND "side" = 'BUY' AND "status" = 'POSTED'
)
BEGIN
  SELECT RAISE(ABORT, 'exit plans require a posted BUY trade');
END;
