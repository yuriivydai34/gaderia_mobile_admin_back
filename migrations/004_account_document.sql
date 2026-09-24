-- Safe to re-run. On production the table already exists: app-server created it
-- by hand on 24.09.2026 (app-server: dev-db/create_account_document_table.sql)
-- before this file did. There the migration only records it and adds the index.
--
--   node scripts/migrate.mjs --remote
--
-- Documents a legal-entity account attaches in the mobile app (a single-tax
-- register extract and the like). app-server writes the rows and the files;
-- this admin only reads them, so managers can see what a client uploaded.
--
-- The file itself is not in the database. It lies on app-server's disk under
-- documents/account/<stored_name>; see DOCUMENTS_DIR in the README.

BEGIN;

CREATE TABLE IF NOT EXISTS account_document (
  id          SERIAL PRIMARY KEY,
  account_id  INTEGER NOT NULL REFERENCES account(id),
  -- The name the client gave the file; shown and used for the download.
  file_name   VARCHAR NOT NULL,
  -- uuid + extension, the name on disk. Deliberately unrelated to file_name.
  stored_name VARCHAR NOT NULL,
  mime_type   VARCHAR,
  size        INTEGER,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Every read is "the documents of this account", from both sides.
CREATE INDEX IF NOT EXISTS account_document_account_id_idx
  ON account_document (account_id);

COMMIT;
