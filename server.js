require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & parsing
app.use(helmet({
  contentSecurityPolicy: false, // allow inline scripts for the existing SPA
  crossOriginEmbedderPolicy: false
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'lobo-dustoff-dev-secret-change-me-in-production-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

// ========== AUTH HELPERS ==========
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function getCurrentUser(req) {
  if (!req.session.userId) return null;
  return db.prepare(`
    SELECT id, username, email, role, rank, first_name, last_name, status
    FROM users WHERE id = ?
  `).get(req.session.userId);
}

// ========== AUTH ROUTES ==========
app.post('/api/auth/signup', (req, res) => {
  try {
    const { username, email, password, role, rank, firstName, lastName } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Only allow 'user' role on self-signup. Admins are created by existing admins.
    const safeRole = 'user';

    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?')
      .get(username, email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const id = uuidv4();
    const passwordHash = bcrypt.hashSync(password, 12);

    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role, rank, first_name, last_name, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      id,
      username.trim(),
      email.toLowerCase().trim(),
      passwordHash,
      safeRole,
      rank || '',
      firstName || '',
      lastName || ''
    );

    res.status(201).json({
      message: 'Account created. Waiting for admin approval.',
      user: { id, username, email, status: 'pending' }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = db.prepare(`
      SELECT * FROM users WHERE username = ? OR email = ?
    `).get(username, username.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status !== 'approved') {
      return res.status(403).json({
        error: user.status === 'pending'
          ? 'Account pending admin approval'
          : 'Account has been rejected'
      });
    }

    req.session.userId = user.id;
    req.session.role = user.role;

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      rank: user.rank,
      firstName: user.first_name,
      lastName: user.last_name,
      status: user.status
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out' });
  });
});

app.get('/api/auth/me', (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    rank: user.rank,
    firstName: user.first_name,
    lastName: user.last_name,
    status: user.status
  });
});

// ========== USER MANAGEMENT (Admin) ==========
app.get('/api/users', requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, email, role, rank, first_name, last_name, status, created_at
    FROM users
    ORDER BY created_at DESC
  `).all();
  res.json(users);
});

app.get('/api/users/pending', requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, email, role, rank, first_name, last_name, status, created_at
    FROM users WHERE status = 'pending'
    ORDER BY created_at ASC
  `).all();
  res.json(users);
});

app.patch('/api/users/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const result = db.prepare('UPDATE users SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ message: 'Status updated', status });
});

app.patch('/api/users/:id/role', requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  // Prevent removing the last admin
  if (role === 'user') {
    const adminCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE role = \'admin\' AND status = \'approved\'').get().c;
    const target = db.prepare('SELECT role FROM users WHERE id = ?').get(req.params.id);
    if (adminCount <= 1 && target?.role === 'admin') {
      return res.status(400).json({ error: 'Cannot demote the last admin' });
    }
  }
  const result = db.prepare('UPDATE users SET role = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(role, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ message: 'Role updated', role });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  if (req.params.id === req.session.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ message: 'User deleted' });
});

// ========== AIRCRAFT ==========
app.get('/api/aircraft', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM aircraft ORDER BY tail').all();
  res.json(rows);
});

app.post('/api/aircraft', requireAdmin, (req, res) => {
  const { tail, type, status, hours, notes } = req.body;
  if (!tail || !type) return res.status(400).json({ error: 'Tail and type required' });
  const id = uuidv4();
  try {
    db.prepare(`
      INSERT INTO aircraft (id, tail, type, status, hours, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, tail, type, status || 'Ready', hours || 0, notes || '');
    res.status(201).json({ id, tail, type, status: status || 'Ready', hours: hours || 0, notes: notes || '' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Tail number already exists' });
    }
    throw err;
  }
});

app.put('/api/aircraft/:id', requireAdmin, (req, res) => {
  const { tail, type, status, hours, notes } = req.body;
  const result = db.prepare(`
    UPDATE aircraft SET tail = ?, type = ?, status = ?, hours = ?, notes = ?
    WHERE id = ?
  `).run(tail, type, status, hours, notes, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Aircraft not found' });
  res.json({ message: 'Updated' });
});

app.delete('/api/aircraft/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM aircraft WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Aircraft not found' });
  res.json({ message: 'Deleted' });
});

// ========== FLIGHTS ==========
app.get('/api/flights', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM flights ORDER BY date, time').all();
  // Parse JSON fields
  const flights = rows.map(r => ({
    ...r,
    nrcm: JSON.parse(r.nrcm || '[]'),
    mo: JSON.parse(r.mo || '[]'),
    aircraftEvent: r.aircraft_event,
    generalEvent: r.general_event
  }));
  res.json(flights);
});

app.post('/api/flights', requireAuth, (req, res) => {
  const user = getCurrentUser(req);
  const f = req.body;

  const id = uuidv4();
  db.prepare(`
    INSERT INTO flights (
      id, date, time, duration, aircraft, mission, pilot, copilot,
      nrcm, mo, notes, aircraft_event, general_event, status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    f.date,
    f.time || '09:00',
    f.duration || 2.0,
    f.aircraft || '',
    f.mission || '',
    f.pilot || '',
    f.copilot || '',
    JSON.stringify(f.nrcm || []),
    JSON.stringify(f.mo || []),
    f.notes || '',
    f.aircraftEvent || f.aircraft_event || '',
    f.generalEvent || f.general_event || '',
    f.status || 'SCHED',
    user.id
  );

  res.status(201).json({ id, ...f });
});

app.put('/api/flights/:id', requireAuth, (req, res) => {
  const f = req.body;
  const result = db.prepare(`
    UPDATE flights SET
      date = ?, time = ?, duration = ?, aircraft = ?, mission = ?,
      pilot = ?, copilot = ?, nrcm = ?, mo = ?, notes = ?,
      aircraft_event = ?, general_event = ?, status = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    f.date,
    f.time,
    f.duration,
    f.aircraft,
    f.mission,
    f.pilot,
    f.copilot,
    JSON.stringify(f.nrcm || []),
    JSON.stringify(f.mo || []),
    f.notes,
    f.aircraftEvent || f.aircraft_event || '',
    f.generalEvent || f.general_event || '',
    f.status,
    req.params.id
  );
  if (result.changes === 0) return res.status(404).json({ error: 'Flight not found' });
  res.json({ message: 'Updated' });
});

app.delete('/api/flights/:id', requireAuth, (req, res) => {
  // Admins can delete any; users can only delete their own pending ones if desired
  // For simplicity, any authenticated user can delete for now (tighten later if needed)
  const result = db.prepare('DELETE FROM flights WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Flight not found' });
  res.json({ message: 'Deleted' });
});

// ========== HEALTH ==========
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Lobo Dustoff Scheduler', time: new Date().toISOString() });
});

// ========== STATIC FRONTEND ==========
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚁  Lobo Dustoff Flight Scheduler running on http://localhost:${PORT}`);
  console.log(`    Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`    Database: ${process.env.DATABASE_PATH || 'data/lobo.db'}\n`);
});
