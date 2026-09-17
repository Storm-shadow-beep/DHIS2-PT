import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import {
  documentApprovals,
  documentCategories,
  documentVersions,
  documents,
  projectPhases,
  users,
} from '../db/schema';
import { assertUuidWith } from '../utils/validation';
import { assertProjectExists } from './shared-guards';
import { recordAudit } from './audit.service';
import { trashFile, uploadFile } from './drive.service';
import {
  documentError,
  resolveApproval,
  resolveNewVersion,
  validateDecision,
  validateDocumentName,
  validateStatusFilter,
  type DocumentDecision,
  type DocumentError,
  type DocumentStatus,
} from './document.constants';

export { documentError };
export type { DocumentError, DocumentStatus, DocumentDecision };

export const assertDocumentUuid = (value: string, label: string): void => {
  assertUuidWith(value, label, (notLabel) => documentError(`Invalid ${notLabel}`, 400, 'INVALID_RESOURCE_ID'));
};

export interface DocumentResponse {
  id: string;
  projectId: string;
  phaseId: string;
  documentCategoryId: string | null;
  name: string;
  driveFileId: string | null;
  driveLink: string | null;
  currentVersion: number;
  status: string;
  uploadedBy: string;
  uploaderName: string | null;
  uploadedAt: Date;
  updatedAt: Date;
}

export interface DocumentVersionResponse {
  id: string;
  documentId: string;
  versionNumber: number;
  driveFileId: string | null;
  uploadedBy: string;
  uploadedAt: Date;
  notes: string | null;
}

export interface DocumentApprovalResponse {
  id: string;
  documentId: string;
  reviewerId: string;
  decision: string;
  decidedAt: Date;
}

/**
 * Load a phase scoped to its project. Cross-project phase ids read as
 * not found so callers cannot pivot across projects.
 */
const loadPhaseForProject = async (projectId: string, phaseId: string) => {
  const [phase] = await db
    .select()
    .from(projectPhases)
    .where(and(eq(projectPhases.id, phaseId), eq(projectPhases.projectId, projectId)))
    .limit(1);
  if (!phase) {
    throw documentError('Phase not found for this project.', 404, 'PHASE_NOT_FOUND');
  }
  return phase;
};

/**
 * Load a requirement (document category) scoped to its phase. A category
 * from another phase reads as not found.
 */
const loadCategoryForPhase = async (phaseId: string, categoryId: string) => {
  const [category] = await db
    .select()
    .from(documentCategories)
    .where(eq(documentCategories.id, categoryId))
    .limit(1);
  if (!category || category.phaseId !== phaseId) {
    throw documentError('Requirement not found for this phase.', 404, 'REQUIREMENT_NOT_FOUND');
  }
  return category;
};

/**
 * Load a document scoped to its project. Cross-project document ids read
 * as not found (non-leaking, mirroring the authorization guards).
 */
const loadDocumentForProject = async (projectId: string, documentId: string) => {
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!document || document.projectId !== projectId) {
    throw documentError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
  }
  return document;
};

export interface ListDocumentsFilters {
  phaseId?: unknown;
  status?: unknown;
}

export const listDocuments = async (
  projectId: string,
  filters: ListDocumentsFilters = {},
): Promise<{ documents: DocumentResponse[] }> => {
  assertDocumentUuid(projectId, 'project id');
  await assertProjectExists(db, projectId);

  const conditions = [eq(documents.projectId, projectId)];
  if (filters.phaseId !== undefined) {
    const phaseId = String(filters.phaseId);
    assertDocumentUuid(phaseId, 'phase id');
    await loadPhaseForProject(projectId, phaseId);
    conditions.push(eq(documents.phaseId, phaseId));
  }
  if (filters.status !== undefined) {
    const status = validateStatusFilter(filters.status);
    conditions.push(eq(documents.status, status));
  }

  const rows = await db
    .select({
      id: documents.id,
      projectId: documents.projectId,
      phaseId: documents.phaseId,
      documentCategoryId: documents.documentCategoryId,
      name: documents.name,
      driveFileId: documents.driveFileId,
      driveLink: documents.driveLink,
      currentVersion: documents.currentVersion,
      status: documents.status,
      uploadedBy: documents.uploadedBy,
      uploaderName: users.fullName,
      uploadedAt: documents.uploadedAt,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.uploadedBy))
    .where(and(...conditions))
    .orderBy(desc(documents.uploadedAt));

  return { documents: rows };
};

export const getDocument = async (
  projectId: string,
  documentId: string,
): Promise<{ document: DocumentResponse }> => {
  assertDocumentUuid(projectId, 'project id');
  assertDocumentUuid(documentId, 'document id');
  await assertProjectExists(db, projectId);
  const [document] = await db
    .select({
      id: documents.id,
      projectId: documents.projectId,
      phaseId: documents.phaseId,
      documentCategoryId: documents.documentCategoryId,
      name: documents.name,
      driveFileId: documents.driveFileId,
      driveLink: documents.driveLink,
      currentVersion: documents.currentVersion,
      status: documents.status,
      uploadedBy: documents.uploadedBy,
      uploadedAt: documents.uploadedAt,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.projectId, projectId)))
    .limit(1);
  if (!document) throw documentError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');

  const [uploader] = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, document.uploadedBy))
    .limit(1);

  return {
    document: { ...document, uploaderName: uploader?.fullName ?? null },
  };
};

export interface CreateDocumentInput {
  phaseId: unknown;
  name?: unknown;
  documentCategoryId?: unknown;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export const createDocument = async (
  projectId: string,
  input: CreateDocumentInput,
  actorId: string,
): Promise<{ document: DocumentResponse }> => {
  assertDocumentUuid(projectId, 'project id');
  assertDocumentUuid(actorId, 'actor id');
  if (typeof input.phaseId !== 'string' || input.phaseId.length === 0) {
    throw documentError('phaseId is required', 400, 'VALIDATION_ERROR');
  }
  assertDocumentUuid(input.phaseId, 'phase id');

  await assertProjectExists(db, projectId);
  await loadPhaseForProject(projectId, input.phaseId);

  let documentCategoryId: string | null = null;
  if (input.documentCategoryId !== undefined && input.documentCategoryId !== null && input.documentCategoryId !== '') {
    if (typeof input.documentCategoryId !== 'string') {
      throw documentError('documentCategoryId must be a UUID', 400, 'VALIDATION_ERROR');
    }
    assertDocumentUuid(input.documentCategoryId, 'requirement id');
    await loadCategoryForPhase(input.phaseId, input.documentCategoryId);
    documentCategoryId = input.documentCategoryId;
  }

  const name = input.name === undefined || input.name === null || input.name === ''
    ? validateDocumentName(input.filename)
    : validateDocumentName(input.name);

  const created = await db.transaction(async (tx) => {
      const [doc] = await tx
        .insert(documents)
        .values({
          projectId,
          phaseId: input.phaseId as string,
          documentCategoryId,
          name,
          pendingFile: input.buffer,
          pendingMimeType: input.mimeType,
          pendingFilename: input.filename,
          currentVersion: 1,
          status: 'submitted',
          uploadedBy: actorId,
        })
        .returning();
      await tx.insert(documentVersions).values({
        documentId: doc.id,
        versionNumber: 1,
        uploadedBy: actorId,
      });
      return doc;
  });

  await recordAudit({
    userId: actorId,
    action: 'document.uploaded',
    entityType: 'document',
    entityId: created.id,
    metadata: {
      projectId,
      phaseId: input.phaseId,
      documentCategoryId,
      name,
      storage: 'postgresql_pending_approval',
    },
  });

  return getDocument(projectId, created.id);
};

export interface CreateVersionInput {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  notes?: unknown;
}

const validateVersionNotes = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw documentError('notes must be a string', 400, 'VALIDATION_ERROR');
  }
  const trimmed = value.trim();
  if (trimmed.length > 2000) {
    throw documentError('notes must be at most 2000 characters', 400, 'VALIDATION_ERROR');
  }
  return trimmed.length === 0 ? null : trimmed;
};

export const createVersion = async (
  projectId: string,
  documentId: string,
  input: CreateVersionInput,
  actorId: string,
): Promise<{ document: DocumentResponse; version: DocumentVersionResponse }> => {
  assertDocumentUuid(projectId, 'project id');
  assertDocumentUuid(documentId, 'document id');
  assertDocumentUuid(actorId, 'actor id');
  await assertProjectExists(db, projectId);
  const existing = await loadDocumentForProject(projectId, documentId);
  const nextVersion = resolveNewVersion(existing);
  const notes = validateVersionNotes(input.notes);

  const outcome = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(documents)
      .set({
        pendingFile: input.buffer,
        pendingMimeType: input.mimeType,
        pendingFilename: input.filename,
        driveFileId: null,
        driveLink: null,
        currentVersion: nextVersion,
        // A new version re-opens review regardless of the previous state.
        status: 'submitted',
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId))
      .returning();
    const [version] = await tx
      .insert(documentVersions)
      .values({
        documentId,
        versionNumber: nextVersion,
        uploadedBy: actorId,
        notes,
      })
      .returning();
    return { updated, version };
  });

  await recordAudit({
    userId: actorId,
    action: 'document.version.created',
    entityType: 'document',
    entityId: documentId,
    metadata: {
      projectId,
      versionNumber: nextVersion,
      storage: 'postgresql_pending_approval',
    },
  });

  const { document } = await getDocument(projectId, documentId);
  return { document, version: outcome.version };
};

export const listVersions = async (
  projectId: string,
  documentId: string,
): Promise<{ versions: DocumentVersionResponse[] }> => {
  assertDocumentUuid(projectId, 'project id');
  assertDocumentUuid(documentId, 'document id');
  await assertProjectExists(db, projectId);
  await loadDocumentForProject(projectId, documentId);

  const rows = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.versionNumber));
  return { versions: rows };
};

export const recordApproval = async (
  projectId: string,
  documentId: string,
  rawDecision: unknown,
  reviewerId: string,
): Promise<{ document: DocumentResponse; approval: DocumentApprovalResponse }> => {
  assertDocumentUuid(projectId, 'project id');
  assertDocumentUuid(documentId, 'document id');
  assertDocumentUuid(reviewerId, 'reviewer id');
  const decision: DocumentDecision = validateDecision(rawDecision);
  await assertProjectExists(db, projectId);
  const existing = await loadDocumentForProject(projectId, documentId);
  const nextStatus = resolveApproval(existing, decision);
  if (decision === 'approved' && (!existing.pendingFile || !existing.pendingFilename || !existing.pendingMimeType)) {
    throw documentError('The pending document file is unavailable for approval.', 409, 'PENDING_FILE_UNAVAILABLE');
  }

  let driveResult: Awaited<ReturnType<typeof uploadFile>> | null = null;
  if (decision === 'approved') {
    driveResult = await uploadFile({
      projectId,
      phaseId: existing.phaseId,
      filename: existing.pendingFilename!,
      mimeType: existing.pendingMimeType!,
      buffer: existing.pendingFile!,
      actorId: reviewerId,
    });
  }

  const outcome = await db.transaction(async (tx) => {
    const [approval] = await tx
      .insert(documentApprovals)
      .values({ documentId, reviewerId, decision })
      .returning();
    const [updated] = await tx
      .update(documents)
      .set({
        status: nextStatus,
        driveFileId: driveResult?.driveFileId ?? existing.driveFileId,
        driveLink: driveResult
          ? driveResult.webViewLink
            ?? driveResult.webContentLink
            ?? `https://drive.google.com/file/d/${driveResult.driveFileId}/view`
          : existing.driveLink,
        pendingFile: decision === 'approved' ? null : existing.pendingFile,
        pendingMimeType: decision === 'approved' ? null : existing.pendingMimeType,
        pendingFilename: decision === 'approved' ? null : existing.pendingFilename,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId))
      .returning();
    if (driveResult) {
      await tx
        .update(documentVersions)
        .set({ driveFileId: driveResult.driveFileId })
        .where(and(
          eq(documentVersions.documentId, documentId),
          eq(documentVersions.versionNumber, existing.currentVersion),
        ));
    }
    return { approval, updated };
  });

  await recordAudit({
    userId: reviewerId,
    action: decision === 'approved' ? 'document.approved' : 'document.revision.requested',
    entityType: 'document',
    entityId: documentId,
    metadata: { projectId, decision, approvalId: outcome.approval.id },
  });

  const { document } = await getDocument(projectId, documentId);
  return { document, approval: outcome.approval };
};

export const listApprovals = async (
  projectId: string,
  documentId: string,
): Promise<{ approvals: DocumentApprovalResponse[] }> => {
  assertDocumentUuid(projectId, 'project id');
  assertDocumentUuid(documentId, 'document id');
  await assertProjectExists(db, projectId);
  await loadDocumentForProject(projectId, documentId);

  const rows = await db
    .select()
    .from(documentApprovals)
    .where(eq(documentApprovals.documentId, documentId))
    .orderBy(desc(documentApprovals.decidedAt));
  return { approvals: rows };
};

export const deleteDocument = async (
  projectId: string,
  documentId: string,
  actorId: string,
): Promise<{ trashed: boolean }> => {
  assertDocumentUuid(projectId, 'project id');
  assertDocumentUuid(documentId, 'document id');
  assertDocumentUuid(actorId, 'actor id');
  await assertProjectExists(db, projectId);
  const existing = await loadDocumentForProject(projectId, documentId);

  // Document versions and approvals cascade from the documents row.
  await db.delete(documents).where(eq(documents.id, documentId));

  // Best-effort Drive trash — the metadata delete succeeds even when Drive
  // is unreachable; the outcome is reported, never thrown.
  let trashed = false;
  try {
    if (existing.driveFileId) {
      await trashFile(existing.driveFileId, actorId);
      trashed = true;
    }
  } catch (error) {
    console.error(
      `[documents:delete] Drive trash failed for file ${existing.driveFileId}: ${(error as Error).message.slice(0, 200)}`,
    );
  }

  await recordAudit({
    userId: actorId,
    action: 'document.deleted',
    entityType: 'document',
    entityId: documentId,
    metadata: { projectId, name: existing.name, driveFileId: existing.driveFileId, trashed },
  });

  return { trashed };
};
