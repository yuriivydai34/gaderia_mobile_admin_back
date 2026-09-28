-- Safe to re-run.
--
--   node scripts/migrate.mjs --remote
--
-- Promo codes. Managers create them in this admin; app-server checks and
-- applies them when an order is placed (and later the WooCommerce site will
-- ask app-server the same way).
--
-- A code is one row with conditions that combine, not a "kind": a welcome
-- code is just first_order_only + max_account_age_days, a campaign code is
-- starts_at/ends_at, "the first 100 people" is usage_limit.

BEGIN;

CREATE TABLE IF NOT EXISTS promo_code (
  id             SERIAL PRIMARY KEY,
  -- Stored upper-case; clients may type it in any case.
  code           VARCHAR NOT NULL,
  -- The campaign it belongs to, for managers: "Осінь 2026", "Welcome".
  title          VARCHAR,
  discount_type  VARCHAR NOT NULL CHECK (discount_type IN ('PERCENT', 'FIXED')),
  -- Percent (1-100) or hryvnias off the goods, depending on discount_type.
  discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
  -- NULL: unlimited. Counts orders that are not cancelled.
  usage_limit    INTEGER CHECK (usage_limit > 0),
  -- NULL on either side: open on that side.
  starts_at      TIMESTAMP WITH TIME ZONE,
  ends_at        TIMESTAMP WITH TIME ZONE,
  -- Only if the account has no orders yet, cancelled ones aside.
  first_order_only     BOOLEAN NOT NULL DEFAULT false,
  -- Only for accounts registered at most this many days ago.
  max_account_age_days INTEGER CHECK (max_account_age_days > 0),
  -- Switched off by a manager. A used code is switched off, not deleted,
  -- so its history stays.
  is_active      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP WITH TIME ZONE DEFAULT now(),
  "updatedAt"    TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CHECK (discount_type <> 'PERCENT' OR discount_value <= 100),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at)
);

-- One code, whatever the case it was typed in.
CREATE UNIQUE INDEX IF NOT EXISTS promo_code_code_upper_idx ON promo_code (upper(code));

-- Every use of a code: who, which order, how much it took off. The panel's
-- usage list and statistics are read from here, and so is the usage limit.
CREATE TABLE IF NOT EXISTS promo_redemption (
  id              SERIAL PRIMARY KEY,
  -- RESTRICT: a used code cannot be deleted, only switched off.
  promo_code_id   INTEGER NOT NULL REFERENCES promo_code(id) ON DELETE RESTRICT,
  account_id      INTEGER REFERENCES account(id) ON DELETE SET NULL,
  -- Where the order was placed: APP (mobile, via app-server) or WOO (the site).
  source          VARCHAR NOT NULL DEFAULT 'APP' CHECK (source IN ('APP', 'WOO')),
  -- The app's order. Deleting the order frees its place in the limit, the
  -- same as cancelling it does.
  payment_id      INTEGER REFERENCES payment(id) ON DELETE CASCADE,
  -- The site's order number, for source = 'WOO'.
  external_order_id VARCHAR,
  -- Goods total before the discount, and the discount itself, in hryvnias.
  order_amount    NUMERIC(10, 2) NOT NULL,
  discount_amount NUMERIC(10, 2) NOT NULL,
  "createdAt"     TIMESTAMP WITH TIME ZONE DEFAULT now(),
  "updatedAt"     TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promo_redemption_promo_code_id_idx ON promo_redemption (promo_code_id);
CREATE INDEX IF NOT EXISTS promo_redemption_payment_id_idx ON promo_redemption (payment_id);

COMMIT;
