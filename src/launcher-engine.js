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
      .get(url, { headers: { 'User-Agent': 'AetherCraft-Launcher/8.0 (https://github.com/buiduchuy2010qn-prog)' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          res.resume();
          return fetchJson(nextUrl).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
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
      .get(url, { headers: { 'User-Agent': 'AetherCraft-Launcher/8.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          const nextUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          res.resume();
          return downloadFile(nextUrl, destPath).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          file.close();
          res.resume();
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
    '-XX:G1PeriodicGCInterval=15000',
    '-XX:+G1PeriodicGCInvokesConcurrent',
    '-XX:MaxHeapFreeRatio=38',
    '-XX:MinHeapFreeRatio=15',
    '-XX:-OmitStackTraceInFastThrow',
    '-Dfml.ignoreInvalidMinecraftCertificates=true',
    '-Dfml.ignorePatchDiscrepancies=true',
    '-Dminecraft.launcher.brand=AetherCraft-v8'
  ];
}

function getInstalledVersions(gameDir) {
  const root = gameDir || getDefaultGameDir();
  const verDir = path.join(root, 'versions');
  if (!fs.existsSync(verDir)) return [];
  try {
    return fs.readdirSync(verDir).filter((name) => {
      const jsonP = path.join(verDir, name, `${name}.json`);
      return fs.existsSync(jsonP);
    });
  } catch (_) {
    return [];
  }
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
      throw new Error(`Core "${loaderType.toUpperCase()}" chưa hỗ trợ phiên bản ${mcVersion}. Hãy chọn Vanilla hoặc Fabric.`);
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

// === MODRINTH API V2: KHO MOD / SHADER / RESOURCE PACK & 1-CLICK FPS BOOST ===
async function searchModrinth({ query = '', projectType = 'mod', mcVersion = '1.21.4', loaderType = 'fabric' }) {
  const facets = [[`project_type:${projectType}`]];
  if (mcVersion) {
    facets.push([`versions:${mcVersion}`]);
  }
  if (projectType === 'mod') {
    const effectiveLoader = loaderType === 'vanilla' || loaderType === 'legacyfabric' ? 'fabric' : loaderType;
    facets.push([`categories:${effectiveLoader}`]);
  }
  const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&limit=18&index=downloads&facets=${encodeURIComponent(JSON.stringify(facets))}`;
  const res = await fetchJson(url);
  return (res.hits || []).map((h) => ({
    projectId: h.project_id,
    slug: h.slug,
    title: h.title,
    description: h.description,
    iconUrl: h.icon_url,
    downloads: h.downloads,
    author: h.author,
    categories: (h.categories || []).slice(0, 4)
  }));
}

async function installModrinthProject({ slug, projectType = 'mod', mcVersion = '1.21.4', loaderType = 'fabric', gameDir }, onStatus) {
  const rootDir = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  const folderMap = {
    mod: 'mods',
    shader: 'shaderpacks',
    resourcepack: 'resourcepacks'
  };
  const targetFolder = path.join(rootDir, folderMap[projectType] || 'mods');
  if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });

  const effectiveLoader = loaderType === 'vanilla' || loaderType === 'legacyfabric' ? 'fabric' : loaderType;
  let versionsUrl = `https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version?game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`;
  if (projectType === 'mod') {
    versionsUrl += `&loaders=${encodeURIComponent(JSON.stringify([effectiveLoader]))}`;
  }

  let verList = await fetchJson(versionsUrl);
  if (!Array.isArray(verList) || verList.length === 0) {
    // Fallback without strict game_version if minor subversion differs (e.g. 1.21.4 -> 1.21.x)
    const fallbackUrl = `https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version${projectType === 'mod' ? `?loaders=${encodeURIComponent(JSON.stringify([effectiveLoader]))}` : ''}`;
    verList = await fetchJson(fallbackUrl);
  }
  if (!Array.isArray(verList) || verList.length === 0) {
    throw new Error(`Không tìm thấy bản cài phù hợp cho "${slug}" trên ${mcVersion}.`);
  }

  const chosen = verList[0];
  const fileObj = chosen.files.find((f) => f.primary) || chosen.files[0];
  if (!fileObj || !fileObj.url) {
    throw new Error(`Gói "${slug}" không có file tải hợp lệ.`);
  }

  const destPath = path.join(targetFolder, fileObj.filename);
  onStatus?.(`Đang tải ${fileObj.filename}...`);
  await downloadFile(fileObj.url, destPath);
  return {
    ok: true,
    fileName: fileObj.filename,
    versionNumber: chosen.version_number,
    destPath
  };
}

async function installFpsBoostPack({ mcVersion = '1.21.4', loaderType = 'fabric', gameDir }, onStatus) {
  const effectiveLoader = loaderType === 'forge' ? 'forge' : 'fabric';
  const packSlugs =
    effectiveLoader === 'forge'
      ? ['embeddium', 'ferrite-core', 'entityculling', 'immediatelyfast']
      : ['fabric-api', 'sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'iris'];

  const installed = [];
  const errors = [];
  for (let i = 0; i < packSlugs.length; i++) {
    const slug = packSlugs[i];
    try {
      onStatus?.(`[${i + 1}/${packSlugs.length}] Đang cài gói tối ưu FPS: ${slug.toUpperCase()} (${mcVersion})...`);
      const res = await installModrinthProject(
        { slug, projectType: 'mod', mcVersion, loaderType: effectiveLoader, gameDir },
        onStatus
      );
      installed.push(res.fileName);
    } catch (e) {
      errors.push(`${slug}: ${e.message}`);
    }
  }
  return {
    ok: installed.length > 0,
    installed,
    errors,
    recommendedCore: effectiveLoader
  };
}

function listLocalAddons(gameDir, folderType = 'mods') {
  const rootDir = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  const safeFolder = ['mods', 'shaderpacks', 'resourcepacks'].includes(folderType) ? folderType : 'mods';
  const dir = path.join(rootDir, safeFolder);
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /\.(jar|zip)(\.disabled)?$/i.test(f))
      .map((f) => {
        const full = path.join(dir, f);
        let sizeKB = 0;
        try {
          sizeKB = Math.round(fs.statSync(full).size / 1024);
        } catch (_) {}
        return {
          name: f,
          cleanName: f.replace(/\.disabled$/i, ''),
          enabled: !f.toLowerCase().endsWith('.disabled'),
          sizeKB
        };
      });
  } catch (_) {
    return [];
  }
}

function toggleLocalAddon(gameDir, folderType, fileName) {
  const rootDir = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  const safeFolder = ['mods', 'shaderpacks', 'resourcepacks'].includes(folderType) ? folderType : 'mods';
  const cleanBase = path.basename(fileName);
  const fullPath = path.join(rootDir, safeFolder, cleanBase);
  if (!fs.existsSync(fullPath)) return { ok: false };
  const isDisabled = cleanBase.toLowerCase().endsWith('.disabled');
  const nextName = isDisabled ? cleanBase.replace(/\.disabled$/i, '') : `${cleanBase}.disabled`;
  const nextPath = path.join(rootDir, safeFolder, nextName);
  fs.renameSync(fullPath, nextPath);
  return { ok: true, newName: nextName, enabled: isDisabled };
}

function deleteLocalAddon(gameDir, folderType, fileName) {
  const rootDir = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  const safeFolder = ['mods', 'shaderpacks', 'resourcepacks'].includes(folderType) ? folderType : 'mods';
  const cleanBase = path.basename(fileName);
  const fullPath = path.join(rootDir, safeFolder, cleanBase);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
  return { ok: true };
}

function listLocalWorlds(gameDir) {
  const rootDir = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  const savesDir = path.join(rootDir, 'saves');
  if (!fs.existsSync(savesDir)) return [];
  try {
    return fs
      .readdirSync(savesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const wPath = path.join(savesDir, d.name);
        let lastPlayed = '';
        try {
          const st = fs.statSync(wPath);
          lastPlayed = st.mtime.toLocaleString('vi-VN');
        } catch (_) {}
        let iconDataUrl = null;
        const iconPath = path.join(wPath, 'icon.png');
        if (fs.existsSync(iconPath)) {
          try {
            iconDataUrl = `data:image/png;base64,${fs.readFileSync(iconPath).toString('base64')}`;
          } catch (_) {}
        }
        return {
          name: d.name,
          path: wPath,
          lastPlayed,
          iconDataUrl
        };
      });
  } catch (_) {
    return [];
  }
}

function saveCustomLocalSkin(gameDir, username, sourceFilePath) {
  const rootDir = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  const cleanName = (username || 'StevePlayer').replace(/[^a-zA-Z0-9_]/g, '') || 'StevePlayer';
  const buf = fs.readFileSync(sourceFilePath);
  const skinsDir = path.join(rootDir, 'CustomSkinLoader', 'LocalSkin', 'skins');
  if (!fs.existsSync(skinsDir)) fs.mkdirSync(skinsDir, { recursive: true });
  const targetPng = path.join(skinsDir, `${cleanName}.png`);
  fs.writeFileSync(targetPng, buf);
  configureCrackSkinSupport(rootDir, cleanName);
  return {
    ok: true,
    dataUrl: `data:image/png;base64,${buf.toString('base64')}`,
    savedPath: targetPng
  };
}

function configureCrackSkinSupport(gameDir, username) {
  try {
    const cslDir = path.join(gameDir, 'CustomSkinLoader');
    if (!fs.existsSync(cslDir)) fs.mkdirSync(cslDir, { recursive: true });
    const cslConfig = {
      enable: true,
      loadlist: [
        { name: 'LocalSkin', type: 'Legacy', root: 'LocalSkin/' },
        { name: 'Mojang', type: 'MojangAPI' },
        { name: 'ElyBy', type: 'ElyByAPI' },
        { name: 'LittleSkin', type: 'CustomSkinAPI', root: 'https://littleskin.cn/csl/' }
      ]
    };
    fs.writeFileSync(path.join(cslDir, 'CustomSkinLoader.json'), JSON.stringify(cslConfig, null, 2), 'utf8');
  } catch (_) {}
}

async function launchMinecraft(config, callbacks = {}) {
  const {
    authMode = 'crack',
    username = 'StevePlayer',
    crackSkinSync = true,
    msProfile = null,
    mcVersion = '1.21.4',
    loaderType = 'vanilla',
    loaderVersion = '',
    ramGB = 4,
    javaPath = '',
    gameDir = '',
    useAikarFlags = true,
    fastSkipHash = true,
    serverIp = '',
    cpuCores = os.cpus().length
  } = config;

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

  if (serverIp && serverIp.trim()) {
    const cleanHost = serverIp.trim();
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
      min: '512M'
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

    if (!gameWindowNotified && (line.includes('LWJGL') || line.includes('OpenAL initialized') || line.includes('Sound engine started') || line.includes('Created: '))) {
      gameWindowNotified = true;
      callbacks.onGameWindowReady?.();
    }

    if (line.includes('Stopping!') || line.includes('SoundSystem shutting down') || line.includes('ThreadedAnvilChunkStorage: All dimensions are saved')) {
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
};