const BUILTIN_VERSIONS = [
  '1.21.4','1.21.3','1.21.1','1.21','1.20.6','1.20.4','1.20.2','1.20.1',
  '1.19.4','1.19.2','1.18.2','1.17.1','1.16.5','1.15.2','1.14.4','1.13.2',
  '1.12.2','1.11.2','1.10.2','1.9.4','1.8.9','1.7.10','1.6.4','1.5.2'
].map(id => ({ id, type: 'release' })).concat([
  { id: '26.3', type: 'snapshot' },
  { id: '24w46a', type: 'snapshot' },
  { id: 'b1.7.3', type: 'old_beta' },
  { id: 'a1.2.6', type: 'old_alpha' }
]);

const DEFAULT_INSTALLATIONS = [
  { id: 'inst-1214-fabric', name: 'Bản Mới Nhất 1.21.4 (FPS Cao)', version: '1.21.4', core: 'fabric', loaderVersion: '', ramGB: 4, icon: 'grass' },
  { id: 'inst-1204-shaders', name: 'Sinh Tồn & Shaders 1.20.4', version: '1.20.4', core: 'fabric', loaderVersion: '', ramGB: 4, icon: 'crafting' },
  { id: 'inst-1201-forge', name: 'Kho Modpack Lớn 1.20.1', version: '1.20.1', core: 'forge', loaderVersion: '', ramGB: 6, icon: 'furnace' },
  { id: 'inst-1165-nether', name: 'Speedrun Nether 1.16.5', version: '1.16.5', core: 'fabric', loaderVersion: '', ramGB: 4, icon: 'diamond' },
  { id: 'inst-189-pvp', name: 'BedWars / PvP 1.8.9', version: '1.8.9', core: 'legacyfabric', loaderVersion: '', ramGB: 3, icon: 'tnt' }
];

const state = {
  authMode: 'crack',
  username: 'StevePlayer',
  crackSkinSync: true,
  msProfile: null,
  installations: [...DEFAULT_INSTALLATIONS],
  activeInstallId: 'inst-1214-fabric',
  selectedCore: 'fabric',
  selectedVersionType: 'release',
  selectedVersion: '1.21.4',
  selectedLoaderVersion: '',
  selectedIcon: 'grass',
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

function getBlockSvg(type) {
  if (type === 'crafting') return `<svg viewBox="0 0 32 32" width="24" height="24"><polygon points="16,2 30,9 16,16 2,9" fill="#d97706"/><polygon points="2,9 16,16 16,30 2,23" fill="#92400e"/><polygon points="30,9 16,16 16,30 30,23" fill="#78350f"/></svg>`;
  if (type === 'furnace') return `<svg viewBox="0 0 32 32" width="24" height="24"><polygon points="16,2 30,9 16,16 2,9" fill="#94a3b8"/><polygon points="2,9 16,16 16,30 2,23" fill="#64748b"/><polygon points="30,9 16,16 16,30 30,23" fill="#475569"/><polygon points="19,19 26,15.5 26,23 19,26.5" fill="#f97316"/></svg>`;
  if (type === 'diamond') return `<svg viewBox="0 0 32 32" width="24" height="24"><polygon points="16,2 30,9 16,16 2,9" fill="#67e8f9"/><polygon points="2,9 16,16 16,30 2,23" fill="#06b6d4"/><polygon points="30,9 16,16 16,30 30,23" fill="#0891b2"/></svg>`;
  if (type === 'tnt') return `<svg viewBox="0 0 32 32" width="24" height="24"><polygon points="16,2 30,9 16,16 2,9" fill="#ef4444"/><polygon points="2,9 16,16 16,30 2,23" fill="#dc2626"/><polygon points="30,9 16,16 16,30 30,23" fill="#991b1b"/><polygon points="2,14 16,21 30,14 30,19 16,26 2,19" fill="#f8fafc"/></svg>`;
  return `<svg viewBox="0 0 32 32" width="24" height="24"><polygon points="16,2 30,9 16,16 2,9" fill="#4ade80"/><polygon points="2,9 16,16 16,30 2,23" fill="#92400e"/><polygon points="30,9 16,16 16,30 30,23" fill="#78350f"/><polygon points="2,9 16,16 16,19 2,12" fill="#22c55e"/><polygon points="30,9 16,16 16,19 30,12" fill="#16a34a"/></svg>`;
}

function getActiveInstallation() {
  return state.installations.find((i) => i.id === state.activeInstallId) || state.installations[0] || DEFAULT_INSTALLATIONS[0];
}

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
  skinViewer = new window.skinview3d.SkinViewer({ canvas, width: 265, height: 245, skin: fallbackSkin });
  skinViewer.fov = 48; skinViewer.zoom = 0.86;
  skinViewer.globalLight.intensity = 2.4; skinViewer.cameraLight.intensity = 1.6;
  skinViewer.animation = new window.skinview3d.WalkingAnimation();
  skinViewer.animation.speed = 0.85;
  const wrap = canvas.parentElement;
  if (wrap && window.ResizeObserver) {
    new ResizeObserver((entries) => {
      for (const e of entries) {
        skinViewer.setSize(Math.max(200, Math.floor(e.contentRect.width)), Math.max(185, Math.floor(e.contentRect.height)));
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
  document.querySelectorAll('.mc-subtab').forEach((b) => b.classList.toggle('active', b.dataset.tabJump === tabId));
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

async function updateCrackUuidPreview() {
  const uuidEl = document.getElementById('crackUuidText');
  if (!uuidEl) return;
  const uuid = await window.aetherAPI.getCrackUuid(state.username);
  uuidEl.textContent = uuid.slice(0, 18) + '...';
}

function renderAllInstallationsUI() {
  const activeInst = getActiveInstallation();
  document.getElementById('dockActiveIcon').innerHTML = getBlockSvg(activeInst.icon);
  document.getElementById('dockActiveTitle').textContent = activeInst.name;
  document.getElementById('dockActiveSub').textContent = `${activeInst.version} • ${activeInst.core.toUpperCase()} • ${activeInst.ramGB} GB RAM`;
  document.getElementById('launchBtnSub').textContent = `${activeInst.version} (${activeInst.core.toUpperCase()})`;

  const popup = document.getElementById('dockInstallPopup');
  popup.innerHTML = '';
  state.installations.forEach((inst) => {
    const btn = document.createElement('button');
    btn.className = `dip-item ${inst.id === activeInst.id ? 'active' : ''}`;
    btn.innerHTML = `<div class="dit-icon">${getBlockSvg(inst.icon)}</div><div><strong>${inst.name}</strong><span>${inst.version} • ${inst.core.toUpperCase()} • ${inst.ramGB} GB RAM</span></div>`;
    btn.onclick = () => { selectInstallation(inst.id); popup.classList.add('hidden'); };
    popup.appendChild(btn);
  });

  const homeGrid = document.getElementById('homeInstallationsGrid');
  homeGrid.innerHTML = '';
  state.installations.slice(0, 5).forEach((inst) => {
    const card = document.createElement('div');
    card.className = `inst-card ${inst.id === activeInst.id ? 'active' : ''}`;
    card.innerHTML = `<div class="inst-card-top"><div class="inst-block-icon">${getBlockSvg(inst.icon)}</div><div class="inst-title-group"><h4>${inst.name}</h4><span>${inst.version} • ${inst.core.toUpperCase()}</span></div></div><div class="inst-card-bottom"><span>RAM: ${inst.ramGB} GB</span><button class="inst-play-mini" data-direct-play="${inst.id}">▶ Chơi</button></div>`;
    card.onclick = (e) => {
      if (e.target.dataset.directPlay) { selectInstallation(inst.id); triggerLaunchGame(); return; }
      selectInstallation(inst.id);
    };
    homeGrid.appendChild(card);
  });

  const sideList = document.getElementById('sidebarInstallationsList');
  sideList.innerHTML = '';
  state.installations.forEach((inst) => {
    const b = document.createElement('button');
    b.className = `quick-ver-btn ${inst.id === activeInst.id ? 'active' : ''}`;
    b.innerHTML = `<div class="qv-icon-box">${getBlockSvg(inst.icon)}</div><div class="qv-meta"><strong>${inst.name}</strong><span>${inst.version} • ${inst.core.toUpperCase()}</span></div>`;
    b.onclick = () => selectInstallation(inst.id);
    sideList.appendChild(b);
  });

  const managerList = document.getElementById('installationsListContainer');
  managerList.innerHTML = '';
  document.getElementById('installCountTag').textContent = `${state.installations.length} Bản cài đặt`;

  state.installations.forEach((inst) => {
    const row = document.createElement('div');
    row.className = `official-inst-row ${inst.id === activeInst.id ? 'active' : ''}`;
    row.innerHTML = `<div class="oir-left"><div class="inst-block-icon">${getBlockSvg(inst.icon)}</div><div class="oir-meta"><h4>${inst.name}</h4><span>Phiên bản: ${inst.version} • Core: ${inst.core.toUpperCase()} • RAM: ${inst.ramGB} GB</span></div></div><div class="oir-actions"><button class="btn-oir-play" data-play-id="${inst.id}">▶ Chơi Ngay</button><button class="btn-oir-sec" data-pick-id="${inst.id}">${inst.id === activeInst.id ? '✓ Đang chọn' : 'Chọn'}</button><button class="btn-oir-sec" data-dir-id="${inst.id}">Thư mục</button>${state.installations.length > 1 ? `<button class="btn-oir-sec" data-del-id="${inst.id}">Xóa</button>` : ''}</div>`;
    row.querySelector('[data-play-id]').onclick = () => { selectInstallation(inst.id); triggerLaunchGame(); };
    row.querySelector('[data-pick-id]').onclick = () => selectInstallation(inst.id);
    row.querySelector('[data-dir-id]').onclick = () => window.aetherAPI.openGameDir(state.gameDir);
    const delBtn = row.querySelector('[data-del-id]');
    if (delBtn) {
      delBtn.onclick = () => {
        state.installations = state.installations.filter((x) => x.id !== inst.id);
        if (state.activeInstallId === inst.id) state.activeInstallId = state.installations[0].id;
        renderAllInstallationsUI(); saveCurrentConfig();
      };
    }
    managerList.appendChild(row);
  });
  updateSummaryUI();
}

function selectInstallation(instId) {
  const found = state.installations.find((i) => i.id === instId);
  if (!found) return;
  state.activeInstallId = found.id;
  renderAllInstallationsUI();
  saveCurrentConfig();
}

function updateSummaryUI() {
  const activeName = state.authMode === 'microsoft' && state.msProfile?.name ? state.msProfile.name : state.username || 'StevePlayer';
  document.getElementById('sidebarPlayerName').textContent = activeName;
  document.getElementById('sidebarAuthBadge').textContent = state.authMode === 'microsoft' && state.msProfile ? 'BẢN QUYỀN MICROSOFT' : 'CRACK / OFFLINE';
  const authLabel = state.authMode === 'microsoft' && state.msProfile ? `${state.msProfile.name} (Microsoft)` : `${activeName} (Crack)`;
  const srvText = state.serverIp ? ` • Server: <strong>${state.serverIp}</strong>` : '';
  document.getElementById('launchSummaryText').innerHTML = `Tài khoản: <strong>${authLabel}</strong>${srvText}`;
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
  updateSummaryUI(); saveCurrentConfig();
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
  filtered.slice(0, 200).forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `Minecraft ${v.id} (${v.type === 'release' ? 'Chính thức' : v.type})`;
    if (v.id === state.selectedVersion) opt.selected = true;
    select.appendChild(opt);
  });
  if (!filtered.some((v) => v.id === state.selectedVersion) && filtered[0]) {
    state.selectedVersion = filtered[0].id;
    select.value = state.selectedVersion;
  }
  refreshLoaderBuilds();
}

async function refreshLoaderBuilds() {
  const group = document.getElementById('loaderBuildGroup');
  const select = document.getElementById('loaderVersionSelect');
  if (state.selectedCore === 'vanilla') {
    group.style.opacity = '0.45'; select.disabled = true;
    select.innerHTML = '<option value="">Nguyên bản Mojang (Không dùng Loader)</option>';
    state.selectedLoaderVersion = ''; return;
  }
  group.style.opacity = '1'; select.disabled = false;
  select.innerHTML = '<option value="">Tự động chọn bản ổn định mới nhất</option>';
  const res = await window.aetherAPI.getLoaders(state.selectedVersion, state.selectedCore);
  if (res.ok && Array.isArray(res.data)) {
    res.data.forEach((b) => {
      const opt = document.createElement('option');
      opt.value = b.version;
      opt.textContent = `${state.selectedCore.toUpperCase()} — ${b.version}${b.stable ? ' (Ổn định)' : ''}`;
      select.appendChild(opt);
    });
  }
}

function saveCurrentConfig() {
  window.aetherAPI.saveConfig({
    authMode: state.authMode, username: state.username, crackSkinSync: state.crackSkinSync,
    msProfile: state.msProfile, installations: state.installations, activeInstallId: state.activeInstallId,
    javaPath: state.javaPath, gameDir: state.gameDir, fastSkipHash: state.fastSkipHash,
    aikarFlags: state.aikarFlags, hideLauncherOnPlay: state.hideLauncherOnPlay,
    serverIp: state.serverIp, theme: state.theme
  });
}

async function triggerLaunchGame() {
  if (state.isLaunching) return;
  if (state.authMode === 'microsoft' && !state.msProfile) {
    document.getElementById('statusText').textContent = 'Vui lòng đăng nhập Microsoft trước!';
    return;
  }
  const activeInst = getActiveInstallation();
  state.isLaunching = true;
  const btn = document.getElementById('btnLaunch');
  btn.disabled = true;
  document.getElementById('btnForceKill').classList.remove('hidden');
  document.getElementById('launchBtnText').textContent = 'ĐANG KHỞI ĐỘNG...';
  document.getElementById('launchBtnSub').textContent = `${activeInst.version} • ${activeInst.core.toUpperCase()}`;

  const res = await window.aetherAPI.launchGame({
    authMode: state.authMode, username: state.username, crackSkinSync: state.crackSkinSync,
    msProfile: state.msProfile, mcVersion: activeInst.version, loaderType: activeInst.core,
    loaderVersion: activeInst.loaderVersion || '', ramGB: activeInst.ramGB || 4,
    javaPath: state.javaPath, gameDir: state.gameDir, useAikarFlags: state.aikarFlags,
    fastSkipHash: state.fastSkipHash, hideLauncherOnPlay: state.hideLauncherOnPlay,
    serverIp: state.serverIp, cpuCores: state.cpuCores
  });

  if (!res.ok) {
    state.isLaunching = false; btn.disabled = false;
    document.getElementById('btnForceKill').classList.add('hidden');
    document.getElementById('launchBtnText').textContent = 'CHƠI NGAY';
    document.getElementById('statusText').textContent = `Lỗi: ${res.error}`;
    appendLog(`Lỗi khởi động: ${res.error}`, 'error');
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  init3DSkinViewer();
  document.getElementById('btnMin').onclick = () => window.aetherAPI.minimize();
  document.getElementById('btnMax').onclick = () => window.aetherAPI.maximize();
  document.getElementById('btnClose').onclick = () => window.aetherAPI.close();

  renderVersionOptions();
  const saved = await window.aetherAPI.getConfig();
  if (saved) {
    Object.assign(state, saved);
    if (!Array.isArray(state.installations) || !state.installations.length) state.installations = [...DEFAULT_INSTALLATIONS];
  }
  applyTheme(state.theme);
  renderAllInstallationsUI();

  document.querySelectorAll('.ts-chip').forEach((chip) => { chip.onclick = () => { applyTheme(chip.dataset.themePick); saveCurrentConfig(); }; });
  document.querySelectorAll('.nav-item').forEach((btn) => { btn.onclick = () => switchTab(btn.dataset.tab); });
  document.querySelectorAll('.mc-subtab').forEach((btn) => { btn.onclick = () => switchTab(btn.dataset.tabJump); });
  document.getElementById('btnGoCreateInstall').onclick = () => switchTab('installations');

  document.getElementById('btnToggleInstallPopup').onclick = (e) => {
    e.stopPropagation();
    document.getElementById('dockInstallPopup').classList.toggle('hidden');
  };
  document.addEventListener('click', () => document.getElementById('dockInstallPopup')?.classList.add('hidden'));

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

  await updateCrackUuidPreview();
  setAuthModeUI(state.authMode);

  document.querySelectorAll('.pose-btn').forEach((btn) => { btn.onclick = () => setSkinPose(btn.dataset.pose); });
  document.querySelectorAll('.skin-preset-chip').forEach((chip) => {
    chip.onclick = () => {
      const skinName = chip.dataset.skin;
      if (state.authMode === 'crack') {
        state.username = skinName;
        document.getElementById('usernameInput').value = skinName;
        updateCrackUuidPreview(); updateSummaryUI(); saveCurrentConfig();
      }
      load3DSkinForUsername(skinName);
    };
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
    updateCrackUuidPreview(); updateSummaryUI(); saveCurrentConfig();
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

  document.getElementById('btnMsLogout').onclick = () => { state.msProfile = null; setAuthModeUI('microsoft'); saveCurrentConfig(); };

  document.querySelectorAll('.icon-pick-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.icon-pick-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active'); state.selectedIcon = btn.dataset.icon;
    };
  });

  document.querySelectorAll('.core-pill').forEach((pill) => {
    pill.onclick = () => {
      document.querySelectorAll('.core-pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active'); state.selectedCore = pill.dataset.core;
      document.getElementById('selectedCoreBadge').textContent = state.selectedCore.toUpperCase();
      document.getElementById('newInstallName').value = `Minecraft ${state.selectedVersion} (${state.selectedCore.toUpperCase()})`;
      refreshLoaderBuilds();
    };
  });

  document.querySelectorAll('.vtype-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.vtype-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active'); state.selectedVersionType = btn.dataset.vtype;
      renderVersionOptions();
    };
  });

  document.getElementById('versionSelect').onchange = (e) => {
    state.selectedVersion = e.target.value;
    document.getElementById('newInstallName').value = `Minecraft ${state.selectedVersion} (${state.selectedCore.toUpperCase()})`;
    refreshLoaderBuilds();
  };

  document.getElementById('loaderVersionSelect').onchange = (e) => { state.selectedLoaderVersion = e.target.value; };
  ramSlider.oninput = (e) => { state.ramGB = Number(e.target.value); document.getElementById('ramValueDisplay').textContent = `${state.ramGB} GB`; };

  document.getElementById('btnSaveInstallation').onclick = () => {
    const customName = document.getElementById('newInstallName').value.trim() || `Minecraft ${state.selectedVersion}`;
    const newInst = { id: `inst-${Date.now()}`, name: customName, version: state.selectedVersion, core: state.selectedCore, loaderVersion: state.selectedLoaderVersion, ramGB: state.ramGB, icon: state.selectedIcon };
    state.installations.unshift(newInst);
    state.activeInstallId = newInst.id;
    renderAllInstallationsUI(); saveCurrentConfig();
  };

  document.querySelectorAll('[data-server]').forEach((el) => {
    el.onclick = () => {
      document.querySelectorAll('[data-server]').forEach((x) => x.classList.remove('active'));
      el.classList.add('active'); state.serverIp = el.dataset.server || '';
      document.getElementById('serverIpInput').value = state.serverIp;
      updateSummaryUI(); saveCurrentConfig();
    };
  });

  document.getElementById('serverIpInput').oninput = (e) => { state.serverIp = e.target.value.trim(); updateSummaryUI(); saveCurrentConfig(); };
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

  document.getElementById('btnLaunch').onclick = () => triggerLaunchGame();

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
    document.getElementById('statusText').textContent = 'Đang chơi (Launcher đã ngủ đông 0% GPU)';
  });
  window.aetherAPI.onClose((code) => {
    state.isLaunching = false;
    if (skinViewer) skinViewer.renderPaused = false;
    document.getElementById('btnForceKill').classList.add('hidden');
    const btn = document.getElementById('btnLaunch');
    btn.disabled = false;
    document.getElementById('launchBtnText').textContent = 'CHƠI NGAY';
    renderAllInstallationsUI();
    document.getElementById('statusText').textContent = `Đã thoát Minecraft mượt mà (Mã: ${code})`;
  });
});