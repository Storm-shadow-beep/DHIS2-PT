import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerApi } from '../services/authApi';
import './Registration.css';

interface RegisterCredentials {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState<RegisterCredentials>({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validateForm = (): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.fullName.trim()) {
      setErrorMessage('Please enter your full name.');
      return false;
    }

    if (!formData.email.trim() || !emailRegex.test(formData.email.trim())) {
      setErrorMessage('Please enter a valid institutional email address.');
      return false;
    }

    // Password policy requirement: minimum 8 characters, containing both letters and numbers
    if (
      formData.password.length < 8 ||
      !/[A-Za-z]/.test(formData.password) ||
      !/\d/.test(formData.password)
    ) {
      setErrorMessage(
        'Password must be at least 8 characters long and contain both letters and numbers.'
      );
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!validateForm()) return;

    setLoading(true);

    try {
      const result = await registerApi({
        fullName: formData.fullName,
        email: formData.email,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
      });

      setSuccessMessage(result.message || 'Account created successfully.');
      setTimeout(() => navigate('/'), 1200);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('An unexpected error occurred during registration.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-container">
      <div className="left-pane">
        <div className="brand-header">
          <div className="brand-icon" />
          <div>
            <h2 className="brand-title">PMS V1.0</h2>
            <p className="brand-subtitle">Project Management Software</p>
          </div>
        </div>

        <div className="hero-content">
          <h1 className="hero-title">Account Registration</h1>
          <p className="hero-description">
            Create your operational identity to start managing software phases, reviewing project deliverables, and tracking <span className="underlined-text">Drive</span> assets.
          </p>
        </div>
      </div>

      <div className="right-pane">
        <div className="form-container">
          <h2 className="form-title">Create an account</h2>
          <p className="form-subtitle">Enter your details to register as a team member.</p>

          {successMessage && <div className="success-box">{successMessage}</div>}
          {errorMessage && <div className="error-box">{errorMessage}</div>}

          <form onSubmit={handleSubmit} className="register-form" noValidate>
            <div className="input-group">
              <label className="input-label" htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Peter Salum"
                className="form-input"
              />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="email">Institutional Email</label>
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
              <label className="input-label">Initial role</label>
              <p className="form-subtitle">New accounts start as Team Member. An administrator assigns additional roles.</p>
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
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••••••"
                className="form-input"
              />
            </div>

            <button type="submit" disabled={loading} className="submit-button">
              {loading ? 'Creating account...' : 'Register'}
            </button>
          </form>

          <p className="login-redirect">
            Already have an account?{' '}
            <span onClick={() => navigate('/')} className="login-link">
              Sign in
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;