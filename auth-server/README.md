# DHIS2-PT Auth Backend (TypeScript)

Express.js + TypeScript backend for **Auth & Authorization** (Module 1) - foundational for all other modules per `Module Breakdown.md`.

This is the project's single authentication and authorization service. PostgreSQL is the only identity store; the legacy MySQL/Vite authentication server is retired.

## Structure
```
backend/
├── tsconfig.json
├── nodemon.json
├── package.json
├── .env.example
└── src/
    ├── index.ts              # entry
    ├── app.ts                # express app, middleware, routes
    ├── db/
    │   ├── index.ts             # PostgreSQL pool and Drizzle client
    │   └── schema.ts            # auth and refresh-token tables
    ├── controllers/
    │   ├── auth.controller.ts
    │   ├── admin-users.controller.ts   # /api/admin user list/status/roles
    │   ├── projects.controller.ts      # /api/projects + /api/users
    │   ├── project-members.controller.ts
    │   └── phases.controller.ts        # /api/projects/:projectId/phases (Module 3)
    ├── routes/
    │   ├── auth.routes.ts    # /api/auth
    │   ├── admin.routes.ts   # /api/admin (protect + requirePermission)
    │   ├── project.routes.ts # /api/projects (permission + project guards, incl. phases)
    │   └── project-users.routes.ts # /api/users (assignable users)
    ├── middleware/
    │   ├── auth.middleware.ts      # protect (JWT verify -> req.user)
    │   ├── authorize.middleware.ts # RBAC compat + re-exports guards
    │   ├── permission.middleware.ts # requirePermission (DB-backed global check)
    │   ├── authorization.middleware.ts # requireProjectAccess/Manager/Member, requireDocumentAccess
    │   └── error.middleware.ts
    ├── services/
    │   ├── auth.service.ts
    │   ├── email.service.ts
    │   ├── otp.service.ts
    │   ├── token.service.ts
    │   ├── authorization.service.ts  # DB-backed assertions, UUID normalize, 404-masking
    │   ├── authorization.policy.ts   # pure canAccessProject / canAccessDocument
    │   ├── project.service.ts        # projects + auto-generates 7 phases on create (Module 3)
    │   ├── phase.service.ts          # Phase Engine: list/ensure/complete/reopen (Module 3)
    │   ├── phase.constants.ts        # canonical 7 phases + pure transition rules (no db)
    │   ├── user-management.service.ts
    │   └── audit.service.ts          # authorization.denied + admin mutation events
    ├── types/
    │   ├── auth.types.ts     # Role, User, JwtPayload
    │   └── express.d.ts      # augments Express.Request.user
    ├── config/env.ts
    └── utils/asyncHandler.ts
```

## Roles
- **Administrator** - institution-wide administration
- **Project Manager** - manages assigned projects and phases
- **Team Member** - works on assigned project deliverables
- **Document Approver** - reviews and approves project documents

Public registration creates a `Team Member` account. Privileged role assignment remains an administrative operation.

## Endpoints
| Method | Path | Access |
|--------|------|--------|
| POST | /api/auth/login | public |
| POST | /api/auth/verify-otp | public; challenge required |
| POST | /api/auth/resend-otp | public; challenge required |
| POST | /api/auth/refresh | public (httpOnly cookie) |
| POST | /api/auth/logout | public with refresh cookie |
| POST | /api/auth/forgot-password | public |
| POST | /api/auth/reset-password | public |
| POST | /api/auth/change-password | private (`protect`) |
| GET | /api/auth/me | private |
| PATCH | /api/auth/me | private; update display name and/or profile picture (display name once per three months; picture anytime) |
| POST | /api/auth/logout-other-sessions | private; revoke all refresh sessions except the current cookie session |
| POST | /api/auth/register | public; creates Team Member |
| GET | /api/health | public |
| GET | /api/admin/users | private; `user:manage` |
| PATCH | /api/admin/users/:userId/status | private; `user:manage` |
| POST | /api/admin/users/:userId/roles | private; `role:manage` |
| DELETE | /api/admin/users/:userId/roles/:roleName | private; `role:manage` |
| GET | /api/projects | private; `project:view` (permitted projects only) |
| POST | /api/projects | private; `project:create` |
| GET | /api/projects/:projectId | private; `project:view` + project access |
| PATCH | /api/projects/:projectId | private; `project:manage` + project-manager access |
| GET | /api/projects/:projectId/members | private; `project:view` + project access |
| PUT | /api/projects/:projectId/members | private; `project:member:manage` + project-manager access |
| GET | /api/users | private; `project:manage` (assignable users) |
| GET | /api/projects/:projectId/phases | private; `project:view` + project access |
| GET | /api/projects/:projectId/phases/current | private; `project:view` + project access |
| POST | /api/projects/:projectId/phases/ensure | private; `phase:manage` + project-manager access (backfills 7 phases for pre-Phase-Engine projects) |
| PATCH | /api/projects/:projectId/phases/:phaseId | private; `phase:manage` + project-manager access; `{ action: 'complete' \| 'reopen' }` |

New projects auto-generate the 7 standard phases
(Initiation → Requirements Analysis → System Design → Development →
Testing & UAT → Deployment → Closure); sequence 1 starts `current`.
Completion is linear: only the `current` phase can be completed, and only
the most recently completed phase can be reopened.

Document/publish/report routes are not yet implemented — policy helpers
(`canAccessDocument`, `requireDocumentAccess`) exist but have no routes.
See `../docs/AUTHENTICATION_AUTHORIZATION_CURRENT.md §3`.

## Token model

- Access credentials are short-lived JWTs returned by login and refresh.
- Refresh credentials are JWTs stored in an HTTP-only cookie.
- PostgreSQL stores only refresh-token hashes/JTIs and lifecycle metadata for rotation, revocation, and reuse detection.
- Raw JWTs are never stored in the database.

## Email OTP login

Every password login creates a six-digit email challenge. Access and refresh JWTs
are issued only after the challenge is verified. OTP codes are generated with a
cryptographically secure source and stored as keyed hashes; codes are never
logged or returned by the API.

Configure a verified Resend sender with `OTP_EMAIL_PROVIDER=resend`,
`RESEND_API_KEY`, and `RESEND_FROM_EMAIL`. For local testing, use
`OTP_EMAIL_PROVIDER=smtp` with a local SMTP sink such as Mailpit. Mailpit can
be started with `docker run --name dhis2-pt-mailpit -p 1025:1025 -p 8025:8025
axllent/mailpit`; open `http://localhost:8025` to inspect messages. A challenge
expires after 10 minutes, allows five
verification attempts, and can be resent once per minute. Each email is limited
to five sends in a 15-minute window. Resend delivery failures block login.

For a development-only test without Docker or external email, set
`OTP_EMAIL_PROVIDER=file`. OTP messages are written to the ignored
`auth-server/.local-mailbox` directory. This provider is rejected when
`NODE_ENV=production`.

Expired, consumed, superseded, or failed challenges may be removed by a
scheduled retention job; the service does not need to retain their code values.

## Setup
```bash
cp .env.example .env
# edit JWT_SECRET, Resend, and OTP settings
npm install
npm run dev   # nodemon + ts-node
npm run build # tsc -> dist/
npm start     # node dist/index.js
```
