CREATE TABLE "stock_exit_plans" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "instrument_id" TEXT NOT NULL,
  "target_price_micros" BIGINT NOT NULL CHECK ("target_price_micros" >= 0),
  "target_date" DATETIME NOT NULL,
  "rationale" TEXT NOT NULL CHECK (length(trim("rationale")) > 0),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "stock_exit_plans_instrument_id_fkey"
    FOREIGN KEY ("instrument_id") REFERENCES "instruments" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "stock_exit_plans" (
  "id", "instrument_id", "target_price_micros", "target_date",
  "rationale", "status", "created_at", "updated_at"
)
SELECT "id", "instrument_id", "target_price_micros", "target_date",
       "rationale", "status", "created_at", "updated_at"
FROM (
  SELECT ep.*, t."instrument_id",
         ROW_NUMBER() OVER (
           PARTITION BY t."instrument_id"
           ORDER BY ep."updated_at" DESC, ep."created_at" DESC, ep."id" DESC
         ) AS plan_rank
  FROM "exit_plans" ep
  JOIN "trades" t ON t."id" = ep."opening_trade_id"
)
WHERE plan_rank = 1;

CREATE UNIQUE INDEX "stock_exit_plans_instrument_id_key"
  ON "stock_exit_plans"("instrument_id");
CREATE INDEX "stock_exit_plans_status_target_date_idx"
  ON "stock_exit_plans"("status", "target_date");

DROP TABLE "exit_plans";
