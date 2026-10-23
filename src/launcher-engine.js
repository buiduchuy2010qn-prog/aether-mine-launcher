const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const EventEmitter = require('events');
const AdmZip = require('adm-zip');
const { Client } = require('minecraft-launcher-core');
const Handler = require('minecraft-launcher-core/components/handler');
const { authenticateMinecraftChain } = require('./microsoft-auth');

/**
 * ULTRA-FAST LAUNCH OPTIMIZATIONS:
 * 1. Skip redundant SHA-1 hashing of 3,500+ asset files if file exists and size > 0 (10x faster launch!)
 * 2. Skip arm64 / x86 native library duplicates on x64 Windows
 * 3. Support 2026+ versioning (26.x) alongside 1.x.y
 */
const origCheckSum = Handler.prototype.checkSum;
Handler.prototype.checkSum = async function (hash, file) {
  try {
    if (fs.existsSync(file)) {
      const stat = fs.statSync(file);
      if (stat.size > 0) {
        return true; // Instant verification for already-downloaded assets/libraries
      }
    }
  } catch (_) {}
  return origCheckSum.call(this, hash, file);
};

const origParseRule = Handler.prototype.parseRule;
Handler.prototype.parseRule = function (lib) {
  if (lib && lib.name && process.platform === 'win32' && process.arch === 'x64') {
    if (lib.name.endsWith(':natives-windows-arm64') || lib.name.endsWith(':natives-windows-x86')) {
      return true;
    }
  }
  return origParseRule.call(this, lib);
};

const origGetNatives = Handler.prototype.getNatives;
Handler.prototype.getNatives = async function () {
  if (this.version && this.version.id) {
    const parts = this.version.id.split('.');
    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);
    if (major >= 26 || (major === 1 && minor >= 19)) {
      return this.options.overrides.cwd || this.options.root;
    }
  }
  return origGetNatives.call(this);
};

const origIsModernForge = Handler.prototype.isModernForge;
Handler.prototype.isModernForge = function (json) {
  if (!json || !json.inheritsFrom) return false;
  const parts = json.inheritsFrom.split('.');
  const major = parseInt(parts[0], 10);
  if (major >= 26) return true;
  return origIsModernForge.call(this, json);
};

Handler.prototype.getJar = async function () {
  const targetDir = this.options.mcPath ? path.dirname(this.options.mcPath) : this.options.directory;
  const targetName = this.options.mcPath ? path.basename(this.options.mcPath) : `${this.options.version.number}.jar`;
  await this.downloadAsync(this.version.downloads.client.url, targetDir, targetName, true, 'version-jar');
  fs.writeFileSync(path.join(this.options.directory, `${this.options.version.number}.json`), JSON.stringify(this.version, null, 4));
  return this.client.emit('debug', '[MCLC]: Downloaded version jar and wrote version json');
};

function generateOfflineUUID(username) {
  const cleanName = (username || 'Player').trim() || 'Player';
  const md5Bytes = crypto.createHash('md5').update(`OfflinePlayer:${cleanName}`, 'utf8').digest();
  md5Bytes[6] = (md5Bytes[6] & 0x0f) | 0x30;
  md5Bytes[8] = (md5Bytes[8] & 0x3f) | 0x80;
  const hex = md5Bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function createOfflineAuth(username) {
  const cleanName = (username || 'Player').trim() || 'Player';
  const uuid = generateOfflineUUID(cleanName);
  return {
    access_token: uuid,
    client_token: uuid,
    uuid: uuid,
    name: cleanName,
    user_properties: '{}',
    meta: {
      type: 'mojang',
      demo: false
    }
  };
}

function createMicrosoftAuth(msAccount) {
  return {
    access_token: msAccount.accessToken,
    client_token: msAccount.uuid,
    uuid: msAccount.uuid,
    name: msAccount.name,
    user_properties: '{}',
    meta: {
      type: 'msa',
      xuid: msAccount.xuid || '',
      demo: false
    }
  };
}

async function downloadFileWithProgress(url, destPath, onProgress) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const response = await fetch(url, {
    headers: { 'User-Agent': 'AetherMineLauncher/3.0' },
    redirect: 'follow'
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} khi tải ${url}`);
  }
  const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
  let receivedBytes = 0;

  const fileStream = fs.createWriteStream(destPath);
  const reader = response.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.length;
      fileStream.write(Buffer.from(value));
      if (onProgress) {
        onProgress(receivedBytes, totalBytes);
      }
    }
  } finally {
    fileStream.end();
    await new Promise((resolve) => fileStream.once('close', resolve));
  }
  return destPath;
}

function findJavaExecutable(dirPath) {
  if (!fs.existsSync(dirPath)) return null;
  const directBin = path.join(dirPath, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  if (fs.existsSync(directBin)) return directBin;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subBin = path.join(dirPath, entry.name, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
      if (fs.existsSync(subBin)) return subBin;
      const found = findJavaExecutable(path.join(dirPath, entry.name));
      if (found) return found;
    }
  }
  return null;
}

function getInstalledRuntimes(gameDir) {
  const runtimesDir = path.join(gameDir, 'runtimes');
  const supported = [8, 17, 21, 25];
  const result = {};
  for (const major of supported) {
    const jreDir = path.join(runtimesDir, `jre-${major}`);
    const javaExe = findJavaExecutable(jreDir);
    result[major] = {
      installed: Boolean(javaExe),
      path: javaExe || null
    };
  }
  return result;
}

async function ensureJavaRuntime(majorVersion, gameDir, emitStatus) {
  const jreDir = path.join(gameDir, 'runtimes', `jre-${majorVersion}`);
  const existingExe = findJavaExecutable(jreDir);
  if (existingExe) {
    return existingExe;
  }

  emitStatus?.({
    stage: 'java',
    message: `Đang tìm bản Java ${majorVersion} (Eclipse Temurin JRE)...`,
    percent: 5
  });

  const apiUrl = `https://api.adoptium.net/v3/assets/latest/${majorVersion}/hotspot?architecture=x64&image_type=jre&os=windows`;
  let assets = await fetch(apiUrl, { headers: { 'User-Agent': 'AetherMineLauncher/3.0' } }).then(r => r.json());
  if (!Array.isArray(assets) || assets.length === 0) {
    const jdkUrl = `https://api.adoptium.net/v3/assets/latest/${majorVersion}/hotspot?architecture=x64&image_type=jdk&os=windows`;
    assets = await fetch(jdkUrl, { headers: { 'User-Agent': 'AetherMineLauncher/3.0' } }).then(r => r.json());
  }
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error(`Không tìm thấy gói cài đặt Java ${majorVersion} trên Adoptium API.`);
  }

  const pkg = assets[0].binary.package;
  const zipPath = path.join(gameDir, 'runtimes', `jre-${majorVersion}.zip`);

  await downloadFileWithProgress(pkg.link, zipPath, (current, total) => {
    const mbCurrent = (current / 1024 / 1024).toFixed(1);
    const mbTotal = total ? (total / 1024 / 1024).toFixed(1) : '?';
    const pct = total ? Math.round((current / total) * 85) + 5 : 50;
    emitStatus?.({
      stage: 'java',
      message: `Đang tải Java ${majorVersion}: ${mbCurrent} MB / ${mbTotal} MB`,
      percent: pct
    });
  });

  emitStatus?.({
    stage: 'java',
    message: `Đang giải nén Java ${majorVersion}...`,
    percent: 92
  });

  fs.mkdirSync(jreDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(jreDir, true);
  try {
    fs.unlinkSync(zipPath);
  } catch (_) {}

  const javaExe = findJavaExecutable(jreDir);
  if (!javaExe) {
    throw new Error(`Giải nén Java ${majorVersion} hoàn tất nhưng không tìm thấy java.exe.`);
  }

  emitStatus?.({
    stage: 'java',
    message: `Cài đặt Java ${majorVersion} hoàn tất!`,
    percent: 100
  });

  return javaExe;
}

async function fetchVersionManifest(gameDir) {
  const cacheFile = path.join(gameDir, 'cache', 'version_manifest_v2.json');
  try {
    const res = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', {
      headers: { 'User-Agent': 'AetherMineLauncher/3.0' }
    });
    if (res.ok) {
      const data = await res.json();
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(data));
      return data;
    }
  } catch (err) {
    if (fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
    throw err;
  }
  if (fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  }
  throw new Error('Không thể tải danh sách phiên bản từ Mojang.');
}

async function fetchVersionJson(versionId, gameDir) {
  const localPath = path.join(gameDir, 'versions', versionId, `${versionId}.json`);
  if (fs.existsSync(localPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(localPath, 'utf8'));
      if (parsed && parsed.downloads && parsed.libraries) {
        return parsed;
      }
    } catch (_) {}
  }

  const manifest = await fetchVersionManifest(gameDir);
  const entry = manifest.versions.find(v => v.id === versionId);
  if (!entry) {
    throw new Error(`Không tìm thấy phiên bản ${versionId} trong dữ liệu Mojang.`);
  }

  const res = await fetch(entry.url);
  if (!res.ok) {
    throw new Error(`Không thể tải cấu hình phiên bản ${versionId}.`);
  }
  const vJson = await res.json();
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, JSON.stringify(vJson, null, 2));
  return vJson;
}

function getRequiredJavaVersion(versionJson) {
  if (versionJson && versionJson.javaVersion && versionJson.javaVersion.majorVersion) {
    const major = versionJson.javaVersion.majorVersion;
    if (major >= 25) return 25;
    if (major >= 21) return 21;
    if (major >= 16) return 17;
    return 8;
  }
  return 8;
}

/**
 * CORE 1 & 2: Fabric (1.14+) & Legacy Fabric (1.8.9 / 1.12.2 / 1.7.10)
 */
async function prepareFabricOrLegacyVersion(mcVersion, gameDir, emitStatus, forceLegacy = false) {
  const isOldMc = mcVersion.startsWith('1.8') || mcVersion.startsWith('1.12') || mcVersion.startsWith('1.7') || forceLegacy;
  const metaBase = isOldMc ? 'https://meta.legacyfabric.net/v2' : 'https://meta.fabricmc.net/v2';
  const coreLabel = isOldMc ? 'Legacy Fabric' : 'Fabric Loader';

  emitStatus?.({
    stage: 'loader',
    message: `Đang kiểm tra ${coreLabel} cho ${mcVersion}...`,
    percent: 15
  });

  const loadersUrl = `${metaBase}/versions/loader/${encodeURIComponent(mcVersion)}`;
  const res = await fetch(loadersUrl, { headers: { 'User-Agent': 'AetherMineLauncher/3.0' } });
  if (!res.ok) {
    if (!isOldMc) {
      // Automatic fallback to Legacy Fabric if standard Fabric doesn't support this old version
      return prepareFabricOrLegacyVersion(mcVersion, gameDir, emitStatus, true);
    }
    throw new Error(`${coreLabel} chưa hỗ trợ phiên bản ${mcVersion}. Hãy thử chọn Vanilla hoặc Forge.`);
  }
  const loaders = await res.json();
  if (!Array.isArray(loaders) || loaders.length === 0) {
    if (!isOldMc) {
      return prepareFabricOrLegacyVersion(mcVersion, gameDir, emitStatus, true);
    }
    throw new Error(`Phiên bản ${mcVersion} chưa có ${coreLabel} hỗ trợ.`);
  }

  const chosen = loaders.find(l => l.loader && l.loader.stable) || loaders[0];
  const loaderVersion = chosen.loader.version;
  const prefix = isOldMc ? 'legacy-fabric-loader' : 'fabric-loader';
  const customId = `${prefix}-${loaderVersion}-${mcVersion}`;
  const customDir = path.join(gameDir, 'versions', customId);
  const customJsonPath = path.join(customDir, `${customId}.json`);

  if (!fs.existsSync(customJsonPath)) {
    emitStatus?.({
      stage: 'loader',
      message: `Đang tải cấu hình ${coreLabel} ${loaderVersion} cho ${mcVersion}...`,
      percent: 30
    });
    const profileUrl = `${metaBase}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`;
    const profRes = await fetch(profileUrl, { headers: { 'User-Agent': 'AetherMineLauncher/3.0' } });
    if (!profRes.ok) {
      throw new Error(`Không thể tải profile JSON của ${coreLabel} (${profRes.status}).`);
    }
    const profileJson = await profRes.json();
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(customJsonPath, JSON.stringify(profileJson, null, 2));
  }

  const profileJson = JSON.parse(fs.readFileSync(customJsonPath, 'utf8'));
  return { customId, loaderVersion, profileJson };
}

/**
 * CORE 3: Quilt Loader (meta.quiltmc.org)
 */
async function prepareQuiltVersion(mcVersion, gameDir, emitStatus) {
  emitStatus?.({
    stage: 'loader',
    message: `Đang kiểm tra Quilt Loader cho ${mcVersion}...`,
    percent: 15
  });

  const loadersUrl = `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mcVersion)}`;
  const res = await fetch(loadersUrl, { headers: { 'User-Agent': 'AetherMineLauncher/3.0' } });
  if (!res.ok) {
    throw new Error(`Quilt Loader không hỗ trợ phiên bản ${mcVersion}.`);
  }
  const loaders = await res.json();
  if (!Array.isArray(loaders) || loaders.length === 0) {
    throw new Error(`Phiên bản ${mcVersion} hiện chưa có Quilt Loader hỗ trợ.`);
  }

  const chosen = loaders.find(l => l.loader && !l.loader.version.includes('beta')) || loaders[0];
  const loaderVersion = chosen.loader.version;
  const customId = `quilt-loader-${loaderVersion}-${mcVersion}`;
  const customDir = path.join(gameDir, 'versions', customId);
  const customJsonPath = path.join(customDir, `${customId}.json`);

  if (!fs.existsSync(customJsonPath)) {
    emitStatus?.({
      stage: 'loader',
      message: `Đang tải cấu hình Quilt ${loaderVersion} cho ${mcVersion}...`,
      percent: 30
    });
    const profileUrl = `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`;
    const profRes = await fetch(profileUrl, { headers: { 'User-Agent': 'AetherMineLauncher/3.0' } });
    if (!profRes.ok) {
      throw new Error(`Không thể tải profile JSON của Quilt (${profRes.status}).`);
    }
    const profileJson = await profRes.json();
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(customJsonPath, JSON.stringify(profileJson, null, 2));
  }

  const profileJson = JSON.parse(fs.readFileSync(customJsonPath, 'utf8'));
  return { customId, loaderVersion, profileJson };
}

/**
 * CORE 4: Forge Installer JAR
 */
async function prepareForgeInstaller(mcVersion, gameDir, emitStatus) {
  emitStatus?.({
    stage: 'loader',
    message: `Đang tra cứu phiên bản Forge cho ${mcVersion}...`,
    percent: 15
  });

  const promoRes = await fetch('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json', {
    headers: { 'User-Agent': 'AetherMineLauncher/3.0' }
  });
  if (!promoRes.ok) {
    throw new Error('Không thể kết nối máy chủ Minecraft Forge.');
  }
  const promoData = await promoRes.json();
  const promos = promoData.promos || {};
  const forgeBuild = promos[`${mcVersion}-recommended`] || promos[`${mcVersion}-latest`];
  if (!forgeBuild) {
    throw new Error(`Phiên bản ${mcVersion} chưa có bản Forge chính thức. Hãy thử chọn Fabric hoặc Quilt.`);
  }

  const forgeDir = path.join(gameDir, 'forge', mcVersion);
  const installerPath = path.join(forgeDir, `forge-${mcVersion}-${forgeBuild}-installer.jar`);

  if (!fs.existsSync(installerPath)) {
    const urlsToTry = [
      `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeBuild}/forge-${mcVersion}-${forgeBuild}-installer.jar`,
      `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeBuild}-${mcVersion}/forge-${mcVersion}-${forgeBuild}-${mcVersion}-installer.jar`
    ];

    let downloaded = false;
    for (const url of urlsToTry) {
      try {
        await downloadFileWithProgress(url, installerPath, (cur, tot) => {
          const pct = tot ? Math.round((cur / tot) * 70) + 20 : 50;
          emitStatus?.({
            stage: 'loader',
            message: `Đang tải Forge ${forgeBuild}: ${(cur / 1024 / 1024).toFixed(1)} MB`,
            percent: pct
          });
        });
        downloaded = true;
        break;
      } catch (_) {}
    }

    if (!downloaded) {
      throw new Error(`Không thể tải bộ cài Forge ${mcVersion}-${forgeBuild} từ Maven.`);
    }
  }

  return { forgeBuild, installerPath };
}

class MinecraftLauncherEngine extends EventEmitter {
  constructor() {
    super();
    this.activeProcess = null;
  }

  async launchGame(config, onMicrosoftAccountRefreshed) {
    const {
      authMode = 'offline',
      username = 'Steve',
      msAccount = null,
      mcVersion = '1.20.4',
      loader = 'fabric', // 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'legacy-fabric'
      ramMb = 4096,
      gameDir,
      customJavaPath = '',
      fpsBoostJvm = true,
      windowWidth = 1280,
      windowHeight = 720,
      fullscreen = false
    } = config;

    const emitStatus = (payload) => this.emit('status', payload);
    const emitLog = (line) => this.emit('log', line);

    fs.mkdirSync(gameDir, { recursive: true });
    fs.mkdirSync(path.join(gameDir, 'mods'), { recursive: true });
    fs.mkdirSync(path.join(gameDir, 'resourcepacks'), { recursive: true });
    fs.mkdirSync(path.join(gameDir, 'shaderpacks'), { recursive: true });

    // 1. Resolve Dual-Auth
    let auth;
    if (authMode === 'microsoft') {
      if (!msAccount || !msAccount.accessToken) {
        throw new Error('Bạn đang chọn chế độ Bản Quyền nhưng chưa đăng nhập tài khoản Microsoft! Hãy bấm nút "Đăng nhập Microsoft" hoặc chuyển sang tab Offline (Crack).');
      }
      let activeMs = msAccount;
      if (activeMs.expiresAt && Date.now() > activeMs.expiresAt && activeMs.refreshToken) {
        emitStatus({ stage: 'init', message: 'Đang tự động gia hạn phiên bản quyền Microsoft...', percent: 3 });
        emitLog('[Aether] Token Microsoft đã hết hạn, đang tự động làm mới bằng refresh_token...');
        activeMs = await authenticateMinecraftChain({ refreshToken: activeMs.refreshToken });
        onMicrosoftAccountRefreshed?.(activeMs);
      }
      auth = createMicrosoftAuth(activeMs);
      emitLog(`[Aether] Xác thực BẢN QUYỀN (Microsoft MSA) | Người chơi: ${auth.name} | Online UUID: ${auth.uuid}`);
    } else {
      auth = createOfflineAuth(username);
      emitLog(`[Aether] Xác thực OFFLINE (Crack) | Người chơi: ${auth.name} | Offline UUID: ${auth.uuid}`);
    }

    emitStatus({ stage: 'init', message: `Đang chuẩn bị phiên bản ${mcVersion} (Core: ${loader.toUpperCase()})...`, percent: 5 });

    // 2. Fetch Vanilla version JSON
    const versionJson = await fetchVersionJson(mcVersion, gameDir);
    const requiredJavaMajor = getRequiredJavaVersion(versionJson);
    emitLog(`[Aether] Phiên bản ${mcVersion} yêu cầu Java ${requiredJavaMajor}.`);

    // 3. Ensure Java Runtime
    let javaPath = customJavaPath && fs.existsSync(customJavaPath) ? customJavaPath : null;
    if (!javaPath) {
      javaPath = await ensureJavaRuntime(requiredJavaMajor, gameDir, emitStatus);
    }
    emitLog(`[Aether] Sử dụng Java tại: ${javaPath}`);

    // 4. Multi-Core CPU JVM Flags + Prepare Selected Core Loader
    let customVersionId = undefined;
    let forgeInstallerPath = undefined;
    const cpuThreads = Math.max(2, os.cpus().length);
    const extraJvmArgs = [];

    if (fpsBoostJvm) {
      extraJvmArgs.push(
        '-XX:+UnlockExperimentalVMOptions',
        '-XX:+UseG1GC',
        `-XX:ParallelGCThreads=${cpuThreads}`,
        `-XX:ConcGCThreads=${Math.max(1, Math.floor(cpuThreads / 2))}`,
        '-XX:G1NewSizePercent=20',
        '-XX:G1ReservePercent=20',
        '-XX:MaxGCPauseMillis=50',
        '-XX:G1HeapRegionSize=32M',
        '-Dfml.ignoreInvalidMinecraftCertificates=true'
      );
    }

    if (loader === 'fabric' || loader === 'legacy-fabric') {
      const fabricInfo = await prepareFabricOrLegacyVersion(mcVersion, gameDir, emitStatus, loader === 'legacy-fabric');
      customVersionId = fabricInfo.customId;
      emitLog(`[Aether] Đã kích hoạt Core ${fabricInfo.customId}`);
      if (fabricInfo.profileJson?.arguments?.jvm) {
        for (const arg of fabricInfo.profileJson.arguments.jvm) {
          if (typeof arg === 'string') extraJvmArgs.push(arg.trim());
        }
      }
    } else if (loader === 'quilt') {
      const quiltInfo = await prepareQuiltVersion(mcVersion, gameDir, emitStatus);
      customVersionId = quiltInfo.customId;
      emitLog(`[Aether] Đã kích hoạt Core Quilt: ${quiltInfo.customId}`);
      if (quiltInfo.profileJson?.arguments?.jvm) {
        for (const arg of quiltInfo.profileJson.arguments.jvm) {
          if (typeof arg === 'string') extraJvmArgs.push(arg.trim());
        }
      }
    } else if (loader === 'forge') {
      const forgeInfo = await prepareForgeInstaller(mcVersion, gameDir, emitStatus);
      forgeInstallerPath = forgeInfo.installerPath;
      emitLog(`[Aether] Đã kích hoạt Core Forge: ${mcVersion}-${forgeInfo.forgeBuild}`);
    }

    // 5. Launch via MCLC with 64 concurrent sockets
    const minRam = Math.min(1024, Math.floor(ramMb / 2));
    const mclcOptions = {
      authorization: auth,
      root: gameDir,
      javaPath: javaPath,
      version: {
        number: mcVersion,
        type: versionJson.type || 'release',
        custom: customVersionId
      },
      forge: forgeInstallerPath,
      memory: {
        max: Number(ramMb),
        min: minRam
      },
      window: {
        width: Number(windowWidth) || 1280,
        height: Number(windowHeight) || 720,
        fullscreen: Boolean(fullscreen)
      },
      customArgs: extraJvmArgs,
      overrides: {
        detached: false,
        maxSockets: 64,
        directory: path.join(gameDir, 'versions', mcVersion),
        minecraftJar: path.join(gameDir, 'versions', mcVersion, `${mcVersion}.jar`),
        versionJson: path.join(gameDir, 'versions', mcVersion, `${mcVersion}.json`)
      }
    };

    const launcher = new Client();

    launcher.on('debug', (msg) => emitLog(msg));
    launcher.on('data', (msg) => emitLog(msg));

    launcher.on('download-status', (info) => {
      if (info.type === 'version-jar') {
        const pct = info.total ? Math.round((info.current / info.total) * 100) : 50;
        emitStatus({
          stage: 'download',
          message: `Đang tải siêu tốc Minecraft Client (${mcVersion}.jar): ${pct}%`,
          percent: Math.min(95, Math.max(10, pct))
        });
      }
    });

    launcher.on('progress', (prog) => {
      const pct = prog.total ? Math.round((prog.task / prog.total) * 100) : 0;
      const typeLabels = {
        'assets': 'Tài nguyên âm thanh & khối (Assets)',
        'assets-copy': 'Sao chép tài nguyên Legacy',
        'natives': 'Thư viện đồ họa LWJGL (Natives)',
        'classes': 'Thư viện lõi (Libraries)',
        'classes-custom': 'Thư viện Core Loader',
        'classes-maven-custom': 'Thư viện Forge Maven'
      };
      const label = typeLabels[prog.type] || prog.type;
      emitStatus({
        stage: 'download',
        message: `Đang kiểm tra / tải ${label}: ${prog.task} / ${prog.total} (${pct}%)`,
        percent: Math.min(98, Math.max(15, pct))
      });
    });

    launcher.on('arguments', () => {
      emitStatus({
        stage: 'launching',
        message: `Đang mở cửa sổ Minecraft ${mcVersion} (${loader.toUpperCase()} • ${cpuThreads} luồng CPU)...`,
        percent: 100
      });
      this.emit('game-started');
    });

    launcher.on('close', (code) => {
      this.activeProcess = null;
      emitLog(`[Aether] Tiến trình Minecraft đã đóng (Mã thoát: ${code})`);
      emitStatus({
        stage: 'idle',
        message: `Sẵn sàng khởi chạy siêu tốc`,
        percent: 0
      });
      this.emit('game-closed', code);
    });

    const proc = await launcher.launch(mclcOptions);
    this.activeProcess = proc;
    return {
      started: Boolean(proc),
      uuid: auth.uuid,
      javaPath
    };
  }

  killActiveGame() {
    if (this.activeProcess && !this.activeProcess.killed) {
      this.activeProcess.kill();
      this.activeProcess = null;
      return true;
    }
    return false;
  }
}

module.exports = {
  MinecraftLauncherEngine,
  generateOfflineUUID,
  createOfflineAuth,
  createMicrosoftAuth,
  fetchVersionManifest,
  fetchVersionJson,
  getRequiredJavaVersion,
  getInstalledRuntimes,
  ensureJavaRuntime,
  downloadFileWithProgress
};
