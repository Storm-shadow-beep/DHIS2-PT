import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as membershipService from '../services/project-membership.service';

const paramAsString = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

const validationError = (message: string): Error & { statusCode: number; code: string } =>
  Object.assign(new Error(message), { statusCode: 400, code: 'VALIDATION_ERROR' });

export const listMembers = asyncHandler(async (req: Request, res: Response) => {
  const members = await membershipService.listProjectMembers(paramAsString(req.params.projectId));
  res.json({ members });
});

export const replaceMembers = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { userIds?: unknown };
  if (!body || !Array.isArray(body.userIds) || !body.userIds.every((id) => typeof id === 'string')) {
    throw validationError('userIds must be an array of UUID strings');
  }

  const members = await membershipService.replaceProjectMembers(
    paramAsString(req.params.projectId),
    body.userIds,
    req.user!.sub,
  );
  res.json({ message: 'Project members updated', members });
});
