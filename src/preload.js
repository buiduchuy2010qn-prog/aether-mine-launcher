const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // Config & System
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (partial) => ipcRenderer.invoke('config:save', partial),
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  getOfflineProfile: (username) => ipcRenderer.invoke('profile:offline', username),

  // Dual-Auth: Microsoft Official Login / Refresh / Logout
  loginMicrosoft: () => ipcRenderer.invoke('auth:microsoft-login'),
  refreshMicrosoft: () => ipcRenderer.invoke('auth:microsoft-refresh'),
  logoutMicrosoft: () => ipcRenderer.invoke('auth:microsoft-logout'),

  // Versions & Java
  getVersions: () => ipcRenderer.invoke('versions:list'),
  installJava: (majorVersion) => ipcRenderer.invoke('java:install', majorVersion),
  pickGameDir: () => ipcRenderer.invoke('dialog:pick-folder'),
  pickJavaExe: () => ipcRenderer.invoke('dialog:pick-java'),

  // Game Launch
  launchGame: (launchParams) => ipcRenderer.invoke('game:launch', launchParams),
  stopGame: () => ipcRenderer.invoke('game:stop'),

  // Local Mods & Folders
  listLocalMods: () => ipcRenderer.invoke('mods:list-local'),
  toggleLocalMod: (fileName) => ipcRenderer.invoke('mods:toggle-local', fileName),
  deleteLocalMod: (fileName) => ipcRenderer.invoke('mods:delete-local', fileName),
  openFolder: (subFolder) => ipcRenderer.invoke('folder:open', subFolder),

  // Modrinth Store
  searchModrinth: (params) => ipcRenderer.invoke('mods:search-modrinth', params),
  installModrinthMod: (params) => ipcRenderer.invoke('mods:install-modrinth', params),

  // Event listeners from Main Process
  onStatus: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('game:status', listener);
    return () => ipcRenderer.removeListener('game:status', listener);
  },
  onLog: (callback) => {
    const listener = (_, line) => callback(line);
    ipcRenderer.on('game:log', listener);
    return () => ipcRenderer.removeListener('game:log', listener);
  },
  onGameStarted: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('game:started', listener);
    return () => ipcRenderer.removeListener('game:started', listener);
  },
  onGameClosed: (callback) => {
    const listener = (_, code) => callback(code);
    ipcRenderer.on('game:closed', listener);
    return () => ipcRenderer.removeListener('game:closed', listener);
  }
});
