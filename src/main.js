const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');
const {
  fetchVersionManifest,
  fetchLoaderVersions,
  getInstalledVersions,
  searchModrinth,
  installModrinthProject,
  installFpsBoostPack,
  listLocalAddons,
  toggleLocalAddon,
  deleteLocalAddon,
  listLocalWorlds,
  saveCustomLocalSkin,
  launchMinecraft,
  forceKillMinecraft,
  cleanupJavaTempAndTrimRam,
  getDefaultGameDir,
  detectJavaPath
} = require('./launcher-engine');
const {
  loginWithMicrosoftModal,
  authenticateMicrosoftFromRefreshToken,
  generateOfflineUUID,
  registerCloudAccount,
  loginCloudAccount,
  changeCloudUsername,
  syncCloudCosmetics,
  changeCloudPassword,
  requestPasswordResetOtp,
  resetCloudPassword,
  loginCloudViaBrowser
} = require('./microsoft-auth');

app.commandLine.appendSwitch('js-flags', '--expose-gc');
// Background throttling enabled for 0% idle CPU/GPU

let mainWindow;
let hideOnLaunchSetting = true;
const configPath = path.join(app.getPath('userData'), 'aether-config-v5.json');

function fetchBinaryBuffer(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'AetherCraft-Launcher/8.0' }, timeout: 6500 },
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

async function ensureAppIconSyncedAndApplied() {
  try {
    const uiDir = path.join(__dirname, 'ui');
    const icoPath = path.join(uiDir, 'app-icon.ico');
    const pngPath = path.join(uiDir, 'app-logo.png');
    const baseRaw = 'https://raw.githubusercontent.com/buiduchuy2010qn-prog/aether-mine-launcher/main/src/ui';
    if (!fs.existsSync(icoPath)) {
      const buf = await fetchBinaryBuffer(`${baseRaw}/app-icon.ico?t=${Date.now()}`);
      fs.writeFileSync(icoPath, buf);
    }
    if (!fs.existsSync(pngPath)) {
      const buf = await fetchBinaryBuffer(`${baseRaw}/app-logo.png?t=${Date.now()}`);
      fs.writeFileSync(pngPath, buf);
    }
    if (mainWindow && !mainWindow.isDestroyed() && fs.existsSync(icoPath)) {
      mainWindow.setIcon(icoPath);
    }
    if (process.platform === 'win32' && fs.existsSync(icoPath)) {
      const { exec } = require('child_process');
      const psUpdateShortcuts = `powershell -NoProfile -WindowStyle Hidden -Command "$ws = New-Object -ComObject WScript.Shell; @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')) | ForEach-Object { Get-ChildItem -Path $_ -Filter '*Aether*' -Recurse -File -Include '*.lnk' -ErrorAction SilentlyContinue } | ForEach-Object { try { $s = $ws.CreateShortcut($_.FullName); $s.IconLocation = '${icoPath.replace(/'/g, "''")},0'; $s.Save() } catch {} }"`;
      exec(psUpdateShortcuts, () => {});
    }
  } catch (_) {}
}

function createWindow() {
  const icoPath = path.join(__dirname, 'ui', 'app-icon.ico');
  const pngPath = path.join(__dirname, 'ui', 'app-logo.png');
  const winIcon = fs.existsSync(icoPath) ? icoPath : (fs.existsSync(pngPath) ? pngPath : undefined);

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 1020,
    minHeight: 660,
    frame: false,
    backgroundColor: '#090c14',
    icon: winIcon,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    ensureAppIconSyncedAndApplied();
  });
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
  mainWindow?.destroy();
  app.quit();
  app.exit(0);
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

ipcMain.handle('skin:upload-local', async (_e, gameDir, username) => {
  try {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Chọn file ảnh Skin Minecraft (.png - 64x64 hoặc 64x32)',
      properties: ['openFile'],
      filters: [{ name: 'Minecraft Skin PNG', extensions: ['png'] }]
    });
    if (res.canceled || !res.filePaths?.length) {
      return { ok: false, canceled: true };
    }
    return saveCustomLocalSkin(gameDir, username, res.filePaths[0]);
  } catch (err) {
    return { ok: false, error: err.message };
  }
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

ipcMain.handle('cloud:register', async (_e, params) => {
  try {
    const profile = await registerCloudAccount(params || {});
    return { ok: true, profile };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('cloud:login', async (_e, params) => {
  try {
    const profile = await loginCloudAccount(params || {});
    return { ok: true, profile };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('cloud:browser-login', async (_e, params) => {
  try {
    const profile = await loginCloudViaBrowser({
      parentWindow: mainWindow,
      customDbUrl: params?.customDbUrl
    });
    return { ok: true, profile };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('cloud:change-username', async (_e, params) => {
  try {
    const profile = await changeCloudUsername(params || {});
    return { ok: true, profile };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('cloud:sync-cosmetics', async (_e, params) => {
  try {
    const profile = await syncCloudCosmetics(params || {});
    return { ok: true, profile };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('cloud:reset-password', async (_e, params) => {
  try {
    const profile = await resetCloudPassword(params || {});
    return { ok: true, profile };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('cloud:change-password', async (_e, params) => {
  try {
    const profile = await changeCloudPassword(params || {});
    return { ok: true, profile };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('cloud:request-otp', async (_e, params) => {
  try {
    const res = await requestPasswordResetOtp({
      loginId: params?.loginId,
      parentWindow: mainWindow,
      customDbUrl: params?.customDbUrl
    });
    return res;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('mc:versions', async () => {
  try {
    return { ok: true, data: await fetchVersionManifest() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('mc:installed-versions', async (_e, gameDir) => {
  try {
    return { ok: true, list: getInstalledVersions(gameDir) };
  } catch (err) {
    return { ok: false, list: [] };
  }
});

ipcMain.handle('mc:loaders', async (_e, mcVersion, loaderType) => {
  try {
    return { ok: true, data: await fetchLoaderVersions(mcVersion, loaderType) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('modrinth:search', async (_e, params) => {
  try {
    const hits = await searchModrinth(params || {});
    return { ok: true, hits, totalHits: hits.totalHits || hits.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('modrinth:install', async (_e, params) => {
  try {
    const res = await installModrinthProject(params || {}, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
    return res;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('modrinth:fps-boost', async (_e, params) => {
  try {
    const res = await installFpsBoostPack(params || {}, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
    return res;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('addons:list', async (_e, gameDir, folderType) => {
  return { ok: true, items: listLocalAddons(gameDir, folderType) };
});

ipcMain.handle('addons:toggle', async (_e, gameDir, folderType, fileName) => {
  try {
    return toggleLocalAddon(gameDir, folderType, fileName);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('addons:delete', async (_e, gameDir, folderType, fileName) => {
  try {
    return deleteLocalAddon(gameDir, folderType, fileName);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('worlds:list', async (_e, gameDir) => {
  return { ok: true, worlds: listLocalWorlds(gameDir) };
});

ipcMain.handle('mc:open-dir', async (_e, dirPath) => {
  const target = dirPath || getDefaultGameDir();
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
  shell.openPath(target);
  return target;
});

ipcMain.handle('mc:open-subfolder', async (_e, gameDir, subFolder) => {
  const root = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  const target = subFolder ? path.join(root, subFolder) : root;
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
    try { delete require.cache[require.resolve('./launcher-engine')]; } catch (_) {}
    const freshEngine = require('./launcher-engine');
    hideOnLaunchSetting = config.hideLauncherOnPlay !== false;
    await freshEngine.launchMinecraft(config, {
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
function compareSemver(a, b) {
  const pa = String(a || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function fetchJsonSimple(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'AetherCraft-Updater/11.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return fetchJsonSimple(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function downloadWithProgress(url, destPath, onPct) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'AetherCraft-Updater/11.0' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const nextUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        res.resume();
        return downloadWithProgress(nextUrl, destPath, onPct).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      const file = fs.createWriteStream(destPath);
      res.on('data', (chunk) => {
        received += chunk.length;
        if (total > 0 && onPct) {
          onPct(Math.min(100, Math.round((received / total) * 100)));
        }
      });
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    req.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

ipcMain.handle('updater:check', async () => {
  try {
    const currentVersion = app.getVersion();
    let refBranch = 'main';
    try {
      const commitInfo = await fetchJsonSimple(`https://api.github.com/repos/buiduchuy2010qn-prog/aether-mine-launcher/commits/main?t=${Date.now()}`);
      if (commitInfo?.sha) refBranch = commitInfo.sha;
    } catch (_) {}
    const remotePkg = await fetchJsonSimple(`https://raw.githubusercontent.com/buiduchuy2010qn-prog/aether-mine-launcher/${refBranch}/package.json?t=${Date.now()}`);
    const latestVersion = remotePkg?.version || currentVersion;
    const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;
    const downloadUrl = `https://github.com/buiduchuy2010qn-prog/aether-mine-launcher/releases/download/v7.0.0/AetherCraft-Setup-${latestVersion}.exe`;
    return { ok: true, hasUpdate, currentVersion, latestVersion, downloadUrl, commitSha: refBranch };
  } catch (err) {
    return { ok: false, error: err.message, currentVersion: app.getVersion() };
  }
});

ipcMain.handle('updater:install-now', async (_e, downloadUrl, latestVersion) => {
  try {
    const appRoot = path.resolve(__dirname, '..');
    const isUnpackedApp = path.basename(appRoot).toLowerCase() === 'app' && !appRoot.endsWith('.asar');

    if (isUnpackedApp) {
      let refBranch = 'main';
      try {
        const commitInfo = await fetchJsonSimple(`https://api.github.com/repos/buiduchuy2010qn-prog/aether-mine-launcher/commits/main?t=${Date.now()}`);
        if (commitInfo?.sha) refBranch = commitInfo.sha;
      } catch (_) {}

      const filesToSync = [
        'package.json',
        'src/main.js',
        'src/preload.js',
        'src/launcher-engine.js',
        'src/microsoft-auth.js',
        'src/ui/index.html',
        'src/ui/styles.css',
        'src/ui/renderer.js',
        'src/ui/store-features.js',
        'src/ui/minecraft-logo.png',
        'src/ui/app-logo.png',
        'src/ui/app-icon.ico'
      ];
      const baseRaw = `https://raw.githubusercontent.com/buiduchuy2010qn-prog/aether-mine-launcher/${refBranch}`;
      for (let i = 0; i < filesToSync.length; i++) {
        const rel = filesToSync[i];
        const buf = await fetchBinaryBuffer(`${baseRaw}/${rel}?t=${Date.now()}`);
        const targetFile = path.join(appRoot, rel);
        const dir = path.dirname(targetFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(targetFile, buf);
        mainWindow?.webContents.send('updater:progress', Math.round(((i + 1) / filesToSync.length) * 100));
      }
      setTimeout(() => {
        try {
          const { exec } = require('child_process');
          const exePath = process.execPath;
          exec(`powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 350; Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='\\"${exePath}\\"'}"`);
        } catch (_) {
          app.relaunch();
        }
        setTimeout(() => app.exit(0), 150);
      }, 200);
      return { ok: true };
    }

    // Fallback if running from legacy app.asar
    const tempExe = path.join(os.tmpdir(), `AetherCraft-Setup-${latestVersion || 'latest'}.exe`);
    await downloadWithProgress(downloadUrl, tempExe, (pct) => {
      mainWindow?.webContents.send('updater:progress', pct);
    });
    const currentExe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    const installDir = path.dirname(currentExe);
    const batPath = path.join(os.tmpdir(), 'aether-auto-update.bat');
    const batContent = [
      '@echo off',
      'timeout /t 1 /nobreak >nul',
      `start "" /wait "${tempExe}" /S /D=${installDir}`,
      `if exist "${currentExe}" start "" "${currentExe}"`,
      'del "%~f0"'
    ].join('\r\n');
    fs.writeFileSync(batPath, batContent, 'utf8');
    const { spawn } = require('child_process');
    const child = spawn('cmd.exe', ['/c', batPath], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    setTimeout(() => app.exit(0), 350);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('server:ping', async (_e, serverIp) => {
  try {
    const cleanIp = String(serverIp || '').trim();
    if (!cleanIp) return { ok: false };
    const data = await fetchJsonSimple(`https://api.mcsrvstat.us/2/${encodeURIComponent(cleanIp)}`);
    return {
      ok: true,
      online: Boolean(data?.online),
      playersOnline: data?.players?.online ?? 0,
      playersMax: data?.players?.max ?? 0,
      version: data?.version || '',
      icon: data?.icon || null
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('migrate:scan', async (_e, gameDir) => {
  try {
    try { delete require.cache[require.resolve('./launcher-engine')]; } catch (_) {}
    const freshEngine = require('./launcher-engine');
    const items = freshEngine.scanExternalLaunchers(gameDir);
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err.message, items: [] };
  }
});

ipcMain.handle('migrate:import', async (_e, params) => {
  try {
    try { delete require.cache[require.resolve('./launcher-engine')]; } catch (_) {}
    const freshEngine = require('./launcher-engine');
    const res = freshEngine.importFromExternalLauncher(params || {}, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
    return res;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('migrate:pick-dir', async () => {
  try {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Chọn thư mục .minecraft hoặc Profile/Instance của Launcher cũ',
      properties: ['openDirectory']
    });
    if (res.canceled || !res.filePaths?.length) {
      return { ok: false, canceled: true };
    }
    return { ok: true, dirPath: res.filePaths[0] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
