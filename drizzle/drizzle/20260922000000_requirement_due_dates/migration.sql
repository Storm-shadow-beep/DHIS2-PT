-- Requirement due dates (Dashboard overdue support). All statements are idempotent.
--
-- Adds nullable `due_date` (date) to per-project `document_categories` and to
-- the global `document_requirement_templates` so PMs can set deadlines and
-- the dashboard can compute outstanding vs overdue from live data instead of
-- mock values. Existing rows keep NULL (no due date) until set.

ALTER TABLE IF EXISTS document_categories
  ADD COLUMN IF NOT EXISTS due_date date;

ALTER TABLE IF EXISTS document_requirement_templates
  ADD COLUMN IF NOT EXISTS due_date date;
