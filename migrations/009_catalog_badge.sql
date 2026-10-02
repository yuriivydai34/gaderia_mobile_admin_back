-- Safe to re-run.
--
--   node scripts/migrate.mjs --remote
--
-- A label such as "Новинка!" drawn onto the product's picture by the panel,
-- the way the website shows one: text and colour set per product.
-- `picture` then points at the badged copy, which is what the app shows, and
-- `picture_original` keeps the clean one so the badge can be changed or taken
-- off. All three stay NULL for a product without a badge.
--
-- app-server needs the same three columns in its catalog model, or its
-- schema_check reports drift. It does not have to read them: the app keeps
-- showing `picture` as before.

BEGIN;

ALTER TABLE catalog ADD COLUMN IF NOT EXISTS badge VARCHAR;
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS badge_color VARCHAR;
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS picture_original VARCHAR;

COMMIT;
