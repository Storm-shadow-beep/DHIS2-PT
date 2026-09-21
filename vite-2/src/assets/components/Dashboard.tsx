// src/assets/components/Dashboard.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getProjectDocumentsApi,
  getProjectRequirementsApi,
  getProjectPhasesApi,
  getProjectsApi,
} from './services/projectApi';
import { PageLoading } from './PageLoading/PageLoading';
import './Dashboard.css';

const STANDARD_PHASES = [
  'Initiation',
  'Requirements Analysis',
  'System Design',
  'Development',
  'Testing & UAT',
  'Deployment',
  'Closure',
];

interface DashboardProject {
  id: string;
  name: string;
  client: string;
  currentPhase: string;
  docsCompleted: number;
  docsTotal: number;
  documentationPercent: number;
  status: string;
}

interface OutstandingItem {
  requirementId: string;
  requirementName: string;
  projectName: string;
  phaseName: string;
  dueDate: string | null;
  overdueDays: number;
}

const todayKey = (): string => new Date().toISOString().slice(0, 10);

const overdueDaysFor = (dueDate: string | null, today: string): number => {
  if (!dueDate || dueDate >= today) return 0;
  const ms = Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${dueDate}T00:00:00.000Z`);
  return Math.max(1, Math.round(ms / 86_400_000));
};

const formatDueLabel = (dueDate: string | null, overdueDays: number): string => {
  if (!dueDate) return 'No due date';
  if (overdueDays > 0) return `Overdue ${overdueDays} d`;
  const parsed = new Date(`${dueDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return `Due ${dueDate}`;
  return `Due ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(parsed)}`;
};

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<DashboardProject[]>([]);
  const [outstanding, setOutstanding] = useState<OutstandingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadDashboard = async () => {
    setLoadError('');
    const { projects: apiProjects } = await getProjectsApi();
    const today = todayKey();

    const loaded = await Promise.all(
      apiProjects.map(async (apiProject) => {
        let requirementGroups: Awaited<ReturnType<typeof getProjectRequirementsApi>>['phases'] = [];
        let documents: Awaited<ReturnType<typeof getProjectDocumentsApi>>['documents'] = [];
        let phases: Awaited<ReturnType<typeof getProjectPhasesApi>>['phases'] = [];
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
          // dropping the whole dashboard when a detail endpoint denies/fails.
          console.error(`Could not load details for project ${apiProject.id}:`, detailError);
        }

        const requiredDocuments = requirementGroups.reduce(
          (total, group) => total + group.compliance.required,
          0,
        );
        const submittedDocuments = documents.length;
        const total = Math.max(requiredDocuments, submittedDocuments);
        const currentPhase =
          apiProject.currentPhase ??
          phases.find((phase) => phase.status === 'current')?.displayName ??
          phases.find((phase) => phase.status === 'current')?.name ??
          phases[0]?.displayName ??
          'Not started';

        const outstandingItems: OutstandingItem[] = requirementGroups.flatMap((group) =>
          group.requirements
            .filter((requirement) => requirement.documentCount === 0)
            .map((requirement) => ({
              requirementId: requirement.id,
              requirementName: requirement.name,
              projectName: apiProject.name,
              phaseName: group.phase.displayName || group.phase.name,
              dueDate: requirement.dueDate,
              overdueDays: overdueDaysFor(requirement.dueDate, today),
            })),
        );

        return {
          project: {
            id: String(apiProject.id),
            name: apiProject.name,
            client: apiProject.client ?? apiProject.subtitle ?? apiProject.description ?? '',
            currentPhase,
            docsCompleted: submittedDocuments,
            docsTotal: total,
            documentationPercent: total > 0 ? Math.round((submittedDocuments / total) * 100) : 0,
            status: apiProject.status ?? 'active',
          } satisfies DashboardProject,
          outstandingItems,
        };
      }),
    );

    setProjects(loaded.map((entry) => entry.project));
    const allOutstanding = loaded
      .flatMap((entry) => entry.outstandingItems)
      .sort((a, b) => {
        if (a.overdueDays > 0 && b.overdueDays === 0) return -1;
        if (b.overdueDays > 0 && a.overdueDays === 0) return 1;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return a.requirementName.localeCompare(b.requirementName);
      });
    setOutstanding(allOutstanding);
    setIsLoading(false);
  };

  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        await loadDashboard();
      } catch (error) {
        if (disposed) return;
        setIsLoading(false);
        setLoadError(error instanceof Error ? error.message : 'Could not load dashboard.');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === 'active'),
    [projects],
  );
  const testingCount = useMemo(
    () => activeProjects.filter((project) => project.currentPhase === 'Testing & UAT').length,
    [activeProjects],
  );
  const outstandingCount = outstanding.length;
  const overdueCount = useMemo(
    () => outstanding.filter((item) => item.overdueDays > 0).length,
    [outstanding],
  );
  const documentationAvg = useMemo(() => {
    if (activeProjects.length === 0) return 0;
    const total = activeProjects.reduce((sum, project) => sum + project.documentationPercent, 0);
    return Math.round(total / activeProjects.length);
  }, [activeProjects]);
  const phaseCounts = useMemo(() => {
    const counts = new Map<string, number>(STANDARD_PHASES.map((phase) => [phase, 0]));
    for (const project of activeProjects) {
      counts.set(project.currentPhase, (counts.get(project.currentPhase) ?? 0) + 1);
    }
    return STANDARD_PHASES.map((phase) => ({ phase, count: counts.get(phase) ?? 0 }));
  }, [activeProjects]);
  const topProjects = useMemo(() => activeProjects.slice(0, 5), [activeProjects]);
  const topOutstanding = useMemo(() => outstanding.slice(0, 5), [outstanding]);

  if (isLoading) {
    return (
      <div className="dashboard-content" style={{ padding: '32px' }}>
        <PageLoading message="Loading dashboard..." />
      </div>
    );
  }

  return (
    <div className="dashboard-content" style={{ padding: '32px' }}>
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Dashboard</h1>
      </div>

      {loadError && (
        <p className="empty-state" role="alert" style={{ marginBottom: '16px' }}>
          {loadError}
        </p>
      )}

      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-title">Active Projects</span>
          <span className="metric-value">{activeProjects.length}</span>
          <span className="metric-sub">{testingCount} in Testing &amp; UAT phase</span>
        </div>
        <div className="metric-card">
          <span className="metric-title">Documents Outstanding</span>
          <span className="metric-value">{outstandingCount}</span>
          <span className="metric-sub">Across {activeProjects.length} active projects</span>
        </div>
        <div className="metric-card">
          <span className="metric-title">Documentation Complete</span>
          <span className="metric-value">{documentationAvg}%</span>
          <span className="metric-sub">Avg. across active projects</span>
        </div>
        <div className="metric-card alert">
          <span className="metric-title">Overdue Submissions</span>
          <span className="metric-value text-red">{overdueCount}</span>
          <span className="metric-sub">Requires PM follow-up</span>
        </div>
      </div>

      {projects.length === 0 && !loadError ? (
        <p className="empty-state">No projects have been created yet.</p>
      ) : (
        <div className="dashboard-grid">
          <section className="dashboard-card projects-section">
            <div className="card-header">
              <h2>Active Projects</h2>
              <button className="text-btn" onClick={() => navigate('/projects')}>
                View All
              </button>
            </div>
            {topProjects.length === 0 ? (
              <p className="empty-state">No active projects.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>PROJECT</th>
                    <th>CLIENT</th>
                    <th>CURRENT PHASE</th>
                    <th>DOCUMENTATION</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {topProjects.map((project) => (
                    <tr key={project.id}>
                      <td><strong>{project.name}</strong></td>
                      <td>{project.client || '—'}</td>
                      <td>{project.currentPhase}</td>
                      <td>{project.documentationPercent}%</td>
                      <td>
                        <span className={`badge ${project.status === 'completed' ? 'complete' : 'pending'}`}>
                          {project.status === 'completed' ? 'Complete' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <div className="side-column">
            <section className="dashboard-card">
              <div className="card-header">
                <h2>Outstanding documents</h2>
              </div>
              {topOutstanding.length === 0 ? (
                <p className="empty-state">No outstanding documents.</p>
              ) : (
                <ul className="item-list">
                  {topOutstanding.map((item) => (
                    <li className="list-item" key={item.requirementId}>
                      <div>
                        <strong>{item.requirementName}</strong>
                        <p>{item.projectName} · {item.phaseName}</p>
                      </div>
                      <span className={`due-date${item.overdueDays > 0 ? ' text-red' : ''}`}>
                        {formatDueLabel(item.dueDate, item.overdueDays)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="dashboard-card">
              <div className="card-header">
                <h2>Projects by phase</h2>
              </div>
              <div className="phase-counts">
                {phaseCounts.map(({ phase, count }) => (
                  <div className="phase-row" key={phase}>
                    <span>{phase}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
};
