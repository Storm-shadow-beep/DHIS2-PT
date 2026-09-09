# Authentication and Authorization Progress

**Last updated:** 2026-09-09  
**Project:** DHIS2-PT  
**Current milestone:** Authentication and authorization foundation  
**Next milestone:** Module 2 project, document, phase, and report routes

## Current position

The project has moved beyond the initial authentication implementation and now
has a centralized authorization foundation for Module 2. Authentication is
implemented in `auth-server/src` using PostgreSQL, Drizzle, password
verification, email OTP, access JWTs, rotating refresh tokens, and protected
session endpoints.

The backend authorization layer is database-authoritative. It loads the
current user's global roles and permissions from PostgreSQL for protected
requests. Permissions returned to the frontend are for user-interface
navigation and visibility only; they are not trusted as backend security
decisions.

The system is **not yet ready to call Module 2 authorization complete** because
the project and document guards have not been wired into the feature routes,
the authorization migration has not been applied to the deployment database,
and database-backed protected-route integration tests are still missing.

## Completed authentication work

- Public registration creates Team Member accounts only.
- Password login validates credentials and starts the email OTP flow.
- OTP codes are HMAC-hashed, expire, have attempt limits, and are rate-limited
  by email and IP address.
- OTP verification issues a short-lived access JWT and a rotating refresh JWT.
- Refresh tokens are stored as hashes and support rotation, reuse detection,
  family revocation, and `rememberMe` expiry.
- Password reset tokens are hashed, single-use, time-limited, and revoke active
  refresh sessions after a successful reset.
- Password changes verify the current password and revoke active refresh
  sessions.
- Inactive users are rejected by the protected-user middleware.
- `/api/auth/me` reloads the current active user from the database.
- Public registration cannot assign Administrator or Project Manager roles.

## Completed authorization work

### Database and permissions

- Added centralized role and permission definitions.
- Added Module 2 capabilities:
  - `project:create`
  - `project:member:manage`
  - `project:publish`
  - `report:view`
  - `report:create`
- Added project membership and project report schema definitions.
- Added the authorization foundation migration:
  `drizzle/drizzle/20260909103000_authorization_foundation/migration.sql`.
- Added role-to-permission seed mappings for the new capabilities.

### Canonical user and session representation

`SafeUser` now includes:

```text
id
fullName
email
role
roleDisplayName
roles
permissions
```

Database-derived `permissions[]` is returned by registration, password-login
identity loading, OTP identity loading, and `/api/auth/me`.

The frontend `UserSession.permissions` field is required. The frontend no
longer reconstructs permissions from a hardcoded role-permission map. It uses
the server-provided permissions for UX decisions while the backend performs
its own database lookup for every protected authorization decision.

### Centralized policy and guards

The following backend components are available:

- `auth-server/src/services/authorization.policy.ts`
  - Pure policy rules for administrators, project managers, members,
    document owners, and document approvers.
- `auth-server/src/services/authorization.service.ts`
  - Database-backed loading of roles and permissions.
  - Project, member, manager, and document access assertions.
  - UUID validation and non-leaking unauthorized-resource responses.
- `auth-server/src/middleware/authorization.middleware.ts`
  - Reusable Express guards for project and document access.
- `auth-server/src/middleware/permission.middleware.ts`
  - Database-backed global permission checks.
- `auth-server/src/middleware/authorize.middleware.ts`
  - Compatibility exports for authorization middleware.

The intended route-level guards are:

```text
requireAuthenticatedUser
requirePermission(permission)
requireProjectAccess(projectId, accessType)
requireProjectManager(projectId)
requireProjectMember(projectId)
requireDocumentAccess(documentId, accessType)
```

### Audit logging

The project now records:

- Denied global permission checks.
- Administrative user activation and deactivation.
- Administrative global-role assignment and removal.

Audit events for project creation and updates, membership changes, document
uploads/deletions/reviews, phase changes, publishing, and report mutations
still need to be added while Module 2 routes are implemented.

### Legacy implementation cleanup

The obsolete MySQL authentication implementation was deleted:

- `vite-2/src/assets/components/controllers/authController.js`
- `vite-2/src/assets/components/routes/authRoutes.js`

The active authentication implementation is `auth-server/src`.

## Validation completed

The following checks currently pass:

- Auth-server TypeScript build.
- Auth-server authorization policy tests.
- Frontend production build.
- Git whitespace/diff validation.
- Repository search confirming the deleted legacy files have no active imports.

The current policy test coverage includes:

- Administrator bypass.
- Project-manager ownership and management scope.
- Member access restrictions.
- Document deletion ownership and manager authorization.

## Remaining work before or during Module 2

### Required before relying on the new authorization schema

1. Apply `20260909103000_authorization_foundation` to the target PostgreSQL
   database.
2. Verify the migration-created tables, permissions, and role grants.
3. Perform the controlled administrator bootstrap documented in
   `AUTHENTICATION_AUTHORIZATION_STATUS.md`.

### Required while implementing Module 2 routes

1. Implement project controllers and routes.
2. Implement project membership management.
3. Implement phase configuration and publishing routes.
4. Implement document upload, listing, versioning, deletion, and approval
   routes.
5. Implement project report routes.
6. Attach the centralized guards to every protected route.
7. Add audit events for feature mutations.
8. Add database-backed integration tests for authentication, permissions,
   project scope, membership, document ownership, and cross-project access.

### Remaining authentication hardening

These items are not blockers for starting the Module 2 route implementation,
but should be addressed according to the deployment threat model:

- Immediate access-token invalidation after logout, deactivation, or password
  change.
- Failed-password counters and account lockout.
- Email verification for newly registered accounts.
- Authentication-event audit coverage for login, OTP, refresh, logout, and
  password reset.
- Cleanup/retention jobs for expired OTP challenges and revoked refresh tokens.
- Replacement of duplicated hand-written validation with shared schemas.

## Recommended resume sequence

1. Apply and verify the authorization foundation migration.
2. Create or promote the initial Administrator through the controlled bootstrap
   procedure.
3. Build the project routes using `requireAuthenticatedUser`,
   `requirePermission`, and the project guards.
4. Build document, phase, approval, and report routes using the same centralized
   authorization services.
5. Add route/database integration tests as each route group is implemented.
6. Wire feature mutation audit events.
7. Update the API specification after the Module 2 endpoint contracts settle.

## Decision status

It is appropriate to continue with Module 2 now, provided that every new
controller uses the existing centralized authorization services and that the
authorization migration is applied before the routes are deployed. Do not
duplicate role or ownership checks inside individual controllers, and do not
use frontend permissions or JWT claims as a substitute for backend database
authorization.
