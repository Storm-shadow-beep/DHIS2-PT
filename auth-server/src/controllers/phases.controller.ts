import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as phaseService from '../services/phase.service';

const paramAsString = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

const requestError = (message: string): phaseService.PhaseTransitionError =>
  phaseService.phaseTransitionError(message, 400, 'VALIDATION_ERROR');

const bodyAsRecord = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw requestError('Request body must be an object');
  }
  return body as Record<string, unknown>;
};

export const listPhases = asyncHandler(async (req: Request, res: Response) => {
  const phases = await phaseService.listPhases(paramAsString(req.params.projectId));
  res.json({ phases });
});

export const getCurrentPhase = asyncHandler(async (req: Request, res: Response) => {
  const phase = await phaseService.getCurrentPhase(paramAsString(req.params.projectId));
  res.json({ phase });
});

export const ensurePhases = asyncHandler(async (req: Request, res: Response) => {
  const { phases, generated } = await phaseService.ensurePhases(
    paramAsString(req.params.projectId),
    req.user!.sub,
  );
  res.status(generated ? 201 : 200).json({
    message: generated ? 'Phases generated' : 'Phases already initialized',
    generated,
    phases,
  });
});

export const updatePhase = asyncHandler(async (req: Request, res: Response) => {
  const body = bodyAsRecord(req.body);
  const action = body.action;
  if (action !== 'complete' && action !== 'reopen') {
    throw requestError("action must be 'complete' or 'reopen'");
  }
  const projectId = paramAsString(req.params.projectId);
  const phaseId = paramAsString(req.params.phaseId);

  if (action === 'complete') {
    const result = await phaseService.completePhase(projectId, phaseId, req.user!.sub);
    res.json({
      message: 'Phase completed',
      completedPhase: result.completedPhase,
      currentPhase: result.currentPhase,
      phases: result.phases,
    });
    return;
  }

  const result = await phaseService.reopenPhase(projectId, phaseId, req.user!.sub);
  res.json({
    message: 'Phase reopened',
    reopenedPhase: result.reopenedPhase,
    currentPhase: result.currentPhase,
    phases: result.phases,
  });
});
