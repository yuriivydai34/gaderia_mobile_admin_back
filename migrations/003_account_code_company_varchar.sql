-- Applied by hand, like 001 and 002. Safe to re-run.
--
--   sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 \
--     -f migrations/003_account_code_company_varchar.sql
--
-- code_company was an integer, and a company code is not a quantity. Two
-- things went wrong because of that.
--
-- A ten-digit ЄДРПОУ above 2147483647 does not fit int4 at all: registering
-- such a company in the mobile app failed with "value 2983111979 is out of
-- range for type integer", and the request did not even answer - the error
-- surfaced only in the app server's log.
--
-- An eight-digit ЄДРПОУ often starts with zeros, and an integer column eats
-- them silently. Those are already lost in existing rows and cannot be
-- recovered from the database; this only stops it happening to new ones.
--
-- Run the entity change alongside this: the app server and this admin both
-- read the column, and both now expect text.

BEGIN;

-- Digits are preserved; only the storage type changes. Reversible while every
-- value is still numeric:
--   ALTER TABLE account ALTER COLUMN code_company TYPE INTEGER
--     USING code_company::integer;
ALTER TABLE account
  ALTER COLUMN code_company TYPE VARCHAR
  USING code_company::varchar;

COMMIT;

-- Afterwards, to see how many codes lost a leading zero earlier - anything
-- shorter than eight digits almost certainly did:
--
--   SELECT count(*) FROM account
--   WHERE code_company IS NOT NULL AND length(code_company) NOT IN (8, 10);
