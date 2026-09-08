// src/assets/components/MainLayout/MainLayout.tsx
import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PERMISSION_NAMES } from '../services/authApi';
import { getRoleDisplayName, hasPermission } from '../auth/authorization';
import { useAuth } from '../auth/AuthContext';
import './MainLayout.css';

export const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const projectIdFromUrl = new URLSearchParams(location.search).get('projectId');
  const showDocumentsNav = (location.pathname === '/projects' || location.pathname === '/documents') && !!projectIdFromUrl;

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setTimeout(() => {
        navigate('/');
      }, 800);
    }
  };

  return (
    <div className="dashboard-layout">
      {/* Navigation Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-circle" />
          <div>
            <h3 className="brand-name">PMS V1.0</h3>
            <p className="brand-org">Project Management System</p>
          </div>
        </div>

        <nav className="nav-menu">
          {user && hasPermission(user, PERMISSION_NAMES.PROJECT_VIEW) && (
            <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
              Dashboard
            </NavLink>
          )}
          {user && hasPermission(user, PERMISSION_NAMES.PROJECT_VIEW) && (
            <NavLink to="/projects" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
              Projects
            </NavLink>
          )}
          {showDocumentsNav && user && hasPermission(user, PERMISSION_NAMES.DOCUMENT_VIEW) && (
            <NavLink
              to={`/documents?projectId=${projectIdFromUrl}`}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              Documents
            </NavLink>
          )}
          {user && hasPermission(user, PERMISSION_NAMES.PROJECT_VIEW) && (
            <NavLink to="/reports" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
              Reports
            </NavLink>
          )}
          {user && hasPermission(user, PERMISSION_NAMES.PROJECT_MANAGE) && (
            <NavLink to="/project-manager" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
              Manager Workspace
            </NavLink>
          )}
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
            Settings
          </NavLink>
          {user && hasPermission(user, PERMISSION_NAMES.USER_MANAGE) && (
            <NavLink to="/admin" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
              Administration
            </NavLink>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile-side">
            <span className="user-info-side">
              {user ? `${user.fullName} · ${getRoleDisplayName(user)}` : 'Loading user...'}
            </span>
            <button onClick={handleLogout} disabled={isLoggingOut} className="logout-btn">
              {isLoggingOut ? 'Signing Out...' : 'Sign Out'}
            </button>
          </div>

          <div className="drive-status-card">
            <div className="drive-header">
              <span className="status-dot green" />
              <span className="status-label">Drive Connection</span>
            </div>
            <p className="drive-subtext">Connected · MOH shared drive</p>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};