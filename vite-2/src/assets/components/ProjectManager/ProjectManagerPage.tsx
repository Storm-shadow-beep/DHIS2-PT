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
  projectManagerId: string | null;
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
  const [form, setForm] = useState({
    name: '',
    description: '',
    projectManagerId: '',
    memberIds: [] as Array<string | number>,
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const selected = useMemo(() => projects.find((project) => project.id === selectedId), [projects, selectedId]);

  const refresh = async () => {
    const [{ projects: rows }, { users: availableUsers }] = await Promise.all([getProjectsApi(), getUsersApi()]);
    setProjects(rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      subtitle: row.subtitle ?? '',
      memberNames: row.member_names ? row.member_names.split(',') : [],
      memberIds: row.member_ids ? row.member_ids.split(',') : [],
      projectManagerId: row.projectManager?.id ?? null,
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
    if (isSaving) return;
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      if (editingId) {
        await updateProjectApi(editingId, form.name, form.description, form.projectManagerId || null);
        await updateProjectMembersApi(editingId, form.memberIds);
        setMessage('Project details updated.');
      } else {
        const result = await createProjectApi(form.name, form.description, form.memberIds, form.projectManagerId || null);
        setSelectedId(String(result.id));
        setMessage('Project created.');
      }
      setShowForm(false);
      setEditingId(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save project.');
    } finally {
      setIsSaving(false);
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
        <div className="manager-heading"><p className="manager-kicker">Project manager workspace</p><h1>Project Manager</h1><p>Configure projects, assign members, and publish requirements.</p></div>
        <button className="manager-primary" onClick={() => {         setEditingId(null); setForm({ name: '', description: '', projectManagerId: '', memberIds: [] }); setShowForm(true); }}>New project</button>
      </header>
      {error && <p className="manager-error" role="alert">{error}</p>}
      {message && <p className="manager-success" role="status">{message}</p>}
      {showForm && <form className="manager-panel manager-create-form" onSubmit={saveProject}>
        <div className="manager-form-heading"><div><p className="manager-section-kicker">{editingId ? 'Project settings' : 'Get started'}</p><h2>{editingId ? 'Edit project' : 'Create a project'}</h2></div><button type="button" className="manager-close" disabled={isSaving} onClick={() => setShowForm(false)} aria-label="Close project form">×</button></div>
        <div className="manager-form-grid">
        <label className="manager-field">Project name<span className="manager-field-hint">Use a clear, recognizable name.</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Facility Asset Tracker" /></label>
        <label className="manager-field">Description<span className="manager-field-hint">Add a short summary for your team.</span><input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What is this project about?" /></label>
        <label className="manager-field">Project manager<span className="manager-field-hint">Choose the person responsible for delivery.</span><select required value={form.projectManagerId} onChange={(event) => setForm({ ...form, projectManagerId: event.target.value })}>
          <option value="">Select a project manager</option>
          {users.filter((entry) => entry.role.toLowerCase() === 'project manager').map((entry) => <option key={entry.id} value={entry.id}>{entry.fullName} · {entry.role}</option>)}
        </select></label>
        <label className="manager-field manager-members-field">Team members<span className="manager-field-hint">Hold Ctrl/Cmd to select more than one.</span><select multiple value={form.memberIds.map(String)} onChange={(event) => setForm({ ...form, memberIds: Array.from(event.target.selectedOptions, (option) => option.value) })}>
          {users.filter((entry) => entry.role.toLowerCase() === 'team member').map((entry) => <option key={entry.id} value={entry.id}>{entry.fullName} · {entry.role}</option>)}
        </select></label>
        </div>
        <div className="manager-form-actions">
          <button className="manager-secondary" type="button" disabled={isSaving} onClick={() => setShowForm(false)}>Cancel</button>
          <button className="manager-primary manager-save-button" type="submit" disabled={isSaving}>
            {isSaving && <span className="manager-sync-spinner" aria-hidden="true" />}
            {isSaving ? (editingId ? 'Saving changes...' : 'Creating project...') : (editingId ? 'Save changes' : 'Create project')}
          </button>
        </div>
        {isSaving && <div className="manager-sync-status" role="status" aria-live="polite">
          <span className="manager-sync-pulse" aria-hidden="true" />
          <span>{editingId ? 'Saving project changes...' : 'Creating project and preparing its workspace...'}</span>
        </div>}
      </form>}
      <section className="manager-panel">
        <div className="manager-selector-row"><label className="manager-field">Project<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">Select a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select></label><span className="manager-project-count">{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span></div>
        {selected && <><div className="manager-panel-title"><div><p className="manager-section-kicker">Project overview</p><h2>{selected.name}</h2><p>{selected.subtitle || 'No description added yet.'}</p></div><button className="manager-secondary" onClick={() => { setEditingId(selected.id); setForm({ name: selected.name, description: selected.subtitle, projectManagerId: selected.projectManagerId ?? '', memberIds: selected.memberIds }); setShowForm(true); }}>Edit details</button></div>
          <div className="manager-summary-grid"><div><span>Project manager</span><strong>{users.find((entry) => String(entry.id) === selected.projectManagerId)?.fullName ?? 'Not assigned'}</strong></div><div><span>Team members</span><strong>{selected.memberIds.length}</strong></div><div><span>Requirements</span><strong>{phases.reduce((total, phase) => total + phase.requiredDocuments, 0)}</strong></div><div><span>Progress</span><strong>{phases.filter((phase) => phase.status === 'completed').length} / {phases.length || 0} phases</strong></div></div>
          <div className="phase-heading"><div><h3>Project phases</h3><p>Track progress and move the project forward.</p></div></div>
          <div className="phase-config">{phases.map((phase, index) => <div className={`phase-card ${phase.status}`} key={phase.id}><div className="phase-card-top"><span className="phase-number">0{index + 1}</span><span className={`phase-status ${phase.status}`}>{phase.status === 'not_started' ? 'Not started' : phase.status}</span></div><strong>{phase.name}</strong><span className="phase-requirements">{phase.requiredDocuments} requirements</span>{phase.status === 'current' && <button className="manager-secondary" type="button" onClick={() => void updatePhase(phase)}>Complete phase</button>}{phase.status === 'completed' && <button className="manager-secondary" type="button" onClick={() => void updatePhase(phase)}>Reopen phase</button>}</div>)}</div>
        </>}
      </section>
    </div>
  );
};

export default ProjectManagerPage;
