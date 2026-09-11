import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as projectService from '../services/project.service';

const paramAsString = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

const requestError = (message: string): projectService.ProjectServiceError =>
  projectService.projectServiceError(message, 400, 'VALIDATION_ERROR');

const bodyAsRecord = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw requestError('Request body must be an object');
  }
  return body as Record<string, unknown>;
};

const has = (body: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(body, key);

const requiredString = (body: Record<string, unknown>, key: string): string => {
  const value = body[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw requestError(`${key} is required`);
  }
  return value;
};

const optionalString = (
  body: Record<string, unknown>,
  key: string,
): string | null | undefined => {
  if (!has(body, key)) return undefined;
  const value = body[key];
  if (value !== null && typeof value !== 'string') {
    throw requestError(`${key} must be a string or null`);
  }
  return value as string | null;
};

const optionalStatus = (
  body: Record<string, unknown>,
): projectService.ProjectStatus | undefined => {
  if (!has(body, 'status')) return undefined;
  if (typeof body.status !== 'string') throw requestError('status must be a string');
  if (!['active', 'completed', 'on-hold'].includes(body.status)) {
    throw requestError('status must be active, completed, or on-hold');
  }
  return body.status as projectService.ProjectStatus;
};

const optionalMemberIds = (body: Record<string, unknown>): string[] | undefined => {
  if (!has(body, 'memberIds')) return undefined;
  if (!Array.isArray(body.memberIds) || !body.memberIds.every((id) => typeof id === 'string')) {
    throw requestError('memberIds must be an array of UUID strings');
  }
  return body.memberIds as string[];
};

export const listProjects = asyncHandler(async (req: Request, res: Response) => {
  const projects = await projectService.listProjects(req.user!.sub);
  res.json({ projects });
});

export const listAssignableUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await projectService.listProjectAssignableUsers();
  res.json({ users });
});

export const getProject = asyncHandler(async (req: Request, res: Response) => {
  const project = await projectService.getProject(paramAsString(req.params.projectId));
  res.json({ project });
});

export const createProject = asyncHandler(async (req: Request, res: Response) => {
  const body = bodyAsRecord(req.body);
  const project = await projectService.createProject(
    {
      name: requiredString(body, 'name'),
      description: optionalString(body, 'description'),
      client: optionalString(body, 'client'),
      projectManagerId: optionalString(body, 'projectManagerId'),
      status: optionalStatus(body),
      currentPhase: optionalString(body, 'currentPhase'),
      startDate: optionalString(body, 'startDate'),
      expectedEndDate: optionalString(body, 'expectedEndDate'),
      actualEndDate: optionalString(body, 'actualEndDate'),
      driveFolderId: optionalString(body, 'driveFolderId'),
      memberIds: optionalMemberIds(body),
    },
    req.user!.sub,
  );
  res.status(201).json({ id: project.id, message: 'Project created', project });
});

export const updateProject = asyncHandler(async (req: Request, res: Response) => {
  const body = bodyAsRecord(req.body);
  const project = await projectService.updateProject(
    paramAsString(req.params.projectId),
    {
      ...(has(body, 'name') ? { name: requiredString(body, 'name') } : {}),
      ...(has(body, 'description') ? { description: optionalString(body, 'description') } : {}),
      ...(has(body, 'client') ? { client: optionalString(body, 'client') } : {}),
      ...(has(body, 'projectManagerId')
        ? { projectManagerId: optionalString(body, 'projectManagerId') }
        : {}),
      ...(has(body, 'status') ? { status: optionalStatus(body) } : {}),
      ...(has(body, 'currentPhase') ? { currentPhase: optionalString(body, 'currentPhase') } : {}),
      ...(has(body, 'startDate') ? { startDate: optionalString(body, 'startDate') } : {}),
      ...(has(body, 'expectedEndDate')
        ? { expectedEndDate: optionalString(body, 'expectedEndDate') }
        : {}),
      ...(has(body, 'actualEndDate') ? { actualEndDate: optionalString(body, 'actualEndDate') } : {}),
      ...(has(body, 'driveFolderId') ? { driveFolderId: optionalString(body, 'driveFolderId') } : {}),
    },
    req.user!.sub,
  );
  res.json({ message: 'Project updated', project });
});
