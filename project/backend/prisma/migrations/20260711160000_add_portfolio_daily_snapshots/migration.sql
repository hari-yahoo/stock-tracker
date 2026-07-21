CREATE TABLE "portfolio_daily_snapshots" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "as_of_date" TEXT NOT NULL CHECK (length("as_of_date") = 10),
  "reporting_currency" TEXT NOT NULL
    CHECK (length("reporting_currency") = 3 AND "reporting_currency" = upper("reporting_currency")),
  "invested_amount_micros" BIGINT,
  "market_value_micros" BIGINT,
  "captured_at" DATETIME NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'DAILY_PROCESS' CHECK (length(trim("source")) > 0),
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "portfolio_daily_snapshots_reporting_currency_as_of_date_key"
  ON "portfolio_daily_snapshots"("reporting_currency", "as_of_date");

CREATE INDEX "portfolio_daily_snapshots_captured_at_idx"
  ON "portfolio_daily_snapshots"("captured_at");
