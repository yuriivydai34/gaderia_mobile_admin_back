-- Applied by hand, like 001. Safe to re-run.
--
--   psql "$DATABASE_URL" -f migrations/002_account_source_data.sql

BEGIN;

-- Everything the shop knows about this person that does not fit the flat
-- columns: every email and phone they ever used, every name spelling, every
-- delivery address, and a compact list of their orders. The columns hold the
-- newest values; this holds the history behind them.
ALTER TABLE account ADD COLUMN IF NOT EXISTS source_data jsonb;

COMMIT;
