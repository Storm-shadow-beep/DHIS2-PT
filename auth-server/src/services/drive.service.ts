import { Readable } from 'node:stream';
import { and, eq } from 'drizzle-orm';
import { GaxiosError } from 'gaxios';
import { db } from '../db';
import { driveFolders, projectPhases, projects } from '../db/schema';
import { assertUuidWith } from '../utils/validation';
import { recordAudit } from './audit.service';
import {
  DRIVE_FOLDER_MIME,
  driveError,
  getDriveClient,
  isDriveConfigured,
  type DriveError,
} from '../config/drive';
import { env } from '../config/env';

export const driveServiceError = (
  message: string,
  statusCode: number,
  code: string,
  retryAfterSeconds?: number,
): DriveError => driveError(message, statusCode, code, retryAfterSeconds);

const assertDriveUuid = (value: string, label: string): void => {
  assertUuidWith(value, label, (notLabel) => driveServiceError(`Invalid ${notLabel}`, 400, 'INVALID_RESOURCE_ID'));
};

const sanitizeFolderName = (raw: string): string => {
  const cleaned = raw.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 100) || 'Untitled project';
};

const sanitizeFileName = (raw: string): string => {
  const base = raw.split(/[\\/]/).pop() ?? raw;
  const cleaned = base.replace(/\0/g, '').trim().slice(0, 200);
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw driveServiceError('Invalid file name', 400, 'VALIDATION_ERROR');
  }
  return cleaned;
};

const BLOCKED_EXTENSIONS = new Set(['exe', 'bat', 'cmd', 'sh', 'msi', 'com', 'scr', 'ps1']);
const BLOCKED_MIME_PREFIXES = ['application/x-msdownload', 'application/x-sh'];

const assertUploadSafe = (filename: string, mimeType: string, sizeBytes: number): void => {
  if (sizeBytes <= 0) throw driveServiceError('File is empty', 400, 'VALIDATION_ERROR');
  if (sizeBytes > env.driveUploadMaxBytes) {
    throw driveServiceError(
      `File exceeds the ${Math.round(env.driveUploadMaxBytes / 1024 / 1024)} MB limit`,
      413,
      'FILE_TOO_LARGE',
    );
  }
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw driveServiceError('File type not allowed', 400, 'FILE_TYPE_BLOCKED');
  }
  if (BLOCKED_MIME_PREFIXES.some((prefix) => mimeType.toLowerCase().startsWith(prefix))) {
    throw driveServiceError('File type not allowed', 400, 'FILE_TYPE_BLOCKED');
  }
};

/** Map Google API failures to stable API errors without leaking internals. */
const mapGoogleError = (operation: string, error: unknown): DriveError => {
  if (error instanceof Error && 'statusCode' in error && 'code' in error) return error as DriveError;
  const status = (error as { response?: { status?: number }; code?: number })?.response?.status
    ?? (error as { code?: number })?.code;
  const message = error instanceof Error ? error.message : 'Unknown Drive error';
  // Server-side only: keep full detail out of the client response.
  console.error(`[drive:${operation}] failed (status=${status ?? 'n/a'}): ${message.slice(0, 300)}`);

  if (status === 404) return driveServiceError('Drive resource not found', 404, 'DRIVE_NOT_FOUND');
  if (status === 429) return driveServiceError('Drive rate limit exceeded, retry shortly', 503, 'DRIVE_UNAVAILABLE', 60);
  if (status === 403 && /rateLimit|quota|userRateLimit/i.test(message)) {
    return driveServiceError('Drive quota exceeded, retry shortly', 503, 'DRIVE_UNAVAILABLE', 60);
  }
  if (status === 403) return driveServiceError('Drive access denied — check sharing with the service account', 502, 'DRIVE_ACCESS_DENIED');
  if (typeof status === 'number' && status >= 500) {
    return driveServiceError('Drive service error, retry shortly', 502, 'DRIVE_OPERATION_FAILED', 30);
  }
  return driveServiceError('Drive operation failed', 502, 'DRIVE_OPERATION_FAILED');
};

const safeAudit = async (event: Parameters<typeof recordAudit>[0]): Promise<void> => {
  try {
    await recordAudit(event);
  } catch (error) {
    // Audit must never mask the Drive result.
    console.error(`[drive:audit] failed for ${event.action}: ${(error as Error).message.slice(0, 200)}`);
  }
};

export interface DriveFolderMapping {
  phaseId: string;
  phaseName: string;
  driveFolderId: string;
}

export interface EnsureResult {
  driveFolderId: string;
  folders: DriveFolderMapping[];
  created: boolean;
}

const getProjectOrThrow = async (projectId: string) => {
  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) throw driveServiceError('Project not found', 404, 'PROJECT_NOT_FOUND');
    return project;
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) throw error;
    throw mapGoogleError('db:getProject', error);
  }
};

const getProjectPhasesOrThrow = async (projectId: string) => {
  try {
    const rows = await db
      .select()
      .from(projectPhases)
      .where(eq(projectPhases.projectId, projectId))
      .orderBy(projectPhases.sequence);
    if (rows.length === 0) {
      throw driveServiceError('Project phases are not initialized', 404, 'PHASES_NOT_INITIALIZED');
    }
    return rows;
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) throw error;
    throw mapGoogleError('db:getPhases', error);
  }
};

const createFolder = async (
  drive: Awaited<ReturnType<typeof getDriveClient>>,
  name: string,
  parentId: string,
): Promise<string> => {
  try {
    const res = await drive.files.create({
      requestBody: { name, mimeType: DRIVE_FOLDER_MIME, parents: [parentId] },
      fields: 'id',
      supportsAllDrives: true,
    });
    if (!res.data.id) throw new Error('Drive returned no folder id');
    return res.data.id;
  } catch (error) {
    throw mapGoogleError('api:createFolder', error);
  }
};

/**
 * Ensure project root + 7 phase subfolders exist on the Shared Drive.
 * Idempotent: safe to call repeatedly; returns created=false when complete.
 */
export const ensureProjectStructure = async (
  projectId: string,
  actorId?: string,
): Promise<EnsureResult> => {
  try {
    assertDriveUuid(projectId, 'project id');
    if (!isDriveConfigured()) {
      throw driveServiceError(
        'Drive integration is not configured (missing service-account key or DRIVE_SHARED_DRIVE_ID)',
        500,
        'DRIVE_NOT_CONFIGURED',
      );
    }

    const project = await getProjectOrThrow(projectId);
    const phases = await getProjectPhasesOrThrow(projectId);
    const drive = await getDriveClient().catch((error: unknown) => {
      throw mapGoogleError('api:auth', error);
    });

    const parentId = env.driveRootFolderId || env.driveSharedDriveId;
    let rootId = project.driveFolderId;
    let created = false;

    // Verify a previously stored root still exists (handles manual Drive deletes).
    if (rootId) {
      try {
        await drive.files.get({ fileId: rootId, fields: 'id', supportsAllDrives: true });
      } catch (error) {
        const mapped = mapGoogleError('api:verifyRoot', error);
        if (mapped.code === 'DRIVE_NOT_FOUND') {
          rootId = null; // fall through to recreate
        } else {
          throw mapped;
        }
      }
    }

    try {
      if (!rootId) {
        rootId = await createFolder(drive, sanitizeFolderName(project.name), parentId);
        await db.update(projects).set({ driveFolderId: rootId, updatedAt: new Date() }).where(eq(projects.id, projectId));
        created = true;
      }

      const existing = await db.select().from(driveFolders).where(eq(driveFolders.projectId, projectId));
      const existingByPhase = new Map(existing.map((row) => [row.phaseId, row.driveFolderId]));
      const folders: DriveFolderMapping[] = [];

      for (const phase of phases) {
        try {
          let folderId = existingByPhase.get(phase.id) ?? null;
          if (folderId) {
            try {
              await drive.files.get({ fileId: folderId, fields: 'id', supportsAllDrives: true });
            } catch (error) {
              const mapped = mapGoogleError('api:verifyPhase', error);
              if (mapped.code !== 'DRIVE_NOT_FOUND') throw mapped;
              folderId = null; // recreate below
            }
          }
          if (!folderId) {
            folderId = await createFolder(drive, sanitizeFolderName(phase.displayName || phase.name), rootId);
            try {
              await db
                .insert(driveFolders)
                .values({ projectId, phaseId: phase.id, driveFolderId: folderId })
                .onConflictDoNothing();
            } catch (dbError) {
              throw mapGoogleError('db:saveFolder', dbError);
            }
            created = true;
          }
          folders.push({ phaseId: phase.id, phaseName: phase.displayName, driveFolderId: folderId });
        } catch (error) {
          // Per-phase failure aborts with context; already-created folders remain (idempotent retry).
          if (error instanceof Error && 'statusCode' in error) throw error;
          throw mapGoogleError('ensure:phase', error);
        }
      }

      await safeAudit({
        userId: actorId,
        action: 'drive.folder.ensured',
        entityType: 'project',
        entityId: projectId,
        metadata: { driveFolderId: rootId, created },
      });
      return { driveFolderId: rootId, folders, created };
    } catch (error) {
      await safeAudit({
        userId: actorId,
        action: 'drive.folder.failed',
        entityType: 'project',
        entityId: projectId,
        metadata: { message: error instanceof Error ? error.message.slice(0, 200) : 'unknown' },
      });
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) throw error;
    throw mapGoogleError('ensure:unknown', error);
  }
};

/** Resolve and validate the Drive folder for a project phase (non-leaking 404s). */
export const resolvePhaseFolder = async (projectId: string, phaseId: string): Promise<string> => {
  try {
    assertDriveUuid(projectId, 'project id');
    assertDriveUuid(phaseId, 'phase id');
    let rows: typeof driveFolders.$inferSelect[];
    try {
      rows = await db
        .select()
        .from(driveFolders)
        .where(and(eq(driveFolders.projectId, projectId), eq(driveFolders.phaseId, phaseId)))
        .limit(1);
    } catch (error) {
      throw mapGoogleError('db:resolveFolder', error);
    }
    if (rows.length === 0) {
      // Also 404 when the phase belongs to another project — no scope leak.
      throw driveServiceError('Drive folder is not linked for this phase — call POST .../drive/ensure first', 404, 'DRIVE_NOT_LINKED');
    }
    return rows[0].driveFolderId;
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) throw error;
    throw mapGoogleError('resolve:unknown', error);
  }
};

export interface UploadInput {
  projectId: string;
  phaseId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  actorId?: string;
}

export interface UploadResult {
  driveFileId: string;
  name: string;
  mimeType: string | null;
  webViewLink: string | null;
  webContentLink: string | null;
  size: string | null;
}

/** Upload a file buffer into the phase folder; returns Drive id + links. */
export const uploadFile = async (input: UploadInput): Promise<UploadResult> => {
  try {
    assertDriveUuid(input.projectId, 'project id');
    assertDriveUuid(input.phaseId, 'phase id');
    if (!isDriveConfigured()) throw driveServiceError('Drive integration is not configured', 500, 'DRIVE_NOT_CONFIGURED');
    const filename = sanitizeFileName(input.filename);
    const mimeType = (input.mimeType || 'application/octet-stream').slice(0, 150);
    assertUploadSafe(filename, mimeType, input.buffer.length);

    const folderId = await resolvePhaseFolder(input.projectId, input.phaseId);
    const drive = await getDriveClient().catch((error: unknown) => {
      throw mapGoogleError('api:auth', error);
    });

    try {
      const res = await drive.files.create({
        requestBody: { name: filename, parents: [folderId] },
        media: { mimeType, body: Readable.from(input.buffer) },
        fields: 'id, name, mimeType, webViewLink, webContentLink, size',
        supportsAllDrives: true,
      });
      if (!res.data.id) throw new Error('Drive returned no file id');
      await safeAudit({
        userId: input.actorId,
        action: 'drive.file.uploaded',
        entityType: 'project',
        entityId: input.projectId,
        metadata: { phaseId: input.phaseId, driveFileId: res.data.id, name: filename },
      });
      return {
        driveFileId: res.data.id,
        name: res.data.name ?? filename,
        mimeType: res.data.mimeType ?? null,
        webViewLink: res.data.webViewLink ?? null,
        webContentLink: res.data.webContentLink ?? null,
        size: res.data.size ?? String(input.buffer.length),
      };
    } catch (error) {
      if (error instanceof Error && 'statusCode' in error) throw error;
      if (error instanceof GaxiosError && error.response?.status === 404) {
        throw driveServiceError('Target Drive folder no longer exists — re-run POST .../drive/ensure', 404, 'DRIVE_NOT_FOUND');
      }
      throw mapGoogleError('api:upload', error);
    }
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) throw error;
    throw mapGoogleError('upload:unknown', error);
  }
};

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  modifiedTime: string | null;
  size: string | null;
  phaseId: string;
}

/** List non-trashed files in one phase folder (or all phases when phaseId omitted). */
export const listFiles = async (
  projectId: string,
  phaseId?: string,
): Promise<DriveFileItem[]> => {
  try {
    assertDriveUuid(projectId, 'project id');
    if (phaseId) assertDriveUuid(phaseId, 'phase id');
    if (!isDriveConfigured()) throw driveServiceError('Drive integration is not configured', 500, 'DRIVE_NOT_CONFIGURED');

    const project = await getProjectOrThrow(projectId);
    if (!project.driveFolderId) {
      throw driveServiceError('Project is not linked to Drive — call POST .../drive/ensure first', 404, 'DRIVE_NOT_LINKED');
    }

    let mappings: typeof driveFolders.$inferSelect[];
    try {
      mappings = phaseId
        ? await db
          .select()
          .from(driveFolders)
          .where(and(eq(driveFolders.projectId, projectId), eq(driveFolders.phaseId, phaseId)))
        : await db.select().from(driveFolders).where(eq(driveFolders.projectId, projectId));
    } catch (error) {
      throw mapGoogleError('db:listFolders', error);
    }
    if (mappings.length === 0) {
      throw driveServiceError('Drive folder is not linked — call POST .../drive/ensure first', 404, 'DRIVE_NOT_LINKED');
    }

    const drive = await getDriveClient().catch((error: unknown) => {
      throw mapGoogleError('api:auth', error);
    });
    const items: DriveFileItem[] = [];
    for (const mapping of mappings) {
      try {
        const res = await drive.files.list({
          q: `'${mapping.driveFolderId}' in parents and trashed = false`,
          fields: 'files(id, name, mimeType, webViewLink, modifiedTime, size)',
          pageSize: 100,
          orderBy: 'modifiedTime desc',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });
        for (const file of res.data.files ?? []) {
          if (!file.id || !file.name) continue;
          items.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType ?? 'application/octet-stream',
            webViewLink: file.webViewLink ?? null,
            modifiedTime: file.modifiedTime ?? null,
            size: file.size ?? null,
            phaseId: mapping.phaseId,
          });
        }
      } catch (error) {
        throw mapGoogleError('api:list', error);
      }
    }
    return items;
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) throw error;
    throw mapGoogleError('list:unknown', error);
  }
};

export interface StreamResult {
  stream: Readable;
  name: string;
  mimeType: string;
  size: string | null;
}

/**
 * Stream a file's content after verifying it lives under this project's
 * Drive folders (prevents cross-project file id guessing).
 */
export const streamFile = async (projectId: string, fileId: string): Promise<StreamResult> => {
  try {
    assertDriveUuid(projectId, 'project id');
    if (typeof fileId !== 'string' || fileId.length === 0 || fileId.length > 255 || /[^A-Za-z0-9_-]/.test(fileId)) {
      throw driveServiceError('Invalid file id', 400, 'VALIDATION_ERROR');
    }
    if (!isDriveConfigured()) throw driveServiceError('Drive integration is not configured', 500, 'DRIVE_NOT_CONFIGURED');

    let mappings: typeof driveFolders.$inferSelect[];
    try {
      mappings = await db.select().from(driveFolders).where(eq(driveFolders.projectId, projectId));
    } catch (error) {
      throw mapGoogleError('db:streamFolders', error);
    }
    if (mappings.length === 0) throw driveServiceError('Drive folder is not linked', 404, 'DRIVE_NOT_LINKED');
    const allowedParents = new Set(mappings.map((row) => row.driveFolderId));

    const drive = await getDriveClient().catch((error: unknown) => {
      throw mapGoogleError('api:auth', error);
    });

    try {
      const meta = await drive.files.get({
        fileId,
        fields: 'id, name, mimeType, parents, size',
        supportsAllDrives: true,
      });
      const parents = meta.data.parents ?? [];
      if (!parents.some((parent) => allowedParents.has(parent))) {
        throw driveServiceError('File not found', 404, 'DRIVE_NOT_FOUND');
      }
      const content = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' },
      );
      return {
        stream: content.data as Readable,
        name: meta.data.name ?? 'download',
        mimeType: meta.data.mimeType ?? 'application/octet-stream',
        size: meta.data.size ?? null,
      };
    } catch (error) {
      if (error instanceof Error && 'statusCode' in error) throw error;
      throw mapGoogleError('api:stream', error);
    }
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) throw error;
    throw mapGoogleError('stream:unknown', error);
  }
};
