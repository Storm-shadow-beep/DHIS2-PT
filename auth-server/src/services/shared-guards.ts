/**
 * Shared database guards.
 *
 * Single source of truth for the "project exists" check previously
 * copy-pasted across project/phase/requirements/membership services.
 * Callers may pass their module error factory to preserve exact API
 * contracts; the default matches the phase/requirements wording.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { projects } from '../db/schema';

export type DbOrTx = Pick<typeof db, 'select'>;

export type ProjectNotFoundFactory = () => Error;

const defaultNotFoundFactory: ProjectNotFoundFactory = () =>
  Object.assign(new Error('Project not found.'), {
    statusCode: 404,
    code: 'PROJECT_NOT_FOUND',
  });

export const assertProjectExists = async (
  txOrDb: DbOrTx,
  projectId: string,
  onError: ProjectNotFoundFactory = defaultNotFoundFactory,
): Promise<void> => {
  const [project] = await txOrDb
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) {
    throw onError();
  }
};
