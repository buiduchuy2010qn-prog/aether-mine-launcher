const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');
const {
  fetchVersionManifest,
  fetchLoaderVersions,
  launchMinecraft,
  forceKillMinecraft,
  cleanupJavaTempAndTrimRam,
  getDefaultGameDir,
  detectJavaPath
} = require('./launcher-engine');
const {
  loginWithMicrosoftModal,
  authenticateMicrosoftFromRefreshToken,
  generateOfflineUUID
} = require('./microsoft-auth');

// Reduce Chromium GPU/RAM overhead so Minecraft gets 100% hardware priority
app.commandLine.appendSwitch('js-flags', '--expose-gc');
app.commandLine.appendSwitch('disable-background-timer-throttling');

let mainWindow;
let hideOnLaunchSetting = true;
const configPath = path.join(app.getPath('userData'), 'aether-config-v5.json');

function fetchBinaryBuffer(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'AetherCraft-Launcher/5.0' }, timeout: 6500 },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
          const nextUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          res.resume();
          return resolve(fetchBinaryBuffer(nextUrl, redirects - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1120,
    minHeight: 720,
    frame: false,
    backgroundColor: '#090c14',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  cleanupJavaTempAndTrimRam();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('win:minimize', () => mainWindow?.minimize());
ipcMain.on('win:maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('win:close', () => {
  cleanupJavaTempAndTrimRam();
  mainWindow?.close();
});

ipcMain.handle('sys:info', async () => {
  const totalMemGB = Math.round(os.totalmem() / (1024 ** 3));
  const freeMemGB = Math.round((os.freemem() / (1024 ** 3)) * 10) / 10;
  const cpus = os.cpus();
  return {
    totalMemGB,
    freeMemGB,
    cpuModel: cpus[0]?.model || 'Multi-Core Processor',
    cpuCores: cpus.length,
    defaultGameDir: getDefaultGameDir(),
    detectedJava: detectJavaPath(),
    platform: process.platform
  };
});

ipcMain.handle('sys:trim-ram', async () => {
  if (global.gc) {
    try { global.gc(); } catch (_) {}
  }
  cleanupJavaTempAndTrimRam();
  const freeMemGB = Math.round((os.freemem() / (1024 ** 3)) * 10) / 10;
  return { ok: true, freeMemGB };
});

ipcMain.handle('cfg:load', async () => {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (_) {}
  return null;
});

ipcMain.handle('cfg:save', async (_e, cfg) => {
  try {
    if (typeof cfg?.hideLauncherOnPlay === 'boolean') {
      hideOnLaunchSetting = cfg.hideLauncherOnPlay;
    }
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (_) {
    return false;
  }
});

ipcMain.handle('sys:open-external', async (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    await shell.openExternal(url);
  }
});

ipcMain.handle('skin:fetch-base64', async (_e, username) => {
  const clean = (username || 'Steve').replace(/[^a-zA-Z0-9_]/g, '') || 'Steve';
  const urls = [
    `https://mc-heads.net/skin/${encodeURIComponent(clean)}`,
    `https://minotar.net/skin/${encodeURIComponent(clean)}`
  ];
  for (const url of urls) {
    try {
      const buf = await fetchBinaryBuffer(url);
      if (buf && buf.length > 100 && buf[0] === 0x89 && buf[1] === 0x50) {
        return {
          ok: true,
          dataUrl: `data:image/png;base64,${buf.toString('base64')}`
        };
      }
    } catch (_) {}
  }
  return { ok: false };
});

ipcMain.handle('auth:ms-login', async () => {
  try {
    const profile = await loginWithMicrosoftModal(mainWindow);
    return { ok: true, profile };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('auth:ms-refresh', async (_e, refreshToken) => {
  try {
    const profile = await authenticateMicrosoftFromRefreshToken(refreshToken);
    return { ok: true, profile };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('auth:crack-uuid', async (_e, username) => {
  return generateOfflineUUID(username || 'StevePlayer');
});

ipcMain.handle('mc:versions', async () => {
  try {
    return { ok: true, data: await fetchVersionManifest() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('mc:loaders', async (_e, mcVersion, loaderType) => {
  try {
    return { ok: true, data: await fetchLoaderVersions(mcVersion, loaderType) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('mc:open-dir', async (_e, dirPath) => {
  const target = dirPath || getDefaultGameDir();
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
  shell.openPath(target);
  return target;
});

ipcMain.handle('mc:force-kill', async () => {
  forceKillMinecraft();
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  return { ok: true };
});

ipcMain.handle('mc:launch', async (_e, config) => {
  try {
    hideOnLaunchSetting = config.hideLauncherOnPlay !== false;
    await launchMinecraft(config, {
      onProgress: (p) => mainWindow?.webContents.send('mc:progress', p),
      onLog: (line) => mainWindow?.webContents.send('mc:log', line),
      onStatus: (st) => mainWindow?.webContents.send('mc:status', st),
      onGameWindowReady: () => {
        mainWindow?.webContents.send('mc:game-ready', { hibernated: hideOnLaunchSetting });
        if (hideOnLaunchSetting && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.minimize();
        }
        if (global.gc) {
          try { global.gc(); } catch (_) {}
        }
        cleanupJavaTempAndTrimRam();
      },
      onClose: (code) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
        mainWindow?.webContents.send('mc:close', code);
      }
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});