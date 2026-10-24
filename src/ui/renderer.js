const state = {
  theme: 'prism', authMode: 'crack', username: 'StevePlayer',
  savedAccounts: ['StevePlayer', 'Dream', 'Technoblade'],
  crackSkinSync: true, msProfile: null, selectedVersion: '1.21.4',
  versionFilter: 'release', selectedCore: 'fabric', selectedLoaderVersion: '',
  ramGB: 4, javaPath: 'java', gameDir: '', serverIp: '',
  fastSkipHash: true, aikarFlags: true, hideLauncherOnPlay: true, cpuCores: 8,
  versions: [], installedVersions: [], skinModel: 'default', capeType: 'mojang',
  activeModStoreType: 'mod', activeLocalFolder: 'mods',
  favoriteServers: [
    { name: 'LuckyVN Network (Việt Nam)', ip: 'play.luckyvn.com' },
    { name: '3FMC Network (Sinh Tồn / Skyblock)', ip: 'play.3fmc.com' },
    { name: 'Hypixel Official', ip: 'mc.hypixel.net' },
    { name: 'HerobrineVN Server', ip: 'mc.herobrine.org' }
  ],
  isLaunching: false
};
const POPULAR_VERSIONS = ['1.21.11', '1.21.4', '1.21.1', '1.20.4', '1.20.1', '1.19.4', '1.16.5', '1.12.2'];
let skinViewer = null, currentSkinDataUrl = null;

function applyCapeToViewer(capeType) {
  state.capeType = capeType || 'none';
  document.querySelectorAll('#capeSelectorBar .cape-chip').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.cape === state.capeType);
  });
  if (!skinViewer) return;
  const capeUrl = buildCapeDataUrl(state.capeType);
  skinViewer.loadCape(capeUrl || null);
}

function init3DSkinViewer() {
  const canvas = document.getElementById('skinViewerCanvas');
  if (!canvas || !window.skinview3d) return;
  const fallbackUrl = createFallbackSteveSkinDataUrl();
  currentSkinDataUrl = fallbackUrl;
  skinViewer = new window.skinview3d.SkinViewer({ canvas, width: 265, height: 330, skin: fallbackUrl });
  skinViewer.camera.position.set(18, 12, 38);
  skinViewer.zoom = 0.86; skinViewer.autoRotate = true; skinViewer.autoRotateSpeed = 0.45;
  skinViewer.animation = new window.skinview3d.WalkingAnimation();
  skinViewer.animation.speed = 0.85;
  applyCapeToViewer(state.capeType);
  draw2DAvatarFace(fallbackUrl);
}

async function loadCharacterSkin(username) {
  const clean = (username || 'StevePlayer').trim() || 'StevePlayer';
  const res = await window.aetherAPI.fetchSkinBase64(clean);
  const skinUrl = res?.ok && res.dataUrl ? res.dataUrl : createFallbackSteveSkinDataUrl();
  currentSkinDataUrl = skinUrl;
  if (skinViewer) {
    skinViewer.loadSkin(skinUrl, { model: state.skinModel });
    applyCapeToViewer(state.capeType);
  }
  draw2DAvatarFace(skinUrl);
}

function setPose(poseName) {
  if (!skinViewer || !window.skinview3d) return;
  document.querySelectorAll('.pose-btn').forEach((b) => b.classList.toggle('active', b.dataset.pose === poseName));
  if (poseName === 'walk') skinViewer.animation = new window.skinview3d.WalkingAnimation();
  else if (poseName === 'run') skinViewer.animation = new window.skinview3d.RunningAnimation();
  else if (poseName === 'wave') skinViewer.animation = new window.skinview3d.WaveAnimation();
  else skinViewer.animation = new window.skinview3d.IdleAnimation();
}

function setTheme(themeId) {
  state.theme = themeId || 'prism';
  document.documentElement.setAttribute('data-theme', state.theme);
  document.querySelectorAll('.ts-chip').forEach((btn) => btn.classList.toggle('active', btn.dataset.themePick === state.theme));
  saveCurrentConfig();
}

function getRecommendedJavaBadge(mcVer) {
  if (!mcVer) return 'Java 21 Tự Động';
  const parts = mcVer.split('.').map((n) => parseInt(n, 10));
  const minor = parts[1] || 21, patch = parts[2] || 0;
  if (minor > 20 || (minor === 20 && patch >= 5)) return 'Java 21 Tự Động';
  if (minor >= 17) return 'Java 17 Tự Động';
  return 'Java 8 Tự Động';
}

function updateSummaryUI() {
  const coreUpper = state.selectedCore.toUpperCase(), ver = state.selectedVersion, ram = `${state.ramGB} GB`;
  document.getElementById('sideVerText').textContent = ver;
  document.getElementById('sideCoreText').textContent = coreUpper;
  document.getElementById('sideRamText').textContent = ram;
  document.getElementById('dockVersionTitle').textContent = `Minecraft ${ver}`;
  document.getElementById('dockCoreSubtitle').textContent = `Core: ${coreUpper} • RAM: ${ram}`;
  const srvSuffix = state.serverIp ? ` • ${state.serverIp}` : '';
  document.getElementById('launchBtnSub').textContent = `${ver} • ${coreUpper}${srvSuffix}`;
  const javaBadge = document.getElementById('javaReqBadge');
  if (javaBadge) javaBadge.textContent = getRecommendedJavaBadge(ver);
  const storeLabel = document.getElementById('modStoreVerLabel');
  if (storeLabel) storeLabel.textContent = `${ver} (${coreUpper})`;
  const playerName = state.authMode === 'microsoft' && state.msProfile?.name ? state.msProfile.name : state.username;
  document.getElementById('sidebarPlayerName').textContent = playerName;
  document.getElementById('sidebarAuthBadge').textContent = state.authMode === 'microsoft' ? 'BẢN QUYỀN MS' : 'CRACK / OFFLINE';
  document.getElementById('dockAccountText').textContent = `${playerName} (${state.authMode === 'microsoft' ? 'Microsoft' : 'Crack'})`;
}

function saveCurrentConfig() {
  window.aetherAPI.saveConfig({
    theme: state.theme, authMode: state.authMode, username: state.username,
    savedAccounts: state.savedAccounts, crackSkinSync: state.crackSkinSync, msProfile: state.msProfile,
    selectedVersion: state.selectedVersion, selectedCore: state.selectedCore,
    selectedLoaderVersion: state.selectedLoaderVersion, ramGB: state.ramGB,
    javaPath: state.javaPath, gameDir: state.gameDir, serverIp: state.serverIp,
    fastSkipHash: state.fastSkipHash, aikarFlags: state.aikarFlags,
    hideLauncherOnPlay: state.hideLauncherOnPlay, skinModel: state.skinModel,
    capeType: state.capeType, favoriteServers: state.favoriteServers
  });
}

function isVersionInstalledOnDisk(verId) {
  return state.installedVersions.some((inst) => inst === verId || inst.endsWith(`-${verId}`) || inst.startsWith(`${verId}-`));
}

async function refreshInstalledVersions() {
  const res = await window.aetherAPI.getInstalledVersions(state.gameDir);
  state.installedVersions = res?.ok && Array.isArray(res.list) ? res.list : [];
  const label = document.getElementById('installedCountLabel');
  if (label) label.textContent = state.installedVersions.length > 0 ? `✓ ${state.installedVersions.length} bản đã cài trong máy` : '☁ Sẵn sàng tải tự động';
  renderQuickVersionGrid();
}

function renderQuickVersionGrid() {
  const grid = document.getElementById('quickVersionGrid');
  if (!grid) return;
  grid.innerHTML = POPULAR_VERSIONS.map((v) => {
    const installed = isVersionInstalledOnDisk(v), active = state.selectedVersion === v ? 'active' : '';
    return `<button class="qver-chip ${active}" data-qver="${v}"><span>${v}</span><span class="qver-status ${installed ? 'ready' : 'cloud'}">${installed ? '✓ Đã tải' : '☁ Sẵn sàng'}</span></button>`;
  }).join('');
  grid.querySelectorAll('.qver-chip').forEach((btn) => {
    btn.onclick = async () => {
      state.selectedVersion = btn.dataset.qver;
      const select = document.getElementById('versionSelect');
      if (select) select.value = state.selectedVersion;
      renderQuickVersionGrid(); await refreshLoaderBuilds(); updateSummaryUI(); saveCurrentConfig();
    };
  });
}

function renderSavedAccounts() {
  const bar = document.getElementById('savedAccountsBar');
  if (!bar) return;
  bar.innerHTML = state.savedAccounts.map((acc) => {
    const active = acc.toLowerCase() === state.username.toLowerCase() ? 'active' : '';
    return `<div class="acc-chip ${active}" data-acc="${acc}"><span>👤 ${acc}</span>${state.savedAccounts.length > 1 ? `<span class="acc-chip-del" data-delacc="${acc}">×</span>` : ''}</div>`;
  }).join('');
  bar.querySelectorAll('.acc-chip').forEach((chip) => {
    chip.onclick = (e) => {
      const delTarget = e.target.getAttribute('data-delacc');
      if (delTarget) {
        e.stopPropagation();
        state.savedAccounts = state.savedAccounts.filter((a) => a !== delTarget);
        renderSavedAccounts(); saveCurrentConfig(); return;
      }
      const chosen = chip.dataset.acc;
      state.username = chosen;
      document.getElementById('usernameInput').value = chosen;
      loadCharacterSkin(chosen); updateCrackUuidPreview(chosen); renderSavedAccounts(); updateSummaryUI(); saveCurrentConfig();
    };
  });
}

async function updateCrackUuidPreview(name) {
  const uuid = await window.aetherAPI.getCrackUuid(name || 'StevePlayer');
  const tag = document.getElementById('uuidPreviewTag');
  if (tag && uuid) tag.textContent = `UUID: ${uuid.slice(0, 8)}...`;
}

async function refreshLoaderBuilds() {
  const loaderSelect = document.getElementById('loaderVersionSelect');
  if (state.selectedCore === 'vanilla') {
    loaderSelect.innerHTML = '<option value="">Nguyên bản (Không dùng Loader)</option>';
    loaderSelect.disabled = true; state.selectedLoaderVersion = ''; return;
  }
  loaderSelect.disabled = false;
  loaderSelect.innerHTML = '<option value="">Đang tải danh sách build...</option>';
  const res = await window.aetherAPI.getLoaders(state.selectedVersion, state.selectedCore);
  if (!res.ok || !res.data || res.data.length === 0) {
    loaderSelect.innerHTML = '<option value="">Chưa hỗ trợ bản này</option>';
    state.selectedLoaderVersion = ''; return;
  }
  loaderSelect.innerHTML = res.data.map((item, idx) => `<option value="${item.version}" ${idx === 0 ? 'selected' : ''}>${item.version} ${item.stable ? '(Ổn định)' : ''}</option>`).join('');
  state.selectedLoaderVersion = res.data[0].version;
}

function renderVersionOptions() {
  const select = document.getElementById('versionSelect');
  const filtered = state.versions.filter((v) => {
    if (state.versionFilter === 'release') return v.type === 'release';
    if (state.versionFilter === 'snapshot') return v.type === 'snapshot';
    return v.type === 'old_beta' || v.type === 'old_alpha';
  });
  select.innerHTML = filtered.map((v) => `<option value="${v.id}" ${v.id === state.selectedVersion ? 'selected' : ''}>Minecraft ${v.id}${isVersionInstalledOnDisk(v.id) ? ' ✓ (Đã tải)' : ''}</option>`).join('');
  if (filtered.length > 0 && !filtered.some((v) => v.id === state.selectedVersion)) {
    state.selectedVersion = filtered[0].id; select.value = state.selectedVersion;
  }
  renderFullVersionTable(); renderQuickVersionGrid(); updateSummaryUI();
}

function renderFullVersionTable(query = '') {
  const container = document.getElementById('fullVersionsList');
  if (!container) return;
  const q = query.trim().toLowerCase();
  const list = state.versions.filter((v) => !q || v.id.toLowerCase().includes(q)).slice(0, 120);
  container.innerHTML = list.map((v) => {
    const dateStr = v.releaseTime ? new Date(v.releaseTime).toLocaleDateString('vi-VN') : '';
    const inst = isVersionInstalledOnDisk(v.id);
    return `<div class="ver-row-card ${v.id === state.selectedVersion ? 'active' : ''}" data-ver="${v.id}"><div><strong>Minecraft ${v.id}</strong><div style="font-size:10px;color:var(--text-muted);">${dateStr}</div></div><span style="color:${inst ? '#16a34a' : 'var(--text-muted)'};font-weight:700;">${inst ? '✓ Đã tải' : v.type.toUpperCase()}</span></div>`;
  }).join('');
  container.querySelectorAll('.ver-row-card').forEach((card) => {
    card.onclick = async () => {
      state.selectedVersion = card.dataset.ver;
      renderVersionOptions(); await refreshLoaderBuilds(); saveCurrentConfig();
      document.querySelector('.nav-item[data-tab="play"]').click();
    };
  });
}

function setCore(coreName) {
  state.selectedCore = coreName;
  document.querySelectorAll('.core-tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.core === coreName));
  refreshLoaderBuilds().then(() => { updateSummaryUI(); saveCurrentConfig(); });
}

function setAuthModeUI(mode) {
  state.authMode = mode;
  document.getElementById('tabBtnCrack').classList.toggle('active', mode === 'crack');
  document.getElementById('tabBtnMicrosoft').classList.toggle('active', mode === 'microsoft');
  document.getElementById('panelCrack').classList.toggle('hidden', mode !== 'crack');
  document.getElementById('panelMicrosoft').classList.toggle('hidden', mode !== 'microsoft');
  if (mode === 'microsoft' && state.msProfile?.name) {
    document.getElementById('msNotLoggedBox').classList.add('hidden');
    document.getElementById('msLoggedBox').classList.remove('hidden');
    document.getElementById('msProfileName').textContent = state.msProfile.name;
    loadCharacterSkin(state.msProfile.name);
  } else if (mode === 'microsoft') {
    document.getElementById('msNotLoggedBox').classList.remove('hidden');
    document.getElementById('msLoggedBox').classList.add('hidden');
  } else loadCharacterSkin(state.username);
  updateSummaryUI(); saveCurrentConfig();
}

function setServerIpEverywhere(ip) {
  state.serverIp = (ip || '').trim();
  const qInput = document.getElementById('quickServerInput'), sInput = document.getElementById('serverIpInput');
  if (qInput) qInput.value = state.serverIp;
  if (sInput) sInput.value = state.serverIp;
  document.querySelectorAll('.srv-pill').forEach((p) => p.classList.toggle('active', p.dataset.srv === state.serverIp));
  updateSummaryUI(); saveCurrentConfig();
}

function syncBoosterCheckboxes() {
  [['homeAikarCheck', 'aikarFlagsCheck', 'aikarFlags'], ['homeHibernateCheck', 'hideLauncherCheck', 'hideLauncherOnPlay'], ['homeFastSkipCheck', 'fastSkipCheck', 'fastSkipHash']].forEach(([hId, sId, key]) => {
    const hEl = document.getElementById(hId), sEl = document.getElementById(sId);
    if (hEl) hEl.checked = Boolean(state[key]);
    if (sEl) sEl.checked = Boolean(state[key]);
  });
}

function appendLog(line, type = 'normal') {
  const out = document.getElementById('consoleOutput');
  if (!out) return;
  const div = document.createElement('div'); div.className = `log-entry ${type}`; div.textContent = line;
  out.appendChild(div); out.scrollTop = out.scrollHeight;
}

window.addEventListener('DOMContentLoaded', async () => {
  init3DSkinViewer();
  const sys = await window.aetherAPI.getSystemInfo();
  state.cpuCores = sys.cpuCores || 8; state.gameDir = sys.defaultGameDir; state.javaPath = sys.detectedJava || 'java';
  document.getElementById('cpuBadge').textContent = `${sys.cpuCores} Nhân CPU`;
  document.getElementById('ramBadge').textContent = `RAM trống: ${sys.freeMemGB}/${sys.totalMemGB} GB`;
  const ramSlider = document.getElementById('ramSlider'); ramSlider.max = Math.max(4, sys.totalMemGB);

  const saved = await window.aetherAPI.getConfig();
  if (saved) {
    Object.assign(state, saved); if ((!state.javaPath || state.javaPath === 'java') && sys.detectedJava && sys.detectedJava !== 'java') state.javaPath = sys.detectedJava;
    if (!Array.isArray(state.savedAccounts) || !state.savedAccounts.length) state.savedAccounts = [state.username || 'StevePlayer'];
    if (!Array.isArray(state.favoriteServers) || !state.favoriteServers.length) state.favoriteServers = [{ name: 'LuckyVN Network', ip: 'play.luckyvn.com' }, { name: 'Hypixel Official', ip: 'mc.hypixel.net' }];
  }

  document.getElementById('usernameInput').value = state.username;
  document.getElementById('ramSlider').value = state.ramGB;
  document.getElementById('ramValueDisplay').textContent = `${state.ramGB} GB`;
  document.getElementById('javaPathInput').value = state.javaPath;
  document.getElementById('gameDirInput').value = state.gameDir;
  document.getElementById('crackSkinSyncToggle').checked = state.crackSkinSync !== false;

  setTheme(state.theme || 'prism'); syncBoosterCheckboxes(); setServerIpEverywhere(state.serverIp);
  renderSavedAccounts(); renderFavoriteServers(); updateCrackUuidPreview(state.username); applyCapeToViewer(state.capeType || 'mojang');

  document.querySelectorAll('.wt-model-btn').forEach((b) => b.classList.toggle('active', b.dataset.model === state.skinModel));
  document.querySelectorAll('.core-tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.core === state.selectedCore));
  setAuthModeUI(state.authMode);

  document.getElementById('btnMin').onclick = () => window.aetherAPI.minimize();
  document.getElementById('btnMax').onclick = () => window.aetherAPI.maximize();
  document.getElementById('btnClose').onclick = () => window.aetherAPI.close();

  document.getElementById('btnTrimRam').onclick = async () => {
    const txt = document.getElementById('ramBoostText'); txt.textContent = 'Đang dọn...';
    const res = await window.aetherAPI.trimRamNow();
    if (res.ok) {
      document.getElementById('ramBadge').textContent = `RAM trống: ${res.freeMemGB}/${sys.totalMemGB} GB`;
      txt.textContent = 'Đã tối ưu!'; setTimeout(() => (txt.textContent = 'Dọn RAM'), 1500);
    }
  };

  document.querySelectorAll('.ts-chip').forEach((chip) => { chip.onclick = () => setTheme(chip.dataset.themePick); });
  document.querySelectorAll('.nav-item').forEach((nav) => {
    nav.onclick = () => {
      document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      nav.classList.add('active');
      document.getElementById(`tab-${nav.dataset.tab}`).classList.add('active');
      if (nav.dataset.tab === 'mods') loadModrinthStore();
      if (nav.dataset.tab === 'worlds') renderLocalWorlds();
    };
  });
  document.getElementById('btnGoModStore').onclick = () => document.querySelector('.nav-item[data-tab="mods"]').click();

  document.querySelectorAll('.wp-chip').forEach((wp) => {
    wp.onclick = () => {
      document.querySelectorAll('.wp-chip').forEach((w) => w.classList.remove('active'));
      wp.classList.add('active');
      document.getElementById('heroBanner').style.backgroundImage = `url('${wp.dataset.wp}')`;
    };
  });

  document.querySelectorAll('.pose-btn').forEach((btn) => { btn.onclick = () => setPose(btn.dataset.pose); });
  document.querySelectorAll('.wt-model-btn').forEach((btn) => {
    btn.onclick = () => {
      state.skinModel = btn.dataset.model;
      document.querySelectorAll('.wt-model-btn').forEach((b) => b.classList.toggle('active', b === btn));
      if (skinViewer && currentSkinDataUrl) skinViewer.loadSkin(currentSkinDataUrl, { model: state.skinModel });
      saveCurrentConfig();
    };
  });
  document.querySelectorAll('#capeSelectorBar .cape-chip').forEach((chip) => {
    chip.onclick = () => { applyCapeToViewer(chip.dataset.cape); saveCurrentConfig(); };
  });

  document.getElementById('btnUploadSkinPng').onclick = async () => {
    const res = await window.aetherAPI.uploadLocalSkin(state.gameDir, state.username);
    if (res?.ok && res.dataUrl) {
      currentSkinDataUrl = res.dataUrl;
      if (skinViewer) skinViewer.loadSkin(res.dataUrl, { model: state.skinModel });
      draw2DAvatarFace(res.dataUrl);
      document.getElementById('statusText').textContent = '✓ Đã nạp ảnh Skin (.PNG) lên nhân vật 3D & lưu vào game!';
    }
  };

  document.querySelectorAll('.core-tab-btn').forEach((btn) => { btn.onclick = () => setCore(btn.dataset.core); });
  document.querySelectorAll('.vtype-btn[data-vtype]').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.vtype-btn[data-vtype]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active'); state.versionFilter = btn.dataset.vtype;
      renderVersionOptions(); refreshLoaderBuilds();
    };
  });

  document.getElementById('versionSelect').onchange = async (e) => {
    state.selectedVersion = e.target.value; renderQuickVersionGrid();
    await refreshLoaderBuilds(); updateSummaryUI(); saveCurrentConfig();
  };
  document.getElementById('loaderVersionSelect').onchange = (e) => { state.selectedLoaderVersion = e.target.value; saveCurrentConfig(); };
  document.getElementById('versionSearchInput').oninput = (e) => renderFullVersionTable(e.target.value);

  document.getElementById('btnOneClickFpsBoost').onclick = (e) => runOneClickFpsBoost(e.currentTarget);
  document.getElementById('btnStoreFpsBoost').onclick = (e) => runOneClickFpsBoost(e.currentTarget);

  document.querySelectorAll('.mtype-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.mtype-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active'); state.activeModStoreType = btn.dataset.ptype; loadModrinthStore();
    };
  });
  document.getElementById('btnSearchModrinth').onclick = () => loadModrinthStore();
  document.getElementById('modSearchInput').onkeydown = (e) => { if (e.key === 'Enter') loadModrinthStore(); };
  document.querySelectorAll('[data-localfolder]').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('[data-localfolder]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active'); state.activeLocalFolder = btn.dataset.localfolder; renderLocalAddonsManager();
    };
  });
  document.getElementById('btnOpenModsFolder').onclick = () => {
    const folderMap = { mod: 'mods', shader: 'shaderpacks', resourcepack: 'resourcepacks', installed: state.activeLocalFolder };
    window.aetherAPI.openSubFolder(state.gameDir, folderMap[state.activeModStoreType] || 'mods');
  };

  document.getElementById('btnAddServer').onclick = () => {
    const nameEl = document.getElementById('newServerNameInput'), ipEl = document.getElementById('newServerIpInput');
    const name = nameEl.value.trim() || 'Minecraft Server', ip = ipEl.value.trim();
    if (!ip) return;
    state.favoriteServers.unshift({ name, ip }); nameEl.value = ''; ipEl.value = '';
    renderFavoriteServers(); saveCurrentConfig();
  };
  document.getElementById('btnOpenScreenshots').onclick = () => window.aetherAPI.openSubFolder(state.gameDir, 'screenshots');
  document.getElementById('btnRefreshWorlds').onclick = () => renderLocalWorlds();

  ramSlider.oninput = (e) => {
    state.ramGB = parseInt(e.target.value, 10);
    document.getElementById('ramValueDisplay').textContent = `${state.ramGB} GB`;
    updateSummaryUI(); saveCurrentConfig();
  };

  document.getElementById('tabBtnCrack').onclick = () => setAuthModeUI('crack');
  document.getElementById('tabBtnMicrosoft').onclick = () => setAuthModeUI('microsoft');
  document.getElementById('usernameInput').oninput = (e) => {
    state.username = e.target.value.trim() || 'StevePlayer';
    updateCrackUuidPreview(state.username); updateSummaryUI(); saveCurrentConfig();
  };
  document.getElementById('btnReloadSkin').onclick = () => { loadCharacterSkin(state.username); renderSavedAccounts(); };
  document.getElementById('btnSaveAccount').onclick = () => {
    const clean = (state.username || 'StevePlayer').trim();
    if (clean && !state.savedAccounts.includes(clean)) { state.savedAccounts.push(clean); renderSavedAccounts(); saveCurrentConfig(); }
  };

  document.getElementById('btnMsLogin').onclick = async () => {
    const btn = document.getElementById('btnMsLogin');
    btn.disabled = true; btn.querySelector('span').textContent = 'Đang mở Microsoft OAuth2...';
    const res = await window.aetherAPI.loginMicrosoft();
    btn.disabled = false; btn.querySelector('span').textContent = 'Đăng Nhập Microsoft OAuth2';
    if (res.ok && res.profile) { state.msProfile = res.profile; setAuthModeUI('microsoft'); }
  };
  document.getElementById('btnMsLogout').onclick = () => { state.msProfile = null; setAuthModeUI('microsoft'); saveCurrentConfig(); };

  document.querySelectorAll('.srv-pill').forEach((pill) => { pill.onclick = () => setServerIpEverywhere(pill.dataset.srv); });
  document.getElementById('quickServerInput').oninput = (e) => setServerIpEverywhere(e.target.value);
  document.getElementById('serverIpInput').oninput = (e) => setServerIpEverywhere(e.target.value);

  const bindTogglePair = (homeId, setId, key) => {
    const hEl = document.getElementById(homeId), sEl = document.getElementById(setId);
    if (hEl) hEl.onchange = (e) => { state[key] = e.target.checked; if (sEl) sEl.checked = e.target.checked; saveCurrentConfig(); };
    if (sEl) sEl.onchange = (e) => { state[key] = e.target.checked; if (hEl) hEl.checked = e.target.checked; saveCurrentConfig(); };
  };
  bindTogglePair('homeAikarCheck', 'aikarFlagsCheck', 'aikarFlags');
  bindTogglePair('homeHibernateCheck', 'hideLauncherCheck', 'hideLauncherOnPlay');
  bindTogglePair('homeFastSkipCheck', 'fastSkipCheck', 'fastSkipHash');

  document.getElementById('javaPathInput').oninput = (e) => { state.javaPath = e.target.value.trim() || 'java'; saveCurrentConfig(); };
  document.getElementById('gameDirInput').oninput = (e) => { state.gameDir = e.target.value.trim(); saveCurrentConfig(); };
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
      document.getElementById('statusText').textContent = 'Vui lòng đăng nhập Microsoft trước!'; return;
    }
    state.isLaunching = true;
    const btn = document.getElementById('btnLaunch'); btn.disabled = true;
    document.getElementById('btnForceKill').classList.remove('hidden');
    document.getElementById('launchBtnText').textContent = 'ĐANG KHỞI ĐỘNG...';

    const res = await window.aetherAPI.launchGame({
      authMode: state.authMode, username: state.username, crackSkinSync: state.crackSkinSync,
      msProfile: state.msProfile, mcVersion: state.selectedVersion, loaderType: state.selectedCore,
      loaderVersion: state.selectedLoaderVersion, ramGB: state.ramGB, javaPath: state.javaPath,
      gameDir: state.gameDir, useAikarFlags: state.aikarFlags, fastSkipHash: state.fastSkipHash,
      hideLauncherOnPlay: state.hideLauncherOnPlay, serverIp: state.serverIp, cpuCores: state.cpuCores
    });

    if (!res.ok) {
      state.isLaunching = false; btn.disabled = false;
      document.getElementById('btnForceKill').classList.add('hidden');
      document.getElementById('launchBtnText').textContent = 'CHƠI NGAY';
      document.getElementById('statusText').textContent = `Lỗi: ${res.error}`;
      appendLog(`Lỗi khởi động: ${res.error}`, 'error');
    }
  };

  await refreshInstalledVersions();
  await refreshLocalAddonsCount();
  const verRes = await window.aetherAPI.getVersions();
  if (verRes.ok && verRes.data?.versions?.length) {
    state.versions = verRes.data.versions;
    renderVersionOptions(); await refreshLoaderBuilds();
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
  window.aetherAPI.onClose(async (code) => {
    state.isLaunching = false;
    if (skinViewer) skinViewer.renderPaused = false;
    document.getElementById('btnForceKill').classList.add('hidden');
    const btn = document.getElementById('btnLaunch'); btn.disabled = false;
    document.getElementById('launchBtnText').textContent = 'CHƠI NGAY';
    await refreshInstalledVersions(); updateSummaryUI();
    document.getElementById('statusText').textContent = `Đã thoát Minecraft mượt mà (Mã: ${code})`;
  });
});