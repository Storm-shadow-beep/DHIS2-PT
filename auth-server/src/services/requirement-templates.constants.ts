/**
 * Document Requirements — canonical template and pure helpers (Module 4).
 *
 * This module is intentionally dependency-free (no db/env imports) so the
 * template and seed rules can be unit-tested without a database. All
 * database access lives in `requirements.service.ts`.
 *
 * Module Breakdown reference: Module 4 — Document Requirements. Template of
 * expected document categories per phase (SRS, SDD, UAT Report, etc.) with
 * a mandatory vs. optional flag. New projects auto-seed per-project copies
 * (rows in `document_categories`, one per project phase) from
 * `STANDARD_REQUIREMENT_TEMPLATES`; PMs can then add/edit/delete
 * requirements per project. Submitted-vs-outstanding aggregation is
 * deferred to Module 5 (Document Management).
 */

export interface StandardRequirementTemplate {
  phaseSequence: number;
  phaseName: string;
  name: string;
  isMandatory: boolean;
  sortOrder: number;
}

/**
 * Canonical template: expected document categories per standard phase.
 * `phaseSequence` matches `STANDARD_PHASES` in `phase.constants.ts`.
 * Must stay in sync with migration
 * `drizzle/drizzle/20260915000000_document_requirements/migration.sql`.
 */
export const STANDARD_REQUIREMENT_TEMPLATES: readonly StandardRequirementTemplate[] = [
  { phaseSequence: 1, phaseName: 'Initiation', name: 'Project Charter', isMandatory: true, sortOrder: 1 },
  { phaseSequence: 1, phaseName: 'Initiation', name: 'Stakeholder Register', isMandatory: true, sortOrder: 2 },
  { phaseSequence: 1, phaseName: 'Initiation', name: 'Business Case', isMandatory: false, sortOrder: 3 },
  { phaseSequence: 2, phaseName: 'Requirements Analysis', name: 'Software Requirements Specification (SRS)', isMandatory: true, sortOrder: 1 },
  { phaseSequence: 2, phaseName: 'Requirements Analysis', name: 'Use Case Document', isMandatory: true, sortOrder: 2 },
  { phaseSequence: 2, phaseName: 'Requirements Analysis', name: 'Requirements Traceability Matrix', isMandatory: false, sortOrder: 3 },
  { phaseSequence: 3, phaseName: 'System Design', name: 'System Design Document (SDD)', isMandatory: true, sortOrder: 1 },
  { phaseSequence: 3, phaseName: 'System Design', name: 'Database Design Document', isMandatory: true, sortOrder: 2 },
  { phaseSequence: 3, phaseName: 'System Design', name: 'API Specification', isMandatory: false, sortOrder: 3 },
  { phaseSequence: 4, phaseName: 'Development', name: 'Module Completion Report', isMandatory: true, sortOrder: 1 },
  { phaseSequence: 4, phaseName: 'Development', name: 'Code Review Checklist', isMandatory: false, sortOrder: 2 },
  { phaseSequence: 4, phaseName: 'Development', name: 'Integration Test Plan', isMandatory: false, sortOrder: 3 },
  { phaseSequence: 5, phaseName: 'Testing & UAT', name: 'Test Plan', isMandatory: true, sortOrder: 1 },
  { phaseSequence: 5, phaseName: 'Testing & UAT', name: 'UAT Report', isMandatory: true, sortOrder: 2 },
  { phaseSequence: 5, phaseName: 'Testing & UAT', name: 'Defect Log', isMandatory: false, sortOrder: 3 },
  { phaseSequence: 6, phaseName: 'Deployment', name: 'Deployment Plan', isMandatory: true, sortOrder: 1 },
  { phaseSequence: 6, phaseName: 'Deployment', name: 'User Manual', isMandatory: true, sortOrder: 2 },
  { phaseSequence: 6, phaseName: 'Deployment', name: 'Release Notes', isMandatory: false, sortOrder: 3 },
  { phaseSequence: 7, phaseName: 'Closure', name: 'Project Closure Report', isMandatory: true, sortOrder: 1 },
  { phaseSequence: 7, phaseName: 'Closure', name: 'Final Acceptance Sign-off', isMandatory: true, sortOrder: 2 },
  { phaseSequence: 7, phaseName: 'Closure', name: 'Lessons Learned', isMandatory: false, sortOrder: 3 },
] as const;

export interface PhaseSeedLike {
  id: string;
  sequence: number;
}

export interface CategorySeedRow {
  phaseId: string;
  name: string;
  isMandatory: boolean;
  sortOrder: number;
}

export type RequirementError = Error & {
  statusCode: number;
  code: string;
};

export const requirementError = (
  message: string,
  statusCode: number,
  code: string,
): RequirementError => Object.assign(new Error(message), { statusCode, code });

/**
 * Build per-project `document_categories` seed rows for the given project
 * phases (no db access). Phases without a template entry get no rows.
 */
export const buildCategorySeedRows = (
  phases: readonly PhaseSeedLike[],
  templates: readonly StandardRequirementTemplate[] = STANDARD_REQUIREMENT_TEMPLATES,
): CategorySeedRow[] => {
  const rows: CategorySeedRow[] = [];
  for (const phase of phases) {
    const matches = templates
      .filter((template) => template.phaseSequence === phase.sequence)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    for (const template of matches) {
      rows.push({
        phaseId: phase.id,
        name: template.name,
        isMandatory: template.isMandatory,
        sortOrder: template.sortOrder,
      });
    }
  }
  return rows;
};

/** Validate a requirement display name. Returns the trimmed name. */
export const validateRequirementName = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw requirementError('name is required', 400, 'VALIDATION_ERROR');
  }
  const trimmed = value.trim();
  if (trimmed.length > 150) {
    throw requirementError('name must be at most 150 characters', 400, 'VALIDATION_ERROR');
  }
  return trimmed;
};

/** Validate an optional sort order (non-negative integer). */
export const validateSortOrder = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 9999) {
    throw requirementError('sortOrder must be a non-negative integer', 400, 'VALIDATION_ERROR');
  }
  return value;
};
