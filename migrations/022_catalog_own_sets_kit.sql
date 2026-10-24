-- Safe to re-run.
--
--   node scripts/migrate.mjs --remote
--
-- Adds 'kit' to catalog.own_sets_role (migrations/019): a fixed set of
-- several flavours sold as one ordinary product ("Набір 1", "Набір 2",
-- 24.10.2026). Not counted by the box rules (own_sets.packShortfall only
-- sums 'single' rows) but shown and hidden by the same own_sets_mode
-- switch as a loose bottle, so it does not appear before the mode is turned
-- on — a ready-made mix of bottles is pointless while bottles are hidden.
--
-- Run BEFORE deploying the app-server that knows the role: its own_sets
-- visibility check names 'kit' explicitly.

BEGIN;

ALTER TABLE catalog DROP CONSTRAINT IF EXISTS catalog_own_sets_role_check;
ALTER TABLE catalog ADD CONSTRAINT catalog_own_sets_role_check
  CHECK (own_sets_role IN ('single', 'pack', 'kit'));

COMMIT;
