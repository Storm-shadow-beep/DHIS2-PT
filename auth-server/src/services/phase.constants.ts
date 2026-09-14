/**
 * Phase Engine — canonical definitions and pure state-machine helpers.
 *
 * This module is intentionally dependency-free (no db/env imports) so the
 * transition rules can be unit-tested without a database. All database
 * access lives in `phase.service.ts`.
 *
 * Module Breakdown reference: Module 3 — Phase Engine. Auto-generates the
 * 7 standard project phases on project creation, tracks the current phase
 * per project, and advances phases linearly (no skipping, no parallel
 * phases in v1).
 */

export type PhaseStatus = 'not_started' | 'current' | 'completed';

export interface StandardPhaseDefinition {
  sequence: number;
  name: string;
  displayName: string;
}

/**
 * Canonical 7 phases per the student project brief / Module Breakdown.
 * `name` doubles as the value synced into `projects.current_phase`
 * (varchar 50) so existing frontend filters keep working.
 */
export const STANDARD_PHASES: readonly StandardPhaseDefinition[] = [
  { sequence: 1, name: 'Initiation', displayName: 'Initiation' },
  { sequence: 2, name: 'Requirements Analysis', displayName: 'Requirements Analysis' },
  { sequence: 3, name: 'System Design', displayName: 'System Design' },
  { sequence: 4, name: 'Development', displayName: 'Development' },
  { sequence: 5, name: 'Testing & UAT', displayName: 'Testing & UAT' },
  { sequence: 6, name: 'Deployment', displayName: 'Deployment' },
  { sequence: 7, name: 'Closure', displayName: 'Closure' },
] as const;

export interface PhaseLike {
  id: string;
  sequence: number;
  status: string;
}

export type PhaseTransitionError = Error & {
  statusCode: number;
  code: string;
};

export const phaseTransitionError = (
  message: string,
  statusCode: number,
  code: string,
): PhaseTransitionError => Object.assign(new Error(message), { statusCode, code });

const findPhase = <T extends PhaseLike>(phases: readonly T[], phaseId: string): T => {
  const target = phases.find((phase) => phase.id === phaseId);
  if (!target) {
    throw phaseTransitionError('Phase not found.', 404, 'PHASE_NOT_FOUND');
  }
  return target;
};

/**
 * Resolve a `complete` transition. Only the phase with status `current`
 * may be completed. Returns the target and its successor (undefined when
 * completing the final phase).
 */
export const resolveCompletion = <T extends PhaseLike>(
  phases: readonly T[],
  phaseId: string,
): { target: T; next: T | undefined } => {
  const target = findPhase(phases, phaseId);
  if (target.status === 'completed') {
    throw phaseTransitionError('Phase is already completed.', 409, 'PHASE_ALREADY_COMPLETED');
  }
  if (target.status !== 'current') {
    throw phaseTransitionError(
      'Only the current phase can be completed. Complete phases in order.',
      409,
      'INVALID_PHASE_TRANSITION',
    );
  }
  const ordered = [...phases].sort((a, b) => a.sequence - b.sequence);
  const next = ordered.find((phase) => phase.sequence > target.sequence);
  return { target, next };
};

/**
 * Resolve a `reopen` transition (PM correction path). Only the most
 * recently completed phase may be reopened — i.e. a completed phase whose
 * immediate successor is `current`, or the final phase when every phase
 * is completed.
 */
export const resolveReopen = <T extends PhaseLike>(
  phases: readonly T[],
  phaseId: string,
): { target: T; successor: T | undefined } => {
  const target = findPhase(phases, phaseId);
  if (target.status !== 'completed') {
    throw phaseTransitionError('Only a completed phase can be reopened.', 409, 'INVALID_PHASE_TRANSITION');
  }
  const ordered = [...phases].sort((a, b) => a.sequence - b.sequence);
  const successor = ordered.find((phase) => phase.sequence > target.sequence);
  if (successor !== undefined && successor.status !== 'current') {
    throw phaseTransitionError(
      'Only the most recently completed phase can be reopened.',
      409,
      'INVALID_PHASE_TRANSITION',
    );
  }
  return { target, successor };
};

/** Row values for seeding the 7 phases of a new project (no db access). */
export const buildPhaseSeedRows = (projectId: string): Array<{
  projectId: string;
  name: string;
  displayName: string;
  sequence: number;
  status: PhaseStatus;
  startedAt: Date | null;
}> => {
  const now = new Date();
  return STANDARD_PHASES.map((definition) => ({
    projectId,
    name: definition.name,
    displayName: definition.displayName,
    sequence: definition.sequence,
    status: definition.sequence === 1 ? 'current' : 'not_started',
    startedAt: definition.sequence === 1 ? now : null,
  }));
};
