const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('foundry', {
  platform: process.platform,
  version: '1.0.0',

  // Profile
  getProfile: () => ipcRenderer.invoke('profile:get'),
  createProfile: (data) => ipcRenderer.invoke('profile:create', data),
  updateProfile: (data) => ipcRenderer.invoke('profile:update', data),
  pickPhoto: () => ipcRenderer.invoke('profile:pickPhoto'),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // File system
  openFolder: () => ipcRenderer.invoke('fs:openFolder'),
  readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  createFile: (dirPath, fileName) => ipcRenderer.invoke('fs:createFile', dirPath, fileName),
  createFolder: (dirPath, folderName) => ipcRenderer.invoke('fs:createFolder', dirPath, folderName),
  deleteFile: (filePath) => ipcRenderer.invoke('fs:deleteFile', filePath),
  renameFile: (oldPath, newName) => ipcRenderer.invoke('fs:rename', oldPath, newName),

  // Git
  gitStatus: (dirPath) => ipcRenderer.invoke('git:status', dirPath),
  gitLog: (dirPath, count) => ipcRenderer.invoke('git:log', dirPath, count),
  gitDiff: (dirPath, filePath) => ipcRenderer.invoke('git:diff', dirPath, filePath),
  gitStage: (dirPath, filePath) => ipcRenderer.invoke('git:stage', dirPath, filePath),
  gitUnstage: (dirPath, filePath) => ipcRenderer.invoke('git:unstage', dirPath, filePath),
  gitCommit: (dirPath, message) => ipcRenderer.invoke('git:commit', dirPath, message),
  gitPush: (dirPath) => ipcRenderer.invoke('git:push', dirPath),
  gitPull: (dirPath) => ipcRenderer.invoke('git:pull', dirPath),
  gitClone: (url, destPath) => ipcRenderer.invoke('git:clone', url, destPath),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});
