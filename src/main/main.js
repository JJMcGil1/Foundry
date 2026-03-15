const { app, BrowserWindow, Menu, nativeImage, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, exec, spawn } = require('child_process');
const pty = require('node-pty');
const https = require('https');
const { initDatabase, getProfile, createProfile, updateProfile, saveProfilePhoto, loadProfilePhoto, getSetting, setSetting, getWorkspaces, addWorkspace, removeWorkspace, touchWorkspace, closeDatabase } = require('./database');
const { initAutoUpdater, destroyAutoUpdater } = require('./auto-updater');

// ---- GitHub Avatar Resolution ---- //
const avatarCache = new Map(); // key: "email||author" → url string | null
const avatarPending = new Map(); // key → Promise

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
      if (url) { avatarCache.set(key, url); avatarPending.delete(key); return url; }
    }

    // Step 2: Try author name as GitHub username (strip spaces, lowercase)
    if (author) {
      const guess = author.replace(/\s+/g, '').toLowerCase();
      const url = await probeGitHubAvatar(guess);
      if (url) { avatarCache.set(key, url); avatarPending.delete(key); return url; }
    }

    // Step 3: Try email local part as username
    if (email && !email.includes('noreply')) {
      const localPart = email.split('@')[0];
      if (localPart && localPart !== author?.replace(/\s+/g, '').toLowerCase()) {
        const url = await probeGitHubAvatar(localPart);
        if (url) { avatarCache.set(key, url); avatarPending.delete(key); return url; }
      }
    }

    // All steps failed
    avatarCache.set(key, null);
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
const activeStreams = new Map(); // streamId → AbortController

const isDev = !app.isPackaged;

const iconPath = isDev
  ? path.join(__dirname, '..', 'renderer', 'assets', 'icon.png')
  : path.join(process.resourcesPath, 'build', 'icon.png');

// ---- Multi-window Management ---- //
const allWindows = new Set();

// ---- PTY Terminal Management ---- //
const ptyProcesses = new Map();
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

  win.on('closed', () => {
    allWindows.delete(win);
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

// These are always hidden from the tree entirely (never useful to see)
const HIDDEN = new Set([
  '.git', '.DS_Store', '.svn', '.hg', 'thumbs.db',
]);

function loadGitignore(projectRoot) {
  const ig = ignore();
  try {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      ig.add(content);
    }
  } catch { /* ignore errors */ }
  return ig;
}

function readDirTree(dirPath, depth = 0, maxDepth = 4, projectRoot = null, ig = null) {
  if (depth === 0) {
    projectRoot = projectRoot || dirPath;
    ig = loadGitignore(projectRoot);
  }
  if (depth > maxDepth) return [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result = [];
    // Sort: folders first, then files, alphabetical
    const sorted = entries
      .filter(e => !HIDDEN.has(e.name))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    for (const entry of sorted) {
      const fullPath = path.join(dirPath, entry.name);
      // Get path relative to project root for gitignore matching
      // Append '/' for directories so patterns like "node_modules/" match correctly
      const relativePath = path.relative(projectRoot, fullPath);
      const testPath = entry.isDirectory() ? relativePath + '/' : relativePath;
      const isIgnored = ig ? ig.ignores(testPath) : false;

      if (entry.isDirectory()) {
        result.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
          ignored: isIgnored,
          children: readDirTree(fullPath, depth + 1, maxDepth, projectRoot, ig),
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
  } catch {
    return [];
  }
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

function getGitStatus(dirPath) {
  try {
    const result = execSync('git status --porcelain', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
    const branch = execSync('git branch --show-current', { cwd: dirPath, encoding: 'utf8', timeout: 5000 }).trim();
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
      const tracking = execSync('git rev-list --left-right --count @{u}...HEAD', { cwd: dirPath, encoding: 'utf8', timeout: 5000 }).trim();
      const parts = tracking.split(/\s+/);
      behind = parseInt(parts[0], 10) || 0;
      ahead = parseInt(parts[1], 10) || 0;
    } catch { /* no upstream or no remote */ }
    return { branch, files, staged, unstaged, isRepo: true, behind, ahead };
  } catch {
    return { branch: '', files: [], staged: [], unstaged: [], isRepo: false, behind: 0, ahead: 0 };
  }
}

function getGitLog(dirPath, count = 20, skip = 0) {
  try {
    // Single git log call with numstat — uses @@@ as commit delimiter
    const SEP = '@@@COMMIT@@@';
    const skipArg = skip > 0 ? ` --skip=${skip}` : '';
    const result = execSync(
      `git log --all --pretty=format:"${SEP}%H|||%h|||%s|||%an|||%ae|||%ar|||%aI|||%P|||%D" --numstat -${count}${skipArg}`,
      { cwd: dirPath, encoding: 'utf8', timeout: 10000 }
    );

    const blocks = result.split(SEP).filter(Boolean);
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

function getGitDiff(dirPath, filePath) {
  try {
    const result = execSync(`git diff -- "${filePath}"`, { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
    return result;
  } catch {
    return '';
  }
}

// ---- IPC Handlers ---- //
function registerIPC() {
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
      execSync(`git clone "${authedUrl}" "${destPath}"`, { timeout: 120000 });
      return {
        success: true,
        path: destPath,
        name: repoName,
        tree: readDirTree(destPath),
      };
    } catch (err) {
      return { error: err.message };
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
      tree: readDirTree(dirPath),
    };
  });

  ipcMain.handle('fs:readDir', async (_event, dirPath) => {
    return readDirTree(dirPath);
  });

  ipcMain.handle('fs:readFile', async (_event, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const stats = fs.statSync(filePath);
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
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('fs:createFile', async (_event, dirPath, fileName) => {
    try {
      const filePath = path.join(dirPath, fileName);
      fs.writeFileSync(filePath, '', 'utf8');
      return { success: true, path: filePath };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('fs:createFolder', async (_event, dirPath, folderName) => {
    try {
      const folderPath = path.join(dirPath, folderName);
      fs.mkdirSync(folderPath, { recursive: true });
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
      fs.renameSync(oldPath, newPath);
      return { success: true, path: newPath };
    } catch (err) {
      return { error: err.message };
    }
  });

  // Git
  ipcMain.handle('git:status', async (_event, dirPath) => getGitStatus(dirPath));
  ipcMain.handle('git:log', async (_event, dirPath, count, skip) => getGitLog(dirPath, count, skip));
  ipcMain.handle('git:resolveAvatars', async (_event, authors) => resolveAvatarsBatch(authors));
  ipcMain.handle('git:diff', async (_event, dirPath, filePath) => getGitDiff(dirPath, filePath));

  ipcMain.handle('git:stage', async (_event, dirPath, filePath) => {
    try {
      execSync(`git add "${filePath}"`, { cwd: dirPath, timeout: 5000 });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:unstage', async (_event, dirPath, filePath) => {
    try {
      execSync(`git reset HEAD "${filePath}"`, { cwd: dirPath, timeout: 5000 });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:discard', async (_event, dirPath, filePath) => {
    try {
      // For untracked files, remove them; for tracked files, restore them
      const status = execSync(`git status --porcelain "${filePath}"`, { cwd: dirPath, timeout: 5000 }).toString().trim();
      if (status.startsWith('??')) {
        fs.unlinkSync(path.join(dirPath, filePath));
      } else {
        execSync(`git checkout -- "${filePath}"`, { cwd: dirPath, timeout: 5000 });
      }
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:commit', async (_event, dirPath, message) => {
    try {
      execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: dirPath, timeout: 10000 });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:push', async (_event, dirPath) => {
    try {
      execSync('git push', { cwd: dirPath, timeout: 30000 });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:pull', async (_event, dirPath) => {
    try {
      execSync('git pull', { cwd: dirPath, timeout: 30000 });
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
        const remotes = execSync('git remote', { cwd: dirPath, encoding: 'utf8', timeout: 5000 }).trim();
        hasRemote = remotes.length > 0;
      } catch { /* no remote */ }

      // Step 1: Pull remote changes first (if remote exists)
      if (hasRemote) {
        try {
          execSync('git pull --rebase=false', { cwd: dirPath, encoding: 'utf8', timeout: 30000 });
        } catch (pullErr) {
          // Check if it's a merge conflict
          const status = execSync('git status', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
          if (status.includes('Unmerged') || status.includes('both modified') || status.includes('fix conflicts')) {
            // Abort the merge so we don't leave dirty state
            try { execSync('git merge --abort', { cwd: dirPath, timeout: 5000 }); } catch { /* ignore */ }
            return { error: 'Merge conflicts detected when pulling remote changes. Please resolve conflicts manually before committing.' };
          }
          // If pull failed for other reasons (e.g. no tracking branch), continue with commit+push
        }
      }

      // Step 2: Commit (staging is handled on the renderer side already)
      execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: dirPath, timeout: 10000 });

      // Step 3: Push (if remote exists)
      if (hasRemote) {
        try {
          execSync('git push', { cwd: dirPath, timeout: 30000 });
        } catch (pushErr) {
          // Commit succeeded but push failed — try setting upstream
          try {
            const branch = execSync('git branch --show-current', { cwd: dirPath, encoding: 'utf8', timeout: 5000 }).trim();
            execSync(`git push --set-upstream origin ${branch}`, { cwd: dirPath, timeout: 30000 });
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
      const current = execSync('git branch --show-current', { cwd: dirPath, encoding: 'utf8', timeout: 5000 }).trim();

      // Get local branches with last commit info in one shot
      const localRaw = execSync(
        'git branch --no-color --format="%(refname:short)|||%(objectname:short)|||%(authorname)|||%(committerdate:relative)|||%(subject)"',
        { cwd: dirPath, encoding: 'utf8', timeout: 5000 }
      );
      const localBranches = localRaw.split('\n').filter(Boolean).map(line => {
        const [name, hash, author, date, message] = line.split('|||');
        return { name, current: name === current, remote: false, hash, author, date, message };
      });

      // Get remote branches with last commit info
      let remoteBranches = [];
      try {
        const remoteRaw = execSync(
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
      execSync(`git checkout "${branchName}"`, { cwd: dirPath, encoding: 'utf8', timeout: 10000 });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:createBranch', async (_event, dirPath, branchName, checkout = true) => {
    try {
      if (checkout) {
        execSync(`git checkout -b "${branchName}"`, { cwd: dirPath, encoding: 'utf8', timeout: 10000 });
      } else {
        execSync(`git branch "${branchName}"`, { cwd: dirPath, encoding: 'utf8', timeout: 10000 });
      }
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:deleteBranch', async (_event, dirPath, branchName, force = false) => {
    try {
      const flag = force ? '-D' : '-d';
      execSync(`git branch ${flag} "${branchName}"`, { cwd: dirPath, encoding: 'utf8', timeout: 10000 });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:checkoutRemoteBranch', async (_event, dirPath, remoteBranch) => {
    try {
      const localName = remoteBranch.replace(/^origin\//, '');
      execSync(`git checkout -b "${localName}" "${remoteBranch}"`, { cwd: dirPath, encoding: 'utf8', timeout: 10000 });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:generateCommitMsg', async (_event, dirPath) => {
    try {
      // Get diff — prefer staged, fall back to unstaged
      let diff = '';
      try {
        diff = execSync('git diff --cached --stat', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
      } catch {}
      if (!diff.trim()) {
        try {
          diff = execSync('git diff --stat', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
        } catch {}
      }
      if (!diff.trim()) {
        // Try status for untracked
        diff = execSync('git status --porcelain', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
      }

      // Get the actual diff content for smarter messages
      let fullDiff = '';
      try {
        fullDiff = execSync('git diff --cached', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
        if (!fullDiff.trim()) {
          fullDiff = execSync('git diff', { cwd: dirPath, encoding: 'utf8', timeout: 5000 });
        }
      } catch {}

      // Parse changed files from stat
      const statLines = diff.trim().split('\n').filter(Boolean);
      const files = [];
      const actions = { added: [], modified: [], deleted: [], renamed: [] };

      // Parse from porcelain or stat
      for (const line of statLines) {
        // porcelain format: "XY filename"
        const porcelainMatch = line.match(/^(.{2})\s+(.+)$/);
        if (porcelainMatch) {
          const [, status, filepath] = porcelainMatch;
          const name = path.basename(filepath);
          if (status.includes('?') || status.includes('A')) actions.added.push(name);
          else if (status.includes('D')) actions.deleted.push(name);
          else if (status.includes('R')) actions.renamed.push(name);
          else actions.modified.push(name);
          files.push(name);
          continue;
        }
        // stat format: " filename | 5 ++-"
        const statMatch = line.match(/^\s*(.+?)\s+\|/);
        if (statMatch) {
          const name = path.basename(statMatch[1].trim());
          files.push(name);
          actions.modified.push(name);
        }
      }

      if (files.length === 0) {
        return { message: 'Update files' };
      }

      // Detect patterns from file names and diff content
      const allFiles = files.join(' ').toLowerCase();
      const diffLower = fullDiff.toLowerCase();
      let prefix = 'update';
      let scope = '';

      // Detect type from content
      if (actions.added.length > 0 && actions.modified.length === 0 && actions.deleted.length === 0) {
        prefix = 'add';
      } else if (actions.deleted.length > 0 && actions.added.length === 0 && actions.modified.length === 0) {
        prefix = 'remove';
      } else if (diffLower.includes('fix') || diffLower.includes('bug') || diffLower.includes('error') || diffLower.includes('issue')) {
        prefix = 'fix';
      } else if (allFiles.includes('test') || allFiles.includes('spec')) {
        prefix = 'test';
      } else if (allFiles.includes('readme') || allFiles.includes('.md')) {
        prefix = 'docs';
      } else if (allFiles.includes('.css') || allFiles.includes('.scss') || allFiles.includes('style')) {
        prefix = 'style';
      } else if (allFiles.includes('config') || allFiles.includes('.env') || allFiles.includes('package.json')) {
        prefix = 'chore';
      } else if (diffLower.includes('refactor') || diffLower.includes('rename') || diffLower.includes('reorganize')) {
        prefix = 'refactor';
      }

      // Build description
      if (files.length === 1) {
        scope = files[0];
      } else if (files.length <= 3) {
        scope = files.join(', ');
      } else {
        // Find common directory
        const dirs = new Set();
        for (const line of statLines) {
          const match = line.match(/^\s*(.+?)\s+\|/) || line.match(/^.{2}\s+(.+)$/);
          if (match) {
            const parts = match[1].trim().split('/');
            if (parts.length > 1) dirs.add(parts[parts.length - 2]);
          }
        }
        if (dirs.size === 1) {
          scope = `${[...dirs][0]} (${files.length} files)`;
        } else {
          scope = `${files.length} files`;
        }
      }

      const message = `${prefix}: ${scope}`;
      return { message };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('git:clone', async (_event, url, destPath) => {
    try {
      execSync(`git clone "${url}" "${destPath}"`, { timeout: 60000 });
      return { success: true, path: destPath };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ---- Workspace Search ---- //
  ipcMain.handle('search:files', async (_event, dirPath, query) => {
    if (!dirPath || !query) return [];
    const results = [];
    const lowerQuery = query.toLowerCase();
    function walkDir(dir, depth = 0) {
      if (depth > 6 || results.length >= 50) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (IGNORED.has(entry.name) || entry.name.startsWith('.')) continue;
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(dirPath, fullPath);
          if (entry.isDirectory()) {
            walkDir(fullPath, depth + 1);
          } else {
            if (entry.name.toLowerCase().includes(lowerQuery) || relativePath.toLowerCase().includes(lowerQuery)) {
              results.push({ name: entry.name, path: fullPath, relativePath });
            }
          }
          if (results.length >= 50) return;
        }
      } catch {}
    }
    walkDir(dirPath);
    // Sort: prefer starts-with matches, then by path length
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
    let pattern;
    try {
      let src = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) src = `\\b${src}\\b`;
      pattern = new RegExp(src, caseSensitive ? 'g' : 'gi');
    } catch {
      return [];
    }
    function walkDir(dir, depth = 0) {
      if (depth > 6 || results.length >= 200) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (IGNORED.has(entry.name) || entry.name.startsWith('.')) continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkDir(fullPath, depth + 1);
          } else {
            // Skip binary / large files
            try {
              const stats = fs.statSync(fullPath);
              if (stats.size > 1024 * 1024) continue; // skip > 1MB
            } catch { continue; }
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              const lines = content.split('\n');
              const fileMatches = [];
              for (let i = 0; i < lines.length; i++) {
                pattern.lastIndex = 0;
                if (pattern.test(lines[i])) {
                  fileMatches.push({ line: i + 1, text: lines[i].substring(0, 500) });
                  if (fileMatches.length >= 20) break;
                }
              }
              if (fileMatches.length > 0) {
                results.push({
                  path: fullPath,
                  relativePath: path.relative(dirPath, fullPath),
                  name: path.basename(fullPath),
                  matches: fileMatches,
                });
              }
            } catch {}
          }
          if (results.length >= 200) return;
        }
      } catch {}
    }
    walkDir(dirPath);
    return results;
  });

  ipcMain.handle('search:replaceInFiles', async (_event, dirPath, searchQuery, replaceText, options = {}) => {
    if (!dirPath || !searchQuery) return { success: false, error: 'Missing parameters' };
    const caseSensitive = options.caseSensitive || false;
    const isRegex = options.isRegex || false;
    const wholeWord = options.wholeWord || false;
    const filePaths = options.filePaths || null; // optional: limit to specific files
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
    function processFile(filePath) {
      try {
        const stats = fs.statSync(filePath);
        if (stats.size > 1024 * 1024) return; // skip > 1MB
        const content = fs.readFileSync(filePath, 'utf8');
        pattern.lastIndex = 0;
        if (!pattern.test(content)) return;
        pattern.lastIndex = 0;
        let count = 0;
        const newContent = content.replace(pattern, (match) => { count++; return replaceText; });
        if (count > 0) {
          fs.writeFileSync(filePath, newContent, 'utf8');
          totalReplacements += count;
          filesModified++;
        }
      } catch {}
    }
    if (filePaths && filePaths.length > 0) {
      for (const fp of filePaths) processFile(fp);
    } else {
      function walkDir(dir, depth = 0) {
        if (depth > 6) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (IGNORED.has(entry.name) || entry.name.startsWith('.')) continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) walkDir(fullPath, depth + 1);
            else processFile(fullPath);
          }
        } catch {}
      }
      walkDir(dirPath);
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

  // Shell open
  ipcMain.handle('shell:openExternal', async (_event, url) => {
    shell.openExternal(url);
  });

  // ---- Terminal (PTY) ---- //
  ipcMain.handle('terminal:create', async (event, cwd) => {
    const id = ++ptyIdCounter;

    let shellPath;
    if (process.platform === 'win32') {
      shellPath = 'powershell.exe';
    } else {
      // Use SHELL env var, validate it exists, fallback through options
      const candidates = [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'].filter(Boolean);
      shellPath = candidates.find(s => { try { return fs.statSync(s).isFile(); } catch { return false; } }) || '/bin/sh';
    }

    const effectiveCwd = cwd && fs.existsSync(cwd) ? cwd : os.homedir();

    const ptyProcess = pty.spawn(shellPath, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: effectiveCwd,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    });

    ptyProcesses.set(id, ptyProcess);

    ptyProcess.onData((data) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        win.webContents.send('terminal:data', id, data);
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      ptyProcesses.delete(id);
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        win.webContents.send('terminal:exit', id, exitCode);
      }
    });

    const shellName = path.basename(shellPath);
    return { id, shellName };
  });

  ipcMain.on('terminal:write', (_event, id, data) => {
    const p = ptyProcesses.get(id);
    if (p) p.write(data);
  });

  ipcMain.on('terminal:resize', (_event, id, cols, rows) => {
    const p = ptyProcesses.get(id);
    if (p) {
      try { p.resize(cols, rows); } catch {}
    }
  });

  ipcMain.on('terminal:kill', (_event, id) => {
    const p = ptyProcesses.get(id);
    if (p) {
      p.kill();
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
  function readClaudeKeychainCredentials() {
    if (process.platform !== 'darwin') {
      // TODO: Windows uses credential manager, Linux uses libsecret
      return null;
    }
    try {
      const raw = execSync(
        'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
        { encoding: 'utf8', timeout: 5000 }
      ).trim();
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
   * - source 'subscription': OAuth token from Claude Code subscription (keychain)
   * - source 'api_key': Direct Anthropic API key from settings
   * authHeader is the correct header object to use for the Anthropic API.
   */
  function resolveClaudeCredential() {
    // Priority 1: Claude Code subscription (OAuth from keychain)
    const oauthCreds = readClaudeKeychainCredentials();
    if (oauthCreds?.accessToken) {
      // Check if token is expired (with 60s buffer)
      const isExpired = oauthCreds.expiresAt && (Date.now() > oauthCreds.expiresAt - 60000);
      if (!isExpired) {
        return {
          token: oauthCreds.accessToken,
          source: 'subscription',
          subscriptionType: oauthCreds.subscriptionType,
          authHeader: { 'Authorization': `Bearer ${oauthCreds.accessToken}` },
        };
      }
      // Token expired — fall through to API key
    }

    // Priority 2: Manual API key
    const savedKey = getSetting('claude_api_key');
    if (savedKey) {
      return {
        token: savedKey,
        source: 'api_key',
        subscriptionType: null,
        authHeader: { 'x-api-key': savedKey },
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
    };

    try {
      // Check if Claude Code CLI binary exists
      try {
        execSync('which claude 2>/dev/null || where claude 2>/dev/null', { timeout: 3000, encoding: 'utf8' });
        result.installed = true;
      } catch {
        // Also check ~/.claude directory existence as a signal
        if (fs.existsSync(path.join(os.homedir(), '.claude'))) {
          result.installed = true;
        }
      }

      // Check keychain for OAuth credentials
      const oauthCreds = readClaudeKeychainCredentials();
      if (oauthCreds?.accessToken) {
        result.installed = true;
        result.authenticated = true;
        result.authSource = 'subscription';
        result.subscriptionType = oauthCreds.subscriptionType;
        result.tokenPreview = oauthCreds.accessToken.substring(0, 16) + '...' + oauthCreds.accessToken.slice(-4);
        // Check expiry
        if (oauthCreds.expiresAt && Date.now() > oauthCreds.expiresAt - 60000) {
          result.expired = true;
        }
      }
    } catch { /* ignore */ }

    return result;
  });

  // Get the resolved credential info (for chat panel to know if connected)
  ipcMain.handle('claude:getToken', async () => {
    const cred = resolveClaudeCredential();
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
  const ALIAS_TO_MODEL = {
    'sonnet': 'claude-sonnet-4-6',
    'opus': 'claude-opus-4-6',
    'haiku': 'claude-haiku-4-5-20251001',
  };

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
  function resolveClaudeBinary() {
    const candidates = process.platform === 'win32'
      ? [path.join(process.env.APPDATA || '', 'npm', 'claude.cmd')]
      : [
          path.join(os.homedir(), '.local', 'bin', 'claude'),
          '/opt/homebrew/bin/claude',
          '/usr/local/bin/claude',
          '/usr/bin/claude',
        ];

    for (const p of candidates) {
      try { if (fs.statSync(p).isFile()) return p; } catch { /* continue */ }
    }

    // Fallback: which/where
    try {
      return execSync(
        process.platform === 'win32' ? 'where claude 2>NUL' : 'which claude 2>/dev/null',
        { encoding: 'utf8', timeout: 5000 }
      ).trim().split('\n')[0];
    } catch { return null; }
  }

  /**
   * Stream chat via Claude CLI subprocess (for subscription OAuth).
   * Uses `claude -p` with `--output-format stream-json --verbose --include-partial-messages`.
   * The CLI handles OAuth auth, token refresh, and API routing internally.
   */
  function streamViaCLI(event, messages, model, streamId) {
    const claudeBin = resolveClaudeBinary();
    if (!claudeBin) {
      return Promise.resolve({ error: 'Claude CLI not found. Install Claude Code or add an API key in Settings → Providers.' });
    }

    // Build the prompt: format conversation history + current message
    let prompt;
    if (messages.length === 1) {
      prompt = messages[0].content;
    } else {
      // Multi-turn: format previous messages as context
      const history = messages.slice(0, -1).map(m =>
        `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`
      ).join('\n\n');
      const current = messages[messages.length - 1].content;
      prompt = `Here is our conversation so far:\n\n${history}\n\nHuman: ${current}\n\nPlease respond to my latest message above, taking the conversation history into account.`;
    }

    // The CLI accepts aliases (sonnet, opus, haiku) and auto-resolves to latest.
    // If a full model ID was passed, use it as-is — the CLI handles both.
    const modelAlias = model || 'sonnet';

    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--model', modelAlias,
      '--max-turns', '1',
      '--no-session-persistence',
    ];

    return new Promise((resolve) => {
      // Build clean env — strip Claude Code nesting vars
      const cleanEnv = { ...process.env };
      delete cleanEnv.CLAUDECODE;
      delete cleanEnv.CLAUDE_CODE_ENTRYPOINT;
      delete cleanEnv.CLAUDE_CODE_OAUTH_TOKEN;
      Object.keys(cleanEnv).forEach(k => { if (k.startsWith('CLAUDE_CODE_')) delete cleanEnv[k]; });

      const proc = spawn(claudeBin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: cleanEnv,
      });

      activeStreams.set(streamId, proc);

      let buffer = '';
      const win = BrowserWindow.fromWebContents(event.sender);

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
                if (win && !win.isDestroyed()) {
                  win.webContents.send('claude:stream', streamId, evt);
                }
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
      proc.stderr.on('data', (chunk) => {
        stderrOutput += chunk.toString();
      });

      proc.on('close', (code) => {
        activeStreams.delete(streamId);
        if (win && !win.isDestroyed()) {
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
   */
  function streamViaAPI(event, messages, model, streamId, apiKey) {
    const abortController = new AbortController();
    activeStreams.set(streamId, abortController);

    // Resolve aliases for the Anthropic API (it doesn't accept short aliases)
    const resolvedModel = ALIAS_TO_MODEL[model] || model || 'claude-sonnet-4-6';

    // Enable extended thinking for supported models
    const supportsThinking = /claude-(sonnet|opus)-4/.test(resolvedModel) || /claude-3-7/.test(resolvedModel);
    const requestBody = {
      model: resolvedModel,
      max_tokens: supportsThinking ? 16384 : 8192,
      stream: true,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    };
    if (supportsThinking) {
      requestBody.thinking = { type: 'enabled', budget_tokens: 10000 };
    }
    const postData = JSON.stringify(requestBody);

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey,
        },
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
                if (win && !win.isDestroyed()) {
                  win.webContents.send('claude:stream', streamId, parsed);
                }
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
                  if (win && !win.isDestroyed()) {
                    win.webContents.send('claude:stream', streamId, parsed);
                  }
                } catch { /* skip */ }
              }
            }
          }
          activeStreams.delete(streamId);
          if (win && !win.isDestroyed()) {
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
  ipcMain.handle('claude:chat', async (event, { messages, model, streamId }) => {
    const cred = resolveClaudeCredential();
    if (!cred) {
      return { error: 'No Claude credentials found. Connect your Claude Code subscription or add an API key in Settings → Providers.' };
    }

    if (cred.source === 'subscription') {
      // Subscription OAuth → use Claude CLI subprocess (handles auth internally)
      return streamViaCLI(event, messages, model, streamId);
    } else {
      // API key → direct HTTPS to Anthropic API
      return streamViaAPI(event, messages, model, streamId, cred.token);
    }
  });

  // Stop active stream — handles both CLI process and API AbortController
  ipcMain.handle('claude:stopStream', async (_event, streamId) => {
    const active = activeStreams.get(streamId);
    if (!active) return { success: false };

    if (active.abort) {
      // AbortController (API key path)
      active.abort();
    } else if (active.kill) {
      // Child process (CLI path)
      active.kill('SIGTERM');
    }
    activeStreams.delete(streamId);
    return { success: true };
  });

  // Get/set selected model — stores the alias (sonnet/opus/haiku)
  ipcMain.handle('claude:getModel', async () => {
    return getSetting('claude_model') || 'sonnet';
  });

  ipcMain.handle('claude:setModel', async (_event, model) => {
    setSetting('claude_model', model);
    return { success: true };
  });

  // Fetch real model IDs by querying the CLI — returns resolved model names
  ipcMain.handle('claude:fetchModels', async () => {
    const claudeBin = resolveClaudeBinary();
    if (!claudeBin) return { models: null, error: 'CLI not found' };

    // Query each alias to get the real model ID
    const aliases = ['sonnet', 'opus', 'haiku'];
    const results = [];

    for (const alias of aliases) {
      try {
        const output = execSync(
          `"${claudeBin}" -p "hi" --output-format stream-json --verbose --model ${alias} --max-turns 1 --no-session-persistence 2>/dev/null | head -1`,
          { encoding: 'utf8', timeout: 30000, shell: true }
        ).trim();
        if (output) {
          const data = JSON.parse(output);
          if (data.model) {
            results.push({ alias, resolvedId: data.model });
          }
        }
      } catch { /* skip */ }
    }

    return { models: results };
  });
}

app.on('ready', async () => {
  await initDatabase();
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
  for (const [id, p] of ptyProcesses) {
    try { p.kill(); } catch {}
  }
  ptyProcesses.clear();
  closeDatabase();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
