const { app, BrowserWindow, Menu, nativeImage, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { execSync, exec, execFile, spawn } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const pty = require('node-pty');
const https = require('https');
const { initDatabase, getProfile, createProfile, updateProfile, saveProfilePhoto, loadProfilePhoto, getSetting, setSetting, getWorkspaces, addWorkspace, removeWorkspace, touchWorkspace, closeDatabase, createThread, getThreads, getThread, updateThread, deleteThread, saveMessages, getMessages, getMessageCount, deleteThreadMessages } = require('./database');
const { initAutoUpdater, destroyAutoUpdater } = require('./auto-updater');

// ---- GitHub Avatar Resolution ---- //
const avatarCache = new Map(); // key: "email||author" → url string | null
const avatarPending = new Map(); // key → Promise
const MAX_AVATAR_CACHE = 500; // Prevent unbounded growth
function setAvatarCache(key, value) {
  if (avatarCache.size >= MAX_AVATAR_CACHE) {
    // Evict oldest entry
    const firstKey = avatarCache.keys().next().value;
    avatarCache.delete(firstKey);
  }
  avatarCache.set(key, value);
}

function probeGitHubAvatar(username) {
  return new Promise((resolve) => {
    const url = `https://github.com/${encodeURIComponent(username)}.png?size=64`;
    const req = https.request(url, { method: 'HEAD', timeout: 4000 }, (res) => {
      // GitHub returns 302 → avatars.githubusercontent.com for valid users
      // or 404 for non-existent ones
      if (res.statusCode >= 200 && res.statusCode < 400) {
        // Return the final avatar URL (follow the redirect location)
        const avatarUrl = res.headers.location || `https://github.com/${encodeURIComponent(username)}.png?size=64`;
        resolve(avatarUrl);
      } else {
        resolve(null);
      }
      res.resume(); // drain response
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function resolveAvatar(author, email) {
  const key = `${email || ''}||${author || ''}`;
  if (avatarCache.has(key)) return avatarCache.get(key);
  if (avatarPending.has(key)) return avatarPending.get(key);

  const work = (async () => {
    // Step 1: Extract username from GitHub noreply email
    const noreplyMatch = (email || '').match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i);
    if (noreplyMatch) {
      const url = await probeGitHubAvatar(noreplyMatch[1]);
      if (url) { setAvatarCache(key, url); avatarPending.delete(key); return url; }
    }

    // Step 2: Try author name as GitHub username (strip spaces, lowercase)
    if (author) {
      const guess = author.replace(/\s+/g, '').toLowerCase();
      const url = await probeGitHubAvatar(guess);
      if (url) { setAvatarCache(key, url); avatarPending.delete(key); return url; }
    }

    // Step 3: Try email local part as username
    if (email && !email.includes('noreply')) {
      const localPart = email.split('@')[0];
      if (localPart && localPart !== author?.replace(/\s+/g, '').toLowerCase()) {
        const url = await probeGitHubAvatar(localPart);
        if (url) { setAvatarCache(key, url); avatarPending.delete(key); return url; }
      }
    }

    // All steps failed
    setAvatarCache(key, null);
    avatarPending.delete(key);
    return null;
  })();

  avatarPending.set(key, work);
  return work;
}

async function resolveAvatarsBatch(authors) {
  // authors = [{ author, email }, ...]
  // Dedupe by key
  const unique = new Map();
  for (const a of authors) {
    const key = `${a.email || ''}||${a.author || ''}`;
    if (!unique.has(key)) unique.set(key, a);
  }

  const results = {};
  const promises = [];
  for (const [key, a] of unique) {
    promises.push(
      resolveAvatar(a.author, a.email).then(url => {
        results[key] = url;
      })
    );
  }
  await Promise.all(promises);
  return results;
}

// ---- Claude API Streaming ---- //
const activeStreams = new Map(); // streamId → { process/controller, windowId }

// ---- IPC Batching ---- //
// Instead of sending one IPC message per stream event (hundreds/sec), batch them
// and flush once per tick (~16ms). This prevents main process event loop saturation.
const ipcBatchQueues = new Map(); // windowId → { events: [], timer: null }

function queueStreamEvent(win, channel, ...args) {
  if (!win || win.isDestroyed()) return;
  const winId = win.id;
  let batch = ipcBatchQueues.get(winId);
  if (!batch) {
    batch = { events: [], timer: null };
    ipcBatchQueues.set(winId, batch);
  }
  batch.events.push({ channel, args });
  if (!batch.timer) {
    batch.timer = setTimeout(() => {
      flushIpcBatch(winId);
    }, 16); // ~1 frame
  }
}

function flushIpcBatch(winId) {
  const batch = ipcBatchQueues.get(winId);
  if (!batch) return;
  batch.timer = null;
  const events = batch.events;
  batch.events = [];
  if (events.length === 0) return;

  // Find the window
  const win = BrowserWindow.getAllWindows().find(w => w.id === winId);
  if (!win || win.isDestroyed()) {
    ipcBatchQueues.delete(winId);
    return;
  }

  // Send batched events as a single IPC message
  if (events.length === 1) {
    const e = events[0];
    win.webContents.send(e.channel, ...e.args);
  } else {
    // Bundle multiple stream events into one IPC call
    const streamEvents = [];
    const otherEvents = [];
    for (const e of events) {
      if (e.channel === 'claude:stream') {
        streamEvents.push(e);
      } else {
        otherEvents.push(e);
      }
    }
    // Send batched stream events as array
    if (streamEvents.length > 0) {
      win.webContents.send('claude:streamBatch', streamEvents.map(e => e.args));
    }
    // Send non-stream events individually (these are rare — end/error)
    for (const e of otherEvents) {
      win.webContents.send(e.channel, ...e.args);
    }
  }
}

function flushAllBatchesForWindow(winId) {
  const batch = ipcBatchQueues.get(winId);
  if (batch) {
    if (batch.timer) clearTimeout(batch.timer);
    batch.timer = null;
    // Flush remaining
    if (batch.events.length > 0) {
      flushIpcBatch(winId);
    }
    ipcBatchQueues.delete(winId);
  }
}

const isDev = !app.isPackaged;

const iconPath = isDev
  ? path.join(__dirname, '..', 'renderer', 'assets', 'icon.png')
  : path.join(process.resourcesPath, 'build', 'icon.png');

// ---- Multi-window Management ---- //
const allWindows = new Set();

// ---- Workspace file watchers (per-window) ---- //
// Each window watches at most one workspace root; events are debounced and
// forwarded to the renderer as `workspace:changed` so the git/file tree can
// refresh in near real-time instead of waiting on the 15s poll.
const workspaceWatchers = new Map(); // windowId → { watcher, rootPath, state, flushOnFocus }

function stopWorkspaceWatch(winId) {
  const entry = workspaceWatchers.get(winId);
  if (!entry) return;
  try { entry.watcher.close(); } catch {}
  if (entry.state?.timer) clearTimeout(entry.state.timer);
  workspaceWatchers.delete(winId);
}

function startWorkspaceWatch(win, rootPath) {
  if (!win || win.isDestroyed() || !rootPath) return;
  const existing = workspaceWatchers.get(win.id);
  if (existing && existing.rootPath === rootPath) return; // already watching
  stopWorkspaceWatch(win.id);
  try {
    const state = { timer: null, pendingStructural: false, pendingGitMeta: false };
    const fire = () => {
      state.timer = null;
      if (win.isDestroyed()) return;
      // Defer delivery when the window isn't focused. The renderer would
      // otherwise spawn git-status subprocesses every debounce cycle while
      // the user is in another app — a major battery drain during builds /
      // hot reloads. Flags persist and are flushed on next `focus`.
      if (!win.isFocused()) return;
      const structural = state.pendingStructural;
      const gitMeta = state.pendingGitMeta;
      state.pendingStructural = false;
      state.pendingGitMeta = false;
      try { win.webContents.send('workspace:changed', { path: rootPath, structural, gitMeta }); } catch {}
    };
    // fs.watch recursive is supported on macOS + Windows (our primary targets).
    const watcher = fs.watch(rootPath, { recursive: true, persistent: false }, (eventType, filename) => {
      if (!filename) return;
      const rel = String(filename).replace(/\\/g, '/');
      // Filter out noise that would cause constant refresh churn.
      if (
        rel.startsWith('node_modules/') || rel.includes('/node_modules/') ||
        rel.startsWith('.next/') || rel.includes('/.next/') ||
        rel.startsWith('.turbo/') || rel.includes('/.turbo/') ||
        rel.startsWith('.cache/') || rel.includes('/.cache/') ||
        rel.startsWith('dist/') || rel.includes('/dist/') ||
        rel.startsWith('build/') || rel.includes('/build/') ||
        rel.startsWith('out/') ||
        rel.startsWith('target/') ||
        rel.startsWith('__pycache__/') || rel.includes('/__pycache__/') ||
        rel.startsWith('.git/objects/') ||
        rel.startsWith('.git/logs/') ||
        rel === '.git/index.lock' ||
        rel === '.git/COMMIT_EDITMSG' ||
        rel.endsWith('.swp') || rel.endsWith('~') || rel.endsWith('.tmp')
      ) return;
      // Classify so the renderer can avoid re-reading the tree when only file
      // contents changed, and avoid re-spawning git log/stash for non-meta changes.
      if (eventType === 'rename') state.pendingStructural = true;
      if (rel.startsWith('.git/')) state.pendingGitMeta = true;
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(fire, 400);
    });
    watcher.on('error', () => {});
    // Called from win.on('focus') to flush any changes queued during blur.
    const flushOnFocus = () => {
      if (state.pendingStructural || state.pendingGitMeta) fire();
    };
    workspaceWatchers.set(win.id, { watcher, rootPath, state, flushOnFocus });
  } catch {
    // fs.watch may fail on unusual filesystems (network mounts, etc.). The
    // existing 15s poll will still pick up changes as a fallback.
  }
}

// ---- PTY Terminal Management ---- //
const ptyProcesses = new Map(); // ptyId → { process, windowId }
let ptyIdCounter = 0;

function createWindow(projectPath) {
  const icon = nativeImage.createFromPath(iconPath);

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#09090B',
    icon,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  allWindows.add(win);

  win.once('ready-to-show', () => {
    win.show();
  });

  win.on('close', () => {
    const winId = win.id;
    // Kill only PTY processes belonging to THIS window
    for (const [id, entry] of ptyProcesses) {
      if (entry.windowId === winId) {
        try { entry.process.kill(); } catch {}
        ptyProcesses.delete(id);
      }
    }
    // Kill only streams belonging to THIS window
    for (const [streamId, entry] of activeStreams) {
      if (entry.windowId === winId) {
        try {
          if (entry.abort) entry.abort();
          else if (entry.kill) entry.kill('SIGTERM');
        } catch {}
        activeStreams.delete(streamId);
      }
    }
  });

  const closedWinId = win.id;
  win.on('closed', () => {
    allWindows.delete(win);
    // Clean up any pending IPC batch queue for this window
    ipcBatchQueues.delete(closedWinId);
    stopWorkspaceWatch(closedWinId);
  });

  // Forward window state changes to renderer (per-window closure)
  const sendWindowState = () => {
    if (win.isDestroyed()) return;
    win.webContents.send('window:state-changed', {
      isFullScreen: win.isFullScreen(),
      isMaximized: win.isMaximized(),
    });
  };
  win.on('enter-full-screen', sendWindowState);
  win.on('leave-full-screen', sendWindowState);
  win.on('maximize', sendWindowState);
  win.on('unmaximize', sendWindowState);
  win.on('resize', sendWindowState);

  // Active-state signal powers renderer idle mode: pausing CSS animations,
  // xterm cursor blink, and fallback polls when the window isn't the
  // user's focus. Driven by OS events so it stays accurate even when
  // another app sits on top of a still-visible Foundry window.
  const sendActiveState = () => {
    if (win.isDestroyed()) return;
    try {
      win.webContents.send('window:active-changed', {
        focused: win.isFocused(),
        visible: win.isVisible(),
      });
    } catch {}
  };
  win.on('focus', () => {
    sendActiveState();
    // Flush any workspace changes queued while the window was blurred.
    workspaceWatchers.get(win.id)?.flushOnFocus?.();
  });
  win.on('blur', sendActiveState);
  win.on('show', sendActiveState);
  win.on('hide', sendActiveState);
  win.on('minimize', sendActiveState);
  win.on('restore', sendActiveState);

  if (isDev) {
    const url = new URL('http://localhost:5173');
    if (projectPath) url.searchParams.set('projectPath', projectPath);
    win.loadURL(url.toString());
  } else {
    const indexPath = path.join(__dirname, '..', '..', 'dist', 'index.html');
    if (projectPath) {
      win.loadFile(indexPath, { query: { projectPath } });
    } else {
      win.loadFile(indexPath);
    }
  }

  return win;
}

// ---- Application Menu (macOS + cross-platform) ---- //
function buildAppMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => createWindow(),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
        ] : [
          { role: 'delete' },
          { type: 'separator' },
          { role: 'selectAll' },
        ]),
      ],
    },
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' },
        ] : [
          { role: 'close' },
        ]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ---- File System Helpers ---- //
const ignore = require('ignore');
const { minimatch } = require('minimatch');

// These are always hidden from the tree entirely (never useful to see)
const HIDDEN = new Set([
  '.git', '.DS_Store', '.svn', '.hg', 'thumbs.db',
]);

// Largest file we'll load into the editor. Reading bigger files locks the
// renderer (Monaco) and wastes IPC bandwidth. Search and replace have their
// own, smaller 1 MB cap already.
const MAX_EDITABLE_FILE_BYTES = 10 * 1024 * 1024;

// Helper: yield to the event loop. Long async walks should call this every
// few hundred items so IPC messages, focus events, and UI work stay responsive
// while the walk is in flight.
const yieldToEventLoop = () => new Promise(resolve => setImmediate(resolve));

// These are shown in the tree (greyed out as "ignored") but we never recurse
// into them — walking node_modules / .next etc. synchronously blocks the main
// process for seconds on large projects.
const NEVER_RECURSE = new Set([
  'node_modules', '.next', '.nuxt', '.turbo', '.cache', '.parcel-cache',
  'dist', 'build', 'out', 'target', '.venv', 'venv', '__pycache__',
  '.gradle', '.idea', '.vscode',
]);

async function loadGitignore(projectRoot) {
  const ig = ignore();
  try {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    const content = await fsp.readFile(gitignorePath, 'utf8');
    ig.add(content);
  } catch { /* missing .gitignore or read error — fine, use empty matcher */ }
  return ig;
}

// Async tree walk. Sync fs.*Sync calls here would block the Electron main
// process — blocking IPC, pty keystrokes, and stream delivery for every window
// until the walk completes. On large monorepos that stall is user-visible
// (multi-second freezes). Sequential await lets the event loop service other
// work between directories.
async function readDirTree(dirPath, depth = 0, maxDepth = 4, projectRoot = null, ig = null) {
  if (depth === 0) {
    projectRoot = projectRoot || dirPath;
    ig = await loadGitignore(projectRoot);
  }
  if (depth > maxDepth) return [];
  let entries;
  try {
    entries = await fsp.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const sorted = entries
    .filter(e => !HIDDEN.has(e.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  const result = [];
  for (const entry of sorted) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(projectRoot, fullPath);
    const testPath = entry.isDirectory() ? relativePath + '/' : relativePath;
    const isIgnored = ig ? ig.ignores(testPath) : false;

    if (entry.isDirectory()) {
      const skipRecurse = NEVER_RECURSE.has(entry.name) || isIgnored;
      result.push({
        name: entry.name,
        path: fullPath,
        type: 'directory',
        ignored: isIgnored,
        children: skipRecurse ? [] : await readDirTree(fullPath, depth + 1, maxDepth, projectRoot, ig),
      });
    } else {
      result.push({
        name: entry.name,
        path: fullPath,
        type: 'file',
        ignored: isIgnored,
      });
    }
  }
  return result;
}

function getFileLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.js': 'javascript', '.jsx': 'javascript', '.ts': 'typescript', '.tsx': 'typescript',
    '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust',
    '.java': 'java', '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
    '.css': 'css', '.scss': 'scss', '.less': 'less',
    '.html': 'html', '.htm': 'html', '.xml': 'xml', '.svg': 'xml',
    '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
    '.md': 'markdown', '.mdx': 'markdown',
    '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
    '.sql': 'sql', '.graphql': 'graphql', '.gql': 'graphql',
    '.dockerfile': 'dockerfile', '.env': 'plaintext',
    '.txt': 'plaintext', '.log': 'plaintext',
    '.swift': 'swift', '.kt': 'kotlin', '.php': 'php',
    '.vue': 'vue', '.svelte': 'svelte',
  };
  return map[ext] || 'plaintext';
}

// Resolve the user's real shell PATH so git hooks (husky, lint-staged, etc.)
// can find node/npm/npx. Electron apps launched from Dock/Finder inherit a
// minimal PATH that lacks Homebrew, nvm, etc. We reuse the same login-shell
// resolution that the integrated terminal uses.
let _cachedGitEnv = null;
function getGitEnv() {
  if (_cachedGitEnv) return _cachedGitEnv;
  const env = { ...process.env };
  if (process.platform !== 'win32') {
    try {
      const candidates = [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'].filter(Boolean);
      const shellPath = candidates.find(s => { try { return fs.statSync(s).isFile(); } catch { return false; } }) || '/bin/sh';
      // Capture the FULL shell environment (not just PATH) from a login shell.
      // This mirrors what VS Code does — tools like gh, brew, nvm, etc. depend on
      // env vars beyond PATH (HOMEBREW_PREFIX, NVM_DIR, etc.). Without the full env,
      // tools appear "uninstalled" in Foundry terminals even though they work in VS Code.
      const marker = '___FOUNDRY_ENV_START___';
      const output = execSync(`${shellPath} -l -i -c 'echo "${marker}"; env -0'`, {
        timeout: 10000,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, HOME: os.homedir() },
      });
      const markerIdx = output.indexOf(marker);
      if (markerIdx >= 0) {
        const envBlock = output.slice(markerIdx + marker.length).trim();
        const entries = envBlock.split('\0').filter(Boolean);
        for (const entry of entries) {
          const eqIdx = entry.indexOf('=');
          if (eqIdx > 0) {
            const key = entry.slice(0, eqIdx);
            const val = entry.slice(eqIdx + 1);
            // Skip shell-internal vars that shouldn't be inherited
            if (!key.startsWith('_') && key !== 'SHLVL' && key !== 'PWD' && key !== 'OLDPWD') {
              env[key] = val;
            }
          }
        }
      }
      // Fallback: ensure common tool paths are on PATH even if resolution missed them
      const fallbackPaths = [
        '/opt/homebrew/bin', '/opt/homebrew/sbin',
        '/usr/local/bin', '/usr/local/sbin',
        `${os.homedir()}/.local/bin`,
      ];
      const currentPath = env.PATH || '';
      const missingPaths = fallbackPaths.filter(p => !currentPath.includes(p) && fs.existsSync(p));
      if (missingPaths.length > 0) {
        env.PATH = [...missingPaths, currentPath].join(':');
      }
    } catch {
      // Fall through with Electron's inherited PATH, but still add common tool paths
      const fallbackPaths = [
        '/opt/homebrew/bin', '/opt/homebrew/sbin',
        '/usr/local/bin', '/usr/local/sbin',
        `${os.homedir()}/.local/bin`,
      ];
      const currentPath = env.PATH || '';
      const missingPaths = fallbackPaths.filter(p => !currentPath.includes(p) && fs.existsSync(p));
      if (missingPaths.length > 0) {
        env.PATH = [...missingPaths, currentPath].join(':');
      }
    }
  }
  _cachedGitEnv = env;
  return _cachedGitEnv;
}

// Wrapper for execAsync that injects the resolved shell environment
function gitExec(cmd, opts = {}) {
  return execAsync(cmd, { ...opts, env: { ...getGitEnv(), ...opts.env } });
}

async function getGitSubmodules(dirPath) {
  try {
    const { stdout } = await gitExec('git submodule status --recursive', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
    const lines = stdout.split('\n').filter(Boolean);
    return lines.map(line => {
      // Format: " <hash> <path> (<describe>)" or "+<hash> <path> (<describe>)" or "-<hash> <path>"
      const match = line.match(/^[\s+-]?([0-9a-f]+)\s+(\S+)(?:\s+\((.+)\))?/);
      if (!match) return null;
      const [, hash, subPath, describe] = match;
      const prefix = line.trim()[0];
      return {
        hash: hash,
        path: subPath,
        describe: describe || '',
        dirty: prefix === '+',
        uninitialized: prefix === '-',
        fullPath: path.join(dirPath, subPath),
      };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

async function getGitRemotes(dirPath) {
  try {
    const { stdout } = await gitExec('git remote -v', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
    const lines = stdout.split('\n').filter(Boolean);
    const remotes = {};
    for (const line of lines) {
      const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)/);
      if (match) {
        const [, name, url, type] = match;
        if (!remotes[name]) remotes[name] = {};
        remotes[name][type] = url;
      }
    }
    return Object.entries(remotes).map(([name, urls]) => ({
      name,
      fetchUrl: urls.fetch || '',
      pushUrl: urls.push || '',
    }));
  } catch {
    return [];
  }
}

async function getGitStatus(dirPath) {
  try {
    const [statusResult, branchResult] = await Promise.all([
      gitExec('git status --porcelain -u', { cwd: dirPath, encoding: 'utf8', timeout: 5000 }),
      gitExec('git branch --show-current', { cwd: dirPath, encoding: 'utf8', timeout: 5000 }),
    ]);
    const result = statusResult.stdout;
    const branch = branchResult.stdout.trim();
    const lines = result.split('\n').filter(Boolean);
    const staged = [];
    const unstaged = [];
    for (const line of lines) {
      const x = line[0]; // staged status
      const y = line[1]; // unstaged status
      const filePath = line.substring(3);
      // Staged changes (index column has a letter)
      if (x !== ' ' && x !== '?') {
        staged.push({ status: x, path: filePath });
      }
      // Unstaged changes (working tree column has a letter, or untracked)
      if (y !== ' ' || x === '?') {
        unstaged.push({ status: x === '?' ? 'U' : y, path: filePath });
      }
    }
    // Keep flat files list for backward compat (commit uses it)
    const files = lines.map(line => ({
      status: line.substring(0, 2).trim(),
      path: line.substring(3),
    }));
    // Get behind/ahead counts
    let behind = 0, ahead = 0;
    try {
      const { stdout: tracking } = await gitExec('git rev-list --left-right --count @{u}...HEAD', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
      const parts = tracking.trim().split(/\s+/);
      behind = parseInt(parts[0], 10) || 0;
      ahead = parseInt(parts[1], 10) || 0;
    } catch { /* no upstream or no remote */ }
    return { branch, files, staged, unstaged, isRepo: true, behind, ahead };
  } catch {
    return { branch: '', files: [], staged: [], unstaged: [], isRepo: false, behind: 0, ahead: 0 };
  }
}

async function getGitLog(dirPath, count = 20, skip = 0, branch = null) {
  try {
    // Single git log call with numstat — uses @@@ as commit delimiter
    const SEP = '@@@COMMIT@@@';
    const skipArg = skip > 0 ? ` --skip=${skip}` : '';
    // If branch is specified, show only that branch's commits; otherwise show all
    const branchArg = branch && branch !== 'all' ? ` "${branch.replace(/"/g, '')}"` : ' --all';
    const { stdout } = await gitExec(
      `git log${branchArg} --topo-order --pretty=format:"${SEP}%H|||%h|||%s|||%an|||%ae|||%ar|||%aI|||%P|||%D" --numstat -${count}${skipArg}`,
      { cwd: dirPath, encoding: 'utf8', timeout: 10000 }
    );

    const blocks = stdout.split(SEP).filter(Boolean);
    return blocks.map(block => {
      const lines = block.split('\n');
      const headerLine = lines[0];
      const [hash, short, message, author, email, date, isoDate, parents, refs] = headerLine.split('|||');

      // Parse numstat lines (format: insertions\tdeletions\tfilename)
      let filesChanged = 0, insertions = 0, deletions = 0;
      for (let i = 1; i < lines.length; i++) {
        const l = lines[i].trim();
        if (!l) continue;
        const parts = l.split('\t');
        if (parts.length >= 3) {
          filesChanged++;
          insertions += parseInt(parts[0]) || 0;
          deletions += parseInt(parts[1]) || 0;
        }
      }

      return {
        hash, short, message, author, email: email || '',
        date, isoDate: isoDate || '',
        parents: parents ? parents.split(' ') : [],
        refs: refs || '',
        filesChanged, insertions, deletions,
      };
    });
  } catch {
    return [];
  }
}

async function getGitCommitCount(dirPath, branch = null) {
  try {
    const branchArg = branch && branch !== 'all' ? ` "${branch.replace(/"/g, '')}"` : ' --all';
    const { stdout } = await gitExec(`git rev-list --count${branchArg}`, { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
    return parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

async function getGitDiff(dirPath, filePath) {
  try {
    const { stdout } = await gitExec(`git diff -- "${filePath}"`, { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
    return stdout;
  } catch {
    return '';
  }
}

// ---- IPC Handlers ---- //
function registerIPC() {
  // Resolve CLI aliases to full model IDs for direct API usage
  const ALIAS_TO_MODEL = {
    'sonnet': 'claude-sonnet-4-6',
    'opus': 'claude-opus-4-6',
    'haiku': 'claude-haiku-4-5-20251001',
  };

  // Window
  ipcMain.handle('window:isFullScreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { isFullScreen: false, isMaximized: false };
    return { isFullScreen: win.isFullScreen(), isMaximized: win.isMaximized() };
  });

  // Profile
  ipcMain.handle('profile:get', async () => {
    const profile = getProfile();
    if (profile && profile.profile_photo) {
      profile.profile_photo_data = loadProfilePhoto(profile.profile_photo);
    }
    return profile;
  });

  ipcMain.handle('profile:create', async (_event, data) => {
    let photoPath = null;
    if (data.profilePhoto) {
      photoPath = saveProfilePhoto(data.profilePhoto);
    }
    const profile = createProfile({
      firstName: data.firstName,
      lastName: data.lastName,
      profilePhoto: photoPath,
      theme: data.theme || 'dark',
    });
    if (profile && profile.profile_photo) {
      profile.profile_photo_data = loadProfilePhoto(profile.profile_photo);
    }
    return profile;
  });

  ipcMain.handle('profile:update', async (_event, data) => {
    let updates = { ...data };
    if (data.profilePhoto) {
      updates.profilePhoto = saveProfilePhoto(data.profilePhoto);
    }
    const profile = updateProfile(updates);
    if (profile && profile.profile_photo) {
      profile.profile_photo_data = loadProfilePhoto(profile.profile_photo);
    }
    return profile;
  });

  ipcMain.handle('profile:pickPhoto', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose Profile Photo',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const filepath = result.filePaths[0];
    const ext = path.extname(filepath).slice(1);
    const data = fs.readFileSync(filepath);
    return `data:image/${ext};base64,${data.toString('base64')}`;
  });

  // Settings
  ipcMain.handle('settings:get', async (_event, key) => getSetting(key));
  ipcMain.handle('settings:set', async (_event, key, value) => {
    setSetting(key, value);
    return true;
  });

  // GitHub: validate token and fetch user profile
  ipcMain.handle('github:validateToken', async (_event, token) => {
    if (!token) return { valid: false };
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      });
      if (!res.ok) return { valid: false };
      const user = await res.json();
      return {
        valid: true,
        login: user.login,
        name: user.name || user.login,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
        bio: user.bio,
      };
    } catch {
      return { valid: false };
    }
  });

  // GitHub: fetch all repos the user has access to (paginated)
  ipcMain.handle('github:listRepos', async (_event, token, page = 1, perPage = 50) => {
    if (!token) return { repos: [], hasMore: false };
    try {
      const res = await fetch(
        `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&sort=updated&direction=desc&affiliation=owner,collaborator,organization_member`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
          },
        }
      );
      if (!res.ok) return { repos: [], hasMore: false };
      const repos = await res.json();
      const linkHeader = res.headers.get('link') || '';
      const hasMore = linkHeader.includes('rel="next"');
      return {
        repos: repos.map(r => ({
          id: r.id,
          name: r.name,
          full_name: r.full_name,
          description: r.description,
          private: r.private,
          html_url: r.html_url,
          clone_url: r.clone_url,
          ssh_url: r.ssh_url,
          language: r.language,
          stargazers_count: r.stargazers_count,
          updated_at: r.updated_at,
          owner: {
            login: r.owner.login,
            avatar_url: r.owner.avatar_url,
          },
        })),
        hasMore,
      };
    } catch {
      return { repos: [], hasMore: false };
    }
  });

  // GitHub: clone a repo with token auth embedded
  ipcMain.handle('github:cloneRepo', async (event, token, cloneUrl, repoName) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    // Ask user where to clone
    const result = await dialog.showOpenDialog(win, {
      title: `Clone ${repoName}`,
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Clone Here',
    });
    if (result.canceled || !result.filePaths.length) return { cancelled: true };
    const parentDir = result.filePaths[0];
    const destPath = path.join(parentDir, repoName);

    // Inject token into HTTPS URL for auth
    const authedUrl = cloneUrl.replace('https://', `https://x-access-token:${token}@`);
    try {
      await gitExec(`git clone "${authedUrl}" "${destPath}"`, { timeout: 120000 });
      return {
        success: true,
        path: destPath,
        name: repoName,
        tree: await readDirTree(destPath),
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  // GitHub: fetch workflow runs for a repository
  ipcMain.handle('github:workflowRuns', async (_event, token, owner, repo) => {
    if (!owner || !repo) return { runs: [], error: 'missing_params' };
    try {
      const headers = { Accept: 'application/vnd.github+json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?per_page=100`,
        { headers }
      );
      if (res.status === 404) return { runs: [], error: 'Repo not found or no access' };
      if (res.status === 401 || res.status === 403) {
        const body = await res.json().catch(() => ({}));
        return { runs: [], error: body.message || `GitHub API error: ${res.status}` };
      }
      if (!res.ok) return { runs: [], error: `GitHub API error: ${res.status}` };
      const data = await res.json();
      return {
        runs: (data.workflow_runs || []).map(r => ({
          id: r.id,
          name: r.name,
          status: r.status,
          conclusion: r.conclusion,
          head_branch: r.head_branch,
          head_sha: r.head_sha?.slice(0, 7),
          html_url: r.html_url,
          created_at: r.created_at,
          updated_at: r.updated_at,
          run_started_at: r.run_started_at,
          event: r.event,
          run_number: r.run_number,
        })),
      };
    } catch (err) {
      return { runs: [], error: err.message || 'fetch_failed' };
    }
  });

  // GitHub: fetch jobs for a specific workflow run
  ipcMain.handle('github:workflowJobs', async (_event, token, owner, repo, runId) => {
    if (!owner || !repo || !runId) return { jobs: [] };
    try {
      const headers = { Accept: 'application/vnd.github+json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/jobs`,
        { headers }
      );
      if (!res.ok) return { jobs: [] };
      const data = await res.json();
      return {
        jobs: (data.jobs || []).map(j => ({
          id: j.id,
          name: j.name,
          status: j.status,
          conclusion: j.conclusion,
          started_at: j.started_at,
          completed_at: j.completed_at,
          html_url: j.html_url,
        })),
      };
    } catch {
      return { jobs: [] };
    }
  });

  // File system
  ipcMain.handle('fs:openFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'Open Project Folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const dirPath = result.filePaths[0];
    return {
      path: dirPath,
      name: path.basename(dirPath),
      tree: await readDirTree(dirPath),
    };
  });

  ipcMain.handle('fs:readDir', async (_event, dirPath) => {
    return await readDirTree(dirPath);
  });

  ipcMain.handle('fs:readFile', async (_event, filePath) => {
    try {
      const stats = await fsp.stat(filePath);
      // Large files blow up the renderer (Monaco chokes past a few MB) and the
      // read itself streams through the main process. Bail early with a
      // structured error so the editor shows a "file too large" notice
      // instead of locking the UI for seconds.
      if (stats.size > MAX_EDITABLE_FILE_BYTES) {
        return {
          error: `File is too large to open (${(stats.size / 1024 / 1024).toFixed(1)} MB, limit ${MAX_EDITABLE_FILE_BYTES / 1024 / 1024} MB).`,
          tooLarge: true,
          size: stats.size,
        };
      }
      const content = await fsp.readFile(filePath, 'utf8');
      return {
        content,
        language: getFileLanguage(filePath),
        name: path.basename(filePath),
        path: filePath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('fs:writeFile', async (_event, filePath, content) => {
    try {
      await fsp.writeFile(filePath, content, 'utf8');
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('fs:createFile', async (_event, dirPath, fileName) => {
    try {
      const filePath = path.join(dirPath, fileName);
      await fsp.writeFile(filePath, '', 'utf8');
      return { success: true, path: filePath };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('fs:createFolder', async (_event, dirPath, folderName) => {
    try {
      const folderPath = path.join(dirPath, folderName);
      await fsp.mkdir(folderPath, { recursive: true });
      return { success: true, path: folderPath };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('fs:deleteFile', async (_event, filePath) => {
    try {
      await shell.trashItem(filePath);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('fs:rename', async (_event, oldPath, newName) => {
    try {
      const dir = path.dirname(oldPath);
      const newPath = path.join(dir, newName);
      await fsp.rename(oldPath, newPath);
      return { success: true, path: newPath };
    } catch (err) {
      return { error: err.message };
    }
  });

  // Workspace watcher — event-driven refresh for git/file tree
  ipcMain.handle('workspace:watch', (event, rootPath) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false };
    if (!rootPath) {
      stopWorkspaceWatch(win.id);
      return { success: true, watching: false };
    }
    startWorkspaceWatch(win, rootPath);
    return { success: true, watching: true };
  });

  // Git
  ipcMain.handle('git:status', async (_event, dirPath) => getGitStatus(dirPath));
  ipcMain.handle('git:log', async (_event, dirPath, count, skip, branch) => getGitLog(dirPath, count, skip, branch));
  ipcMain.handle('git:submodules', async (_event, dirPath) => getGitSubmodules(dirPath));
  ipcMain.handle('git:remotes', async (_event, dirPath) => getGitRemotes(dirPath));
  ipcMain.handle('git:commitCount', async (_event, dirPath, branch) => getGitCommitCount(dirPath, branch));
  ipcMain.handle('git:resolveAvatars', async (_event, authors) => resolveAvatarsBatch(authors));
  ipcMain.handle('git:diff', async (_event, dirPath, filePath) => getGitDiff(dirPath, filePath));

  ipcMain.handle('git:remoteUrl', async (_event, dirPath) => {
    try {
      const { stdout } = await gitExec('git config --get remote.origin.url', { cwd: dirPath, timeout: 5000 });
      const url = stdout.trim();
      // Convert SSH URLs to HTTPS: git@github.com:user/repo.git → https://github.com/user/repo
      if (url.startsWith('git@')) {
        return url.replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/, '');
      }
      return url.replace(/\.git$/, '');
    } catch {
      return null;
    }
  });

  ipcMain.handle('git:stage', async (_event, dirPath, filePath) => {
    try {
      // Accept a single path string or an array of paths
      const paths = Array.isArray(filePath) ? filePath : [filePath];
      const quoted = paths.map(p => `"${p}"`).join(' ');
      await gitExec(`git add -- ${quoted}`, { cwd: dirPath, timeout: 10000 });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:unstage', async (_event, dirPath, filePath) => {
    try {
      // Accept a single path string or an array of paths
      const paths = Array.isArray(filePath) ? filePath : [filePath];
      const quoted = paths.map(p => `"${p}"`).join(' ');
      await gitExec(`git reset HEAD -- ${quoted}`, { cwd: dirPath, timeout: 10000 });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:discard', async (_event, dirPath, filePath) => {
    try {
      // For untracked files/dirs, remove them; for tracked files, restore them
      const { stdout } = await gitExec(`git status --porcelain "${filePath}"`, { cwd: dirPath, timeout: 5000 });
      if (stdout.trim().startsWith('??')) {
        const fullPath = path.join(dirPath, filePath);
        const stat = await fs.promises.stat(fullPath);
        if (stat.isDirectory()) {
          await fs.promises.rm(fullPath, { recursive: true, force: true });
        } else {
          await fs.promises.unlink(fullPath);
        }
      } else {
        await gitExec(`git checkout -- "${filePath}"`, { cwd: dirPath, timeout: 5000 });
      }
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:commit', async (_event, dirPath, message) => {
    try {
      await execFileAsync('git', ['commit', '-m', message], { cwd: dirPath, timeout: 10000, env: { ...getGitEnv() } });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:push', async (_event, dirPath) => {
    try {
      await gitExec('git push', { cwd: dirPath, timeout: 30000 });
      return { success: true };
    } catch (err) {
      // If push failed, try setting upstream for new branches
      try {
        const { stdout: branchOut } = await gitExec('git branch --show-current', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
        const branch = branchOut.trim();
        if (branch) {
          await gitExec(`git push --set-upstream origin ${branch}`, { cwd: dirPath, timeout: 30000 });
          return { success: true };
        }
      } catch { /* upstream push also failed */ }
      return { error: err.message };
    }
  });

  ipcMain.handle('git:pull', async (_event, dirPath) => {
    try {
      const { stdout, stderr } = await gitExec('git pull', { cwd: dirPath, timeout: 30000 });
      // git pull outputs diffstat to stdout, but some info goes to stderr
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      return { success: true, output };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:stash', async (_event, dirPath, message) => {
    try {
      const { stdout: before } = await execFileAsync('git', ['stash', 'list'], { cwd: dirPath, timeout: 5000, env: { ...getGitEnv() } });
      const beforeCount = before.split('\n').filter(Boolean).length;
      const args = ['stash', 'push', '--include-untracked'];
      if (message && message.trim()) args.push('-m', message.trim());
      const { stdout, stderr } = await execFileAsync('git', args, { cwd: dirPath, timeout: 15000, env: { ...getGitEnv() } });
      const combined = `${stdout || ''}\n${stderr || ''}`;
      if (/No local changes to save/i.test(combined)) {
        return { error: 'No local changes to stash' };
      }
      const { stdout: after } = await execFileAsync('git', ['stash', 'list'], { cwd: dirPath, timeout: 5000, env: { ...getGitEnv() } });
      const afterCount = after.split('\n').filter(Boolean).length;
      if (afterCount <= beforeCount) {
        return { error: 'Stash did not create a new entry (nothing to stash?)' };
      }
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:stashList', async (_event, dirPath) => {
    try {
      const { stdout } = await execFileAsync('git', ['stash', 'list', '--format=%gd%x09%cr%x09%s'], { cwd: dirPath, timeout: 5000, env: { ...getGitEnv() } });
      const stashes = stdout.split('\n').filter(Boolean).map(line => {
        const [ref, age, ...rest] = line.split('\t');
        return { ref, age, message: rest.join('\t') };
      });
      return { stashes };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:stashPop', async (_event, dirPath, ref) => {
    try {
      const args = ['stash', 'pop'];
      if (ref) args.push(ref);
      await execFileAsync('git', args, { cwd: dirPath, timeout: 15000, env: { ...getGitEnv() } });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:stashApply', async (_event, dirPath, ref) => {
    try {
      const args = ['stash', 'apply'];
      if (ref) args.push(ref);
      await execFileAsync('git', args, { cwd: dirPath, timeout: 15000, env: { ...getGitEnv() } });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:stashDrop', async (_event, dirPath, ref) => {
    try {
      const args = ['stash', 'drop'];
      if (ref) args.push(ref);
      await execFileAsync('git', args, { cwd: dirPath, timeout: 5000, env: { ...getGitEnv() } });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  // Commit & Sync: pull → stage → commit → push (single atomic-ish operation)
  ipcMain.handle('git:commitAndSync', async (_event, dirPath, message) => {
    try {
      // Check if remote exists
      let hasRemote = false;
      try {
        const { stdout: remotes } = await gitExec('git remote', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
        hasRemote = remotes.trim().length > 0;
      } catch { /* no remote */ }

      // Step 1: Pull remote changes first (if remote exists)
      if (hasRemote) {
        try {
          await gitExec('git pull --rebase=false', { cwd: dirPath, encoding: 'utf8', timeout: 30000 });
        } catch (pullErr) {
          // Check if it's a merge conflict
          const { stdout: status } = await gitExec('git status', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
          if (status.includes('Unmerged') || status.includes('both modified') || status.includes('fix conflicts')) {
            // Abort the merge so we don't leave dirty state
            try { await gitExec('git merge --abort', { cwd: dirPath, timeout: 5000 }); } catch { /* ignore */ }
            return { error: 'Merge conflicts detected when pulling remote changes. Please resolve conflicts manually before committing.' };
          }
          // If pull failed for other reasons (e.g. no tracking branch), continue with commit+push
        }
      }

      // Step 2: Commit (staging is handled on the renderer side already)
      await execFileAsync('git', ['commit', '-m', message], { cwd: dirPath, timeout: 10000, env: { ...getGitEnv() } });

      // Step 3: Push (if remote exists)
      if (hasRemote) {
        try {
          await gitExec('git push', { cwd: dirPath, timeout: 30000 });
        } catch (pushErr) {
          // Commit succeeded but push failed — try setting upstream
          try {
            const { stdout: branchOut } = await gitExec('git branch --show-current', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
            await gitExec(`git push --set-upstream origin ${branchOut.trim()}`, { cwd: dirPath, timeout: 30000 });
          } catch (upstreamErr) {
            return { success: true, warning: 'Commit succeeded but push failed: ' + pushErr.message };
          }
        }
      }

      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  // Branch operations
  ipcMain.handle('git:listBranches', async (_event, dirPath) => {
    try {
      const [currentResult, localResult] = await Promise.all([
        gitExec('git branch --show-current', { cwd: dirPath, encoding: 'utf8', timeout: 5000 }),
        gitExec(
          'git branch --no-color --format="%(refname:short)|||%(objectname:short)|||%(authorname)|||%(committerdate:relative)|||%(subject)"',
          { cwd: dirPath, encoding: 'utf8', timeout: 5000 }
        ),
      ]);
      const current = currentResult.stdout.trim();
      const localBranches = localResult.stdout.split('\n').filter(Boolean).map(line => {
        const [name, hash, author, date, message] = line.split('|||');
        return { name, current: name === current, remote: false, hash, author, date, message };
      });

      // Get remote branches with last commit info
      let remoteBranches = [];
      try {
        const { stdout: remoteRaw } = await gitExec(
          'git branch -r --no-color --format="%(refname:short)|||%(objectname:short)|||%(authorname)|||%(committerdate:relative)|||%(subject)"',
          { cwd: dirPath, encoding: 'utf8', timeout: 5000 }
        );
        remoteBranches = remoteRaw.split('\n').filter(Boolean)
          .filter(line => !line.includes('HEAD'))
          .map(line => {
            const [name, hash, author, date, message] = line.split('|||');
            const shortName = name.replace(/^origin\//, '');
            return { name, shortName, remote: true, hash, author, date, message };
          })
          .filter(rb => !localBranches.some(lb => lb.name === rb.shortName));
      } catch { /* no remote */ }

      return { current, local: localBranches, remote: remoteBranches };
    } catch (err) {
      return { error: err.message, current: '', local: [], remote: [] };
    }
  });

  ipcMain.handle('git:checkout', async (_event, dirPath, branchName) => {
    try {
      await gitExec(`git checkout "${branchName}"`, { cwd: dirPath, encoding: 'utf8', timeout: 10000 });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:createBranch', async (_event, dirPath, branchName, checkout = true) => {
    try {
      if (checkout) {
        await gitExec(`git checkout -b "${branchName}"`, { cwd: dirPath, encoding: 'utf8', timeout: 10000 });
      } else {
        await gitExec(`git branch "${branchName}"`, { cwd: dirPath, encoding: 'utf8', timeout: 10000 });
      }
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:deleteBranch', async (_event, dirPath, branchName, force = false) => {
    try {
      const flag = force ? '-D' : '-d';
      await gitExec(`git branch ${flag} "${branchName}"`, { cwd: dirPath, encoding: 'utf8', timeout: 10000 });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:checkoutRemoteBranch', async (_event, dirPath, remoteBranch) => {
    try {
      const localName = remoteBranch.replace(/^origin\//, '');
      await gitExec(`git checkout -b "${localName}" "${remoteBranch}"`, { cwd: dirPath, encoding: 'utf8', timeout: 10000 });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:generateCommitMsg', async (_event, dirPath) => {
    try {
      // Get diff — prefer staged, fall back to unstaged
      let diffStat = '';
      try {
        const r = await gitExec('git diff --cached --stat', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
        diffStat = r.stdout;
      } catch {}
      if (!diffStat.trim()) {
        try {
          const r = await gitExec('git diff --stat', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
          diffStat = r.stdout;
        } catch {}
      }
      if (!diffStat.trim()) {
        const r = await gitExec('git status --porcelain', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
        diffStat = r.stdout;
      }

      if (!diffStat.trim()) {
        return { message: 'Update files' };
      }

      // Get the actual diff content for the AI
      let fullDiff = '';
      try {
        const r = await gitExec('git diff --cached', { cwd: dirPath, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
        fullDiff = r.stdout;
        if (!fullDiff.trim()) {
          const r2 = await gitExec('git diff', { cwd: dirPath, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
          fullDiff = r2.stdout;
        }
      } catch {}

      // Also capture untracked files content so new files are reflected in the commit message
      let untrackedDiff = '';
      try {
        const statusResult = await gitExec('git status --porcelain', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
        const untrackedFiles = statusResult.stdout.split('\n').filter(l => l.startsWith('??')).map(l => l.slice(3).trim());
        for (const uf of untrackedFiles.slice(0, 20)) {
          try {
            const content = await gitExec(`git diff --no-index /dev/null "${uf}"`, { cwd: dirPath, encoding: 'utf8', timeout: 5000, maxBuffer: 256 * 1024 }).catch(e => ({ stdout: e.stdout || '' }));
            untrackedDiff += content.stdout + '\n';
          } catch {}
        }
      } catch {}

      // Combine all diffs
      const combinedDiff = (fullDiff + '\n' + untrackedDiff).trim();

      // Truncate diff to ~16K chars to stay within reasonable token limits
      const maxDiffLen = 16000;
      const truncatedDiff = combinedDiff.length > maxDiffLen
        ? combinedDiff.slice(0, maxDiffLen) + '\n... (diff truncated)'
        : combinedDiff;

      const commitPrompt = `You are a commit message generator. Given the following git diff, write a detailed commit message. Follow conventional commit style (e.g. "feat: ...", "fix: ...", "refactor: ...", "chore: ...", "docs: ...", "style: ...", "test: ...").

Rules:
- First line: a conventional commit subject line (under 72 characters, lowercase after the prefix, no period)
- Then a blank line
- Then a bullet-point body that describes ALL meaningful changes across every file in the diff. Each bullet should start with "- " and briefly explain what changed and why it matters. Group related changes together. Do not omit any files or significant changes.
- Only output the commit message, nothing else.

Git diff stat:
${diffStat.trim()}

${truncatedDiff ? `Diff content:\n${truncatedDiff}` : ''}`;

      // Try AI-powered generation using the user's selected model + credentials
      const cred = await resolveClaudeCredential();
      const modelAlias = getSetting('claude_model') || 'sonnet';
      console.log('[CommitMsg] cred source:', cred?.source, '| model:', modelAlias);

      if (cred && cred.source === 'subscription') {
        // Subscription OAuth → use Claude CLI (same as chat does)
        const claudeBin = await resolveClaudeBinary();
        console.log('[CommitMsg] CLI binary:', claudeBin);
        if (claudeBin) {
          const aiMessage = await new Promise((resolve) => {
            const timeoutId = setTimeout(() => { try { proc.kill('SIGTERM'); } catch {} resolve(null); }, 20000);

            const cleanEnv = { ...process.env };
            delete cleanEnv.CLAUDECODE;
            delete cleanEnv.CLAUDE_CODE_ENTRYPOINT;
            Object.keys(cleanEnv).forEach(k => { if (k.startsWith('CLAUDE_CODE_')) delete cleanEnv[k]; });

            const proc = spawn(claudeBin, [
              '-p', commitPrompt,
              '--output-format', 'text',
              '--model', modelAlias,
              '--max-turns', '4',
              '--no-session-persistence',
            ], {
              stdio: ['ignore', 'pipe', 'pipe'],
              env: cleanEnv,
              cwd: dirPath,
            });

            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
            proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
            proc.on('close', (code) => {
              clearTimeout(timeoutId);
              console.log('[CommitMsg] CLI exit code:', code, '| stdout length:', stdout.length, '| stderr:', stderr.slice(0, 500));
              const text = stdout.trim();
              resolve(text || null);
            });
            proc.on('error', (err) => { clearTimeout(timeoutId); console.error('[CommitMsg] CLI spawn error:', err.message); resolve(null); });
          });

          if (aiMessage) {
            // Detect CLI error messages leaked into stdout
            if (/^error:/i.test(aiMessage) || /reached max turns/i.test(aiMessage)) {
              console.warn('[CommitMsg] CLI returned error as output:', aiMessage.slice(0, 200));
            } else {
              let cleaned = aiMessage.replace(/^["']|["']$/g, '').trim();
              // Remove trailing period from subject line only
              const lines = cleaned.split('\n');
              lines[0] = lines[0].replace(/\.$/, '');
              cleaned = lines.join('\n').trim();
              return { message: cleaned };
            }
          }
        }
      } else if (cred && cred.source === 'api_key') {
        // API key → direct HTTPS to Anthropic API
        const resolvedModel = ALIAS_TO_MODEL[modelAlias] || modelAlias || 'claude-sonnet-4-6';
        const postData = JSON.stringify({
          model: resolvedModel,
          max_tokens: 1024,
          messages: [{ role: 'user', content: commitPrompt }],
        });

        const aiMessage = await new Promise((resolve) => {
          const timeoutId = setTimeout(() => resolve(null), 15000);

          const req = https.request({
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'anthropic-version': '2023-06-01',
              'x-api-key': cred.token,
            },
          }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
              clearTimeout(timeoutId);
              try {
                if (res.statusCode === 200) {
                  const data = JSON.parse(body);
                  const text = data.content?.[0]?.text?.trim();
                  resolve(text || null);
                } else {
                  resolve(null);
                }
              } catch {
                resolve(null);
              }
            });
          });

          req.on('error', () => { clearTimeout(timeoutId); resolve(null); });
          req.write(postData);
          req.end();
        });

        if (aiMessage) {
          let cleaned = aiMessage.replace(/^["']|["']$/g, '').replace(/\.$/, '');
          return { message: cleaned };
        }
      }

      // Fallback: basic heuristic if AI is unavailable
      const statLines = diffStat.trim().split('\n').filter(Boolean);
      const files = [];
      for (const line of statLines) {
        const porcelainMatch = line.match(/^(.{2})\s+(.+)$/);
        if (porcelainMatch) { files.push(path.basename(porcelainMatch[2])); continue; }
        const statMatch = line.match(/^\s*(.+?)\s+\|/);
        if (statMatch) files.push(path.basename(statMatch[1].trim()));
      }
      const scope = files.length <= 3 ? files.join(', ') : `${files.length} files`;
      return { message: `update: ${scope || 'files'}` };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:clone', async (_event, url, destPath) => {
    try {
      await gitExec(`git clone "${url}" "${destPath}"`, { timeout: 60000 });
      return { success: true, path: destPath };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ---- Workspace Search ---- //
  // Each walker below is async and yields to the event loop periodically so a
  // long search doesn't block IPC, pty keystrokes, or stream delivery.
  ipcMain.handle('search:files', async (_event, dirPath, query) => {
    if (!dirPath || !query) return [];
    const results = [];
    const lowerQuery = query.toLowerCase();
    const ig = await loadGitignore(dirPath);
    let dirsScanned = 0;
    async function walkDir(dir, depth = 0) {
      if (depth > 6 || results.length >= 50) return;
      if (++dirsScanned % 64 === 0) await yieldToEventLoop();
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch { return; }
      for (const entry of entries) {
        if (HIDDEN.has(entry.name) || entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(dirPath, fullPath);
        const testPath = entry.isDirectory() ? relativePath + '/' : relativePath;
        if (ig.ignores(testPath)) continue;
        if (entry.isDirectory()) {
          await walkDir(fullPath, depth + 1);
        } else {
          if (entry.name.toLowerCase().includes(lowerQuery) || relativePath.toLowerCase().includes(lowerQuery)) {
            results.push({ name: entry.name, path: fullPath, relativePath });
          }
        }
        if (results.length >= 50) return;
      }
    }
    await walkDir(dirPath);
    results.sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.relativePath.length - b.relativePath.length;
    });
    return results;
  });

  ipcMain.handle('search:inFiles', async (_event, dirPath, query, options = {}) => {
    if (!dirPath || !query) return [];
    const results = [];
    const caseSensitive = options.caseSensitive || false;
    const isRegex = options.isRegex || false;
    const wholeWord = options.wholeWord || false;
    const includePattern = options.includePattern || '';
    const excludePattern = options.excludePattern || '';
    let pattern;
    try {
      let src = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) src = `\\b${src}\\b`;
      pattern = new RegExp(src, caseSensitive ? 'g' : 'gi');
    } catch {
      return [];
    }
    const includeGlobs = includePattern ? includePattern.split(',').map(s => s.trim()).filter(Boolean) : [];
    const excludeGlobs = excludePattern ? excludePattern.split(',').map(s => s.trim()).filter(Boolean) : [];
    function matchesGlobs(relPath, globs) {
      return globs.some(g => minimatch(relPath, g, { matchBase: true, dot: false }));
    }
    const ig = await loadGitignore(dirPath);
    let filesRead = 0;
    async function walkDir(dir, depth = 0) {
      if (depth > 8 || results.length >= 200) return;
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch { return; }
      for (const entry of entries) {
        if (HIDDEN.has(entry.name) || entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(dirPath, fullPath);
        const testPath = entry.isDirectory() ? relativePath + '/' : relativePath;
        if (ig.ignores(testPath)) continue;
        if (entry.isDirectory()) {
          await walkDir(fullPath, depth + 1);
        } else {
          if (includeGlobs.length > 0 && !matchesGlobs(relativePath, includeGlobs)) continue;
          if (excludeGlobs.length > 0 && matchesGlobs(relativePath, excludeGlobs)) continue;
          let stats;
          try { stats = await fsp.stat(fullPath); } catch { continue; }
          if (stats.size > 1024 * 1024) continue;
          let content;
          try { content = await fsp.readFile(fullPath, 'utf8'); } catch { continue; }
          if (++filesRead % 16 === 0) await yieldToEventLoop();
          const lines = content.split('\n');
          const fileMatches = [];
          for (let i = 0; i < lines.length; i++) {
            pattern.lastIndex = 0;
            if (pattern.test(lines[i])) {
              fileMatches.push({ line: i + 1, text: lines[i].substring(0, 500) });
              if (fileMatches.length >= 50) break;
            }
          }
          if (fileMatches.length > 0) {
            results.push({
              path: fullPath,
              relativePath,
              name: path.basename(fullPath),
              matches: fileMatches,
            });
          }
        }
        if (results.length >= 200) return;
      }
    }
    await walkDir(dirPath);
    return results;
  });

  ipcMain.handle('search:replaceInFiles', async (_event, dirPath, searchQuery, replaceText, options = {}) => {
    if (!dirPath || !searchQuery) return { success: false, error: 'Missing parameters' };
    const caseSensitive = options.caseSensitive || false;
    const isRegex = options.isRegex || false;
    const wholeWord = options.wholeWord || false;
    const filePaths = options.filePaths || null;
    let pattern;
    try {
      let src = isRegex ? searchQuery : searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) src = `\\b${src}\\b`;
      pattern = new RegExp(src, caseSensitive ? 'g' : 'gi');
    } catch (err) {
      return { success: false, error: 'Invalid regex: ' + err.message };
    }
    let totalReplacements = 0;
    let filesModified = 0;
    let filesProcessed = 0;
    async function processFile(filePath) {
      try {
        const stats = await fsp.stat(filePath);
        if (stats.size > 1024 * 1024) return;
        const content = await fsp.readFile(filePath, 'utf8');
        pattern.lastIndex = 0;
        if (!pattern.test(content)) return;
        pattern.lastIndex = 0;
        let count = 0;
        const newContent = content.replace(pattern, () => { count++; return replaceText; });
        if (count > 0) {
          await fsp.writeFile(filePath, newContent, 'utf8');
          totalReplacements += count;
          filesModified++;
        }
      } catch {}
      if (++filesProcessed % 16 === 0) await yieldToEventLoop();
    }
    if (filePaths && filePaths.length > 0) {
      for (const fp of filePaths) await processFile(fp);
    } else {
      const ig = await loadGitignore(dirPath);
      async function walkDir(dir, depth = 0) {
        if (depth > 6) return;
        let entries;
        try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          if (HIDDEN.has(entry.name) || entry.name.startsWith('.')) continue;
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(dirPath, fullPath);
          const testPath = entry.isDirectory() ? relativePath + '/' : relativePath;
          if (ig.ignores(testPath)) continue;
          if (entry.isDirectory()) await walkDir(fullPath, depth + 1);
          else await processFile(fullPath);
        }
      }
      await walkDir(dirPath);
    }
    return { success: true, totalReplacements, filesModified };
  });

  // Workspaces
  ipcMain.handle('workspaces:list', async () => getWorkspaces());
  ipcMain.handle('workspaces:add', async (_event, name, wsPath) => addWorkspace(name, wsPath));
  ipcMain.handle('workspaces:remove', async (_event, wsPath) => removeWorkspace(wsPath));
  ipcMain.handle('workspaces:touch', async (_event, wsPath) => { touchWorkspace(wsPath); return true; });

  // Window management
  ipcMain.handle('window:new', async (_event, projectPath) => {
    createWindow(projectPath || undefined);
    return true;
  });

  ipcMain.handle('window:setTitle', async (event, title) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.setTitle(title || 'Foundry');
    }
  });

  // Shell open
  ipcMain.handle('shell:openExternal', async (_event, url) => {
    shell.openExternal(url);
  });

  // ---- Terminal (PTY) ---- //

  // Resolve the user's login shell and full environment once at startup.
  // When Electron is launched from Finder/Dock (not a terminal), process.env
  // has the minimal macOS launchd environment — PATH is just /usr/bin:/bin:/usr/sbin:/sbin.
  // Tools installed via Homebrew, nvm, pyenv, etc. won't be found.
  // We fix this by running a login shell once to capture the real PATH.
  let resolvedShellEnv = null;
  function getShellEnv(_shellPath) {
    if (resolvedShellEnv) return resolvedShellEnv;
    // Reuse the already-resolved PATH from getGitEnv() to avoid running
    // the login shell twice.
    const gitEnv = getGitEnv();
    resolvedShellEnv = {
      ...gitEnv,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'Foundry',
      LANG: process.env.LANG || 'en_US.UTF-8',
    };
    return resolvedShellEnv;
  }

  ipcMain.handle('terminal:create', async (event, cwd) => {
    const id = ++ptyIdCounter;

    let shellPath;
    if (process.platform === 'win32') {
      shellPath = 'powershell.exe';
    } else {
      const candidates = [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'].filter(Boolean);
      shellPath = candidates.find(s => { try { return fs.statSync(s).isFile(); } catch { return false; } }) || '/bin/sh';
    }

    const effectiveCwd = cwd && fs.existsSync(cwd) ? cwd : os.homedir();

    // Spawn as login shell (-l) so .zshrc/.bash_profile/.profile get sourced.
    // This is how VS Code's integrated terminal works too.
    const shellArgs = process.platform === 'win32' ? [] : ['-l'];

    const ptyProcess = pty.spawn(shellPath, shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: effectiveCwd,
      env: getShellEnv(shellPath),
    });

    const ownerWin = BrowserWindow.fromWebContents(event.sender);
    ptyProcesses.set(id, { process: ptyProcess, windowId: ownerWin?.id });

    ptyProcess.onData((data) => {
      try {
        if (event.sender.isDestroyed()) return;
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && !win.isDestroyed()) {
          win.webContents.send('terminal:data', id, data);
        }
      } catch {}
    });

    ptyProcess.onExit(({ exitCode }) => {
      ptyProcesses.delete(id);
      try {
        if (event.sender.isDestroyed()) return;
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && !win.isDestroyed()) {
          win.webContents.send('terminal:exit', id, exitCode);
        }
      } catch {}
    });

    const shellName = path.basename(shellPath);
    return { id, shellName };
  });

  ipcMain.on('terminal:write', (_event, id, data) => {
    const entry = ptyProcesses.get(id);
    if (entry) entry.process.write(data);
  });

  ipcMain.on('terminal:resize', (_event, id, cols, rows) => {
    const entry = ptyProcesses.get(id);
    if (entry) {
      try { entry.process.resize(cols, rows); } catch {}
    }
  });

  ipcMain.on('terminal:kill', (_event, id) => {
    const entry = ptyProcesses.get(id);
    if (entry) {
      entry.process.kill();
      ptyProcesses.delete(id);
    }
  });

  // ---- Claude Provider ---- //

  /**
   * Read Claude Code subscription OAuth credentials from macOS Keychain.
   * Claude Code stores its OAuth tokens in the system keychain under:
   *   service: "Claude Code-credentials"
   *   account: <os-username>
   * The value is JSON: { claudeAiOauth: { accessToken, refreshToken, expiresAt, subscriptionType, ... } }
   */
  async function readClaudeKeychainCredentials() {
    if (process.platform !== 'darwin') {
      // TODO: Windows uses credential manager, Linux uses libsecret
      return null;
    }
    try {
      const { stdout } = await execAsync(
        'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
        { timeout: 5000 }
      );
      const raw = stdout.trim();
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.claudeAiOauth?.accessToken) {
        return {
          accessToken: data.claudeAiOauth.accessToken,
          refreshToken: data.claudeAiOauth.refreshToken,
          expiresAt: data.claudeAiOauth.expiresAt,
          subscriptionType: data.claudeAiOauth.subscriptionType || null,
          rateLimitTier: data.claudeAiOauth.rateLimitTier || null,
          scopes: data.claudeAiOauth.scopes || [],
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve the best available credential. Returns { token, source, authHeader }.
   *
   * Source values:
   * - 'oauth_token':        Long-lived OAuth from `claude setup-token` — routes via CLI.
   * - 'subscription':       OAuth from macOS keychain — routes via CLI.
   * - 'api_key':            Direct Anthropic API key — routes via HTTPS (x-api-key header).
   * - 'oauth_token_direct': Same OAuth token as 'oauth_token' but CLI is missing,
   *                         so we fall back to direct HTTPS with Bearer auth. This path
   *                         keeps the app working when the user has an OAuth token
   *                         saved but hasn't installed/kept the Claude CLI.
   *
   * Selection order: prefer a CLI-routed subscription credential ONLY if the CLI is
   * actually installed. Otherwise fall through to direct-API credentials so chat
   * continues to work instead of showing "Claude CLI not found" in production.
   */
  async function resolveClaudeCredential() {
    const storedOauth = getSetting('claude_oauth_token');
    const keychainCreds = await readClaudeKeychainCredentials();
    const savedKey = getSetting('claude_api_key');

    // Only probe the binary if we might need it (at least one OAuth source is present).
    // Avoids a stat fan-out when the user only has an API key configured.
    const needsCli = Boolean(storedOauth || keychainCreds?.accessToken);
    const cliBin = needsCli ? await resolveClaudeBinary() : null;

    // Priority 1: In-app captured OAuth token → CLI (when available)
    if (storedOauth && cliBin) {
      return {
        token: storedOauth,
        source: 'oauth_token',
        subscriptionType: 'subscription',
        authHeader: { 'Authorization': `Bearer ${storedOauth}` },
      };
    }

    // Priority 2: Keychain OAuth → CLI (when available)
    if (keychainCreds?.accessToken && cliBin) {
      // Check if token is expired (with 60s buffer)
      const isExpired = keychainCreds.expiresAt && (Date.now() > keychainCreds.expiresAt - 60000);
      // The CLI handles its own OAuth refresh internally, so returning an expired token
      // here is still fine — it signals status to the UI but doesn't block chat.
      return {
        token: keychainCreds.accessToken,
        source: 'subscription',
        expired: isExpired,
        subscriptionType: keychainCreds.subscriptionType,
        authHeader: isExpired ? {} : { 'Authorization': `Bearer ${keychainCreds.accessToken}` },
      };
    }

    // Priority 3: Direct API key → /v1/messages with x-api-key
    if (savedKey) {
      return {
        token: savedKey,
        source: 'api_key',
        subscriptionType: null,
        authHeader: { 'x-api-key': savedKey },
      };
    }

    // Priority 4: OAuth token but no CLI → direct /v1/messages with Bearer auth.
    // Keeps chat working when the user has signed in but hasn't installed the CLI.
    if (storedOauth) {
      return {
        token: storedOauth,
        source: 'oauth_token_direct',
        subscriptionType: 'subscription',
        authHeader: { 'Authorization': `Bearer ${storedOauth}` },
      };
    }

    // Priority 5: Keychain OAuth but no CLI → direct Bearer auth. Best-effort
    // fallback so users who previously logged in via the CLI don't lose access
    // if the CLI was removed. The keychain token is short-lived (~1h), so this
    // only works until the next refresh is needed, but it bridges the gap until
    // the user re-installs the CLI or adds an API key.
    if (keychainCreds?.accessToken) {
      const isExpired = keychainCreds.expiresAt && (Date.now() > keychainCreds.expiresAt - 60000);
      return {
        token: keychainCreds.accessToken,
        source: 'oauth_token_direct',
        subscriptionType: keychainCreds.subscriptionType || 'subscription',
        expired: isExpired,
        authHeader: isExpired ? {} : { 'Authorization': `Bearer ${keychainCreds.accessToken}` },
      };
    }

    return null;
  }

  // Detect Claude Code CLI / subscription status
  ipcMain.handle('claude:detectAuth', async () => {
    const result = {
      installed: false,
      authenticated: false,
      authSource: null,
      tokenPreview: null,
      subscriptionType: null,
      expired: false,
      version: null,
      binaryPath: null,
    };

    try {
      // Resolve binary + version (covers homebrew, ~/.local/bin, npm global)
      const bin = await resolveClaudeBinary();
      if (bin) {
        result.installed = true;
        result.binaryPath = bin;
        try {
          const { stdout } = await execFileAsync(bin, ['--version'], { timeout: 5000 });
          const m = stdout.trim().match(/\d+\.\d+\.\d+/);
          result.version = m ? m[0] : stdout.trim();
        } catch { /* ignore */ }
      } else {
        // ~/.claude directory existence as a secondary signal
        try {
          await fs.promises.access(path.join(os.homedir(), '.claude'));
          result.installed = true;
        } catch { /* not found */ }
      }

      // Priority 1: in-app captured OAuth token
      const storedOauth = getSetting('claude_oauth_token');
      if (storedOauth) {
        result.authenticated = true;
        result.authSource = 'oauth_token';
        result.subscriptionType = 'subscription';
        result.tokenPreview = storedOauth.substring(0, 16) + '...' + storedOauth.slice(-4);
        return result;
      }

      // Priority 2: keychain (macOS)
      const oauthCreds = await readClaudeKeychainCredentials();
      if (oauthCreds?.accessToken) {
        result.authenticated = true;
        result.authSource = 'subscription';
        result.subscriptionType = oauthCreds.subscriptionType;
        result.tokenPreview = oauthCreds.accessToken.substring(0, 16) + '...' + oauthCreds.accessToken.slice(-4);
        if (oauthCreds.expiresAt && Date.now() > oauthCreds.expiresAt - 60000) {
          result.expired = true;
        }
      }
    } catch { /* ignore */ }

    return result;
  });

  // Get the resolved credential info (for chat panel to know if connected)
  ipcMain.handle('claude:getToken', async () => {
    const cred = await resolveClaudeCredential();
    if (cred) {
      return { token: cred.token, source: cred.source, subscriptionType: cred.subscriptionType };
    }
    return { token: null, source: null, subscriptionType: null };
  });

  // Save/remove direct API key
  ipcMain.handle('claude:saveApiKey', async (_event, apiKey) => {
    setSetting('claude_api_key', apiKey || '');
    return { success: true };
  });

  ipcMain.handle('claude:getApiKey', async () => {
    return getSetting('claude_api_key') || '';
  });

  // Resolve CLI aliases to full model IDs for direct API usage
  // NOTE: ALIAS_TO_MODEL is defined at the top of registerIPC()

  // Validate an API key by making a test request
  ipcMain.handle('claude:validateKey', async (_event, apiKey) => {
    if (!apiKey) return { valid: false, error: 'No API key provided' };
    return new Promise((resolve) => {
      const postData = JSON.stringify({
        model: ALIAS_TO_MODEL['sonnet'] || 'claude-sonnet-4-6',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });

      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({ valid: true });
          } else if (res.statusCode === 401) {
            resolve({ valid: false, error: 'Invalid API key' });
          } else if (res.statusCode === 429) {
            resolve({ valid: true, warning: 'Rate limited, but key is valid' });
          } else {
            try {
              const data = JSON.parse(body);
              resolve({ valid: false, error: data.error?.message || `HTTP ${res.statusCode}` });
            } catch {
              resolve({ valid: false, error: `HTTP ${res.statusCode}` });
            }
          }
        });
      });

      req.on('error', (err) => resolve({ valid: false, error: err.message }));
      req.setTimeout(15000, () => { req.destroy(); resolve({ valid: false, error: 'Connection timed out' }); });
      req.write(postData);
      req.end();
    });
  });

  /**
   * Find the claude CLI binary on disk.
   * Checks common install paths first (fast), then falls back to `which`.
   */
  async function resolveClaudeBinary() {
    const candidates = process.platform === 'win32'
      ? [path.join(process.env.APPDATA || '', 'npm', 'claude.cmd')]
      : [
          path.join(os.homedir(), '.local', 'bin', 'claude'),
          '/opt/homebrew/bin/claude',
          '/usr/local/bin/claude',
          '/usr/bin/claude',
        ];

    for (const p of candidates) {
      try {
        const stat = await fs.promises.stat(p);
        if (stat.isFile()) return p;
      } catch { /* continue */ }
    }

    // Fallback: which/where — async to avoid blocking main thread
    try {
      const { stdout } = await execAsync(
        process.platform === 'win32' ? 'where claude 2>NUL' : 'which claude 2>/dev/null',
        { timeout: 5000 }
      );
      return stdout.trim().split('\n')[0];
    } catch { return null; }
  }

  /**
   * Stream chat via Claude CLI subprocess (for subscription OAuth).
   * Uses `claude -p` with `--output-format stream-json --verbose --include-partial-messages`.
   * The CLI handles OAuth auth, token refresh, and API routing internally.
   *
   * Model / context / effort wiring (per Claude Code v2.1.111+ docs, April 2026):
   * - 1M context is enabled via the `[1m]` alias suffix (e.g. `opus[1m]` or
   *   `claude-opus-4-7[1m]`), NOT via ANTHROPIC_BETAS. Max/Team/Enterprise plans
   *   auto-upgrade Opus to 1M without the suffix; we append it anyway for other tiers.
   * - `--effort low|medium|high|xhigh|max` sets reasoning depth. `xhigh` is Opus 4.7 only
   *   (older models fall back to the highest supported level — safe to pass).
   * - Opus 4.7 always uses adaptive thinking; fixed `MAX_THINKING_TOKENS` budget does not apply.
   */
  async function streamViaCLI(event, messages, images, model, streamId, workspacePath, effortLevel) {
    const claudeBin = await resolveClaudeBinary();
    if (!claudeBin) {
      return { error: 'Claude CLI not found. Install Claude Code or add an API key in Settings → Providers.' };
    }

    // Build the prompt: format conversation history + current message
    const lastMsg = messages[messages.length - 1];
    // Extract text content from the last message (may be string or content blocks array)
    const lastMsgText = typeof lastMsg.content === 'string'
      ? lastMsg.content
      : (Array.isArray(lastMsg.content)
        ? lastMsg.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
        : '');

    // Write any attached images to temp files so the CLI's Read tool can access them
    const tempImagePaths = [];
    if (images && images.length > 0) {
      const tmpDir = path.join(os.tmpdir(), 'foundry-images');
      await fsp.mkdir(tmpDir, { recursive: true }).catch(() => {});
      for (const img of images) {
        const ext = img.mediaType?.split('/')[1] || 'png';
        const tmpPath = path.join(tmpDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
        await fsp.writeFile(tmpPath, Buffer.from(img.base64, 'base64'));
        tempImagePaths.push(tmpPath);
      }
    }

    // Build prompt with image references if present
    let imageContext = '';
    if (tempImagePaths.length > 0) {
      const fileList = tempImagePaths.map(p => `- ${p}`).join('\n');
      imageContext = `\n\nThe user has attached the following image(s). IMPORTANT: Use your Read tool to view each image file before responding:\n${fileList}\n\n`;
    }

    let prompt;
    if (messages.length === 1) {
      prompt = (lastMsgText || 'Please look at the attached image(s).') + imageContext;
    } else {
      // Multi-turn: format previous messages as context
      const history = messages.slice(0, -1).map(m => {
        const text = typeof m.content === 'string'
          ? m.content
          : (Array.isArray(m.content)
            ? m.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
            : '');
        return `${m.role === 'user' ? 'Human' : 'Assistant'}: ${text}`;
      }).join('\n\n');
      prompt = `Here is our conversation so far:\n\n${history}\n\nHuman: ${lastMsgText}${imageContext}\n\nPlease respond to my latest message above, taking the conversation history into account.`;
    }

    // The CLI accepts aliases (sonnet, opus, haiku) and auto-resolves to latest.
    // If a full model ID was passed, use it as-is — the CLI handles both.
    const baseModel = model || 'sonnet';

    // Append [1m] alias suffix if 1M context is enabled AND the model supports it.
    // Opus 4.7/4.6 and Sonnet 4.6 are 1M-capable; Haiku is not.
    const disable1M = getSetting('claude_disable_1m') === 'true';
    const supports1M = /claude-(opus|sonnet)-4/.test(baseModel)
      || baseModel === 'opus' || baseModel === 'sonnet';
    const modelAlias = (!disable1M && supports1M && !baseModel.includes('[1m]'))
      ? `${baseModel}[1m]`
      : baseModel;

    // Read auto-approve setting — default ON (null means never set, treat as true)
    const autoApproveRaw = getSetting('claude_auto_approve_permissions');
    const autoApprove = autoApproveRaw === null || autoApproveRaw === undefined || autoApproveRaw === 'true';

    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--model', modelAlias,
      '--max-turns', '200',
      '--no-session-persistence',
    ];

    // --effort: pass the level string directly. CLI accepts low/medium/high/xhigh/max.
    // Unsupported levels gracefully fall back to the highest-supported level per Claude Code docs,
    // so we can pass e.g. 'xhigh' on Sonnet without erroring (it runs as 'high').
    if (effortLevel && effortLevel !== 'off') {
      const valid = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
      if (valid.has(effortLevel)) args.push('--effort', effortLevel);
    }

    // If images are attached, add the temp directory so CLI can read them
    if (tempImagePaths.length > 0) {
      const tmpDir = path.join(os.tmpdir(), 'foundry-images');
      args.push('--add-dir', tmpDir);
    }

    if (autoApprove) {
      args.push('--dangerously-skip-permissions');
    }

    return new Promise((resolve) => {
      // Build clean env — strip Claude Code nesting vars
      const cleanEnv = { ...process.env };
      delete cleanEnv.CLAUDECODE;
      delete cleanEnv.CLAUDE_CODE_ENTRYPOINT;
      delete cleanEnv.CLAUDE_CODE_OAUTH_TOKEN;
      Object.keys(cleanEnv).forEach(k => { if (k.startsWith('CLAUDE_CODE_')) delete cleanEnv[k]; });

      // If user authed via in-app `claude setup-token`, use that token directly
      // (bypasses keychain, works cross-platform).
      const storedOauth = getSetting('claude_oauth_token');
      if (storedOauth) {
        cleanEnv.CLAUDE_CODE_OAUTH_TOKEN = storedOauth;
      }

      // 1M context is controlled via the `[1m]` alias suffix on the model (set above),
      // not via ANTHROPIC_BETAS. Claude Code v2.1.111+ recognizes the suffix and sets
      // the correct beta header internally. We only need to propagate the user's
      // disable preference via CLAUDE_CODE_DISABLE_1M_CONTEXT as a belt-and-suspenders.
      if (getSetting('claude_disable_1m') === 'true') {
        cleanEnv.CLAUDE_CODE_DISABLE_1M_CONTEXT = '1';
      }

      // Set cwd to workspace path so Claude CLI tools (Bash, etc.) operate in the project directory
      const effectiveCwd = workspacePath && fs.existsSync(workspacePath) ? workspacePath : undefined;

      const proc = spawn(claudeBin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: cleanEnv,
        ...(effectiveCwd && { cwd: effectiveCwd }),
      });

      const win = BrowserWindow.fromWebContents(event.sender);
      activeStreams.set(streamId, { kill: (sig) => proc.kill(sig), windowId: win?.id });

      let buffer = '';

      proc.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);

            // Forward all stream events the renderer needs for rich UI
            if (parsed.type === 'stream_event' && parsed.event) {
              const evt = parsed.event;
              const passTypes = [
                'content_block_start',
                'content_block_delta',
                'content_block_stop',
                'message_start',
                'message_delta',
                'message_stop',
              ];
              if (passTypes.includes(evt.type)) {
                queueStreamEvent(win, 'claude:stream', streamId, evt);
              }
            }

            // Final result — stream is done
            if (parsed.type === 'result') {
              if (parsed.is_error) {
                if (win && !win.isDestroyed()) {
                  win.webContents.send('claude:streamError', streamId, parsed.result || 'Claude CLI returned an error');
                }
              }
            }
          } catch { /* skip malformed JSON */ }
        }
      });

      let stderrOutput = '';
      const MAX_STDERR = 64 * 1024; // 64KB cap — prevent unbounded growth
      proc.stderr.on('data', (chunk) => {
        if (stderrOutput.length < MAX_STDERR) {
          stderrOutput += chunk.toString();
          if (stderrOutput.length > MAX_STDERR) stderrOutput = stderrOutput.slice(0, MAX_STDERR);
        }
      });

      proc.on('close', (code) => {
        activeStreams.delete(streamId);
        // Clean up temp image files
        for (const tmpPath of tempImagePaths) {
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        }
        // Flush any pending batched events before sending end signal
        if (win && !win.isDestroyed()) {
          flushAllBatchesForWindow(win.id);
          win.webContents.send('claude:streamEnd', streamId);
        }
        if (code !== 0 && stderrOutput.trim()) {
          resolve({ error: stderrOutput.trim() });
        } else {
          resolve({ success: true });
        }
      });

      proc.on('error', (err) => {
        activeStreams.delete(streamId);
        if (win && !win.isDestroyed()) {
          win.webContents.send('claude:streamError', streamId, err.message);
        }
        resolve({ error: err.message });
      });
    });
  }

  /**
   * Stream chat via direct HTTPS to Anthropic API (for API key auth only).
   *
   * Model dispatch matrix (per Anthropic docs, April 2026):
   * - Opus 4.7:                adaptive thinking ONLY. `budget_tokens` returns 400.
   *                            `temperature`/`top_p`/`top_k` return 400. Use `output_config.effort`.
   *                            1M context supported. Default effort: xhigh.
   * - Opus 4.6 / Sonnet 4.6:   adaptive thinking preferred. `budget_tokens` deprecated but accepted.
   *                            1M context supported via `context-1m-2025-08-07` beta header.
   *                            Use `output_config.effort` instead of budget_tokens.
   * - Older (Opus 4.5, etc):   manual thinking with `budget_tokens`. No `output_config.effort`.
   * - Haiku:                   no thinking, no effort, 200K context.
   */
  function streamViaAPI(event, messages, model, streamId, authHeader, effortLevel) {
    const abortController = new AbortController();
    const win = BrowserWindow.fromWebContents(event.sender);
    activeStreams.set(streamId, { abort: () => abortController.abort(), windowId: win?.id });

    // Resolve aliases for the Anthropic API (it doesn't accept short aliases)
    const resolvedModel = ALIAS_TO_MODEL[model] || model || 'claude-sonnet-4-6';

    const isOpus47 = /claude-opus-4-7/.test(resolvedModel);
    const isOpus46 = /claude-opus-4-6/.test(resolvedModel);
    const isSonnet46 = /claude-sonnet-4-6/.test(resolvedModel);
    const isHaiku = /claude-haiku/.test(resolvedModel);
    const isModernFamily = isOpus47 || isOpus46 || isSonnet46; // adaptive-thinking + effort family
    const isOlderThinking = /claude-(sonnet|opus)-4/.test(resolvedModel) && !isModernFamily; // 4.5 etc.

    const supports1M = /claude-(opus|sonnet)-4/.test(resolvedModel) && !isHaiku;
    const disable1M = getSetting('claude_disable_1m') === 'true';
    const use1M = supports1M && !disable1M;

    // Normalize effort. Valid: off/low/medium/high/xhigh/max. Null → use model default.
    const rawEffort = typeof effortLevel === 'string' ? effortLevel.toLowerCase() : null;
    const validEfforts = new Set(['off', 'low', 'medium', 'high', 'xhigh', 'max']);
    let effort = validEfforts.has(rawEffort) ? rawEffort : null;
    // Per-model fallback: xhigh is Opus-4.7-only; demote on other models.
    if (effort === 'xhigh' && !isOpus47) effort = 'high';
    // Haiku has no effort support — drop it.
    if (isHaiku) effort = null;

    // Token headroom: Opus 4.7 at xhigh/max benefits from large max_tokens (docs say start at 64k).
    let maxTokens = 8192;
    if (isOpus47 && (effort === 'xhigh' || effort === 'max')) maxTokens = 64000;
    else if (isOpus47) maxTokens = 32000;
    else if (effort === 'max' || effort === 'high') maxTokens = 16384;

    const requestBody = {
      model: resolvedModel,
      max_tokens: maxTokens,
      stream: true,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    };

    // Thinking mode
    if (effort !== 'off') {
      if (isOpus47) {
        // Adaptive-only. Summarized display so we can still show thinking blocks.
        requestBody.thinking = { type: 'adaptive', display: 'summarized' };
      } else if (isOpus46 || isSonnet46) {
        requestBody.thinking = { type: 'adaptive', display: 'summarized' };
      } else if (isOlderThinking) {
        // Legacy: fixed budget_tokens for 4.5 etc.
        const legacyBudgets = { low: 4000, medium: 10000, high: 32000, max: 60000 };
        const budget = legacyBudgets[effort] || 10000;
        requestBody.thinking = { type: 'enabled', budget_tokens: budget };
        requestBody.max_tokens = Math.max(maxTokens, budget + 8192);
      }
    }

    // Effort parameter (new API — output_config.effort). Modern family only.
    if (effort && effort !== 'off' && isModernFamily) {
      requestBody.output_config = { effort };
    }

    const postData = JSON.stringify(requestBody);

    // authHeader is a pre-built object from resolveClaudeCredential — either
    // `{ 'x-api-key': <key> }` for api_key, or `{ Authorization: 'Bearer <token>' }`
    // for oauth_token_direct. Spread it so either works without branching here.
    const apiHeaders = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...(authHeader || {}),
    };
    if (use1M) {
      apiHeaders['anthropic-beta'] = 'context-1m-2025-08-07';
    }

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: apiHeaders,
        signal: abortController.signal,
      }, (res) => {
        if (res.statusCode !== 200) {
          let body = '';
          res.on('data', (chunk) => body += chunk);
          res.on('end', () => {
            activeStreams.delete(streamId);
            try {
              const data = JSON.parse(body);
              resolve({ error: data.error?.message || `API error: HTTP ${res.statusCode}` });
            } catch {
              resolve({ error: `API error: HTTP ${res.statusCode}` });
            }
          });
          return;
        }

        let buffer = '';
        const win = BrowserWindow.fromWebContents(event.sender);

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (!jsonStr || jsonStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(jsonStr);
                queueStreamEvent(win, 'claude:stream', streamId, parsed);
              } catch { /* skip */ }
            }
          }
        });

        res.on('end', () => {
          if (buffer.trim()) {
            for (const line of buffer.split('\n')) {
              if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6).trim();
                if (!jsonStr || jsonStr === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(jsonStr);
                  queueStreamEvent(win, 'claude:stream', streamId, parsed);
                } catch { /* skip */ }
              }
            }
          }
          activeStreams.delete(streamId);
          // Flush any pending batched events before sending end signal
          if (win && !win.isDestroyed()) {
            flushAllBatchesForWindow(win.id);
            win.webContents.send('claude:streamEnd', streamId);
          }
          resolve({ success: true });
        });

        res.on('error', (err) => {
          activeStreams.delete(streamId);
          if (win && !win.isDestroyed()) {
            win.webContents.send('claude:streamError', streamId, err.message);
          }
          resolve({ error: err.message });
        });
      });

      req.on('error', (err) => {
        activeStreams.delete(streamId);
        resolve(err.name === 'AbortError' ? { aborted: true } : { error: err.message });
      });

      req.write(postData);
      req.end();
    });
  }

  // Main chat handler — routes to CLI (subscription) or API (key) based on auth source
  const MAX_CONCURRENT_STREAMS = 3; // Prevent unbounded subprocess spawning

  ipcMain.handle('claude:chat', async (event, params) => {
    const { messages, images, model, streamId, workspacePath, effortLevel, thinkingBudget } = params || {};
    // Enforce per-window concurrency limit
    const callingWin = BrowserWindow.fromWebContents(event.sender);
    const callingWinId = callingWin?.id;
    const windowStreamCount = [...activeStreams.values()].filter(e => e.windowId === callingWinId).length;
    if (windowStreamCount >= MAX_CONCURRENT_STREAMS) {
      return { error: `Too many active agent sessions (${windowStreamCount}). Please wait for one to finish or stop an existing session.` };
    }

    const cred = await resolveClaudeCredential();
    if (!cred) {
      return { error: 'No Claude credentials found. Connect your Claude Code subscription or add an API key in Settings → Providers.' };
    }

    // Backwards-compat: older renderers may still send thinkingBudget (integer). Derive effort.
    let effort = effortLevel;
    if (!effort && typeof thinkingBudget === 'number') {
      if (thinkingBudget <= 0) effort = 'off';
      else if (thinkingBudget <= 4000) effort = 'low';
      else if (thinkingBudget <= 10000) effort = 'medium';
      else if (thinkingBudget <= 32000) effort = 'high';
      else effort = 'xhigh';
    }

    if (cred.source === 'subscription' || cred.source === 'oauth_token') {
      // Subscription OAuth → use Claude CLI subprocess (handles auth internally).
      // resolveClaudeCredential only returns these sources when the CLI binary exists.
      return streamViaCLI(event, messages, images, model, streamId, workspacePath, effort);
    } else {
      // 'api_key' or 'oauth_token_direct' → direct HTTPS to Anthropic API.
      // The authHeader built by resolveClaudeCredential already has the right header
      // shape (x-api-key vs Authorization: Bearer).
      return streamViaAPI(event, messages, model, streamId, cred.authHeader, effort);
    }
  });

  // Stop active stream — handles both CLI process and API AbortController
  ipcMain.handle('claude:stopStream', async (_event, streamId) => {
    const entry = activeStreams.get(streamId);
    if (!entry) return { success: false };

    try {
      if (entry.abort) entry.abort();
      else if (entry.kill) entry.kill('SIGTERM');
    } catch {}
    activeStreams.delete(streamId);
    return { success: true };
  });

  // Kill streams for the CALLING window only — prevents cross-window interference
  ipcMain.handle('claude:stopAllStreams', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const winId = win?.id;
    let killed = 0;
    for (const [streamId, entry] of activeStreams) {
      if (entry.windowId === winId) {
        try {
          if (entry.abort) entry.abort();
          else if (entry.kill) entry.kill('SIGTERM');
          killed++;
        } catch {}
        activeStreams.delete(streamId);
      }
    }
    console.log(`[Foundry] Killed ${killed} active streams for window ${winId}`);
    return { success: true, killed };
  });

  // Get/set selected model — stores the alias (sonnet/opus/haiku)
  ipcMain.handle('claude:getModel', async () => {
    return getSetting('claude_model') || 'sonnet';
  });

  ipcMain.handle('claude:setModel', async (_event, model) => {
    setSetting('claude_model', model);
    return { success: true };
  });

  // Fetch available models from Anthropic /v1/models API — auto-discovers new models.
  // NOTE: Anthropic's /v1/models endpoint explicitly rejects subscription OAuth tokens
  // ("OAuth authentication is currently not supported"). Only API keys work.
  // Priority: (1) saved API key in settings, (2) ANTHROPIC_API_KEY env var.
  // Subscription-only users without an API key get { models: null, requiresApiKey: true }.
  ipcMain.handle('claude:fetchModels', async () => {
    const apiKey = getSetting('claude_api_key') || process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      console.warn('[fetchModels] No API key available. Anthropic /v1/models rejects subscription OAuth tokens. Add an API key in Settings → Providers to enable dynamic model discovery.');
      return { models: null, requiresApiKey: true };
    }

    const TIER_DESC = { opus: 'Most capable', sonnet: 'Balanced', haiku: 'Fastest' };

    function parseModelsResponse(data) {
      return (data.data || [])
        .filter(m => m.id && m.id.startsWith('claude-'))
        .map(m => {
          const tierMatch = m.id.match(/claude-(opus|sonnet|haiku)/);
          const tier = tierMatch ? tierMatch[1] : null;
          const label = (m.display_name || m.id).replace(/^Claude\s+/i, '');
          const isOpus47 = /claude-opus-4-7/.test(m.id);
          const isModernFamily = /claude-(opus-4-[67]|sonnet-4-6)/.test(m.id);
          const is1MEligible = tier !== 'haiku' && /claude-(opus|sonnet)-4/.test(m.id);
          const supportedEfforts = isOpus47
            ? ['low', 'medium', 'high', 'xhigh', 'max']
            : isModernFamily
              ? ['low', 'medium', 'high', 'max']
              : [];
          return {
            id: m.id,
            resolvedId: m.id,
            label,
            desc: TIER_DESC[tier] || '',
            supportsThinking: Boolean(tier) && /claude-(opus|sonnet)-[4-9]/.test(m.id),
            supports1M: is1MEligible,
            supportedEfforts,
            defaultEffort: isOpus47 ? 'xhigh' : (isModernFamily ? 'high' : null),
          };
        });
    }

    try {
      const resp = await fetch('https://api.anthropic.com/v1/models?limit=100', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        console.error('[fetchModels] fetch failed:', resp.status, body);
        return { models: null, error: `HTTP ${resp.status}` };
      }
      const data = await resp.json();
      const models = parseModelsResponse(data);
      if (!models.length) return { models: null, error: 'Empty model list' };
      return { models };
    } catch (err) {
      console.error('[fetchModels] fetch error:', err.message);
      return { models: null, error: err.message };
    }
  });

  // ---- Claude CLI: In-App Login (PTY) + Install/Update ---- //

  // Only one login PTY at a time — tracked at handler scope.
  let claudeLoginPty = null;
  let claudeLoginBuffer = '';
  let claudeLoginTimeout = null;
  let claudeLoginWinId = null;

  function cleanupClaudeLogin() {
    if (claudeLoginTimeout) { clearTimeout(claudeLoginTimeout); claudeLoginTimeout = null; }
    if (claudeLoginPty) {
      try { claudeLoginPty.kill(); } catch { /* ignore */ }
      claudeLoginPty = null;
    }
    claudeLoginBuffer = '';
  }

  function emitLoginEvent(channel, payload) {
    if (claudeLoginWinId == null) return;
    const win = BrowserWindow.fromId(claudeLoginWinId);
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }

  // Best-effort npm resolution — respects user's node/nvm installs.
  // Resolve npm on the host system. Order:
  //   1. Known explicit install paths (homebrew, /usr/local, volta, nvm).
  //   2. The user's login shell (zsh/bash -lc "command -v npm"). This is how
  //      VS Code solves the "GUI-launched Electron app has minimal PATH" problem
  //      — we ask the login shell directly because it sources the user's profile
  //      where `node`/`npm` from fnm, asdf, nodenv, or app-bundled installers live.
  //   3. `which npm` with whatever PATH we inherited (last resort).
  async function resolveNpmBinary() {
    if (process.platform === 'win32') {
      try {
        const { stdout } = await execAsync('where npm 2>NUL', { timeout: 5000 });
        return stdout.trim().split('\n')[0] || null;
      } catch { return null; }
    }

    const candidates = [
      '/opt/homebrew/bin/npm',
      '/usr/local/bin/npm',
      path.join(os.homedir(), '.volta', 'bin', 'npm'),
      path.join(os.homedir(), '.nvm', 'versions', 'node'),
    ];
    for (const p of candidates) {
      if (p.endsWith('.nvm/versions/node')) {
        try {
          const versions = fs.readdirSync(p).filter(d => d.startsWith('v'));
          if (versions.length) {
            versions.sort();
            const npmPath = path.join(p, versions[versions.length - 1], 'bin', 'npm');
            if (fs.existsSync(npmPath)) return npmPath;
          }
        } catch { /* ignore */ }
        continue;
      }
      try {
        const stat = await fs.promises.stat(p);
        if (stat.isFile()) return p;
      } catch { /* continue */ }
    }

    // Ask the login shell — picks up npm from fnm/asdf/nodenv/custom installs.
    try {
      const shell = process.env.SHELL || '/bin/zsh';
      const { stdout } = await execAsync(
        `"${shell}" -lc "command -v npm 2>/dev/null"`,
        { timeout: 8000 }
      );
      const found = stdout.trim().split('\n').pop();
      if (found && fs.existsSync(found)) return found;
    } catch { /* continue */ }

    try {
      const { stdout } = await execAsync('which npm 2>/dev/null', { timeout: 5000 });
      return stdout.trim().split('\n')[0] || null;
    } catch { return null; }
  }

  // Build a PATH suitable for running `npm` (or any node-based tool) as a child
  // process from a packaged Electron app. The npm shebang is `#!/usr/bin/env node`,
  // which requires `node` on PATH. In a GUI-launched .app, process.env.PATH is
  // typically just `/usr/bin:/bin:/usr/sbin:/sbin`, so `env` can't find node.
  //
  // We prepend:
  //   1. The directory containing the resolved npm (node lives next to it).
  //   2. Standard macOS dev locations (`/opt/homebrew/bin`, `/usr/local/bin`).
  //   3. The user's ~/.local/bin and nvm/volta shims, for completeness.
  function buildNodeAwarePath(npmBin) {
    const parts = [];
    if (npmBin) parts.push(path.dirname(npmBin));
    if (process.platform !== 'win32') {
      parts.push('/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin');
      parts.push(path.join(os.homedir(), '.local', 'bin'));
      parts.push(path.join(os.homedir(), '.volta', 'bin'));
    }
    const existing = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    const seen = new Set();
    const merged = [];
    for (const p of [...parts, ...existing]) {
      if (!p || seen.has(p)) continue;
      seen.add(p);
      merged.push(p);
    }
    return merged.join(path.delimiter);
  }

  // Start in-app OAuth login. Spawns `claude setup-token` in a PTY.
  // Output is streamed to renderer via 'claude:loginOutput'.
  // Renderer writes user input via 'claude:loginInput' (paste auth code).
  // On completion, token is captured from stdout and saved.
  // Result is delivered via 'claude:loginResult'.
  ipcMain.handle('claude:startLogin', async (event) => {
    cleanupClaudeLogin();

    const bin = await resolveClaudeBinary();
    if (!bin) {
      return { success: false, error: 'Claude Code CLI not installed. Click "Install CLI" first.' };
    }

    const ownerWin = BrowserWindow.fromWebContents(event.sender);
    claudeLoginWinId = ownerWin?.id ?? null;

    // Strip env vars that would confuse setup-token (it would think it's nested,
    // or use a pre-existing token instead of starting fresh).
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;
    delete cleanEnv.CLAUDE_CODE_ENTRYPOINT;
    delete cleanEnv.CLAUDE_CODE_OAUTH_TOKEN;
    delete cleanEnv.ANTHROPIC_AUTH_TOKEN;
    delete cleanEnv.ANTHROPIC_API_KEY;
    Object.keys(cleanEnv).forEach(k => { if (k.startsWith('CLAUDE_CODE_')) delete cleanEnv[k]; });
    cleanEnv.TERM = 'xterm-256color';
    cleanEnv.COLORTERM = 'truecolor';

    try {
      claudeLoginPty = pty.spawn(bin, ['setup-token'], {
        name: 'xterm-256color',
        cols: 100,
        rows: 30,
        env: cleanEnv,
      });
    } catch (err) {
      return { success: false, error: `Failed to start login: ${err.message}` };
    }

    // 5 minute overall timeout
    claudeLoginTimeout = setTimeout(() => {
      emitLoginEvent('claude:loginResult', { success: false, error: 'Login timed out after 5 minutes' });
      cleanupClaudeLogin();
    }, 5 * 60 * 1000);

    claudeLoginPty.onData((data) => {
      claudeLoginBuffer += data;
      emitLoginEvent('claude:loginOutput', data);
    });

    claudeLoginPty.onExit(({ exitCode }) => {
      if (claudeLoginTimeout) { clearTimeout(claudeLoginTimeout); claudeLoginTimeout = null; }
      const output = claudeLoginBuffer;
      claudeLoginPty = null;

      // Capture long-lived OAuth token (sk-ant-oat01-...) emitted by `setup-token`.
      // Regex is conservative — token format is sk-ant- + 4-char type + 64+ char body.
      const tokenMatch = output.match(/sk-ant-[a-zA-Z0-9_-]{20,}/);
      if (tokenMatch) {
        const token = tokenMatch[0];
        setSetting('claude_oauth_token', token);
        emitLoginEvent('claude:loginResult', {
          success: true,
          tokenPreview: token.substring(0, 16) + '...' + token.slice(-4),
        });
      } else {
        emitLoginEvent('claude:loginResult', {
          success: false,
          error: exitCode === 0
            ? 'Login completed but no token was detected. Try again.'
            : `Login exited with code ${exitCode}`,
        });
      }
      claudeLoginBuffer = '';
    });

    return { success: true };
  });

  ipcMain.on('claude:loginInput', (_event, data) => {
    if (claudeLoginPty && typeof data === 'string') {
      try { claudeLoginPty.write(data); } catch { /* ignore */ }
    }
  });

  ipcMain.handle('claude:cancelLogin', async () => {
    cleanupClaudeLogin();
    return { success: true };
  });

  ipcMain.handle('claude:logout', async () => {
    setSetting('claude_oauth_token', '');
    return { success: true };
  });

  // Install or update Claude Code CLI via npm. Streams output via 'claude:cliInstallOutput'.
  ipcMain.handle('claude:installOrUpdateCli', async (event) => {
    const ownerWin = BrowserWindow.fromWebContents(event.sender);
    const winId = ownerWin?.id;

    const emit = (line) => {
      const win = winId != null ? BrowserWindow.fromId(winId) : null;
      if (win && !win.isDestroyed()) {
        win.webContents.send('claude:cliInstallOutput', line);
      }
    };

    const npmBin = await resolveNpmBinary();
    if (!npmBin) {
      const msg = 'npm not found. Install Node.js (https://nodejs.org) first, then retry.';
      emit(msg + '\n');
      return { success: false, error: msg };
    }

    // Force install into ~/.local (a path resolveClaudeBinary already searches).
    // This bypasses any weird user-level npmrc prefix (e.g. leftover from other
    // Electron apps that bundle node and set a global prefix inside their .app).
    const foundryPrefix = path.join(os.homedir(), '.local');
    try {
      await fs.promises.mkdir(path.join(foundryPrefix, 'bin'), { recursive: true });
      await fs.promises.mkdir(path.join(foundryPrefix, 'lib'), { recursive: true });
    } catch { /* ignore */ }

    // Augment PATH so npm's `#!/usr/bin/env node` shebang can resolve `node`.
    // GUI-launched Electron apps inherit a minimal PATH; without this, install
    // dies with `env: node: No such file or directory` (exit code 127).
    const nodeAwarePath = buildNodeAwarePath(npmBin);

    emit(`$ npm install -g --prefix="${foundryPrefix}" @anthropic-ai/claude-code@latest\n\n`);

    return new Promise((resolve) => {
      let proc;
      try {
        proc = spawn(
          npmBin,
          ['install', '-g', `--prefix=${foundryPrefix}`, '@anthropic-ai/claude-code@latest'],
          {
            env: {
              ...process.env,
              PATH: nodeAwarePath,
              npm_config_yes: 'true',
              // Override any user-level prefix config (e.g. from a stray ~/.npmrc)
              npm_config_prefix: foundryPrefix,
              // Prevent npm from looking at a broken global prefix for existing deps
              npm_config_global: 'true',
            },
          }
        );
      } catch (err) {
        emit(`Failed to spawn npm: ${err.message}\n`);
        resolve({ success: false, error: err.message });
        return;
      }

      proc.stdout.on('data', (chunk) => emit(chunk.toString()));
      proc.stderr.on('data', (chunk) => emit(chunk.toString()));

      proc.on('error', (err) => {
        emit(`\nError: ${err.message}\n`);
        resolve({ success: false, error: err.message });
      });

      proc.on('close', async (code) => {
        if (code === 0) {
          // Re-detect so the UI can pick up the new version.
          let version = null;
          try {
            const bin = await resolveClaudeBinary();
            if (bin) {
              const { stdout } = await execFileAsync(bin, ['--version'], { timeout: 5000 });
              const m = stdout.trim().match(/\d+\.\d+\.\d+/);
              version = m ? m[0] : stdout.trim();
            }
          } catch { /* ignore */ }
          emit(`\nInstalled Claude Code${version ? ' v' + version : ''}.\n`);
          resolve({ success: true, version });
        } else {
          emit(`\nnpm exited with code ${code}. If this is a permissions error, try:\n  sudo npm install -g @anthropic-ai/claude-code@latest\n`);
          resolve({ success: false, error: `npm exited with code ${code}` });
        }
      });
    });
  });

  // ---- Chat Threads & Messages ---- //

  ipcMain.handle('chat:createThread', async (_event, { id, title, workspacePath }) => {
    return createThread({ id, title, workspacePath });
  });

  ipcMain.handle('chat:getThreads', async (_event, workspacePath) => {
    return getThreads(workspacePath);
  });

  ipcMain.handle('chat:getThread', async (_event, id) => {
    return getThread(id);
  });

  ipcMain.handle('chat:updateThread', async (_event, id, updates) => {
    return updateThread(id, updates);
  });

  ipcMain.handle('chat:deleteThread', async (_event, id) => {
    return deleteThread(id);
  });

  ipcMain.handle('chat:saveMessages', async (_event, messages) => {
    return saveMessages(messages);
  });

  ipcMain.handle('chat:getMessages', async (_event, threadId, limit, beforeTimestamp) => {
    return getMessages(threadId, limit, beforeTimestamp);
  });

  ipcMain.handle('chat:getMessageCount', async (_event, threadId) => {
    return getMessageCount(threadId);
  });

  ipcMain.handle('chat:deleteThreadMessages', async (_event, threadId) => {
    return deleteThreadMessages(threadId);
  });

}

app.on('ready', async () => {
  try {
    await initDatabase();
  } catch (e) {
    console.error('[Foundry] initDatabase failed:', e);
  }
  registerIPC();
  buildAppMenu();
  createWindow();

  // Initialize auto-updater — IPC handlers register for both dev and prod,
  // auto-polling only starts in production (app.isPackaged)
  initAutoUpdater();

  // macOS dock menu with "New Window"
  if (process.platform === 'darwin') {
    const dockMenu = Menu.buildFromTemplate([
      {
        label: 'New Window',
        click: () => createWindow(),
      },
    ]);
    app.dock.setMenu(dockMenu);

    const dockIcon = nativeImage.createFromPath(iconPath);
    if (dockIcon && !dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase();
    app.quit();
  }
});

app.on('before-quit', () => {
  destroyAutoUpdater();
  // Kill all PTY processes
  for (const [id, entry] of ptyProcesses) {
    try { entry.process.kill(); } catch {}
  }
  ptyProcesses.clear();
  // Kill all active streams
  for (const [streamId, entry] of activeStreams) {
    try {
      if (entry.abort) entry.abort();
      else if (entry.kill) entry.kill('SIGTERM');
    } catch {}
  }
  activeStreams.clear();
  closeDatabase();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
