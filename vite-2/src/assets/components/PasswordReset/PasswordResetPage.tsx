import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { requestPasswordResetApi, resetPasswordApi } from '../services/authApi';
import '../Login/LoginPage.css';

export const PasswordResetPage: React.FC<{ mode: 'request' | 'reset' }> = ({ mode }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams]);
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (mode === 'request') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setErrorMessage('Enter a valid email address.');
        return;
      }
      setLoading(true);
      try {
        await requestPasswordResetApi(email.trim());
        setSuccessMessage('If that email exists, a password reset link has been sent.');
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to request a password reset.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!token) {
      setErrorMessage('This password reset link is missing its token.');
      return;
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setErrorMessage('Password must be at least 8 characters and contain letters and numbers.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await resetPasswordApi(token, newPassword);
      setSuccessMessage('Password reset successful. Redirecting to login...');
      window.setTimeout(() => navigate('/'), 1200);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to reset your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="left-pane">
        <div className="brand-header">
          <div className="brand-icon" />
          <div>
            <h2 className="brand-title">PMS V1.0</h2>
            <p className="brand-subtitle">Project Management Software</p>
          </div>
        </div>
        <div className="hero-content">
          <h1 className="hero-title">Secure account recovery.</h1>
          <p className="hero-description">Choose a new password and get back to managing your project documentation.</p>
        </div>
      </div>
      <div className="right-pane">
        <div className="form-container">
          <h2 className="form-title">{mode === 'request' ? 'Forgot password?' : 'Set a new password'}</h2>
          <p className="form-subtitle">
            {mode === 'request' ? 'Enter your account email to receive a reset link.' : 'Your reset link is valid for 60 minutes.'}
          </p>
          {errorMessage && <div className="error-box">{errorMessage}</div>}
          {successMessage && <div className="success-box">{successMessage}</div>}
          <form onSubmit={handleSubmit} className="login-form" noValidate>
            {mode === 'request' ? (
              <div className="input-group">
                <label className="input-label" htmlFor="reset-email">Email address</label>
                <input id="reset-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="form-input" autoFocus />
              </div>
            ) : (
              <>
                <div className="input-group">
                  <label className="input-label" htmlFor="new-password">New password</label>
                  <input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="form-input" autoFocus />
                </div>
                <div className="input-group">
                  <label className="input-label" htmlFor="confirm-password">Confirm new password</label>
                  <input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="form-input" />
                </div>
              </>
            )}
            <button type="submit" disabled={loading} className="submit-button">
              {loading ? 'Please wait...' : mode === 'request' ? 'Send reset link' : 'Reset password'}
            </button>
            <Link to="/" className="back-button">Return to login</Link>
          </form>
        </div>
      </div>
    </div>
  );
};
