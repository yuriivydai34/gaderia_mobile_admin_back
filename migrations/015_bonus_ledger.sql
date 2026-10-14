-- Safe to re-run.
--
--   node scripts/migrate.mjs --remote
--
-- Bonuses, first version: 1 UAH of an order paid online = 1 bonus, accrued
-- by app-server. A journal, not a balance column: the balance is
-- SUM(amount) per account, and every change stays as a row. Spending
-- (REDEEM), limits and expiry are not decided yet.
--
-- One accrual per order is enforced here too, not only by app-server's
-- check-then-insert: two LiqPay callbacks for the same payment arriving at
-- once would both pass the check.
--
-- Rows go with the account (account deletion) and with the order (deleted in
-- this admin), as promo_redemption does.

BEGIN;

CREATE TABLE IF NOT EXISTS bonus_ledger (
  id          SERIAL PRIMARY KEY,
  account_id  INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  -- Positive for an accrual; spending will be negative.
  amount      INTEGER NOT NULL CHECK (amount <> 0),
  type        VARCHAR NOT NULL CHECK (type IN ('ACCRUE', 'REDEEM')),
  payment_id  INTEGER REFERENCES payment(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bonus_ledger_account_id_idx ON bonus_ledger (account_id);

CREATE UNIQUE INDEX IF NOT EXISTS bonus_ledger_one_accrual_per_payment
  ON bonus_ledger (payment_id) WHERE type = 'ACCRUE';

COMMIT;
