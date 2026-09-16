import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../auth/authorization';
import { PERMISSION_NAMES } from '../services/authApi';
import {
  createProjectApi,
  getProjectPhasesApi,
  getProjectRequirementsApi,
  getProjectsApi,
  getUsersApi,
  updateProjectPhaseApi,
  updateProjectApi,
  updateProjectMembersApi,
} from '../services/projectApi';
import './ProjectManagerPage.css';

interface Project {
  id: string;
  name: string;
  subtitle: string;
  memberNames: string[];
  memberIds: Array<string | number>;
}

interface Phase {
  id: string;
  name: string;
  requiredDocuments: number;
  status: string;
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
    Promise.all([getProjectPhasesApi(selected.id), getProjectRequirementsApi(selected.id)])
      .then(([{ phases: phaseRows }, { phases: requirementGroups }]) => setPhases(phaseRows.map((phase) => ({
        id: phase.id,
        name: phase.displayName || phase.name,
        status: phase.status,
        requiredDocuments: requirementGroups.find((group) => group.phase.id === phase.id)?.compliance.required ?? 0,
      }))))
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

  const updatePhase = async (phase: Phase) => {
    const action = phase.status === 'current' ? 'complete' : 'reopen';
    try {
      const result = await updateProjectPhaseApi(selectedId, phase.id, action);
      setPhases(result.phases.map((item) => ({
        id: item.id,
        name: item.displayName || item.name,
        status: item.status,
        requiredDocuments: phases.find((current) => current.id === item.id)?.requiredDocuments ?? 0,
      })));
      setMessage(action === 'complete' ? 'Phase completed.' : 'Phase reopened.');
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
          <div className="phase-config">{phases.map((phase) => <div className="manager-field" key={phase.id}>
            <span>{phase.name} ({phase.requiredDocuments} requirements)</span>
            {phase.status === 'current' && <button className="manager-secondary" type="button" onClick={() => void updatePhase(phase)}>Complete phase</button>}
            {phase.status === 'completed' && <button className="manager-secondary" type="button" onClick={() => void updatePhase(phase)}>Reopen phase</button>}
          </div>)}</div>
        </>}
      </section>
    </div>
  );
};

export default ProjectManagerPage;
