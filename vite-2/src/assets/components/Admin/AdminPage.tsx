import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../auth/authorization';
import { PERMISSION_NAMES } from '../services/authApi';
import {
  assignAdminUserRoleApi,
  getAdminUsersApi,
  removeAdminUserRoleApi,
  setAdminUserActiveApi,
} from '../services/adminApi';
import type { AdminUser } from '../services/adminApi';
import './AdminPage.css';

type UserGroup = 'all' | 'team_member' | 'project_manager' | 'other';

const ROLE_OPTIONS = [
  { name: 'project_manager', label: 'Project Manager' },
  { name: 'team_member', label: 'Team Member' },
  { name: 'document_approver', label: 'Document Approver' },
  { name: 'administrator', label: 'Administrator' },
];

const groupForUser = (user: AdminUser): UserGroup => {
  if (user.roles.some((role) => role.name === 'team_member')) return 'team_member';
  if (user.roles.some((role) => role.name === 'project_manager')) return 'project_manager';
  return 'other';
};

const formatDate = (date: string | null): string => {
  if (!date) return 'Never';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(date));
};

export const AdminPage: React.FC = () => {
  const { user } = useAuth();
  const canManageRoles = hasPermission(user, PERMISSION_NAMES.ROLE_MANAGE);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<UserGroup>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadUsers = async (): Promise<void> => {
    try {
      const result = await getAdminUsersApi();
      setUsers(result.users);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Users could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadUsers();
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  const counts = useMemo(() => ({
    all: users.length,
    team_member: users.filter((entry) => groupForUser(entry) === 'team_member').length,
    project_manager: users.filter((entry) => groupForUser(entry) === 'project_manager').length,
    other: users.filter((entry) => groupForUser(entry) === 'other').length,
  }), [users]);

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((entry) => {
      const matchesGroup = selectedGroup === 'all' || groupForUser(entry) === selectedGroup;
      const matchesSearch = !query
        || entry.fullName.toLowerCase().includes(query)
        || entry.email.toLowerCase().includes(query)
        || entry.roles.some((role) => role.displayName.toLowerCase().includes(query));
      return matchesGroup && matchesSearch;
    });
  }, [search, selectedGroup, users]);

  const updateUser = async (userId: string, action: () => Promise<AdminUser>, success: string) => {
    setBusyUserId(userId);
    setMessage('');
    setError('');
    try {
      const updated = await action();
      setUsers((current) => current.map((entry) => (entry.id === userId ? updated : entry)));
      setMessage(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The user could not be updated.');
    } finally {
      setBusyUserId(null);
      setAssigningUserId(null);
    }
  };

  const handleStatusChange = (entry: AdminUser) => {
    void updateUser(
      entry.id,
      async () => (await setAdminUserActiveApi(entry.id, !entry.isActive)).user,
      `${entry.fullName} is now ${entry.isActive ? 'inactive' : 'active'}.`,
    );
  };

  const handleAssignRole = (entry: AdminUser, roleName: string) => {
    void updateUser(
      entry.id,
      async () => (await assignAdminUserRoleApi(entry.id, roleName)).user,
      'Role assigned successfully.',
    );
  };

  const handleRemoveRole = (entry: AdminUser, roleName: string) => {
    const role = entry.roles.find((item) => item.name === roleName);
    if (!role) return;
    if (!window.confirm(`Remove ${role.displayName} from ${entry.fullName}?`)) return;
    void updateUser(
      entry.id,
      async () => (await removeAdminUserRoleApi(entry.id, roleName)).user,
      'Role removed successfully.',
    );
  };

  if (!user || !hasPermission(user, PERMISSION_NAMES.USER_MANAGE)) {
    return <div className="admin-page"><div className="admin-empty-state"><h1>Access denied</h1><p>You do not have permission to manage users.</p></div></div>;
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <p className="admin-kicker">Administration</p>
          <h1>User management</h1>
          <p>Manage accounts, roles, and access across the project management system.</p>
        </div>
        <button className="admin-refresh-button" type="button" onClick={() => { setLoading(true); void loadUsers(); }} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh users'}
        </button>
      </header>

      {error && <div className="admin-alert admin-alert-error" role="alert">{error}</div>}
      {message && <div className="admin-alert admin-alert-success" role="status">{message}</div>}

      <section className="admin-toolbar" aria-label="User filters">
        <div className="admin-tabs" role="tablist" aria-label="User groups">
          {([
            ['all', 'All users'],
            ['team_member', 'Team Members'],
            ['project_manager', 'Project Managers'],
            ['other', 'Other roles'],
          ] as const).map(([value, label]) => (
            <button
              className={`admin-tab ${selectedGroup === value ? 'active' : ''}`}
              key={value}
              type="button"
              role="tab"
              aria-selected={selectedGroup === value}
              onClick={() => setSelectedGroup(value)}
            >
              {label}<span>{counts[value]}</span>
            </button>
          ))}
        </div>
        <label className="admin-search">
          <span className="sr-only">Search users</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email, or role" />
        </label>
      </section>

      <section className="admin-table-card">
        <div className="admin-table-heading">
          <div><h2>{selectedGroup === 'all' ? 'All registered users' : selectedGroup === 'other' ? 'Users with other roles' : selectedGroup === 'team_member' ? 'Team Members' : 'Project Managers'}</h2><p>{visibleUsers.length} user{visibleUsers.length === 1 ? '' : 's'} shown</p></div>
        </div>
        {loading ? <div className="admin-empty-state">Loading users...</div> : visibleUsers.length === 0 ? <div className="admin-empty-state"><h3>No users found</h3><p>Try changing the group or search term.</p></div> : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead><tr><th>User</th><th>Roles</th><th>Status</th><th>Last login</th><th className="admin-actions-column">Actions</th></tr></thead>
              <tbody>
                {visibleUsers.map((entry) => {
                  const isBusy = busyUserId === entry.id;
                  return <tr key={entry.id}>
                    <td><div className="admin-user-cell"><span className="admin-avatar">{entry.profilePicture ? <img src={entry.profilePicture} alt="" /> : entry.fullName.charAt(0).toUpperCase()}</span><div><strong>{entry.fullName}</strong><span>{entry.email}</span></div></div></td>
                    <td><div className="admin-role-list">{entry.roles.length ? entry.roles.map((role) => <span className="admin-role-chip" key={role.id}>{role.displayName}{canManageRoles && <button type="button" aria-label={`Remove ${role.displayName} from ${entry.fullName}`} onClick={() => handleRemoveRole(entry, role.name)} disabled={isBusy}>×</button>}</span>) : <span className="admin-muted">No roles</span>}</div></td>
                    <td><span className={`admin-status ${entry.isActive ? 'active' : 'inactive'}`}><i />{entry.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td className="admin-last-login">{formatDate(entry.lastLoginAt)}</td>
                    <td><div className="admin-actions">
                      <button className="admin-action-button" type="button" onClick={() => handleStatusChange(entry)} disabled={isBusy || entry.id === user.id && entry.isActive}>{entry.isActive ? 'Deactivate' : 'Activate'}</button>
                      {canManageRoles && <><button className="admin-action-button admin-action-primary" type="button" onClick={() => setAssigningUserId(assigningUserId === entry.id ? null : entry.id)} disabled={isBusy}>Assign role</button>
                        {assigningUserId === entry.id && <div className="admin-role-menu">{ROLE_OPTIONS.filter((role) => !entry.roles.some((assigned) => assigned.name === role.name)).map((role) => <button type="button" key={role.name} onClick={() => handleAssignRole(entry, role.name)}>{role.label}</button>)}{entry.roles.length === ROLE_OPTIONS.length && <span>All roles assigned</span>}</div>}
                      </>}
                    </div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminPage;
