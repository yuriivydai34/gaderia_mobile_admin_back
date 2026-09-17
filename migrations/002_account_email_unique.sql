-- Applied by hand, like 001. Safe to re-run.
--
--   sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 \
--     -f migrations/002_account_email_unique.sql
--
-- Registration and login are by email, so two accounts must never share one.
-- Until now nothing enforced that: register() checked with a SELECT and then
-- inserted, which two concurrent requests can both get through.
--
-- On lower(email), because the addresses are the same person whatever the
-- casing - findByEmail() matches case-insensitively to agree with this.
-- Partial, because accounts without an address are allowed and must not
-- collide with each other.

BEGIN;

-- Run this first. It must return no rows; the index below will fail otherwise,
-- and the duplicates have to be resolved by hand - there is no safe automatic
-- answer to which of two accounts keeps the address.
--
--   SELECT lower(email), count(*) FROM account
--   WHERE email IS NOT NULL AND email <> ''
--   GROUP BY 1 HAVING count(*) > 1;

-- Existing addresses are stored as typed. Normalising them now keeps the table
-- consistent with what register() writes from here on.
UPDATE account
SET email = lower(trim(email))
WHERE email IS NOT NULL AND email <> lower(trim(email));

CREATE UNIQUE INDEX IF NOT EXISTS account_email_lower_key
  ON account (lower(email))
  WHERE email IS NOT NULL AND email <> '';

COMMIT;
