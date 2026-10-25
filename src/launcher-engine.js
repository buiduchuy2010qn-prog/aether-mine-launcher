const { Client } = require('minecraft-launcher-core');
const Handler = require('minecraft-launcher-core/components/handler');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const { execSync, exec, spawn } = require('child_process');
const msAuth = require('./microsoft-auth');

https.globalAgent.maxSockets = 64;
http.globalAgent.maxSockets = 64;

let fastSkipEnabled = true;
let activeMcProcess = null;
let fastExitTimer = null;

function buildOfflineAuthFallback(username = 'StevePlayer', skinModel = 'default') {
  const clean = (username || 'StevePlayer').trim().slice(0, 16) || 'StevePlayer';
  const baseBytes = crypto.createHash('md5').update(`OfflinePlayer:${clean}`, 'utf8').digest();
  baseBytes[6] = (baseBytes[6] & 0x0f) | 0x30;
  baseBytes[8] = (baseBytes[8] & 0x3f) | 0x80;

  // Align Java UUID.hashCode() with the chosen 3D model:
  // In Minecraft 1.19.3-1.21.11+, DefaultPlayerSkin uses Math.floorMod(uuid.hashCode(), 18): 0..8 = SLIM (3px), 9..17 = WIDE (4px).
  // In Minecraft 1.8-1.19.2, (uuid.hashCode() & 1) == 1 is SLIM (Alex), 0 is WIDE (Steve).
  const wantSlim = skinModel === 'slim';
  const origByte15 = baseBytes[15];
  for (let delta = 0; delta < 256; delta++) {
    baseBytes[15] = (origByte15 + delta) & 0xff;
    const hash = (baseBytes.readInt32BE(0) ^ baseBytes.readInt32BE(4) ^ baseBytes.readInt32BE(8) ^ baseBytes.readInt32BE(12)) | 0;
    const idx18 = ((hash % 18) + 18) % 18;
    const bit1 = hash & 1;
    if (wantSlim ? (idx18 < 9 && bit1 === 1) : (idx18 >= 9 && bit1 === 0)) {
      break;
    }
  }

  const hex = baseBytes.toString('hex');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  return {
    access_token: uuid,
    client_token: uuid,
    uuid,
    name: clean,
    user_properties: '{}',
    meta: { type: 'mojang', demo: false }
  };
}

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

const origGetAssets = Handler.prototype.getAssets;
Handler.prototype.getAssets = async function () {
  if (fastSkipEnabled && this.options?.root && this.options?.version?.number) {
    try {
      const verNum = this.options.version.number;
      const verJar = path.join(this.options.root, 'versions', verNum, `${verNum}.jar`);
      const objectsDir = path.join(this.options.root, 'assets', 'objects');
      if (fs.existsSync(verJar) && fs.existsSync(objectsDir) && fs.readdirSync(objectsDir).length > 20) {
        return [];
      }
    } catch (_) {}
  }
  return origGetAssets.call(this);
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

function findJavawInDir(baseDir, maxDepth = 4, currentDepth = 0) {
  const results = [];
  if (!baseDir || !fs.existsSync(baseDir) || currentDepth > maxDepth) return results;
  try {
    const binCheck = path.join(baseDir, 'bin', process.platform === 'win32' ? 'javaw.exe' : 'java');
    if (fs.existsSync(binCheck)) {
      results.push(binCheck);
      return results;
    }
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        results.push(...findJavawInDir(path.join(baseDir, entry.name), maxDepth, currentDepth + 1));
      }
    }
  } catch (_) {}
  return results;
}

function detectJavaPath(customGameDir, mcVersion = '1.21.4') {
  const gameDir = customGameDir || getDefaultGameDir();
  const searchRoots = [
    path.join(gameDir, 'runtimes'),
    path.join(gameDir, 'runtime'),
    path.join(os.homedir(), 'sdk'),
    process.env.JAVA_HOME || null,
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Java',
    'C:\\Program Files\\Microsoft',
    'C:\\Program Files\\BellSoft',
    'C:\\Program Files\\Zulu'
  ].filter(Boolean);

  const allFound = [];
  for (const root of searchRoots) {
    if (root.endsWith('.exe') && fs.existsSync(root)) {
      allFound.push(root);
    } else {
      allFound.push(...findJavawInDir(root, 4));
    }
  }

  if (allFound.length === 0) return 'java';

  // Prefer Java 21 for modern MC (1.20.5+ / 1.21+ / snapshots), or Java 17 for 1.17-1.20.4
  const needs21 = !mcVersion || mcVersion.startsWith('1.21') || mcVersion.includes('w') || mcVersion.includes('rc') || mcVersion.includes('pre');
  if (needs21) {
    const j21 = allFound.find((p) => p.includes('21'));
    if (j21) return j21;
  } else {
    const j17 = allFound.find((p) => p.includes('17'));
    if (j17) return j17;
  }

  return allFound[0];
}

async function ensureJavaRuntime(gameDir, mcVersion, requestedJavaPath, onStatus) {
  if (requestedJavaPath && requestedJavaPath !== 'java' && fs.existsSync(requestedJavaPath)) {
    return requestedJavaPath;
  }
  const detected = detectJavaPath(gameDir, mcVersion);
  if (detected && detected !== 'java' && fs.existsSync(detected)) {
    return detected;
  }

  // Auto-download Portable Java 21 JRE into .minecraft/runtimes/jre-21 if not installed on PC
  if (process.platform === 'win32') {
    const jreRoot = path.join(gameDir, 'runtimes', 'jre-21');
    const zipPath = path.join(jreRoot, 'jre21.zip');
    onStatus?.('Đang tự động tải Java 21 Runtime cho máy (chỉ tải 1 lần đầu)...');
    const adoptiumUrl = 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse';
    await downloadFile(adoptiumUrl, zipPath);
    onStatus?.('Đang giải nén Java 21 Runtime...');
    execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${jreRoot}' -Force"`, { stdio: 'ignore' });
    try { fs.unlinkSync(zipPath); } catch (_) {}
    const afterInstall = detectJavaPath(gameDir, mcVersion);
    if (afterInstall && afterInstall !== 'java') return afterInstall;
  }

  return 'java';
}

function cleanupJavaTempAndTrimRam() {
  if (!activeMcProcess && !global.__activeMcProcess) {
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
  }

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
  const proc = activeMcProcess || global.__activeMcProcess;
  if (proc && proc.pid) {
    const pid = proc.pid;
    activeMcProcess = null;
    global.__activeMcProcess = null;
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
  const parallelThreads = Math.max(2, Math.min(8, cpuCores));
  const concThreads = Math.max(1, Math.floor(parallelThreads / 2));

  // Do NOT artificially cap MaxDirectMemorySize or MaxMetaspaceSize so LWJGL/OpenGL chunk UBOs and ResourcePack reloads never crash!
  // Verified 100% compatible with Java 8, Java 17, and Java 21 (Temurin 21.0.12+).
  return [
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+UseG1GC',
    `-XX:ParallelGCThreads=${parallelThreads}`,
    `-XX:ConcGCThreads=${concThreads}`,
    '-XX:+ParallelRefProcEnabled',
    '-XX:MaxGCPauseMillis=50',
    '-XX:+DisableExplicitGC',
    '-XX:+UseStringDeduplication',
    '-XX:G1NewSizePercent=20',
    '-XX:G1MaxNewSizePercent=40',
    '-XX:G1HeapRegionSize=16M',
    '-XX:G1ReservePercent=15',
    '-XX:G1HeapWastePercent=5',
    '-XX:G1MixedGCCountTarget=4',
    '-XX:InitiatingHeapOccupancyPercent=15',
    '-XX:G1MixedGCLiveThresholdPercent=90',
    '-XX:G1RSetUpdatingPauseTimePercent=5',
    '-XX:SurvivorRatio=32',
    '-XX:+PerfDisableSharedMem',
    '-XX:MaxTenuringThreshold=1',
    '-XX:-OmitStackTraceInFastThrow',
    '-Dfml.ignoreInvalidMinecraftCertificates=true',
    '-Dfml.ignorePatchDiscrepancies=true',
    '-Dminecraft.launcher.brand=AetherCraft-v28'
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
      throw new Error(`Core "${loaderType.toUpperCase()}" chưa hỗ trợ phiên bản ${mcVersion}. Hãy chọn Vanilla hoặc phiên bản khác.`);
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

async function searchModrinth({
  query = '',
  projectType = 'mod',
  mcVersion = '1.21.4',
  loaderType = 'fabric',
  category = '',
  sortBy = 'downloads',
  offset = 0,
  limit = 48,
  allVersions = false
}) {
  const effectiveLoader = loaderType === 'vanilla' || loaderType === 'legacyfabric' ? 'fabric' : loaderType;
  const buildFacets = (strictExactVer) => {
    const f = [[`project_type:${projectType}`]];
    if (mcVersion && !allVersions) {
      if (strictExactVer && projectType === 'mod') {
        f.push([`versions:${mcVersion}`]);
      } else {
        const baseParts = String(mcVersion).split('-')[0].split('.');
        const familyPrefix = baseParts.length >= 2 ? `${baseParts[0]}.${baseParts[1]}` : mcVersion;
        const verGroup = new Set([mcVersion]);
        if (familyPrefix === '1.21') {
          ['1.21.11', '1.21.5', '1.21.4', '1.21.3', '1.21.1', '1.21'].forEach((v) => verGroup.add(v));
        } else if (familyPrefix === '1.20') {
          ['1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.20'].forEach((v) => verGroup.add(v));
        } else if (familyPrefix === '1.19') {
          ['1.19.4', '1.19.2', '1.19'].forEach((v) => verGroup.add(v));
        } else if (familyPrefix === '1.18') {
          ['1.18.2', '1.18.1', '1.18'].forEach((v) => verGroup.add(v));
        } else if (familyPrefix === '1.16') {
          ['1.16.5', '1.16.4', '1.16.1'].forEach((v) => verGroup.add(v));
        }
        f.push(Array.from(verGroup).map((v) => `versions:${v}`));
      }
    }
    if (projectType === 'mod' && !allVersions) {
      if (effectiveLoader === 'quilt') {
        f.push(['categories:quilt', 'categories:fabric']);
      } else if (effectiveLoader === 'forge') {
        f.push(['categories:forge', 'categories:neoforge']);
      } else {
        f.push([`categories:${effectiveLoader}`]);
      }
    }
    if (category && category.trim()) {
      f.push([`categories:${category.trim()}`]);
    }
    return f;
  };

  const safeLimit = Math.max(12, Math.min(60, Number(limit) || 48));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeSort = ['downloads', 'follows', 'updated', 'newest', 'relevance'].includes(sortBy) ? sortBy : 'downloads';

  let facets = buildFacets(true);
  let url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&limit=${safeLimit}&offset=${safeOffset}&index=${safeSort}&facets=${encodeURIComponent(JSON.stringify(facets))}`;
  let res = await fetchJson(url);

  // Fallback to minor version family only if strict exact version returned 0 hits (e.g. brand-new snapshot)
  if ((!res?.hits || res.hits.length === 0) && mcVersion && !allVersions && projectType === 'mod' && safeOffset === 0) {
    facets = buildFacets(false);
    url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&limit=${safeLimit}&offset=${safeOffset}&index=${safeSort}&facets=${encodeURIComponent(JSON.stringify(facets))}`;
    res = await fetchJson(url);
  }

  const hits = (res.hits || []).map((h) => ({
    projectId: h.project_id,
    slug: h.slug,
    title: h.title,
    description: h.description,
    iconUrl: h.icon_url,
    downloads: h.downloads,
    follows: h.follows || 0,
    author: h.author,
    categories: (h.categories || []).slice(0, 4)
  }));
  hits.totalHits = res.total_hits || hits.length;
  return hits;
}

const KNOWN_MOD_SLUG_PREFIXES = {
  'fabric-api': ['fabric-api-'],
  'sodium': ['sodium-'],
  'lithium': ['lithium-'],
  'ferrite-core': ['ferritecore-'],
  'entityculling': ['entityculling-'],
  'immediatelyfast': ['immediatelyfast-'],
  'iris': ['iris-'],
  'embeddium': ['embeddium-'],
  'modmenu': ['modmenu-'],
  'cloth-config': ['cloth-config-'],
  'continuity': ['continuity-'],
  'appleskin': ['appleskin-'],
  'SodiumExtra': ['sodium-extra-'],
  'reeses-sodium-options': ['reeses_sodium_options-', 'reeses-sodium-options-'],
  'lambdynamiclights': ['lambdynamiclights-'],
  'zoomify': ['zoomify-'],
  'wi-zoom': ['wi-zoom-', 'wizoom-'],
  'xaeros-minimap': ['xaeros_minimap_', 'xaeros-minimap-'],
  'xaeros-world-map': ['xaerosworldmap_', 'xaeros-world-map-'],
  'jei': ['jei-'],
  'rei': ['roughlyenoughitems-'],
  'emi': ['emi-'],
  'jade': ['jade-']
};

function extractMcVerFromFilename(fileName = '') {
  const clean = String(fileName).replace(/\.disabled$/i, '');
  const m = clean.match(/(?:mc|[+_-])(1\.\d+(?:\.\d+)?)(?=[+_-]|\.jar$|$)/i);
  return m ? m[1] : '';
}

function readModsMetaManifest(modsFolder) {
  const metaPath = path.join(modsFolder, '.aether-mods-meta.json');
  try {
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8')) || {};
    }
  } catch (_) {}
  return {};
}

function writeModsMetaManifest(modsFolder, metaObj) {
  const metaPath = path.join(modsFolder, '.aether-mods-meta.json');
  try {
    fs.writeFileSync(metaPath, JSON.stringify(metaObj, null, 2), 'utf8');
  } catch (_) {}
}

function removeConflictingModJars(modsFolder, slug, newFilename = '', targetMcVersion = '') {
  if (!fs.existsSync(modsFolder)) return;
  const prefixes = new Set(KNOWN_MOD_SLUG_PREFIXES[slug.toLowerCase()] || [`${slug.toLowerCase()}-`]);
  if (newFilename) {
    const stemMatch = newFilename.toLowerCase().match(/^([a-z0-9_]+[-_])/);
    if (stemMatch && stemMatch[1].length >= 4) prefixes.add(stemMatch[1]);
  }
  const meta = readModsMetaManifest(modsFolder);
  try {
    for (const file of fs.readdirSync(modsFolder)) {
      if (file === newFilename || file === `${newFilename}.disabled` || file.startsWith('.')) continue;
      if (!/\.jar$/i.test(file)) continue;
      const lower = file.toLowerCase();
      const metaEntry = meta[file];
      const isSameMod = (metaEntry && metaEntry.slug && metaEntry.slug.toLowerCase() === slug.toLowerCase()) ||
        Array.from(prefixes).some((p) => lower.startsWith(p));
      if (isSameMod) {
        const fileVer = metaEntry?.mcVersion || extractMcVerFromFilename(file);
        // If the existing .jar is for a DIFFERENT MC version, cache it as .jar.disabled so switching back later is instant!
        if (fileVer && targetMcVersion && fileVer !== targetMcVersion) {
          try {
            fs.renameSync(path.join(modsFolder, file), path.join(modsFolder, `${file}.disabled`));
          } catch (_) {}
        } else {
          try {
            fs.unlinkSync(path.join(modsFolder, file));
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
}

async function installModrinthProject({ slug, projectType = 'mod', mcVersion = '1.21.11', loaderType = 'fabric', gameDir, _isDep = false }, onStatus) {
  const rootDir = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  const folderMap = { mod: 'mods', shader: 'shaderpacks', resourcepack: 'resourcepacks' };
  const targetFolder = path.join(rootDir, folderMap[projectType] || 'mods');
  if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });

  const effectiveLoader = loaderType === 'vanilla' || loaderType === 'legacyfabric' ? 'fabric' : loaderType;
  const loaderMatches = (loaders) => {
    if (projectType !== 'mod') return true;
    if (!Array.isArray(loaders)) return false;
    if (loaders.includes(effectiveLoader)) return true;
    if (effectiveLoader === 'quilt' && loaders.includes('fabric')) return true;
    if (effectiveLoader === 'forge' && loaders.includes('neoforge')) return true;
    return false;
  };

  const allVersions = await fetchJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version`);
  if (!Array.isArray(allVersions) || allVersions.length === 0) {
    throw new Error(`Không tìm thấy dữ liệu cho "${slug}".`);
  }

  // 1. Strict match on EXACT mcVersion + compatible Core Loader
  let matched = allVersions.filter((v) => {
    const gvOk = Array.isArray(v.game_versions) && v.game_versions.includes(mcVersion);
    return gvOk && loaderMatches(v.loaders);
  });

  // 2. Fallback within the SAME major.minor family (e.g. 1.21.x) + compatible Core Loader
  if (matched.length === 0) {
    const baseParts = String(mcVersion).split('-')[0].split('.');
    const familyPrefix = baseParts.length >= 2 ? `${baseParts[0]}.${baseParts[1]}` : mcVersion;
    matched = allVersions.filter((v) => {
      const gvOk = Array.isArray(v.game_versions) && v.game_versions.some((g) => g === familyPrefix || g.startsWith(`${familyPrefix}.`));
      return gvOk && loaderMatches(v.loaders);
    });
  }

  // 3. For Shaders & ResourcePacks (version-agnostic), allow fallback; for Mods, NEVER install an incompatible era .jar that would crash the game!
  if (matched.length === 0) {
    if (projectType !== 'mod') {
      matched = allVersions;
    } else {
      const supportedVers = Array.from(new Set(allVersions.flatMap((v) => v.game_versions || []).filter((g) => /^\d+\.\d+/.test(g)))).slice(0, 5).join(', ');
      throw new Error(`Mod "${slug}" chưa hỗ trợ bản ${mcVersion} (${effectiveLoader.toUpperCase()}). Các bản hỗ trợ: ${supportedVers || 'Khác'}`);
    }
  }

  const chosen = matched[0];
  const fileObj = chosen.files.find((f) => f.primary) || chosen.files[0];
  if (!fileObj || !fileObj.url) {
    throw new Error(`Gói "${slug}" không có file tải hợp lệ.`);
  }

  // 4. Auto-install required dependencies (e.g. Fabric API, Cloth Config, Architectury) matching the exact mcVersion & loader!
  if (projectType === 'mod' && !_isDep && Array.isArray(chosen.dependencies)) {
    const reqDeps = chosen.dependencies.filter((d) => d.dependency_type === 'required' && d.project_id);
    for (const dep of reqDeps) {
      try {
        onStatus?.(`Đang kiểm tra thư viện đi kèm bắt buộc cho ${slug}...`);
        await installModrinthProject({
          slug: dep.project_id,
          projectType: 'mod',
          mcVersion,
          loaderType: effectiveLoader,
          gameDir: rootDir,
          _isDep: true
        }, onStatus);
      } catch (_) {}
    }
  }

  const destPath = path.join(targetFolder, fileObj.filename);
  const disabledPath = `${destPath}.disabled`;

  if (projectType === 'mod') {
    removeConflictingModJars(targetFolder, slug, fileObj.filename, mcVersion);
    const meta = readModsMetaManifest(targetFolder);
    meta[fileObj.filename] = {
      slug,
      mcVersion,
      gameVersions: Array.isArray(chosen.game_versions) ? chosen.game_versions : [mcVersion],
      loader: effectiveLoader,
      updatedAt: Date.now()
    };
    writeModsMetaManifest(targetFolder, meta);
  }

  // If the exact file was previously cached as .jar.disabled, re-enable it immediately without re-downloading!
  if (!fs.existsSync(destPath) && fs.existsSync(disabledPath) && fs.statSync(disabledPath).size > 1024) {
    try {
      fs.renameSync(disabledPath, destPath);
      onStatus?.(`✓ Đã kích hoạt ngay ${fileObj.filename} (chuẩn ${mcVersion}) có sẵn trong máy!`);
      return { ok: true, fileName: fileObj.filename, versionNumber: chosen.version_number, destPath, skipped: true };
    } catch (_) {}
  }

  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1024) {
    onStatus?.(`✓ Gói ${fileObj.filename} đã cài sẵn trên máy, bỏ qua tải lại.`);
    return { ok: true, fileName: fileObj.filename, versionNumber: chosen.version_number, destPath, skipped: true };
  }

  onStatus?.(`Đang tải ${fileObj.filename} (chuẩn ${mcVersion} • ${effectiveLoader.toUpperCase()})...`);
  await downloadFile(fileObj.url, destPath);
  return { ok: true, fileName: fileObj.filename, versionNumber: chosen.version_number, destPath };
}

async function ensureModsMatchVersion(gameDir, mcVersion, loaderType, onStatus) {
  if (!loaderType || loaderType === 'vanilla') return;
  const rootDir = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  const modsFolder = path.join(rootDir, 'mods');
  if (!fs.existsSync(modsFolder)) return;

  const effectiveLoader = loaderType === 'legacyfabric' ? 'fabric' : loaderType;
  const meta = readModsMetaManifest(modsFolder);
  let files = [];
  try {
    files = fs.readdirSync(modsFolder).filter((f) => /\.jar(\.disabled)?$/i.test(f));
  } catch (_) {
    return;
  }
  if (files.length === 0) return;

  const isFileCompatibleWithVersion = (cleanFileName) => {
    const mEntry = meta[cleanFileName];
    if (mEntry && Array.isArray(mEntry.gameVersions) && mEntry.gameVersions.length > 0) {
      if (mEntry.loader && mEntry.loader !== effectiveLoader && !(effectiveLoader === 'quilt' && mEntry.loader === 'fabric')) {
        return false;
      }
      return mEntry.gameVersions.includes(mcVersion);
    }
    const explicitVer = extractMcVerFromFilename(cleanFileName);
    if (explicitVer) {
      return explicitVer === mcVersion;
    }
    // Version-agnostic or unknown filename without version tag -> assume compatible
    return true;
  };

  const inferSlugFromFilename = (cleanFileName) => {
    if (meta[cleanFileName]?.slug) return meta[cleanFileName].slug;
    const lower = cleanFileName.toLowerCase();
    for (const [slug, prefixes] of Object.entries(KNOWN_MOD_SLUG_PREFIXES)) {
      if (prefixes.some((p) => lower.startsWith(p))) return slug;
    }
    return '';
  };

  // Step 1: Re-enable any cached .jar.disabled files that strictly match the target mcVersion
  for (const f of files) {
    if (!f.toLowerCase().endsWith('.disabled')) continue;
    const cleanName = f.replace(/\.disabled$/i, '');
    const mEntry = meta[cleanName];
    const explicitVer = mEntry?.mcVersion || extractMcVerFromFilename(cleanName);
    if ((mEntry?.gameVersions?.includes(mcVersion)) || (explicitVer && explicitVer === mcVersion)) {
      const enabledPath = path.join(modsFolder, cleanName);
      const disabledPath = path.join(modsFolder, f);
      if (!fs.existsSync(enabledPath)) {
        try {
          fs.renameSync(disabledPath, enabledPath);
        } catch (_) {}
      }
    }
  }

  // Refresh file list after Step 1
  try {
    files = fs.readdirSync(modsFolder).filter((f) => /\.jar$/i.test(f));
  } catch (_) {
    return;
  }

  // Step 2: Check enabled .jar files for version mismatch; disable incompatible ones and auto-fetch matching build if known
  const slugsToAutoFetch = new Set();
  for (const f of files) {
    if (!isFileCompatibleWithVersion(f)) {
      const slug = inferSlugFromFilename(f);
      try {
        fs.renameSync(path.join(modsFolder, f), path.join(modsFolder, `${f}.disabled`));
      } catch (_) {}
      if (slug) slugsToAutoFetch.add(slug);
    }
  }

  // Step 3: For any disabled mod whose slug is known, check if an enabled .jar for that slug already exists; if not, auto-install for mcVersion!
  if (slugsToAutoFetch.size > 0) {
    const activeFilesNow = fs.readdirSync(modsFolder).filter((f) => /\.jar$/i.test(f));
    for (const slug of slugsToAutoFetch) {
      const alreadyActive = activeFilesNow.some((f) => inferSlugFromFilename(f).toLowerCase() === slug.toLowerCase());
      if (!alreadyActive) {
        try {
          onStatus?.(`🔄 Tự động đồng bộ Mod "${slug}" sang đúng phiên bản ${mcVersion} (${effectiveLoader.toUpperCase()})...`);
          await installModrinthProject({
            slug,
            projectType: 'mod',
            mcVersion,
            loaderType: effectiveLoader,
            gameDir: rootDir,
            _isDep: true
          }, onStatus);
        } catch (_) {}
      }
    }
  }
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
  return { ok: installed.length > 0, installed, errors, recommendedCore: effectiveLoader };
}

function listLocalAddons(gameDir, folderType = 'mods') {
  const rootDir = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  const safeFolder = ['mods', 'shaderpacks', 'resourcepacks'].includes(folderType) ? folderType : 'mods';
  const dir = path.join(rootDir, safeFolder);
  if (!fs.existsSync(dir)) return [];
  const meta = safeFolder === 'mods' ? readModsMetaManifest(dir) : {};
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /\.(jar|zip)(\.disabled)?$/i.test(f))
      .map((f) => {
        const full = path.join(dir, f);
        const cleanName = f.replace(/\.disabled$/i, '');
        const mEntry = meta[cleanName] || null;
        let sizeKB = 0;
        try { sizeKB = Math.round(fs.statSync(full).size / 1024); } catch (_) {}
        return {
          name: f,
          cleanName,
          enabled: !f.toLowerCase().endsWith('.disabled'),
          sizeKB,
          slug: mEntry?.slug || '',
          mcVersion: mEntry?.mcVersion || extractMcVerFromFilename(cleanName) || '',
          gameVersions: Array.isArray(mEntry?.gameVersions) ? mEntry.gameVersions : []
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
  fs.renameSync(fullPath, path.join(rootDir, safeFolder, nextName));
  return { ok: true, newName: nextName, enabled: isDisabled };
}

function deleteLocalAddon(gameDir, folderType, fileName) {
  const rootDir = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  const safeFolder = ['mods', 'shaderpacks', 'resourcepacks'].includes(folderType) ? folderType : 'mods';
  const fullPath = path.join(rootDir, safeFolder, path.basename(fileName));
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
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
        try { lastPlayed = fs.statSync(wPath).mtime.toLocaleString('vi-VN'); } catch (_) {}
        let iconDataUrl = null;
        const iconPath = path.join(wPath, 'icon.png');
        if (fs.existsSync(iconPath)) {
          try { iconDataUrl = `data:image/png;base64,${fs.readFileSync(iconPath).toString('base64')}`; } catch (_) {}
        }
        return { name: d.name, path: wPath, lastPlayed, iconDataUrl };
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
  return { ok: true, dataUrl: `data:image/png;base64,${buf.toString('base64')}`, savedPath: targetPng };
}

function configureCrackSkinSupport(gameDir) {
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

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32Buffer(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildStandardZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const dataBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = crc32Buffer(dataBuf);
    const size = dataBuf.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18);
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += 30 + nameBuf.length + size;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

function detectResourcePackMeta(rootDir, mcVersion = '1.21.4') {
  const desc = 'Aether Craft - Dong bo Skin 3D vao Game';
  try {
    const jarPath = path.join(rootDir, 'versions', mcVersion, `${mcVersion}.jar`);
    if (fs.existsSync(jarPath)) {
      const buf = fs.readFileSync(jarPath);
      let i = 0;
      while ((i = buf.indexOf('version.json', i)) !== -1) {
        if (i >= 46 && buf.readUInt32LE(i - 46) === 0x02014b50 && buf.readUInt16LE(i - 18) === 12) {
          const compSize = buf.readUInt32LE(i - 26);
          const localOff = buf.readUInt32LE(i - 4);
          const nameLen = buf.readUInt16LE(localOff + 26);
          const extraLen = buf.readUInt16LE(localOff + 28);
          const raw = zlib.inflateRawSync(buf.subarray(localOff + 30 + nameLen + extraLen, localOff + 30 + nameLen + extraLen + compSize));
          const verJson = JSON.parse(raw.toString('utf8'));
          if (verJson?.pack_version?.resource_major) {
            const maj = verJson.pack_version.resource_major;
            return { pack: { description: desc, min_format: maj, max_format: maj } };
          }
          if (typeof verJson?.pack_version?.resource === 'number') {
            return { pack: { pack_format: verJson.pack_version.resource, description: desc } };
          }
          break;
        }
        i += 12;
      }
    }
  } catch (_) {}

  const v = String(mcVersion || '1.21.4');
  if (v.startsWith('1.21.11') || v.startsWith('1.21.10') || v.startsWith('1.21.9') || v.startsWith('26.')) {
    return { pack: { description: desc, min_format: 65, max_format: 99 } };
  }
  let fmt = 46;
  if (v.startsWith('1.21.6') || v.startsWith('1.21.7') || v.startsWith('1.21.8')) fmt = 64;
  else if (v.startsWith('1.21.5')) fmt = 55;
  else if (v.startsWith('1.21.4')) fmt = 46;
  else if (v.startsWith('1.21.2') || v.startsWith('1.21.3')) fmt = 42;
  else if (v.startsWith('1.21')) fmt = 34;
  else if (v.startsWith('1.20.5') || v.startsWith('1.20.6')) fmt = 32;
  else if (v.startsWith('1.20.3') || v.startsWith('1.20.4')) fmt = 22;
  else if (v.startsWith('1.20')) fmt = 15;
  else if (v.startsWith('1.19.4')) fmt = 13;
  else if (v.startsWith('1.19.3')) fmt = 12;
  else if (v.startsWith('1.19')) fmt = 9;
  else if (v.startsWith('1.18')) fmt = 8;
  else if (v.startsWith('1.17')) fmt = 7;
  else if (v.startsWith('1.16')) fmt = 6;
  else if (v.startsWith('1.15')) fmt = 5;
  else if (v.startsWith('1.13') || v.startsWith('1.14')) fmt = 4;
  else if (v.startsWith('1.11') || v.startsWith('1.12')) fmt = 3;
  else if (v.startsWith('1.9') || v.startsWith('1.10')) fmt = 2;
  else if (v.startsWith('1.8') || v.startsWith('1.7')) fmt = 1;
  return { pack: { pack_format: fmt, description: desc } };
}

function syncActive3DSkinIntoGame(rootDir, username, skinDataUrl, mcVersion = '1.21.4') {
  try {
    if (!skinDataUrl || !skinDataUrl.startsWith('data:image/png;base64,')) return;
    const base64Data = skinDataUrl.replace(/^data:image\/png;base64,/, '');
    const skinBuf = Buffer.from(base64Data, 'base64');
    if (skinBuf.length < 100) return;

    const cleanName = (username || 'StevePlayer').replace(/[^a-zA-Z0-9_]/g, '') || 'StevePlayer';
    const skinsDir = path.join(rootDir, 'CustomSkinLoader', 'LocalSkin', 'skins');
    if (!fs.existsSync(skinsDir)) fs.mkdirSync(skinsDir, { recursive: true });
    fs.writeFileSync(path.join(skinsDir, `${cleanName}.png`), skinBuf);
    configureCrackSkinSupport(rootDir);

    // Build a 100% standard PKZIP ResourcePack with exact version metadata so Vanilla & Fabric/Forge load the active 3D skin!
    const rpDir = path.join(rootDir, 'resourcepacks');
    if (!fs.existsSync(rpDir)) fs.mkdirSync(rpDir, { recursive: true });
    const mcmeta = detectResourcePackMeta(rootDir, mcVersion);
    const zipEntries = [
      { name: 'pack.mcmeta', data: Buffer.from(JSON.stringify(mcmeta, null, 2), 'utf8') },
      { name: 'assets/minecraft/textures/entity/steve.png', data: skinBuf },
      { name: 'assets/minecraft/textures/entity/alex.png', data: skinBuf }
    ];
    const defaultActors = ['steve', 'alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'sunny', 'zuri'];
    for (const actor of defaultActors) {
      zipEntries.push({ name: `assets/minecraft/textures/entity/player/wide/${actor}.png`, data: skinBuf });
      zipEntries.push({ name: `assets/minecraft/textures/entity/player/slim/${actor}.png`, data: skinBuf });
    }
    const rpZipPath = path.join(rpDir, 'AetherSkinSync.zip');
    fs.writeFileSync(rpZipPath, buildStandardZipBuffer(zipEntries));

    // Ensure "file/AetherSkinSync.zip" is enabled at highest priority in options.txt (handling Windows CRLF \r\n)
    const optsPath = path.join(rootDir, 'options.txt');
    let optsContent = fs.existsSync(optsPath) ? fs.readFileSync(optsPath, 'utf8') : '';
    const packId = 'file/AetherSkinSync.zip';
    if (/^resourcePacks:\[.*?\]\r?$/m.test(optsContent)) {
      optsContent = optsContent.replace(/^resourcePacks:\[(.*?)\](\r?)$/m, (_full, inner, cr) => {
        let items = [];
        try {
          items = JSON.parse(`[${inner}]`);
        } catch (_) {
          items = inner.split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
        }
        if (!items.includes('vanilla')) items.unshift('vanilla');
        items = items.filter((item) => item !== packId && item !== 'AetherSkinSync.zip');
        items.push(packId);
        return `resourcePacks:${JSON.stringify(items)}${cr}`;
      });
    } else {
      const nl = optsContent.includes('\r\n') ? '\r\n' : '\n';
      optsContent += (optsContent.endsWith('\n') || !optsContent ? '' : nl) + `resourcePacks:["vanilla","${packId}"]${nl}`;
    }
    // Remove from incompatibleResourcePacks if present
    optsContent = optsContent.replace(/^incompatibleResourcePacks:\[(.*?)\](\r?)$/m, (_full, inner, cr) => {
      try {
        const items = JSON.parse(`[${inner}]`).filter((item) => item !== packId && item !== 'AetherSkinSync.zip');
        return `incompatibleResourcePacks:${JSON.stringify(items)}${cr}`;
      } catch (_) {
        return `incompatibleResourcePacks:[]${cr}`;
      }
    });
    fs.writeFileSync(optsPath, optsContent, 'utf8');
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
    cpuCores = os.cpus().length,
    skinDataUrl = '',
    skinModel = 'default'
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
    if (msProfile.refreshToken && typeof msAuth.authenticateMicrosoftFromRefreshToken === 'function') {
      try {
        activeProfile = await msAuth.authenticateMicrosoftFromRefreshToken(msProfile.refreshToken);
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
      meta: { type: 'msa', demo: false }
    };
  } else {
    const cleanName = (username || 'Player').trim().slice(0, 16) || 'Player';
    callbacks.onStatus?.(`Đang đồng bộ Skin 3D & khởi tạo tài khoản "${cleanName}"...`);
    authorization = buildOfflineAuthFallback(cleanName, skinModel);
    if (crackSkinSync) {
      configureCrackSkinSupport(rootDir);
    }
    if (skinDataUrl) {
      syncActive3DSkinIntoGame(rootDir, cleanName, skinDataUrl, mcVersion);
    }
  }

  await ensureModsMatchVersion(rootDir, mcVersion, loaderType, callbacks.onStatus);
  const loaderPrep = await prepareCustomLoaderJson(
    rootDir,
    mcVersion,
    loaderType,
    loaderVersion,
    callbacks.onStatus
  );

  const resolvedJava = await ensureJavaRuntime(rootDir, mcVersion, javaPath, callbacks.onStatus);
  const customArgs = useAikarFlags ? buildMultiCoreSmoothExitArgs(ramGB, cpuCores) : [];

  const launcher = new Client();

  const launchOpts = {
    authorization,
    root: rootDir,
    version: {
      number: mcVersion,
      type: mcVersion.includes('w') || mcVersion.includes('pre') || mcVersion.includes('rc') ? 'snapshot' : 'release'
    },
    memory: {
      max: `${Math.max(1024, Math.round(ramGB * 1024))}M`,
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
    launchOpts.quickPlay = { type: 'multiplayer', identifier: serverIp.trim() };
    launchOpts.server = { host, port: port || '25565' };
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

    if (!gameWindowNotified && (line.includes('LWJGL') || line.includes('OpenAL initialized') || line.includes('Sound engine started') || line.includes('Created: ') || line.includes('Setting user:'))) {
      gameWindowNotified = true;
      callbacks.onGameWindowReady?.();
    }

    if (line.includes('Render thread/INFO]: Stopping!')) {
      if (!fastExitTimer) {
        fastExitTimer = setTimeout(() => {
          forceKillMinecraft();
        }, 4500);
      }
    }
  });

  launcher.on('progress', (e) => {
    const pct = e.total > 0 ? Math.min(100, Math.round((e.task / e.total) * 100)) : 0;
    callbacks.onProgress?.({ type: e.type, task: e.task, total: e.total, percent: pct });
  });

  launcher.on('close', (code) => {
    if (fastExitTimer) {
      clearTimeout(fastExitTimer);
      fastExitTimer = null;
    }
    activeMcProcess = null;
    global.__activeMcProcess = null;
    cleanupJavaTempAndTrimRam();
    callbacks.onClose?.(code);
  });

  callbacks.onStatus?.(`Đang khởi chạy Minecraft ${mcVersion} (${loaderType.toUpperCase()}) • Java: ${path.basename(path.dirname(path.dirname(resolvedJava)) || 'Java')}...`);

  const proc = await launcher.launch(launchOpts);
  activeMcProcess = proc;
  global.__activeMcProcess = proc;

  return proc;
}

function countDirItems(dirPath, filterFn) {
  if (!dirPath || !fs.existsSync(dirPath)) return 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return filterFn ? entries.filter(filterFn).length : entries.length;
  } catch (_) {
    return 0;
  }
}

function extractSavedUsernamesFromDir(mcDir) {
  const names = new Set();
  if (!mcDir || !fs.existsSync(mcDir)) return [];
  // 1. usercache.json
  try {
    const ucPath = path.join(mcDir, 'usercache.json');
    if (fs.existsSync(ucPath)) {
      const arr = JSON.parse(fs.readFileSync(ucPath, 'utf8'));
      if (Array.isArray(arr)) {
        arr.forEach((e) => {
          if (e?.name && /^[a-zA-Z0-9_]{3,16}$/.test(e.name)) names.add(e.name);
        });
      }
    }
  } catch (_) {}
  // 2. TlauncherProfiles.json / launcher_profiles.json
  for (const fName of ['TlauncherProfiles.json', 'tlauncher_profiles.json', 'launcher_profiles.json']) {
    try {
      const p = path.join(mcDir, fName);
      if (fs.existsSync(p)) {
        const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
        const accs = obj?.accounts || obj?.authenticationDatabase || {};
        Object.values(accs).forEach((acc) => {
          const u = acc?.username || acc?.displayName;
          if (u && /^[a-zA-Z0-9_]{3,16}$/.test(u)) names.add(u);
          if (acc?.profiles && typeof acc.profiles === 'object') {
            Object.values(acc.profiles).forEach((pr) => {
              if (pr?.name && /^[a-zA-Z0-9_]{3,16}$/.test(pr.name)) names.add(pr.name);
            });
          }
        });
      }
    } catch (_) {}
  }
  return Array.from(names).slice(0, 12);
}

function detectInstanceMeta(mcDir) {
  let detectedVersion = '';
  let detectedCore = '';
  try {
    const parentDir = path.dirname(mcDir);
    // 1. PrismLauncher / MultiMC: mmc-pack.json in parentDir
    const mmcPack = path.join(parentDir, 'mmc-pack.json');
    if (fs.existsSync(mmcPack)) {
      const data = JSON.parse(fs.readFileSync(mmcPack, 'utf8'));
      for (const comp of data?.components || []) {
        if (comp.uid === 'net.minecraft' && comp.version) detectedVersion = comp.version;
        if (comp.uid === 'net.fabricmc.fabric-loader') detectedCore = 'fabric';
        if (comp.uid === 'org.quiltmc.quilt-loader') detectedCore = 'quilt';
        if (comp.uid === 'net.minecraftforge' || comp.uid === 'net.neoforged') detectedCore = 'forge';
      }
    }
    // 2. CurseForge: minecraftinstance.json in mcDir
    const cfJson = path.join(mcDir, 'minecraftinstance.json');
    if (fs.existsSync(cfJson)) {
      const data = JSON.parse(fs.readFileSync(cfJson, 'utf8'));
      if (data?.gameVersion) detectedVersion = data.gameVersion;
      const ml = String(data?.baseModLoader?.name || '').toLowerCase();
      if (ml.includes('fabric')) detectedCore = 'fabric';
      else if (ml.includes('quilt')) detectedCore = 'quilt';
      else if (ml.includes('forge')) detectedCore = 'forge';
    }
  } catch (_) {}
  return { detectedVersion, detectedCore };
}

function parseServersDatIps(serversDatPath) {
  const servers = [];
  if (!serversDatPath || !fs.existsSync(serversDatPath)) return servers;
  try {
    const zlib = require('zlib');
    let buf = fs.readFileSync(serversDatPath);
    if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
      try { buf = zlib.gunzipSync(buf); } catch (_) {}
    }
    const rawStr = buf.toString('latin1');
    const ipRegex = /\x08\x00\x02ip\x00([\x01-\x40])([a-zA-Z0-9._:-]+)/g;
    let m;
    while ((m = ipRegex.exec(rawStr)) !== null) {
      const len = m[1].charCodeAt(0);
      const ipCandidate = m[2].slice(0, len).trim();
      if (ipCandidate && ipCandidate.includes('.') && !servers.some((s) => s.ip === ipCandidate)) {
        servers.push({ name: ipCandidate.split(':')[0], ip: ipCandidate });
      }
    }
  } catch (_) {}
  return servers;
}

function inspectMinecraftInstanceDir(id, launcherName, instanceName, mcDir, targetRoot) {
  if (!mcDir || !fs.existsSync(mcDir)) return null;
  const isSameAsTarget = path.resolve(mcDir).toLowerCase() === path.resolve(targetRoot).toLowerCase();
  const worldsCount = countDirItems(path.join(mcDir, 'saves'), (d) => d.isDirectory());
  const modsCount = countDirItems(path.join(mcDir, 'mods'), (d) => d.isFile() && /\.(jar|disabled)$/i.test(d.name));
  const configsCount = countDirItems(path.join(mcDir, 'config'));
  const shadersCount = countDirItems(path.join(mcDir, 'shaderpacks'), (d) => d.isFile() && /\.zip$/i.test(d.name));
  const packsCount = countDirItems(path.join(mcDir, 'resourcepacks'), (d) => d.isFile() && /\.zip$/i.test(d.name));
  const versionsCount = countDirItems(path.join(mcDir, 'versions'), (d) => d.isDirectory());
  const hasServersDat = fs.existsSync(path.join(mcDir, 'servers.dat'));
  const hasOptionsTxt = fs.existsSync(path.join(mcDir, 'options.txt'));
  const accounts = extractSavedUsernamesFromDir(mcDir);
  const { detectedVersion, detectedCore } = detectInstanceMeta(mcDir);

  if (worldsCount === 0 && modsCount === 0 && shadersCount === 0 && packsCount === 0 && versionsCount === 0 && accounts.length === 0) {
    return null;
  }

  return {
    id,
    launcherName,
    instanceName,
    path: mcDir,
    isSharedRoot: isSameAsTarget,
    worldsCount,
    modsCount,
    configsCount,
    shadersCount,
    packsCount,
    versionsCount,
    hasServersDat,
    hasOptionsTxt,
    accounts,
    detectedVersion,
    detectedCore
  };
}

function scanExternalLaunchers(targetGameDir) {
  const targetRoot = targetGameDir && targetGameDir.trim() ? targetGameDir.trim() : getDefaultGameDir();
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const userHome = os.homedir();
  const discovered = [];

  // 1. Default .minecraft (TLauncher / Official / SKLauncher / Legacy)
  const stdMc = path.join(appData, '.minecraft');
  const hasTLauncher = fs.existsSync(path.join(appData, '.tlauncher')) || fs.existsSync(path.join(stdMc, 'TlauncherProfiles.json'));
  const stdInfo = inspectMinecraftInstanceDir(
    'std-minecraft',
    hasTLauncher ? 'TLauncher / Official (.minecraft)' : 'Minecraft Official (.minecraft)',
    'Thư mục gốc .minecraft',
    stdMc,
    targetRoot
  );
  if (stdInfo) discovered.push(stdInfo);

  // 2. Modrinth App profiles
  for (const mrFolder of ['ModrinthApp', 'com.modrinth.theseus']) {
    const profilesRoot = path.join(appData, mrFolder, 'profiles');
    if (fs.existsSync(profilesRoot)) {
      try {
        for (const d of fs.readdirSync(profilesRoot, { withFileTypes: true })) {
          if (d.isDirectory()) {
            const pDir = path.join(profilesRoot, d.name);
            const info = inspectMinecraftInstanceDir(`modrinth-${d.name}`, 'Modrinth App', d.name, pDir, targetRoot);
            if (info) discovered.push(info);
          }
        }
      } catch (_) {}
    }
  }

  // 3. CurseForge Instances
  const cfCandidates = [
    path.join(userHome, 'curseforge', 'minecraft', 'Instances'),
    path.join(appData, 'curseforge', 'minecraft', 'Instances')
  ];
  for (const cfRoot of cfCandidates) {
    if (fs.existsSync(cfRoot)) {
      try {
        for (const d of fs.readdirSync(cfRoot, { withFileTypes: true })) {
          if (d.isDirectory()) {
            const pDir = path.join(cfRoot, d.name);
            const info = inspectMinecraftInstanceDir(`curseforge-${d.name}`, 'CurseForge', d.name, pDir, targetRoot);
            if (info) discovered.push(info);
          }
        }
      } catch (_) {}
    }
  }

  // 4. Prism Launcher / MultiMC / PollyMC
  for (const prismName of ['PrismLauncher', 'MultiMC', 'PollyMC']) {
    const instRoot = path.join(appData, prismName, 'instances');
    if (fs.existsSync(instRoot)) {
      try {
        for (const d of fs.readdirSync(instRoot, { withFileTypes: true })) {
          if (d.isDirectory()) {
            const subMc = fs.existsSync(path.join(instRoot, d.name, '.minecraft'))
              ? path.join(instRoot, d.name, '.minecraft')
              : path.join(instRoot, d.name, 'minecraft');
            const info = inspectMinecraftInstanceDir(`${prismName}-${d.name}`, prismName, d.name, subMc, targetRoot);
            if (info) discovered.push(info);
          }
        }
      } catch (_) {}
    }
  }

  // 5. Feather Client
  const featherMods = path.join(appData, '.feather', 'user-mods');
  if (fs.existsSync(featherMods)) {
    const info = inspectMinecraftInstanceDir('feather-client', 'Feather Client', 'Feather User Mods', path.join(appData, '.feather'), targetRoot);
    if (info) discovered.push(info);
  }

  return discovered;
}

function copyFolderMergeRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return 0;
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  let copiedFiles = 0;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const sFull = path.join(srcDir, entry.name);
    const dFull = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copiedFiles += copyFolderMergeRecursive(sFull, dFull);
    } else if (entry.isFile()) {
      if (!fs.existsSync(dFull)) {
        try {
          fs.copyFileSync(sFull, dFull);
          copiedFiles++;
        } catch (_) {}
      }
    }
  }
  return copiedFiles;
}

function importFromExternalLauncher({ sourceDir, targetGameDir, syncWorlds = true, syncMods = true, syncShadersPacks = true, syncServersOptions = true }, onStatus) {
  const targetRoot = targetGameDir && targetGameDir.trim() ? targetGameDir.trim() : getDefaultGameDir();
  if (!sourceDir || !fs.existsSync(sourceDir)) {
    throw new Error('Thư mục nguồn không tồn tại.');
  }
  const actualSource = fs.existsSync(path.join(sourceDir, 'saves')) || fs.existsSync(path.join(sourceDir, 'mods')) || fs.existsSync(path.join(sourceDir, 'versions'))
    ? sourceDir
    : (fs.existsSync(path.join(sourceDir, '.minecraft')) ? path.join(sourceDir, '.minecraft') : sourceDir);

  const isSameDir = path.resolve(actualSource).toLowerCase() === path.resolve(targetRoot).toLowerCase();
  const { detectedVersion, detectedCore } = detectInstanceMeta(actualSource);
  const stats = {
    worldsCopied: 0,
    modsCopied: 0,
    configsCopied: 0,
    packsCopied: 0,
    accountsFound: [],
    serversFound: [],
    serversSynced: false,
    detectedVersion,
    detectedCore
  };

  stats.accountsFound = extractSavedUsernamesFromDir(actualSource);
  stats.serversFound = parseServersDatIps(path.join(actualSource, 'servers.dat'));

  if (!isSameDir) {
    if (syncWorlds) {
      if (fs.existsSync(path.join(actualSource, 'saves'))) {
        onStatus?.('Đang đồng bộ Thế giới chơi dở (saves)...');
        const savesSrc = path.join(actualSource, 'saves');
        const savesDest = path.join(targetRoot, 'saves');
        if (!fs.existsSync(savesDest)) fs.mkdirSync(savesDest, { recursive: true });
        for (const w of fs.readdirSync(savesSrc, { withFileTypes: true })) {
          if (w.isDirectory()) {
            const wDest = path.join(savesDest, w.name);
            copyFolderMergeRecursive(path.join(savesSrc, w.name), wDest);
            stats.worldsCopied++;
          }
        }
      }
      // Also sync Minimap Waypoints & Screenshots
      for (const wpFolder of ['XaeroWaypoints', 'XaeroWorldMap', 'journeymap', 'screenshots']) {
        if (fs.existsSync(path.join(actualSource, wpFolder))) {
          copyFolderMergeRecursive(path.join(actualSource, wpFolder), path.join(targetRoot, wpFolder));
        }
      }
    }
    if (syncMods) {
      if (fs.existsSync(path.join(actualSource, 'mods'))) {
        onStatus?.('Đang đồng bộ gói Mods (.jar)...');
        stats.modsCopied += copyFolderMergeRecursive(path.join(actualSource, 'mods'), path.join(targetRoot, 'mods'));
      }
      if (fs.existsSync(path.join(actualSource, 'config'))) {
        onStatus?.('Đang đồng bộ cấu hình Mod (config/)...');
        stats.configsCopied += copyFolderMergeRecursive(path.join(actualSource, 'config'), path.join(targetRoot, 'config'));
      }
    }
    if (syncShadersPacks) {
      if (fs.existsSync(path.join(actualSource, 'shaderpacks'))) {
        onStatus?.('Đang đồng bộ gói Shaders...');
        stats.packsCopied += copyFolderMergeRecursive(path.join(actualSource, 'shaderpacks'), path.join(targetRoot, 'shaderpacks'));
      }
      if (fs.existsSync(path.join(actualSource, 'resourcepacks'))) {
        onStatus?.('Đang đồng bộ gói Resource Packs...');
        stats.packsCopied += copyFolderMergeRecursive(path.join(actualSource, 'resourcepacks'), path.join(targetRoot, 'resourcepacks'));
      }
    }
    if (syncServersOptions) {
      const srvSrc = path.join(actualSource, 'servers.dat');
      const srvDest = path.join(targetRoot, 'servers.dat');
      if (fs.existsSync(srvSrc)) {
        try {
          if (fs.existsSync(srvDest)) fs.copyFileSync(srvDest, `${srvDest}.bak`);
          fs.copyFileSync(srvSrc, srvDest);
          stats.serversSynced = true;
        } catch (_) {}
      }
      const optSrc = path.join(actualSource, 'options.txt');
      const optDest = path.join(targetRoot, 'options.txt');
      if (fs.existsSync(optSrc)) {
        try {
          if (fs.existsSync(optDest)) fs.copyFileSync(optDest, `${optDest}.bak`);
          fs.copyFileSync(optSrc, optDest);
        } catch (_) {}
      }
    }
  } else {
    stats.worldsCopied = countDirItems(path.join(targetRoot, 'saves'), (d) => d.isDirectory());
    stats.modsCopied = countDirItems(path.join(targetRoot, 'mods'), (d) => d.isFile() && /\.(jar|disabled)$/i.test(d.name));
    stats.configsCopied = countDirItems(path.join(targetRoot, 'config'));
    stats.packsCopied = countDirItems(path.join(targetRoot, 'shaderpacks'), (d) => d.isFile()) + countDirItems(path.join(targetRoot, 'resourcepacks'), (d) => d.isFile());
    stats.serversSynced = fs.existsSync(path.join(targetRoot, 'servers.dat'));
  }

  return { ok: true, isSameDir, actualSource, stats };
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
  detectJavaPath,
  scanExternalLaunchers,
  importFromExternalLauncher
};