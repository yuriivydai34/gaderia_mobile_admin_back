-- Safe to re-run.
--
--   node scripts/migrate.mjs --remote
--
-- "Видалити профіль" in the app queues the account for deletion instead of
-- erasing it on the spot, so a person who tapped it by mistake can cancel.
-- deletion_requested_at is when they asked; app-server erases the personal
-- data some hours later (ACCOUNT_DELETION_DELAY_HOURS, default 6) and clears
-- the column. NULL means not queued.
--
-- app-server declares this column in its account model, so it must exist here
-- BEFORE that code ships: Sequelize selects every declared attribute, and a
-- missing column fails every account query with 42703.

BEGIN;

ALTER TABLE account ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMP WITH TIME ZONE;

COMMIT;
