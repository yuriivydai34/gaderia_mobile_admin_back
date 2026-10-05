-- Safe to re-run.
--
--   node scripts/migrate.mjs --remote
--
-- A promo code the app applies by itself, without the client typing it: a
-- welcome discount on the first order is the case that asked for it. At
-- checkout app-server picks, among active auto_apply codes that fit the
-- account and the cart, the one that takes off most; the app shows the price
-- with it already applied. Codes without the flag still have to be typed.
--
-- app-server needs the same column in its promo_code model, or its
-- schema_check reports drift.

BEGIN;

ALTER TABLE promo_code ADD COLUMN IF NOT EXISTS auto_apply BOOLEAN NOT NULL DEFAULT false;

COMMIT;
