import { asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { projectPhases, projects } from '../db/schema';
import { assertUuidWith } from '../utils/validation';
import { assertProjectExists } from './shared-guards';
import { recordAudit } from './audit.service';
import { buildPhaseSeedRows,
  phaseTransitionError,
  resolveCompletion,
  resolveReopen,
  type PhaseTransitionError,
} from './phase.constants';
import { seedRequirementsForPhases } from './requirements.service';

export { phaseTransitionError };
export type { PhaseTransitionError };

export const assertPhaseUuid = (value: string, label: string): void => {
  assertUuidWith(value, label, (notLabel) =>
    phaseTransitionError(`Invalid ${notLabel}`, 400, 'INVALID_RESOURCE_ID'),
  );
};

export interface PhaseResponse {
  id: string;
  projectId: string;
  name: string;
  displayName: string;
  sequence: number;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
}

const toPhaseResponse = (row: typeof projectPhases.$inferSelect): PhaseResponse => ({
  id: row.id,
  projectId: row.projectId,
  name: row.name,
  displayName: row.displayName,
  sequence: row.sequence,
  status: row.status,
  startedAt: row.startedAt,
  completedAt: row.completedAt,
});

export const listPhases = async (projectId: string): Promise<PhaseResponse[]> => {
  assertPhaseUuid(projectId, 'project id');
  await assertProjectExists(db, projectId);
  const rows = await db
    .select()
    .from(projectPhases)
    .where(eq(projectPhases.projectId, projectId))
    .orderBy(asc(projectPhases.sequence));
  return rows.map(toPhaseResponse);
};

export const getCurrentPhase = async (projectId: string): Promise<PhaseResponse | null> => {
  const phases = await listPhases(projectId);
  return phases.find((phase) => phase.status === 'current') ?? null;
};

/**
 * Idempotent backfill: generates the 7 standard phases when a project has
 * none (projects created before the Phase Engine existed). Safe to call
 * repeatedly — returns the existing phases when already initialized.
 */
export const ensurePhases = async (
  projectId: string,
  actorId: string,
): Promise<{ phases: PhaseResponse[]; generated: boolean }> => {
  assertPhaseUuid(projectId, 'project id');
  assertPhaseUuid(actorId, 'actor id');
  await assertProjectExists(db, projectId);

  const existing = await db
    .select()
    .from(projectPhases)
    .where(eq(projectPhases.projectId, projectId))
    .orderBy(asc(projectPhases.sequence));
  if (existing.length > 0) {
    return { phases: existing.map(toPhaseResponse), generated: false };
  }

  await db
    .insert(projectPhases)
    .values(buildPhaseSeedRows(projectId))
    .onConflictDoNothing();
  await db
    .update(projects)
    .set({ currentPhase: 'Initiation', updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  const rows = await db
    .select()
    .from(projectPhases)
    .where(eq(projectPhases.projectId, projectId))
    .orderBy(asc(projectPhases.sequence));

  // Document Requirements (Module 4): backfilled phases also get their
  // standard requirement rows so pre-Phase-4 projects converge.
  const requirementCount = await seedRequirementsForPhases(db, rows);

  await recordAudit({
    userId: actorId,
    action: 'phase.generated',
    entityType: 'project',
    entityId: projectId,
    metadata: { count: rows.length, backfill: true },
  });
  await recordAudit({
    userId: actorId,
    action: 'requirement.generated',
    entityType: 'project',
    entityId: projectId,
    metadata: { count: requirementCount, backfill: true },
  });
  return { phases: rows.map(toPhaseResponse), generated: true };
};

export const completePhase = async (
  projectId: string,
  phaseId: string,
  actorId: string,
): Promise<{ phases: PhaseResponse[]; completedPhase: PhaseResponse; currentPhase: PhaseResponse | null }> => {
  assertPhaseUuid(projectId, 'project id');
  assertPhaseUuid(phaseId, 'phase id');
  assertPhaseUuid(actorId, 'actor id');

  const outcome = await db.transaction(async (tx) => {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) {
      throw phaseTransitionError('Project not found.', 404, 'PROJECT_NOT_FOUND');
    }
    const rows = await tx
      .select()
      .from(projectPhases)
      .where(eq(projectPhases.projectId, projectId))
      .orderBy(asc(projectPhases.sequence));
    if (rows.length === 0) {
      throw phaseTransitionError(
        'Phases are not initialized for this project. Call the ensure endpoint first.',
        404,
        'PHASES_NOT_INITIALIZED',
      );
    }
    const { target, next } = resolveCompletion(rows, phaseId);
    const now = new Date();

    await tx
      .update(projectPhases)
      .set({ status: 'completed', completedAt: now })
      .where(eq(projectPhases.id, target.id));

    if (next) {
      await tx
        .update(projectPhases)
        .set({ status: 'current', startedAt: next.startedAt ?? now })
        .where(eq(projectPhases.id, next.id));
      await tx
        .update(projects)
        .set({ currentPhase: next.displayName, updatedAt: now })
        .where(eq(projects.id, projectId));
    } else {
      await tx
        .update(projects)
        .set({ currentPhase: target.displayName, updatedAt: now })
        .where(eq(projects.id, projectId));
    }
    return { targetId: target.id, nextId: next?.id };
  });

  await recordAudit({
    userId: actorId,
    action: 'phase.completed',
    entityType: 'project_phase',
    entityId: outcome.targetId,
    metadata: { projectId, nextPhaseId: outcome.nextId ?? null },
  });

  const phases = await listPhases(projectId);
  const completedPhase = phases.find((phase) => phase.id === outcome.targetId) as PhaseResponse;
  return {
    phases,
    completedPhase,
    currentPhase: phases.find((phase) => phase.status === 'current') ?? null,
  };
};

export const reopenPhase = async (
  projectId: string,
  phaseId: string,
  actorId: string,
): Promise<{ phases: PhaseResponse[]; reopenedPhase: PhaseResponse; currentPhase: PhaseResponse | null }> => {
  assertPhaseUuid(projectId, 'project id');
  assertPhaseUuid(phaseId, 'phase id');
  assertPhaseUuid(actorId, 'actor id');

  const outcome = await db.transaction(async (tx) => {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) {
      throw phaseTransitionError('Project not found.', 404, 'PROJECT_NOT_FOUND');
    }
    const rows = await tx
      .select()
      .from(projectPhases)
      .where(eq(projectPhases.projectId, projectId))
      .orderBy(asc(projectPhases.sequence));
    if (rows.length === 0) {
      throw phaseTransitionError(
        'Phases are not initialized for this project. Call the ensure endpoint first.',
        404,
        'PHASES_NOT_INITIALIZED',
      );
    }
    const { target, successor } = resolveReopen(rows, phaseId);
    const now = new Date();

    await tx
      .update(projectPhases)
      .set({ status: 'current', completedAt: null, startedAt: target.startedAt ?? now })
      .where(eq(projectPhases.id, target.id));

    if (successor) {
      await tx
        .update(projectPhases)
        .set({ status: 'not_started', startedAt: null })
        .where(eq(projectPhases.id, successor.id));
    }
    await tx
      .update(projects)
      .set({ currentPhase: target.displayName, updatedAt: now })
      .where(eq(projects.id, projectId));
    return { targetId: target.id };
  });

  await recordAudit({
    userId: actorId,
    action: 'phase.reopened',
    entityType: 'project_phase',
    entityId: outcome.targetId,
    metadata: { projectId },
  });

  const phases = await listPhases(projectId);
  const reopenedPhase = phases.find((phase) => phase.id === outcome.targetId) as PhaseResponse;
  return {
    phases,
    reopenedPhase,
    currentPhase: phases.find((phase) => phase.status === 'current') ?? null,
  };
};
