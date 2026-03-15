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

  // GitHub
  validateGithubToken: (token) => ipcRenderer.invoke('github:validateToken', token),
  listGithubRepos: (token, page, perPage) => ipcRenderer.invoke('github:listRepos', token, page, perPage),
  cloneGithubRepo: (token, cloneUrl, repoName) => ipcRenderer.invoke('github:cloneRepo', token, cloneUrl, repoName),

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
  gitDiscard: (dirPath, filePath) => ipcRenderer.invoke('git:discard', dirPath, filePath),
  gitCommit: (dirPath, message) => ipcRenderer.invoke('git:commit', dirPath, message),
  gitPush: (dirPath) => ipcRenderer.invoke('git:push', dirPath),
  gitPull: (dirPath) => ipcRenderer.invoke('git:pull', dirPath),
  gitCommitAndSync: (dirPath, message) => ipcRenderer.invoke('git:commitAndSync', dirPath, message),
  gitClone: (url, destPath) => ipcRenderer.invoke('git:clone', url, destPath),
  gitListBranches: (dirPath) => ipcRenderer.invoke('git:listBranches', dirPath),
  gitCheckout: (dirPath, branchName) => ipcRenderer.invoke('git:checkout', dirPath, branchName),
  gitCreateBranch: (dirPath, branchName, checkout) => ipcRenderer.invoke('git:createBranch', dirPath, branchName, checkout),
  gitDeleteBranch: (dirPath, branchName, force) => ipcRenderer.invoke('git:deleteBranch', dirPath, branchName, force),
  gitCheckoutRemoteBranch: (dirPath, remoteBranch) => ipcRenderer.invoke('git:checkoutRemoteBranch', dirPath, remoteBranch),
  gitGenerateCommitMsg: (dirPath) => ipcRenderer.invoke('git:generateCommitMsg', dirPath),

  // Search
  searchFiles: (dirPath, query) => ipcRenderer.invoke('search:files', dirPath, query),
  searchInFiles: (dirPath, query, options) => ipcRenderer.invoke('search:inFiles', dirPath, query, options),
  replaceInFiles: (dirPath, searchQuery, replaceText, options) => ipcRenderer.invoke('search:replaceInFiles', dirPath, searchQuery, replaceText, options),

  // Workspaces
  getWorkspaces: () => ipcRenderer.invoke('workspaces:list'),
  addWorkspace: (name, path) => ipcRenderer.invoke('workspaces:add', name, path),
  removeWorkspace: (path) => ipcRenderer.invoke('workspaces:remove', path),
  touchWorkspace: (path) => ipcRenderer.invoke('workspaces:touch', path),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Terminal
  terminalCreate: (cwd) => ipcRenderer.invoke('terminal:create', cwd),
  terminalWrite: (id, data) => ipcRenderer.send('terminal:write', id, data),
  terminalResize: (id, cols, rows) => ipcRenderer.send('terminal:resize', id, cols, rows),
  terminalKill: (id) => ipcRenderer.send('terminal:kill', id),
  onTerminalData: (callback) => {
    const handler = (_event, id, data) => callback(id, data);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },
  onTerminalExit: (callback) => {
    const handler = (_event, id, exitCode) => callback(id, exitCode);
    ipcRenderer.on('terminal:exit', handler);
    return () => ipcRenderer.removeListener('terminal:exit', handler);
  },

  // Window
  newWindow: (projectPath) => ipcRenderer.invoke('window:new', projectPath),
  getWindowState: () => ipcRenderer.invoke('window:isFullScreen'),
  onWindowStateChange: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('window:state-changed', handler);
    return () => ipcRenderer.removeListener('window:state-changed', handler);
  },
  // Keep legacy for backward compat
  isFullScreen: () => ipcRenderer.invoke('window:isFullScreen').then(s => s.isFullScreen || s.isMaximized),
  onFullscreenChange: (callback) => {
    const handler = (_event, state) => callback(state.isFullScreen || state.isMaximized);
    ipcRenderer.on('window:state-changed', handler);
    return () => ipcRenderer.removeListener('window:state-changed', handler);
  },

  // Claude Provider
  claudeDetectAuth: () => ipcRenderer.invoke('claude:detectAuth'),
  claudeGetToken: () => ipcRenderer.invoke('claude:getToken'),
  claudeSaveApiKey: (apiKey) => ipcRenderer.invoke('claude:saveApiKey', apiKey),
  claudeGetApiKey: () => ipcRenderer.invoke('claude:getApiKey'),
  claudeValidateKey: (apiKey) => ipcRenderer.invoke('claude:validateKey', apiKey),
  claudeChat: (params) => ipcRenderer.invoke('claude:chat', params),
  claudeStopStream: (streamId) => ipcRenderer.invoke('claude:stopStream', streamId),
  claudeGetModel: () => ipcRenderer.invoke('claude:getModel'),
  claudeSetModel: (model) => ipcRenderer.invoke('claude:setModel', model),
  claudeFetchModels: () => ipcRenderer.invoke('claude:fetchModels'),
  onClaudeStream: (callback) => {
    const handler = (_event, streamId, data) => callback(streamId, data);
    ipcRenderer.on('claude:stream', handler);
    return () => ipcRenderer.removeListener('claude:stream', handler);
  },
  onClaudeStreamEnd: (callback) => {
    const handler = (_event, streamId) => callback(streamId);
    ipcRenderer.on('claude:streamEnd', handler);
    return () => ipcRenderer.removeListener('claude:streamEnd', handler);
  },
  onClaudeStreamError: (callback) => {
    const handler = (_event, streamId, error) => callback(streamId, error);
    ipcRenderer.on('claude:streamError', handler);
    return () => ipcRenderer.removeListener('claude:streamError', handler);
  },
});
