-- Applied by hand: this project has no migration runner, and the deploy
-- workflow only copies dist/ and restarts PM2.
--
--   psql "$DATABASE_URL" -f migrations/001_customer_import.sql
--
-- Safe to re-run. Does not touch `account`.

BEGIN;

-- Buyers imported from the shop. Kept apart from `account` on purpose: that
-- table is for application logins, and these records have no password. Mixing
-- them in would make register() answer "email already in use" while login()
-- rejects the same address for having no password.
CREATE TABLE IF NOT EXISTS customer (
  id           serial PRIMARY KEY,
  source       varchar NOT NULL,
  external_id  varchar NOT NULL,
  full_name    varchar,
  email        varchar,
  number       varchar,
  name_company varchar,
  region       varchar,
  settlement   varchar,
  address      varchar,
  -- Every email, phone spelling, name, address and delivery record the person
  -- ever used, plus a summary of their orders.
  source_data  jsonb,
  -- When this person first and last ordered, so the list can sort on them.
  first_order_at timestamptz,
  last_order_at  timestamptz,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz NOT NULL DEFAULT now()
);

-- One record per person per source, so re-running the import updates instead of
-- duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS customer_source_external_id_key
  ON customer (source, external_id);

CREATE INDEX IF NOT EXISTS customer_email_idx  ON customer (email);
CREATE INDEX IF NOT EXISTS customer_number_idx ON customer (number);

-- Remembers how far the last successful sync got, so the next run only asks the
-- shop for orders modified since then.
CREATE TABLE IF NOT EXISTS integration_state (
  key         varchar PRIMARY KEY,
  value       text,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

COMMIT;
