/**
 * Document Management — canonical statuses and pure helpers (Module 5).
 *
 * This module is intentionally dependency-free (no db/env imports) so the
 * status and version rules can be unit-tested without a database. All
 * database and Drive access lives in `documents.service.ts`.
 *
 * Module Breakdown reference: Module 5 — Document Management. Upload /
 * download / view metadata, version history per document, and the
 * approval workflow (submitted -> approved | needs_revision).
 */

export type DocumentStatus = 'submitted' | 'approved' | 'needs_revision';

export const DOCUMENT_STATUSES: readonly DocumentStatus[] = [
  'submitted',
  'approved',
  'needs_revision',
] as const;

export type DocumentDecision = 'approved' | 'needs_revision';

export const DOCUMENT_DECISIONS: readonly DocumentDecision[] = [
  'approved',
  'needs_revision',
] as const;

export type DocumentError = Error & {
  statusCode: number;
  code: string;
};

export const documentError = (
  message: string,
  statusCode: number,
  code: string,
): DocumentError => Object.assign(new Error(message), { statusCode, code });

export interface VersionedDocumentLike {
  id: string;
  currentVersion: number;
  status: string;
}

/** Validate a document display name. Returns the trimmed name. */
export const validateDocumentName = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw documentError('name is required', 400, 'VALIDATION_ERROR');
  }
  const trimmed = value.trim();
  if (trimmed.length > 255) {
    throw documentError('name must be at most 255 characters', 400, 'VALIDATION_ERROR');
  }
  return trimmed;
};

/** Validate an approval decision. Returns the decision. */
export const validateDecision = (value: unknown): DocumentDecision => {
  if (value !== 'approved' && value !== 'needs_revision') {
    throw documentError(
      "decision must be 'approved' or 'needs_revision'",
      400,
      'VALIDATION_ERROR',
    );
  }
  return value;
};

/** Validate a status filter value. Returns the status. */
export const validateStatusFilter = (value: unknown): DocumentStatus => {
  if (
    value !== 'submitted' &&
    value !== 'approved' &&
    value !== 'needs_revision'
  ) {
    throw documentError(
      "status must be 'submitted', 'approved', or 'needs_revision'",
      400,
      'VALIDATION_ERROR',
    );
  }
  return value;
};

/**
 * Resolve an approval transition. Only a `submitted` document can be
 * reviewed — approved documents or documents already flagged for revision
 * must receive a new version (which resets them to `submitted`) before
 * another decision. Returns the resulting status.
 */
export const resolveApproval = <T extends VersionedDocumentLike>(
  document: T,
  decision: DocumentDecision,
): DocumentStatus => {
  if (!document || typeof document.status !== 'string') {
    throw documentError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
  }
  if (document.status !== 'submitted') {
    throw documentError(
      'Only a submitted document can be reviewed. Upload a new version first.',
      409,
      'INVALID_DOCUMENT_TRANSITION',
    );
  }
  return decision;
};

/** Resolve the next version number for a re-upload. */
export const resolveNewVersion = <T extends VersionedDocumentLike>(
  document: T,
): number => {
  if (!document) {
    throw documentError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
  }
  if (!Number.isInteger(document.currentVersion) || document.currentVersion < 1) {
    throw documentError('Document version state is invalid.', 500, 'DOCUMENT_VERSION_INVALID');
  }
  return document.currentVersion + 1;
};
