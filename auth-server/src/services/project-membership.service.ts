import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { projectMembers, projects, users } from '../db/schema';
import { recordAudit } from './audit.service';
import {
  assertUuid,
  projectServiceError,
  type ProjectMemberSummary,
} from './project.service';

const listMembers = async (projectId: string): Promise<ProjectMemberSummary[]> => {
  const rows = await db
    .select({
      id: projectMembers.id,
      userId: projectMembers.userId,
      fullName: users.fullName,
      email: users.email,
      isActive: projectMembers.isActive,
      assignedAt: projectMembers.assignedAt,
      assignedBy: projectMembers.assignedBy,
      removedAt: projectMembers.removedAt,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.isActive, true)));

  return rows;
};

const assertProjectExists = async (projectId: string): Promise<void> => {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw projectServiceError('Project not found', 404, 'PROJECT_NOT_FOUND');
};

export const listProjectMembers = async (projectId: string): Promise<ProjectMemberSummary[]> => {
  assertUuid(projectId, 'project id');
  await assertProjectExists(projectId);
  return listMembers(projectId);
};

export const replaceProjectMembers = async (
  projectId: string,
  userIds: string[],
  actorId: string,
): Promise<ProjectMemberSummary[]> => {
  assertUuid(projectId, 'project id');
  assertUuid(actorId, 'actor id');
  if (!Array.isArray(userIds) || userIds.length > 500) {
    throw projectServiceError('userIds must contain at most 500 UUIDs', 400, 'VALIDATION_ERROR');
  }

  const uniqueUserIds = [...new Set(userIds)];
  if (uniqueUserIds.length !== userIds.length) {
    throw projectServiceError('userIds must not contain duplicates', 400, 'VALIDATION_ERROR');
  }
  uniqueUserIds.forEach((userId) => assertUuid(userId, 'user id'));
  await assertProjectExists(projectId);

  if (uniqueUserIds.length > 0) {
    const activeUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, uniqueUserIds), eq(users.isActive, true)));
    if (activeUsers.length !== uniqueUserIds.length) {
      throw projectServiceError('One or more project members are unavailable', 400, 'INVALID_MEMBER');
    }
  }

  const desired = new Set(uniqueUserIds);
  const changes = await db.transaction(async (tx) => {
    const current = await tx
      .select({
        id: projectMembers.id,
        userId: projectMembers.userId,
        isActive: projectMembers.isActive,
      })
      .from(projectMembers)
      .where(eq(projectMembers.projectId, projectId));

    const currentByUserId = new Map(current.map((member) => [member.userId, member]));
    const added: string[] = [];
    const removed: string[] = [];
    const now = new Date();

    for (const member of current) {
      if (desired.has(member.userId)) {
        if (!member.isActive) {
          await tx
            .update(projectMembers)
            .set({
              isActive: true,
              assignedAt: now,
              assignedBy: actorId,
              removedAt: null,
            })
            .where(eq(projectMembers.id, member.id));
          added.push(member.userId);
        }
      } else if (member.isActive) {
        await tx
          .update(projectMembers)
          .set({ isActive: false, removedAt: now })
          .where(eq(projectMembers.id, member.id));
        removed.push(member.userId);
      }
    }

    const newMembers = uniqueUserIds.filter((userId) => !currentByUserId.has(userId));
    if (newMembers.length > 0) {
      await tx.insert(projectMembers).values(
        newMembers.map((userId) => ({
          projectId,
          userId,
          assignedBy: actorId,
        })),
      );
      added.push(...newMembers);
    }

    return { added, removed };
  });

  await recordAudit({
    userId: actorId,
    action: 'project.members.replaced',
    entityType: 'project',
    entityId: projectId,
    metadata: { added: changes.added, removed: changes.removed },
  });
  return listMembers(projectId);
};
