const { Client } = require('minecraft-launcher-core');
const Handler = require('minecraft-launcher-core/components/handler');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, exec } = require('child_process');
const { createOfflineAuth, authenticateMicrosoftFromRefreshToken } = require('./microsoft-auth');

https.globalAgent.maxSockets = 64;
http.globalAgent.maxSockets = 64;

let fastSkipEnabled = true;
let activeMcProcess = null;
let fastExitTimer = null;

const origCheckSum = Handler.prototype.checkSum;
Handler.prototype.checkSum = async function (hash, file) {
  if (fastSkipEnabled) {
    try {
      const st = fs.statSync(file);
      if (st.size > 0) return true;
    } catch (_) {}
  }
  return origCheckSum.call(this, hash, file);
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'AetherCraft-Launcher/5.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchJson(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        }
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = fs.createWriteStream(destPath);
    https
      .get(url, { headers: { 'User-Agent': 'AetherCraft-Launcher/5.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          file.close();
          return reject(new Error(`Download failed HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      })
      .on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
  });
}

function getDefaultGameDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), '.minecraft');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'minecraft');
  }
  return path.join(os.homedir(), '.minecraft');
}

function detectJavaPath() {
  if (process.platform === 'win32') {
    const candidates = [
      process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'javaw.exe') : null,
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Microsoft',
      'C:\\Program Files\\BellSoft',
      'C:\\Program Files\\Zulu'
    ].filter(Boolean);

    for (const item of candidates) {
      if (item.endsWith('.exe') && fs.existsSync(item)) return item;
      if (fs.existsSync(item)) {
        try {
          const subdirs = fs.readdirSync(item);
          for (const sub of subdirs.reverse()) {
            const javaw = path.join(item, sub, 'bin', 'javaw.exe');
            if (fs.existsSync(javaw)) return javaw;
          }
        } catch (_) {}
      }
    }
  }
  return 'java';
}

// Smooth Exit & RAM Optimizer (Trims Working Set & Cleans Java Temp Locks)
function cleanupJavaTempAndTrimRam() {
  try {
    const tmp = os.tmpdir();
    const entries = fs.readdirSync(tmp);
    for (const name of entries) {
      if (name.startsWith('jna-') || name.startsWith('hsperfdata_')) {
        try {
          fs.rmSync(path.join(tmp, name), { recursive: true, force: true });
        } catch (_) {}
      }
    }
  } catch (_) {}

  if (process.platform === 'win32') {
    // Trim WorkingSet of current process & lingering javaw processes via Win32 psapi.dll
    const psCmd = `powershell -NoProfile -WindowStyle Hidden -Command "$sig='[DllImport(\\"psapi.dll\\")]public static extern bool EmptyWorkingSet(IntPtr h);';$t=Add-Type -MemberDefinition $sig -Name WS -Namespace Win32 -PassThru -ErrorAction SilentlyContinue;Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue | ForEach-Object { $t::EmptyWorkingSet($_.Handle) | Out-Null }"`;
    exec(psCmd, () => {});
  }
}

function forceKillMinecraft() {
  if (fastExitTimer) {
    clearTimeout(fastExitTimer);
    fastExitTimer = null;
  }
  if (activeMcProcess && activeMcProcess.pid) {
    const pid = activeMcProcess.pid;
    activeMcProcess = null;
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
      } catch (_) {}
    } else {
      try {
        process.kill(pid, 'SIGKILL');
      } catch (_) {}
    }
    cleanupJavaTempAndTrimRam();
    return true;
  }
  if (process.platform === 'win32') {
    try {
      execSync('taskkill /F /IM javaw.exe', { stdio: 'ignore' });
    } catch (_) {}
  }
  cleanupJavaTempAndTrimRam();
  return true;
}

// Multi-Core + Smooth-Exit JVM Arguments
// Uses -Xms512M (via memory.min) and G1PeriodicGCInterval so Java never hogs RAM or causes pagefile freeze when closing!
function buildMultiCoreSmoothExitArgs(ramGB, cpuCores = os.cpus().length) {
  const parallelThreads = Math.max(2, Math.min(12, cpuCores));
  const concThreads = Math.max(1, Math.floor(parallelThreads / 2));

  return [
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+UseG1GC',
    `-XX:ParallelGCThreads=${parallelThreads}`,
    `-XX:ConcGCThreads=${concThreads}`,
    '-XX:+ParallelRefProcEnabled',
    '-XX:MaxGCPauseMillis=35',
    '-XX:+DisableExplicitGC',
    '-XX:+AlwaysPreTouch',
    '-XX:G1NewSizePercent=28',
    '-XX:G1MaxNewSizePercent=40',
    '-XX:G1HeapRegionSize=8M',
    '-XX:G1ReservePercent=15',
    '-XX:G1HeapWastePercent=5',
    '-XX:G1MixedGCCountTarget=4',
    '-XX:InitiatingHeapOccupancyPercent=15',
    '-XX:G1MixedGCLiveThresholdPercent=90',
    '-XX:G1RSetUpdatingPauseTimePercent=5',
    '-XX:SurvivorRatio=32',
    '-XX:+PerfDisableSharedMem',
    '-XX:MaxTenuringThreshold=1',
    // Smooth Exit & Continuous RAM Release Flags:
    '-XX:G1PeriodicGCInterval=15000',
    '-XX:+G1PeriodicGCInvokesConcurrent',
    '-XX:MaxHeapFreeRatio=38',
    '-XX:MinHeapFreeRatio=15',
    '-XX:-OmitStackTraceInFastThrow',
    '-Dfml.ignoreInvalidMinecraftCertificates=true',
    '-Dfml.ignorePatchDiscrepancies=true',
    '-Dminecraft.launcher.brand=AetherCraft-v5'
  ];
}

async function fetchVersionManifest() {
  const manifest = await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
  return {
    latest: manifest.latest,
    versions: manifest.versions.map((v) => ({
      id: v.id,
      type: v.type,
      releaseTime: v.releaseTime
    }))
  };
}

async function fetchLoaderVersions(mcVersion, loaderType) {
  if (loaderType === 'vanilla') return [];

  if (loaderType === 'fabric') {
    try {
      const list = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`);
      return list.slice(0, 12).map((item) => ({
        version: item.loader.version,
        stable: item.loader.stable !== false
      }));
    } catch (_) {
      return [];
    }
  }

  if (loaderType === 'quilt') {
    try {
      const list = await fetchJson(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mcVersion)}`);
      return list.slice(0, 12).map((item) => ({
        version: item.loader.version,
        stable: !item.loader.version.includes('beta')
      }));
    } catch (_) {
      return [];
    }
  }

  if (loaderType === 'legacyfabric') {
    try {
      const list = await fetchJson(`https://meta.legacyfabric.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`);
      return list.slice(0, 10).map((item) => ({
        version: item.loader.version,
        stable: true
      }));
    } catch (_) {
      return [];
    }
  }

  if (loaderType === 'forge') {
    try {
      const promos = await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
      const rec = promos.promos?.[`${mcVersion}-recommended`];
      const lat = promos.promos?.[`${mcVersion}-latest`];
      const out = [];
      if (rec) out.push({ version: rec, stable: true, label: 'Recommended' });
      if (lat && lat !== rec) out.push({ version: lat, stable: false, label: 'Latest' });
      return out;
    } catch (_) {
      return [];
    }
  }

  return [];
}

async function prepareCustomLoaderJson(gameDir, mcVersion, loaderType, loaderVersion, onStatus) {
  if (loaderType === 'vanilla') return null;

  let loaderVer = loaderVersion;
  if (!loaderVer) {
    const available = await fetchLoaderVersions(mcVersion, loaderType);
    if (!available.length) {
      throw new Error(`Core "${loaderType.toUpperCase()}" chưa hỗ trợ phiên bản ${mcVersion}. Hãy chọn Vanilla hoặc bản khác.`);
    }
    loaderVer = available[0].version;
  }

  if (loaderType === 'fabric' || loaderType === 'quilt' || loaderType === 'legacyfabric') {
    const customId = `${loaderType}-loader-${loaderVer}-${mcVersion}`;
    const versionDir = path.join(gameDir, 'versions', customId);
    const jsonPath = path.join(versionDir, `${customId}.json`);

    if (!fs.existsSync(jsonPath)) {
      onStatus?.(`Đang đồng bộ Core ${loaderType.toUpperCase()} (${loaderVer}) cho ${mcVersion}...`);
      let profileUrl = '';
      if (loaderType === 'fabric') {
        profileUrl = `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVer)}/profile/json`;
      } else if (loaderType === 'quilt') {
        profileUrl = `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVer)}/profile/json`;
      } else {
        profileUrl = `https://meta.legacyfabric.net/v2/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVer)}/profile/json`;
      }
      const profileJson = await fetchJson(profileUrl);
      profileJson.id = customId;
      fs.mkdirSync(versionDir, { recursive: true });
      fs.writeFileSync(jsonPath, JSON.stringify(profileJson, null, 2), 'utf8');
    }
    return { type: 'customJson', customId };
  }

  if (loaderType === 'forge') {
    const fullForgeVer = `${mcVersion}-${loaderVer}`;
    const forgeDir = path.join(gameDir, 'forge-installers');
    const installerJar = path.join(forgeDir, `forge-${fullForgeVer}-installer.jar`);
    if (!fs.existsSync(installerJar)) {
      onStatus?.(`Đang tải gói Forge Core ${fullForgeVer}...`);
      const forgeUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullForgeVer}/forge-${fullForgeVer}-installer.jar`;
      await downloadFile(forgeUrl, installerJar);
    }
    return { type: 'forgeJar', installerJar };
  }

  return null;
}

function configureCrackSkinSupport(gameDir, username) {
  try {
    const cslDir = path.join(gameDir, 'CustomSkinLoader');
    if (!fs.existsSync(cslDir)) fs.mkdirSync(cslDir, { recursive: true });
    const cslConfig = {
      enable: true,
      loadlist: [
        { name: 'Mojang', type: 'MojangAPI' },
        { name: 'LittleSkin', type: 'CustomSkinAPI', root: 'https://littleskin.cn/csl/' },
        { name: 'ElyBy', type: 'ElyByAPI' },
        { name: 'LocalSkin', type: 'Legacy', checkPNG: false, skin: `LocalSkin/skins/${username}.png` }
      ]
    };
    fs.writeFileSync(path.join(cslDir, 'CustomSkinLoader.json'), JSON.stringify(cslConfig, null, 2), 'utf8');
  } catch (_) {}
}

async function launchMinecraft(options, callbacks) {
  const {
    authMode = 'crack',
    username = 'Player',
    msProfile = null,
    crackSkinSync = true,
    mcVersion = '1.21.4',
    loaderType = 'vanilla',
    loaderVersion = '',
    ramGB = 4,
    javaPath = '',
    gameDir = '',
    useAikarFlags = true,
    fastSkipHash = true,
    cpuCores = os.cpus().length,
    serverIp = ''
  } = options;

  fastSkipEnabled = Boolean(fastSkipHash);

  const rootDir = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  if (!fs.existsSync(rootDir)) {
    fs.mkdirSync(rootDir, { recursive: true });
  }

  let authorization;
  if (authMode === 'microsoft' && msProfile && msProfile.accessToken) {
    callbacks.onStatus?.(`Đang xác thực tài khoản Bản Quyền Microsoft (${msProfile.name})...`);
    let activeProfile = msProfile;
    if (msProfile.refreshToken) {
      try {
        activeProfile = await authenticateMicrosoftFromRefreshToken(msProfile.refreshToken);
      } catch (_) {
        activeProfile = msProfile;
      }
    }
    authorization = {
      access_token: activeProfile.accessToken,
      client_token: activeProfile.uuid,
      uuid: activeProfile.uuid,
      name: activeProfile.name,
      user_properties: '{}',
      meta: {
        type: 'msa',
        demo: false
      }
    };
  } else {
    const cleanName = (username || 'Player').trim().slice(0, 16) || 'Player';
    callbacks.onStatus?.(`Đang khởi tạo chế độ Crack / Offline (UUID v3) cho "${cleanName}"...`);
    authorization = createOfflineAuth(cleanName);
    if (crackSkinSync) {
      configureCrackSkinSupport(rootDir, cleanName);
    }
  }

  const loaderPrep = await prepareCustomLoaderJson(
    rootDir,
    mcVersion,
    loaderType,
    loaderVersion,
    callbacks.onStatus
  );

  const resolvedJava = javaPath && javaPath.trim() ? javaPath.trim() : detectJavaPath();
  const customArgs = useAikarFlags ? buildMultiCoreSmoothExitArgs(ramGB, cpuCores) : [];

  // Optional Direct Server Quick-Join
  if (serverIp && serverIp.trim()) {
    const cleanHost = serverIp.trim();
    const [host, port] = cleanHost.split(':');
    customArgs.push(`--quickPlayMultiplayer=${cleanHost}`);
  }

  const launcher = new Client();

  const launchOpts = {
    authorization,
    root: rootDir,
    version: {
      number: mcVersion,
      type: mcVersion.includes('w') || mcVersion.includes('pre') || mcVersion.includes('rc') ? 'snapshot' : 'release'
    },
    memory: {
      max: `${ramGB}G`,
      min: '512M' // Dynamic low initial heap prevents Windows pagefile thrashing & exit stutter!
    },
    javaPath: resolvedJava === 'java' ? undefined : resolvedJava,
    customArgs,
    overrides: {
      maxSockets: 64
    }
  };

  if (serverIp && serverIp.trim()) {
    const [host, port] = serverIp.trim().split(':');
    launchOpts.quickPlay = {
      type: 'multiplayer',
      identifier: serverIp.trim()
    };
    launchOpts.server = {
      host,
      port: port || '25565'
    };
  }

  if (loaderPrep?.type === 'customJson') {
    launchOpts.version.custom = loaderPrep.customId;
  } else if (loaderPrep?.type === 'forgeJar') {
    launchOpts.forge = loaderPrep.installerJar;
  }

  let gameWindowNotified = false;

  launcher.on('debug', (msg) => callbacks.onLog?.(`[DEBUG] ${msg}`));
  launcher.on('data', (msg) => {
    const line = String(msg).trim();
    callbacks.onLog?.(line);

    // Detect when Minecraft window is up -> trigger Zero-RAM Hibernate mode in Launcher
    if (!gameWindowNotified && (line.includes('LWJGL') || line.includes('OpenAL initialized') || line.includes('Sound engine started') || line.includes('Created: '))) {
      gameWindowNotified = true;
      callbacks.onGameWindowReady?.();
    }

    // SMOOTH INSTANT EXIT HOOK:
    // As soon as Minecraft finishes saving worlds and logs "Stopping!" or "SoundSystem shutting down",
    // kill lingering threads after 650ms so the game window closes with ZERO freeze!
    if (line.includes('Stopping!') || line.includes('SoundSystem shutting down') || line.includes(' ThreadedAnvilChunkStorage: All dimensions are saved')) {
      if (!fastExitTimer) {
        fastExitTimer = setTimeout(() => {
          forceKillMinecraft();
        }, 650);
      }
    }
  });

  launcher.on('progress', (e) => {
    const pct = e.total > 0 ? Math.min(100, Math.round((e.task / e.total) * 100)) : 0;
    callbacks.onProgress?.({
      type: e.type,
      task: e.task,
      total: e.total,
      percent: pct
    });
  });

  launcher.on('close', (code) => {
    if (fastExitTimer) {
      clearTimeout(fastExitTimer);
      fastExitTimer = null;
    }
    activeMcProcess = null;
    cleanupJavaTempAndTrimRam();
    callbacks.onClose?.(code);
  });

  callbacks.onStatus?.(
    `Đang khởi chạy Minecraft ${mcVersion} (${loaderType.toUpperCase()}) • Smooth-Exit Engine...`
  );

  const proc = await launcher.launch(launchOpts);
  activeMcProcess = proc;

  // Fallback timer in case stdout doesn't emit LWJGL line
  setTimeout(() => {
    if (!gameWindowNotified && activeMcProcess) {
      gameWindowNotified = true;
      callbacks.onGameWindowReady?.();
    }
  }, 6000);

  return proc;
}

module.exports = {
  fetchVersionManifest,
  fetchLoaderVersions,
  launchMinecraft,
  forceKillMinecraft,
  cleanupJavaTempAndTrimRam,
  getDefaultGameDir,
  detectJavaPath
};