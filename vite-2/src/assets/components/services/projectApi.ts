import { authFetch } from './authApi';

export interface ApiProject {
  id: string | number;
  description?: string | null;
  name: string;
  subtitle?: string;
  client?: string | null;
  status?: string;
  currentPhase?: string | null;
  driveFolderId?: string | null;
  projectManager?: { id: string; fullName: string; email: string } | null;
  members?: Array<{ userId: string; fullName: string; email: string }>;
  published_at?: string | null;
  member_names?: string | null;
  member_ids?: string | null;
}

export interface ApiPhase {
  id: string;
  projectId: string;
  name: string;
  displayName: string;
  sequence: number;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ApiRequirement {
  id: string;
  phaseId: string;
  name: string;
  isMandatory: boolean;
  sortOrder: number;
  dueDate: string | null;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiReport {
  id: string;
  projectId: string;
  phaseId: string;
  project: string;
  phase: string;
  submittedBy: string;
  submittedById: string;
  title: string;
  body: string;
  submittedAt: string;
}

const request = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await authFetch(url, options);
  const data = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new Error(data?.message || `Request failed (${response.status}).`);
  return data as T;
};

export const getProjectsApi = () => request<{ projects: ApiProject[] }>('/api/projects');
export const getUsersApi = () => request<{ users: { id: string | number; fullName: string; email: string; role: string }[] }>('/api/users');
export const getProjectApi = (id: string | number) => request<{ project: ApiProject }>(`/api/projects/${id}`);
export const getProjectMembersApi = (id: string | number) => request<{ members: unknown[] }>(`/api/projects/${id}/members`);
export const getProjectPhasesApi = (id: string | number) => request<{ phases: ApiPhase[] }>(`/api/projects/${id}/phases`);
export interface ApiDocument {
  id: string;
  projectId: string;
  phaseId: string;
  documentCategoryId?: string | null;
  name: string;
  driveFileId: string;
  driveLink: string;
  currentVersion: number;
  status: string;
  uploadedBy: string;
  uploaderName: string | null;
  uploadedAt: string;
  updatedAt: string;
}
export const getProjectDocumentsApi = (projectId: string | number) =>
  request<{ documents: ApiDocument[] }>(`/api/projects/${projectId}/documents`);
export const uploadProjectDocumentApi = async (
  projectId: string | number,
  phaseId: string,
  file: File,
  name?: string,
): Promise<ApiDocument> => {
  const body = new FormData();
  body.append('phaseId', phaseId);
  body.append('name', name?.trim() || file.name);
  body.append('file', file);
  const response = await authFetch(`/api/projects/${projectId}/documents`, { method: 'POST', body });
  const data = await response.json().catch(() => null) as { message?: string; document?: ApiDocument } | null;
  if (!response.ok || !data?.document) throw new Error(data?.message || `Upload failed (${response.status}).`);
  return data.document;
};
export const deleteProjectDocumentApi = (projectId: string | number, documentId: string) =>
  request<{ message: string }>(`/api/projects/${projectId}/documents/${documentId}`, { method: 'DELETE' });
export const updateProjectDocumentApi = (
  projectId: string | number,
  documentId: string,
  input: { name?: string; phaseId?: string; documentCategoryId?: string | null },
) => request<{ message: string; document: ApiDocument }>(`/api/projects/${projectId}/documents/${documentId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(input),
});
export const downloadProjectDriveFileApi = async (projectId: string | number, fileId: string, filename: string): Promise<void> => {
  const response = await authFetch(`/api/projects/${projectId}/drive/files/${fileId}/content`);
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(data?.message || `Download failed (${response.status}).`);
  }
  const blobUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(blobUrl);
};
export const getCurrentProjectPhaseApi = (id: string | number) => request<{ phase: ApiPhase | null }>(`/api/projects/${id}/phases/current`);
export const ensureProjectPhasesApi = (id: string | number) => request<{ phases: ApiPhase[]; generated: boolean }>(`/api/projects/${id}/phases/ensure`, {
  method: 'POST',
});
export const updateProjectPhaseApi = (projectId: string | number, phaseId: string, action: 'complete' | 'reopen') => request<{ message: string; phases: ApiPhase[] }>(`/api/projects/${projectId}/phases/${phaseId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action }),
});
export const createProjectApi = (
  name: string,
  description: string,
  memberIds: Array<string | number>,
  projectManagerId?: string | number | null,
) => request<{ id: string | number }>('/api/projects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, description, memberIds, projectManagerId: projectManagerId || null }),
});
export const updateProjectApi = (
  id: string | number,
  name: string,
  description: string,
  projectManagerId?: string | number | null,
) => request<{ message: string }>(`/api/projects/${id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, description, projectManagerId: projectManagerId || null }),
});
export const updateProjectMembersApi = (id: string | number, userIds: Array<string | number>) => request<{ message: string }>(`/api/projects/${id}/members`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userIds }),
});
export interface ApiRequirementsGroup {
  phase: {
    id: string;
    name: string;
    displayName: string;
    sequence: number;
    status: string;
  };
  compliance: {
    required: number;
    mandatory: number;
    submitted: number;
    outstanding: number;
    mandatorySubmitted: number;
    mandatoryOutstanding: number;
  };
  requirements: ApiRequirement[];
}

export const getProjectRequirementsApi = (id: string | number) => request<{ phases: ApiRequirementsGroup[] }>(`/api/projects/${id}/requirements`);
export const getPhaseRequirementsApi = (projectId: string | number, phaseId: string) => request<{ phase: ApiRequirementsGroup['phase']; requirements: ApiRequirement[] }>(`/api/projects/${projectId}/phases/${phaseId}/requirements`);
export const ensureProjectRequirementsApi = (id: string | number) => request<{ phases: ApiRequirementsGroup[]; generated: boolean }>(`/api/projects/${id}/requirements/ensure`, {
  method: 'POST',
});
export const createRequirementApi = (projectId: string | number, phaseId: string, input: { name: string; isMandatory?: boolean; sortOrder?: number; dueDate?: string | null }) => request<{ requirement: ApiRequirement }>(`/api/projects/${projectId}/phases/${phaseId}/requirements`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(input),
});
export const updateRequirementApi = (projectId: string | number, requirementId: string, input: Partial<Pick<ApiRequirement, 'name' | 'isMandatory' | 'sortOrder' | 'dueDate'>>) => request<{ requirement: ApiRequirement }>(`/api/projects/${projectId}/requirements/${requirementId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(input),
});
export const deleteRequirementApi = (projectId: string | number, requirementId: string) => request<{ message: string }>(`/api/projects/${projectId}/requirements/${requirementId}`, {
  method: 'DELETE',
});

export const getReportsApi = () => request<{ reports: ApiReport[] }>('/api/reports');
export const submitReportApi = (projectId: string | number, phaseId: string, title: string, body: string) => request<{ report: { id: string } }>('/api/reports', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ projectId, phaseId, title, body }),
});
export const deleteReportApi = (reportId: string) => request<{ message: string }>(`/api/reports/${reportId}`, {
  method: 'DELETE',
});
