-- Safe to re-run.
--
--   node scripts/migrate.mjs --remote
--
-- A use of a promo code on the website (source = 'WOO') has no app order to
-- be cancelled, so until now it held its place in the code's limit forever.
-- app-server's POST /site/promo/release sets released_at when the site's order
-- is cancelled, refunded or its payment fails; a released use no longer counts
-- towards the limit or the statistics, but the row stays as history.
--
-- NULL: the use is active. App uses (source = 'APP') keep it NULL: cancelling
-- the app order frees them already.

BEGIN;

ALTER TABLE promo_redemption ADD COLUMN IF NOT EXISTS released_at TIMESTAMP WITH TIME ZONE;

COMMIT;
