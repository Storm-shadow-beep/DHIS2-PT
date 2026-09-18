import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  AuthApiError,
  changePasswordApi,
  logoutOtherSessionsApi,
  updateProfileApi,
} from '../services/authApi';
import { getRoleDisplayName } from '../auth/authorization';
import './SettingsPage.css';
import { PageLoading } from '../PageLoading/PageLoading';

type ThemePreference = 'light' | 'dark' | 'system';
type SettingsAction = 'password' | 'name' | 'picture';

const themeKey = 'pms-theme';

const errorMessage = (error: unknown): string => {
  if (error instanceof AuthApiError && (error.status === 409 || error.status === 429)) {
    return error.message || 'This setting can only be changed once every three months.';
  }
  return error instanceof Error ? error.message : 'Unable to save your changes. Please try again.';
};

const applyThemePreference = (theme: ThemePreference): void => {
  const dark = theme === 'dark'
    || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
};

const ThemeCard: React.FC = () => {
  const [theme, setTheme] = useState<ThemePreference>(
    () => (localStorage.getItem(themeKey) as ThemePreference) || 'system',
  );

  useEffect(() => {
    localStorage.setItem(themeKey, theme);
    applyThemePreference(theme);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyThemePreference(theme);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, [theme]);

  return (
    <section className="settings-card settings-theme-card">
      <div className="settings-card-heading"><span className="settings-icon">◐</span><div><h2>Theme</h2><p className="settings-muted">Choose how the system looks on this device.</p></div></div>
      <div className="theme-options">{(['light', 'dark', 'system'] as ThemePreference[]).map((option) => (
        <label className={`theme-option ${theme === option ? 'selected' : ''}`} key={option}>
          <input type="radio" name="theme" checked={theme === option} onChange={() => setTheme(option)} />
          <span>{option === 'light' ? 'White' : option === 'system' ? 'Automatic' : 'Dark'}</span>
        </label>
      ))}</div>
    </section>
  );
};

const SettingsOverview: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user) return <div className="settings-page"><PageLoading message="Loading account settings..." /></div>;

  const signOutOtherSessions = async () => {
    setSaving(true);
    setStatus('');
    try {
      await logoutOtherSessionsApi();
      setStatus('All other sessions have been signed out.');
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const actionCards: Array<{ key: SettingsAction; title: string; description: string; action: string }> = [
    { key: 'password', title: 'Change password', description: 'Update your password and keep your account secure.', action: 'Change password' },
    { key: 'name', title: 'Edit display name', description: 'Change the name shown across the application.', action: 'Edit display name' },
    { key: 'picture', title: 'Profile picture', description: 'Personalize your account with a picture or avatar.', action: 'Change picture' },
  ];

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div><p className="eyebrow">Account</p><h1>Settings</h1><p>Manage your profile, security and appearance.</p></div>
      </header>
      <div className="settings-overview-grid">
        {actionCards.map((card) => (
          <button className="settings-action-card" type="button" key={card.key} onClick={() => navigate(`/settings/${card.key}`)}>
            <span className="settings-action-icon">{card.key === 'password' ? '•••' : card.key === 'name' ? 'Aa' : '◎'}</span>
            <span className="settings-action-content"><strong>{card.title}</strong><span>{card.description}</span></span>
            <span className="settings-arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>
      <div className="settings-lower-grid">
        <ThemeCard />
        <section className="settings-card account-card">
          <div className="settings-card-heading"><span className="settings-icon">◎</span><div><h2>Account information</h2><p className="settings-muted">Your account details and access roles.</p></div></div>
          <dl><dt>Email</dt><dd>{user.email}</dd><dt>Roles</dt><dd>{(user.roles?.length ? user.roles : [getRoleDisplayName(user)]).join(', ')}</dd><dt>User ID</dt><dd>{user.id}</dd></dl>
        </section>
      </div>
      <section className="settings-security-card">
        <div><span className="settings-security-icon">✓</span><div><h2>Sign out other sessions</h2><p>Keep this session active and sign out everywhere else.</p></div></div>
        <button className="settings-button secondary" type="button" onClick={() => void signOutOtherSessions()} disabled={saving}>{saving ? 'Signing out...' : 'Sign out other sessions'}</button>
      </section>
      {status && <p className="settings-status settings-global-status" role="status">{status}</p>}
    </div>
  );
};

const SettingsActionPage: React.FC<{ action: SettingsAction }> = ({ action }) => {
  const { user, setAuthenticatedUser, signOut } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [displayName, setDisplayName] = useState(user?.fullName ?? '');
  const [picture, setPicture] = useState(user?.profilePicture ?? '');
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropX, setCropX] = useState(50);
  const [cropY, setCropY] = useState(50);
  const [cropZoom, setCropZoom] = useState(1);
  const [fileInputKey, setFileInputKey] = useState(0);

  if (!user) return <div className="settings-page"><PageLoading message="Loading account settings..." /></div>;

  const run = async (callback: () => Promise<void>) => {
    setSaving(true);
    setStatus('');
    try {
      await callback();
      setStatus(action === 'password' ? 'Password updated. Signing you out...' : 'Changes saved successfully.');
      if (action === 'picture') {
        setCropSource(null);
        setCropX(50);
        setCropY(50);
        setCropZoom(1);
        setFileInputKey((key) => key + 1);
      }
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const selectPicture = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) {
      setStatus('Choose an image no larger than 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const source = String(reader.result);
      setPicture(source);
      setCropSource(source);
      setCropX(50);
      setCropY(50);
      setCropZoom(1);
    };
    reader.readAsDataURL(file);
  };

  const cropPicture = async (): Promise<string | null> => {
    if (!cropSource) return picture || null;
    const image = new Image();
    image.src = cropSource;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Unable to read this image. Please choose another image.'));
    });

    const size = 512;
    const cropSize = Math.min(image.naturalWidth, image.naturalHeight) / cropZoom;
    const left = (image.naturalWidth - cropSize) * (cropX / 100);
    const top = (image.naturalHeight - cropSize) * (cropY / 100);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare the image crop.');
    context.drawImage(image, left, top, cropSize, cropSize, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.88);
  };

  const title = action === 'password' ? 'Change password' : action === 'name' ? 'Edit display name' : 'Profile picture';
  return (
    <div className="settings-page settings-detail-page">
      <button className="settings-back-button" type="button" onClick={() => navigate('/settings')}>← Back to settings</button>
      <header className="settings-header"><p className="eyebrow">Account settings</p><h1>{title}</h1><p>{action === 'password' ? 'Use a strong password you do not reuse elsewhere.' : action === 'name' ? 'Your display name is visible throughout the system.' : 'Your picture is shown in your profile card and to administrators.'}</p></header>
      <section className="settings-card settings-detail-card">
        {action === 'password' && <form onSubmit={(event) => { event.preventDefault(); void run(async () => { if (!passwords.current || passwords.next.length < 8 || passwords.next !== passwords.confirm) throw new Error('Enter your current password and a matching new password (at least 8 characters).'); await changePasswordApi(passwords.current, passwords.next); await signOut(); }); }}>
          <label>Current password<input required type="password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} /></label>
          <label>New password<input required type="password" value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} /></label>
          <label>Confirm new password<input required type="password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} /></label>
          <button className="settings-button" disabled={saving}>{saving ? 'Updating...' : 'Update password'}</button>
        </form>}
        {action === 'name' && <form onSubmit={(event) => { event.preventDefault(); void run(async () => {
          const nextName = displayName.trim();
          if (!nextName) throw new Error('Enter a display name.');
          setAuthenticatedUser(await updateProfileApi({ fullName: nextName }));
        }); }}>
          <label>Display name<input required maxLength={150} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
          <button className="settings-button" disabled={saving}>{saving ? 'Saving...' : 'Save display name'}</button>
        </form>}
        {action === 'picture' && <div className="picture-form">
          <div className="profile-preview">{picture ? <img src={picture} alt="Profile preview" /> : <span>{user.fullName.charAt(0).toUpperCase()}</span>}</div>
          {cropSource && <div className="crop-editor">
            <div className="crop-frame">
              <img src={cropSource} alt="Crop preview" style={{ objectPosition: `${cropX}% ${cropY}%`, transform: `scale(${cropZoom})` }} />
            </div>
            <p className="crop-help">Choose the area to focus in your profile picture.</p>
            <label>Horizontal focus<input type="range" min="0" max="100" value={cropX} onChange={(e) => setCropX(Number(e.target.value))} /></label>
            <label>Vertical focus<input type="range" min="0" max="100" value={cropY} onChange={(e) => setCropY(Number(e.target.value))} /></label>
            <label>Zoom<input type="range" min="1" max="3" step="0.1" value={cropZoom} onChange={(e) => setCropZoom(Number(e.target.value))} /></label>
          </div>}
          <label className="file-picker">Choose an image<input key={fileInputKey} type="file" accept="image/*" onChange={(e) => selectPicture(e.target.files?.[0])} /></label>
          <button className="settings-button" type="button" onClick={() => void run(async () => {
            const croppedPicture = await cropPicture();
            if (!croppedPicture) throw new Error('Choose an image before saving.');
            const updatedUser = await updateProfileApi({ profilePicture: croppedPicture });
            setAuthenticatedUser(updatedUser);
            setPicture(updatedUser.profilePicture ?? '');
          })} disabled={saving}>{saving ? 'Saving...' : 'Save picture'}</button>
          {(user.profilePicture || picture) && <button
            className="settings-button danger"
            type="button"
            onClick={() => void run(async () => {
              const updatedUser = await updateProfileApi({ profilePicture: null });
              setAuthenticatedUser(updatedUser);
              setPicture('');
            })}
            disabled={saving}
          >
            {saving ? 'Removing...' : 'Remove profile picture'}
          </button>}
        </div>}
        {status && <p className="settings-status" role="status">{status}</p>}
      </section>
    </div>
  );
};

export const SettingsPage: React.FC = () => <SettingsOverview />;

export const SettingsDetailPage: React.FC<{ action: SettingsAction }> = ({ action }) => <SettingsActionPage action={action} />;

export default SettingsPage;
