-- Safe to re-run. On production the column already exists: app-server added
-- it by hand on 30.09.2026 (app-server: dev-db/add_catalog_is_active.sql).
-- Here it is recorded, the same as 004 did for account_document.
--
--   node scripts/migrate.mjs --remote
--
-- A hidden product: false keeps it out of the app's catalog (listing and the
-- direct link) while it is being prepared, without deleting it. DEFAULT true
-- leaves every existing product as it was.

BEGIN;

ALTER TABLE catalog ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMIT;
