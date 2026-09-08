import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../auth/authorization';
import { PERMISSION_NAMES } from '../services/authApi';
import {
  createProjectApi,
  getProjectPhasesApi,
  getProjectsApi,
  getUsersApi,
  publishProjectApi,
  updatePhaseRequirementsApi,
  updateProjectApi,
  updateProjectMembersApi,
} from '../services/projectApi';
import './ProjectManagerPage.css';

interface Project {
  id: string;
  name: string;
  subtitle: string;
  publishedAt: string | null;
  memberNames: string[];
  memberIds: Array<string | number>;
}

interface Phase {
  id: number;
  name: string;
  requiredDocuments: number;
}

export const ProjectManagerPage: React.FC = () => {
  const { user } = useAuth();
  const canManage = hasPermission(user, PERMISSION_NAMES.PROJECT_MANAGE);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<{ id: string | number; fullName: string; role: string }[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [phases, setPhases] = useState<Phase[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', memberIds: [] as Array<string | number> });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selected = useMemo(() => projects.find((project) => project.id === selectedId), [projects, selectedId]);

  const refresh = async () => {
    const [{ projects: rows }, { users: availableUsers }] = await Promise.all([getProjectsApi(), getUsersApi()]);
    setProjects(rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      subtitle: row.subtitle ?? '',
      publishedAt: row.published_at ?? null,
      memberNames: row.member_names ? row.member_names.split(',') : [],
      memberIds: row.member_ids ? row.member_ids.split(',') : [],
    })));
    setUsers(availableUsers);
    setSelectedId((current) => current || (rows[0] ? String(rows[0].id) : ''));
  };

  useEffect(() => {
    if (!canManage) return;
    void refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load projects.'));
  }, [canManage]);

  useEffect(() => {
    if (!selected) {
      setPhases([]);
      return;
    }
    void getProjectPhasesApi(selected.id)
      .then(({ phases: rows }) => setPhases(rows.map((phase) => ({ ...phase, requiredDocuments: Number(phase.requiredDocuments) || 0 }))))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load phases.'));
  }, [selected]);

  const saveProject = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (editingId) {
        await updateProjectApi(editingId, form.name, form.description);
        await updateProjectMembersApi(editingId, form.memberIds);
        setMessage('Project details updated.');
      } else {
        const result = await createProjectApi(form.name, form.description, form.memberIds);
        setSelectedId(String(result.id));
        setMessage('Project created.');
      }
      setShowForm(false);
      setEditingId(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save project.');
    }
  };

  const updatePhase = async (phase: Phase, value: number) => {
    const nextValue = Math.max(0, value);
    setPhases((current) => current.map((item) => item.id === phase.id ? { ...item, requiredDocuments: nextValue } : item));
    try {
      await updatePhaseRequirementsApi(selectedId, phase.id, nextValue);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update phase.');
    }
  };

  if (!canManage) return <div className="manager-page"><p>You do not have permission to manage projects.</p></div>;

  return (
    <div className="manager-page">
      <header className="manager-header">
        <div><p className="manager-kicker">Project manager workspace</p><h1>Project Manager</h1><p>Configure projects, assign members, and publish requirements.</p></div>
        <button className="manager-primary" onClick={() => { setEditingId(null); setForm({ name: '', description: '', memberIds: [] }); setShowForm(true); }}>New project</button>
      </header>
      {error && <p className="manager-error" role="alert">{error}</p>}
      {message && <p className="manager-success" role="status">{message}</p>}
      {showForm && <form className="manager-panel manager-create-form" onSubmit={saveProject}>
        <h2>{editingId ? 'Edit project' : 'Create project'}</h2>
        <label className="manager-field">Project name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label className="manager-field">Description<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <label className="manager-field">Members<select multiple value={form.memberIds.map(String)} onChange={(event) => setForm({ ...form, memberIds: Array.from(event.target.selectedOptions, (option) => option.value) })}>
          {users.filter((entry) => entry.role.toLowerCase() !== 'project manager').map((entry) => <option key={entry.id} value={entry.id}>{entry.fullName} · {entry.role}</option>)}
        </select></label>
        <button className="manager-primary" type="submit">Save project</button>
      </form>}
      <section className="manager-panel">
        <label className="manager-field">Project<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">Select a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select></label>
        {selected && <><div className="manager-panel-title"><div><h2>{selected.name}</h2><p>{selected.subtitle}</p></div><button className="manager-secondary" onClick={() => { setEditingId(selected.id); setForm({ name: selected.name, description: selected.subtitle, memberIds: selected.memberIds }); setShowForm(true); }}>Edit details</button></div>
          <div className="phase-config">{phases.map((phase) => <label className="manager-field" key={phase.id}>{phase.name}<input type="number" min="0" value={phase.requiredDocuments} disabled={Boolean(selected.publishedAt)} onChange={(event) => void updatePhase(phase, Number(event.target.value))} /></label>)}</div>
          {!selected.publishedAt && <button className="manager-primary" disabled={!phases.length || phases.some((phase) => phase.requiredDocuments < 1)} onClick={() => void publishProjectApi(selected.id).then(() => refresh()).then(() => setMessage('Project published.')).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not publish project.'))}>Publish project</button>}
        </>}
      </section>
    </div>
  );
};

export default ProjectManagerPage;
