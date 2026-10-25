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

module.exports = {
  openMicrosoftLoginPopup,
  loginWithMicrosoftModal,
  authenticateMinecraftChain,
  authenticateMicrosoftFromRefreshToken,
  generateOfflineUUID,
  createOfflineAuth,
  formatUUID
};
