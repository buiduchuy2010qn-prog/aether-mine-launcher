const { BrowserWindow } = require('electron');

const MS_CLIENT_ID = '00000000402b5328';
const MS_REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const MS_SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL';

function formatUUID(rawId) {
  if (!rawId) return '';
  const clean = rawId.replace(/-/g, '');
  if (clean.length !== 32) return rawId;
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`;
}

/**
 * Exchange OAuth code or refresh_token for Microsoft + Xbox Live + XSTS + Minecraft token & profile
 */
async function authenticateMinecraftChain({ code, refreshToken }) {
  // Step 1: Microsoft OAuth2 Token
  const tokenParams = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    redirect_uri: MS_REDIRECT_URI,
    scope: MS_SCOPE
  });

  if (code) {
    tokenParams.set('grant_type', 'authorization_code');
    tokenParams.set('code', code);
  } else if (refreshToken) {
    tokenParams.set('grant_type', 'refresh_token');
    tokenParams.set('refresh_token', refreshToken);
  } else {
    throw new Error('Thiếu mã xác thực Microsoft (code hoặc refresh_token).');
  }

  const msRes = await fetch('https://login.live.com/oauth20_token.srf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString()
  });

  if (!msRes.ok) {
    const errText = await msRes.text();
    throw new Error(`Lỗi xác thực Microsoft OAuth (${msRes.status}): ${errText}`);
  }
  const msData = await msRes.json();

  // Step 2: Xbox Live (XBL) Authentication
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
        RpsTicket: `d=${msData.access_token}`
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    })
  });

  if (!xblRes.ok) {
    throw new Error(`Lỗi xác thực Xbox Live (${xblRes.status}).`);
  }
  const xblData = await xblRes.json();
  const xblToken = xblData.Token;
  const uhs = xblData.DisplayClaims?.xui?.[0]?.uhs;
  if (!xblToken || !uhs) {
    throw new Error('Không lấy được User Hash (uhs) từ Xbox Live.');
  }

  // Step 3: XSTS Authorization for Minecraft Services
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
      throw new Error('Tài khoản Microsoft này chưa tạo hồ sơ Xbox Live.');
    }
    if (xstsErr.XErr === 2148916238) {
      throw new Error('Tài khoản dưới 18 tuổi cần được thêm vào nhóm Gia đình (Microsoft Family).');
    }
    throw new Error(`Lỗi xác thực XSTS (${xstsRes.status}).`);
  }
  const xstsData = await xstsRes.json();
  const xstsToken = xstsData.Token;
  const xuid = xstsData.DisplayClaims?.xui?.[0]?.xid || uhs;

  // Step 4: Minecraft Services Login with Xbox
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
    throw new Error(`Không thể đăng nhập Minecraft Services (${mcLoginRes.status}).`);
  }
  const mcLoginData = await mcLoginRes.json();
  const mcAccessToken = mcLoginData.access_token;

  // Step 5: Fetch Official Minecraft Profile (Name, UUID, Skins)
  const profileRes = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: {
      'Authorization': `Bearer ${mcAccessToken}`
    }
  });

  if (profileRes.status === 404) {
    throw new Error('Tài khoản Microsoft này chưa mua bản quyền Minecraft Java Edition (hoặc chưa kích hoạt Xbox Game Pass). Bạn vẫn có thể chuyển sang tab Offline (Crack) để chơi miễn phí!');
  }
  if (!profileRes.ok) {
    throw new Error(`Lỗi khi tải hồ sơ Minecraft bản quyền (${profileRes.status}).`);
  }

  const profileData = await profileRes.json();
  const formattedUuid = formatUUID(profileData.id);

  return {
    name: profileData.name,
    uuid: formattedUuid,
    accessToken: mcAccessToken,
    refreshToken: msData.refresh_token,
    xuid: xuid,
    expiresAt: Date.now() + ((mcLoginData.expires_in || 86400) * 1000) - 60000,
    skinUrl: profileData.skins?.[0]?.url || null
  };
}

/**
 * Open interactive Microsoft OAuth2 login window inside Electron
 */
function openMicrosoftLoginPopup(parentWindow) {
  return new Promise((resolve, reject) => {
    const authUrl = `https://login.live.com/oauth20_authorize.srf?client_id=${MS_CLIENT_ID}&response_type=code&scope=${encodeURIComponent(MS_SCOPE)}&redirect_uri=${encodeURIComponent(MS_REDIRECT_URI)}&prompt=select_account`;

    const authWin = new BrowserWindow({
      width: 520,
      height: 660,
      parent: parentWindow || undefined,
      modal: Boolean(parentWindow),
      title: 'Đăng nhập Tài khoản Microsoft Bản Quyền',
      backgroundColor: '#111622',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    let completed = false;

    const handleUrl = async (url) => {
      if (completed) return;
      if (!url.startsWith(MS_REDIRECT_URI)) return;

      const parsed = new URL(url);
      const code = parsed.searchParams.get('code');
      const error = parsed.searchParams.get('error');

      if (code || error) {
        completed = true;
        try {
          authWin.close();
        } catch (_) {}

        if (error) {
          return reject(new Error(`Đã hủy hoặc lỗi đăng nhập Microsoft: ${error}`));
        }

        try {
          const account = await authenticateMinecraftChain({ code });
          resolve(account);
        } catch (err) {
          reject(err);
        }
      }
    };

    authWin.webContents.on('will-navigate', (_, url) => handleUrl(url));
    authWin.webContents.on('will-redirect', (_, url) => handleUrl(url));
    authWin.webContents.on('did-navigate', (_, url) => handleUrl(url));

    authWin.on('closed', () => {
      if (!completed) {
        reject(new Error('Cửa sổ đăng nhập Microsoft đã đóng trước khi hoàn tất.'));
      }
    });

    authWin.loadURL(authUrl);
  });
}

module.exports = {
  openMicrosoftLoginPopup,
  authenticateMinecraftChain,
  formatUUID
};
