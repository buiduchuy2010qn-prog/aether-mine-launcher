const { app, BrowserWindow, ipcMain, shell, dialog, nativeImage, clipboard, screen } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const net = require('net');
const https = require('https');
const crypto = require('crypto');
const {
  fetchVersionManifest,
  fetchLoaderVersions,
  getInstalledVersions,
  searchModrinth,
  installModrinthProject,
  installFpsBoostPack,
  installOptifineParityPack,
  installOptifineJarSmart,
  listLocalAddons,
  toggleLocalAddon,
  deleteLocalAddon,
  equipShaderInGame,
  equipResourcePackInGame,
  getEquippedAddonsState,
  listLocalWorlds,
  saveCustomLocalSkin,
  launchMinecraft,
  forceKillMinecraft,
  cleanupJavaTempAndTrimRam,
  getDefaultGameDir,
  detectJavaPath, downloadPortableJava, setCurseForgeApiKey, checkCurseForgeKey, searchPackHub, getPackHubDetails, installPackHub, importPackFromFile, importPackFromUrl, listPackInstances, deletePackInstance, touchPackInstance, resolveManualDownloads, getInstancesRoot, equipPackInstanceIsland, installQuickIslandPack,
  translateTextToVi, getLocalLanIpAddresses, scanLanWorlds, prepareCoopHostMods,
  syncAllLocalModsToVersion, buildCoopModBasket, syncCoopModBasket, analyzeMinecraftCrash,
  backupLocalWorld, autoBackupModifiedWorlds, listWorldBackups, restoreWorldBackup, deleteWorldBackup, exportWorldZip, importWorldZip,
  listLocalScreenshots, deleteLocalScreenshot,
  previewExportTarget, exportTargetAsMrpack, scanMinecraftJunk, cleanMinecraftJunk,
  readGameOptionsAndKeybinds, saveGameOptionsAndKeybinds, autoResolveKeybindConflicts, toggleFullbrightPack,
  checkLocalAddonsUpdates, updateLocalAddons, rollbackLocalAddon,
  searchWorldAndDatapackStore, installStoreWorldOrDatapack, listWorldDatapacks, deleteWorldDatapack,
  installCoopComboPack, computeSmartRamAndJvmAdvice,
  searchOnlineSkins, applyOnlineSkinToWardrobe, installFriendSkinSyncPack,
  getPvpClientModeState, togglePvpClientMode,
  inspectLocalWorldDetails, rescuePatchLocalWorld, getCuratedSeedsVault, createStandaloneQuickWorld,
  getReplayStudioStatus, installReplayStudioPack,
  saveCustomLocalCape, removeCustomLocalCape, getCustomLocalCape
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
  loginCloudViaBrowser,
  upsertCoopRoom,
  getCoopRoom,
  listCoopRooms
} = require('./microsoft-auth');

app.commandLine.appendSwitch('js-flags', '--expose-gc');
try { app.setName('BlockWay Launcher'); } catch (_) {}
if (process.platform === 'win32') {
  try { app.setAppUserModelId('BlockWay.Launcher.Pro.v33'); } catch (_) {}
}
// Background throttling enabled for 0% idle CPU/GPU

// Prevent ugly native Electron crash dialogs on transient socket/network errors
process.on('uncaughtException', (err) => {
  try { console.error('[BlockWay Main uncaughtException]', err?.message || err); } catch (_) {}
});
process.on('unhandledRejection', (reason) => {
  try { console.error('[BlockWay Main unhandledRejection]', reason?.message || reason); } catch (_) {}
});

function getLauncherVersionTitle() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    if (pkg?.version) return `BlockWay Launcher — v${pkg.version} PRO`;
  } catch (_) {}
  return `BlockWay Launcher — v${app.getVersion()} PRO`;
}

let mainWindow;
let hideOnLaunchSetting = true;
const configPath = path.join(app.getPath('userData'), 'aether-config-v5.json');
const playtimePath = path.join(app.getPath('userData'), 'playtime-stats-v1.json');

/* ============================================================================
   v40.3 PRO — PLAYTIME TRACKER & PURE-NODE DISCORD RICH PRESENCE (ZERO DEPS)
   ============================================================================ */
function loadPlaytimeStats() {
  try {
    if (fs.existsSync(playtimePath)) {
      const parsed = JSON.parse(fs.readFileSync(playtimePath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        return {
          totalSeconds: Math.max(0, Number(parsed.totalSeconds) || 0),
          sessionsCount: Math.max(0, Number(parsed.sessionsCount) || 0),
          lastPlayedAt: Number(parsed.lastPlayedAt) || 0,
          byInstance: (parsed.byInstance && typeof parsed.byInstance === 'object') ? parsed.byInstance : {},
          byVersion: (parsed.byVersion && typeof parsed.byVersion === 'object') ? parsed.byVersion : {}
        };
      }
    }
  } catch (_) {}
  return { totalSeconds: 0, sessionsCount: 0, lastPlayedAt: 0, byInstance: {}, byVersion: {} };
}

function recordPlaytimeDelta(deltaSec, { instanceSlug = '', mcVersion = '', isFinal = false } = {}) {
  const stats = loadPlaytimeStats();
  const add = Math.max(0, Math.round(Number(deltaSec) || 0));
  if (add > 0) {
    stats.totalSeconds += add;
    if (instanceSlug) {
      stats.byInstance[instanceSlug] = (Number(stats.byInstance[instanceSlug]) || 0) + add;
    }
    if (mcVersion) {
      stats.byVersion[mcVersion] = (Number(stats.byVersion[mcVersion]) || 0) + add;
    }
    stats.lastPlayedAt = Date.now();
  }
  if (isFinal && add >= 3) {
    stats.sessionsCount += 1;
  }
  try {
    fs.writeFileSync(playtimePath, JSON.stringify(stats, null, 2), 'utf8');
  } catch (_) {}
  return stats;
}

const DISCORD_RPC_CLIENT_ID = '450485984333660181';
const launcherBootEpochSec = Math.floor(Date.now() / 1000);
let discordRpcEnabled = true;
let discordSocket = null;
let discordReady = false;
let discordConnecting = false;
let discordLastTryMs = 0;
let discordDesiredActivity = null;
let activeGamePresenceCtx = null;
let mcGameRunning = false;

try {
  if (fs.existsSync(configPath)) {
    const bootCfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (typeof bootCfg?.discordRpcEnabled === 'boolean') discordRpcEnabled = bootCfg.discordRpcEnabled;
  }
} catch (_) {}

function encodeDiscordIpcFrame(op, payload) {
  const raw = Buffer.from(JSON.stringify(payload), 'utf8');
  const frame = Buffer.alloc(8 + raw.length);
  frame.writeUInt32LE(op, 0);
  frame.writeUInt32LE(raw.length, 4);
  raw.copy(frame, 8);
  return frame;
}

function getDiscordIpcSocketPath(idx) {
  if (process.platform === 'win32') return `\\\\.\\pipe\\discord-ipc-${idx}`;
  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
  return path.join(base, `discord-ipc-${idx}`);
}

function flushDiscordActivity() {
  if (!discordSocket || discordSocket.destroyed || !discordReady) return;
  try {
    const packet = {
      cmd: 'SET_ACTIVITY',
      args: {
        pid: process.pid,
        activity: discordRpcEnabled ? discordDesiredActivity : null
      },
      nonce: `bw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    };
    discordSocket.write(encodeDiscordIpcFrame(1, packet));
  } catch (_) {}
}

function closeDiscordIpc() {
  discordReady = false;
  discordConnecting = false;
  if (discordSocket) {
    try {
      discordSocket.write(encodeDiscordIpcFrame(1, {
        cmd: 'SET_ACTIVITY',
        args: { pid: process.pid, activity: null },
        nonce: `bw-clear-${Date.now()}`
      }));
    } catch (_) {}
    try { discordSocket.destroy(); } catch (_) {}
    discordSocket = null;
  }
}

function connectDiscordIpc(pipeIdx = 0) {
  if (!discordRpcEnabled || discordSocket || (discordConnecting && pipeIdx === 0)) return;
  if (pipeIdx > 9) {
    discordConnecting = false;
    return;
  }
  discordConnecting = true;
  let settled = false;
  const sock = net.createConnection(getDiscordIpcSocketPath(pipeIdx));
  let recvBuf = Buffer.alloc(0);

  sock.once('connect', () => {
    settled = true;
    discordSocket = sock;
    discordConnecting = false;
    try {
      sock.write(encodeDiscordIpcFrame(0, { v: 1, client_id: DISCORD_RPC_CLIENT_ID }));
    } catch (_) {}
  });

  sock.on('data', (chunk) => {
    recvBuf = Buffer.concat([recvBuf, chunk]);
    while (recvBuf.length >= 8) {
      const op = recvBuf.readUInt32LE(0);
      const len = recvBuf.readUInt32LE(4);
      if (len > 1024 * 1024) {
        try { sock.destroy(); } catch (_) {}
        return;
      }
      if (recvBuf.length < 8 + len) break;
      const bodyStr = recvBuf.slice(8, 8 + len).toString('utf8');
      recvBuf = recvBuf.slice(8 + len);
      if (op === 3) {
        try { sock.write(encodeDiscordIpcFrame(4, JSON.parse(bodyStr || '{}'))); } catch (_) {}
      } else if (op === 1) {
        try {
          const msg = JSON.parse(bodyStr);
          if (msg?.cmd === 'DISPATCH' && msg?.evt === 'READY') {
            discordReady = true;
            flushDiscordActivity();
          }
        } catch (_) {}
      } else if (op === 2) {
        try { sock.destroy(); } catch (_) {}
        return;
      }
    }
  });

  sock.on('error', () => {
    if (!settled) {
      settled = true;
      try { sock.destroy(); } catch (_) {}
      connectDiscordIpc(pipeIdx + 1);
    }
  });

  sock.on('close', () => {
    if (discordSocket === sock) {
      discordSocket = null;
      discordReady = false;
    }
    if (!settled) {
      settled = true;
      connectDiscordIpc(pipeIdx + 1);
    }
  });
}

function updateDiscordPresence(activity) {
  discordDesiredActivity = activity;
  if (!discordRpcEnabled) return;
  if (discordSocket && discordReady) {
    flushDiscordActivity();
  } else if (!discordSocket && !discordConnecting && Date.now() - discordLastTryMs > 12000) {
    discordLastTryMs = Date.now();
    connectDiscordIpc(0);
  }
}

function setDiscordLobbyPresence() {
  activeGamePresenceCtx = null;
  updateDiscordPresence({
    details: 'Đang ở sảnh chờ BlockWay Launcher',
    state: `Every World, One Place • v${app.getVersion()} PRO`,
    timestamps: { start: launcherBootEpochSec },
    assets: {
      large_image: 'https://buiduchuy2010qn-prog.github.io/blockway-launcher/app-logo.png',
      large_text: `BlockWay Launcher v${app.getVersion()} PRO`
    },
    buttons: [
      { label: 'Tải BlockWay Launcher', url: 'https://buiduchuy2010qn-prog.github.io/blockway-launcher/' }
    ]
  });
}

function setDiscordPlayingPresence(ctx = {}) {
  activeGamePresenceCtx = { ...ctx, startSec: ctx.startSec || Math.floor(Date.now() / 1000) };
  const mcVer = ctx.mcVersion || '1.21.4';
  const loaderUpper = String(ctx.loaderType || 'vanilla').toUpperCase();
  const detailsText = ctx.packName
    ? `Đang chơi gói: ${String(ctx.packName).slice(0, 90)}`
    : `Đang chơi Minecraft ${mcVer} (${loaderUpper})`;
  let stateText = `MC ${mcVer} • ${loaderUpper}`;
  if (ctx.coopCode) {
    stateText = `Phòng chơi chung: ${ctx.coopCode} • MC ${mcVer}`;
  } else if (ctx.serverIp) {
    stateText = `Máy chủ: ${String(ctx.serverIp).slice(0, 64)} • MC ${mcVer}`;
  } else if (ctx.worldFolderName) {
    stateText = `Thế giới: ${String(ctx.worldFolderName).slice(0, 60)} • MC ${mcVer}`;
  }
  updateDiscordPresence({
    details: detailsText,
    state: stateText,
    timestamps: { start: activeGamePresenceCtx.startSec },
    assets: {
      large_image: 'https://buiduchuy2010qn-prog.github.io/blockway-launcher/app-logo.png',
      large_text: `BlockWay Launcher v${app.getVersion()} PRO`
    },
    buttons: [
      { label: 'Tải BlockWay Launcher', url: 'https://buiduchuy2010qn-prog.github.io/blockway-launcher/' }
    ]
  });
}

// Enforce Single Instance Lock so double-clicking shortcut restores active window instead of spawning duplicate instances
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

function fetchBinaryBuffer(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'BlockWay-Launcher/35.0' }, timeout: 8000 },
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
    const bwIcoPath = path.join(uiDir, 'app-icon-blockway-v322.ico');
    const pngPath = path.join(uiDir, 'app-logo.png');
    const bannerPath = path.join(uiDir, 'app-banner.png');
    const heroBannerPath = path.join(uiDir, 'app-banner-hero.png');
    const baseRaw = 'https://raw.githubusercontent.com/buiduchuy2010qn-prog/blockway-launcher/main/src/ui';
    if (!fs.existsSync(icoPath)) {
      const buf = await fetchBinaryBuffer(`${baseRaw}/app-icon.ico?t=${Date.now()}`);
      fs.writeFileSync(icoPath, buf);
    }
    if (fs.existsSync(icoPath)) {
      try { fs.copyFileSync(icoPath, bwIcoPath); } catch (_) {}
    }
    if (!fs.existsSync(pngPath)) {
      const buf = await fetchBinaryBuffer(`${baseRaw}/app-logo.png?t=${Date.now()}`);
      fs.writeFileSync(pngPath, buf);
    }
    if (!fs.existsSync(bannerPath)) {
      const buf = await fetchBinaryBuffer(`${baseRaw}/app-banner.png?t=${Date.now()}`);
      fs.writeFileSync(bannerPath, buf);
    }
    if (!fs.existsSync(heroBannerPath)) {
      try {
        const buf = await fetchBinaryBuffer(`${baseRaw}/app-banner-hero.png?t=${Date.now()}`);
        fs.writeFileSync(heroBannerPath, buf);
      } catch (_) {}
    }
    const activeIco = fs.existsSync(bwIcoPath) ? bwIcoPath : icoPath;
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const nImg = fs.existsSync(pngPath) ? nativeImage.createFromPath(pngPath) : nativeImage.createFromPath(activeIco);
        if (!nImg.isEmpty()) mainWindow.setIcon(nImg);
        else if (fs.existsSync(activeIco)) mainWindow.setIcon(activeIco);
      } catch (_) {}
      mainWindow.setTitle(getLauncherVersionTitle());
    }
    // v40.8: refresh shortcut icons only once per version (it used to spawn PowerShell on every start-up)
    let iconStampPath = '';
    let iconAlreadySynced = false;
    try {
      iconStampPath = path.join(app.getPath('userData'), 'bw-icon-sync-stamp.txt');
      iconAlreadySynced = fs.existsSync(iconStampPath) && fs.readFileSync(iconStampPath, 'utf8').trim() === app.getVersion();
    } catch (_) {}
    if (process.platform === 'win32' && fs.existsSync(activeIco) && !iconAlreadySynced) {
      const { exec } = require('child_process');
      const exePathEsc = (process.execPath || '').replace(/'/g, "''");
      const icoEsc = activeIco.replace(/'/g, "''");
      const psUpdateShortcuts = `powershell -NoProfile -WindowStyle Hidden -Command "$ws = New-Object -ComObject WScript.Shell; $dt = [Environment]::GetFolderPath('Desktop'); $tb = Join-Path $env:APPDATA 'Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar'; @($dt, [Environment]::GetFolderPath('Programs'), $tb) | Where-Object { Test-Path $_ } | ForEach-Object { Get-ChildItem -Path $_ -Include '*Aether*.lnk','*BlockWay*.lnk' -Recurse -File -ErrorAction SilentlyContinue } | ForEach-Object { try { $s = $ws.CreateShortcut($_.FullName); $s.IconLocation = '${icoEsc},0'; $s.Description = 'BlockWay Launcher'; $s.Save(); if ($_.Name -like '*Aether*') { $newName = Join-Path $_.DirectoryName 'BlockWay Launcher.lnk'; if (-not (Test-Path $newName)) { Rename-Item -Path $_.FullName -NewName 'BlockWay Launcher.lnk' -ErrorAction SilentlyContinue } } } catch {} }; try { $bw = Join-Path $dt 'BlockWay Launcher.lnk'; $s2 = $ws.CreateShortcut($bw); $s2.TargetPath = '${exePathEsc}'; $s2.IconLocation = '${icoEsc},0'; $s2.Description = 'BlockWay Launcher'; $s2.Save() } catch {}"`;
      exec(psUpdateShortcuts, (err) => {
        if (!err && iconStampPath) {
          try { fs.writeFileSync(iconStampPath, app.getVersion(), 'utf8'); } catch (_) {}
        }
      });
    }
  } catch (_) {}
}

function createWindow() {
  const icoPath = path.join(__dirname, 'ui', 'app-icon.ico');
  const bwIcoPath = path.join(__dirname, 'ui', 'app-icon-blockway-v322.ico');
  if (fs.existsSync(icoPath)) {
    try { fs.copyFileSync(icoPath, bwIcoPath); } catch (_) {}
  }
  const pngPath = path.join(__dirname, 'ui', 'app-logo.png');
  let winIcon = fs.existsSync(bwIcoPath) ? bwIcoPath : (fs.existsSync(icoPath) ? icoPath : undefined);
  try {
    if (fs.existsSync(pngPath)) {
      const nImg = nativeImage.createFromPath(pngPath);
      if (!nImg.isEmpty()) winIcon = nImg;
    }
  } catch (_) {}

  let savedTheme = 'lunar';
  let savedUiScale = 1.0;
  try {
    if (fs.existsSync(configPath)) {
      const rawCfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (rawCfg && typeof rawCfg.theme === 'string') savedTheme = rawCfg.theme;
      if (rawCfg && Number.isFinite(Number(rawCfg.uiScale)) && Number(rawCfg.uiScale) >= 0.85 && Number(rawCfg.uiScale) <= 1.35) {
        savedUiScale = Number(rawCfg.uiScale);
      }
    }
  } catch (_) {}
  global.__bwUserUiScale = savedUiScale;
  const themeBgMap = {
    sakura: '#fdf2f7',
    prism: '#eef3fa',
    mojang: '#101114',
    modrinth: '#0a100d',
    feather: '#07111b',
    cherry: '#13090f',
    lunar: '#0b0d12'
  };
  const initialBgColor = themeBgMap[savedTheme] || '#0b0d12';

  let workW = 1366;
  let workH = 840;
  try {
    const wa = screen.getPrimaryDisplay()?.workAreaSize;
    if (wa?.width > 400 && wa?.height > 300) {
      workW = wa.width;
      workH = wa.height;
    }
  } catch (_) {}

  mainWindow = new BrowserWindow({
    width: Math.min(1360, workW),
    height: Math.min(840, workH),
    minWidth: Math.min(960, workW),
    minHeight: Math.min(560, workH),
    frame: false,
    title: getLauncherVersionTitle(),
    backgroundColor: initialBgColor,
    icon: winIcon,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true
    }
  });

  // Keep navigation inside local UI window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          shell.openExternal(parsed.toString());
        }
      } catch (_) {}
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, navUrl) => {
    const currentUrl = mainWindow.webContents.getURL();
    if (navUrl !== currentUrl && !String(navUrl || '').startsWith('file://')) {
      event.preventDefault();
    }
  });

  // v40.9.1 PRO: True-DPI UI Scale — KHÔNG thu nhỏ chữ theo chiều cao cửa sổ (vì mọi tab đều cuộn dọc mượt),
  // giữ nguyên 100% cỡ chữ sắc nét trên màn hình Laptop DPI 125%–150% (1024×640 DIP) và hỗ trợ tùy chỉnh cỡ chữ!
  let uiZoomTimer = null;
  const applyUiAutoZoom = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const [cw] = mainWindow.getContentSize();
      const baseScale = Math.max(0.85, Math.min(1.35, Number(global.__bwUserUiScale) || 1.0));
      const narrowGuard = cw > 0 && cw < 880 ? Math.max(0.82, cw / 880) : 1.0;
      const zr = Math.round(baseScale * narrowGuard * 1000) / 1000;
      if (Math.abs(mainWindow.webContents.getZoomFactor() - zr) > 0.002) {
        mainWindow.webContents.setZoomFactor(zr);
      }
    } catch (_) {}
  };
  global.__bwApplyUiZoom = applyUiAutoZoom;
  const scheduleUiAutoZoom = () => {
    if (uiZoomTimer) clearTimeout(uiZoomTimer);
    uiZoomTimer = setTimeout(applyUiAutoZoom, 16);
  };
  ['resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen']
    .forEach((ev) => mainWindow.on(ev, scheduleUiAutoZoom));
  mainWindow.webContents.on('did-finish-load', applyUiAutoZoom);
  mainWindow.webContents.on('dom-ready', applyUiAutoZoom);

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  let shownOnce = false;
  const revealWindow = () => {
    if (shownOnce || !mainWindow || mainWindow.isDestroyed()) return;
    shownOnce = true;
    if (!process.env.BW_CAPTURE_HOOK && (workW <= 1280 || workH <= 760)) {
      try { mainWindow.maximize(); } catch (_) {}
    }
    applyUiAutoZoom();
    mainWindow.show();
    ensureAppIconSyncedAndApplied();
  };
  mainWindow.once('ready-to-show', revealWindow);
  setTimeout(revealWindow, 650);
}

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    createWindow();
    if (discordRpcEnabled) {
      setTimeout(() => setDiscordLobbyPresence(), 1200);
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  closeDiscordIpc();
  cleanupJavaTempAndTrimRam();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('win:minimize', () => mainWindow?.minimize());
ipcMain.on('win:maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('win:close', () => {
  closeDiscordIpc();
  cleanupJavaTempAndTrimRam();
  mainWindow?.destroy();
  app.quit();
  app.exit(0);
});

let prevCpuSnap = null;
function sampleCpuLoadPct() {
  try {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const c of cpus) {
      for (const k of Object.keys(c.times)) total += c.times[k];
      idle += c.times.idle;
    }
    if (!prevCpuSnap) {
      prevCpuSnap = { idle, total };
      return 12;
    }
    const dIdle = idle - prevCpuSnap.idle;
    const dTotal = total - prevCpuSnap.total;
    prevCpuSnap = { idle, total };
    if (dTotal <= 0) return 10;
    return Math.max(2, Math.min(99, Math.round((1 - dIdle / dTotal) * 100)));
  } catch (_) {
    return 10;
  }
}

ipcMain.handle('sys:info', async () => {
  const totalMemGB = Math.round(os.totalmem() / (1024 ** 3));
  const freeMemGB = Math.round((os.freemem() / (1024 ** 3)) * 10) / 10;
  const cpus = os.cpus();
  const defaultGameDir = getDefaultGameDir();
  let diskUsedGB = null;
  let diskTotalGB = null;
  try {
    if (typeof fs.statfsSync === 'function') {
      const st = fs.statfsSync(defaultGameDir && fs.existsSync(defaultGameDir) ? defaultGameDir : os.homedir());
      diskTotalGB = Math.round((st.blocks * st.bsize) / (1024 ** 3));
      const diskFreeGB = Math.round((st.bfree * st.bsize) / (1024 ** 3));
      diskUsedGB = Math.max(1, diskTotalGB - diskFreeGB);
    }
  } catch (_) {}
  return {
    totalMemGB,
    freeMemGB,
    cpuModel: cpus[0]?.model || 'Multi-Core Processor',
    cpuCores: cpus.length,
    cpuLoadPct: sampleCpuLoadPct(),
    diskUsedGB,
    diskTotalGB,
    defaultGameDir,
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
    if (Number.isFinite(Number(cfg?.uiScale)) && Number(cfg.uiScale) >= 0.85 && Number(cfg.uiScale) <= 1.35) {
      global.__bwUserUiScale = Number(cfg.uiScale);
      if (typeof global.__bwApplyUiZoom === 'function') global.__bwApplyUiZoom();
    }
    if (typeof cfg?.discordRpcEnabled === 'boolean' && cfg.discordRpcEnabled !== discordRpcEnabled) {
      discordRpcEnabled = cfg.discordRpcEnabled;
      if (!discordRpcEnabled) {
        closeDiscordIpc();
      } else if (activeGamePresenceCtx) {
        setDiscordPlayingPresence(activeGamePresenceCtx);
      } else {
        setDiscordLobbyPresence();
      }
    }
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (_) {
    return false;
  }
});

ipcMain.handle('playtime:get', async () => {
  return { ok: true, stats: loadPlaytimeStats() };
});

ipcMain.handle('discord:set-enabled', async (_e, enabled) => {
  discordRpcEnabled = Boolean(enabled);
  if (!discordRpcEnabled) {
    closeDiscordIpc();
  } else if (activeGamePresenceCtx) {
    setDiscordPlayingPresence(activeGamePresenceCtx);
  } else {
    setDiscordLobbyPresence();
  }
  return { ok: true, enabled: discordRpcEnabled };
});

ipcMain.handle('sys:open-external', async (_e, url) => {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      await shell.openExternal(parsed.toString());
      return true;
    }
  } catch (_) {}
  return false;
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

ipcMain.handle('mc:loaders', async (_e, mcVersion, loaderType, gameDir) => {
  try {
    return { ok: true, data: await fetchLoaderVersions(mcVersion, loaderType, gameDir) };
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
  return { ok: true, worlds: listLocalWorlds(gameDir, true) };
});

ipcMain.handle('mc:open-dir', async (_e, dirPath) => {
  const target = path.resolve(dirPath && String(dirPath).trim() ? String(dirPath).trim() : getDefaultGameDir());
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
  shell.openPath(target);
  return target;
});

ipcMain.handle('mc:open-subfolder', async (_e, gameDir, subFolder) => {
  const root = path.resolve(gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir());
  const cleanSub = String(subFolder || '').replace(/^[\\/]+/, '');
  const target = cleanSub ? path.resolve(root, cleanSub) : root;
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Đường dẫn thư mục con không hợp lệ.');
  }
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
    // v40.8: reuse the already-loaded engine (re-requiring it on every launch wasted ~MBs of RAM & startup time)
    const freshEngine = require('./launcher-engine');
    mcGameRunning = true;
    hideOnLaunchSetting = config.hideLauncherOnPlay !== false;
    // v40.8 PRO "Mượt Êm": detect the monitor refresh rate so FPS is capped to what the screen can actually show
    try {
      const { screen } = require('electron');
      const disp = mainWindow ? screen.getDisplayMatching(mainWindow.getBounds()) : screen.getPrimaryDisplay();
      config.displayHz = Math.round(Number(disp?.displayFrequency) || 0);
    } catch (_) {}
    const sessionStartMs = Date.now();
    let lastPlaytimeCheckpointMs = sessionStartMs;
    const instanceSlug = config.instanceDir ? path.basename(String(config.instanceDir).trim()) : '';
    const packLabel = config.packName || instanceSlug || '';

    setDiscordPlayingPresence({
      packName: packLabel,
      mcVersion: config.mcVersion,
      loaderType: config.loaderType,
      serverIp: config.serverIp,
      worldFolderName: config.worldFolderName
    });

    const playtimeTimer = setInterval(() => {
      const now = Date.now();
      const deltaSec = Math.floor((now - lastPlaytimeCheckpointMs) / 1000);
      if (deltaSec >= 30) {
        lastPlaytimeCheckpointMs += deltaSec * 1000;
        const stats = recordPlaytimeDelta(deltaSec, { instanceSlug, mcVersion: config.mcVersion, isFinal: false });
        mainWindow?.webContents.send('playtime:updated', stats);
      }
    }, 60000);

    await freshEngine.launchMinecraft(config, {
      onProgress: (p) => mainWindow?.webContents.send('mc:progress', p),
      onLog: (line) => mainWindow?.webContents.send('mc:log', line),
      onStatus: (st) => mainWindow?.webContents.send('mc:status', st),
      onCoopEvent: (ev) => {
        const localIps = getLocalLanIpAddresses();
        mainWindow?.webContents.send('mc:coop-event', { ...ev, localIps });
      },
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
        mcGameRunning = false;
        clearInterval(playtimeTimer);
        const remSec = Math.max(0, Math.round((Date.now() - lastPlaytimeCheckpointMs) / 1000));
        const finalStats = recordPlaytimeDelta(remSec, { instanceSlug, mcVersion: config.mcVersion, isFinal: true });
        if (discordRpcEnabled) setDiscordLobbyPresence();

        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
        mainWindow?.webContents.send('playtime:updated', finalStats);
        mainWindow?.webContents.send('mc:close', code);

        if (config.autoBackupWorlds !== false) {
          setImmediate(() => {
            try {
              const autoRes = freshEngine.autoBackupModifiedWorlds(config.gameDir, sessionStartMs, 3);
              if (autoRes?.ok && Array.isArray(autoRes.backedUp) && autoRes.backedUp.length > 0) {
                mainWindow?.webContents.send('worlds:auto-backed-up', autoRes);
              }
            } catch (_) {}
          });
        }
      }
    });
    return { ok: true };
  } catch (err) {
    mcGameRunning = false;
    if (discordRpcEnabled) setDiscordLobbyPresence();
    return { ok: false, error: err.message };
  }
});

function compareSemver(a, b) {
  const cleanA = String(a || '0.0.0').replace(/^v/i, '');
  const cleanB = String(b || '0.0.0').replace(/^v/i, '');
  const pa = cleanA.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = cleanB.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function fetchJsonSimple(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'BlockWay-Updater/35.0' }, timeout: 8000 },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          const nextUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          res.resume();
          return fetchJsonSimple(nextUrl, redirects - 1).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try { resolve(JSON.parse(String(raw || '').replace(/^\uFEFF/, ''))); } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

function downloadWithProgress(url, destPath, onPct, redirects = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'BlockWay-Updater/35.0' }, timeout: 15000 },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
          const nextUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          res.resume();
          return downloadWithProgress(nextUrl, destPath, onPct, redirects - 1).then(resolve).catch(reject);
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
      }
    );
    req.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
    req.on('timeout', () => {
      req.destroy();
      fs.unlink(destPath, () => {});
      reject(new Error('Timeout'));
    });
  });
}

async function resolveGitHubRepoAndRef() {
  let repoSlug = 'blockway-launcher';
  let refBranch = 'main';
  try {
    const commitInfo = await fetchJsonSimple(`https://api.github.com/repos/buiduchuy2010qn-prog/blockway-launcher/commits/main?t=${Date.now()}`);
    if (commitInfo?.sha) refBranch = commitInfo.sha;
  } catch (_) {
    try {
      const commitInfoOld = await fetchJsonSimple(`https://api.github.com/repos/buiduchuy2010qn-prog/aether-mine-launcher/commits/main?t=${Date.now()}`);
      if (commitInfoOld?.sha) {
        repoSlug = 'aether-mine-launcher';
        refBranch = commitInfoOld.sha;
      }
    } catch (_) {}
  }
  return { repoSlug, refBranch };
}

ipcMain.handle('updater:check', async () => {
  try {
    const currentVersion = (() => { try { const p = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8').replace(/^\uFEFF/, '')); if (p && p.version) return String(p.version).trim(); } catch (_) {} return app.getVersion(); })();
    const { repoSlug, refBranch } = await resolveGitHubRepoAndRef();
    let remotePkg = null;
    try {
      remotePkg = await fetchJsonSimple(`https://raw.githubusercontent.com/buiduchuy2010qn-prog/${repoSlug}/${refBranch}/package.json?t=${Date.now()}`);
    } catch (_) {
      try {
        remotePkg = await fetchJsonSimple(`https://raw.githubusercontent.com/buiduchuy2010qn-prog/aether-mine-launcher/${refBranch}/package.json?t=${Date.now()}`);
      } catch (_) {}
    }

    let latestVersion = remotePkg?.version || currentVersion;
    // v40.8: Portable users must get the Portable .exe, installed users the Setup .exe (names use "BlockWay.Launcher-…")
    const isPortableRun = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
    const assetKind = isPortableRun ? 'Portable' : 'Setup';
    let downloadUrl = `https://github.com/buiduchuy2010qn-prog/${repoSlug}/releases/download/v${latestVersion}/BlockWay.Launcher-${assetKind}-${latestVersion}.exe`;

    try {
      const relInfo = await fetchJsonSimple(`https://api.github.com/repos/buiduchuy2010qn-prog/${repoSlug}/releases/latest?t=${Date.now()}`);
      const relVer = String(relInfo?.tag_name || '').replace(/^v/i, '');
      if (relVer && compareSemver(relVer, latestVersion) > 0) {
        latestVersion = relVer;
      }
      if (Array.isArray(relInfo?.assets)) {
        const exeAssets = relInfo.assets.filter((a) => typeof a?.browser_download_url === 'string' && /\.exe$/i.test(a.name || a.browser_download_url));
        const kindRx = isPortableRun ? /portable/i : /setup/i;
        const exeAsset = exeAssets.find((a) => kindRx.test(a.name || '')) || exeAssets[0];
        if (exeAsset?.browser_download_url) {
          downloadUrl = exeAsset.browser_download_url;
        }
      }
    } catch (_) {}

    const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;
    return { ok: true, hasUpdate, currentVersion, latestVersion, downloadUrl, commitSha: refBranch, isPortable: isPortableRun };
  } catch (err) {
    return { ok: false, error: err.message, currentVersion: app.getVersion() };
  }
});

ipcMain.handle('updater:install-now', async (_e, downloadUrl, latestVersion) => {
  try {
    const appRoot = path.resolve(__dirname, '..');
    const portableExeFile = process.env.PORTABLE_EXECUTABLE_FILE || '';
    // v40.8: the Portable .exe unpacks into %TEMP% on every start — hot-patching there is wiped on next launch,
    // so Portable users get the new Portable .exe downloaded right next to the old one instead.
    const isUnpackedApp = !portableExeFile && path.basename(appRoot).toLowerCase() === 'app' && !appRoot.endsWith('.asar');

    if (portableExeFile) {
      const parsedUrl = new URL(String(downloadUrl || ''));
      const allowedHosts = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);
      if (parsedUrl.protocol !== 'https:' || !allowedHosts.has(parsedUrl.hostname.toLowerCase())) {
        throw new Error('Nguồn tải bản cập nhật không hợp lệ.');
      }
      const safeVer = String(latestVersion || 'latest').replace(/[^0-9A-Za-z._-]/g, '');
      const portableDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(portableExeFile);
      const newExe = path.join(portableDir, `BlockWay.Launcher-Portable-${safeVer}.exe`);
      const tmpExe = `${newExe}.download`;
      await downloadWithProgress(parsedUrl.toString(), tmpExe, (pct) => {
        mainWindow?.webContents.send('updater:progress', Math.min(99, pct));
      });
      if (!fs.existsSync(tmpExe) || fs.statSync(tmpExe).size < 5 * 1024 * 1024) {
        try { fs.rmSync(tmpExe, { force: true }); } catch (_) {}
        throw new Error('Tệp Portable tải về chưa hoàn chỉnh, hãy thử lại.');
      }
      try { fs.rmSync(newExe, { force: true }); } catch (_) {}
      fs.renameSync(tmpExe, newExe);
      mainWindow?.webContents.send('updater:progress', 100);
      const { spawn } = require('child_process');
      setTimeout(() => {
        try {
          const child = spawn(newExe, [], { detached: true, stdio: 'ignore', cwd: portableDir });
          child.unref();
        } catch (_) {}
        app.exit(0);
      }, 400);
      return { ok: true, portablePath: newExe };
    }

    if (isUnpackedApp) {
      const { repoSlug, refBranch } = await resolveGitHubRepoAndRef();
      const fallbackFiles = [
        'package.json',
        'ota-manifest.json',
        'src/main.js',
        'src/preload.js',
        'src/launcher-engine.js',
        'src/world-creator.js',
        'src/microsoft-auth.js',
        'src/aether-cloud-auth.js',
        'src/ui/index.html',
        'src/ui/styles.css',
        'src/ui/layout-v33.css',
        'src/ui/skinview3d.bundle.js',
        'src/ui/renderer.js',
        'src/ui/store-features.js',
        'src/ui/minecraft-logo.png',
        'src/ui/app-banner.png',
        'src/ui/app-banner-hero.png',
        'src/ui/app-logo.png',
        'src/ui/app-icon.ico'
      ];
      const baseRaw = `https://raw.githubusercontent.com/buiduchuy2010qn-prog/${repoSlug}/${refBranch}`;
      const fallbackRaw = `https://raw.githubusercontent.com/buiduchuy2010qn-prog/aether-mine-launcher/${refBranch}`;

      // v40.4 PRO: Fetch dynamic ota-manifest.json with SHA-256 verification (skips unchanged files & prevents corrupted updates)
      let manifestEntries = null;
      let manifestBuf = null;
      try {
        const manBuf = await fetchBinaryBuffer(`${baseRaw}/ota-manifest.json?t=${Date.now()}`);
        const manJson = JSON.parse(manBuf.toString('utf8'));
        if (manJson && Array.isArray(manJson.files) && manJson.files.length >= 8) {
          manifestEntries = manJson.files.filter((e) => e && typeof e.path === 'string' && /^(package\.json|ota-manifest\.json|src\/[A-Za-z0-9._/-]+)$/.test(e.path) && !e.path.includes('..'));
          manifestBuf = manBuf;
        }
      } catch (_) {}

      const entriesToProcess = manifestEntries && manifestEntries.length > 0
        ? manifestEntries
        : fallbackFiles.map((rel) => ({ path: rel, sha256: '' }));

      // Phase 1: Download changed files into memory and verify SHA-256 hashes before touching disk
      const stagedFiles = [];
      for (let i = 0; i < entriesToProcess.length; i++) {
        const item = entriesToProcess[i];
        const rel = item.path;
        const expectedSha = String(item.sha256 || '').trim().toLowerCase();
        const localFile = path.resolve(appRoot, rel);
        const relCheck = path.relative(appRoot, localFile);
        if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) continue;

        if (/^[a-f0-9]{64}$/.test(expectedSha) && fs.existsSync(localFile)) {
          try {
            const diskSha = crypto.createHash('sha256').update(fs.readFileSync(localFile)).digest('hex').toLowerCase();
            if (diskSha === expectedSha) {
              mainWindow?.webContents.send('updater:progress', Math.round(((i + 1) / entriesToProcess.length) * 95));
              continue;
            }
          } catch (_) {}
        }

        let buf;
        try {
          buf = await fetchBinaryBuffer(`${baseRaw}/${rel}?t=${Date.now()}`);
        } catch (_) {
          buf = await fetchBinaryBuffer(`${fallbackRaw}/${rel}?t=${Date.now()}`);
        }
        if (!buf || buf.length < 32) {
          throw new Error(`Tệp tải về không hợp lệ hoặc bị gián đoạn: ${rel}`);
        }
        if (/^[a-f0-9]{64}$/.test(expectedSha)) {
          const actualSha = crypto.createHash('sha256').update(buf).digest('hex').toLowerCase();
          if (actualSha !== expectedSha) {
            // CDN edge cache may still be refreshing right after a release; keep going only if valid non-HTML payload, else retry once
            const retryBuf = await fetchBinaryBuffer(`${baseRaw}/${rel}?nocache=${Date.now()}-${i}`).catch(() => buf);
            const retrySha = crypto.createHash('sha256').update(retryBuf).digest('hex').toLowerCase();
            if (retrySha === expectedSha) {
              buf = retryBuf;
            } else {
              throw new Error(`Kiểm tra toàn vẹn SHA-256 thất bại cho ${rel} (CDN đang đồng bộ, hãy thử lại sau 15 giây).`);
            }
          }
        }
        stagedFiles.push({ rel, buf, targetFile: localFile });
        mainWindow?.webContents.send('updater:progress', Math.round(((i + 1) / entriesToProcess.length) * 95));
      }
      // v40.8: keep the local ota-manifest.json in sync so the next update only downloads what changed
      if (manifestBuf) {
        stagedFiles.push({ rel: 'ota-manifest.json', buf: manifestBuf, targetFile: path.resolve(appRoot, 'ota-manifest.json') });
      }

      // Phase 2: Atomic write to disk with automatic in-memory rollback if any write fails
      const rollbackSnapshots = [];
      try {
        for (const item of stagedFiles) {
          const existed = fs.existsSync(item.targetFile);
          const prevBuf = existed ? fs.readFileSync(item.targetFile) : null;
          rollbackSnapshots.push({ targetFile: item.targetFile, existed, prevBuf });
          const dir = path.dirname(item.targetFile);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(item.targetFile, item.buf);
        }
      } catch (writeErr) {
        for (const snap of rollbackSnapshots) {
          try {
            if (snap.existed && snap.prevBuf) fs.writeFileSync(snap.targetFile, snap.prevBuf);
            else if (!snap.existed && fs.existsSync(snap.targetFile)) fs.unlinkSync(snap.targetFile);
          } catch (_) {}
        }
        throw writeErr;
      }
      mainWindow?.webContents.send('updater:progress', 100);

      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 250);
      return { ok: true };
    }

    // Fallback if running from legacy app.asar: validate GitHub download URL strictly
    const parsedUrl = new URL(String(downloadUrl || ''));
    const allowedHosts = new Set(['github.com', 'objects.githubusercontent.com', 'raw.githubusercontent.com']);
    if (parsedUrl.protocol !== 'https:' || !allowedHosts.has(parsedUrl.hostname.toLowerCase())) {
      throw new Error('Nguồn tải bản cập nhật không hợp lệ.');
    }
    const safeVer = String(latestVersion || 'latest').replace(/[^0-9A-Za-z._-]/g, '');
    const tempExe = path.join(os.tmpdir(), `BlockWay-Setup-${safeVer}.exe`);
    await downloadWithProgress(parsedUrl.toString(), tempExe, (pct) => {
      mainWindow?.webContents.send('updater:progress', pct);
    });
    const currentExe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    const installDir = path.dirname(currentExe);
    const batPath = path.join(os.tmpdir(), 'blockway-auto-update.bat');
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

/* ============================================================================
   v40.0 PRO — KHO MODPACK TOÀN CẦU (IPC)
   ============================================================================ */
const cfKeyPath = path.join(app.getPath('userData'), 'curseforge-api-key.txt');
function loadCurseForgeKeyFromDisk() {
  try {
    if (fs.existsSync(cfKeyPath)) {
      const k = fs.readFileSync(cfKeyPath, 'utf8').replace(/^\uFEFF/, '').trim();
      if (k) setCurseForgeApiKey(k);
      return k;
    }
  } catch (_) {}
  return '';
}
loadCurseForgeKeyFromDisk();

function resolveUserGameDir(gameDir) {
  return gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
}

function sendPackProgress(p) {
  mainWindow?.webContents.send('packs:progress', p);
}

ipcMain.handle('packs:search', async (_e, params) => {
  try {
    return await searchPackHub(params || {});
  } catch (err) {
    return { ok: false, error: err.message, items: [] };
  }
});

ipcMain.handle('packs:details', async (_e, params) => {
  try {
    return await getPackHubDetails(params || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

let packInstallBusy = false;
ipcMain.handle('packs:install', async (_e, params) => {
  if (packInstallBusy) return { ok: false, error: 'Đang cài một gói khác, vui lòng đợi hoàn tất.' };
  packInstallBusy = true;
  try {
    return await installPackHub({ ...(params || {}), gameDir: resolveUserGameDir(params?.gameDir) }, sendPackProgress);
  } catch (err) {
    sendPackProgress({ stage: 'error', text: `❌ ${err.message}`, percent: 0 });
    return { ok: false, error: err.message };
  } finally {
    packInstallBusy = false;
  }
});

ipcMain.handle('packs:import-file', async (_e, params) => {
  if (packInstallBusy) return { ok: false, error: 'Đang cài một gói khác, vui lòng đợi hoàn tất.' };
  try {
    let filePath = params?.filePath;
    if (!filePath) {
      const res = await dialog.showOpenDialog(mainWindow, {
        title: 'Chọn file Modpack / Map / Datapack để nhập vào BlockWay',
        properties: ['openFile'],
        filters: [
          { name: 'Modpack, Map, Datapack (.mrpack, .zip)', extensions: ['mrpack', 'zip'] },
          { name: 'Tất cả', extensions: ['*'] }
        ]
      });
      if (res.canceled || !res.filePaths?.length) return { ok: false, canceled: true };
      filePath = res.filePaths[0];
    }
    packInstallBusy = true;
    return await importPackFromFile({ filePath, gameDir: resolveUserGameDir(params?.gameDir), worldTarget: params?.worldTarget }, sendPackProgress);
  } catch (err) {
    sendPackProgress({ stage: 'error', text: `❌ ${err.message}`, percent: 0 });
    return { ok: false, error: err.message };
  } finally {
    packInstallBusy = false;
  }
});

ipcMain.handle('packs:import-url', async (_e, params) => {
  if (packInstallBusy) return { ok: false, error: 'Đang cài một gói khác, vui lòng đợi hoàn tất.' };
  packInstallBusy = true;
  try {
    return await importPackFromUrl({ url: params?.url, gameDir: resolveUserGameDir(params?.gameDir), worldTarget: params?.worldTarget }, sendPackProgress);
  } catch (err) {
    sendPackProgress({ stage: 'error', text: `❌ ${err.message}`, percent: 0 });
    return { ok: false, error: err.message };
  } finally {
    packInstallBusy = false;
  }
});

ipcMain.handle('packs:import-from-downloads', async (_e, params) => {
  if (packInstallBusy) return { ok: false, error: 'Đang cài một gói khác, vui lòng đợi hoàn tất.' };
  try {
    const fileName = path.basename(String(params?.fileName || ''));
    if (!fileName) return { ok: false, error: 'Thiếu tên file.' };
    const dirs = [path.join(os.homedir(), 'Downloads'), path.join(os.homedir(), 'Desktop')];
    const found = dirs.map((d) => path.join(d, fileName)).find((p) => fs.existsSync(p));
    if (!found) return { ok: false, notFound: true, error: `Chưa thấy "${fileName}" trong thư mục Downloads.` };
    packInstallBusy = true;
    return await importPackFromFile({ filePath: found, gameDir: resolveUserGameDir(params?.gameDir) }, sendPackProgress);
  } catch (err) {
    sendPackProgress({ stage: 'error', text: `❌ ${err.message}`, percent: 0 });
    return { ok: false, error: err.message };
  } finally {
    packInstallBusy = false;
  }
});

ipcMain.handle('packs:instances', async (_e, gameDir) => {
  try {
    return { ok: true, instances: listPackInstances(resolveUserGameDir(gameDir)) };
  } catch (err) {
    return { ok: false, error: err.message, instances: [] };
  }
});

ipcMain.handle('packs:instance-delete', async (_e, params) => {
  try {
    return deletePackInstance(resolveUserGameDir(params?.gameDir), params?.dir);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('packs:instance-touch', async (_e, params) => {
  try {
    touchPackInstance(resolveUserGameDir(params?.gameDir), params?.dir);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('packs:instance-open', async (_e, params) => {
  try {
    const root = path.resolve(getInstancesRoot(resolveUserGameDir(params?.gameDir)));
    const target = params?.dir ? path.resolve(String(params.dir)) : root;
    const rel = path.relative(root, target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Thư mục không hợp lệ.');
    if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
    const sub = params?.sub ? path.resolve(target, String(params.sub).replace(/^[\\/]+/, '')) : target;
    const relSub = path.relative(target, sub);
    if (relSub.startsWith('..') || path.isAbsolute(relSub)) throw new Error('Thư mục không hợp lệ.');
    if (!fs.existsSync(sub)) fs.mkdirSync(sub, { recursive: true });
    shell.openPath(sub);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('packs:resolve-manual', async (_e, params) => {
  try {
    return resolveManualDownloads({ gameDir: resolveUserGameDir(params?.gameDir), instanceDir: params?.dir });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('packs:worlds', async (_e, gameDir) => {
  try {
    const root = resolveUserGameDir(gameDir);
    const worlds = listLocalWorlds(root).map((w) => ({ ...w, iconDataUrl: null, owner: 'Thư mục chính (.minecraft)' }));
    for (const inst of listPackInstances(root)) {
      for (const w of listLocalWorlds(inst.dir)) worlds.push({ ...w, iconDataUrl: null, owner: `Gói: ${inst.name}` });
    }
    return { ok: true, worlds };
  } catch (err) {
    return { ok: false, error: err.message, worlds: [] };
  }
});

ipcMain.handle('packs:cf-key-status', async () => {
  const key = loadCurseForgeKeyFromDisk();
  if (!key && !process.env.BLOCKWAY_CF_KEY) return { ok: true, hasKey: false, valid: false, searchAllowed: false };
  try {
    const st = await checkCurseForgeKey(key || process.env.BLOCKWAY_CF_KEY);
    return { ok: true, hasKey: true, masked: key ? `${key.slice(0, 7)}…${key.slice(-4)}` : '(biến môi trường)', ...st };
  } catch (err) {
    return { ok: false, hasKey: true, error: err.message };
  }
});

ipcMain.handle('packs:cf-key-set', async (_e, key) => {
  try {
    const clean = String(key || '').trim();
    if (!clean) {
      try { fs.rmSync(cfKeyPath, { force: true }); } catch (_) {}
      setCurseForgeApiKey('');
      return { ok: true, hasKey: false, valid: false };
    }
    const st = await checkCurseForgeKey(clean);
    if (!st.valid) return { ok: false, error: 'Key CurseForge không hợp lệ (máy chủ từ chối).' };
    fs.writeFileSync(cfKeyPath, clean, 'utf8');
    setCurseForgeApiKey(clean);
    return { ok: true, hasKey: true, masked: `${clean.slice(0, 7)}…${clean.slice(-4)}`, ...st };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('server:ping', async (_e, serverIp) => {
  const cleanIp = String(serverIp || '').trim();
  if (!cleanIp || cleanIp.includes('[object')) return { ok: false, online: false };
  // v40.8 Servers 2.0: talk to the server directly (real ms, MOTD, version, icon) — cloud lookup only as a fallback
  let nativeErr = null;
  try {
    const engine = require('./launcher-engine');
    return await engine.pingMinecraftServer(cleanIp, { timeoutMs: 4500 });
  } catch (err) {
    nativeErr = err;
  }
  // DNS failure / refused connection = really offline; skip the slow cloud lookup
  if (nativeErr && /ENOTFOUND|ECONNREFUSED|EHOSTUNREACH/i.test(String(nativeErr.code || nativeErr.message))) {
    return { ok: true, online: false, source: 'native', error: nativeErr.message };
  }
  try {
    const data = await fetchJsonSimple(`https://api.mcsrvstat.us/3/${encodeURIComponent(cleanIp)}`);
    const motdLines = Array.isArray(data?.motd?.clean) ? data.motd.clean : [];
    return {
      ok: true,
      online: Boolean(data?.online),
      source: 'cloud',
      latencyMs: 0,
      motd: motdLines.map((l) => String(l).replace(/\s{2,}/g, ' ').trim()).filter(Boolean).slice(0, 2).join('\n'),
      playersOnline: data?.players?.online ?? 0,
      playersMax: data?.players?.max ?? 0,
      playersSample: Array.isArray(data?.players?.list) ? data.players.list.map((p) => p?.name || p).filter(Boolean).slice(0, 12) : [],
      version: data?.version || '',
      protocol: Number(data?.protocol?.version) || 0,
      icon: data?.icon || null
    };
  } catch (err) {
    return { ok: true, online: false, error: (nativeErr && nativeErr.message) || err.message };
  }
});

ipcMain.handle('server:sync-dat', async (_e, { gameDir, servers, writeServers, writeToGame = true } = {}) => {
  try {
    const engine = require('./launcher-engine');
    return engine.syncServersDat(gameDir, Array.isArray(servers) ? servers : [], {
      writeToGame: Boolean(writeToGame) && !mcGameRunning,
      writeList: Array.isArray(writeServers) ? writeServers : null
    });
  } catch (err) {
    return { ok: false, error: err.message, importedFromGame: [] };
  }
});

ipcMain.handle('migrate:scan', async (_e, gameDir) => {
  try {
    const freshEngine = require('./launcher-engine');
    const items = freshEngine.scanExternalLaunchers(gameDir);
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err.message, items: [] };
  }
});

ipcMain.handle('migrate:import', async (_e, params) => {
  try {
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

/* ============================================================================
   v40.1 PRO — DỊCH TIẾNG VIỆT & CHƠI CHUNG BẠN BÈ (LAN • E4MC • PHÒNG CO-OP)
   ============================================================================ */
ipcMain.handle('translate:vi', async (_e, texts) => {
  try {
    return await translateTextToVi(texts, app.getPath('userData'));
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('coop:scan-lan', async (_e, timeoutMs) => {
  try {
    return await scanLanWorlds(timeoutMs);
  } catch (err) {
    return { ok: false, error: err.message, worlds: [], localIps: getLocalLanIpAddresses() };
  }
});

ipcMain.handle('coop:prepare-host', async (_e, params) => {
  try {
    return await prepareCoopHostMods(params || {}, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('coop:upsert-room', async (_e, params) => {
  try {
    const res = await upsertCoopRoom(params || {});
    const roomCode = res?.room?.roomCode || res?.room?.code;
    if (res?.ok && roomCode && activeGamePresenceCtx) {
      setDiscordPlayingPresence({ ...activeGamePresenceCtx, coopCode: roomCode });
    }
    return res;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('coop:get-room', async (_e, codeOrToken) => {
  try {
    return await getCoopRoom(codeOrToken);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('coop:list-rooms', async () => {
  try {
    return await listCoopRooms();
  } catch (err) {
    return { ok: false, error: err.message, rooms: [] };
  }
});

/* ============================================================================
   v40.2 PRO — BÁC SĨ CRASH, ĐỒNG BỘ GIỎ MOD, SAO LƯU MAP & THƯ VIỆN ẢNH CHỤP
   ============================================================================ */
ipcMain.handle('crash:analyze', async (_e, params) => {
  try {
    return analyzeMinecraftCrash(params || {});
  } catch (err) {
    return { ok: false, error: err.message, causes: [], actions: [] };
  }
});

ipcMain.handle('packs:quick-island', async (_e, params) => {
  try {
    return await installQuickIslandPack(params || {}, (p) => {
      mainWindow?.webContents.send('packs:progress', p);
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('packs:equip-island', async (_e, params) => {
  try {
    return await equipPackInstanceIsland({
      gameDir: params?.gameDir,
      instanceDir: params?.dir || params?.instanceDir,
      mode: params?.mode || 'skyblock'
    }, (p) => {
      mainWindow?.webContents.send('packs:progress', p);
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('java:auto-install', async (_e, payload) => {
  try {
    const major = typeof payload === 'number' ? payload : (Number(payload?.major) || 21);
    const gameDir = (typeof payload === 'object' && payload?.gameDir) ? payload.gameDir : getDefaultGameDir();
    const javaPath = await downloadPortableJava(gameDir, major, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
    if (!javaPath) {
      return { ok: false, error: `Không thể tự động tải hoặc giải nén Java ${major} 64-bit.` };
    }
    return { ok: true, javaPath, major };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('mods:sync-all', async (_e, params) => {
  try {
    return await syncAllLocalModsToVersion(params || {}, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('coop:build-basket', async (_e, params) => {
  try {
    return await buildCoopModBasket(params || {});
  } catch (err) {
    return { ok: false, error: err.message, modBasket: [] };
  }
});

ipcMain.handle('coop:sync-basket', async (_e, params) => {
  try {
    return await syncCoopModBasket(params || {}, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('coop:export-basket-file', async (_e, params) => {
  try {
    const basketRes = await buildCoopModBasket(params || {});
    if (!basketRes?.ok || !basketRes.modBasket?.length) {
      return { ok: false, error: 'Chưa có Mod (.jar) nào đang bật trong thư mục mods để xuất giỏ Mod.' };
    }
    const saveRes = await dialog.showSaveDialog(mainWindow, {
      title: 'Lưu file Giỏ Mod gửi cho bạn bè (.bwmods.json)',
      defaultPath: `BlockWay-Mods-${basketRes.mcVersion}-${basketRes.loaderType}.bwmods.json`,
      filters: [{ name: 'BlockWay Mod Basket (.bwmods.json)', extensions: ['json'] }]
    });
    if (saveRes.canceled || !saveRes.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(saveRes.filePath, JSON.stringify({
      format: 'blockway-mod-basket-v1',
      exportedAt: new Date().toISOString(),
      mcVersion: basketRes.mcVersion,
      loaderType: basketRes.loaderType,
      modsCount: basketRes.modsCount,
      modBasket: basketRes.modBasket,
      localSkins: basketRes.localSkins || []
    }, null, 2), 'utf8');
    return { ok: true, filePath: saveRes.filePath, modsCount: basketRes.modsCount };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('coop:import-basket-file', async (_e, params) => {
  try {
    const openRes = await dialog.showOpenDialog(mainWindow, {
      title: 'Chọn file Giỏ Mod bạn bè gửi (.bwmods.json / .json)',
      properties: ['openFile'],
      filters: [{ name: 'BlockWay Mod Basket (.json)', extensions: ['json'] }]
    });
    if (openRes.canceled || !openRes.filePaths?.length) return { ok: false, canceled: true };
    const raw = JSON.parse(fs.readFileSync(openRes.filePaths[0], 'utf8'));
    const modBasket = Array.isArray(raw?.modBasket) ? raw.modBasket : [];
    const localSkins = Array.isArray(raw?.localSkins) ? raw.localSkins : [];
    if (!modBasket.length && !localSkins.length) {
      return { ok: false, error: 'File này không chứa danh sách Giỏ Mod hợp lệ.' };
    }
    const targetMc = raw.mcVersion || params?.mcVersion || '1.21.4';
    const targetLoader = raw.loaderType || params?.loaderType || 'fabric';
    const syncRes = await syncCoopModBasket({
      gameDir: params?.gameDir,
      instanceDir: params?.instanceDir,
      mcVersion: targetMc,
      loaderType: targetLoader,
      modBasket,
      localSkins
    }, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
    return {
      ...syncRes,
      mcVersion: targetMc,
      loaderType: targetLoader,
      totalInBasket: modBasket.length
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('worlds:backup', async (_e, { gameDir, worldName }) => {
  try {
    return backupLocalWorld(gameDir, worldName);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('worlds:backups-list', async (_e, gameDir) => {
  try {
    const list = listWorldBackups(gameDir);
    return { ok: true, list, backups: list };
  } catch (err) {
    return { ok: false, error: err.message, list: [], backups: [] };
  }
});

ipcMain.handle('worlds:backup-restore', async (_e, { gameDir, fileName }) => {
  try {
    return restoreWorldBackup(gameDir, fileName);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('worlds:backup-delete', async (_e, { gameDir, fileName }) => {
  try {
    return deleteWorldBackup(gameDir, fileName);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('worlds:export-zip', async (_e, { gameDir, worldName }) => {
  try {
    const baseLabel = path.basename(String(worldName || 'World').trim()) || 'World';
    const safeName = baseLabel.replace(/[^A-Za-z0-9._ -]/g, '_');
    const saveRes = await dialog.showSaveDialog(mainWindow, {
      title: `Xuất Thế Giới "${baseLabel}" ra file .zip gửi bạn bè`,
      defaultPath: `${safeName}.zip`,
      filters: [{ name: 'Minecraft World (.zip)', extensions: ['zip'] }]
    });
    if (saveRes.canceled || !saveRes.filePath) return { ok: false, canceled: true };
    const res = exportWorldZip(gameDir, worldName, saveRes.filePath);
    return { ...res, filePath: saveRes.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('worlds:import-zip', async (_e, { gameDir, filePath }) => {
  try {
    let targetZip = filePath;
    if (!targetZip) {
      const openRes = await dialog.showOpenDialog(mainWindow, {
        title: 'Chọn file Thế giới / Map (.zip) để nhập vào game',
        properties: ['openFile'],
        filters: [{ name: 'Minecraft World (.zip)', extensions: ['zip'] }]
      });
      if (openRes.canceled || !openRes.filePaths?.length) return { ok: false, canceled: true };
      targetZip = openRes.filePaths[0];
    }
    return importWorldZip(gameDir, targetZip);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('screenshots:list', async (_e, gameDir) => {
  try {
    const list = listLocalScreenshots(gameDir);
    return { ok: true, list, items: list };
  } catch (err) {
    return { ok: false, error: err.message, list: [], items: [] };
  }
});

ipcMain.handle('screenshots:copy-image', async (_e, fullPath) => {
  try {
    if (!fullPath || !fs.existsSync(fullPath)) return { ok: false, error: 'Không tìm thấy ảnh chụp.' };
    const img = nativeImage.createFromPath(fullPath);
    if (img.isEmpty()) return { ok: false, error: 'Không thể đọc dữ liệu ảnh.' };
    clipboard.writeImage(img);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('screenshots:delete', async (_e, { gameDir, fullPath }) => {
  try {
    return deleteLocalScreenshot(gameDir, fullPath);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('screenshots:reveal', async (_e, fullPath) => {
  try {
    if (fullPath && fs.existsSync(fullPath)) {
      shell.showItemInFolder(fullPath);
      return { ok: true };
    }
    return { ok: false };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/* ============================================================================
   v40.4 PRO — AUTO-EQUIP IN-GAME, XUẤT GÓI .MRPACK & DỌN RÁC Ổ CỨNG THÔNG MINH
   ============================================================================ */
ipcMain.handle('addons:equip', async (_e, { gameDir, folderType, fileName, enable = true }) => {
  try {
    if (folderType === 'shaderpacks' || folderType === 'shader') {
      return equipShaderInGame(gameDir, enable ? fileName : '');
    }
    if (folderType === 'resourcepacks' || folderType === 'resourcepack') {
      return equipResourcePackInGame(gameDir, fileName, enable !== false);
    }
    return { ok: false, error: 'Loại tài nguyên không hỗ trợ kích hoạt trực tiếp.' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('addons:equipped-state', async (_e, gameDir) => {
  try {
    return getEquippedAddonsState(gameDir);
  } catch (err) {
    return { ok: false, activeShader: '', activeResourcePacks: [], error: err.message };
  }
});

ipcMain.handle('packs:export-mrpack', async (_e, params = {}) => {
  try {
    const rawTitle = String(params.packName || 'BlockWay-Modpack').trim();
    const safeFileStem = rawTitle.replace(/[^A-Za-z0-9._ -]/g, '_').trim() || 'BlockWay-Modpack';
    const mcVer = String(params.mcVersion || '1.21.4').trim();
    const saveRes = await dialog.showSaveDialog(mainWindow, {
      title: 'Đóng gói & Xuất bộ Modpack chuẩn Modrinth (.mrpack) chia sẻ cho bạn bè / quán Net',
      defaultPath: `${safeFileStem}-${mcVer}.mrpack`,
      filters: [{ name: 'Modrinth Modpack (.mrpack)', extensions: ['mrpack'] }]
    });
    if (saveRes.canceled || !saveRes.filePath) return { ok: false, canceled: true };
    const out = await exportTargetAsMrpack({
      ...params,
      destFilePath: saveRes.filePath
    }, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
    if (out?.ok && params.revealInExplorer !== false) {
      try { shell.showItemInFolder(saveRes.filePath); } catch (_) {}
    }
    return out;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('cleaner:scan', async (_e, { gameDir, includeDisabledMods = false } = {}) => {
  try {
    return scanMinecraftJunk(gameDir, { includeDisabledMods: Boolean(includeDisabledMods) });
  } catch (err) {
    return { ok: false, error: err.message, totalMB: 0, totalCount: 0 };
  }
});

ipcMain.handle('cleaner:run', async (_e, { gameDir, includeDisabledMods = false } = {}) => {
  try {
    return cleanMinecraftJunk(gameDir, { includeDisabledMods: Boolean(includeDisabledMods) });
  } catch (err) {
    return { ok: false, error: err.message, freedMB: 0, deletedItems: 0 };
  }
});

/* ============================================================================
   v40.6 PRO — TWEAKER & KEYBINDS, ADDON UPDATER + ROLLBACK, WORLD STORE,
               CO-OP VOICE/TEAM PACK & SMART RAM/JVM COACH
   ============================================================================ */
ipcMain.handle('tweaker:read', async (_e, params = {}) => {
  try {
    return readGameOptionsAndKeybinds(params || {});
  } catch (err) {
    return { ok: false, error: err.message, conflicts: [], keybinds: [] };
  }
});

ipcMain.handle('tweaker:save', async (_e, params = {}) => {
  try {
    return saveGameOptionsAndKeybinds(params || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('tweaker:resolve-keys', async (_e, params = {}) => {
  try {
    return autoResolveKeybindConflicts(params || {});
  } catch (err) {
    return { ok: false, error: err.message, resolvedCount: 0, changes: [] };
  }
});

ipcMain.handle('tweaker:fullbright', async (_e, params = {}) => {
  try {
    return await toggleFullbrightPack(params || {}, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('addons:check-updates', async (_e, params = {}) => {
  try {
    return await checkLocalAddonsUpdates(params || {});
  } catch (err) {
    return { ok: false, error: err.message, updatesCount: 0, rollbackCount: 0, itemsMap: {} };
  }
});

ipcMain.handle('addons:update', async (_e, params = {}) => {
  try {
    return await updateLocalAddons(params || {}, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
  } catch (err) {
    return { ok: false, error: err.message, updated: [], failed: [] };
  }
});

ipcMain.handle('addons:rollback', async (_e, params = {}) => {
  try {
    return rollbackLocalAddon(params || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('worldstore:search', async (_e, params = {}) => {
  try {
    return await searchWorldAndDatapackStore(params || {});
  } catch (err) {
    return { ok: false, error: err.message, total: 0, items: [] };
  }
});

ipcMain.handle('worldstore:install', async (_e, params = {}) => {
  try {
    return await installStoreWorldOrDatapack(params || {}, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('worlds:datapacks-list', async (_e, { gameDir, worldNameOrPath } = {}) => {
  try {
    return listWorldDatapacks(gameDir, worldNameOrPath);
  } catch (err) {
    return { ok: false, error: err.message, items: [] };
  }
});

ipcMain.handle('worlds:datapack-delete', async (_e, { gameDir, worldNameOrPath, fileName } = {}) => {
  try {
    return deleteWorldDatapack(gameDir, worldNameOrPath, fileName);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('coop:install-combo', async (_e, params = {}) => {
  try {
    return await installCoopComboPack(params || {}, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
  } catch (err) {
    return { ok: false, error: err.message, installed: [] };
  }
});

ipcMain.handle('coach:analyze', async (_e, params = {}) => {
  try {
    return computeSmartRamAndJvmAdvice(params || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/* ============================================================================
   v40.7 PRO — ONLINE SKIN HUB & FRIEND SYNC, LUNAR PVP HUD MODE,
               WORLD NBT RESCUE & SEED VAULT, REPLAY STUDIO + FFMPEG
   ============================================================================ */
ipcMain.handle('skins:search-online', async (_e, params = {}) => {
  try {
    return await searchOnlineSkins(params || {});
  } catch (err) {
    return { ok: false, error: err.message, items: [] };
  }
});

ipcMain.handle('skins:apply-online', async (_e, params = {}) => {
  try {
    return await applyOnlineSkinToWardrobe(params || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('skins:install-friend-sync', async (_e, params = {}) => {
  try {
    return await installFriendSkinSyncPack(params || {}, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
  } catch (err) {
    return { ok: false, error: err.message, installed: [] };
  }
});

ipcMain.handle('pvp:state', async (_e, params = {}) => {
  try {
    return getPvpClientModeState(params || {});
  } catch (err) {
    return { ok: false, error: err.message, enabled: false, activeMods: [] };
  }
});

ipcMain.handle('pvp:toggle', async (_e, params = {}) => {
  try {
    return await togglePvpClientMode(params || {}, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('worlds:inspect', async (_e, params = {}) => {
  try {
    return inspectLocalWorldDetails(params || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('worlds:rescue-patch', async (_e, params = {}) => {
  try {
    return rescuePatchLocalWorld(params || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('worlds:seeds-vault', async () => {
  try {
    return getCuratedSeedsVault();
  } catch (err) {
    return { ok: false, error: err.message, seeds: [] };
  }
});

ipcMain.handle('worlds:create-quick', async (_e, params = {}) => {
  try {
    return await createStandaloneQuickWorld(params || {}, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('replay:status', async (_e, params = {}) => {
  try {
    return getReplayStudioStatus(params || {});
  } catch (err) {
    return { ok: false, error: err.message, equipped: false };
  }
});

ipcMain.handle('replay:install', async (_e, params = {}) => {
  try {
    return await installReplayStudioPack(params || {}, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
  } catch (err) {
    return { ok: false, error: err.message, installed: [] };
  }
});

ipcMain.handle('sys:copy-text', async (_e, text = '') => {
  try {
    clipboard.writeText(String(text ?? '').slice(0, 4096));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/* ===================== v40.8 PRO — Áo choàng tự chọn, Kéo-thả cài đặt, Chia sẻ log lỗi ===================== */
ipcMain.handle('cape:upload-local', async (_e, gameDir, username) => {
  try {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Chọn ảnh Áo choàng (Cape) .png — tỉ lệ 2:1, VD 64x32',
      properties: ['openFile'],
      filters: [{ name: 'Minecraft Cape PNG', extensions: ['png'] }]
    });
    if (res.canceled || !res.filePaths?.length) return { ok: false, canceled: true };
    return saveCustomLocalCape(gameDir, username, res.filePaths[0]);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('cape:get-local', async (_e, gameDir, username) => {
  try { return getCustomLocalCape(gameDir, username); } catch (err) { return { ok: false, error: err.message, dataUrl: '' }; }
});

ipcMain.handle('cape:remove-local', async (_e, gameDir, username) => {
  try { return removeCustomLocalCape(gameDir, username); } catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('addons:install-dropped', async (_e, { gameDir, instanceDir = '', filePaths = [], currentLoader = '', currentMcVersion = '' } = {}) => {
  const engine = require('./launcher-engine');
  const results = [];
  for (const fp of (Array.isArray(filePaths) ? filePaths : []).slice(0, 20)) {
    try {
      results.push(engine.installDroppedAddonFile({
        gameDir,
        instanceDir,
        filePath: String(fp || ''),
        currentLoader,
        currentMcVersion
      }));
    } catch (err) {
      results.push({ ok: false, fileName: path.basename(String(fp || '')), error: err.message });
    }
  }
  return { ok: results.some((r) => r.ok), results };
});

function redactLogForSharing(text) {
  let s = String(text || '');
  const escapeRe = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const home = os.homedir();
    if (home && home.length > 3) {
      for (const variant of new Set([home, home.replace(/\\/g, '/'), home.replace(/\\/g, '\\\\')])) {
        s = s.replace(new RegExp(escapeRe(variant), 'gi'), '~');
      }
    }
    const user = os.userInfo().username;
    if (user && user.length >= 3) {
      s = s.replace(new RegExp(`([\\\\/]Users[\\\\/])${escapeRe(user)}(?=[\\\\/])`, 'gi'), '$1<user>');
      s = s.replace(new RegExp(`\\b${escapeRe(user)}\\b`, 'gi'), '<user>');
    }
  } catch (_) {}
  s = s.replace(/(--(?:accessToken|clientId|xuid|session)\s+)\S+/gi, '$1<hidden>');
  s = s.replace(/("?(?:accessToken|access_token|refresh_token|session|token)"?\s*[:=]\s*"?)[\w.\-]{12,}/gi, '$1<hidden>');
  s = s.replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, '<hidden-token>');
  s = s.replace(/\b(?!127\.0\.0\.1\b)(?!0\.0\.0\.0\b)(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, '<ip>');
  return s;
}

function postToMclogs(content) {
  return new Promise((resolve, reject) => {
    const body = `content=${encodeURIComponent(content)}`;
    const req = https.request({
      hostname: 'api.mclo.gs',
      path: '/1/log',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': `BlockWayLauncher/${app.getVersion()}`
      },
      timeout: 20000
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j && j.success && j.url) resolve(j);
          else reject(new Error(j?.error || `mclo.gs trả về mã ${res.statusCode}`));
        } catch (_) {
          reject(new Error(`mclo.gs trả về dữ liệu không hợp lệ (mã ${res.statusCode})`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Hết thời gian kết nối tới mclo.gs')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

ipcMain.handle('crash:share-log', async (_e, { gameDir, fallbackText = '' } = {}) => {
  try {
    const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
    const parts = [];
    const latestLog = path.join(rootDir, 'logs', 'latest.log');
    const latestMtime = fs.existsSync(latestLog) ? fs.statSync(latestLog).mtimeMs : 0;
    const crashDir = path.join(rootDir, 'crash-reports');
    if (fs.existsSync(crashDir)) {
      const newest = fs.readdirSync(crashDir)
        .filter((f) => /\.txt$/i.test(f))
        .map((f) => ({ f, t: fs.statSync(path.join(crashDir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)[0];
      if (newest && (!latestMtime || newest.t >= latestMtime - 5 * 60 * 1000)) {
        parts.push(`===== crash-reports/${newest.f} =====\n${fs.readFileSync(path.join(crashDir, newest.f), 'utf8')}`);
      }
    }
    if (latestMtime) parts.push(`===== logs/latest.log =====\n${fs.readFileSync(latestLog, 'utf8')}`);
    if (!parts.length && fallbackText) parts.push(String(fallbackText));
    if (!parts.length) return { ok: false, error: 'Chưa có nhật ký nào để chia sẻ — hãy mở game một lần trước.' };
    let content = redactLogForSharing(parts.join('\n\n'));
    const lines = content.split(/\r?\n/);
    if (lines.length > 24000) content = lines.slice(-24000).join('\n');
    if (Buffer.byteLength(content) > 9 * 1024 * 1024) content = content.slice(-9 * 1024 * 1024);
    const r = await postToMclogs(content);
    try { clipboard.writeText(r.url); } catch (_) {}
    return { ok: true, url: r.url, id: r.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/* ===================== v40.9 PRO — Đóng Gói Gửi Bạn 2.0 & Trợ Lý OptiFine ===================== */
ipcMain.handle('packs:preview-export', async (_e, params = {}) => {
  try {
    return previewExportTarget({ ...(params || {}), gameDir: resolveUserGameDir(params?.gameDir) });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('optifine:install-parity', async (_e, params = {}) => {
  try {
    return await installOptifineParityPack(
      { ...(params || {}), gameDir: resolveUserGameDir(params?.gameDir) },
      (st) => { mainWindow?.webContents.send('mc:status', st); }
    );
  } catch (err) {
    return { ok: false, error: err.message, installed: [] };
  }
});

ipcMain.handle('optifine:pick-jar', async (_e, params = {}) => {
  try {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Chọn tệp OptiFine_*.jar đã tải từ optifine.net',
      properties: ['openFile'],
      filters: [{ name: 'OptiFine JAR', extensions: ['jar'] }]
    });
    if (res.canceled || !res.filePaths?.length) return { ok: false, canceled: true };
    return installOptifineJarSmart({
      ...(params || {}),
      gameDir: resolveUserGameDir(params?.gameDir),
      filePath: res.filePaths[0],
      action: params.action || 'auto'
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('optifine:handle-jar', async (_e, params = {}) => {
  try {
    const resolvedGameDir = resolveUserGameDir(params?.gameDir);
    if (params.action === 'run-installer') {
      const fp = String(params.filePath || '');
      if (!fp || !fs.existsSync(fp)) return { ok: false, error: 'Không tìm thấy tệp OptiFine.jar.' };
      const { spawn } = require('child_process');
      let javaBin = detectJavaPath(21, resolvedGameDir) || detectJavaPath(17, resolvedGameDir) || detectJavaPath(8, resolvedGameDir) || 'java';
      if (javaBin && /javaw\.exe$/i.test(javaBin)) {
        const cliJava = javaBin.replace(/javaw\.exe$/i, 'java.exe');
        if (fs.existsSync(cliJava)) javaBin = cliJava;
      }
      const child = spawn(javaBin, ['-jar', fp], {
        cwd: path.dirname(fp),
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      return { ok: true, kind: 'installer-launched' };
    }
    return installOptifineJarSmart({ ...(params || {}), gameDir: resolvedGameDir });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ui:set-scale', async (_e, scale = 1.0) => {
  try {
    const clamped = Math.max(0.85, Math.min(1.35, Number(scale) || 1.0));
    global.__bwUserUiScale = clamped;
    if (typeof global.__bwApplyUiZoom === 'function') global.__bwApplyUiZoom();
    return { ok: true, scale: clamped };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});



