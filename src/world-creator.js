/**
 * BlockWay Launcher — Quick World Creator
 * Tạo sẵn thế giới chơi đơn (level.dat) đúng định dạng phiên bản Minecraft đang chơi,
 * dùng đúng kiểu thế giới mặc định của gói (VD: Đảo OneBlock / SkyBlock) để vào thẳng bằng Quick Play.
 * Hỗ trợ Minecraft 1.20+ (cần dữ liệu world_preset bên trong file game).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

let AdmZip = null;
try { AdmZip = require('adm-zip'); } catch (_) { AdmZip = null; }

/* ============================== NBT WRITER ============================== */
const TAG = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12 };

const nbt = {
  byte: (v) => ({ t: TAG.BYTE, v: Number(v) | 0 }),
  short: (v) => ({ t: TAG.SHORT, v: Number(v) | 0 }),
  int: (v) => ({ t: TAG.INT, v: Number(v) | 0 }),
  long: (v) => ({ t: TAG.LONG, v: BigInt.asIntN(64, BigInt(v)) }),
  float: (v) => ({ t: TAG.FLOAT, v: Number(v) }),
  double: (v) => ({ t: TAG.DOUBLE, v: Number(v) }),
  string: (v) => ({ t: TAG.STRING, v: String(v) }),
  list: (et, items) => ({ t: TAG.LIST, et: items.length ? et : TAG.END, v: items }),
  compound: (obj) => ({ t: TAG.COMPOUND, v: obj }),
  intArray: (arr) => ({ t: TAG.INT_ARRAY, v: arr.map((x) => Number(x) | 0) })
};

// Java "Modified UTF-8" (DataOutput.writeUTF) — dùng cho mọi chuỗi trong NBT
function encodeModifiedUtf8(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c >= 0x0001 && c <= 0x007f) bytes.push(c);
    else if (c <= 0x07ff) bytes.push(0xc0 | ((c >> 6) & 0x1f), 0x80 | (c & 0x3f));
    else bytes.push(0xe0 | ((c >> 12) & 0x0f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  if (bytes.length > 65535) throw new Error('Chuỗi NBT quá dài');
  return Buffer.from(bytes);
}

function writeNbtRoot(rootCompound) {
  const chunks = [];
  const push = (b) => chunks.push(b);
  const u8 = (v) => { const b = Buffer.alloc(1); b.writeUInt8(v & 0xff); push(b); };
  const i8 = (v) => { const b = Buffer.alloc(1); b.writeInt8(v); push(b); };
  const i16 = (v) => { const b = Buffer.alloc(2); b.writeInt16BE(v); push(b); };
  const i32 = (v) => { const b = Buffer.alloc(4); b.writeInt32BE(v); push(b); };
  const i64 = (v) => { const b = Buffer.alloc(8); b.writeBigInt64BE(v); push(b); };
  const str = (s) => { const e = encodeModifiedUtf8(s); const l = Buffer.alloc(2); l.writeUInt16BE(e.length); push(l); push(e); };
  const payload = (node) => {
    switch (node.t) {
      case TAG.BYTE: i8(node.v); break;
      case TAG.SHORT: i16(node.v); break;
      case TAG.INT: i32(node.v); break;
      case TAG.LONG: i64(node.v); break;
      case TAG.FLOAT: { const b = Buffer.alloc(4); b.writeFloatBE(node.v); push(b); break; }
      case TAG.DOUBLE: { const b = Buffer.alloc(8); b.writeDoubleBE(node.v); push(b); break; }
      case TAG.STRING: str(node.v); break;
      case TAG.LIST:
        u8(node.et);
        i32(node.v.length);
        for (const item of node.v) {
          if (item.t !== node.et) throw new Error('Danh sách NBT không đồng nhất kiểu');
          payload(item);
        }
        break;
      case TAG.COMPOUND:
        for (const [k, child] of Object.entries(node.v)) {
          if (!child) continue;
          u8(child.t);
          str(k);
          payload(child);
        }
        u8(TAG.END);
        break;
      case TAG.INT_ARRAY: i32(node.v.length); node.v.forEach((x) => i32(x)); break;
      default: throw new Error(`Kiểu NBT không hỗ trợ: ${node.t}`);
    }
  };
  u8(TAG.COMPOUND);
  str('');
  payload(rootCompound);
  return Buffer.concat(chunks);
}

// Chuyển JSON worldgen (world_preset) sang NBT giống cách Minecraft đọc bằng NbtOps
function jsonToNbt(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return nbt.byte(value ? 1 : 0);
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647 ? nbt.int(value) : nbt.double(value);
  }
  if (typeof value === 'string') return nbt.string(value);
  if (Array.isArray(value)) {
    let items = value.map(jsonToNbt).filter(Boolean);
    if (!items.length) return nbt.list(TAG.END, []);
    const numeric = items.every((x) => x.t === TAG.INT || x.t === TAG.DOUBLE);
    if (numeric && items.some((x) => x.t === TAG.DOUBLE)) items = items.map((x) => nbt.double(x.v));
    const et = items[0].t;
    if (!items.every((x) => x.t === et)) throw new Error('Danh sách worldgen trộn nhiều kiểu dữ liệu');
    return nbt.list(et, items);
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const conv = jsonToNbt(v);
      if (conv) out[k] = conv;
    }
    return nbt.compound(out);
  }
  return null;
}

/* ============================== HELPERS ============================== */
function openZip(file) {
  if (!AdmZip) throw new Error('Thiếu thư viện giải nén (adm-zip).');
  return new AdmZip(file);
}

function readZipText(zip, entryName) {
  try {
    const e = zip.getEntry(entryName);
    return e ? e.getData().toString('utf8').replace(/^\uFEFF/, '') : null;
  } catch (_) {
    return null;
  }
}

function parseMcTuple(v) {
  const m = String(v || '').match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null;
}

// Quick Play + world_preset trong file game: 1.20+ (và hệ phiên bản mới 26.x)
function supportsQuickWorldCreation(mcVersion) {
  const t = parseMcTuple(mcVersion);
  if (!t) return false;
  if (t[0] >= 2) return true;
  return t[0] === 1 && t[1] >= 20;
}

function readJarVersionInfo(jarPath) {
  try {
    const zip = openZip(jarPath);
    const raw = readZipText(zip, 'version.json');
    if (!raw) return null;
    const info = JSON.parse(raw);
    const presetRaw = readZipText(zip, 'data/minecraft/worldgen/world_preset/normal.json');
    return { ...info, normalPresetRaw: presetRaw };
  } catch (_) {
    return null;
  }
}

function findClientJar(rootDir, mcVersion) {
  const versionsDir = path.join(rootDir, 'versions');
  const direct = path.join(versionsDir, mcVersion, `${mcVersion}.jar`);
  const candidates = [];
  if (fs.existsSync(direct)) candidates.push(direct);
  try {
    for (const d of fs.readdirSync(versionsDir, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name === mcVersion) continue;
      if (!d.name.includes(mcVersion)) continue;
      const jar = path.join(versionsDir, d.name, `${d.name}.jar`);
      if (fs.existsSync(jar) && fs.statSync(jar).size > 5 * 1024 * 1024) candidates.push(jar);
    }
  } catch (_) {}
  for (const jar of candidates) {
    const info = readJarVersionInfo(jar);
    if (info && (info.id === mcVersion || info.name === mcVersion) && info.world_version) {
      return { jarPath: jar, info };
    }
  }
  return null;
}

function findVersionJson(rootDir, mcVersion) {
  const versionsDir = path.join(rootDir, 'versions');
  const direct = path.join(versionsDir, mcVersion, `${mcVersion}.json`);
  if (fs.existsSync(direct)) return direct;
  try {
    for (const d of fs.readdirSync(versionsDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const p = path.join(versionsDir, d.name, `${mcVersion}.json`);
      if (fs.existsSync(p)) return p;
    }
  } catch (_) {}
  return null;
}

// Đảm bảo có file game (client jar) để đọc định dạng thế giới; tải về nếu là lần chơi đầu tiên
async function ensureClientJar(rootDir, mcVersion, { fetchJson, downloadVerified, onStatus } = {}) {
  const found = findClientJar(rootDir, mcVersion);
  if (found) return found;
  if (typeof fetchJson !== 'function' || typeof downloadVerified !== 'function') return null;

  let versionJson = null;
  const localJson = findVersionJson(rootDir, mcVersion);
  if (localJson) {
    try { versionJson = JSON.parse(fs.readFileSync(localJson, 'utf8')); } catch (_) { versionJson = null; }
  }
  if (!versionJson?.downloads?.client?.url) {
    const manifest = await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    const entry = (manifest?.versions || []).find((v) => v.id === mcVersion);
    if (!entry?.url) return null;
    versionJson = await fetchJson(entry.url);
  }
  const client = versionJson?.downloads?.client;
  if (!client?.url) return null;

  onStatus?.(`🌍 Đang chuẩn bị dữ liệu thế giới cho Minecraft ${mcVersion}...`);
  const destDir = path.join(rootDir, 'versions', mcVersion);
  const destJar = path.join(destDir, `${mcVersion}.jar`);
  await downloadVerified([client.url], destJar, { sha1: client.sha1 });
  const destJson = path.join(destDir, `${mcVersion}.json`);
  if (!fs.existsSync(destJson)) {
    try { fs.writeFileSync(destJson, JSON.stringify(versionJson)); } catch (_) {}
  }
  const info = readJarVersionInfo(destJar);
  return info && info.world_version ? { jarPath: destJar, info } : null;
}

function readJarModIds(zip) {
  const ids = new Set();
  const fab = readZipText(zip, 'fabric.mod.json');
  if (fab) {
    try { const j = JSON.parse(fab); if (j?.id) ids.add(String(j.id)); } catch (_) {}
  }
  const quilt = readZipText(zip, 'quilt.mod.json');
  if (quilt) {
    try { const j = JSON.parse(quilt); if (j?.quilt_loader?.id) ids.add(String(j.quilt_loader.id)); } catch (_) {}
  }
  for (const tomlName of ['META-INF/neoforge.mods.toml', 'META-INF/mods.toml']) {
    const toml = readZipText(zip, tomlName);
    if (!toml) continue;
    const blocks = toml.split(/\[\[mods\]\]/).slice(1);
    for (const b of blocks) {
      const m = b.match(/^\s*modId\s*=\s*["']([^"']+)["']/m);
      if (m) ids.add(m[1]);
    }
  }
  return ids;
}

function zipHasDataFolder(zip) {
  try {
    return zip.getEntries().some((e) => /^data\/[^/]+\//.test(e.entryName.replace(/\\/g, '/')));
  } catch (_) {
    return false;
  }
}

// Thu thập mã datapack của mod (bật sẵn) và các gói tùy chọn tích hợp sẵn của mod (giữ tắt như khi tạo thế giới thủ công)
function scanModDataPacks(modsDir) {
  const enabled = new Set();
  const disabled = new Set();
  let normalOverride = null;
  let normalOverrideIsBlockWay = false;
  if (!fs.existsSync(modsDir)) return { enabled, disabled, normalOverride };

  const jars = fs.readdirSync(modsDir).filter((f) => /\.jar$/i.test(f));
  for (const jf of jars) {
    let zip;
    try { zip = openZip(path.join(modsDir, jf)); } catch (_) { continue; }
    const ids = readJarModIds(zip);
    // Chỉ khai báo datapack cho mod thực sự có thư mục data/ (tránh cảnh báo "Missing data pack")
    if (zipHasDataFolder(zip)) ids.forEach((id) => enabled.add(id));
    let entries = [];
    try { entries = zip.getEntries(); } catch (_) { entries = []; }

    const primaryId = [...ids][0] || '';
    const builtin = new Set();
    for (const e of entries) {
      const n = e.entryName.replace(/\\/g, '/');
      const bm = n.match(/^resourcepacks\/([^/]+)\/data\//);
      if (bm && primaryId) builtin.add(`${primaryId}:${bm[1]}`);
      if (n === 'data/minecraft/worldgen/world_preset/normal.json') {
        const isBw = /^zz-blockway-auto-island-preset\.jar$/i.test(jf);
        if (!normalOverride || (isBw && !normalOverrideIsBlockWay)) {
          normalOverride = readZipText(zip, n);
          normalOverrideIsBlockWay = isBw;
        }
      }
      if (/^META-INF\/jars\/[^/]+\.jar$/i.test(n)) {
        try {
          const inner = new AdmZip(e.getData());
          if (zipHasDataFolder(inner)) readJarModIds(inner).forEach((id) => enabled.add(id));
        } catch (_) {}
      }
    }
    builtin.forEach((b) => disabled.add(b));
  }
  return { enabled, disabled, normalOverride };
}

function stripDiacritics(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

// Tên thư mục an toàn (ASCII) để Quick Play truyền qua dòng lệnh Java trên Windows không bị lỗi font
function makeWorldFolderName(savesDir, levelName) {
  let base = stripDiacritics(levelName).replace(/[^A-Za-z0-9 _-]+/g, '_').replace(/\s+/g, ' ').trim();
  base = base.replace(/^[._ ]+|[._ ]+$/g, '').slice(0, 40) || 'BlockWay World';
  if (/^(CON|PRN|AUX|NUL|COM\d|LPT\d)$/i.test(base)) base = `${base}_`;
  let name = base;
  let i = 2;
  while (fs.existsSync(path.join(savesDir, name))) {
    name = `${base} (${i++})`;
  }
  return name;
}

function cleanLevelName(levelName) {
  // Bỏ ký tự ngoài BMP (emoji) để tương thích Modified UTF-8 tuyệt đối
  const s = Array.from(String(levelName || '')).filter((ch) => ch.codePointAt(0) <= 0xffff && ch.codePointAt(0) >= 0x20).join('');
  return s.trim().slice(0, 48) || 'Thế giới mới';
}

function javaStringHashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

// Giống Minecraft: số → dùng trực tiếp; chữ → String.hashCode(); trống → ngẫu nhiên
function resolveSeed(seedInput) {
  const raw = String(seedInput ?? '').trim();
  if (!raw) return BigInt.asIntN(64, crypto.randomBytes(8).readBigInt64BE(0));
  if (/^[-+]?\d+$/.test(raw)) {
    try {
      const big = BigInt(raw);
      if (big >= -(2n ** 63n) && big <= 2n ** 63n - 1n) return big;
    } catch (_) {}
  }
  return BigInt(javaStringHashCode(raw));
}

function packMetaForVersion(info, description) {
  const pv = info?.pack_version;
  if (pv && typeof pv === 'object' && Number.isFinite(pv.data_major)) {
    const fmt = Number.isFinite(pv.data_minor) && pv.data_minor > 0 ? [pv.data_major, pv.data_minor] : pv.data_major;
    return { pack: { description, pack_format: pv.data_major, min_format: fmt, max_format: fmt } };
  }
  const dataFmt = pv && typeof pv === 'object' ? Number(pv.data) : Number(pv);
  return { pack: { description, pack_format: Number.isFinite(dataFmt) && dataFmt > 0 ? dataFmt : 15 } };
}

// Datapack nhỏ áp dụng luật chơi (VD: Giữ đồ khi chết) — viết song song cú pháp cũ & mới cho mọi phiên bản
function writeRulesDatapack(worldDir, info, rules) {
  const lines = [];
  if (rules.keepInventory) lines.push(['keepInventory', 'keep_inventory', 'true']);
  if (rules.alwaysDay) lines.push(['doDaylightCycle', 'advance_time', 'false']);
  if (!lines.length) return null;

  const folder = 'blockway-rules';
  const dp = path.join(worldDir, 'datapacks', folder);
  const write = (rel, content) => {
    const full = path.join(dp, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  };
  write('pack.mcmeta', JSON.stringify(packMetaForVersion(info, 'BlockWay - Luật chơi của thế giới'), null, 2));
  const legacyCmds = lines.map(([oldName, , val]) => `gamerule ${oldName} ${val}`);
  const modernCmds = lines.map(([, newName, val]) => `gamerule ${newName} ${val}`);
  if (rules.alwaysDay) {
    legacyCmds.push('time set day');
    modernCmds.push('time set day');
  }
  // "required: false" để phiên bản nào không hiểu một trong hai cú pháp thì chỉ bỏ qua hàm đó, không hỏng cả nhóm
  const tag = JSON.stringify({
    values: [
      { id: 'blockway:rules_legacy', required: false },
      { id: 'blockway:rules_modern', required: false }
    ]
  }, null, 2);
  for (const fnDir of ['function', 'functions']) {
    write(`data/blockway/${fnDir}/rules_legacy.mcfunction`, legacyCmds.join('\n') + '\n');
    write(`data/blockway/${fnDir}/rules_modern.mcfunction`, modernCmds.join('\n') + '\n');
    write(`data/minecraft/tags/${fnDir}/load.json`, tag);
  }
  return `file/${folder}`;
}

/* ============================== MAIN ============================== */
const GAME_MODES = { survival: 0, creative: 1, adventure: 2, spectator: 3 };
const DIFFICULTIES = { peaceful: 0, easy: 1, normal: 2, hard: 3 };

/**
 * Tạo sẵn một thế giới chơi đơn mới trong <gameDirectory>/saves.
 * @returns {Promise<{ok:boolean, folderName?:string, levelName?:string, worldType?:string, seed?:string, error?:string}>}
 */
async function createQuickWorld({
  rootDir,
  gameDirectory,
  mcVersion,
  loaderType = 'vanilla',
  levelName = '',
  gameMode = 'survival',
  difficulty = 'normal',
  hardcore = false,
  allowCommands = false,
  seed = '',
  bonusChest = false,
  keepInventory = false,
  alwaysDay = false,
  fetchJson,
  downloadVerified,
  onStatus
} = {}) {
  try {
    if (!supportsQuickWorldCreation(mcVersion)) {
      return { ok: false, error: `Tạo thế giới tự động cần Minecraft 1.20 trở lên (đang chọn ${mcVersion}).` };
    }
    const gameDir = gameDirectory || rootDir;
    const jar = await ensureClientJar(rootDir, mcVersion, { fetchJson, downloadVerified, onStatus });
    if (!jar) return { ok: false, error: 'Không đọc được dữ liệu phiên bản Minecraft để tạo thế giới.' };
    const info = jar.info;

    const loader = String(loaderType || 'vanilla').toLowerCase();
    const modScan = loader === 'vanilla' ? { enabled: new Set(), disabled: new Set(), normalOverride: null } : scanModDataPacks(path.join(gameDir, 'mods'));
    const presetRaw = modScan.normalOverride || info.normalPresetRaw;
    if (!presetRaw) return { ok: false, error: 'Phiên bản này chưa có dữ liệu kiểu thế giới mặc định.' };
    let preset;
    try { preset = JSON.parse(presetRaw); } catch (_) { return { ok: false, error: 'Dữ liệu kiểu thế giới bị lỗi.' }; }
    if (!preset?.dimensions?.['minecraft:overworld']) return { ok: false, error: 'Kiểu thế giới không có Overworld.' };

    const overworldGen = preset.dimensions['minecraft:overworld']?.generator || {};
    const genType = String(overworldGen.type || '');
    let worldType = 'Mặc định';
    if (modScan.normalOverride) {
      if (/one\s*_?block/i.test(genType)) worldType = 'Đảo OneBlock giữa khoảng không';
      else if (/sky|void|island/i.test(genType)) worldType = 'Đảo SkyBlock giữa khoảng không';
      else worldType = 'Kiểu thế giới riêng của gói';
    }

    const savesDir = path.join(gameDir, 'saves');
    fs.mkdirSync(savesDir, { recursive: true });
    const cleanName = cleanLevelName(levelName);
    const folderName = makeWorldFolderName(savesDir, cleanName);
    const worldDir = path.join(savesDir, folderName);
    fs.mkdirSync(worldDir, { recursive: true });

    const seedBig = resolveSeed(seed);
    const isHardcore = Boolean(hardcore);
    const gameTypeId = isHardcore ? 0 : (GAME_MODES[gameMode] ?? 0);
    const difficultyId = isHardcore ? 3 : (DIFFICULTIES[difficulty] ?? 2);

    const enabledPacks = ['vanilla'];
    if (loader === 'fabric' || loader === 'quilt' || loader === 'legacyfabric') enabledPacks.push('fabric');
    if (loader === 'forge' || loader === 'neoforge') enabledPacks.push('mod_resources');
    for (const id of modScan.enabled) {
      if (['minecraft', 'java', 'fabricloader', 'quilt_loader', 'forge', 'neoforge'].includes(id)) continue;
      if (!enabledPacks.includes(id)) enabledPacks.push(id);
      if (loader === 'neoforge') enabledPacks.push(`mod/${id}`);
    }
    const rulesPackId = writeRulesDatapack(worldDir, info, { keepInventory, alwaysDay });
    if (rulesPackId) enabledPacks.push(rulesPackId);
    const disabledPacks = [...modScan.disabled].filter((id) => !enabledPacks.includes(id));

    const dimensionsNbt = jsonToNbt(preset.dimensions);
    const now = Date.now();
    const dataVersion = Number(info.world_version);
    const difficultyName = Object.keys(DIFFICULTIES).find((k) => DIFFICULTIES[k] === difficultyId) || 'normal';
    const worldGenNbt = () => nbt.compound({
      seed: nbt.long(seedBig),
      generate_features: nbt.byte(1),
      generate_structures: nbt.byte(1),
      bonus_chest: nbt.byte(bonusChest ? 1 : 0),
      dimensions: dimensionsNbt
    });

    // Ghi song song định dạng cũ (1.20 → 1.21.x: trong level.dat) và mới (26.x: difficulty_settings + world_gen_settings.dat).
    // Mỗi phiên bản chỉ đọc trường nó hiểu và bỏ qua phần còn lại.
    const data = {
      DataVersion: nbt.int(dataVersion),
      version: nbt.int(19133),
      Version: nbt.compound({
        Id: nbt.int(dataVersion),
        Name: nbt.string(info.name || info.id || mcVersion),
        Series: nbt.string(info.series_id || 'main'),
        Snapshot: nbt.byte(info.stable === false ? 1 : 0)
      }),
      LevelName: nbt.string(cleanName),
      GameType: nbt.int(gameTypeId),
      Difficulty: nbt.byte(difficultyId),
      DifficultyLocked: nbt.byte(0),
      difficulty_settings: nbt.compound({
        difficulty: nbt.string(difficultyName),
        hardcore: nbt.byte(isHardcore ? 1 : 0),
        locked: nbt.byte(0)
      }),
      hardcore: nbt.byte(isHardcore ? 1 : 0),
      allowCommands: nbt.byte(allowCommands && !isHardcore ? 1 : 0),
      initialized: nbt.byte(0),
      LastPlayed: nbt.long(now),
      Time: nbt.long(0),
      DayTime: nbt.long(alwaysDay ? 1000 : 0),
      WasModded: nbt.byte(loader === 'vanilla' ? 0 : 1),
      WorldGenSettings: worldGenNbt(),
      DataPacks: nbt.compound({
        Enabled: nbt.list(TAG.STRING, enabledPacks.map((x) => nbt.string(x))),
        Disabled: nbt.list(TAG.STRING, disabledPacks.map((x) => nbt.string(x)))
      }),
      DragonFight: nbt.compound({
        NeedsStateScanning: nbt.byte(1),
        DragonKilled: nbt.byte(0),
        PreviouslyKilled: nbt.byte(0)
      })
    };

    const raw = writeNbtRoot(nbt.compound({ Data: nbt.compound(data) }));
    fs.writeFileSync(path.join(worldDir, 'level.dat'), zlib.gzipSync(raw));
    const wgsDir = path.join(worldDir, 'data', 'minecraft');
    fs.mkdirSync(wgsDir, { recursive: true });
    fs.writeFileSync(
      path.join(wgsDir, 'world_gen_settings.dat'),
      zlib.gzipSync(writeNbtRoot(nbt.compound({ data: worldGenNbt(), DataVersion: nbt.int(dataVersion) })))
    );
    try {
      fs.writeFileSync(path.join(worldDir, 'blockway-world.json'), JSON.stringify({
        createdBy: 'BlockWay Launcher',
        createdAt: now,
        mcVersion,
        loader,
        worldType,
        gameMode: isHardcore ? 'hardcore' : gameMode,
        difficulty: isHardcore ? 'hard' : difficulty,
        seed: seedBig.toString()
      }, null, 2));
    } catch (_) {}

    return { ok: true, folderName, levelName: cleanName, worldType, seed: seedBig.toString(), worldDir };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

function savesHasWorlds(gameDirectory) {
  try {
    const savesDir = path.join(gameDirectory, 'saves');
    return fs.readdirSync(savesDir, { withFileTypes: true })
      .some((d) => d.isDirectory() && fs.existsSync(path.join(savesDir, d.name, 'level.dat')));
  } catch (_) {
    return false;
  }
}

module.exports = {
  createQuickWorld,
  supportsQuickWorldCreation,
  savesHasWorlds,
  resolveSeed,
  javaStringHashCode,
  _internal: { writeNbtRoot, jsonToNbt, nbt, TAG, scanModDataPacks, findClientJar, makeWorldFolderName, encodeModifiedUtf8 }
};
