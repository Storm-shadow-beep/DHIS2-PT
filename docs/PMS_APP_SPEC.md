# PMS Application Specification and Feature Guide

This document is intended as a working blueprint for the current front-end application so the backend can be connected later without losing the original product intent.

## 1. Project overview

This is a React + Vite TypeScript application for a project management system focused on a single institution. The app supports:

- user authentication (login and registration)
- a shared sidebar layout for the protected app
- project tracking and phase visibility
- document management tied to projects and project phases
- file upload and delete behavior based on the document owner
- local persistence using browser localStorage while the app remains front-end only

The app currently behaves like a working prototype, not a fully server-backed multi-user system.

## Active backend contract — Module 2

The active backend is `auth-server`, not the legacy prototype server described
by older sections of this document. Project Management endpoints use UUIDs,
bearer access tokens, database-backed permissions, and project-scoped guards.

| Method | Endpoint | Access |
| --- | --- | --- |
| `GET` | `/api/projects` | Authenticated users with `project:view`; returns permitted projects |
| `POST` | `/api/projects` | `project:create`; creates a project owned by the authenticated manager unless an administrator assigns another manager |
| `GET` | `/api/projects/:projectId` | `project:view` plus access to the project |
| `PATCH` | `/api/projects/:projectId` | `project:manage` plus project-manager access |
| `GET` | `/api/projects/:projectId/members` | `project:view` plus access to the project |
| `PUT` | `/api/projects/:projectId/members` | `project:member:manage` plus project-manager access |

Project creation and updates support `name`, `description`, `client`,
`projectManagerId`, `status` (`active`, `completed`, or `on-hold`),
`currentPhase`, ISO dates, and `driveFolderId`. Membership replacement accepts
`{ "userIds": ["<uuid>"] }`. The backend validates UUIDs and dates, rejects
inactive members, retains removed memberships as history, and records project
and membership mutations in the activity log.

The phase configuration, document, report, and Google Drive endpoints described
elsewhere remain separate follow-on modules and are not part of the current
Project Management route set.

## 2. Core routes and page structure

The main router is defined in `src/App.tsx`.

Routes:

- `/` → Login page
- `/register` → Registration page
- `/dashboard` → Dashboard page inside protected layout
- `/projects` → Projects page inside protected layout
- `/documents` → Documents page inside protected layout
- `/reports` → placeholder page
- `/settings` → placeholder page

Protected routing logic:

- `ProtectedRoute` checks `/api/me` to determine if the user is authenticated.
- If the session is not valid, the app redirects to `/`.

## 3. App-wide layout and navigation

Files:
- `src/assets/components/MainLayout/MainLayout.tsx`
- `src/assets/components/MainLayout/MainLayout.css`

The layout is a two-column shell:

- left column: sidebar navigation
- right column: page content area

Sidebar nav items:

- Dashboard
- Projects
- Documents (shown only when `projectId` is present in the URL and the current route is `/projects` or `/documents`)
- Reports
- Settings

Sidebar footer items:

- current logged-in user name and role
- sign out button
- Google Drive connection status

Important state and logic:

- `user: CurrentUser | null` — current authenticated user info
- `isLoggingOut: boolean` — disables sign-out while request is in flight
- `projectIdFromUrl` — reads `projectId` from the URL query string
- `showDocumentsNav` — toggles the Documents navigation entry based on route and project selection

Important API calls:

- `fetch('/api/me', { credentials: 'include' })` → fetches current user
- `fetch('/api/logout', { method: 'POST', credentials: 'include' })` → logs user out

## 4. Authentication: login page

Files:
- `src/assets/components/Login/LoginPage.tsx`
- `src/assets/components/services/authApi.ts`

### Login state variables

```ts
interface LoginCredentials {
  email: string;
  password: string;
  rememberMe: boolean;
}
```

Component state:

- `formData: { email, password, rememberMe }`
- `showPassword: boolean`
- `loading: boolean`
- `errorMessage: string | null`
- `successMessage: string | null`

### Login behavior

- On mount, it checks if a user already exists via `getCurrentUserApi()`.
- If a valid user is returned, it redirects to `/dashboard`.
- On submit:
  - validate email + password
  - call `loginApi(email, password, rememberMe)`
  - show success message
  - navigate to `/dashboard`

### Validation rules

- email must be a valid format
- password must be present
- password must be at least 6 characters long

### API contract expected for backend

```ts
interface UserSession {
  id: number;
  fullName: string;
  email: string;
  role: string;
}
```

API endpoints used:

- `POST /api/login`
  - body: `{ email, password, rememberMe }`
  - returns `{ user: UserSession }`
- `GET /api/me`
  - returns `{ user: UserSession }`
- `POST /api/logout`

## 5. Registration page

File:
- `src/assets/components/Registration/Registration.tsx`

### Registration state variables

```ts
interface RegisterCredentials {
  fullName: string;
  email: string;
  role: string;
  password: string;
  confirmPassword: string;
}
```

Component state:

- `formData`
- `showPassword: boolean`
- `loading: boolean`
- `errorMessage: string | null`
- `successMessage: string | null`

Role options:

```ts
const AVAILABLE_ROLES = ['System Analyst', 'Project Manager', 'Developer', 'Administrator'];
```

### Validation rules

- full name required
- valid institutional email required
- role must be one of `AVAILABLE_ROLES`
- password must be at least 8 characters long
- password must include at least one letter and one number
- confirmPassword must match

### Registration API contract

- `POST /api/register`
  - body:
    ```json
    {
      "fullName": "Peter Salum",
      "email": "peter.salum@moh.go.tz",
      "role": "System Analyst",
      "password": "Pass1234",
      "confirmPassword": "Pass1234"
    }
    ```
  - expected response: `{ message: string }` or `{ user: UserSession }` depending on implementation

## 6. Dashboard page

File:
- `src/assets/components/Dashboard.tsx`

The dashboard is currently a static display page with static summary KPI cards and sample tables. It is not yet connected to real project data.

### Display sections

1. KPI cards
   - Active Projects
   - Documents Outstanding
   - Documentation Complete
   - Overdue Submissions

2. Active projects table
   - contains rows like:
     - project name
     - client/institution
     - current phase
     - documentation completion
     - status indicator

3. Outstanding documents panel
   - shows docs by name and due dates

4. Projects by phase panel
   - totals by phase category

### Current data shape (front-end sample data)

This page uses hardcoded mock content rather than fetched backend data.

## 7. Projects page

Files:
- `src/assets/components/Projects/ProjectsPage.tsx`
- `src/assets/components/Projects/ProjectsPage.css`

This is the main project portfolio page. It supports filtering, search, row selection, project detail expansion, and phase-specific views.

### Project-related interfaces

```ts
interface ProjectDocument {
  id: string;
  title: string;
  phase: string;
  submittedBy: string;
  status: 'Approved' | 'Needs Revision' | 'Uploaded';
  uploadedAt: string;
  fileType: string;
  size: string;
  driveLinked: boolean;
  previewUrl: string;
  downloadUrl: string;
}
```

```ts
interface ProjectPhase {
  id: string;
  name: string;
  status: 'Current' | 'Completed' | 'Upcoming';
  startedAt: string;
  documents: ProjectDocument[];
}
```

```ts
interface Project {
  id: string;
  name: string;
  subtitle: string;
  manager: string;
  members: string[];
  phase: string;
  docsCompleted: number;
  docsTotal: number;
  documentationPercent: number;
  driveLinked: boolean;
  status: 'active' | 'closed';
  phases: ProjectPhase[];
}
```

### Standard project phases

```ts
const STANDARD_PHASES = ['Initiation', 'Requirements', 'System Design', 'Testing & UAT', 'Deployment'];
```

These are enforced for every project.

### Seed/project data behavior

- Projects are seeded in `seedProjectDocSets`
- Every project goes through `normalizeProjectPhases()` to guarantee five standard phases
- LocalStorage can override or enrich the initial project data:
  - key: `pms-project-documents`

### State variables

- `filterTab: 'all' | 'active' | 'closed'`
- `selectedPhase: string`
- `searchQuery: string`
- `projects: Project[]`
- `activePhaseIndex: number`

### Derived values

- `selectedProjectId` from query param `projectId`
- `selectedProject` from project list
- `filteredProjects` after tab + phase + search filter
- `phaseOptions` from all project phases
- `activePhase` from selected project and `activePhaseIndex`
- `approvedCount` across all docs in the selected project

### Filter behavior

- filters by project status: All / Active / Closed
- filters by phase: `Phase: All` + project phases
- text search by project name, subtitle, or manager

### Project row columns

Column names:

- PROJECT
- PROJECT MANAGER
- PHASE
- DOCS
- DOCUMENTATION
- DRIVE

Each row includes:

- project name + subtitle
- manager name
- current phase
- `docsCompleted / docsTotal`
- progress bar + percent completion
- Drive status toggle button (`Linked` or `Not linked`)

### Project detail panel

When a project row is selected, a detail card appears with:

- selected project title and subtitle
- project manager
- current phase
- approved docs count
- drive connection status
- project member pills

Below that is a phase panel with:

- phase pills for each project phase
- status tags (`Current`, `Completed`, `Upcoming`)
- per-phase documents list

### Document display in project details

Each document in a selected project phase includes:

- title
- phase tag
- submitted by person
- uploaded date
- status badge (`Approved`, `Needs Revision`, `Uploaded`)
- View in Documents button

### Drive actions

Functions:

- `handleSyncGoogleDrive(projectId)`
- `handleLinkGoogleDrive(projectId)`

Current behavior:

- clicking the drive button triggers a simulated sync or links the project in memory
- it updates the `driveLinked` flag on the project

## 8. Documents page

File:
- `src/assets/components/Documents/DocumentsPage.tsx`

This page displays a project’s document set and allows the current logged-in user to manage uploads and delete ownership.

### Document data interface

```ts
interface ProjectDocument {
  id: string;
  title: string;
  phase: string;
  submittedBy: string;
  status: 'Approved' | 'Needs Revision' | 'Uploaded';
  uploadedAt: string;
  fileType: string;
  size: string;
  downloadUrl: string;
}
```

### Project document set structure

```ts
interface ProjectDocSet {
  id: string;
  name: string;
  subtitle: string;
  manager: string;
  phases: string[];
  documents: ProjectDocument[];
}
```

### Standard phases for docs

```ts
const STANDARD_PHASES = ['Initiation', 'Requirements', 'System Design', 'Testing & UAT', 'Deployment'];
```

### Page state variables

- `projectDocSets: ProjectDocSet[]`
- `selectedDocumentId: string`
- `showUploadForm: boolean`
- `currentUserName: string`
- `uploadForm: { title: string; phase: string; fileName: string }`
- `selectedFile: File | null`

### LocalStorage behavior

Storage key:

```ts
const STORAGE_KEY = 'pms-project-documents';
```

The page saves the project doc set to localStorage whenever the list changes.

### Document selection

- the selected project is determined by URL query param `projectId`
- if no projectId exists, it falls back to the first project in the list
- active document is derived from `selectedDocumentId`

### Upload feature

When the user clicks “Submit new file”:

- a form appears with:
  - document title
  - phase selector
  - file picker
- on submit, it creates a new `ProjectDocument` with:
  - a generated id
  - selected phase
  - current user as `submittedBy`
  - status: `Uploaded`
  - upload date: current date
  - file extension and file size
  - placeholder `downloadUrl`
- new document is inserted at the top of the list for that project
- it is immediately visible under the selected phase

### Ownership-based delete feature

The delete logic is:

```ts
if (targetDocument.submittedBy !== currentUserName) {
  return;
}
```

This means:

- only the original uploader can delete the document
- all other users can view and download the document
- when a document is deleted, it is filtered out of the project doc set and disappears globally across the UI

### Download behavior

The preview area includes:

```tsx
<a href={activeDocument.downloadUrl} target="_blank" rel="noreferrer" download>
  Download file
</a>
```

Current setup is a placeholder link; a real backend file storage system should replace this.

## 9. Data variables and their intended meaning

### Authentication/user variables

- `id` → numeric user identifier
- `fullName` → display name in UI and ownership checks
- `email` → institutional email address
- `role` → role in system, such as `System Analyst` or `Project Manager`

### Project variables

- `id` → unique project UUID/string id
- `name` → formal project title
- `subtitle` → institution/partner label
- `manager` → project manager name
- `members` → array of project members
- `phase` → current project phase label, such as `System Design`
- `docsCompleted` → count of approved docs in the project
- `docsTotal` → total docs count expected/used for progress
- `documentationPercent` → percent progress based on project documentation
- `driveLinked` → indicates if the project is linked to Google Drive
- `status` → `'active' | 'closed'`
- `phases` → array of phase objects for the project

### Project phase variables

- `id` → phase id
- `name` → phase title
- `status` → `'Current' | 'Completed' | 'Upcoming'`
- `startedAt` → label or date for beginning of phase
- `documents` → list of docs submitted for that phase

### Document variables

- `id` → unique document id
- `title` → document title
- `phase` → project phase under which it belongs
- `submittedBy` → owner of the document submission
- `status` → `'Approved' | 'Needs Revision' | 'Uploaded'`
- `uploadedAt` → ISO-like date string or user-facing date
- `fileType` → extension like `PDF`, `DOCX`, `PNG`
- `size` → string format like `3.2 MB`
- `downloadUrl` → current placeholder download endpoint

## 10. Current persistence strategy

Because the app is still front-end-first, data is stored in browser localStorage rather than a production database.

Current storage keys:

- `pms-project-documents` → project document sets

This means the app is currently a prototype without robust multi-user persistence. Later, backend implementations should replace these localStorage writes with database-backed CRUD operations.

## 11. Backend mapping recommendations

### Recommended entities

1. `users`
   - id
   - full_name
   - email
   - password_hash
   - role
   - created_at

2. `projects`
   - id
   - name
   - subtitle
   - manager
   - status
   - current_phase
   - drive_linked
   - created_at

3. `project_members`
   - id
   - project_id
   - user_id

4. `documents`
   - id
   - project_id
   - title
   - phase
   - submitted_by_user_id
   - status
   - uploaded_at
   - file_type
   - size_bytes
   - file_path_or_storage_url
   - download_url

5. `project_phases`
   - id
   - project_id
   - name
   - status
   - started_at

### Recommended API endpoints

- `POST /api/login`
- `POST /api/register`
- `GET /api/me`
- `POST /api/logout`
- `GET /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects`
- `GET /api/projects/:id/documents`
- `POST /api/projects/:id/documents`
- `DELETE /api/documents/:id`
- `PATCH /api/documents/:id/status`

### Recommended authorization logic

- only the user who submitted a document may delete it
- all other users may still read or download it
- project-level access should be limited by institutional scope or role permissions

## 12. Current app limitations to note

- There is no real backend database yet
- User sessions are simulated through cookie/session-like behavior in the mock flow
- Document downloads are placeholder URLs
- Google Drive integration is simulated, not connected to a real service
- Dashboard statistics are static demo values
- Reports and Settings are placeholders

## 13. Implementation checklist for backend integration

- Replace localStorage with API-backed project storage
- Add user model + password hashing
- Add project creation and retrieval endpoints
- Add document upload endpoint with real file storage
- Add document ownership checks on delete
- Implement phase filtering and completion logic from database values
- Add real Google Drive linkage integration if required

## 14. Summary

This app currently presents a polished front-end prototype of an institutional project documentation system with:

- secure-looking authentication flow
- project lifecycle management
- staged document review logic
- project-by-phase organization
- document upload, visibility, and owner-based deletion
- responsive shell layout and fixed sidebar navigation

The frontend is ready for a backend to be attached, and the main responsibilities for the backend are clear from the data contracts and UI logic documented here.
