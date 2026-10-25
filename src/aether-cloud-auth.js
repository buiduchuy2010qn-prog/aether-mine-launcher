const { app, shell } = require('electron');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { generateOfflineUUID } = require('./microsoft-auth');

// Default 24/7 Internet Cloud Database Endpoint (RESTful Cloud JSON Store + Custom Firebase Realtime DB support)
const DEFAULT_CLOUD_OBJECT_ID = 'ff808181a09d98f701a1751517f20ae5';
const DEFAULT_CLOUD_BASE_URL = 'https://api.restful-api.dev/objects';

const AZURE_CLIENT_ID = 'c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb';
const AZURE_SCOPE = 'XboxLive.signin offline_access openid profile email';

let activeBrowserServer = null;

function getLocalCachePath() {
  try {
    return path.join(app.getPath('userData'), 'aether-cloud-db-cache.json');
  } catch (_) {
    return path.join(__dirname, '..', 'aether-cloud-db-cache.json');
  }
}

function readLocalCache() {
  try {
    const p = getLocalCachePath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (parsed && typeof parsed.users === 'object') {
        return {
          cloudObjectId: parsed.cloudObjectId || DEFAULT_CLOUD_OBJECT_ID,
          users: parsed.users || {},
          usernames: parsed.usernames || {}
        };
      }
    }
  } catch (_) {}
  return {
    cloudObjectId: DEFAULT_CLOUD_OBJECT_ID,
    users: {},
    usernames: {}
  };
}

function writeLocalCache(dbData) {
  try {
    const p = getLocalCachePath();
    fs.writeFileSync(p, JSON.stringify(dbData, null, 2), 'utf8');
  } catch (_) {}
}

function hashPassword(rawPassword) {
  return crypto
    .createHash('sha256')
    .update(`aether_cloud_salt_v1:${String(rawPassword || '')}`, 'utf8')
    .digest('hex');
}

function sanitizeMcUsername(rawInput) {
  let clean = String(rawInput || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');

  if (clean.length > 16) clean = clean.slice(0, 16);
  return clean;
}

function isFirebaseUrl(url) {
  return typeof url === 'string' && (url.includes('firebaseio.com') || url.includes('firebasedatabase.app'));
}

async function fetchCloudDatabase(customDbUrl = '') {
  const local = readLocalCache();
  const trimmedUrl = (customDbUrl || '').trim();

  try {
    if (isFirebaseUrl(trimmedUrl)) {
      const fbEndpoint = `${trimmedUrl.replace(/\/$/, '')}/aether_cloud.json`;
      const res = await fetch(fbEndpoint, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = (await res.json()) || {};
        const merged = {
          cloudObjectId: local.cloudObjectId,
          users: { ...local.users, ...(data.users || {}) },
          usernames: { ...local.usernames, ...(data.usernames || {}) }
        };
        writeLocalCache(merged);
        return merged;
      }
    } else {
      const objId = local.cloudObjectId || DEFAULT_CLOUD_OBJECT_ID;
      const endpoint = `${DEFAULT_CLOUD_BASE_URL}/${objId}`;
      const res = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const payload = await res.json();
        const remoteData = payload?.data || {};
        const merged = {
          cloudObjectId: objId,
          users: { ...local.users, ...(remoteData.users || {}) },
          usernames: { ...local.usernames, ...(remoteData.usernames || {}) }
        };
        writeLocalCache(merged);
        return merged;
      }
    }
  } catch (_) {}

  return local;
}

async function saveCloudDatabase(dbData, customDbUrl = '') {
  const cleanDb = {
    cloudObjectId: dbData.cloudObjectId || DEFAULT_CLOUD_OBJECT_ID,
    users: dbData.users || {},
    usernames: dbData.usernames || {}
  };
  writeLocalCache(cleanDb);

  const trimmedUrl = (customDbUrl || '').trim();
  try {
    if (isFirebaseUrl(trimmedUrl)) {
      const fbEndpoint = `${trimmedUrl.replace(/\/$/, '')}/aether_cloud.json`;
      await fetch(fbEndpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          users: cleanDb.users,
          usernames: cleanDb.usernames,
          updatedAt: Date.now()
        })
      });
      return true;
    }

    const objId = cleanDb.cloudObjectId || DEFAULT_CLOUD_OBJECT_ID;
    const endpoint = `${DEFAULT_CLOUD_BASE_URL}/${objId}`;
    const putRes = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'AetherCloudDB',
        data: {
          users: cleanDb.users,
          usernames: cleanDb.usernames,
          updatedAt: Date.now()
        }
      })
    });

    if (putRes.status === 404) {
      // Auto-recreate cloud bucket if needed
      const postRes = await fetch(DEFAULT_CLOUD_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'AetherCloudDB',
          data: {
            users: cleanDb.users,
            usernames: cleanDb.usernames,
            updatedAt: Date.now()
          }
        })
      });
      if (postRes.ok) {
        const created = await postRes.json();
        if (created?.id) {
          cleanDb.cloudObjectId = created.id;
          writeLocalCache(cleanDb);
        }
      }
    }
    return true;
  } catch (_) {
    return false;
  }
}

function toPublicProfile(userRecord) {
  if (!userRecord) return null;
  return {
    accountId: userRecord.accountId,
    loginId: userRecord.loginId,
    mcUsername: userRecord.mcUsername,
    uuid: userRecord.uuid || generateOfflineUUID(userRecord.mcUsername),
    skinModel: userRecord.skinModel || 'default',
    capeType: userRecord.capeType || 'mojang',
    skinPreset: userRecord.skinPreset || '',
    authProvider: userRecord.authProvider || 'password',
    createdAt: userRecord.createdAt,
    updatedAt: userRecord.updatedAt
  };
}

async function registerCloudAccount({
  loginId,
  password,
  mcUsername,
  skinModel = 'default',
  capeType = 'mojang',
  skinPreset = '',
  customDbUrl = ''
}) {
  const cleanLogin = String(loginId || '').trim().toLowerCase();
  if (cleanLogin.length < 3) {
    throw new Error('Tên đăng nhập (hoặc Email) phải có ít nhất 3 ký tự!');
  }
  if (!password || String(password).length < 4) {
    throw new Error('Mật khẩu phải có ít nhất 4 ký tự!');
  }

  const desiredMcName = sanitizeMcUsername(mcUsername || cleanLogin.split('@')[0]);
  if (desiredMcName.length < 3) {
    throw new Error('Tên nhân vật (Username) phải từ 3 đến 16 ký tự chữ hoặc số!');
  }

  const db = await fetchCloudDatabase(customDbUrl);

  // Check if loginId already exists
  const existingAccount = Object.values(db.users).find(
    (u) => u.loginId && u.loginId.toLowerCase() === cleanLogin
  );
  if (existingAccount) {
    throw new Error(`Tài khoản "${loginId}" đã được đăng ký trên Aether Cloud! Hãy bấm nút "Đăng Nhập".`);
  }

  // Check if mcUsername is already claimed on Aether Cloud
  const nameKey = desiredMcName.toLowerCase();
  const currentOwnerId = db.usernames[nameKey];
  if (currentOwnerId && db.users[currentOwnerId]) {
    throw new Error(`Tên nhân vật "${desiredMcName}" đã có người sở hữu trên Aether Cloud! Bạn hãy chọn tên khác nhé.`);
  }

  const accountId = 'ac_' + crypto.randomBytes(6).toString('hex');
  const now = Date.now();
  const newUser = {
    accountId,
    loginId: cleanLogin,
    passwordHash: hashPassword(password),
    mcUsername: desiredMcName,
    uuid: generateOfflineUUID(desiredMcName),
    skinModel: skinModel || 'default',
    capeType: capeType || 'mojang',
    skinPreset: skinPreset || '',
    authProvider: 'password',
    createdAt: now,
    updatedAt: now
  };

  db.users[accountId] = newUser;
  db.usernames[nameKey] = accountId;

  await saveCloudDatabase(db, customDbUrl);
  return toPublicProfile(newUser);
}

async function loginCloudAccount({ loginId, password, customDbUrl = '' }) {
  const cleanLogin = String(loginId || '').trim().toLowerCase();
  if (!cleanLogin || !password) {
    throw new Error('Vui lòng nhập đầy đủ Tên tài khoản và Mật khẩu!');
  }

  const db = await fetchCloudDatabase(customDbUrl);
  const passHash = hashPassword(password);

  // Allow login by either loginId (email/username) OR current mcUsername
  const user = Object.values(db.users).find(
    (u) =>
      (u.loginId && u.loginId.toLowerCase() === cleanLogin) ||
      (u.mcUsername && u.mcUsername.toLowerCase() === cleanLogin)
  );

  if (!user) {
    throw new Error(`Không tìm thấy tài khoản "${loginId}" trên Aether Cloud! Nếu chưa có tài khoản, hãy bấm "Đăng Ký Mới".`);
  }

  if (user.passwordHash !== passHash) {
    throw new Error('Mật khẩu không chính xác! Vui lòng kiểm tra lại.');
  }

  user.updatedAt = Date.now();
  await saveCloudDatabase(db, customDbUrl);
  return toPublicProfile(user);
}

async function changeCloudUsername({ accountId, newMcUsername, customDbUrl = '' }) {
  if (!accountId) {
    throw new Error('Bạn cần đăng nhập tài khoản Aether Cloud trước khi đổi tên!');
  }

  const cleanNewName = sanitizeMcUsername(newMcUsername);
  if (cleanNewName.length < 3 || cleanNewName.length > 16) {
    throw new Error('Tên nhân vật mới phải từ 3 đến 16 ký tự (chữ cái, chữ số hoặc dấu gạch dưới _)!');
  }

  const db = await fetchCloudDatabase(customDbUrl);
  const user = db.users[accountId];
  if (!user) {
    throw new Error('Không tìm thấy hồ sơ tài khoản trên Aether Cloud!');
  }

  const newKey = cleanNewName.toLowerCase();
  const existingOwner = db.usernames[newKey];
  if (existingOwner && existingOwner !== accountId && db.users[existingOwner]) {
    throw new Error(`⚠️ Tên nhân vật "${cleanNewName}" đã có người khác sở hữu trên Aether Cloud! Vui lòng chọn tên khác.`);
  }

  const oldKey = String(user.mcUsername || '').toLowerCase();
  if (oldKey && db.usernames[oldKey] === accountId) {
    delete db.usernames[oldKey];
  }

  user.mcUsername = cleanNewName;
  user.uuid = generateOfflineUUID(cleanNewName);
  user.updatedAt = Date.now();
  db.usernames[newKey] = accountId;

  await saveCloudDatabase(db, customDbUrl);
  return toPublicProfile(user);
}

async function syncCloudCosmetics({ accountId, skinModel, capeType, skinPreset, customDbUrl = '' }) {
  if (!accountId) return null;
  const db = await fetchCloudDatabase(customDbUrl);
  const user = db.users[accountId];
  if (!user) return null;

  if (skinModel) user.skinModel = skinModel;
  if (capeType) user.capeType = capeType;
  if (typeof skinPreset === 'string') user.skinPreset = skinPreset;
  user.updatedAt = Date.now();

  await saveCloudDatabase(db, customDbUrl);
  return toPublicProfile(user);
}

function decodeJwtPayload(jwtToken) {
  if (!jwtToken || typeof jwtToken !== 'string') return {};
  try {
    const parts = jwtToken.split('.');
    if (parts.length < 2) return {};
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) || {};
  } catch (_) {
    return {};
  }
}

async function findOrCreateBrowserCloudAccount({ name, email, sub, customDbUrl = '' }) {
  const cleanEmail = String(email || sub || '').trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error('Không đọc được địa chỉ Email từ trình duyệt.');
  }

  const db = await fetchCloudDatabase(customDbUrl);
  let user = Object.values(db.users).find(
    (u) => u.loginId && u.loginId.toLowerCase() === cleanEmail
  );

  if (user) {
    user.updatedAt = Date.now();
    await saveCloudDatabase(db, customDbUrl);
    return toPublicProfile(user);
  }

  // Create new Aether Cloud account linked to this email
  let baseMcName = sanitizeMcUsername(name || cleanEmail.split('@')[0]);
  if (baseMcName.length < 3) baseMcName = sanitizeMcUsername(cleanEmail.split('@')[0]) || 'AetherPlayer';

  let finalMcName = baseMcName;
  let suffix = 1;
  while (db.usernames[finalMcName.toLowerCase()]) {
    const numStr = String(suffix++);
    finalMcName = baseMcName.slice(0, Math.max(3, 16 - numStr.length)) + numStr;
  }

  const accountId = 'ac_' + crypto.randomBytes(6).toString('hex');
  const now = Date.now();
  user = {
    accountId,
    loginId: cleanEmail,
    passwordHash: hashPassword(sub || cleanEmail),
    mcUsername: finalMcName,
    uuid: generateOfflineUUID(finalMcName),
    skinModel: 'default',
    capeType: 'mojang',
    skinPreset: '',
    authProvider: 'browser_email',
    createdAt: now,
    updatedAt: now
  };

  db.users[accountId] = user;
  db.usernames[finalMcName.toLowerCase()] = accountId;
  await saveCloudDatabase(db, customDbUrl);
  return toPublicProfile(user);
}

function loginCloudViaBrowser({ parentWindow, customDbUrl = '' }) {
  return new Promise((resolve, reject) => {
    if (activeBrowserServer) {
      try { activeBrowserServer.close(); } catch (_) {}
      activeBrowserServer = null;
    }

    let completed = false;
    let timeoutTimer = null;

    const cleanup = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (activeBrowserServer) {
        try { activeBrowserServer.close(); } catch (_) {}
        activeBrowserServer = null;
      }
    };

    const focusLauncher = () => {
      if (parentWindow && !parentWindow.isDestroyed()) {
        if (parentWindow.isMinimized()) parentWindow.restore();
        parentWindow.show();
        parentWindow.focus();
      }
    };

    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, 'http://localhost');
        if (reqUrl.pathname === '/favicon.ico') {
          res.writeHead(204);
          return res.end();
        }

        const code = reqUrl.searchParams.get('code');
        const error = reqUrl.searchParams.get('error');
        if (!code && !error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end('<h3>Đang đồng bộ Aether Cloud ID...</h3>');
        }
        if (completed) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end('<h3>Đã hoàn tất.</h3>');
        }
        completed = true;

        const port = server.address()?.port || 25561;
        const redirectUri = `http://localhost:${port}`;

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h2>Đã hủy liên kết tài khoản Aether Cloud.</h2>');
          cleanup();
          focusLauncher();
          return reject(new Error('Đã hủy liên kết tài khoản trên trình duyệt.'));
        }

        const tokenRes = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: AZURE_CLIENT_ID,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            scope: AZURE_SCOPE
          }).toString()
        });

        if (!tokenRes.ok) {
          throw new Error(`Lỗi xác thực trình duyệt (${tokenRes.status}).`);
        }

        const tokenData = await tokenRes.json();
        const claims = decodeJwtPayload(tokenData.id_token);
        const profile = await findOrCreateBrowserCloudAccount({
          name: claims.name || '',
          email: claims.email || claims.preferred_username || '',
          sub: claims.sub || claims.oid || '',
          customDbUrl
        });

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/><title>Aether Cloud ID</title><style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#090d16;color:#f8fafc;font-family:'Segoe UI',sans-serif}.card{background:#111827;border:2px solid #06b6d4;border-radius:16px;padding:32px 38px;text-align:center;max-width:480px;box-shadow:0 20px 50px rgba(0,0,0,0.6)}h2{color:#22d3ee;margin:0 0 10px}.acc{margin:14px 0;padding:10px 16px;background:rgba(6,182,212,0.14);border-radius:10px;font-weight:800;font-size:16px}</style></head><body><div class="card"><h2>🛡️ Đã Kết Nối Aether Cloud ID!</h2><div class="acc">👤 Nhân vật: ${profile.mcUsername} (${profile.loginId})</div><p>Tài khoản của bạn đã được lưu trên Internet Database 24/7. Bạn có thể đổi Username tự do ngay trong Launcher!</p></div><script>setTimeout(()=>{try{window.close()}catch(e){}},1600)</script></body></html>`);

        cleanup();
        focusLauncher();
        resolve(profile);
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h2>Lỗi: ${err.message}</h2>`);
        cleanup();
        focusLauncher();
        reject(err);
      }
    });

    activeBrowserServer = server;

    server.listen(25561, '127.0.0.1', () => {
      const port = server.address().port;
      const redirectUri = `http://localhost:${port}`;
      const authUrl = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=${AZURE_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(AZURE_SCOPE)}&prompt=select_account`;
      shell.openExternal(authUrl);
    });

    server.on('error', () => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const redirectUri = `http://localhost:${port}`;
        const authUrl = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=${AZURE_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(AZURE_SCOPE)}&prompt=select_account`;
        shell.openExternal(authUrl);
      });
    });

    timeoutTimer = setTimeout(() => {
      if (!completed) {
        completed = true;
        cleanup();
        reject(new Error('Hết thời gian chờ liên kết trên trình duyệt.'));
      }
    }, 180000);
  });
}

module.exports = {
  registerCloudAccount,
  loginCloudAccount,
  changeCloudUsername,
  syncCloudCosmetics,
  loginCloudViaBrowser
};
