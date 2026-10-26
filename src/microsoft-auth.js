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

function purgeLegacyDiskCache() {
  try {
    const p = getLocalCachePath();
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  } catch (_) {}
}

function readLocalCache() {
  // ZERO-TRUST SECURITY: Never store or read full account tables / password hashes on local disk
  purgeLegacyDiskCache();
  return {
    cloudObjectId: DEFAULT_CLOUD_OBJECT_ID,
    users: {},
    usernames: {}
  };
}

function writeLocalCache(_dbData) {
  // ZERO-TRUST SECURITY: Never write account tables or password hashes to local disk
  purgeLegacyDiskCache();
}

function generateSessionToken() {
  return 'ast_' + crypto.randomBytes(24).toString('hex');
}

async function callSupabaseRpc(fnName, params = {}) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: getSupabaseHeaders({ Accept: 'application/json' }),
      body: JSON.stringify(params)
    });
    if (res.status === 404) {
      return { rpcUnavailable: true };
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.message || data?.error || '';
      if (String(msg).includes('Could not find the function')) {
        return { rpcUnavailable: true };
      }
      return { ok: false, error: msg || `Lỗi RPC (${res.status})` };
    }
    if (data && typeof data === 'object') {
      return data;
    }
    return { rpcUnavailable: true };
  } catch (_) {
    return { rpcUnavailable: true };
  }
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

const SUPABASE_URL = 'https://nomnwwlancfjkitsdtvh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_RvH-sAYK-jaSpQ8p1C49XA_FdvE4KJa';

function getSupabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
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
      // Primary: Supabase PostgreSQL 24/7 (Southeast Asia - Singapore)
      const sbEndpoint = `${SUPABASE_URL}/rest/v1/aether_accounts?select=*`;
      const res = await fetch(sbEndpoint, {
        headers: getSupabaseHeaders({ Accept: 'application/json' })
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) {
          const sbUsers = {};
          const sbUsernames = {};
          for (const row of rows) {
            if (!row || !row.account_id) continue;
            const userObj = {
              accountId: row.account_id,
              loginId: row.login_id,
              passwordHash: row.password_hash,
              mcUsername: row.mc_username,
              uuid: row.uuid || generateOfflineUUID(row.mc_username),
              skinModel: row.skin_model || 'default',
              capeType: row.cape_type || 'mojang',
              skinPreset: row.skin_preset || '',
              skinDataUrl: row.skin_data_url || '',
              resetOtpHash: row.reset_otp_hash || null,
              resetOtpExpires: row.reset_otp_expires ? Number(row.reset_otp_expires) : null,
              authProvider: 'supabase_cloud',
              createdAt: Number(row.created_at) || Date.now(),
              updatedAt: Number(row.updated_at) || Date.now()
            };
            sbUsers[userObj.accountId] = userObj;
            if (userObj.mcUsername) {
              sbUsernames[userObj.mcUsername.toLowerCase()] = userObj.accountId;
            }
          }
          const merged = {
            cloudObjectId: 'supabase_nomnwwlancfjkitsdtvh',
            users: sbUsers,
            usernames: sbUsernames
          };
          writeLocalCache(merged);
          return merged;
        }
      }
    }
  } catch (_) {}

  return local;
}

async function saveCloudDatabase(dbData, customDbUrl = '') {
  const cleanDb = {
    cloudObjectId: dbData.cloudObjectId || 'supabase_nomnwwlancfjkitsdtvh',
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

    // Primary: Upsert rows into Supabase PostgreSQL public.aether_accounts
    const rows = Object.values(cleanDb.users).map((u) => ({
      account_id: u.accountId,
      login_id: u.loginId,
      password_hash: u.passwordHash,
      mc_username: u.mcUsername,
      uuid: u.uuid || generateOfflineUUID(u.mcUsername),
      skin_model: u.skinModel || 'default',
      cape_type: u.capeType || 'mojang',
      skin_preset: u.skinPreset || '',
      skin_data_url: u.skinDataUrl || '',
      reset_otp_hash: u.resetOtpHash || null,
      reset_otp_expires: u.resetOtpExpires || null,
      created_at: u.createdAt || Date.now(),
      updated_at: u.updatedAt || Date.now()
    }));

    if (rows.length > 0) {
      const sbEndpoint = `${SUPABASE_URL}/rest/v1/aether_accounts?on_conflict=account_id`;
      await fetch(sbEndpoint, {
        method: 'POST',
        headers: getSupabaseHeaders({
          Prefer: 'resolution=merge-duplicates,return=minimal'
        }),
        body: JSON.stringify(rows)
      });
    }
    return true;
  } catch (_) {
    return false;
  }
}

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'tempmail.com', 'temp-mail.org', '10minutemail.com', 'yopmail.com', 'guerrillamail.com',
  'mailinator.com', 'trashmail.com', 'sharklasers.com', 'dispostable.com', 'maildrop.cc', 'getnada.com'
]);

const antiSpamState = {
  failedAttempts: 0,
  lockedUntil: 0,
  lastRegisterAt: 0,
  lastOtpAt: 0,
  lastRenameAt: 0
};

function checkAntiBotLock() {
  const now = Date.now();
  if (antiSpamState.lockedUntil > now) {
    const waitSec = Math.ceil((antiSpamState.lockedUntil - now) / 1000);
    throw new Error(`🛡️ Chống Bot Spam: Bạn đã thao tác sai quá nhiều lần! Tạm khóa bảo vệ trong ${waitSec} giây.`);
  }
}

function recordFailedAuthAttempt() {
  antiSpamState.failedAttempts += 1;
  if (antiSpamState.failedAttempts >= 5) {
    antiSpamState.lockedUntil = Date.now() + 60 * 1000;
    antiSpamState.failedAttempts = 0;
    throw new Error('🛡️ Chống Bot dò mật khẩu: Nhập sai 5 lần liên tiếp! Tạm khóa 60 giây để bảo vệ tài khoản.');
  }
}

function resetFailedAuthAttempts() {
  antiSpamState.failedAttempts = 0;
}

function toPublicProfile(userRecord) {
  if (!userRecord) return null;
  return {
    accountId: userRecord.accountId || userRecord.account_id,
    loginId: userRecord.loginId || userRecord.login_id,
    mcUsername: userRecord.mcUsername || userRecord.mc_username,
    uuid: userRecord.uuid || generateOfflineUUID(userRecord.mcUsername || userRecord.mc_username),
    skinModel: userRecord.skinModel || userRecord.skin_model || 'default',
    capeType: userRecord.capeType || userRecord.cape_type || 'mojang',
    skinPreset: userRecord.skinPreset || userRecord.skin_preset || '',
    skinDataUrl: userRecord.skinDataUrl || userRecord.skin_data_url || '',
    sessionToken: userRecord.sessionToken || userRecord.session_token || '',
    authProvider: userRecord.authProvider || 'supabase_zero_trust',
    createdAt: Number(userRecord.createdAt || userRecord.created_at) || Date.now(),
    updatedAt: Number(userRecord.updatedAt || userRecord.updated_at) || Date.now()
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
  checkAntiBotLock();

  const now = Date.now();
  if (now - antiSpamState.lastRegisterAt < 90 * 1000) {
    const waitSec = Math.ceil((90 * 1000 - (now - antiSpamState.lastRegisterAt)) / 1000);
    throw new Error(`🛡️ Chống Bot Spam: Mỗi máy chỉ được tạo 1 tài khoản mới mỗi 90 giây! Vui lòng đợi ${waitSec}s.`);
  }

  const cleanLogin = String(loginId || '').trim().toLowerCase();
  if (cleanLogin.length < 3 || cleanLogin.length > 64) {
    throw new Error('Tên đăng nhập (hoặc Email) phải từ 3 đến 64 ký tự!');
  }
  if (cleanLogin.includes('@')) {
    const emailDomain = cleanLogin.split('@')[1] || '';
    if (!emailDomain.includes('.') || DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
      throw new Error('🛡️ Chống Spam: Không chấp nhận Email ảo / Email rác tạm thời! Vui lòng dùng Gmail hoặc Email thật.');
    }
  }
  if (!password || String(password).length < 4) {
    throw new Error('Mật khẩu phải có ít nhất 4 ký tự!');
  }

  const desiredMcName = sanitizeMcUsername(mcUsername || cleanLogin.split('@')[0]);
  if (desiredMcName.length < 3) {
    throw new Error('Tên nhân vật (Username) phải từ 3 đến 16 ký tự chữ hoặc số!');
  }

  const accountId = 'ac_' + crypto.randomBytes(6).toString('hex');
  const sessionToken = generateSessionToken();
  const passHash = hashPassword(password);
  const cleanSkinUrl = (typeof skinDataUrl === 'string' && skinDataUrl.length < 35000) ? skinDataUrl : '';

  // 1. Try Server-Side Zero-Trust Supabase RPC first
  const rpcRes = await callSupabaseRpc('aether_rpc_register', {
    p_account_id: accountId,
    p_login_id: cleanLogin,
    p_password_hash: passHash,
    p_mc_username: desiredMcName,
    p_uuid: generateOfflineUUID(desiredMcName),
    p_skin_model: skinModel || 'default',
    p_cape_type: capeType || 'mojang',
    p_skin_preset: skinPreset || '',
    p_skin_data_url: cleanSkinUrl,
    p_session_token: sessionToken,
    p_now: now
  });

  if (!rpcRes.rpcUnavailable) {
    if (!rpcRes.ok) {
      throw new Error(rpcRes.error || 'Không thể đăng ký tài khoản trên Supabase Cloud!');
    }
    antiSpamState.lastRegisterAt = Date.now();
    resetFailedAuthAttempts();
    return toPublicProfile({ ...rpcRes.profile, sessionToken });
  }

  // 2. Fallback if user hasn't run the SQL RPC Lock script yet
  const db = await fetchCloudDatabase(customDbUrl);

  const existingAccount = Object.values(db.users).find(
    (u) => u.loginId && u.loginId.toLowerCase() === cleanLogin
  );
  if (existingAccount) {
    throw new Error(`Tài khoản "${loginId}" đã được đăng ký trên Aether Cloud! Hãy chuyển sang mục "🔑 Đăng Nhập".`);
  }

  const nameKey = desiredMcName.toLowerCase();
  const currentOwnerId = db.usernames[nameKey];
  if (currentOwnerId && db.users[currentOwnerId]) {
    throw new Error(`Tên nhân vật "${desiredMcName}" đã có người sở hữu trên Aether Cloud! Bạn hãy chọn tên khác nhé.`);
  }

  const newUser = {
    accountId,
    loginId: cleanLogin,
    passwordHash: passHash,
    mcUsername: desiredMcName,
    uuid: generateOfflineUUID(desiredMcName),
    skinModel: skinModel || 'default',
    capeType: capeType || 'mojang',
    skinPreset: skinPreset || '',
    skinDataUrl: cleanSkinUrl,
    sessionToken,
    authProvider: 'password',
    createdAt: now,
    updatedAt: now
  };

  db.users[accountId] = newUser;
  db.usernames[nameKey] = accountId;

  await saveCloudDatabase(db, customDbUrl);
  antiSpamState.lastRegisterAt = Date.now();
  resetFailedAuthAttempts();
  return toPublicProfile(newUser);
}

async function loginCloudAccount({ loginId, password, customDbUrl = '' }) {
  checkAntiBotLock();

  const cleanLogin = String(loginId || '').trim().toLowerCase();
  if (!cleanLogin || !password) {
    throw new Error('Vui lòng nhập đầy đủ Tên tài khoản và Mật khẩu!');
  }

  const passHash = hashPassword(password);
  const sessionToken = generateSessionToken();

  // 1. Try Server-Side Zero-Trust Supabase RPC first (Never exposes password_hash to client!)
  const rpcRes = await callSupabaseRpc('aether_rpc_login', {
    p_login_id: cleanLogin,
    p_password_hash: passHash,
    p_session_token: sessionToken,
    p_now: Date.now()
  });

  if (!rpcRes.rpcUnavailable) {
    if (!rpcRes.ok) {
      recordFailedAuthAttempt();
      throw new Error(`${rpcRes.error || 'Sai tài khoản hoặc mật khẩu!'} (Còn ${5 - antiSpamState.failedAttempts} lần thử trước khi khóa chống Bot).`);
    }
    resetFailedAuthAttempts();
    return toPublicProfile({ ...rpcRes.profile, sessionToken });
  }

  // 2. Fallback if user hasn't run the SQL RPC Lock script yet
  const db = await fetchCloudDatabase(customDbUrl);

  const user = Object.values(db.users).find(
    (u) =>
      (u.loginId && u.loginId.toLowerCase() === cleanLogin) ||
      (u.mcUsername && u.mcUsername.toLowerCase() === cleanLogin)
  );

  if (!user) {
    recordFailedAuthAttempt();
    throw new Error(`Không tìm thấy tài khoản "${loginId}" trên Aether Cloud! Nếu chưa có tài khoản, hãy chuyển sang mục "✨ Tạo Tài Khoản".`);
  }

  if (user.passwordHash !== passHash) {
    recordFailedAuthAttempt();
    throw new Error(`Mật khẩu không chính xác! (Còn ${5 - antiSpamState.failedAttempts} lần thử trước khi tạm khóa chống Bot).`);
  }

  resetFailedAuthAttempts();
  user.updatedAt = Date.now();
  user.sessionToken = sessionToken;
  await saveCloudDatabase(db, customDbUrl);
  return toPublicProfile(user);
}

async function changeCloudUsername({ accountId, sessionToken = '', newMcUsername, customDbUrl = '' }) {
  if (!accountId) {
    throw new Error('Bạn cần đăng nhập tài khoản Aether Cloud trước khi đổi tên!');
  }

  const now = Date.now();
  if (now - antiSpamState.lastRenameAt < 30 * 1000) {
    const waitSec = Math.ceil((30 * 1000 - (now - antiSpamState.lastRenameAt)) / 1000);
    throw new Error(`🛡️ Chống Spam: Vui lòng đợi ${waitSec} giây trước khi đổi tên nhân vật tiếp!`);
  }

  const cleanNewName = sanitizeMcUsername(newMcUsername);
  if (cleanNewName.length < 3 || cleanNewName.length > 16) {
    throw new Error('Tên nhân vật mới phải từ 3 đến 16 ký tự (chữ cái, chữ số hoặc dấu gạch dưới _)!');
  }

  // 1. Try Server-Side Zero-Trust Supabase RPC first
  const rpcRes = await callSupabaseRpc('aether_rpc_rename', {
    p_account_id: accountId,
    p_session_token: sessionToken || '',
    p_new_mc_username: cleanNewName,
    p_new_uuid: generateOfflineUUID(cleanNewName),
    p_now: now
  });

  if (!rpcRes.rpcUnavailable) {
    if (!rpcRes.ok) {
      throw new Error(rpcRes.error || 'Không thể đổi tên nhân vật!');
    }
    antiSpamState.lastRenameAt = Date.now();
    return toPublicProfile({ ...rpcRes.profile, sessionToken });
  }

  // 2. Fallback
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
  user.updatedAt = now;
  db.usernames[newKey] = accountId;

  await saveCloudDatabase(db, customDbUrl);
  antiSpamState.lastRenameAt = Date.now();
  return toPublicProfile({ ...user, sessionToken });
}

async function syncCloudCosmetics({ accountId, sessionToken = '', skinModel, capeType, skinPreset, skinDataUrl, customDbUrl = '' }) {
  if (!accountId) return null;
  const cleanSkinUrl = (typeof skinDataUrl === 'string' && skinDataUrl.startsWith('data:image/png;base64,') && skinDataUrl.length < 35000) ? skinDataUrl : '';

  const rpcRes = await callSupabaseRpc('aether_rpc_sync_cosmetics', {
    p_account_id: accountId,
    p_session_token: sessionToken || '',
    p_skin_model: skinModel || 'default',
    p_cape_type: capeType || 'mojang',
    p_skin_preset: typeof skinPreset === 'string' ? skinPreset : '',
    p_skin_data_url: cleanSkinUrl,
    p_now: Date.now()
  });

  if (!rpcRes.rpcUnavailable) {
    if (!rpcRes.ok) return null;
    return toPublicProfile({ ...rpcRes.profile, sessionToken });
  }

  const db = await fetchCloudDatabase(customDbUrl);
  const user = db.users[accountId];
  if (!user) return null;

  if (skinModel) user.skinModel = skinModel;
  if (capeType) user.capeType = capeType;
  if (typeof skinPreset === 'string') user.skinPreset = skinPreset;
  if (cleanSkinUrl) {
    user.skinDataUrl = cleanSkinUrl;
  }
  user.updatedAt = Date.now();

  await saveCloudDatabase(db, customDbUrl);
  return toPublicProfile({ ...user, sessionToken });
}

async function changeCloudPassword({ accountId, sessionToken = '', oldPassword, newPassword, customDbUrl = '' }) {
  if (!accountId) {
    throw new Error('Bạn cần đăng nhập tài khoản Aether Cloud trước!');
  }
  if (!oldPassword) {
    throw new Error('⚠️ Vui lòng nhập Mật khẩu cũ hiện tại để xác minh bảo mật!');
  }
  if (!newPassword || String(newPassword).length < 4) {
    throw new Error('Mật khẩu mới phải có ít nhất 4 ký tự!');
  }

  const oldHash = hashPassword(oldPassword);
  const newHash = hashPassword(newPassword);
  const nextSessionToken = generateSessionToken();

  // 1. Try Server-Side Zero-Trust Supabase RPC first
  const rpcRes = await callSupabaseRpc('aether_rpc_change_password', {
    p_account_id: accountId,
    p_old_password_hash: oldHash,
    p_new_password_hash: newHash,
    p_new_session_token: nextSessionToken,
    p_now: Date.now()
  });

  if (!rpcRes.rpcUnavailable) {
    if (!rpcRes.ok) {
      throw new Error(rpcRes.error || '⚠️ Mật khẩu cũ không chính xác!');
    }
    return toPublicProfile({ ...rpcRes.profile, sessionToken: nextSessionToken });
  }

  // 2. Fallback
  const db = await fetchCloudDatabase(customDbUrl);
  const user = db.users[accountId];
  if (!user) {
    throw new Error('Không tìm thấy hồ sơ tài khoản trên Aether Cloud!');
  }

  if (user.passwordHash && user.passwordHash !== oldHash) {
    throw new Error('⚠️ Mật khẩu cũ không chính xác! Vui lòng nhập đúng mật khẩu hiện tại.');
  }

  user.passwordHash = newHash;
  user.sessionToken = nextSessionToken;
  user.authProvider = 'password';
  user.updatedAt = Date.now();
  await saveCloudDatabase(db, customDbUrl);
  return toPublicProfile(user);
}

function requestPasswordResetOtp({ loginId, parentWindow, customDbUrl = '' }) {
  return new Promise(async (resolve, reject) => {
    try {
      checkAntiBotLock();

      const now = Date.now();
      if (now - antiSpamState.lastOtpAt < 60 * 1000) {
        const waitSec = Math.ceil((60 * 1000 - (now - antiSpamState.lastOtpAt)) / 1000);
        return reject(new Error(`🛡️ Chống Spam Email: Bạn vừa gửi yêu cầu OTP! Vui lòng đợi ${waitSec} giây trước khi gửi lại.`));
      }

      const cleanLogin = String(loginId || '').trim().toLowerCase();
      if (!cleanLogin) {
        return reject(new Error('Vui lòng nhập Email hoặc Tên tài khoản ở ô bên trên trước khi bấm Nhận Mã OTP!'));
      }

      const otpCode = String(Math.floor(100000 + Math.random() * 900000));
      const otpHash = hashPassword(otpCode);
      const otpExpires = now + 10 * 60 * 1000;

      let targetEmail = '';
      let targetMcUsername = '';

      // 1. Try Server-Side Zero-Trust Supabase RPC first
      const rpcRes = await callSupabaseRpc('aether_rpc_prepare_otp', {
        p_login_id: cleanLogin,
        p_otp_hash: otpHash,
        p_otp_expires: otpExpires,
        p_now: now
      });

      if (!rpcRes.rpcUnavailable) {
        if (!rpcRes.ok) {
          return reject(new Error(rpcRes.error || `Không tìm thấy tài khoản "${loginId}" trên Supabase Cloud!`));
        }
        targetEmail = rpcRes.login_id;
        targetMcUsername = rpcRes.mc_username;
      } else {
        // 2. Fallback
        const db = await fetchCloudDatabase(customDbUrl);
        const user = Object.values(db.users).find(
          (u) =>
            (u.loginId && u.loginId.toLowerCase() === cleanLogin) ||
            (u.mcUsername && u.mcUsername.toLowerCase() === cleanLogin)
        );

        if (!user) {
          return reject(new Error(`Không tìm thấy tài khoản "${loginId}" trên Supabase Cloud Database!`));
        }

        if (!user.loginId || !user.loginId.includes('@')) {
          return reject(new Error(`Tài khoản "${user.loginId}" không đăng ký bằng địa chỉ Email nên không thể gửi thư OTP về Gmail!`));
        }

        if (user.resetOtpExpires && (user.resetOtpExpires - now) > 9 * 60 * 1000) {
          const waitDbSec = Math.ceil(((user.resetOtpExpires - now) - 9 * 60 * 1000) / 1000);
          return reject(new Error(`🛡️ Chống Spam: Mã OTP đã được gửi tới Gmail "${user.loginId}"! Vui lòng đợi ${waitDbSec}s để gửi lại.`));
        }

        db.users[user.accountId].resetOtpHash = otpHash;
        db.users[user.accountId].resetOtpExpires = otpExpires;
        await saveCloudDatabase(db, customDbUrl);
        targetEmail = user.loginId;
        targetMcUsername = user.mcUsername;
      }

      antiSpamState.lastOtpAt = Date.now();

      // Listen on localhost:3000 in case the user clicks the Magic Link inside their real Gmail email from Supabase
      if (activeBrowserServer) {
        try { activeBrowserServer.close(); } catch (_) {}
        activeBrowserServer = null;
      }

      const server = http.createServer(async (req, res) => {
        const reqUrl = new URL(req.url, 'http://localhost:3000');
        if (reqUrl.pathname === '/verify-token') {
          const accessToken = reqUrl.searchParams.get('access_token') || '';
          try {
            const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
              headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${accessToken}`
              }
            });
            if (uRes.ok) {
              const uData = await uRes.json();
              const verifiedEmail = String(uData?.email || '').trim().toLowerCase();
              if (verifiedEmail === targetEmail.toLowerCase()) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({ ok: true, otpCode }));
              }
            }
          } catch (_) {}
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ ok: false, error: 'Token từ Email không hợp lệ hoặc đã hết hạn!' }));
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/><title>Xác Thực Email Gmail — Aether Cloud (Supabase)</title><style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#090d16;color:#f8fafc;font-family:'Segoe UI',system-ui,sans-serif}.card{background:#111827;border:2px solid #22c55e;border-radius:18px;padding:34px 40px;text-align:center;max-width:480px;box-shadow:0 24px 60px rgba(0,0,0,0.7)}.badge{display:inline-block;padding:5px 14px;border-radius:999px;background:rgba(34,197,94,0.16);color:#4ade80;font-weight:800;font-size:12px;margin-bottom:10px}h2{color:#4ade80;margin:0 0 8px;font-size:21px}.otp{margin:18px 0;padding:16px 22px;background:rgba(34,197,94,0.14);border:2px dashed #22c55e;border-radius:14px;font-weight:900;font-size:36px;letter-spacing:10px;color:#fff;user-select:all}.btn{background:#16a34a;color:#fff;border:none;padding:11px 24px;border-radius:10px;font-weight:800;font-size:14px;cursor:pointer;margin-top:6px}</style></head><body><div class="card"><div class="badge">⚡ SUPABASE GMAIL VERIFIED</div><h2 id="titleText">⏳ Đang kiểm tra liên kết từ Gmail...</h2><p style="color:#cbd5e1;font-size:14px;">Tài khoản: <strong style="color:#fff;">${targetEmail}</strong> (Nhân vật: <strong style="color:#38bdf8;">${targetMcUsername}</strong>)</p><div class="otp" id="otpVal">••••••</div><button class="btn" id="copyBtn" style="display:none;">📋 Sao chép Mã OTP 6 Số</button><p style="font-size:13px;color:#94a3b8;margin-top:16px;" id="subHint">Vui lòng mở thư từ Supabase trong hộp thư Gmail của bạn.</p></div><script>
          (async () => {
            const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            const token = hash.get('access_token') || new URLSearchParams(window.location.search).get('access_token');
            if (!token) {
              document.getElementById('titleText').textContent = '⚠️ Chưa có xác thực từ hộp thư Gmail!';
              document.getElementById('titleText').style.color = '#f87171';
              document.getElementById('subHint').textContent = 'Bạn cần bấm vào nút xác nhận bên trong bức thư gửi về Gmail (' + '${targetEmail}' + ') để mở trang này!';
              return;
            }
            const r = await fetch('/verify-token?access_token=' + encodeURIComponent(token));
            const d = await r.json();
            if (d.ok && d.otpCode) {
              document.getElementById('titleText').textContent = '✅ ĐÃ XÁC THỰC GMAIL THÀNH CÔNG!';
              document.getElementById('otpVal').textContent = d.otpCode;
              const btn = document.getElementById('copyBtn');
              btn.style.display = 'inline-block';
              btn.onclick = () => { navigator.clipboard.writeText(d.otpCode); btn.textContent = '✓ Đã sao chép Mã OTP (' + d.otpCode + ')!'; };
              document.getElementById('subHint').textContent = 'Quay lại Aether Craft Launcher và dán mã 6 số này vào ô Mã OTP 6 số để đặt mật khẩu mới!';
            } else {
              document.getElementById('titleText').textContent = '⚠️ Liên kết xác thực không hợp lệ!';
              document.getElementById('titleText').style.color = '#f87171';
            }
          })();
        </script></body></html>`);
      });

      activeBrowserServer = server;
      server.on('error', () => {});
      server.listen(3000, '127.0.0.1');
      setTimeout(() => {
        try { server.close(); } catch (_) {}
        if (activeBrowserServer === server) activeBrowserServer = null;
      }, 10 * 60 * 1000);

      // Send REAL email to the user's Gmail inbox via Supabase Auth!
      const otpRes = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
        method: 'POST',
        headers: getSupabaseHeaders(),
        body: JSON.stringify({
          email: targetEmail,
          create_user: true
        })
      });

      if (!otpRes.ok) {
        const errBody = await otpRes.json().catch(() => ({}));
        const errMsg = String(errBody?.msg || errBody?.message || '');
        if (otpRes.status === 429 || errMsg.toLowerCase().includes('rate limit') || errMsg.toLowerCase().includes('60 seconds')) {
          return resolve({
            ok: true,
            loginId: targetEmail,
            mcUsername: targetMcUsername,
            alreadySent: true
          });
        }
        return reject(new Error(`Không thể gửi Email qua Supabase (${otpRes.status}): ${errMsg || 'Vui lòng thử lại sau 60 giây'}`));
      }

      resolve({
        ok: true,
        loginId: targetEmail,
        mcUsername: targetMcUsername
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function resetCloudPassword({ loginId, otpCode, newPassword, customDbUrl = '' }) {
  checkAntiBotLock();

  const cleanLogin = String(loginId || '').trim().toLowerCase();
  const cleanOtp = String(otpCode || '').trim();
  if (!cleanLogin) {
    throw new Error('Vui lòng nhập Tên đăng nhập (hoặc Email) cần đặt lại mật khẩu!');
  }
  if (!/^\d{6}$/.test(cleanOtp)) {
    throw new Error('⚠️ Vui lòng nhập đúng Mã OTP 6 chữ số nhận được từ hộp thư Gmail!');
  }
  if (!newPassword || String(newPassword).length < 4) {
    throw new Error('Mật khẩu mới phải có ít nhất 4 ký tự!');
  }

  const otpHash = hashPassword(cleanOtp);
  const newPassHash = hashPassword(newPassword);
  const nextSessionToken = generateSessionToken();

  // Check if Supabase Auth directly verifies the 6-digit token (in case user typed {{ .Token }} from email)
  let supabaseDirectVerified = false;
  if (cleanLogin.includes('@')) {
    for (const verifyType of ['email', 'magiclink', 'signup', 'recovery']) {
      try {
        const vRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
          method: 'POST',
          headers: getSupabaseHeaders(),
          body: JSON.stringify({
            type: verifyType,
            email: cleanLogin,
            token: cleanOtp
          })
        });
        if (vRes.ok) {
          supabaseDirectVerified = true;
          break;
        }
      } catch (_) {}
    }
  }

  // 1. Try Server-Side Zero-Trust Supabase RPC first
  const rpcRes = await callSupabaseRpc('aether_rpc_reset_password', {
    p_login_id: cleanLogin,
    p_otp_hash: otpHash,
    p_supabase_verified: supabaseDirectVerified,
    p_new_password_hash: newPassHash,
    p_new_session_token: nextSessionToken,
    p_now: Date.now()
  });

  if (!rpcRes.rpcUnavailable) {
    if (!rpcRes.ok) {
      recordFailedAuthAttempt();
      throw new Error(`${rpcRes.error || '⚠️ Mã OTP 6 số không chính xác hoặc đã hết hạn!'} (Còn ${5 - antiSpamState.failedAttempts} lần thử trước khi khóa chống Bot).`);
    }
    resetFailedAuthAttempts();
    return toPublicProfile({ ...rpcRes.profile, sessionToken: nextSessionToken });
  }

  // 2. Fallback
  const db = await fetchCloudDatabase(customDbUrl);
  const user = Object.values(db.users).find(
    (u) =>
      (u.loginId && u.loginId.toLowerCase() === cleanLogin) ||
      (u.mcUsername && u.mcUsername.toLowerCase() === cleanLogin)
  );
  if (!user) {
    recordFailedAuthAttempt();
    throw new Error(`Không tìm thấy tài khoản "${loginId}" trên Supabase Cloud!`);
  }

  let otpVerified = supabaseDirectVerified;

  if (!otpVerified && user.resetOtpHash && user.resetOtpExpires && Date.now() <= user.resetOtpExpires) {
    if (otpHash === user.resetOtpHash) {
      otpVerified = true;
    }
  }

  if (!otpVerified) {
    recordFailedAuthAttempt();
    throw new Error(`⚠️ Mã OTP 6 số không chính xác hoặc đã hết hạn! (Còn ${5 - antiSpamState.failedAttempts} lần thử trước khi khóa chống Bot).`);
  }

  resetFailedAuthAttempts();
  user.passwordHash = newPassHash;
  user.sessionToken = nextSessionToken;
  user.resetOtpHash = null;
  user.resetOtpExpires = null;
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

        const action = reqUrl.searchParams.get('action');
        if (!action) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/><title>Cổng Tài Khoản Aether Cloud 24/7 — Như TLauncher</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#090d16;color:#f8fafc;font-family:'Segoe UI',system-ui,sans-serif}.card{background:#111827;border:2px solid #06b6d4;border-radius:18px;padding:32px 38px;width:100%;max-width:440px;box-shadow:0 24px 60px rgba(0,0,0,0.7)}.badge{display:inline-block;padding:5px 14px;border-radius:999px;background:rgba(6,182,212,0.16);color:#22d3ee;font-weight:800;font-size:12px;margin-bottom:10px}h2{color:#22d3ee;margin:0 0 6px;font-size:21px}p{color:#94a3b8;font-size:13px;margin:0 0 18px}label{display:block;font-size:12px;font-weight:700;color:#cbd5e1;margin:10px 0 4px}input{width:100%;box-sizing:border-box;height:40px;padding:0 12px;border-radius:9px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:14px;outline:none}input:focus{border-color:#06b6d4}.btns{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}.btn{height:42px;border-radius:10px;border:none;font-weight:800;font-size:13.5px;cursor:pointer;color:#fff}.login{background:#16a34a}.reg{background:#0284c7}</style></head><body><div class="card"><div class="badge">🛡️ AETHER CLOUD WEB PORTAL 24/7</div><h2>Đăng Nhập / Đăng Ký Trên Web</h2><p>Hệ thống tài khoản độc lập của Aether Craft Launcher (không cần Microsoft). Tự động đồng bộ vào Launcher ngay sau khi xác nhận!</p><form method="GET" action="/"><label>Email hoặc Tên đăng nhập:</label><input type="text" name="loginId" required placeholder="VD: buiduchuy2010qn@gmail.com" /><label>Mật khẩu (≥4 ký tự):</label><input type="password" name="password" required minlength="4" placeholder="Nhập mật khẩu..." /><label>Tên Nhân Vật Minecraft (Nếu đăng ký mới):</label><input type="text" name="mcUsername" maxlength="16" placeholder="VD: hi0bel (Bỏ trống nếu đã có TK)" /><div class="btns"><button class="btn login" type="submit" name="action" value="login">🔑 Đăng Nhập</button><button class="btn reg" type="submit" name="action" value="register">✨ Tạo Tài Khoản</button></div></form></div></body></html>`);
        }

        if (completed) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end('<h3>Đã đồng bộ vào Launcher.</h3>');
        }

        const loginId = reqUrl.searchParams.get('loginId') || '';
        const password = reqUrl.searchParams.get('password') || '';
        const mcUsername = reqUrl.searchParams.get('mcUsername') || '';

        let profile;
        if (action === 'register') {
          profile = await registerCloudAccount({ loginId, password, mcUsername, customDbUrl });
        } else {
          profile = await loginCloudAccount({ loginId, password, customDbUrl });
        }

        completed = true;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/><title>Aether Cloud ID</title><style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#090d16;color:#f8fafc;font-family:'Segoe UI',sans-serif}.card{background:#111827;border:2px solid #22c55e;border-radius:16px;padding:32px 38px;text-align:center;max-width:480px;box-shadow:0 20px 50px rgba(0,0,0,0.6)}h2{color:#4ade80;margin:0 0 10px}.acc{margin:14px 0;padding:10px 16px;background:rgba(34,197,94,0.14);border-radius:10px;font-weight:800;font-size:16px}</style></head><body><div class="card"><h2>✅ Đã Đồng Bộ Tài Khoản Aether Cloud!</h2><div class="acc">👤 Nhân vật: ${profile.mcUsername} (${profile.loginId})</div><p>Đã kết nối thành công vào Aether Craft Launcher! Bạn có thể đóng tab này.</p></div><script>setTimeout(()=>{try{window.close()}catch(e){}},1500)</script></body></html>`);

        cleanup();
        focusLauncher();
        resolve(profile);
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/><title>Lỗi Aether Cloud</title><style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#090d16;color:#f8fafc;font-family:'Segoe UI',sans-serif}.card{background:#111827;border:2px solid #ef4444;border-radius:16px;padding:32px;text-align:center;max-width:460px}a{display:inline-block;margin-top:14px;padding:9px 20px;background:#0284c7;color:#fff;text-decoration:none;border-radius:8px;font-weight:700}</style></head><body><div class="card"><h2 style="color:#f87171;">⚠️ ${err.message}</h2><a href="/">← Thử lại trên Cổng Web Aether Cloud</a></div></body></html>`);
      }
    });

    activeBrowserServer = server;

    const openPortal = (port) => {
      shell.openExternal(`http://127.0.0.1:${port}/`);
    };

    server.listen(25561, '127.0.0.1', () => openPortal(server.address().port));
    server.on('error', () => {
      server.listen(0, '127.0.0.1', () => openPortal(server.address().port));
    });

    timeoutTimer = setTimeout(() => {
      if (!completed) {
        completed = true;
        cleanup();
        reject(new Error('Đã đóng cổng Web Aether Cloud.'));
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
