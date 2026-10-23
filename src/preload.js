const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aetherAPI', {
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),

  getSystemInfo: () => ipcRenderer.invoke('sys:info'),
  getVersions: () => ipcRenderer.invoke('mc:versions'),
  getLoaders: (mcVersion, loaderType) => ipcRenderer.invoke('mc:loaders', mcVersion, loaderType),
  launchGame: (config) => ipcRenderer.invoke('mc:launch', config),
  openGameDir: (customPath) => ipcRenderer.invoke('mc:open-dir', customPath),
  openExternal: (url) => ipcRenderer.invoke('sys:open-external', url),
  saveConfig: (cfg) => ipcRenderer.invoke('cfg:save', cfg),
  getConfig: () => ipcRenderer.invoke('cfg:load'),

  // Auth & Skin APIs
  loginMicrosoft: () => ipcRenderer.invoke('auth:ms-login'),
  refreshMicrosoft: (refreshToken) => ipcRenderer.invoke('auth:ms-refresh', refreshToken),
  getCrackUuid: (username) => ipcRenderer.invoke('auth:crack-uuid', username),
  fetchSkinBase64: (username) => ipcRenderer.invoke('skin:fetch-base64', username),

  onProgress: (cb) => ipcRenderer.on('mc:progress', (_e, data) => cb(data)),
  onLog: (cb) => ipcRenderer.on('mc:log', (_e, line) => cb(line)),
  onStatus: (cb) => ipcRenderer.on('mc:status', (_e, status) => cb(status)),
  onClose: (cb) => ipcRenderer.on('mc:close', (_e, code) => cb(code))
});
