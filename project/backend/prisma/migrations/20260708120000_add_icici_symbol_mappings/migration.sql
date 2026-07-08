CREATE TABLE "icici_symbol_mappings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "icici_symbol" TEXT NOT NULL
    CHECK (length(trim("icici_symbol")) > 0 AND "icici_symbol" = upper("icici_symbol")),
  "nse_symbol" TEXT NOT NULL
    CHECK (length(trim("nse_symbol")) > 0 AND "nse_symbol" = upper("nse_symbol")),
  "company_name" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "icici_symbol_mappings_icici_symbol_key"
  ON "icici_symbol_mappings"("icici_symbol");
CREATE INDEX "icici_symbol_mappings_nse_symbol_idx"
  ON "icici_symbol_mappings"("nse_symbol");
