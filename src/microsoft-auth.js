const { app, shell } = require('electron');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Default 24/7 Internet Cloud Database Endpoint (RESTful Cloud JSON Store + Custom Firebase Realtime DB support)
const DEFAULT_CLOUD_OBJECT_ID = 'ff808181a09d98f701a1751517f20ae5';
const DEFAULT_CLOUD_BASE_URL = 'https://api.restful-api.dev/objects';

// Public Azure AD v2.0 Native Client ID supporting http://localhost:<port> loopback & XboxLive.signin
const AZURE_CLIENT_ID = 'c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb';
const AZURE_SCOPE = 'XboxLive.signin offline_access openid profile email';

let activeAuthServer = null;

function formatUUID(rawId) {
  if (!rawId) return '';
  const clean = rawId.replace(/-/g, '');
  if (clean.length !== 32) return rawId;
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`;
}

// Standard Minecraft Offline UUID (v3 MD5 of "OfflinePlayer:<username>")
function generateOfflineUUID(username = 'StevePlayer') {
  const clean = (username || 'StevePlayer').trim() || 'StevePlayer';
  const md5Bytes = crypto.createHash('md5').update(`OfflinePlayer:${clean}`, 'utf8').digest();
  md5Bytes[6] = (md5Bytes[6] & 0x0f) | 0x30; // version 3
  md5Bytes[8] = (md5Bytes[8] & 0x3f) | 0x80; // variant RFC 4122
  return formatUUID(md5Bytes.toString('hex'));
}

function createOfflineAuth(username = 'StevePlayer') {
  const clean = (username || 'StevePlayer').trim().slice(0, 16) || 'StevePlayer';
  const uuid = generateOfflineUUID(clean);
  return {
    access_token: uuid,
    client_token: uuid,
    uuid: uuid,
    name: clean,
    user_properties: '{}',
    meta: {
      type: 'mojang',
      demo: false
    }
  };
}

function decodeJwtPayload(jwtToken) {
  if (!jwtToken || typeof jwtToken !== 'string') return {};
  try {
    const parts = jwtToken.split('.');
    if (parts.length < 2) return {};
    const jsonStr = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(jsonStr) || {};
  } catch (_) {
    return {};
  }
}

async function authenticateXboxLiveWithFallback(msAccessToken) {
  const ticketVariants = [
    `d=${msAccessToken}`,
    msAccessToken,
    `t=${msAccessToken}`
  ];

  let lastStatus = 0;
  for (const rpsTicket of ticketVariants) {
    try {
      const xblRes = await fetch('https://user.auth.xboxlive.com/user/authenticate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          Properties: {
            AuthMethod: 'RPS',
            SiteName: 'user.auth.xboxlive.com',
            RpsTicket: rpsTicket
          },
          RelyingParty: 'http://auth.xboxlive.com',
          TokenType: 'JWT'
        })
      });
      lastStatus = xblRes.status;
      if (xblRes.ok) {
        return await xblRes.json();
      }
    } catch (_) {}
  }
  throw new Error(`Lỗi xác thực Xbox Live (HTTP ${lastStatus}).`);
}

async function authenticateMinecraftChain({ code, refreshToken, redirectUri }) {
  const tokenParams = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    scope: AZURE_SCOPE
  });

  if (code) {
    tokenParams.set('grant_type', 'authorization_code');
    tokenParams.set('code', code);
    if (redirectUri) tokenParams.set('redirect_uri', redirectUri);
  } else if (refreshToken) {
    tokenParams.set('grant_type', 'refresh_token');
    tokenParams.set('refresh_token', refreshToken);
  } else {
    throw new Error('Thiếu mã xác thực Microsoft (code hoặc refresh_token).');
  }

  const msRes = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString()
  });

  if (!msRes.ok) {
    const errText = await msRes.text();
    throw new Error(`Lỗi xác thực Microsoft OAuth (${msRes.status}): ${errText}`);
  }
  const msData = await msRes.json();

  // Extract verified Microsoft Account Name & Email from OIDC id_token for clear error reporting
  const idClaims = decodeJwtPayload(msData.id_token);
  const msName = idClaims.name || '';
  const msEmail = idClaims.email || idClaims.preferred_username || '';
  const accountLabel = msName && msEmail
    ? `${msName} (${msEmail})`
    : (msEmail || msName || 'Microsoft của bạn');

  const xblData = await authenticateXboxLiveWithFallback(msData.access_token);
  const xblToken = xblData.Token;
  const uhs = xblData.DisplayClaims?.xui?.[0]?.uhs;
  if (!xblToken || !uhs) {
    throw new Error(`Không lấy được mã Xbox Live (uhs) cho tài khoản ${accountLabel}.`);
  }

  const xstsRes = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      Properties: {
        SandboxId: 'RETAIL',
        UserTokens: [xblToken]
      },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    })
  });

  if (!xstsRes.ok) {
    const xstsErr = await xstsRes.json().catch(() => ({}));
    if (xstsErr.XErr === 2148916233) {
      throw new Error(`Tài khoản Microsoft "${accountLabel}" chưa tạo hồ sơ Xbox Live và chưa sở hữu bản quyền Minecraft: Java Edition! Vui lòng chuyển sang tab "Offline (Crack)" để chơi miễn phí.`);
    }
    if (xstsErr.XErr === 2148916238) {
      throw new Error(`Tài khoản Microsoft "${accountLabel}" dưới 18 tuổi cần được người lớn thêm vào nhóm Gia đình (Microsoft Family) trước khi đăng nhập.`);
    }
    throw new Error(`Lỗi xác thực Xbox XSTS (${xstsRes.status}) cho tài khoản ${accountLabel}.`);
  }

  const xstsData = await xstsRes.json();
  const xstsToken = xstsData.Token;
  const xuid = xstsData.DisplayClaims?.xui?.[0]?.xid || uhs;

  const mcLoginRes = await fetch('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      identityToken: `XBL3.0 x=${uhs};${xstsToken}`
    })
  });

  if (!mcLoginRes.ok) {
    throw new Error(`Không thể kết nối máy chủ Mojang Minecraft Services (${mcLoginRes.status}) cho tài khoản ${accountLabel}.`);
  }

  const mcLoginData = await mcLoginRes.json();
  const mcAccessToken = mcLoginData.access_token;

  // STRICT MOJANG JAVA EDITION OWNERSHIP CHECK
  const profileRes = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: {
      'Authorization': `Bearer ${mcAccessToken}`
    }
  });

  if (profileRes.status === 404) {
    throw new Error(`Tài khoản Microsoft "${accountLabel}" CHƯA MUA bản quyền Minecraft: Java Edition trên hệ thống Mojang (minecraft.net)! Chỉ tài khoản đã mua game (hoặc có gói Xbox Game Pass PC) mới đăng nhập được mục Bản Quyền. Bạn hãy chọn tab "Offline (Crack)" bên cạnh để chơi miễn phí nhé!`);
  }
  if (!profileRes.ok) {
    throw new Error(`Tài khoản Microsoft "${accountLabel}" không có hồ sơ Minecraft bản quyền hợp lệ (Mã lỗi: ${profileRes.status}).`);
  }

  const profileData = await profileRes.json();
  if (!profileData || !profileData.id || !profileData.name) {
    throw new Error(`Tài khoản Microsoft "${accountLabel}" chưa kích hoạt nhân vật Minecraft: Java Edition bản quyền!`);
  }

  const formattedUuid = formatUUID(profileData.id);

  return {
    name: profileData.name,
    displayName: msEmail ? `${profileData.name} (${msEmail})` : profileData.name,
    email: msEmail,
    uuid: formattedUuid,
    accessToken: mcAccessToken,
    refreshToken: msData.refresh_token,
    xuid: xuid,
    isOfficialLicense: true,
    expiresAt: Date.now() + ((mcLoginData.expires_in || 86400) * 1000) - 60000,
    skinUrl: profileData.skins?.[0]?.url || null
  };
}

function buildSuccessHtml(profile) {
  const label = profile ? (profile.displayName || profile.name) : 'Tài khoản Microsoft';
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>Đã xác thực Bản Quyền — Aether Craft Launcher</title>
  <style>
    body {
      margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center;
      background: #090d16; color: #f8fafc; font-family: 'Segoe UI', system-ui, sans-serif;
    }
    .card {
      background: #111827; border: 2px solid #22c55e; border-radius: 16px;
      padding: 32px 38px; text-align: center; max-width: 480px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.6), 0 0 30px rgba(34,197,94,0.2);
    }
    .badge {
      width: 56px; height: 56px; border-radius: 50%; background: rgba(34,197,94,0.18);
      color: #4ade80; font-size: 28px; font-weight: 900; display: inline-flex;
      align-items: center; justify-content: center; margin-bottom: 14px;
      border: 2px solid #22c55e;
    }
    h2 { margin: 0 0 8px; font-size: 20px; color: #4ade80; }
    p { margin: 6px 0; font-size: 14px; color: #cbd5e1; line-height: 1.5; }
    .acc {
      margin-top: 14px; padding: 10px 16px; background: rgba(34,197,94,0.12);
      border-radius: 10px; font-weight: 800; color: #fff; font-size: 15px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✓</div>
    <h2>Xác Thực Bản Quyền Minecraft Thành Công!</h2>
    <div class="acc">👑 ${label}</div>
    <p style="margin-top:14px;">Đã kiểm tra giấy phép Mojang hợp lệ và đồng bộ vào <strong>Aether Craft Launcher</strong>.</p>
    <p style="font-size:12.5px;opacity:0.75;">Bạn có thể đóng tab trình duyệt này và quay lại Launcher.</p>
  </div>
  <script>setTimeout(() => { try { window.close(); } catch(e) {} }, 1800);</script>
</body>
</html>`;
}

function buildErrorHtml(errorMsg) {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>Chưa Có Bản Quyền Minecraft — Aether Craft Launcher</title>
  <style>
    body {
      margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center;
      background: #090d16; color: #f8fafc; font-family: 'Segoe UI', system-ui, sans-serif;
    }
    .card {
      background: #111827; border: 2px solid #ef4444; border-radius: 16px;
      padding: 32px 38px; text-align: center; max-width: 520px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.6), 0 0 30px rgba(239,68,68,0.2);
    }
    .badge {
      width: 56px; height: 56px; border-radius: 50%; background: rgba(239,68,68,0.18);
      color: #f87171; font-size: 28px; font-weight: 900; display: inline-flex;
      align-items: center; justify-content: center; margin-bottom: 14px;
      border: 2px solid #ef4444;
    }
    h2 { margin: 0 0 10px; font-size: 20px; color: #f87171; }
    p { margin: 8px 0; font-size: 14px; color: #e2e8f0; line-height: 1.55; }
    .hint {
      margin-top: 16px; padding: 12px 16px; background: rgba(245,158,11,0.12);
      border: 1px solid rgba(245,158,11,0.4); border-radius: 10px; color: #fde68a; font-size: 13.5px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✕</div>
    <h2>Tài Khoản Chưa Có Bản Quyền Minecraft!</h2>
    <p>${errorMsg}</p>
    <div class="hint">💡 Quay lại <strong>Aether Craft Launcher</strong> và chọn tab <strong>"Offline (Crack)"</strong> để chơi miễn phí với mọi tính năng Skin 3D & Modrinth!</div>
  </div>
</body>
</html>`;
}

function openMicrosoftLoginPopup(parentWindow) {
  return new Promise((resolve, reject) => {
    if (activeAuthServer) {
      try { activeAuthServer.close(); } catch (_) {}
      activeAuthServer = null;
    }

    let completed = false;
    let timeoutTimer = null;

    const cleanup = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (activeAuthServer) {
        try { activeAuthServer.close(); } catch (_) {}
        activeAuthServer = null;
      }
    };

    const focusLauncherWindow = () => {
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
        const errorDesc = reqUrl.searchParams.get('error_description');

        if (!code && !error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end('<h3>Đang chờ xác thực Microsoft...</h3>');
        }

        if (completed) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end('<h3>Đã xử lý phiên đăng nhập.</h3>');
        }
        completed = true;

        const port = server.address()?.port || 25560;
        const redirectUri = `http://localhost:${port}`;

        if (error) {
          const msg = `Đã hủy hoặc từ chối đăng nhập trên trình duyệt (${errorDesc || error}).`;
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(buildErrorHtml(msg));
          cleanup();
          focusLauncherWindow();
          return reject(new Error(msg));
        }

        const profile = await authenticateMinecraftChain({ code, redirectUri });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buildSuccessHtml(profile));

        cleanup();
        focusLauncherWindow();
        resolve(profile);
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buildErrorHtml(err.message));
        cleanup();
        focusLauncherWindow();
        reject(err);
      }
    });

    activeAuthServer = server;

    server.listen(25560, '127.0.0.1', () => {
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
        reject(new Error('Hết thời gian chờ đăng nhập trên trình duyệt (3 phút).'));
      }
    }, 180000);
  });
}

async function loginWithMicrosoftModal(parentWindow) {
  return openMicrosoftLoginPopup(parentWindow);
}

async function authenticateMicrosoftFromRefreshToken(refreshToken) {
  return authenticateMinecraftChain({ refreshToken });
}

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
    skinDataUrl: userRecord.skinDataUrl || '',
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
  skinDataUrl = '',
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

  const existingAccount = Object.values(db.users).find(
    (u) => u.loginId && u.loginId.toLowerCase() === cleanLogin
  );
  if (existingAccount) {
    throw new Error(`Tài khoản "${loginId}" đã được đăng ký trên Aether Cloud! Hãy bấm nút "Đăng Nhập".`);
  }

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
    skinDataUrl: (typeof skinDataUrl === 'string' && skinDataUrl.length < 35000) ? skinDataUrl : '',
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

  const user = Object.values(db.users).find(
    (u) =>
      (u.loginId && u.loginId.toLowerCase() === cleanLogin) ||
      (u.mcUsername && u.mcUsername.toLowerCase() === cleanLogin)
  );

  if (!user) {
    throw new Error(`Không tìm thấy tài khoản "${loginId}" trên Aether Cloud! Nếu chưa có tài khoản, hãy bấm "Tạo Tài Khoản".`);
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

async function syncCloudCosmetics({ accountId, skinModel, capeType, skinPreset, skinDataUrl, customDbUrl = '' }) {
  if (!accountId) return null;
  const db = await fetchCloudDatabase(customDbUrl);
  const user = db.users[accountId];
  if (!user) return null;

  if (skinModel) user.skinModel = skinModel;
  if (capeType) user.capeType = capeType;
  if (typeof skinPreset === 'string') user.skinPreset = skinPreset;
  if (typeof skinDataUrl === 'string' && skinDataUrl.startsWith('data:image/png;base64,') && skinDataUrl.length < 35000) {
    user.skinDataUrl = skinDataUrl;
  }
  user.updatedAt = Date.now();

  await saveCloudDatabase(db, customDbUrl);
  return toPublicProfile(user);
}

async function changeCloudPassword({ accountId, oldPassword, newPassword, customDbUrl = '' }) {
  if (!accountId) {
    throw new Error('Bạn cần đăng nhập tài khoản Aether Cloud trước!');
  }
  if (!oldPassword) {
    throw new Error('⚠️ Vui lòng nhập Mật khẩu cũ hiện tại để xác minh bảo mật!');
  }
  if (!newPassword || String(newPassword).length < 4) {
    throw new Error('Mật khẩu mới phải có ít nhất 4 ký tự!');
  }

  const db = await fetchCloudDatabase(customDbUrl);
  const user = db.users[accountId];
  if (!user) {
    throw new Error('Không tìm thấy hồ sơ tài khoản trên Aether Cloud!');
  }

  const oldHash = hashPassword(oldPassword);
  if (user.passwordHash && user.passwordHash !== oldHash) {
    throw new Error('⚠️ Mật khẩu cũ không chính xác! Vui lòng nhập đúng mật khẩu hiện tại.');
  }

  user.passwordHash = hashPassword(newPassword);
  user.authProvider = 'password';
  user.updatedAt = Date.now();
  await saveCloudDatabase(db, customDbUrl);
  return toPublicProfile(user);
}

function requestPasswordResetOtp({ loginId, parentWindow, customDbUrl = '' }) {
  return new Promise(async (resolve, reject) => {
    try {
      const cleanLogin = String(loginId || '').trim().toLowerCase();
      if (!cleanLogin) {
        return reject(new Error('Vui lòng nhập Email hoặc Tên tài khoản ở ô bên trên trước khi bấm Nhận Mã OTP!'));
      }

      const db = await fetchCloudDatabase(customDbUrl);
      const user = Object.values(db.users).find(
        (u) =>
          (u.loginId && u.loginId.toLowerCase() === cleanLogin) ||
          (u.mcUsername && u.mcUsername.toLowerCase() === cleanLogin)
      );

      if (!user) {
        return reject(new Error(`Không tìm thấy tài khoản "${loginId}" trên Aether Cloud Database!`));
      }

      const otpCode = String(Math.floor(100000 + Math.random() * 900000));
      db.users[user.accountId].resetOtpHash = hashPassword(otpCode);
      db.users[user.accountId].resetOtpExpires = Date.now() + 5 * 60 * 1000;
      await saveCloudDatabase(db, customDbUrl);

      if (activeBrowserServer) {
        try { activeBrowserServer.close(); } catch (_) {}
        activeBrowserServer = null;
      }

      const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/><title>Hộp Thư Bảo Mật OTP — Aether Cloud 24/7</title><style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#090d16;color:#f8fafc;font-family:'Segoe UI',system-ui,sans-serif}.card{background:#111827;border:2px solid #22c55e;border-radius:18px;padding:34px 40px;text-align:center;max-width:480px;box-shadow:0 24px 60px rgba(0,0,0,0.7)}.badge{display:inline-block;padding:5px 14px;border-radius:999px;background:rgba(34,197,94,0.16);color:#4ade80;font-weight:800;font-size:12px;margin-bottom:10px}h2{color:#4ade80;margin:0 0 8px;font-size:21px}.otp{margin:18px 0;padding:16px 22px;background:rgba(34,197,94,0.14);border:2px dashed #22c55e;border-radius:14px;font-weight:900;font-size:36px;letter-spacing:10px;color:#fff;user-select:all}.btn{background:#16a34a;color:#fff;border:none;padding:11px 24px;border-radius:10px;font-weight:800;font-size:14px;cursor:pointer;margin-top:6px}.btn:hover{background:#15803d}</style></head><body><div class="card"><div class="badge">☁️ AETHER CLOUD SECURITY 24/7</div><h2>📨 MÃ OTP KHÔI PHỤC MẬT KHẨU</h2><p style="color:#cbd5e1;font-size:14px;">Tài khoản: <strong style="color:#fff;">${user.loginId}</strong> (Nhân vật: <strong style="color:#38bdf8;">${user.mcUsername}</strong>)</p><div class="otp" id="otpVal">${otpCode}</div><button class="btn" onclick="navigator.clipboard.writeText('${otpCode}');this.textContent='✓ Đã sao chép Mã OTP (${otpCode})!';">📋 Sao chép Mã OTP 6 Số</button><p style="font-size:13px;color:#94a3b8;margin-top:16px;">Quay lại <strong>Aether Craft Launcher</strong> và dán mã 6 số này vào ô <strong>Mã OTP 6 số</strong> để đặt mật khẩu mới (Hiệu lực: 5 phút).</p></div></body></html>`);
      });

      activeBrowserServer = server;

      const launchOtpPage = (port) => {
        shell.openExternal(`http://127.0.0.1:${port}/aether-otp`);
        setTimeout(() => {
          try { server.close(); } catch (_) {}
          if (activeBrowserServer === server) activeBrowserServer = null;
        }, 120000);
        resolve({ ok: true, loginId: user.loginId, mcUsername: user.mcUsername });
      };

      server.listen(25562, '127.0.0.1', () => launchOtpPage(server.address().port));
      server.on('error', () => {
        server.listen(0, '127.0.0.1', () => launchOtpPage(server.address().port));
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function resetCloudPassword({ loginId, otpCode, newPassword, customDbUrl = '' }) {
  const cleanLogin = String(loginId || '').trim().toLowerCase();
  const cleanOtp = String(otpCode || '').trim();
  if (!cleanLogin) {
    throw new Error('Vui lòng nhập Tên đăng nhập (hoặc Email) cần đặt lại mật khẩu!');
  }
  if (!/^\d{6}$/.test(cleanOtp)) {
    throw new Error('⚠️ Vui lòng bấm "📨 Nhận Mã OTP" và nhập đúng Mã OTP 6 chữ số!');
  }
  if (!newPassword || String(newPassword).length < 4) {
    throw new Error('Mật khẩu mới phải có ít nhất 4 ký tự!');
  }

  const db = await fetchCloudDatabase(customDbUrl);
  const user = Object.values(db.users).find(
    (u) =>
      (u.loginId && u.loginId.toLowerCase() === cleanLogin) ||
      (u.mcUsername && u.mcUsername.toLowerCase() === cleanLogin)
  );
  if (!user) {
    throw new Error(`Không tìm thấy tài khoản "${loginId}" trên Aether Cloud!`);
  }

  if (!user.resetOtpHash || !user.resetOtpExpires || Date.now() > user.resetOtpExpires) {
    throw new Error('⚠️ Mã OTP đã hết hạn hoặc chưa được tạo! Hãy bấm nút "📨 Nhận Mã OTP" trước.');
  }

  if (hashPassword(cleanOtp) !== user.resetOtpHash) {
    throw new Error('⚠️ Mã OTP 6 số không chính xác! Vui lòng kiểm tra lại.');
  }

  user.passwordHash = hashPassword(newPassword);
  delete user.resetOtpHash;
  delete user.resetOtpExpires;
  user.updatedAt = Date.now();
  await saveCloudDatabase(db, customDbUrl);
  return toPublicProfile(user);
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
  openMicrosoftLoginPopup,
  loginWithMicrosoftModal,
  authenticateMinecraftChain,
  authenticateMicrosoftFromRefreshToken,
  generateOfflineUUID,
  createOfflineAuth,
  formatUUID,
  registerCloudAccount,
  loginCloudAccount,
  changeCloudUsername,
  syncCloudCosmetics,
  changeCloudPassword,
  requestPasswordResetOtp,
  resetCloudPassword,
  loginCloudViaBrowser
};
