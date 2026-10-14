-- Safe to re-run.
--
--   node scripts/migrate.mjs --remote
--
-- Which version of the app each account uses. The app sends X-App-Version
-- with every request; app-server stores the latest one it sees from a signed-in
-- account, with the time, and skips rewriting it when nothing changed. The
-- Settings page shows how many people are on which version (for example, who
-- already has the promo code field from 1.3.3), the Users list shows each
-- person's.
--
-- NULL until the person opens a version that sends the header (1.3.2 and
-- newer) while signed in.

BEGIN;

ALTER TABLE account ADD COLUMN IF NOT EXISTS app_version VARCHAR;
ALTER TABLE account ADD COLUMN IF NOT EXISTS app_version_seen_at TIMESTAMP WITH TIME ZONE;

COMMIT;
