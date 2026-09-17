import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { hasRole } from '../auth/authorization';
import { ROLE_NAMES } from '../services/authApi';
import {
  type ApiDocument,
  type ApiPhase,
  type ApiProject,
  deleteProjectDocumentApi,
  getProjectDocumentsApi,
  getProjectPhasesApi,
  getProjectsApi,
  uploadProjectDocumentApi,
  reviewProjectDocumentApi,
} from '../services/projectApi';
import { downloadProjectDriveFileApi } from '../services/projectApi';
import './DocumentsPage.css';

interface DocumentView extends ApiDocument {
  phaseName: string;
  fileType: string;
}

const statusLabel = (status: string): string => {
  if (status === 'approved') return 'Approved';
  if (status === 'rejected' || status === 'needs_revision') return 'Needs Revision';
  if (status === 'submitted') return 'Awaiting Approval';
  return 'Uploaded';
};

export const DocumentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedProjectId = searchParams.get('projectId');
  const { user } = useAuth();
  const currentUserName = user?.fullName ?? 'Current User';
  const [project, setProject] = useState<ApiProject | null>(null);
  const [phases, setPhases] = useState<ApiPhase[]>([]);
  const [documents, setDocuments] = useState<DocumentView[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: '', phaseId: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadProject = async (projectId: string) => {
    const [{ projects: availableProjects }, { phases: nextPhases }, { documents: nextDocuments }] = await Promise.all([
      getProjectsApi(),
      getProjectPhasesApi(projectId),
      getProjectDocumentsApi(projectId),
    ]);
    const nextProject = availableProjects.find((item) => String(item.id) === projectId);
    if (!nextProject) throw new Error('Project not found.');
    setProject(nextProject);
    setPhases(nextPhases);
    setDocuments(nextDocuments.map((document) => ({
      ...document,
      phaseName: nextPhases.find((phase) => phase.id === document.phaseId)?.displayName
        ?? nextPhases.find((phase) => phase.id === document.phaseId)?.name
        ?? 'Unknown phase',
      fileType: document.name.split('.').pop()?.toUpperCase() ?? 'FILE',
    })));
    setUploadForm((current) => ({
      ...current,
      phaseId: nextPhases.some((phase) => phase.id === current.phaseId) ? current.phaseId : nextPhases[0]?.id ?? '',
    }));
  };

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const { projects: nextProjects } = await getProjectsApi();
        if (disposed) return;
        const projectId = requestedProjectId && nextProjects.some((item) => String(item.id) === requestedProjectId)
          ? requestedProjectId
          : nextProjects[0] ? String(nextProjects[0].id) : '';
        if (projectId) await loadProject(projectId);
        else setProject(null);
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : 'Could not load project documents.');
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void load();
    return () => { disposed = true; };
  }, [requestedProjectId]);

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocumentId) ?? documents[0] ?? null,
    [documents, selectedDocumentId],
  );

  useEffect(() => {
    setSelectedDocumentId((current) => documents.some((document) => document.id === current) ? current : documents[0]?.id ?? '');
  }, [documents]);

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!project || !selectedFile || !uploadForm.phaseId) {
      setError('Choose a file and phase before submitting.');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      const created = await uploadProjectDocumentApi(String(project.id), uploadForm.phaseId, selectedFile, uploadForm.name);
      const phase = phases.find((item) => item.id === created.phaseId);
      setDocuments((current) => [{
        ...created,
        phaseName: phase?.displayName ?? phase?.name ?? 'Unknown phase',
        fileType: created.name.split('.').pop()?.toUpperCase() ?? 'FILE',
      }, ...current]);
      setSelectedDocumentId(created.id);
      setSelectedFile(null);
      setUploadForm({ name: '', phaseId: phases[0]?.id ?? '' });
      setShowUploadForm(false);
      window.dispatchEvent(new CustomEvent('pms:documents-updated'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not upload document.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (document: DocumentView) => {
    if (!project || document.uploadedBy !== user?.id || !window.confirm('Delete this document?')) return;
    try {
      await deleteProjectDocumentApi(String(project.id), document.id);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      window.dispatchEvent(new CustomEvent('pms:documents-updated'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete document.');
    }
  };

  const handleReview = async (decision: 'approved' | 'needs_revision') => {
    if (!project || !activeDocument) return;
    try {
      setError('');
      const result = await reviewProjectDocumentApi(String(project.id), activeDocument.id, decision);
      setDocuments((current) => current.map((item) => item.id === result.document.id
        ? { ...item, ...result.document }
        : item));
      window.dispatchEvent(new CustomEvent('pms:documents-updated'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not review document.');
    }
  };

  if (loading) return <div className="documents-empty-state"><h2>Loading documents...</h2><p>Retrieving the selected project documents.</p></div>;
  if (error && !project) return <div className="documents-empty-state"><h2>Could not load documents</h2><p>{error}</p></div>;
  if (!project) return <div className="documents-empty-state"><h2>No project selected</h2><p>Create a project or select one from the Projects page.</p></div>;

  return (
    <div className="documents-page">
      <div className="documents-header">
        <div><p className="documents-kicker">Project documents</p><h1>{project.name}</h1><p className="documents-subtitle">{project.subtitle ?? project.description ?? ''}</p></div>
        <div className="documents-header-actions">
          <button className="documents-submit-button" onClick={() => setShowUploadForm((current) => !current)}>{showUploadForm ? 'Close form' : 'Submit new file'}</button>
          <button className="documents-return" onClick={() => navigate(`/projects?projectId=${project.id}`)}>Back to project</button>
        </div>
      </div>
      {error && <p className="documents-error" role="alert">{error}</p>}
      {showUploadForm && <div className="submit-document-panel">
        <div className="submit-document-header"><div><p className="documents-kicker">New upload</p><h3>Submit file to project phase</h3></div><span className="current-user-tag">Submitting as {currentUserName}</span></div>
        <form className="submit-document-form" onSubmit={handleUpload}>
          <div className="upload-form-grid">
            <label className="upload-field"><span>Document title</span><input value={uploadForm.name} onChange={(event) => setUploadForm((current) => ({ ...current, name: event.target.value }))} placeholder="Optional: uses the file name" /></label>
            <label className="upload-field"><span>Phase</span><select required value={uploadForm.phaseId} onChange={(event) => setUploadForm((current) => ({ ...current, phaseId: event.target.value }))}>{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.displayName || phase.name}</option>)}</select></label>
          </div>
          <label className="upload-field file-picker-field"><span>Choose file</span><input required type="file" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} /></label>
          <div className="upload-actions-bar"><span className="upload-helper-text">The file will be stored in the selected phase folder and linked to that phase.</span><div className="upload-button-row"><button type="button" className="upload-cancel-button" onClick={() => setShowUploadForm(false)}>Cancel</button><button disabled={submitting} type="submit" className="upload-submit-button">{submitting ? 'Submitting...' : 'Submit file'}</button></div></div>
        </form>
      </div>}
      <div className="documents-layout">
        <aside className="documents-sidebar"><div className="documents-sidebar-header">Documents <span>{documents.length}</span></div>{documents.length === 0 ? <p className="documents-empty-copy">No documents submitted yet.</p> : documents.map((document) => <button key={document.id} className={`document-select-card ${activeDocument?.id === document.id ? 'active' : ''}`} onClick={() => setSelectedDocumentId(document.id)}><div className="document-card-head"><h3>{document.name}</h3><span className={`status-badge ${statusLabel(document.status).toLowerCase().replace(/\s+/g, '-')}`}>{statusLabel(document.status)}</span></div><div className="document-card-meta"><span className="phase-badge">{document.phaseName}</span><span>{document.uploaderName ?? 'Unknown user'}</span></div></button>)}</aside>
        <section className="documents-preview">{activeDocument ? <><div className="preview-toolbar"><span className={`status-badge ${statusLabel(activeDocument.status).toLowerCase().replace(/\s+/g, '-')}`}>{statusLabel(activeDocument.status)}</span><div className="document-preview-actions">{activeDocument.status === 'approved' && activeDocument.driveFileId && <button className="download-button" onClick={() => void downloadProjectDriveFileApi(String(project.id), activeDocument.driveFileId!, activeDocument.name)}>Download file</button>}{activeDocument.status === 'submitted' && hasRole(user, ROLE_NAMES.PROJECT_MANAGER) && <><button className="download-button" onClick={() => void handleReview('needs_revision')}>Request revision</button><button className="download-button" onClick={() => void handleReview('approved')}>Approve &amp; save to Drive</button></>}{activeDocument.uploadedBy === user?.id && <button className="delete-button" onClick={() => void handleDelete(activeDocument)}>Delete document</button>}</div></div><div className="preview-body"><div className="preview-topline"><p className="preview-kicker">Quick glance</p><span className="phase-badge">{activeDocument.phaseName}</span></div><h2>{activeDocument.name}</h2><div className="info-grid"><div className="info-block"><span className="info-label">Submitted by</span><strong>{activeDocument.uploaderName ?? 'Unknown user'}</strong></div><div className="info-block"><span className="info-label">Uploaded</span><strong>{new Date(activeDocument.uploadedAt).toLocaleDateString()}</strong></div><div className="info-block"><span className="info-label">File type</span><strong>{activeDocument.fileType}</strong></div><div className="info-block"><span className="info-label">Version</span><strong>v{activeDocument.currentVersion}</strong></div></div><div className="preview-notes"><h3>Submission details</h3><p>This document was submitted during the <strong>{activeDocument.phaseName}</strong> phase for the <strong>{project.name}</strong> project by <strong>{activeDocument.uploaderName ?? 'Unknown user'}</strong>.</p></div></div></> : <div className="documents-empty-state"><h3>No document selected</h3><p>Upload a document or choose an existing item from the list.</p></div>}</section>
      </div>
    </div>
  );
};

export default DocumentsPage;
