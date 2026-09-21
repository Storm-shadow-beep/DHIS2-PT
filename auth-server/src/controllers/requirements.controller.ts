import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as requirementsService from '../services/requirements.service';

const paramAsString = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

const requestError = (message: string): requirementsService.RequirementError =>
  requirementsService.requirementError(message, 400, 'VALIDATION_ERROR');

const bodyAsRecord = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw requestError('Request body must be an object');
  }
  return body as Record<string, unknown>;
};

export const listRequirements = asyncHandler(async (req: Request, res: Response) => {
  const { phases } = await requirementsService.listRequirements(
    paramAsString(req.params.projectId),
  );
  res.json({ phases });
});

export const listPhaseRequirements = asyncHandler(async (req: Request, res: Response) => {
  const { phases } = await requirementsService.listRequirements(
    paramAsString(req.params.projectId),
  );
  const phaseId = paramAsString(req.params.phaseId);
  const group = phases.find((entry) => entry.phase.id === phaseId);
  if (!group) {
    throw requirementsService.requirementError(
      'Phase not found for this project.',
      404,
      'PHASE_NOT_FOUND',
    );
  }
  res.json({ phase: group.phase, requirements: group.requirements });
});

export const createRequirement = asyncHandler(async (req: Request, res: Response) => {
  const body = bodyAsRecord(req.body);
  const requirement = await requirementsService.createRequirement(
    paramAsString(req.params.projectId),
    paramAsString(req.params.phaseId),
    { name: body.name, isMandatory: body.isMandatory, sortOrder: body.sortOrder, dueDate: body.dueDate },
    req.user!.sub,
  );
  res.status(201).json({ message: 'Requirement created', requirement });
});

export const updateRequirement = asyncHandler(async (req: Request, res: Response) => {
  const body = bodyAsRecord(req.body);
  const requirement = await requirementsService.updateRequirement(
    paramAsString(req.params.projectId),
    paramAsString(req.params.requirementId),
    { name: body.name, isMandatory: body.isMandatory, sortOrder: body.sortOrder, dueDate: body.dueDate },
    req.user!.sub,
  );
  res.json({ message: 'Requirement updated', requirement });
});

export const deleteRequirement = asyncHandler(async (req: Request, res: Response) => {
  await requirementsService.deleteRequirement(
    paramAsString(req.params.projectId),
    paramAsString(req.params.requirementId),
    req.user!.sub,
  );
  res.json({ message: 'Requirement deleted' });
});

export const ensureRequirements = asyncHandler(async (req: Request, res: Response) => {
  const { phases, generated } = await requirementsService.ensureRequirements(
    paramAsString(req.params.projectId),
    req.user!.sub,
  );
  res.status(generated ? 201 : 200).json({
    message: generated ? 'Requirements generated' : 'Requirements already initialized',
    generated,
    phases,
  });
});
