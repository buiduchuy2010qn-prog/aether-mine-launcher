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

async function fetchLoaderVersions(mcVersion, loaderType) {
  if (loaderType === 'vanilla') return [];

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
  const clean = String(fileName).replace(/\.disabled$/i, '').replace(/\.jar$/i, '');
  if (/^fabric-language-kotlin/i.test(clean)) return '';
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
      // Auto-install Iris + Sodium if user is on Fabric/Quilt/NeoForge and doesn't have a shader mod yet
      if (!_isDep && ['fabric', 'quilt', 'neoforge'].includes(effectiveLoader)) {
        try {
          const modsFolder = path.join(rootDir, 'mods');
          const curMods = fs.existsSync(modsFolder) ? fs.readdirSync(modsFolder).filter((f) => /\.jar$/i.test(f)) : [];
          const hasShaderMod = curMods.some((f) => /\b(iris|oculus|optifine|optifabric)\b/i.test(f));
          if (!hasShaderMod) {
            onStatus?.(`✨ Tự động trang bị trình chạy Shader (Iris + Sodium) cho MC ${mcVersion}...`);
            for (const depSlug of ['sodium', 'iris']) {
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
      if (hadSkinSync) items.push('file/AetherSkinSync.zip');
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

function applySmartGameOptions(gameDirectory, { autoViLang = false, potatoGraphicsPreset = false } = {}) {
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
      setOpt('maxFps', '120');
      setOpt('gamma', '1.0');
    }
    fs.writeFileSync(optsPath, content, 'utf8');
  } catch (_) {}
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

  const effectiveLoader = loaderType === 'legacyfabric' ? 'fabric' : loaderType;
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

  // Step 1: Re-enable any cached .jar.disabled files that strictly match target mcVersion + effectiveLoader
  for (const f of files) {
    if (!f.toLowerCase().endsWith('.disabled')) continue;
    const cleanName = f.replace(/\.disabled$/i, '');
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
  const effectiveLoader = loaderType === 'forge' ? 'forge' : (loaderType === 'neoforge' ? 'neoforge' : 'fabric');
  const packSlugs =
    effectiveLoader === 'forge'
      ? ['embeddium', 'ferrite-core', 'entityculling', 'immediatelyfast']
      : effectiveLoader === 'neoforge'
        ? ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'iris']
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
        if (fs.existsSync(iconPath)) {
          try { iconDataUrl = `data:image/png;base64,${fs.readFileSync(iconPath).toString('base64')}`; } catch (_) {}
        }
        return {
          name: d.name,
          folderName: d.name,
          path: wPath,
          lastPlayed,
          mtimeMs,
          version,
          gameMode,
          iconDataUrl,
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
    potatoGraphicsPreset = false
  } = config;

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
        syncActive3DSkinIntoGame(skinRoot, cleanName, skinDataUrl, mcVersion);
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
      syncActive3DSkinIntoGame(skinRoot, cleanName, skinDataUrl, mcVersion);
    }
  } else {
    const cleanName = (username || 'Player').trim().slice(0, 16) || 'Player';
    callbacks.onStatus?.(`Đang đồng bộ Skin 3D & khởi tạo tài khoản "${cleanName}"...`);
    authorization = buildOfflineAuthFallback(cleanName, skinModel);
    if (crackSkinSync) {
      configureCrackSkinSupport(skinRoot);
    }
    if (skinDataUrl) {
      syncActive3DSkinIntoGame(skinRoot, cleanName, skinDataUrl, mcVersion);
    }
  }

  // v40.4 PRO: Apply smart in-game options.txt presets (Vietnamese language & Low-PC smooth FPS preset)
  applySmartGameOptions(gameDirectory, {
    autoViLang: Boolean(autoViLang),
    potatoGraphicsPreset: Boolean(potatoGraphicsPreset)
  });

  if (gameDirectory === rootDir) {
    await ensureModsMatchVersion(rootDir, mcVersion, loaderType, callbacks.onStatus);
  } else {
    // v40.4.1 PRO: Ensure SkyBlock / OneBlock instances auto-default "World Type: Default" to Void Island!
    try {
      const instMeta = readInstanceMeta(gameDirectory);
      const instHint = `${config?.packName || ''} ${instMeta?.name || ''} ${path.basename(gameDirectory)}`;
      if (instMeta?.autoIslandMode || /(one\s*block|one_?block|sky\s*block|sky_?block)/i.test(instHint)) {
        ensureDefaultIslandWorldPresetJar(gameDirectory, mcVersion, loaderType);
      }
    } catch (_) {}
  }
  const loaderPrep = await prepareCustomLoaderJson(
    rootDir,
    mcVersion,
    loaderType,
    loaderVersion,
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
    launchOpts.quickPlay = { type: 'multiplayer', identifier: serverIp.trim() };
    launchOpts.server = { host, port: port || '25565' };
  } else if (worldFolderName && String(worldFolderName).trim()) {
    const cleanWorldFolder = path.basename(String(worldFolderName).trim());
    if (cleanWorldFolder && supportsQuickPlaySingleplayer(mcVersion)) {
      launchOpts.quickPlay = { type: 'singleplayer', identifier: cleanWorldFolder };
      callbacks.onStatus?.(`⚡ Đang mở thẳng vào thế giới "${cleanWorldFolder}" (MC ${mcVersion})...`);
    } else if (cleanWorldFolder) {
      callbacks.onStatus?.(`ℹ️ Phiên bản MC ${mcVersion} (< 1.20) mở ra Menu chính — hãy chọn thế giới "${cleanWorldFolder}" trong Chơi đơn.`);
    }
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
      try { if (!fs.existsSync(dFull)) fs.copyFileSync(sFull, dFull); copiedFiles++; } catch (_) {} if (false) {
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

async function searchPackHub(params = {}) {
  const query = String(params.query || '').trim();
  const kind = ['modpack', 'datapack', 'world'].includes(params.kind) ? params.kind : 'modpack';
  const mcVersion = String(params.mcVersion || '').trim();
  const loader = SUPPORTED_LOADERS.includes(params.loader) ? params.loader : '';
  const source = String(params.source || 'all');
  const offset = Math.max(0, Number(params.offset) || 0);
  const limit = Math.max(6, Math.min(40, Number(params.limit) || 24));
  const sort = params.sort || '';

  const sourcesForKind = kind === 'modpack'
    ? ['modrinth', 'curseforge', 'ftb', 'technic', 'atlauncher']
    : ['modrinth', 'curseforge'];
  const active = source === 'all' ? sourcesForKind : sourcesForKind.filter((s) => s === source);
  const perSource = source === 'all' ? Math.max(6, Math.ceil(limit / Math.max(1, active.length)) + 4) : limit;
  const perOffset = source === 'all' ? Math.floor(offset / Math.max(1, active.length)) : offset;

  const runners = {
    modrinth: () => searchModrinthPacks({ query, kind, mcVersion, loader, offset: perOffset, limit: perSource, sort }),
    curseforge: () => searchCurseForgePacks({ query, kind, mcVersion, loader, offset: perOffset, limit: perSource }),
    ftb: () => searchFtbPacks({ query, mcVersion, loader, offset: perOffset, limit: perSource }),
    technic: () => searchTechnicPacks({ query, mcVersion, offset: perOffset, limit: perSource }),
    atlauncher: () => searchAtlPacks({ query, mcVersion, offset: perOffset, limit: perSource })
  };

  const totals = {};
  const warnings = [];
  const groups = await Promise.all(active.map(async (s) => {
    try {
      const r = await runners[s]();
      totals[s] = r.total;
      if (s === 'curseforge' && r.limited) warnings.push('CF_SEARCH_LIMITED');
      return r.items;
    } catch (e) {
      totals[s] = null;
      warnings.push(e.code === 'NO_CF_KEY' ? 'NO_CF_KEY' : `${s.toUpperCase()}: ${e.message}`);
      return [];
    }
  }));

  let items;
  if (source === 'all') {
    // Trộn xen kẽ theo nguồn để kết quả đa dạng, mỗi nguồn giữ thứ tự riêng
    items = [];
    const maxLen = Math.max(0, ...groups.map((g) => g.length));
    for (let i = 0; i < maxLen; i++) {
      for (const g of groups) if (g[i]) items.push(g[i]);
    }
  } else {
    items = groups[0] || [];
  }
  if (kind === 'modpack' && /\b(sky\s*block|one\s*block)\b/i.test(query)) {
    items.sort((a, b) => Number(Boolean(a.isHypixelClient)) - Number(Boolean(b.isHypixelClient)));
  }
  return { ok: true, items, totals, warnings, kind, source };
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
      modCount: result.modCount || 0,
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
    const data = await packFetchJson(url, { timeout: 5500 });
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const joined = data[0].map((seg) => (Array.isArray(seg) ? seg[0] || '' : '')).join('');
      const polished = polishMinecraftVietnamese(joined);
      if (polished) {
        cache[key] = polished;
        scheduleSaveViCache();
        return polished;
      }
    }
  } catch (_) {}
  return clean;
}

async function translateTextToVi(input, cacheDir = '') {
  if (Array.isArray(input)) {
    const out = await Promise.all(input.map((t) => translateSingleToVi(t, cacheDir)));
    return { ok: true, results: out };
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

async function prepareCoopHostMods({ mcVersion = '1.21.4', loaderType = 'fabric', gameDir, instanceDir, enableE4mc = true, enableCustomLan = true }, onStatus) {
  const targetDir = (instanceDir && fs.existsSync(instanceDir))
    ? instanceDir
    : (gameDir && gameDir.trim() ? gameDir.trim() : getDefaultGameDir());
  const effectiveLoader = (!loaderType || loaderType === 'vanilla' || loaderType === 'legacyfabric') ? 'fabric' : loaderType;
  const installed = [];
  const warnings = [];

  if (enableE4mc) {
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
  immediatelyfast: 'immediatelyfast'
};

async function syncAllLocalModsToVersion({ gameDir, instanceDir, mcVersion = '1.21.4', loaderType = 'fabric' }, onStatus) {
  const rootDir = (instanceDir && fs.existsSync(instanceDir))
    ? instanceDir
    : (gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir());
  const modsFolder = path.join(rootDir, 'mods');
  if (!fs.existsSync(modsFolder)) fs.mkdirSync(modsFolder, { recursive: true });

  const effectiveLoader = (!loaderType || loaderType === 'vanilla' || loaderType === 'legacyfabric') ? 'fabric' : loaderType;
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

  return {
    ok: true,
    mcVersion,
    loaderType,
    modsCount: modBasket.length,
    modBasket,
    basket: modBasket
  };
}

async function syncCoopModBasket({ gameDir, instanceDir, mcVersion = '1.21.4', loaderType = 'fabric', modBasket = [] } = {}, onStatus) {
  const rootDir = (instanceDir && fs.existsSync(instanceDir))
    ? instanceDir
    : (gameDir && String(gameDir).trim() ? String(gameDir).trim() : getDefaultGameDir());
  const modsFolder = path.join(rootDir, 'mods');
  if (!fs.existsSync(modsFolder)) fs.mkdirSync(modsFolder, { recursive: true });

  const effectiveLoader = (!loaderType || loaderType === 'vanilla' || loaderType === 'legacyfabric') ? 'fabric' : loaderType;
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
  if ((loaderType === 'fabric' || loaderType === 'quilt') && !activeMods.some((f) => /fabric-api/i.test(f))) {
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
  const instRoot = path.join(rootDir, 'instances');
  if (fs.existsSync(instRoot)) {
    try {
      for (const d of fs.readdirSync(instRoot, { withFileTypes: true })) {
        if (d.isDirectory()) {
          const sDir = path.join(instRoot, d.name, 'screenshots');
          if (fs.existsSync(sDir)) candidateDirs.push(sDir);
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

/* ---------------- 7. v40.4 PRO: 1-Click .mrpack Exporter & Smart Disk Cleaner ---------------- */
async function exportTargetAsMrpack({
  gameDir,
  targetDir,
  packName = '',
  mcVersion = '1.21.4',
  loaderType = 'fabric',
  loaderVersion = '',
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

  const subFolders = [
    { rel: 'mods', rx: /\.jar$/i },
    { rel: 'shaderpacks', rx: /\.zip$/i },
    { rel: 'resourcepacks', rx: /\.zip$/i }
  ];

  const candidateFiles = [];
  for (const sf of subFolders) {
    const dir = path.join(rootDir, sf.rel);
    if (!fs.existsSync(dir)) continue;
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!sf.rx.test(f) || f === 'AetherSkinSync.zip') continue;
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

  // Include active shader config & servers.dat (never account tokens!) in overrides
  const irisCfg = path.join(rootDir, 'config', 'iris.properties');
  if (fs.existsSync(irisCfg)) {
    try { zip.addFile('overrides/config/iris.properties', fs.readFileSync(irisCfg)); } catch (_) {}
  }
  const serversDat = path.join(rootDir, 'servers.dat');
  if (fs.existsSync(serversDat)) {
    try { zip.addFile('overrides/servers.dat', fs.readFileSync(serversDat)); } catch (_) {}
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
  exportTargetAsMrpack,
  scanMinecraftJunk,
  cleanMinecraftJunk
};