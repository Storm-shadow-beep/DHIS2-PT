// src/App.tsx
import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { LoginPage } from './assets/components/Login/LoginPage';
import { RegisterPage } from './assets/components/Registration/Registration';
import { MainLayout } from './assets/components/MainLayout/MainLayout';
import { DashboardPage } from './assets/components/Dashboard';
import { ProjectsPage } from './assets/components/Projects/ProjectsPage';
import { DocumentsPage } from './assets/components/Documents/DocumentsPage';
import { getCurrentUserApi } from './assets/components/services/authApi';
import { PasswordResetPage } from './assets/components/PasswordReset/PasswordResetPage';

const routeTitles: Record<string, string> = {
  '/': 'PMS: Login',
  '/register': 'PMS: Registration',
  '/forgot-password': 'PMS: Forgot Password',
  '/reset-password': 'PMS: Reset Password',
  '/dashboard': 'PMS: Dashboard',
  '/projects': 'PMS: Projects',
  '/documents': 'PMS: Documents',
  '/reports': 'PMS: Reports',
  '/settings': 'PMS: Settings',
};

const PageTitleUpdater: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    const pathname = location.pathname;
    const fallbackTitle = routeTitles[pathname] ?? 'PMS';
    document.title = fallbackTitle;
  }, [location]);

  return null;
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getCurrentUserApi()
      .then((user) => { if (active) setIsAuthenticated(Boolean(user)); })
      .catch(() => { if (active) setIsAuthenticated(false); });
    return () => { active = false; };
  }, []);

  if (isAuthenticated === null) {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: '#132c45' }}>Checking session...</div>;
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
};

function App() {
  return (
    <>
      <PageTitleUpdater />
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<PasswordResetPage mode="request" />} />
        <Route path="/reset-password" element={<PasswordResetPage mode="reset" />} />

        {/* Protected Routes inside unified MainLayout */}
        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/reports" element={<div>Reports (Coming Soon)</div>} />
          <Route path="/settings" element={<div>Settings (Coming Soon)</div>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;