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

/* ============================== NBT READER & WRITER ============================== */
const TAG = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12 };

const nbt = {
  byte: (v) => ({ t: TAG.BYTE, v: Number(v) | 0 }),
  short: (v) => ({ t: TAG.SHORT, v: Number(v) | 0 }),
  int: (v) => ({ t: TAG.INT, v: Number(v) | 0 }),
  long: (v) => ({ t: TAG.LONG, v: BigInt.asIntN(64, BigInt(v)) }),
  float: (v) => ({ t: TAG.FLOAT, v: Number(v) }),
  double: (v) => ({ t: TAG.DOUBLE, v: Number(v) }),
  byteArray: (buf) => ({ t: TAG.BYTE_ARRAY, v: Buffer.isBuffer(buf) ? Buffer.from(buf) : Buffer.from(buf || []) }),
  string: (v) => ({ t: TAG.STRING, v: String(v) }),
  list: (et, items) => ({ t: TAG.LIST, et: items.length ? et : TAG.END, v: items }),
  compound: (obj) => ({ t: TAG.COMPOUND, v: obj }),
  intArray: (arr) => ({ t: TAG.INT_ARRAY, v: arr.map((x) => Number(x) | 0) }),
  longArray: (arr) => ({ t: TAG.LONG_ARRAY, v: arr.map((x) => BigInt.asIntN(64, BigInt(x))) })
};

// Java "Modified UTF-8" (DataOutput.writeUTF / DataInput.readUTF) — dùng cho mọi chuỗi trong NBT
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

function decodeModifiedUtf8(buf, start, len) {
  const end = start + len;
  const chars = [];
  let i = start;
  while (i < end) {
    const b1 = buf[i] & 0xff;
    if ((b1 & 0x80) === 0) {
      chars.push(b1);
      i += 1;
    } else if ((b1 & 0xe0) === 0xc0 && i + 1 < end) {
      const b2 = buf[i + 1] & 0x3f;
      chars.push(((b1 & 0x1f) << 6) | b2);
      i += 2;
    } else if ((b1 & 0xf0) === 0xe0 && i + 2 < end) {
      const b2 = buf[i + 1] & 0x3f;
      const b3 = buf[i + 2] & 0x3f;
      chars.push(((b1 & 0x0f) << 12) | (b2 << 6) | b3);
      i += 3;
    } else {
      chars.push(b1);
      i += 1;
    }
  }
  return String.fromCharCode(...chars);
}

function readNbtRoot(rawBuf) {
  const buf = Buffer.isBuffer(rawBuf) ? rawBuf : Buffer.from(rawBuf);
  let off = 0;
  const u8 = () => { const v = buf.readUInt8(off); off += 1; return v; };
  const i8 = () => { const v = buf.readInt8(off); off += 1; return v; };
  const i16 = () => { const v = buf.readInt16BE(off); off += 2; return v; };
  const i32 = () => { const v = buf.readInt32BE(off); off += 4; return v; };
  const i64 = () => { const v = buf.readBigInt64BE(off); off += 8; return v; };
  const f32 = () => { const v = buf.readFloatBE(off); off += 4; return v; };
  const f64 = () => { const v = buf.readDoubleBE(off); off += 8; return v; };
  const str = () => {
    const len = buf.readUInt16BE(off);
    off += 2;
    const s = decodeModifiedUtf8(buf, off, len);
    off += len;
    return s;
  };
  const readPayload = (tagType) => {
    switch (tagType) {
      case TAG.BYTE: return nbt.byte(i8());
      case TAG.SHORT: return nbt.short(i16());
      case TAG.INT: return nbt.int(i32());
      case TAG.LONG: return nbt.long(i64());
      case TAG.FLOAT: return nbt.float(f32());
      case TAG.DOUBLE: return nbt.double(f64());
      case TAG.BYTE_ARRAY: {
        const len = i32();
        const slice = Buffer.from(buf.subarray(off, off + len));
        off += len;
        return nbt.byteArray(slice);
      }
      case TAG.STRING: return nbt.string(str());
      case TAG.LIST: {
        const elemType = u8();
        const len = i32();
        const items = [];
        for (let k = 0; k < len; k++) items.push(readPayload(elemType));
        return { t: TAG.LIST, et: len > 0 ? elemType : TAG.END, v: items };
      }
      case TAG.COMPOUND: {
        const obj = {};
        while (off < buf.length) {
          const childType = u8();
          if (childType === TAG.END) break;
          const key = str();
          obj[key] = readPayload(childType);
        }
        return nbt.compound(obj);
      }
      case TAG.INT_ARRAY: {
        const len = i32();
        const arr = new Array(len);
        for (let k = 0; k < len; k++) arr[k] = i32();
        return nbt.intArray(arr);
      }
      case TAG.LONG_ARRAY: {
        const len = i32();
        const arr = new Array(len);
        for (let k = 0; k < len; k++) arr[k] = i64();
        return nbt.longArray(arr);
      }
      default:
        throw new Error(`Kiểu thẻ NBT không xác định (${tagType}) tại vị trí ${off}`);
    }
  };
  const rootType = u8();
  if (rootType !== TAG.COMPOUND) throw new Error('Tệp NBT không bắt đầu bằng thẻ Compound');
  const rootName = str();
  const root = readPayload(TAG.COMPOUND);
  root._rootName = rootName;
  return root;
}

function writeNbtRoot(rootCompound, rootNameOverride) {
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
      case TAG.BYTE_ARRAY: {
        const b = Buffer.isBuffer(node.v) ? node.v : Buffer.from(node.v || []);
        i32(b.length);
        push(b);
        break;
      }
      case TAG.STRING: str(node.v); break;
      case TAG.LIST: {
        const actualEt = node.v.length ? node.et : TAG.END;
        u8(actualEt);
        i32(node.v.length);
        for (const item of node.v) {
          if (item.t !== actualEt) throw new Error('Danh sách NBT không đồng nhất kiểu');
          payload(item);
        }
        break;
      }
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
      case TAG.LONG_ARRAY: i32(node.v.length); node.v.forEach((x) => i64(x)); break;
      default: throw new Error(`Kiểu NBT không hỗ trợ: ${node.t}`);
    }
  };
  u8(TAG.COMPOUND);
  str(typeof rootNameOverride === 'string' ? rootNameOverride : (rootCompound._rootName || ''));
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
  extraDatapackZips = [],
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
    let dpNormalOverride = null;
    const validExtraZips = [];
    for (const rawZp of Array.isArray(extraDatapackZips) ? extraDatapackZips : []) {
      const zp = String(rawZp || '').trim();
      if (!zp || !fs.existsSync(zp)) continue;
      validExtraZips.push(zp);
      try {
        const z = openZip(zp);
        const normTxt = readZipText(z, 'data/minecraft/worldgen/world_preset/normal.json');
        if (normTxt) dpNormalOverride = normTxt;
      } catch (_) {}
    }

    const presetRaw = dpNormalOverride || modScan.normalOverride || info.normalPresetRaw;
    if (!presetRaw) return { ok: false, error: 'Phiên bản này chưa có dữ liệu kiểu thế giới mặc định.' };
    let preset;
    try { preset = JSON.parse(presetRaw); } catch (_) { return { ok: false, error: 'Dữ liệu kiểu thế giới bị lỗi.' }; }
    if (!preset?.dimensions?.['minecraft:overworld']) return { ok: false, error: 'Kiểu thế giới không có Overworld.' };

    const overworldGen = preset.dimensions['minecraft:overworld']?.generator || {};
    const genType = String(overworldGen.type || '');
    let worldType = 'Mặc định';
    if (dpNormalOverride || modScan.normalOverride) {
      if (/one\s*_?block/i.test(genType)) worldType = 'Đảo OneBlock giữa khoảng không';
      else if (/sky|void|island/i.test(genType)) worldType = 'Đảo SkyBlock giữa khoảng không';
      else worldType = 'Kiểu thế giới riêng của gói';
    } else if (validExtraZips.length > 0) {
      worldType = `Tích hợp ${validExtraZips.length} Datapack`;
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
    if (validExtraZips.length > 0) {
      const worldDpDir = path.join(worldDir, 'datapacks');
      fs.mkdirSync(worldDpDir, { recursive: true });
      for (const zp of validExtraZips) {
        const dpFileName = path.basename(zp).replace(/[^A-Za-z0-9._+-]/g, '_');
        if (!dpFileName) continue;
        fs.copyFileSync(zp, path.join(worldDpDir, dpFileName));
        const packToken = `file/${dpFileName}`;
        if (!enabledPacks.includes(packToken)) enabledPacks.push(packToken);
      }
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

/* ==================== v40.7 PRO: CURATED SEED VAULT & WORLD NBT RESCUE ==================== */
const CURATED_SEEDS_VAULT = [
  {
    id: 'cherry-ring-mountain',
    title: '🌸 Thung Lũng Anh Đào Ôm Trọn Hồ Núi Tuyết',
    seed: '1691256543523180978',
    category: 'scenic',
    badge: 'Đẹp Nhất Xây Nhà',
    coordsHint: 'Spawn gần X: 120, Z: 80',
    description: 'Vòng núi tuyết hùng vĩ khép kín bao quanh thung lũng hoa anh đào hồng rực, hồ nước trong vắt ở giữa và ngôi làng bình yên sát bên.'
  },
  {
    id: 'mushroom-safe-island',
    title: '🍄 Quần Đảo Nấm Khổng Lồ (100% Không Quái Ban Đêm)',
    seed: '-4270204629242599305',
    category: 'survival',
    badge: 'An Toàn Tuyệt Đối',
    coordsHint: 'Xuất hiện ngay trên Đảo Nấm',
    description: 'Đảo Nấm rộng lớn nằm giữa đại dương ngay điểm xuất hiện — ban đêm không bao giờ tự sinh Zombie/Creeper, lý tưởng để xây đại căn cứ.'
  },
  {
    id: 'mansion-village-ancient',
    title: '🏰 Biệt Thự Rừng + Làng Cổ + Thành Cổ Ngầm Sát Nhau',
    seed: '5706378859201728440',
    category: 'adventure',
    badge: 'Siêu Hiếm 3-Trong-1',
    coordsHint: 'Ngay sát điểm xuất hiện (X: 60, Z: 90)',
    description: 'Vừa vào thế giới đã đứng trước tòa Biệt thự Woodland Mansion khổng lồ ghép liền với ngôi làng dân làng và thành cổ Ancient City sâu bên dưới.'
  },
  {
    id: 'coral-castaway-island',
    title: '🏝️ Đảo Hoang San Hô Rực Rỡ & Kho Báu Tàu Đắm',
    seed: '-3420545464665791887',
    category: 'island',
    badge: 'Sinh Tồn Đảo Hoang',
    coordsHint: 'Đảo chính tại X: 0, Z: 0',
    description: 'Thử thách sinh tồn trên hòn đảo nhỏ giữa vùng biển ấm rực rỡ san hô phát sáng ban đêm, bao quanh bởi xác tàu đắm và phế tích biển.'
  },
  {
    id: 'ice-spikes-frozen-kingdom',
    title: '❄️ Vương Quốc Gai Băng Cổ Đại & Làng Tuyết',
    seed: '-7253978062019363248',
    category: 'scenic',
    badge: 'Cảnh Quan Kỳ Vĩ',
    coordsHint: 'Gai băng tại X: -150, Z: 120',
    description: 'Hàng trăm cột băng xanh cao vút nối liền rặng núi tuyết trắng xóa, có sẵn làng tuyết Igloo và cổng địa ngục cổ ngay gần điểm xuất hiện.'
  },
  {
    id: 'badlands-gold-oasis',
    title: '🏜️ Ốc Đảo Hẻm Núi Đỏ Giàu Vàng & Đền Sa Mạc',
    seed: '8678942899319966093',
    category: 'adventure',
    badge: 'Giàu Tài Nguyên',
    coordsHint: 'Ốc đảo tại X: 40, Z: -60',
    description: 'Sự giao thoa tuyệt đẹp giữa hồ nước xanh, làng sa mạc, Kim tự tháp chứa kho báu và dãy núi đất nung Badlands lộ thiên đầy mỏ vàng.'
  },
  {
    id: 'speedrun-bastion-fortress',
    title: '⚡ Hạt Giống Phá Đảo Thần Tốc (Làng Rèn + Pháo Đài Gần)',
    seed: '-4530634556500121041',
    category: 'speedrun',
    badge: 'Speedrun Chuẩn',
    coordsHint: 'Làng & Hồ Lava ngay cạnh Spawn',
    description: 'Có sẵn làng thợ rèn lấy sắt/đồ ăn và hồ dung nham dựng cổng Nether mở thẳng ra khu vực sát Pháo đài Nether Fortress và Bastion.'
  },
  {
    id: 'lush-cave-ancient-taiga',
    title: '🌲 Rừng Tùng Cổ Thụ & Đại Hang Động Rêu Phát Sáng',
    seed: '7092092118958763650',
    category: 'scenic',
    badge: 'Hang Động Tuyệt Đẹp',
    coordsHint: 'Cửa hang lớn tại X: -80, Z: 40',
    description: 'Rừng thông khổng lồ phủ rêu phong bên trên một quần thể hang động Lush Caves rực sáng quả mọng phát quang và cá kỳ nhông Axolotl.'
  }
];

const MODE_ID_TO_KEY = { 0: 'survival', 1: 'creative', 2: 'adventure', 3: 'spectator' };
const MODE_KEY_TO_LABEL = {
  survival: 'Sinh tồn (Survival)',
  creative: 'Sáng tạo (Creative)',
  adventure: 'Phiêu lưu (Adventure)',
  spectator: 'Khán giả (Spectator)'
};
const DIFF_ID_TO_KEY = { 0: 'peaceful', 1: 'easy', 2: 'normal', 3: 'hard' };
const DIFF_KEY_TO_LABEL = {
  peaceful: 'Hòa bình',
  easy: 'Dễ',
  normal: 'Bình thường',
  hard: 'Khó'
};

function formatDimensionLabel(dimRaw) {
  const s = String(dimRaw ?? 'minecraft:overworld');
  if (s === '0' || s.endsWith(':overworld')) return 'Thế giới chính (Overworld)';
  if (s === '-1' || s.endsWith(':the_nether')) return 'Địa ngục (Nether)';
  if (s === '1' || s.endsWith(':the_end')) return 'Thế giới Rồng (The End)';
  return s;
}

function readLatestPlayerNbtFile(worldDir) {
  try {
    const pdDir = path.join(worldDir, 'playerdata');
    if (!fs.existsSync(pdDir)) return null;
    const files = fs.readdirSync(pdDir)
      .filter((f) => /\.dat$/i.test(f))
      .map((f) => {
        const full = path.join(pdDir, f);
        return { full, mtimeMs: fs.statSync(full).mtimeMs || 0 };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (!files.length) return null;
    const raw = zlib.gunzipSync(fs.readFileSync(files[0].full));
    return { filePath: files[0].full, root: readNbtRoot(raw) };
  } catch (_) {
    return null;
  }
}

function extractPlayerSummary(playerCompoundObj) {
  if (!playerCompoundObj) return null;
  const posList = playerCompoundObj.Pos?.v;
  if (!Array.isArray(posList) || posList.length < 3) return null;
  const x = Math.round(Number(posList[0].v) * 10) / 10;
  const y = Math.round(Number(posList[1].v) * 10) / 10;
  const z = Math.round(Number(posList[2].v) * 10) / 10;
  const dimRaw = playerCompoundObj.Dimension?.v ?? 'minecraft:overworld';
  const health = playerCompoundObj.Health ? Math.round(Number(playerCompoundObj.Health.v) * 10) / 10 : 20;
  const foodLevel = playerCompoundObj.foodLevel ? Number(playerCompoundObj.foodLevel.v) : 20;
  const xpLevel = playerCompoundObj.XpLevel ? Number(playerCompoundObj.XpLevel.v) : 0;
  const deathTime = playerCompoundObj.DeathTime ? Number(playerCompoundObj.DeathTime.v) : 0;
  return {
    x,
    y,
    z,
    dimension: String(dimRaw),
    dimensionLabel: formatDimensionLabel(dimRaw),
    health,
    foodLevel,
    xpLevel,
    isDead: health <= 0 || deathTime > 0
  };
}

function inspectWorldNbt(worldDir) {
  const levelDatPath = path.join(worldDir, 'level.dat');
  if (!fs.existsSync(levelDatPath)) {
    throw new Error('Không tìm thấy tệp dữ liệu level.dat trong thư mục thế giới này.');
  }
  const unzipped = zlib.gunzipSync(fs.readFileSync(levelDatPath));
  const root = readNbtRoot(unzipped);
  const dataObj = root.v?.Data?.v || root.v;
  if (!dataObj) throw new Error('Cấu trúc dữ liệu level.dat không hợp lệ.');

  const levelName = String(dataObj.LevelName?.v || path.basename(worldDir));
  const mcVersion = String(dataObj.Version?.v?.Name?.v || '');
  const dataVersion = Number(dataObj.DataVersion?.v || dataObj.Version?.v?.Id?.v || 0);

  // Extract Seed across MC 1.8 -> 1.21.x -> 26.x
  let seedBig = null;
  if (dataObj.WorldGenSettings?.v?.seed?.v !== undefined) {
    seedBig = dataObj.WorldGenSettings.v.seed.v;
  } else if (dataObj.RandomSeed?.v !== undefined) {
    seedBig = dataObj.RandomSeed.v;
  } else {
    const wgsPath = path.join(worldDir, 'data', 'minecraft', 'world_gen_settings.dat');
    if (fs.existsSync(wgsPath)) {
      try {
        const wgsRoot = readNbtRoot(zlib.gunzipSync(fs.readFileSync(wgsPath)));
        if (wgsRoot.v?.data?.v?.seed?.v !== undefined) {
          seedBig = wgsRoot.v.data.v.seed.v;
        }
      } catch (_) {}
    }
  }
  const seed = seedBig !== null && seedBig !== undefined ? String(seedBig) : '';

  const hardcore = Boolean(
    (dataObj.hardcore && Number(dataObj.hardcore.v) === 1) ||
    (dataObj.difficulty_settings?.v?.hardcore && Number(dataObj.difficulty_settings.v.hardcore.v) === 1)
  );
  const rawGt = Number(dataObj.GameType?.v ?? 0);
  const gameMode = MODE_ID_TO_KEY[rawGt] || 'survival';
  const rawDiff = dataObj.Difficulty !== undefined
    ? Number(dataObj.Difficulty.v)
    : (DIFFICULTIES[dataObj.difficulty_settings?.v?.difficulty?.v] ?? 2);
  const difficulty = DIFF_ID_TO_KEY[rawDiff] || 'normal';
  const allowCommands = Boolean(dataObj.allowCommands && Number(dataObj.allowCommands.v) === 1);

  // Check keepInventory in GameRules OR blockway-rules datapack
  const rulesObj = dataObj.GameRules?.v || {};
  let keepInventory = String(rulesObj.keepInventory?.v || rulesObj.keep_inventory?.v || '').toLowerCase() === 'true';
  if (!keepInventory) {
    try {
      const bwRuleFn = path.join(worldDir, 'datapacks', 'blockway-rules', 'data', 'blockway', 'function', 'rules_legacy.mcfunction');
      if (fs.existsSync(bwRuleFn) && /keepInventory\s+true/i.test(fs.readFileSync(bwRuleFn, 'utf8'))) {
        keepInventory = true;
      }
    } catch (_) {}
  }

  const dayTicks = Number(dataObj.DayTime?.v ?? dataObj.Time?.v ?? 0n);
  const totalTicks = Number(dataObj.Time?.v ?? dataObj.DayTime?.v ?? 0n);
  const dayCount = Math.max(0, Math.floor(Math.max(dayTicks, totalTicks) / 24000));
  const phaseTick = ((dayTicks % 24000) + 24000) % 24000;
  let timePhase = 'Ban ngày';
  if (phaseTick >= 12000 && phaseTick < 13800) timePhase = 'Hoàng hôn';
  else if (phaseTick >= 13800 && phaseTick < 22500) timePhase = 'Ban đêm';
  else if (phaseTick >= 22500) timePhase = 'Bình minh';

  const raining = Boolean(dataObj.raining && Number(dataObj.raining.v) === 1);
  const thundering = Boolean(dataObj.thundering && Number(dataObj.thundering.v) === 1);

  // Spawn coordinates (classic SpawnX/Y/Z or modern 1.21.9+/26.x spawn.pos intArray)
  let spawnPos = { x: 0, y: 72, z: 0 };
  if (Array.isArray(dataObj.spawn?.v?.pos?.v) && dataObj.spawn.v.pos.v.length >= 3) {
    spawnPos = {
      x: Number(dataObj.spawn.v.pos.v[0]),
      y: Number(dataObj.spawn.v.pos.v[1]),
      z: Number(dataObj.spawn.v.pos.v[2])
    };
  } else if (dataObj.SpawnX !== undefined && dataObj.SpawnZ !== undefined) {
    spawnPos = {
      x: Number(dataObj.SpawnX.v),
      y: Number(dataObj.SpawnY?.v ?? 72),
      z: Number(dataObj.SpawnZ.v)
    };
  }

  let playerPos = extractPlayerSummary(dataObj.Player?.v);
  if (!playerPos) {
    const extPlayer = readLatestPlayerNbtFile(worldDir);
    if (extPlayer?.root?.v) {
      playerPos = extractPlayerSummary(extPlayer.root.v);
    }
  }

  return {
    ok: true,
    folderName: path.basename(worldDir),
    worldDir,
    levelName,
    mcVersion,
    dataVersion,
    seed,
    gameMode,
    gameModeLabel: hardcore && gameMode === 'spectator' ? '💀 Đã tử trận (Hardcore)' : (hardcore ? '💀 Sinh tồn Khốc liệt (Hardcore)' : MODE_KEY_TO_LABEL[gameMode]),
    hardcore,
    difficulty,
    difficultyLabel: DIFF_KEY_TO_LABEL[difficulty] || 'Bình thường',
    allowCommands,
    keepInventory,
    dayCount,
    timePhase,
    raining,
    thundering,
    spawnPos,
    playerPos,
    hasSafetyBackup: fs.existsSync(path.join(worldDir, 'level.dat.bw-bak'))
  };
}

function applyPlayerPatchesToCompound(playerObj, { gameTypeId, reviveHardcore, teleportCoords }) {
  if (!playerObj) return;
  if (gameTypeId !== null && gameTypeId !== undefined) {
    playerObj.playerGameType = nbt.int(gameTypeId);
  }
  if (reviveHardcore) {
    playerObj.playerGameType = nbt.int(0);
    playerObj.Health = nbt.float(20.0);
    playerObj.DeathTime = nbt.short(0);
    playerObj.HurtTime = nbt.short(0);
    playerObj.FallDistance = nbt.float(0.0);
    playerObj.Fire = nbt.short(-20);
    playerObj.foodLevel = nbt.int(20);
    playerObj.foodSaturationLevel = nbt.float(5.0);
  }
  if (teleportCoords) {
    playerObj.Pos = nbt.list(TAG.DOUBLE, [
      nbt.double(Number(teleportCoords.x) + 0.5),
      nbt.double(Number(teleportCoords.y) + 1.0),
      nbt.double(Number(teleportCoords.z) + 0.5)
    ]);
    playerObj.Motion = nbt.list(TAG.DOUBLE, [nbt.double(0), nbt.double(0), nbt.double(0)]);
    playerObj.FallDistance = nbt.float(0.0);
    playerObj.Dimension = nbt.string('minecraft:overworld');
  }
}

function rescueAndPatchWorldNbt(worldDir, patches = {}) {
  const levelDatPath = path.join(worldDir, 'level.dat');
  if (!fs.existsSync(levelDatPath)) {
    throw new Error('Không tìm thấy tệp level.dat của thế giới này.');
  }

  // Always create a safety backup before touching NBT bytes
  const bakPath = path.join(worldDir, 'level.dat.bw-bak');
  try {
    fs.copyFileSync(levelDatPath, bakPath);
  } catch (_) {}

  const root = readNbtRoot(zlib.gunzipSync(fs.readFileSync(levelDatPath)));
  const dataObj = root.v?.Data?.v || root.v;
  if (!dataObj) throw new Error('Không đọc được cấu trúc Data trong level.dat.');

  const appliedActions = [];
  let targetGameTypeId = null;

  if (typeof patches.levelName === 'string' && patches.levelName.trim()) {
    dataObj.LevelName = nbt.string(cleanLevelName(patches.levelName));
    appliedActions.push('Đổi tên thế giới');
  }

  if (patches.gameMode && GAME_MODES[patches.gameMode] !== undefined) {
    targetGameTypeId = GAME_MODES[patches.gameMode];
    dataObj.GameType = nbt.int(targetGameTypeId);
    appliedActions.push(`Chế độ chơi → ${MODE_KEY_TO_LABEL[patches.gameMode]}`);
  }

  if (patches.difficulty && DIFFICULTIES[patches.difficulty] !== undefined) {
    const diffId = DIFFICULTIES[patches.difficulty];
    dataObj.Difficulty = nbt.byte(diffId);
    dataObj.DifficultyLocked = nbt.byte(0);
    if (dataObj.difficulty_settings?.v) {
      dataObj.difficulty_settings.v.difficulty = nbt.string(patches.difficulty);
      dataObj.difficulty_settings.v.locked = nbt.byte(0);
    }
    appliedActions.push(`Độ khó → ${DIFF_KEY_TO_LABEL[patches.difficulty]}`);
  }

  if (typeof patches.allowCommands === 'boolean') {
    dataObj.allowCommands = nbt.byte(patches.allowCommands ? 1 : 0);
    appliedActions.push(patches.allowCommands ? 'Mở khóa Dùng Lệnh (Cheats)' : 'Tắt Dùng Lệnh');
  }

  if (typeof patches.keepInventory === 'boolean') {
    if (!dataObj.GameRules || dataObj.GameRules.t !== TAG.COMPOUND) {
      dataObj.GameRules = nbt.compound({});
    }
    const valStr = patches.keepInventory ? 'true' : 'false';
    dataObj.GameRules.v.keepInventory = nbt.string(valStr);
    dataObj.GameRules.v.keep_inventory = nbt.string(valStr);
    // Also sync blockway-rules datapack if world uses modern 26.x gamerule registry
    const bwRulesDir = path.join(worldDir, 'datapacks', 'blockway-rules');
    if (patches.keepInventory) {
      writeRulesDatapack(worldDir, { pack_version: 48 }, { keepInventory: true, alwaysDay: false });
      if (dataObj.DataPacks?.v?.Enabled?.v) {
        const hasBw = dataObj.DataPacks.v.Enabled.v.some((item) => item.v === 'file/blockway-rules');
        if (!hasBw) {
          dataObj.DataPacks.v.Enabled.v.push(nbt.string('file/blockway-rules'));
          dataObj.DataPacks.v.Enabled.et = TAG.STRING;
        }
      }
    } else if (fs.existsSync(bwRulesDir)) {
      try { fs.rmSync(bwRulesDir, { recursive: true, force: true }); } catch (_) {}
    }
    appliedActions.push(patches.keepInventory ? 'Bật Giữ Đồ Khi Chết' : 'Tắt Giữ Đồ Khi Chết');
  }

  if (patches.clearWeatherAndDay) {
    dataObj.DayTime = nbt.long(1000);
    dataObj.raining = nbt.byte(0);
    dataObj.thundering = nbt.byte(0);
    dataObj.rainTime = nbt.int(0);
    dataObj.thunderTime = nbt.int(0);
    dataObj.clearWeatherTime = nbt.int(24000);
    appliedActions.push('Chỉnh Trời Quang & Ban Ngày');
  }

  // Compute safe spawn coordinates in case teleportToSpawn or reviveHardcore is requested
  let spawnCoords = { x: 0, y: 72, z: 0 };
  if (Array.isArray(dataObj.spawn?.v?.pos?.v) && dataObj.spawn.v.pos.v.length >= 3) {
    spawnCoords = {
      x: Number(dataObj.spawn.v.pos.v[0]),
      y: Number(dataObj.spawn.v.pos.v[1]),
      z: Number(dataObj.spawn.v.pos.v[2])
    };
  } else if (dataObj.SpawnX !== undefined && dataObj.SpawnZ !== undefined) {
    spawnCoords = {
      x: Number(dataObj.SpawnX.v),
      y: Number(dataObj.SpawnY?.v ?? 72),
      z: Number(dataObj.SpawnZ.v)
    };
  }

  const doRevive = Boolean(patches.reviveHardcore);
  const doTeleport = Boolean(patches.teleportToSpawn);

  if (doRevive) {
    dataObj.hardcore = nbt.byte(0);
    dataObj.GameType = nbt.int(0);
    dataObj.allowCommands = nbt.byte(1);
    targetGameTypeId = 0;
    if (dataObj.difficulty_settings?.v) {
      dataObj.difficulty_settings.v.hardcore = nbt.byte(0);
      dataObj.difficulty_settings.v.locked = nbt.byte(0);
    }
    appliedActions.push('Hồi sinh khỏi Hardcore & hồi đầy 20 Máu');
  }
  if (doTeleport) {
    appliedActions.push(`Đưa nhân vật về Điểm Xuất Hiện (${spawnCoords.x}, ${spawnCoords.y + 1}, ${spawnCoords.z})`);
  }

  if (targetGameTypeId !== null || doRevive || doTeleport) {
    if (dataObj.Player?.v) {
      applyPlayerPatchesToCompound(dataObj.Player.v, {
        gameTypeId: targetGameTypeId,
        reviveHardcore: doRevive,
        teleportCoords: doTeleport ? spawnCoords : null
      });
    }
    // Also patch all playerdata/*.dat files so singleplayer/LAN UUID profiles stay in sync!
    const pdDir = path.join(worldDir, 'playerdata');
    if (fs.existsSync(pdDir)) {
      for (const f of fs.readdirSync(pdDir)) {
        if (!/\.dat$/i.test(f)) continue;
        const pFull = path.join(pdDir, f);
        try {
          const pRoot = readNbtRoot(zlib.gunzipSync(fs.readFileSync(pFull)));
          if (pRoot?.v) {
            applyPlayerPatchesToCompound(pRoot.v, {
              gameTypeId: targetGameTypeId,
              reviveHardcore: doRevive,
              teleportCoords: doTeleport ? spawnCoords : null
            });
            const pTmp = `${pFull}.tmp`;
            fs.writeFileSync(pTmp, zlib.gzipSync(writeNbtRoot(pRoot)));
            fs.renameSync(pTmp, pFull);
          }
        } catch (_) {}
      }
    }
  }

  const tmpLevel = `${levelDatPath}.tmp`;
  fs.writeFileSync(tmpLevel, zlib.gzipSync(writeNbtRoot(root)));
  fs.renameSync(tmpLevel, levelDatPath);

  const freshInspected = inspectWorldNbt(worldDir);
  return {
    ...freshInspected,
    ok: true,
    appliedActions,
    inspected: freshInspected
  };
}

module.exports = {
  createQuickWorld,
  supportsQuickWorldCreation,
  savesHasWorlds,
  resolveSeed,
  javaStringHashCode,
  CURATED_SEEDS_VAULT,
  inspectWorldNbt,
  rescueAndPatchWorldNbt,
  readNbtRoot,
  _internal: { writeNbtRoot, readNbtRoot, jsonToNbt, nbt, TAG, scanModDataPacks, findClientJar, makeWorldFolderName, encodeModifiedUtf8, decodeModifiedUtf8 }
};
