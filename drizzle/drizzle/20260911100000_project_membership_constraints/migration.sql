-- Backfill constraints required by the canonical schema
-- (auth-server/src/db/schema.ts) for databases built before the migration
-- journal existed (e.g. via drizzle-kit push). All statements are idempotent.
--
-- Covers:
--   1. user_roles.project_id -> projects(id) ON DELETE CASCADE
--      (local DBs built by push carry this under the legacy name
--      user_roles_project_uuid_projects_id_fkey; fresh DBs get the
--      canonical name below)
--   2. project_members (project_id, user_id) uniqueness, which
--      replaceProjectMembers relies on (reactivate-instead-of-insert)
--   3. user_roles global/project uniqueness from
--      20260903120000_consolidate_auth, missing on push-built DBs

--   0. projects.project_manager_id -> project_manager rename, for DBs
--      built by drizzle-kit push from an interim schema (the migration
--      chain and all snapshots use project_manager)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'project_manager_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'project_manager'
  ) THEN
    ALTER TABLE projects RENAME COLUMN project_manager_id TO project_manager;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'user_roles'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'user_roles'::regclass AND attname = 'project_id')
      ]
  ) THEN
    ALTER TABLE user_roles
      ADD CONSTRAINT user_roles_project_id_projects_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS project_members_project_user_unique
  ON project_members (project_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_global_unique
  ON user_roles (user_id, role_id)
  WHERE project_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_project_unique
  ON user_roles (user_id, role_id, project_id)
  WHERE project_id IS NOT NULL;
