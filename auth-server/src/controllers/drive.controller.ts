import { Request, Response } from 'express';
import multer from 'multer';
import { asyncHandler } from '../utils/asyncHandler';
import { driveServiceError } from '../services/drive.service';
import * as driveService from '../services/drive.service';
import { env } from '../config/env';

const paramAsString = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

const requestError = (message: string) => driveServiceError(message, 400, 'VALIDATION_ERROR');

// Memory storage keeps uploads out of disk; size + count capped to protect the SA quota.
export const driveUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.driveUploadMaxBytes, files: 1 },
});

const optionalQueryString = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  return value;
};

export const ensureDrive = asyncHandler(async (req: Request, res: Response) => {
  try {
    const projectId = paramAsString(req.params.projectId);
    if (!projectId) throw requestError('projectId is required');
    const result = await driveService.ensureProjectStructure(projectId, req.user?.sub);
    res.status(result.created ? 201 : 200).json({
      message: result.created ? 'Drive folders created' : 'Drive folders already linked',
      ...result,
    });
  } catch (error) {
    // asyncHandler forwards to the central error middleware; no raw Google detail leaves here.
    throw error;
  }
});

export const uploadDriveFile = asyncHandler(async (req: Request, res: Response) => {
  try {
    const projectId = paramAsString(req.params.projectId);
    if (!projectId) throw requestError('projectId is required');
    const phaseId =
      typeof req.body?.phaseId === 'string' ? req.body.phaseId : '';
    if (!phaseId) throw requestError('phaseId is required');
    if (!req.file) throw requestError('file is required (multipart field "file")');

    const result = await driveService.uploadFile({
      projectId,
      phaseId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
      actorId: req.user?.sub,
    });
    res.status(201).json({ message: 'File uploaded to Drive', file: result });
  } catch (error) {
    throw error;
  }
});

export const listDriveFiles = asyncHandler(async (req: Request, res: Response) => {
  try {
    const projectId = paramAsString(req.params.projectId);
    if (!projectId) throw requestError('projectId is required');
    const phaseId = optionalQueryString(req.query.phaseId);
    const files = await driveService.listFiles(projectId, phaseId);
    res.json({ files });
  } catch (error) {
    throw error;
  }
});

export const downloadDriveFile = asyncHandler(async (req: Request, res: Response) => {
  try {
    const projectId = paramAsString(req.params.projectId);
    const fileId = paramAsString(req.params.fileId);
    if (!projectId) throw requestError('projectId is required');
    if (!fileId) throw requestError('fileId is required');

    const { stream, name, mimeType, size } = await driveService.streamFile(projectId, fileId);
    try {
      // RFC 5987 encoding keeps non-ASCII names safe in Content-Disposition.
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
      if (size) res.setHeader('Content-Length', size);
    } catch (headerError) {
      // Header failure before streaming starts → clean 502, no partial body.
      throw driveServiceError('Failed to prepare download', 502, 'DRIVE_OPERATION_FAILED');
    }
    await new Promise<void>((resolve, reject) => {
      stream.on('error', (streamError: Error) => {
        // Mid-stream Drive failure: destroy socket; error already logged in the service mapper.
        if (!res.headersSent) {
          reject(driveServiceError('Drive streaming failed', 502, 'DRIVE_OPERATION_FAILED'));
          return;
        }
        res.destroy(streamError);
        reject(streamError);
      });
      res.on('close', () => resolve());
      stream.pipe(res);
    });
  } catch (error) {
    throw error;
  }
});
