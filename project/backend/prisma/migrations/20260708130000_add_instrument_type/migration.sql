ALTER TABLE "instruments"
  ADD COLUMN "instrument_type" TEXT NOT NULL DEFAULT 'EQUITY'
  CHECK ("instrument_type" IN ('EQUITY', 'ETF'));

UPDATE "instruments"
SET "instrument_type" = 'ETF'
WHERE EXISTS (
  SELECT 1
  FROM "trades"
  WHERE "trades"."instrument_id" = "instruments"."id"
    AND lower(COALESCE("trades"."notes", '')) LIKE '%isin: inf%'
);
