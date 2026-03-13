const { app, BrowserWindow, nativeImage, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, exec } = require('child_process');
const pty = require('node-pty');
const { initDatabase, getProfile, createProfile, updateProfile, saveProfilePhoto, loadProfilePhoto, getSetting, setSetting, closeDatabase } = require('./database');

const isDev = !app.isPackaged;

const iconPath = isDev
  ? path.join(__dirname, '..', 'renderer', 'assets', 'icon.png')
  : path.join(process.resourcesPath, 'build', 'icon.png');

let mainWindow = null;

// ---- PTY Terminal Management ---- //
const ptyProcesses = new Map();
let ptyIdCounter = 0;

function createWindow() {
  const icon = nativeImage.createFromPath(iconPath);

  mainWindow = new BrowserWindow({
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

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }
}

// ---- File System Helpers ---- //
const IGNORED = new Set([
  'node_modules', '.git', '.DS_Store', '.next', 'dist', 'build',
  '__pycache__', '.cache', '.vscode', '.idea', 'coverage', '.env',
  'thumbs.db', '.svn', '.hg',
]);

function readDirTree(dirPath, depth = 0, maxDepth = 4) {
  if (depth > maxDepth) return [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result = [];
    // Sort: folders first, then files, alphabetical
    const sorted = entries
      .filter(e => !IGNORED.has(e.name) && !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    for (const entry of sorted) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        result.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
          children: readDirTree(fullPath, depth + 1, maxDepth),
        });
      } else {
        result.push({
          name: entry.name,
          path: fullPath,
          type: 'file',
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
    const files = lines.map(line => ({
      status: line.substring(0, 2).trim(),
      path: line.substring(3),
    }));
    return { branch, files, isRepo: true };
  } catch {
    return { branch: '', files: [], isRepo: false };
  }
}

function getGitLog(dirPath, count = 20) {
  try {
    const result = execSync(
      `git log --oneline --pretty=format:"%H|||%h|||%s|||%an|||%ar" -${count}`,
      { cwd: dirPath, encoding: 'utf8', timeout: 5000 }
    );
    return result.split('\n').filter(Boolean).map(line => {
      const [hash, short, message, author, date] = line.split('|||');
      return { hash, short, message, author, date };
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
  createWindow();
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

if (process.platform === 'darwin') {
  app.whenReady().then(() => {
    const dockIcon = nativeImage.createFromPath(iconPath);
    if (dockIcon && !dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  });
}
