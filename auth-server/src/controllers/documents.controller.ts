import { Request, Response } from 'express';
import multer from 'multer';
import { asyncHandler } from '../utils/asyncHandler';
import { env } from '../config/env';
import * as documentsService from '../services/documents.service';

const paramAsString = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

const requestError = (message: string): documentsService.DocumentError =>
  documentsService.documentError(message, 400, 'VALIDATION_ERROR');

const bodyAsRecord = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw requestError('Request body must be an object');
  }
  return body as Record<string, unknown>;
};

const queryAsString = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  return value;
};

// Memory storage keeps uploads out of disk; size + count capped to protect the SA quota.
export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.driveUploadMaxBytes, files: 1 },
});

export const listDocuments = asyncHandler(async (req: Request, res: Response) => {
  const { documents } = await documentsService.listDocuments(
    paramAsString(req.params.projectId),
    {
      phaseId: queryAsString(req.query.phaseId),
      status: queryAsString(req.query.status),
    },
  );
  res.json({ documents });
});

export const getDocument = asyncHandler(async (req: Request, res: Response) => {
  const { document } = await documentsService.getDocument(
    paramAsString(req.params.projectId),
    paramAsString(req.params.documentId),
  );
  res.json({ document });
});

export const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
  const body = bodyAsRecord(req.body);
  if (!req.file) throw requestError('file is required (multipart field "file")');
  if (typeof body.phaseId !== 'string' || body.phaseId.length === 0) {
    throw requestError('phaseId is required');
  }
  const { document } = await documentsService.createDocument(
    paramAsString(req.params.projectId),
    {
      phaseId: body.phaseId,
      name: body.name,
      documentCategoryId: body.documentCategoryId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
    },
    req.user!.sub,
  );
  res.status(201).json({ message: 'Document uploaded', document });
});

export const listVersions = asyncHandler(async (req: Request, res: Response) => {
  const { versions } = await documentsService.listVersions(
    paramAsString(req.params.projectId),
    paramAsString(req.params.documentId),
  );
  res.json({ versions });
});

export const uploadVersion = asyncHandler(async (req: Request, res: Response) => {
  const body = bodyAsRecord(req.body);
  if (!req.file) throw requestError('file is required (multipart field "file")');
  const { document, version } = await documentsService.createVersion(
    paramAsString(req.params.projectId),
    paramAsString(req.params.documentId),
    {
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
      notes: body.notes,
    },
    req.user!.sub,
  );
  res.status(201).json({ message: 'Document version uploaded', document, version });
});

export const listApprovals = asyncHandler(async (req: Request, res: Response) => {
  const { approvals } = await documentsService.listApprovals(
    paramAsString(req.params.projectId),
    paramAsString(req.params.documentId),
  );
  res.json({ approvals });
});

export const reviewDocument = asyncHandler(async (req: Request, res: Response) => {
  const body = bodyAsRecord(req.body);
  const { document, approval } = await documentsService.recordApproval(
    paramAsString(req.params.projectId),
    paramAsString(req.params.documentId),
    body.decision,
    req.user!.sub,
  );
  res.json({ message: 'Document review recorded', document, approval });
});

export const updateDocument = asyncHandler(async (req: Request, res: Response) => {
  const body = bodyAsRecord(req.body);
  const { document } = await documentsService.updateDocument(
    paramAsString(req.params.projectId),
    paramAsString(req.params.documentId),
    { name: body.name, phaseId: body.phaseId, documentCategoryId: body.documentCategoryId },
    req.user!.sub,
  );
  res.json({ message: 'Document updated', document });
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  const { trashed } = await documentsService.deleteDocument(
    paramAsString(req.params.projectId),
    paramAsString(req.params.documentId),
    req.user!.sub,
  );
  res.json({
    message: trashed
      ? 'Document deleted'
      : 'Document deleted (Drive file could not be trashed — see server logs)',
    trashed,
  });
});
