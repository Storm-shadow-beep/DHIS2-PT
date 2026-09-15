-- Document Requirements hardening: enforce requirement-name uniqueness
-- per phase case-insensitively. The application service already rejects
-- case-variant duplicates, but without this expression index two concurrent
-- requests (e.g. "SRS" vs "srs") could both pass the check and insert.
-- Additive (keeps the plain unique index declared in schema.ts); all
-- statements are idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS document_categories_phase_name_unique_ci
  ON document_categories (phase_id, (lower(name)));
