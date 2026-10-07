-- Safe to re-run.
--
--   node scripts/migrate.mjs --remote
--
-- The "Новинки" carousel at the top of the app's catalog.
--
-- `catalog.is_new` marks a product for it by hand in the panel; the mark stays
-- until a manager takes it off.
--
-- `app_setting` holds switches the panel changes without a deploy, one row
-- per key. The first is `new_carousel_enabled`: whether the app shows the
-- carousel at all. It starts off, so nothing appears in the app until a
-- manager has marked products and turned it on.
--
-- app-server needs the same column and table in its models, or its
-- schema_check reports drift.

BEGIN;

ALTER TABLE catalog ADD COLUMN IF NOT EXISTS is_new BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS app_setting (
  key VARCHAR PRIMARY KEY,
  value JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_setting (key, value) VALUES ('new_carousel_enabled', 'false')
  ON CONFLICT (key) DO NOTHING;

COMMIT;
