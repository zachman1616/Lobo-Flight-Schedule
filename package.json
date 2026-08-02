const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'lobo.db');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
      rank TEXT DEFAULT '',
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS aircraft (
      id TEXT PRIMARY KEY,
      tail TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'Ready',
      hours REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS flights (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration REAL DEFAULT 2.0,
      aircraft TEXT,
      mission TEXT,
      pilot TEXT DEFAULT '',
      copilot TEXT DEFAULT '',
      nrcm TEXT DEFAULT '[]',          -- JSON array
      mo TEXT DEFAULT '[]',            -- JSON array
      notes TEXT DEFAULT '',
      aircraft_event TEXT DEFAULT '',
      general_event TEXT DEFAULT '',
      status TEXT DEFAULT 'SCHED',
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS aftp_requests (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,              -- full JSON blob for flexibility
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_flights_date ON flights(date);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
  `);
}

function seedInitialData() {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount > 0) return; // already seeded

  console.log('[DB] Seeding initial data...');

  // Create recovery + test admin accounts
  const hash = bcrypt.hashSync('RECOVER2026', 12);
  const testHash = bcrypt.hashSync('test123', 12);

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, email, password_hash, role, rank, first_name, last_name, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(
    'recovery-001',
    'RECOVERY',
    'recovery@lobodustoff.local',
    hash,
    'admin',
    'WO1',
    'Recovery',
    'Account',
    'approved'
  );

  insertUser.run(
    'admin-test-001',
    'testuser',
    'test@example.com',
    testHash,
    'admin',
    'CPT',
    'Test',
    'User',
    'approved'
  );

  // Seed aircraft (from original app)
  const insertAc = db.prepare(`
    INSERT INTO aircraft (id, tail, type, status, hours, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const aircraft = [
    { id: 'a1', tail: '059', type: 'UH-60L' },
    { id: 'a2', tail: '486', type: 'UH-60L' },
    { id: 'a3', tail: '061', type: 'UH-60L' },
    { id: 'a4', tail: '262', type: 'HH-60M' },
    { id: 'a5', tail: '264', type: 'HH-60M' },
    { id: 'a6', tail: '269', type: 'HH-60M' },
    { id: 'a7', tail: '272', type: 'HH-60M' },
    { id: 'a8', tail: '295', type: 'HH-60M' },
    { id: 'a9', tail: '297', type: 'HH-60M' }
  ];

  for (const ac of aircraft) {
    insertAc.run(ac.id, ac.tail, ac.type, 'Ready', 0, '');
  }

  console.log('[DB] Seed complete. Admin accounts:');
  console.log('  Username: RECOVERY   Password: RECOVER2026  (admin)');
  console.log('  Username: testuser   Password: test123      (admin)');
}

// Initialize on load
initSchema();
seedInitialData();

module.exports = db;
