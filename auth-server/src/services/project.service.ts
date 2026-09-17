import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../db';
import {
  projectMembers,
  projectPhases,
  projects,
  roles,
  userRoles,
  users,
  type Project,
} from '../db/schema';
import { buildPhaseSeedRows, STANDARD_PHASES } from './phase.constants';
import { assertUuidWith } from '../utils/validation';
import { seedRequirementsForPhases } from './requirements.service';
import { ROLE_NAMES } from '../types/auth.types';
import { recordAudit } from './audit.service';
import { ensureProjectStructure } from './drive.service';

export const assertUuid = (value: string, label: string): void => {
  assertUuidWith(value, label, (notLabel) =>
    projectServiceError(`Invalid ${notLabel}`, 400, 'INVALID_UUID'),
  );
};

export type ProjectStatus = 'active' | 'completed' | 'on-hold';

export interface ProjectMemberSummary {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  isActive: boolean;
  assignedAt: Date;
  assignedBy: string | null;
  removedAt: Date | null;
}

export interface ProjectResponse {
  id: string;
  subtitle: string | null;
  published_at: null;
  member_names: string | null;
  member_ids: string | null;
  name: string;
  description: string | null;
  client: string | null;
  projectManagerId: string | null;
  status: string;
  currentPhase: string | null;
  startDate: string | null;
  expectedEndDate: string | null;
  actualEndDate: string | null;
  driveFolderId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  projectManager: {
    id: string;
    fullName: string;
    email: string;
  } | null;
  members: ProjectMemberSummary[];
}

export interface ProjectAssignableUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  client?: string | null;
  projectManagerId?: string | null;
  status?: ProjectStatus;
  currentPhase?: string | null;
  startDate?: string | null;
  expectedEndDate?: string | null;
  actualEndDate?: string | null;
  driveFolderId?: string | null;
  memberIds?: string[];
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  client?: string | null;
  projectManagerId?: string | null;
  status?: ProjectStatus;
  currentPhase?: string | null;
  startDate?: string | null;
  expectedEndDate?: string | null;
  actualEndDate?: string | null;
  driveFolderId?: string | null;
}

export type ProjectServiceError = Error & {
  statusCode: number;
  code: string;
};

export const projectServiceError = (
  message: string,
  statusCode: number,
  code: string,
): ProjectServiceError => Object.assign(new Error(message), { statusCode, code });

const assertOptionalText = (
  value: string | null | undefined,
  label: string,
  maxLength: number,
): void => {
  if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > maxLength)) {
    throw projectServiceError(`${label} must be at most ${maxLength} characters`, 400, 'VALIDATION_ERROR');
  }
};

const assertDate = (value: string | null | undefined, label: string): void => {
  if (value === undefined || value === null) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw projectServiceError(`${label} must use YYYY-MM-DD format`, 400, 'VALIDATION_ERROR');
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw projectServiceError(`${label} must be a valid date`, 400, 'VALIDATION_ERROR');
  }
};

const assertDateRange = (
  startDate: string | null | undefined,
  expectedEndDate: string | null | undefined,
  actualEndDate: string | null | undefined,
): void => {
  const dates = [
    ['startDate', startDate],
    ['expectedEndDate', expectedEndDate],
    ['actualEndDate', actualEndDate],
  ] as const;
  const parsed: Array<[string, Date]> = [];
  for (const [label, value] of dates) {
    if (typeof value === 'string') {
      parsed.push([label, new Date(`${value}T00:00:00.000Z`)]);
    }
  }

  for (let index = 1; index < parsed.length; index += 1) {
    const [previousLabel, previousDate] = parsed[index - 1];
    const [currentLabel, currentDate] = parsed[index];
    if (previousDate.getTime() > currentDate.getTime()) {
      throw projectServiceError(
        `${previousLabel} must be on or before ${currentLabel}`,
        400,
        'INVALID_DATE_RANGE',
      );
    }
  }
};

const assertStatus = (value: ProjectStatus | undefined): void => {
  if (value !== undefined && !['active', 'completed', 'on-hold'].includes(value)) {
    throw projectServiceError('status must be active, completed, or on-hold', 400, 'VALIDATION_ERROR');
  }
};

const validateMemberIds = (memberIds: string[] | undefined): string[] => {
  if (memberIds === undefined) return [];
  if (!Array.isArray(memberIds) || memberIds.length > 500) {
    throw projectServiceError('memberIds must contain at most 500 UUIDs', 400, 'VALIDATION_ERROR');
  }

  const uniqueIds = [...new Set(memberIds)];
  if (uniqueIds.length !== memberIds.length) {
    throw projectServiceError('memberIds must not contain duplicates', 400, 'VALIDATION_ERROR');
  }
  uniqueIds.forEach((id) => assertUuid(id, 'member id'));
  return uniqueIds;
};

const validateProjectFields = (
  input: CreateProjectInput | UpdateProjectInput,
  requireName: boolean,
): void => {
  if (requireName && (typeof input.name !== 'string' || input.name.trim().length === 0)) {
    throw projectServiceError('name is required', 400, 'VALIDATION_ERROR');
  }
  if (input.name !== undefined && (input.name.trim().length === 0 || input.name.length > 200)) {
    throw projectServiceError('name must be between 1 and 200 characters', 400, 'VALIDATION_ERROR');
  }
  assertOptionalText(input.description, 'description', 5000);
  assertOptionalText(input.client, 'client', 150);
  assertOptionalText(input.currentPhase, 'currentPhase', 50);
  assertOptionalText(input.driveFolderId, 'driveFolderId', 255);
  assertStatus(input.status);
  assertDate(input.startDate, 'startDate');
  assertDate(input.expectedEndDate, 'expectedEndDate');
  assertDate(input.actualEndDate, 'actualEndDate');
  if (input.projectManagerId !== undefined && input.projectManagerId !== null) {
    assertUuid(input.projectManagerId, 'project manager id');
  }
};

const getGlobalRoleNames = async (userId: string): Promise<string[]> => {
  const rows = await db
    .select({ roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.projectId)));
  return rows.map((row) => row.roleName);
};

const isAdministrator = async (userId: string): Promise<boolean> =>
  (await getGlobalRoleNames(userId)).includes(ROLE_NAMES.ADMINISTRATOR);

const assertActiveProjectManager = async (userId: string): Promise<void> => {
  const [user] = await db
    .select({ id: users.id, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || !user.isActive) {
    throw projectServiceError('Project manager not found', 404, 'USER_NOT_FOUND');
  }

  const roleRows = await db
    .select({ roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.projectId)));
  if (!roleRows.some((row) => row.roleName === ROLE_NAMES.PROJECT_MANAGER)) {
    throw projectServiceError('User is not a project manager', 400, 'INVALID_PROJECT_MANAGER');
  }
};

const getProjectRows = async (): Promise<Array<{
  project: Project;
  managerId: string | null;
  managerFullName: string | null;
  managerEmail: string | null;
}>> =>
  db
    .select({
      project: projects,
      managerId: users.id,
      managerFullName: users.fullName,
      managerEmail: users.email,
    })
    .from(projects)
    .leftJoin(users, eq(users.id, projects.projectManagerId))
    .orderBy(desc(projects.createdAt));

const getMembersByProjectIds = async (
  projectIds: string[],
): Promise<Map<string, ProjectMemberSummary[]>> => {
  const membersByProject = new Map<string, ProjectMemberSummary[]>();
  if (projectIds.length === 0) return membersByProject;

  const rows = await db
    .select({
      projectId: projectMembers.projectId,
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
    .where(inArray(projectMembers.projectId, projectIds));

  for (const row of rows) {
    const members = membersByProject.get(row.projectId) ?? [];
    members.push({
      id: row.id,
      userId: row.userId,
      fullName: row.fullName,
      email: row.email,
      isActive: row.isActive,
      assignedAt: row.assignedAt,
      assignedBy: row.assignedBy,
      removedAt: row.removedAt,
    });
    membersByProject.set(row.projectId, members);
  }
  return membersByProject;
};

const toProjectResponse = (
  row: {
    project: Project;
    managerId: string | null;
    managerFullName: string | null;
    managerEmail: string | null;
  },
  members: ProjectMemberSummary[],
): ProjectResponse => {
  const activeMembers = members.filter((member) => member.isActive);
  return {
    ...row.project,
    subtitle: row.project.description,
    published_at: null,
    member_names: activeMembers.length > 0
      ? activeMembers.map((member) => member.fullName).join(',')
      : null,
    member_ids: activeMembers.length > 0
      ? activeMembers.map((member) => member.userId).join(',')
      : null,
    projectManager: row.managerId && row.managerFullName && row.managerEmail
      ? { id: row.managerId, fullName: row.managerFullName, email: row.managerEmail }
      : null,
    members: activeMembers,
  };
};

export const listProjects = async (userId: string): Promise<ProjectResponse[]> => {
  assertUuid(userId, 'user id');
  const rows = await getProjectRows();
  const globalRoles = await getGlobalRoleNames(userId);

  if (globalRoles.includes(ROLE_NAMES.ADMINISTRATOR)) {
    const members = await getMembersByProjectIds(rows.map((row) => row.project.id));
    return rows.map((row) => toProjectResponse(row, members.get(row.project.id) ?? []));
  }

  const [activeMemberships, projectAssignments] = await Promise.all([
    db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(and(eq(projectMembers.userId, userId), eq(projectMembers.isActive, true))),
    db
      .select({ projectId: userRoles.projectId })
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), isNotNull(userRoles.projectId))),
  ]);

  const permittedProjectIds = new Set([
    ...activeMemberships.map((row) => row.projectId),
    ...projectAssignments.flatMap((row) => row.projectId ? [row.projectId] : []),
  ]);
  const permittedRows = rows.filter(
    (row) => row.project.projectManagerId === userId || permittedProjectIds.has(row.project.id),
  );
  const members = await getMembersByProjectIds(permittedRows.map((row) => row.project.id));
  return permittedRows.map((row) => toProjectResponse(row, members.get(row.project.id) ?? []));
};

export const listProjectAssignableUsers = async (): Promise<ProjectAssignableUser[]> => {
  const [activeUsers, roleRows] = await Promise.all([
    db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(users.fullName),
    db
      .select({
        userId: userRoles.userId,
        role: roles.displayName,
      })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(isNull(userRoles.projectId)),
  ]);

  const roleByUserId = new Map<string, string>();
  for (const row of roleRows) {
    const currentRole = roleByUserId.get(row.userId);
    if (!currentRole || row.role === 'Project Manager') roleByUserId.set(row.userId, row.role);
  }

  return activeUsers.map((user) => ({
    ...user,
    role: roleByUserId.get(user.id) ?? '',
  }));
};

const getProjectRow = async (projectId: string) => {
  const [row] = (await getProjectRows()).filter(({ project }) => project.id === projectId);
  if (!row) throw projectServiceError('Project not found', 404, 'PROJECT_NOT_FOUND');
  return row;
};

export const getProject = async (projectId: string): Promise<ProjectResponse> => {
  assertUuid(projectId, 'project id');
  const row = await getProjectRow(projectId);
  const members = await getMembersByProjectIds([projectId]);
  return toProjectResponse(row, members.get(projectId) ?? []);
};

export const createProject = async (
  input: CreateProjectInput,
  actorId: string,
): Promise<ProjectResponse> => {
  assertUuid(actorId, 'actor id');
  validateProjectFields(input, true);
  assertDateRange(input.startDate, input.expectedEndDate, input.actualEndDate);
  const memberIds = validateMemberIds(input.memberIds);
  const actorIsAdministrator = await isAdministrator(actorId);
  const managerId = input.projectManagerId === undefined
    ? (actorIsAdministrator ? null : actorId)
    : input.projectManagerId;
  if (managerId) {
    assertUuid(managerId, 'project manager id');
    await assertActiveProjectManager(managerId);
  }
  if (managerId === null && !actorIsAdministrator) {
    throw projectServiceError(
      'A project manager is required',
      400,
      'INVALID_PROJECT_MANAGER',
    );
  }

  if (managerId && managerId !== actorId && !actorIsAdministrator) {
    throw projectServiceError(
      'Only an administrator can assign another project manager',
      403,
      'INSUFFICIENT_PERMISSION',
    );
  }

  if (memberIds.length > 0) {
    const activeUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, memberIds), eq(users.isActive, true)));
    if (activeUsers.length !== memberIds.length) {
      throw projectServiceError('One or more project members are unavailable', 400, 'INVALID_MEMBER');
    }
  }

  const { created: project, requirementCount } = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(projects)
      .values({
        name: input.name.trim(),
        description: input.description ?? null,
        client: input.client ?? null,
        projectManagerId: managerId,
        status: input.status ?? 'active',
        currentPhase: input.currentPhase ?? STANDARD_PHASES[0].displayName,
        startDate: input.startDate ?? null,
        expectedEndDate: input.expectedEndDate ?? null,
        actualEndDate: input.actualEndDate ?? null,
        driveFolderId: input.driveFolderId ?? null,
        createdBy: actorId,
      })
      .returning();

    if (memberIds.length > 0) {
      await tx.insert(projectMembers).values(
        memberIds.map((userId) => ({ projectId: created.id, userId, assignedBy: actorId })),
      );
    }

    // Phase Engine (Module 3): every new project starts with the 7
    // standard phases; sequence 1 is current, the rest are not_started.
    // Document Requirements (Module 4): each new phase gets its standard
    // requirement rows copied from the global template.
    const generatedPhases = await tx
      .insert(projectPhases)
      .values(buildPhaseSeedRows(created.id))
      .returning({ id: projectPhases.id, sequence: projectPhases.sequence });
    const requirementCount = await seedRequirementsForPhases(tx, generatedPhases);

    return { created, requirementCount };
  });

  await recordAudit({
    userId: actorId,
    action: 'project.created',
    entityType: 'project',
    entityId: project.id,
    metadata: { projectManagerId: managerId, memberIds },
  });
  await recordAudit({
    userId: actorId,
    action: 'phase.generated',
    entityType: 'project',
    entityId: project.id,
    metadata: { count: STANDARD_PHASES.length, backfill: false },
  });
  await recordAudit({
    userId: actorId,
    action: 'requirement.generated',
    entityType: 'project',
    entityId: project.id,
    metadata: { count: requirementCount, backfill: false },
  });

  // Drive Integration (Module 6): best-effort folder provisioning. A Drive
  // outage must never fail project creation — failures are audited inside
  // the Drive service and surfaced via POST .../drive/ensure retry.
  // Manual driveFolderId wins: skip auto-provision when the caller linked one.
  if (!input.driveFolderId) {
    try {
      await ensureProjectStructure(project.id, actorId);
    } catch (error) {
      console.error(
        `[project:create] Drive provisioning deferred for ${project.id}: ${(error as Error).message.slice(0, 200)}`,
      );
    }
  }
  return getProject(project.id);
};

export const updateProject = async (
  projectId: string,
  input: UpdateProjectInput,
  actorId: string,
): Promise<ProjectResponse> => {
  assertUuid(projectId, 'project id');
  assertUuid(actorId, 'actor id');
  validateProjectFields(input, false);
  const existing = await getProjectRow(projectId);

  if (Object.keys(input).length === 0) {
    throw projectServiceError('At least one project field is required', 400, 'VALIDATION_ERROR');
  }

  assertDateRange(
    input.startDate === undefined ? existing.project.startDate : input.startDate,
    input.expectedEndDate === undefined ? existing.project.expectedEndDate : input.expectedEndDate,
    input.actualEndDate === undefined ? existing.project.actualEndDate : input.actualEndDate,
  );

  if (input.projectManagerId !== undefined) {
    if (input.projectManagerId !== null) await assertActiveProjectManager(input.projectManagerId);
    const managerChanged = input.projectManagerId !== existing.project.projectManagerId;
    if (managerChanged && !(await isAdministrator(actorId))) {
      throw projectServiceError(
        'Only an administrator can change the project manager',
        403,
        'INSUFFICIENT_PERMISSION',
      );
    }
  }

  const updates: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.description !== undefined) updates.description = input.description;
  if (input.client !== undefined) updates.client = input.client;
  if (input.projectManagerId !== undefined) updates.projectManagerId = input.projectManagerId;
  if (input.status !== undefined) updates.status = input.status;
  if (input.currentPhase !== undefined) updates.currentPhase = input.currentPhase;
  if (input.startDate !== undefined) updates.startDate = input.startDate;
  if (input.expectedEndDate !== undefined) updates.expectedEndDate = input.expectedEndDate;
  if (input.actualEndDate !== undefined) updates.actualEndDate = input.actualEndDate;
  if (input.driveFolderId !== undefined) updates.driveFolderId = input.driveFolderId;

  const [updated] = await db
    .update(projects)
    .set(updates)
    .where(eq(projects.id, projectId))
    .returning({ id: projects.id });
  if (!updated) throw projectServiceError('Project not found', 404, 'PROJECT_NOT_FOUND');

  await recordAudit({
    userId: actorId,
    action: 'project.updated',
    entityType: 'project',
    entityId: projectId,
    metadata: { fields: Object.keys(input) },
  });
  return getProject(projectId);
};
