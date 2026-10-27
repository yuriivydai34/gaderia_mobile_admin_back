-- Safe to re-run.
--
--   node scripts/migrate.mjs --remote
--
-- Where an app customer came from.
--
-- sales-report.mjs splits site revenue by channel from WooCommerce's
-- _wc_order_attribution_*, but the app is a single number with no breakdown:
-- nothing anywhere records whether someone installed from a Meta ad, a Google
-- ad or by themselves. These columns are the place to put it; filling them is
-- the app's job and is a separate decision (Install Referrer on Android, or
-- the utm_source carried by the Play link - see TODO.md).
--
-- On account rather than payment, and deliberately: the question is where the
-- CUSTOMER came from, asked once at acquisition. A sales report joins
-- payment -> account to split revenue by channel. Repeating it per order would
-- invite the reading that each order has its own source, and this project has
-- already lost a day to a column whose name implied the wrong direction.
--
-- install_raw keeps the referrer string as it arrived. Parsing can be wrong or
-- incomplete, and a later fix can re-derive the parsed fields from it instead
-- of needing another migration and another backfill that cannot be done.
--
-- Nothing is backfilled: for everyone who registered before this, the source
-- is genuinely unknown, and NULL says that honestly. Do not read NULL as
-- "organic".

BEGIN;

ALTER TABLE account ADD COLUMN IF NOT EXISTS install_source VARCHAR(255);
ALTER TABLE account ADD COLUMN IF NOT EXISTS install_medium VARCHAR(255);
ALTER TABLE account ADD COLUMN IF NOT EXISTS install_campaign VARCHAR(255);
ALTER TABLE account ADD COLUMN IF NOT EXISTS install_raw TEXT;
ALTER TABLE account ADD COLUMN IF NOT EXISTS install_captured_at TIMESTAMP WITH TIME ZONE;

-- For the report: "app customers by source over a period" scans this.
CREATE INDEX IF NOT EXISTS account_install_source_idx ON account (install_source);

COMMIT;
