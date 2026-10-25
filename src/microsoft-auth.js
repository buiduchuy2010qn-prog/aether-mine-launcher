const { shell } = require('electron');
const http = require('http');
const crypto = require('crypto');

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

function sanitizeMcUsername(rawName, emailFallback) {
  const emailPrefix = emailFallback ? String(emailFallback).split('@')[0] : '';
  let candidate = String(rawName || '').trim();
  if (!candidate || candidate.includes('@')) {
    candidate = emailPrefix || 'MSPlayer';
  }
  candidate = candidate
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');

  if (candidate.length < 3 && emailPrefix) {
    candidate = emailPrefix.replace(/[^a-zA-Z0-9_]/g, '');
  }
  if (candidate.length < 3) {
    candidate = 'MSPlayer';
  }
  return candidate.slice(0, 16);
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

function buildFallbackMicrosoftProfile(accountHint = {}, msData = null, xuid = null) {
  const rawName = accountHint.gamertag || accountHint.name || '';
  const email = accountHint.email || '';
  const mcName = sanitizeMcUsername(rawName, email);
  const uuid = generateOfflineUUID(mcName);
  const displayName = email ? `${mcName} (${email})` : (rawName ? `${mcName} (${rawName})` : mcName);

  return {
    name: mcName,
    displayName,
    email,
    uuid,
    accessToken: uuid,
    refreshToken: msData?.refresh_token || '',
    xuid: xuid || accountHint.sub || 'ms-browser-oauth',
    isOfficialLicense: false,
    expiresAt: Date.now() + 86400 * 1000,
    skinUrl: null
  };
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
  throw new Error(`Lỗi xác thực Xbox Live (${lastStatus}).`);
}

async function authenticateMinecraftChain({ code, refreshToken, redirectUri, accountHint = {} }) {
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

  // Extract verified Microsoft Account Name & Email from OIDC id_token
  const idClaims = decodeJwtPayload(msData.id_token);
  const mergedHint = {
    name: idClaims.name || accountHint.name || '',
    email: idClaims.email || idClaims.preferred_username || accountHint.email || '',
    sub: idClaims.sub || idClaims.oid || ''
  };

  try {
    const xblData = await authenticateXboxLiveWithFallback(msData.access_token);
    const xblToken = xblData.Token;
    const uhs = xblData.DisplayClaims?.xui?.[0]?.uhs;
    if (!xblToken || !uhs) {
      return buildFallbackMicrosoftProfile(mergedHint, msData);
    }

    // Fetch Xbox Live Gamertag (gtg) if available
    try {
      const xblProfileRes = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
          RelyingParty: 'http://xboxlive.com',
          TokenType: 'JWT'
        })
      });
      if (xblProfileRes.ok) {
        const xblProfileData = await xblProfileRes.json();
        const gtg = xblProfileData.DisplayClaims?.xui?.[0]?.gtg;
        if (gtg) mergedHint.gamertag = gtg;
      }
    } catch (_) {}

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
      return buildFallbackMicrosoftProfile(mergedHint, msData);
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
      return buildFallbackMicrosoftProfile(mergedHint, msData, xuid);
    }

    const mcLoginData = await mcLoginRes.json();
    const mcAccessToken = mcLoginData.access_token;

    const profileRes = await fetch('https://api.minecraftservices.com/minecraft/profile', {
      headers: {
        'Authorization': `Bearer ${mcAccessToken}`
      }
    });

    if (!profileRes.ok) {
      return buildFallbackMicrosoftProfile(mergedHint, msData, xuid);
    }

    const profileData = await profileRes.json();
    const formattedUuid = formatUUID(profileData.id);

    return {
      name: profileData.name,
      displayName: mergedHint.email ? `${profileData.name} (${mergedHint.email})` : profileData.name,
      email: mergedHint.email || '',
      uuid: formattedUuid,
      accessToken: mcAccessToken,
      refreshToken: msData.refresh_token,
      xuid: xuid,
      isOfficialLicense: true,
      expiresAt: Date.now() + ((mcLoginData.expires_in || 86400) * 1000) - 60000,
      skinUrl: profileData.skins?.[0]?.url || null
    };
  } catch (_) {
    return buildFallbackMicrosoftProfile(mergedHint, msData);
  }
}

function buildSuccessHtml(profile) {
  const label = profile ? (profile.displayName || profile.name) : 'Tài khoản Microsoft';
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>Đã đồng bộ Aether Craft Launcher</title>
  <style>
    body {
      margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center;
      background: #090d16; color: #f8fafc; font-family: 'Segoe UI', system-ui, sans-serif;
    }
    .card {
      background: #111827; border: 2px solid #22c55e; border-radius: 16px;
      padding: 32px 38px; text-align: center; max-width: 460px;
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
    <h2>Đăng Nhập & Đồng Bộ Thành Công!</h2>
    <div class="acc">👤 ${label}</div>
    <p style="margin-top:14px;">Tài khoản của bạn đã được kết nối trực tiếp vào <strong>Aether Craft Launcher</strong>.</p>
    <p style="font-size:12.5px;opacity:0.75;">Bạn có thể đóng tab trình duyệt này và quay lại Launcher.</p>
  </div>
  <script>setTimeout(() => { try { window.close(); } catch(e) {} }, 1800);</script>
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
          return res.end(buildSuccessHtml(null));
        }
        completed = true;

        const port = server.address()?.port || 25560;
        const redirectUri = `http://localhost:${port}`;

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<html><body style="background:#090d16;color:#f87171;font-family:sans-serif;text-align:center;padding-top:80px;"><h2>Đã hủy hoặc lỗi đăng nhập: ${error}</h2><p>${errorDesc || ''}</p></body></html>`);
          cleanup();
          return reject(new Error(`Đã hủy đăng nhập trên trình duyệt (${error}).`));
        }

        const profile = await authenticateMinecraftChain({ code, redirectUri });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buildSuccessHtml(profile));

        cleanup();
        if (parentWindow && !parentWindow.isDestroyed()) {
          if (parentWindow.isMinimized()) parentWindow.restore();
          parentWindow.show();
          parentWindow.focus();
        }
        resolve(profile);
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="background:#090d16;color:#f87171;font-family:sans-serif;text-align:center;padding-top:80px;"><h2>Lỗi xác thực Microsoft</h2><p>${err.message}</p></body></html>`);
        cleanup();
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
      // If port 25560 is in use, bind to any free ephemeral port
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

module.exports = {
  openMicrosoftLoginPopup,
  loginWithMicrosoftModal,
  authenticateMinecraftChain,
  authenticateMicrosoftFromRefreshToken,
  generateOfflineUUID,
  createOfflineAuth,
  formatUUID
};
