-- 0009_tx_ts.sql
-- Adds the real transaction datetime (ms epoch). date (YYYY-MM-DD) stays authoritative for all
-- year/month/day math; ts is additive — the exact instant a transaction occurred, used for
-- intra-day sort ordering. Nullable: legacy rows have no ts until backfilled by a Revolut re-import.
ALTER TABLE transactions ADD COLUMN ts INTEGER;
