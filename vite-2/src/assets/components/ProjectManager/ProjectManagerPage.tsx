import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { hasPermission, hasRole } from '../auth/authorization';
import { PERMISSION_NAMES, ROLE_NAMES } from '../services/authApi';
import {
  createProjectApi,
  createRequirementApi,
  deleteRequirementApi,
  getProjectPhasesApi,
  getProjectRequirementsApi,
  getProjectsApi,
  getUsersApi,
  updateProjectPhaseApi,
  updateProjectApi,
  updateProjectMembersApi,
  updateRequirementApi,
  type ApiRequirement,
} from '../services/projectApi';
import './ProjectManagerPage.css';
import { PageLoading } from '../PageLoading/PageLoading';

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
  requirements: ApiRequirement[];
}

interface RequirementDraft {
  name: string;
  isMandatory: boolean;
  dueDate: string;
}

const emptyDraft = (): RequirementDraft => ({ name: '', isMandatory: true, dueDate: '' });

const notifyWorkspaceChanged = (): void => {
  window.dispatchEvent(new CustomEvent('pms:projects-updated'));
  window.dispatchEvent(new CustomEvent('pms:documents-updated'));
};

export const ProjectManagerPage: React.FC = () => {
  const { user } = useAuth();
  const canManage = hasPermission(user, PERMISSION_NAMES.PROJECT_MANAGE);
  const isAdministrator = hasRole(user, ROLE_NAMES.ADMINISTRATOR);
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
  const [isLoading, setIsLoading] = useState(true);
  const [modalPhaseId, setModalPhaseId] = useState<string | null>(null);
  const [requirementDrafts, setRequirementDrafts] = useState<Record<string, RequirementDraft>>({});
  const [creatingForPhase, setCreatingForPhase] = useState<string | null>(null);
  const [savingRequirementId, setSavingRequirementId] = useState<string | null>(null);
  const [deletingRequirementId, setDeletingRequirementId] = useState<string | null>(null);

  const selected = useMemo(() => projects.find((project) => project.id === selectedId), [projects, selectedId]);
  const modalPhase = useMemo(
    () => phases.find((phase) => phase.id === modalPhaseId) ?? null,
    [phases, modalPhaseId],
  );
  const modalPhaseIndex = modalPhase ? phases.findIndex((phase) => phase.id === modalPhase.id) : -1;

  useEffect(() => {
    if (!modalPhaseId) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModalPhaseId(null);
    };
    window.addEventListener('keydown', handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [modalPhaseId]);

  const refresh = async () => {
    setIsLoading(true);
    try {
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
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!canManage) return;
    void refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load projects.'));
  }, [canManage]);

  useEffect(() => {
    if (!selected) {
      setPhases([]);
      setModalPhaseId(null);
      return;
    }
    Promise.all([getProjectPhasesApi(selected.id), getProjectRequirementsApi(selected.id)])
      .then(([{ phases: phaseRows }, { phases: requirementGroups }]) => setPhases(phaseRows.map((phase) => {
        const group = requirementGroups.find((entry) => entry.phase.id === phase.id);
        return {
          id: phase.id,
          name: phase.displayName || phase.name,
          status: phase.status,
          requiredDocuments: group?.compliance.required ?? 0,
          requirements: [...(group?.requirements ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
        };
      })))
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
      setPhases(result.phases.map((item) => {
        const current = phases.find((entry) => entry.id === item.id);
        return {
          id: item.id,
          name: item.displayName || item.name,
          status: item.status,
          requiredDocuments: current?.requiredDocuments ?? 0,
          requirements: current?.requirements ?? [],
        };
      }));
      setMessage(action === 'complete' ? 'Phase completed.' : 'Phase reopened.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update phase.');
    }
  };

  const draftFor = (phaseId: string): RequirementDraft =>
    requirementDrafts[phaseId] ?? emptyDraft();

  const createRequirement = async (phaseId: string) => {
    const draft = draftFor(phaseId);
    if (!draft.name.trim()) {
      setError('Requirement name is required.');
      return;
    }
    setCreatingForPhase(phaseId);
    setError('');
    try {
      const { requirement } = await createRequirementApi(selectedId, phaseId, {
        name: draft.name.trim(),
        isMandatory: draft.isMandatory,
        dueDate: draft.dueDate || null,
      });
      setPhases((current) => current.map((phase) => phase.id === phaseId
        ? {
          ...phase,
          requiredDocuments: phase.requiredDocuments + 1,
          requirements: [...phase.requirements, requirement].sort((a, b) => a.sortOrder - b.sortOrder),
        }
        : phase));
      setRequirementDrafts((current) => ({ ...current, [phaseId]: emptyDraft() }));
      setMessage('Requirement added.');
      notifyWorkspaceChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create requirement.');
    } finally {
      setCreatingForPhase(null);
    }
  };

  const saveRequirementDueDate = async (phaseId: string, requirementId: string, dueDate: string) => {
    setSavingRequirementId(requirementId);
    setError('');
    try {
      const { requirement } = await updateRequirementApi(selectedId, requirementId, {
        dueDate: dueDate || null,
      });
      setPhases((current) => current.map((phase) => phase.id === phaseId
        ? {
          ...phase,
          requirements: phase.requirements.map((item) => item.id === requirementId ? requirement : item),
        }
        : phase));
      setMessage('Due date updated.');
      notifyWorkspaceChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update due date.');
    } finally {
      setSavingRequirementId(null);
    }
  };

  const toggleRequirementMandatory = async (phaseId: string, requirement: ApiRequirement) => {
    setSavingRequirementId(requirement.id);
    setError('');
    try {
      const { requirement: updated } = await updateRequirementApi(selectedId, requirement.id, {
        isMandatory: !requirement.isMandatory,
      });
      setPhases((current) => current.map((phase) => phase.id === phaseId
        ? {
          ...phase,
          requirements: phase.requirements.map((item) => item.id === requirement.id ? updated : item),
        }
        : phase));
      notifyWorkspaceChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update requirement.');
    } finally {
      setSavingRequirementId(null);
    }
  };

  const deleteRequirement = async (phaseId: string, requirementId: string) => {
    setDeletingRequirementId(requirementId);
    setError('');
    try {
      await deleteRequirementApi(selectedId, requirementId);
      setPhases((current) => current.map((phase) => phase.id === phaseId
        ? {
          ...phase,
          requiredDocuments: Math.max(0, phase.requiredDocuments - 1),
          requirements: phase.requirements.filter((item) => item.id !== requirementId),
        }
        : phase));
      setMessage('Requirement deleted.');
      notifyWorkspaceChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete requirement.');
    } finally {
      setDeletingRequirementId(null);
    }
  };

  if (!canManage) return <div className="manager-page"><p>You do not have permission to manage projects.</p></div>;

  return (
    <div className="manager-page">
      <header className="manager-header">
        <div className="manager-heading"><p className="manager-kicker">{isAdministrator ? 'Administrator workspace' : 'Project manager workspace'}</p><h1>{isAdministrator ? 'Administrator' : 'Project Manager'}</h1><p>{isAdministrator ? 'Oversee projects, assign responsibilities, and manage project requirements.' : 'Configure projects, assign members, and publish requirements.'}</p></div>
        {isAdministrator && <button className="manager-primary" onClick={() => { setEditingId(null); setForm({ name: '', description: '', projectManagerId: '', memberIds: [] }); setShowForm(true); }}>New project</button>}
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
        {isLoading ? <PageLoading message="Loading projects and workspace details..." /> : selected && <><div className="manager-panel-title"><div><p className="manager-section-kicker">Project overview</p><h2>{selected.name}</h2><p>{selected.subtitle || 'No description added yet.'}</p></div>{isAdministrator && <button className="manager-secondary" onClick={() => { setEditingId(selected.id); setForm({ name: selected.name, description: selected.subtitle, projectManagerId: selected.projectManagerId ?? '', memberIds: selected.memberIds }); setShowForm(true); }}>Edit details</button>}</div>
          <div className="manager-summary-grid"><div><span>Project manager</span><strong>{users.find((entry) => String(entry.id) === selected.projectManagerId)?.fullName ?? 'Not assigned'}</strong></div><div><span>Team members</span><strong>{selected.memberIds.length}</strong></div><div><span>Requirements</span><strong>{phases.reduce((total, phase) => total + phase.requiredDocuments, 0)}</strong></div><div><span>Progress</span><strong>{phases.filter((phase) => phase.status === 'completed').length} / {phases.length || 0} phases</strong></div></div>
          <div className="phase-heading"><div><h3>Project phases</h3><p>Track progress, manage requirements and deadlines, and move the project forward.</p></div></div>
          <div className="phase-config">{phases.map((phase, index) => (
            <div className={`phase-card ${phase.status}`} key={phase.id}>
              <div className="phase-card-top"><span className="phase-number">0{index + 1}</span><span className={`phase-status ${phase.status}`}>{phase.status === 'not_started' ? 'Not started' : phase.status}</span></div>
              <strong>{phase.name}</strong>
              <span className="phase-requirements">{phase.requiredDocuments} requirements</span>
              {phase.status === 'current' && <button className="manager-secondary" type="button" onClick={() => void updatePhase(phase)}>Complete phase</button>}
              {phase.status === 'completed' && <button className="manager-secondary" type="button" onClick={() => void updatePhase(phase)}>Reopen phase</button>}
              <button
                className="manager-secondary phase-requirements-toggle"
                type="button"
                onClick={() => setModalPhaseId(phase.id)}
              >
                Manage requirements
              </button>
            </div>
          ))}</div>
          {modalPhase && (() => {
            const draft = draftFor(modalPhase.id);
            const submittedCount = modalPhase.requirements.filter((item) => item.documentCount > 0).length;
            const outstandingCount = modalPhase.requirements.length - submittedCount;
            return (
              <div
                className="requirements-modal-backdrop"
                role="presentation"
                onMouseDown={(event) => { if (event.target === event.currentTarget) setModalPhaseId(null); }}
              >
                <section
                  className="requirements-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="requirements-modal-title"
                >
                  <div className="requirements-modal-header">
                    <div>
                      <p className="manager-section-kicker">
                        Phase {modalPhaseIndex >= 0 ? `0${modalPhaseIndex + 1}` : ''} · {modalPhase.status === 'not_started' ? 'Not started' : modalPhase.status}
                      </p>
                      <h2 id="requirements-modal-title">{modalPhase.name}</h2>
                      <p className="requirements-modal-subtitle">
                        {selected?.name} · {modalPhase.requirements.length} requirements · {submittedCount} submitted · {outstandingCount} outstanding
                      </p>
                    </div>
                    <button
                      type="button"
                      className="manager-close"
                      aria-label="Close requirements"
                      onClick={() => setModalPhaseId(null)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="requirements-modal-body">
                    {modalPhase.requirements.length === 0 ? (
                      <p className="phase-requirements-empty">No requirements yet. Add the first one below.</p>
                    ) : (
                      <ul className="phase-requirements-list">
                        {modalPhase.requirements.map((requirement) => (
                          <li className="phase-requirement-row" key={requirement.id}>
                            <div className="phase-requirement-main">
                              <strong>{requirement.name}</strong>
                              <span className="phase-requirement-meta">
                                {requirement.isMandatory ? 'Mandatory' : 'Optional'} · {requirement.documentCount > 0 ? 'Submitted' : 'Outstanding'}
                              </span>
                            </div>
                            <label className="phase-requirement-due">
                              <span>Due date</span>
                              <input
                                type="date"
                                value={requirement.dueDate ?? ''}
                                disabled={savingRequirementId === requirement.id}
                                onChange={(event) => void saveRequirementDueDate(modalPhase.id, requirement.id, event.target.value)}
                              />
                            </label>
                            <div className="phase-requirement-actions">
                              <label className="phase-requirement-mandatory">
                                <input
                                  type="checkbox"
                                  checked={requirement.isMandatory}
                                  disabled={savingRequirementId === requirement.id}
                                  onChange={() => void toggleRequirementMandatory(modalPhase.id, requirement)}
                                />
                                Mandatory
                              </label>
                              <button
                                className="phase-requirement-delete"
                                type="button"
                                disabled={deletingRequirementId === requirement.id || requirement.documentCount > 0}
                                title={requirement.documentCount > 0 ? 'Cannot delete a requirement with linked documents.' : 'Delete requirement'}
                                onClick={() => void deleteRequirement(modalPhase.id, requirement.id)}
                              >
                                {deletingRequirementId === requirement.id ? 'Deleting…' : 'Delete'}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="phase-requirement-create">
                      <input
                        aria-label="New requirement name"
                        placeholder="New requirement name"
                        value={draft.name}
                        onChange={(event) => setRequirementDrafts((current) => ({
                          ...current,
                          [modalPhase.id]: { ...draftFor(modalPhase.id), name: event.target.value },
                        }))}
                      />
                      <label className="phase-requirement-mandatory">
                        <input
                          type="checkbox"
                          checked={draft.isMandatory}
                          onChange={(event) => setRequirementDrafts((current) => ({
                            ...current,
                            [modalPhase.id]: { ...draftFor(modalPhase.id), isMandatory: event.target.checked },
                          }))}
                        />
                        Mandatory
                      </label>
                      <input
                        aria-label="Due date"
                        type="date"
                        value={draft.dueDate}
                        onChange={(event) => setRequirementDrafts((current) => ({
                          ...current,
                          [modalPhase.id]: { ...draftFor(modalPhase.id), dueDate: event.target.value },
                        }))}
                      />
                      <button
                        className="manager-primary phase-requirement-add"
                        type="button"
                        disabled={creatingForPhase === modalPhase.id}
                        onClick={() => void createRequirement(modalPhase.id)}
                      >
                        {creatingForPhase === modalPhase.id ? 'Adding…' : 'Add requirement'}
                      </button>
                    </div>
                  </div>
                  <div className="requirements-modal-footer">
                    <button className="manager-secondary" type="button" onClick={() => setModalPhaseId(null)}>
                      Done
                    </button>
                  </div>
                </section>
              </div>
            );
          })()}
        </>}
      </section>
    </div>
  );
};

export default ProjectManagerPage;
