const BUILTIN_VERSIONS = [
  '1.21.4','1.21.3','1.21.2','1.21.1','1.21','1.20.6','1.20.4','1.20.2','1.20.1','1.20',
  '1.19.4','1.19.3','1.19.2','1.19','1.18.2','1.18.1','1.17.1','1.16.5','1.16.4','1.16.1',
  '1.15.2','1.14.4','1.13.2','1.12.2','1.11.2','1.10.2','1.9.4','1.8.9','1.7.10','1.6.4','1.5.2','1.4.7','1.2.5','1.0'
].map(id => ({ id, type: 'release' })).concat([
  { id: '26.3', type: 'snapshot' },
  { id: '24w46a', type: 'snapshot' },
  { id: 'b1.7.3', type: 'old_beta' },
  { id: 'a1.2.6', type: 'old_alpha' }
]);

const state = {
  authMode: 'crack',
  username: 'StevePlayer',
  crackSkinSync: true,
  msProfile: null,
  selectedCore: 'fabric',
  selectedVersionType: 'release',
  selectedVersion: '1.21.4',
  selectedLoaderVersion: '',
  ramGB: 4,
  javaPath: 'java',
  gameDir: '',
  fastSkipHash: true,
  aikarFlags: true,
  hideLauncherOnPlay: true,
  serverIp: '',
  theme: 'mojang',
  versions: [...BUILTIN_VERSIONS],
  cpuCores: 8,
  isLaunching: false
};

let skinViewer = null;
let skinFetchTimer = null;

function generateClassicSteveSkinDataUrl() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const f = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  f(8,0,8,8,'#4a3121'); f(16,0,8,8,'#9c6e54'); f(0,8,32,8,'#b9856a');
  f(8,8,8,2,'#4a3121'); f(8,10,1,1,'#4a3121'); f(15,10,1,1,'#4a3121');
  f(0,8,8,3,'#4a3121'); f(16,8,8,3,'#4a3121'); f(24,8,8,6,'#4a3121');
  f(9,12,2,1,'#fff'); f(13,12,2,1,'#fff'); f(10,12,1,1,'#4338ca'); f(13,12,1,1,'#4338ca');
  f(11,13,2,1,'#9c6e54'); f(10,14,4,1,'#714935');
  f(20,16,8,4,'#0891b2'); f(28,16,8,4,'#0e7490'); f(16,20,24,12,'#06b6d4'); f(20,20,8,12,'#0891b2'); f(22,20,4,2,'#b9856a');
  f(44,16,4,4,'#0891b2'); f(48,16,4,4,'#b9856a'); f(40,20,16,4,'#06b6d4'); f(40,24,16,8,'#b9856a');
  f(36,48,4,4,'#0891b2'); f(40,48,4,4,'#b9856a'); f(32,52,16,4,'#06b6d4'); f(32,56,16,8,'#b9856a');
  f(4,16,4,4,'#3730a3'); f(8,16,4,4,'#3f3f46'); f(0,20,16,10,'#4338ca'); f(0,30,16,2,'#52525b');
  f(20,48,4,4,'#3730a3'); f(24,48,4,4,'#3f3f46'); f(16,52,16,10,'#4338ca'); f(16,62,16,2,'#52525b');
  return c.toDataURL('image/png');
}

function draw2DFaceFromSkin(skinDataUrl) {
  const canvas = document.getElementById('avatar2dCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 8, 8, 8, 8, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 40, 8, 8, 8, 0, 0, canvas.width, canvas.height);
  };
  img.src = skinDataUrl;
}

function init3DSkinViewer() {
  const canvas = document.getElementById('skinViewerCanvas');
  if (!canvas || !window.skinview3d) return;
  const fallbackSkin = generateClassicSteveSkinDataUrl();
  draw2DFaceFromSkin(fallbackSkin);
  skinViewer = new window.skinview3d.SkinViewer({ canvas, width: 265, height: 320, skin: fallbackSkin });
  skinViewer.fov = 48; skinViewer.zoom = 0.86;
  skinViewer.globalLight.intensity = 2.4; skinViewer.cameraLight.intensity = 1.6;
  skinViewer.animation = new window.skinview3d.WalkingAnimation();
  skinViewer.animation.speed = 0.85;
  const wrap = canvas.parentElement;
  if (wrap && window.ResizeObserver) {
    new ResizeObserver((entries) => {
      for (const e of entries) {
        skinViewer.setSize(Math.max(200, Math.floor(e.contentRect.width)), Math.max(220, Math.floor(e.contentRect.height)));
      }
    }).observe(wrap);
  }
}

function setSkinPose(poseName) {
  if (!skinViewer || !window.skinview3d) return;
  document.querySelectorAll('.pose-btn').forEach((b) => b.classList.toggle('active', b.dataset.pose === poseName));
  if (poseName === 'walk') { skinViewer.animation = new window.skinview3d.WalkingAnimation(); skinViewer.animation.speed = 0.85; }
  else if (poseName === 'run') { skinViewer.animation = new window.skinview3d.RunningAnimation(); skinViewer.animation.speed = 0.9; }
  else if (poseName === 'wave') skinViewer.animation = new window.skinview3d.WaveAnimation();
  else skinViewer.animation = new window.skinview3d.IdleAnimation();
}

async function load3DSkinForUsername(username) {
  const cleanName = (username || 'Steve').trim() || 'Steve';
  if (!skinViewer) return;
  try {
    const res = await window.aetherAPI.fetchSkinBase64(cleanName);
    if (res && res.ok && res.dataUrl) {
      await skinViewer.loadSkin(res.dataUrl);
      draw2DFaceFromSkin(res.dataUrl);
      return;
    }
  } catch (_) {}
  const fallback = generateClassicSteveSkinDataUrl();
  await skinViewer.loadSkin(fallback);
  draw2DFaceFromSkin(fallback);
}

function applyTheme(themeName) {
  const valid = ['mojang', 'lunar', 'modrinth', 'feather', 'prism'];
  state.theme = valid.includes(themeName) ? themeName : 'mojang';
  document.documentElement.setAttribute('data-theme', state.theme);
  document.querySelectorAll('.ts-chip').forEach((c) => c.classList.toggle('active', c.dataset.themePick === state.theme));
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tabId}`));
}

function appendLog(msg, type = 'normal') {
  const box = document.getElementById('consoleOutput');
  if (!box) return;
  const line = document.createElement('div');
  line.className = `log-entry ${type}`;
  line.textContent = `[${new Date().toLocaleTimeString('vi-VN')}] ${msg}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function updateSummaryUI() {
  const activeName = state.authMode === 'microsoft' && state.msProfile?.name ? state.msProfile.name : state.username || 'StevePlayer';
  const coreUpper = state.selectedCore.toUpperCase();

  document.getElementById('sidebarPlayerName').textContent = activeName;
  document.getElementById('sidebarAuthBadge').textContent = state.authMode === 'microsoft' && state.msProfile ? 'BẢN QUYỀN MICROSOFT' : 'CRACK / OFFLINE';

  document.getElementById('sideVerText').textContent = state.selectedVersion;
  document.getElementById('sideCoreText').textContent = coreUpper;
  document.getElementById('sideRamText').textContent = `${state.ramGB} GB`;

  document.getElementById('dockVersionTitle').textContent = `Minecraft ${state.selectedVersion}`;
  document.getElementById('dockCoreSubtitle').textContent = `Core: ${coreUpper} • RAM: ${state.ramGB} GB`;
  document.getElementById('launchBtnSub').textContent = `${state.selectedVersion} • ${coreUpper}`;

  const authLabel = state.authMode === 'microsoft' && state.msProfile ? `${state.msProfile.name} (Microsoft)` : `${activeName} (Crack)`;
  document.getElementById('launchSummaryText').innerHTML = `Tài khoản: <strong>${authLabel}</strong>`;
}

function setAuthModeUI(mode) {
  state.authMode = mode === 'microsoft' ? 'microsoft' : 'crack';
  document.getElementById('tabBtnCrack').classList.toggle('active', state.authMode === 'crack');
  document.getElementById('tabBtnMicrosoft').classList.toggle('active', state.authMode === 'microsoft');
  document.getElementById('panelCrack').classList.toggle('hidden', state.authMode !== 'crack');
  document.getElementById('panelMicrosoft').classList.toggle('hidden', state.authMode !== 'microsoft');

  if (state.authMode === 'microsoft' && state.msProfile) {
    document.getElementById('msNotLoggedBox').classList.add('hidden');
    document.getElementById('msLoggedBox').classList.remove('hidden');
    document.getElementById('msProfileName').textContent = `✓ ${state.msProfile.name}`;
    load3DSkinForUsername(state.msProfile.name);
  } else if (state.authMode === 'microsoft') {
    document.getElementById('msNotLoggedBox').classList.remove('hidden');
    document.getElementById('msLoggedBox').classList.add('hidden');
  } else load3DSkinForUsername(state.username);

  updateSummaryUI();
  saveCurrentConfig();
}

function renderVersionOptions() {
  const select = document.getElementById('versionSelect');
  if (!select) return;
  const filtered = state.versions.filter((v) => {
    if (state.selectedVersionType === 'release') return v.type === 'release';
    if (state.selectedVersionType === 'snapshot') return v.type === 'snapshot';
    return v.type === 'old_beta' || v.type === 'old_alpha';
  });

  select.innerHTML = '';
  filtered.slice(0, 250).forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `Minecraft ${v.id}`;
    if (v.id === state.selectedVersion) opt.selected = true;
    select.appendChild(opt);
  });

  if (!filtered.some((v) => v.id === state.selectedVersion) && filtered[0]) {
    state.selectedVersion = filtered[0].id;
    select.value = state.selectedVersion;
  }

  refreshLoaderBuilds();
  renderFullVersionsTable();
  updateSummaryUI();
}

function renderFullVersionsTable(searchTerm = '') {
  const wrap = document.getElementById('fullVersionsList');
  if (!wrap) return;
  const q = searchTerm.trim().toLowerCase();
  const list = state.versions.filter((v) => !q || v.id.toLowerCase().includes(q)).slice(0, 180);

  wrap.innerHTML = '';
  list.forEach((v) => {
    const item = document.createElement('div');
    item.className = `ver-row-item ${v.id === state.selectedVersion ? 'active' : ''}`;
    item.innerHTML = `<strong>Minecraft ${v.id}</strong><span>${v.type}</span>`;
    item.onclick = () => {
      state.selectedVersion = v.id;
      state.selectedVersionType = v.type === 'release' ? 'release' : v.type === 'snapshot' ? 'snapshot' : 'old';
      document.querySelectorAll('.vtype-btn').forEach((b) => b.classList.toggle('active', b.dataset.vtype === state.selectedVersionType));
      renderVersionOptions();
      saveCurrentConfig();
      switchTab('play');
    };
    wrap.appendChild(item);
  });
}

async function refreshLoaderBuilds() {
  const group = document.getElementById('loaderBuildGroup');
  const select = document.getElementById('loaderVersionSelect');
  if (state.selectedCore === 'vanilla') {
    group.style.opacity = '0.45';
    select.disabled = true;
    select.innerHTML = '<option value="">Nguyên bản (Không dùng Loader)</option>';
    state.selectedLoaderVersion = '';
    return;
  }
  group.style.opacity = '1';
  select.disabled = false;
  select.innerHTML = '<option value="">Tự động chọn bản mới nhất</option>';

  const res = await window.aetherAPI.getLoaders(state.selectedVersion, state.selectedCore);
  if (res.ok && Array.isArray(res.data)) {
    res.data.forEach((b) => {
      const opt = document.createElement('option');
      opt.value = b.version;
      opt.textContent = `${state.selectedCore.toUpperCase()} — ${b.version}`;
      select.appendChild(opt);
    });
  }
}

function saveCurrentConfig() {
  window.aetherAPI.saveConfig({
    authMode: state.authMode,
    username: state.username,
    crackSkinSync: state.crackSkinSync,
    msProfile: state.msProfile,
    selectedCore: state.selectedCore,
    selectedVersion: state.selectedVersion,
    ramGB: state.ramGB,
    javaPath: state.javaPath,
    gameDir: state.gameDir,
    fastSkipHash: state.fastSkipHash,
    aikarFlags: state.aikarFlags,
    hideLauncherOnPlay: state.hideLauncherOnPlay,
    serverIp: state.serverIp,
    theme: state.theme
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  init3DSkinViewer();
  document.getElementById('btnMin').onclick = () => window.aetherAPI.minimize();
  document.getElementById('btnMax').onclick = () => window.aetherAPI.maximize();
  document.getElementById('btnClose').onclick = () => window.aetherAPI.close();

  const saved = await window.aetherAPI.getConfig();
  if (saved) Object.assign(state, saved);

  applyTheme(state.theme);
  document.querySelectorAll('.core-tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.core === state.selectedCore));
  renderVersionOptions();

  document.querySelectorAll('.ts-chip').forEach((chip) => {
    chip.onclick = () => { applyTheme(chip.dataset.themePick); saveCurrentConfig(); };
  });

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  const sys = await window.aetherAPI.getSystemInfo();
  state.cpuCores = sys.cpuCores || 8;
  document.getElementById('cpuBadge').textContent = `${sys.cpuCores} Nhân CPU`;
  document.getElementById('ramBadge').textContent = `RAM trống: ${sys.freeMemGB}/${sys.totalMemGB} GB`;

  document.getElementById('btnTrimRam').onclick = async () => {
    const txt = document.getElementById('ramBoostText');
    txt.textContent = 'Đang dọn...';
    const res = await window.aetherAPI.trimRamNow();
    if (res && res.ok) {
      document.getElementById('ramBadge').textContent = `RAM trống: ${res.freeMemGB}/${sys.totalMemGB} GB`;
      txt.textContent = 'Đã dọn!';
      setTimeout(() => (txt.textContent = 'Dọn RAM'), 1400);
    }
  };

  const ramSlider = document.getElementById('ramSlider');
  ramSlider.max = Math.max(4, sys.totalMemGB);
  ramSlider.value = state.ramGB;
  document.getElementById('ramValueDisplay').textContent = `${state.ramGB} GB`;

  if (!state.javaPath || state.javaPath === 'java') state.javaPath = sys.detectedJava || 'java';
  if (!state.gameDir) state.gameDir = sys.defaultGameDir;

  document.getElementById('javaPathInput').value = state.javaPath;
  document.getElementById('gameDirInput').value = state.gameDir;
  document.getElementById('usernameInput').value = state.username;
  document.getElementById('serverIpInput').value = state.serverIp || '';
  document.getElementById('crackSkinSyncToggle').checked = state.crackSkinSync !== false;
  document.getElementById('fastSkipCheck').checked = state.fastSkipHash !== false;
  document.getElementById('aikarFlagsCheck').checked = state.aikarFlags !== false;
  document.getElementById('hideLauncherCheck').checked = state.hideLauncherOnPlay !== false;

  setAuthModeUI(state.authMode);

  // Direct Core Selector Buttons
  document.querySelectorAll('.core-tab-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.core-tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedCore = btn.dataset.core;
      refreshLoaderBuilds();
      updateSummaryUI();
      saveCurrentConfig();
    };
  });

  // Version Type Filter Buttons
  document.querySelectorAll('.vtype-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.vtype-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedVersionType = btn.dataset.vtype;
      renderVersionOptions();
    };
  });

  document.getElementById('versionSelect').onchange = (e) => {
    state.selectedVersion = e.target.value;
    refreshLoaderBuilds();
    renderFullVersionsTable(document.getElementById('versionSearchInput')?.value || '');
    updateSummaryUI();
    saveCurrentConfig();
  };

  document.getElementById('loaderVersionSelect').onchange = (e) => {
    state.selectedLoaderVersion = e.target.value;
  };

  document.getElementById('versionSearchInput').oninput = (e) => {
    renderFullVersionsTable(e.target.value);
  };

  ramSlider.oninput = (e) => {
    state.ramGB = Number(e.target.value);
    document.getElementById('ramValueDisplay').textContent = `${state.ramGB} GB`;
    updateSummaryUI();
    saveCurrentConfig();
  };

  document.querySelectorAll('.pose-btn').forEach((btn) => {
    btn.onclick = () => setSkinPose(btn.dataset.pose);
  });

  document.querySelectorAll('.wp-chip').forEach((chip) => {
    chip.onclick = () => {
      document.querySelectorAll('.wp-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      document.getElementById('heroBanner').style.backgroundImage = `url('${chip.dataset.wp}')`;
    };
  });

  document.getElementById('tabBtnCrack').onclick = () => setAuthModeUI('crack');
  document.getElementById('tabBtnMicrosoft').onclick = () => setAuthModeUI('microsoft');

  document.getElementById('usernameInput').oninput = (e) => {
    state.username = e.target.value.trim() || 'StevePlayer';
    updateSummaryUI();
    saveCurrentConfig();
    clearTimeout(skinFetchTimer);
    skinFetchTimer = setTimeout(() => load3DSkinForUsername(state.username), 450);
  };

  document.getElementById('btnReloadSkin').onclick = () => load3DSkinForUsername(state.username);

  document.getElementById('btnMsLogin').onclick = async () => {
    const btn = document.getElementById('btnMsLogin');
    btn.disabled = true; btn.querySelector('span').textContent = 'Đang mở Microsoft OAuth2...';
    const res = await window.aetherAPI.loginMicrosoft();
    btn.disabled = false; btn.querySelector('span').textContent = 'Đăng Nhập Microsoft OAuth2';
    if (res.ok && res.profile) { state.msProfile = res.profile; setAuthModeUI('microsoft'); }
  };

  document.getElementById('btnMsLogout').onclick = () => {
    state.msProfile = null; setAuthModeUI('microsoft'); saveCurrentConfig();
  };

  document.getElementById('serverIpInput').oninput = (e) => { state.serverIp = e.target.value.trim(); saveCurrentConfig(); };
  document.getElementById('javaPathInput').oninput = (e) => { state.javaPath = e.target.value.trim() || 'java'; saveCurrentConfig(); };
  document.getElementById('gameDirInput').oninput = (e) => { state.gameDir = e.target.value.trim(); saveCurrentConfig(); };
  document.getElementById('fastSkipCheck').onchange = (e) => { state.fastSkipHash = e.target.checked; saveCurrentConfig(); };
  document.getElementById('aikarFlagsCheck').onchange = (e) => { state.aikarFlags = e.target.checked; saveCurrentConfig(); };
  document.getElementById('hideLauncherCheck').onchange = (e) => { state.hideLauncherOnPlay = e.target.checked; saveCurrentConfig(); };
  document.getElementById('crackSkinSyncToggle').onchange = (e) => { state.crackSkinSync = e.target.checked; saveCurrentConfig(); };
  document.getElementById('btnOpenDir').onclick = () => window.aetherAPI.openGameDir(state.gameDir);
  document.getElementById('btnClearConsole').onclick = () => { document.getElementById('consoleOutput').innerHTML = ''; };

  document.getElementById('btnForceKill').onclick = async () => {
    await window.aetherAPI.forceKillGame();
    document.getElementById('btnForceKill').classList.add('hidden');
    document.getElementById('statusText').textContent = 'Đã tắt nhanh Minecraft & giải phóng RAM!';
  };

  document.getElementById('btnLaunch').onclick = async () => {
    if (state.isLaunching) return;
    if (state.authMode === 'microsoft' && !state.msProfile) {
      document.getElementById('statusText').textContent = 'Vui lòng đăng nhập Microsoft trước!';
      return;
    }
    state.isLaunching = true;
    const btn = document.getElementById('btnLaunch');
    btn.disabled = true;
    document.getElementById('btnForceKill').classList.remove('hidden');
    document.getElementById('launchBtnText').textContent = 'ĐANG KHỞI ĐỘNG...';

    const res = await window.aetherAPI.launchGame({
      authMode: state.authMode,
      username: state.username,
      crackSkinSync: state.crackSkinSync,
      msProfile: state.msProfile,
      mcVersion: state.selectedVersion,
      loaderType: state.selectedCore,
      loaderVersion: state.selectedLoaderVersion,
      ramGB: state.ramGB,
      javaPath: state.javaPath,
      gameDir: state.gameDir,
      useAikarFlags: state.aikarFlags,
      fastSkipHash: state.fastSkipHash,
      hideLauncherOnPlay: state.hideLauncherOnPlay,
      serverIp: state.serverIp,
      cpuCores: state.cpuCores
    });

    if (!res.ok) {
      state.isLaunching = false;
      btn.disabled = false;
      document.getElementById('btnForceKill').classList.add('hidden');
      document.getElementById('launchBtnText').textContent = 'CHƠI NGAY';
      document.getElementById('statusText').textContent = `Lỗi: ${res.error}`;
      appendLog(`Lỗi khởi động: ${res.error}`, 'error');
    }
  };

  const verRes = await window.aetherAPI.getVersions();
  if (verRes.ok && verRes.data?.versions?.length) {
    state.versions = verRes.data.versions;
    renderVersionOptions();
  }

  window.aetherAPI.onProgress((p) => {
    document.getElementById('progressPercent').textContent = `${p.percent}%`;
    document.getElementById('progressBar').style.width = `${p.percent}%`;
    document.getElementById('statusText').textContent = `Đang tải (${p.type}): ${p.task}/${p.total}`;
  });
  window.aetherAPI.onStatus((st) => { document.getElementById('statusText').textContent = st; appendLog(st, 'info'); });
  window.aetherAPI.onLog((line) => appendLog(line));
  window.aetherAPI.onGameReady(() => {
    if (skinViewer) skinViewer.renderPaused = true;
    document.getElementById('btnForceKill').classList.remove('hidden');
    document.getElementById('statusText').textContent = 'Đang chơi (Launcher ngủ đông 0% GPU)';
  });
  window.aetherAPI.onClose((code) => {
    state.isLaunching = false;
    if (skinViewer) skinViewer.renderPaused = false;
    document.getElementById('btnForceKill').classList.add('hidden');
    const btn = document.getElementById('btnLaunch');
    btn.disabled = false;
    document.getElementById('launchBtnText').textContent = 'CHƠI NGAY';
    updateSummaryUI();
    document.getElementById('statusText').textContent = `Đã thoát Minecraft mượt mà (Mã: ${code})`;
  });
});