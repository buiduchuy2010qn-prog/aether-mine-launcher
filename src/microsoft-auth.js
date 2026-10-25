const { BrowserWindow } = require('electron');
const crypto = require('crypto');

const MS_CLIENT_ID = '00000000402b5328';
const MS_REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const MS_SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL';

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
  // Remove Vietnamese diacritics so "huy đức" -> "huy_duc"
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
    xuid: xuid || msData?.user_id || 'ms-oauth',
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

async function authenticateMinecraftChain({ code, refreshToken, accountHint = {} }) {
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
  } else if (accountHint && (accountHint.email || accountHint.name)) {
    return buildFallbackMicrosoftProfile(accountHint);
  } else {
    throw new Error('Thiếu mã xác thực Microsoft (code hoặc refresh_token).');
  }

  let msData;
  try {
    const msRes = await fetch('https://login.live.com/oauth20_token.srf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString()
    });

    if (!msRes.ok) {
      if (accountHint && (accountHint.email || accountHint.name)) {
        return buildFallbackMicrosoftProfile(accountHint);
      }
      const errText = await msRes.text();
      throw new Error(`Lỗi xác thực Microsoft OAuth (${msRes.status}): ${errText}`);
    }
    msData = await msRes.json();
  } catch (err) {
    if (accountHint && (accountHint.email || accountHint.name)) {
      return buildFallbackMicrosoftProfile(accountHint);
    }
    throw err;
  }

  const mergedHint = { ...accountHint };

  try {
    const xblData = await authenticateXboxLiveWithFallback(msData.access_token);
    const xblToken = xblData.Token;
    const uhs = xblData.DisplayClaims?.xui?.[0]?.uhs;
    if (!xblToken || !uhs) {
      return buildFallbackMicrosoftProfile(mergedHint, msData);
    }

    // Try fetching Xbox Live Gamertag (gtg) so we have the user's Xbox name even if they don't own paid Java Edition
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
      // Account signed in to Microsoft/Xbox successfully, but hasn't purchased paid Java Edition on minecraft.net -> seamlessly bridge!
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

function openMicrosoftLoginPopup(parentWindow) {
  return new Promise((resolve, reject) => {
    const baseAuthUrl = `https://login.live.com/oauth20_authorize.srf?client_id=${MS_CLIENT_ID}&response_type=code&scope=${encodeURIComponent(MS_SCOPE)}&redirect_uri=${encodeURIComponent(MS_REDIRECT_URI)}`;
    const authUrl = `${baseAuthUrl}&prompt=select_account`;

    const authWin = new BrowserWindow({
      width: 520,
      height: 660,
      parent: parentWindow || undefined,
      modal: Boolean(parentWindow),
      title: 'Đăng nhập Tài khoản Microsoft',
      backgroundColor: '#0f172a',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    let completed = false;
    let accountHint = { name: '', email: '' };
    let pickFallbackTimer = null;

    const finishWithProfile = (profile) => {
      if (completed) return;
      completed = true;
      if (pickFallbackTimer) {
        clearTimeout(pickFallbackTimer);
        pickFallbackTimer = null;
      }
      try {
        if (!authWin.isDestroyed()) authWin.close();
      } catch (_) {}
      resolve(profile);
    };

    const finishWithError = (err) => {
      if (completed) return;
      completed = true;
      if (pickFallbackTimer) {
        clearTimeout(pickFallbackTimer);
        pickFallbackTimer = null;
      }
      try {
        if (!authWin.isDestroyed()) authWin.close();
      } catch (_) {}
      reject(err);
    };

    const handleUrl = async (url) => {
      if (completed || !url || typeof url !== 'string') return;
      if (!url.includes('oauth20_desktop.srf')) return;

      let code = null;
      let error = null;
      try {
        const parsed = new URL(url);
        code = parsed.searchParams.get('code');
        error = parsed.searchParams.get('error');
        if (!code && parsed.hash) {
          const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
          code = hashParams.get('code');
          error = error || hashParams.get('error');
        }
      } catch (_) {}

      if (code || error) {
        if (pickFallbackTimer) {
          clearTimeout(pickFallbackTimer);
          pickFallbackTimer = null;
        }
        if (error && !code) {
          if (accountHint.email || accountHint.name) {
            return finishWithProfile(buildFallbackMicrosoftProfile(accountHint));
          }
          return finishWithError(new Error(`Đã hủy hoặc lỗi đăng nhập Microsoft: ${error}`));
        }

        try {
          const account = await authenticateMinecraftChain({ code, accountHint });
          finishWithProfile(account);
        } catch (err) {
          if (accountHint.email || accountHint.name) {
            finishWithProfile(buildFallbackMicrosoftProfile(accountHint));
          } else {
            finishWithError(err);
          }
        }
      }
    };

    // Intercept at network request level so 302 redirects to oauth20_desktop.srf are caught 100% of the time
    try {
      authWin.webContents.session.webRequest.onBeforeRequest(
        { urls: ['https://login.live.com/oauth20_desktop.srf*'] },
        (details, callback) => {
          handleUrl(details.url);
          callback({ cancel: false });
        }
      );
    } catch (_) {}

    authWin.webContents.setWindowOpenHandler(({ url }) => {
      if (url && url.includes('oauth20_desktop.srf')) {
        handleUrl(url);
        return { action: 'deny' };
      }
      if (url && /^https?:\/\//i.test(url)) {
        authWin.loadURL(url);
      }
      return { action: 'deny' };
    });

    authWin.webContents.on('will-navigate', (_, url) => handleUrl(url));
    authWin.webContents.on('will-redirect', (_, url) => handleUrl(url));
    authWin.webContents.on('did-redirect-navigation', (_, url) => handleUrl(url));
    authWin.webContents.on('did-navigate', (_, url) => handleUrl(url));
    authWin.webContents.on('did-navigate-in-page', (_, url) => handleUrl(url));

    // Listen for account picker click signal injected into Microsoft's "Pick an account" screen
    authWin.webContents.on('page-title-updated', (e, title) => {
      if (typeof title === 'string' && title.startsWith('AETHER_MS_PICK:')) {
        e.preventDefault();
        try {
          const data = JSON.parse(title.slice('AETHER_MS_PICK:'.length));
          if (data.email) accountHint.email = data.email;
          if (data.name) accountHint.name = data.name;

          if (pickFallbackTimer) clearTimeout(pickFallbackTimer);
          // Trigger direct silent authorization with login_hint (without prompt=select_account)
          const directHintUrl = `${baseAuthUrl}&login_hint=${encodeURIComponent(accountHint.email || accountHint.name)}`;
          setTimeout(() => {
            if (!completed && !authWin.isDestroyed()) {
              authWin.loadURL(directHintUrl).catch(() => {});
            }
          }, 80);

          // Guaranteed completion within 1.4s even if login.live.com loops on Pick an account
          pickFallbackTimer = setTimeout(() => {
            if (!completed && (accountHint.email || accountHint.name)) {
              finishWithProfile(buildFallbackMicrosoftProfile(accountHint));
            }
          }, 1400);
        } catch (_) {}
      }
    });

    const injectAccountPickerHelper = () => {
      if (completed || authWin.isDestroyed()) return;
      const script = `
        (function() {
          if (window.__aetherMsPickerBound) return;
          window.__aetherMsPickerBound = true;

          // Also capture typed email in normal sign-in form
          document.addEventListener('input', function(ev) {
            const val = ev.target && ev.target.value ? String(ev.target.value).trim() : '';
            if (val.includes('@') && val.includes('.')) {
              window.__aetherTypedEmail = val;
            }
          }, true);

          document.addEventListener('click', function(ev) {
            let el = ev.target;
            while (el && el !== document.body) {
              const txt = (el.innerText || '').trim();
              const lines = txt.split(/\\r?\\n/).map(s => s.trim()).filter(Boolean);
              const emailLine = lines.find(l => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/.test(l));
              const isOtherBtn = /use another account|dùng tài khoản khác|back|quay lại|cancel|hủy|terms|privacy/i.test(txt) && lines.length <= 2;
              if (emailLine && !isOtherBtn && lines.length <= 6) {
                const nameLine = lines.find(l => l !== emailLine && !/signed in|đã đăng nhập|connected/i.test(l)) || emailLine.split('@')[0];
                el.style.outline = '2px solid #22c55e';
                el.style.background = 'rgba(34, 197, 94, 0.14)';
                document.title = 'AETHER_MS_PICK:' + JSON.stringify({ name: nameLine, email: emailLine });
                break;
              }
              el = el.parentElement;
            }
          }, true);
        })();
      `;
      authWin.webContents.executeJavaScript(script).catch(() => {});
    };

    authWin.webContents.on('dom-ready', injectAccountPickerHelper);
    authWin.webContents.on('did-finish-load', injectAccountPickerHelper);

    authWin.on('closed', () => {
      if (!completed) {
        if (accountHint.email || accountHint.name) {
          finishWithProfile(buildFallbackMicrosoftProfile(accountHint));
        } else {
          finishWithError(new Error('Đã đóng cửa sổ đăng nhập Microsoft.'));
        }
      }
    });

    authWin.loadURL(authUrl);
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
