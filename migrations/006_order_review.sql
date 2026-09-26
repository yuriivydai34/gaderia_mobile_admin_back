-- Safe to re-run.
--
--   node scripts/migrate.mjs --remote
--
-- A client's rating of a completed order, left in the mobile app: 1–5 stars,
-- an optional review and optional suggestions for the product or service.
-- Internal only — nothing here is published. app-server writes it; this admin
-- shows it to managers.
--
-- One review per order (UNIQUE payment_id). It goes with the order and the
-- account if either is deleted.

BEGIN;

CREATE TABLE IF NOT EXISTS order_review (
  id          SERIAL PRIMARY KEY,
  payment_id  INTEGER NOT NULL UNIQUE REFERENCES payment(id) ON DELETE CASCADE,
  account_id  INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review      TEXT,
  suggestion  TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- The panel lists the newest first and filters by stars.
CREATE INDEX IF NOT EXISTS order_review_created_at_idx ON order_review ("createdAt");
CREATE INDEX IF NOT EXISTS order_review_rating_idx ON order_review (rating);

COMMIT;
