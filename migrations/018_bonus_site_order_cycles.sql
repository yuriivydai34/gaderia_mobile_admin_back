-- Safe to re-run. Applied by the deploy (scripts/migrate.mjs --remote --snapshot).
--
-- 017 allowed one ACCRUE and one REVERSE per site order for the whole life of
-- the order. A site order can go completed -> cancelled -> completed again, and
-- the second completion could then never be accrued (found on the dev site
-- before any production traffic). app-server now keeps one active accrual per
-- site order itself: in a transaction under pg_advisory_xact_lock on the order
-- number, it looks at the order's latest row - an ACCRUE means already
-- accrued, a REVERSE or nothing means a new cycle. All site rows are written
-- by app-server, so the lock covers every writer.
--
-- App payments keep their database-level guards (015, 017): a payment is paid
-- once and has no such cycle.

BEGIN;

DROP INDEX IF EXISTS bonus_ledger_one_accrual_per_site_order;
DROP INDEX IF EXISTS bonus_ledger_one_reversal_per_site_order;

COMMIT;
