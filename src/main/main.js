const { app, BrowserWindow, Menu, nativeImage, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, exec } = require('child_process');
const pty = require('node-pty');
const { initDatabase, getProfile, createProfile, updateProfile, saveProfilePhoto, loadProfilePhoto, getSetting, setSetting, getWorkspaces, addWorkspace, removeWorkspace, touchWorkspace, closeDatabase } = require('./database');

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

function getGitLog(dirPath, count = 20) {
  try {
    const result = execSync(
      `git log --all --pretty=format:"%H|||%h|||%s|||%an|||%ar|||%P|||%D" -${count}`,
      { cwd: dirPath, encoding: 'utf8', timeout: 5000 }
    );
    return result.split('\n').filter(Boolean).map(line => {
      const [hash, short, message, author, date, parents, refs] = line.split('|||');
      return { hash, short, message, author, date, parents: parents ? parents.split(' ') : [], refs: refs || '' };
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
  ipcMain.handle('git:log', async (_event, dirPath, count) => getGitLog(dirPath, count));
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
}

app.on('ready', async () => {
  await initDatabase();
  registerIPC();
  buildAppMenu();
  createWindow();

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
