import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const ALLOWED_ROLES = ['System Analyst', 'Project Manager', 'Developer', 'Administrator'];

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const createToken = () => crypto.randomBytes(32).toString('hex');

const isStrongPassword = (password) => {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
};

const setAuthCookie = (res, token, rememberMe) => {
  const ttl = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  res.cookie('remember_me', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ttl,
  });
};

const clearAuthCookie = (res) => {
  res.clearCookie('remember_me', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
};

const safeUser = (user) => ({
  id: user.id,
  fullName: user.full_name,
  email: user.email,
  role: user.system_role,
});

export const register = (pool) => async (req, res) => {
  const fullName = String(req.body?.fullName || '').trim();
  const email = normalizeEmail(req.body?.email);
  const role = String(req.body?.role || '').trim();
  const password = String(req.body?.password || '');
  const confirmPassword = String(req.body?.confirmPassword || '');

  if (!fullName) return res.status(400).json({ message: 'Please enter your full name.' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Please enter a valid institutional email address.' });
  }
  if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ message: 'Invalid system role selected.' });
  if (!isStrongPassword(password)) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long and contain letters and numbers.' });
  }
  if (password !== confirmPassword) return res.status(400).json({ message: 'Passwords do not match.' });

  try {
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(409).json({ message: 'An account with this email already exists. Please sign in instead.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      'INSERT INTO users (full_name, email, system_role, password_hash) VALUES (?, ?, ?, ?)',
      [fullName, email, role, passwordHash]
    );

    return res.status(201).json({
      message: 'Account created successfully.',
      user: { id: result.insertId, fullName, email, role },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Could not complete registration.' });
  }
};

export const login = (pool) => async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const rememberMe = Boolean(req.body?.rememberMe);
  const genericAuthError = { message: 'Invalid email or password.' };

  if (!email || !password) return res.status(400).json(genericAuthError);

  try {
    const [rows] = await pool.execute(
      'SELECT id, full_name, email, system_role, password_hash, failed_attempts, locked_until FROM users WHERE email = ?',
      [email]
    );

    if (!rows.length) return res.status(401).json(genericAuthError);
    const user = rows[0];

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(429).json({ message: 'Account locked due to multiple failed attempts. Try again later.' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      const attempts = (user.failed_attempts || 0) + 1;
      const lockTime = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await pool.execute('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?', [attempts, lockTime, user.id]);
      return res.status(401).json(genericAuthError);
    }

    await pool.execute('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);

    const token = createToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + (rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 19).replace('T', ' ');

    await pool.execute(
      'INSERT INTO user_sessions (user_id, session_token_hash, expires_at) VALUES (?, ?, ?)',
      [user.id, tokenHash, expiresAt]
    );

    setAuthCookie(res, token, rememberMe);
    return res.json({ message: 'Login successful.', user: safeUser(user) });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Could not complete login.' });
  }
};

export const logout = (pool) => async (req, res) => {
  try {
    const token = req.cookies?.remember_me;
    if (token) {
      const tokenHash = hashToken(token);
      await pool.execute('DELETE FROM user_sessions WHERE session_token_hash = ?', [tokenHash]);
    }
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    clearAuthCookie(res);
    return res.json({ message: 'Logged out successfully.' });
  }
};

export const getMe = (pool) => async (req, res) => {
  const token = req.cookies?.remember_me;
  if (!token) return res.status(401).json({ message: 'Not authenticated.' });

  try {
    const tokenHash = hashToken(token);
    const [rows] = await pool.execute(
      `SELECT u.id, u.full_name, u.email, u.system_role
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.session_token_hash = ? AND s.expires_at > UTC_TIMESTAMP()`,
      [tokenHash]
    );

    if (!rows.length) {
      clearAuthCookie(res);
      return res.status(401).json({ message: 'Session expired or invalid.' });
    }

    return res.json({ user: safeUser(rows[0]) });
  } catch (error) {
    console.error('GetMe error:', error);
    return res.status(500).json({ message: 'Could not verify session.' });
  }
};