# Frontend Gaps: `vite-2` vs `VITE -UPDATED`

Compared:
- Current: `F:\important_projects\DHIS2-PT\vite-2` (frontend-only, backed by `DHIS2-PT/auth-server/`)
- Reference: `F:\important_projects\VITE -UPDATED` (note hyphen; full-stack `src/` + `server/index.js` + `database/schema.sql`)

Date: 2026-09-07. Direction agreed: keep `vite-2` RBAC + OTP auth, target existing `auth-server` (Postgres/Drizzle); port missing pages over.

## 1. Scope / repo shape

| Area | `vite-2` (current) | `VITE -UPDATED` |
|---|---|---|
| Type | Frontend-only Vite+React+TS. No `server/`, no `database/`. Backend is `DHIS2-PT/auth-server/` (Express+TS, `pg`, Drizzle) | Full-stack monorepo: `src/` + `server/index.js` (Express+`mysql2/promise`) + `database/schema.sql` + `docs/` + `PROJECT_MANAGER_PROGRESS.txt` |
| Top-level extras | `dist/`, `.env` (empty), `.env.example` | `server/`, `database/`, `docs/`, `dist/`, `.env` (populated), `PROJECT_MANAGER_PROGRESS.txt` |
| `src/` files only in `vite-2` | `assets/components/auth/AuthContext.tsx`, `auth/authorization.ts`, `auth/RouteGuards.tsx`, `PasswordReset/PasswordResetPage.tsx` | — |
| `src/` files only in UPDATED | — | `ProjectManager/ProjectManagerPage.css/.tsx`, `Reports/ReportsPage.css/.tsx`, `services/projectApi.ts` |
| Identical files | `Dashboard.tsx`, `Dashboard.css` (same), `App.css` (same), `index.css` (same) | same |
| Junk to ignore | — | macOS resource forks: `src/App.tsx._*` style `._App.tsx`, `._DocumentsPage.tsx`, `._MainLayout.tsx`, `._ProjectManagerPage.*`, `._ReportsPage.*`, `._projectApi.ts` — do not copy |

## 2. Config / env

- `package.json`:
  - UPDATED adds `mysql2@^3.24.2` + script `dev:server: node server/index.js`. Do NOT copy to `vite-2` (uses `pg` via `auth-server`).
  - Minor `@types/react 19.2.17 -> 19.2.18`, `@types/react-dom 19.2.3 -> 19.2.7`. Safe to sync or ignore.
- `vite.config.ts` proxy `/api`: `vite-2` -> `http://localhost:5000`, UPDATED -> `http://localhost:5001`. Must match actual `auth-server` port (`auth-server/src/index.ts` + `auth-server/.env`), not UPDATED's port.
- `.env`:
  - `vite-2/.env` is **empty (0 bytes)**. `vite-2/.env.example` has `DB_* / PORT=5001 / NODE_ENV` (stale, backend vars in frontend).
  - `VITE -UPDATED/.env` has `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME=pms_db + CLIENT_URL=http://localhost:5173 + PORT=5001`.
  - Do NOT copy UPDATED's MySQL `.env` into `vite-2`; source of truth is `auth-server/.env` + `drizzle/.env` (Postgres/Drizzle).
- `index.html`: functionally identical (line-ending only diff).

## 3. Auth architecture (largest gap)

### `vite-2` (keep this)
- `src/main.tsx` wraps `<App/>` in `<AuthProvider>`.
- `services/authApi.ts` (~259 lines): `ROLE_NAMES`, `PERMISSION_NAMES` (`user:manage`, `role:manage`, `project:view/manage`, `phase:manage`, `document:view/upload/delete/approve`), `UserSession{id:string, fullName, email, role, roleDisplayName?, roles[]?, permissions[]?}`, `OtpChallenge`, `AuthResponse`, `AuthApiError{status,code,retryAfterSeconds}`, in-memory `accessToken` + `authFetch()` (Bearer injection, `credentials:include`, auto `POST /api/auth/refresh` + single retry on 401).
- Endpoints: `POST /api/auth/login|verify-otp|resend-otp|refresh|logout|register|forgot-password|reset-password`, `GET /api/auth/me`.
- `auth/authorization.ts`: role aliases (`admin->administrator`, `project manager`, `team member/developer/system analyst->team_member`, etc.), server `permissions[]` wins over derived `ROLE_PERMISSIONS`, `hasRole/hasPermission/getRoleDisplayName`.
- `auth/RouteGuards.tsx`: `ProtectedRoute` (tri-state `loading/authenticated/unauthenticated`) + `PermissionRoute` (Access Denied).
- `LoginPage.tsx` (430 lines): 2-step OTP UI (`challengeId/code/expiresAt/resendAvailableAt` countdown), `rememberMe`, 429 lockout (`login_lockout_until` in localStorage, `lockoutUntil/lockoutRemaining/failedAttempts`).

### `VITE -UPDATED` (do not downgrade to this)
- No `AuthProvider`, no `auth/` dir, no OTP, no permissions.
- `services/authApi.ts` (43 lines): `UserSession{id:number, fullName, email, role:string}`, `loginApi()->POST /api/login`, `getCurrentUserApi()->GET /api/me`, `logoutApi()->POST /api/logout`. Bare `fetch(credentials:include)`.
- `App.tsx` inline `ProtectedRoute`: `fetch('/api/me').ok?` else `Navigate /`. Plus `AppErrorBoundary` (vite-2 lacks it — optional adopt).
- `LoginPage.tsx` (214 lines): single-step email+password, no OTP/lockout.
- `Registration.tsx`: role picker (`System Analyst/Project Manager/Developer/Administrator`) + direct `fetch POST /api/register {role,...}`. `vite-2` uses `registerApi({fullName,email,password,confirmPassword})` with no role.

## 4. Routing / layout

### `vite-2/src/App.tsx` (91 lines)
- Public: `/`, `/register`, `/forgot-password`, `/reset-password`.
- Protected under `<ProtectedRoute><MainLayout/></>`: `/dashboard` (`project:view`), `/projects` (`project:view`), `/documents` (`document:view`), `/reports` = placeholder `<div>Reports (Coming Soon)</div>`, `/settings` = placeholder, `/admin` (`user:manage`) = placeholder. `* -> /`.

### `UPDATED/src/App.tsx` (~111 lines)
- Public: `/`, `/register` only.
- Protected: `/dashboard`, `/project-manager` (real), `/projects`, `/documents`, `/reports` (real), `/settings` placeholder. No `/forgot-password`, `/reset-password`, `/admin`.

### `MainLayout`
- `vite-2` (102 lines): `useAuth()` + `signOut()` (800ms delayed `navigate('/')`), nav gated by `hasPermission` (`Dashboard/Projects/Documents[only if ?projectId on /projects|/documents]/Reports/Settings/Administration`), footer `user.fullName · getRoleDisplayName(user)` + Drive card.
- UPDATED (116 lines): self-`fetch('/api/me')` + `fetch POST /api/logout`, nav ungated except `Manager workspace (/project-manager)` iff `role==='Project Manager'` and `Documents` iff `?projectId`. No `Administration`.

## 5. Page-level gaps

- `ProjectsPage.tsx` (680 vs 700 lines) / `DocumentsPage.tsx` (523 vs 583 lines): same seed-data skeleton, diverged logic. UPDATED imports `getProjectsApi` from `projectApi.ts` (live data); `vite-2` static/mock (`DocumentsPage` also uses `useAuth()->currentUserName`).
- `services/projectApi.ts` (UPDATED only): generic `request<T>(credentials:include)` + `getProjectsApi GET /api/projects`, `getUsersApi GET /api/users`, `getProjectPhasesApi GET /api/projects/:id/phases`, `updatePhaseRequirementsApi PATCH .../phases/:phid {requiredDocuments}`, `createProjectApi POST /api/projects {name,description,memberIds}`, `updateProjectApi PATCH /api/projects/:id`, `updateProjectMembersApi PUT .../members {userIds}`, `publish/unpublish POST .../publish|unpublish`, `getReportsApi GET /api/reports`, `submitReportApi POST /api/reports {projectId,title,body}`. `vite-2` has none of this — must be re-created on `authFetch`.
- `ProjectManagerPage.tsx` + `ReportsPage.tsx` (UPDATED only): depend on above contracts + `role==='Project Manager'` gates (`getCurrentUserApi()` gate + `navigate('/dashboard')`, `isManager` composer). Must convert to `hasPermission` + `useAuth`.
- The obsolete `controllers/authController.js` + `routes/authRoutes.js` MySQL implementation was removed. The active frontend uses `auth-server/src/` (JWT/OTP) at runtime.
- `server/index.js` (UPDATED): `GET /api/health|me|users|projects|projects/:id/phases|projects/:id/documents|reports`, `POST /api/register|login|logout|projects|projects/:id/publish|unpublish|projects/:id/documents|reports`, `PATCH /api/projects/:id|.../phases/:phaseId|documents/:id/review`, `PUT /api/projects/:id/members`, with `requireAuth/requireManager` + `authLimiter 10/15m`. `auth-server` currently only has `auth.routes.ts` + `admin.routes.ts` — all project/report routes are missing and must be built with Drizzle/Postgres + `permission.middleware` (cannot copy `server/index.js` verbatim: MySQL vs `pg`, cookie `remember_me` vs JWT+refresh, no OTP).

## 6. What to address to make `vite-2` similar (keeping RBAC+OTP, targeting `auth-server`)

1. **Backend first**: port UPDATED `server/index.js` routes to `auth-server` (new Drizzle tables from `database/schema.sql` translated MySQL->Postgres, controllers/services/routes, permission wiring). Until then, ported pages have no live endpoints.
2. **New `services/projectApi.ts` in `vite-2`** built on `authFetch` (not bare `fetch`), paths/DTOs aligned to new backend; reconcile `id: number (UPDATED) vs string (vite-2)`.
3. **Copy `ProjectManager/*`, `Reports/*`** (excluding `._*`), rewrite `fetch('/api/me')` -> `useAuth()`, `role==='Project Manager'` -> `hasPermission(...PROJECT_MANAGE / PROJECT_VIEW)`, logout -> `signOut()`.
4. **Merge `App.tsx`**: add `/project-manager` + real `/reports`, keep `/forgot-password|reset-password|admin` + `PermissionRoute` wrappers + `routeTitles`; optionally adopt `AppErrorBoundary`.
5. **Merge `MainLayout.tsx`**: add Manager link (permission-gated), keep `Administration` + conditional Documents nav + `getRoleDisplayName` footer; do not overwrite with UPDATED's version.
6. **Registration**: keep `registerApi` contract unless `auth-server` is extended to accept `role`; do not copy UPDATED's `fetch('/api/register')`.
7. **Config**: set `vite.config.ts` proxy + frontend env to `auth-server` port; ignore UPDATED's `mysql2`/`dev:server`/MySQL `.env`; normalize CRLF/LF on copied files; skip identical `Dashboard/App.css/index.css`.
8. **Verify**: `tsc -b && vite build`, smoke-test `/project-manager` + `/reports` as administrator/project_manager/team_member/document_approver.
