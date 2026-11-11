-- Safe to re-run.
--
-- A record of every push notification sent from the panel (src/push):
-- broadcasts (account_id null) and resends to one person. Written by this
-- API right after app-server confirms Firebase accepted it - app-server
-- itself never reads or writes this table, so it needs no model there.
--
-- message_id is what Firebase gave back: proof it accepted the message for
-- delivery, not that any device ever showed it - Firebase gives no way to
-- confirm that from here.

BEGIN;

CREATE TABLE IF NOT EXISTS push_log (
  id          serial PRIMARY KEY,
  title       varchar NOT NULL,
  body        varchar NOT NULL,
  image       varchar,
  account_id  integer,
  message_id  varchar,
  sent_by     varchar,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_log_created_at_idx ON push_log ("createdAt" DESC);

COMMIT;
