import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { PermissionName } from '../services/authApi';
import { hasPermission } from './authorization';
import { useAuth } from './AuthContext';

const centeredStyle = {
  display: 'grid',
  placeItems: 'center',
  minHeight: '100vh',
  color: '#132c45',
};

export const AccessDenied: React.FC = () => (
  <div style={{ ...centeredStyle, padding: '32px', textAlign: 'center' }}>
    <div>
      <h1>Access denied</h1>
      <p>You do not have permission to view this section.</p>
    </div>
  </div>
);

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <div style={centeredStyle}>Checking session...</div>;
  if (status === 'unauthenticated') {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};

export const PermissionRoute: React.FC<{
  permission: PermissionName;
  children: React.ReactNode;
}> = ({ permission, children }) => {
  const { user } = useAuth();
  return user && hasPermission(user, permission) ? <>{children}</> : <AccessDenied />;
};
