// src/assets/components/Dashboard.tsx
import React from 'react';
import './Dashboard.css';

export const DashboardPage: React.FC = () => {
  return (
    <div className="dashboard-content" style={{ padding: '32px' }}>
      {/* Title */}
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Dashboard</h1>
      </div>

      {/* Metric Cards Row */}
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-title">Active Projects</span>
          <span className="metric-value">6</span>
          <span className="metric-sub">2 in Testing & UAT phase</span>
        </div>
        <div className="metric-card">
          <span className="metric-title">Documents Outstanding</span>
          <span className="metric-value">14</span>
          <span className="metric-sub">Across 4 active projects</span>
        </div>
        <div className="metric-card">
          <span className="metric-title">Documentation Complete</span>
          <span className="metric-value">78%</span>
          <span className="metric-sub">Avg. across active projects</span>
        </div>
        <div className="metric-card alert">
          <span className="metric-title">Overdue Submissions</span>
          <span className="metric-value text-red">3</span>
          <span className="metric-sub">Requires PM follow-up</span>
        </div>
      </div>

      {/* Center Content Split */}
      <div className="dashboard-grid">
        {/* Active Projects Table */}
        <section className="dashboard-card projects-section">
          <div className="card-header">
            <h2>Active Projects</h2>
            <button className="text-btn">View All</button>
          </div>
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
              <tr>
                <td><strong>Document Organization Module</strong></td>
                <td>UDSM Practical Training</td>
                <td>System Design</td>
                <td>62%</td>
                <td><span className="badge pending">Pending</span></td>
              </tr>
              <tr>
                <td><strong>Community Registry Portal</strong></td>
                <td>Regional Council</td>
                <td>Requirements Analysis</td>
                <td>40%</td>
                <td><span className="badge pending">Pending</span></td>
              </tr>
              <tr>
                <td><strong>Facility Asset Tracker</strong></td>
                <td>Internal</td>
                <td>Testing & UAT</td>
                <td>91%</td>
                <td><span className="badge complete">Complete</span></td>
              </tr>
              <tr>
                <td><strong>Water Quality Field App</strong></td>
                <td>Water Authority</td>
                <td>Deployment</td>
                <td>100%</td>
                <td><span className="badge complete">Complete</span></td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Right Column: Outstanding & Phases */}
        <div className="side-column">
          {/* Outstanding Documents */}
          <section className="dashboard-card">
            <div className="card-header">
              <h2>Outstanding documents</h2>
            </div>
            <ul className="item-list">
              <li className="list-item">
                <div>
                  <strong>Database Design</strong>
                  <p>Document Organization Module · System Design</p>
                </div>
                <span className="due-date">Due 23 Aug</span>
              </li>
              <li className="list-item">
                <div>
                  <strong>Architecture Documentation</strong>
                  <p>Document Organization Module · System Design</p>
                </div>
                <span className="due-date">Due 23 Aug</span>
              </li>
              <li className="list-item">
                <div>
                  <strong>UAT Report</strong>
                  <p>Facility Asset Tracker · Testing & UAT</p>
                </div>
                <span className="due-date text-red">Overdue 4 d</span>
              </li>
              <li className="list-item">
                <div>
                  <strong>Business Process Document</strong>
                  <p>Community Registry Portal · Requirements Analysis</p>
                </div>
                <span className="due-date">Due 2 Sep</span>
              </li>
            </ul>
          </section>

          {/* Projects by Phase */}
          <section className="dashboard-card">
            <div className="card-header">
              <h2>Projects by phase</h2>
            </div>
            <div className="phase-counts">
              <div className="phase-row"><span>Initiation</span><strong>1</strong></div>
              <div className="phase-row"><span>Requirements Analysis</span><strong>2</strong></div>
              <div className="phase-row"><span>System Design</span><strong>1</strong></div>
              <div className="phase-row"><span>Development</span><strong>0</strong></div>
              <div className="phase-row"><span>Testing & UAT</span><strong>2</strong></div>
              <div className="phase-row"><span>Deployment</span><strong>1</strong></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};