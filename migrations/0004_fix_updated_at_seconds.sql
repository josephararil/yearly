-- Fix transactions whose updated_at was written in SECONDS instead of MILLISECONDS.
--
-- Why this exists:
--   The Revolut pipeline (scripts/revolut_clean.py) historically stamped updated_at
--   with `datetime.now().timestamp()` (seconds, ~10 digits). The worker and client
--   use Date.now() (milliseconds, ~13 digits). Because /api/sync filters
--   `WHERE updated_at >= ?` and the client cursor lives in ms, every pipeline row
--   ever inserted was excluded from incremental sync. The pipeline now writes ms;
--   this migration retroactively corrects the existing rows.
--
-- Safe boundary:
--   Any timestamp < 10_000_000_000 (10^10) is definitely seconds — that's well above
--   the largest plausible seconds value (~2 * 10^9 = year 2033) and well below the
--   smallest plausible ms value (10^12 = year 2001). So multiplying by 1000 won't
--   touch any correctly-stamped row.
--
-- Run with:
--   wrangler d1 execute yearly-db --remote --file=migrations/0004_fix_updated_at_seconds.sql

UPDATE transactions
   SET updated_at = updated_at * 1000
 WHERE updated_at < 10000000000;
