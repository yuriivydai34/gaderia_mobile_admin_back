-- Safe to re-run. Applied by the deploy (scripts/migrate.mjs --remote --snapshot).
--
-- Bonuses for website orders, as for app ones: 1 per 1 UAH of goods, for
-- orders placed while signed in with an app account. A site order has no row
-- in payment, so it is identified by its WooCommerce number; one accrual per
-- site order, as 015 does one per app payment. Existing rows are all from the
-- app, which the default records.
--
-- REVERSE takes back an accrual when a completed order is refunded or
-- cancelled: a negative row, so the history stays and the balance is right.

BEGIN;

ALTER TABLE bonus_ledger ADD COLUMN IF NOT EXISTS source VARCHAR NOT NULL DEFAULT 'APP';
ALTER TABLE bonus_ledger ADD COLUMN IF NOT EXISTS external_order_id VARCHAR;

ALTER TABLE bonus_ledger DROP CONSTRAINT IF EXISTS bonus_ledger_source_check;
ALTER TABLE bonus_ledger ADD CONSTRAINT bonus_ledger_source_check CHECK (source IN ('APP', 'WOO'));

-- 015 allowed ACCRUE and REDEEM; REVERSE is new.
ALTER TABLE bonus_ledger DROP CONSTRAINT IF EXISTS bonus_ledger_type_check;
ALTER TABLE bonus_ledger ADD CONSTRAINT bonus_ledger_type_check CHECK (type IN ('ACCRUE', 'REDEEM', 'REVERSE'));

CREATE UNIQUE INDEX IF NOT EXISTS bonus_ledger_one_accrual_per_site_order
  ON bonus_ledger (external_order_id)
  WHERE type = 'ACCRUE' AND source = 'WOO';

-- And one reversal per order, whichever side it came from.
CREATE UNIQUE INDEX IF NOT EXISTS bonus_ledger_one_reversal_per_payment
  ON bonus_ledger (payment_id) WHERE type = 'REVERSE';
CREATE UNIQUE INDEX IF NOT EXISTS bonus_ledger_one_reversal_per_site_order
  ON bonus_ledger (external_order_id) WHERE type = 'REVERSE' AND source = 'WOO';

COMMIT;
