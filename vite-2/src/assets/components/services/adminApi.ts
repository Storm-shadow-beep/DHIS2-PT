import { authFetch } from './authApi';

export interface AdminUserRole {
  id: string;
  name: string;
  displayName: string;
}

export interface AdminUser {
  id: string;
  fullName: string;
  profilePicture: string | null;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: AdminUserRole[];
}

const request = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await authFetch(url, options);
  const data = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) {
    throw new Error(data?.message || `Request failed (${response.status}).`);
  }
  return data as T;
};

export const getAdminUsersApi = () => request<{ users: AdminUser[] }>('/api/admin/users');

export const setAdminUserActiveApi = (userId: string, isActive: boolean) =>
  request<{ message: string; user: AdminUser }>(`/api/admin/users/${userId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive }),
  });

export const assignAdminUserRoleApi = (userId: string, roleName: string) =>
  request<{ message: string; user: AdminUser }>(`/api/admin/users/${userId}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roleName }),
  });

export const removeAdminUserRoleApi = (userId: string, roleName: string) =>
  request<{ message: string; user: AdminUser }>(
    `/api/admin/users/${userId}/roles/${encodeURIComponent(roleName)}`,
    { method: 'DELETE' },
  );
