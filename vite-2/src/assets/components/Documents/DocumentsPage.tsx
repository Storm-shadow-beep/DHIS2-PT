import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { hasPermission, hasRole } from '../auth/authorization';
import { PERMISSION_NAMES, ROLE_NAMES } from '../services/authApi';
import {
  type ApiDocument,
  type ApiPhase,
  type ApiProject,
  type ApiRequirement,
  deleteProjectDocumentApi,
  getPhaseRequirementsApi,
  getProjectDocumentsApi,
  getProjectPhasesApi,
  getProjectsApi,
  updateProjectDocumentApi,
  uploadProjectDocumentApi,
} from '../services/projectApi';
import { downloadProjectDriveFileApi } from '../services/projectApi';
import './DocumentsPage.css';
import { PageLoading } from '../PageLoading/PageLoading';

interface DocumentView extends ApiDocument {
  phaseName: string;
  fileType: string;
}

const statusLabel = (status: string): string => {
  if (status === 'approved') return 'Approved';
  if (status === 'rejected' || status === 'needs_revision') return 'Needs Revision';
  return 'Uploaded';
};

export const DocumentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedProjectId = searchParams.get('projectId');
  const { user } = useAuth();
  const isAdministrator = hasRole(user, ROLE_NAMES.ADMINISTRATOR);
  const canEditDocuments = !isAdministrator && hasPermission(user, PERMISSION_NAMES.DOCUMENT_UPLOAD);
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
  const [deletingDocument, setDeletingDocument] = useState(false);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [documentPendingDelete, setDocumentPendingDelete] = useState<DocumentView | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phaseId: '', documentCategoryId: '' });
  const [phaseRequirements, setPhaseRequirements] = useState<ApiRequirement[]>([]);
  const [loadingRequirements, setLoadingRequirements] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

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

  useEffect(() => {
    setShowEditForm(false);
  }, [selectedDocumentId]);

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

  const handleDelete = async () => {
    const document = documentPendingDelete;
    if (!project || !document || document.uploadedBy !== user?.id || deletingDocument) return;
    try {
      setDeletingDocument(true);
      setError('');
      await deleteProjectDocumentApi(String(project.id), document.id);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setDocumentPendingDelete(null);
      window.dispatchEvent(new CustomEvent('pms:documents-updated'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete document.');
    } finally {
      setDeletingDocument(false);
    }
  };

  const openEditForm = (document: DocumentView) => {
    setEditForm({
      name: document.name,
      phaseId: document.phaseId,
      documentCategoryId: document.documentCategoryId ?? '',
    });
    setShowEditForm(true);
  };

  useEffect(() => {
    if (!showEditForm || !project || !editForm.phaseId) {
      setPhaseRequirements([]);
      return;
    }
    let disposed = false;
    setLoadingRequirements(true);
    getPhaseRequirementsApi(String(project.id), editForm.phaseId)
      .then((result) => { if (!disposed) setPhaseRequirements(result.requirements); })
      .catch(() => { if (!disposed) setPhaseRequirements([]); })
      .finally(() => { if (!disposed) setLoadingRequirements(false); });
    return () => { disposed = true; };
  }, [showEditForm, project, editForm.phaseId]);

  const handleSaveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!project || !activeDocument || savingEdit) return;
    const trimmedName = editForm.name.trim();
    if (!trimmedName) {
      setError('Document title is required.');
      return;
    }
    if (!editForm.phaseId) {
      setError('Choose a phase for this document.');
      return;
    }
    try {
      setSavingEdit(true);
      setError('');
      const { document: updated } = await updateProjectDocumentApi(
        String(project.id),
        activeDocument.id,
        {
          name: trimmedName,
          phaseId: editForm.phaseId,
          documentCategoryId: editForm.documentCategoryId || null,
        },
      );
      setDocuments((current) => current.map((item) => item.id === updated.id
        ? {
          ...updated,
          phaseName: phases.find((phase) => phase.id === updated.phaseId)?.displayName
            ?? phases.find((phase) => phase.id === updated.phaseId)?.name
            ?? item.phaseName,
          fileType: updated.name.split('.').pop()?.toUpperCase() ?? 'FILE',
        }
        : item));
      setShowEditForm(false);
      window.dispatchEvent(new CustomEvent('pms:documents-updated'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update document.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDownload = async (document: DocumentView) => {
    if (!project || downloadingDocumentId) return;
    try {
      setDownloadingDocumentId(document.id);
      setError('');
      await downloadProjectDriveFileApi(String(project.id), document.driveFileId, document.name);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not download document.');
    } finally {
      setDownloadingDocumentId(null);
    }
  };

  if (loading) return <PageLoading message="Loading project documents..." />;
  if (error && !project) return <div className="documents-empty-state"><h2>Could not load documents</h2><p>{error}</p></div>;
  if (!project) return <div className="documents-empty-state"><h2>No project selected</h2><p>Create a project or select one from the Projects page.</p></div>;

  return (
    <div className="documents-page">
      <div className="documents-header">
        <div className="documents-heading-copy"><p className="documents-kicker">Project documents</p><h1>{project.name}</h1><p className="documents-subtitle">{project.subtitle ?? project.description ?? 'Manage project files by phase.'}</p><div className="documents-header-meta"><span>{documents.length} {documents.length === 1 ? 'document' : 'documents'}</span><span className="meta-dot" aria-hidden="true" /> <span>{phases.length} phases</span></div></div>
        <div className="documents-header-actions">
          {!isAdministrator && <button className="documents-submit-button" onClick={() => setShowUploadForm((current) => !current)}>{showUploadForm ? 'Close form' : '+ Submit new file'}</button>}
          <button className="documents-return" onClick={() => navigate(`/projects?projectId=${project.id}`)}>Back to project</button>
        </div>
      </div>
      {error && <p className="documents-error" role="alert">{error}</p>}
      {canEditDocuments && showEditForm && activeDocument && <div className="submit-document-panel">
        <div className="submit-document-header"><div><p className="documents-kicker">Edit details</p><h3>Rename or move this document</h3></div><span className="current-user-tag">v{activeDocument.currentVersion} · {statusLabel(activeDocument.status)}</span></div>
        <form className="submit-document-form" onSubmit={handleSaveEdit}>
          <div className="upload-form-grid">
            <label className="upload-field"><span>Document title</span><input required value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="upload-field"><span>Phase</span><select required value={editForm.phaseId} onChange={(event) => setEditForm((current) => ({ ...current, phaseId: event.target.value, documentCategoryId: '' }))}>{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.displayName || phase.name}</option>)}</select></label>
            <label className="upload-field"><span>Requirement</span><select value={editForm.documentCategoryId} disabled={loadingRequirements} onChange={(event) => setEditForm((current) => ({ ...current, documentCategoryId: event.target.value }))}><option value="">No requirement (unlinked)</option>{phaseRequirements.map((requirement) => <option key={requirement.id} value={requirement.id}>{requirement.name}</option>)}</select></label>
          </div>
          <div className="upload-actions-bar"><span className="upload-helper-text">Renaming also renames the file in Google Drive. Moving phases unlinks the requirement unless you pick one above.</span><div className="upload-button-row"><button type="button" className="upload-cancel-button" disabled={savingEdit} onClick={() => setShowEditForm(false)}>Cancel</button><button disabled={savingEdit} type="submit" className="upload-submit-button">{savingEdit ? <><span className="submit-spinner" aria-hidden="true" />Saving...</> : 'Save changes'}</button></div></div>
        </form>
      </div>}
      {!isAdministrator && showUploadForm && <div className="submit-document-panel">
        <div className="submit-document-header"><div><p className="documents-kicker">New upload</p><h3>Submit file to project phase</h3></div><span className="current-user-tag">Submitting as {currentUserName}</span></div>
        <form className="submit-document-form" onSubmit={handleUpload}>
          <div className="upload-form-grid">
            <label className="upload-field"><span>Document title</span><input value={uploadForm.name} onChange={(event) => setUploadForm((current) => ({ ...current, name: event.target.value }))} placeholder="Optional: uses the file name" /></label>
            <label className="upload-field"><span>Phase</span><select required value={uploadForm.phaseId} onChange={(event) => setUploadForm((current) => ({ ...current, phaseId: event.target.value }))}>{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.displayName || phase.name}</option>)}</select></label>
          </div>
          <label className="upload-field file-picker-field"><span>Choose file</span><input required type="file" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} /></label>
          <div className="upload-actions-bar"><span className="upload-helper-text">The file will be stored in the selected phase folder and linked to that phase.</span><div className="upload-button-row"><button type="button" className="upload-cancel-button" disabled={submitting} onClick={() => setShowUploadForm(false)}>Cancel</button><button disabled={submitting} type="submit" className="upload-submit-button">{submitting ? <><span className="submit-spinner" aria-hidden="true" />Submitting...</> : 'Submit file'}</button></div></div>
        </form>
      </div>}
      <div className="documents-layout">
        <aside className="documents-sidebar"><div className="documents-sidebar-header"><div><span className="sidebar-title">Documents</span><span className="sidebar-caption">Submitted project files</span></div><span className="document-count">{documents.length}</span></div>{documents.length === 0 ? <div className="documents-empty-copy"><span className="empty-icon" aria-hidden="true">+</span><strong>No documents yet</strong><span>Submitted files will appear here.</span></div> : documents.map((document) => <button key={document.id} className={`document-select-card ${activeDocument?.id === document.id ? 'active' : ''}`} onClick={() => setSelectedDocumentId(document.id)} aria-pressed={activeDocument?.id === document.id}><div className="document-card-head"><h3>{document.name}</h3><span className={`status-badge ${statusLabel(document.status).toLowerCase().replace(/\s+/g, '-')}`}>{statusLabel(document.status)}</span></div><div className="document-card-meta"><span className="phase-badge">{document.phaseName}</span><span>{document.uploaderName ?? 'Unknown user'}</span></div></button>)}</aside>
        <section className="documents-preview">{activeDocument ? <><div className="preview-toolbar"><span className={`status-badge ${statusLabel(activeDocument.status).toLowerCase().replace(/\s+/g, '-')}`}>{statusLabel(activeDocument.status)}</span><div className="document-preview-actions">{activeDocument.driveLink && <a className="download-button documents-drive-link" href={activeDocument.driveLink} target="_blank" rel="noreferrer">Open in Drive</a>}<button className="download-button" disabled={downloadingDocumentId !== null} onClick={() => void handleDownload(activeDocument)}>{downloadingDocumentId === activeDocument.id ? <><span className="download-spinner" aria-hidden="true" />Downloading...</> : 'Download file'}</button>{canEditDocuments && <button className="documents-edit-button" onClick={() => (showEditForm ? setShowEditForm(false) : openEditForm(activeDocument))}>{showEditForm ? 'Close editor' : 'Edit details'}</button>}{!isAdministrator && activeDocument.uploadedBy === user?.id && <button className="delete-button" onClick={() => setDocumentPendingDelete(activeDocument)}>Delete document</button>}</div></div><div className="preview-body"><div className="preview-topline"><p className="preview-kicker">Quick glance</p><span className="phase-badge">{activeDocument.phaseName}</span></div><h2>{activeDocument.name}</h2><div className="info-grid"><div className="info-block"><span className="info-label">Submitted by</span><strong>{activeDocument.uploaderName ?? 'Unknown user'}</strong></div><div className="info-block"><span className="info-label">Uploaded</span><strong>{new Date(activeDocument.uploadedAt).toLocaleDateString()}</strong></div><div className="info-block"><span className="info-label">File type</span><strong>{activeDocument.fileType}</strong></div><div className="info-block"><span className="info-label">Version</span><strong>v{activeDocument.currentVersion}</strong></div></div><div className="preview-notes"><h3>Submission details</h3><p>This document was submitted during the <strong>{activeDocument.phaseName}</strong> phase for the <strong>{project.name}</strong> project by <strong>{activeDocument.uploaderName ?? 'Unknown user'}</strong>.</p></div></div></> : <div className="documents-empty-state"><h3>No document selected</h3><p>Upload a document or choose an existing item from the list.</p></div>}</section>
      </div>
      {documentPendingDelete && <div className="document-modal-backdrop" role="presentation" onMouseDown={(event) => { if (!deletingDocument && event.target === event.currentTarget) setDocumentPendingDelete(null); }}>
        <section className="document-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-document-title">
          <div className="confirm-icon" aria-hidden="true">!</div>
          <p className="documents-kicker">Delete document</p>
          <h2 id="delete-document-title">Remove “{documentPendingDelete.name}”?</h2>
          <p>This will remove the document from the project. This action cannot be undone from the app.</p>
          <div className="confirm-actions">
            <button className="upload-cancel-button" type="button" disabled={deletingDocument} onClick={() => setDocumentPendingDelete(null)}>Cancel</button>
            <button className="confirm-delete-button" type="button" disabled={deletingDocument} onClick={() => void handleDelete()}>
              {deletingDocument ? <><span className="delete-spinner" aria-hidden="true" />Deleting...</> : 'Delete document'}
            </button>
          </div>
        </section>
      </div>}
    </div>
  );
};

export default DocumentsPage;
