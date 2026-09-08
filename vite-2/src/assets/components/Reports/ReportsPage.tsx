import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../auth/authorization';
import { PERMISSION_NAMES } from '../services/authApi';
import { getProjectsApi, getReportsApi, submitReportApi } from '../services/projectApi';
import './ReportsPage.css';

interface Report {
  id: number;
  project: string;
  title: string;
  body: string;
  submittedAt: string;
}

export const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const canPublish = hasPermission(user, PERMISSION_NAMES.PROJECT_MANAGE);
  const [reports, setReports] = useState<Report[]>([]);
  const [projects, setProjects] = useState<{ id: string | number; name: string }[]>([]);
  const [form, setForm] = useState({ projectId: '', title: '', body: '' });
  const [error, setError] = useState('');

  const load = async () => {
    const [{ reports: nextReports }, { projects: nextProjects }] = await Promise.all([
      getReportsApi(),
      getProjectsApi(),
    ]);
    setReports(nextReports);
    setProjects(nextProjects.map((project) => ({ id: project.id, name: project.name })));
  };

  useEffect(() => {
    void load().catch(() => setError('Reports could not be loaded.'));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.projectId || !form.title.trim() || !form.body.trim()) {
      setError('Complete all fields before submitting the report.');
      return;
    }
    try {
      await submitReportApi(form.projectId, form.title, form.body);
      setForm({ projectId: '', title: '', body: '' });
      setError('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The report could not be submitted.');
    }
  };

  return (
    <div className="reports-page">
      <header className="reports-header">
        <div>
          <span className="reports-kicker">Project communication</span>
          <h1>Reports</h1>
          <p>Share project progress, decisions, and important updates.</p>
        </div>
        <strong>{reports.length} {reports.length === 1 ? 'report' : 'reports'}</strong>
      </header>

      {canPublish && (
        <form className="report-composer" onSubmit={submit}>
          <label>Project
            <select value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>
              <option value="">Choose a project</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label>Report title
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </label>
          <label>Details
            <textarea rows={5} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} />
          </label>
          {error && <p role="alert">{error}</p>}
          <button className="report-submit" type="submit">Publish report</button>
        </form>
      )}

      {!canPublish && error && <p role="alert">{error}</p>}
      <section className="reports-list">
        {reports.map((report) => (
          <article className="report-card" key={report.id}>
            <small>{report.project} · {new Date(report.submittedAt).toLocaleDateString()}</small>
            <h2>{report.title}</h2>
            <p>{report.body}</p>
          </article>
        ))}
        {!reports.length && <div className="reports-empty">No reports yet.</div>}
      </section>
    </div>
  );
};

export default ReportsPage;
