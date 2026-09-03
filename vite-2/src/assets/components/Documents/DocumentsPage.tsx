import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getCurrentUserApi } from '../services/authApi';
import './DocumentsPage.css';

interface ProjectDocument {
  id: string;
  title: string;
  phase: string;
  submittedBy: string;
  status: 'Approved' | 'Needs Revision' | 'Uploaded';
  uploadedAt: string;
  fileType: string;
  size: string;
  downloadUrl: string;
}

interface ProjectDocSet {
  id: string;
  name: string;
  subtitle: string;
  manager: string;
  phases: string[];
  documents: ProjectDocument[];
}

const STANDARD_PHASES = ['Initiation', 'Requirements', 'System Design', 'Testing & UAT', 'Deployment'];
const STORAGE_KEY = 'pms-project-documents';

const normalizeProjectPhases = (phases: string[] = []): string[] => {
  const phaseSet = new Set(phases);
  return STANDARD_PHASES.map((phase) => (phaseSet.has(phase) ? phase : phase));
};

const projectDocSetsSeed: ProjectDocSet[] = [
  {
    id: 'proj-1',
    name: 'Document Organization Module',
    subtitle: 'UDSM Practical Training',
    manager: 'Peter Salum',
    phases: ['Initiation', 'Requirements', 'System Design', 'Testing & UAT', 'Deployment'],
    documents: [
      {
        id: 'd-1',
        title: 'Database design workbook',
        phase: 'System Design',
        submittedBy: 'Peter Salum',
        status: 'Approved',
        uploadedAt: '2024-07-12',
        fileType: 'PDF',
        size: '3.2 MB',
        downloadUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      },
      {
        id: 'd-2',
        title: 'System architecture diagram',
        phase: 'System Design',
        submittedBy: 'Grace Mlay',
        status: 'Uploaded',
        uploadedAt: '2024-07-19',
        fileType: 'PNG',
        size: '1.4 MB',
        downloadUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      },
      {
        id: 'd-3',
        title: 'Interface specification',
        phase: 'System Design',
        submittedBy: 'Millicent Amani',
        status: 'Needs Revision',
        uploadedAt: '2024-07-28',
        fileType: 'DOCX',
        size: '1.1 MB',
        downloadUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      },
      {
        id: 'd-4',
        title: 'Requirements specification',
        phase: 'Requirements',
        submittedBy: 'Samuel Mtei',
        status: 'Approved',
        uploadedAt: '2024-06-18',
        fileType: 'DOCX',
        size: '1.8 MB',
        downloadUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      },
    ],
  },
  {
    id: 'proj-2',
    name: 'Community Registry Portal',
    subtitle: 'Regional Council',
    manager: 'Joseph Ndomba',
    phases: ['Initiation', 'Requirements', 'System Design', 'Testing & UAT', 'Deployment'],
    documents: [
      {
        id: 'd-5',
        title: 'Business process map',
        phase: 'Requirements',
        submittedBy: 'Anna Kileo',
        status: 'Uploaded',
        uploadedAt: '2024-04-16',
        fileType: 'PDF',
        size: '2.4 MB',
        downloadUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      },
      {
        id: 'd-6',
        title: 'Requirements backlog',
        phase: 'Requirements',
        submittedBy: 'John Paschal',
        status: 'Needs Revision',
        uploadedAt: '2024-04-26',
        fileType: 'XLSX',
        size: '860 KB',
        downloadUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      },
      {
        id: 'd-7',
        title: 'Project brief',
        phase: 'Initiation',
        submittedBy: 'Joseph Ndomba',
        status: 'Approved',
        uploadedAt: '2024-03-12',
        fileType: 'PDF',
        size: '1.2 MB',
        downloadUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      },
    ],
  },
  {
    id: 'proj-3',
    name: 'Facility Asset Tracker',
    subtitle: 'Internal',
    manager: 'Anna Kileo',
    phases: ['Initiation', 'Requirements', 'System Design', 'Testing & UAT', 'Deployment'],
    documents: [
      {
        id: 'd-8',
        title: 'UAT test results',
        phase: 'Testing & UAT',
        submittedBy: 'Faith Omar',
        status: 'Approved',
        uploadedAt: '2024-04-18',
        fileType: 'XLSX',
        size: '1.6 MB',
        downloadUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      },
      {
        id: 'd-9',
        title: 'Bug triage log',
        phase: 'Testing & UAT',
        submittedBy: 'Anna Kileo',
        status: 'Needs Revision',
        uploadedAt: '2024-05-05',
        fileType: 'PDF',
        size: '900 KB',
        downloadUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      },
      {
        id: 'd-10',
        title: 'Functional requirements',
        phase: 'Requirements',
        submittedBy: 'Joseph Ndomba',
        status: 'Approved',
        uploadedAt: '2024-02-11',
        fileType: 'DOCX',
        size: '1.3 MB',
        downloadUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      },
    ],
  },
];

const getStoredProjectDocSets = (): ProjectDocSet[] => {
  if (typeof window === 'undefined') {
    return projectDocSetsSeed;
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return projectDocSetsSeed;
    }

    const parsed = JSON.parse(saved) as ProjectDocSet[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return projectDocSetsSeed;
    }

    return parsed.map((project) => ({
      ...project,
      phases: normalizeProjectPhases(project.phases),
      documents: project.documents.map((document) => ({ ...document })),
    }));
  } catch {
    return projectDocSetsSeed;
  }
};

const formatFileSize = (bytes: number): string => {
  if (!bytes) {
    return '0 KB';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const adjustedSize = bytes / 1024 ** unitIndex;
  const decimals = adjustedSize >= 10 || unitIndex === 0 ? 0 : 1;

  return `${adjustedSize.toFixed(decimals)} ${units[unitIndex]}`;
};

export const DocumentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectIdParam = searchParams.get('projectId');
  const [projectDocSets, setProjectDocSets] = useState<ProjectDocSet[]>(() => getStoredProjectDocSets());
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [currentUserName, setCurrentUserName] = useState('Current User');
  const [uploadForm, setUploadForm] = useState({ title: '', phase: STANDARD_PHASES[0], fileName: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const selectedProject = useMemo(
    () => projectDocSets.find((project) => project.id === projectIdParam) ?? projectDocSets[0] ?? null,
    [projectDocSets, projectIdParam],
  );

  useEffect(() => {
    if (selectedProject) {
      setSelectedDocumentId((currentDocumentId) => {
        if (currentDocumentId && selectedProject.documents.some((document) => document.id === currentDocumentId)) {
          return currentDocumentId;
        }

        return selectedProject.documents[0]?.id ?? '';
      });

      setUploadForm((current) => ({
        ...current,
        phase: selectedProject.phases.includes(current.phase) ? current.phase : selectedProject.phases[0] ?? STANDARD_PHASES[0],
      }));
    }
  }, [selectedProject]);

  useEffect(() => {
    getCurrentUserApi().then((user) => {
      if (user?.fullName) {
        setCurrentUserName(user.fullName);
      }
    });
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projectDocSets));
    }
  }, [projectDocSets]);

  const activeDocument = useMemo(
    () => selectedProject?.documents.find((document) => document.id === selectedDocumentId) ?? selectedProject?.documents[0] ?? null,
    [selectedDocumentId, selectedProject],
  );

  const handleUploadSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedProject) {
      return;
    }

    const trimmedTitle = uploadForm.title.trim();
    if (!trimmedTitle) {
      alert('Please enter a document title before uploading.');
      return;
    }

    const documentTitle = trimmedTitle || uploadForm.fileName || 'New document';
    const fileType = selectedFile?.name
      ? selectedFile.name.split('.').pop()?.toUpperCase() ?? 'FILE'
      : 'FILE';
    const fileSize = selectedFile ? formatFileSize(selectedFile.size) : '1.0 MB';
    const newDocument: ProjectDocument = {
      id: `doc-${Date.now()}`,
      title: documentTitle,
      phase: uploadForm.phase,
      submittedBy: currentUserName,
      status: 'Uploaded',
      uploadedAt: new Date().toISOString().slice(0, 10),
      fileType,
      size: fileSize,
      downloadUrl: '#',
    };

    setProjectDocSets((currentProjects) =>
      currentProjects.map((project) =>
        project.id === selectedProject.id
          ? {
              ...project,
              phases: normalizeProjectPhases(project.phases),
              documents: [newDocument, ...project.documents],
            }
          : project,
      ),
    );

    setSelectedDocumentId(newDocument.id);
    setSelectedFile(null);
    setUploadForm({ title: '', phase: STANDARD_PHASES[0], fileName: '' });
    setShowUploadForm(false);
  };

  const handleDeleteDocument = (documentId: string) => {
    if (!selectedProject) {
      return;
    }

    const targetDocument = selectedProject.documents.find((document) => document.id === documentId);
    if (!targetDocument) {
      return;
    }

    if (targetDocument.submittedBy !== currentUserName) {
      return;
    }

    const confirmed = window.confirm('Are you sure you want to delete this document? It will disappear for all project users.');
    if (!confirmed) {
      return;
    }

    setProjectDocSets((currentProjects) =>
      currentProjects.map((project) =>
        project.id !== selectedProject.id
          ? project
          : {
              ...project,
              documents: project.documents.filter((document) => document.id !== documentId),
            },
      ),
    );

    setSelectedDocumentId((currentSelection) =>
      currentSelection === documentId ? '' : currentSelection,
    );
  };

  if (!selectedProject) {
    return (
      <div className="documents-empty-state">
        <h2>No project selected</h2>
        <p>Select a project from the project list to view its documents.</p>
      </div>
    );
  }

  return (
    <div className="documents-page">
      <div className="documents-header">
        <div>
          <p className="documents-kicker">Project documents</p>
          <h1>{selectedProject.name}</h1>
          <p className="documents-subtitle">{selectedProject.subtitle}</p>
        </div>
        <div className="documents-header-actions">
          <button className="documents-submit-button" onClick={() => setShowUploadForm((current) => !current)}>
            {showUploadForm ? 'Close form' : 'Submit new file'}
          </button>
          <button className="documents-return" onClick={() => navigate(`/projects?projectId=${selectedProject.id}`)}>
            Back to project
          </button>
        </div>
      </div>

      {showUploadForm && (
        <div className="submit-document-panel">
          <div className="submit-document-header">
            <div>
              <p className="documents-kicker">New upload</p>
              <h3>Submit file to project phase</h3>
            </div>
            <span className="current-user-tag">Submitting as {currentUserName}</span>
          </div>

          <form className="submit-document-form" onSubmit={handleUploadSubmit}>
            <div className="upload-form-grid">
              <label className="upload-field">
                <span>Document title</span>
                <input
                  type="text"
                  value={uploadForm.title}
                  onChange={(event) => setUploadForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="e.g. System requirements checklist"
                />
              </label>

              <label className="upload-field">
                <span>Phase</span>
                <select
                  value={uploadForm.phase}
                  onChange={(event) => setUploadForm((current) => ({ ...current, phase: event.target.value }))}
                >
                  {selectedProject.phases.map((phase) => (
                    <option key={phase} value={phase}>
                      {phase}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="upload-field file-picker-field">
              <span>Choose file</span>
              <input
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setSelectedFile(file);
                  setUploadForm((current) => ({ ...current, fileName: file?.name ?? '' }));
                }}
              />
            </label>

            <div className="upload-actions-bar">
              <span className="upload-helper-text">
                Submitted file will be marked as <strong>Uploaded</strong> and shown in the <strong>{uploadForm.phase}</strong> phase.
              </span>
              <div className="upload-button-row">
                <button type="button" className="upload-cancel-button" onClick={() => setShowUploadForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="upload-submit-button">
                  Submit file
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="documents-layout">
        <aside className="documents-sidebar">
          <div className="documents-sidebar-header">Documents</div>
          {selectedProject.documents.map((document) => (
            <button
              key={document.id}
              className={`document-select-card ${selectedDocumentId === document.id ? 'active' : ''}`}
              onClick={() => setSelectedDocumentId(document.id)}
            >
              <div className="document-card-head">
                <h3>{document.title}</h3>
                <span className={`status-badge ${document.status.toLowerCase().replace(/\s+/g, '-')}`}>{document.status}</span>
              </div>
              <div className="document-card-meta">
                <span className="phase-badge">{document.phase}</span>
                <span>{document.submittedBy}</span>
              </div>
            </button>
          ))}
        </aside>

        <section className="documents-preview">
          {activeDocument ? (
            <>
              <div className="preview-toolbar">
                <span className={`status-badge ${activeDocument.status.toLowerCase().replace(/\s+/g, '-')}`}>
                  {activeDocument.status}
                </span>
                <div className="document-preview-actions">
                  <a className="download-button" href={activeDocument.downloadUrl} target="_blank" rel="noreferrer" download>
                    Download file
                  </a>
                  {activeDocument.submittedBy === currentUserName && (
                    <button className="delete-button" onClick={() => handleDeleteDocument(activeDocument.id)}>
                      Delete document
                    </button>
                  )}
                </div>
              </div>

              <div className="preview-body">
                <div className="preview-topline">
                  <p className="preview-kicker">Quick glance</p>
                  <span className="phase-badge">{activeDocument.phase}</span>
                </div>

                <h2>{activeDocument.title}</h2>

                <div className="info-grid">
                  <div className="info-block">
                    <span className="info-label">Submitted by</span>
                    <strong>{activeDocument.submittedBy}</strong>
                  </div>
                  <div className="info-block">
                    <span className="info-label">Uploaded</span>
                    <strong>{activeDocument.uploadedAt}</strong>
                  </div>
                  <div className="info-block">
                    <span className="info-label">File type</span>
                    <strong>{activeDocument.fileType}</strong>
                  </div>
                  <div className="info-block">
                    <span className="info-label">Size</span>
                    <strong>{activeDocument.size}</strong>
                  </div>
                </div>

                <div className="preview-notes">
                  <h3>Submission details</h3>
                  <p>
                    This document was submitted during the <strong>{activeDocument.phase}</strong> phase for the{' '}
                    <strong>{selectedProject.name}</strong> project by <strong>{activeDocument.submittedBy}</strong>.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="documents-empty-state">
              <h3>No document selected</h3>
              <p>Upload a document or choose an existing item from the list.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default DocumentsPage;
