-- Applied by hand: this project has no migration runner, and the deploy
-- workflow only copies dist/ and restarts PM2.
--
--   psql "$DATABASE_URL" -f migrations/001_woocommerce_import.sql
--
-- Safe to re-run.

BEGIN;

-- Where the record came from, and its id in that system. For WooCommerce
-- guests there is no WP user, so external_id holds the normalised billing
-- email (or phone) that identifies the person across their orders.
ALTER TABLE account ADD COLUMN IF NOT EXISTS source varchar NOT NULL DEFAULT 'gaderia';
ALTER TABLE account ADD COLUMN IF NOT EXISTS external_id varchar;

-- One record per person per source. Rows without an external_id (everything
-- created in the admin panel) are not constrained.
CREATE UNIQUE INDEX IF NOT EXISTS account_source_external_id_key
  ON account (source, external_id)
  WHERE external_id IS NOT NULL;

-- Remembers how far the last successful sync got, so the next run only asks
-- WooCommerce for orders modified since then.
CREATE TABLE IF NOT EXISTS integration_state (
  key         varchar PRIMARY KEY,
  value       text,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

COMMIT;

-- Left out on purpose: a unique index on account.email. The table may already
-- hold duplicates, so adding it would fail mid-deploy. Check first with
--
--   SELECT lower(email), count(*) FROM account WHERE email IS NOT NULL
--   GROUP BY 1 HAVING count(*) > 1;
--
-- and add the index once the list is empty.
