-- Add explicit project membership and report ownership relationships used by
-- the authorization policy. Existing project/document tables are preserved.

CREATE TABLE IF NOT EXISTS project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES users(id),
  removed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS project_members_project_user_unique
  ON project_members (project_id, user_id);

CREATE INDEX IF NOT EXISTS project_members_user_active_idx
  ON project_members (user_id, is_active);

CREATE TABLE IF NOT EXISTS project_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES users(id),
  title varchar(200) NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_reports_project_created_idx
  ON project_reports (project_id, created_at);

INSERT INTO permissions (name, module, description)
VALUES
  ('project:create', 'project_management', 'Create projects'),
  ('project:member:manage', 'project_management', 'Assign and remove project members'),
  ('project:publish', 'project_management', 'Publish project configuration'),
  ('report:view', 'reporting', 'View permitted project reports'),
  ('report:create', 'reporting', 'Submit reports for permitted projects')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p ON (
  r.name = 'administrator'
  OR (r.name = 'project_manager' AND p.name IN (
    'project:view',
    'project:create',
    'project:manage',
    'project:member:manage',
    'project:publish',
    'phase:manage',
    'document:view',
    'document:upload',
    'document:delete',
    'report:view',
    'report:create'
  ))
  OR (r.name = 'team_member' AND p.name IN (
    'project:view',
    'document:view',
    'document:upload',
    'document:delete',
    'report:view',
    'report:create'
  ))
  OR (r.name = 'document_approver' AND p.name IN (
    'project:view',
    'document:view',
    'document:approve',
    'report:view'
  ))
)
ON CONFLICT (role_id, permission_id) DO NOTHING;
