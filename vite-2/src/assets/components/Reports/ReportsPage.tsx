import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { hasRole } from '../auth/authorization';
import { ROLE_NAMES } from '../services/authApi';
import { deleteReportApi, getProjectsApi, getProjectPhasesApi, getReportsApi, submitReportApi, type ApiPhase, type ApiReport } from '../services/projectApi';
import { PageLoading } from '../PageLoading/PageLoading';
import './ReportsPage.css';

export const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const canPublish = hasRole(user, ROLE_NAMES.PROJECT_MANAGER) || hasRole(user, ROLE_NAMES.ADMINISTRATOR);
  const [reports, setReports] = useState<ApiReport[]>([]);
  const [projects, setProjects] = useState<{ id: string | number; name: string }[]>([]);
  const [phases, setPhases] = useState<ApiPhase[]>([]);
  const [form, setForm] = useState({ projectId: '', phaseId: '', title: '', body: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);

  const load = async () => {
    const [{ reports: nextReports }, { projects: nextProjects }] = await Promise.all([getReportsApi(), getProjectsApi()]);
    setReports(nextReports);
    setProjects(nextProjects.map((project) => ({ id: project.id, name: project.name })));
    setLoading(false);
  };

  const deleteReport = async (reportId: string) => {
    try {
      setDeletingReportId(reportId);
      await deleteReportApi(reportId);
      setReports((current) => current.filter((report) => report.id !== reportId));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The report could not be deleted.');
    } finally {
      setDeletingReportId(null);
    }
  };

  useEffect(() => { void load().catch(() => { setError('Reports could not be loaded.'); setLoading(false); }); }, []);
  useEffect(() => {
    if (!form.projectId) { setPhases([]); return; }
    void getProjectPhasesApi(form.projectId)
      .then((result) => setPhases(result.phases))
      .catch(() => setError('The phases for this project could not be loaded.'));
  }, [form.projectId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.projectId || !form.phaseId || !form.title.trim() || !form.body.trim()) {
      setError('Choose a project and phase, then complete all report fields.');
      return;
    }
    try {
      setSubmitting(true);
      await submitReportApi(form.projectId, form.phaseId, form.title, form.body);
      setForm({ projectId: '', phaseId: '', title: '', body: '' });
      setError('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The report could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  const downloadReport = (report: ApiReport) => {
    const content = `${report.title}\n${report.project} · ${report.phase}\n\n${report.body}`;
    const blobUrl = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = `${report.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'report'}.txt`;
    anchor.click();
    URL.revokeObjectURL(blobUrl);
  };

  if (loading) return <div className="reports-page"><PageLoading message="Loading project reports..." /></div>;

  return (
    <div className="reports-page">
      <header className="reports-header"><div><span className="reports-kicker">Project communication</span><h1>Reports</h1><p>Share project progress, decisions, and important updates.</p></div><strong>{reports.length} {reports.length === 1 ? 'report' : 'reports'}</strong></header>
      {canPublish && <form className="report-composer" onSubmit={submit}>
        <label>Project<select value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value, phaseId: '' })}><option value="">Choose a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label>Phase<select value={form.phaseId} onChange={(event) => setForm({ ...form, phaseId: event.target.value })} disabled={!form.projectId}><option value="">Choose a phase</option>{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.displayName || phase.name}</option>)}</select></label>
        <label>Report title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label>Details<textarea rows={5} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></label>
        {error && <p role="alert">{error}</p>}<button className="report-submit" type="submit" disabled={submitting}>{submitting ? 'Submitting report...' : 'Publish report'}</button>
      </form>}
      {!canPublish && error && <p role="alert">{error}</p>}
      <section className="reports-list">{reports.map((report) => <article className="report-card" key={report.id}><small>{report.project} · {report.phase} · {new Date(report.submittedAt).toLocaleDateString()}</small><h2>{report.title}</h2><p>{report.body}</p><div className="report-actions"><button className="report-download" type="button" onClick={() => downloadReport(report)}>Download report</button>{report.submittedById === user?.id && <button className="report-delete" type="button" onClick={() => void deleteReport(report.id)} disabled={deletingReportId === report.id}>{deletingReportId === report.id ? 'Deleting...' : 'Delete report'}</button>}</div></article>)}{!reports.length && <div className="reports-empty">No reports yet.</div>}</section>
    </div>
  );
};

export default ReportsPage;
