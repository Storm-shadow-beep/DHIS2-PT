// src/assets/components/MainLayout/MainLayout.tsx
import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getCurrentUserApi, logoutApi } from '../services/authApi';
import type { UserSession } from '../services/authApi';
import './MainLayout.css';

export const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const projectIdFromUrl = new URLSearchParams(location.search).get('projectId');
  const showDocumentsNav = (location.pathname === '/projects' || location.pathname === '/documents') && !!projectIdFromUrl;

  useEffect(() => {
    let active = true;
    getCurrentUserApi()
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch((err) => console.error('Failed to load user info:', err));

    return () => {
      active = false;
    };
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logoutApi();
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
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
            Dashboard
          </NavLink>
          <NavLink to="/projects" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
            Projects
          </NavLink>
          {showDocumentsNav && (
            <NavLink
              to={`/documents?projectId=${projectIdFromUrl}`}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              Documents
            </NavLink>
          )}
          <NavLink to="/reports" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
            Reports
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
            Settings
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile-side">
            <span className="user-info-side">
              {user ? `${user.fullName} · ${user.role}` : 'Loading user...'}
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