import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  documentCategories,
  documents,
  projectPhases,
} from '../db/schema';
import { assertUuidWith } from '../utils/validation';
import { assertProjectExists } from './shared-guards';
import { recordAudit } from './audit.service';
import {
  buildCategorySeedRows,
  requirementError,
  validateRequirementName,
  validateSortOrder,
  type RequirementError,
} from './requirement-templates.constants';

export { requirementError };
export type { RequirementError };

export const assertRequirementUuid = (value: string, label: string): void => {
  assertUuidWith(value, label, (notLabel) => requirementError(`Invalid ${notLabel}`, 400, 'INVALID_RESOURCE_ID'));
};

/** Postgres unique-violation code — maps concurrent duplicate inserts to 409. */
const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === '23505';

const toRequirementConflict = (): RequirementError =>
  requirementError(
    'A requirement with this name already exists for the phase.',
    409,
    'REQUIREMENT_CONFLICT',
  );

export interface RequirementResponse {
  id: string;
  phaseId: string;
  name: string;
  isMandatory: boolean;
  sortOrder: number;
  /** Documents linked to this requirement (0 until Module 5 uploads exist). */
  documentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PhaseCompliance {
  required: number;
  mandatory: number;
  /** Requirements with at least one linked document. */
  submitted: number;
  outstanding: number;
  mandatorySubmitted: number;
  mandatoryOutstanding: number;
}

export interface PhaseRequirementsGroup {
  phase: {
    id: string;
    name: string;
    displayName: string;
    sequence: number;
    status: string;
  };
  compliance: PhaseCompliance;
  requirements: RequirementResponse[];
}

const toRequirementResponse = (
  row: typeof documentCategories.$inferSelect,
  documentCount: number,
): RequirementResponse => ({
  id: row.id,
  phaseId: row.phaseId,
  name: row.name,
  isMandatory: row.isMandatory,
  sortOrder: row.sortOrder,
  documentCount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/**
 * Load a project's phases or throw 404. Every requirement operation
 * re-verifies the phase belongs to the project so callers cannot pivot
 * across projects with a valid phase/requirement id.
 */

const listProjectPhases = async (txOrDb: typeof db, projectId: string) => {
  const rows = await txOrDb
    .select()
    .from(projectPhases)
    .where(eq(projectPhases.projectId, projectId))
    .orderBy(asc(projectPhases.sequence));
  if (rows.length === 0) {
    throw requirementError(
      'Phases are not initialized for this project. Call the phases ensure endpoint first.',
      404,
      'PHASES_NOT_INITIALIZED',
    );
  }
  return rows;
};

export const listRequirements = async (
  projectId: string,
): Promise<{ phases: PhaseRequirementsGroup[] }> => {
  assertRequirementUuid(projectId, 'project id');
  await assertProjectExists(db, projectId);
  const phaseRows = await listProjectPhases(db, projectId);
  const phaseIds = phaseRows.map((phase) => phase.id);

  const categoryRows = await db
    .select()
    .from(documentCategories)
    .where(inArray(documentCategories.phaseId, phaseIds))
    .orderBy(asc(documentCategories.sortOrder), asc(documentCategories.name));

  // Submitted-vs-outstanding counts: documents linked per requirement.
  // Zero until Module 5 (Document Management) lands; version/approval
  // weighting stays a Module 5 concern.
  const documentCountByCategory = new Map<string, number>();
  const categoryIds = categoryRows.map((row) => row.id);
  if (categoryIds.length > 0) {
    const countRows = await db
      .select({
        categoryId: documents.documentCategoryId,
        count: sql<number>`count(*)::int`,
      })
      .from(documents)
      .where(
        and(
          inArray(documents.documentCategoryId, categoryIds),
          isNotNull(documents.documentCategoryId),
        ),
      )
      .groupBy(documents.documentCategoryId);
    for (const row of countRows) {
      if (row.categoryId) documentCountByCategory.set(row.categoryId, row.count);
    }
  }

  const byPhaseId = new Map<string, RequirementResponse[]>();
  for (const row of categoryRows) {
    const list = byPhaseId.get(row.phaseId) ?? [];
    list.push(toRequirementResponse(row, documentCountByCategory.get(row.id) ?? 0));
    byPhaseId.set(row.phaseId, list);
  }

  return {
    phases: phaseRows.map((phase) => {
      const requirements = byPhaseId.get(phase.id) ?? [];
      const submitted = requirements.filter((item) => item.documentCount > 0);
      const mandatory = requirements.filter((item) => item.isMandatory);
      const mandatorySubmitted = mandatory.filter((item) => item.documentCount > 0);
      return {
        phase: {
          id: phase.id,
          name: phase.name,
          displayName: phase.displayName,
          sequence: phase.sequence,
          status: phase.status,
        },
        compliance: {
          required: requirements.length,
          mandatory: mandatory.length,
          submitted: submitted.length,
          outstanding: requirements.length - submitted.length,
          mandatorySubmitted: mandatorySubmitted.length,
          mandatoryOutstanding: mandatory.length - mandatorySubmitted.length,
        },
        requirements,
      };
    }),
  };
};

export interface CreateRequirementInput {
  name: unknown;
  isMandatory?: unknown;
  sortOrder?: unknown;
}

export interface UpdateRequirementInput {
  name?: unknown;
  isMandatory?: unknown;
  sortOrder?: unknown;
}

const assertIsMandatory = (value: unknown): boolean | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw requirementError('isMandatory must be a boolean', 400, 'VALIDATION_ERROR');
  }
  return value;
};

const assertNoDuplicateName = async (
  txOrDb: typeof db,
  phaseId: string,
  name: string,
  ignoreId?: string,
): Promise<void> => {
  const rows = await txOrDb
    .select({ id: documentCategories.id, name: documentCategories.name })
    .from(documentCategories)
    .where(eq(documentCategories.phaseId, phaseId));
  const conflict = rows.some(
    (row) => row.id !== ignoreId && row.name.toLowerCase() === name.toLowerCase(),
  );
  if (conflict) {
    throw requirementError(
      'A requirement with this name already exists for the phase.',
      409,
      'REQUIREMENT_CONFLICT',
    );
  }
};

export const createRequirement = async (
  projectId: string,
  phaseId: string,
  input: CreateRequirementInput,
  actorId: string,
): Promise<RequirementResponse> => {
  assertRequirementUuid(projectId, 'project id');
  assertRequirementUuid(phaseId, 'phase id');
  assertRequirementUuid(actorId, 'actor id');
  const name = validateRequirementName(input.name);
  const isMandatory = assertIsMandatory(input.isMandatory) ?? true;
  const sortOrder = validateSortOrder(input.sortOrder) ?? 0;

  await assertProjectExists(db, projectId);
  const [phase] = await db
    .select()
    .from(projectPhases)
    .where(and(eq(projectPhases.id, phaseId), eq(projectPhases.projectId, projectId)))
    .limit(1);
  if (!phase) {
    throw requirementError('Phase not found for this project.', 404, 'PHASE_NOT_FOUND');
  }
  await assertNoDuplicateName(db, phaseId, name);

  let created;
  try {
    [created] = await db
      .insert(documentCategories)
      .values({ phaseId, name, isMandatory, sortOrder })
      .returning();
  } catch (error) {
    // Concurrent duplicate (passes the app-level check, hits the DB
    // unique index incl. the case-insensitive expression index).
    if (isUniqueViolation(error)) throw toRequirementConflict();
    throw error;
  }
  await recordAudit({
    userId: actorId,
    action: 'requirement.created',
    entityType: 'document_category',
    entityId: created.id,
    metadata: { projectId, phaseId, name, isMandatory },
  });
  return toRequirementResponse(created, 0);
};

export const updateRequirement = async (
  projectId: string,
  requirementId: string,
  input: UpdateRequirementInput,
  actorId: string,
): Promise<RequirementResponse> => {
  assertRequirementUuid(projectId, 'project id');
  assertRequirementUuid(requirementId, 'requirement id');
  assertRequirementUuid(actorId, 'actor id');

  if (
    input.name === undefined &&
    input.isMandatory === undefined &&
    input.sortOrder === undefined
  ) {
    throw requirementError('At least one field is required', 400, 'VALIDATION_ERROR');
  }

  const [existing] = await db
    .select()
    .from(documentCategories)
    .where(eq(documentCategories.id, requirementId))
    .limit(1);
  if (!existing) {
    throw requirementError('Requirement not found.', 404, 'REQUIREMENT_NOT_FOUND');
  }
  const [phase] = await db
    .select({ id: projectPhases.id, projectId: projectPhases.projectId })
    .from(projectPhases)
    .where(eq(projectPhases.id, existing.phaseId))
    .limit(1);
  if (!phase || phase.projectId !== projectId) {
    // Non-leaking: scoped miss reads as not found.
    throw requirementError('Requirement not found.', 404, 'REQUIREMENT_NOT_FOUND');
  }

  const updates: Partial<typeof documentCategories.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) {
    const name = validateRequirementName(input.name);
    await assertNoDuplicateName(db, existing.phaseId, name, existing.id);
    updates.name = name;
  }
  const isMandatory = assertIsMandatory(input.isMandatory);
  if (isMandatory !== undefined) updates.isMandatory = isMandatory;
  const sortOrder = validateSortOrder(input.sortOrder);
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;

  let updated;
  try {
    [updated] = await db
      .update(documentCategories)
      .set(updates)
      .where(eq(documentCategories.id, requirementId))
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) throw toRequirementConflict();
    throw error;
  }
  await recordAudit({
    userId: actorId,
    action: 'requirement.updated',
    entityType: 'document_category',
    entityId: requirementId,
    metadata: { projectId, fields: Object.keys(updates).filter((key) => key !== 'updatedAt') },
  });
  const [linked] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documents)
    .where(eq(documents.documentCategoryId, requirementId));
  return toRequirementResponse(updated, linked?.count ?? 0);
};

export const deleteRequirement = async (
  projectId: string,
  requirementId: string,
  actorId: string,
): Promise<void> => {
  assertRequirementUuid(projectId, 'project id');
  assertRequirementUuid(requirementId, 'requirement id');
  assertRequirementUuid(actorId, 'actor id');

  const [existing] = await db
    .select()
    .from(documentCategories)
    .where(eq(documentCategories.id, requirementId))
    .limit(1);
  if (!existing) {
    throw requirementError('Requirement not found.', 404, 'REQUIREMENT_NOT_FOUND');
  }
  const [phase] = await db
    .select({ id: projectPhases.id, projectId: projectPhases.projectId })
    .from(projectPhases)
    .where(eq(projectPhases.id, existing.phaseId))
    .limit(1);
  if (!phase || phase.projectId !== projectId) {
    throw requirementError('Requirement not found.', 404, 'REQUIREMENT_NOT_FOUND');
  }

  const [referencing] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.documentCategoryId, requirementId))
    .limit(1);
  if (referencing) {
    throw requirementError(
      'Requirement cannot be deleted while documents reference it.',
      409,
      'REQUIREMENT_IN_USE',
    );
  }

  await db.delete(documentCategories).where(eq(documentCategories.id, requirementId));
  await recordAudit({
    userId: actorId,
    action: 'requirement.deleted',
    entityType: 'document_category',
    entityId: requirementId,
    metadata: { projectId, phaseId: existing.phaseId },
  });
};

/**
 * Idempotent backfill: inserts only the standard template rows missing from
 * each phase (projects created before Module 4, or phases backfilled via
 * phases/ensure). Existing custom requirements are left untouched.
 * Safe to call repeatedly.
 */
export const ensureRequirements = async (
  projectId: string,
  actorId: string,
): Promise<{ phases: PhaseRequirementsGroup[]; generated: boolean }> => {
  assertRequirementUuid(projectId, 'project id');
  assertRequirementUuid(actorId, 'actor id');
  await assertProjectExists(db, projectId);
  const phaseRows = await listProjectPhases(db, projectId);
  const phaseIds = phaseRows.map((phase) => phase.id);

  const existing = await db
    .select({ phaseId: documentCategories.phaseId, name: documentCategories.name })
    .from(documentCategories)
    .where(inArray(documentCategories.phaseId, phaseIds));
  const existingNamesByPhase = new Map<string, Set<string>>();
  for (const row of existing) {
    const names = existingNamesByPhase.get(row.phaseId) ?? new Set<string>();
    names.add(row.name.toLowerCase());
    existingNamesByPhase.set(row.phaseId, names);
  }

  const missing = buildCategorySeedRows(phaseRows).filter(
    (row) => !existingNamesByPhase.get(row.phaseId)?.has(row.name.toLowerCase()),
  );
  if (missing.length === 0) {
    return { phases: (await listRequirements(projectId)).phases, generated: false };
  }

  await db.insert(documentCategories).values(missing).onConflictDoNothing();
  await recordAudit({
    userId: actorId,
    action: 'requirement.generated',
    entityType: 'project',
    entityId: projectId,
    metadata: { count: missing.length, backfill: true },
  });
  return { phases: (await listRequirements(projectId)).phases, generated: true };
};

/** Seed requirements for freshly generated phases (used by project create / phases ensure). */
export const seedRequirementsForPhases = async (
  txOrDb: Pick<typeof db, 'insert'>,
  phases: ReadonlyArray<{ id: string; sequence: number }>,
): Promise<number> => {
  const seedRows = buildCategorySeedRows(phases);
  if (seedRows.length === 0) return 0;
  await txOrDb.insert(documentCategories).values(seedRows).onConflictDoNothing();
  return seedRows.length;
};
