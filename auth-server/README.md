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
    │   └── auth.controller.ts
    ├── routes/
    │   └── auth.routes.ts    # /api/auth
    ├── middleware/
    │   ├── auth.middleware.ts      # protect (JWT verify -> req.user)
    │   ├── authorize.middleware.ts # RBAC: Admin, Project Manager, Team Member, Client
    │   └── error.middleware.ts
    ├── services/
    │   ├── auth.service.ts
    │   └── token.service.ts
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
| POST | /api/auth/refresh | public (httpOnly cookie) |
| POST | /api/auth/logout | public with refresh cookie |
| POST | /api/auth/forgot-password | public |
| POST | /api/auth/reset-password | public |
| GET | /api/auth/me | private |
| POST | /api/auth/register | public; creates Team Member |
| GET | /api/health | public |

## Token model

- Access credentials are short-lived JWTs returned by login and refresh.
- Refresh credentials are JWTs stored in an HTTP-only cookie.
- PostgreSQL stores only refresh-token hashes/JTIs and lifecycle metadata for rotation, revocation, and reuse detection.
- Raw JWTs are never stored in the database.

## Setup
```bash
cp .env.example .env
# edit JWT_SECRET etc.
npm install
npm run dev   # nodemon + ts-node
npm run build # tsc -> dist/
npm start     # node dist/index.js
```
