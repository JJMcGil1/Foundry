const initSqlJs = require('sql.js');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

let db = null;
let dbPath = null;

function getDbPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'foundry.db');
}

function persistDb() {
  if (!db || !dbPath) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    // Write to temp file first, then rename for atomic write (prevents corruption on crash)
    const tmpPath = dbPath + '.tmp';
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, dbPath);
  } catch (err) {
    console.error('[Foundry DB] Failed to persist:', err);
  }
}

async function initDatabase() {
  dbPath = getDbPath();
  console.log('[Foundry DB] Path:', dbPath);

  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
    console.log('[Foundry DB] Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('[Foundry DB] Created new database');
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      password TEXT,
      profile_photo TEXT,
      theme TEXT NOT NULL DEFAULT 'dark',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migrate existing databases: add email/password columns if missing
  try {
    const tableInfo = db.exec("PRAGMA table_info(user_profile)");
    if (tableInfo.length > 0) {
      const columns = tableInfo[0].values.map(row => row[1]);
      if (!columns.includes('email')) db.run("ALTER TABLE user_profile ADD COLUMN email TEXT");
      if (!columns.includes('password')) db.run("ALTER TABLE user_profile ADD COLUMN password TEXT");
    }
  } catch (e) { /* columns already exist */ }

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  persistDb();

  // Auto-save every 30 seconds as a safety net against hard kills
  setInterval(() => {
    persistDb();
  }, 30000);

  console.log('[Foundry DB] Initialized');
  return db;
}

function getProfile() {
  if (!db) return null;
  const stmt = db.prepare('SELECT * FROM user_profile WHERE id = 1');
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function createProfile({ firstName, lastName, email, password, profilePhoto, theme }) {
  if (!db) return null;
  db.run('DELETE FROM user_profile WHERE id = 1');
  db.run(
    `INSERT INTO user_profile (id, first_name, last_name, email, password, profile_photo, theme, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [firstName, lastName, email || null, password || null, profilePhoto || null, theme || 'dark']
  );
  persistDb();
  return getProfile();
}

function updateProfile(updates) {
  if (!db) return null;
  const current = getProfile();
  if (!current) return null;

  const firstName = updates.firstName !== undefined ? updates.firstName : current.first_name;
  const lastName = updates.lastName !== undefined ? updates.lastName : current.last_name;
  const email = updates.email !== undefined ? updates.email : current.email;
  const password = updates.password !== undefined ? updates.password : current.password;
  const profilePhoto = updates.profilePhoto !== undefined ? updates.profilePhoto : current.profile_photo;
  const theme = updates.theme !== undefined ? updates.theme : current.theme;

  db.run(
    `UPDATE user_profile
     SET first_name = ?, last_name = ?, email = ?, password = ?, profile_photo = ?, theme = ?, updated_at = datetime('now')
     WHERE id = 1`,
    [firstName, lastName, email, password, profilePhoto, theme]
  );
  persistDb();
  return getProfile();
}

function saveProfilePhoto(dataUrl) {
  const userDataPath = app.getPath('userData');
  const photosDir = path.join(userDataPath, 'profile');
  if (!fs.existsSync(photosDir)) {
    fs.mkdirSync(photosDir, { recursive: true });
  }

  const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) return null;

  const ext = matches[1];
  const data = matches[2];
  const filename = `avatar.${ext}`;
  const filepath = path.join(photosDir, filename);

  fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
  return filepath;
}

function loadProfilePhoto(filepath) {
  if (!filepath || !fs.existsSync(filepath)) return null;
  const ext = path.extname(filepath).slice(1);
  const data = fs.readFileSync(filepath);
  return `data:image/${ext};base64,${data.toString('base64')}`;
}

function getSetting(key) {
  if (!db) return null;
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  stmt.bind([key]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row.value;
  }
  stmt.free();
  return null;
}

function setSetting(key, value) {
  if (!db) return;
  db.run('DELETE FROM settings WHERE key = ?', [key]);
  db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
  persistDb();
}

function closeDatabase() {
  if (db) {
    persistDb();
    db.close();
    db = null;
  }
}

module.exports = {
  initDatabase,
  getProfile,
  createProfile,
  updateProfile,
  saveProfilePhoto,
  loadProfilePhoto,
  getSetting,
  setSetting,
  closeDatabase,
};
