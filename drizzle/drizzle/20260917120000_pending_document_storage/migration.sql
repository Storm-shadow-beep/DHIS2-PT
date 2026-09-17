-- Keep submitted document bytes in PostgreSQL until a project manager approves them.
ALTER TABLE documents
  ALTER COLUMN drive_file_id DROP NOT NULL,
  ALTER COLUMN drive_link DROP NOT NULL;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS pending_file bytea,
  ADD COLUMN IF NOT EXISTS pending_mime_type varchar(150),
  ADD COLUMN IF NOT EXISTS pending_filename varchar(255);

ALTER TABLE document_versions
  ALTER COLUMN drive_file_id DROP NOT NULL;
