import React from 'react';
import './PageLoading.css';

interface PageLoadingProps {
  message?: string;
}

export const PageLoading: React.FC<PageLoadingProps> = ({ message = 'Loading your workspace...' }) => (
  <div className="page-loading" role="status" aria-live="polite">
    <span className="page-loading-spinner" aria-hidden="true" />
    <span>{message}</span>
  </div>
);

export default PageLoading;
