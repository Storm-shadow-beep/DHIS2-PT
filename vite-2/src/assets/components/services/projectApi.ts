import { authFetch } from './authApi';

export interface ApiProject {
  id: string | number;
  name: string;
  subtitle?: string;
  published_at?: string | null;
  member_names?: string | null;
  member_ids?: string | null;
}

export interface ApiPhase {
  id: number;
  name: string;
  requiredDocuments: number;
  mandatoryDocuments: number;
}

export interface ApiReport {
  id: number;
  project: string;
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
export const getProjectPhasesApi = (id: string | number) => request<{ phases: ApiPhase[] }>(`/api/projects/${id}/phases`);
export const updatePhaseRequirementsApi = (projectId: string | number, phaseId: number, requiredDocuments: number) => request<{ message: string }>(`/api/projects/${projectId}/phases/${phaseId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ requiredDocuments }),
});
export const createProjectApi = (name: string, description: string, memberIds: Array<string | number>) => request<{ id: string | number }>('/api/projects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, description, memberIds }),
});
export const updateProjectApi = (id: string | number, name: string, description: string) => request<{ message: string }>(`/api/projects/${id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, description }),
});
export const updateProjectMembersApi = (id: string | number, userIds: Array<string | number>) => request<{ message: string }>(`/api/projects/${id}/members`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userIds }),
});
export const publishProjectApi = (id: string | number) => request<{ message: string }>(`/api/projects/${id}/publish`, { method: 'POST' });
export const getReportsApi = () => request<{ reports: ApiReport[] }>('/api/reports');
export const submitReportApi = (projectId: string | number, title: string, body: string) => request<{ id: string | number }>('/api/reports', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ projectId, title, body }),
});
