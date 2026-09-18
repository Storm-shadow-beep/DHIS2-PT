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

const STANDARD_PHASES = ['Initiation', 'Requirements', 'System Design', 'Testing & UAT', 'Deployment'];

const normalizeProjectPhases = (phases: ProjectPhase[] = []): ProjectPhase[] => {
  const phaseMap = new Map(phases.map((phase) => [phase.name, phase]));

  return STANDARD_PHASES.map((phaseName, index) => {
    const existingPhase = phaseMap.get(phaseName);

    return {
      id: existingPhase?.id ?? `phase-${index + 1}`,
      name: phaseName,
      status: existingPhase?.status ?? (index === 0 ? 'Current' : 'Upcoming'),
      startedAt: existingPhase?.startedAt ?? `Phase ${index + 1}`,
      documents: existingPhase?.documents ?? [],
    };
  });
};

const seedProjectDocSets: Project[] = [
  {
    id: 'proj-1',
    name: 'Document Organization Module',
    subtitle: 'UDSM Practical Training',
    manager: 'Peter Salum',
    members: ['Peter Salum', 'Grace Mlay', 'Samuel Mtei', 'Millicent Amani'],
    phase: 'System Design',
    docsCompleted: 16,
    docsTotal: 26,
    documentationPercent: 62,
    driveLinked: true,
    status: 'active',
    phases: normalizeProjectPhases([
      {
        id: 'phase-1',
        name: 'Initiation',
        status: 'Completed',
        startedAt: 'May 2024',
        documents: [
          { id: 'doc-1', title: 'Project charter', phase: 'Initiation', submittedBy: 'Peter Salum', status: 'Approved', uploadedAt: '2024-05-06', fileType: 'PDF', size: '2.1 MB', driveLinked: true, previewUrl: '#', downloadUrl: '#' },
          { id: 'doc-2', title: 'Stakeholder register', phase: 'Initiation', submittedBy: 'Grace Mlay', status: 'Approved', uploadedAt: '2024-05-15', fileType: 'XLSX', size: '480 KB', driveLinked: true, previewUrl: '#', downloadUrl: '#' },
        ],
      },
      {
        id: 'phase-2',
        name: 'Requirements',
        status: 'Completed',
        startedAt: 'Jun 2024',
        documents: [
          { id: 'doc-3', title: 'Requirements specification', phase: 'Requirements', submittedBy: 'Samuel Mtei', status: 'Approved', uploadedAt: '2024-06-18', fileType: 'DOCX', size: '1.8 MB', driveLinked: true, previewUrl: '#', downloadUrl: '#' },
          { id: 'doc-4', title: 'Use case matrix', phase: 'Requirements', submittedBy: 'Millicent Amani', status: 'Needs Revision', uploadedAt: '2024-06-25', fileType: 'PDF', size: '960 KB', driveLinked: true, previewUrl: '#', downloadUrl: '#' },
        ],
      },
      {
        id: 'phase-3',
        name: 'System Design',
        status: 'Current',
        startedAt: 'Jul 2024',
        documents: [
          { id: 'doc-5', title: 'Database design workbook', phase: 'System Design', submittedBy: 'Peter Salum', status: 'Approved', uploadedAt: '2024-07-12', fileType: 'PDF', size: '3.2 MB', driveLinked: true, previewUrl: '#', downloadUrl: '#' },
          { id: 'doc-6', title: 'System architecture diagram', phase: 'System Design', submittedBy: 'Grace Mlay', status: 'Uploaded', uploadedAt: '2024-07-19', fileType: 'PNG', size: '1.4 MB', driveLinked: true, previewUrl: '#', downloadUrl: '#' },
          { id: 'doc-7', title: 'Interface specification', phase: 'System Design', submittedBy: 'Millicent Amani', status: 'Needs Revision', uploadedAt: '2024-07-28', fileType: 'DOCX', size: '1.1 MB', driveLinked: true, previewUrl: '#', downloadUrl: '#' },
        ],
      },
      {
        id: 'phase-4',
        name: 'Testing & UAT',
        status: 'Upcoming',
        startedAt: 'Aug 2024',
        documents: [
          { id: 'doc-8', title: 'UAT checklist', phase: 'Testing & UAT', submittedBy: 'Peter Salum', status: 'Uploaded', uploadedAt: '2024-08-02', fileType: 'PDF', size: '720 KB', driveLinked: false, previewUrl: '#', downloadUrl: '#' },
        ],
      },
      {
        id: 'phase-5',
        name: 'Deployment',
        status: 'Upcoming',
        startedAt: 'Sep 2024',
        documents: [],
      },
    ]),
  },
  {
    id: 'proj-2',
    name: 'Community Registry Portal',
    subtitle: 'Regional Council',
    manager: 'Joseph Ndomba',
    members: ['Joseph Ndomba', 'Anna Kileo', 'John Paschal', 'Miriam Nyalusi'],
    phase: 'Requirements',
    docsCompleted: 8,
    docsTotal: 20,
    documentationPercent: 40,
    driveLinked: true,
    status: 'active',
    phases: normalizeProjectPhases([
      {
        id: 'phase-6',
        name: 'Initiation',
        status: 'Completed',
        startedAt: 'Mar 2024',
        documents: [
          { id: 'doc-9', title: 'Project brief', phase: 'Initiation', submittedBy: 'Joseph Ndomba', status: 'Approved', uploadedAt: '2024-03-12', fileType: 'PDF', size: '1.2 MB', driveLinked: true, previewUrl: '#', downloadUrl: '#' },
        ],
      },
      {
        id: 'phase-7',
        name: 'Requirements',
        status: 'Current',
        startedAt: 'Apr 2024',
        documents: [
          { id: 'doc-10', title: 'Business process map', phase: 'Requirements', submittedBy: 'Anna Kileo', status: 'Uploaded', uploadedAt: '2024-04-16', fileType: 'PDF', size: '2.4 MB', driveLinked: true, previewUrl: '#', downloadUrl: '#' },
          { id: 'doc-11', title: 'Requirements backlog', phase: 'Requirements', submittedBy: 'John Paschal', status: 'Needs Revision', uploadedAt: '2024-04-26', fileType: 'XLSX', size: '860 KB', driveLinked: true, previewUrl: '#', downloadUrl: '#' },
        ],
      },
      {
        id: 'phase-8',
        name: 'System Design',
        status: 'Upcoming',
        startedAt: 'Jul 2024',
        documents: [],
      },
      {
        id: 'phase-9',
        name: 'Testing & UAT',
        status: 'Upcoming',
        startedAt: 'Aug 2024',
        documents: [],
      },
      {
        id: 'phase-10',
        name: 'Deployment',
        status: 'Upcoming',
        startedAt: 'Sep 2024',
        documents: [],
      },
    ]),
  },
  {
    id: 'proj-3',
    name: 'Facility Asset Tracker',
    subtitle: 'Internal',
    manager: 'Anna Kileo',
    members: ['Anna Kileo', 'Peter Salum', 'Joseph Ndomba', 'Faith Omar'],
    phase: 'Testing & UAT',
    docsCompleted: 21,
    docsTotal: 23,
    documentationPercent: 91,
    driveLinked: true,
    status: 'active',
    phases: normalizeProjectPhases([
      {
        id: 'phase-11',
        name: 'Initiation',
        status: 'Completed',
        startedAt: 'Jan 2024',
        documents: [
          { id: 'doc-12', title: 'Project kickoff notes', phase: 'Initiation', submittedBy: 'Anna Kileo', status: 'Approved', uploadedAt: '2024-01-09', fileType: 'PDF', size: '840 KB', driveLinked: true, previewUrl: '#', downloadUrl: '#' },
        ],
      },
      {
        id: 'phase-12',
        name: 'Requirements',
        status: 'Completed',
        startedAt: 'Feb 2024',
        documents: [
          { id: 'doc-13', title: 'Functional requirements', phase: 'Requirements', submittedBy: 'Joseph Ndomba', status: 'Approved', uploadedAt: '2024-02-11', fileType: 'DOCX', size: '1.3 MB', driveLinked: true, previewUrl: '#', downloadUrl: '#' },
        ],
      },
      {
        id: 'phase-13',
        name: 'System Design',
        status: 'Completed',
        startedAt: 'Mar 2024',
        documents: [
          { id: 'doc-14', title: 'Asset model specification', phase: 'System Design', submittedBy: 'Peter Salum', status: 'Approved', uploadedAt: '2024-03-22', fileType: 'PDF', size: '2.2 MB', driveLinked: true, previewUrl: '#', downloadUrl: '#' },
        ],
      },
      {
        id: 'phase-14',
        name: 'Testing & UAT',
        status: 'Current',
        startedAt: 'Apr 2024',
        documents: [
          { id: 'doc-15', title: 'UAT test results', phase: 'Testing & UAT', submittedBy: 'Faith Omar', status: 'Approved', uploadedAt: '2024-04-18', fileType: 'XLSX', size: '1.6 MB', driveLinked: true, previewUrl: '#', downloadUrl: '#' },
          { id: 'doc-16', title: 'Bug triage log', phase: 'Testing & UAT', submittedBy: 'Anna Kileo', status: 'Needs Revision', uploadedAt: '2024-05-05', fileType: 'PDF', size: '900 KB', driveLinked: true, previewUrl: '#', downloadUrl: '#' },
        ],
      },
      {
        id: 'phase-15',
        name: 'Deployment',
        status: 'Upcoming',
        startedAt: 'May 2024',
        documents: [],
      },
    ]),
  },
  {
    id: 'proj-4',
    name: 'Water Quality Field App',
    subtitle: 'Water Authority',
    manager: 'Grace Mlay',
    members: ['Grace Mlay', 'Peter Salum', 'Miriam Nyalusi', 'Daniel Kitula'],
    phase: 'Deployment',
    docsCompleted: 24,
    docsTotal: 24,
    documentationPercent: 100,
    driveLinked: true,
    status: 'active',
    phases: normalizeProjectPhases([
      {
        id: 'phase-16',
        name: 'Initiation',
        status: 'Completed',
        startedAt: 'Jan 2024',
        documents: [{ id: 'doc-17', title: 'SOW approval', phase: 'Initiation', submittedBy: 'Grace Mlay', status: 'Approved', uploadedAt: '2024-01-10', fileType: 'PDF', size: '2.0 MB', driveLinked: true, previewUrl: '#', downloadUrl: '#' }],
      },
      {
        id: 'phase-17',
        name: 'Requirements',
        status: 'Completed',
        startedAt: 'Feb 2024',
        documents: [{ id: 'doc-18', title: 'Data collection requirement', phase: 'Requirements', submittedBy: 'Daniel Kitula', status: 'Approved', uploadedAt: '2024-02-15', fileType: 'DOCX', size: '1.1 MB', driveLinked: true, previewUrl: '#', downloadUrl: '#' }],
      },
      {
        id: 'phase-18',
        name: 'System Design',
        status: 'Completed',
        startedAt: 'Mar 2024',
        documents: [{ id: 'doc-19', title: 'Field app architecture', phase: 'System Design', submittedBy: 'Peter Salum', status: 'Approved', uploadedAt: '2024-03-24', fileType: 'PDF', size: '2.4 MB', driveLinked: true, previewUrl: '#', downloadUrl: '#' }],
      },
      {
        id: 'phase-19',
        name: 'Testing & UAT',
        status: 'Completed',
        startedAt: 'Apr 2024',
        documents: [{ id: 'doc-20', title: 'Field testing report', phase: 'Testing & UAT', submittedBy: 'Miriam Nyalusi', status: 'Approved', uploadedAt: '2024-04-19', fileType: 'PDF', size: '990 KB', driveLinked: true, previewUrl: '#', downloadUrl: '#' }],
      },
      {
        id: 'phase-20',
        name: 'Deployment',
        status: 'Current',
        startedAt: 'May 2024',
        documents: [{ id: 'doc-21', title: 'Deployment checklist', phase: 'Deployment', submittedBy: 'Grace Mlay', status: 'Uploaded', uploadedAt: '2024-05-11', fileType: 'PDF', size: '630 KB', driveLinked: true, previewUrl: '#', downloadUrl: '#' }],
      },
    ]),
  },
  {
    id: 'proj-5',
    name: 'Supply Chain Interface',
    subtitle: 'Supply Division',
    manager: 'Samuel Mtei',
    members: ['Samuel Mtei', 'Joseph Ndomba', 'Millicent Amani', 'Faith Omar'],
    phase: 'Initiation',
    docsCompleted: 1,
    docsTotal: 22,
    documentationPercent: 5,
    driveLinked: false,
    status: 'active',
    phases: normalizeProjectPhases([
      {
        id: 'phase-21',
        name: 'Initiation',
        status: 'Current',
        startedAt: 'Aug 2024',
        documents: [{ id: 'doc-22', title: 'Project kickoff brief', phase: 'Initiation', submittedBy: 'Samuel Mtei', status: 'Uploaded', uploadedAt: '2024-08-02', fileType: 'PDF', size: '780 KB', driveLinked: false, previewUrl: '#', downloadUrl: '#' }],
      },
      {
        id: 'phase-22',
        name: 'Requirements',
        status: 'Upcoming',
        startedAt: 'Sep 2024',
        documents: [],
      },
      {
        id: 'phase-23',
        name: 'System Design',
        status: 'Upcoming',
        startedAt: 'Oct 2024',
        documents: [],
      },
      {
        id: 'phase-24',
        name: 'Testing & UAT',
        status: 'Upcoming',
        startedAt: 'Nov 2024',
        documents: [],
      },
      {
        id: 'phase-25',
        name: 'Deployment',
        status: 'Upcoming',
        startedAt: 'Dec 2024',
        documents: [],
      },
    ]),
  },
];

const initialProjects: Project[] = seedProjectDocSets;

const PROJECT_STORAGE_KEY = 'pms-project-documents';

export const hydrateProjectsFromStoredDocuments = (storedProjects: Project[] = initialProjects): Project[] => {
  if (typeof window === 'undefined') {
    return storedProjects;
  }

  try {
    const savedDocuments = window.localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!savedDocuments) {
      return storedProjects;
    }

    const parsedDocuments = JSON.parse(savedDocuments) as Array<{ id: string; documents: ProjectDocument[] }>;
    if (!Array.isArray(parsedDocuments)) {
      return storedProjects;
    }

    return storedProjects.map((project) => {
      const savedProject = parsedDocuments.find((entry) => entry.id === project.id);
      if (!savedProject) {
        return project;
      }

      const phaseDocuments: ProjectPhase[] = STANDARD_PHASES.map((phaseName) => {
        const documentsForPhase = savedProject.documents.filter((document) => document.phase === phaseName);
        const existingPhase = project.phases.find((phase) => phase.name === phaseName);
        const phaseStatus = (documentsForPhase.length > 0
          ? phaseName === project.phase
            ? 'Current'
            : 'Completed'
          : phaseName === project.phase
            ? 'Current'
            : 'Upcoming') as ProjectPhase['status'];

        return {
          id: existingPhase?.id ?? `${project.id}-${phaseName.toLowerCase().replace(/\s+/g, '-')}`,
          name: phaseName,
          status: phaseStatus,
          startedAt: existingPhase?.startedAt ?? 'TBD',
          documents: documentsForPhase.map((document) => ({
            ...document,
            driveLinked: true,
            previewUrl: '#',
            downloadUrl: document.downloadUrl || '#',
          })),
        };
      });

      const allDocuments = phaseDocuments.flatMap((phase) => phase.documents);
      const approvedDocs = allDocuments.filter((document) => document.status === 'Approved').length;
      const totalDocs = Math.max(allDocuments.length, project.docsTotal);

      return {
        ...project,
        docsCompleted: approvedDocs,
        docsTotal: totalDocs,
        documentationPercent: totalDocs > 0 ? Math.round((approvedDocs / totalDocs) * 100) : 0,
        phases: phaseDocuments,
      };
    });
  } catch {
    return storedProjects;
  }
};

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
