-- Consolidate authentication on PostgreSQL and persist refresh-token lifecycle state.
-- Raw JWTs are never stored; only hashes and token metadata are persisted.

ALTER TABLE IF EXISTS user_roles RENAME COLUMN project_uuid TO project_id;

ALTER TABLE IF EXISTS user_roles DROP CONSTRAINT IF EXISTS user_roles_pkey;
ALTER TABLE IF EXISTS user_roles ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE IF EXISTS user_roles ALTER COLUMN id SET NOT NULL;
ALTER TABLE IF EXISTS user_roles ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE IF EXISTS user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_global_unique
  ON user_roles (user_id, role_id)
  WHERE project_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_project_unique
  ON user_roles (user_id, role_id, project_id)
  WHERE project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jti uuid NOT NULL UNIQUE,
  family_id uuid NOT NULL,
  token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by_token_id uuid,
  user_agent text,
  ip_address varchar(100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens(family_id);

INSERT INTO roles (name, display_name, description)
VALUES
  ('administrator', 'Administrator', 'Institution-wide administration'),
  ('project_manager', 'Project Manager', 'Manages assigned projects and phases'),
  ('team_member', 'Team Member', 'Works on assigned project deliverables'),
  ('document_approver', 'Document Approver', 'Reviews and approves project documents')
ON CONFLICT (name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description;

INSERT INTO permissions (name, module, description)
VALUES
  ('user:manage', 'access_control', 'Manage institutional user accounts'),
  ('role:manage', 'access_control', 'Assign roles and permissions'),
  ('project:view', 'project_management', 'View permitted projects'),
  ('project:manage', 'project_management', 'Create and manage projects'),
  ('phase:manage', 'phase_engine', 'Manage project phase progression'),
  ('document:view', 'document_management', 'View project documents'),
  ('document:upload', 'document_management', 'Upload project documents'),
  ('document:delete', 'document_management', 'Delete owned project documents'),
  ('document:approve', 'document_management', 'Review and approve documents')
ON CONFLICT (name) DO NOTHING;
