const { Client } = require('minecraft-launcher-core');
const Handler = require('minecraft-launcher-core/components/handler');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const net = require('net');
const { execSync, exec, spawn } = require('child_process');
const msAuth = require('./microsoft-auth');
const worldCreator = require('./world-creator');

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

// v40.8: reuse TLS connections to Modrinth / Mojang (fewer handshakes = faster store pages, less CPU)
const httpsKeepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 8, keepAliveMsecs: 15000 });

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https
      .get(url, { agent: httpsKeepAliveAgent, timeout: 25000, headers: { 'User-Agent': 'AetherCraft-Launcher/8.0 (https://github.com/buiduchuy2010qn-prog)' } }, (res) => {
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
    req.on('timeout', () => req.destroy(new Error(`Hết thời gian chờ: ${url}`)));
  });
}

function downloadFile(url, destPath, redirectsLeft = 6) {
  // v40.8: follow redirects BEFORE opening the file (no two write streams on the same path → no EBUSY on Windows)
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const req = https.get(url, { agent: httpsKeepAliveAgent, headers: { 'User-Agent': 'BlockWay-Launcher/40.8' }, timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('Download failed: too many redirects'));
        const nextUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        return downloadFile(nextUrl, destPath, redirectsLeft - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Download failed HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      const fail = (err) => {
        try { file.destroy(); } catch (_) {}
        fs.unlink(destPath, () => reject(err));
      };
      file.on('error', fail);
      res.on('error', fail);
    });
    req.on('timeout', () => req.destroy(new Error('Download timeout')));
    req.on('error', (err) => {
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
  // v40.0: chọn đúng Java theo yêu cầu của từng phiên bản Minecraft (Java 8 / 17 / 21 / 25)
  let need = 0;
  try { need = await getRequiredJavaMajor(gameDir, mcVersion); } catch (_) { need = 0; }

  if (requestedJavaPath && requestedJavaPath !== 'java' && fs.existsSync(requestedJavaPath)) {
    if (!need) return requestedJavaPath;
    const reqMajor = getJavaMajorVersion(requestedJavaPath);
    if (!reqMajor || reqMajor === need) return requestedJavaPath;
  }

  if (need) {
    const exact = listJavaCandidates(gameDir).find((p) => getJavaMajorVersion(p) === need);
    if (exact) return exact;
    if (process.platform === 'win32') {
      try {
        const got = await downloadPortableJava(gameDir, need, onStatus);
        if (got) return got;
      } catch (e) {
        onStatus?.(`⚠ Không tải được Java ${need}: ${e.message}. Đang thử Java có sẵn...`);
      }
    }
    // Fallback: Java mới hơn yêu cầu (chỉ khi yêu cầu >= 17)
    if (need >= 17) {
      const newer = listJavaCandidates(gameDir)
        .map((p) => ({ p, m: getJavaMajorVersion(p) }))
        .filter((x) => x.m >= need)
        .sort((a, b) => a.m - b.m)[0];
      if (newer) return newer.p;
    }
    if (requestedJavaPath && requestedJavaPath !== 'java' && fs.existsSync(requestedJavaPath)) return requestedJavaPath;
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

/* ---------- v40.0: Java major detection & per-version requirement ---------- */
const javaMajorCache = new Map();
function parseJavaMajor(v) {
  const s = String(v || '').trim();
  if (s.startsWith('1.')) return parseInt(s.split('.')[1], 10) || 0;
  return parseInt(s, 10) || 0;
}

function getJavaMajorVersion(javaPath) {
  if (!javaPath || javaPath === 'java') return 0;
  if (javaMajorCache.has(javaPath)) return javaMajorCache.get(javaPath);
  let major = 0;
  try {
    const home = path.dirname(path.dirname(javaPath));
    const releaseFile = path.join(home, 'release');
    if (fs.existsSync(releaseFile)) {
      const m = fs.readFileSync(releaseFile, 'utf8').match(/JAVA_VERSION="([^"]+)"/);
      if (m) major = parseJavaMajor(m[1]);
    }
    if (!major) {
      const javaExe = javaPath.replace(/javaw(\.exe)?$/i, 'java$1');
      const out = require('child_process').spawnSync(fs.existsSync(javaExe) ? javaExe : javaPath, ['-version'], {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true
      });
      const txt = `${out.stderr || ''}${out.stdout || ''}`;
      const m = txt.match(/version "([^"]+)"/);
      if (m) major = parseJavaMajor(m[1]);
    }
  } catch (_) {}
  javaMajorCache.set(javaPath, major);
  return major;
}

function listJavaCandidates(customGameDir) {
  const gameDir = customGameDir || getDefaultGameDir();
  const roots = [
    path.join(gameDir, 'runtimes'),
    path.join(gameDir, 'runtime'),
    path.join(getDefaultGameDir(), 'runtime'),
    path.join(os.homedir(), 'sdk'),
    path.join(os.homedir(), '.jdks'),
    process.env.JAVA_HOME || null,
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Java',
    'C:\\Program Files (x86)\\Java',
    'C:\\Program Files\\Microsoft',
    'C:\\Program Files\\BellSoft',
    'C:\\Program Files\\Zulu',
    'C:\\Program Files\\Amazon Corretto'
  ].filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const root of roots) {
    for (const p of findJavawInDir(root, 4)) {
      const key = p.toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push(p); }
    }
  }
  return out;
}

let cachedMojangManifest = null;
const mcJavaReqCache = new Map();
async function getRequiredJavaMajor(gameDir, mcVersion) {
  const ver = String(mcVersion || '').trim();
  if (!ver) return 0;
  if (mcJavaReqCache.has(ver)) return mcJavaReqCache.get(ver);
  let major = 0;
  try {
    const local = path.join(gameDir || getDefaultGameDir(), 'versions', ver, `${ver}.json`);
    if (fs.existsSync(local)) {
      const j = JSON.parse(fs.readFileSync(local, 'utf8'));
      major = Number(j?.javaVersion?.majorVersion) || 0;
    }
  } catch (_) {}
  if (!major) {
    try {
      if (!cachedMojangManifest) cachedMojangManifest = await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
      const entry = (cachedMojangManifest.versions || []).find((v) => v.id === ver);
      if (entry?.url) {
        const vj = await fetchJson(entry.url);
        major = Number(vj?.javaVersion?.majorVersion) || 0;
      }
    } catch (_) {}
  }
  if (!major) {
    if (compareMcVersions(ver, '26.1') >= 0) major = 25;
    else if (compareMcVersions(ver, '1.20.5') >= 0) major = 21;
    else if (compareMcVersions(ver, '1.17') >= 0) major = 17;
    else major = 8;
  }
  if (major === 16) major = 17;
  mcJavaReqCache.set(ver, major);
  return major;
}

async function downloadPortableJava(gameDir, major, onStatus) {
  const jreRoot = path.join(gameDir || getDefaultGameDir(), 'runtimes', `jre-${major}`);
  const existing = findJavawInDir(jreRoot, 4).find((p) => getJavaMajorVersion(p) === major);
  if (existing) return existing;
  fs.mkdirSync(jreRoot, { recursive: true });
  const zipPath = path.join(jreRoot, `jre${major}.zip`);
  onStatus?.(`☕ Đang tự động tải Java ${major} Runtime (chỉ tải 1 lần đầu)...`);
  await downloadFile(`https://api.adoptium.net/v3/binary/latest/${major}/ga/windows/x64/jre/hotspot/normal/eclipse`, zipPath);
  onStatus?.(`☕ Đang giải nén Java ${major} Runtime...`);
  let extracted = false;
  try {
    const Zip = require('adm-zip');
    new Zip(zipPath).extractAllTo(jreRoot, true);
    extracted = true;
  } catch (_) {}
  if (!extracted) {
    execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${jreRoot}' -Force"`, { stdio: 'ignore' });
  }
  try { fs.unlinkSync(zipPath); } catch (_) {}
  javaMajorCache.clear();
  return findJavawInDir(jreRoot, 4).find((p) => getJavaMajorVersion(p) === major) || null;
}

function compareMcVersions(a, b) {
  const pa = String(a || '0').split(/[.\-]/).map((n) => parseInt(n, 10));
  const pb = String(b || '0').split(/[.\-]/).map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
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

function normalizeModrinthLoader(loaderType, mcVersion = '') {
  const raw = String(loaderType || '').toLowerCase().trim();
  if (!raw || raw === 'vanilla' || raw === 'legacyfabric') return 'fabric';
  if (raw === 'optifine') {
    return (mcVersion && compareMcVersions(mcVersion, '1.14') < 0) ? 'forge' : 'fabric';
  }
  return raw;
}

function findInstalledOptifineProfiles(gameDir, mcVersion) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const versionsDir = path.join(rootDir, 'versions');
  if (!fs.existsSync(versionsDir)) return [];
  const targetVer = String(mcVersion || '').trim();
  const esc = targetVer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const out = [];
  try {
    const entries = fs.readdirSync(versionsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const id = ent.name;
      if (!/optifine/i.test(id)) continue;
      const jsonPath = path.join(versionsDir, id, `${id}.json`);
      if (!fs.existsSync(jsonPath)) continue;
      let matched = false;
      let mtime = 0;
      try {
        mtime = fs.statSync(jsonPath).mtimeMs || 0;
        const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (targetVer) {
          if (
            new RegExp(`^${esc}[-_ ]?optifine`, 'i').test(id)
            || parsed?.inheritsFrom === targetVer
            || parsed?.jar === targetVer
          ) {
            matched = true;
          }
        } else {
          matched = true;
        }
      } catch (_) {}
      if (matched) {
        const shortTag = targetVer
          ? id.replace(new RegExp(`^${esc}[-_ ]?`, 'i'), '')
          : id;
        out.push({ customId: id, shortTag: shortTag || id, mtime });
      }
    }
  } catch (_) {}
  return out.sort((a, b) => b.mtime - a.mtime);
}

async function fetchLoaderVersions(mcVersion, loaderType, gameDir = '') {
  if (loaderType === 'vanilla') return [];

  if (loaderType === 'optifine') {
    const out = [
      {
        version: 'Auto-Shader-Zoom',
        stable: true,
        kind: 'parity',
        displayLabel: '🔆 Tự động đủ bộ (Shader • Zoom • Đuốc sáng • Hỗ trợ Mod)'
      }
    ];
    const installedProfiles = findInstalledOptifineProfiles(gameDir || getDefaultGameDir(), mcVersion);
    for (const p of installedProfiles) {
      out.push({
        version: p.customId,
        stable: true,
        kind: 'standalone',
        displayLabel: `☕ ${p.shortTag} (OptiFine gốc độc lập)`
      });
    }
    return out;
  }

  if (loaderType === 'fabric') {
    try {
      const list = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}?limit=12`);
      if (Array.isArray(list) && list.length > 0) {
        return list.slice(0, 12).map((item) => ({
          version: item.loader.version,
          stable: item.loader.stable !== false
        }));
      }
    } catch (_) {}
    return [
      { version: '0.20.1', stable: true },
      { version: '0.18.4', stable: true },
      { version: '0.16.10', stable: true }
    ];
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

  if (loaderType === 'neoforge') {
    try {
      if (compareMcVersions(mcVersion, '1.20.2') < 0) {
        if (mcVersion !== '1.20.1') return [];
        const legacy = await fetchJson('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/forge');
        return (legacy.versions || [])
          .filter((v) => v.startsWith('1.20.1-'))
          .map((v) => v.replace(/^1\.20\.1-/, ''))
          .sort((a, b) => compareMcVersions(b, a))
          .slice(0, 12)
          .map((v) => ({ version: v, stable: true }));
      }
      const data = await fetchJson('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge');
      const prefix = neoForgePrefixFor(mcVersion);
      const list = (data.versions || [])
        .filter((v) => prefix && v.startsWith(prefix))
        .sort((a, b) => compareMcVersions(b, a));
      const stable = list.filter((v) => !/beta|alpha/i.test(v));
      const ordered = stable.length ? stable.concat(list.filter((v) => /beta|alpha/i.test(v))) : list;
      return ordered.slice(0, 15).map((v) => ({ version: v, stable: !/beta|alpha/i.test(v) }));
    } catch (_) {
      return [];
    }
  }

  return [];
}

function neoForgePrefixFor(mcVersion) {
  const p = String(mcVersion || '').split('.');
  if (p[0] === '1') {
    if (p.length < 2) return null;
    return `${p[1]}.${p[2] || '0'}.`;
  }
  return `${p[0]}.${p[1] || '0'}.${p[2] || '0'}.`;
}

async function downloadFirstAvailable(urls, destPath) {
  let lastErr = null;
  for (const u of urls) {
    try {
      await downloadFile(u, destPath);
      const st = fs.statSync(destPath);
      if (st.size > 20 * 1024) return u;
      lastErr = new Error('File tải về quá nhỏ');
    } catch (e) {
      lastErr = e;
    }
    try { fs.unlinkSync(destPath); } catch (_) {}
  }
  throw lastErr || new Error('Không tải được bộ cài loader');
}

// Forge 1.6.4 – 1.12.1: installer không có version.json → tự dựng custom JSON (MCLC không xử lý được)
function installLegacyForgeFromInstaller(gameDir, installerJar) {
  let Zip;
  try { Zip = require('adm-zip'); } catch (_) { return null; }
  const zip = new Zip(installerJar);
  if (zip.getEntry('version.json')) return null;
  const profEntry = zip.getEntry('install_profile.json');
  if (!profEntry) return null;
  const prof = JSON.parse(zip.readAsText(profEntry));
  const vi = prof.versionInfo;
  const inst = prof.install;
  if (!vi || !inst || !inst.path || !inst.filePath) return null;
  const customId = String(vi.id || `forge-${inst.path.split(':')[2]}`);
  const [g, a, v] = String(inst.path).split(':');
  const libRel = `${g.replace(/\./g, '/')}/${a}/${v}/${a}-${v}.jar`;
  const libAbs = path.join(gameDir, 'libraries', ...libRel.split('/'));
  if (!fs.existsSync(libAbs)) {
    const uni = zip.getEntry(inst.filePath);
    if (!uni) return null;
    fs.mkdirSync(path.dirname(libAbs), { recursive: true });
    fs.writeFileSync(libAbs, uni.getData());
  }
  const fixedLibs = [];
  for (const lib of vi.libraries || []) {
    if (!lib || !lib.name) continue;
    if (lib.clientreq === false) continue;
    if (lib.name === inst.path) {
      fixedLibs.push({ name: lib.name, downloads: { artifact: { path: libRel, url: '', size: fs.statSync(libAbs).size } } });
      continue;
    }
    const out = { name: lib.name };
    let base = lib.url || 'https://libraries.minecraft.net/';
    base = base.replace(/^http:\/\/files\.minecraftforge\.net\/maven\//i, 'https://maven.minecraftforge.net/')
      .replace(/^https?:\/\/files\.minecraftforge\.net\/maven\//i, 'https://maven.minecraftforge.net/')
      .replace(/^http:\/\//i, 'https://');
    if (!base.endsWith('/')) base += '/';
    out.url = base;
    if (lib.rules) out.rules = lib.rules;
    if (lib.natives) out.natives = lib.natives;
    fixedLibs.push(out);
  }
  const json = { ...vi, id: customId, libraries: fixedLibs };
  if (!json.inheritsFrom) json.inheritsFrom = json.jar || String(v).split('-')[0];
  const verDir = path.join(gameDir, 'versions', customId);
  fs.mkdirSync(verDir, { recursive: true });
  fs.writeFileSync(path.join(verDir, `${customId}.json`), JSON.stringify(json, null, 2), 'utf8');
  return customId;
}

async function prepareCustomLoaderJson(gameDir, mcVersion, loaderType, loaderVersion, onStatus) {
  if (loaderType === 'vanilla') return null;

  if (loaderType === 'optifine') {
    if (loaderVersion && loaderVersion !== 'Auto-Shader-Zoom') {
      const installedProfiles = findInstalledOptifineProfiles(gameDir, mcVersion);
      const exact = installedProfiles.find((p) => p.customId === loaderVersion);
      if (exact) return { type: 'customJson', customId: exact.customId };
    }
    try {
      const fabList = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}?limit=4`);
      if (Array.isArray(fabList) && fabList.length > 0) {
        return await prepareCustomLoaderJson(gameDir, mcVersion, 'fabric', fabList[0].loader.version, onStatus);
      }
    } catch (_) {}
    if (compareMcVersions(mcVersion, '1.14') < 0) {
      const forgeList = await fetchLoaderVersions(mcVersion, 'forge');
      if (forgeList.length > 0) {
        return await prepareCustomLoaderJson(gameDir, mcVersion, 'forge', forgeList[0].version, onStatus);
      }
      const lfList = await fetchLoaderVersions(mcVersion, 'legacyfabric');
      if (lfList.length > 0) {
        return await prepareCustomLoaderJson(gameDir, mcVersion, 'legacyfabric', lfList[0].version, onStatus);
      }
    }
    return null;
  }

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
      const legacySuffix = `${mcVersion}-${loaderVer}-${mcVersion}`;
      await downloadFirstAvailable([
        `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullForgeVer}/forge-${fullForgeVer}-installer.jar`,
        `https://maven.minecraftforge.net/net/minecraftforge/forge/${legacySuffix}/forge-${legacySuffix}-installer.jar`
      ], installerJar);
    }
    try {
      const legacyId = installLegacyForgeFromInstaller(gameDir, installerJar);
      if (legacyId) return { type: 'customJson', customId: legacyId };
    } catch (e) {
      onStatus?.(`⚠ Không dựng được Forge cũ: ${e.message}`);
    }
    return { type: 'forgeJar', installerJar };
  }

  if (loaderType === 'neoforge') {
    const forgeDir = path.join(gameDir, 'forge-installers');
    const isLegacyNeo = compareMcVersions(mcVersion, '1.20.2') < 0;
    const installerJar = path.join(forgeDir, isLegacyNeo ? `neoforge-legacy-${mcVersion}-${loaderVer}-installer.jar` : `neoforge-${loaderVer}-installer.jar`);
    if (!fs.existsSync(installerJar)) {
      onStatus?.(`Đang tải gói NeoForge Core ${loaderVer} cho ${mcVersion}...`);
      const urls = isLegacyNeo
        ? [`https://maven.neoforged.net/releases/net/neoforged/forge/${mcVersion}-${loaderVer}/forge-${mcVersion}-${loaderVer}-installer.jar`]
        : [`https://maven.neoforged.net/releases/net/neoforged/neoforge/${loaderVer}/neoforge-${loaderVer}-installer.jar`];
      await downloadFirstAvailable(urls, installerJar);
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
  const effectiveLoader = normalizeModrinthLoader(loaderType, mcVersion);
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
    categories: (h.categories || []).slice(0, 12),
    displayCategories: (h.display_categories || []).slice(0, 12),
    versions: Array.isArray(h.versions) ? h.versions : []
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
  'modernfix': ['modernfix-'],
  'iris': ['iris-'],
  'embeddium': ['embeddium-'],
  'modmenu': ['modmenu-'],
  'cloth-config': ['cloth-config-'],
  'continuity': ['continuity-'],
  'fusion-connected-textures': ['fusion-'],
  'entity-model-features': ['entity_model_features_', 'entity-model-features-'],
  'entitytexturefeatures': ['entity_texture_features_', 'entitytexturefeatures-'],
  'polytone': ['polytone-'],
  'cit-resewn': ['citresewn-', 'cit-resewn-'],
  'oculus': ['oculus-'],
  'indium': ['indium-'],
  'appleskin': ['appleskin-'],
  'sodium-extra': ['sodium-extra-'],
  'reeses-sodium-options': ['reeses_sodium_options-', 'reeses-sodium-options-'],
  'lambdynamiclights': ['lambdynamiclights-'],
  'sodium-dynamic-lights': ['sodium-dynamic-lights-', 'sodiumdynamiclights-'],
  'zume': ['zume-'],
  'logical-zoom': ['logical_zoom-', 'logical-zoom-'],
  'zoomify': ['zoomify-'],
  'wi-zoom': ['wi-zoom-', 'wizoom-'],
  'xaeros-minimap': ['xaeros_minimap_', 'xaeros-minimap-'],
  'xaeros-world-map': ['xaerosworldmap_', 'xaeros-world-map-'],
  'simple-voice-chat': ['voicechat-fabric-', 'voicechat-forge-', 'voicechat-neoforge-', 'voicechat-quilt-', 'voicechat-'],
  'plasmo-voice': ['plasmovoice-'],
  'carry-on': ['carryon-'],
  'waystones': ['waystones-'],
  'sound-physics-remastered': ['sound-physics-remastered-', 'soundphysics-'],
  'customskinloader': ['customskinloader_', 'customskinloader-'],
  '3dskinlayers': ['skinlayers3d-', '3dskinlayers-'],
  'skinshuffle': ['skinshuffle-'],
  'skinrestorer': ['skinrestorer-'],
  'capes': ['capes-'],
  'evergreenhud': ['evergreenhud-'],
  'clean-keystrokes': ['clean-keystrokes-', 'cleankeystrokes-'],
  'armor-hud': ['armor-hud-', 'armorhud-', 'ukus-armor-hud-'],
  'status-effect-bars': ['status-effect-bars-', 'statuseffectbars-'],
  'dynamiccrosshair': ['dynamiccrosshair-'],
  'freelook': ['freelook-'],
  'flashback': ['flashback-'],
  'replaymod': ['replaymod-'],
  'freecam': ['freecam-'],
  'jei': ['jei-'],
  'rei': ['roughlyenoughitems-'],
  'emi': ['emi-'],
  'jade': ['jade-']
};

function extractMcVerFromFilename(fileName = '') {
  const clean = String(fileName).replace(/\.disabled$/i, '').replace(/\.jar$/i, '');
  if (/^fabric-language-kotlin/i.test(clean)) return '';
  // 0. OptiFine jar naming (e.g. OptiFine_1.20.1_HD_U_I6, preview_OptiFine_1.21.4_HD_U_J3_pre8)
  const ofMatch = clean.match(/(?:^|[_-])optifine[_-]((?:2[6-9]\.\d+(?:\.\d+)?|1\.(?:7|8|9|1\d|2\d)(?:\.\d+)?))(?=[_-]|$)/i);
  if (ofMatch) return ofMatch[1];
  // 1. Explicit mc tag (e.g. -mc26.2, -mc1.21.11, +mc1.21.4)
  const mcTag = clean.match(/(?:^|[+_-])mc[+_-]?((?:2[6-9]\.\d+|1\.(?:7|8|9|1\d|2\d))(?:\.\d+)?)(?=[+_-]|$)/i);
  if (mcTag) return mcTag[1];
  // 2. Modrinth +version build metadata (e.g. +26.2, +1.21.11, +1.21.4)
  const plusTag = clean.match(/\+((?:2[6-9]\.\d+|1\.(?:1[2-9]|2\d))(?:\.\d+)?)(?=[+_-]|$)/i);
  if (plusTag) return plusTag[1];
  // 3. Explicit MC version before loader (e.g. jei-1.20.1-forge-..., mod-26.2-fabric)
  const beforeLoader = clean.match(/[+_-]((?:2[6-9]\.\d+(?:\.\d+)?|1\.(?:7\.10|8\.9|12\.2|16\.5|17\.1|18\.2|19\.[24]|20\.[1246]|21(?:\.\d+)?)))[+_-](?:fabric|forge|neoforge|quilt)/i);
  if (beforeLoader) return beforeLoader[1];
  // 4. Multiple version tokens in filename -> take the last valid MC version token
  const allVers = Array.from(clean.matchAll(/[+_-]((?:2[6-9]\.\d+(?:\.\d+)?|1\.(?:7\.10|8\.9|12\.2|16\.5|17\.1|18\.2|19\.[24]|20\.[1246]|21(?:\.\d+)?)))(?=[+_-]|$)/gi));
  if (allVers.length >= 2) {
    return allVers[allVers.length - 1][1];
  }
  return '';
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

// v40.8: remember mods the PLAYER (or PvP Mode) turned off so auto version-sync never re-enables them
function setModUserDisabledFlags(modsFolder, cleanNames, disabled) {
  const list = (Array.isArray(cleanNames) ? cleanNames : [cleanNames])
    .map((n) => path.basename(String(n || '')).replace(/\.disabled$/i, ''))
    .filter(Boolean);
  if (!list.length || !fs.existsSync(modsFolder)) return;
  const meta = readModsMetaManifest(modsFolder);
  let dirty = false;
  for (const clean of list) {
    const cur = meta[clean] || {};
    if (disabled && !cur.userDisabled) {
      meta[clean] = { ...cur, userDisabled: true };
      dirty = true;
    } else if (!disabled && cur.userDisabled) {
      const { userDisabled, ...rest } = cur;
      meta[clean] = rest;
      dirty = true;
    }
  }
  if (dirty) writeModsMetaManifest(modsFolder, meta);
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

async function installModrinthProject({ slug, projectType = 'mod', mcVersion = '1.21.11', loaderType = 'fabric', gameDir, _isDep = false, strictMcVersion = false }, onStatus) {
  const rootDir = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  const folderMap = { mod: 'mods', shader: 'shaderpacks', resourcepack: 'resourcepacks' };
  const targetFolder = path.join(rootDir, folderMap[projectType] || 'mods');
  if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });

  const effectiveLoader = normalizeModrinthLoader(loaderType, mcVersion);
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

  // 2. Fallback within the SAME major.minor family (e.g. 1.21.x) + compatible Core Loader (unless strictMcVersion requested)
  if (matched.length === 0 && !strictMcVersion) {
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

  // 4. Auto-install required dependencies (e.g. Fabric API, Cloth Config, Architectury, GeckoLib) matching the exact mcVersion & loader!
  const installedDeps = [];
  if (projectType === 'mod' && !_isDep && Array.isArray(chosen.dependencies)) {
    const reqDeps = chosen.dependencies.filter((d) => d.dependency_type === 'required' && (d.project_id || d.version_id));
    for (const dep of reqDeps) {
      try {
        let depSlugOrId = dep.project_id || '';
        if (!depSlugOrId && dep.version_id) {
          const verInfo = await fetchJson(`https://api.modrinth.com/v2/version/${encodeURIComponent(dep.version_id)}`);
          if (verInfo?.project_id) depSlugOrId = verInfo.project_id;
        }
        if (!depSlugOrId) continue;
        onStatus?.(`🧩 Đang kiểm tra & tự cài thư viện bắt buộc đi kèm cho ${slug}...`);
        const depRes = await installModrinthProject({
          slug: depSlugOrId,
          projectType: 'mod',
          mcVersion,
          loaderType: effectiveLoader,
          gameDir: rootDir,
          _isDep: true
        }, onStatus);
        if (depRes?.fileName && !depRes.skipped) {
          installedDeps.push(depRes.fileName);
        }
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
      projectId: chosen.project_id || slug,
      mcVersion,
      gameVersions: Array.isArray(chosen.game_versions) ? chosen.game_versions : [mcVersion],
      loader: effectiveLoader,
      updatedAt: Date.now()
    };
    writeModsMetaManifest(targetFolder, meta);
  }

  const finalizeAddonAutoEquip = async (finalName) => {
    let autoEquipped = false;
    if (projectType === 'shader' && finalName) {
      try {
        equipShaderInGame(rootDir, finalName);
        autoEquipped = true;
      } catch (_) {}
      // Auto-install a shader loader if the player doesn't have one yet:
      // Fabric/Quilt/NeoForge → Iris + Sodium, Forge → Oculus + Embeddium (v40.8)
      if (!_isDep && ['fabric', 'quilt', 'neoforge', 'forge'].includes(effectiveLoader)) {
        try {
          const modsFolder = path.join(rootDir, 'mods');
          const curMods = fs.existsSync(modsFolder) ? fs.readdirSync(modsFolder).filter((f) => /\.jar$/i.test(f)) : [];
          const hasShaderMod = curMods.some((f) => /\b(iris|oculus|optifine|optifabric)\b/i.test(f));
          if (!hasShaderMod) {
            const shaderStack = effectiveLoader === 'forge' ? ['embeddium', 'oculus'] : ['sodium', 'iris'];
            onStatus?.(`✨ Tự động trang bị trình chạy Shader (${shaderStack.join(' + ')}) cho MC ${mcVersion}...`);
            for (const depSlug of shaderStack) {
              try {
                const sr = await installModrinthProject({
                  slug: depSlug,
                  projectType: 'mod',
                  mcVersion,
                  loaderType: effectiveLoader,
                  gameDir: rootDir,
                  _isDep: true
                }, onStatus);
                if (sr?.fileName && !sr.skipped) installedDeps.push(sr.fileName);
              } catch (_) {}
            }
          }
        } catch (_) {}
      }
    } else if (projectType === 'resourcepack' && finalName) {
      try {
        equipResourcePackInGame(rootDir, finalName);
        autoEquipped = true;
      } catch (_) {}
    }
    return autoEquipped;
  };

  // If the exact file was previously cached as .jar.disabled, re-enable it immediately without re-downloading!
  if (!fs.existsSync(destPath) && fs.existsSync(disabledPath) && fs.statSync(disabledPath).size > 1024) {
    try {
      fs.renameSync(disabledPath, destPath);
      if (projectType === 'mod') setModUserDisabledFlags(path.dirname(destPath), fileObj.filename, false);
      const autoEquipped = await finalizeAddonAutoEquip(fileObj.filename);
      onStatus?.(`✓ Đã kích hoạt ngay ${fileObj.filename} (chuẩn ${mcVersion}) có sẵn trong máy!`);
      return { ok: true, fileName: fileObj.filename, versionNumber: chosen.version_number, destPath, skipped: true, installedDeps, autoEquipped };
    } catch (_) {}
  }

  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1024) {
    const autoEquipped = await finalizeAddonAutoEquip(fileObj.filename);
    onStatus?.(`✓ Gói ${fileObj.filename} đã cài sẵn trên máy${autoEquipped ? ' & tự bật trong Game' : ''}.`);
    return { ok: true, fileName: fileObj.filename, versionNumber: chosen.version_number, destPath, skipped: true, installedDeps, autoEquipped };
  }

  onStatus?.(`Đang tải ${fileObj.filename} (chuẩn ${mcVersion} • ${effectiveLoader.toUpperCase()})...`);
  await downloadFile(fileObj.url, destPath);
  const autoEquipped = await finalizeAddonAutoEquip(fileObj.filename);
  return { ok: true, fileName: fileObj.filename, versionNumber: chosen.version_number, destPath, installedDeps, autoEquipped };
}

/* ---------------- v40.4 PRO: In-Game Auto-Equip & Deep .jar Inspector ---------------- */
function equipShaderInGame(gameDir, shaderFileName) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const cleanName = path.basename(String(shaderFileName || '')).replace(/\.disabled$/i, '').trim();
  const configDir = path.join(rootDir, 'config');
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

  // 1. Iris / Sodium shader config (config/iris.properties)
  const irisPath = path.join(configDir, 'iris.properties');
  let irisText = fs.existsSync(irisPath) ? fs.readFileSync(irisPath, 'utf8') : '';
  const nl = irisText.includes('\r\n') ? '\r\n' : '\n';
  const upsertProp = (txt, key, val) => {
    const rx = new RegExp(`^${key}=.*\\r?$`, 'm');
    if (rx.test(txt)) return txt.replace(rx, `${key}=${val}`);
    return (txt ? (txt.endsWith('\n') ? txt : txt + nl) : '') + `${key}=${val}${nl}`;
  };
  if (cleanName) {
    irisText = upsertProp(irisText, 'shaderPack', cleanName);
    irisText = upsertProp(irisText, 'enableShaders', 'true');
  } else {
    irisText = upsertProp(irisText, 'enableShaders', 'false');
  }
  fs.writeFileSync(irisPath, irisText, 'utf8');

  // 2. OptiFine / Oculus shader config (optionsshaders.txt)
  const ofPath = path.join(rootDir, 'optionsshaders.txt');
  let ofText = fs.existsSync(ofPath) ? fs.readFileSync(ofPath, 'utf8') : '';
  ofText = upsertProp(ofText, 'shaderPack', cleanName || '(internal)');
  fs.writeFileSync(ofPath, ofText, 'utf8');

  return { ok: true, equippedShader: cleanName };
}

function equipResourcePackInGame(gameDir, packFileName, enable = true) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir, { recursive: true });
  const cleanName = path.basename(String(packFileName || '')).replace(/\.disabled$/i, '').trim();
  if (!cleanName) return { ok: false };
  const packToken = `file/${cleanName}`;
  const optsPath = path.join(rootDir, 'options.txt');
  let optsContent = fs.existsSync(optsPath) ? fs.readFileSync(optsPath, 'utf8') : '';
  const nl = optsContent.includes('\r\n') ? '\r\n' : '\n';

  if (/^resourcePacks:\[.*?\]\r?$/m.test(optsContent)) {
    optsContent = optsContent.replace(/^resourcePacks:\[(.*?)\](\r?)$/m, (_full, inner, cr) => {
      let items = [];
      try {
        items = JSON.parse(`[${inner}]`);
      } catch (_) {
        items = inner.split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
      }
      const hadSkinSync = items.includes('file/AetherSkinSync.zip');
      items = items.filter((it) => it !== packToken && it !== cleanName && it !== 'file/AetherSkinSync.zip');
      if (!items.includes('vanilla')) items.unshift('vanilla');
      if (enable) items.push(packToken);
      if (hadSkinSync && (packToken !== 'file/AetherSkinSync.zip' || enable)) items.push('file/AetherSkinSync.zip');
      return `resourcePacks:${JSON.stringify(items)}${cr}`;
    });
  } else if (enable) {
    optsContent += (optsContent.endsWith('\n') || !optsContent ? '' : nl) + `resourcePacks:${JSON.stringify(['vanilla', packToken])}${nl}`;
  }

  if (enable) {
    optsContent = optsContent.replace(/^incompatibleResourcePacks:\[(.*?)\](\r?)$/m, (_full, inner, cr) => {
      try {
        const items = JSON.parse(`[${inner}]`).filter((it) => it !== packToken && it !== cleanName);
        return `incompatibleResourcePacks:${JSON.stringify(items)}${cr}`;
      } catch (_) {
        return `incompatibleResourcePacks:[]${cr}`;
      }
    });
  }
  fs.writeFileSync(optsPath, optsContent, 'utf8');
  return { ok: true, equippedPack: enable ? cleanName : '' };
}

function getEquippedAddonsState(gameDir) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  let activeShader = '';
  const activeResourcePacks = [];
  try {
    const irisPath = path.join(rootDir, 'config', 'iris.properties');
    if (fs.existsSync(irisPath)) {
      const txt = fs.readFileSync(irisPath, 'utf8');
      const enM = txt.match(/^enableShaders=(\S+)/m);
      const spM = txt.match(/^shaderPack=(.+)$/m);
      if ((!enM || enM[1].trim() !== 'false') && spM && spM[1].trim()) {
        activeShader = spM[1].trim();
      }
    }
    if (!activeShader) {
      const ofPath = path.join(rootDir, 'optionsshaders.txt');
      if (fs.existsSync(ofPath)) {
        const txt = fs.readFileSync(ofPath, 'utf8');
        const spM = txt.match(/^shaderPack=(.+)$/m);
        if (spM && spM[1].trim() && spM[1].trim() !== '(internal)' && spM[1].trim() !== 'OFF') {
          activeShader = spM[1].trim();
        }
      }
    }
  } catch (_) {}

  try {
    const optsPath = path.join(rootDir, 'options.txt');
    if (fs.existsSync(optsPath)) {
      const txt = fs.readFileSync(optsPath, 'utf8');
      const rpM = txt.match(/^resourcePacks:\[(.*?)\]\r?$/m);
      if (rpM) {
        let items = [];
        try { items = JSON.parse(`[${rpM[1]}]`); } catch (_) {}
        for (const it of items) {
          const s = String(it || '');
          if (s.startsWith('file/') && s !== 'file/AetherSkinSync.zip') {
            activeResourcePacks.push(s.slice(5));
          }
        }
      }
    }
  } catch (_) {}

  return { ok: true, activeShader, activeResourcePacks };
}

function applySmartGameOptions(gameDirectory, { autoViLang = false, potatoGraphicsPreset = false, fpsCap = 0 } = {}) {
  if (!autoViLang && !potatoGraphicsPreset) return;
  try {
    if (!fs.existsSync(gameDirectory)) fs.mkdirSync(gameDirectory, { recursive: true });
    const optsPath = path.join(gameDirectory, 'options.txt');
    let content = fs.existsSync(optsPath) ? fs.readFileSync(optsPath, 'utf8') : '';
    const nl = content.includes('\r\n') ? '\r\n' : '\n';

    const setOpt = (key, val, onlyIfHigherNum = null) => {
      const rx = new RegExp(`^${key}:(.*?)(\\r?)$`, 'm');
      const m = content.match(rx);
      if (m) {
        if (onlyIfHigherNum !== null) {
          const curNum = parseFloat(m[1].trim());
          if (!Number.isNaN(curNum) && curNum <= onlyIfHigherNum) return;
        }
        content = content.replace(rx, `${key}:${val}$2`);
      } else {
        content += (content && !content.endsWith('\n') ? nl : '') + `${key}:${val}${nl}`;
      }
    };

    if (autoViLang) {
      setOpt('lang', 'vi_vn');
    }
    if (potatoGraphicsPreset) {
      setOpt('enableVsync', 'false');
      setOpt('entityShadows', 'false');
      setOpt('simulationDistance', '5', 5);
      setOpt('renderDistance', '8', 8);
      setOpt('biomeBlendRadius', '1', 1);
      setOpt('particles', '1');
      setOpt('clouds', '"fast"');
      // When "Mượt Êm" is on, never lift the FPS cap above the monitor-matched gentle limit
      setOpt('maxFps', String(fpsCap > 0 ? Math.min(120, fpsCap) : 120));
      setOpt('gamma', '1.0');
    }
    fs.writeFileSync(optsPath, content, 'utf8');
  } catch (_) {}
}

/* ---------------- v40.8 PRO: "Mượt Êm" — Smooth Without Stressing the PC ----------------
 * Philosophy: remove *wasted* work instead of pushing hardware harder.
 *  - Cap FPS to the monitor refresh rate (frames above it are never displayed, only heat the GPU)
 *  - Trim CPU-heavy simulation distance, Fabulous graphics, extra mipmaps & far entity rendering
 *  - Never raises CPU priority, never forces the discrete GPU, never unlocks FPS
 *  - Applied ONCE per game folder (respects later in-game changes) and fully reversible:
 *    turning it off restores every original value the player has not changed since.
 */
const GENTLE_SMOOTH_MARKER = '.blockway-gentle-smooth.json';
const GENTLE_SMOOTH_VERSION = 1;

function computeGentleFpsCap(displayHz) {
  const hz = Math.round(Number(displayHz) || 0);
  if (!hz || hz < 30) return 75;
  return Math.max(60, Math.min(144, hz));
}

function readOptValue(content, key) {
  const m = content.match(new RegExp(`^${key}:(.*?)\\r?$`, 'm'));
  return m ? m[1].trim() : null;
}

function writeOptValue(content, key, val) {
  const rx = new RegExp(`^${key}:(.*?)(\\r?)$`, 'm');
  if (rx.test(content)) return content.replace(rx, `${key}:${val}$2`);
  const nl = content.includes('\r\n') ? '\r\n' : '\n';
  return content + (content && !content.endsWith('\n') ? nl : '') + `${key}:${val}${nl}`;
}

function removeOptLine(content, key) {
  return content.replace(new RegExp(`^${key}:.*(\\r?\\n|$)`, 'm'), '');
}

function applyGentleSmoothOptions(gameDirectory, { enabled = false, displayHz = 0 } = {}) {
  const optsPath = path.join(gameDirectory, 'options.txt');
  const markerPath = path.join(gameDirectory, GENTLE_SMOOTH_MARKER);
  let marker = null;
  try {
    if (fs.existsSync(markerPath)) marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch (_) {
    marker = null;
  }

  // Turned OFF → restore originals (only keys the player has not touched since we tuned them)
  if (!enabled) {
    if (!marker || !marker.applied) return { ok: true, changed: [], reverted: 0 };
    let reverted = 0;
    try {
      if (fs.existsSync(optsPath)) {
        let content = fs.readFileSync(optsPath, 'utf8');
        for (const [key, rec] of Object.entries(marker.applied)) {
          const cur = readOptValue(content, key);
          if (cur === null || cur !== String(rec.value)) continue;
          content = rec.original === null ? removeOptLine(content, key) : writeOptValue(content, key, rec.original);
          reverted++;
        }
        fs.writeFileSync(optsPath, content, 'utf8');
      }
    } catch (_) {}
    try { fs.rmSync(markerPath, { force: true }); } catch (_) {}
    return { ok: true, changed: [], reverted };
  }

  // Already tuned once for this folder → respect whatever the player chose afterwards
  if (marker && marker.version === GENTLE_SMOOTH_VERSION) {
    return { ok: true, changed: [], alreadyTuned: true, fpsCap: marker.fpsCap };
  }

  const fpsCap = computeGentleFpsCap(displayHz);
  // [key, defaultWhenMissing, target, shouldLower(currentNumber)]
  const rules = [
    ['maxFps', 120, fpsCap, (v) => v > fpsCap],
    ['simulationDistance', 12, 8, (v) => v > 8],
    ['renderDistance', 12, 12, (v) => v > 12],
    ['graphicsMode', 1, 1, (v) => v >= 2],
    ['prioritizeChunkUpdates', 0, 0, (v) => v > 0],
    ['mipmapLevels', 4, 2, (v) => v > 2],
    ['entityDistanceScaling', 1.0, 0.75, (v) => v > 0.75],
    ['biomeBlendRadius', 2, 2, (v) => v > 2]
  ];

  const applied = {};
  const changed = [];
  try {
    if (!fs.existsSync(gameDirectory)) fs.mkdirSync(gameDirectory, { recursive: true });
    let content = fs.existsSync(optsPath) ? fs.readFileSync(optsPath, 'utf8') : '';
    for (const [key, defVal, target, shouldLower] of rules) {
      const raw = readOptValue(content, key);
      const cur = raw === null ? defVal : parseFloat(String(raw).replace(/"/g, ''));
      if (Number.isNaN(cur) || !shouldLower(cur)) continue;
      const val = key === 'entityDistanceScaling' ? Number(target).toFixed(2) : String(target);
      applied[key] = { original: raw, value: val };
      content = writeOptValue(content, key, val);
      changed.push(key);
    }
    fs.writeFileSync(optsPath, content, 'utf8');
    fs.writeFileSync(markerPath, JSON.stringify({
      version: GENTLE_SMOOTH_VERSION,
      tunedAt: new Date().toISOString(),
      fpsCap,
      applied
    }, null, 2), 'utf8');
  } catch (e) {
    return { ok: false, changed: [], error: e.message };
  }
  return { ok: true, changed, fpsCap };
}

/* Gentle JVM tuning: keep background GC threads light so Minecraft never hogs every CPU core,
 * and use Java 25 compact object headers (less RAM, less work) when available. */
function applyGentleJvmTuning(args, { javaMajor = 0, cpuCores = os.cpus().length } = {}) {
  const cores = Math.max(1, Number(cpuCores) || os.cpus().length || 4);
  const list = Array.isArray(args) ? args.slice() : [];
  const isZgc = list.includes('-XX:+UseZGC');
  const concCap = isZgc ? Math.max(2, Math.ceil(cores / 4)) : Math.max(1, Math.ceil(cores / 4));
  const out = list.map((a) => {
    const m = String(a).match(/^-XX:ConcGCThreads=(\d+)$/);
    return m ? `-XX:ConcGCThreads=${Math.min(parseInt(m[1], 10), concCap)}` : a;
  });
  if (javaMajor >= 25 && !out.includes('-XX:+UseCompactObjectHeaders')) {
    out.push('-XX:+UseCompactObjectHeaders');
  }
  return out;
}

/* Rate-limit game stdout forwarding so mod log-spam never burns CPU in the game or the launcher UI. */
function createLogThrottle(emit, maxPerSec = 150) {
  let windowStart = Date.now();
  let count = 0;
  let dropped = 0;
  const priorityRx = /error|exception|fatal|crash|LWJGL|OpenAL|Sound engine|Setting user|Stopping!|e4mc|hosted on port/i;
  return (line) => {
    const now = Date.now();
    if (now - windowStart >= 1000) {
      if (dropped > 0) emit(`[BlockWay] ⏩ Đã gộp bớt ${dropped} dòng log lặp lại trong 1 giây để game chạy êm hơn.`);
      windowStart = now;
      count = 0;
      dropped = 0;
    }
    const isPriority = priorityRx.test(line);
    if (count < maxPerSec || (isPriority && count < maxPerSec * 3)) {
      count++;
      emit(line);
    } else {
      dropped++;
    }
  };
}

function parseMcVersionTuple(verStr) {
  const clean = String(verStr || '').trim().replace(/^[vV=]/, '').split(/[-+]/)[0];
  const m = clean.match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), m[3] !== undefined ? parseInt(m[3], 10) : 0, m[3] !== undefined];
}

function compareMcTuples(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

function doesMcVersionSatisfySpec(targetMcVer, specRaw) {
  if (!specRaw) return true;
  if (Array.isArray(specRaw)) {
    return specRaw.length === 0 || specRaw.some((s) => doesMcVersionSatisfySpec(targetMcVer, s));
  }
  const target = parseMcVersionTuple(targetMcVer);
  if (!target) return true; // Snapshot or custom ID -> don't falsely reject
  const raw = String(specRaw).trim();
  if (!raw || raw === '*' || raw === 'any') return true;

  // Handle OR pipes "1.21.4 || 1.21.5"
  if (raw.includes('||')) {
    return raw.split('||').some((part) => doesMcVersionSatisfySpec(targetMcVer, part.trim()));
  }

  // Handle Maven / Forge / NeoForge interval notation: [1.20.1,1.21), [1.21.4]
  if (/^[\[(]/.test(raw) && /[\])]$/.test(raw)) {
    const minInc = raw.startsWith('[');
    const maxInc = raw.endsWith(']');
    const inner = raw.slice(1, -1).trim();
    if (!inner.includes(',')) {
      const exactT = parseMcVersionTuple(inner);
      return exactT ? compareMcTuples(target, exactT) === 0 : true;
    }
    const [minStr, maxStr] = inner.split(',').map((x) => x.trim());
    if (minStr) {
      const minT = parseMcVersionTuple(minStr);
      if (minT) {
        const c = compareMcTuples(target, minT);
        if (minInc ? c < 0 : c <= 0) return false;
      }
    }
    if (maxStr) {
      const maxT = parseMcVersionTuple(maxStr);
      if (maxT) {
        const c = compareMcTuples(target, maxT);
        if (maxInc ? c > 0 : c >= 0) return false;
      }
    }
    return true;
  }

  // Handle wildcard 1.21.x / 1.21.*
  const wildM = raw.match(/^(\d+)\.(\d+)\.[xX*]$/);
  if (wildM) {
    return target[0] === parseInt(wildM[1], 10) && target[1] === parseInt(wildM[2], 10);
  }

  // Handle Tilde ~1.21.4 or ~1.21 (Fabric SemVer: ~1.21.4 allows >=1.21.4 <1.22.0)
  if (raw.startsWith('~')) {
    const baseT = parseMcVersionTuple(raw.slice(1));
    if (!baseT) return true;
    return target[0] === baseT[0] && target[1] === baseT[1] && target[2] >= baseT[2];
  }

  // Handle Caret ^1.21.4 (>=1.21.4 <2.0.0 for 1.x, or same major)
  if (raw.startsWith('^')) {
    const baseT = parseMcVersionTuple(raw.slice(1));
    if (!baseT) return true;
    return target[0] === baseT[0] && compareMcTuples(target, baseT) >= 0;
  }

  // Handle space-separated comparators: ">=1.21 <1.21.2" or ">=1.20.1 <=1.20.4"
  const tokens = raw.split(/\s+/).filter(Boolean);
  let checkedAny = false;
  for (const tok of tokens) {
    const opM = tok.match(/^(>=|<=|>|<|=)?(\d+\.\d+(?:\.\d+)?)(?:[-+].*)?$/);
    if (!opM) continue;
    const op = opM[1] || '=';
    const refT = parseMcVersionTuple(opM[2]);
    if (!refT) continue;
    checkedAny = true;
    const cmp = compareMcTuples(target, refT);
    if (op === '=' && cmp !== 0) return false;
    if (op === '>=' && cmp < 0) return false;
    if (op === '<=' && cmp > 0) return false;
    if (op === '>' && cmp <= 0) return false;
    if (op === '<' && cmp >= 0) return false;
  }
  return checkedAny ? true : true;
}

function inspectJarModMetadata(jarFullPath) {
  try {
    if (!fs.existsSync(jarFullPath)) return null;
    const zip = openPackZip(jarFullPath);
    const loaders = new Set();
    let modId = '';
    let mcDepSpec = null;

    // 1. Fabric (fabric.mod.json)
    const fabEntry = zip.getEntry('fabric.mod.json');
    if (fabEntry) {
      loaders.add('fabric');
      try {
        const rawJson = fabEntry.getData().toString('utf8').replace(/^\uFEFF/, '');
        const parsed = JSON.parse(rawJson);
        if (parsed?.id && !modId) modId = String(parsed.id).toLowerCase();
        if (parsed?.depends?.minecraft) mcDepSpec = parsed.depends.minecraft;
      } catch (_) {}
    }

    // 2. Quilt (quilt.mod.json)
    const quiltEntry = zip.getEntry('quilt.mod.json');
    if (quiltEntry) {
      loaders.add('quilt');
      try {
        const parsed = JSON.parse(quiltEntry.getData().toString('utf8').replace(/^\uFEFF/, ''));
        const qMod = parsed?.quilt_loader;
        if (qMod?.id && !modId) modId = String(qMod.id).toLowerCase();
        if (!mcDepSpec && Array.isArray(qMod?.depends)) {
          const mcD = qMod.depends.find((d) => d && (d.id === 'minecraft' || d === 'minecraft'));
          if (mcD?.versions) mcDepSpec = mcD.versions;
        }
      } catch (_) {}
    }

    // 3. NeoForge (META-INF/neoforge.mods.toml)
    const neoEntry = zip.getEntry('META-INF/neoforge.mods.toml');
    if (neoEntry) {
      loaders.add('neoforge');
      try {
        const toml = neoEntry.getData().toString('utf8');
        const idM = toml.match(/modId\s*=\s*"([^"]+)"/);
        if (idM && !modId) modId = idM[1].toLowerCase();
        const blocks = toml.split(/\[\[dependencies\.[^\]]+\]\]/i);
        for (const blk of blocks) {
          if (/modId\s*=\s*"minecraft"/i.test(blk)) {
            const vrM = blk.match(/versionRange\s*=\s*"([^"]+)"/i);
            if (vrM && !mcDepSpec) mcDepSpec = vrM[1].trim();
          }
        }
      } catch (_) {}
    }

    // 4. Forge (META-INF/mods.toml or legacy mcmod.info)
    const forgeEntry = zip.getEntry('META-INF/mods.toml');
    if (forgeEntry) {
      loaders.add('forge');
      try {
        const toml = forgeEntry.getData().toString('utf8');
        const idM = toml.match(/modId\s*=\s*"([^"]+)"/);
        if (idM && !modId) modId = idM[1].toLowerCase();
        const blocks = toml.split(/\[\[dependencies\.[^\]]+\]\]/i);
        for (const blk of blocks) {
          if (/modId\s*=\s*"minecraft"/i.test(blk)) {
            const vrM = blk.match(/versionRange\s*=\s*"([^"]+)"/i);
            if (vrM && !mcDepSpec) mcDepSpec = vrM[1].trim();
          }
        }
      } catch (_) {}
    } else if (zip.getEntry('mcmod.info')) {
      loaders.add('forge');
      try {
        const infoTxt = zip.getEntry('mcmod.info').getData().toString('utf8');
        const mcM = infoTxt.match(/"mcversion"\s*:\s*"([^"]+)"/i);
        if (mcM && !mcDepSpec) mcDepSpec = mcM[1].trim();
      } catch (_) {}
    }

    if (loaders.size === 0 && !modId && !mcDepSpec) return null;
    return {
      inspectedLoaders: Array.from(loaders),
      modId,
      mcDepSpec: mcDepSpec || ''
    };
  } catch (_) {
    return null;
  }
}

function getOrInspectModMeta(modsFolder, meta, cleanFileName, actualDiskFileName) {
  let mEntry = meta[cleanFileName];
  if (mEntry && (Array.isArray(mEntry.gameVersions) || Array.isArray(mEntry.inspectedLoaders))) {
    return { entry: mEntry, dirty: false };
  }
  const fullPath = path.join(modsFolder, actualDiskFileName || cleanFileName);
  const inspected = inspectJarModMetadata(fullPath);
  if (!inspected) return { entry: mEntry || null, dirty: false };
  const merged = {
    ...(mEntry || {}),
    inspectedLoaders: inspected.inspectedLoaders,
    mcDepSpec: inspected.mcDepSpec,
    modId: inspected.modId || mEntry?.modId || '',
    slug: mEntry?.slug || (inspected.modId && COMMON_MODID_TO_MODRINTH_SLUG[inspected.modId]) || ''
  };
  meta[cleanFileName] = merged;
  return { entry: merged, dirty: true };
}

function isLoaderListCompatible(modLoaders, effectiveLoader) {
  if (!Array.isArray(modLoaders) || modLoaders.length === 0) return true;
  if (modLoaders.includes(effectiveLoader)) return true;
  if (effectiveLoader === 'quilt' && modLoaders.includes('fabric')) return true;
  return false;
}

async function ensureModsMatchVersion(gameDir, mcVersion, loaderType, onStatus) {
  if (!loaderType || loaderType === 'vanilla') return;
  const rootDir = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  const modsFolder = path.join(rootDir, 'mods');
  if (!fs.existsSync(modsFolder)) return;

  const effectiveLoader = normalizeModrinthLoader(loaderType, mcVersion);
  const meta = readModsMetaManifest(modsFolder);
  let metaDirty = false;
  let files = [];
  try {
    files = fs.readdirSync(modsFolder).filter((f) => /\.jar(\.disabled)?$/i.test(f));
  } catch (_) {
    return;
  }
  if (files.length === 0) return;

  // Populate Deep .jar Metadata for any hand-dropped jars lacking manifest info
  for (const f of files) {
    const cleanName = f.replace(/\.disabled$/i, '');
    const res = getOrInspectModMeta(modsFolder, meta, cleanName, f);
    if (res.dirty) metaDirty = true;
  }
  if (metaDirty) writeModsMetaManifest(modsFolder, meta);

  const isFileCompatibleWithVersion = (cleanFileName, strictReEnable = false) => {
    const mEntry = meta[cleanFileName];
    if (mEntry) {
      const modLoaders = Array.isArray(mEntry.inspectedLoaders) && mEntry.inspectedLoaders.length > 0
        ? mEntry.inspectedLoaders
        : (mEntry.loader ? [mEntry.loader] : []);
      if (modLoaders.length > 0 && !isLoaderListCompatible(modLoaders, effectiveLoader)) {
        return false;
      }
      if (Array.isArray(mEntry.gameVersions) && mEntry.gameVersions.length > 0) {
        return mEntry.gameVersions.includes(mcVersion);
      }
      if (mEntry.mcDepSpec) {
        return doesMcVersionSatisfySpec(mcVersion, mEntry.mcDepSpec);
      }
    }
    const explicitVer = extractMcVerFromFilename(cleanFileName);
    if (explicitVer) {
      return explicitVer === mcVersion;
    }
    return !strictReEnable;
  };

  const inferSlugFromFilename = (cleanFileName) => {
    if (meta[cleanFileName]?.slug) return meta[cleanFileName].slug;
    const modId = meta[cleanFileName]?.modId;
    if (modId && COMMON_MODID_TO_MODRINTH_SLUG[modId]) return COMMON_MODID_TO_MODRINTH_SLUG[modId];
    const lower = cleanFileName.toLowerCase();
    for (const [slug, prefixes] of Object.entries(KNOWN_MOD_SLUG_PREFIXES)) {
      if (prefixes.some((p) => lower.startsWith(p))) return slug;
    }
    if (modId && modId.length >= 3) return modId;
    return '';
  };

  // Step 1: Re-enable cached .jar.disabled files that strictly match target mcVersion + effectiveLoader
  // v40.8: …but NEVER the ones the player (or PvP Mode) switched off on purpose
  for (const f of files) {
    if (!f.toLowerCase().endsWith('.disabled')) continue;
    const cleanName = f.replace(/\.disabled$/i, '');
    if (meta[cleanName]?.userDisabled) continue;
    if (isFileCompatibleWithVersion(cleanName, true)) {
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

  // Step 2: Check enabled .jar files for version/loader mismatch; disable incompatible ones and auto-fetch matching build if known
  const slugsToAutoFetch = new Set();
  for (const f of files) {
    if (!isFileCompatibleWithVersion(f, false)) {
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
  const norm = normalizeModrinthLoader(loaderType, mcVersion);
  const effectiveLoader = norm === 'forge' ? 'forge' : (norm === 'neoforge' ? 'neoforge' : 'fabric');
  // v40.8 PRO: + ModernFix (faster loading & lower RAM/CPU usage — lighter on the PC, not heavier)
  const packSlugs =
    effectiveLoader === 'forge'
      ? ['embeddium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'modernfix']
      : effectiveLoader === 'neoforge'
        ? ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'modernfix', 'iris']
        : ['fabric-api', 'sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'modernfix', 'iris'];

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

/* ---------------- v40.9 PRO: OptiFine Parity 1-Click Pack & Smart OptiFine.jar Handler ---------------- */
function isProprietaryOptifineFile(fileName = '') {
  return /^(?:preview_)?(?:optifine|optifabric)(?:[-_+.]|\.jar|$)/i.test(path.basename(String(fileName || '')));
}

function inspectOptifineJar(filePath) {
  const baseName = path.basename(String(filePath || ''));
  if (!filePath || !/\.jar$/i.test(baseName) || !fs.existsSync(filePath)) {
    return { isOptifine: false };
  }
  const nameMatches = /^(?:preview_)?optifine(?:[_-]|$|\.jar)/i.test(baseName);
  let mcVersion = extractMcVerFromFilename(baseName);
  let hasInstaller = false;
  let hasTweaker = false;
  try {
    const zip = openPackZip(filePath);
    const entries = zip.getEntries();
    const names = entries.map((e) => e.entryName.replace(/\\/g, '/'));
    hasInstaller = names.includes('optifine/Installer.class');
    hasTweaker = names.some((n) => /^optifine\/OptiFine(?:Forge)?Tweaker\.class$/i.test(n));
    if (!mcVersion && (nameMatches || hasInstaller || hasTweaker)) {
      const chg = entries.find((e) => e.entryName === 'changelog.txt' || e.entryName === 'optifine/Installer.class');
      if (chg) {
        const raw = chg.getData().toString('latin1');
        const m = raw.match(/OptiFine[_ ]((?:2[6-9]\.\d+(?:\.\d+)?|1\.\d+(?:\.\d+)?))[_ ]HD/i);
        if (m) mcVersion = m[1];
      }
    }
  } catch (_) {
    if (!nameMatches) return { isOptifine: false };
  }
  if (!nameMatches && !hasInstaller && !hasTweaker) return { isOptifine: false };
  return {
    isOptifine: true,
    fileName: baseName,
    mcVersion: mcVersion || '',
    hasInstaller,
    isForgeMod: true
  };
}

function parkOptifineConflictsInMods(modsDir, mode = 'for-parity') {
  const parked = [];
  if (!modsDir || !fs.existsSync(modsDir)) return parked;
  const rx = mode === 'for-optifine'
    ? /^(?:sodium|embeddium|rubidium|iris|oculus|sodium[-_]extra|reeses[-_]sodium[-_]options|indium|continuity)(?:[-_+.]|\.jar$)/i
    : /^(?:preview_)?(?:optifine|optifabric)(?:[-_+.]|\.jar$)/i;
  try {
    for (const f of fs.readdirSync(modsDir)) {
      if (!/\.jar$/i.test(f)) continue;
      if (!rx.test(f)) continue;
      try {
        fs.renameSync(path.join(modsDir, f), path.join(modsDir, `${f}.disabled`));
        parked.push(f);
      } catch (_) {}
    }
    if (parked.length > 0) setModUserDisabledFlags(modsDir, parked, true);
  } catch (_) {}
  return parked;
}

function buildZoomSlugCandidates(zoomMod = 'auto', loader = 'fabric') {
  const pref = String(zoomMod || 'auto').toLowerCase().trim();
  const isForgeLike = loader === 'forge' || loader === 'neoforge';
  const base = isForgeLike
    ? ['zume', 'zoomify', 'just-zoom', 'ok-zoomer']
    : ['zoomify', 'logical-zoom', 'zume', 'wi-zoom', 'ok-zoomer'];
  if (!pref || pref === 'auto') return base;
  const map = {
    zoomify: 'zoomify',
    'logical-zoom': 'logical-zoom',
    zume: 'zume',
    'wi-zoom': 'wi-zoom',
    'ok-zoomer': 'ok-zoomer'
  };
  const chosen = map[pref] || pref;
  return [chosen, ...base.filter((s) => s !== chosen)];
}

async function installOptifineParityPack({
  mcVersion = '1.21.4',
  loaderType = 'fabric',
  gameDir,
  instanceDir = '',
  features = null,
  zoomMod = 'auto'
} = {}, onStatus) {
  const rootDir = (instanceDir && fs.existsSync(String(instanceDir)))
    ? String(instanceDir)
    : (gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir());
  const normalizedLoader = normalizeModrinthLoader(loaderType, mcVersion);
  const effectiveLoader = ['forge', 'neoforge', 'quilt', 'fabric'].includes(normalizedLoader) ? normalizedLoader : 'fabric';
  const modsDir = path.join(rootDir, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });

  const ALL_FEATURES = ['fps', 'shader', 'zoom', 'lights', 'ctm', 'entities'];
  const pickedSet = new Set(
    Array.isArray(features) && features.length > 0
      ? features.map((f) => String(f || '').toLowerCase().trim()).filter((f) => ALL_FEATURES.includes(f))
      : ALL_FEATURES
  );
  if (pickedSet.size === 0) {
    return { ok: false, error: 'Hãy chọn ít nhất 1 tính năng trong Bộ Chuẩn OptiFine để cài đặt.', installed: [], alreadyPresent: [] };
  }

  // Park any existing OptiFine / OptiFabric jar when FPS or Shader engine is installed so Sodium + Iris never collide
  const parkedConflicts = (pickedSet.has('fps') || pickedSet.has('shader'))
    ? parkOptifineConflictsInMods(modsDir, 'for-parity')
    : [];

  const groups = [];
  const needRenderBase = pickedSet.has('fps') || pickedSet.has('shader');

  if (effectiveLoader === 'fabric') {
    groups.push(['fabric-api']);
  } else if (effectiveLoader === 'quilt') {
    groups.push(['qsl', 'fabric-api']);
  }

  if (effectiveLoader === 'forge') {
    if (needRenderBase) groups.push(['embeddium', 'rubidium']);
    if (pickedSet.has('fps')) {
      groups.push(['entityculling']);
      groups.push(['ferrite-core']);
    }
    if (pickedSet.has('shader')) groups.push(['oculus']);
    if (pickedSet.has('zoom')) groups.push(buildZoomSlugCandidates(zoomMod, 'forge'));
    if (pickedSet.has('lights')) groups.push(['ryoamiclights', 'embeddium-dynamic-lights', 'dynamiclights-reforged', 'sodium-dynamic-lights']);
    if (pickedSet.has('ctm')) groups.push(['fusion-connected-textures', 'continuity']);
    if (pickedSet.has('entities')) {
      groups.push(['entity-model-features']);
      groups.push(['entitytexturefeatures']);
      groups.push(['polytone']);
    }
  } else if (effectiveLoader === 'neoforge') {
    if (needRenderBase) groups.push(['sodium', 'embeddium']);
    if (pickedSet.has('fps')) {
      groups.push(['sodium-extra']);
      groups.push(['reeses-sodium-options']);
      groups.push(['entityculling']);
      groups.push(['ferrite-core']);
    }
    if (pickedSet.has('shader')) groups.push(['iris', 'oculus']);
    if (pickedSet.has('zoom')) groups.push(buildZoomSlugCandidates(zoomMod, 'neoforge'));
    if (pickedSet.has('lights')) groups.push(['lambdynamiclights', 'sodium-dynamic-lights', 'ryoamiclights']);
    if (pickedSet.has('ctm')) groups.push(['fusion-connected-textures', 'continuity']);
    if (pickedSet.has('entities')) {
      groups.push(['entity-model-features']);
      groups.push(['entitytexturefeatures']);
      groups.push(['polytone']);
    }
  } else {
    if (needRenderBase) {
      groups.push(['sodium']);
      if (compareMcVersions(mcVersion, '1.21.2') < 0) groups.push(['indium']);
    }
    if (pickedSet.has('fps')) {
      groups.push(['sodium-extra']);
      groups.push(['reeses-sodium-options']);
      groups.push(['entityculling']);
      groups.push(['ferrite-core']);
    }
    if (pickedSet.has('shader')) groups.push(['iris']);
    if (pickedSet.has('zoom')) groups.push(buildZoomSlugCandidates(zoomMod, effectiveLoader));
    if (pickedSet.has('lights')) groups.push(['lambdynamiclights', 'sodium-dynamic-lights', 'ryoamiclights']);
    if (pickedSet.has('ctm')) groups.push(['continuity', 'fusion-connected-textures']);
    if (pickedSet.has('entities')) {
      groups.push(['entity-model-features']);
      groups.push(['entitytexturefeatures']);
      groups.push(['polytone', 'cit-resewn']);
    }
  }

  const installed = [];
  const alreadyPresent = [];
  const errors = [];
  for (let i = 0; i < groups.length; i++) {
    const candidates = groups[i];
    let groupSuccess = false;
    let lastErr = '';
    for (const slug of candidates) {
      try {
        onStatus?.(`🔆 [${i + 1}/${groups.length}] Đang trang bị gói Chuẩn OptiFine (${effectiveLoader.toUpperCase()}): ${slug.toUpperCase()} (${mcVersion})...`);
        const res = await installModrinthProject(
          { slug, projectType: 'mod', mcVersion, loaderType: effectiveLoader, gameDir: rootDir, strictMcVersion: true },
          onStatus
        );
        if (res?.fileName) {
          if (res.skipped) alreadyPresent.push(res.fileName);
          else installed.push(res.fileName);
          groupSuccess = true;
          break;
        }
      } catch (e) {
        lastErr = `${slug}: ${e.message}`;
      }
    }
    if (!groupSuccess && lastErr) errors.push(lastErr);
  }

  return {
    ok: installed.length > 0 || alreadyPresent.length > 0,
    installed,
    alreadyPresent,
    parkedConflicts,
    parkedOptifine: parkedConflicts,
    errors,
    recommendedCore: effectiveLoader,
    selectedFeatures: Array.from(pickedSet)
  };
}

async function ensureVanillaBaseForOptifine(gameDir, mcVersion, onStatus) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  fs.mkdirSync(rootDir, { recursive: true });
  const profilesPath = path.join(rootDir, 'launcher_profiles.json');
  if (!fs.existsSync(profilesPath)) {
    try {
      fs.writeFileSync(profilesPath, JSON.stringify({ profiles: {}, selectedProfile: '(Default)', version: 3 }, null, 2), 'utf8');
    } catch (_) {}
  }
  const cleanMc = String(mcVersion || '').trim();
  if (!cleanMc) return { ok: true, rootDir };

  const verDir = path.join(rootDir, 'versions', cleanMc);
  const verJsonPath = path.join(verDir, `${cleanMc}.json`);
  const verJarPath = path.join(verDir, `${cleanMc}.jar`);
  if (fs.existsSync(verJsonPath) && fs.existsSync(verJarPath)) {
    return { ok: true, rootDir, preparedVanilla: false };
  }

  try {
    onStatus?.(`☕ Đang chuẩn bị tệp nền Minecraft ${cleanMc} để trình cài OptiFine gốc nhận diện ngay...`);
    const manifest = await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    const entry = Array.isArray(manifest?.versions) ? manifest.versions.find((v) => v.id === cleanMc) : null;
    if (!entry?.url) return { ok: true, rootDir, preparedVanilla: false };
    const vJson = await fetchJson(entry.url);
    fs.mkdirSync(verDir, { recursive: true });
    if (!fs.existsSync(verJsonPath)) {
      fs.writeFileSync(verJsonPath, JSON.stringify(vJson, null, 2), 'utf8');
    }
    if (!fs.existsSync(verJarPath) && vJson?.downloads?.client?.url) {
      await downloadFirstAvailable([vJson.downloads.client.url], verJarPath);
    }
    return { ok: true, rootDir, preparedVanilla: true };
  } catch (_) {
    return { ok: true, rootDir, preparedVanilla: false };
  }
}

function findActiveOptifineForgeJar(modsDir, mcVersion) {
  if (!modsDir || !fs.existsSync(modsDir)) return null;
  try {
    const files = fs.readdirSync(modsDir).filter((f) => /\.jar$/i.test(f) && isProprietaryOptifineFile(f) && !/^optifabric/i.test(f));
    for (const f of files) {
      const info = inspectOptifineJar(path.join(modsDir, f));
      if (!info.isOptifine) continue;
      if (!mcVersion || !info.mcVersion || info.mcVersion === mcVersion) {
        return f;
      }
    }
  } catch (_) {}
  return null;
}

async function resolveOptifineRuntimePlan({ rootDir, gameDirectory, mcVersion, loaderVersion }, onStatus) {
  if (loaderVersion && loaderVersion !== 'Auto-Shader-Zoom') {
    const standaloneProfiles = findInstalledOptifineProfiles(rootDir, mcVersion);
    const pickedStandalone = standaloneProfiles.find((p) => p.customId === loaderVersion);
    if (pickedStandalone) {
      onStatus?.(`🔆 Đang mở cấu hình OptiFine gốc "${pickedStandalone.shortTag}" cho MC ${mcVersion}...`);
      return {
        mode: 'standalone',
        effectiveLoader: 'vanilla',
        effectiveLoaderVersion: '',
        customPrep: { type: 'customJson', customId: pickedStandalone.customId }
      };
    }
  }

  const modsDir = path.join(gameDirectory, 'mods');
  const activeOfJar = findActiveOptifineForgeJar(modsDir, mcVersion);
  if (activeOfJar) {
    const forgeBuilds = await fetchLoaderVersions(mcVersion, 'forge');
    if (forgeBuilds.length > 0) {
      parkOptifineConflictsInMods(modsDir, 'for-optifine');
      onStatus?.(`🔆 Đang mở OptiFine (${activeOfJar}) qua nền tảng Forge cho MC ${mcVersion}...`);
      return {
        mode: 'forge-jar',
        effectiveLoader: 'forge',
        effectiveLoaderVersion: forgeBuilds[0].version,
        customPrep: null
      };
    }
  }

  // Default 1-Click Automatic OptiFine Mode (Shader • Zoom • Dynamic Lights • FPS)
  let effectiveLoader = 'vanilla';
  let effectiveLoaderVersion = '';
  try {
    const fabList = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}?limit=4`);
    if (Array.isArray(fabList) && fabList.length > 0) {
      effectiveLoader = 'fabric';
      effectiveLoaderVersion = fabList[0].loader.version;
    }
  } catch (_) {}

  if (effectiveLoader === 'vanilla' && compareMcVersions(mcVersion, '1.14') >= 0) {
    // Check offline cached fabric-loader profile on disk
    try {
      const versDir = path.join(rootDir, 'versions');
      if (fs.existsSync(versDir)) {
        const suffix = `-${mcVersion}`;
        const cached = fs.readdirSync(versDir).find((d) => d.startsWith('fabric-loader-') && d.endsWith(suffix));
        if (cached) {
          effectiveLoader = 'fabric';
          effectiveLoaderVersion = cached.slice('fabric-loader-'.length, cached.length - suffix.length);
        }
      }
    } catch (_) {}
  } else if (effectiveLoader === 'vanilla' && compareMcVersions(mcVersion, '1.14') < 0) {
    const forgeBuilds = await fetchLoaderVersions(mcVersion, 'forge');
    if (forgeBuilds.length > 0) {
      effectiveLoader = 'forge';
      effectiveLoaderVersion = forgeBuilds[0].version;
    } else {
      const lfBuilds = await fetchLoaderVersions(mcVersion, 'legacyfabric');
      if (lfBuilds.length > 0) {
        effectiveLoader = 'legacyfabric';
        effectiveLoaderVersion = lfBuilds[0].version;
      }
    }
  }

  if (effectiveLoader === 'vanilla') {
    onStatus?.(`ℹ️ Phiên bản ${mcVersion} chưa có bản dựng Loader trên kho — đang mở trực tiếp chế độ mượt êm.`);
  }

  return {
    mode: 'auto-parity',
    effectiveLoader,
    effectiveLoaderVersion,
    customPrep: null
  };
}

function installOptifineJarSmart({
  gameDir,
  instanceDir = '',
  filePath,
  currentLoader = 'fabric',
  currentMcVersion = '',
  action = 'auto'
} = {}) {
  const rootDir = (instanceDir && fs.existsSync(String(instanceDir)))
    ? String(instanceDir)
    : (gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir());
  const info = inspectOptifineJar(filePath);
  if (!info.isOptifine) {
    return { ok: false, error: 'Tệp này không phải gói OptiFine (.jar) hợp lệ.' };
  }
  const instMeta = instanceDir ? (readInstanceMeta(rootDir) || null) : null;
  const effectiveLoader = String(instMeta?.loader || currentLoader || 'vanilla').toLowerCase();
  const effectiveMc = String(instMeta?.mcVersion || currentMcVersion || '').trim();

  if (action === 'forge' || action === 'optifine-core' || (action === 'auto' && effectiveLoader === 'forge')) {
    if (instMeta && info.mcVersion && effectiveMc && info.mcVersion !== effectiveMc) {
      return {
        ok: false,
        error: `Tệp ${info.fileName} dành cho MC ${info.mcVersion}, không khớp với gói Modpack MC ${effectiveMc}.`
      };
    }
    const modsDir = path.join(rootDir, 'mods');
    fs.mkdirSync(modsDir, { recursive: true });
    const dest = path.join(modsDir, info.fileName);
    if (path.resolve(dest) !== path.resolve(filePath)) {
      fs.copyFileSync(filePath, dest);
    }
    // Remove .disabled copy if one existed
    if (fs.existsSync(`${dest}.disabled`)) {
      try { fs.unlinkSync(`${dest}.disabled`); } catch (_) {}
    }
    const parkedConflicts = parkOptifineConflictsInMods(modsDir, 'for-optifine');
    const targetMc = info.mcVersion || effectiveMc || '1.20.1';
    const meta = readModsMetaManifest(modsDir);
    meta[info.fileName] = {
      slug: 'optifine',
      modId: 'optifine',
      mcVersion: targetMc,
      gameVersions: info.mcVersion ? [info.mcVersion] : [targetMc],
      loader: 'forge',
      inspectedLoaders: ['forge', 'optifine'],
      updatedAt: Date.now()
    };
    writeModsMetaManifest(modsDir, meta);
    setModUserDisabledFlags(modsDir, info.fileName, false);
    return {
      ok: true,
      kind: action === 'optifine-core' ? 'optifine-core' : 'optifine-forge',
      fileName: info.fileName,
      mcVersion: targetMc,
      parkedConflicts,
      parkedMods: parkedConflicts,
      targetDir: rootDir,
      isInstance: Boolean(instMeta)
    };
  }

  return {
    ok: true,
    kind: 'optifine-choice',
    filePath,
    fileName: info.fileName,
    mcVersion: info.mcVersion || effectiveMc || '',
    hasInstaller: Boolean(info.hasInstaller),
    currentLoader: effectiveLoader,
    isInstance: Boolean(instMeta),
    targetDir: rootDir
  };
}

function listLocalAddons(gameDir, folderType = 'mods') {
  const rootDir = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  const safeFolder = ['mods', 'shaderpacks', 'resourcepacks'].includes(folderType) ? folderType : 'mods';
  const dir = path.join(rootDir, safeFolder);
  if (!fs.existsSync(dir)) return [];
  const meta = safeFolder === 'mods' ? readModsMetaManifest(dir) : {};
  let metaDirty = false;
  const equipped = safeFolder !== 'mods' ? getEquippedAddonsState(rootDir) : { activeShader: '', activeResourcePacks: [] };
  try {
    const result = fs
      .readdirSync(dir)
      .filter((f) => /\.(jar|zip)(\.disabled)?$/i.test(f) && f !== 'AetherSkinSync.zip' && f !== 'zz-blockway-auto-island-preset.jar')
      .map((f) => {
        const full = path.join(dir, f);
        const cleanName = f.replace(/\.disabled$/i, '');
        let mEntry = meta[cleanName] || null;
        if (safeFolder === 'mods' && /\.jar(\.disabled)?$/i.test(f)) {
          const ins = getOrInspectModMeta(dir, meta, cleanName, f);
          if (ins.dirty) metaDirty = true;
          mEntry = ins.entry;
        }
        let sizeKB = 0;
        try { sizeKB = Math.round(fs.statSync(full).size / 1024); } catch (_) {}
        const rawSpec = Array.isArray(mEntry?.mcDepSpec) ? mEntry.mcDepSpec.join(', ') : (mEntry?.mcDepSpec || '');
        const specVerClean = rawSpec && /^\d+\.\d+/.test(rawSpec) ? rawSpec : '';
        const isEquippedInGame = safeFolder === 'shaderpacks'
          ? (equipped.activeShader === cleanName)
          : (safeFolder === 'resourcepacks' ? equipped.activeResourcePacks.includes(cleanName) : false);
        return {
          name: f,
          cleanName,
          enabled: !f.toLowerCase().endsWith('.disabled'),
          sizeKB,
          slug: mEntry?.slug || '',
          modId: mEntry?.modId || '',
          loaders: Array.isArray(mEntry?.inspectedLoaders) ? mEntry.inspectedLoaders : (mEntry?.loader ? [mEntry.loader] : []),
          mcDepSpec: rawSpec,
          mcVersion: mEntry?.mcVersion || extractMcVerFromFilename(cleanName) || specVerClean || '',
          gameVersions: Array.isArray(mEntry?.gameVersions) ? mEntry.gameVersions : [],
          equippedInGame: isEquippedInGame
        };
      });
    if (metaDirty) writeModsMetaManifest(dir, meta);
    return result;
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
  if (safeFolder === 'mods') {
    setModUserDisabledFlags(path.join(rootDir, 'mods'), cleanBase, !isDisabled);
  }
  return { ok: true, newName: nextName, enabled: isDisabled };
}

function deleteLocalAddon(gameDir, folderType, fileName) {
  const rootDir = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  const safeFolder = ['mods', 'shaderpacks', 'resourcepacks'].includes(folderType) ? folderType : 'mods';
  const fullPath = path.join(rootDir, safeFolder, path.basename(fileName));
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  return { ok: true };
}

function scanSavesDirEntries(savesDir, extraMeta = {}) {
  if (!fs.existsSync(savesDir)) return [];
  try {
    return fs
      .readdirSync(savesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const wPath = path.join(savesDir, d.name);
        let lastPlayed = '';
        let mtimeMs = 0;
        let version = '';
        let gameMode = '';
        try {
          const st = fs.statSync(wPath);
          mtimeMs = st.mtimeMs || 0;
          lastPlayed = st.mtime.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        } catch (_) {}
        let displayLevelName = d.name;
        const levelDatPath = path.join(wPath, 'level.dat');
        if (fs.existsSync(levelDatPath)) {
          try {
            const ldStat = fs.statSync(levelDatPath);
            if (ldStat.mtimeMs > mtimeMs) {
              mtimeMs = ldStat.mtimeMs;
              lastPlayed = ldStat.mtime.toLocaleString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
            }
            const raw = zlib.gunzipSync(fs.readFileSync(levelDatPath));
            const lnIdx = raw.indexOf(Buffer.from('\x08\x00\x09LevelName'));
            if (lnIdx !== -1 && lnIdx + 14 <= raw.length) {
              const lnLen = raw.readUInt16BE(lnIdx + 12);
              if (lnLen > 0 && lnLen <= 128 && lnIdx + 14 + lnLen <= raw.length) {
                const parsedTitle = raw.subarray(lnIdx + 14, lnIdx + 14 + lnLen).toString('utf8').trim();
                if (parsedTitle) displayLevelName = parsedTitle;
              }
            }
            const vIdx = raw.indexOf(Buffer.from('Version'));
            if (vIdx !== -1) {
              const sub = raw.subarray(vIdx, Math.min(raw.length, vIdx + 120));
              const nIdx = sub.indexOf(Buffer.from('\x08\x00\x04Name'));
              if (nIdx !== -1 && nIdx + 9 <= sub.length) {
                const len = sub.readUInt16BE(nIdx + 7);
                if (len > 0 && len <= 32 && nIdx + 9 + len <= sub.length) {
                  version = sub.subarray(nIdx + 9, nIdx + 9 + len).toString('utf8');
                }
              }
            }
            const gIdx = raw.indexOf(Buffer.from('\x03\x00\x08GameType'));
            if (gIdx !== -1 && gIdx + 15 <= raw.length) {
              const gt = raw.readInt32BE(gIdx + 11);
              const modeMap = { 0: 'Sinh tồn', 1: 'Sáng tạo', 2: 'Phiêu lưu', 3: 'Khán giả' };
              gameMode = modeMap[gt] || '';
            }
          } catch (_) {}
        }
        if (!version && extraMeta.instanceMcVersion) {
          version = extraMeta.instanceMcVersion;
        }
        let iconDataUrl = null;
        const iconPath = path.join(wPath, 'icon.png');
        const previewCandidates = [
          { file: 'blockway-preview.jpg', mime: 'image/jpeg' },
          { file: 'blockway-preview.png', mime: 'image/png' },
          { file: 'blockway-preview.webp', mime: 'image/webp' }
        ];
        const foundPreview = previewCandidates
          .map((c) => ({ ...c, full: path.join(wPath, c.file) }))
          .find((c) => fs.existsSync(c.full));
        if (foundPreview) {
          try {
            const useWidePreview = !fs.existsSync(iconPath)
              || (fs.statSync(iconPath).mtimeMs <= fs.statSync(foundPreview.full).mtimeMs + 5000);
            if (useWidePreview) {
              iconDataUrl = `data:${foundPreview.mime};base64,${fs.readFileSync(foundPreview.full).toString('base64')}`;
            }
          } catch (_) {}
        }
        if (!iconDataUrl && fs.existsSync(iconPath)) {
          try { iconDataUrl = `data:image/png;base64,${fs.readFileSync(iconPath).toString('base64')}`; } catch (_) {}
        }
        let datapacksCount = 0;
        const dpDir = path.join(wPath, 'datapacks');
        if (fs.existsSync(dpDir)) {
          try {
            datapacksCount = fs.readdirSync(dpDir).filter((x) => /\.zip$/i.test(x) && x !== 'blockway-rules.zip').length;
          } catch (_) {}
        }
        return {
          name: displayLevelName,
          folderName: d.name,
          path: wPath,
          lastPlayed,
          mtimeMs,
          version,
          gameMode,
          iconDataUrl,
          datapacksCount,
          instanceDir: extraMeta.instanceDir || '',
          instanceName: extraMeta.instanceName || '',
          instanceMcVersion: extraMeta.instanceMcVersion || '',
          instanceLoader: extraMeta.instanceLoader || '',
          instanceLoaderVersion: extraMeta.instanceLoaderVersion || '',
          instanceRamGB: extraMeta.instanceRamGB || 0
        };
      });
  } catch (_) {
    return [];
  }
}

function listLocalWorlds(gameDir, includeInstances = false) {
  const rootDir = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  const results = scanSavesDirEntries(path.join(rootDir, 'saves'));
  if (includeInstances) {
    try {
      for (const inst of listPackInstances(rootDir)) {
        const instWorlds = scanSavesDirEntries(path.join(inst.dir, 'saves'), {
          instanceDir: inst.dir,
          instanceName: inst.name || path.basename(inst.dir),
          instanceMcVersion: inst.mcVersion || '',
          instanceLoader: inst.loader || 'vanilla',
          instanceLoaderVersion: inst.loaderVersion || '',
          instanceRamGB: Number(inst.ramRecommendedGB) || 4
        });
        results.push(...instWorlds);
      }
    } catch (_) {}
  }
  return results.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
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

// v40.8: CustomSkinLoader 14.x "Legacy" loader needs explicit skin/cape/elytra paths ("root" is ignored).
// Merge into the existing config instead of wiping the player's own load list on every launch.
const CSL_LOCAL_SKIN_ENTRY = {
  name: 'LocalSkin',
  type: 'Legacy',
  checkPNG: false,
  skin: 'LocalSkin/skins/{USERNAME}.png',
  model: 'auto',
  cape: 'LocalSkin/capes/{USERNAME}.png',
  elytra: 'LocalSkin/elytras/{USERNAME}.png'
};

function configureCrackSkinSupport(gameDir) {
  try {
    const cslDir = path.join(gameDir, 'CustomSkinLoader');
    for (const sub of ['skins', 'capes', 'elytras']) {
      fs.mkdirSync(path.join(cslDir, 'LocalSkin', sub), { recursive: true });
    }
    const cfgPath = path.join(cslDir, 'CustomSkinLoader.json');
    let cfg = null;
    try {
      if (fs.existsSync(cfgPath)) cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    } catch (_) {
      cfg = null;
    }
    const before = cfg ? JSON.stringify(cfg) : '';
    if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.loadlist)) {
      cfg = {
        ...(cfg && typeof cfg === 'object' ? cfg : {}),
        enable: true,
        loadlist: [
          { ...CSL_LOCAL_SKIN_ENTRY },
          { name: 'Mojang', type: 'MojangAPI' },
          { name: 'ElyBy', type: 'ElyByAPI' },
          { name: 'LittleSkin', type: 'CustomSkinAPI', root: 'https://littleskin.cn/csl/' }
        ]
      };
    } else {
      cfg.enable = true;
      const others = cfg.loadlist.filter((e) => !(e && e.name === 'LocalSkin'));
      cfg.loadlist = [{ ...CSL_LOCAL_SKIN_ENTRY }, ...others];
    }
    const after = JSON.stringify(cfg);
    if (after !== before) fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (_) {}
}

// v40.8: Modpack instances get the friends' skins & capes saved in the main .minecraft folder too
function mirrorLocalSkinsIntoInstance(rootDir, instanceDir) {
  if (!instanceDir || path.resolve(instanceDir) === path.resolve(rootDir)) return;
  for (const sub of ['skins', 'capes', 'elytras']) {
    const src = path.join(rootDir, 'CustomSkinLoader', 'LocalSkin', sub);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(instanceDir, 'CustomSkinLoader', 'LocalSkin', sub);
    try {
      fs.mkdirSync(dest, { recursive: true });
      for (const f of fs.readdirSync(src)) {
        if (!/\.png$/i.test(f)) continue;
        const s = path.join(src, f);
        const d = path.join(dest, f);
        try {
          if (!fs.existsSync(d) || fs.statSync(s).mtimeMs > fs.statSync(d).mtimeMs) fs.copyFileSync(s, d);
        } catch (_) {}
      }
    } catch (_) {}
  }
}

// v40.8: player-uploaded cape (64x32 or 128x64 PNG) → CustomSkinLoader LocalSkin/capes/<name>.png
function saveCustomLocalCape(gameDir, username, sourceFilePath) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const cleanName = (username || 'StevePlayer').replace(/[^a-zA-Z0-9_]/g, '') || 'StevePlayer';
  const buf = fs.readFileSync(sourceFilePath);
  if (buf.length < 100 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    throw new Error('File áo choàng phải là ảnh PNG hợp lệ.');
  }
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (!(w >= 64 && h >= 32 && w === h * 2) || w > 1024) {
    throw new Error(`Ảnh áo choàng cần tỉ lệ 2:1 (VD 64×32 hoặc 128×64) — ảnh của bạn là ${w}×${h}.`);
  }
  const capesDir = path.join(rootDir, 'CustomSkinLoader', 'LocalSkin', 'capes');
  fs.mkdirSync(capesDir, { recursive: true });
  const target = path.join(capesDir, `${cleanName}.png`);
  fs.writeFileSync(target, buf);
  configureCrackSkinSupport(rootDir);
  return { ok: true, dataUrl: `data:image/png;base64,${buf.toString('base64')}`, savedPath: target };
}

function removeCustomLocalCape(gameDir, username) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const cleanName = (username || 'StevePlayer').replace(/[^a-zA-Z0-9_]/g, '') || 'StevePlayer';
  const target = path.join(rootDir, 'CustomSkinLoader', 'LocalSkin', 'capes', `${cleanName}.png`);
  try { fs.rmSync(target, { force: true }); } catch (_) {}
  return { ok: true };
}

function getCustomLocalCape(gameDir, username) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const cleanName = (username || 'StevePlayer').replace(/[^a-zA-Z0-9_]/g, '') || 'StevePlayer';
  const target = path.join(rootDir, 'CustomSkinLoader', 'LocalSkin', 'capes', `${cleanName}.png`);
  if (!fs.existsSync(target)) return { ok: true, dataUrl: '' };
  return { ok: true, dataUrl: `data:image/png;base64,${fs.readFileSync(target).toString('base64')}` };
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

function hasEnabledCustomSkinLoaderMod(rootDir) {
  try {
    const modsDir = path.join(rootDir, 'mods');
    if (!fs.existsSync(modsDir)) return false;
    return fs.readdirSync(modsDir).some((f) => /\.jar$/i.test(f) && /customskinloader/i.test(f));
  } catch (_) {
    return false;
  }
}

function syncActive3DSkinIntoGame(rootDir, username, skinDataUrl, mcVersion = '1.21.4', loaderType = 'vanilla') {
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

    const optsPath = path.join(rootDir, 'options.txt');
    const packId = 'file/AetherSkinSync.zip';
    const useCslPerPlayer = loaderType !== 'vanilla' && hasEnabledCustomSkinLoaderMod(rootDir);

    // v40.7 PRO: When CustomSkinLoader is active on a modded loader, detach AetherSkinSync.zip from options.txt
    // so offline friends NEVER all turn into clones of your Steve/Alex skin — CustomSkinLoader renders each player's own skin!
    if (useCslPerPlayer) {
      if (fs.existsSync(optsPath)) {
        let optsContent = fs.readFileSync(optsPath, 'utf8');
        if (optsContent.includes('AetherSkinSync.zip')) {
          optsContent = optsContent.replace(/^resourcePacks:\[(.*?)\](\r?)$/m, (_full, inner, cr) => {
            let items = [];
            try { items = JSON.parse(`[${inner}]`); } catch (_) {
              items = inner.split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
            }
            items = items.filter((item) => item !== packId && item !== 'AetherSkinSync.zip');
            if (!items.includes('vanilla')) items.unshift('vanilla');
            return `resourcePacks:${JSON.stringify(items)}${cr}`;
          });
          fs.writeFileSync(optsPath, optsContent, 'utf8');
        }
      }
      return;
    }

    // Fallback for pure Vanilla (no mod loader): build standard PKZIP ResourcePack so singleplayer still shows 3D skin
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

    let optsContent = fs.existsSync(optsPath) ? fs.readFileSync(optsPath, 'utf8') : '';
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
function supportsQuickPlaySingleplayer(mcVer) {
  const v = String(mcVer || '').trim();
  if (!v) return false;
  if (/^([2-9]\d)\./.test(v)) return true; // Mojang 26.x+
  const relMatch = v.match(/^1\.(\d+)/);
  if (relMatch) return parseInt(relMatch[1], 10) >= 20;
  const snapMatch = v.match(/^(\d{2})w(\d{2})/i);
  if (snapMatch) {
    const yr = parseInt(snapMatch[1], 10);
    const wk = parseInt(snapMatch[2], 10);
    return yr > 23 || (yr === 23 && wk >= 14);
  }
  return false;
}

async function launchMinecraft(config, callbacks = {}) {
  const {
    authMode = 'crack',
    username = 'StevePlayer',
    crackSkinSync = true,
    msProfile = null,
    cloudProfile = null,
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
    skinModel = 'default',
    instanceDir = '',
    winResolution = '1280x720',
    worldFolderName = '',
    autoViLang = false,
    potatoGraphicsPreset = false,
    smartRamCoach = true,
    gentleSmoothMode = true,
    displayHz = 0,
    autoCreateWorld = null
  } = config;
  let effectiveWorldFolder = worldFolderName;

  fastSkipEnabled = Boolean(fastSkipHash);

  const rootDir = gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir();
  if (!fs.existsSync(rootDir)) {
    fs.mkdirSync(rootDir, { recursive: true });
  }

  // v40.0: Instance riêng cho Modpack (mods/config/saves tách biệt, dùng chung versions/libraries/assets)
  let gameDirectory = rootDir;
  if (instanceDir && String(instanceDir).trim()) {
    const resolvedInst = path.resolve(String(instanceDir).trim());
    const instRoot = path.resolve(rootDir, 'instances');
    const relInst = path.relative(instRoot, resolvedInst);
    if (relInst.startsWith('..') || path.isAbsolute(relInst) || !fs.existsSync(resolvedInst)) {
      throw new Error('Thư mục gói Modpack không hợp lệ hoặc đã bị xóa.');
    }
    gameDirectory = resolvedInst;
  }
  const skinRoot = gameDirectory;

  let authorization;
  if (authMode === 'microsoft' && msProfile && msProfile.name) {
    callbacks.onStatus?.(`Đang xác thực tài khoản Microsoft (${msProfile.displayName || msProfile.name})...`);
    let activeProfile = msProfile;
    if (msProfile.isOfficialLicense && msProfile.refreshToken && typeof msAuth.authenticateMicrosoftFromRefreshToken === 'function') {
      try {
        activeProfile = await msAuth.authenticateMicrosoftFromRefreshToken(msProfile.refreshToken);
      } catch (_) {
        activeProfile = msProfile;
      }
    }
    if (activeProfile.isOfficialLicense && activeProfile.accessToken) {
      authorization = {
        access_token: activeProfile.accessToken,
        client_token: activeProfile.uuid,
        uuid: activeProfile.uuid,
        name: activeProfile.name,
        user_properties: '{}',
        meta: { type: 'msa', demo: false }
      };
    } else {
      const cleanName = (activeProfile.name || username || 'Player').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 16) || 'Player';
      authorization = buildOfflineAuthFallback(cleanName, skinModel);
      if (crackSkinSync) {
        configureCrackSkinSupport(skinRoot);
      }
      if (skinDataUrl) {
        syncActive3DSkinIntoGame(skinRoot, cleanName, skinDataUrl, mcVersion, loaderType);
      }
    }
  } else if (authMode === 'aether' && cloudProfile && cloudProfile.mcUsername) {
    const cleanName = (cloudProfile.mcUsername || username || 'Player').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 16) || 'Player';
    callbacks.onStatus?.(`Đang xác thực Tài khoản Aether Cloud (${cleanName})...`);
    authorization = buildOfflineAuthFallback(cleanName, skinModel);
    if (crackSkinSync) {
      configureCrackSkinSupport(skinRoot);
    }
    if (skinDataUrl) {
      syncActive3DSkinIntoGame(skinRoot, cleanName, skinDataUrl, mcVersion, loaderType);
    }
  } else {
    const cleanName = (username || 'Player').trim().slice(0, 16) || 'Player';
    callbacks.onStatus?.(`Đang đồng bộ Skin 3D & khởi tạo tài khoản "${cleanName}"...`);
    authorization = buildOfflineAuthFallback(cleanName, skinModel);
    if (crackSkinSync) {
      configureCrackSkinSupport(skinRoot);
    }
    if (skinDataUrl) {
      syncActive3DSkinIntoGame(skinRoot, cleanName, skinDataUrl, mcVersion, loaderType);
    }
  }

  // v40.8: copy friends' skins & capes from the main folder into the selected Modpack instance
  if (crackSkinSync && gameDirectory !== rootDir) {
    try { mirrorLocalSkinsIntoInstance(rootDir, gameDirectory); } catch (_) {}
  }

  // v40.4 PRO: Apply smart in-game options.txt presets (Vietnamese language & Low-PC smooth FPS preset)
  const gentleOn = gentleSmoothMode !== false;
  applySmartGameOptions(gameDirectory, {
    autoViLang: Boolean(autoViLang),
    potatoGraphicsPreset: Boolean(potatoGraphicsPreset),
    fpsCap: gentleOn ? computeGentleFpsCap(displayHz) : 0
  });

  // v40.8 PRO: "Mượt Êm" — trim wasted work once per folder (reversible), never stress the hardware
  try {
    const gentleRes = applyGentleSmoothOptions(gameDirectory, { enabled: gentleOn, displayHz });
    if (gentleOn && gentleRes?.changed?.length) {
      callbacks.onStatus?.(`🍃 Mượt Êm: Đã tinh chỉnh nhẹ ${gentleRes.changed.length} thiết lập (khóa ${gentleRes.fpsCap} FPS theo màn hình, giảm tải CPU mô phỏng) — không ép CPU/GPU.`);
    } else if (!gentleOn && gentleRes?.reverted) {
      callbacks.onStatus?.(`↩️ Đã tắt Mượt Êm: khôi phục ${gentleRes.reverted} thiết lập đồ họa gốc của bạn.`);
    }
  } catch (_) {}

  let effectiveLoaderType = loaderType;
  let effectiveLoaderVersion = loaderVersion;
  let optifineRuntimePlan = null;
  if (loaderType === 'optifine') {
    optifineRuntimePlan = await resolveOptifineRuntimePlan(
      { rootDir, gameDirectory, mcVersion, loaderVersion },
      callbacks.onStatus
    );
    effectiveLoaderType = optifineRuntimePlan.effectiveLoader;
    effectiveLoaderVersion = optifineRuntimePlan.effectiveLoaderVersion;
  }

  if (gameDirectory === rootDir) {
    await ensureModsMatchVersion(rootDir, mcVersion, effectiveLoaderType, callbacks.onStatus);
  } else {
    // v40.4.1 PRO: Ensure SkyBlock / OneBlock instances auto-default "World Type: Default" to Void Island!
    try {
      const instMeta = readInstanceMeta(gameDirectory);
      const instHint = `${config?.packName || ''} ${instMeta?.name || ''} ${path.basename(gameDirectory)}`;
      if (instMeta?.autoIslandMode || /(one\s*block|one_?block|sky\s*block|sky_?block)/i.test(instHint)) {
        ensureDefaultIslandWorldPresetJar(gameDirectory, mcVersion, effectiveLoaderType);
      }
    } catch (_) {}
  }

  // v40.9.2 PRO: Auto-equip 1-Click OptiFine Parity Mods when launching with OptiFine Core (0s overhead if already equipped)
  if (optifineRuntimePlan?.mode === 'auto-parity' && ['fabric', 'forge', 'neoforge', 'quilt'].includes(effectiveLoaderType)) {
    try {
      const modsDirNow = path.join(gameDirectory, 'mods');
      fs.mkdirSync(modsDirNow, { recursive: true });
      const activeJarsNow = fs.readdirSync(modsDirNow).filter((f) => /\.jar$/i.test(f));
      const hasRenderMod = activeJarsNow.some((f) => /^(?:sodium|embeddium)[-_+.]/i.test(f));
      const hasShaderMod = activeJarsNow.some((f) => /^(?:iris|oculus)[-_+.]/i.test(f));
      const hasZoomMod = activeJarsNow.some((f) => /^(?:zume|zoomify|logical[-_]zoom|wi[-_]zoom)[-_+.]/i.test(f));
      const markerPath = path.join(modsDirNow, '.blockway-of-checked.json');
      const cacheKey = `${mcVersion}:${effectiveLoaderType}`;
      let checkedMap = {};
      try {
        if (fs.existsSync(markerPath)) checkedMap = JSON.parse(fs.readFileSync(markerPath, 'utf8')) || {};
      } catch (_) {}
      const recentlyChecked = checkedMap[cacheKey] && (Date.now() - Number(checkedMap[cacheKey])) < 6 * 3600 * 1000;

      if (!(hasRenderMod && hasShaderMod && hasZoomMod) && !recentlyChecked) {
        callbacks.onStatus?.(`🔆 Đang tự động trang bị trọn bộ OptiFine (Shader • Zoom • Đuốc sáng • FPS) cho MC ${mcVersion}...`);
        await installOptifineParityPack(
          {
            mcVersion,
            loaderType: effectiveLoaderType,
            gameDir: rootDir,
            instanceDir: gameDirectory !== rootDir ? gameDirectory : ''
          },
          callbacks.onStatus
        );
        checkedMap[cacheKey] = Date.now();
        try { fs.writeFileSync(markerPath, JSON.stringify(checkedMap, null, 2), 'utf8'); } catch (_) {}
      }
    } catch (_) {}
  }

  const loaderPrep = optifineRuntimePlan?.customPrep || await prepareCustomLoaderJson(
    rootDir,
    mcVersion,
    effectiveLoaderType,
    effectiveLoaderVersion,
    callbacks.onStatus
  );

  // v40.0: MCLC lưu cache Forge JSON theo phiên bản MC → xóa cache khi đổi bản Forge/NeoForge khác
  if (loaderPrep?.type === 'forgeJar') {
    try {
      const forgeCacheDir = path.join(rootDir, 'forge', mcVersion);
      const marker = path.join(forgeCacheDir, 'blockway-installer.txt');
      const want = path.basename(loaderPrep.installerJar);
      const have = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : '';
      if (have !== want) {
        try { fs.rmSync(path.join(forgeCacheDir, 'version.json'), { force: true }); } catch (_) {}
        fs.mkdirSync(forgeCacheDir, { recursive: true });
        fs.writeFileSync(marker, want, 'utf8');
      }
    } catch (_) {}
  }

  const resolvedJava = await ensureJavaRuntime(rootDir, mcVersion, javaPath, callbacks.onStatus);
  const ramCoach = computeSmartRamAndJvmAdvice({
    gameDir: rootDir,
    instanceDir: gameDirectory !== rootDir ? gameDirectory : '',
    mcVersion,
    loaderType,
    requestedRamGB: ramGB,
    smartRamAuto: Boolean(smartRamCoach),
    javaPath: resolvedJava,
    cpuCores
  });
  const effectiveRamGB = smartRamCoach ? ramCoach.effectiveRamGB : (Number(ramGB) || 4);
  if (smartRamCoach && Math.abs(effectiveRamGB - (Number(ramGB) || 4)) >= 0.5) {
    callbacks.onStatus?.(`🧠 Cố vấn RAM thông minh: Tự cân chỉnh ${effectiveRamGB} GB (${ramCoach.gcModeLabel}) phù hợp ${ramCoach.modsCount} Mod & RAM trống hệ thống.`);
  }
  const baseCustomArgs = useAikarFlags
    ? (smartRamCoach && Array.isArray(ramCoach.jvmArgs) && ramCoach.jvmArgs.length ? ramCoach.jvmArgs : buildMultiCoreSmoothExitArgs(effectiveRamGB, cpuCores))
    : [];
  const customArgs = gentleOn && baseCustomArgs.length
    ? applyGentleJvmTuning(baseCustomArgs, { javaMajor: getJavaMajorVersion(resolvedJava), cpuCores })
    : baseCustomArgs;

  const launcher = new Client();

  const launchOpts = {
    authorization,
    root: rootDir,
    version: {
      number: mcVersion,
      type: mcVersion.includes('w') || mcVersion.includes('pre') || mcVersion.includes('rc') ? 'snapshot' : 'release'
    },
    memory: {
      max: `${Math.max(1024, Math.round(effectiveRamGB * 1024))}M`,
      min: '512M'
    },
    javaPath: resolvedJava === 'java' ? undefined : resolvedJava,
    customArgs,
    overrides: {
      maxSockets: 64,
      ...(gameDirectory !== rootDir ? { gameDirectory } : {})
    }
  };

  if (winResolution === 'fullscreen') {
    launchOpts.window = { fullscreen: true };
  } else if (typeof winResolution === 'string') {
    const resMatch = winResolution.trim().match(/^(\d{3,5})x(\d{3,5})$/i);
    if (resMatch) {
      launchOpts.window = {
        width: String(parseInt(resMatch[1], 10)),
        height: String(parseInt(resMatch[2], 10)),
        fullscreen: false
      };
    }
  }

  if (serverIp && serverIp.trim()) {
    const [host, port] = serverIp.trim().split(':');
    // v40.8: Quick Play (--quickPlayMultiplayer) only exists on 1.20+; older versions use --server/--port
    if (supportsQuickPlaySingleplayer(mcVersion)) {
      launchOpts.quickPlay = { type: 'multiplayer', identifier: serverIp.trim() };
    } else {
      launchOpts.server = { host, port: port || '25565' };
    }
  } else {
    // Tự tạo sẵn thế giới mới (lần chơi đầu tiên hoặc bấm "Thế giới mới") rồi vào thẳng
    if (!(effectiveWorldFolder && String(effectiveWorldFolder).trim()) && autoCreateWorld && typeof autoCreateWorld === 'object') {
      const wantCreate = autoCreateWorld.force || !worldCreator.savesHasWorlds(gameDirectory);
      if (wantCreate && worldCreator.supportsQuickWorldCreation(mcVersion)) {
        callbacks.onStatus?.('🌍 Đang tạo sẵn thế giới mới cho bạn...');
        const created = await worldCreator.createQuickWorld({
          rootDir,
          gameDirectory,
          mcVersion,
          loaderType,
          levelName: autoCreateWorld.levelName || config.packName || 'Thế giới mới',
          gameMode: autoCreateWorld.gameMode,
          difficulty: autoCreateWorld.difficulty,
          hardcore: autoCreateWorld.hardcore,
          allowCommands: autoCreateWorld.allowCommands,
          seed: autoCreateWorld.seed,
          bonusChest: autoCreateWorld.bonusChest,
          keepInventory: autoCreateWorld.keepInventory,
          alwaysDay: autoCreateWorld.alwaysDay,
          fetchJson,
          downloadVerified,
          onStatus: callbacks.onStatus
        });
        if (created.ok) {
          effectiveWorldFolder = created.folderName;
          callbacks.onWorldCreated?.(created);
          callbacks.onStatus?.(`✅ Đã tạo thế giới “${created.levelName}” (${created.worldType}) — đang vào thẳng...`);
        } else {
          callbacks.onStatus?.(`ℹ️ Chưa tạo được thế giới tự động (${created.error}). Game sẽ mở Menu chính như bình thường.`);
        }
      }
    }
    if (effectiveWorldFolder && String(effectiveWorldFolder).trim()) {
      const cleanWorldFolder = path.basename(String(effectiveWorldFolder).trim());
      if (cleanWorldFolder && supportsQuickPlaySingleplayer(mcVersion)) {
        launchOpts.quickPlay = { type: 'singleplayer', identifier: cleanWorldFolder };
        callbacks.onStatus?.(`⚡ Đang mở thẳng vào thế giới "${cleanWorldFolder}" (MC ${mcVersion})...`);
      } else if (cleanWorldFolder) {
        callbacks.onStatus?.(`ℹ️ Phiên bản MC ${mcVersion} (< 1.20) mở ra Menu chính — hãy chọn thế giới "${cleanWorldFolder}" trong Chơi đơn.`);
      }
    }
  }

  if (loaderPrep?.type === 'customJson') {
    launchOpts.version.custom = loaderPrep.customId;
  } else if (loaderPrep?.type === 'forgeJar') {
    launchOpts.forge = loaderPrep.installerJar;
  }

  let gameWindowNotified = false;
  const emitGameLog = createLogThrottle((l) => callbacks.onLog?.(l), 150);

  launcher.on('debug', (msg) => emitGameLog(`[DEBUG] ${msg}`));
  launcher.on('data', (msg) => {
    const line = String(msg).trim();
    emitGameLog(line);

    // v40.1: Detect e4mc public internet domain or local LAN port automatically
    const e4mcMatch = line.match(/\b([a-z0-9-]+\.[a-z0-9.-]*e4mc\.link)\b/i);
    if (e4mcMatch && e4mcMatch[1]) {
      callbacks.onCoopEvent?.({ type: 'e4mc', domain: e4mcMatch[1].toLowerCase(), line });
    }
    const lanPortMatch = line.match(/(?:Local game hosted on port|Started serving on)\s+(\d{2,5})/i);
    if (lanPortMatch && lanPortMatch[1]) {
      callbacks.onCoopEvent?.({ type: 'lan-port', port: Number(lanPortMatch[1]), line });
    }

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

  // v40.7 PRO: Auto-inject portable FFmpeg into PATH so Flashback / ReplayMod .MP4 export works out-of-the-box
  try {
    const ffmpegBinDir = path.join(rootDir, 'runtimes', 'ffmpeg');
    const ffmpegExe = path.join(ffmpegBinDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    if (fs.existsSync(ffmpegExe) && !(process.env.PATH || '').includes(ffmpegBinDir)) {
      process.env.PATH = `${ffmpegBinDir}${path.delimiter}${process.env.PATH || ''}`;
    }
  } catch (_) {}

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
      // v40.8: count only files that were really copied (existing files are kept, not overwritten)
      try {
        if (!fs.existsSync(dFull)) {
          fs.copyFileSync(sFull, dFull);
          copiedFiles++;
        }
      } catch (_) {}
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

  if (syncMods && detectedVersion && fs.existsSync(path.join(actualSource, 'mods'))) { try { const targetModsDir = path.join(targetRoot, 'mods'); const meta = readModsMetaManifest(targetModsDir); let metaChanged = false; for (const f of fs.readdirSync(path.join(actualSource, 'mods'))) { if (!/\.(jar|disabled)$/i.test(f)) continue; const clean = f.replace(/\.disabled$/i, ''); if (!meta[clean]) { meta[clean] = { slug: clean.replace(/[-_+]v?\d.*$/i, '').toLowerCase(), mcVersion: detectedVersion, loader: detectedCore || 'fabric', gameVersions: [detectedVersion], installedAt: Date.now() }; metaChanged = true; } else if (Array.isArray(meta[clean].gameVersions) && !meta[clean].gameVersions.includes(detectedVersion)) { meta[clean].gameVersions.push(detectedVersion); metaChanged = true; } } if (metaChanged) writeModsMetaManifest(targetModsDir, meta); } catch (_) {} }
  return { ok: true, isSameDir, actualSource, targetRoot, stats };
}

/* ============================================================================
   v40.0 PRO — KHO MODPACK TOÀN CẦU (PACK HUB)
   Nguồn: Modrinth • CurseForge • FTB • Technic • ATLauncher
   + Nhập file .mrpack / CurseForge .zip / Prism-MultiMC .zip / World / Datapack
   + Instance riêng cho từng gói (mods/config/saves tách biệt)
   ============================================================================ */
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
let PackZip = null;
try { PackZip = require('adm-zip'); } catch (_) { PackZip = null; }

const PACK_UA = 'BlockWay-Launcher/40.0 (github.com/buiduchuy2010qn-prog/blockway-launcher)';
const CF_API = 'https://api.curseforge.com';
const CF_GAME_ID = 432;
const CF_CLASS = { modpack: 4471, mod: 6, resourcepack: 12, world: 17, shader: 6552, datapack: 6945 };
const CF_LOADER_TYPE = { 1: 'forge', 4: 'fabric', 5: 'quilt', 6: 'neoforge' };
const CF_LOADER_ID = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
const SUPPORTED_LOADERS = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt', 'legacyfabric'];
const INSTANCE_META_FILE = 'blockway-instance.json';

let cfApiKey = null;
let cfSearchForbidden = false;
function setCurseForgeApiKey(key) {
  cfApiKey = String(key || '').trim() || null;
  cfSearchForbidden = false;
}
function getCurseForgeApiKey() {
  return (process.env.BLOCKWAY_CF_KEY || '').trim() || cfApiKey || null;
}

const packCache = new Map();
function cacheGet(key) {
  const hit = packCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  packCache.delete(key);
  return undefined;
}
function cacheSet(key, val, ttlMs = 20 * 60 * 1000) {
  packCache.set(key, { val, exp: Date.now() + ttlMs });
  if (packCache.size > 600) packCache.delete(packCache.keys().next().value);
  return val;
}

async function packFetchJson(url, { headers = {}, method = 'GET', body, timeoutMs = 25000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'User-Agent': PACK_UA,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const txt = await res.text();
    return JSON.parse(String(txt || '').replace(/^\uFEFF/, ''));
  } finally {
    clearTimeout(timer);
  }
}

async function cfFetch(pathPart, opts = {}) {
  const key = getCurseForgeApiKey();
  if (!key) {
    const e = new Error('Chưa có CurseForge API Key. Vào Kho Modpack → 🔑 CurseForge để nhập key.');
    e.code = 'NO_CF_KEY';
    throw e;
  }
  return packFetchJson(`${CF_API}${pathPart}`, { ...opts, headers: { 'x-api-key': key, ...(opts.headers || {}) } });
}

function normalizePackUrl(u) {
  try {
    const parsed = new URL(String(u).trim());
    if (/forgecdn\.net$/i.test(parsed.hostname)) {
      parsed.pathname = parsed.pathname.split('/').map((seg) => encodeURIComponent(decodeURIComponent(seg))).join('/');
    }
    return parsed.toString();
  } catch (_) {
    return encodeURI(String(u || ''));
  }
}

function hashFile(filePath, algo) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash(algo);
    fs.createReadStream(filePath)
      .on('data', (c) => h.update(c))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });
}

async function verifyFileHash(filePath, { sha1, sha512, md5, size } = {}) {
  try {
    const st = fs.statSync(filePath);
    if (!st.isFile() || st.size === 0) return false;
    if (size && Number(size) > 0 && st.size !== Number(size)) return false;
    if (sha512) return (await hashFile(filePath, 'sha512')) === String(sha512).toLowerCase();
    if (sha1) return (await hashFile(filePath, 'sha1')) === String(sha1).toLowerCase();
    if (md5) return (await hashFile(filePath, 'md5')) === String(md5).toLowerCase();
    return true;
  } catch (_) {
    return false;
  }
}

async function downloadVerified(urls, destPath, hashes = {}, attempts = 3) {
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean).map(normalizePackUrl);
  if (!list.length) throw new Error(`Không có link tải cho ${path.basename(destPath)}`);
  if (fs.existsSync(destPath) && (await verifyFileHash(destPath, hashes))) return destPath;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  let lastErr = null;
  for (let round = 0; round < attempts; round++) {
    for (const url of list) {
      const tmp = `${destPath}.part`;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 180000);
        let res;
        try {
          res = await fetch(url, { headers: { 'User-Agent': PACK_UA }, redirect: 'follow', signal: ctrl.signal });
          if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
          await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
        } finally {
          clearTimeout(timer);
        }
        if (!(await verifyFileHash(tmp, hashes))) throw new Error('Sai mã kiểm tra (hash)');
        try { fs.rmSync(destPath, { force: true }); } catch (_) {}
        fs.renameSync(tmp, destPath);
        return destPath;
      } catch (e) {
        lastErr = e;
        try { fs.rmSync(tmp, { force: true }); } catch (_) {}
      }
    }
    await new Promise((r) => setTimeout(r, 700 * (round + 1)));
  }
  throw new Error(`Không tải được ${path.basename(destPath)}: ${lastErr?.message || 'lỗi mạng'}`);
}

async function runPool(items, limit, worker) {
  let idx = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (idx < items.length) {
      const my = idx++;
      await worker(items[my], my);
    }
  });
  await Promise.all(runners);
}

function safeJoin(root, rel) {
  const clean = String(rel || '').replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '');
  const target = path.resolve(root, clean);
  const r = path.relative(path.resolve(root), target);
  if (!r || r.startsWith('..') || path.isAbsolute(r)) throw new Error(`Đường dẫn không hợp lệ trong gói: ${rel}`);
  return target;
}

function openPackZip(zipPath) {
  if (!PackZip) throw new Error('Thiếu thư viện giải nén (adm-zip). Hãy cài lại Launcher.');
  return new PackZip(zipPath);
}

function findZipEntryCI(zip, name) {
  const lower = String(name).toLowerCase();
  return zip.getEntries().find((e) => e.entryName.replace(/\\/g, '/').toLowerCase() === lower) || null;
}

function extractZipPrefix(zip, prefix, destRoot) {
  const pre = prefix ? `${String(prefix).replace(/\\/g, '/').replace(/\/+$/, '')}/`.toLowerCase() : '';
  let count = 0;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.replace(/\\/g, '/');
    if (pre && !name.toLowerCase().startsWith(pre)) continue;
    const rel = pre ? name.slice(pre.length) : name;
    if (!rel) continue;
    const out = safeJoin(destRoot, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, entry.getData());
    count++;
  }
  return count;
}

function normalizeLoaderId(raw) {
  const s = String(raw || '').toLowerCase();
  if (!s || s === 'minecraft' || s === 'vanilla') return 'vanilla';
  if (s.includes('neoforge') || s.includes('neoforged')) return 'neoforge';
  if (s.includes('legacy-fabric') || s.includes('legacyfabric')) return 'legacyfabric';
  if (s.includes('forge')) return 'forge';
  if (s.includes('quilt')) return 'quilt';
  if (s.includes('fabric')) return 'fabric';
  if (s === 'datapack') return 'datapack';
  return s;
}

function evaluatePackCompat({ mcVersion, loader }) {
  const l = normalizeLoaderId(loader);
  if (!mcVersion) return { ok: true, level: 'info', label: 'ℹ️ Tự xác định khi cài' };
  if (l === 'datapack') return { ok: true, level: 'ok', label: '✅ Gắn vào thế giới' };
  if (!SUPPORTED_LOADERS.includes(l)) return { ok: false, level: 'warn', label: `⚠️ Loader "${loader}" chưa hỗ trợ` };
  if (l === 'forge' && compareMcVersions(mcVersion, '1.6') < 0) return { ok: false, level: 'warn', label: '⚠️ Forge < 1.6 (jar-mod) chưa hỗ trợ' };
  if (l === 'neoforge' && compareMcVersions(mcVersion, '1.20.1') < 0) return { ok: false, level: 'warn', label: '⚠️ NeoForge không có cho bản này' };
  return { ok: true, level: 'ok', label: '✅ Cài được' };
}

function recommendRamGB(modCount, mcVersion) {
  const n = Number(modCount) || 0;
  let gb = n > 300 ? 10 : n > 180 ? 8 : n > 80 ? 6 : n > 0 ? 4 : 3;
  if (mcVersion && compareMcVersions(mcVersion, '1.18') >= 0 && gb < 4) gb = 4;
  return gb;
}

function packKindToCfClass(kind) {
  if (kind === 'world') return CF_CLASS.world;
  if (kind === 'datapack') return CF_CLASS.datapack;
  return CF_CLASS.modpack;
}

/* ---------------- Instances ---------------- */
function getInstancesRoot(gameDir) {
  return path.join(gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir(), 'instances');
}

function makeInstanceSlug(name) {
  return String(name || 'pack')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9._ -]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48) || 'pack';
}

function createInstanceDir(gameDir, name) {
  const root = getInstancesRoot(gameDir);
  fs.mkdirSync(root, { recursive: true });
  const slug = makeInstanceSlug(name);
  let dir = path.join(root, slug);
  let n = 2;
  while (fs.existsSync(dir)) dir = path.join(root, `${slug}-${n++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeInstanceMeta(dir, meta) {
  fs.writeFileSync(path.join(dir, INSTANCE_META_FILE), JSON.stringify({ formatVersion: 1, ...meta }, null, 2), 'utf8');
}

function readInstanceMeta(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, INSTANCE_META_FILE), 'utf8'));
  } catch (_) {
    return null;
  }
}

function countFilesIn(dir, re) {
  try {
    return fs.readdirSync(dir).filter((f) => re.test(f)).length;
  } catch (_) {
    return 0;
  }
}

function listPackInstances(gameDir) {
  const root = getInstancesRoot(gameDir);
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const d of fs.readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const dir = path.join(root, d.name);
    const meta = readInstanceMeta(dir);
    if (!meta) continue;
    out.push({
      ...meta,
      dir,
      folderName: d.name,
      modsCount: countFilesIn(path.join(dir, 'mods'), /\.jar$/i),
      worldsCount: (() => { try { return fs.readdirSync(path.join(dir, 'saves'), { withFileTypes: true }).filter((x) => x.isDirectory()).length; } catch (_) { return 0; } })()
    });
  }
  return out.sort((a, b) => (b.lastPlayed || b.installedAt || 0) - (a.lastPlayed || a.installedAt || 0));
}

function assertInsideInstances(gameDir, dir) {
  const root = path.resolve(getInstancesRoot(gameDir));
  const target = path.resolve(String(dir || ''));
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Thư mục gói không hợp lệ.');
  return target;
}

function deletePackInstance(gameDir, dir) {
  const target = assertInsideInstances(gameDir, dir);
  fs.rmSync(target, { recursive: true, force: true });
  return { ok: true };
}

function touchPackInstance(gameDir, dir) {
  const target = assertInsideInstances(gameDir, dir);
  const meta = readInstanceMeta(target);
  if (meta) writeInstanceMeta(target, { ...meta, lastPlayed: Date.now() });
  return meta;
}

/* ---------------- SEARCH ---------------- */
function isHypixelClientPack(title = '', summary = '', slug = '') {
  const txt = `${title} ${summary} ${slug}`.toLowerCase();
  return /\bhypixel\b/.test(txt) || /^(skyblock-enhanced|skyblocker-modpack|oneclient-skyblock|fiyrthgu-hypixel|alands-immersive-hypixel|skyblock1)/.test(String(slug || '').toLowerCase());
}

function mapModrinthHit(h, kind) {
  const loaders = (h.categories || []).map(normalizeLoaderId).filter((c) => SUPPORTED_LOADERS.includes(c) || c === 'datapack');
  const vers = (h.versions || []).filter((v) => /^\d/.test(v)).sort((a, b) => compareMcVersions(b, a));
  const realKind = h.project_type === 'datapack' || kind === 'datapack' ? 'datapack' : 'modpack';
  return {
    uid: `modrinth:${h.project_id}`,
    source: 'modrinth',
    id: h.project_id,
    slug: h.slug,
    title: h.title,
    summary: h.description,
    iconUrl: h.icon_url || '',
    bannerUrl: h.featured_gallery || (Array.isArray(h.gallery) && h.gallery[0]) || '',
    downloads: h.downloads || 0,
    author: h.author || '',
    mcVersions: vers,
    loaders: [...new Set(loaders)],
    kind: realKind,
    isHypixelClient: isHypixelClientPack(h.title, h.description, h.slug),
    url: `https://modrinth.com/${realKind === 'datapack' ? 'datapack' : 'modpack'}/${h.slug}`
  };
}

async function searchModrinthPacks({ query, kind, mcVersion, loader, offset, limit, sort }) {
  const isWorldTab = kind === 'world';
  const targetType = (kind === 'datapack' || isWorldTab) ? 'datapack' : 'modpack';
  const facets = [[`project_type:${targetType}`]];
  if (mcVersion) facets.push([`versions:${mcVersion}`]);
  if (loader && targetType === 'modpack') facets.push([`categories:${loader}`]);
  const effectiveQuery = isWorldTab && !String(query || '').trim() ? 'skyblock oneblock survival island' : (query || '');
  const index = ['downloads', 'relevance', 'updated', 'newest', 'follows'].includes(sort) ? sort : 'downloads';
  const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(effectiveQuery)}&limit=${limit}&offset=${offset}&index=${index}&facets=${encodeURIComponent(JSON.stringify(facets))}`;
  const res = await packFetchJson(url);
  let items = (res.hits || []).map((h) => mapModrinthHit(h, targetType));
  // If user searches SkyBlock/OneBlock in Modpacks, rank genuine Singleplayer Island Survival packs BEFORE Hypixel Server Client HUD packs
  if (targetType === 'modpack' && /\b(sky\s*block|one\s*block)\b/i.test(effectiveQuery)) {
    items = items.sort((a, b) => Number(Boolean(a.isHypixelClient)) - Number(Boolean(b.isHypixelClient)) || (b.downloads - a.downloads));
  }
  return { items, total: res.total_hits || 0 };
}

function mapCfMod(m) {
  const idx = m.latestFilesIndexes || [];
  const vers = [...new Set(idx.map((f) => f.gameVersion).filter((v) => /^\d/.test(v || '')))].sort((a, b) => compareMcVersions(b, a));
  const loaders = [...new Set(idx.map((f) => CF_LOADER_TYPE[f.modLoader]).filter(Boolean))];
  const kind = m.classId === CF_CLASS.world ? 'world' : m.classId === CF_CLASS.datapack ? 'datapack' : m.classId === CF_CLASS.modpack ? 'modpack' : 'other';
  return {
    uid: `curseforge:${m.id}`,
    source: 'curseforge',
    id: m.id,
    slug: m.slug,
    title: m.name,
    summary: m.summary,
    iconUrl: m.logo?.thumbnailUrl || m.logo?.url || '',
    bannerUrl: m.screenshots?.[0]?.url || m.screenshots?.[0]?.thumbnailUrl || '',
    downloads: Math.round(m.downloadCount || 0),
    author: m.authors?.[0]?.name || '',
    mcVersions: vers,
    loaders,
    kind,
    classId: m.classId,
    allowDistribution: m.allowModDistribution !== false,
    url: m.links?.websiteUrl || `https://www.curseforge.com/minecraft/modpacks/${m.slug}`
  };
}

async function searchCurseForgePacks({ query, kind, mcVersion, loader, offset, limit }) {
  const classId = packKindToCfClass(kind);
  if (!cfSearchForbidden || Date.now() > cfSearchForbidden) {
    const params = new URLSearchParams({
      gameId: String(CF_GAME_ID),
      classId: String(classId),
      searchFilter: query || '',
      sortField: query ? '2' : '6',
      sortOrder: 'desc',
      index: String(offset),
      pageSize: String(limit)
    });
    if (mcVersion) params.set('gameVersion', mcVersion);
    if (loader && CF_LOADER_ID[loader]) params.set('modLoaderType', String(CF_LOADER_ID[loader]));
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await cfFetch(`/v1/mods/search?${params.toString()}`);
        cfSearchForbidden = false;
        return { items: (res.data || []).map(mapCfMod), total: res.pagination?.totalCount || 0 };
      } catch (e) {
        if (e.status !== 403) throw e;
        await new Promise((r) => setTimeout(r, 900));
      }
    }
    cfSearchForbidden = Date.now() + 2 * 60 * 1000;
  }
  // Fallback khi key chưa được cấp quyền tìm kiếm: dùng danh sách Nổi bật / Phổ biến / Mới cập nhật
  let pool = cacheGet('cf:featured');
  if (!pool) {
    const res = await cfFetch('/v1/mods/featured', { method: 'POST', body: { gameId: CF_GAME_ID, excludedModIds: [], gameVersionTypeId: null } });
    const d = res.data || {};
    const seen = new Set();
    pool = [...(d.featured || []), ...(d.popular || []), ...(d.recentlyUpdated || [])].filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    cacheSet('cf:featured', pool, 30 * 60 * 1000);
  }
  const q = String(query || '').toLowerCase();
  const items = pool
    .filter((m) => m.classId === classId)
    .map(mapCfMod)
    .filter((it) => !q || `${it.title} ${it.summary}`.toLowerCase().includes(q))
    .filter((it) => !mcVersion || it.mcVersions.includes(mcVersion))
    .filter((it) => !loader || it.loaders.includes(loader))
    .sort((a, b) => b.downloads - a.downloads);
  return { items: items.slice(offset, offset + limit), total: items.length, limited: true };
}

async function getFtbPack(id) {
  const key = `ftb:pack:${id}`;
  const hit = cacheGet(key);
  if (hit) return hit;
  const p = await packFetchJson(`https://api.feed-the-beast.com/v1/modpacks/public/modpack/${id}`);
  return cacheSet(key, p, 60 * 60 * 1000);
}

function mapFtbPack(p) {
  const vers = [];
  const loaders = new Set();
  for (const v of p.versions || []) {
    for (const t of v.targets || []) {
      if (t.type === 'game' && t.version && !vers.includes(t.version)) vers.push(t.version);
      if (t.type === 'modloader') loaders.add(normalizeLoaderId(t.name));
    }
  }
  const art = (p.art || []).find((a) => a.type === 'square') || (p.art || [])[0];
  return {
    uid: `ftb:${p.id}`,
    source: 'ftb',
    id: p.id,
    slug: p.slug || String(p.id),
    title: p.name,
    summary: p.synopsis || '',
    iconUrl: art?.url || '',
    downloads: p.installs || p.plays || 0,
    author: p.authors?.[0]?.name || 'FTB Team',
    mcVersions: vers.sort((a, b) => compareMcVersions(b, a)),
    loaders: [...loaders],
    kind: 'modpack',
    url: `https://www.feed-the-beast.com/modpacks/${p.id}-${p.slug || ''}`
  };
}

async function searchFtbPacks({ query, mcVersion, loader, offset, limit }) {
  let ids;
  if (query) {
    const res = await packFetchJson(`https://api.feed-the-beast.com/v1/modpacks/public/modpack/search/50?term=${encodeURIComponent(query)}`);
    ids = res.packs || [];
  } else {
    ids = cacheGet('ftb:popular');
    if (!ids) {
      const res = await packFetchJson('https://api.feed-the-beast.com/v1/modpacks/public/modpack/popular/installs/100');
      ids = cacheSet('ftb:popular', res.packs || [], 60 * 60 * 1000);
    }
  }
  const packs = [];
  await runPool(ids.slice(0, 100), 10, async (id) => {
    try {
      const p = await getFtbPack(id);
      if (p && p.status !== 'error' && !p.private) packs.push(mapFtbPack(p));
    } catch (_) {}
  });
  const filtered = packs
    .filter((it) => !mcVersion || it.mcVersions.includes(mcVersion))
    .filter((it) => !loader || it.loaders.includes(loader))
    .sort((a, b) => b.downloads - a.downloads);
  return { items: filtered.slice(offset, offset + limit), total: filtered.length };
}

async function getTechnicPack(slug) {
  const key = `technic:${slug}`;
  const hit = cacheGet(key);
  if (hit) return hit;
  const p = await packFetchJson(`https://api.technicpack.net/modpack/${encodeURIComponent(slug)}?build=999`);
  return cacheSet(key, p, 60 * 60 * 1000);
}

async function searchTechnicPacks({ query, mcVersion, offset, limit }) {
  const q = String(query || '').trim() || 'pack';
  const res = await packFetchJson(`https://api.technicpack.net/search?q=${encodeURIComponent(q)}&build=999`);
  const list = (res.modpacks || []).slice(0, 40);
  const items = [];
  await runPool(list, 8, async (m) => {
    let d = null;
    try { d = await getTechnicPack(m.slug); } catch (_) {}
    items.push({
      uid: `technic:${m.slug}`,
      source: 'technic',
      id: m.slug,
      slug: m.slug,
      title: d?.displayName || m.name,
      summary: String(d?.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220),
      iconUrl: m.iconUrl || d?.icon?.url || '',
      downloads: d?.installs || d?.runs || 0,
      author: d?.user || '',
      mcVersions: d?.minecraft ? [d.minecraft] : [],
      loaders: d?.minecraft && compareMcVersions(d.minecraft, '1.13') < 0 ? ['forge'] : [],
      kind: 'modpack',
      installable: Boolean(d && (d.url || d.solder)),
      url: m.url || d?.platformUrl || `https://www.technicpack.net/modpack/${m.slug}`
    });
  });
  const filtered = items
    .filter((it) => !mcVersion || it.mcVersions.includes(mcVersion))
    .sort((a, b) => b.downloads - a.downloads);
  return { items: filtered.slice(offset, offset + limit), total: filtered.length };
}

async function getAtlPacks() {
  let packs = cacheGet('atl:packs');
  if (!packs) {
    packs = await packFetchJson('https://download.nodecdn.net/containers/atl/launcher/json/packsnew.json');
    cacheSet('atl:packs', packs, 60 * 60 * 1000);
  }
  return packs;
}

function atlSafeName(name) {
  return String(name || '').replace(/[^A-Za-z0-9]/g, '');
}

function mapAtlPack(p) {
  const safe = atlSafeName(p.name);
  const vers = [...new Set((p.versions || []).map((v) => v.minecraft).filter(Boolean))].sort((a, b) => compareMcVersions(b, a));
  return {
    uid: `atlauncher:${p.id}`,
    source: 'atlauncher',
    id: p.id,
    slug: safe,
    title: p.name,
    summary: String(p.description || '').replace(/\s+/g, ' ').trim().slice(0, 220),
    iconUrl: `https://cdn.atlcdn.net/images/packs/${safe.toLowerCase()}.png`,
    downloads: 0,
    author: 'ATLauncher',
    mcVersions: vers,
    loaders: [],
    kind: 'modpack',
    featured: Boolean(p.featured),
    url: `https://atlauncher.com/pack/${safe}`
  };
}

async function searchAtlPacks({ query, mcVersion, offset, limit }) {
  const packs = await getAtlPacks();
  const q = String(query || '').toLowerCase();
  const items = packs
    .filter((p) => p.type === 'public' && (p.versions || []).length)
    .map(mapAtlPack)
    .filter((it) => !q || `${it.title} ${it.summary}`.toLowerCase().includes(q))
    .filter((it) => !mcVersion || it.mcVersions.includes(mcVersion))
    .sort((a, b) => Number(b.featured) - Number(a.featured));
  return { items: items.slice(offset, offset + limit), total: items.length };
}

function scorePackForModernPlay(it, { query = '', mcVersion = '', sort = '' } = {}) {
  const dl = Number(it?.downloads) || 0;
  if (sort === 'downloads') return dl;
  const topMc = Array.isArray(it?.mcVersions) && it.mcVersions.length ? it.mcVersions[0] : '';
  const wantsLegacy = Boolean(mcVersion) || /\b1\.(?:6|7|8|12)(?:\.\d+)?\b/.test(query);

  let eraScore = 0;
  if (topMc) {
    if (compareMcVersions(topMc, '1.21') >= 0) eraScore = 50;
    else if (compareMcVersions(topMc, '1.20') >= 0) eraScore = 44;
    else if (compareMcVersions(topMc, '1.18') >= 0) eraScore = 28;
    else if (compareMcVersions(topMc, '1.16') >= 0) eraScore = 18;
    else if (compareMcVersions(topMc, '1.12') >= 0) eraScore = wantsLegacy ? 20 : 3;
    else eraScore = wantsLegacy ? 20 : -35;
  }

  const dlScore = dl > 0
    ? Math.min(38, Math.log10(Math.max(10, dl)) * 6.2)
    : (it?.source === 'atlauncher' ? (it.featured ? 22 : 12) : 6);
  const installBonus = it?.installable === false ? -25 : 8;
  const qLower = String(query || '').trim().toLowerCase();
  const titleLower = String(it?.title || '').toLowerCase();
  const titleBonus = qLower && qLower.length >= 3 && titleLower.includes(qLower) ? 10 : 0;
  const hypixelPenalty = (/\b(sky\s*block|one\s*block)\b/i.test(query) && it?.isHypixelClient) ? -65 : 0;

  return eraScore + dlScore + installBonus + titleBonus + hypixelPenalty;
}

async function searchPackHub(params = {}) {
  const query = String(params.query || '').trim();
  const kind = ['modpack', 'datapack', 'world'].includes(params.kind) ? params.kind : 'modpack';
  const mcVersion = String(params.mcVersion || '').trim();
  const loader = SUPPORTED_LOADERS.includes(params.loader) ? params.loader : '';
  const source = String(params.source || 'all');
  const offset = Math.max(0, Number(params.offset) || 0);
  const limit = Math.max(6, Math.min(40, Number(params.limit) || 24));
  const sort = String(params.sort || '').trim();
  const inOffsets = (params.sourceOffsets && typeof params.sourceOffsets === 'object') ? params.sourceOffsets : null;

  const sourcesForKind = kind === 'modpack'
    ? ['modrinth', 'curseforge', 'ftb', 'technic', 'atlauncher']
    : ['modrinth', 'curseforge'];
  const active = source === 'all' ? sourcesForKind : sourcesForKind.filter((s) => s === source);
  const hasCfKey = Boolean(getCurseForgeApiKey());
  const effectiveActiveCount = Math.max(1, active.filter((s) => s !== 'curseforge' || hasCfKey).length);

  const limitForSource = (s) => {
    if (source !== 'all') return limit;
    if (s === 'modrinth') return Math.max(16, Math.ceil(limit * 0.65));
    return Math.max(6, Math.ceil(limit / effectiveActiveCount) + 3);
  };
  const offsetForSource = (s) => {
    if (inOffsets && Number.isFinite(Number(inOffsets[s]))) return Math.max(0, Number(inOffsets[s]));
    return source === 'all' ? Math.floor(offset / effectiveActiveCount) : offset;
  };

  const modrinthSort = ['downloads', 'relevance', 'updated', 'newest', 'follows'].includes(sort) ? sort : 'downloads';
  const runners = {
    modrinth: (off, lim) => searchModrinthPacks({ query, kind, mcVersion, loader, offset: off, limit: lim, sort: modrinthSort }),
    curseforge: (off, lim) => searchCurseForgePacks({ query, kind, mcVersion, loader, offset: off, limit: lim }),
    ftb: (off, lim) => searchFtbPacks({ query, mcVersion, loader, offset: off, limit: lim }),
    technic: (off, lim) => searchTechnicPacks({ query, mcVersion, offset: off, limit: lim }),
    atlauncher: (off, lim) => searchAtlPacks({ query, mcVersion, offset: off, limit: lim })
  };

  const totals = {};
  const nextOffsets = {};
  const warnings = [];
  const groups = await Promise.all(active.map(async (s) => {
    const srcOff = offsetForSource(s);
    const srcLim = limitForSource(s);
    if (s === 'curseforge' && !hasCfKey && source === 'all') {
      totals[s] = 'no_key';
      nextOffsets[s] = srcOff;
      warnings.push('NO_CF_KEY');
      return [];
    }
    try {
      const r = await runners[s](srcOff, srcLim);
      const list = Array.isArray(r.items) ? r.items : [];
      totals[s] = r.total;
      nextOffsets[s] = srcOff + list.length;
      if (s === 'curseforge' && r.limited) warnings.push('CF_SEARCH_LIMITED');
      return list;
    } catch (e) {
      totals[s] = e.code === 'NO_CF_KEY' ? 'no_key' : null;
      nextOffsets[s] = srcOff;
      warnings.push(e.code === 'NO_CF_KEY' ? 'NO_CF_KEY' : `${s.toUpperCase()}: ${e.message}`);
      return [];
    }
  }));

  let items = groups.flat();
  if (sort === 'newest-mc') {
    items.sort((a, b) => {
      const mcA = a.mcVersions?.[0] || '';
      const mcB = b.mcVersions?.[0] || '';
      return compareMcVersions(mcB, mcA) || ((Number(b.downloads) || 0) - (Number(a.downloads) || 0));
    });
  } else if (source === 'all' || sort === 'downloads' || sort === 'smart' || !sort) {
    items.sort((a, b) => scorePackForModernPlay(b, { query, mcVersion, sort }) - scorePackForModernPlay(a, { query, mcVersion, sort }));
  } else if (kind === 'modpack' && /\b(sky\s*block|one\s*block)\b/i.test(query)) {
    items.sort((a, b) => Number(Boolean(a.isHypixelClient)) - Number(Boolean(b.isHypixelClient)));
  }

  const hasMore = active.some((s) => typeof totals[s] === 'number' && totals[s] > (nextOffsets[s] || 0));
  return { ok: true, items, totals, warnings, kind, source, nextOffsets, hasMore };
}

/* ---------------- DETAILS / VERSIONS ---------------- */
async function getPackHubDetails({ source, id, kind } = {}) {
  if (source === 'modrinth') {
    const [proj, versions] = await Promise.all([
      packFetchJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(id)}`),
      packFetchJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(id)}/version`)
    ]);
    const pKind = proj.project_type === 'datapack' || kind === 'datapack' ? 'datapack' : 'modpack';
    return {
      ok: true,
      source,
      id,
      kind: pKind,
      title: proj.title,
      description: proj.body || proj.description || '',
      iconUrl: proj.icon_url || '',
      url: `https://modrinth.com/${pKind}/${proj.slug}`,
      gallery: (proj.gallery || []).slice(0, 6).map((g) => g.url),
      downloads: proj.downloads || 0,
      versions: versions.slice(0, 80).map((v) => {
        const gameVers = (v.game_versions || []).filter((x) => /^\d/.test(x));
        const mc = gameVers.sort((a, b) => compareMcVersions(b, a))[0] || '';
        const loadersAll = (v.loaders || []).map(normalizeLoaderId);
        const loader = pKind === 'datapack'
          ? (loadersAll.includes('datapack') ? 'datapack' : loadersAll[0] || 'datapack')
          : (loadersAll.find((l) => SUPPORTED_LOADERS.includes(l)) || loadersAll[0] || 'vanilla');
        const file = (v.files || []).find((f) => f.primary) || (v.files || [])[0];
        return {
          id: v.id,
          name: v.name || v.version_number,
          mcVersion: mc,
          mcVersions: gameVers,
          loader,
          loaders: loadersAll,
          releaseType: v.version_type,
          date: v.date_published,
          fileSize: file?.size || 0,
          compat: evaluatePackCompat({ mcVersion: mc, loader })
        };
      })
    };
  }

  if (source === 'curseforge') {
    const [modRes, filesRes] = await Promise.all([
      cfFetch(`/v1/mods/${encodeURIComponent(id)}`),
      cfFetch(`/v1/mods/${encodeURIComponent(id)}/files?pageSize=50&index=0`)
    ]);
    const m = modRes.data;
    let description = m.summary || '';
    try {
      const d = await cfFetch(`/v1/mods/${encodeURIComponent(id)}/description`);
      if (d?.data) description = d.data;
    } catch (_) {}
    const mapped = mapCfMod(m);
    return {
      ok: true,
      source,
      id,
      kind: mapped.kind,
      title: m.name,
      description,
      descriptionIsHtml: true,
      iconUrl: mapped.iconUrl,
      url: mapped.url,
      gallery: (m.screenshots || []).slice(0, 6).map((s) => s.thumbnailUrl || s.url),
      downloads: mapped.downloads,
      allowDistribution: m.allowModDistribution !== false,
      versions: (filesRes.data || []).map((f) => {
        const gvs = (f.gameVersions || []).filter((x) => /^\d/.test(x)).sort((a, b) => compareMcVersions(b, a));
        const loaderStr = (f.gameVersions || []).find((x) => /forge|fabric|quilt|neoforge/i.test(x)) || '';
        const loader = mapped.kind === 'world' ? 'vanilla' : mapped.kind === 'datapack' ? 'datapack' : (normalizeLoaderId(loaderStr) || 'vanilla');
        return {
          id: f.id,
          name: f.displayName || f.fileName,
          fileName: f.fileName,
          mcVersion: gvs[0] || '',
          mcVersions: gvs,
          loader,
          releaseType: f.releaseType === 1 ? 'release' : f.releaseType === 2 ? 'beta' : 'alpha',
          date: f.fileDate,
          fileSize: f.fileLength || 0,
          downloadable: Boolean(f.downloadUrl),
          compat: f.downloadUrl ? evaluatePackCompat({ mcVersion: gvs[0] || '', loader }) : { ok: false, level: 'warn', label: '⚠️ Tác giả chặn tải ngoài — mở trang CurseForge' }
        };
      })
    };
  }

  if (source === 'ftb') {
    const p = await getFtbPack(id);
    const mapped = mapFtbPack(p);
    return {
      ok: true,
      source,
      id,
      kind: 'modpack',
      title: p.name,
      description: p.description || p.synopsis || '',
      iconUrl: mapped.iconUrl,
      url: mapped.url,
      gallery: (p.art || []).filter((a) => a.type !== 'square').slice(0, 4).map((a) => a.url),
      downloads: mapped.downloads,
      versions: [...(p.versions || [])].reverse().filter((v) => !v.private).map((v) => {
        const mc = (v.targets || []).find((t) => t.type === 'game')?.version || '';
        const ml = (v.targets || []).find((t) => t.type === 'modloader');
        const loader = normalizeLoaderId(ml?.name || 'vanilla');
        return {
          id: v.id,
          name: v.name,
          mcVersion: mc,
          loader,
          loaderVersion: ml?.version || '',
          releaseType: v.type,
          date: v.updated ? new Date(v.updated * 1000).toISOString() : '',
          ramMB: v.specs?.recommended || 0,
          compat: evaluatePackCompat({ mcVersion: mc, loader })
        };
      })
    };
  }

  if (source === 'technic') {
    const d = await getTechnicPack(id);
    let versions = [];
    if (d.solder) {
      try {
        const base = d.solder.replace(/\/+$/, '');
        const sp = await packFetchJson(`${base}/modpack/${encodeURIComponent(d.name || id)}`);
        versions = (sp.builds || []).slice(0, 20).map((b) => ({
          id: b,
          name: `${b}${b === sp.recommended ? ' (Khuyên dùng)' : ''}${b === sp.latest ? ' (Mới nhất)' : ''}`,
          mcVersion: d.minecraft || '',
          loader: d.minecraft && compareMcVersions(d.minecraft, '1.13') < 0 ? 'forge' : '',
          releaseType: b === sp.recommended ? 'release' : 'beta',
          compat: evaluatePackCompat({ mcVersion: d.minecraft || '', loader: 'forge' })
        }));
      } catch (_) {}
    }
    if (!versions.length) {
      versions = [{
        id: d.version || 'latest',
        name: d.version || 'Bản mới nhất',
        mcVersion: d.minecraft || '',
        loader: 'forge',
        releaseType: 'release',
        compat: d.url ? evaluatePackCompat({ mcVersion: d.minecraft || '', loader: 'forge' }) : { ok: false, level: 'warn', label: '⚠️ Gói không có link tải công khai' }
      }];
    }
    return {
      ok: true,
      source,
      id,
      kind: 'modpack',
      title: d.displayName || d.name,
      description: d.description || '',
      descriptionIsHtml: true,
      iconUrl: d.icon?.url || d.logo?.url || '',
      url: d.platformUrl || `https://www.technicpack.net/modpack/${id}`,
      gallery: d.background?.url ? [d.background.url] : [],
      downloads: d.installs || 0,
      versions
    };
  }

  if (source === 'atlauncher') {
    const packs = await getAtlPacks();
    const p = packs.find((x) => String(x.id) === String(id));
    if (!p) throw new Error('Không tìm thấy gói ATLauncher.');
    const mapped = mapAtlPack(p);
    return {
      ok: true,
      source,
      id,
      kind: 'modpack',
      title: p.name,
      description: p.description || '',
      iconUrl: mapped.iconUrl,
      url: mapped.url,
      gallery: [],
      downloads: 0,
      versions: (p.versions || []).slice(0, 40).map((v) => ({
        id: v.version,
        name: `${v.version}${v.isRecommended ? ' (Khuyên dùng)' : ''}`,
        mcVersion: v.minecraft,
        loader: v.hasLoader ? '' : 'vanilla',
        releaseType: v.isRecommended ? 'release' : 'beta',
        compat: evaluatePackCompat({ mcVersion: v.minecraft, loader: v.hasLoader ? 'forge' : 'vanilla' })
      }))
    };
  }

  throw new Error('Nguồn gói không hợp lệ.');
}

/* ---------------- INSTALLERS ---------------- */
function progressEmitter(onProgress) {
  return (stage, text, percent) => {
    try { onProgress?.({ stage, text, percent: typeof percent === 'number' ? Math.max(0, Math.min(100, Math.round(percent))) : undefined }); } catch (_) {}
  };
}

async function downloadFileList(files, instanceDir, emit, label = 'tệp', startPct = 10, endPct = 90) {
  const failures = [];
  let done = 0;
  const total = files.length;
  await runPool(files, 12, async (f) => {
    try {
      await downloadVerified(f.urls, safeJoin(instanceDir, f.path), f.hashes || {});
    } catch (e) {
      if (f.optional) failures.push({ ...f, error: e.message, optional: true });
      else failures.push({ ...f, error: e.message });
    }
    done++;
    if (done === total || done % 3 === 0) {
      emit('download', `⬇ Đang tải ${label}: ${done}/${total}`, startPct + ((endPct - startPct) * done) / Math.max(1, total));
    }
  });
  return failures;
}

function cfFolderForClass(classId) {
  if (classId === CF_CLASS.resourcepack) return 'resourcepacks';
  if (classId === CF_CLASS.shader) return 'shaderpacks';
  if (classId === CF_CLASS.world) return 'saves';
  if (classId === CF_CLASS.datapack) return 'datapacks';
  return 'mods';
}

async function resolveCurseForgeFiles(refs) {
  // refs: [{ projectID, fileID, required }]
  const fileIds = refs.map((r) => Number(r.fileID)).filter(Boolean);
  const modIds = [...new Set(refs.map((r) => Number(r.projectID)).filter(Boolean))];
  const filesById = new Map();
  const modsById = new Map();
  for (let i = 0; i < fileIds.length; i += 400) {
    const res = await cfFetch('/v1/mods/files', { method: 'POST', body: { fileIds: fileIds.slice(i, i + 400) } });
    for (const f of res.data || []) filesById.set(f.id, f);
  }
  for (let i = 0; i < modIds.length; i += 400) {
    const res = await cfFetch('/v1/mods', { method: 'POST', body: { modIds: modIds.slice(i, i + 400) } });
    for (const m of res.data || []) modsById.set(m.id, m);
  }
  const downloads = [];
  const manual = [];
  for (const r of refs) {
    const f = filesById.get(Number(r.fileID));
    const m = modsById.get(Number(r.projectID));
    if (!f) {
      manual.push({ name: m?.name || `Project ${r.projectID}`, fileName: '', projectId: r.projectID, fileId: r.fileID, folder: 'mods', pageUrl: m?.links?.websiteUrl || '', reason: 'Tệp đã bị xóa khỏi CurseForge' });
      continue;
    }
    const folder = cfFolderForClass(m?.classId);
    const sha1 = (f.hashes || []).find((h) => h.algo === 1)?.value;
    const md5 = (f.hashes || []).find((h) => h.algo === 2)?.value;
    if (f.downloadUrl) {
      downloads.push({ path: `${folder}/${f.fileName}`, urls: [f.downloadUrl], hashes: { sha1, md5 }, optional: r.required === false, name: m?.name || f.displayName });
    } else {
      const base = m?.links?.websiteUrl || `https://www.curseforge.com/minecraft/mc-mods/${m?.slug || r.projectID}`;
      manual.push({ name: m?.name || f.displayName, fileName: f.fileName, projectId: r.projectID, fileId: f.id, folder, sha1, pageUrl: `${base.replace(/\/+$/, '')}/download/${f.id}`, reason: 'Tác giả chặn tải qua launcher khác' });
    }
  }
  return { downloads, manual };
}

function parseLoaderFromCfManifest(manifest) {
  const loaders = manifest?.minecraft?.modLoaders || [];
  const primary = loaders.find((l) => l.primary) || loaders[0];
  if (!primary?.id) return { loader: 'vanilla', loaderVersion: '' };
  const idStr = String(primary.id);
  const dash = idStr.indexOf('-');
  const name = dash > 0 ? idStr.slice(0, dash) : idStr;
  let ver = dash > 0 ? idStr.slice(dash + 1) : '';
  const loader = normalizeLoaderId(name);
  const mc = manifest?.minecraft?.version || '';
  if (loader === 'forge' && mc && ver.startsWith(`${mc}-`)) ver = ver.slice(mc.length + 1);
  if (loader === 'neoforge' && mc === '1.20.1' && ver.startsWith('1.20.1-')) ver = ver.slice(7);
  return { loader, loaderVersion: ver };
}

async function installCurseForgeZip(zipPath, instanceDir, emit) {
  const zip = openPackZip(zipPath);
  const manEntry = findZipEntryCI(zip, 'manifest.json');
  if (!manEntry) throw new Error('File không phải gói CurseForge (thiếu manifest.json).');
  const manifest = JSON.parse(zip.readAsText(manEntry).replace(/^\uFEFF/, ''));
  const mcVersion = manifest?.minecraft?.version || '';
  const { loader, loaderVersion } = parseLoaderFromCfManifest(manifest);
  emit('resolve', `🔎 Đang lấy danh sách ${manifest.files?.length || 0} mod từ CurseForge...`, 8);
  const { downloads, manual } = await resolveCurseForgeFiles(manifest.files || []);
  const failures = await downloadFileList(downloads, instanceDir, emit, 'mod CurseForge', 10, 88);
  emit('overrides', '📦 Đang chép cấu hình (overrides)...', 92);
  extractZipPrefix(zip, manifest.overrides || 'overrides', instanceDir);
  return {
    name: manifest.name || path.basename(zipPath, '.zip'),
    packVersion: manifest.version || '',
    author: manifest.author || '',
    mcVersion,
    loader,
    loaderVersion,
    modCount: (manifest.files || []).length,
    manual: manual.concat(failures.filter((f) => !f.optional).map((f) => ({ name: f.name || path.basename(f.path), fileName: path.basename(f.path), folder: path.dirname(f.path), pageUrl: f.urls?.[0] || '', reason: f.error })))
  };
}

async function installMrpackFile(mrpackPath, instanceDir, emit) {
  const zip = openPackZip(mrpackPath);
  const idxEntry = findZipEntryCI(zip, 'modrinth.index.json');
  if (!idxEntry) throw new Error('File không phải gói Modrinth (.mrpack thiếu modrinth.index.json).');
  const index = JSON.parse(zip.readAsText(idxEntry).replace(/^\uFEFF/, ''));
  const deps = index.dependencies || {};
  let loader = 'vanilla';
  let loaderVersion = '';
  if (deps.neoforge) { loader = 'neoforge'; loaderVersion = deps.neoforge; }
  else if (deps.forge) { loader = 'forge'; loaderVersion = deps.forge; }
  else if (deps['quilt-loader']) { loader = 'quilt'; loaderVersion = deps['quilt-loader']; }
  else if (deps['fabric-loader']) { loader = 'fabric'; loaderVersion = deps['fabric-loader']; }
  const mcVersion = deps.minecraft || '';
  const files = (index.files || [])
    .filter((f) => (f.env?.client || 'required') !== 'unsupported')
    .map((f) => ({
      path: f.path,
      urls: f.downloads || [],
      hashes: { sha1: f.hashes?.sha1, sha512: f.hashes?.sha512, size: f.fileSize },
      optional: f.env?.client === 'optional',
      name: path.basename(f.path)
    }));
  emit('download', `⬇ Bắt đầu tải ${files.length} tệp của gói...`, 8);
  const failures = await downloadFileList(files, instanceDir, emit, 'mod Modrinth', 10, 88);
  emit('overrides', '📦 Đang chép cấu hình (overrides)...', 92);
  extractZipPrefix(zip, 'overrides', instanceDir);
  extractZipPrefix(zip, 'client-overrides', instanceDir);
  return {
    name: index.name || path.basename(mrpackPath, '.mrpack'),
    packVersion: index.versionId || '',
    summary: index.summary || '',
    mcVersion,
    loader,
    loaderVersion,
    modCount: Math.max(files.length, countFilesIn(path.join(instanceDir, 'mods'), /\.jar$/i)),
    manual: failures.filter((f) => !f.optional).map((f) => ({ name: f.name, fileName: path.basename(f.path), folder: path.dirname(f.path), pageUrl: f.urls?.[0] || '', reason: f.error }))
  };
}

function findWorldRootInZip(zip) {
  const lv = zip.getEntries()
    .map((e) => e.entryName.replace(/\\/g, '/'))
    .filter((n) => /(^|\/)level\.dat$/i.test(n))
    .sort((a, b) => a.length - b.length)[0];
  if (lv === undefined) return null;
  return lv.replace(/level\.dat$/i, '');
}

function installWorldZip(zipPath, savesDir, preferredName) {
  const zip = openPackZip(zipPath);
  const prefix = findWorldRootInZip(zip);
  if (prefix === null) throw new Error('File không chứa thế giới Minecraft (thiếu level.dat).');
  const baseName = makeInstanceSlug(preferredName || prefix.replace(/\/+$/, '').split('/').pop() || 'BlockWay-World');
  fs.mkdirSync(savesDir, { recursive: true });
  let dest = path.join(savesDir, baseName);
  let n = 2;
  while (fs.existsSync(dest)) dest = path.join(savesDir, `${baseName}-${n++}`);
  fs.mkdirSync(dest, { recursive: true });
  extractZipPrefix(zip, prefix, dest);
  return dest;
}

function detectZipPackType(zipPath) {
  const lower = String(zipPath).toLowerCase();
  const zip = openPackZip(zipPath);
  const names = zip.getEntries().map((e) => e.entryName.replace(/\\/g, '/').toLowerCase());
  if (lower.endsWith('.mrpack') || names.includes('modrinth.index.json')) return 'mrpack';
  if (names.includes('manifest.json')) {
    try {
      const m = JSON.parse(zip.readAsText(findZipEntryCI(zip, 'manifest.json')).replace(/^\uFEFF/, ''));
      if (m?.minecraft) return 'curseforge';
    } catch (_) {}
  }
  if (names.some((n) => /(^|\/)mmc-pack\.json$/.test(n)) || names.some((n) => /(^|\/)instance\.cfg$/.test(n))) return 'prism';
  if (names.some((n) => /(^|\/)level\.dat$/.test(n))) return 'world';
  if (names.some((n) => /(^|\/)bin\/version\.json$/.test(n) || /(^|\/)bin\/modpack\.jar$/.test(n))) return 'technic';
  if (names.includes('pack.mcmeta') && names.some((n) => n.startsWith('data/'))) return 'datapack';
  if (names.includes('pack.mcmeta') && names.some((n) => n.startsWith('assets/'))) return 'resourcepack';
  if (names.some((n) => n.startsWith('mods/') || n.includes('/mods/'))) return 'generic';
  return 'unknown';
}

function installPrismZip(zipPath, instanceDir) {
  const zip = openPackZip(zipPath);
  const entries = zip.getEntries().map((e) => e.entryName.replace(/\\/g, '/'));
  const packJsonName = entries.filter((n) => /(^|\/)mmc-pack\.json$/i.test(n)).sort((a, b) => a.length - b.length)[0];
  const base = packJsonName ? packJsonName.replace(/mmc-pack\.json$/i, '') : (entries.find((n) => /(^|\/)instance\.cfg$/i.test(n)) || '').replace(/instance\.cfg$/i, '');
  let mcVersion = '';
  let loader = 'vanilla';
  let loaderVersion = '';
  let name = path.basename(zipPath, path.extname(zipPath));
  if (packJsonName) {
    const pj = JSON.parse(zip.readAsText(findZipEntryCI(zip, packJsonName)));
    for (const c of pj.components || []) {
      if (c.uid === 'net.minecraft') mcVersion = c.version;
      else if (c.uid === 'net.neoforged') { loader = 'neoforge'; loaderVersion = c.version; }
      else if (c.uid === 'net.minecraftforge') { loader = 'forge'; loaderVersion = c.version; }
      else if (c.uid === 'org.quiltmc.quilt-loader') { loader = 'quilt'; loaderVersion = c.version; }
      else if (c.uid === 'net.fabricmc.fabric-loader') { loader = 'fabric'; loaderVersion = c.version; }
      else if (c.uid === 'net.legacyfabric.legacy-fabric-loader' || c.uid === 'net.fabricmc.fabric-loader.legacy') { loader = 'legacyfabric'; loaderVersion = c.version; }
    }
  }
  const cfgEntry = entries.find((n) => n.toLowerCase() === `${base}instance.cfg`.toLowerCase());
  if (cfgEntry) {
    const m = zip.readAsText(findZipEntryCI(zip, cfgEntry)).match(/^name=(.+)$/m);
    if (m) name = m[1].trim();
  }
  const mcSub = entries.some((n) => n.toLowerCase().startsWith(`${base}.minecraft/`)) ? `${base}.minecraft` : `${base}minecraft`;
  extractZipPrefix(zip, mcSub, instanceDir);
  return { name, mcVersion, loader, loaderVersion, modCount: countFilesIn(path.join(instanceDir, 'mods'), /\.jar$/i), manual: [] };
}

function detectTechnicLoader(instanceDir, fallbackMc) {
  let mcVersion = fallbackMc || '';
  let loader = 'forge';
  let loaderVersion = '';
  const vj = path.join(instanceDir, 'bin', 'version.json');
  if (fs.existsSync(vj)) {
    try {
      const j = JSON.parse(fs.readFileSync(vj, 'utf8'));
      if (j.inheritsFrom) mcVersion = mcVersion || j.inheritsFrom;
      const libs = (j.libraries || []).map((l) => l.name || '');
      const forgeLib = libs.find((n) => /^net\.minecraftforge:(forge|minecraftforge|fmlloader)/.test(n));
      const neoLib = libs.find((n) => /^net\.neoforged:(neoforge|forge|fancymodloader)/.test(n));
      const fabricLib = libs.find((n) => /^net\.fabricmc:fabric-loader:/.test(n));
      if (fabricLib) { loader = 'fabric'; loaderVersion = fabricLib.split(':')[2]; }
      else if (neoLib) { loader = 'neoforge'; loaderVersion = neoLib.split(':')[2] || ''; }
      else if (forgeLib) {
        loader = 'forge';
        const v = forgeLib.split(':')[2] || '';
        const parts = v.split('-');
        loaderVersion = parts.length >= 2 ? parts[1] : v;
        if (!mcVersion && parts[0]) mcVersion = parts[0];
      } else {
        const idm = String(j.id || '').match(/forge-?(\d+\.\d+\.\d+\.\d+)/i);
        if (idm) loaderVersion = idm[1];
      }
    } catch (_) {}
  }
  return { mcVersion, loader, loaderVersion };
}

async function resolveLatestLoaderVersion(mcVersion, loader) {
  if (!loader || loader === 'vanilla' || !mcVersion) return '';
  try {
    const list = await fetchLoaderVersions(mcVersion, loader);
    return list?.[0]?.version || '';
  } catch (_) {
    return '';
  }
}

function hasRealIslandWorldgen(instanceDir) {
  try {
    const savesDir = path.join(instanceDir, 'saves');
    if (fs.existsSync(savesDir)) {
      const worlds = fs.readdirSync(savesDir, { withFileTypes: true }).filter((d) => d.isDirectory());
      if (worlds.length > 0) return true;
    }
  } catch (_) {}

  try {
    const dpDir = path.join(instanceDir, 'datapacks');
    if (fs.existsSync(dpDir) && fs.readdirSync(dpDir).some((f) => /\.(zip|jar)$/i.test(f))) return true;
  } catch (_) {}

  try {
    const modsDir = path.join(instanceDir, 'mods');
    if (fs.existsSync(modsDir)) {
      const jars = fs.readdirSync(modsDir).filter((f) => /\.jar$/i.test(f));
      const realIslandRe = /(standard[-_]?skyblock|skyvoid|simply[-_]?oneblock|vanilla[-_]?one[-_]?block|^oneblock[-_]|skyblock[-_]?builder|skyblock[-_]?infinite|exnihilo|exdeorum|ftbskies|skygrid|garden[-_]?of[-_]?glass|carpet[-_]?sky|sky[-_]?additions|skyfactory|fabric[-_]?skyblock)/i;
      const hypixelHudRe = /(skyblocker|skyhanni|skyocean|skyblockpv|skyblock[-_]?enhancements|skyrecipes|better[-_]?hypixel)/i;
      if (jars.some((f) => realIslandRe.test(f) && !hypixelHudRe.test(f))) return true;
    }
  } catch (_) {}

  return false;
}

const AUTO_ISLAND_PRESET_JAR = 'zz-blockway-auto-island-preset.jar';

function ensureDefaultIslandWorldPresetJar(instanceDir, mcVersion = '1.21.4', loader = 'fabric') {
  try {
    if (!instanceDir || !fs.existsSync(instanceDir)) return { ok: false };
    const modsDir = path.join(instanceDir, 'mods');
    if (!fs.existsSync(modsDir)) return { ok: false };
    const jars = fs.readdirSync(modsDir).filter((f) => /\.jar$/i.test(f) && f !== AUTO_ISLAND_PRESET_JAR);
    if (!jars.length) return { ok: false };

    let chosenPresetBuf = null;
    let chosenPresetId = '';
    let sourceModId = '';

    for (const jf of jars) {
      const fullPath = path.join(modsDir, jf);
      let zip;
      try { zip = openPackZip(fullPath); } catch (_) { continue; }
      const entries = zip.getEntries();

      // If any installed mod ALREADY overrides minecraft:normal preset or minecraft:overworld dimension directly, no wrapper needed
      const overridesNormal = entries.some((e) => {
        const n = e.entryName.replace(/\\/g, '/');
        return n === 'data/minecraft/worldgen/world_preset/normal.json' || n === 'data/minecraft/dimension/overworld.json';
      });
      if (overridesNormal) {
        return { ok: true, alreadyDefault: true };
      }

      if (!chosenPresetBuf) {
        for (const e of entries) {
          const n = e.entryName.replace(/\\/g, '/');
          const m = n.match(/^data\/([^/]+)\/worldgen\/world_preset\/([^/]+)\.json$/);
          if (!m || m[1] === 'minecraft') continue;
          const ns = m[1];
          const pName = m[2];
          if (!/(one\s*block|one_?block|sky\s*block|sky_?block|void|island|skygrid)/i.test(`${ns}:${pName}`)) continue;
          try {
            const rawBuf = e.getData();
            const parsed = JSON.parse(rawBuf.toString('utf8'));
            if (parsed && parsed.dimensions && parsed.dimensions['minecraft:overworld']) {
              chosenPresetBuf = rawBuf;
              chosenPresetId = `${ns}:${pName}`;
              const inspected = inspectJarModMetadata(fullPath);
              sourceModId = inspected?.modId || ns;
              break;
            }
          } catch (_) {}
        }
      }
    }

    if (!chosenPresetBuf) return { ok: false };

    const effLoader = String(loader || 'fabric').toLowerCase();
    const packMeta = {
      pack: {
        pack_format: 48,
        supported_formats: [1, 999],
        min_format: 1,
        max_format: 999,
        description: `BlockWay Auto Default World Preset (${chosenPresetId})`
      }
    };
    const zipEntries = [
      { name: 'pack.mcmeta', data: Buffer.from(JSON.stringify(packMeta, null, 2), 'utf8') },
      { name: 'data/minecraft/worldgen/world_preset/normal.json', data: chosenPresetBuf }
    ];

    if (effLoader === 'neoforge') {
      const depBlock = sourceModId
        ? `\n[[dependencies.zz_blockway_island_preset]]\nmodId="${sourceModId}"\ntype="optional"\nordering="AFTER"\nside="BOTH"\n`
        : '';
      const toml = `modLoader="lowcodefml"\nloaderVersion="[1,)"\nlicense="MIT"\n[[mods]]\nmodId="zz_blockway_island_preset"\nversion="1.0.0"\ndisplayName="BlockWay Auto Island Preset"\ndescription="Auto-selects ${chosenPresetId} as Default World Type"\n${depBlock}`;
      zipEntries.push({ name: 'META-INF/neoforge.mods.toml', data: Buffer.from(toml, 'utf8') });
    } else if (effLoader === 'forge') {
      const depBlock = sourceModId
        ? `\n[[dependencies.zz_blockway_island_preset]]\nmodId="${sourceModId}"\nmandatory=false\nversionRange="[0,)"\nordering="AFTER"\nside="BOTH"\n`
        : '';
      const toml = `modLoader="lowcodefml"\nloaderVersion="[1,)"\nlicense="MIT"\n[[mods]]\nmodId="zz_blockway_island_preset"\nversion="1.0.0"\ndisplayName="BlockWay Auto Island Preset"\ndescription="Auto-selects ${chosenPresetId} as Default World Type"\n${depBlock}`;
      zipEntries.push({ name: 'META-INF/mods.toml', data: Buffer.from(toml, 'utf8') });
    } else {
      const fmj = {
        schemaVersion: 1,
        id: 'zz_blockway_island_preset',
        version: '1.0.0',
        name: 'BlockWay Auto Island Preset',
        description: `Automatically sets ${chosenPresetId} as Default World Type when creating a new world.`,
        environment: '*',
        ...(sourceModId ? {
          depends: { [sourceModId]: '*' },
          custom: { 'fabric:resource_load_order': { after: [sourceModId] } }
        } : {})
      };
      zipEntries.push({ name: 'fabric.mod.json', data: Buffer.from(JSON.stringify(fmj, null, 2), 'utf8') });
      if (effLoader === 'quilt') {
        const qmj = {
          schema_version: 1,
          quilt_loader: {
            group: 'com.blockway',
            id: 'zz_blockway_island_preset',
            version: '1.0.0',
            metadata: { name: 'BlockWay Auto Island Preset' }
          }
        };
        zipEntries.push({ name: 'quilt.mod.json', data: Buffer.from(JSON.stringify(qmj, null, 2), 'utf8') });
      }
    }

    const outJar = path.join(modsDir, AUTO_ISLAND_PRESET_JAR);
    fs.writeFileSync(outJar, buildStandardZipBuffer(zipEntries));
    return { ok: true, injected: true, presetId: chosenPresetId, jarPath: outJar };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function equipInstanceWithIslandGenerator({ instanceDir, mcVersion, loader = 'fabric', mode = 'skyblock' }, emit) {
  if (!instanceDir || !mcVersion) return { installed: [] };
  const modsDir = path.join(instanceDir, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });
  const targetLoader = (!loader || loader === 'vanilla' || loader === 'datapack') ? 'fabric' : loader;
  const slugs = mode === 'oneblock'
    ? ['simply-oneblock', 'vanilla-one-block']
    : ['standard-skyblock', 'skyblock-biome-islands', 'skyblock-advancements', 'sky-void-additions'];

  const installed = [];
  for (const slug of slugs) {
    try {
      const versions = await packFetchJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version`);
      if (!Array.isArray(versions) || !versions.length) continue;
      // Match exact mcVersion or major.minor prefix if needed, preferring mod loader jar
      const matchVer = versions.find((v) => (v.game_versions || []).includes(mcVersion) && (v.loaders || []).includes(targetLoader))
        || versions.find((v) => (v.game_versions || []).some((gv) => gv.startsWith(mcVersion + '.') || mcVersion.startsWith(gv + '.')) && (v.loaders || []).includes(targetLoader));
      if (!matchVer) continue;
      const file = (matchVer.files || []).find((f) => /\.jar$/i.test(f.filename) && f.primary)
        || (matchVer.files || []).find((f) => /\.jar$/i.test(f.filename));
      if (!file) continue;
      emit?.('island', `🏝️ Đang tích hợp bộ tạo Đảo ${mode === 'oneblock' ? 'OneBlock' : 'SkyBlock'}: ${file.filename}...`, 94);
      await downloadVerified([file.url], safeJoin(modsDir, file.filename), { sha1: file.hashes?.sha1, sha512: file.hashes?.sha512 });
      installed.push(file.filename);
      // For OneBlock we only need 1 primary generator (simply-oneblock OR vanilla-one-block) so they don't overlap
      if (mode === 'oneblock' && installed.length >= 1) break;
    } catch (_) {}
  }

  // Ensure fabric-api is present if we promoted vanilla -> fabric
  if (targetLoader === 'fabric' && installed.length > 0) {
    try {
      const existing = fs.readdirSync(modsDir);
      if (!existing.some((f) => /^fabric-api/i.test(f))) {
        await installModrinthProject({ slug: 'fabric-api', projectType: 'mod', mcVersion, loaderType: 'fabric', gameDir: instanceDir, _isDep: true }, (s) => emit?.('deps', s, 95));
      }
    } catch (_) {}
  }

  // Ensure default World Type automatically uses Void Island preset if mod defines a custom world_preset
  ensureDefaultIslandWorldPresetJar(instanceDir, mcVersion, installed.length > 0 ? targetLoader : loader);

  return { installed, effectiveLoader: installed.length > 0 ? targetLoader : loader };
}

async function installPackHub(params = {}, onProgress) {
  const emit = progressEmitter(onProgress);
  const gameDir = params.gameDir && String(params.gameDir).trim() ? String(params.gameDir).trim() : getDefaultGameDir();
  const { source, id, versionId } = params;
  const tmpRoot = path.join(gameDir, 'instances', '.blockway-downloads');
  fs.mkdirSync(tmpRoot, { recursive: true });

  // ----- Datapack: gắn vào thế giới có sẵn -----
  if (params.mode === 'datapack-world') {
    const worldDir = path.resolve(String(params.worldPath || ''));
    if (!fs.existsSync(path.join(worldDir, 'level.dat'))) throw new Error('Thế giới đích không hợp lệ.');
    let fileUrl = '';
    let fileName = '';
    let hashes = {};
    if (source === 'modrinth') {
      const v = await packFetchJson(`https://api.modrinth.com/v2/version/${encodeURIComponent(versionId)}`);
      const file = (v.files || []).find((f) => /\.zip$/i.test(f.filename)) || (v.files || []).find((f) => f.primary) || v.files?.[0];
      if (!file) throw new Error('Phiên bản này không có file datapack.');
      fileUrl = file.url; fileName = file.filename; hashes = { sha1: file.hashes?.sha1, sha512: file.hashes?.sha512 };
    } else if (source === 'curseforge') {
      const f = (await cfFetch(`/v1/mods/${id}/files/${versionId}`)).data;
      if (!f?.downloadUrl) throw new Error('Tác giả chặn tải ngoài — hãy tải từ trang CurseForge.');
      fileUrl = f.downloadUrl; fileName = f.fileName; hashes = { sha1: (f.hashes || []).find((h) => h.algo === 1)?.value };
    } else {
      throw new Error('Nguồn này không hỗ trợ datapack.');
    }
    emit('download', `⬇ Đang tải datapack ${fileName}...`, 30);
    const dest = safeJoin(path.join(worldDir, 'datapacks'), fileName);
    await downloadVerified([fileUrl], dest, hashes);
    emit('done', `✅ Đã gắn datapack vào thế giới "${path.basename(worldDir)}"`, 100);
    return { ok: true, kind: 'datapack', worldPath: worldDir, filePath: dest };
  }

  const instanceName = String(params.instanceName || params.title || 'Modpack').slice(0, 64);
  let instanceDir = null;
  let result = null;
  let meta = {
    name: instanceName,
    source,
    projectId: id ?? null,
    versionId: versionId ?? null,
    iconUrl: params.iconUrl || '',
    pageUrl: params.pageUrl || '',
    installedAt: Date.now()
  };

  try {
    // ----- CurseForge World → saves của thư mục chính -----
    if (source === 'curseforge' && params.kind === 'world') {
      const f = (await cfFetch(`/v1/mods/${id}/files/${versionId}`)).data;
      if (!f?.downloadUrl) throw new Error('Tác giả chặn tải ngoài — hãy tải từ trang CurseForge rồi dùng "Nhập file".');
      const zp = path.join(tmpRoot, `cf-world-${f.id}.zip`);
      emit('download', `⬇ Đang tải bản đồ ${f.fileName}...`, 20);
      await downloadVerified([f.downloadUrl], zp, { sha1: (f.hashes || []).find((h) => h.algo === 1)?.value });
      emit('extract', '📦 Đang giải nén bản đồ vào saves...', 80);
      const targetSaves = params.instanceDir ? path.join(assertInsideInstances(gameDir, params.instanceDir), 'saves') : path.join(gameDir, 'saves');
      const worldPath = installWorldZip(zp, targetSaves, params.title);
      try { fs.rmSync(zp, { force: true }); } catch (_) {}
      emit('done', `✅ Đã cài bản đồ "${path.basename(worldPath)}"`, 100);
      return { ok: true, kind: 'world', worldPath };
    }

    instanceDir = createInstanceDir(gameDir, instanceName);
    emit('start', `📁 Đã tạo thư mục gói: ${path.basename(instanceDir)}`, 3);

    if (source === 'modrinth') {
      const v = await packFetchJson(`https://api.modrinth.com/v2/version/${encodeURIComponent(versionId)}`);
      if (params.kind === 'datapack' || params.kind === 'world') {
        // Gói chơi riêng cho datapack / bản đồ sinh đảo: ưu tiên bản .jar tự kích hoạt 100% khi Tạo Thế Giới Mới!
        const mc = (v.game_versions || []).filter((x) => /^\d/.test(x)).sort((a, b) => compareMcVersions(b, a))[0] || '';
        let jar = (v.files || []).find((f) => /\.jar$/i.test(f.filename));
        if (!jar && id && mc) {
          try {
            const allVers = await packFetchJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(id)}/version`);
            const modSibling = (allVers || []).find((sv) => (sv.game_versions || []).includes(mc) && (sv.loaders || []).includes('fabric') && (sv.files || []).some((f) => /\.jar$/i.test(f.filename)));
            if (modSibling) jar = (modSibling.files || []).find((f) => /\.jar$/i.test(f.filename));
          } catch (_) {}
        }
        const zipF = (v.files || []).find((f) => /\.zip$/i.test(f.filename)) || (v.files || [])[0];
        let loader = 'vanilla';
        if (jar) {
          loader = 'fabric';
          await downloadVerified([jar.url], safeJoin(instanceDir, `mods/${jar.filename}`), { sha1: jar.hashes?.sha1 });
          try { await installModrinthProject({ slug: 'fabric-api', projectType: 'mod', mcVersion: mc, loaderType: 'fabric', gameDir: instanceDir, _isDep: true }, (s) => emit('deps', s, 65)); } catch (_) {}
          try { await installModrinthProject({ slug: 'sodium', projectType: 'mod', mcVersion: mc, loaderType: 'fabric', gameDir: instanceDir, _isDep: true }, () => {}); } catch (_) {}
        } else if (zipF) {
          // Check if the .zip is actually a full Minecraft World save (contains level.dat)
          const tmpZip = path.join(tmpRoot, `${Date.now()}-${zipF.filename}`);
          await downloadVerified([zipF.url], tmpZip, { sha1: zipF.hashes?.sha1 });
          try {
            if (findWorldRootInZip(openPackZip(tmpZip)) !== null) {
              installWorldZip(tmpZip, path.join(instanceDir, 'saves'), instanceName);
            } else {
              fs.mkdirSync(path.join(instanceDir, 'blockway-datapacks'), { recursive: true });
              fs.copyFileSync(tmpZip, safeJoin(instanceDir, `blockway-datapacks/${zipF.filename}`));
            }
          } finally {
            try { fs.rmSync(tmpZip, { force: true }); } catch (_) {}
          }
        }
        result = {
          name: instanceName,
          mcVersion: mc,
          loader,
          loaderVersion: '',
          modCount: countFilesIn(path.join(instanceDir, 'mods'), /\.jar$/i),
          manual: [],
          datapackFile: jar ? '' : (zipF?.filename || ''),
          autoIslandMode: /one\s*block/i.test(instanceName) ? 'oneblock' : (/sky\s*block/i.test(instanceName) ? 'skyblock' : (jar ? 'skyblock' : ''))
        };
      } else {
        const file = (v.files || []).find((f) => f.primary && /\.mrpack$/i.test(f.filename)) || (v.files || []).find((f) => /\.mrpack$/i.test(f.filename));
        if (!file) throw new Error('Phiên bản này không có file .mrpack.');
        const mp = path.join(tmpRoot, `${file.hashes?.sha1 || Date.now()}.mrpack`);
        emit('download', `⬇ Đang tải gói ${file.filename}...`, 5);
        await downloadVerified([file.url], mp, { sha1: file.hashes?.sha1, sha512: file.hashes?.sha512 });
        result = await installMrpackFile(mp, instanceDir, emit);
        try { fs.rmSync(mp, { force: true }); } catch (_) {}

        // Also check if Modrinth version attaches companion World .zip files (e.g. Create: OneBlock's World-*.zip)
        const extraZips = (v.files || []).filter((f) => /\.zip$/i.test(f.filename));
        for (const wz of extraZips) {
          try {
            const zp = path.join(tmpRoot, `companion-${Date.now()}-${path.basename(wz.filename)}`);
            emit('world', `🗺️ Đang tải bản đồ đi kèm (${wz.filename})...`, 93);
            await downloadVerified([wz.url], zp, { sha1: wz.hashes?.sha1 });
            if (findWorldRootInZip(openPackZip(zp)) !== null) {
              installWorldZip(zp, path.join(instanceDir, 'saves'), path.basename(wz.filename, '.zip'));
            }
            try { fs.rmSync(zp, { force: true }); } catch (_) {}
          } catch (_) {}
        }
      }
    } else if (source === 'curseforge') {
      const f = (await cfFetch(`/v1/mods/${id}/files/${versionId}`)).data;
      if (!f) throw new Error('Không tìm thấy phiên bản gói trên CurseForge.');
      if (!f.downloadUrl) throw new Error('Tác giả chặn tải gói qua launcher khác. Hãy tải file .zip trên trang CurseForge rồi bấm "📥 Nhập file pack".');
      const zp = path.join(tmpRoot, `cf-${f.id}.zip`);
      emit('download', `⬇ Đang tải gói ${f.fileName}...`, 5);
      await downloadVerified([f.downloadUrl], zp, { sha1: (f.hashes || []).find((h) => h.algo === 1)?.value });
      result = await installCurseForgeZip(zp, instanceDir, emit);
      try { fs.rmSync(zp, { force: true }); } catch (_) {}
    } else if (source === 'ftb') {
      const v = await packFetchJson(`https://api.feed-the-beast.com/v1/modpacks/public/modpack/${id}/${versionId}`);
      const mc = (v.targets || []).find((t) => t.type === 'game')?.version || '';
      const ml = (v.targets || []).find((t) => t.type === 'modloader');
      const files = [];
      const cfRefs = [];
      for (const f of v.files || []) {
        if (f.serveronly) continue;
        const rel = `${String(f.path || './').replace(/^\.\//, '').replace(/\/+$/, '')}/${f.name}`.replace(/^\/+/, '');
        const urls = [f.url, ...(f.mirrors || [])].filter(Boolean);
        if (urls.length) files.push({ path: rel, urls, hashes: { sha1: f.sha1 || f.hashes?.sha1, size: f.size }, optional: Boolean(f.optional), name: f.name });
        else if (f.curseforge?.project && f.curseforge?.file) cfRefs.push({ projectID: f.curseforge.project, fileID: f.curseforge.file, required: !f.optional, _path: rel });
      }
      let manual = [];
      if (cfRefs.length) {
        try {
          const r = await resolveCurseForgeFiles(cfRefs);
          files.push(...r.downloads);
          manual = r.manual;
        } catch (e) {
          manual = cfRefs.map((c) => ({ name: path.basename(c._path), fileName: path.basename(c._path), folder: path.dirname(c._path), pageUrl: '', reason: e.message }));
        }
      }
      emit('download', `⬇ Bắt đầu tải ${files.length} tệp FTB...`, 6);
      const failures = await downloadFileList(files, instanceDir, emit, 'tệp FTB', 8, 95);
      result = {
        name: instanceName,
        mcVersion: mc,
        loader: normalizeLoaderId(ml?.name || 'vanilla'),
        loaderVersion: ml?.version || '',
        modCount: files.filter((f) => /^mods\//i.test(f.path)).length,
        ramMB: v.specs?.recommended || 0,
        manual: manual.concat(failures.filter((x) => !x.optional).map((x) => ({ name: x.name, fileName: path.basename(x.path), folder: path.dirname(x.path), pageUrl: x.urls?.[0] || '', reason: x.error })))
      };
    } else if (source === 'technic') {
      const d = await getTechnicPack(id);
      let mc = d.minecraft || '';
      if (d.solder) {
        const base = d.solder.replace(/\/+$/, '');
        const b = await packFetchJson(`${base}/modpack/${encodeURIComponent(d.name || id)}/${encodeURIComponent(versionId)}`);
        mc = b.minecraft || mc;
        const mods = b.mods || [];
        let done = 0;
        await runPool(mods, 6, async (mod) => {
          const zp = path.join(tmpRoot, `technic-${makeInstanceSlug(mod.name)}-${makeInstanceSlug(mod.version)}.zip`);
          await downloadVerified([mod.url], zp, { md5: mod.md5 });
          extractZipPrefix(openPackZip(zp), '', instanceDir);
          try { fs.rmSync(zp, { force: true }); } catch (_) {}
          done++;
          emit('download', `⬇ Technic Solder: ${done}/${mods.length} gói`, 6 + (88 * done) / Math.max(1, mods.length));
        });
        if (b.forge && /^\d/.test(String(b.forge))) {
          const det = detectTechnicLoader(instanceDir, mc);
          result = { ...det, loaderVersion: det.loaderVersion || String(b.forge), modCount: countFilesIn(path.join(instanceDir, 'mods'), /\.(jar|zip)$/i), manual: [] };
        }
      } else if (d.url) {
        const zp = path.join(tmpRoot, `technic-${makeInstanceSlug(id)}.zip`);
        emit('download', '⬇ Đang tải gói Technic...', 10);
        await downloadVerified([d.url], zp, {});
        emit('extract', '📦 Đang giải nén gói Technic...', 80);
        extractZipPrefix(openPackZip(zp), '', instanceDir);
        try { fs.rmSync(zp, { force: true }); } catch (_) {}
      } else {
        throw new Error('Gói Technic này không có link tải công khai.');
      }
      if (!result) {
        const det = detectTechnicLoader(instanceDir, mc);
        result = { name: instanceName, ...det, modCount: countFilesIn(path.join(instanceDir, 'mods'), /\.(jar|zip)$/i), manual: [] };
      }
      result.name = instanceName;
      if (compareMcVersions(result.mcVersion, '1.6') < 0) throw new Error(`Gói Technic dùng Minecraft ${result.mcVersion} (jar-mod) — chưa hỗ trợ.`);
    } else if (source === 'atlauncher') {
      const packs = await getAtlPacks();
      const p = packs.find((x) => String(x.id) === String(id));
      if (!p) throw new Error('Không tìm thấy gói ATLauncher.');
      const safe = atlSafeName(p.name);
      const base = 'https://download.nodecdn.net/containers/atl/';
      const cfg = await packFetchJson(`${base}packs/${safe}/versions/${encodeURIComponent(versionId)}/Configs.json`);
      const folderFor = { mods: 'mods', resourcepack: 'resourcepacks', texturepack: 'texturepacks', shaderpack: 'shaderpacks', coremods: 'coremods', root: '', ic2lib: 'mods/ic2', denlib: 'mods/denlib', plugins: 'plugins', flan: 'Flan', dependency: 'mods' };
      const files = [];
      const cfRefs = [];
      const manual = [];
      for (const mod of cfg.mods || []) {
        if (mod.client === false) continue;
        if (mod.optional && !mod.recommended && !mod.selected) continue;
        const folder = folderFor[mod.type];
        if (folder === undefined) continue;
        const rel = `${folder ? `${folder}/` : ''}${mod.file}`;
        if (mod.download === 'server' && mod.url) files.push({ path: rel, urls: [`${base}${String(mod.url).replace(/^\/+/, '')}`], hashes: { md5: mod.md5 }, name: mod.name });
        else if (mod.download === 'direct' && mod.url) files.push({ path: rel, urls: [mod.url], hashes: { md5: mod.md5 }, name: mod.name });
        else if (mod.curse_id && mod.curse_file_id && getCurseForgeApiKey()) cfRefs.push({ projectID: mod.curse_id, fileID: mod.curse_file_id, required: true });
        else manual.push({ name: mod.name, fileName: mod.file, folder: folder || '.', pageUrl: mod.website || mod.url || '', reason: 'Cần tải thủ công trên trình duyệt' });
      }
      if (cfRefs.length) {
        try {
          const r = await resolveCurseForgeFiles(cfRefs);
          files.push(...r.downloads);
          manual.push(...r.manual);
        } catch (_) {}
      }
      emit('download', `⬇ Bắt đầu tải ${files.length} tệp ATLauncher...`, 6);
      const failures = await downloadFileList(files, instanceDir, emit, 'tệp ATLauncher', 8, 86);
      if (!cfg.noConfigs) {
        try {
          const cz = path.join(tmpRoot, `atl-${safe}-${makeInstanceSlug(versionId)}-configs.zip`);
          emit('configs', '📦 Đang tải gói cấu hình (Configs.zip)...', 90);
          await downloadVerified([`${base}packs/${safe}/versions/${encodeURIComponent(versionId)}/Configs.zip`], cz, { sha1: cfg.configs?.sha1 });
          extractZipPrefix(openPackZip(cz), '', instanceDir);
          try { fs.rmSync(cz, { force: true }); } catch (_) {}
        } catch (e) {
          manual.push({ name: 'Configs.zip', fileName: 'Configs.zip', folder: '.', pageUrl: '', reason: e.message });
        }
      }
      const ld = cfg.loader || {};
      const ldType = normalizeLoaderId(ld.type || (String(ld.className || '').includes('fabric') ? 'fabric' : String(ld.className || '').includes('forge') ? 'forge' : 'vanilla'));
      let ldVer = ld.metadata?.version || ld.metadata?.loader || '';
      result = {
        name: instanceName,
        mcVersion: cfg.minecraft || ld.metadata?.minecraft || '',
        loader: ldType,
        loaderVersion: ldVer,
        modCount: files.filter((f) => /^mods\//i.test(f.path)).length,
        ramMB: Number(cfg.memory) || 0,
        manual: manual.concat(failures.map((x) => ({ name: x.name, fileName: path.basename(x.path), folder: path.dirname(x.path), pageUrl: x.urls?.[0] || '', reason: x.error })))
      };
    } else {
      throw new Error('Nguồn gói không hợp lệ.');
    }

    // v40.4.1 PRO: Auto-equip SkyBlock / OneBlock Island Worldgen AND auto-force Default World Preset to Void Island!
    const combinedTitle = `${params.instanceName || ''} ${params.title || ''} ${result.name || ''}`;
    const wantsOneBlock = /one\s*block/i.test(combinedTitle);
    const wantsSkyBlock = !wantsOneBlock && /sky\s*block/i.test(combinedTitle);
    if ((wantsOneBlock || wantsSkyBlock) && result.mcVersion) {
      const targetMode = wantsOneBlock ? 'oneblock' : 'skyblock';
      if (!hasRealIslandWorldgen(instanceDir)) {
        const eq = await equipInstanceWithIslandGenerator({
          instanceDir,
          mcVersion: result.mcVersion,
          loader: result.loader,
          mode: targetMode
        }, emit);
        if (eq.installed.length > 0) {
          result.loader = eq.effectiveLoader || result.loader;
          result.autoIslandMode = targetMode;
          result.modCount = countFilesIn(path.join(instanceDir, 'mods'), /\.jar$/i);
        }
      } else {
        const presetFix = ensureDefaultIslandWorldPresetJar(instanceDir, result.mcVersion, result.loader);
        if (presetFix.ok) {
          result.autoIslandMode = result.autoIslandMode || targetMode;
        }
      }
    }

    if (!result.loaderVersion && result.loader && result.loader !== 'vanilla') {
      emit('loader', `🔧 Đang chọn bản ${result.loader.toUpperCase()} phù hợp cho ${result.mcVersion}...`, 96);
      result.loaderVersion = await resolveLatestLoaderVersion(result.mcVersion, result.loader);
    }

    meta = {
      ...meta,
      name: params.instanceName || result.name || instanceName,
      versionName: params.versionName || result.packVersion || '',
      mcVersion: result.mcVersion,
      loader: result.loader || 'vanilla',
      loaderVersion: result.loaderVersion || '',
      modCount: countFilesIn(path.join(instanceDir, 'mods'), /\.jar$/i) || result.modCount || 0,
      ramRecommendedGB: result.ramMB ? Math.max(2, Math.round(result.ramMB / 1024)) : recommendRamGB(result.modCount, result.mcVersion),
      manualPending: result.manual || [],
      datapackFile: result.datapackFile || '',
      autoIslandMode: result.autoIslandMode || ''
    };
    writeInstanceMeta(instanceDir, meta);
    emit('done', `✅ Đã cài xong "${meta.name}" (${meta.mcVersion} • ${String(meta.loader).toUpperCase()})`, 100);
    return { ok: true, instance: { ...meta, dir: instanceDir }, manual: meta.manualPending };
  } catch (err) {
    if (instanceDir && !params.keepOnError) {
      try { fs.rmSync(instanceDir, { recursive: true, force: true }); } catch (_) {}
    }
    throw err;
  }
}

async function importPackFromFile({ filePath, gameDir, worldTarget } = {}, onProgress) {
  const emit = progressEmitter(onProgress);
  const root = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const src = path.resolve(String(filePath || ''));
  if (!fs.existsSync(src)) throw new Error('Không tìm thấy file.');
  const type = detectZipPackType(src);
  const baseName = path.basename(src).replace(/\.(zip|mrpack)$/i, '');
  emit('detect', `🔎 Đã nhận diện: ${type.toUpperCase()}`, 3);

  if (type === 'world') {
    const worldPath = installWorldZip(src, path.join(root, 'saves'), baseName);
    emit('done', `✅ Đã nhập bản đồ "${path.basename(worldPath)}" vào saves`, 100);
    return { ok: true, kind: 'world', worldPath };
  }
  if (type === 'datapack') {
    if (!worldTarget) return { ok: true, kind: 'datapack-needs-world', filePath: src };
    const worldDir = path.resolve(worldTarget);
    if (!fs.existsSync(path.join(worldDir, 'level.dat'))) throw new Error('Thế giới đích không hợp lệ.');
    const dest = safeJoin(path.join(worldDir, 'datapacks'), path.basename(src));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    emit('done', `✅ Đã gắn datapack vào "${path.basename(worldDir)}"`, 100);
    return { ok: true, kind: 'datapack', worldPath: worldDir };
  }
  if (type === 'resourcepack') {
    const dest = path.join(root, 'resourcepacks', path.basename(src));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    emit('done', '✅ Đã thêm Resource Pack vào thư mục resourcepacks', 100);
    return { ok: true, kind: 'resourcepack', filePath: dest };
  }
  if (type === 'unknown') throw new Error('Không nhận diện được loại file. Hỗ trợ: .mrpack, CurseForge .zip, Prism/MultiMC .zip, Technic .zip, World .zip, Datapack .zip.');

  const instanceDir = createInstanceDir(root, baseName);
  try {
    let result;
    if (type === 'mrpack') result = await installMrpackFile(src, instanceDir, emit);
    else if (type === 'curseforge') result = await installCurseForgeZip(src, instanceDir, emit);
    else if (type === 'prism') result = installPrismZip(src, instanceDir);
    else {
      extractZipPrefix(openPackZip(src), '', instanceDir);
      const det = detectTechnicLoader(instanceDir, '');
      result = { name: baseName, ...det, modCount: countFilesIn(path.join(instanceDir, 'mods'), /\.(jar|zip)$/i), manual: [] };
    }
    if (!result.mcVersion) throw new Error('Không xác định được phiên bản Minecraft của gói.');
    if (!result.loaderVersion && result.loader && result.loader !== 'vanilla') {
      result.loaderVersion = await resolveLatestLoaderVersion(result.mcVersion, result.loader);
    }
    let autoIslandMode = '';
    if (/(one\s*block|sky\s*block)/i.test(`${result.name || ''} ${baseName}`)) {
      const pr = ensureDefaultIslandWorldPresetJar(instanceDir, result.mcVersion, result.loader);
      if (pr.ok) autoIslandMode = /one\s*block/i.test(`${result.name || ''} ${baseName}`) ? 'oneblock' : 'skyblock';
    }
    const meta = {
      name: result.name || baseName,
      source: `import-${type}`,
      projectId: null,
      versionId: null,
      versionName: result.packVersion || '',
      iconUrl: '',
      installedAt: Date.now(),
      mcVersion: result.mcVersion,
      loader: result.loader || 'vanilla',
      loaderVersion: result.loaderVersion || '',
      modCount: countFilesIn(path.join(instanceDir, 'mods'), /\.jar$/i) || result.modCount || 0,
      ramRecommendedGB: recommendRamGB(result.modCount, result.mcVersion),
      manualPending: result.manual || [],
      autoIslandMode
    };
    writeInstanceMeta(instanceDir, meta);
    emit('done', `✅ Đã nhập gói "${meta.name}" (${meta.mcVersion} • ${String(meta.loader).toUpperCase()})`, 100);
    return { ok: true, kind: 'instance', instance: { ...meta, dir: instanceDir }, manual: meta.manualPending };
  } catch (err) {
    try { fs.rmSync(instanceDir, { recursive: true, force: true }); } catch (_) {}
    throw err;
  }
}

async function importPackFromUrl({ url, gameDir, worldTarget } = {}, onProgress) {
  const emit = progressEmitter(onProgress);
  const parsed = new URL(String(url || '').trim());
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('Link không hợp lệ.');
  const root = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const tmpDir = path.join(root, 'instances', '.blockway-downloads');
  let name = decodeURIComponent(parsed.pathname.split('/').pop() || 'pack.zip').replace(/[^A-Za-z0-9._ -]/g, '_');
  if (!/\.(zip|mrpack)$/i.test(name)) name += '.zip';
  const dest = path.join(tmpDir, `${Date.now()}-${name}`);
  emit('download', `⬇ Đang tải ${name}...`, 2);
  await downloadVerified([parsed.toString()], dest, {});
  try {
    return await importPackFromFile({ filePath: dest, gameDir: root, worldTarget }, onProgress);
  } finally {
    try { fs.rmSync(dest, { force: true }); } catch (_) {}
  }
}

function resolveManualDownloads({ gameDir, instanceDir, searchDirs = [] } = {}) {
  const dir = assertInsideInstances(gameDir, instanceDir);
  const meta = readInstanceMeta(dir);
  if (!meta) throw new Error('Không đọc được thông tin gói.');
  const pending = Array.isArray(meta.manualPending) ? meta.manualPending : [];
  const dirs = [path.join(os.homedir(), 'Downloads'), path.join(os.homedir(), 'Desktop'), ...searchDirs].filter((d) => d && fs.existsSync(d));
  const still = [];
  let moved = 0;
  for (const item of pending) {
    if (!item.fileName) { still.push(item); continue; }
    let found = null;
    for (const d of dirs) {
      const p = path.join(d, item.fileName);
      if (fs.existsSync(p)) { found = p; break; }
    }
    if (!found) { still.push(item); continue; }
    const target = safeJoin(dir, `${item.folder && item.folder !== '.' ? `${item.folder}/` : ''}${item.fileName}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(found, target);
    moved++;
  }
  writeInstanceMeta(dir, { ...meta, manualPending: still });
  return { ok: true, moved, remaining: still };
}

async function checkCurseForgeKey(key) {
  const k = String(key || getCurseForgeApiKey() || '').trim();
  if (!k) return { ok: false, valid: false, searchAllowed: false, error: 'Chưa có key' };
  const headers = { 'x-api-key': k };
  let valid = false;
  let searchAllowed = false;
  try {
    await packFetchJson(`${CF_API}/v1/games/${CF_GAME_ID}`, { headers });
    valid = true;
  } catch (_) {}
  if (valid) {
    try {
      await packFetchJson(`${CF_API}/v1/mods/search?gameId=${CF_GAME_ID}&classId=${CF_CLASS.modpack}&pageSize=1`, { headers });
      searchAllowed = true;
    } catch (_) {}
  }
  return { ok: true, valid, searchAllowed };
}

/* ============================================================================
   v40.1 PRO — DỊCH TIẾNG VIỆT MIỄN PHÍ (GOOGLE GTX + CACHE) & CHƠI CHUNG CO-OP
   ============================================================================ */
const dgram = require('dgram');
let viTransCacheMem = null;
let viTransCacheFile = '';

function initViTranslationCache(customCacheDir = '') {
  if (viTransCacheMem) return viTransCacheMem;
  viTransCacheMem = {};
  try {
    const baseDir = customCacheDir || path.join(os.homedir(), 'AppData', 'Roaming', 'blockway-launcher');
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
    viTransCacheFile = path.join(baseDir, 'vi-translation-cache.json');
    if (fs.existsSync(viTransCacheFile)) {
      const parsed = JSON.parse(fs.readFileSync(viTransCacheFile, 'utf8'));
      if (parsed && typeof parsed === 'object') viTransCacheMem = parsed;
    }
  } catch (_) {}
  return viTransCacheMem;
}

let viSaveTimer = null;
function scheduleSaveViCache() {
  if (viSaveTimer) return;
  viSaveTimer = setTimeout(() => {
    viSaveTimer = null;
    try {
      if (viTransCacheFile && viTransCacheMem) {
        const keys = Object.keys(viTransCacheMem);
        if (keys.length > 2500) {
          for (const k of keys.slice(0, keys.length - 2000)) delete viTransCacheMem[k];
        }
        fs.writeFileSync(viTransCacheFile, JSON.stringify(viTransCacheMem), 'utf8');
      }
    } catch (_) {}
  }, 1500);
}

function polishMinecraftVietnamese(str) {
  if (!str) return '';
  return String(str)
    .replace(/\bMột khối\b/gi, 'OneBlock (Một Khối)')
    .replace(/\bKhối bầu trời\b/gi, 'SkyBlock (Đảo Trên Không)')
    .replace(/\bgói mod\b/gi, 'Modpack')
    .replace(/\bngười tải mod\b/gi, 'Mod Loader')
    .replace(/\bThợ rèn mới\b/gi, 'NeoForge')
    .replace(/\bLò rèn\b/gi, 'Forge')
    .replace(/\bChăn bông\b/gi, 'Quilt')
    .replace(/\bVải\b(?=\s+(API|loader|mod))/gi, 'Fabric')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksAlreadyVietnamese(text) {
  return /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(String(text || ''));
}

async function translateSingleToVi(rawText, cacheDir = '') {
  const clean = String(rawText || '').trim().slice(0, 2200);
  if (!clean) return '';
  if (looksAlreadyVietnamese(clean)) return clean;

  const cache = initViTranslationCache(cacheDir);
  const key = clean.slice(0, 320);
  if (cache[key]) return cache[key];

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(clean)}`;
    const data = await packFetchJson(url, { timeoutMs: 5500 });
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const joined = data[0].map((seg) => (Array.isArray(seg) ? seg[0] || '' : '')).join('');
      const polished = polishMinecraftVietnamese(joined);
      if (polished && polished !== clean) {
        cache[key] = polished;
        scheduleSaveViCache();
        return polished;
      }
      if (polished) return polished;
    }
  } catch (_) {}
  return clean;
}

async function translateBatchChunkToVi(texts, cacheDir = '') {
  if (!texts.length) return [];
  if (texts.length === 1) return [await translateSingleToVi(texts[0], cacheDir)];
  const cache = initViTranslationCache(cacheDir);
  const sep = '\n\n[998877]\n\n';
  const joinedReq = texts.join(sep);
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(joinedReq)}`;
    const data = await packFetchJson(url, { timeoutMs: 6500 });
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const fullVi = data[0].map((seg) => (Array.isArray(seg) ? seg[0] || '' : '')).join('');
      const parts = fullVi.split(/\s*\[\s*998877\s*\]\s*/);
      if (parts.length === texts.length) {
        return parts.map((p, idx) => {
          const orig = texts[idx];
          const polished = polishMinecraftVietnamese(p);
          if (polished && polished !== orig) {
            cache[orig.slice(0, 320)] = polished;
            scheduleSaveViCache();
          }
          return polished || orig;
        });
      }
    }
  } catch (_) {}
  // Safe fallback: gentle sequential/2-way pool if separator split didn't match
  const fallbackOut = new Array(texts.length);
  await runPool(texts.map((t, i) => ({ t, i })), 2, async ({ t, i }) => {
    fallbackOut[i] = await translateSingleToVi(t, cacheDir);
  });
  return fallbackOut;
}

async function translateTextToVi(input, cacheDir = '') {
  if (Array.isArray(input)) {
    const cache = initViTranslationCache(cacheDir);
    const out = new Array(input.length);
    const pendingByKey = new Map();
    input.forEach((raw, idx) => {
      const clean = String(raw || '').trim().slice(0, 2200);
      if (!clean || looksAlreadyVietnamese(clean)) {
        out[idx] = clean;
        return;
      }
      const key = clean.slice(0, 320);
      if (cache[key]) {
        out[idx] = cache[key];
        return;
      }
      if (!pendingByKey.has(key)) pendingByKey.set(key, { clean, indices: [] });
      pendingByKey.get(key).indices.push(idx);
    });

    const uniqueEntries = Array.from(pendingByKey.values());
    const batches = [];
    let cur = [];
    let curLen = 0;
    for (const entry of uniqueEntries) {
      if (cur.length >= 5 || (cur.length > 0 && curLen + entry.clean.length > 1300)) {
        batches.push(cur);
        cur = [];
        curLen = 0;
      }
      cur.push(entry);
      curLen += entry.clean.length;
    }
    if (cur.length) batches.push(cur);

    await runPool(batches, 3, async (batch) => {
      const resList = await translateBatchChunkToVi(batch.map((b) => b.clean), cacheDir);
      batch.forEach((b, i) => {
        const val = resList[i] || b.clean;
        for (const idx of b.indices) out[idx] = val;
      });
    });

    const translatedFlags = out.map((val, idx) => {
      const orig = String(input[idx] || '').trim().slice(0, 2200);
      return Boolean(val && (val !== orig || looksAlreadyVietnamese(val)));
    });
    return { ok: true, results: out, translatedFlags };
  }
  const translated = await translateSingleToVi(input, cacheDir);
  return { ok: true, text: translated };
}

function getLocalLanIpAddresses() {
  const nets = os.networkInterfaces() || {};
  const list = [];
  for (const [ifName, addrs] of Object.entries(nets)) {
    for (const a of addrs || []) {
      const fam = a.family === 'IPv4' || a.family === 4;
      if (!fam || a.internal || !a.address || a.address.startsWith('169.254.')) continue;
      const isVpn = /radmin|zerotier|tailscale|hamachi|tap|tun|vpn/i.test(ifName) || a.address.startsWith('26.') || a.address.startsWith('100.');
      list.push({
        name: ifName,
        ip: a.address,
        type: isVpn ? 'vpn' : 'lan',
        label: isVpn ? `Mạng ảo VPN (${ifName}: ${a.address})` : `Wi-Fi / LAN (${ifName}: ${a.address})`
      });
    }
  }
  list.sort((a, b) => (a.type === 'lan' ? -1 : 1) - (b.type === 'lan' ? -1 : 1));
  return list;
}

function scanLanWorlds(timeoutMs = 2200) {
  return new Promise((resolve) => {
    const found = new Map();
    let sock = null;
    const finish = () => {
      try { if (sock) sock.close(); } catch (_) {}
      sock = null;
      resolve({
        ok: true,
        worlds: Array.from(found.values()),
        localIps: getLocalLanIpAddresses()
      });
    };

    try {
      sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sock.on('error', () => finish());
      sock.on('message', (msg, rinfo) => {
        try {
          const str = msg.toString('utf8');
          const motdMatch = str.match(/\[MOTD\]([\s\S]*?)\[\/MOTD\]/i);
          const adMatch = str.match(/\[AD\](\d+)\[\/AD\]/i);
          if (adMatch) {
            const port = Number(adMatch[1]);
            const rawMotd = (motdMatch ? motdMatch[1] : 'Thế giới LAN Minecraft').replace(/§[0-9a-fk-or]/gi, '').trim();
            const hostIp = rinfo.address || '127.0.0.1';
            const address = `${hostIp}:${port}`;
            found.set(address, {
              motd: rawMotd || 'Thế giới LAN Minecraft',
              hostIp,
              port,
              address,
              seenAt: Date.now()
            });
          }
        } catch (_) {}
      });
      sock.bind(4445, () => {
        try { sock.addMembership('224.0.2.60'); } catch (_) {}
      });
      setTimeout(finish, Math.max(800, Math.min(5000, Number(timeoutMs) || 2200)));
    } catch (_) {
      finish();
    }
  });
}

async function prepareCoopHostMods({
  mcVersion = '1.21.4',
  loaderType = 'fabric',
  gameDir,
  instanceDir,
  mode = 'e4mc',
  enableE4mc = true,
  enableCustomLan = true,
  enableVoiceChat = false,
  enableTeamQol = false
}, onStatus) {
  const targetDir = (instanceDir && fs.existsSync(instanceDir))
    ? instanceDir
    : (gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir());
  const effectiveLoader = normalizeModrinthLoader(loaderType, mcVersion);
  const installed = [];
  const warnings = [];
  const wantE4mc = mode === 'lan' ? false : Boolean(enableE4mc);

  if (wantE4mc) {
    onStatus?.(`🌐 Đang cài đặt Mod mở phòng Internet (e4mc) cho MC ${mcVersion} (${effectiveLoader.toUpperCase()})...`);
    try {
      const r = await installModrinthProject({
        slug: 'e4mc',
        projectType: 'mod',
        mcVersion,
        loaderType: effectiveLoader,
        gameDir: targetDir
      }, onStatus);
      if (r?.fileName) installed.push(r.fileName);
    } catch (e1) {
      try {
        const r2 = await installModrinthProject({
          slug: 'world-host',
          projectType: 'mod',
          mcVersion,
          loaderType: effectiveLoader,
          gameDir: targetDir
        }, onStatus);
        if (r2?.fileName) installed.push(r2.fileName);
      } catch (_) {
        warnings.push(e1.message);
      }
    }
  }

  if (enableCustomLan && ['fabric', 'quilt', 'forge', 'neoforge'].includes(effectiveLoader)) {
    for (const lanSlug of ['lan-server-properties', 'custom-lan']) {
      try {
        const rLan = await installModrinthProject({
          slug: lanSlug,
          projectType: 'mod',
          mcVersion,
          loaderType: effectiveLoader,
          gameDir: targetDir
        }, onStatus);
        if (rLan?.fileName) {
          installed.push(rLan.fileName);
          break;
        }
      } catch (_) {}
    }
  }

  if (enableVoiceChat || enableTeamQol) {
    const combo = await installCoopComboPack({
      gameDir: targetDir,
      mcVersion,
      loaderType: effectiveLoader,
      includeVoice: Boolean(enableVoiceChat),
      includeTeamQol: Boolean(enableTeamQol)
    }, onStatus);
    if (Array.isArray(combo?.installed)) {
      for (const fn of combo.installed) {
        if (!installed.includes(fn)) installed.push(fn);
      }
    }
  }

  return {
    ok: installed.length > 0 || warnings.length === 0,
    installed,
    warnings,
    effectiveLoader,
    targetDir
  };
}

/* ============================================================================
   v40.2 PRO — 5 NÂNG CẤP TOÀN DIỆN:
   1) Bác Sĩ Chẩn Đoán & Tự Sửa Lỗi Crash Bằng Tiếng Việt (analyzeMinecraftCrash)
   2) Đồng Bộ Giỏ Mod Theo Mã Phòng Chơi Chung (buildCoopModBasket / syncCoopModBasket)
   3) Tự Cài Thư Viện Phụ Thuộc & Nâng Cấp Toàn Bộ Mod Khi Đổi Bản MC (syncAllLocalModsToVersion)
   4) Sao Lưu / Khôi Phục / Xuất / Nhập Thế Giới 1-Click .zip (World Backup & Zip Manager)
   5) Thư Viện Ảnh Chụp Trong Game (listLocalScreenshots / deleteLocalScreenshot)
   ============================================================================ */

function postModrinthJson(apiPath, bodyObj, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(bodyObj || {}), 'utf8');
    const req = https.request(
      `https://api.modrinth.com${apiPath}`,
      {
        method: 'POST',
        headers: {
          'User-Agent': PACK_UA,
          'Content-Type': 'application/json',
          'Content-Length': payload.length
        },
        timeout
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Modrinth HTTP ${res.statusCode}`));
          }
          try {
            resolve(JSON.parse(text));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.write(payload);
    req.end();
  });
}

async function lookupModrinthBySha1Map(filePaths) {
  const hashToFile = {};
  const fileToHash = {};
  const hashes = [];
  for (const fp of filePaths || []) {
    try {
      if (!fs.existsSync(fp)) continue;
      const buf = fs.readFileSync(fp);
      const h = crypto.createHash('sha1').update(buf).digest('hex');
      hashToFile[h] = fp;
      fileToHash[fp] = h;
      hashes.push(h);
    } catch (_) {}
  }
  if (!hashes.length) return { byHash: {}, fileToHash };
  try {
    const byHash = await postModrinthJson('/v2/version_files', { hashes, algorithm: 'sha1' });
    return { byHash: byHash && typeof byHash === 'object' ? byHash : {}, fileToHash };
  } catch (_) {
    return { byHash: {}, fileToHash };
  }
}

const COMMON_MODID_TO_MODRINTH_SLUG = {
  'fabric-api': 'fabric-api',
  fabric: 'fabric-api',
  fabricloader: 'fabric-api',
  'fabric-language-kotlin': 'fabric-language-kotlin',
  kotlinforforge: 'kotlin-for-forge',
  'cloth-config': 'cloth-config',
  cloth_config: 'cloth-config',
  'cloth-config2': 'cloth-config',
  architectury: 'architectury-api',
  'architectury-api': 'architectury-api',
  geckolib: 'geckolib',
  geckolib3: 'geckolib',
  geckolib4: 'geckolib',
  curios: 'curios',
  trinkets: 'trinkets',
  balm: 'balm',
  collective: 'collective',
  puzzleslib: 'puzzles-lib',
  'puzzles-lib': 'puzzles-lib',
  forgeconfigapiport: 'forge-config-api-port',
  yet_another_config_lib_v3: 'yacl',
  'yet-another-config-lib': 'yacl',
  yacl: 'yacl',
  indium: 'indium',
  athena: 'athena',
  resourcefullib: 'resourceful-lib',
  resourcefulconfig: 'resourceful-config',
  moonlight: 'moonlight',
  selene: 'moonlight',
  cristellib: 'cristel-lib',
  cicada: 'cicada',
  owo: 'owo-lib',
  'owo-lib': 'owo-lib',
  'cardinal-components-base': 'cardinal-components-api',
  'cardinal-components': 'cardinal-components-api',
  'placeholder-api': 'placeholder-api',
  bookshelf: 'bookshelf',
  prickle: 'prickle',
  konkrete: 'konkrete',
  melody: 'melody',
  fancymenu: 'fancymenu',
  modmenu: 'modmenu',
  sodium: 'sodium',
  embeddium: 'embeddium',
  iris: 'iris',
  oculus: 'oculus',
  lithium: 'lithium',
  ferritecore: 'ferrite-core',
  'ferrite-core': 'ferrite-core',
  entityculling: 'entityculling',
  immediatelyfast: 'immediatelyfast',
  voicechat: 'simple-voice-chat',
  'simple-voice-chat': 'simple-voice-chat',
  plasmovoice: 'plasmo-voice',
  xaerominimap: 'xaeros-minimap',
  xaeroworldmap: 'xaeros-world-map',
  carryon: 'carry-on',
  waystones: 'waystones',
  jade: 'jade',
  sound_physics_remastered: 'sound-physics-remastered'
};

async function syncAllLocalModsToVersion({ gameDir, instanceDir, mcVersion = '1.21.4', loaderType = 'fabric' }, onStatus) {
  const rootDir = (instanceDir && fs.existsSync(instanceDir))
    ? instanceDir
    : (gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir());
  const modsFolder = path.join(rootDir, 'mods');
  if (!fs.existsSync(modsFolder)) fs.mkdirSync(modsFolder, { recursive: true });

  const effectiveLoader = normalizeModrinthLoader(loaderType, mcVersion);
  const meta = readModsMetaManifest(modsFolder);
  let allFiles = [];
  try {
    allFiles = fs.readdirSync(modsFolder).filter((f) => /\.jar(\.disabled)?$/i.test(f));
  } catch (_) {}

  if (allFiles.length === 0) {
    return { ok: true, upgraded: [], kept: [], disabledIncompatible: [], depsInstalled: [], effectiveLoader };
  }

  onStatus?.(`🔍 Đang quét & nhận diện ${allFiles.length} Mod trong máy qua cơ sở dữ liệu Modrinth...`);
  const fullPaths = allFiles.map((f) => path.join(modsFolder, f));
  const { byHash, fileToHash } = await lookupModrinthBySha1Map(fullPaths);

  const inferSlugOrProjectId = (fileName, fullPath) => {
    const cleanName = fileName.replace(/\.disabled$/i, '');
    const sha1 = fileToHash[fullPath];
    const hashHit = sha1 ? byHash[sha1] : null;
    if (hashHit?.project_id) return hashHit.project_id;
    if (meta[cleanName]?.projectId) return meta[cleanName].projectId;
    if (meta[cleanName]?.slug) return meta[cleanName].slug;
    const lower = cleanName.toLowerCase();
    for (const [slug, prefixes] of Object.entries(KNOWN_MOD_SLUG_PREFIXES)) {
      if (prefixes.some((p) => lower.startsWith(p))) return slug;
    }
    const guess = cleanName
      .replace(/\.jar$/i, '')
      .replace(/[-_+](?:mc|fabric|forge|neoforge|quilt)?[-_+]?v?\d+\.\d+.*$/i, '')
      .replace(/[-_+]v?\d+\.\d+.*$/i, '')
      .toLowerCase();
    return COMMON_MODID_TO_MODRINTH_SLUG[guess] || (guess.length >= 3 ? guess : '');
  };

  const isModMatchingTarget = (fileName, fullPath) => {
    const cleanName = fileName.replace(/\.disabled$/i, '');
    const sha1 = fileToHash[fullPath];
    const hashHit = sha1 ? byHash[sha1] : null;
    const gVers = hashHit?.game_versions || meta[cleanName]?.gameVersions || [];
    const loaders = hashHit?.loaders || (meta[cleanName]?.loader ? [meta[cleanName].loader] : []);

    if (Array.isArray(loaders) && loaders.length > 0) {
      const lOk = loaders.includes(effectiveLoader)
        || (effectiveLoader === 'quilt' && loaders.includes('fabric'))
        || (effectiveLoader === 'forge' && loaders.includes('neoforge'));
      if (!lOk) return false;
    }
    if (Array.isArray(gVers) && gVers.length > 0) {
      return gVers.includes(mcVersion);
    }
    const explicitVer = meta[cleanName]?.mcVersion || extractMcVerFromFilename(cleanName);
    if (explicitVer) return explicitVer === mcVersion;
    return true;
  };

  const kept = [];
  const upgraded = [];
  const disabledIncompatible = [];
  const depsInstalled = [];
  const requiredDepIds = new Set();

  for (let i = 0; i < allFiles.length; i++) {
    const f = allFiles[i];
    const cleanName = f.replace(/\.disabled$/i, '');
    const fullPath = path.join(modsFolder, f);
    const isDisabled = f.toLowerCase().endsWith('.disabled');
    const sha1 = fileToHash[fullPath];
    const hashHit = sha1 ? byHash[sha1] : null;

    if (hashHit && Array.isArray(hashHit.dependencies)) {
      for (const d of hashHit.dependencies) {
        if (d.dependency_type === 'required' && d.project_id) requiredDepIds.add(d.project_id);
      }
    }

    if (isModMatchingTarget(f, fullPath)) {
      if (isDisabled) {
        const enabledDest = path.join(modsFolder, cleanName);
        if (!fs.existsSync(enabledDest)) {
          try { fs.renameSync(fullPath, enabledDest); } catch (_) {}
        }
      }
      kept.push(cleanName);
      continue;
    }

    // Mod does not match target mcVersion + effectiveLoader -> try to upgrade/switch from Modrinth!
    const slugOrId = inferSlugOrProjectId(f, fullPath);
    if (slugOrId) {
      onStatus?.(`🔄 [${i + 1}/${allFiles.length}] Đang tìm bản ${mcVersion} (${effectiveLoader.toUpperCase()}) cho Mod "${cleanName}"...`);
      try {
        if (!isDisabled && fs.existsSync(fullPath)) {
          try { fs.renameSync(fullPath, `${fullPath}.disabled`); } catch (_) {}
        }
        const res = await installModrinthProject({
          slug: slugOrId,
          projectType: 'mod',
          mcVersion,
          loaderType: effectiveLoader,
          gameDir: rootDir
        }, onStatus);
        if (res?.ok && res.fileName) {
          upgraded.push({ from: cleanName, to: res.fileName });
          if (Array.isArray(res.installedDeps)) {
            res.installedDeps.forEach((dName) => depsInstalled.push(dName));
          }
          continue;
        }
      } catch (_) {}
    }

    // No compatible build found -> keep disabled so it doesn't crash the game
    if (!isDisabled && fs.existsSync(fullPath)) {
      try { fs.renameSync(fullPath, `${fullPath}.disabled`); } catch (_) {}
    }
    disabledIncompatible.push(cleanName);
  }

  // Ensure all required dependencies discovered from SHA-1 lookup are installed
  for (const depProjectId of requiredDepIds) {
    try {
      const depRes = await installModrinthProject({
        slug: depProjectId,
        projectType: 'mod',
        mcVersion,
        loaderType: effectiveLoader,
        gameDir: rootDir,
        _isDep: true
      }, onStatus);
      if (depRes?.fileName && !depRes.skipped) {
        depsInstalled.push(depRes.fileName);
      }
    } catch (_) {}
  }

  return {
    ok: true,
    mcVersion,
    effectiveLoader,
    upgraded,
    kept,
    disabledIncompatible,
    depsInstalled: Array.from(new Set(depsInstalled))
  };
}

async function buildCoopModBasket(rawInput = {}) {
  const opts = typeof rawInput === 'string' ? { gameDir: rawInput } : (rawInput || {});
  const { gameDir, instanceDir, mcVersion = '1.21.4', loaderType = 'fabric' } = opts;
  const rootDir = (instanceDir && fs.existsSync(instanceDir))
    ? instanceDir
    : (gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir());
  const modsFolder = path.join(rootDir, 'mods');
  if (!fs.existsSync(modsFolder)) {
    return { ok: true, mcVersion, loaderType, modsCount: 0, modBasket: [], basket: [] };
  }
  const meta = readModsMetaManifest(modsFolder);
  let activeJars = [];
  try {
    activeJars = fs.readdirSync(modsFolder).filter((f) => /\.jar$/i.test(f));
  } catch (_) {}

  if (!activeJars.length) {
    return { ok: true, mcVersion, loaderType, modsCount: 0, modBasket: [], basket: [] };
  }

  const fullPaths = activeJars.map((f) => path.join(modsFolder, f));
  const { byHash, fileToHash } = await lookupModrinthBySha1Map(fullPaths);

  const modBasket = [];
  for (const f of activeJars) {
    // Skip host-only tunnel mods so friends don't need to host a second tunnel
    if (/^(e4mc|world-host|worldhost)[-_]/i.test(f)) continue;
    const fp = path.join(modsFolder, f);
    const sha1 = fileToHash[fp] || '';
    const hit = sha1 ? byHash[sha1] : null;
    const primaryFile = hit?.files?.find((x) => x.primary) || hit?.files?.[0] || null;
    const mEntry = meta[f] || {};
    let sizeKB = 0;
    try { sizeKB = Math.round(fs.statSync(fp).size / 1024); } catch (_) {}

    let fallbackSlug = mEntry.projectId || mEntry.slug || '';
    if (!fallbackSlug) {
      const lower = f.toLowerCase();
      for (const [slug, prefixes] of Object.entries(KNOWN_MOD_SLUG_PREFIXES)) {
        if (prefixes.some((p) => lower.startsWith(p))) {
          fallbackSlug = slug;
          break;
        }
      }
    }

    const verifiedUrl = primaryFile?.url || '';
    modBasket.push({
      fileName: f,
      sha1,
      projectId: hit?.project_id || fallbackSlug || '',
      slug: mEntry.slug || fallbackSlug || '',
      url: verifiedUrl,
      downloadUrl: verifiedUrl,
      sizeKB
    });
  }

  // v40.7 PRO: Include small local custom skins (<64 KB PNG) so Co-op friends see each other's uploaded skins automatically
  const localSkins = [];
  try {
    const skinsDir = path.join(rootDir, 'CustomSkinLoader', 'LocalSkin', 'skins');
    if (fs.existsSync(skinsDir)) {
      for (const sf of fs.readdirSync(skinsDir)) {
        if (!/^[A-Za-z0-9_]{2,16}\.png$/i.test(sf)) continue;
        const sFull = path.join(skinsDir, sf);
        const st = fs.statSync(sFull);
        if (st.isFile() && st.size > 100 && st.size <= 65536) {
          const buf = fs.readFileSync(sFull);
          if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
            localSkins.push({ name: sf.replace(/\.png$/i, ''), base64: buf.toString('base64') });
          }
        }
        if (localSkins.length >= 8) break;
      }
    }
  } catch (_) {}

  return {
    ok: true,
    mcVersion,
    loaderType,
    modsCount: modBasket.length,
    modBasket,
    basket: modBasket,
    localSkins
  };
}

async function syncCoopModBasket({ gameDir, instanceDir, mcVersion = '1.21.4', loaderType = 'fabric', modBasket = [], localSkins = [] } = {}, onStatus) {
  const rootDir = (instanceDir && fs.existsSync(instanceDir))
    ? instanceDir
    : (gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir());
  const modsFolder = path.join(rootDir, 'mods');
  if (!fs.existsSync(modsFolder)) fs.mkdirSync(modsFolder, { recursive: true });

  // Sync any custom friend/host PNG skins included in the Co-op Room / Basket
  if (Array.isArray(localSkins) && localSkins.length > 0) {
    try {
      const skinsDir = path.join(rootDir, 'CustomSkinLoader', 'LocalSkin', 'skins');
      fs.mkdirSync(skinsDir, { recursive: true });
      for (const sk of localSkins.slice(0, 12)) {
        const cleanPlayer = String(sk?.name || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 16);
        if (!cleanPlayer || !sk?.base64 || String(sk.base64).length > 100000) continue;
        const buf = Buffer.from(String(sk.base64), 'base64');
        if (buf.length > 100 && buf.length <= 65536 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
          fs.writeFileSync(path.join(skinsDir, `${cleanPlayer}.png`), buf);
        }
      }
      configureCrackSkinSupport(rootDir);
    } catch (_) {}
  }

  const effectiveLoader = normalizeModrinthLoader(loaderType, mcVersion);
  const items = Array.isArray(modBasket) ? modBasket : [];
  if (!items.length) return { ok: true, installed: [], alreadyHad: [], failed: [], installedCount: 0, skippedCount: 0 };

  let existingJars = [];
  try {
    existingJars = fs.readdirSync(modsFolder).filter((f) => /\.jar$/i.test(f));
  } catch (_) {}
  const existingSet = new Set(existingJars.map((x) => x.toLowerCase()));

  const installed = [];
  const alreadyHad = [];
  const failed = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const cleanFile = path.basename(String(item.fileName || '')).replace(/[^A-Za-z0-9._+-]/g, '');
    if (cleanFile && existingSet.has(cleanFile.toLowerCase())) {
      alreadyHad.push(cleanFile);
      continue;
    }

    // If cached as .disabled, re-enable it immediately
    if (cleanFile) {
      const disPath = path.join(modsFolder, `${cleanFile}.disabled`);
      const enPath = path.join(modsFolder, cleanFile);
      if (fs.existsSync(disPath) && !fs.existsSync(enPath)) {
        try {
          fs.renameSync(disPath, enPath);
          alreadyHad.push(cleanFile);
          existingSet.add(cleanFile.toLowerCase());
          continue;
        } catch (_) {}
      }
    }

    onStatus?.(`📦 [${i + 1}/${items.length}] Đang đồng bộ Mod của chủ phòng: ${cleanFile || item.slug || item.projectId}...`);

    // Method 1: Direct verified CDN URL download (Strictly official Modrinth / CurseForge CDNs + SHA-1 verification)
    let downloadedDirect = false;
    const directUrl = item.url || item.downloadUrl || '';
    if (directUrl && cleanFile && /\.jar$/i.test(cleanFile)) {
      try {
        const parsed = new URL(String(directUrl));
        const allowedHosts = ['cdn.modrinth.com', 'edge.forgecdn.net', 'mediafilez.forgecdn.net'];
        if (parsed.protocol === 'https:' && allowedHosts.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))) {
          const destPath = path.join(modsFolder, cleanFile);
          await downloadFile(parsed.toString(), destPath);
          const expectedSha1 = String(item.sha1 || '').trim().toLowerCase();
          if (/^[a-f0-9]{40}$/.test(expectedSha1)) {
            const actualSha1 = crypto.createHash('sha1').update(fs.readFileSync(destPath)).digest('hex').toLowerCase();
            if (actualSha1 !== expectedSha1) {
              try { fs.unlinkSync(destPath); } catch (_) {}
              throw new Error('SHA-1 mismatch');
            }
          }
          installed.push(cleanFile);
          existingSet.add(cleanFile.toLowerCase());
          downloadedDirect = true;
        }
      } catch (_) {}
    }
    if (downloadedDirect) continue;

    // Method 2: Install via Modrinth projectId / slug
    const slugOrId = item.projectId || item.slug || '';
    if (slugOrId) {
      try {
        const r = await installModrinthProject({
          slug: slugOrId,
          projectType: 'mod',
          mcVersion,
          loaderType: effectiveLoader,
          gameDir: rootDir
        }, onStatus);
        if (r?.fileName) {
          installed.push(r.fileName);
          existingSet.add(r.fileName.toLowerCase());
          continue;
        }
      } catch (_) {}
    }

    failed.push(cleanFile || slugOrId || 'Mod không xác định');
  }

  return {
    ok: true,
    installed,
    alreadyHad,
    failed,
    installedCount: installed.length,
    skippedCount: alreadyHad.length
  };
}

function analyzeMinecraftCrash({ gameDir, instanceDir, mcVersion = '1.21.4', loaderType = 'fabric', ramGB = 4, consoleLines = [], recentLogs = '', exitCode = 0 }) {
  const numericExit = (exitCode === null || exitCode === undefined) ? 0 : Number(exitCode);
  const rootDir = (instanceDir && fs.existsSync(instanceDir))
    ? instanceDir
    : (gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir());

  let crashReportText = '';
  let crashFilePath = '';
  const crashDir = path.join(rootDir, 'crash-reports');
  if (fs.existsSync(crashDir)) {
    try {
      const files = fs.readdirSync(crashDir)
        .filter((f) => f.endsWith('.txt') || f.endsWith('.log'))
        .map((f) => {
          const full = path.join(crashDir, f);
          let mtimeMs = 0;
          try { mtimeMs = fs.statSync(full).mtimeMs; } catch (_) {}
          return { name: f, full, mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
      if (files.length > 0 && (Date.now() - files[0].mtimeMs < 15 * 60 * 1000 || numericExit !== 0)) {
        crashFilePath = files[0].full;
        crashReportText = fs.readFileSync(files[0].full, 'utf8').slice(0, 28000);
      }
    } catch (_) {}
  }

  let latestLogText = '';
  const latestLogPath = path.join(rootDir, 'logs', 'latest.log');
  if (fs.existsSync(latestLogPath)) {
    try {
      const raw = fs.readFileSync(latestLogPath, 'utf8');
      latestLogText = raw.slice(-24000);
    } catch (_) {}
  }

  const joinedConsole = recentLogs
    ? String(recentLogs)
    : (Array.isArray(consoleLines) ? consoleLines.slice(-250).join('\n') : String(consoleLines || ''));
  const combined = `${crashReportText}\n${latestLogText}\n${joinedConsole}`;
  const errorOnlyLines = combined
    .split(/\r?\n/)
    .filter((l) => /ERROR|FATAL|Exception|Error:|ModResolution|Incompatible|MixinApply|MixinTransformer|Caused by:/i.test(l))
    .join('\n');

  const causes = [];
  const actions = [];
  const addedActionKeys = new Set();
  const addAction = (act) => {
    const key = `${act.type}:${act.slug || act.fileName || act.targetRam || act.major || ''}`;
    if (addedActionKeys.has(key)) return;
    addedActionKeys.add(key);
    actions.push(act);
  };

  // List local active mods for matching offending jars
  const modsDir = path.join(rootDir, 'mods');
  const meta = readModsMetaManifest(modsDir);
  let activeMods = [];
  try {
    if (fs.existsSync(modsDir)) {
      activeMods = fs.readdirSync(modsDir).filter((f) => /\.jar$/i.test(f));
    }
  } catch (_) {}

  // 1. Check OptiFine + Sodium / Embeddium / Iris conflict
  const optifineJar = activeMods.find((f) => /optifine|optifabric/i.test(f));
  const sodiumOrIrisJar = activeMods.find((f) => /sodium|embeddium|iris|oculus/i.test(f));
  if ((optifineJar && sodiumOrIrisJar) || (/optifine/i.test(combined) && /sodium|iris|embeddium/i.test(combined))) {
    causes.push({
      severity: 'high',
      title: '⚡ Xung đột giữa OptiFine và Sodium / Iris',
      detail: `OptiFine (${optifineJar || 'OptiFine.jar'}) không thể chạy chung với bộ tối ưu đời mới (${sodiumOrIrisJar || 'Sodium/Iris'}). Bạn chỉ cần tắt OptiFine là game sẽ vào mượt ngay!`
    });
    if (optifineJar) {
      addAction({
        type: 'disable-mod',
        fileName: optifineJar,
        label: `🚫 Tắt ngay ${optifineJar} (Giữ Sodium + Iris mượt hơn)`
      });
    }
  }

  // 2. Check missing required dependencies (Fabric / Quilt / Forge / NeoForge)
  const missingSlugs = new Set();
  const reqRegexes = [
    /Install\s+([a-z0-9_-]+),\s+version/gi,
    /requires\s+(?:version\s+[^\s]+\s+of\s+)?['"]?([a-z0-9_-]{3,40})['"]?\s*,?\s*which is missing/gi,
    /Mod\s+['"]?[a-z0-9_-]+['"]?\s+requires\s+['"]?([a-z0-9_-]{3,40})['"]?/gi,
    /Missing\s+or\s+unsupported\s+mandatory\s+dependencies:\s*[\r\n]+\s*Mod ID:\s*'([a-z0-9_-]+)'/gi,
    /ModResolutionException:[\s\S]{0,400}?requires\s+([a-z0-9_-]{3,40})/gi
  ];
  for (const rx of reqRegexes) {
    let m;
    while ((m = rx.exec(combined)) !== null) {
      const rawId = String(m[1] || '').toLowerCase().trim();
      if (!rawId || ['minecraft', 'java', 'forge', 'neoforge', 'fabricloader', 'quilt_loader', 'any', 'version'].includes(rawId)) continue;
      const mapped = COMMON_MODID_TO_MODRINTH_SLUG[rawId] || rawId;
      missingSlugs.add(mapped);
    }
  }
  if (/net\/fabricmc\/fabric\/api\//i.test(combined)) {
    missingSlugs.add('fabric-api');
  }
  if (/me\/shedaniel\/autoconfig|me\/shedaniel\/clothconfig/i.test(combined)) {
    missingSlugs.add('cloth-config');
  }
  if (/dev\/architectury\//i.test(combined)) {
    missingSlugs.add('architectury-api');
  }
  if (/software\/bernie\/geckolib/i.test(combined)) {
    missingSlugs.add('geckolib');
  }

  for (const slug of missingSlugs) {
    causes.push({
      severity: 'high',
      title: `🧩 Thiếu thư viện Mod bắt buộc: "${slug.toUpperCase()}"`,
      detail: `Một trong các Mod bạn cài yêu cầu thư viện nền "${slug}" cho bản Minecraft ${mcVersion} (${loaderType.toUpperCase()}) nhưng trong thư mục mods chưa có.`
    });
    addAction({
      type: 'install-mod',
      slug,
      label: `🧩 Tự tải & cài ngay thư viện "${slug.toUpperCase()}" (1-Click)`
    });
  }

  // 3. Check OutOfMemoryError (RAM)
  if (/OutOfMemoryError|Java heap space|GC overhead limit exceeded|Direct buffer memory/i.test(combined)) {
    const nextRam = Math.min(12, Math.max(4, Number(ramGB || 3) + 2));
    causes.push({
      severity: 'high',
      title: `🧠 Tràn bộ nhớ RAM khi đang tải Game / Modpack (Đang cấp ${ramGB} GB)`,
      detail: `Minecraft bị thiếu bộ nhớ RAM (OutOfMemoryError). Bạn nên tăng RAM cấp cho game lên khoảng ${nextRam} GB để tải mượt toàn bộ Mod & Shader.`
    });
    addAction({
      type: 'increase-ram',
      targetRam: nextRam,
      label: `⚡ Tự động tăng RAM lên ${nextRam} GB ngay`
    });
  }

  // 4. Check Java Version Mismatch (UnsupportedClassVersionError)
  if (/UnsupportedClassVersionError|class file version (\d+)\.0/i.test(combined)) {
    const verMatch = combined.match(/class file version (\d+)\.0/i);
    const classMajor = verMatch ? Number(verMatch[1]) : 65;
    const neededJava = classMajor >= 69 ? 25 : (classMajor >= 65 ? 21 : (classMajor >= 61 ? 17 : 8));
    causes.push({
      severity: 'high',
      title: `☕ Phiên bản Java hiện tại không khớp (Cần Java ${neededJava} 64-bit)`,
      detail: `Minecraft ${mcVersion} hoặc Mod trong máy yêu cầu Java ${neededJava} (Class version ${classMajor}.0), nhưng Java đang chạy có phiên bản thấp hơn.`
    });
    addAction({
      type: 'install-java',
      major: neededJava,
      label: `☕ Tự tải & chuyển sang Java ${neededJava} chuẩn 64-bit`
    });
  }

  // 5. Check Incompatible Mod Version or Mixin Crash from a specific .jar
  const mentionedJars = new Set();
  for (const jarName of activeMods) {
    const mEntry = meta[jarName];
    const metaVers = Array.isArray(mEntry?.gameVersions) ? mEntry.gameVersions : [];
    const baseNoExt = jarName.replace(/\.jar$/i, '');
    if (errorOnlyLines.includes(jarName) || (baseNoExt.length > 5 && crashReportText.includes(baseNoExt))) {
      mentionedJars.add(jarName);
    }
    if (metaVers.length > 0) {
      if (!metaVers.includes(mcVersion)) {
        mentionedJars.add(jarName);
      }
    } else {
      const jarMcVer = extractMcVerFromFilename(jarName);
      if (jarMcVer && jarMcVer !== mcVersion) {
        // Ignore minor sub-version differences inside 1.21.10/1.21.11 for embedded libs like placeholder-api unless an actual crash occurred
        const isMinor21Lib = /^placeholder-api/i.test(jarName) && jarMcVer.startsWith('1.21.') && mcVersion.startsWith('1.21.');
        if (!isMinor21Lib || numericExit !== 0) {
          mentionedJars.add(jarName);
        }
      }
    }
  }

  if (/Incompatible mods found|ModResolutionException|MixinApplyError|MixinTransformerError|spongepowered\.asm\.mixin/i.test(errorOnlyLines) || mentionedJars.size > 0) {
    const jarList = Array.from(mentionedJars).slice(0, 5);
    causes.push({
      severity: 'medium',
      title: jarList.length > 0
        ? `⚠️ Phát hiện ${jarList.length} Mod lệch phiên bản hoặc xung đột Mixin (${jarList.join(', ')})`
        : `⚠️ Có Mod trong thư mục mods/ không tương thích với Minecraft ${mcVersion} (${loaderType.toUpperCase()})`,
      detail: `Một số file .jar trong thư mục mods được làm cho phiên bản Minecraft khác hoặc xung đột mã nguồn (Mixin) khi khởi động.`
    });
    addAction({
      type: 'sync-all-mods',
      label: `🔄 Tự động đồng bộ & đổi toàn bộ Mod sang đúng bản MC ${mcVersion}`
    });
    for (const badJar of jarList) {
      addAction({
        type: 'disable-mod',
        fileName: badJar,
        label: `🚫 Tắt ngay Mod nghi gây lỗi: ${badJar}`
      });
    }
  }

  // 6. Check OpenGL / GPU Driver / Shader crash
  if (/GLFW error 65542|WGL: The driver does not appear to support OpenGL|atio6axx\.dll|ig7icd64\.dll|nvoglv64\.dll|EXCEPTION_ACCESS_VIOLATION/i.test(combined)) {
    causes.push({
      severity: 'medium',
      title: '🖥️ Lỗi trình điều khiển Card đồ họa (OpenGL / Shader quá nặng)',
      detail: 'Driver card đồ họa hoặc gói Shader đang bật gặp lỗi bộ nhớ. Bạn có thể tắt tạm gói Shader hoặc đồng bộ lại bộ Mod tối ưu FPS.'
    });
  }

  // Always offer 1-Click Sync All Mods & Install Fabric API if on Fabric
  addAction({
    type: 'sync-all-mods',
    label: `🔄 Đồng bộ & Kiểm tra toàn bộ Mod theo bản ${mcVersion} (${loaderType.toUpperCase()})`
  });
  if ((loaderType === 'fabric' || loaderType === 'quilt' || (loaderType === 'optifine' && compareMcVersions(mcVersion, '1.14') >= 0)) && !activeMods.some((f) => /fabric-api/i.test(f))) {
    addAction({
      type: 'install-mod',
      slug: 'fabric-api',
      label: '🧩 Cài bổ sung thư viện nền Fabric API (Khuyên dùng)'
    });
  }

  if (causes.length === 0) {
    causes.push({
      severity: 'info',
      title: numericExit !== 0
        ? `🩺 Game vừa dừng đột ngột (Mã thoát: ${numericExit})`
        : `✅ Tất cả ${activeMods.length} Mod trong máy đều khớp chuẩn với Minecraft ${mcVersion} (${loaderType.toUpperCase()})!`,
      detail: 'Bác Sĩ BlockWay đã kiểm tra toàn bộ thư mục mods/ và nhật ký hệ thống — không phát hiện xung đột hay thiếu thư viện nào.'
    });
  }

  const rawLines = (crashReportText || latestLogText || joinedConsole)
    .split(/\r?\n/)
    .filter((l) => /Exception|Error|ModResolution|Incompatible|requires|Caused by:|Description:/i.test(l))
    .slice(0, 12)
    .join('\n');
  const rawSnippet = rawLines || combined.slice(-900);

  return {
    ok: true,
    hasCrash: numericExit !== 0 || Boolean(crashFilePath),
    exitCode: numericExit,
    mcVersion,
    loaderType,
    crashFilePath,
    reportName: crashFilePath ? path.basename(crashFilePath) : 'latest.log',
    causes,
    actions,
    rawSnippet,
    rawExcerpt: rawSnippet
  };
}

/* ---------------- 4. World Backup / Restore / Export / Import (.zip) ---------------- */
function getWorldBackupsDir(gameDir) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const dir = path.join(rootDir, 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveWorldFolderPath(rootDir, worldNameOrPath) {
  const resolvedRoot = path.resolve(rootDir);
  const raw = String(worldNameOrPath || '').trim();
  if (!raw) throw new Error('Tên thế giới không hợp lệ.');

  // Support exact directory path inside rootDir (e.g. .minecraft/saves/X or .minecraft/instances/Pack/saves/X)
  if (raw.includes('/') || raw.includes('\\')) {
    const candidate = path.resolve(raw);
    const rel = path.relative(resolvedRoot, candidate);
    if (!rel.startsWith('..') && !path.isAbsolute(rel) && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return { worldPath: candidate, cleanWorld: path.basename(candidate) };
    }
  }

  const cleanWorld = path.basename(raw);
  if (!cleanWorld) throw new Error('Tên thế giới không hợp lệ.');
  const mainWorldPath = path.join(resolvedRoot, 'saves', cleanWorld);
  if (fs.existsSync(mainWorldPath)) {
    return { worldPath: mainWorldPath, cleanWorld };
  }
  const instRoot = path.join(resolvedRoot, 'instances');
  if (fs.existsSync(instRoot)) {
    try {
      for (const d of fs.readdirSync(instRoot, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const instWorldPath = path.join(instRoot, d.name, 'saves', cleanWorld);
        if (fs.existsSync(instWorldPath)) {
          return { worldPath: instWorldPath, cleanWorld };
        }
      }
    } catch (_) {}
  }
  throw new Error(`Không tìm thấy thư mục thế giới "${cleanWorld}".`);
}

function backupLocalWorld(gameDir, worldName) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const { worldPath, cleanWorld } = resolveWorldFolderPath(rootDir, worldName);

  const backupsDir = getWorldBackupsDir(rootDir);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const safeBase = cleanWorld.replace(/[^A-Za-z0-9._ -]/g, '_');
  const zipFileName = `${safeBase}__${stamp}.zip`;
  const zipFullPath = path.join(backupsDir, zipFileName);

  const zip = openPackZip();
  zip.addLocalFolder(worldPath, cleanWorld);
  zip.writeZip(zipFullPath);

  let sizeMB = 0;
  try { sizeMB = Math.round((fs.statSync(zipFullPath).size / (1024 * 1024)) * 10) / 10; } catch (_) {}
  return {
    ok: true,
    worldName: cleanWorld,
    fileName: zipFileName,
    backupPath: zipFullPath,
    sizeMB
  };
}

function listWorldBackups(gameDir) {
  const backupsDir = getWorldBackupsDir(gameDir);
  try {
    return fs.readdirSync(backupsDir)
      .filter((f) => /\.zip$/i.test(f))
      .map((f) => {
        const full = path.join(backupsDir, f);
        let st = null;
        try { st = fs.statSync(full); } catch (_) {}
        const parts = f.replace(/\.zip$/i, '').split('__');
        const worldName = parts[0] || f.replace(/\.zip$/i, '');
        const isAuto = parts.includes('AUTO');
        const instPart = parts.find((p) => p.startsWith('INST_'));
        const instanceSlug = instPart ? instPart.slice(5) : '';
        return {
          fileName: f,
          worldName,
          worldFolder: worldName,
          isAuto,
          instanceSlug,
          fullPath: full,
          sizeMB: st ? Math.round((st.size / (1024 * 1024)) * 10) / 10 : 0,
          mtimeMs: st ? st.mtimeMs : 0,
          createdAt: st ? st.mtime.toLocaleString('vi-VN') : ''
        };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch (_) {
    return [];
  }
}

function measureDirSizeCapped(dirPath, capBytes = 1536 * 1024 * 1024) {
  let total = 0;
  const stack = [dirPath];
  while (stack.length > 0 && total <= capBytes) {
    const cur = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile()) {
        try { total += fs.statSync(full).size; } catch (_) {}
        if (total > capBytes) return total;
      }
    }
  }
  return total;
}

function autoBackupModifiedWorlds(gameDir, sinceMs, maxKeepPerWorld = 3) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const backupsDir = getWorldBackupsDir(rootDir);
  const thresholdMs = Math.max(0, (Number(sinceMs) || Date.now()) - 5000);
  const sources = [{ savesDir: path.join(rootDir, 'saves'), instSlug: '' }];
  const instRoot = path.join(rootDir, 'instances');
  if (fs.existsSync(instRoot)) {
    try {
      for (const d of fs.readdirSync(instRoot, { withFileTypes: true })) {
        if (d.isDirectory() && !d.name.startsWith('.')) {
          const sDir = path.join(instRoot, d.name, 'saves');
          if (fs.existsSync(sDir)) sources.push({ savesDir: sDir, instSlug: d.name });
        }
      }
    } catch (_) {}
  }

  const pad = (n) => String(n).padStart(2, '0');
  const backedUp = [];
  let prunedCount = 0;

  for (const src of sources) {
    if (!fs.existsSync(src.savesDir)) continue;
    let worldDirs = [];
    try { worldDirs = fs.readdirSync(src.savesDir, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch (_) {}
    for (const wd of worldDirs) {
      const worldPath = path.join(src.savesDir, wd.name);
      const levelDat = path.join(worldPath, 'level.dat');
      if (!fs.existsSync(levelDat)) continue;
      let latestMtime = 0;
      try { latestMtime = fs.statSync(levelDat).mtimeMs || 0; } catch (_) {}
      if (latestMtime < thresholdMs) continue;

      // Skip worlds > 1.5 GB so background auto-backup never stalls disk
      const approxBytes = measureDirSizeCapped(worldPath, 1536 * 1024 * 1024);
      if (approxBytes > 1536 * 1024 * 1024) continue;

      try {
        const now = new Date();
        const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const safeBase = wd.name.replace(/[^A-Za-z0-9._ -]/g, '_') || 'World';
        const safeSlug = src.instSlug ? src.instSlug.replace(/[^A-Za-z0-9._-]/g, '_') : '';
        const instSuffix = safeSlug ? `__INST_${safeSlug}` : '';
        const zipFileName = `${safeBase}__${stamp}__AUTO${instSuffix}.zip`;
        const zipFullPath = path.join(backupsDir, zipFileName);

        const zip = openPackZip();
        zip.addLocalFolder(worldPath, wd.name);
        zip.writeZip(zipFullPath);

        let sizeMB = 0;
        try { sizeMB = Math.round((fs.statSync(zipFullPath).size / (1024 * 1024)) * 10) / 10; } catch (_) {}
        backedUp.push({ worldName: wd.name, fileName: zipFileName, sizeMB, instanceSlug: safeSlug });

        // Prune older AUTO backups for this exact world beyond maxKeepPerWorld
        const existingAuto = fs.readdirSync(backupsDir)
          .filter((f) => {
            if (!/\.zip$/i.test(f)) return false;
            const p = f.replace(/\.zip$/i, '').split('__');
            const pInst = (p.find((x) => x.startsWith('INST_')) || '').slice(5);
            return p[0] === safeBase && p.includes('AUTO') && pInst === safeSlug;
          })
          .map((f) => {
            const fp = path.join(backupsDir, f);
            let mt = 0;
            try { mt = fs.statSync(fp).mtimeMs || 0; } catch (_) {}
            return { f, fp, mt };
          })
          .sort((a, b) => b.mt - a.mt);

        for (let idx = Math.max(1, maxKeepPerWorld); idx < existingAuto.length; idx++) {
          try {
            fs.unlinkSync(existingAuto[idx].fp);
            prunedCount++;
          } catch (_) {}
        }
      } catch (_) {}
    }
  }

  return { ok: true, backedUp, prunedCount };
}

function extractWorldZipToSaves(zipFilePath, savesDir, preferredName = '') {
  if (!fs.existsSync(savesDir)) fs.mkdirSync(savesDir, { recursive: true });
  const zip = openPackZip(zipFilePath);
  const entries = zip.getEntries();
  const levelEntry = entries.find((e) => !e.isDirectory && /(^|\/)level\.dat$/i.test(e.entryName.replace(/\\/g, '/')));
  if (!levelEntry) {
    throw new Error('File .zip này không chứa dữ liệu thế giới Minecraft (thiếu file level.dat).');
  }
  const norm = levelEntry.entryName.replace(/\\/g, '/');
  const slashIdx = norm.lastIndexOf('/');
  const prefix = slashIdx > 0 ? norm.slice(0, slashIdx) : '';
  const rawFolder = preferredName || (prefix ? path.basename(prefix) : path.basename(zipFilePath, path.extname(zipFilePath)));
  const cleanFolder = rawFolder.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Imported_World';
  const targetWorldDir = path.join(savesDir, cleanFolder);
  if (!fs.existsSync(targetWorldDir)) fs.mkdirSync(targetWorldDir, { recursive: true });
  extractZipPrefix(zip, prefix, targetWorldDir);
  return { ok: true, worldName: cleanFolder, restoredFolder: cleanFolder, importedFolder: cleanFolder, worldPath: targetWorldDir };
}

function restoreWorldBackup(gameDir, backupFileName) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const backupsDir = getWorldBackupsDir(rootDir);
  const cleanZip = path.basename(String(backupFileName || ''));
  const zipPath = path.join(backupsDir, cleanZip);
  if (!fs.existsSync(zipPath)) throw new Error('Không tìm thấy file sao lưu này.');
  const parts = cleanZip.replace(/\.zip$/i, '').split('__');
  const worldName = parts[0] || 'Restored_World';
  const instPart = parts.find((p) => p.startsWith('INST_'));
  let savesDir = path.join(rootDir, 'saves');
  if (instPart) {
    const cleanInst = path.basename(instPart.slice(5));
    const candidateInstDir = path.join(rootDir, 'instances', cleanInst);
    if (cleanInst && fs.existsSync(candidateInstDir)) {
      savesDir = path.join(candidateInstDir, 'saves');
    }
  }
  return extractWorldZipToSaves(zipPath, savesDir, worldName);
}

function deleteWorldBackup(gameDir, backupFileName) {
  const backupsDir = getWorldBackupsDir(gameDir);
  const zipPath = path.join(backupsDir, path.basename(String(backupFileName || '')));
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  return { ok: true };
}

function exportWorldZip(gameDir, worldName, destZipPath) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const { worldPath, cleanWorld } = resolveWorldFolderPath(rootDir, worldName);
  const zip = openPackZip();
  zip.addLocalFolder(worldPath, cleanWorld);
  zip.writeZip(destZipPath);
  return { ok: true, destZipPath };
}

function importWorldZip(gameDir, srcZipPath) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  if (!srcZipPath || !fs.existsSync(srcZipPath)) throw new Error('Không tìm thấy file .zip thế giới.');
  const savesDir = path.join(rootDir, 'saves');
  let baseName = path.basename(srcZipPath, path.extname(srcZipPath)).replace(/__\d{8}-\d{6}$/, '');
  if (fs.existsSync(path.join(savesDir, baseName))) {
    baseName = `${baseName}_Moi`;
  }
  return extractWorldZipToSaves(srcZipPath, savesDir, baseName);
}

/* ---------------- 5. In-Launcher Screenshots Gallery ---------------- */
function listLocalScreenshots(gameDir) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const candidateDirs = [path.join(rootDir, 'screenshots')];
  const dirLabels = new Map([[candidateDirs[0], '']]);
  const instRoot = path.join(rootDir, 'instances');
  if (fs.existsSync(instRoot)) {
    try {
      for (const d of fs.readdirSync(instRoot, { withFileTypes: true })) {
        if (d.isDirectory()) {
          const sDir = path.join(instRoot, d.name, 'screenshots');
          if (fs.existsSync(sDir)) {
            candidateDirs.push(sDir);
            // v40.8: show which Modpack the screenshot came from in the gallery / lightbox
            dirLabels.set(sDir, `📦 ${d.name}`);
          }
        }
      }
    } catch (_) {}
  }

  const { pathToFileURL } = require('url');
  const results = [];
  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!/\.(png|jpg|jpeg)$/i.test(f)) continue;
        const full = path.join(dir, f);
        let st = null;
        try { st = fs.statSync(full); } catch (_) {}
        if (!st || !st.isFile()) continue;
        let safeFileUrl = `file:///${full.replace(/\\/g, '/')}`;
        try { safeFileUrl = pathToFileURL(full).href; } catch (_) {}
        results.push({
          name: f,
          fullPath: full,
          fileUrl: safeFileUrl,
          instanceName: dirLabels.get(dir) || '',
          sizeKB: Math.max(1, Math.round(st.size / 1024)),
          mtimeMs: st.mtimeMs || 0,
          dateLabel: st.mtime.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        });
      }
    } catch (_) {}
  }

  return results.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 80);
}

function deleteLocalScreenshot(gameDir, fullOrFileName) {
  const rootDir = path.resolve(gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir());
  const candidate = path.isAbsolute(String(fullOrFileName || ''))
    ? path.resolve(String(fullOrFileName))
    : path.resolve(rootDir, 'screenshots', path.basename(String(fullOrFileName || '')));
  const rel = path.relative(rootDir, candidate);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Đường dẫn ảnh chụp không hợp lệ.');
  }
  if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  return { ok: true };
}

/* ---------------- 6. Quick 1-Click SkyBlock & OneBlock Island Builder ---------------- */
async function equipPackInstanceIsland({ gameDir, instanceDir, mode = 'skyblock' } = {}, onProgress) {
  const emit = progressEmitter(onProgress);
  const targetDir = assertInsideInstances(gameDir, instanceDir);
  const meta = readInstanceMeta(targetDir);
  if (!meta || !meta.mcVersion) throw new Error('Không đọc được cấu hình phiên bản của gói này.');
  const cleanMode = mode === 'oneblock' ? 'oneblock' : 'skyblock';
  emit('island', `🏝️ Đang tích hợp bộ sinh Đảo ${cleanMode === 'oneblock' ? 'OneBlock' : 'SkyBlock'} cho MC ${meta.mcVersion}...`, 25);
  const eq = await equipInstanceWithIslandGenerator({
    instanceDir: targetDir,
    mcVersion: meta.mcVersion,
    loader: meta.loader || 'fabric',
    mode: cleanMode
  }, emit);
  if (!eq.installed.length) {
    throw new Error(`Chưa tìm thấy bản Đảo ${cleanMode === 'oneblock' ? 'OneBlock' : 'SkyBlock'} tự động cho MC ${meta.mcVersion}. Hãy thử chọn bản 1.21.11, 1.21.4, 1.20.1 hoặc 26.2!`);
  }
  const nextLoader = eq.effectiveLoader || meta.loader || 'fabric';
  const nextLoaderVer = (!meta.loaderVersion && nextLoader !== 'vanilla')
    ? await resolveLatestLoaderVersion(meta.mcVersion, nextLoader)
    : (meta.loaderVersion || '');
  const updatedMeta = {
    ...meta,
    loader: nextLoader,
    loaderVersion: nextLoaderVer,
    modCount: countFilesIn(path.join(targetDir, 'mods'), /\.jar$/i),
    autoIslandMode: cleanMode
  };
  writeInstanceMeta(targetDir, updatedMeta);
  emit('done', `✅ Đã bơm thành công ${eq.installed.length} gói sinh Đảo ${cleanMode === 'oneblock' ? 'OneBlock' : 'SkyBlock'}!`, 100);
  return { ok: true, installed: eq.installed, instance: { ...updatedMeta, dir: targetDir } };
}

async function installQuickIslandPack({ gameDir, mode = 'skyblock', mcVersion = '' } = {}, onProgress) {
  const emit = progressEmitter(onProgress);
  const root = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const cleanMode = mode === 'oneblock' ? 'oneblock' : 'skyblock';
  const supported = ['26.3', '26.2', '1.21.11', '1.21.4', '1.21.1', '1.20.4', '1.20.1'];
  const targetMc = supported.includes(String(mcVersion || '').trim()) ? String(mcVersion).trim() : '1.21.11';
  const packTitle = cleanMode === 'oneblock'
    ? `Một Ô Đất OneBlock (${targetMc})`
    : `Đảo Sinh Tồn SkyBlock (${targetMc})`;

  const instanceDir = createInstanceDir(root, packTitle);
  try {
    emit('start', `🏝️ Đang khởi tạo gói chơi đơn "${packTitle}"...`, 8);
    // Install lightweight FPS optimization (Fabric API + Sodium + Lithium)
    for (const slug of ['fabric-api', 'sodium', 'lithium']) {
      try {
        emit('fps', `⚡ Đang trang bị tối ưu mượt mà (${slug})...`, 35);
        await installModrinthProject({ slug, projectType: 'mod', mcVersion: targetMc, loaderType: 'fabric', gameDir: instanceDir, _isDep: true }, () => {});
      } catch (_) {}
    }

    const eq = await equipInstanceWithIslandGenerator({
      instanceDir,
      mcVersion: targetMc,
      loader: 'fabric',
      mode: cleanMode
    }, emit);
    if (!eq.installed.length) {
      throw new Error(`Không tải được bộ sinh Đảo ${cleanMode} từ Modrinth. Vui lòng kiểm tra kết nối mạng.`);
    }

    const loaderVersion = await resolveLatestLoaderVersion(targetMc, 'fabric');
    const modCount = countFilesIn(path.join(instanceDir, 'mods'), /\.jar$/i);
    const meta = {
      name: packTitle,
      source: 'modrinth',
      projectId: cleanMode === 'oneblock' ? 'simply-oneblock' : 'standard-skyblock',
      versionId: targetMc,
      versionName: `${cleanMode === 'oneblock' ? 'OneBlock' : 'SkyBlock'} Chuẩn ${targetMc}`,
      iconUrl: '',
      pageUrl: cleanMode === 'oneblock' ? 'https://modrinth.com/datapack/simply-oneblock' : 'https://modrinth.com/datapack/standard-skyblock',
      installedAt: Date.now(),
      mcVersion: targetMc,
      loader: 'fabric',
      loaderVersion,
      modCount,
      ramRecommendedGB: 4,
      manualPending: [],
      datapackFile: '',
      autoIslandMode: cleanMode
    };
    writeInstanceMeta(instanceDir, meta);
    emit('done', `✅ Đã tạo xong "${packTitle}"! Vào Chơi Đơn → Tạo Thế Giới Mới là ra ngay Đảo Bay!`, 100);
    return { ok: true, instance: { ...meta, dir: instanceDir }, manual: [] };
  } catch (err) {
    try { fs.rmSync(instanceDir, { recursive: true, force: true }); } catch (_) {}
    throw err;
  }
}

/* ---------------- 7. v40.4 / v40.9 PRO: 1-Click .mrpack Exporter & Smart Disk Cleaner ---------------- */
const SAFE_CONFIG_EXT_RX = /\.(?:json|json5|toml|cfg|conf|properties|txt|snbt|yml|yaml|ini)$/i;
const UNSAFE_CONFIG_PATH_RX = /(?:token|secret|account|auth|session|password|apikey|credential|oauth|customskinloader|realms|microsoft|xbox)/i;

function collectSafeConfigFiles(rootDir, maxTotalBytes = 8 * 1024 * 1024) {
  const cfgRoot = path.join(rootDir, 'config');
  if (!fs.existsSync(cfgRoot)) return [];
  const collected = [];
  let totalBytes = 0;
  const walk = (dir, depth) => {
    if (depth > 4 || totalBytes >= maxTotalBytes) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const ent of entries) {
      if (totalBytes >= maxTotalBytes) break;
      if (ent.name.startsWith('.')) continue;
      const full = path.join(dir, ent.name);
      const rel = path.relative(cfgRoot, full).replace(/\\/g, '/');
      if (UNSAFE_CONFIG_PATH_RX.test(rel)) continue;
      if (ent.isDirectory()) {
        walk(full, depth + 1);
      } else if (ent.isFile() && SAFE_CONFIG_EXT_RX.test(ent.name)) {
        try {
          const st = fs.statSync(full);
          if (st.size > 0 && st.size <= 512 * 1024 && totalBytes + st.size <= maxTotalBytes) {
            collected.push({ relPath: `config/${rel}`, fullPath: full, size: st.size });
            totalBytes += st.size;
          }
        } catch (_) {}
      }
    }
  };
  walk(cfgRoot, 0);
  return collected;
}

function extractSafeShareableOptionsTxt(rootDir) {
  const optsPath = path.join(rootDir, 'options.txt');
  if (!fs.existsSync(optsPath)) return '';
  try {
    const raw = fs.readFileSync(optsPath, 'utf8');
    const safeRx = /^(?:key_|soundCategory_|fov:|gamma:|guiScale:|toggleSprint:|toggleCrouch:|autoJump:|bobView:|entityShadows:|particles:|clouds:|renderDistance:|simulationDistance:)/;
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && safeRx.test(l) && !UNSAFE_CONFIG_PATH_RX.test(l));
    return lines.length > 0 ? `${lines.join('\n')}\n` : '';
  } catch (_) {
    return '';
  }
}

function previewExportTarget({ gameDir, targetDir } = {}) {
  const rootDir = (targetDir && fs.existsSync(targetDir))
    ? targetDir
    : (gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir());
  const instMeta = readInstanceMeta(rootDir) || null;
  const countValid = (rel, rx) => {
    const dir = path.join(rootDir, rel);
    if (!fs.existsSync(dir)) return { count: 0, proprietary: [] };
    let count = 0;
    const proprietary = [];
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!rx.test(f) || f === 'AetherSkinSync.zip' || f === 'BlockWay-Fullbright-Gamma.zip') continue;
        const full = path.join(dir, f);
        if (!fs.statSync(full).isFile()) continue;
        if (rel === 'mods' && isProprietaryOptifineFile(f)) {
          proprietary.push(f);
          continue;
        }
        count++;
      }
    } catch (_) {}
    return { count, proprietary };
  };
  const modsInfo = countValid('mods', /\.jar$/i);
  const shadersInfo = countValid('shaderpacks', /\.zip$/i);
  const rpInfo = countValid('resourcepacks', /\.zip$/i);
  const cfgFiles = collectSafeConfigFiles(rootDir);
  const hasKeybinds = Boolean(extractSafeShareableOptionsTxt(rootDir));
  const hasServersDat = fs.existsSync(path.join(rootDir, 'servers.dat'));
  return {
    ok: true,
    rootDir,
    isInstance: Boolean(instMeta),
    packName: instMeta?.name || '',
    mcVersion: instMeta?.mcVersion || '',
    loader: instMeta?.loader || '',
    modsCount: modsInfo.count,
    shadersCount: shadersInfo.count,
    resourcePacksCount: rpInfo.count,
    configsCount: cfgFiles.length,
    hasKeybinds,
    hasServersDat,
    proprietaryFiles: modsInfo.proprietary
  };
}

async function exportTargetAsMrpack({
  gameDir,
  targetDir,
  packName = '',
  mcVersion = '1.21.4',
  loaderType = 'fabric',
  loaderVersion = '',
  includeMods = true,
  includeShadersAndPacks = true,
  includeConfigs = true,
  includeKeybinds = false,
  includeServersDat = false,
  destFilePath
} = {}, onStatus) {
  const rootDir = (targetDir && fs.existsSync(targetDir))
    ? targetDir
    : (gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir());
  if (!destFilePath) throw new Error('Chưa chọn đường dẫn lưu gói .mrpack.');

  // Read instance metadata if exporting a Modpack instance
  const instMeta = readInstanceMeta(rootDir) || {};
  const finalMc = String(instMeta.mcVersion || mcVersion || '1.21.4').trim();
  const rawLoader = String(instMeta.loader || loaderType || 'fabric').toLowerCase();
  const finalLoader = ['fabric', 'quilt', 'forge', 'neoforge', 'vanilla'].includes(rawLoader) ? rawLoader : 'fabric';
  let finalLoaderVer = String(instMeta.loaderVersion || loaderVersion || '').trim();
  if (!finalLoaderVer && finalLoader !== 'vanilla') {
    try { finalLoaderVer = await resolveLatestLoaderVersion(finalMc, finalLoader); } catch (_) {}
  }

  const subFolders = [];
  if (includeMods !== false) subFolders.push({ rel: 'mods', rx: /\.jar$/i });
  if (includeShadersAndPacks !== false) {
    subFolders.push({ rel: 'shaderpacks', rx: /\.zip$/i });
    subFolders.push({ rel: 'resourcepacks', rx: /\.zip$/i });
  }

  const candidateFiles = [];
  const skippedProprietary = [];
  for (const sf of subFolders) {
    const dir = path.join(rootDir, sf.rel);
    if (!fs.existsSync(dir)) continue;
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!sf.rx.test(f) || f === 'AetherSkinSync.zip' || f === 'BlockWay-Fullbright-Gamma.zip') continue;
        if (sf.rel === 'mods' && isProprietaryOptifineFile(f)) {
          skippedProprietary.push(f);
          continue;
        }
        const full = path.join(dir, f);
        const st = fs.statSync(full);
        if (st.isFile() && st.size > 0) {
          candidateFiles.push({ relFolder: sf.rel, fileName: f, fullPath: full, size: st.size });
        }
      }
    } catch (_) {}
  }

  if (candidateFiles.length === 0) {
    throw new Error('Thư mục hiện tại chưa có Mod (.jar), Shader hay Resource Pack nào đang bật để đóng gói .mrpack!');
  }

  onStatus?.(`🔎 Đang tra cứu mã băm SHA-1 của ${candidateFiles.length} gói trên Modrinth Official...`);
  let byHash = {};
  let fileToHash = {};
  try {
    const lookup = await lookupModrinthBySha1Map(candidateFiles.map((c) => c.fullPath));
    byHash = lookup.byHash || {};
    fileToHash = lookup.fileToHash || {};
  } catch (_) {}

  const zip = openPackZip();
  const indexFiles = [];
  let embeddedOverridesCount = 0;

  for (const item of candidateFiles) {
    const buf = fs.readFileSync(item.fullPath);
    const sha1 = fileToHash[item.fullPath] || crypto.createHash('sha1').update(buf).digest('hex');
    const sha512 = crypto.createHash('sha512').update(buf).digest('hex');
    const hit = byHash[sha1];
    const matchedFile = hit?.files?.find((x) => x.hashes?.sha1 === sha1) || hit?.files?.find((x) => x.primary) || hit?.files?.[0];
    const dlUrl = matchedFile?.url || '';

    if (dlUrl && dlUrl.startsWith('https://cdn.modrinth.com/')) {
      indexFiles.push({
        path: `${item.relFolder}/${item.fileName}`,
        hashes: { sha1, sha512 },
        env: { client: 'required', server: item.relFolder === 'mods' ? 'optional' : 'unsupported' },
        downloads: [dlUrl],
        fileSize: item.size
      });
    } else if (item.size <= 50 * 1024 * 1024) {
      zip.addFile(`overrides/${item.relFolder}/${item.fileName}`, buf);
      embeddedOverridesCount++;
    }
  }

  // Include safe mod configs (never auth tokens or private IPs by default!)
  let includedConfigsCount = 0;
  if (includeConfigs !== false) {
    const safeCfgs = collectSafeConfigFiles(rootDir);
    for (const cfg of safeCfgs) {
      try {
        zip.addFile(`overrides/${cfg.relPath}`, fs.readFileSync(cfg.fullPath));
        includedConfigsCount++;
      } catch (_) {}
    }
  } else if (includeShadersAndPacks !== false) {
    const irisCfg = path.join(rootDir, 'config', 'iris.properties');
    if (fs.existsSync(irisCfg)) {
      try { zip.addFile('overrides/config/iris.properties', fs.readFileSync(irisCfg)); } catch (_) {}
    }
  }

  if (includeKeybinds === true) {
    const safeOpts = extractSafeShareableOptionsTxt(rootDir);
    if (safeOpts) {
      try { zip.addFile('overrides/options.txt', Buffer.from(safeOpts, 'utf8')); } catch (_) {}
    }
  }

  // v40.9 privacy protection: servers.dat is ONLY included when the user explicitly opts in!
  if (includeServersDat === true) {
    const serversDat = path.join(rootDir, 'servers.dat');
    if (fs.existsSync(serversDat)) {
      try { zip.addFile('overrides/servers.dat', fs.readFileSync(serversDat)); } catch (_) {}
    }
  }

  const deps = { minecraft: finalMc };
  if (finalLoader === 'fabric' && finalLoaderVer) deps['fabric-loader'] = finalLoaderVer;
  else if (finalLoader === 'quilt' && finalLoaderVer) deps['quilt-loader'] = finalLoaderVer;
  else if (finalLoader === 'forge' && finalLoaderVer) deps.forge = finalLoaderVer;
  else if (finalLoader === 'neoforge' && finalLoaderVer) deps.neoforge = finalLoaderVer;

  const cleanPackTitle = String(packName || instMeta.name || `BlockWay Pack ${finalMc}`).trim();
  const mrIndex = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: '1.0.0',
    name: cleanPackTitle,
    summary: `Đóng gói tự động từ BlockWay Launcher (${candidateFiles.length} gói • MC ${finalMc} • ${finalLoader.toUpperCase()})`,
    files: indexFiles,
    dependencies: deps
  };

  zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(mrIndex, null, 2), 'utf8'));
  onStatus?.(`📦 Đang nén gói "${cleanPackTitle}" ra tệp .mrpack...`);
  zip.writeZip(destFilePath);

  let sizeMB = 0;
  try { sizeMB = Math.round((fs.statSync(destFilePath).size / (1024 * 1024)) * 100) / 100; } catch (_) {}
  return {
    ok: true,
    filePath: destFilePath,
    packName: cleanPackTitle,
    mcVersion: finalMc,
    loader: finalLoader,
    totalItems: candidateFiles.length,
    modrinthLinkedCount: indexFiles.length,
    overridesCount: embeddedOverridesCount,
    includedConfigsCount,
    skippedProprietary,
    sizeMB
  };
}

function collectSafeJunkTargets(gameDir, { includeDisabledMods = false } = {}) {
  const rootDir = path.resolve(gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir());
  const rootsToScan = [rootDir];
  const instRoot = path.join(rootDir, 'instances');
  if (fs.existsSync(instRoot)) {
    try {
      for (const d of fs.readdirSync(instRoot, { withFileTypes: true })) {
        if (d.isDirectory() && !d.name.startsWith('.')) {
          rootsToScan.push(path.join(instRoot, d.name));
        }
      }
    } catch (_) {}
  }

  const categories = {
    logs: { bytes: 0, count: 0, paths: [] },
    crashReports: { bytes: 0, count: 0, paths: [] },
    tempCaches: { bytes: 0, count: 0, paths: [] },
    disabledMods: { bytes: 0, count: 0, paths: [] }
  };

  const addFileTarget = (catKey, fp) => {
    try {
      const st = fs.statSync(fp);
      if (st.isFile()) {
        categories[catKey].bytes += st.size;
        categories[catKey].count += 1;
        categories[catKey].paths.push({ path: fp, isDir: false, bytes: st.size });
      }
    } catch (_) {}
  };

  const addDirContentsTarget = (catKey, dirPath) => {
    if (!fs.existsSync(dirPath)) return;
    try {
      const stack = [dirPath];
      let dirBytes = 0;
      let fileCount = 0;
      while (stack.length > 0) {
        const cur = stack.pop();
        for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
          const full = path.join(cur, e.name);
          if (e.isDirectory()) stack.push(full);
          else if (e.isFile()) {
            try {
              dirBytes += fs.statSync(full).size;
              fileCount += 1;
            } catch (_) {}
          }
        }
      }
      if (fileCount > 0) {
        categories[catKey].bytes += dirBytes;
        categories[catKey].count += fileCount;
        categories[catKey].paths.push({ path: dirPath, isDir: true, bytes: dirBytes, count: fileCount });
      }
    } catch (_) {}
  };

  for (const base of rootsToScan) {
    // 1. Old archived logs (*.log.gz, debug*.log*, launcher_log*.txt) — keep small latest.log intact
    const logsDir = path.join(base, 'logs');
    if (fs.existsSync(logsDir)) {
      try {
        for (const f of fs.readdirSync(logsDir)) {
          const fp = path.join(logsDir, f);
          if (/\.gz$/i.test(f) || /^debug/i.test(f) || /\.log\.\d+$/i.test(f)) {
            addFileTarget('logs', fp);
          } else if (f.toLowerCase() === 'latest.log') {
            try {
              if (fs.statSync(fp).size > 5 * 1024 * 1024) addFileTarget('logs', fp);
            } catch (_) {}
          }
        }
      } catch (_) {}
    }
    try {
      for (const f of fs.readdirSync(base)) {
        if (/^launcher_log.*\.txt$/i.test(f) || /^hs_err_pid\d+\.log$/i.test(f)) {
          addFileTarget('logs', path.join(base, f));
        }
      }
    } catch (_) {}

    // 2. Crash reports
    const crashDir = path.join(base, 'crash-reports');
    if (fs.existsSync(crashDir)) {
      try {
        for (const f of fs.readdirSync(crashDir)) {
          addFileTarget('crashReports', path.join(crashDir, f));
        }
      } catch (_) {}
    }

    // 3. Safe regenerable caches (.fabric/remappedJars, .quilt/remappedJars, webcache, *.tmp, *.part)
    addDirContentsTarget('tempCaches', path.join(base, '.fabric', 'remappedJars'));
    addDirContentsTarget('tempCaches', path.join(base, '.quilt', 'remappedJars'));
    addDirContentsTarget('tempCaches', path.join(base, 'webcache'));
    addDirContentsTarget('tempCaches', path.join(base, 'webcache2'));
    addDirContentsTarget('tempCaches', path.join(base, 'downloads'));

    for (const sub of ['', 'mods', 'shaderpacks', 'resourcepacks']) {
      const d = sub ? path.join(base, sub) : base;
      if (!fs.existsSync(d)) continue;
      try {
        for (const f of fs.readdirSync(d)) {
          if (/\.(tmp|part|crdownload)$/i.test(f)) {
            addFileTarget('tempCaches', path.join(d, f));
          }
        }
      } catch (_) {}
    }

    // 4. Optional: cached .jar.disabled files
    if (includeDisabledMods) {
      const mDir = path.join(base, 'mods');
      if (fs.existsSync(mDir)) {
        try {
          for (const f of fs.readdirSync(mDir)) {
            if (/\.jar\.disabled$/i.test(f)) {
              addFileTarget('disabledMods', path.join(mDir, f));
            }
          }
        } catch (_) {}
      }
    }
  }

  const totalBytes = Object.values(categories).reduce((acc, c) => acc + c.bytes, 0);
  const totalCount = Object.values(categories).reduce((acc, c) => acc + c.count, 0);
  return { rootDir, categories, totalBytes, totalCount };
}

function scanMinecraftJunk(gameDir, opts = {}) {
  const { categories, totalBytes, totalCount } = collectSafeJunkTargets(gameDir, opts);
  const toMB = (b) => Math.round((b / (1024 * 1024)) * 100) / 100;
  return {
    ok: true,
    totalBytes,
    totalMB: toMB(totalBytes),
    totalCount,
    breakdown: {
      logsMB: toMB(categories.logs.bytes),
      logsCount: categories.logs.count,
      crashMB: toMB(categories.crashReports.bytes),
      crashCount: categories.crashReports.count,
      cacheMB: toMB(categories.tempCaches.bytes),
      cacheCount: categories.tempCaches.count,
      disabledModsMB: toMB(categories.disabledMods.bytes),
      disabledModsCount: categories.disabledMods.count
    }
  };
}

function cleanMinecraftJunk(gameDir, opts = {}) {
  const { rootDir, categories } = collectSafeJunkTargets(gameDir, opts);
  let freedBytes = 0;
  let deletedItems = 0;

  for (const cat of Object.values(categories)) {
    for (const item of cat.paths) {
      const rel = path.relative(rootDir, item.path);
      if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
      // Extra safety guard: NEVER touch saves, backups, screenshots, versions, assets, libraries (even inside instances/*)
      const relSegs = rel.split(/[\\/]/).map((s) => s.toLowerCase());
      if (relSegs.some((seg) => ['saves', 'backups', 'screenshots', 'versions', 'assets', 'libraries'].includes(seg))) continue;
      try {
        if (item.isDir) {
          fs.rmSync(item.path, { recursive: true, force: true });
        } else if (fs.existsSync(item.path)) {
          fs.unlinkSync(item.path);
        }
        freedBytes += item.bytes;
        deletedItems += (item.count || 1);
      } catch (_) {}
    }
  }

  return {
    ok: true,
    freedBytes,
    freedMB: Math.round((freedBytes / (1024 * 1024)) * 100) / 100,
    deletedItems
  };
}

/* ============================================================================
   v40.6 PRO — 5 NÂNG CẤP SIÊU XỊN:
   1) Trình Gỡ Trùng Phím Tắt Modpack & Tinh Chỉnh Cấu Hình Ngoài Game (options.txt)
   2) Quản Lý Cập Nhật Mod / Shader / Resource Pack 1-Click & Hoàn Tác Bản Cũ
   3) Kho Bản Đồ Xây Sẵn & Datapack 1-Click (Tạo Map Chơi Ngay hoặc Gắn Vào Map)
   4) Combo Chơi Chung Nâng Cao: Đàm Thoại Trong Game (Voice Chat) & Tổ Đội Sinh Tồn
   5) Cố Vấn RAM Tự Động & Chống Giật Khựng (Generational ZGC / Tuned G1GC)
   ============================================================================ */

const KEY_CODE_VI_LABELS = {
  'key.mouse.left': 'Chuột Trái',
  'key.mouse.right': 'Chuột Phải',
  'key.mouse.middle': 'Chuột Giữa',
  'key.mouse.4': 'Chuột Phụ 4',
  'key.mouse.5': 'Chuột Phụ 5',
  'key.keyboard.space': 'Phím Cách (Space)',
  'key.keyboard.left.shift': 'Shift Trái',
  'key.keyboard.right.shift': 'Shift Phải',
  'key.keyboard.left.control': 'Ctrl Trái',
  'key.keyboard.right.control': 'Ctrl Phải',
  'key.keyboard.left.alt': 'Alt Trái',
  'key.keyboard.right.alt': 'Alt Phải',
  'key.keyboard.tab': 'Tab',
  'key.keyboard.caps.lock': 'Caps Lock',
  'key.keyboard.escape': 'Esc',
  'key.keyboard.enter': 'Enter',
  'key.keyboard.backspace': 'Backspace',
  'key.keyboard.grave.accent': 'Phím ` (~)',
  'key.keyboard.left.bracket': 'Phím [',
  'key.keyboard.right.bracket': 'Phím ]',
  'key.keyboard.backslash': 'Phím \\',
  'key.keyboard.semicolon': 'Phím ;',
  'key.keyboard.apostrophe': 'Phím \'',
  'key.keyboard.comma': 'Phím ,',
  'key.keyboard.period': 'Phím .',
  'key.keyboard.slash': 'Phím /',
  'key.keyboard.minus': 'Phím -',
  'key.keyboard.equal': 'Phím =',
  'key.keyboard.insert': 'Insert',
  'key.keyboard.delete': 'Delete',
  'key.keyboard.home': 'Home',
  'key.keyboard.end': 'End',
  'key.keyboard.page.up': 'Page Up',
  'key.keyboard.page.down': 'Page Down'
};

function formatKeyCodeVi(rawCode) {
  const full = String(rawCode || '').trim();
  if (!full || full === 'key.keyboard.unknown' || full === '0' || full.startsWith('key.keyboard.unknown:')) return 'Chưa gán';
  const [code, modRaw] = full.split(':');
  const modPrefix = modRaw && modRaw !== 'NONE'
    ? `${modRaw.replace(/CONTROL/i, 'Ctrl').replace(/SHIFT/i, 'Shift').replace(/ALT/i, 'Alt')} + `
    : '';
  if (KEY_CODE_VI_LABELS[code]) return `${modPrefix}${KEY_CODE_VI_LABELS[code]}`;
  if (code.startsWith('key.keyboard.kp.')) {
    return `${modPrefix}Numpad ${code.slice(16).toUpperCase()}`;
  }
  if (code.startsWith('key.keyboard.')) {
    const rest = code.slice(13);
    if (/^[a-z0-9]$/i.test(rest)) return `${modPrefix}Phím ${rest.toUpperCase()}`;
    if (/^f\d+$/i.test(rest)) return `${modPrefix}${rest.toUpperCase()}`;
    return `${modPrefix}Phím ${rest.replace(/\./g, ' ').toUpperCase()}`;
  }
  return full;
}

const KEY_ACTION_VI_LABELS = {
  'key.attack': '⚔️ Đánh / Đập khối',
  'key.use': '🧱 Đặt khối / Tương tác',
  'key.forward': '⬆️ Tiến lên',
  'key.back': '⬇️ Lùi lại',
  'key.left': '⬅️ Sang trái',
  'key.right': '➡️ Sang phải',
  'key.jump': '🦘 Nhảy',
  'key.sneak': '🧎 Ngồi rón rén (Sneak)',
  'key.sprint': '🏃 Chạy nhanh (Sprint)',
  'key.inventory': '🎒 Mở Túi đồ',
  'key.drop': '📤 Vứt vật phẩm',
  'key.swapOffhand': '🛡️ Đổi tay phụ (Khiên/Đuốc)',
  'key.pickItem': '🎯 Chọn khối đang nhìn',
  'key.chat': '💬 Mở khung Chat',
  'key.command': '⌨️ Nhập lệnh (/)',
  'key.playerlist': '📋 Danh sách người chơi',
  'key.screenshot': '📸 Chụp ảnh màn hình',
  'key.togglePerspective': '🎥 Đổi góc nhìn (F5)',
  'key.fullscreen': '🖥️ Toàn màn hình (F11)',
  'key.advancements': '🏆 Mở Thành tựu',
  'key.saveToolbarActivator': '🎨 Lưu thanh công cụ Sáng tạo',
  'key.loadToolbarActivator': '🎨 Tải thanh công cụ Sáng tạo',
  'key.socialInteractions': '👥 Tương tác xã hội',
  'key.spectatorOutlines': '👁️ Viền người chơi (Khán giả)',
  'key.voice_chat': '🎙️ Cài đặt Mic (Voice Chat)',
  'key.push_to_talk': '🎙️ Giữ để nói (Push-to-Talk)',
  'key.mute_microphone': '🔇 Tắt/Bật Mic nhanh',
  'key.disable_voice_chat': '🔕 Tắt âm thanh Voice Chat',
  'key.voice_chat_group': '👥 Nhóm đàm thoại (Voice Group)',
  'key.whisper': '🤫 Thì thầm gần (Whisper)',
  'zoomify.key.zoom': '🔭 Phóng to ống nhòm (Zoomify)',
  'wi_zoom.zoom': '🔭 Phóng to ống nhòm (WI Zoom)',
  'key.logical_zoom.zoom': '🔭 Phóng to ống nhòm (Zoom)',
  'iris.keybind.reload': '✨ Tải lại Shader (Iris)',
  'iris.keybind.shaderPackSelection': '✨ Chọn gói Shader (Iris)',
  'iris.keybind.toggleShaders': '✨ Bật/Tắt nhanh Shader'
};

function describeKeyActionVi(actionId) {
  const id = String(actionId || '').trim();
  if (KEY_ACTION_VI_LABELS[id]) return KEY_ACTION_VI_LABELS[id];
  if (/^key\.hotbar\.(\d+)$/.test(id)) {
    return `🔢 Ô thanh nóng số ${RegExp.$1}`;
  }
  const lower = id.toLowerCase();
  if (lower.includes('xaero') && lower.includes('waypoint')) return '📍 Tạo/Xem điểm đánh dấu (Xaero Minimap)';
  if (lower.includes('xaero') && (lower.includes('map') || lower.includes('open'))) return '🗺️ Mở Bản đồ thế giới (Xaero Map)';
  if (lower.includes('journeymap')) return '🗺️ Bản đồ JourneyMap';
  if (lower.includes('voice')) return `🎙️ Voice Chat (${id.split('.').pop().replace(/_/g, ' ')})`;
  if (lower.includes('zoom')) return `🔭 Phóng to tầm nhìn (${id.split('.').pop()})`;
  if (lower.includes('vein') || lower.includes('ultimine')) return '⛏️ Đào quặng theo mạch (VeinMiner)';
  if (lower.includes('backpack')) return '🎒 Mở Ba lô đeo lưng (Backpack)';
  if (lower.includes('waystone')) return '🗿 Dịch chuyển Waystones';
  if (lower.includes('carry')) return '👐 Bê rương / Bế sinh vật (Carry On)';
  if (lower.includes('jade') || lower.includes('waila') || lower.includes('wthit')) return '🔍 Bảng thông tin khối (Jade/WTHIT)';
  if (lower.includes('jei') || lower.includes('rei') || lower.includes('emi')) return `📖 Công thức chế tạo (${id.split('.').pop().replace(/_/g, ' ')})`;

  const parts = id.replace(/^key[._]/i, '').split(/[.:/]/).filter(Boolean);
  if (parts.length >= 2) {
    const modTag = parts[0].toUpperCase();
    const actName = parts.slice(1).join(' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
    return `🧩 [${modTag}] ${actName}`;
  }
  return id.replace(/^key\./, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._-]+/g, ' ');
}

function getKeyActionPriority(actionId) {
  const id = String(actionId || '');
  if (/^key\.(attack|use|forward|back|left|right|jump|sneak|sprint|inventory|drop|swapOffhand|pickItem|chat|command|playerlist|screenshot|togglePerspective|fullscreen|hotbar\.\d+)$/.test(id)) {
    return 100; // Core Vanilla controls — never move
  }
  if (/^(key\.saveToolbarActivator|key\.loadToolbarActivator|key\.socialInteractions|key\.spectatorOutlines|key\.stream)/.test(id)) {
    return 15; // Rarely-used Vanilla secondary keys (often collide with C, X, P!)
  }
  const lower = id.toLowerCase();
  if (/voice_chat$|push_to_talk|zoom|open_map|world_map|backpack|ultimine|veinminer|toggleshaders/.test(lower)) {
    return 82; // Primary daily mod hotkeys
  }
  if (id.startsWith('key.')) return 60;
  return 45;
}

const SAFE_REASSIGN_KEY_POOL = [
  'key.keyboard.y',
  'key.keyboard.u',
  'key.keyboard.i',
  'key.keyboard.o',
  'key.keyboard.p',
  'key.keyboard.h',
  'key.keyboard.j',
  'key.keyboard.k',
  'key.keyboard.n',
  'key.keyboard.g',
  'key.keyboard.b',
  'key.keyboard.r',
  'key.keyboard.z',
  'key.keyboard.left.bracket',
  'key.keyboard.right.bracket',
  'key.keyboard.semicolon',
  'key.keyboard.apostrophe',
  'key.keyboard.comma',
  'key.keyboard.period',
  'key.keyboard.backslash',
  'key.keyboard.grave.accent',
  'key.keyboard.f6',
  'key.keyboard.f7',
  'key.keyboard.f8',
  'key.keyboard.f9',
  'key.keyboard.f10',
  'key.keyboard.insert',
  'key.keyboard.home',
  'key.keyboard.end',
  'key.keyboard.page.up',
  'key.keyboard.page.down',
  'key.keyboard.kp.1',
  'key.keyboard.kp.2',
  'key.keyboard.kp.3',
  'key.keyboard.kp.4',
  'key.keyboard.kp.5',
  'key.keyboard.kp.6',
  'key.keyboard.kp.7',
  'key.keyboard.kp.8',
  'key.keyboard.kp.9'
];

function resolveTweakerDir(gameDir, instanceDir = '') {
  if (instanceDir && String(instanceDir).trim() && fs.existsSync(String(instanceDir).trim())) {
    return path.resolve(String(instanceDir).trim());
  }
  return path.resolve(gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir());
}

function normalizeKeyCodeForConflict(code) {
  return String(code || '').trim().toLowerCase().replace(/:none$/, '');
}

function readGameOptionsAndKeybinds({ gameDir, instanceDir = '' } = {}) {
  const targetDir = resolveTweakerDir(gameDir, instanceDir);
  const optsPath = path.join(targetDir, 'options.txt');
  const exists = fs.existsSync(optsPath);
  const rawContent = exists ? fs.readFileSync(optsPath, 'utf8') : '';
  const kv = {};
  const keybinds = [];

  for (const line of rawContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(':')) continue;
    const idx = trimmed.indexOf(':');
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    kv[k] = v;
    if (k.startsWith('key_')) {
      const actionId = k.slice(4);
      // Skip MC 1.21.9+ / 26.x F3+<key> debug chord sub-keys and Spectator-only hotbar so they never false-collide with normal gameplay keys
      if (actionId.startsWith('key.debug.') || actionId === 'key.spectatorHotbar') continue;
      keybinds.push({
        rawOptionKey: k,
        actionId,
        label: describeKeyActionVi(actionId),
        keyCode: v,
        keyLabel: formatKeyCodeVi(v),
        priority: getKeyActionPriority(actionId),
        isUnbound: !v || v === 'key.keyboard.unknown' || v === '0' || v.startsWith('key.keyboard.unknown:')
      });
    }
  }

  // Normalize FOV: legacy MC <=1.18 stores float (-1.0..1.0 where 0.0 = 70, 1.0 = 110); MC 1.19+ stores degrees (30..110)
  let fovDegrees = 70;
  let fovIsLegacyFloat = false;
  if (kv.fov !== undefined) {
    const fNum = parseFloat(kv.fov);
    if (!Number.isNaN(fNum)) {
      if (kv.fov.includes('.') && fNum >= -1.5 && fNum <= 2.5) {
        fovIsLegacyFloat = true;
        fovDegrees = Math.round(70 + fNum * 40);
      } else {
        fovDegrees = Math.round(fNum);
      }
    }
  }
  fovDegrees = Math.max(30, Math.min(110, fovDegrees));

  const gammaVal = kv.gamma !== undefined && !Number.isNaN(parseFloat(kv.gamma)) ? parseFloat(kv.gamma) : 1.0;
  const equipped = getEquippedAddonsState(targetDir);
  const hasFullbrightPack = (equipped.activeResourcePacks || []).some((p) => /fullbright/i.test(p));

  const renderDistance = Math.max(2, Math.min(32, parseInt(kv.renderDistance ?? '12', 10) || 12));
  const simulationDistance = Math.max(5, Math.min(32, parseInt(kv.simulationDistance ?? '8', 10) || 8));
  const maxFps = Math.max(10, Math.min(260, parseInt(kv.maxFps ?? '120', 10) || 120));
  const enableVsync = kv.enableVsync !== undefined ? kv.enableVsync === 'true' : false;
  const autoJump = kv.autoJump !== undefined ? kv.autoJump === 'true' : false;
  const rawMouseInput = kv.rawMouseInput !== undefined ? kv.rawMouseInput === 'true' : true;
  const masterVolFloat = kv.soundCategory_master !== undefined && !Number.isNaN(parseFloat(kv.soundCategory_master))
    ? parseFloat(kv.soundCategory_master)
    : 1.0;
  const masterVolume = Math.max(0, Math.min(100, Math.round(masterVolFloat * 100)));

  // Group bound keys to detect conflicts (skip unbound & harmless context-distinct command '/')
  // v40.8: Forge/NeoForge store "key.keyboard.r:NONE" — ":NONE" means no modifier, so it collides with plain "key.keyboard.r"
  const byKey = new Map();
  for (const kb of keybinds) {
    if (kb.isUnbound) continue;
    const normCode = normalizeKeyCodeForConflict(kb.keyCode);
    if (!byKey.has(normCode)) byKey.set(normCode, []);
    byKey.get(normCode).push(kb);
  }

  const conflicts = [];
  for (const [normCode, list] of byKey.entries()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => b.priority - a.priority);
    conflicts.push({
      keyCode: sorted[0].keyCode,
      keyLabel: sorted[0].keyLabel,
      count: sorted.length,
      actions: sorted
    });
  }
  conflicts.sort((a, b) => b.count - a.count);

  return {
    ok: true,
    targetDir,
    optionsExists: exists,
    fovIsLegacyFloat,
    settings: {
      fov: fovDegrees,
      gamma: Math.round(gammaVal * 100) / 100,
      fullbright: gammaVal >= 5.0 || hasFullbrightPack,
      hasFullbrightPack,
      renderDistance,
      simulationDistance,
      maxFps,
      enableVsync,
      autoJump,
      rawMouseInput,
      masterVolume,
      lang: kv.lang || 'vi_vn'
    },
    totalKeybinds: keybinds.length,
    conflictsCount: conflicts.length,
    conflicts,
    keybinds,
    availableKeyChoices: [
      { code: 'key.keyboard.unknown', label: '🚫 Bỏ gán phím (Tắt)' },
      ...SAFE_REASSIGN_KEY_POOL.map((c) => ({ code: c, label: formatKeyCodeVi(c) })),
      { code: 'key.keyboard.v', label: 'Phím V' },
      { code: 'key.keyboard.c', label: 'Phím C' },
      { code: 'key.keyboard.x', label: 'Phím X' },
      { code: 'key.keyboard.m', label: 'Phím M' },
      { code: 'key.keyboard.f', label: 'Phím F' },
      { code: 'key.keyboard.left.alt', label: 'Alt Trái' },
      { code: 'key.mouse.4', label: 'Chuột Phụ 4' },
      { code: 'key.mouse.5', label: 'Chuột Phụ 5' }
    ]
  };
}

function saveGameOptionsAndKeybinds({ gameDir, instanceDir = '', settings = {}, keyChanges = {} } = {}) {
  const targetDir = resolveTweakerDir(gameDir, instanceDir);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  const optsPath = path.join(targetDir, 'options.txt');
  let content = fs.existsSync(optsPath) ? fs.readFileSync(optsPath, 'utf8') : '';
  const nl = content.includes('\r\n') ? '\r\n' : '\n';

  // Detect if existing options.txt uses legacy float FOV
  let useLegacyFov = false;
  const fovMatch = content.match(/^fov:(.*?)\r?$/m);
  if (fovMatch) {
    const rawFov = fovMatch[1].trim();
    const num = parseFloat(rawFov);
    if (rawFov.includes('.') && !Number.isNaN(num) && num >= -1.5 && num <= 2.5) {
      useLegacyFov = true;
    }
  }

  const upsertLine = (key, val) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(`^${escaped}:(.*?)(\\r?)$`, 'm');
    if (rx.test(content)) {
      content = content.replace(rx, `${key}:${val}$2`);
    } else {
      content += (content && !content.endsWith('\n') ? nl : '') + `${key}:${val}${nl}`;
    }
  };

  if (settings && typeof settings === 'object') {
    if (settings.fov !== undefined) {
      const deg = Math.max(30, Math.min(110, Math.round(Number(settings.fov) || 70)));
      upsertLine('fov', useLegacyFov ? ((deg - 70) / 40).toFixed(2) : String(deg));
    }
    if (settings.gamma !== undefined) {
      const g = Math.max(0, Math.min(16, Number(settings.gamma)));
      if (!Number.isNaN(g)) upsertLine('gamma', g.toFixed(1));
    } else if (settings.fullbright !== undefined) {
      upsertLine('gamma', settings.fullbright ? '12.0' : '1.0');
    }
    if (settings.renderDistance !== undefined) {
      upsertLine('renderDistance', String(Math.max(2, Math.min(32, Math.round(Number(settings.renderDistance) || 12)))));
    }
    if (settings.simulationDistance !== undefined) {
      upsertLine('simulationDistance', String(Math.max(5, Math.min(32, Math.round(Number(settings.simulationDistance) || 8)))));
    }
    if (settings.maxFps !== undefined) {
      upsertLine('maxFps', String(Math.max(10, Math.min(260, Math.round(Number(settings.maxFps) || 120)))));
    }
    if (settings.enableVsync !== undefined) {
      upsertLine('enableVsync', settings.enableVsync ? 'true' : 'false');
    }
    if (settings.autoJump !== undefined) {
      upsertLine('autoJump', settings.autoJump ? 'true' : 'false');
    }
    if (settings.rawMouseInput !== undefined) {
      upsertLine('rawMouseInput', settings.rawMouseInput ? 'true' : 'false');
    }
    if (settings.masterVolume !== undefined) {
      const v = Math.max(0, Math.min(100, Number(settings.masterVolume))) / 100;
      upsertLine('soundCategory_master', v.toFixed(2));
    }
  }

  let updatedKeysCount = 0;
  if (keyChanges && typeof keyChanges === 'object') {
    for (const [rawKey, newCode] of Object.entries(keyChanges)) {
      const optKey = rawKey.startsWith('key_') ? rawKey : `key_${rawKey}`;
      const cleanCode = String(newCode || '').trim();
      if (!cleanCode) continue;
      upsertLine(optKey, cleanCode);
      updatedKeysCount++;
    }
  }

  fs.writeFileSync(optsPath, content, 'utf8');
  return { ok: true, targetDir, updatedKeysCount, state: readGameOptionsAndKeybinds({ gameDir: targetDir }) };
}

function autoResolveKeybindConflicts({ gameDir, instanceDir = '' } = {}) {
  const current = readGameOptionsAndKeybinds({ gameDir, instanceDir });
  if (!current.conflicts.length) {
    return { ok: true, resolvedCount: 0, changes: [], state: current };
  }

  const usedKeys = new Set(
    current.keybinds
      .filter((k) => !k.isUnbound)
      .map((k) => normalizeKeyCodeForConflict(k.keyCode))
  );

  const keyChanges = {};
  const changes = [];

  for (const conflict of current.conflicts) {
    // Keep the highest-priority action on the original key, reassign all lower-priority actions
    const [, ...losers] = conflict.actions;
    for (const loser of losers) {
      // Never forcibly unbind core vanilla movement if somehow duplicated; skip if priority >= 100
      if (loser.priority >= 100) continue;
      const freeKey = SAFE_REASSIGN_KEY_POOL.find((candidate) => !usedKeys.has(normalizeKeyCodeForConflict(candidate)));
      const assigned = freeKey || 'key.keyboard.unknown';
      if (assigned !== 'key.keyboard.unknown') {
        usedKeys.add(normalizeKeyCodeForConflict(assigned));
      }
      // Keep Forge/NeoForge "<key>:<MODIFIER>" format so the mod loader still parses the binding
      const usesModifierFormat = /^key\.[a-z]+\.[^:]+:[a-z_]+$/i.test(String(loser.keyCode || ''));
      const finalValue = usesModifierFormat ? `${assigned}:NONE` : assigned;
      keyChanges[loser.rawOptionKey] = finalValue;
      changes.push({
        actionId: loser.actionId,
        label: loser.label,
        fromKey: loser.keyCode,
        fromLabel: loser.keyLabel,
        toKey: assigned,
        toLabel: formatKeyCodeVi(assigned)
      });
    }
  }

  const saved = saveGameOptionsAndKeybinds({
    gameDir: current.targetDir,
    keyChanges
  });

  return {
    ok: true,
    resolvedCount: changes.length,
    changes,
    state: saved.state
  };
}

async function toggleFullbrightPack({ gameDir, instanceDir = '', mcVersion = '1.21.4', enable = true } = {}, onStatus) {
  const targetDir = resolveTweakerDir(gameDir, instanceDir);
  saveGameOptionsAndKeybinds({
    gameDir: targetDir,
    settings: { gamma: enable ? 12.0 : 1.0 }
  });

  const rpDir = path.join(targetDir, 'resourcepacks');
  if (!fs.existsSync(rpDir)) fs.mkdirSync(rpDir, { recursive: true });

  let existingFb = '';
  try {
    existingFb = fs.readdirSync(rpDir).find((f) => /fullbright/i.test(f) && /\.zip$/i.test(f)) || '';
  } catch (_) {}

  if (enable) {
    if (existingFb) {
      equipResourcePackInGame(targetDir, existingFb, true);
    } else {
      try {
        onStatus?.('💡 Đang tải gói Sáng Hang Động (Fullbright UB) chuẩn cho Minecraft...');
        const r = await installModrinthProject({
          slug: 'fullbright-ub',
          projectType: 'resourcepack',
          mcVersion,
          loaderType: 'vanilla',
          gameDir: targetDir
        }, onStatus);
        if (r?.fileName) existingFb = r.fileName;
      } catch (_) {}
    }
  } else {
    try {
      for (const f of fs.readdirSync(rpDir)) {
        if (/fullbright/i.test(f) && /\.zip$/i.test(f)) {
          equipResourcePackInGame(targetDir, f, false);
        }
      }
    } catch (_) {}
  }

  return {
    ok: true,
    enabled: Boolean(enable),
    packFileName: existingFb,
    state: readGameOptionsAndKeybinds({ gameDir: targetDir })
  };
}

/* ---------------- Upgrade 2: Smart Addon Updater & Safe Rollback ---------------- */
function getAddonRollbackDir(folderPath) {
  return path.join(folderPath, '.blockway-rollback');
}

function readAddonRollbackManifest(folderPath) {
  try {
    const p = path.join(getAddonRollbackDir(folderPath), 'manifest.json');
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (j && typeof j === 'object') return j;
    }
  } catch (_) {}
  return {};
}

function writeAddonRollbackManifest(folderPath, manifestObj) {
  try {
    const dir = getAddonRollbackDir(folderPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifestObj || {}, null, 2), 'utf8');
  } catch (_) {}
}

async function checkLocalAddonsUpdates({
  gameDir,
  instanceDir = '',
  folderType = 'mods',
  mcVersion = '1.21.4',
  loaderType = 'fabric'
} = {}) {
  const rootDir = resolveTweakerDir(gameDir, instanceDir);
  const safeFolder = ['mods', 'shaderpacks', 'resourcepacks'].includes(folderType) ? folderType : 'mods';
  const dir = path.join(rootDir, safeFolder);
  if (!fs.existsSync(dir)) {
    return { ok: true, updatesCount: 0, rollbackCount: 0, itemsMap: {} };
  }

  const files = fs.readdirSync(dir).filter(
    (f) => /\.(jar|zip)(\.disabled)?$/i.test(f) && f !== 'AetherSkinSync.zip' && f !== 'zz-blockway-auto-island-preset.jar'
  );
  const rollbackManifest = readAddonRollbackManifest(dir);
  const itemsMap = {};
  let rollbackCount = 0;

  for (const f of files) {
    const cleanName = f.replace(/\.disabled$/i, '');
    const rb = rollbackManifest[cleanName];
    const hasRbFile = Boolean(rb?.previousFileName && fs.existsSync(path.join(getAddonRollbackDir(dir), rb.previousFileName)));
    if (hasRbFile) rollbackCount++;
    itemsMap[cleanName] = {
      hasUpdate: false,
      canRollback: hasRbFile,
      previousFileName: hasRbFile ? rb.previousFileName : '',
      previousVersion: hasRbFile ? (rb.previousVersion || '') : ''
    };
  }

  if (!files.length) {
    return { ok: true, updatesCount: 0, rollbackCount, itemsMap };
  }

  const fullPaths = files.map((f) => path.join(dir, f));
  const { byHash, fileToHash } = await lookupModrinthBySha1Map(fullPaths);
  const hashes = Object.values(fileToHash).filter(Boolean);
  if (!hashes.length) {
    return { ok: true, updatesCount: 0, rollbackCount, itemsMap };
  }

  const effectiveLoader = normalizeModrinthLoader(loaderType, mcVersion);
  let loadersForUpdate = [effectiveLoader];
  if (safeFolder === 'mods') {
    if (effectiveLoader === 'quilt') loadersForUpdate = ['quilt', 'fabric'];
    else loadersForUpdate = [effectiveLoader];
  } else if (safeFolder === 'shaderpacks') {
    loadersForUpdate = ['iris', 'optifine', 'canvas'];
  } else {
    loadersForUpdate = ['minecraft'];
  }

  let updateMap = {};
  try {
    updateMap = await postModrinthJson('/v2/version_files/update', {
      hashes,
      algorithm: 'sha1',
      loaders: loadersForUpdate,
      game_versions: [mcVersion]
    });
  } catch (_) {
    updateMap = {};
  }

  let updatesCount = 0;
  for (const f of files) {
    const cleanName = f.replace(/\.disabled$/i, '');
    const full = path.join(dir, f);
    const curSha1 = fileToHash[full];
    if (!curSha1) continue;
    const curVerObj = byHash[curSha1];
    const latestVerObj = updateMap?.[curSha1];
    if (!latestVerObj || !Array.isArray(latestVerObj.files) || !latestVerObj.files.length) continue;

    const primaryFile = latestVerObj.files.find((x) => x.primary) || latestVerObj.files[0];
    const latestSha1 = String(primaryFile?.hashes?.sha1 || '').toLowerCase();
    if (!latestSha1 || latestSha1 === curSha1.toLowerCase()) continue;
    if (curVerObj?.id && latestVerObj.id === curVerObj.id) continue;
    if (curVerObj?.date_published && latestVerObj.date_published) {
      if (new Date(latestVerObj.date_published).getTime() <= new Date(curVerObj.date_published).getTime()) continue;
    }

    updatesCount++;
    itemsMap[cleanName] = {
      ...(itemsMap[cleanName] || {}),
      hasUpdate: true,
      projectId: latestVerObj.project_id || curVerObj?.project_id || '',
      currentVersion: curVerObj?.version_number || '',
      latestVersion: latestVerObj.version_number || latestVerObj.name || 'Mới',
      latestFileName: primaryFile.filename,
      downloadUrl: primaryFile.url,
      latestSha1,
      gameVersions: latestVerObj.game_versions || [mcVersion]
    };
  }

  return {
    ok: true,
    updatesCount,
    rollbackCount,
    itemsMap
  };
}

async function updateLocalAddons({
  gameDir,
  instanceDir = '',
  folderType = 'mods',
  fileNames = [],
  mcVersion = '1.21.4',
  loaderType = 'fabric'
} = {}, onStatus) {
  const rootDir = resolveTweakerDir(gameDir, instanceDir);
  const safeFolder = ['mods', 'shaderpacks', 'resourcepacks'].includes(folderType) ? folderType : 'mods';
  const dir = path.join(rootDir, safeFolder);
  if (!fs.existsSync(dir)) return { ok: true, updated: [], failed: [] };

  const checkRes = await checkLocalAddonsUpdates({
    gameDir: rootDir,
    folderType: safeFolder,
    mcVersion,
    loaderType
  });

  const targetSet = Array.isArray(fileNames) && fileNames.length > 0
    ? new Set(fileNames.map((n) => path.basename(String(n)).replace(/\.disabled$/i, '')))
    : null;

  const candidates = Object.entries(checkRes.itemsMap || {}).filter(([cleanName, info]) => {
    if (!info?.hasUpdate || !info.downloadUrl || !info.latestFileName) return false;
    return targetSet ? targetSet.has(cleanName) : true;
  });

  if (!candidates.length) {
    return { ok: true, updated: [], failed: [] };
  }

  const rbDir = getAddonRollbackDir(dir);
  if (!fs.existsSync(rbDir)) fs.mkdirSync(rbDir, { recursive: true });
  const rbManifest = readAddonRollbackManifest(dir);
  const modsMeta = safeFolder === 'mods' ? readModsMetaManifest(dir) : null;
  const equippedBefore = getEquippedAddonsState(rootDir);

  const updated = [];
  const failed = [];

  for (let i = 0; i < candidates.length; i++) {
    const [oldCleanName, info] = candidates[i];
    const enabledOldPath = path.join(dir, oldCleanName);
    const disabledOldPath = path.join(dir, `${oldCleanName}.disabled`);
    const wasDisabled = !fs.existsSync(enabledOldPath) && fs.existsSync(disabledOldPath);
    const actualOldPath = wasDisabled ? disabledOldPath : enabledOldPath;
    if (!fs.existsSync(actualOldPath)) continue;

    const safeNewClean = path.basename(info.latestFileName);
    const finalNewName = wasDisabled ? `${safeNewClean}.disabled` : safeNewClean;
    const finalNewPath = path.join(dir, finalNewName);
    const tmpDownloadPath = path.join(rbDir, `.dl-${Date.now()}-${safeNewClean}`);

    try {
      const parsedUrl = new URL(String(info.downloadUrl));
      if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname.endsWith('modrinth.com')) {
        throw new Error('Nguồn tải không hợp lệ');
      }
      onStatus?.(`⬆️ [${i + 1}/${candidates.length}] Đang cập nhật ${oldCleanName} → ${safeNewClean}...`);
      await downloadVerified([parsedUrl.toString()], tmpDownloadPath, { sha1: info.latestSha1 });

      // Remove previous rollback backup for this same chain if any so disk stays clean
      const prevRb = rbManifest[oldCleanName];
      if (prevRb?.previousFileName && prevRb.previousFileName !== oldCleanName) {
        try { fs.rmSync(path.join(rbDir, prevRb.previousFileName), { force: true }); } catch (_) {}
      }
      delete rbManifest[oldCleanName];

      // Move current file into .blockway-rollback/
      const rbBackupPath = path.join(rbDir, oldCleanName);
      fs.copyFileSync(actualOldPath, rbBackupPath);
      try { fs.unlinkSync(actualOldPath); } catch (_) {}

      fs.renameSync(tmpDownloadPath, finalNewPath);

      rbManifest[safeNewClean] = {
        previousFileName: oldCleanName,
        previousVersion: info.currentVersion || '',
        updatedVersion: info.latestVersion || '',
        wasDisabled,
        updatedAt: Date.now()
      };

      if (modsMeta) {
        const prevMeta = modsMeta[oldCleanName] || {};
        delete modsMeta[oldCleanName];
        modsMeta[safeNewClean] = {
          ...prevMeta,
          projectId: info.projectId || prevMeta.projectId || '',
          mcVersion,
          gameVersions: info.gameVersions || [mcVersion],
          loader: loaderType === 'vanilla' ? 'fabric' : loaderType,
          updatedAt: Date.now()
        };
      }

      if (!wasDisabled && safeNewClean !== oldCleanName) {
        if (safeFolder === 'shaderpacks' && equippedBefore.activeShader === oldCleanName) {
          equipShaderInGame(rootDir, safeNewClean);
        } else if (safeFolder === 'resourcepacks' && equippedBefore.activeResourcePacks.includes(oldCleanName)) {
          equipResourcePackInGame(rootDir, oldCleanName, false);
          equipResourcePackInGame(rootDir, safeNewClean, true);
        }
      }

      updated.push({ from: oldCleanName, to: safeNewClean, version: info.latestVersion });
    } catch (err) {
      try { if (fs.existsSync(tmpDownloadPath)) fs.unlinkSync(tmpDownloadPath); } catch (_) {}
      failed.push({ fileName: oldCleanName, error: err.message });
    }
  }

  writeAddonRollbackManifest(dir, rbManifest);
  if (modsMeta) writeModsMetaManifest(dir, modsMeta);

  return {
    ok: true,
    updated,
    failed,
    updatedCount: updated.length
  };
}

function rollbackLocalAddon({ gameDir, instanceDir = '', folderType = 'mods', fileName } = {}) {
  const rootDir = resolveTweakerDir(gameDir, instanceDir);
  const safeFolder = ['mods', 'shaderpacks', 'resourcepacks'].includes(folderType) ? folderType : 'mods';
  const dir = path.join(rootDir, safeFolder);
  const cleanCurrent = path.basename(String(fileName || '')).replace(/\.disabled$/i, '');
  if (!cleanCurrent || !fs.existsSync(dir)) {
    return { ok: false, error: 'Không tìm thấy gói cần hoàn tác.' };
  }

  const rbDir = getAddonRollbackDir(dir);
  const rbManifest = readAddonRollbackManifest(dir);
  const entry = rbManifest[cleanCurrent];
  if (!entry || !entry.previousFileName) {
    return { ok: false, error: 'Gói này chưa có bản lưu cũ để hoàn tác.' };
  }

  const backupPath = path.join(rbDir, path.basename(entry.previousFileName));
  if (!fs.existsSync(backupPath)) {
    delete rbManifest[cleanCurrent];
    writeAddonRollbackManifest(dir, rbManifest);
    return { ok: false, error: 'Bản lưu cũ đã bị dọn khỏi ổ cứng.' };
  }

  const curEnabledPath = path.join(dir, cleanCurrent);
  const curDisabledPath = path.join(dir, `${cleanCurrent}.disabled`);
  const isCurrentlyDisabled = !fs.existsSync(curEnabledPath) && fs.existsSync(curDisabledPath);
  const restoredDiskName = isCurrentlyDisabled ? `${entry.previousFileName}.disabled` : entry.previousFileName;
  const restoredPath = path.join(dir, restoredDiskName);

  const equippedBefore = getEquippedAddonsState(rootDir);

  fs.copyFileSync(backupPath, restoredPath);
  if (restoredPath !== curEnabledPath && fs.existsSync(curEnabledPath)) {
    try { fs.unlinkSync(curEnabledPath); } catch (_) {}
  }
  if (restoredPath !== curDisabledPath && fs.existsSync(curDisabledPath)) {
    try { fs.unlinkSync(curDisabledPath); } catch (_) {}
  }
  try { fs.unlinkSync(backupPath); } catch (_) {}

  delete rbManifest[cleanCurrent];
  writeAddonRollbackManifest(dir, rbManifest);

  if (!isCurrentlyDisabled && entry.previousFileName !== cleanCurrent) {
    if (safeFolder === 'shaderpacks' && equippedBefore.activeShader === cleanCurrent) {
      equipShaderInGame(rootDir, entry.previousFileName);
    } else if (safeFolder === 'resourcepacks' && equippedBefore.activeResourcePacks.includes(cleanCurrent)) {
      equipResourcePackInGame(rootDir, cleanCurrent, false);
      equipResourcePackInGame(rootDir, entry.previousFileName, true);
    }
  }

  return {
    ok: true,
    restoredFrom: cleanCurrent,
    restoredTo: entry.previousFileName
  };
}

/* ---------------- Upgrade 3: World & Datapack 1-Click Store ---------------- */
const WORLD_STORE_CATEGORY_PRESETS = {
  all: { queries: [''], categories: [] },
  adventure: { queries: [''], categories: ['adventure'] },
  parkour: { queries: ['parkour', 'minigame'], categories: [] },
  horror: { queries: ['horror', 'creepy'], categories: [] },
  island: { queries: ['skyblock', 'oneblock'], categories: [] },
  worldgen: { queries: [''], categories: ['worldgen'] },
  qol: { queries: [''], categories: ['game-mechanics', 'utility'] }
};

async function searchWorldAndDatapackStore({
  query = '',
  category = 'all',
  mcVersion = '',
  sortBy = 'downloads',
  offset = 0,
  limit = 24
} = {}) {
  const preset = WORLD_STORE_CATEGORY_PRESETS[category] || WORLD_STORE_CATEGORY_PRESETS.all;
  const userQuery = String(query || '').trim();
  const safeLimit = Math.max(8, Math.min(48, Number(limit) || 24));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeSort = ['downloads', 'follows', 'updated', 'newest', 'relevance'].includes(sortBy)
    ? sortBy
    : (userQuery ? 'relevance' : 'downloads');

  const buildFacets = (includeVer) => {
    const f = [['project_type:datapack']];
    if (includeVer && mcVersion) f.push([`versions:${mcVersion}`]);
    if (!userQuery && Array.isArray(preset.categories) && preset.categories.length) {
      f.push(preset.categories.map((c) => `categories:${c}`));
    }
    return f;
  };

  const queryList = userQuery ? [userQuery] : (preset.queries || ['']);
  const runQueries = async (includeVer) => {
    const perLimit = queryList.length > 1 ? Math.ceil(safeLimit / queryList.length) + 4 : safeLimit;
    const responses = await Promise.all(
      queryList.map((qStr) => fetchJson(
        `https://api.modrinth.com/v2/search?query=${encodeURIComponent(qStr)}&limit=${perLimit}&offset=${safeOffset}&index=${safeSort}&facets=${encodeURIComponent(JSON.stringify(buildFacets(includeVer)))}`
      ).catch(() => ({ hits: [], total_hits: 0 })))
    );
    const seen = new Set();
    const mergedHits = [];
    let totalHits = 0;
    for (const r of responses) {
      totalHits += Number(r?.total_hits) || 0;
      for (const h of r?.hits || []) {
        if (!h?.project_id || seen.has(h.project_id)) continue;
        seen.add(h.project_id);
        mergedHits.push(h);
      }
    }
    if (queryList.length > 1) {
      mergedHits.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    }
    return { hits: mergedHits.slice(0, safeLimit), total_hits: totalHits };
  };

  let res = await runQueries(Boolean(mcVersion));
  if ((!res?.hits || res.hits.length < 4) && mcVersion && safeOffset === 0) {
    const broader = await runQueries(false);
    if ((broader?.hits?.length || 0) > (res?.hits?.length || 0)) {
      res = broader;
    }
  }

  const items = (res?.hits || []).map((h) => ({
    source: 'modrinth',
    projectId: h.project_id,
    slug: h.slug,
    title: h.title,
    description: h.description || '',
    iconUrl: h.icon_url || '',
    bannerUrl: h.featured_gallery || (Array.isArray(h.gallery) && h.gallery[0]) || '',
    downloads: h.downloads || 0,
    follows: h.follows || 0,
    author: h.author || 'Creator',
    categories: (h.categories || []).slice(0, 10),
    versions: (h.versions || []).filter((v) => /^\d/.test(v)).sort((a, b) => compareMcVersions(b, a)),
    pageUrl: `https://modrinth.com/datapack/${h.slug}`
  }));

  // Optionally blend CurseForge Worlds when user configured a CurseForge API key
  if (getCurseForgeApiKey() && safeOffset === 0) {
    try {
      const cfRes = await searchCurseForgePacks({
        query: userQuery || (category === 'parkour' ? 'parkour' : category === 'horror' ? 'horror' : ''),
        kind: 'world',
        mcVersion,
        loader: '',
        offset: 0,
        limit: 8
      });
      for (const w of cfRes?.items || []) {
        if (w.allowDistribution === false) continue;
        items.unshift({
          source: 'curseforge-world',
          projectId: String(w.id),
          slug: w.slug,
          title: w.title,
          description: w.summary || '',
          iconUrl: w.iconUrl || '',
          bannerUrl: w.bannerUrl || '',
          downloads: w.downloads || 0,
          follows: 0,
          author: w.author || 'Creator',
          categories: ['world-map'],
          versions: w.mcVersions || [],
          pageUrl: w.url || ''
        });
      }
    } catch (_) {}
  }

  return {
    ok: true,
    total: (res?.total_hits || items.length),
    items
  };
}

async function installStoreWorldOrDatapack({
  gameDir,
  instanceDir = '',
  source = 'modrinth',
  slugOrId,
  title = '',
  mcVersion = '1.21.4',
  loaderType = 'vanilla',
  mode = 'new-world', // 'new-world' | 'attach-world'
  targetWorldPath = '',
  gameMode = 'survival',
  keepInventory = true,
  previewUrl = ''
} = {}, onStatus) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const effectiveGameDir = resolveTweakerDir(rootDir, instanceDir);
  const tmpDir = path.join(rootDir, 'instances', '.blockway-downloads');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const saveWorldPreviewIfMissing = async (targetDir) => {
    try {
      if (!targetDir || !/^https?:\/\//i.test(String(previewUrl || ''))) return;
      if (fs.existsSync(path.join(targetDir, 'icon.png')) || fs.existsSync(path.join(targetDir, 'blockway-preview.jpg')) || fs.existsSync(path.join(targetDir, 'blockway-preview.png'))) return;
      const tmpImg = path.join(tmpDir, `preview-${Date.now()}.bin`);
      await downloadVerified([previewUrl], tmpImg, {});
      if (fs.existsSync(tmpImg)) {
        const buf = fs.readFileSync(tmpImg);
        try { fs.unlinkSync(tmpImg); } catch (_) {}
        if (buf.length > 128 && buf.length < 4 * 1024 * 1024) {
          const isPng = buf[0] === 0x89 && buf[1] === 0x50;
          const isWebp = buf.slice(8, 12).toString('ascii') === 'WEBP';
          const outName = isPng ? 'blockway-preview.png' : (isWebp ? 'blockway-preview.webp' : 'blockway-preview.jpg');
          fs.writeFileSync(path.join(targetDir, outName), buf);
        }
      }
    } catch (_) {}
  };

  // 1. CurseForge pre-built World Map
  if (source === 'curseforge-world') {
    onStatus?.(`🗺️ Đang lấy phiên bản bản đồ "${title || slugOrId}"...`);
    const details = await getPackHubDetails({ source: 'curseforge', id: slugOrId, kind: 'world' });
    const chosenVer = (details?.versions || []).find((v) => v.mcVersion === mcVersion) || details?.versions?.[0];
    if (!chosenVer) throw new Error('Không tìm thấy file bản đồ tương thích để tải.');
    const instRes = await installPackHub({
      gameDir: rootDir,
      instanceDir: instanceDir || undefined,
      source: 'curseforge',
      id: slugOrId,
      versionId: chosenVer.id,
      kind: 'world',
      title: title || details.title || 'BlockWay Map'
    }, (p) => onStatus?.(p?.text || 'Đang tải bản đồ...'));
    return {
      ok: true,
      resultType: 'world',
      worldName: path.basename(instRes.worldPath),
      worldPath: instRes.worldPath,
      mcVersion: chosenVer.mcVersion || mcVersion
    };
  }

  // 2. Modrinth Datapack / World Zip
  onStatus?.(`🔎 Đang tìm bản tương thích MC ${mcVersion} cho "${title || slugOrId}"...`);
  const allVers = await fetchJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(slugOrId)}/version`);
  if (!Array.isArray(allVers) || !allVers.length) {
    throw new Error('Gói này hiện chưa có tệp phát hành trên Modrinth.');
  }

  const hasZip = (v) => Array.isArray(v.files) && v.files.some((f) => /\.zip$/i.test(f.filename));
  const baseParts = String(mcVersion).split('-')[0].split('.');
  const familyPrefix = baseParts.length >= 2 ? `${baseParts[0]}.${baseParts[1]}` : mcVersion;

  let chosen = allVers.find((v) => hasZip(v) && (v.game_versions || []).includes(mcVersion) && (v.loaders || []).includes('datapack'))
    || allVers.find((v) => hasZip(v) && (v.game_versions || []).includes(mcVersion))
    || allVers.find((v) => hasZip(v) && (v.game_versions || []).some((g) => g === familyPrefix || g.startsWith(`${familyPrefix}.`)))
    || allVers.find((v) => hasZip(v));

  if (!chosen) {
    throw new Error(`Gói "${title || slugOrId}" chỉ phát hành dưới dạng Mod (.jar), hãy tải trong mục Mod & Pack.`);
  }

  const fileObj = chosen.files.find((f) => /\.zip$/i.test(f.filename) && f.primary)
    || chosen.files.find((f) => /\.zip$/i.test(f.filename));
  const cleanZipName = path.basename(fileObj.filename).replace(/[^A-Za-z0-9._+-]/g, '_');
  const tmpZipPath = path.join(tmpDir, `${Date.now()}-${cleanZipName}`);

  try {
    onStatus?.(`⬇ Đang tải "${cleanZipName}" từ Modrinth Official...`);
    await downloadVerified([fileObj.url], tmpZipPath, { sha1: fileObj.hashes?.sha1, sha512: fileObj.hashes?.sha512 });

    // Check if the downloaded .zip is actually a full Minecraft World Save (contains level.dat)
    const zip = openPackZip(tmpZipPath);
    if (findWorldRootInZip(zip) !== null) {
      const savesDir = path.join(effectiveGameDir, 'saves');
      const extracted = extractWorldZipToSaves(tmpZipPath, savesDir, title || path.basename(cleanZipName, '.zip'));
      return {
        ok: true,
        resultType: 'world',
        worldName: extracted.worldName,
        worldPath: extracted.worldPath,
        mcVersion
      };
    }

    // Mode A: Attach Datapack into an existing World
    if (mode === 'attach-world' && targetWorldPath) {
      const { worldPath, cleanWorld } = resolveWorldFolderPath(rootDir, targetWorldPath);
      const dpDir = path.join(worldPath, 'datapacks');
      fs.mkdirSync(dpDir, { recursive: true });
      const destDp = path.join(dpDir, cleanZipName);
      fs.copyFileSync(tmpZipPath, destDp);
      return {
        ok: true,
        resultType: 'attached-datapack',
        worldName: cleanWorld,
        worldPath,
        datapackFile: cleanZipName,
        mcVersion
      };
    }

    // Mode B: Create a brand-new ready-to-play Singleplayer World with this Datapack pre-enabled!
    const targetMc = worldCreator.supportsQuickWorldCreation(mcVersion)
      ? mcVersion
      : ((chosen.game_versions || []).find((g) => worldCreator.supportsQuickWorldCreation(g)) || '1.21.4');

    onStatus?.(`🌍 Đang khởi tạo thế giới mới tích hợp sẵn "${title || cleanZipName}" (MC ${targetMc})...`);
    const created = await worldCreator.createQuickWorld({
      rootDir,
      gameDirectory: effectiveGameDir,
      mcVersion: targetMc,
      loaderType,
      levelName: title || path.basename(cleanZipName, '.zip'),
      gameMode,
      difficulty: 'normal',
      allowCommands: true,
      keepInventory: Boolean(keepInventory),
      extraDatapackZips: [tmpZipPath],
      fetchJson,
      downloadVerified,
      onStatus
    });

    if (!created?.ok) {
      throw new Error(created?.error || 'Không thể khởi tạo thế giới tự động cho gói này.');
    }

    await saveWorldPreviewIfMissing(created.worldDir);

    return {
      ok: true,
      resultType: 'created-world',
      worldName: created.folderName,
      levelName: created.levelName,
      worldPath: created.worldDir,
      datapackFile: cleanZipName,
      mcVersion: targetMc
    };
  } finally {
    try { if (fs.existsSync(tmpZipPath)) fs.unlinkSync(tmpZipPath); } catch (_) {}
  }
}

function listWorldDatapacks(gameDir, worldNameOrPath) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const { worldPath, cleanWorld } = resolveWorldFolderPath(rootDir, worldNameOrPath);
  const dpDir = path.join(worldPath, 'datapacks');
  if (!fs.existsSync(dpDir)) return { ok: true, worldName: cleanWorld, worldPath, items: [] };
  const items = [];
  for (const f of fs.readdirSync(dpDir, { withFileTypes: true })) {
    if (f.name === 'blockway-rules') continue;
    const full = path.join(dpDir, f.name);
    let sizeKB = 0;
    try {
      sizeKB = f.isFile() ? Math.max(1, Math.round(fs.statSync(full).size / 1024)) : 4;
    } catch (_) {}
    items.push({
      name: f.name,
      isDirectory: f.isDirectory(),
      sizeKB
    });
  }
  return { ok: true, worldName: cleanWorld, worldPath, items };
}

function deleteWorldDatapack(gameDir, worldNameOrPath, fileName) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const { worldPath } = resolveWorldFolderPath(rootDir, worldNameOrPath);
  const cleanName = path.basename(String(fileName || ''));
  if (!cleanName || cleanName === '.' || cleanName === '..') throw new Error('Tên Datapack không hợp lệ.');
  const target = path.join(worldPath, 'datapacks', cleanName);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
  return { ok: true };
}

/* ---------------- Upgrade 4: Co-op Voice Chat & Team QoL Pack ---------------- */
async function installCoopComboPack({
  gameDir,
  instanceDir = '',
  mcVersion = '1.21.4',
  loaderType = 'fabric',
  includeVoice = true,
  includeTeamQol = true
} = {}, onStatus) {
  const targetDir = resolveTweakerDir(gameDir, instanceDir);
  const effectiveLoader = normalizeModrinthLoader(loaderType, mcVersion);
  const installed = [];
  const skipped = [];

  if (includeVoice) {
    onStatus?.(`🎙️ Đang trang bị Đàm Thoại 3D Trong Game (Simple Voice Chat) cho MC ${mcVersion}...`);
    let voiceOk = false;
    for (const slug of ['simple-voice-chat', 'plasmo-voice']) {
      try {
        const r = await installModrinthProject({
          slug,
          projectType: 'mod',
          mcVersion,
          loaderType: effectiveLoader,
          gameDir: targetDir
        }, onStatus);
        if (r?.fileName) {
          installed.push(r.fileName);
          voiceOk = true;
          break;
        }
      } catch (_) {}
    }
    if (!voiceOk) skipped.push('simple-voice-chat');

    // Ensure voicechat server config allows groups & smooth codec out-of-the-box
    try {
      const vcDir = path.join(targetDir, 'config', 'voicechat');
      const srvProp = path.join(vcDir, 'voicechat-server.properties');
      if (!fs.existsSync(srvProp)) {
        fs.mkdirSync(vcDir, { recursive: true });
        fs.writeFileSync(
          srvProp,
          [
            '# BlockWay Co-op Voice Chat Defaults',
            'port=24454',
            'enable_groups=true',
            'max_voice_distance=48.0',
            'whisper_distance=24.0',
            'codec=VOIP',
            ''
          ].join('\n'),
          'utf8'
        );
      }
    } catch (_) {}
  }

  if (includeTeamQol) {
    const qolSlugs = ['xaeros-minimap', 'xaeros-world-map', 'jade', 'carry-on', 'waystones'];
    for (const slug of qolSlugs) {
      try {
        onStatus?.(`🧭 Đang trang bị tiện ích tổ đội (${slug}) cho MC ${mcVersion}...`);
        const r = await installModrinthProject({
          slug,
          projectType: 'mod',
          mcVersion,
          loaderType: effectiveLoader,
          gameDir: targetDir
        }, onStatus);
        if (r?.fileName) installed.push(r.fileName);
      } catch (_) {
        skipped.push(slug);
      }
    }
  }

  return {
    ok: true,
    effectiveLoader,
    targetDir,
    installed,
    skipped
  };
}

/* ---------------- Upgrade 5: Smart RAM & Generational ZGC / G1GC Coach ---------------- */
function buildGenerationalZgcArgs(javaMajor, cpuCores = os.cpus().length) {
  const concThreads = Math.max(2, Math.min(6, Math.floor(cpuCores / 2)));
  const args = [
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+UseZGC'
  ];
  // Java 21-23 requires explicit +ZGenerational; Java 24+ is Generational ZGC by default
  if (javaMajor >= 21 && javaMajor <= 23) {
    args.push('-XX:+ZGenerational');
  }
  args.push(
    '-XX:ZUncommitDelay=30',
    `-XX:ConcGCThreads=${concThreads}`,
    '-XX:+DisableExplicitGC',
    '-XX:+PerfDisableSharedMem',
    '-XX:-OmitStackTraceInFastThrow',
    '-Dfml.ignoreInvalidMinecraftCertificates=true',
    '-Dfml.ignorePatchDiscrepancies=true',
    '-Dminecraft.launcher.brand=BlockWay-Pro'
  );
  return args;
}

function computeSmartRamAndJvmAdvice({
  gameDir,
  instanceDir = '',
  mcVersion = '1.21.4',
  loaderType = 'vanilla',
  requestedRamGB = 4,
  smartRamAuto = false,
  forceRecommend = false,
  javaPath = '',
  cpuCores = os.cpus().length
} = {}) {
  const targetDir = resolveTweakerDir(gameDir, instanceDir);
  const totalMemGB = Math.round((os.totalmem() / 1073741824) * 10) / 10;
  const freeMemGB = Math.round((os.freemem() / 1073741824) * 10) / 10;

  let modsCount = 0;
  if (loaderType !== 'vanilla') {
    modsCount = countFilesIn(path.join(targetDir, 'mods'), /\.jar$/i);
  }
  const equipped = getEquippedAddonsState(targetDir);
  const hasShader = Boolean(equipped.activeShader);

  // Sweet-spot RAM formula based on workload
  let sweetSpotGB = 3;
  let minSafeRamGB = 2;
  let profileLabel = 'Vanilla Nhẹ';

  if (modsCount > 220) {
    sweetSpotGB = 10;
    minSafeRamGB = 7;
    profileLabel = `Đại Modpack (${modsCount} Mod)`;
  } else if (modsCount > 120) {
    sweetSpotGB = 8;
    minSafeRamGB = 6;
    profileLabel = `Modpack Nặng (${modsCount} Mod)`;
  } else if (modsCount > 40) {
    sweetSpotGB = hasShader ? 7 : 6;
    minSafeRamGB = 4.5;
    profileLabel = `Modpack Vừa (${modsCount} Mod${hasShader ? ' + Shader' : ''})`;
  } else if (modsCount > 0 || loaderType !== 'vanilla') {
    sweetSpotGB = hasShader ? 5 : 4;
    minSafeRamGB = 3;
    profileLabel = `${modsCount} Mod${hasShader ? ' + Shader' : ''}`;
  } else {
    sweetSpotGB = hasShader ? 4 : (compareMcVersions(mcVersion, '1.18') >= 0 ? 3.5 : 2.5);
    minSafeRamGB = 2;
    profileLabel = hasShader ? 'Vanilla + Shader' : 'Vanilla Chuẩn';
  }

  // Reserve at least 2.2 GB for Windows + GPU driver so system never stutters or pagefile-thrashes
  const maxSafeOsRamGB = Math.max(2, Math.floor((totalMemGB - 2.2) * 2) / 2);
  const recommendedRamGB = Math.max(2, Math.min(sweetSpotGB, maxSafeOsRamGB));

  const userRam = Math.max(1.5, Number(requestedRamGB) || 4);
  let effectiveRamGB = userRam;
  let adjustmentReason = '';

  if (forceRecommend) {
    effectiveRamGB = recommendedRamGB;
    adjustmentReason = 'balanced';
  } else if (smartRamAuto) {
    if (userRam < minSafeRamGB && maxSafeOsRamGB >= minSafeRamGB) {
      effectiveRamGB = recommendedRamGB;
      adjustmentReason = 'boosted-low-ram';
    } else if (userRam > maxSafeOsRamGB) {
      effectiveRamGB = maxSafeOsRamGB;
      adjustmentReason = 'capped-high-ram';
    }
  }

  // Determine Java major version for GC selection
  let javaMajor = 0;
  if (javaPath && javaPath !== 'java' && fs.existsSync(javaPath)) {
    javaMajor = getJavaMajorVersion(javaPath);
  }
  if (!javaMajor) {
    if (compareMcVersions(mcVersion, '26.1') >= 0) javaMajor = 25;
    else if (compareMcVersions(mcVersion, '1.20.5') >= 0) javaMajor = 21;
    else if (compareMcVersions(mcVersion, '1.17') >= 0) javaMajor = 17;
    else javaMajor = 8;
  }

  const useGenZgc = javaMajor >= 21 && cpuCores >= 6 && effectiveRamGB >= 5 && totalMemGB >= 11;
  const gcMode = useGenZgc ? 'zgc-gen' : 'g1gc-tuned';
  const gcModeLabel = useGenZgc
    ? `Generational ZGC (Java ${javaMajor} • Siêu mượt <1ms)`
    : `Low-Pause G1GC (Đa nhân ${cpuCores} luồng)`;

  let jvmArgs;
  if (useGenZgc) {
    jvmArgs = buildGenerationalZgcArgs(javaMajor, cpuCores);
  } else {
    jvmArgs = buildMultiCoreSmoothExitArgs(effectiveRamGB, cpuCores);
    if (javaMajor >= 17 && !jvmArgs.some((a) => a.startsWith('-XX:G1PeriodicGCInterval='))) {
      jvmArgs.push('-XX:G1PeriodicGCInterval=15000');
    }
  }

  let adviceStatus = 'optimal';
  let adviceText = `✅ Chuẩn vàng cho ${profileLabel}: Khuyên cấp ${recommendedRamGB} GB RAM (Máy ${totalMemGB} GB, trống ${freeMemGB} GB) • ${gcModeLabel}.`;
  if (userRam < minSafeRamGB && maxSafeOsRamGB >= minSafeRamGB) {
    adviceStatus = 'too-low';
    adviceText = `⚠️ Đang chọn ${userRam} GB hơi thấp cho ${profileLabel} — dễ thiếu bộ nhớ! Mức vàng khuyên dùng: ${recommendedRamGB} GB.`;
  } else if (userRam > maxSafeOsRamGB) {
    adviceStatus = 'too-high';
    adviceText = `⚠️ Đang chọn ${userRam} GB vượt mức an toàn của máy (${totalMemGB} GB) dễ gây khựng Windows! Nên hạ về ${recommendedRamGB} GB.`;
  } else if (Math.abs(userRam - recommendedRamGB) >= 2 && userRam > recommendedRamGB) {
    adviceStatus = 'slightly-high';
    adviceText = `💡 Gợi ý: Cấp thừa RAM (${userRam} GB) cho ${profileLabel} có thể làm GC dọn lâu hơn. Mức tối ưu nhất là ${recommendedRamGB} GB.`;
  }

  return {
    ok: true,
    totalMemGB,
    freeMemGB,
    cpuCores,
    javaMajor,
    modsCount,
    hasShader,
    profileLabel,
    recommendedRamGB,
    minSafeRamGB,
    maxSafeOsRamGB,
    effectiveRamGB,
    adjustmentReason,
    gcMode,
    gcModeLabel,
    jvmArgs,
    adviceStatus,
    adviceText
  };
}

/* ============================================================================
   v40.7 PRO — 4 ULTRA UPGRADES:
   1. Online Skin Hub & Co-op Offline Friend Skin Sync
   2. Lunar-Style 1-Click PvP / BedWars HUD & Low-Fire Mode
   3. World NBT Inspector, Hardcore Rescue & Curated Seed Vault
   4. 1-Click Replay & TikTok Cinematic Studio + Portable FFmpeg
   ============================================================================ */

const ONLINE_SKIN_PRESETS = {
  popular: {
    filter: '',
    curatedPlayers: ['Technoblade', 'Dream', 'Grian', 'Philza', 'DanTDM', 'Sapnap', 'SB737', 'Mumbo']
  },
  anime: {
    filter: 'anime',
    curatedQueries: ['naruto', 'gojo', 'luffy', 'anime']
  },
  cool: {
    filter: 'hacker',
    curatedQueries: ['cyber', 'hoodie', 'assassin', 'neon']
  },
  cute: {
    filter: 'cute',
    curatedQueries: ['pastel', 'kawaii', 'sakura', 'bunny']
  },
  knight: {
    filter: 'knight',
    curatedQueries: ['knight', 'samurai', 'king', 'warrior']
  },
  youtuber: {
    filter: '',
    curatedPlayers: ['Technoblade', 'Dream', 'GeorgeNotFound', 'Sapnap', 'BadBoyHalo', 'TommyInnit', 'Grian', 'Mumbo', 'Philza', 'DanTDM', 'Skeppy', 'SB737']
  }
};

function fetchBufferHttps(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const safeUrl = String(url || '').replace(/^http:\/\/textures\.minecraft\.net\//i, 'https://textures.minecraft.net/');
    const lib = safeUrl.startsWith('https:') ? https : http;
    const req = lib.get(safeUrl, { headers: { 'User-Agent': 'BlockWay-Launcher/40.7' }, timeout: timeoutMs }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, safeUrl).toString();
        res.resume();
        return fetchBufferHttps(nextUrl, timeoutMs).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function searchOnlineSkins({ query = '', category = 'popular', page = 1 } = {}) {
  const cleanQuery = String(query || '').trim();
  const safePage = Math.max(1, Math.min(50, Number(page) || 1));
  const preset = ONLINE_SKIN_PRESETS[category] || ONLINE_SKIN_PRESETS.popular;
  const items = [];
  const seenKeys = new Set();

  const pushSkin = (it) => {
    if (!it || !it.textureUrl) return;
    const k = String(it.textureUrl).toLowerCase();
    if (seenKeys.has(k)) return;
    seenKeys.add(k);
    items.push(it);
  };

  // 1. If user typed a valid Minecraft player name (3..16 chars), put exact player skin match first!
  if (cleanQuery && /^[A-Za-z0-9_]{3,16}$/.test(cleanQuery) && safePage === 1) {
    pushSkin({
      id: `player-${cleanQuery.toLowerCase()}`,
      name: `${cleanQuery} (Nhân vật)`,
      textureUrl: `https://mc-heads.net/skin/${encodeURIComponent(cleanQuery)}`,
      previewUrl: `https://mc-heads.net/body/${encodeURIComponent(cleanQuery)}/120`,
      faceUrl: `https://mc-heads.net/avatar/${encodeURIComponent(cleanQuery)}/64`,
      badge: '👤 Theo tên người chơi'
    });
  }

  // 2. Curated featured players when on page 1 without custom query
  if (!cleanQuery && Array.isArray(preset.curatedPlayers) && safePage === 1) {
    for (const pName of preset.curatedPlayers) {
      pushSkin({
        id: `curated-${pName.toLowerCase()}`,
        name: pName,
        textureUrl: `https://mc-heads.net/skin/${encodeURIComponent(pName)}`,
        previewUrl: `https://mc-heads.net/body/${encodeURIComponent(pName)}/120`,
        faceUrl: `https://mc-heads.net/avatar/${encodeURIComponent(pName)}/64`,
        badge: category === 'youtuber' ? '🎬 YouTuber' : '⭐ Nổi bật'
      });
    }
  }

  // 3. Query MineSkin gallery API (millions of tagged community 64x64 skins hosted on Mojang CDN)
  // v40.8: v1 list still filters by name best; v2 is the fallback when v1 is down/empty. Unnamed skins get unique labels.
  const queriesToRun = cleanQuery
    ? [cleanQuery]
    : (Array.isArray(preset.curatedQueries) && preset.curatedQueries.length
      ? preset.curatedQueries.slice(0, 2)
      : [preset.filter || '']);

  const prettyLabel = (rawName, qStr, idx) => {
    const n = String(rawName || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (n && n.length >= 2) return n.slice(0, 28);
    return `${qStr ? qStr.charAt(0).toUpperCase() + qStr.slice(1) : 'Skin'} #${(safePage - 1) * 20 + idx + 1}`;
  };

  await Promise.all(queriesToRun.map(async (qStr) => {
    let added = 0;
    try {
      const apiUrl = `https://api.mineskin.org/get/list/${safePage}?size=20${qStr ? `&filter=${encodeURIComponent(qStr)}` : ''}`;
      const data = await fetchJson(apiUrl);
      (data?.skins || []).forEach((sk, idx) => {
        const rawUrl = String(sk?.url || '');
        const hash = rawUrl.split('/').pop();
        if (!hash || !/^[a-f0-9]{32,68}$/i.test(hash)) return;
        pushSkin({
          id: `ms-${sk.id || hash.slice(0, 12)}`,
          name: prettyLabel(sk.name, qStr, idx),
          textureUrl: `https://textures.minecraft.net/texture/${hash}`,
          previewUrl: `https://mc-heads.net/body/${hash}/120`,
          faceUrl: `https://mc-heads.net/avatar/${hash}/64`,
          badge: qStr ? `#${qStr}` : '🌐 Cộng đồng'
        });
        added++;
      });
    } catch (_) {}
    if (added > 0) return;
    try {
      const v2Url = `https://api.mineskin.org/v2/skins?size=20${qStr ? `&filter=${encodeURIComponent(qStr)}` : ''}`;
      const data2 = await fetchJson(v2Url);
      (data2?.skins || []).forEach((sk, idx) => {
        const hash = String(sk?.texture || '');
        if (!/^[a-f0-9]{32,68}$/i.test(hash)) return;
        pushSkin({
          id: `ms2-${sk.uuid || hash.slice(0, 12)}`,
          name: prettyLabel(sk.name, qStr, idx),
          textureUrl: `https://textures.minecraft.net/texture/${hash}`,
          previewUrl: `https://mc-heads.net/body/${hash}/120`,
          faceUrl: `https://mc-heads.net/avatar/${hash}/64`,
          badge: '🌐 Cộng đồng'
        });
      });
    } catch (_) {}
  }));

  return {
    ok: true,
    page: safePage,
    total: items.length,
    items: items.slice(0, 32)
  };
}

async function applyOnlineSkinToWardrobe({
  gameDir,
  username = 'StevePlayer',
  textureUrl = '',
  skinName = ''
} = {}) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const normalizedUrl = String(textureUrl || '').trim().replace(/^http:\/\/textures\.minecraft\.net\//i, 'https://textures.minecraft.net/');
  if (!normalizedUrl) throw new Error('Chưa có đường dẫn ảnh Skin hợp lệ.');

  const parsed = new URL(normalizedUrl);
  const allowedHosts = ['textures.minecraft.net', 'mc-heads.net', 'minotar.net', 'crafatar.com', 'littleskin.cn', 'ely.by', 'skinsystem.ely.by'];
  if (!allowedHosts.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))) {
    throw new Error('Nguồn tải Skin không nằm trong danh sách máy chủ chính thức.');
  }

  let pngBuf = null;
  try {
    pngBuf = await fetchBufferHttps(parsed.toString(), 12000);
  } catch (e) {
    // Fallback if mc-heads username lookup failed -> try minotar
    const mName = parsed.pathname.match(/^\/skin\/([A-Za-z0-9_]{3,16})$/);
    if (mName) {
      pngBuf = await fetchBufferHttps(`https://minotar.net/skin/${mName[1]}`, 10000);
    } else {
      throw e;
    }
  }

  if (!pngBuf || pngBuf.length < 100 || pngBuf[0] !== 0x89 || pngBuf[1] !== 0x50 || pngBuf[2] !== 0x4e || pngBuf[3] !== 0x47) {
    throw new Error('Không tìm thấy dữ liệu ảnh PNG hợp lệ cho nhân vật này.');
  }

  const cleanName = (username || 'StevePlayer').replace(/[^a-zA-Z0-9_]/g, '') || 'StevePlayer';
  const skinsDir = path.join(rootDir, 'CustomSkinLoader', 'LocalSkin', 'skins');
  fs.mkdirSync(skinsDir, { recursive: true });
  const savedPath = path.join(skinsDir, `${cleanName}.png`);
  fs.writeFileSync(savedPath, pngBuf);
  configureCrackSkinSupport(rootDir);

  return {
    ok: true,
    skinName: skinName || cleanName,
    savedPath,
    dataUrl: `data:image/png;base64,${pngBuf.toString('base64')}`
  };
}

async function installFriendSkinSyncPack({
  gameDir,
  instanceDir = '',
  mcVersion = '1.21.4',
  loaderType = 'fabric',
  friendNames = []
} = {}, onStatus) {
  const targetDir = resolveTweakerDir(gameDir, instanceDir);
  const effectiveLoader = normalizeModrinthLoader(loaderType, mcVersion);
  const installed = [];
  const skipped = [];

  // v40.8: SkinShuffle also hooks the player-skin pipeline and fights CustomSkinLoader → don't pair them
  const slugs = ['customskinloader', '3dskinlayers', 'capes'];

  for (const slug of slugs) {
    try {
      onStatus?.(`👕 Đang trang bị gói đồng bộ Skin & Áo choàng bạn bè (${slug}) cho MC ${mcVersion}...`);
      const r = await installModrinthProject({
        slug,
        projectType: 'mod',
        mcVersion,
        loaderType: effectiveLoader,
        gameDir: targetDir
      }, onStatus);
      if (r?.fileName) installed.push(r.fileName);
    } catch (_) {
      skipped.push(slug);
    }
  }

  configureCrackSkinSupport(targetDir);

  // Detach AetherSkinSync.zip from options.txt if CustomSkinLoader is now active so friends never clone your skin!
  if (hasEnabledCustomSkinLoaderMod(targetDir)) {
    try {
      equipResourcePackInGame(targetDir, 'AetherSkinSync.zip', false);
    } catch (_) {}
  }

  // Optionally pre-cache any friend usernames into LocalSkin
  const syncedFriends = [];
  const skinsDir = path.join(targetDir, 'CustomSkinLoader', 'LocalSkin', 'skins');
  fs.mkdirSync(skinsDir, { recursive: true });
  for (const rawFriend of (Array.isArray(friendNames) ? friendNames : []).slice(0, 12)) {
    const fName = String(rawFriend || '').trim().replace(/[^A-Za-z0-9_]/g, '');
    if (fName.length < 3 || fName.length > 16) continue;
    try {
      const buf = await fetchBufferHttps(`https://mc-heads.net/skin/${encodeURIComponent(fName)}`, 8000);
      if (buf && buf.length > 100 && buf[0] === 0x89 && buf[1] === 0x50) {
        fs.writeFileSync(path.join(skinsDir, `${fName}.png`), buf);
        syncedFriends.push(fName);
      }
    } catch (_) {}
  }

  return {
    ok: installed.length > 0,
    effectiveLoader,
    targetDir,
    installed,
    skipped,
    syncedFriends
  };
}

/* ---------------- Upgrade 2: Lunar-Style 1-Click PvP / BedWars HUD Mode ---------------- */
const PVP_MODE_STATE_FILE = '.blockway-pvp-mode.json';

function readPvpModeManifest(targetDir) {
  try {
    const p = path.join(targetDir, PVP_MODE_STATE_FILE);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')) || {};
  } catch (_) {}
  return { enabled: false, installedMods: [], lowFirePack: '' };
}

function writePvpModeManifest(targetDir, data) {
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, PVP_MODE_STATE_FILE), JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {}
}

function getPvpClientModeState({ gameDir, instanceDir = '' } = {}) {
  const targetDir = resolveTweakerDir(gameDir, instanceDir);
  const manifest = readPvpModeManifest(targetDir);
  const modsDir = path.join(targetDir, 'mods');
  const activeMods = [];
  if (fs.existsSync(modsDir)) {
    for (const f of (manifest.installedMods || [])) {
      const clean = String(f || '').replace(/\.disabled$/i, '');
      if (clean && fs.existsSync(path.join(modsDir, clean))) activeMods.push(clean);
    }
  }
  const equipped = getEquippedAddonsState(targetDir);
  const lowFireActive = Boolean(
    manifest.lowFirePack && equipped.activeResourcePacks.includes(manifest.lowFirePack)
  );
  const isEnabled = Boolean(manifest.enabled && (activeMods.length > 0 || lowFireActive));
  return {
    ok: true,
    enabled: isEnabled,
    activeMods,
    lowFirePack: manifest.lowFirePack || '',
    lowFireActive
  };
}

async function togglePvpClientMode({
  gameDir,
  instanceDir = '',
  mcVersion = '1.21.4',
  loaderType = 'fabric',
  enable = true
} = {}, onStatus) {
  const targetDir = resolveTweakerDir(gameDir, instanceDir);
  const effectiveLoader = normalizeModrinthLoader(loaderType, mcVersion);
  const modsDir = path.join(targetDir, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });
  const prevManifest = readPvpModeManifest(targetDir);

  if (!enable) {
    let disabledCount = 0;
    const disabledNames = [];
    for (const f of (prevManifest.installedMods || [])) {
      const clean = path.basename(String(f || '')).replace(/\.disabled$/i, '');
      if (!clean) continue;
      // Never disable core shared libraries like fabric-api or cloth-config
      if (/^(fabric-api|cloth-config|yacl|architectury|modmenu)/i.test(clean)) continue;
      const enPath = path.join(modsDir, clean);
      const disPath = `${enPath}.disabled`;
      if (fs.existsSync(enPath)) {
        try {
          if (fs.existsSync(disPath)) fs.unlinkSync(disPath);
          fs.renameSync(enPath, disPath);
          disabledCount++;
        } catch (_) {}
      }
      if (fs.existsSync(disPath)) disabledNames.push(clean);
    }
    // v40.8: keep PvP mods OFF across launches (auto version-sync must not re-enable them)
    setModUserDisabledFlags(modsDir, disabledNames, true);
    if (prevManifest.lowFirePack) {
      try { equipResourcePackInGame(targetDir, prevManifest.lowFirePack, false); } catch (_) {}
    }
    // v40.8: restore the player's own toggleSprint / autoJump / VSync from before PvP Mode
    if (prevManifest.prevOptions && typeof prevManifest.prevOptions === 'object') {
      try {
        const optsPath = path.join(targetDir, 'options.txt');
        if (fs.existsSync(optsPath)) {
          let content = fs.readFileSync(optsPath, 'utf8');
          for (const [k, v] of Object.entries(prevManifest.prevOptions)) {
            content = v === null ? removeOptLine(content, k) : writeOptValue(content, k, v);
          }
          fs.writeFileSync(optsPath, content, 'utf8');
        }
      } catch (_) {}
    }
    writePvpModeManifest(targetDir, {
      ...prevManifest,
      enabled: false,
      prevOptions: null,
      updatedAt: Date.now()
    });
    return {
      ok: true,
      enabled: false,
      disabledCount,
      installedMods: []
    };
  }

  // Enable PvP HUD Mode!
  const installedMods = [];
  const tryInstallGroup = async (candidates, label) => {
    for (const slug of candidates) {
      try {
        onStatus?.(`⚔️ Đang trang bị ${label} (${slug}) cho MC ${mcVersion}...`);
        const r = await installModrinthProject({
          slug,
          projectType: 'mod',
          mcVersion,
          loaderType: effectiveLoader,
          gameDir: targetDir
        }, onStatus);
        if (r?.fileName) {
          installedMods.push(r.fileName);
          return true;
        }
      } catch (_) {}
    }
    return false;
  };

  await tryInstallGroup(['evergreenhud', 'clean-keystrokes', 'kronhud'], 'Bảng phím Keystrokes & CPS');
  await tryInstallGroup(['armor-hud'], 'Thanh độ bền Giáp PvP');
  await tryInstallGroup(['status-effect-bars'], 'Đồng hồ Hiệu ứng Thuốc');
  await tryInstallGroup(['dynamiccrosshair'], 'Tâm ngắm Chiến đấu');
  await tryInstallGroup(['zoomify', 'wi-zoom'], 'Ống nhòm Phóng to');
  await tryInstallGroup(['freelook'], 'Góc nhìn 360° Freelook');
  await tryInstallGroup(['appleskin'], 'Hiển thị Hồi máu / Táo vàng');

  // Equip Low-Fire PvP Resource Pack so fire never blocks screen during combat
  let lowFirePack = prevManifest.lowFirePack || '';
  try {
    onStatus?.('🔥 Đang kích hoạt gói Lửa Thấp PvP (Low Fire) chống che màn hình...');
    const rpRes = await installModrinthProject({
      slug: 'low-fire-pack',
      projectType: 'resourcepack',
      mcVersion,
      loaderType: effectiveLoader,
      gameDir: targetDir
    }, onStatus);
    if (rpRes?.fileName) {
      lowFirePack = rpRes.fileName;
      equipResourcePackInGame(targetDir, lowFirePack, true);
    }
  } catch (_) {}

  // Set Vanilla ToggleSprint = true, AutoJump = false, VSync = false in options.txt for crisp 0ms input PvP!
  // v40.8: remember the player's previous values once, so turning PvP off restores them
  let prevOptions = prevManifest.enabled && prevManifest.prevOptions ? prevManifest.prevOptions : null;
  try {
    const optsPath = path.join(targetDir, 'options.txt');
    let content = fs.existsSync(optsPath) ? fs.readFileSync(optsPath, 'utf8') : '';
    if (!prevOptions) {
      prevOptions = {
        toggleSprint: readOptValue(content, 'toggleSprint'),
        autoJump: readOptValue(content, 'autoJump'),
        enableVsync: readOptValue(content, 'enableVsync')
      };
    }
    const nl = content.includes('\r\n') ? '\r\n' : '\n';
    const setOpt = (k, v) => {
      const rx = new RegExp(`^${k}:.*(\\r?)$`, 'm');
      if (rx.test(content)) content = content.replace(rx, `${k}:${v}$1`);
      else content += (content && !content.endsWith('\n') ? nl : '') + `${k}:${v}${nl}`;
    };
    setOpt('toggleSprint', 'true');
    setOpt('autoJump', 'false');
    setOpt('enableVsync', 'false');
    fs.writeFileSync(optsPath, content, 'utf8');
  } catch (_) {}

  const uniqueMods = Array.from(new Set(installedMods));
  setModUserDisabledFlags(modsDir, uniqueMods, false);
  writePvpModeManifest(targetDir, {
    enabled: true,
    mcVersion,
    loader: effectiveLoader,
    installedMods: uniqueMods,
    lowFirePack,
    prevOptions,
    updatedAt: Date.now()
  });

  return {
    ok: true,
    enabled: true,
    effectiveLoader,
    installedMods: uniqueMods,
    lowFirePack
  };
}

/* ---------------- Upgrade 3: World NBT Inspector, Rescue & Curated Seed Vault ---------------- */
function inspectLocalWorldDetails({ gameDir, worldNameOrPath } = {}) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const { worldPath } = resolveWorldFolderPath(rootDir, worldNameOrPath);
  return worldCreator.inspectWorldNbt(worldPath);
}

function rescuePatchLocalWorld({ gameDir, worldNameOrPath, patches = {} } = {}) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const { worldPath } = resolveWorldFolderPath(rootDir, worldNameOrPath);
  return worldCreator.rescueAndPatchWorldNbt(worldPath, patches || {});
}

function getCuratedSeedsVault() {
  return {
    ok: true,
    seeds: worldCreator.CURATED_SEEDS_VAULT || []
  };
}

async function createStandaloneQuickWorld({
  gameDir,
  instanceDir = '',
  mcVersion = '1.21.4',
  loaderType = 'fabric',
  levelName = 'Thế giới mới',
  gameMode = 'survival',
  difficulty = 'normal',
  hardcore = false,
  allowCommands = false,
  seed = '',
  bonusChest = false,
  keepInventory = false,
  alwaysDay = false
} = {}, onStatus) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const effectiveGameDir = instanceDir && String(instanceDir).trim()
    ? assertInsideInstances(rootDir, instanceDir)
    : rootDir;
  const targetMc = worldCreator.supportsQuickWorldCreation(mcVersion) ? mcVersion : '1.21.4';
  return await worldCreator.createQuickWorld({
    rootDir,
    gameDirectory: effectiveGameDir,
    mcVersion: targetMc,
    loaderType,
    levelName,
    gameMode,
    difficulty,
    hardcore,
    allowCommands,
    seed,
    bonusChest,
    keepInventory,
    alwaysDay,
    fetchJson,
    downloadVerified,
    onStatus
  });
}

/* ---------------- Upgrade 4: 1-Click Replay & TikTok Cam Studio + Portable FFmpeg ---------------- */
function detectFfmpegExecutable(rootDir) {
  const exeName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const portablePath = path.join(rootDir, 'runtimes', 'ffmpeg', exeName);
  if (fs.existsSync(portablePath)) {
    try {
      if (fs.statSync(portablePath).size > 1024 * 1024) return { found: true, path: portablePath, source: 'portable' };
    } catch (_) {}
  }
  try {
    const cmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim();
    const firstLine = out.split(/\r?\n/)[0]?.trim();
    if (firstLine && fs.existsSync(firstLine)) {
      return { found: true, path: firstLine, source: 'system' };
    }
  } catch (_) {}
  return { found: false, path: '', source: '' };
}

function getReplayStudioStatus({ gameDir, instanceDir = '' } = {}) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const targetDir = resolveTweakerDir(rootDir, instanceDir);
  const modsDir = path.join(targetDir, 'mods');
  let activeReplayMod = '';
  let hasFreecam = false;
  if (fs.existsSync(modsDir)) {
    for (const f of fs.readdirSync(modsDir)) {
      if (!/\.jar$/i.test(f)) continue;
      if (/^flashback[-_]/i.test(f)) activeReplayMod = 'Flashback';
      else if (/^replaymod[-_]/i.test(f) && !activeReplayMod) activeReplayMod = 'ReplayMod';
      if (/^freecam[-_]/i.test(f)) hasFreecam = true;
    }
  }
  const ffmpeg = detectFfmpegExecutable(rootDir);

  let recordingsCount = 0;
  for (const rel of ['flashback/replays', 'replay_recordings']) {
    const d = path.join(targetDir, rel);
    if (fs.existsSync(d)) {
      try {
        recordingsCount += fs.readdirSync(d).filter((x) => /\.(mcpr|zip)$/i.test(x) || fs.statSync(path.join(d, x)).isDirectory()).length;
      } catch (_) {}
    }
  }
  let exportedVideosCount = 0;
  let videosFolder = path.join(targetDir, 'replay_videos');
  for (const rel of ['flashback/exports', 'replay_videos']) {
    const d = path.join(targetDir, rel);
    if (fs.existsSync(d)) {
      try {
        const mp4s = fs.readdirSync(d).filter((x) => /\.(mp4|webm|mkv)$/i.test(x));
        if (mp4s.length > 0) videosFolder = d;
        exportedVideosCount += mp4s.length;
      } catch (_) {}
    }
  }

  return {
    ok: true,
    equipped: Boolean(activeReplayMod),
    activeReplayMod,
    hasFreecam,
    ffmpegReady: ffmpeg.found,
    ffmpegSource: ffmpeg.source,
    ffmpegPath: ffmpeg.path,
    recordingsCount,
    exportedVideosCount,
    videosFolder
  };
}

async function ensurePortableFfmpeg(gameDir, onStatus) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const existing = detectFfmpegExecutable(rootDir);
  if (existing.found) return { ok: true, ...existing, alreadyInstalled: true };
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Tải FFmpeg tự động hiện chỉ hỗ trợ Windows.' };
  }

  const ffmpegDir = path.join(rootDir, 'runtimes', 'ffmpeg');
  fs.mkdirSync(ffmpegDir, { recursive: true });
  const gzPath = path.join(ffmpegDir, 'ffmpeg-win64.gz');
  const exePath = path.join(ffmpegDir, 'ffmpeg.exe');

  onStatus?.('🎬 Đang tải bộ kết xuất Video MP4 (FFmpeg gọn nhẹ 28 MB — chỉ tải 1 lần duy nhất)...');
  await downloadFile('https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz', gzPath);
  onStatus?.('🎬 Đang giải nén & kích hoạt bộ xuất Video MP4...');
  await new Promise((resolve, reject) => {
    const inp = fs.createReadStream(gzPath);
    const gunzip = zlib.createGunzip();
    const out = fs.createWriteStream(exePath);
    inp.pipe(gunzip).pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    gunzip.on('error', reject);
    inp.on('error', reject);
  });
  try { fs.unlinkSync(gzPath); } catch (_) {}

  if (!(process.env.PATH || '').includes(ffmpegDir)) {
    process.env.PATH = `${ffmpegDir}${path.delimiter}${process.env.PATH || ''}`;
  }
  return { ok: true, found: true, path: exePath, source: 'portable', alreadyInstalled: false };
}

async function installReplayStudioPack({
  gameDir,
  instanceDir = '',
  mcVersion = '1.21.4',
  loaderType = 'fabric',
  installFfmpeg = true
} = {}, onStatus) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const targetDir = resolveTweakerDir(rootDir, instanceDir);
  const effectiveLoader = normalizeModrinthLoader(loaderType, mcVersion);
  const installed = [];

  // Prefer Flashback (super lightweight & intuitive UI), fallback to ReplayMod — try both on every loader
  const recorderCandidates = ['flashback', 'replaymod'];
  let recorderFile = '';

  for (const slug of recorderCandidates) {
    try {
      onStatus?.(`🎬 Đang cài trình quay phim 3D trong game (${slug}) cho MC ${mcVersion}...`);
      const r = await installModrinthProject({
        slug,
        projectType: 'mod',
        mcVersion,
        loaderType: effectiveLoader,
        gameDir: targetDir
      }, onStatus);
      if (r?.fileName) {
        installed.push(r.fileName);
        recorderFile = r.fileName;
        break;
      }
    } catch (_) {}
  }

  // Also equip Freecam for live detached camera / TikTok cinematic angles
  try {
    onStatus?.(`🎥 Đang trang bị Camera Bay Tự Do (Freecam) cho MC ${mcVersion}...`);
    const fc = await installModrinthProject({
      slug: 'freecam',
      projectType: 'mod',
      mcVersion,
      loaderType: effectiveLoader,
      gameDir: targetDir
    }, onStatus);
    if (fc?.fileName) installed.push(fc.fileName);
  } catch (_) {}

  let ffmpegInfo = detectFfmpegExecutable(rootDir);
  if (installFfmpeg && !ffmpegInfo.found) {
    try {
      ffmpegInfo = await ensurePortableFfmpeg(rootDir, onStatus);
    } catch (_) {}
  }

  // Ensure replay_videos folder exists for easy access
  const videosDir = path.join(targetDir, 'replay_videos');
  fs.mkdirSync(videosDir, { recursive: true });

  return {
    // v40.8: only report success when an actual replay recorder was installed (Freecam alone isn't a replay studio)
    ok: Boolean(recorderFile),
    error: recorderFile ? '' : `Chưa có trình quay Replay (Flashback / ReplayMod) hỗ trợ MC ${mcVersion} ${effectiveLoader.toUpperCase()} — hãy thử Fabric hoặc phiên bản MC khác.`,
    effectiveLoader,
    installed,
    ffmpegReady: Boolean(ffmpegInfo?.found),
    status: getReplayStudioStatus({ gameDir: rootDir, instanceDir })
  };
}

/* ====================== v40.8 SERVERS 2.0 — NATIVE STATUS PING & servers.dat SYNC ====================== */
// Speaks the Minecraft "Server List Ping" protocol directly (like the in-game Multiplayer screen):
// SRV lookup → handshake → status JSON → ping/pong latency. No third-party website needed.
function slpWriteVarInt(value) {
  const bytes = [];
  let v = value >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    bytes.push(b);
  } while (v !== 0);
  return Buffer.from(bytes);
}

function slpReadVarInt(buf, offset) {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (pos < buf.length) {
    const b = buf[pos++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value: result, size: pos - offset };
    shift += 7;
    if (shift > 35) throw new Error('VarInt quá dài');
  }
  return null; // need more bytes
}

function slpPacket(id, payload) {
  const body = Buffer.concat([slpWriteVarInt(id), payload]);
  return Buffer.concat([slpWriteVarInt(body.length), body]);
}

function parseServerAddress(address) {
  let raw = String(address || '').trim();
  if (!raw) return null;
  raw = raw.replace(/^minecraft:\/\//i, '').replace(/\/.*$/, '');
  let host = raw;
  let port = 0;
  const v6 = raw.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (v6) {
    host = v6[1];
    port = Number(v6[2] || 0);
  } else if ((raw.match(/:/g) || []).length === 1) {
    const [h, p] = raw.split(':');
    host = h;
    port = Number(p) || 0;
  }
  if (!host) return null;
  return { host: host.toLowerCase(), port: port > 0 && port < 65536 ? port : 0 };
}

async function resolveMinecraftSrv(host) {
  const dns = require('dns').promises;
  if (net.isIP(host) || host === 'localhost') return null;
  try {
    const recs = await Promise.race([
      dns.resolveSrv(`_minecraft._tcp.${host}`),
      new Promise((_r, rej) => setTimeout(() => rej(new Error('srv-timeout')), 2000))
    ]);
    if (Array.isArray(recs) && recs.length) {
      recs.sort((a, b) => a.priority - b.priority || b.weight - a.weight);
      return { host: recs[0].name, port: recs[0].port };
    }
  } catch (_) {}
  return null;
}

function flattenMotd(desc) {
  if (desc == null) return '';
  if (typeof desc === 'string') return desc;
  let out = '';
  const walk = (node) => {
    if (node == null) return;
    if (typeof node === 'string') { out += node; return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node.text === 'string') out += node.text;
    else if (typeof node.translate === 'string') out += node.translate;
    if (Array.isArray(node.extra)) node.extra.forEach(walk);
  };
  walk(desc);
  return out;
}

function cleanMotdText(s) {
  return String(s || '')
    .replace(/§[0-9a-fk-orx]/gi, '')
    .replace(/[\u0000-\u0009\u000b-\u001f]/g, '')
    .split('\n').map((l) => l.replace(/\s{2,}/g, ' ').trim()).filter(Boolean).slice(0, 2).join('\n')
    .slice(0, 160);
}

function slpStatusOnce(host, port, handshakeHost, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    let buf = Buffer.alloc(0);
    let statusJson = null;
    let pingSentAt = 0;
    let finished = false;
    const done = (err, val) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { sock.destroy(); } catch (_) {}
      if (err) reject(err); else resolve(val);
    };
    const timer = setTimeout(() => {
      if (statusJson) done(null, { json: statusJson, latencyMs: 0 });
      else done(new Error('Hết thời gian chờ phản hồi'));
    }, timeoutMs);
    sock.setNoDelay(true);
    sock.on('connect', () => {
      const hostBuf = Buffer.from(handshakeHost, 'utf8');
      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(port);
      const handshake = slpPacket(0x00, Buffer.concat([
        slpWriteVarInt(767), // protocol id is ignored for status requests
        slpWriteVarInt(hostBuf.length), hostBuf, portBuf,
        slpWriteVarInt(1)
      ]));
      sock.write(Buffer.concat([handshake, slpPacket(0x00, Buffer.alloc(0))]));
    });
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        while (buf.length) {
          const len = slpReadVarInt(buf, 0);
          if (!len || buf.length < len.size + len.value) return;
          const packet = buf.subarray(len.size, len.size + len.value);
          buf = buf.subarray(len.size + len.value);
          const pid = slpReadVarInt(packet, 0);
          if (!pid) continue;
          if (pid.value === 0x00 && !statusJson) {
            const strLen = slpReadVarInt(packet, pid.size);
            const start = pid.size + strLen.size;
            statusJson = JSON.parse(packet.subarray(start, start + strLen.value).toString('utf8'));
            const payload = Buffer.alloc(8);
            payload.writeBigInt64BE(BigInt(Date.now()));
            pingSentAt = Date.now();
            sock.write(slpPacket(0x01, payload));
          } else if (pid.value === 0x01 && statusJson) {
            done(null, { json: statusJson, latencyMs: Math.max(1, Date.now() - pingSentAt) });
            return;
          }
        }
      } catch (e) {
        done(statusJson ? null : e, statusJson ? { json: statusJson, latencyMs: 0 } : undefined);
      }
    });
    sock.on('error', (e) => done(statusJson ? null : e, statusJson ? { json: statusJson, latencyMs: 0 } : undefined));
    sock.on('close', () => {
      if (statusJson) done(null, { json: statusJson, latencyMs: pingSentAt ? Math.max(1, Date.now() - pingSentAt) : 0 });
      else done(new Error('Máy chủ đóng kết nối'));
    });
  });
}

async function pingMinecraftServer(address, { timeoutMs = 4500 } = {}) {
  const parsed = parseServerAddress(address);
  if (!parsed) return { ok: false, online: false, error: 'Địa chỉ trống' };
  let target = { host: parsed.host, port: parsed.port || 25565 };
  if (!parsed.port) {
    const srv = await resolveMinecraftSrv(parsed.host);
    if (srv) target = srv;
  }
  const t0 = Date.now();
  const { json, latencyMs } = await slpStatusOnce(target.host, target.port, parsed.host, timeoutMs);
  const players = json?.players || {};
  const sample = Array.isArray(players.sample)
    ? players.sample.map((p) => cleanMotdText(p?.name || '')).filter((n) => n && !/^\s*$/.test(n)).slice(0, 12)
    : [];
  const favicon = typeof json?.favicon === 'string' && /^data:image\/png;base64,/i.test(json.favicon) ? json.favicon : null;
  return {
    ok: true,
    online: true,
    source: 'native',
    latencyMs: latencyMs || Math.max(1, Date.now() - t0),
    motd: cleanMotdText(flattenMotd(json?.description)),
    version: cleanMotdText(json?.version?.name || ''),
    protocol: Number(json?.version?.protocol) || 0,
    playersOnline: Number(players.online) || 0,
    playersMax: Number(players.max) || 0,
    playersSample: sample,
    icon: favicon,
    resolvedHost: `${target.host}:${target.port}`
  };
}

// servers.dat = uncompressed NBT { servers: [ { name, ip, icon?, acceptTextures? } ] }
function readServersDat(gameDir) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const datPath = path.join(rootDir, 'servers.dat');
  if (!fs.existsSync(datPath)) return { ok: true, path: datPath, servers: [] };
  try {
    let raw = fs.readFileSync(datPath);
    if (raw[0] === 0x1f && raw[1] === 0x8b) raw = zlib.gunzipSync(raw);
    const root = worldCreator._internal.readNbtRoot(raw);
    const list = root?.v?.servers?.v || [];
    const servers = list
      .map((c) => ({
        name: String(c?.v?.name?.v || ''),
        ip: String(c?.v?.ip?.v || '').trim(),
        icon: c?.v?.icon?.v ? `data:image/png;base64,${c.v.icon.v}` : ''
      }))
      .filter((s) => s.ip);
    return { ok: true, path: datPath, servers, root };
  } catch (err) {
    return { ok: false, path: datPath, servers: [], error: err.message };
  }
}

function syncServersDat(gameDir, launcherServers = [], { writeToGame = true, writeList = null } = {}) {
  const { nbt, TAG, writeNbtRoot } = worldCreator._internal;
  const cur = readServersDat(gameDir);
  if (!cur.ok) return { ok: false, error: cur.error, importedFromGame: [] };
  const norm = (ip) => String(ip || '').trim().toLowerCase().replace(/:25565$/, '');
  const launcherSet = new Set((launcherServers || []).map((s) => norm(s?.ip)));
  const gameSet = new Set(cur.servers.map((s) => norm(s.ip)));
  // servers the player added inside Minecraft → shown in the launcher too
  const importedFromGame = cur.servers
    .filter((s) => !launcherSet.has(norm(s.ip)))
    .map((s) => ({ name: s.name || s.ip, ip: s.ip, cat: 'vn', fromGame: true }));
  // launcher favourites → appear in the in-game Multiplayer list (keep the game's own order & icons)
  // writeList lets the UI push only the player's own / pinned servers (not the whole featured catalogue)
  const pushSource = Array.isArray(writeList) ? writeList : (launcherServers || []);
  const toAdd = pushSource.filter((s) => s && s.ip && !gameSet.has(norm(s.ip)) && !String(s.ip).includes('[object'));
  let wrote = false;
  if (writeToGame && toAdd.length) {
    let root = cur.root;
    if (!root || root.t !== TAG.COMPOUND) {
      root = nbt.compound({});
      root._rootName = '';
    }
    const existing = root.v.servers?.t === TAG.LIST ? root.v.servers.v : [];
    const added = toAdd.slice(0, 60).map((s) => nbt.compound({
      name: nbt.string(String(s.name || s.ip).slice(0, 64)),
      ip: nbt.string(String(s.ip).trim())
    }));
    root.v.servers = nbt.list(TAG.COMPOUND, [...existing, ...added]);
    try {
      if (fs.existsSync(cur.path)) fs.copyFileSync(cur.path, `${cur.path}.bw-bak`);
      const tmp = `${cur.path}.tmp`;
      fs.mkdirSync(path.dirname(cur.path), { recursive: true });
      fs.writeFileSync(tmp, writeNbtRoot(root));
      fs.renameSync(tmp, cur.path);
      wrote = true;
    } catch (err) {
      return { ok: false, error: err.message, importedFromGame };
    }
  }
  return { ok: true, importedFromGame, addedToGame: wrote ? toAdd.length : 0, gameCount: cur.servers.length };
}

/* ====================== v40.8 / v40.9 UNIVERSAL DRAG & DROP INSTALL ====================== */
// Looks inside the dropped file and puts it in the right place (mods / shaderpacks / resourcepacks / saves / OptiFine).
function classifyDroppedFile(filePath) {
  const lower = String(filePath || '').toLowerCase();
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return { kind: 'missing' };
  if (lower.endsWith('.mrpack')) return { kind: 'mrpack' };
  if (!/\.(jar|zip)$/.test(lower)) return { kind: 'unknown' };
  if (lower.endsWith('.jar')) {
    const ofInfo = inspectOptifineJar(filePath);
    if (ofInfo.isOptifine) {
      return { kind: 'optifine', mcVersion: ofInfo.mcVersion, hasInstaller: ofInfo.hasInstaller };
    }
  }
  let Zip = null;
  try { Zip = require('adm-zip'); } catch (_) { return { kind: lower.endsWith('.jar') ? 'mod' : 'unknown' }; }
  let names = [];
  try {
    names = new Zip(filePath).getEntries().map((e) => e.entryName.replace(/\\/g, '/'));
  } catch (_) {
    return { kind: 'broken' };
  }
  const has = (re) => names.some((n) => re.test(n));
  if (has(/^(fabric\.mod\.json|quilt\.mod\.json|META-INF\/(neoforge\.)?mods\.toml|mcmod\.info)$/i)) return { kind: 'mod' };
  if (lower.endsWith('.jar')) return { kind: 'mod' };
  if (has(/^([^/]+\/)?level\.dat$/i)) return { kind: 'world' };
  if (has(/^([^/]+\/)?shaders\//i)) return { kind: 'shader' };
  const hasMeta = has(/^([^/]+\/)?pack\.mcmeta$/i);
  if (hasMeta && has(/^([^/]+\/)?assets\//i)) return { kind: 'resourcepack' };
  if (hasMeta && has(/^([^/]+\/)?data\//i)) return { kind: 'datapack' };
  if (hasMeta) return { kind: 'resourcepack' };
  if (has(/^(modrinth\.index\.json|manifest\.json)$/i)) return { kind: 'modpack-zip' };
  return { kind: 'unknown' };
}

function installDroppedAddonFile({ gameDir, instanceDir = '', filePath, currentLoader = '', currentMcVersion = '' } = {}) {
  const rootDir = gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir();
  const targetDir = instanceDir && fs.existsSync(String(instanceDir)) ? String(instanceDir) : rootDir;
  const info = classifyDroppedFile(filePath);
  const baseName = path.basename(String(filePath || ''));
  const copyInto = (sub) => {
    const dir = path.join(targetDir, sub);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, baseName);
    if (path.resolve(dest) !== path.resolve(filePath)) fs.copyFileSync(filePath, dest);
    return dest;
  };
  switch (info.kind) {
    case 'optifine':
      return installOptifineJarSmart({
        gameDir: rootDir,
        instanceDir,
        filePath,
        currentLoader,
        currentMcVersion,
        action: 'auto'
      });
    case 'mod': {
      const dest = copyInto('mods');
      let loaders = [];
      try {
        const meta = inspectJarModMetadata(dest);
        loaders = Array.isArray(meta?.inspectedLoaders) ? meta.inspectedLoaders : (Array.isArray(meta?.loaders) ? meta.loaders : []);
      } catch (_) {}
      try { setModUserDisabledFlags(path.join(targetDir, 'mods'), baseName, false); } catch (_) {}
      return { ok: true, kind: 'mod', fileName: baseName, loaders, targetDir };
    }
    case 'shader': {
      copyInto('shaderpacks');
      try { equipShaderInGame(targetDir, baseName); } catch (_) {}
      return { ok: true, kind: 'shader', fileName: baseName, targetDir };
    }
    case 'resourcepack': {
      copyInto('resourcepacks');
      try { equipResourcePackInGame(targetDir, baseName, true); } catch (_) {}
      return { ok: true, kind: 'resourcepack', fileName: baseName, targetDir };
    }
    case 'world': {
      const r = importWorldZip(rootDir, filePath);
      return { ...(r || {}), ok: Boolean(r?.ok), kind: 'world', fileName: baseName };
    }
    case 'mrpack':
    case 'modpack-zip':
      return { ok: true, kind: 'mrpack', deferred: true, fileName: baseName, filePath };
    case 'datapack':
      return { ok: false, kind: 'datapack', fileName: baseName, error: 'Đây là Datapack — hãy mở thẻ Thế giới → chọn Map → "Datapack" để thêm vào đúng thế giới.' };
    case 'broken':
      return { ok: false, kind: 'broken', fileName: baseName, error: 'File nén bị hỏng hoặc tải chưa xong.' };
    default:
      return { ok: false, kind: info.kind, fileName: baseName, error: 'Không nhận ra loại file này (hỗ trợ: Mod .jar, OptiFine .jar, Shader/Resource Pack .zip, Map .zip, Modpack .mrpack).' };
  }
}

module.exports = {
  applyGentleSmoothOptions,
  applyGentleJvmTuning,
  computeGentleFpsCap,
  fetchVersionManifest,
  fetchLoaderVersions,
  getInstalledVersions,
  searchModrinth,
  installModrinthProject,
  installFpsBoostPack,
  installOptifineParityPack,
  inspectOptifineJar,
  parkOptifineConflictsInMods,
  installOptifineJarSmart,
  listLocalAddons,
  toggleLocalAddon,
  deleteLocalAddon,
  equipShaderInGame,
  equipResourcePackInGame,
  getEquippedAddonsState,
  applySmartGameOptions,
  inspectJarModMetadata,
  doesMcVersionSatisfySpec,
  ensureModsMatchVersion,
  listLocalWorlds,
  saveCustomLocalSkin,
  launchMinecraft,
  forceKillMinecraft,
  cleanupJavaTempAndTrimRam,
  getDefaultGameDir,
  detectJavaPath,
  downloadPortableJava,
  scanExternalLaunchers,
  importFromExternalLauncher,
  setCurseForgeApiKey,
  getCurseForgeApiKey,
  checkCurseForgeKey,
  scorePackForModernPlay,
  searchPackHub,
  getPackHubDetails,
  installPackHub,
  importPackFromFile,
  importPackFromUrl,
  listPackInstances,
  deletePackInstance,
  touchPackInstance,
  resolveManualDownloads,
  getInstancesRoot,
  equipPackInstanceIsland,
  ensureDefaultIslandWorldPresetJar,
  installQuickIslandPack,
  translateTextToVi,
  getLocalLanIpAddresses,
  scanLanWorlds,
  prepareCoopHostMods,
  syncAllLocalModsToVersion,
  buildCoopModBasket,
  syncCoopModBasket,
  analyzeMinecraftCrash,
  backupLocalWorld,
  autoBackupModifiedWorlds,
  listWorldBackups,
  restoreWorldBackup,
  deleteWorldBackup,
  exportWorldZip,
  importWorldZip,
  listLocalScreenshots,
  deleteLocalScreenshot,
  previewExportTarget,
  exportTargetAsMrpack,
  scanMinecraftJunk,
  cleanMinecraftJunk,
  readGameOptionsAndKeybinds,
  saveGameOptionsAndKeybinds,
  autoResolveKeybindConflicts,
  toggleFullbrightPack,
  checkLocalAddonsUpdates,
  updateLocalAddons,
  rollbackLocalAddon,
  searchWorldAndDatapackStore,
  installStoreWorldOrDatapack,
  listWorldDatapacks,
  deleteWorldDatapack,
  installCoopComboPack,
  computeSmartRamAndJvmAdvice,
  searchOnlineSkins,
  applyOnlineSkinToWardrobe,
  installFriendSkinSyncPack,
  getPvpClientModeState,
  togglePvpClientMode,
  inspectLocalWorldDetails,
  rescuePatchLocalWorld,
  getCuratedSeedsVault,
  createStandaloneQuickWorld,
  getReplayStudioStatus,
  ensurePortableFfmpeg,
  installReplayStudioPack,
  saveCustomLocalCape,
  removeCustomLocalCape,
  getCustomLocalCape,
  configureCrackSkinSupport,
  setModUserDisabledFlags,
  normalizeKeyCodeForConflict,
  pingMinecraftServer,
  parseServerAddress,
  readServersDat,
  syncServersDat,
  classifyDroppedFile,
  installDroppedAddonFile,
  findInstalledOptifineProfiles,
  resolveOptifineRuntimePlan,
  ensureVanillaBaseForOptifine,
  inspectOptifineJar
};