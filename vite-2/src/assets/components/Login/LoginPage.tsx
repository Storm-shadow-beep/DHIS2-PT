import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginApi, getCurrentUserApi } from '.././services/authApi';
import './LoginPage.css';

interface LoginCredentials {
  email: string;
  password: string;
  rememberMe: boolean;
}

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState<LoginCredentials>({
    email: '',
    password: '',
    rememberMe: false,
  });

  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUserApi().then((user) => {
      if (user) {
        navigate('/dashboard');
      }
    });
  }, [navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const validateForm = (): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.email.trim()) {
      setErrorMessage('Please enter your institutional email address.');
      return false;
    }

    if (!emailRegex.test(formData.email.trim())) {
      setErrorMessage('Please enter a valid email address (e.g., name@moh.go.tz).');
      return false;
    }

    if (!formData.password) {
      setErrorMessage('Please enter your password.');
      return false;
    }

    if (formData.password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!validateForm()) return;

    setLoading(true);

    try {
      await loginApi(formData.email, formData.password, formData.rememberMe);
      setSuccessMessage('Login successful!');

      setTimeout(() => {
        navigate('/dashboard');
      }, 1200);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('An unexpected error occurred during authentication.');
      }
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
          <h1 className="hero-title">
            Project documentation,<br />
            organised by phase.
          </h1>
          <p className="hero-description">
            Log in to track phase milestones, access Google Drive assets, and manage system deliverables from initial draft to final approval <span className="underlined-text"> track,</span> structure and check status for your projects.
          </p>

          <div className="stats-row">
            <div className="stat-box">
              <span className="stat-number">5</span>
              <span className="stat-label">standard<br />phases</span>
            </div>
            <div className="stat-box">
              <span className="stat-number">Google Drive</span>
              <span className="stat-label">Centralized Server</span>
            </div>
          </div>
        </div>
      </div>

      <div className="right-pane">
        <div className="form-container">
          <h2 className="form-title">Log in</h2>
          <p className="form-subtitle">Use your institutional account.</p>

          {errorMessage && <div className="error-box">{errorMessage}</div>}
          {successMessage && <div className="success-box">{successMessage}</div>}

          <form onSubmit={handleSubmit} className="login-form" noValidate>
            <p className="login-redirect">
              Don&apos;t have an account?{' '}
              <span onClick={() => navigate('/register')} className="register-link">
                Register
              </span>
            </p>

            <div className="input-group">
              <label className="input-label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="peter.salum@moh.go.tz"
                className="form-input"
              />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="password">Password</label>
              <div className="password-input-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••••••"
                  className="form-input password-input"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="options-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="rememberMe"
                  checked={formData.rememberMe}
                  onChange={handleChange}
                  className="checkbox-input"
                />
                Keep me signed in
              </label>
              <a href="#forgot-password" className="forgot-link">Forgot password</a>
            </div>

            <button type="submit" disabled={loading} className="submit-button">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="footer-note">Two-factor code required for administrators</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;