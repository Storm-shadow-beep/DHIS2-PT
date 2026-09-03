-- Align the database with the relational model used by the application.
-- A project has many phases and a document has many versions.

DO $$
BEGIN
  IF to_regclass('public.project_phase') IS NOT NULL
     AND to_regclass('public.project_phases') IS NULL THEN
    ALTER TABLE project_phase RENAME TO project_phases;
  END IF;
END $$;

ALTER TABLE IF EXISTS project_phases
  DROP CONSTRAINT IF EXISTS project_phase_project_id_key,
  DROP CONSTRAINT IF EXISTS project_phase_sequence_key;

CREATE UNIQUE INDEX IF NOT EXISTS project_phases_project_sequence_unique
  ON project_phases (project_id, sequence);

ALTER TABLE IF EXISTS document_versions
  DROP CONSTRAINT IF EXISTS document_versions_document_id_key,
  DROP CONSTRAINT IF EXISTS document_versions_version_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS document_versions_document_version_unique
  ON document_versions (document_id, version_number);
