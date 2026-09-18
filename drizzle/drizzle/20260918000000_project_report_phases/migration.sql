ALTER TABLE project_reports
  ADD COLUMN IF NOT EXISTS phase_id uuid;

UPDATE project_reports report
SET phase_id = phase.id
FROM project_phases phase
WHERE report.phase_id IS NULL
  AND phase.project_id = report.project_id
  AND phase.sequence = (
    SELECT MIN(candidate.sequence)
    FROM project_phases candidate
    WHERE candidate.project_id = report.project_id
  );

ALTER TABLE project_reports
  ALTER COLUMN phase_id SET NOT NULL;

ALTER TABLE project_reports
  ADD CONSTRAINT project_reports_phase_id_fkey
  FOREIGN KEY (phase_id) REFERENCES project_phases(id) ON DELETE CASCADE;
