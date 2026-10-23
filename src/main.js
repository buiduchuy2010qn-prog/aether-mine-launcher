const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  MinecraftLauncherEngine,
  generateOfflineUUID,
  fetchVersionManifest,
  getInstalledRuntimes,
  ensureJavaRuntime,
  downloadFileWithProgress
} = require('./launcher-engine');
const {
  openMicrosoftLoginPopup,
  authenticateMinecraftChain
} = require('./microsoft-auth');

let mainWindow = null;
const engine = new MinecraftLauncherEngine();

function getDefaultGameDir() {
  return path.join(app.getPath('appData'), '.minecraft');
}

function getConfigPath() {
  return path.join(app.getPath('userData'), 'aether-launcher-v3-config.json');
}

const DEFAULT_CONFIG = {
  theme: 'light', // 'light' (Overworld Daylight) | 'dark' (Nether Night)
  authMode: 'offline', // 'offline' | 'microsoft'
  username: 'Steve',
  savedProfiles: ['Steve', 'Alex', 'Technoblade', 'Dream'],
  customSkinDataUrl: '',
  msAccount: null,
  mcVersion: '1.20.4',
  loader: 'fabric', // 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'legacy-fabric'
  ramMb: Math.min(4096, Math.max(2048, Math.floor((os.totalmem() / 1024 / 1024) * 0.4))),
  gameDir: '',
  customJavaPath: '',
  fpsBoostJvm: true,
  windowWidth: 1280,
  windowHeight: 720,
  fullscreen: false,
  hideLauncherOnPlay: false
};

function loadConfig() {
  const cfgPath = getConfigPath();
  let cfg = { ...DEFAULT_CONFIG, gameDir: getDefaultGameDir() };
  if (fs.existsSync(cfgPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      cfg = { ...cfg, ...saved };
    } catch (_) {}
  }
  if (!cfg.gameDir) {
    cfg.gameDir = getDefaultGameDir();
  }
  return cfg;
}

function saveConfig(partial) {
  const current = loadConfig();
  const updated = { ...current, ...partial };
  if (updated.username && !updated.savedProfiles.includes(updated.username)) {
    updated.savedProfiles = [updated.username, ...updated.savedProfiles].slice(0, 12);
  }
  const cfgPath = getConfigPath();
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(updated, null, 2));
  return updated;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 830,
    minWidth: 1060,
    minHeight: 700,
    frame: false,
    backgroundColor: '#f0f7f4',
    title: 'Aether Craft v3.0 — Minecraft Multi-Core Launcher',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
}

engine.on('status', (data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('game:status', data);
  }
});

engine.on('log', (line) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('game:log', line);
  }
});

engine.on('game-started', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('game:started');
    const cfg = loadConfig();
    if (cfg.hideLauncherOnPlay) {
      mainWindow.minimize();
    }
  }
});

engine.on('game-closed', (code) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('game:closed', code);
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
  }
});

ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('config:get', () => {
  const cfg = loadConfig();
  return {
    ...cfg,
    uuid: generateOfflineUUID(cfg.username)
  };
});

ipcMain.handle('config:save', (_, partial) => {
  const updated = saveConfig(partial);
  return {
    ...updated,
    uuid: generateOfflineUUID(updated.username)
  };
});

ipcMain.handle('profile:offline', (_, username) => {
  const clean = (username || 'Steve').trim() || 'Steve';
  return {
    username: clean,
    uuid: generateOfflineUUID(clean)
  };
});

ipcMain.handle('auth:microsoft-login', async () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:log', '[Microsoft Auth] Đang mở cửa sổ đăng nhập Microsoft OAuth2...');
    }
    const msAccount = await openMicrosoftLoginPopup(mainWindow);
    const updated = saveConfig({
      authMode: 'microsoft',
      msAccount
    });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:log', `[Microsoft Auth] Đăng nhập Bản Quyền thành công! Xin chào ${msAccount.name} (UUID: ${msAccount.uuid})`);
    }
    return {
      ok: true,
      msAccount,
      config: {
        ...updated,
        uuid: generateOfflineUUID(updated.username)
      }
    };
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:log', `[LỖI Microsoft Auth]: ${err.message}`);
    }
    return {
      ok: false,
      error: err.message
    };
  }
});

ipcMain.handle('auth:microsoft-refresh', async () => {
  const cfg = loadConfig();
  if (!cfg.msAccount || !cfg.msAccount.refreshToken) {
    return { ok: false, error: 'Chưa có phiên đăng nhập Microsoft để làm mới.' };
  }
  try {
    const msAccount = await authenticateMinecraftChain({ refreshToken: cfg.msAccount.refreshToken });
    const updated = saveConfig({ msAccount });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:log', `[Microsoft Auth] Đã gia hạn Token bản quyền cho ${msAccount.name}.`);
    }
    return {
      ok: true,
      msAccount,
      config: {
        ...updated,
        uuid: generateOfflineUUID(updated.username)
      }
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('auth:microsoft-logout', () => {
  const updated = saveConfig({
    authMode: 'offline',
    msAccount: null
  });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('game:log', '[Microsoft Auth] Đã đăng xuất tài khoản Microsoft và chuyển về chế độ Offline (Crack).');
  }
  return {
    ...updated,
    uuid: generateOfflineUUID(updated.username)
  };
});

ipcMain.handle('system:info', () => {
  const cfg = loadConfig();
  const totalRamMb = Math.round(os.totalmem() / 1024 / 1024);
  const freeRamMb = Math.round(os.freemem() / 1024 / 1024);
  const cpus = os.cpus();
  const runtimes = getInstalledRuntimes(cfg.gameDir);
  return {
    totalRamMb,
    freeRamMb,
    cpuModel: cpus[0] ? cpus[0].model : 'Unknown CPU',
    cpuCores: cpus.length,
    arch: process.arch,
    platform: process.platform,
    runtimes
  };
});

ipcMain.handle('versions:list', async () => {
  const cfg = loadConfig();
  const manifest = await fetchVersionManifest(cfg.gameDir);
  const versionsDir = path.join(cfg.gameDir, 'versions');
  const installedSet = new Set();
  if (fs.existsSync(versionsDir)) {
    for (const entry of fs.readdirSync(versionsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (fs.existsSync(path.join(versionsDir, entry.name, `${entry.name}.jar`))) {
          installedSet.add(entry.name);
        }
      }
    }
  }

  const versions = manifest.versions.map(v => ({
    id: v.id,
    type: v.type,
    releaseTime: v.releaseTime,
    installed: installedSet.has(v.id)
  }));

  return {
    latest: manifest.latest,
    versions
  };
});

ipcMain.handle('java:install', async (_, majorVersion) => {
  const cfg = loadConfig();
  const javaPath = await ensureJavaRuntime(Number(majorVersion), cfg.gameDir, (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:status', status);
    }
  });
  return {
    ok: true,
    javaPath,
    runtimes: getInstalledRuntimes(cfg.gameDir)
  };
});

ipcMain.handle('dialog:pick-folder', async () => {
  const cfg = loadConfig();
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn thư mục cài đặt Minecraft (.minecraft)',
    defaultPath: cfg.gameDir,
    properties: ['openDirectory', 'createDirectory']
  });
  if (res.canceled || !res.filePaths.length) return null;
  const updated = saveConfig({ gameDir: res.filePaths[0] });
  return updated.gameDir;
});

ipcMain.handle('dialog:pick-java', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn file thực thi Java (java.exe / javaw.exe)',
    filters: [{ name: 'Java Executable', extensions: ['exe'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return null;
  const updated = saveConfig({ customJavaPath: res.filePaths[0] });
  return updated.customJavaPath;
});

ipcMain.handle('dialog:pick-skin', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn file ảnh Skin Minecraft (.png 64x64)',
    filters: [{ name: 'Minecraft Skin PNG', extensions: ['png'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return null;
  const filePath = res.filePaths[0];
  const buf = fs.readFileSync(filePath);
  const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;

  // Also copy into CustomSkinLoader LocalSkin folder so in-game offline player wears it!
  const cfg = loadConfig();
  const localSkinDir = path.join(cfg.gameDir, 'CustomSkinLoader', 'LocalSkin', 'skins');
  fs.mkdirSync(localSkinDir, { recursive: true });
  fs.copyFileSync(filePath, path.join(localSkinDir, `${cfg.username || 'Steve'}.png`));

  saveConfig({ customSkinDataUrl: dataUrl });
  return dataUrl;
});

ipcMain.handle('game:launch', async (_, overrides = {}) => {
  const cfg = saveConfig(overrides);
  try {
    const result = await engine.launchGame(cfg, (refreshedMsAccount) => {
      saveConfig({ msAccount: refreshedMsAccount });
    });
    return { ok: true, ...result };
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:log', `[LỖI]: ${err.message}`);
      mainWindow.webContents.send('game:status', {
        stage: 'error',
        message: `Lỗi: ${err.message}`,
        percent: 0
      });
    }
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('game:stop', () => {
  return engine.killActiveGame();
});

ipcMain.handle('mods:list-local', () => {
  const cfg = loadConfig();
  const modsDir = path.join(cfg.gameDir, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });
  const files = fs.readdirSync(modsDir, { withFileTypes: true });
  const mods = [];
  for (const f of files) {
    if (!f.isFile()) continue;
    const isEnabled = f.name.endsWith('.jar');
    const isDisabled = f.name.endsWith('.jar.disabled');
    if (!isEnabled && !isDisabled) continue;
    const fullPath = path.join(modsDir, f.name);
    const stat = fs.statSync(fullPath);
    mods.push({
      fileName: f.name,
      displayName: f.name.replace(/\.jar(\.disabled)?$/i, ''),
      enabled: isEnabled,
      sizeKb: Math.round(stat.size / 1024),
      modifiedAt: stat.mtimeMs
    });
  }
  mods.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return mods;
});

ipcMain.handle('mods:toggle-local', (_, fileName) => {
  const cfg = loadConfig();
  const modsDir = path.join(cfg.gameDir, 'mods');
  const oldPath = path.join(modsDir, path.basename(fileName));
  if (!fs.existsSync(oldPath)) throw new Error('Không tìm thấy file mod.');
  let newName;
  if (fileName.endsWith('.jar.disabled')) {
    newName = fileName.replace(/\.jar\.disabled$/i, '.jar');
  } else if (fileName.endsWith('.jar')) {
    newName = `${fileName}.disabled`;
  } else {
    return false;
  }
  fs.renameSync(oldPath, path.join(modsDir, newName));
  return true;
});

ipcMain.handle('mods:delete-local', (_, fileName) => {
  const cfg = loadConfig();
  const modsDir = path.join(cfg.gameDir, 'mods');
  const target = path.join(modsDir, path.basename(fileName));
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
  }
  return true;
});

ipcMain.handle('folder:open', async (_, subFolder = '') => {
  const cfg = loadConfig();
  const target = subFolder ? path.join(cfg.gameDir, subFolder) : cfg.gameDir;
  fs.mkdirSync(target, { recursive: true });
  await shell.openPath(target);
  return target;
});

ipcMain.handle('mods:search-modrinth', async (_, { query = '', mcVersion, loader }) => {
  const cfg = loadConfig();
  const ver = mcVersion || cfg.mcVersion;
  let activeLoader = loader || cfg.loader;
  if (activeLoader === 'vanilla' || activeLoader === 'legacy-fabric') activeLoader = 'fabric';

  const facets = [
    [`versions:${ver}`],
    [`categories:${activeLoader}`],
    ['project_type:mod']
  ];
  const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&limit=16&facets=${encodeURIComponent(JSON.stringify(facets))}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'AetherMineLauncher/3.0' } });
  if (!res.ok) {
    throw new Error(`Lỗi kết nối Modrinth (${res.status})`);
  }
  const data = await res.json();
  return (data.hits || []).map(h => ({
    projectId: h.project_id,
    slug: h.slug,
    title: h.title,
    description: h.description,
    iconUrl: h.icon_url,
    downloads: h.downloads,
    author: h.author
  }));
});

ipcMain.handle('mods:install-modrinth', async (_, { slugOrId, mcVersion, loader }) => {
  const cfg = loadConfig();
  const ver = mcVersion || cfg.mcVersion;
  let activeLoader = loader || cfg.loader;
  if (activeLoader === 'vanilla' || activeLoader === 'legacy-fabric') activeLoader = 'fabric';
  const modsDir = path.join(cfg.gameDir, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });

  const url = `https://api.modrinth.com/v2/project/${encodeURIComponent(slugOrId)}/version?loaders=${encodeURIComponent(JSON.stringify([activeLoader]))}&game_versions=${encodeURIComponent(JSON.stringify([ver]))}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'AetherMineLauncher/3.0' } });
  if (!res.ok) {
    throw new Error(`Không thể tìm bản mod trên Modrinth (${res.status}).`);
  }
  const versions = await res.json();
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error(`Mod "${slugOrId}" chưa có bản tương thích cho ${ver} (${activeLoader.toUpperCase()}).`);
  }

  const bestVersion = versions[0];
  const primaryFile = bestVersion.files.find(f => f.primary) || bestVersion.files[0];
  if (!primaryFile) {
    throw new Error('Không tìm thấy file .jar trong gói Modrinth.');
  }

  const destPath = path.join(modsDir, primaryFile.filename);
  await downloadFileWithProgress(primaryFile.url, destPath, (cur, tot) => {
    const pct = tot ? Math.round((cur / tot) * 100) : 50;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:status', {
        stage: 'mod-download',
        message: `Đang tải Mod ${primaryFile.filename}: ${pct}%`,
        percent: pct
      });
    }
  });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('game:status', {
      stage: 'idle',
      message: `Đã cài đặt ${primaryFile.filename} vào thư mục mods!`,
      percent: 100
    });
    mainWindow.webContents.send('game:log', `[Modrinth] Đã tải mod: ${primaryFile.filename}`);
  }

  return {
    ok: true,
    fileName: primaryFile.filename,
    versionNumber: bestVersion.version_number
  };
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
