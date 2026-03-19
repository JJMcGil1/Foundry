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

  // Drop legacy DoneZo tables if they exist
  try {
    db.run('DROP TABLE IF EXISTS donezo_entries');
    db.run('DROP TABLE IF EXISTS donezo_tags');
  } catch (e) { /* ignore */ }

  // ---- Boards ---- //
  db.run(`
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      workspace_path TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_boards_workspace ON boards(workspace_path, position)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS board_columns (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#a78bfa',
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_board_columns_board ON board_columns(board_id, position)`);

  // ---- Tasks (Kanban) ---- //
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT DEFAULT 'medium',
      color TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      workspace_path TEXT,
      board_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, position)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_path, status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_board ON tasks(board_id, status, position)`);

  // ---- Migration: add board_id to tasks if missing ---- //
  try {
    const taskInfo = db.exec("PRAGMA table_info(tasks)");
    const taskCols = taskInfo.length ? taskInfo[0].values.map(row => row[1]) : [];
    if (!taskCols.includes('board_id')) {
      db.run("ALTER TABLE tasks ADD COLUMN board_id TEXT");
      console.log('[Foundry DB] Migrated: added board_id column to tasks');
    }
  } catch (e) { /* column already exists */ }

  // ---- Ensure default board exists for each workspace ---- //
  _ensureDefaultBoards();

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

// ---- Tasks (Kanban) ---- //

function getTasks(workspacePath) {
  if (!db) return [];
  let sql, params;
  if (workspacePath) {
    sql = 'SELECT * FROM tasks WHERE workspace_path = ? ORDER BY status, position ASC';
    params = [workspacePath];
  } else {
    sql = 'SELECT * FROM tasks ORDER BY status, position ASC';
    params = [];
  }
  const results = db.exec(sql, params);
  if (!results.length) return [];
  const cols = results[0].columns;
  return results[0].values.map(row => {
    const obj = {};
    cols.forEach((c, i) => obj[c] = row[i]);
    return obj;
  });
}

function createTask({ id, title, description, status, priority, color, position, workspacePath, boardId }) {
  if (!db) return null;
  const now = Date.now();
  // If no position given, put at end of that status column
  if (position === undefined || position === null) {
    const res = db.exec(
      'SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE status = ?',
      [status || 'todo']
    );
    position = res.length ? res[0].values[0][0] : 0;
  }
  db.run(
    `INSERT INTO tasks (id, title, description, status, priority, color, position, workspace_path, board_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, title, description || null, status || 'todo', priority || 'medium', color || null, position, workspacePath || null, boardId || null, now, now]
  );
  persistDb();
  return { id, title, description: description || null, status: status || 'todo', priority: priority || 'medium', color: color || null, position, workspace_path: workspacePath || null, board_id: boardId || null, created_at: now, updated_at: now };
}

function updateTask(id, updates) {
  if (!db) return null;
  const results = db.exec('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!results.length || !results[0].values.length) return null;
  const cols = results[0].columns;
  const current = {};
  cols.forEach((c, i) => current[c] = results[0].values[0][i]);

  const title = updates.title !== undefined ? updates.title : current.title;
  const description = updates.description !== undefined ? updates.description : current.description;
  const status = updates.status !== undefined ? updates.status : current.status;
  const priority = updates.priority !== undefined ? updates.priority : current.priority;
  const color = updates.color !== undefined ? updates.color : current.color;
  const position = updates.position !== undefined ? updates.position : current.position;
  const now = Date.now();

  db.run(
    `UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, color = ?, position = ?, updated_at = ? WHERE id = ?`,
    [title, description, status, priority, color, position, now, id]
  );
  persistDb();
  return { ...current, title, description, status, priority, color, position, updated_at: now };
}

function deleteTask(id) {
  if (!db) return false;
  db.run('DELETE FROM tasks WHERE id = ?', [id]);
  persistDb();
  return true;
}

function reorderTasks(taskUpdates) {
  if (!db || !taskUpdates.length) return false;
  db.run('BEGIN TRANSACTION');
  try {
    const now = Date.now();
    for (const t of taskUpdates) {
      db.run(
        'UPDATE tasks SET status = ?, position = ?, updated_at = ? WHERE id = ?',
        [t.status, t.position, now, t.id]
      );
    }
    db.run('COMMIT');
    persistDb();
    return true;
  } catch (err) {
    try { db.run('ROLLBACK'); } catch (e) { /* */ }
    console.error('[Foundry DB] Failed to reorder tasks:', err);
    return false;
  }
}

// ---- Boards ---- //

function _ensureDefaultBoards() {
  if (!db) return;
  // Get all distinct workspace_paths from tasks that don't have a board_id
  const orphanWs = db.exec("SELECT DISTINCT workspace_path FROM tasks WHERE board_id IS NULL");
  if (!orphanWs.length) return;
  for (const row of orphanWs[0].values) {
    const wsPath = row[0];
    // Check if a board already exists for this workspace
    const existing = db.exec(
      'SELECT id FROM boards WHERE workspace_path IS ? LIMIT 1',
      [wsPath]
    );
    let boardId;
    if (existing.length && existing[0].values.length) {
      boardId = existing[0].values[0][0];
    } else {
      boardId = `board_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = Date.now();
      db.run(
        'INSERT INTO boards (id, name, workspace_path, position, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
        [boardId, 'Default Board', wsPath, now, now]
      );
      // Create default columns
      const defaultCols = [
        { name: 'To Do', color: '#a78bfa', status: 'todo' },
        { name: 'In Progress', color: '#fbbf24', status: 'in_progress' },
        { name: 'Review', color: '#38bdf8', status: 'review' },
        { name: 'Done', color: '#34d399', status: 'done' },
      ];
      defaultCols.forEach((col, idx) => {
        const colId = col.status; // Use status as column id for migration compatibility
        db.run(
          'INSERT INTO board_columns (id, board_id, name, color, position) VALUES (?, ?, ?, ?, ?)',
          [colId, boardId, col.name, col.color, idx]
        );
      });
    }
    // Assign orphaned tasks to this board
    db.run('UPDATE tasks SET board_id = ? WHERE workspace_path IS ? AND board_id IS NULL', [boardId, wsPath]);
  }
  persistDb();
}

function getBoards(workspacePath) {
  if (!db) return [];
  let sql, params;
  if (workspacePath) {
    sql = 'SELECT * FROM boards WHERE workspace_path = ? ORDER BY position ASC';
    params = [workspacePath];
  } else {
    sql = 'SELECT * FROM boards WHERE workspace_path IS NULL ORDER BY position ASC';
    params = [];
  }
  const results = db.exec(sql, params);
  if (!results.length) return [];
  const cols = results[0].columns;
  return results[0].values.map(row => {
    const obj = {};
    cols.forEach((c, i) => obj[c] = row[i]);
    return obj;
  });
}

function createBoard({ id, name, workspacePath }) {
  if (!db) return null;
  const now = Date.now();
  // Get next position
  const res = db.exec(
    'SELECT COALESCE(MAX(position), -1) + 1 FROM boards WHERE workspace_path IS ?',
    [workspacePath || null]
  );
  const position = res.length ? res[0].values[0][0] : 0;
  db.run(
    'INSERT INTO boards (id, name, workspace_path, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, workspacePath || null, position, now, now]
  );
  // Create default columns for new board
  const defaultCols = [
    { name: 'To Do', color: '#a78bfa' },
    { name: 'In Progress', color: '#fbbf24' },
    { name: 'Review', color: '#38bdf8' },
    { name: 'Done', color: '#34d399' },
  ];
  defaultCols.forEach((col, idx) => {
    const colId = `col_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.run(
      'INSERT INTO board_columns (id, board_id, name, color, position) VALUES (?, ?, ?, ?, ?)',
      [colId, id, col.name, col.color, idx]
    );
  });
  persistDb();
  return { id, name, workspace_path: workspacePath || null, position, created_at: now, updated_at: now };
}

function updateBoard(id, updates) {
  if (!db) return null;
  const results = db.exec('SELECT * FROM boards WHERE id = ?', [id]);
  if (!results.length || !results[0].values.length) return null;
  const cols = results[0].columns;
  const current = {};
  cols.forEach((c, i) => current[c] = results[0].values[0][i]);

  const name = updates.name !== undefined ? updates.name : current.name;
  const position = updates.position !== undefined ? updates.position : current.position;
  const now = Date.now();
  db.run('UPDATE boards SET name = ?, position = ?, updated_at = ? WHERE id = ?', [name, position, now, id]);
  persistDb();
  return { ...current, name, position, updated_at: now };
}

function deleteBoard(id) {
  if (!db) return false;
  db.run('DELETE FROM board_columns WHERE board_id = ?', [id]);
  db.run('DELETE FROM tasks WHERE board_id = ?', [id]);
  db.run('DELETE FROM boards WHERE id = ?', [id]);
  persistDb();
  return true;
}

// ---- Board Columns ---- //

function getBoardColumns(boardId) {
  if (!db) return [];
  const results = db.exec('SELECT * FROM board_columns WHERE board_id = ? ORDER BY position ASC', [boardId]);
  if (!results.length) return [];
  const cols = results[0].columns;
  return results[0].values.map(row => {
    const obj = {};
    cols.forEach((c, i) => obj[c] = row[i]);
    return obj;
  });
}

function createBoardColumn({ id, boardId, name, color }) {
  if (!db) return null;
  const now = Date.now();
  const res = db.exec(
    'SELECT COALESCE(MAX(position), -1) + 1 FROM board_columns WHERE board_id = ?',
    [boardId]
  );
  const position = res.length ? res[0].values[0][0] : 0;
  db.run(
    'INSERT INTO board_columns (id, board_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, boardId, name, color || '#a78bfa', position, now]
  );
  persistDb();
  return { id, board_id: boardId, name, color: color || '#a78bfa', position, created_at: now };
}

function updateBoardColumn(id, updates) {
  if (!db) return null;
  const results = db.exec('SELECT * FROM board_columns WHERE id = ?', [id]);
  if (!results.length || !results[0].values.length) return null;
  const cols = results[0].columns;
  const current = {};
  cols.forEach((c, i) => current[c] = results[0].values[0][i]);

  const name = updates.name !== undefined ? updates.name : current.name;
  const color = updates.color !== undefined ? updates.color : current.color;
  const position = updates.position !== undefined ? updates.position : current.position;
  db.run('UPDATE board_columns SET name = ?, color = ?, position = ? WHERE id = ?', [name, color, position, id]);
  persistDb();
  return { ...current, name, color, position };
}

function deleteBoardColumn(id) {
  if (!db) return false;
  // Move tasks in this column to null status (or delete them)
  db.run('DELETE FROM tasks WHERE status = ? AND board_id = (SELECT board_id FROM board_columns WHERE id = ?)', [id, id]);
  db.run('DELETE FROM board_columns WHERE id = ?', [id]);
  persistDb();
  return true;
}

function reorderBoardColumns(columnUpdates) {
  if (!db || !columnUpdates.length) return false;
  db.run('BEGIN TRANSACTION');
  try {
    for (const c of columnUpdates) {
      db.run('UPDATE board_columns SET position = ? WHERE id = ?', [c.position, c.id]);
    }
    db.run('COMMIT');
    persistDb();
    return true;
  } catch (err) {
    try { db.run('ROLLBACK'); } catch (e) { /* */ }
    return false;
  }
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
  // Boards
  getBoards,
  createBoard,
  updateBoard,
  deleteBoard,
  // Board Columns
  getBoardColumns,
  createBoardColumn,
  updateBoardColumn,
  deleteBoardColumn,
  reorderBoardColumns,
  // Tasks (Kanban)
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks,
};
