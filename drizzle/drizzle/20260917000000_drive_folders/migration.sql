-- Google Drive Integration (Module 6): per-phase folder mapping.
-- `projects.drive_folder_id` holds the project root; this table holds the
-- 7 phase subfolder IDs so uploads can resolve the target without a Drive
-- search on every request. Additive and idempotent.

CREATE TABLE IF NOT EXISTS drive_folders (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_id uuid NOT NULL REFERENCES project_phases(id) ON DELETE CASCADE,
  drive_folder_id varchar(255) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, phase_id)
);

CREATE INDEX IF NOT EXISTS drive_folders_phase_idx ON drive_folders (phase_id);
