import React from 'react';
import './TransitionOverlay.css';

interface TransitionOverlayProps {
  message: string;
  detail: string;
}

export const TransitionOverlay: React.FC<TransitionOverlayProps> = ({ message, detail }) => (
  <div className="transition-overlay" role="status" aria-live="polite" aria-label={message}>
    <div className="transition-orbit transition-orbit-one" />
    <div className="transition-orbit transition-orbit-two" />
    <div className="transition-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
    <p className="transition-brand">PMS V1.0</p>
    <h2>{message}</h2>
    <p className="transition-detail">{detail}</p>
    <div className="transition-progress" aria-hidden="true"><span /></div>
  </div>
);

export default TransitionOverlay;
