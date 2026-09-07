# Authentication & Authorization — Implementation Status

**Date:** 2026-09-07
**Scope:** `auth-server/src/**` (Express + TypeScript + Drizzle + PostgreSQL) and `vite-2/src/**/services/authApi.ts`, `App.tsx`, `LoginPage.tsx`, `Registration.tsx`
**Entry point reviewed:** `auth-server/src/routes/auth.routes.ts`

---

## 1. What is implemented (done)

### 1.1 Auth flows / endpoints (`POST /api/auth/*`, `GET /api/auth/me`)

| Endpoint | File | Status |
|---|---|---|
| `POST /register` — public, creates **Team Member only** | `services/auth.service.ts:42`, `controllers/auth.controller.ts:27` | Done |
| `POST /login` — verify password → issue OTP challenge, no tokens yet | `services/auth.service.ts:103`, `services/otp.service.ts:185`, `controllers/auth.controller.ts:43` | Done |
| `POST /verify-otp` — verify 6-digit code → issue access + refresh JWT | `services/otp.service.ts:217`, `controllers/auth.controller.ts:65` | Done |
| `POST /resend-otp` — cooldown-gated re-issue | `services/otp.service.ts:190`, `controllers/auth.controller.ts:90` | Done |
| `POST /refresh` — rotate refresh token from httpOnly cookie | `services/token.service.ts:89`, `controllers/auth.controller.ts:104` | Done |
| `POST /logout` — revoke refresh `jti`, clear cookie | `services/token.service.ts:153`, `controllers/auth.controller.ts:118` | Done |
| `POST /forgot-password` — generic response (no enumeration) | `services/auth.service.ts:159`, `controllers/auth.controller.ts:125` | Done |
| `POST /reset-password` — single-use hashed token | `services/auth.service.ts:193`, `controllers/auth.controller.ts:131` | Done |
| `POST /change-password` — protected password change and refresh-session revocation | `services/auth.service.ts`, `controllers/auth.controller.ts`, `routes/auth.routes.ts` | Done |
| `GET /me` — `protect` → `getUserById` | `middleware/auth.middleware.ts:5`, `controllers/auth.controller.ts:137` | Done |
| `GET /api/health` | `app.ts:26` | Done |
| `GET/PATCH/POST/DELETE /api/admin/users*` — protected permission-based user administration | `routes/admin.routes.ts`, `controllers/admin-users.controller.ts` | Done |

### 1.2 Registration & password policy

- Trims/normalizes email, validates format, checks duplicate → `409`.
- Password rule (backend + registration page aligned): min 8 chars, letters + numbers, `confirmPassword` match.
- `bcrypt` with configurable salt rounds (default 12).
- Transactional insert: `users` + `user_roles(team_member, projectId=NULL)`.
- Returns `SafeUser { id, fullName, email, role, roleDisplayName, roles }` — never returns hash.

### 1.3 Two-step login (password + email OTP)

- `verifyLoginCredentials`: global-role lookup (`user_roles.projectId IS NULL`) returning all global roles, `isActive` check, generic `401 Invalid email or password` (no enumeration), `bcrypt.compare`.
- `otp.service.ts`:
  - 6-digit code from `crypto.randomInt`, stored as **HMAC-SHA256(challengeId:code)** with dedicated `OTP_HMAC_SECRET`; never logged/returned.
  - 10 min expiry, 5 max attempts, 60 s resend cooldown, 5 sends / 15 min window per email **and** per IP.
  - Old challenges for user superseded in transaction; verify uses `SELECT ... FOR UPDATE` + `timingSafeEqual`.
  - Consumed / superseded / expired / delivery-failed challenges rejected with typed `OtpError { code, statusCode, retryAfterSeconds }` surfaced via `error.middleware.ts` (`code`, `Retry-After` header).
  - Email via `email.service.ts`: `resend` | `smtp` (Mailpit) | `file` (dev-only `.local-mailbox`, blocked in production). Delivery failure marks `deliveryFailedAt` and returns `503 OTP_DELIVERY_FAILED`.

### 1.4 Token model (`services/token.service.ts`)

- Access JWT: 15 m default (`JWT_EXPIRES_IN`), refresh JWT: 7 d default (`JWT_REFRESH_EXPIRES_IN`), 30 d with `rememberMe`.
- Claims: `sub, email, role, roles, fullName, jti, familyId, tokenType: access|refresh`, `issuer: dhis2-pt-auth`, `audience: dhis2-pt`.
- Refresh stored as **SHA-256 hash + jti + familyId + expiry + UA/IP** in `refresh_tokens`; raw JWT never stored.
- Rotation: each `refresh` issues new token in same `familyId`, revokes old (`revokedAt`, `replacedByTokenId`). Reuse of revoked token revokes **entire family** → forces re-login.
- Refresh cookie (`controllers/auth.controller.ts:8`): `httpOnly`, `path: /api/auth`, `sameSite`/`secure` from env, `maxAge` 7 d / 30 d.
- `verifyAccessToken` enforces `tokenType === 'access'`, `sub`, `jti`; expired → `401 TOKEN_EXPIRED`.

### 1.5 Password reset

- `crypto.randomBytes(32)` raw token, **SHA-256 hash** stored in `password_reset_tokens`, 60 min expiry (configurable).
- New request invalidates prior unused tokens; reset is transactional: update password → mark token `usedAt` → revoke **all** active refresh tokens for user.
- Reset link: `${FRONTEND_URL}/reset-password?token=...`, sent via same email provider.

### 1.6 Middleware that exists

- `protect` (`middleware/auth.middleware.ts`): extracts `Bearer` token, `verifyAccessToken`, re-loads user via `getUserById` (rejects inactive / missing), sets `req.user: JwtPayload` (see `types/express.d.ts`).
- `authorize(...allowedRoles)` (`middleware/authorize.middleware.ts`): retains role-based compatibility checks; `requirePermission(...)` (`middleware/permission.middleware.ts`) performs database-backed permission checks for protected admin routes.
- `error.middleware.ts`: `notFound` + centralized handler (`statusCode`, `code`, `retryAfterSeconds`, stack in non-prod, Joi passthrough).
- App hardening (`app.ts`): `helmet`, fail-closed configured CORS with credentials, `cookieParser`, `express.json({limit:'10mb'})`, `morgan` (non-test), and rate limits in `auth.routes.ts` for login/forgot/reset, OTP verification/resend, and registration.

### 1.7 Data model & seeds

- `auth-server/src/db/schema.ts`: `users, roles, permissions, role_permissions, user_roles (global + projectId-scoped), refresh_tokens, otp_challenges, password_reset_tokens`.
- Seed migration `drizzle/drizzle/20260903120000_consolidate_auth/migration.sql:37-58`: 4 roles (`administrator, project_manager, team_member, document_approver`) + 9 permissions (`user:manage, role:manage, project:view/manage, phase:manage, document:view/upload/delete/approve`). Unique partial indexes for global vs project role assignments.

### 1.8 Frontend (`vite-2`)

- `services/authApi.ts`: in-memory access token, `authFetch` with single-flight 401→refresh retry, `loginApi → OtpChallenge`, `verifyOtpApi`, `resendOtpApi`, `registerApi`, `getCurrentUserApi`, `logoutApi`, password-reset APIs.
- `LoginPage.tsx`: password form → OTP form (6-digit numeric, resend countdown, expiry display), `rememberMe` propagated through both steps.
- `Registration.tsx`: team-member-only copy ("New accounts start as Team Member"), matching 8-char policy.
- `AuthContext`/route guards: one shared session check via `GET /api/auth/me`, permission-aware protected routes/navigation, and structured 401/403 handling; `MainLayout` shows `fullName · role`.

---

## 2. What remains / gaps / risks

### 2.1 Authorization

1. **Project-scoped authorization is not yet wired to feature routes.** `user_roles.projectId` remains available, but no backend project/document/phase routes currently exist to attach a membership guard. The next feature APIs must require explicit project membership, with the agreed global administrator/project-manager overrides.
2. **Permission claims remain database-authoritative.** User/session responses and JWTs now carry all global roles while retaining the primary `role` compatibility field; permission checks still query the database so role changes take effect without waiting for token expiry.
3. **Administrator bootstrap remains manual.** Public registration creates only Team Members. The first administrator must be created through a controlled SQL/bootstrap procedure before the admin endpoints can be used.

### 2.2 Authentication hardening

4. **Access tokens survive logout, deactivation, and password change until expiry.** Refresh sessions are revoked immediately, but access-token denylisting or a shorter TTL/revocation version is still needed if immediate invalidation is required.
5. **No failed-password lockout.** Login is rate-limited by request, but there is no per-account failed-password counter and lockout policy.
6. **No email verification on registration.** New accounts are active immediately and can begin the password-plus-OTP flow.
7. **Logout remains refresh-cookie based and public.** This is intentional for cleanup of an expired/invalid access token, but audit-aware session logout can add `protect` where appropriate.

### 2.3 Validation, operations, and documentation

8. **Validation is still hand-rolled and duplicated.** The existing `joi` dependency is unused, and frontend/backend password rules are not fully aligned.
9. **No backend integration-test runner exists.** The auth-server currently validates through typecheck/build only.
10. **No authentication audit trail or retention job.** Login, OTP, refresh, reset, and role changes are not written to `activity_log`; expired OTP and revoked refresh rows are not automatically cleaned up.
11. **Legacy prototype remains in the tree.** `vite-2/src/assets/components/controllers/authController.js` still contains the retired MySQL auth flow and should be removed after import/build references are confirmed.
12. **API documentation is stale.** `PMS_APP_SPEC.md` still documents the old roles and `/api/login`-style paths; the new permission/admin endpoints and structured errors need to be documented.
13. **Schema ownership is not fully unified.** The auth-server schema now includes permission primary-key and refresh `remember_me` changes, but broader project/activity-log tables and project foreign keys still differ between the two schema sources.

---

## 3. Completed in this implementation pass

1. Added database-backed `requirePermission` middleware and seeded role-to-permission mappings.
2. Added protected admin user-management endpoints for listing users, activation/deactivation, and global role assignment/removal.
3. Added registration rate limiting, dedicated OTP HMAC secret configuration, production secret checks, and fail-closed CORS.
4. Persisted `rememberMe` on refresh-token rows and used it during token rotation.
5. Added protected password change with current-password verification and refresh-session revocation.
6. Added multi-role user/session claims while retaining the primary role compatibility field.
7. Added frontend session context, permission-aware route guards/navigation, structured auth API errors, and a protected administration route placeholder.

## 4. Recommended next steps

1. Apply the two new Drizzle migrations in the deployment database and perform the documented manual administrator bootstrap.
2. Add project-scoped guards when project, phase, and document backend routes are introduced.
3. Add integration tests for authentication, multi-role sessions, and permission failures.
4. Add failed-password lockout, email verification, audit logging, retention cleanup, and immediate access-token invalidation if required by the deployment threat model.
5. Remove the legacy MySQL controller and update `PMS_APP_SPEC.md` plus API documentation.

---

### Key file references

- Routes: `auth-server/src/routes/auth.routes.ts`
- Controllers: `auth-server/src/controllers/auth.controller.ts`
- Admin routes/controllers: `auth-server/src/routes/admin.routes.ts`, `auth-server/src/controllers/admin-users.controller.ts`
- Services: `auth-server/src/services/auth.service.ts`, `token.service.ts`, `otp.service.ts`, `email.service.ts`
- Middleware: `auth-server/src/middleware/auth.middleware.ts`, `authorize.middleware.ts`, `permission.middleware.ts`, `error.middleware.ts`
- Schema/seeds: `auth-server/src/db/schema.ts`, `drizzle/drizzle/20260903120000_consolidate_auth/migration.sql`, `drizzle/drizzle/20260907120100_seed_role_permissions/migration.sql`
- Frontend: `vite-2/src/assets/components/auth/`, `vite-2/src/assets/components/services/authApi.ts`, `vite-2/src/App.tsx`, `vite-2/src/assets/components/MainLayout/MainLayout.tsx`

## 5. Manual administrator bootstrap

Public registration intentionally creates only `team_member` accounts. Before using
the `/api/admin` endpoints, a trusted operator must create or promote the first
administrator after applying the auth migrations:

1. Generate a bcrypt password hash with the same cost configured by
   `BCRYPT_SALT_ROUNDS`; never place the plaintext password in SQL or source control.
2. Insert the account, or identify an existing active account:

```sql
INSERT INTO users (full_name, email, password_hash)
VALUES ('Initial Administrator', 'admin@example.org', '<bcrypt-hash>')
ON CONFLICT (email) DO NOTHING;
```

3. Assign the seeded administrator role to the account:

```sql
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.name = 'administrator'
WHERE u.email = 'admin@example.org'
ON CONFLICT DO NOTHING;
```

4. Verify the account can complete password login plus email OTP, then remove
   temporary database access used for the bootstrap and rotate any shared
   operator credentials.
