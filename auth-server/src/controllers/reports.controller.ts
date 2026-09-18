import { and, asc, eq } from 'drizzle-orm';
import { Request, Response } from 'express';
import { db } from '../db';
import { projectPhases, projectReports, projects, users } from '../db/schema';
import { assertProjectAccess, normalizeResourceId } from '../services/authorization.service';
import { assertUuidWith } from '../utils/validation';

const stringValue = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${field} is required.`), { statusCode: 400 });
  return value.trim();
};

export const listReports = async (req: Request, res: Response): Promise<void> => {
  const rows = await db.select({
    id: projectReports.id,
    projectId: projectReports.projectId,
    phaseId: projectReports.phaseId,
    project: projects.name,
    phase: projectPhases.displayName,
    title: projectReports.title,
    body: projectReports.body,
    submittedAt: projectReports.createdAt,
    submittedById: projectReports.submittedBy,
    submittedBy: users.fullName,
  }).from(projectReports)
    .innerJoin(projects, eq(projects.id, projectReports.projectId))
    .innerJoin(projectPhases, eq(projectPhases.id, projectReports.phaseId))
    .innerJoin(users, eq(users.id, projectReports.submittedBy))
    .orderBy(asc(projectReports.createdAt));

  const visible = [];
  for (const row of rows) {
    try {
      await assertProjectAccess(req.user!.sub, row.projectId, 'reportView');
      visible.push(row);
    } catch {
      // Reports are filtered by project visibility rather than leaked.
    }
  }
  res.json({ reports: visible });
};

export const createReport = async (req: Request, res: Response): Promise<void> => {
  const projectId = normalizeResourceId(stringValue(req.body?.projectId, 'projectId'), 'project id');
  const phaseId = stringValue(req.body?.phaseId, 'phaseId');
  assertUuidWith(phaseId, 'phase id', (label) => Object.assign(new Error(`Invalid ${label}.`), { statusCode: 400 }));
  await assertProjectAccess(req.user!.sub, projectId, 'reportCreate');

  const [phase] = await db.select({ id: projectPhases.id })
    .from(projectPhases)
    .where(and(eq(projectPhases.id, phaseId), eq(projectPhases.projectId, projectId)))
    .limit(1);
  if (!phase) throw Object.assign(new Error('The selected phase does not belong to this project.'), { statusCode: 400 });

  const [report] = await db.insert(projectReports).values({
    projectId,
    phaseId,
    submittedBy: req.user!.sub,
    title: stringValue(req.body?.title, 'title'),
    body: stringValue(req.body?.body, 'body'),
  }).returning({ id: projectReports.id });
  res.status(201).json({ report });
};

export const deleteReport = async (req: Request, res: Response): Promise<void> => {
  const reportId = normalizeResourceId(
    Array.isArray(req.params.reportId) ? req.params.reportId[0] : req.params.reportId,
    'report id',
  );
  const [report] = await db.select({ id: projectReports.id, submittedBy: projectReports.submittedBy })
    .from(projectReports)
    .where(eq(projectReports.id, reportId))
    .limit(1);

  if (!report) {
    res.status(404).json({ message: 'Report not found.' });
    return;
  }
  if (report.submittedBy !== req.user!.sub) {
    res.status(403).json({ message: 'Only the report publisher can delete this report.' });
    return;
  }

  await db.delete(projectReports).where(eq(projectReports.id, reportId));
  res.json({ message: 'Report deleted.' });
};
