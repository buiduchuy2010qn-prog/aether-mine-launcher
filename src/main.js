const { app, BrowserWindow, ipcMain, shell, dialog, nativeImage, clipboard } = require('electron');
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
  exportTargetAsMrpack, scanMinecraftJunk, cleanMinecraftJunk
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
  return 'BlockWay Launcher — v40.5.0 PRO';
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
    state: 'Every World, One Place • v40.5.0 PRO',
    timestamps: { start: launcherBootEpochSec },
    assets: {
      large_image: 'https://buiduchuy2010qn-prog.github.io/blockway-launcher/app-logo.png',
      large_text: 'BlockWay Launcher v40.5.0 PRO'
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
      large_text: 'BlockWay Launcher v40.5.0 PRO'
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
    if (process.platform === 'win32' && fs.existsSync(activeIco)) {
      const { exec } = require('child_process');
      const exePathEsc = (process.execPath || '').replace(/'/g, "''");
      const icoEsc = activeIco.replace(/'/g, "''");
      const psUpdateShortcuts = `powershell -NoProfile -WindowStyle Hidden -Command "$ws = New-Object -ComObject WScript.Shell; $dt = [Environment]::GetFolderPath('Desktop'); $tb = Join-Path $env:APPDATA 'Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar'; @($dt, [Environment]::GetFolderPath('Programs'), $tb) | Where-Object { Test-Path $_ } | ForEach-Object { Get-ChildItem -Path $_ -Include '*Aether*.lnk','*BlockWay*.lnk' -Recurse -File -ErrorAction SilentlyContinue } | ForEach-Object { try { $s = $ws.CreateShortcut($_.FullName); $s.IconLocation = '${icoEsc},0'; $s.Description = 'BlockWay Launcher'; $s.Save(); if ($_.Name -like '*Aether*') { $newName = Join-Path $_.DirectoryName 'BlockWay Launcher.lnk'; if (-not (Test-Path $newName)) { Rename-Item -Path $_.FullName -NewName 'BlockWay Launcher.lnk' -ErrorAction SilentlyContinue } } } catch {} }; try { $bw = Join-Path $dt 'BlockWay Launcher.lnk'; $s2 = $ws.CreateShortcut($bw); $s2.TargetPath = '${exePathEsc}'; $s2.IconLocation = '${icoEsc},0'; $s2.Description = 'BlockWay Launcher'; $s2.Save() } catch {}"`;
      exec(psUpdateShortcuts, () => {});
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
  try {
    if (fs.existsSync(configPath)) {
      const rawCfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (rawCfg && typeof rawCfg.theme === 'string') savedTheme = rawCfg.theme;
    }
  } catch (_) {}
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

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 1020,
    minHeight: 660,
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

  // Auto-scale UI: khi cửa sổ nhỏ hơn kích thước thiết kế, thu nhỏ toàn bộ giao diện
  // theo tỉ lệ (giữ nguyên bố cục như lúc full) thay vì xếp lại các cột.
  const UI_DESIGN_W = 1380;
  const UI_DESIGN_H = 875;
  let uiZoomTimer = null;
  const applyUiAutoZoom = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const [cw, ch] = mainWindow.getContentSize();
      const z = Math.max(0.5, Math.min(1, cw / UI_DESIGN_W, ch / UI_DESIGN_H));
      const zr = Math.round(z * 1000) / 1000;
      if (Math.abs(mainWindow.webContents.getZoomFactor() - zr) > 0.002) {
        mainWindow.webContents.setZoomFactor(zr);
      }
    } catch (_) {}
  };
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
    try { delete require.cache[require.resolve('./launcher-engine')]; } catch (_) {}
    const freshEngine = require('./launcher-engine');
    hideOnLaunchSetting = config.hideLauncherOnPlay !== false;
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
    let downloadUrl = `https://github.com/buiduchuy2010qn-prog/${repoSlug}/releases/download/v${latestVersion}/BlockWay-Launcher-Setup-${latestVersion}.exe`;

    try {
      const relInfo = await fetchJsonSimple(`https://api.github.com/repos/buiduchuy2010qn-prog/${repoSlug}/releases/latest?t=${Date.now()}`);
      const relVer = String(relInfo?.tag_name || '').replace(/^v/i, '');
      if (relVer && compareSemver(relVer, latestVersion) > 0) {
        latestVersion = relVer;
      }
      if (Array.isArray(relInfo?.assets)) {
        const exeAsset = relInfo.assets.find((a) => typeof a?.browser_download_url === 'string' && /\.exe$/i.test(a.name || a.browser_download_url));
        if (exeAsset?.browser_download_url) {
          downloadUrl = exeAsset.browser_download_url;
        }
      }
    } catch (_) {}

    const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;
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
      const { repoSlug, refBranch } = await resolveGitHubRepoAndRef();
      const fallbackFiles = [
        'package.json',
        'src/main.js',
        'src/preload.js',
        'src/launcher-engine.js',
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
      try {
        const manBuf = await fetchBinaryBuffer(`${baseRaw}/ota-manifest.json?t=${Date.now()}`);
        const manJson = JSON.parse(manBuf.toString('utf8'));
        if (manJson && Array.isArray(manJson.files) && manJson.files.length >= 8) {
          manifestEntries = manJson.files.filter((e) => e && typeof e.path === 'string' && /^(package\.json|ota-manifest\.json|src\/[A-Za-z0-9._/-]+)$/.test(e.path) && !e.path.includes('..'));
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
    if (res?.ok && res?.room?.code && activeGamePresenceCtx) {
      setDiscordPlayingPresence({ ...activeGamePresenceCtx, coopCode: res.room.code });
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
      modBasket: basketRes.modBasket
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
    if (!modBasket.length) {
      return { ok: false, error: 'File này không chứa danh sách Giỏ Mod hợp lệ.' };
    }
    const targetMc = raw.mcVersion || params?.mcVersion || '1.21.4';
    const targetLoader = raw.loaderType || params?.loaderType || 'fabric';
    const syncRes = await syncCoopModBasket({
      gameDir: params?.gameDir,
      instanceDir: params?.instanceDir,
      mcVersion: targetMc,
      loaderType: targetLoader,
      modBasket
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
    return await exportTargetAsMrpack({
      ...params,
      destFilePath: saveRes.filePath
    }, (st) => {
      mainWindow?.webContents.send('mc:status', st);
    });
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


