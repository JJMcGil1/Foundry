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

  // ---- Migration: add seq column for deterministic message ordering ---- //
  try {
    const msgInfo = db.exec("PRAGMA table_info(chat_messages)");
    const msgCols = msgInfo.length ? msgInfo[0].values.map(row => row[1]) : [];
    if (!msgCols.includes('seq')) {
      db.run("ALTER TABLE chat_messages ADD COLUMN seq INTEGER DEFAULT 0");
      // Backfill seq for existing messages based on created_at order
      const threadRows = db.exec('SELECT DISTINCT thread_id FROM chat_messages');
      if (threadRows.length) {
        for (const row of threadRows[0].values) {
          const threadId = row[0];
          const msgs = db.exec(
            'SELECT id FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC, rowid ASC',
            [threadId]
          );
          if (msgs.length) {
            let seq = 1;
            for (const msgRow of msgs[0].values) {
              db.run('UPDATE chat_messages SET seq = ? WHERE id = ?', [seq, msgRow[0]]);
              seq++;
            }
          }
        }
      }
      db.run(`CREATE INDEX IF NOT EXISTS idx_messages_thread_seq ON chat_messages(thread_id, seq DESC)`);
      console.log('[Foundry DB] Migrated: added seq column to chat_messages');
    }
  } catch (e) {
    console.error('[Foundry DB] seq migration error:', e);
  }

  // ---- DoneZo Tables ---- //
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS donezo_entries (
        id TEXT PRIMARY KEY,
        workspace_path TEXT NOT NULL,
        text TEXT NOT NULL,
        description TEXT,
        tag TEXT DEFAULT 'note',
        date TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        completed INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_donezo_entries_ws_date ON donezo_entries(workspace_path, date)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS donezo_tags (
        id TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        label TEXT NOT NULL,
        color TEXT NOT NULL,
        icon TEXT DEFAULT 'TbTag',
        sort_order INTEGER DEFAULT 0,
        PRIMARY KEY (id, workspace_path)
      )
    `);
    console.log('[Foundry DB] DoneZo tables ready');
  } catch (e) {
    console.error('[Foundry DB] DoneZo table init error:', e);
  }

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

  db.run('BEGIN TRANSACTION');
  try {
    for (const msg of messages) {
      // Preserve seq for existing messages; assign next seq for new ones
      const existing = db.exec('SELECT seq FROM chat_messages WHERE id = ?', [msg.id]);
      let seq;
      if (existing.length && existing[0].values.length) {
        seq = existing[0].values[0][0];
      } else {
        const seqResult = db.exec(
          'SELECT COALESCE(MAX(seq), 0) + 1 FROM chat_messages WHERE thread_id = ?',
          [msg.threadId]
        );
        seq = seqResult.length ? seqResult[0].values[0][0] : 1;
      }

      db.run(
        `INSERT OR REPLACE INTO chat_messages (id, thread_id, role, created_at, updated_at, data, seq)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [msg.id, msg.threadId, msg.role, msg.createdAt, msg.updatedAt, msg.data, seq]
      );
    }
    db.run('COMMIT');
    persistDb();
    return true;
  } catch (err) {
    try { db.run('ROLLBACK'); } catch (e) { /* already rolled back */ }
    console.error('[Foundry DB] Failed to save messages:', err);
    return false;
  }
}

function getMessages(threadId, limit = 50, beforeTimestamp = null) {
  if (!db) return { messages: [], hasMore: false, totalCount: 0 };

  // Get total count
  const countResult = db.exec('SELECT COUNT(*) FROM chat_messages WHERE thread_id = ?', [threadId]);
  const totalCount = countResult.length ? countResult[0].values[0][0] : 0;

  let sql, params;
  if (beforeTimestamp) {
    // Use seq for deterministic ordering; beforeTimestamp maps to a seq lookup
    sql = `SELECT id, thread_id, role, created_at, updated_at, data FROM chat_messages
           WHERE thread_id = ? AND seq < (SELECT COALESCE(MIN(seq), 2147483647) FROM chat_messages WHERE thread_id = ? AND created_at >= ?)
           ORDER BY seq DESC LIMIT ?`;
    params = [threadId, threadId, beforeTimestamp, limit + 1];
  } else {
    sql = `SELECT id, thread_id, role, created_at, updated_at, data FROM chat_messages
           WHERE thread_id = ? ORDER BY seq DESC LIMIT ?`;
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

// ---- DoneZo Entries ---- //

function donezoGetEntries(workspacePath, date) {
  if (!db) return [];
  let sql, params;
  if (date) {
    sql = 'SELECT id, text, description, tag, date, timestamp, completed, created_at FROM donezo_entries WHERE workspace_path = ? AND date = ? ORDER BY timestamp DESC';
    params = [workspacePath, date];
  } else {
    sql = 'SELECT id, text, description, tag, date, timestamp, completed, created_at FROM donezo_entries WHERE workspace_path = ? ORDER BY timestamp DESC';
    params = [workspacePath];
  }
  const results = db.exec(sql, params);
  if (!results.length) return [];
  return results[0].values.map(row => ({
    id: row[0], text: row[1], description: row[2], tag: row[3],
    date: row[4], timestamp: row[5], completed: row[6], created_at: row[7],
  }));
}

function donezoAddEntry({ workspacePath, text, description, tag, date, timestamp }) {
  if (!db) return null;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();
  const d = date || new Date().toISOString().split('T')[0];
  const ts = timestamp || now;
  db.run(
    `INSERT INTO donezo_entries (id, workspace_path, text, description, tag, date, timestamp, completed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [id, workspacePath, text, description || null, tag || 'note', d, ts, now]
  );
  persistDb();
  return { id, text, description: description || null, tag: tag || 'note', date: d, timestamp: ts, completed: 1, created_at: now };
}

function donezoUpdateEntry(id, updates) {
  if (!db) return null;
  const stmt = db.prepare('SELECT * FROM donezo_entries WHERE id = ?');
  stmt.bind([id]);
  if (!stmt.step()) { stmt.free(); return null; }
  const current = stmt.getAsObject();
  stmt.free();

  const text = updates.text !== undefined ? updates.text : current.text;
  const description = updates.description !== undefined ? updates.description : current.description;
  const tag = updates.tag !== undefined ? updates.tag : current.tag;

  db.run('UPDATE donezo_entries SET text = ?, description = ?, tag = ? WHERE id = ?', [text, description, tag, id]);
  persistDb();
  return { ...current, text, description, tag };
}

function donezoDeleteEntry(id) {
  if (!db) return false;
  db.run('DELETE FROM donezo_entries WHERE id = ?', [id]);
  persistDb();
  return true;
}

function donezoGetStats(workspacePath) {
  if (!db) return { today: 0, allTime: 0, streak: 0, weekData: [] };

  const today = new Date().toISOString().split('T')[0];

  // Today count
  const todayResult = db.exec('SELECT COUNT(*) FROM donezo_entries WHERE workspace_path = ? AND date = ?', [workspacePath, today]);
  const todayCount = todayResult.length ? todayResult[0].values[0][0] : 0;

  // All time count
  const allResult = db.exec('SELECT COUNT(*) FROM donezo_entries WHERE workspace_path = ?', [workspacePath]);
  const allTime = allResult.length ? allResult[0].values[0][0] : 0;

  // Streak: consecutive days going backwards from today with at least one entry
  let streak = 0;
  const d = new Date();
  while (true) {
    const dateStr = d.toISOString().split('T')[0];
    const r = db.exec('SELECT COUNT(*) FROM donezo_entries WHERE workspace_path = ? AND date = ?', [workspacePath, dateStr]);
    const count = r.length ? r[0].values[0][0] : 0;
    if (count > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  // Week data: last 7 days (Mon-Sun aligned to current week)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  const weekData = [];
  for (let i = 0; i < 7; i++) {
    const wd = new Date(monday);
    wd.setDate(monday.getDate() + i);
    const dateStr = wd.toISOString().split('T')[0];
    const r = db.exec('SELECT COUNT(*) FROM donezo_entries WHERE workspace_path = ? AND date = ?', [workspacePath, dateStr]);
    const count = r.length ? r[0].values[0][0] : 0;
    weekData.push({ date: dateStr, count, day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] });
  }

  return { today: todayCount, allTime, streak, weekData };
}

// ---- DoneZo Tags ---- //

function donezoGetTags(workspacePath) {
  if (!db) return [];
  const results = db.exec('SELECT id, label, color, icon, sort_order FROM donezo_tags WHERE workspace_path = ? ORDER BY sort_order ASC', [workspacePath]);
  if (!results.length) return [];
  return results[0].values.map(row => ({
    id: row[0], label: row[1], color: row[2], icon: row[3], sort_order: row[4],
  }));
}

function donezoSeedTags(workspacePath) {
  if (!db) return [];
  // Check if tags already exist for this workspace
  const existing = db.exec('SELECT COUNT(*) FROM donezo_tags WHERE workspace_path = ?', [workspacePath]);
  if (existing.length && existing[0].values[0][0] > 0) return donezoGetTags(workspacePath);

  const defaults = [
    { id: 'milestone', label: 'Milestone', color: '#4ADE80', icon: 'TbFlag', sort_order: 0 },
    { id: 'progress',  label: 'Progress',  color: '#22D3EE', icon: 'TbBolt', sort_order: 1 },
    { id: 'win',       label: 'Win',       color: '#FACC15', icon: 'TbTrophy', sort_order: 2 },
    { id: 'blocker',   label: 'Blocker',   color: '#F87171', icon: 'TbBarrierBlock', sort_order: 3 },
    { id: 'note',      label: 'Note',      color: '#A1A1AA', icon: 'TbNote', sort_order: 4 },
  ];
  for (const t of defaults) {
    db.run(
      'INSERT INTO donezo_tags (id, workspace_path, label, color, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [t.id, workspacePath, t.label, t.color, t.icon, t.sort_order]
    );
  }
  persistDb();
  return donezoGetTags(workspacePath);
}

function donezoCreateTag({ workspacePath, id, label, color, icon }) {
  if (!db) return null;
  const sortResult = db.exec('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM donezo_tags WHERE workspace_path = ?', [workspacePath]);
  const sortOrder = sortResult.length ? sortResult[0].values[0][0] : 0;
  db.run(
    'INSERT INTO donezo_tags (id, workspace_path, label, color, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    [id, workspacePath, label, color, icon || 'TbTag', sortOrder]
  );
  persistDb();
  return { id, label, color, icon: icon || 'TbTag', sort_order: sortOrder };
}

function donezoUpdateTag(id, workspacePath, updates) {
  if (!db) return null;
  const stmt = db.prepare('SELECT * FROM donezo_tags WHERE id = ? AND workspace_path = ?');
  stmt.bind([id, workspacePath]);
  if (!stmt.step()) { stmt.free(); return null; }
  const current = stmt.getAsObject();
  stmt.free();

  const label = updates.label !== undefined ? updates.label : current.label;
  const color = updates.color !== undefined ? updates.color : current.color;
  const icon = updates.icon !== undefined ? updates.icon : current.icon;

  db.run('UPDATE donezo_tags SET label = ?, color = ?, icon = ? WHERE id = ? AND workspace_path = ?',
    [label, color, icon, id, workspacePath]);
  persistDb();
  return { ...current, label, color, icon };
}

function donezoDeleteTag(id, workspacePath) {
  if (!db) return false;
  // Reassign entries with this tag to 'note'
  db.run('UPDATE donezo_entries SET tag = ? WHERE tag = ? AND workspace_path = ?', ['note', id, workspacePath]);
  db.run('DELETE FROM donezo_tags WHERE id = ? AND workspace_path = ?', [id, workspacePath]);
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
  // DoneZo
  donezoGetEntries,
  donezoAddEntry,
  donezoUpdateEntry,
  donezoDeleteEntry,
  donezoGetStats,
  donezoGetTags,
  donezoSeedTags,
  donezoCreateTag,
  donezoUpdateTag,
  donezoDeleteTag,
};
