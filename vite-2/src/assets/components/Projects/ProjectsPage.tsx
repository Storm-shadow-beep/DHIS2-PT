// src/assets/components/Projects/ProjectsPage.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { hasRole } from '../auth/authorization';
import { ROLE_NAMES } from '../services/authApi';
import { useAuth } from '../auth/AuthContext';
import {
  getProjectDocumentsApi,
  getProjectPhasesApi,
  getProjectRequirementsApi,
  getProjectsApi,
} from '../services/projectApi';
import './ProjectsPage.css';
import { PageLoading } from '../PageLoading/PageLoading';

interface ProjectDocument {
  id: string;
  title: string;
  phase: string;
  submittedBy: string;
  status: 'Approved' | 'Needs Revision' | 'Uploaded';
  uploadedAt: string;
  fileType: string;
  size: string;
  driveLinked: boolean;
  previewUrl: string | null;
  downloadUrl: string | null;
}

interface ProjectPhase {
  id: string;
  name: string;
  status: 'Current' | 'Completed' | 'Upcoming';
  startedAt: string;
  documents: ProjectDocument[];
}

interface Project {
  id: string;
  name: string;
  subtitle: string;
  manager: string;
  members: string[];
  phase: string;
  docsCompleted: number;
  docsTotal: number;
  documentationPercent: number;
  driveLinked: boolean;
  status: 'active' | 'closed';
  phases: ProjectPhase[];
}

export const ProjectsPage: React.FC = () => {
  const { user } = useAuth();
  const canCreateProject = hasRole(user, ROLE_NAMES.ADMINISTRATOR);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'closed'>('all');
  const [selectedPhase, setSelectedPhase] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activePhaseIndex, setActivePhaseIndex] = useState<number>(0);

  const loadProjects = async () => {
    setLoadError('');
    const { projects: apiProjects } = await getProjectsApi();
    // Load details per project independently: one project's failing
    // phases/documents request must not hide the other assigned projects.
    const loadedProjects = (await Promise.all(apiProjects.map(async (apiProject) => {
      let phases: Awaited<ReturnType<typeof getProjectPhasesApi>>['phases'] = [];
      let requirementGroups: Awaited<ReturnType<typeof getProjectRequirementsApi>>['phases'] = [];
      let documents: Awaited<ReturnType<typeof getProjectDocumentsApi>>['documents'] = [];
      try {
        const [phaseResult, requirementResult, documentResult] = await Promise.all([
          getProjectPhasesApi(apiProject.id),
          getProjectRequirementsApi(apiProject.id),
          getProjectDocumentsApi(apiProject.id),
        ]);
        phases = phaseResult.phases;
        requirementGroups = requirementResult.phases;
        documents = documentResult.documents;
      } catch (detailError) {
        // Keep the assigned project visible with empty details rather than
        // dropping the whole list when a detail endpoint denies/fails.
        console.error(`Could not load details for project ${apiProject.id}:`, detailError);
      }
      const phaseDocuments = phases.map((phase) => ({
        id: phase.id,
        name: phase.displayName || phase.name,
        status: phase.status === 'completed' ? 'Completed' : phase.status === 'current' ? 'Current' : 'Upcoming',
        startedAt: phase.startedAt ?? 'Not started',
        documents: documents
          .filter((document) => document.phaseId === phase.id)
          .map((document) => ({
            id: document.id,
            title: document.name,
            phase: phase.displayName || phase.name,
            submittedBy: document.uploaderName ?? 'Unknown user',
            status: document.status === 'approved'
              ? 'Approved'
              : document.status === 'rejected' || document.status === 'needs_revision'
                ? 'Needs Revision'
                : 'Uploaded',
            uploadedAt: new Date(document.uploadedAt).toISOString().slice(0, 10),
            fileType: document.name.split('.').pop()?.toUpperCase() ?? 'FILE',
            size: 'Stored in Drive',
            driveLinked: Boolean(document.driveFileId),
            previewUrl: document.driveLink,
            downloadUrl: document.driveLink,
          })),
      } satisfies ProjectPhase));
      const requiredDocuments = requirementGroups.reduce((total, group) => total + group.compliance.required, 0);
      const submittedDocuments = documents.length;
      const currentPhase = apiProject.currentPhase
        ?? phaseDocuments.find((phase) => phase.status === 'Current')?.name
        ?? phaseDocuments[0]?.name
        ?? 'Not started';

      return {
        id: String(apiProject.id),
        name: apiProject.name,
        subtitle: apiProject.subtitle ?? apiProject.description ?? '',
        manager: apiProject.projectManager?.fullName ?? 'Unassigned',
        members: apiProject.members?.map((member) => member.fullName)
          ?? (apiProject.member_names ? apiProject.member_names.split(',').map((name) => name.trim()) : []),
        phase: currentPhase,
        docsCompleted: submittedDocuments,
        docsTotal: Math.max(requiredDocuments, submittedDocuments),
        documentationPercent: Math.max(requiredDocuments, submittedDocuments) > 0
          ? Math.round((submittedDocuments / Math.max(requiredDocuments, submittedDocuments)) * 100)
          : 0,
        driveLinked: Boolean(apiProject.driveFolderId),
        status: apiProject.status === 'completed' ? 'closed' : 'active',
        phases: phaseDocuments,
      } satisfies Project;
    })));
    setProjects(loadedProjects);
    setIsLoading(false);
  };

  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        await loadProjects();
      } catch (error) {
        if (disposed) return;
        setIsLoading(false);
        setLoadError(error instanceof Error ? error.message : 'Could not load projects.');
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15000);
    const handleProjectsUpdated = () => void refresh();
    const handleDocumentsUpdated = () => void refresh();
    window.addEventListener('pms:projects-updated', handleProjectsUpdated);
    window.addEventListener('pms:documents-updated', handleDocumentsUpdated);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('pms:projects-updated', handleProjectsUpdated);
      window.removeEventListener('pms:documents-updated', handleDocumentsUpdated);
    };
  }, []);

  const selectedProjectId = searchParams.get('projectId');
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    if (!selectedProject) {
      setActivePhaseIndex(0);
      return;
    }

    const currentIndex = selectedProject.phases.findIndex((phase) => phase.status === 'Current');
    setActivePhaseIndex(currentIndex >= 0 ? currentIndex : 0);
  }, [selectedProject]);

  const handleProjectSelect = (projectId: string) => {
    navigate(`/projects?projectId=${projectId}`);
  };

  const handleSyncGoogleDrive = async (projectId: string) => {
    try {
      console.log(`[Google Drive Sync API Call]: Project ID ${projectId}`);
      alert(`Auto-sync requested for project: ${projectId}`);
    } catch (error) {
      console.error('Error syncing Google Drive:', error);
    }
  };

  const handleLinkGoogleDrive = async (projectId: string) => {
    try {
      setProjects((prev) => prev.map((project) => (project.id === projectId ? { ...project, driveLinked: true } : project)));
    } catch (error) {
      console.error('Error linking Google Drive:', error);
    }
  };

  const filteredProjects = projects.filter((project) => {
    const matchesTab = filterTab === 'all' || project.status === filterTab;
    const matchesPhase = selectedPhase === 'All' || project.phase === selectedPhase;
    const matchesSearch =
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.subtitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.manager.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesTab && matchesPhase && matchesSearch;
  });

  const phaseOptions = Array.from(new Set(projects.flatMap((project) => project.phases.map((phase) => phase.name))));

  const activePhase = selectedProject?.phases[activePhaseIndex] ?? null;
  const approvedCount = selectedProject?.phases.flatMap((phase) => phase.documents).filter((doc) => doc.status === 'Approved').length ?? 0;

  return (
    <div className="projects-container">
      <div className="projects-top-header">
        <h1 className="projects-title">Projects</h1>
        <div className="projects-action-buttons">
          {canCreateProject && <button className="btn-primary" onClick={() => navigate('/project-manager')}>New project</button>}
        </div>
      </div>

      {!isLoading && loadError && <p className="empty-state" role="alert">{loadError}</p>}
      {!isLoading && !loadError && projects.length === 0 && <p className="empty-state">No projects have been created yet.</p>}

      <div className="projects-filter-bar">
        <div className="filter-left-group">
          <div className="pill-group">
            <button className={`pill-btn ${filterTab === 'all' ? 'active' : ''}`} onClick={() => setFilterTab('all')}>
              All <span className="pill-count">{projects.length}</span>
            </button>
            <button className={`pill-btn ${filterTab === 'active' ? 'active' : ''}`} onClick={() => setFilterTab('active')}>
              Active <span className="pill-count">{projects.filter((project) => project.status === 'active').length}</span>
            </button>
            <button className={`pill-btn ${filterTab === 'closed' ? 'active' : ''}`} onClick={() => setFilterTab('closed')}>
              Closed <span className="pill-count">{projects.filter((project) => project.status === 'closed').length}</span>
            </button>
          </div>

          <div className="dropdown-filters">
            <select value={selectedPhase} onChange={(event) => setSelectedPhase(event.target.value)} className="filter-select">
              <option value="All">Phase: All</option>
              {phaseOptions.map((phaseName) => (
                <option key={phaseName} value={phaseName}>{phaseName}</option>
              ))}
            </select>

          </div>
        </div>

        <div className="filter-search-box">
          <input
            type="text"
            placeholder="Filter projects…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="projects-search-input"
          />
        </div>
      </div>

      <div className="projects-table-card">
        <table className="projects-table">
          <thead>
            <tr>
              <th>PROJECT</th>
              <th>PROJECT MANAGER</th>
              <th>PHASE</th>
              <th>DOCS</th>
              <th>DOCUMENTATION</th>
              <th>DRIVE</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6}>
                  <PageLoading message="Loading projects..." />
                </td>
              </tr>
            ) : filteredProjects.map((project) => (
              <tr
                key={project.id}
                className={selectedProjectId === project.id ? 'selected-row' : ''}
                onClick={() => handleProjectSelect(project.id)}
              >
                <td>
                  <div className="project-name">{project.name}</div>
                  <div className="project-subtitle">{project.subtitle}</div>
                </td>
                <td className="project-manager">{project.manager}</td>
                <td className="project-phase">{project.phase}</td>
                <td className="project-docs">
                  {project.docsCompleted} / {project.docsTotal}
                </td>
                <td className="project-progress-cell">
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${project.documentationPercent}%` }} />
                  </div>
                  <span className="progress-value">{project.documentationPercent}%</span>
                </td>
                <td>
                  {project.driveLinked ? (
                    <button
                      className="drive-btn linked"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleSyncGoogleDrive(project.id);
                      }}
                    >
                      <span className="dot green" /> Linked
                    </button>
                  ) : (
                    <button
                      className="drive-btn not-linked"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleLinkGoogleDrive(project.id);
                      }}
                    >
                      <span className="dot orange" /> Not linked
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedProject && (
        <div className="project-details-card">
          <div className="details-header-row">
            <div>
              <p className="detail-kicker">Selected project</p>
              <h2 className="detail-project-title">{selectedProject.name}</h2>
              <p className="detail-project-subtitle">{selectedProject.subtitle}</p>
            </div>
          </div>

          <div className="project-metrics-grid">
            <div className="metric-tile">
              <span className="metric-label">Project manager</span>
              <strong>{selectedProject.manager}</strong>
            </div>
            <div className="metric-tile">
              <span className="metric-label">Current phase</span>
              <strong>{selectedProject.phase}</strong>
            </div>
            <div className="metric-tile">
              <span className="metric-label">Approved docs</span>
              <strong>{approvedCount}</strong>
            </div>
            <div className="metric-tile">
              <span className="metric-label">Drive status</span>
              <strong>{selectedProject.driveLinked ? 'Linked' : 'Not linked'}</strong>
            </div>
          </div>

          <div className="project-members-block">
            <h3>Project members</h3>
            <div className="member-list">
              {selectedProject.members.map((member) => (
                <span key={member} className="member-pill">{member}</span>
              ))}
            </div>
          </div>

          <div className="phase-panel">
            <div className="phase-selector">
              {selectedProject.phases.map((phase, index) => (
                <button
                  key={phase.id}
                  className={`phase-pill ${activePhaseIndex === index ? 'active' : ''}`}
                  onClick={() => setActivePhaseIndex(index)}
                >
                  <span className="phase-indicator">
                    {phase.status === 'Current' ? <span className="green-dot" /> : <span className="phase-dot" />}
                  </span>
                  {phase.name}
                </button>
              ))}
            </div>

            {activePhase && (
              <div className="phase-content">
                <div className="phase-header-line">
                  <div>
                    <p className="phase-caption">Project phase</p>
                    <h3>{activePhase.name}</h3>
                  </div>
                  <span className={`phase-status-tag ${activePhase.status.toLowerCase().replace(/\s+/g, '-')}`}>
                    {activePhase.status}
                  </span>
                </div>

                <div className="phase-document-list">
                  {activePhase.documents.length > 0 ? (
                    activePhase.documents.map((document) => (
                      <div key={document.id} className="document-row">
                        <div className="document-main">
                          <div>
                            <h4>{document.title}</h4>
                            <div className="document-meta-row">
                              <span className="document-tag">{document.phase}</span>
                              <span>Submitted by {document.submittedBy}</span>
                              <span>{document.uploadedAt}</span>
                            </div>
                          </div>
                        </div>
                        <div className="document-side">
                          <span className={`status-badge ${document.status.toLowerCase().replace(/\s+/g, '-')}`}>
                            {document.status}
                          </span>
                          <button className="tiny-btn" onClick={() => navigate(`/documents?projectId=${selectedProject.id}`)}>
                            View in Documents
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="empty-state">No documents submitted for this phase yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
