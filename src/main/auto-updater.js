/**
 * Foundry — Custom Auto-Updater
 *
 * Polls GitHub Releases API, downloads updates, verifies SHA256 hashes,
 * and installs per-platform. No electron-updater or code-signing required.
 *
 * IPC handlers are ALWAYS registered (dev + prod) so the Settings UI works.
 * Auto-polling only runs in production (app.isPackaged).
 */

const { app, ipcMain, BrowserWindow } = require('electron');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

// ── Config ──────────────────────────────────────────────────
const UPDATE_CONFIG = {
  owner: 'JJMcGil1',
  repo: 'Foundry',
  checkInterval: 5 * 60 * 1000,   // 5 minutes
  autoCheck: true,
  startupDelay: 5000,              // 5 seconds after app ready
  downloadTimeout: 300000,          // 5 minutes
  apiTimeout: 30000,                // 30 seconds
};

// ── State ───────────────────────────────────────────────────
let checkTimer = null;
let currentUpdateInfo = null;
let downloadedFilePath = null;
let isDownloading = false;
let ipcRegistered = false;

// ── Public API ──────────────────────────────────────────────

function initAutoUpdater() {
  // ALWAYS register IPC so Settings → About → "Check for updates" works in dev too
  if (!ipcRegistered) {
    registerIPC();
    ipcRegistered = true;
  }

  // Only auto-poll in production
  if (!app.isPackaged) {
    console.log('[updater] Dev mode — IPC registered, auto-poll disabled');
    return;
  }

  if (UPDATE_CONFIG.autoCheck) {
    setTimeout(() => checkForUpdates(), UPDATE_CONFIG.startupDelay);
    checkTimer = setInterval(() => checkForUpdates(), UPDATE_CONFIG.checkInterval);
  }

  console.log('[updater] Initialized — polling every', UPDATE_CONFIG.checkInterval / 1000, 's');
}

function destroyAutoUpdater() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}

// ── IPC Handlers ────────────────────────────────────────────

function registerIPC() {
  ipcMain.handle('updater:check', async () => {
    return checkForUpdates();
  });

  ipcMain.handle('updater:download', async () => {
    if (!currentUpdateInfo) return { error: 'No update available' };
    return downloadUpdate(currentUpdateInfo);
  });

  ipcMain.handle('updater:install', async () => {
    if (!downloadedFilePath) return { error: 'No update downloaded' };
    return installUpdate(downloadedFilePath);
  });

  ipcMain.handle('updater:getVersion', async () => {
    return app.getVersion();
  });

  ipcMain.handle('updater:dismiss', async () => {
    currentUpdateInfo = null;
    return { success: true };
  });
}

// ── Check for Updates ───────────────────────────────────────

async function checkForUpdates() {
  try {
    console.log('[updater] Checking for updates...');
    const release = await fetchGitHubRelease();
    if (!release) {
      console.log('[updater] No releases found');
      return { update: false };
    }

    const asset = getPlatformAsset(release.assets);
    if (!asset) {
      console.log('[updater] No asset found for', process.platform, os.arch());
      return { update: false };
    }

    const latestJson = await fetchLatestJson(release.assets);
    const remoteVersion = release.tag_name.replace(/^v/, '');
    const localVersion = app.getVersion();

    console.log('[updater] Local:', localVersion, '| Remote:', remoteVersion);

    if (!isNewerVersion(remoteVersion, localVersion)) {
      console.log('[updater] Up to date');
      return { update: false, version: localVersion };
    }

    console.log('[updater] Update available:', localVersion, '->', remoteVersion);

    currentUpdateInfo = {
      version: remoteVersion,
      releaseDate: release.published_at,
      releaseNotes: release.body || 'Bug fixes and improvements.',
      downloadUrl: asset.browser_download_url,
      fileName: asset.name,
      fileSize: asset.size,
      sha256: latestJson?.platforms?.[getPlatformKey()]?.sha256 || null,
    };

    // Send to ALL open windows
    broadcastToRenderers('update:available', currentUpdateInfo);
    return { update: true, ...currentUpdateInfo };
  } catch (err) {
    console.error('[updater] Check failed:', err.message);
    return { update: false, error: err.message };
  }
}

// ── Download Update ─────────────────────────────────────────

async function downloadUpdate(updateInfo) {
  if (isDownloading) return { error: 'Download already in progress' };
  isDownloading = true;

  try {
    const tmpDir = path.join(os.tmpdir(), 'foundry-update');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const destPath = path.join(tmpDir, updateInfo.fileName);

    // Clean up previous download
    if (fs.existsSync(destPath)) {
      try { fs.unlinkSync(destPath); } catch {}
    }

    await downloadFile(updateInfo.downloadUrl, destPath, (progress) => {
      broadcastToRenderers('update:download-progress', progress);
    });

    // Hash verification
    if (updateInfo.sha256) {
      const fileHash = await calculateFileHash(destPath);
      if (fileHash !== updateInfo.sha256) {
        fs.unlinkSync(destPath);
        const err = 'Hash mismatch — download may be corrupted';
        broadcastToRenderers('update:error', { message: err });
        isDownloading = false;
        return { error: err };
      }
      console.log('[updater] Hash verified:', fileHash);
    } else {
      console.log('[updater] No hash in latest.json — skipping verification');
    }

    downloadedFilePath = destPath;
    isDownloading = false;
    broadcastToRenderers('update:downloaded', { filePath: destPath });
    return { success: true, filePath: destPath };
  } catch (err) {
    isDownloading = false;
    console.error('[updater] Download failed:', err.message);
    broadcastToRenderers('update:error', { message: err.message });
    return { error: err.message };
  }
}

// ── Install Update ──────────────────────────────────────────

async function installUpdate(filePath) {
  if (!fs.existsSync(filePath)) {
    return { error: 'Downloaded file not found' };
  }

  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      return installMacOS(filePath);
    } else if (platform === 'win32') {
      return installWindows(filePath);
    } else if (platform === 'linux') {
      return installLinux(filePath);
    } else {
      return { error: `Unsupported platform: ${platform}` };
    }
  } catch (err) {
    console.error('[updater] Install failed:', err.message);
    broadcastToRenderers('update:error', { message: err.message });
    return { error: err.message };
  }
}

// ── macOS Install (.dmg) ────────────────────────────────────

function installMacOS(dmgPath) {
  const mountPoint = '/Volumes/Foundry-Update';
  const appPath = app.getPath('exe').replace(/\/Contents\/MacOS\/.*$/, '');

  // Unmount any stale mount
  try { execSync(`hdiutil detach "${mountPoint}" -force 2>/dev/null`); } catch {}

  const script = `#!/bin/bash
set -e

# Wait for Foundry to quit
for i in $(seq 1 60); do
  if ! pgrep -f "Foundry" > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
sleep 1

# Mount DMG
hdiutil attach "${dmgPath}" -mountpoint "${mountPoint}" -nobrowse -noautoopen -quiet

# Find .app in mounted volume
APP_SRC=$(find "${mountPoint}" -maxdepth 1 -name "*.app" -type d | head -1)
if [ -z "$APP_SRC" ]; then
  echo "No .app found in DMG"
  hdiutil detach "${mountPoint}" -force 2>/dev/null || true
  exit 1
fi

# Replace the app
rm -rf "${appPath}"
cp -R "$APP_SRC" "${appPath}"

# Cleanup
hdiutil detach "${mountPoint}" -force 2>/dev/null || true
rm -f "${dmgPath}"

# Relaunch
open "${appPath}"
`;

  const scriptPath = path.join(os.tmpdir(), 'foundry-update.sh');
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });

  const child = spawn('bash', [scriptPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  setTimeout(() => app.quit(), 500);
  return { success: true };
}

// ── Windows Install (.exe / NSIS) ───────────────────────────

function installWindows(exePath) {
  spawn(exePath, ['/S'], {
    detached: true,
    stdio: 'ignore',
  }).unref();

  setTimeout(() => app.quit(), 1000);
  return { success: true };
}

// ── Linux Install (.AppImage) ───────────────────────────────

function installLinux(appImagePath) {
  const currentPath = process.env.APPIMAGE;
  if (!currentPath) {
    return { error: 'Not running as AppImage' };
  }

  fs.chmodSync(appImagePath, 0o755);
  fs.copyFileSync(appImagePath, currentPath);

  spawn(currentPath, [], {
    detached: true,
    stdio: 'ignore',
  }).unref();

  setTimeout(() => app.quit(), 1000);
  return { success: true };
}

// ── Helpers ─────────────────────────────────────────────────

function fetchGitHubRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${UPDATE_CONFIG.owner}/${UPDATE_CONFIG.repo}/releases/latest`,
      method: 'GET',
      headers: {
        'User-Agent': `Foundry/${app.getVersion()}`,
        'Accept': 'application/vnd.github.v3+json',
      },
      timeout: UPDATE_CONFIG.apiTimeout,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 404) return resolve(null);
        if (res.statusCode !== 200) return reject(new Error(`GitHub API: ${res.statusCode} — ${body.substring(0, 200)}`));
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('GitHub API timeout')); });
    req.end();
  });
}

function fetchLatestJson(assets) {
  const asset = assets.find(a => a.name === 'latest.json');
  if (!asset) return Promise.resolve(null);

  return new Promise((resolve) => {
    downloadJSON(asset.browser_download_url, (err, data) => {
      if (err) {
        console.warn('[updater] Failed to fetch latest.json:', err.message);
        resolve(null);
      } else {
        resolve(data);
      }
    });
  });
}

function downloadJSON(url, callback) {
  const handler = (res) => {
    // Follow redirects
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      return downloadJSON(res.headers.location, callback);
    }
    if (res.statusCode !== 200) {
      return callback(new Error(`HTTP ${res.statusCode}`));
    }
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      try { callback(null, JSON.parse(body)); }
      catch (e) { callback(e); }
    });
  };

  const mod = url.startsWith('https') ? https : http;
  mod.get(url, { headers: { 'User-Agent': `Foundry/${app.getVersion()}` } }, handler)
    .on('error', (err) => callback(err));
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error('Download timeout')); }
    }, UPDATE_CONFIG.downloadTimeout);

    const done = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (err) reject(err); else resolve();
    };

    const doRequest = (reqUrl) => {
      const mod = reqUrl.startsWith('https') ? https : http;
      mod.get(reqUrl, { headers: { 'User-Agent': `Foundry/${app.getVersion()}` } }, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doRequest(res.headers.location);
        }

        if (res.statusCode !== 200) {
          return done(new Error(`Download failed: HTTP ${res.statusCode}`));
        }

        const total = parseInt(res.headers['content-length'], 10) || 0;
        let transferred = 0;
        const file = fs.createWriteStream(destPath);

        res.on('data', (chunk) => {
          transferred += chunk.length;
          if (total > 0) {
            onProgress({
              percent: Math.round((transferred / total) * 100),
              transferred,
              total,
            });
          }
        });

        res.pipe(file);
        file.on('finish', () => { file.close(); done(); });
        file.on('error', (err) => {
          try { fs.unlinkSync(destPath); } catch {}
          done(err);
        });
      }).on('error', done);
    };

    doRequest(url);
  });
}

function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function getPlatformKey() {
  if (process.platform === 'darwin') return 'mac';
  if (process.platform === 'win32') return 'win';
  return 'linux';
}

function getPlatformAsset(assets) {
  const platform = process.platform;
  const arch = os.arch();

  return assets.find(a => {
    const name = a.name.toLowerCase();
    if (platform === 'darwin') {
      if (!name.endsWith('.dmg')) return false;
      // Prefer arm64 build on Apple Silicon
      if (arch === 'arm64') return name.includes('arm64') || !name.includes('x64');
      return name.includes('x64') || !name.includes('arm64');
    }
    if (platform === 'win32') return name.endsWith('.exe');
    if (platform === 'linux') return name.endsWith('.appimage');
    return false;
  });
}

function isNewerVersion(remote, local) {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
}

/**
 * Send an IPC event to ALL open BrowserWindows.
 * This ensures update notifications reach every window,
 * not just the first one created at startup.
 */
function broadcastToRenderers(channel, data) {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

module.exports = { initAutoUpdater, destroyAutoUpdater };
