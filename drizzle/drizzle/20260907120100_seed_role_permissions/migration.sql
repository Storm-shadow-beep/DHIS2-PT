-- Seed the permission grants used by the authorization middleware.
-- The role and permission rows are created by the authentication migrations;
-- this migration only connects them and is safe to apply repeatedly.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p ON (
  (r.name = 'administrator')
  OR (r.name = 'project_manager' AND p.name IN (
    'project:view',
    'project:manage',
    'phase:manage',
    'document:view',
    'document:upload',
    'document:delete'
  ))
  OR (r.name = 'team_member' AND p.name IN (
    'project:view',
    'document:view',
    'document:upload',
    'document:delete'
  ))
  OR (r.name = 'document_approver' AND p.name IN (
    'project:view',
    'document:view',
    'document:approve'
  ))
)
ON CONFLICT (role_id, permission_id) DO NOTHING;
