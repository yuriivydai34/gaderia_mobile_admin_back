-- Safe to re-run.
--
--   node scripts/migrate.mjs --remote
--
-- Lets a single token be revoked without rotating JWT_SECRET for everyone.
-- Every token now carries the account's token_version at the moment it was
-- issued; app-server's decodeToken compares it against the current column
-- value and rejects a mismatch. forgot_pass bumps the column on a password
-- reset, so every token issued before the reset stops working immediately —
-- the thing changing a password is supposed to do and, until now, did not.
--
-- JWT_SECRET rotation (done on prod 2026-11-11 after the old secret turned
-- out to be 8 characters) stays the blunt instrument for "something is
-- actively being abused, kill every session now." This is the scoped one:
-- one account, one event, no effect on anyone else.
--
-- DEFAULT 0 matches what a token with no tokenVersion in its payload is
-- treated as on the app-server side, so existing rows need no backfill.

BEGIN;

ALTER TABLE account ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

COMMIT;
