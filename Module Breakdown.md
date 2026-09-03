# Project 1 — Document Organization Module
## Module Breakdown

**Team:** Ehud Joha, James Mwanri, Yussuf Ali (Developers) · George Macha, Rashidu Amiri Yunusu (System Analysts)
**Stack:** React (frontend) · Express.js + TypeScript (backend) · Neon Postgres + Prisma/Drizzle (database) · Google Drive API integration

---

## 1. Auth & User Management

**Responsibilities:**
- Login/session handling, password reset
- Role definitions (Admin, Project Manager, Team Member)
- Role-based route protection (middleware layer)

**Dependencies:** None — foundational module, needed before other modules can enforce access control.

---

## 2. Project Management

**Responsibilities:**
- CRUD for projects (name, description, client, project manager, team, start/end dates)
- Team member assignment to a project
- Project status tracking (active / completed / on-hold)

**Dependencies:** Auth & User Management (module 1)

**Notes:** This is the root entity — Phase Engine, Document Requirements, and Document Management all reference a project.

---

## 3. Phase Engine

**Responsibilities:**
- Auto-generate the 7 standard project phases on project creation (Initiation → Requirements Analysis → System Design → Development → Testing & UAT → Deployment → Closure)
- Track current phase per project
- Mark phases complete

**Dependencies:** Project Management (module 2)

**Notes:** Functions as a state machine, not just a data table. Decisions to make explicitly: what triggers phase completion, whether phases can be skipped or run in parallel.

---

## 4. Document Requirements

**Responsibilities:**
- Template of expected document categories per phase (SRS, SDD, UAT Report, etc.)
- Mandatory vs. optional flag per requirement
- Computed status: submitted vs. outstanding, per phase and per project

**Dependencies:** Phase Engine (module 3)

**Notes:** This is the module that makes the system a compliance tracker rather than a plain file store. The Dashboard module's completion-percentage feature is an aggregation on top of this data. Highest design priority — get this schema right early.

---

## 5. Document Management

**Responsibilities:**
- Upload/download/view document metadata (name, type, phase, uploader, upload date, version, status)
- Version history per document
- Approval/status workflow (e.g., draft → submitted → approved)

**Dependencies:** Document Requirements (module 4), Google Drive Integration (module 6)

**Notes:** Sits between the Requirements module (what's expected) and the Drive Integration module (where files actually live) — this module owns the metadata and workflow layer.

---

## 6. Google Drive Integration

**Responsibilities:**
- Decide and implement auth model: service account (single shared Drive) vs. per-user OAuth
- Auto-create folder structure: project folder → phase subfolders → document category subfolders
- Upload/retrieve files via Drive API, generate shareable links

**Dependencies:** Project Management (module 2), Phase Engine (module 3)

**Notes:** The one genuinely external, failure-prone dependency (API rate limits, auth expiry, permission errors). Should be isolated as its own service layer so Drive-specific error handling doesn't leak into other modules.

---

## 7. Dashboard & Reporting

**Responsibilities:**
- Active/completed project counts
- Projects grouped by phase
- Documents submitted vs. outstanding (org-wide and per-project)
- Documentation completion percentage

**Dependencies:** Project Management, Phase Engine, Document Requirements, Document Management (modules 2–5)

**Notes:** Pure read/aggregation layer — no independent business logic. Build last, once modules 2–5 have real data flowing.

---

## Suggested Developer Split

| Developer | Modules |
|---|---|
| Dev A | Auth & User Management, Project Management (1–2) |
| Dev B | Phase Engine, Document Requirements (3–4) |
| Dev C | Document Management, Google Drive Integration (5–6) |

Dashboard (module 7) is best treated as a shared, near-end contribution once modules 2–6 have real data to report on.

## Build Priority Note

Modules 3 (Phase Engine) and 4 (Document Requirements) carry the most design risk — modules 2, 5, 6, and 7 all reference phase/requirement state in some way. Lock down that schema before writing significant code elsewhere.
