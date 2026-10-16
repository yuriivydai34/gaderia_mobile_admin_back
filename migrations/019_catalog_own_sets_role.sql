-- Safe to re-run.
--
--   node scripts/migrate.mjs --remote
--
-- Juices by the bottle, as on the website (gaderia_wc
-- docs/plan-poshtuchno-2026-10-15.md): a bottle is sold one at a time, but
-- ships in a full box, so the order must hold whole boxes of each volume.
--
-- `own_sets_role` marks the two sides of it:
--   'single' — a bottle sold one at a time, counted by the box rules;
--   'pack'   — a ready box (×2, ×6, ×12), the way juices are sold now;
--   NULL     — neither (vinegar, apples, honey, tasting sets): always shown.
-- Which side the app shows is the app setting `own_sets_mode`: while it is
-- 'off' (the default) bottles are hidden from everyone and nothing changes.
--
-- Run BEFORE deploying the app-server that knows the column: its catalog
-- model reads it in every query, so without it the catalog breaks.

BEGIN;

ALTER TABLE catalog ADD COLUMN IF NOT EXISTS own_sets_role VARCHAR
  CHECK (own_sets_role IN ('single', 'pack'));

COMMIT;
