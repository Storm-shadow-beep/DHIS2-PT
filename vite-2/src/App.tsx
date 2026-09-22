// src/App.tsx
import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { LoginPage } from './assets/components/Login/LoginPage';
import { RegisterPage } from './assets/components/Registration/Registration';
import { MainLayout } from './assets/components/MainLayout/MainLayout';
import { DashboardPage } from './assets/components/Dashboard';
import { ProjectsPage } from './assets/components/Projects/ProjectsPage';
import { DocumentsPage } from './assets/components/Documents/DocumentsPage';
import { PasswordResetPage } from './assets/components/PasswordReset/PasswordResetPage';
import { ProjectManagerPage } from './assets/components/ProjectManager/ProjectManagerPage';
import { ReportsPage } from './assets/components/Reports/ReportsPage';
import { AdminPage } from './assets/components/Admin/AdminPage';
import SettingsPage, { SettingsDetailPage } from './assets/components/Settings/SettingsPage';
import { PermissionRoute, ProtectedRoute } from './assets/components/auth/RouteGuards';
import { PERMISSION_NAMES } from './assets/components/services/authApi';
import { useAuth } from './assets/components/auth/AuthContext';
import { applyTheme, getStoredTheme } from './assets/services/theme';

const routeTitles: Record<string, string> = {
  '/': 'PMS: Login',
  '/register': 'PMS: Registration',
  '/forgot-password': 'PMS: Forgot Password',
  '/reset-password': 'PMS: Reset Password',
  '/dashboard': 'PMS: Dashboard',
  '/projects': 'PMS: Projects',
  '/documents': 'PMS: Documents',
  '/reports': 'PMS: Reports',
  '/project-manager': 'PMS: Project Manager',
  '/settings': 'PMS: Settings',
  '/settings/password': 'PMS: Change Password',
  '/settings/name': 'PMS: Edit Display Name',
  '/settings/picture': 'PMS: Profile Picture',
  '/admin': 'PMS: Administration',
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

const ThemeBootstrap: React.FC = () => {
  const { user } = useAuth();

  useEffect(() => {
    const preference = getStoredTheme(user?.id);
    const apply = () => {
      applyTheme(preference);
    };
    apply();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener?.('change', apply);
    return () => media.removeEventListener?.('change', apply);
  }, [user?.id]);
  return null;
};

function App() {
  return (
    <>
      <ThemeBootstrap />
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
          <Route path="/dashboard" element={
            <PermissionRoute permission={PERMISSION_NAMES.PROJECT_VIEW}>
              <DashboardPage />
            </PermissionRoute>
          } />
          <Route path="/projects" element={
            <PermissionRoute permission={PERMISSION_NAMES.PROJECT_VIEW}>
              <ProjectsPage />
            </PermissionRoute>
          } />
          <Route path="/documents" element={
            <PermissionRoute permission={PERMISSION_NAMES.DOCUMENT_VIEW}>
              <DocumentsPage />
            </PermissionRoute>
          } />
          <Route path="/reports" element={
            <PermissionRoute permission={PERMISSION_NAMES.PROJECT_VIEW}>
              <ReportsPage />
            </PermissionRoute>
          } />
          <Route path="/project-manager" element={
            <PermissionRoute permission={PERMISSION_NAMES.PROJECT_MANAGE}>
              <ProjectManagerPage />
            </PermissionRoute>
          } />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/password" element={<SettingsDetailPage action="password" />} />
          <Route path="/settings/name" element={<SettingsDetailPage action="name" />} />
          <Route path="/settings/picture" element={<SettingsDetailPage action="picture" />} />
          <Route path="/admin" element={
            <PermissionRoute permission={PERMISSION_NAMES.USER_MANAGE}>
              <AdminPage />
            </PermissionRoute>
          } />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;