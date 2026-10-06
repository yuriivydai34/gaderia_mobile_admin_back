-- Safe to re-run.
--
--   node scripts/migrate.mjs --remote
--
-- Delivery details kept on the profile: carrier, city, and either a branch or
-- a street address. The app fills checkout from them, so what is stored here
-- are the same Nova Poshta / Ukrposhta objects that later travel in a
-- payment's delivery_description.
--
-- JSONB rather than columns, because the shape differs per carrier and per
-- delivery kind, and the app passes those objects through untouched. The
-- validation that decides what may be written lives in
-- app-server/lib/components/account/parse_delivery_info.js.
--
-- The older region / settlement / address columns stay where they are: app
-- versions already in the stores still write and read them.
--
-- app-server declares this column in its account model, so it must exist here
-- BEFORE that code ships. Sequelize puts every declared attribute into both
-- SELECT and INSERT, and a missing column answers 42703 for every query to the
-- table - which is login, profile and checkout, not just this field.

BEGIN;

ALTER TABLE account ADD COLUMN IF NOT EXISTS delivery_info JSONB;

COMMIT;
