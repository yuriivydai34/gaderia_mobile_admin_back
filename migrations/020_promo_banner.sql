-- Safe to re-run.
--
--   node scripts/migrate.mjs --remote
--
-- The promotions carousel at the top of the app: a picture per banner, shown
-- in the order a manager drags them into, each with its own on/off and an
-- optional run of dates. The carousel as a whole is switched by the app
-- setting `banners_enabled`, which starts off, so nothing appears in the app
-- until a manager has added banners and turned it on - same shape as
-- `new_carousel_enabled` (migration 013).
--
-- `image` is a file name under the API's /banner-images, not a URL: banner
-- pictures are uploaded in the panel rather than taken from the website's
-- media library the way product pictures are.
--
-- Tapping a banner either opens a product in the app or a link outside it;
-- `target_type` says which, and the other column stays empty. 'none' is a
-- banner that only announces something.
--
-- app-server does not read this table yet - the app side comes later. Nothing
-- it queries changes, so its schema_check stays quiet.

BEGIN;

CREATE TABLE IF NOT EXISTS promo_banner (
  id                serial PRIMARY KEY,
  -- Shown in the panel's list, and used as the picture's alt text.
  title             varchar NOT NULL,
  image             varchar NOT NULL,
  target_type       varchar NOT NULL DEFAULT 'none'
                      CHECK (target_type IN ('none', 'product', 'link')),
  target_product_id integer,
  target_url        varchar,
  sort              integer NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT false,
  -- Both optional: empty means "from now" and "until switched off".
  starts_at         timestamptz,
  ends_at           timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now()
);

-- The app asks for the active ones in display order; the id breaks ties so
-- two banners with the same sort do not swap places between requests.
CREATE INDEX IF NOT EXISTS promo_banner_sort_idx ON promo_banner (sort, id);

INSERT INTO app_setting (key, value) VALUES ('banners_enabled', 'false')
  ON CONFLICT (key) DO NOTHING;

COMMIT;
