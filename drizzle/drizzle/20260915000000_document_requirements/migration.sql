-- Document Requirements (Module 4). All statements are idempotent.
--
-- Covers:
--   1. document_requirement_templates: global per-phase template of expected
--      document categories (seeded below). Per-project copies live in
--      document_categories (one row per project phase), created when a
--      project is created / backfilled / ensured.
--   2. document_categories hardening: sort_order + updated_at lifecycle
--      columns and (phase_id, name) uniqueness, which the requirements
--      service relies on to prevent duplicate requirement names per phase.

CREATE TABLE IF NOT EXISTS document_requirement_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_sequence integer NOT NULL,
  phase_name varchar(50) NOT NULL,
  name varchar(150) NOT NULL,
  is_mandatory boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS document_requirement_templates_phase_name_unique
  ON document_requirement_templates (phase_sequence, name);

ALTER TABLE IF EXISTS document_categories
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS document_categories_phase_name_unique
  ON document_categories (phase_id, name);

-- Standard template: expected document categories per phase.
-- is_mandatory marks compliance-critical requirements; optional rows guide
-- PMs without blocking completion percentages.

INSERT INTO document_requirement_templates (phase_sequence, phase_name, name, is_mandatory, sort_order)
VALUES
  (1, 'Initiation', 'Project Charter', true, 1),
  (1, 'Initiation', 'Stakeholder Register', true, 2),
  (1, 'Initiation', 'Business Case', false, 3),
  (2, 'Requirements Analysis', 'Software Requirements Specification (SRS)', true, 1),
  (2, 'Requirements Analysis', 'Use Case Document', true, 2),
  (2, 'Requirements Analysis', 'Requirements Traceability Matrix', false, 3),
  (3, 'System Design', 'System Design Document (SDD)', true, 1),
  (3, 'System Design', 'Database Design Document', true, 2),
  (3, 'System Design', 'API Specification', false, 3),
  (4, 'Development', 'Module Completion Report', true, 1),
  (4, 'Development', 'Code Review Checklist', false, 2),
  (4, 'Development', 'Integration Test Plan', false, 3),
  (5, 'Testing & UAT', 'Test Plan', true, 1),
  (5, 'Testing & UAT', 'UAT Report', true, 2),
  (5, 'Testing & UAT', 'Defect Log', false, 3),
  (6, 'Deployment', 'Deployment Plan', true, 1),
  (6, 'Deployment', 'User Manual', true, 2),
  (6, 'Deployment', 'Release Notes', false, 3),
  (7, 'Closure', 'Project Closure Report', true, 1),
  (7, 'Closure', 'Final Acceptance Sign-off', true, 2),
  (7, 'Closure', 'Lessons Learned', false, 3)
ON CONFLICT (phase_sequence, name) DO NOTHING;
