const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aetherAPI', {
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),

  getSystemInfo: () => ipcRenderer.invoke('sys:info'),
  getVersions: () => ipcRenderer.invoke('mc:versions'),
  getInstalledVersions: (gameDir) => ipcRenderer.invoke('mc:installed-versions', gameDir),
  getLoaders: (mcVersion, loaderType) => ipcRenderer.invoke('mc:loaders', mcVersion, loaderType),
  launchGame: (config) => ipcRenderer.invoke('mc:launch', config),
  forceKillGame: () => ipcRenderer.invoke('mc:force-kill'),
  trimRamNow: () => ipcRenderer.invoke('sys:trim-ram'),
  openGameDir: (customPath) => ipcRenderer.invoke('mc:open-dir', customPath),
  openSubFolder: (gameDir, subFolder) => ipcRenderer.invoke('mc:open-subfolder', gameDir, subFolder),
  openExternal: (url) => ipcRenderer.invoke('sys:open-external', url),
  saveConfig: (cfg) => ipcRenderer.invoke('cfg:save', cfg),
  getConfig: () => ipcRenderer.invoke('cfg:load'),

  loginMicrosoft: () => ipcRenderer.invoke('auth:ms-login'),
  refreshMicrosoft: (refreshToken) => ipcRenderer.invoke('auth:ms-refresh', refreshToken),
  getCrackUuid: (username) => ipcRenderer.invoke('auth:crack-uuid', username),
  cloudRegister: (params) => ipcRenderer.invoke('cloud:register', params),
  cloudLogin: (params) => ipcRenderer.invoke('cloud:login', params),
  cloudBrowserLogin: (params) => ipcRenderer.invoke('cloud:browser-login', params),
  cloudChangeUsername: (params) => ipcRenderer.invoke('cloud:change-username', params),
  cloudSyncCosmetics: (params) => ipcRenderer.invoke('cloud:sync-cosmetics', params),
  fetchSkinBase64: (username) => ipcRenderer.invoke('skin:fetch-base64', username),
  uploadLocalSkin: (gameDir, username) => ipcRenderer.invoke('skin:upload-local', gameDir, username),

  searchModrinth: (params) => ipcRenderer.invoke('modrinth:search', params),
  installModrinth: (params) => ipcRenderer.invoke('modrinth:install', params),
  installFpsBoostPack: (params) => ipcRenderer.invoke('modrinth:fps-boost', params),
  listLocalAddons: (gameDir, folderType) => ipcRenderer.invoke('addons:list', gameDir, folderType),
  toggleLocalAddon: (gameDir, folderType, fileName) => ipcRenderer.invoke('addons:toggle', gameDir, folderType, fileName),
  deleteLocalAddon: (gameDir, folderType, fileName) => ipcRenderer.invoke('addons:delete', gameDir, folderType, fileName),
  listLocalWorlds: (gameDir) => ipcRenderer.invoke('worlds:list', gameDir),
  pingServer: (ip) => ipcRenderer.invoke('server:ping', ip),
  scanExternalLaunchers: (gameDir) => ipcRenderer.invoke('migrate:scan', gameDir),
  importExternalLauncher: (params) => ipcRenderer.invoke('migrate:import', params),
  pickCustomLauncherDir: () => ipcRenderer.invoke('migrate:pick-dir'),

  checkForUpdate: () => ipcRenderer.invoke('updater:check'),
  installUpdateNow: (downloadUrl, latestVersion) => ipcRenderer.invoke('updater:install-now', downloadUrl, latestVersion),
  onUpdateProgress: (cb) => ipcRenderer.on('updater:progress', (_e, pct) => cb(pct)),

  onProgress: (cb) => ipcRenderer.on('mc:progress', (_e, data) => cb(data)),
  onLog: (cb) => ipcRenderer.on('mc:log', (_e, line) => cb(line)),
  onStatus: (cb) => ipcRenderer.on('mc:status', (_e, status) => cb(status)),
  onGameReady: (cb) => ipcRenderer.on('mc:game-ready', (_e, data) => cb(data)),
  onClose: (cb) => ipcRenderer.on('mc:close', (_e, code) => cb(code))
});