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

  db.run(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      last_opened TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ---- Chat Threads & Messages ---- //
  db.run(`
    CREATE TABLE IF NOT EXISTS chat_threads (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at INTEGER NOT NULL,
      last_modified INTEGER NOT NULL,
      workspace_path TEXT,
      message_count INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      data TEXT NOT NULL
    )
  `);

  // Composite index for paginated thread queries
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON chat_messages(thread_id, created_at DESC)`);
  // Simple thread lookup
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_thread ON chat_messages(thread_id)`);
  // Thread lookup by workspace
  db.run(`CREATE INDEX IF NOT EXISTS idx_threads_workspace ON chat_threads(workspace_path, last_modified DESC)`);

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

function getWorkspaces() {
  if (!db) return [];
  const results = db.exec('SELECT id, name, path, last_opened, created_at FROM workspaces ORDER BY last_opened DESC');
  if (!results.length) return [];
  return results[0].values.map(row => ({
    id: row[0], name: row[1], path: row[2], last_opened: row[3], created_at: row[4],
  }));
}

function addWorkspace(name, wsPath) {
  if (!db) return null;
  // Upsert: if path exists, just update last_opened and name
  const existing = db.exec('SELECT id FROM workspaces WHERE path = ?', [wsPath]);
  if (existing.length && existing[0].values.length) {
    db.run("UPDATE workspaces SET name = ?, last_opened = datetime('now') WHERE path = ?", [name, wsPath]);
  } else {
    db.run('INSERT INTO workspaces (name, path) VALUES (?, ?)', [name, wsPath]);
  }
  persistDb();
  return getWorkspaces();
}

function removeWorkspace(wsPath) {
  if (!db) return [];
  db.run('DELETE FROM workspaces WHERE path = ?', [wsPath]);
  persistDb();
  return getWorkspaces();
}

function touchWorkspace(wsPath) {
  if (!db) return;
  db.run("UPDATE workspaces SET last_opened = datetime('now') WHERE path = ?", [wsPath]);
  persistDb();
}

// ---- Chat Threads ---- //

function createThread({ id, title, workspacePath }) {
  if (!db) return null;
  const now = Date.now();
  db.run(
    `INSERT INTO chat_threads (id, title, created_at, last_modified, workspace_path, message_count)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [id, title || null, now, now, workspacePath || null]
  );
  persistDb();
  return { id, title: title || null, created_at: now, last_modified: now, workspace_path: workspacePath || null, message_count: 0 };
}

function getThreads(workspacePath) {
  if (!db) return [];
  let sql, params;
  if (workspacePath) {
    sql = 'SELECT id, title, created_at, last_modified, workspace_path, message_count FROM chat_threads WHERE workspace_path = ? ORDER BY last_modified DESC';
    params = [workspacePath];
  } else {
    sql = 'SELECT id, title, created_at, last_modified, workspace_path, message_count FROM chat_threads ORDER BY last_modified DESC';
    params = [];
  }
  const results = db.exec(sql, params);
  if (!results.length) return [];
  return results[0].values.map(row => ({
    id: row[0], title: row[1], created_at: row[2], last_modified: row[3],
    workspace_path: row[4], message_count: row[5],
  }));
}

function getThread(id) {
  if (!db) return null;
  const stmt = db.prepare('SELECT id, title, created_at, last_modified, workspace_path, message_count FROM chat_threads WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function updateThread(id, updates) {
  if (!db) return null;
  const current = getThread(id);
  if (!current) return null;
  const title = updates.title !== undefined ? updates.title : current.title;
  const messageCount = updates.message_count !== undefined ? updates.message_count : current.message_count;
  const lastModified = Date.now();
  db.run(
    `UPDATE chat_threads SET title = ?, message_count = ?, last_modified = ? WHERE id = ?`,
    [title, messageCount, lastModified, id]
  );
  persistDb();
  return { ...current, title, message_count: messageCount, last_modified: lastModified };
}

function deleteThread(id) {
  if (!db) return false;
  db.run('DELETE FROM chat_messages WHERE thread_id = ?', [id]);
  db.run('DELETE FROM chat_threads WHERE id = ?', [id]);
  persistDb();
  return true;
}

// ---- Chat Messages ---- //

function saveMessages(messages) {
  if (!db || !messages.length) return false;
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO chat_messages (id, thread_id, role, created_at, updated_at, data)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const msg of messages) {
    stmt.run([msg.id, msg.threadId, msg.role, msg.createdAt, msg.updatedAt, msg.data]);
  }
  stmt.free();
  persistDb();
  return true;
}

function getMessages(threadId, limit = 50, beforeTimestamp = null) {
  if (!db) return { messages: [], hasMore: false, totalCount: 0 };

  // Get total count
  const countResult = db.exec('SELECT COUNT(*) FROM chat_messages WHERE thread_id = ?', [threadId]);
  const totalCount = countResult.length ? countResult[0].values[0][0] : 0;

  let sql, params;
  if (beforeTimestamp) {
    sql = `SELECT id, thread_id, role, created_at, updated_at, data FROM chat_messages
           WHERE thread_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?`;
    params = [threadId, beforeTimestamp, limit + 1];
  } else {
    sql = `SELECT id, thread_id, role, created_at, updated_at, data FROM chat_messages
           WHERE thread_id = ? ORDER BY created_at DESC LIMIT ?`;
    params = [threadId, limit + 1];
  }

  const results = db.exec(sql, params);
  if (!results.length) return { messages: [], hasMore: false, totalCount };

  const rows = results[0].values;
  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;

  // Reverse to chronological order
  const messages = trimmed.reverse().map(row => ({
    id: row[0], threadId: row[1], role: row[2], createdAt: row[3], updatedAt: row[4], data: row[5],
  }));

  return { messages, hasMore, totalCount };
}

function getMessageCount(threadId) {
  if (!db) return 0;
  const result = db.exec('SELECT COUNT(*) FROM chat_messages WHERE thread_id = ?', [threadId]);
  return result.length ? result[0].values[0][0] : 0;
}

function deleteThreadMessages(threadId) {
  if (!db) return false;
  db.run('DELETE FROM chat_messages WHERE thread_id = ?', [threadId]);
  persistDb();
  return true;
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
  getWorkspaces,
  addWorkspace,
  removeWorkspace,
  touchWorkspace,
  closeDatabase,
  // Chat threads & messages
  createThread,
  getThreads,
  getThread,
  updateThread,
  deleteThread,
  saveMessages,
  getMessages,
  getMessageCount,
  deleteThreadMessages,
};
