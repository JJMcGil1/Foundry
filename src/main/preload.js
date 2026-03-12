const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('foundry', {
  platform: process.platform,
  version: require('../../package.json').version,
});
