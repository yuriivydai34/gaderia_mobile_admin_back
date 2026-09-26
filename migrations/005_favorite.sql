-- Safe to re-run. On production the table already exists: app-server created
-- it by hand on 26.09.2026 (app-server: dev-db/create_favorite_table.sql)
-- before this file did. There the migration records it and fixes its keys.
--
--   node scripts/migrate.mjs --remote
--
-- Products an account hearted in the mobile app ("Улюблене"). app-server reads
-- and writes it; the admin only declares it.
--
-- The foreign keys were created without ON DELETE, which would have made a
-- hearted product impossible to delete from this admin (and the same for an
-- account). A favorite means nothing without its product or account, so both
-- now cascade.

BEGIN;

CREATE TABLE IF NOT EXISTS favorite (
  id          SERIAL PRIMARY KEY,
  account_id  INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  catalog_id  INTEGER NOT NULL REFERENCES catalog(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (account_id, catalog_id)
);

ALTER TABLE favorite
  DROP CONSTRAINT IF EXISTS favorite_account_id_fkey,
  ADD CONSTRAINT favorite_account_id_fkey
    FOREIGN KEY (account_id) REFERENCES account(id) ON DELETE CASCADE;

ALTER TABLE favorite
  DROP CONSTRAINT IF EXISTS favorite_catalog_id_fkey,
  ADD CONSTRAINT favorite_catalog_id_fkey
    FOREIGN KEY (catalog_id) REFERENCES catalog(id) ON DELETE CASCADE;

COMMIT;
