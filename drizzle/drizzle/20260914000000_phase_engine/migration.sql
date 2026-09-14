-- Phase Engine (Module 3) hardening. All statements are idempotent.
--
-- Covers:
--   1. project_phases (project_id, sequence) uniqueness, which the linear
--      complete/reopen state machine relies on (one row per sequence step).
--   2. started_at / completed_at lifecycle columns, for databases built by
--      drizzle-kit push from an interim schema missing them.

CREATE UNIQUE INDEX IF NOT EXISTS project_phases_project_sequence_unique
  ON project_phases (project_id, sequence);

ALTER TABLE IF EXISTS project_phases
  ADD COLUMN IF NOT EXISTS started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;
