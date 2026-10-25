const DEFAULT_FEATURED_SERVERS = [
  // 🇻🇳 MÁY CHỦ VIỆT NAM NỔI BẬT (HỖ TRỢ CRACK / OFFLINE & BẢN QUYỀN)
  { name: 'KingMC Network (Việt Nam • BoxPvP / Skyblock)', ip: 'play.kingmc.vn', cat: 'vn' },
  { name: 'LuckyVN Network (Việt Nam • Sinh Tồn / Skyblock)', ip: 'mc.luckyvn.com', cat: 'vn' },
  { name: 'GrassMine VN (Việt Nam • Towny / Sinh Tồn)', ip: 'grassmine.vn', cat: 'vn' },
  { name: 'MineFC Việt Nam (Cụm Server Lâu Đời)', ip: 'minefc.com', cat: 'vn' },
  { name: 'SuperMC Network (Việt Nam • RPG / Skyblock)', ip: 'supermc.vn', cat: 'vn' },
  { name: 'AEMine Việt Nam (Sinh Tồn / BoxPvP / Lifesteal)', ip: 'aemine.vn', cat: 'vn' },
  { name: '3FMC Network (Việt Nam • Sinh Tồn / Skyblock)', ip: 'play.3fmc.com', cat: 'vn' },
  // 🔓 MÁY CHỦ QUỐC TẾ HỖ TRỢ CRACK / OFFLINE
  { name: 'MineBerry Network (Crack • BedWars / Survival)', ip: 'play.mineberry.org', cat: 'crack' },
  { name: 'PikaNetwork (Crack • BedWars / SkyWars / PvP)', ip: 'play.pika-network.net', cat: 'crack' },
  { name: 'JartexNetwork (Crack • Minigames / Factions)', ip: 'play.jartexnetwork.com', cat: 'crack' },
  { name: 'ExtremeCraft (Crack • Skyblock / Survival / PvP)', ip: 'play.extremecraft.net', cat: 'crack' },
  { name: 'Gamster Network (Crack • BedWars / Practice PvP)', ip: 'play.gamster.org', cat: 'crack' },
  { name: 'BlocksMC Quốc Tế (Crack • BedWars / SkyWars)', ip: 'mc.blocksmc.com', cat: 'crack' },
  { name: 'Mineland Network (Crack • Creative / Minigames)', ip: 'play.mineland.net', cat: 'crack' },
  // 👑 MÁY CHỦ QUỐC TẾ BẢN QUYỀN (MICROSOFT PREMIUM)
  { name: 'Hypixel Official (Bản Quyền • Số 1 Thế Giới)', ip: 'mc.hypixel.net', cat: 'premium' },
  { name: 'DonutSMP Official (Bản Quyền • Hardcore Lifesteal)', ip: 'donutsmp.net', cat: 'premium' },
  { name: 'WynnCraft MMORPG (Bản Quyền • Thế Giới Nhập Vai)', ip: 'play.wynncraft.com', cat: 'premium' },
  { name: '2B2T Official (Bản Quyền • Server Anarchy Cổ Nhất)', ip: '2b2t.org', cat: 'premium' }
];

const state = {
  theme: 'prism', authMode: 'crack', username: 'StevePlayer',
  savedAccounts: ['StevePlayer', 'Dream', 'Technoblade'],
  crackSkinSync: true, msProfile: null, selectedVersion: '1.21.4',
  versionFilter: 'release', selectedCore: 'fabric', selectedLoaderVersion: '',
  ramGB: 3, javaPath: 'java', gameDir: '', serverIp: '',
  fastSkipHash: true, aikarFlags: true, hideLauncherOnPlay: true, cpuCores: 8,
  versions: [], installedVersions: [], skinModel: 'default', selectedSkinPreset: '', cachedSkinDataUrl: '', capeType: 'mojang', backEquipment: 'cape', stageStars: true,
  activeModStoreType: 'mod', activeLocalFolder: 'mods', serverCategoryFilter: 'all',
  favoriteServers: [...DEFAULT_FEATURED_SERVERS],
  winResolution: '1280x720', outerLayerVisible: true, stageBgMode: 'stars', serverPingCache: {}, acceptedEula: false, skipLaunchConfirm: false, isLaunching: false
};

function syncFeaturedServersIntoState() {
  const deadIps = new Set(['play.luckyvn.com', 'mc.herobrine.org', 'herobrine.org', 'play.pikachu.vn', 'play.simpmc.vn']);
  if (state.serverIp === 'play.luckyvn.com') state.serverIp = 'mc.luckyvn.com';
  const current = Array.isArray(state.favoriteServers) ? state.favoriteServers : [];
  const cleanedUserCustom = current.filter((s) => {
    const ipLower = String(s?.ip || '').toLowerCase().trim();
    if (!ipLower || deadIps.has(ipLower)) return false;
    return !DEFAULT_FEATURED_SERVERS.some((d) => d.ip.toLowerCase() === ipLower);
  });
  state.favoriteServers = [
    ...cleanedUserCustom.map((s) => ({ ...s, cat: s.cat || 'vn' })),
    ...DEFAULT_FEATURED_SERVERS
  ];
}
const POPULAR_VERSIONS = ['1.21.11', '1.21.4', '1.21.1', '1.20.4', '1.20.1', '1.16.5'];
let skinViewer = null, currentSkinDataUrl = null;

function syncSkinPresetButtons(activeName) {
  const target = (activeName || state.selectedSkinPreset || state.username || '').toLowerCase();
  document.querySelectorAll('#skinPresetBar .skin-preset-chip').forEach((chip) => {
    const p = (chip.dataset.skinpreset || '').toLowerCase();
    chip.classList.toggle('active', p === target || (p === 'mhf_steve' && target === 'steveplayer'));
  });
}

function update3DNameTag(_nameStr) {
  if (!skinViewer) return;
  skinViewer.nameTag = null;
}

async function applyCapeToViewer(capeType) {
  state.capeType = capeType || 'none';
  if (state.capeType === 'none' && state.backEquipment === 'elytra') {
    state.backEquipment = 'cape';
  }
  document.querySelectorAll('#capeSelectorBar .cape-chip').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.cape === state.capeType);
  });
  const btnElytra = document.getElementById('btnToggleElytra');
  if (btnElytra) btnElytra.classList.toggle('active', state.backEquipment === 'elytra');
  if (!skinViewer) return;
  const effectiveType = (state.backEquipment === 'elytra' && state.capeType === 'none') ? 'mojang' : state.capeType;
  const capeUrl = buildCapeDataUrl(effectiveType);
  try {
    if (capeUrl) {
      await skinViewer.loadCape(capeUrl, { backEquipment: state.backEquipment || 'cape' });
      if (state.backEquipment === 'elytra' && skinViewer.playerObject?.elytra) {
        skinViewer.playerObject.elytra.leftWing.rotation.z = 0.44;
        skinViewer.playerObject.elytra.leftWing.rotation.y = 0.14;
        skinViewer.playerObject.elytra.updateRightWing();
      }
    } else {
      skinViewer.loadCape(null);
    }
    skinViewer.renderPaused = false;
    skinViewer.render();
    setTimeout(() => {
      const wrap = document.getElementById('webglStageWrap');
      if (skinViewer && !skinViewer.autoRotate && !wrap?.matches(':hover')) {
        skinViewer.render();
        skinViewer.renderPaused = true;
      }
    }, 2200);
  } catch (_) {}
}

function init3DSkinViewer() {
  const canvas = document.getElementById('skinViewerCanvas');
  if (!canvas || !window.skinview3d) return;
  const initialSkin = state.cachedSkinDataUrl || createFallbackSteveSkinDataUrl();
  currentSkinDataUrl = initialSkin;
  skinViewer = new window.skinview3d.SkinViewer({
    canvas,
    width: 265,
    height: 330,
    skin: initialSkin,
    pixelRatio: 1,
    preserveDrawingBuffer: true
  });
  // Crisp 3D directional lighting so cube faces have clear depth shading and bright whites
  if (skinViewer.globalLight) skinViewer.globalLight.intensity = 2.6;
  if (skinViewer.cameraLight) {
    skinViewer.cameraLight.intensity = 1.95;
    skinViewer.cameraLight.position.set(12, 24, 38);
  }
  skinViewer.camera.position.set(-14, 11, 42);
  skinViewer.zoom = 0.84;
  skinViewer.autoRotate = false;
  skinViewer.autoRotateSpeed = 0.45;
  skinViewer.animation = new window.skinview3d.WalkingAnimation();
  skinViewer.animation.speed = 0.85;
  update3DNameTag(state.username);
  applyCapeToViewer(state.capeType);
  if (typeof convertSkinTo64x64DataUrl === 'function') {
    convertSkinTo64x64DataUrl(initialSkin).then((normUrl) => {
      currentSkinDataUrl = normUrl;
      state.cachedSkinDataUrl = normUrl;
      skinViewer?.loadSkin(normUrl, { model: state.skinModel }).then(() => skinViewer?.render()).catch(() => {});
      draw2DAvatarFace(normUrl);
    });
  } else {
    draw2DAvatarFace(initialSkin);
  }
  const stageWrap = canvas.parentElement;
  if (stageWrap && window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      if (!skinViewer || !stageWrap.clientWidth || !stageWrap.clientHeight) return;
      skinViewer.setSize(Math.max(180, stageWrap.clientWidth - 10), Math.max(180, stageWrap.clientHeight - 16));
      skinViewer.render();
    });
    ro.observe(stageWrap);
  }
}

async function loadCharacterSkin(username) {
  const clean = (username || 'StevePlayer').trim() || 'StevePlayer';
  syncSkinPresetButtons(clean);
  update3DNameTag(state.authMode === 'microsoft' && state.msProfile?.name ? state.msProfile.name : state.username);
  const res = await window.aetherAPI.fetchSkinBase64(clean);
  const rawSkinUrl = res?.ok && res.dataUrl ? res.dataUrl : createFallbackSteveSkinDataUrl();
  const normalized64Url = typeof convertSkinTo64x64DataUrl === 'function'
    ? await convertSkinTo64x64DataUrl(rawSkinUrl)
    : rawSkinUrl;
  currentSkinDataUrl = normalized64Url;
  state.cachedSkinDataUrl = normalized64Url;
  saveCurrentConfig();
  if (skinViewer) {
    try {
      await skinViewer.loadSkin(normalized64Url, { model: state.skinModel });
      await applyCapeToViewer(state.capeType);
      skinViewer.render();
    } catch (_) {}
  }
  draw2DAvatarFace(normalized64Url);
}

function setPose(poseName) {
  if (!skinViewer || !window.skinview3d) return;
  document.querySelectorAll('.pose-btn').forEach((b) => b.classList.toggle('active', b.dataset.pose === poseName));
  if (poseName === 'walk') skinViewer.animation = new window.skinview3d.WalkingAnimation();
  else if (poseName === 'run') skinViewer.animation = new window.skinview3d.RunningAnimation();
  else if (poseName === 'hit') skinViewer.animation = new window.skinview3d.HitAnimation();
  else if (poseName === 'fly') {
    if (state.backEquipment !== 'elytra') {
      state.backEquipment = 'elytra';
      if (state.capeType === 'none') state.capeType = 'diamond';
      applyCapeToViewer(state.capeType);
    }
    skinViewer.animation = new window.skinview3d.FlyingAnimation();
  }
  else if (poseName === 'wave') skinViewer.animation = new window.skinview3d.WaveAnimation();
  else skinViewer.animation = new window.skinview3d.IdleAnimation();
  skinViewer.renderPaused = false;
  skinViewer.render();
  setTimeout(() => {
    const wrap = document.getElementById('webglStageWrap');
    if (skinViewer && !skinViewer.autoRotate && !wrap?.matches(':hover')) {
      skinViewer.render();
      skinViewer.renderPaused = true;
    }
  }, 2500);
}

function setTheme(themeId) {
  state.theme = themeId || 'prism';
  document.documentElement.setAttribute('data-theme', state.theme);
  document.querySelectorAll('.ts-chip').forEach((btn) => btn.classList.toggle('active', btn.dataset.themePick === state.theme));
  saveCurrentConfig();
}

function getRecommendedJavaBadge(mcVer) {
  if (!mcVer) return '☕ Dùng Java 21 khi vào Game';
  const parts = mcVer.split('.').map((n) => parseInt(n, 10));
  const minor = parts[1] || 21, patch = parts[2] || 0;
  if (minor > 20 || (minor === 20 && patch >= 5)) return '☕ Dùng Java 21 khi vào Game';
  if (minor >= 17) return '☕ Dùng Java 17 khi vào Game';
  return '☕ Dùng Java 8 khi vào Game';
}

function updateSummaryUI() {
  const coreUpper = state.selectedCore.toUpperCase(), ver = state.selectedVersion, ram = `${state.ramGB} GB`;
  const ldrTag = (state.selectedCore !== 'vanilla' && state.selectedLoaderVersion) ? ` ${state.selectedLoaderVersion}` : '';
  document.getElementById('sideVerText').textContent = ver;
  document.getElementById('sideCoreText').textContent = coreUpper;
  document.getElementById('sideRamText').textContent = ram;
  document.getElementById('dockVersionTitle').textContent = `Minecraft ${ver}`;
  document.getElementById('dockCoreSubtitle').textContent = `Core: ${coreUpper}${ldrTag} • RAM: ${ram}`;
  document.querySelectorAll('#ramPresetBar .ram-pill-btn').forEach((b) => {
    b.classList.toggle('active', parseInt(b.dataset.ram, 10) === state.ramGB);
  });
  const dockMiniBadge = document.getElementById('dockCoreMiniBadge');
  const activeCoreImg = document.querySelector(`.core-tab-btn[data-core="${state.selectedCore}"] img`);
  if (dockMiniBadge && activeCoreImg) {
    if (state.selectedCore === 'vanilla') {
      dockMiniBadge.style.display = 'none';
    } else {
      dockMiniBadge.src = activeCoreImg.src;
      dockMiniBadge.style.display = 'block';
    }
  }
  const srvSuffix = state.serverIp ? ` • ${state.serverIp}` : '';
  document.getElementById('launchBtnSub').textContent = `${ver} • ${coreUpper}${srvSuffix}`;
  const isInst = isVersionInstalledOnDisk(ver);
  const vBadge = document.getElementById('verReadyBadge');
  const vDesc = document.getElementById('verReadyDesc');
  if (vBadge && vDesc) {
    vBadge.className = 'vrb-badge ' + (isInst ? 'ready' : 'cloud');
    vBadge.textContent = isInst ? ('✓ Đã cài sẵn trên máy (' + ver + ')') : ('☁ Chưa tải trên máy (' + ver + ')');
    vDesc.textContent = isInst ? 'Sẵn sàng vào thẳng game ngay lập tức (< 1 giây)' : 'Sẵn sàng tải tự động từ máy chủ Mojang khi bấm CHƠI NGAY';
  }
  if (!state.isLaunching && (!state.launchPhase || state.launchPhase === 'idle')) {
    const stEl = document.getElementById('statusText');
    if (stEl) stEl.textContent = `🟢 Sẵn sàng: Minecraft ${ver} (${coreUpper} • ${ram})`;
  }
  const bannerPill = document.getElementById('bannerActivePill');
  if (bannerPill) bannerPill.textContent = `${ver} • ${coreUpper} • ${ram} RAM`;
  const bannerSub = document.getElementById('bannerSubStatus');
  if (bannerSub) bannerSub.textContent = isInst
    ? `Phiên bản Minecraft ${ver} (${coreUpper}) đã cài sẵn trên máy — Bấm CHƠI NGAY để vào thẳng game!`
    : `Phiên bản Minecraft ${ver} (${coreUpper}) sẵn sàng tải tự động từ Mojang khi bấm CHƠI NGAY.`;
  const editionTag = document.getElementById('hbcEditionTag');
  const heroBanner = document.getElementById('heroBanner');
  if (editionTag && heroBanner) {
    let wpUrl = 'https://launchercontent.mojang.com/v2/images/1.21.11540x540.jpg';
    let wpLabelMatch = 'Tricky Trials';
    let eraTitle = '🌲 THE GARDEN AWAKENS & WILDERNESS • 1.21+';
    if (ver.startsWith('26.') || ver.includes('w')) {
      wpUrl = 'https://launchercontent.mojang.com/v2/images/dappledcamp540x540.jpg';
      wpLabelMatch = 'Vibrant Camp';
      eraTitle = '🔥 SNAPSHOT & VIBRANT VISUALS • ' + ver;
    } else if (ver === '1.21.11' || ver === '1.21.10' || ver === '1.21.9') {
      wpUrl = 'https://launchercontent.mojang.com/v2/images/1.21.11540x540.jpg';
      wpLabelMatch = 'Wilderness';
      eraTitle = '🌲 WILDERNESS & PALE GARDEN • ' + ver;
    } else if (ver.startsWith('1.21')) {
      wpUrl = 'https://launchercontent.mojang.com/v2/images/1.21.11540x540.jpg';
      wpLabelMatch = 'Tricky Trials';
      eraTitle = '⚔️ TRICKY TRIALS UPDATE • ' + ver;
    } else if (ver.startsWith('1.20')) {
      wpUrl = 'https://launchercontent.mojang.com/v2/images/MCLauncher700x466.png';
      wpLabelMatch = 'Overworld';
      eraTitle = '🌸 TRAILS & TALES UPDATE • ' + ver;
    } else if (ver.startsWith('1.8') || ver.startsWith('1.12')) {
      wpUrl = 'https://launchercontent.mojang.com/v2/images/dappledcamp540x540.jpg';
      wpLabelMatch = 'Vibrant Camp';
      eraTitle = '⚔️ HUYỀN THOẠI PVP & MODPACK • ' + ver;
    }
    editionTag.textContent = eraTitle;
    heroBanner.style.backgroundImage = `url('${wpUrl}')`;
    document.querySelectorAll('.wp-chip').forEach((w) => w.classList.toggle('active', w.textContent.trim() === wpLabelMatch));
  }
  const javaBadge = document.getElementById('javaReqBadge');
  if (javaBadge) javaBadge.textContent = getRecommendedJavaBadge(ver);
  const storeLabel = document.getElementById('modStoreVerLabel');
  if (storeLabel) storeLabel.textContent = `${ver} (${coreUpper})`;
  const btnModAllVer = document.getElementById('btnToggleModAllVersions');
  if (btnModAllVer) {
    btnModAllVer.classList.toggle('active', !state.modAllVersions);
    btnModAllVer.textContent = state.modAllVersions
      ? `🌐 Mọi phiên bản (Bấm để khớp ${ver})`
      : `🎯 Đang tự khớp: ${ver} (${coreUpper})`;
  }
  if (typeof refreshLocalAddonsCount === 'function') refreshLocalAddonsCount();
  const playerName = state.authMode === 'microsoft' && state.msProfile?.name ? state.msProfile.name : state.username;
  document.getElementById('sidebarPlayerName').textContent = playerName;
  document.getElementById('sidebarAuthBadge').textContent = (state.authMode === 'microsoft' && state.msProfile?.name) ? 'BẢN QUYỀN MS' : 'CRACK / OFFLINE';
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
    hideLauncherOnPlay: state.hideLauncherOnPlay, skinModel: state.skinModel, selectedSkinPreset: state.selectedSkinPreset, cachedSkinDataUrl: state.cachedSkinDataUrl,
    capeType: state.capeType, winResolution: state.winResolution, favoriteServers: state.favoriteServers, acceptedEula: state.acceptedEula, skipLaunchConfirm: state.skipLaunchConfirm
  });
}

function isVersionInstalledOnDisk(verId) {
  return state.installedVersions.some((inst) => inst === verId || inst.endsWith(`-${verId}`) || inst.startsWith(`${verId}-`));
}

async function refreshInstalledVersions() {
  const res = await window.aetherAPI.getInstalledVersions(state.gameDir);
  state.installedVersions = res?.ok && Array.isArray(res.list) ? res.list : [];
  const baseInstalled = state.installedVersions.filter((id) => !/^(fabric-loader|quilt-loader|legacy-fabric-loader|neoforge)-/i.test(id) && !id.toLowerCase().includes('-forge-'));
  const count = baseInstalled.length || state.installedVersions.length;
  const label = document.getElementById('installedCountLabel');
  if (label) label.textContent = count > 0 ? `✓ ${count} bản đã cài trong máy` : '☁ Sẵn sàng tải tự động';
  renderQuickVersionGrid();
}

function renderQuickVersionGrid() {
  const grid = document.getElementById('quickVersionGrid');
  if (!grid) return;
  grid.innerHTML = POPULAR_VERSIONS.map((v) => {
    const installed = isVersionInstalledOnDisk(v), active = state.selectedVersion === v ? 'active' : '';
    return `<button class="qver-chip ${active}" data-qver="${v}"><strong>${v}</strong><span class="qver-status ${installed ? 'ready' : 'cloud'}">${installed ? '✓ Đã cài' : '⬇ Tải về'}</span></button>`;
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
      state.username = chosen; state.selectedSkinPreset = '';
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
  updateSummaryUI();
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
  const grassSrc = document.getElementById('dockGrassImg')?.src || '';
  const q = query.trim().toLowerCase();
  const vf = state.fullVersionFilter || 'all';

  const filtered = state.versions.filter((v) => {
    if (q && !v.id.toLowerCase().includes(q)) return false;
    if (vf === 'installed') return isVersionInstalledOnDisk(v.id);
    if (vf === 'release') return v.type === 'release';
    if (vf === 'snapshot') return v.type === 'snapshot';
    return true;
  });

  const countBadge = document.getElementById('fullVerCountBadge');
  if (countBadge) countBadge.textContent = `${filtered.length} bản`;

  const list = filtered.slice(0, 150);
  if (!list.length) {
    container.innerHTML = `<div style="grid-column:1/-1;padding:32px;text-align:center;color:var(--text-muted);font-weight:700;">Không tìm thấy phiên bản nào khớp với bộ lọc hiện tại.</div>`;
    return;
  }

  container.innerHTML = list.map((v) => {
    const dateStr = v.releaseTime ? new Date(v.releaseTime).toLocaleDateString('vi-VN') : 'Chính thức';
    const inst = isVersionInstalledOnDisk(v.id);
    const displayName = v.id.length > 11 ? v.id : `Minecraft ${v.id}`;
    const badgeClass = inst ? 'installed' : (v.type === 'release' ? 'release' : 'snapshot');
    const badgeLabel = inst ? '✓ Đã cài' : (v.type === 'release' ? 'Release' : (v.type === 'snapshot' ? 'Snapshot' : 'Legacy'));
    return `<div class="ver-row-card ${v.id === state.selectedVersion ? 'active' : ''}" data-ver="${v.id}" title="Minecraft ${v.id} (${dateStr})">
      <div class="ver-card-left">
        ${grassSrc ? `<img src="${grassSrc}" class="ver-card-icon" draggable="false"/>` : ''}
        <div class="ver-card-text">
          <strong class="ver-card-name">${displayName}</strong>
          <div class="ver-card-date">${dateStr}</div>
        </div>
      </div>
      <span class="ver-type-badge ${badgeClass}">${badgeLabel}</span>
    </div>`;
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
    document.getElementById('msProfileName').textContent = `✓ ${state.msProfile.displayName || state.msProfile.name}`;
    const uuidTag = document.getElementById('uuidPreviewTag');
    if (uuidTag && state.msProfile.uuid) uuidTag.textContent = `UUID: ${state.msProfile.uuid.slice(0, 8)}...`;
    update3DNameTag(state.msProfile.name);
    loadCharacterSkin(state.msProfile.name);
  } else if (mode === 'microsoft') {
    document.getElementById('msNotLoggedBox').classList.remove('hidden');
    document.getElementById('msLoggedBox').classList.add('hidden');
    loadCharacterSkin(state.selectedSkinPreset || state.username || 'StevePlayer');
  } else {
    updateCrackUuidPreview(state.username);
    update3DNameTag(state.username);
    loadCharacterSkin(state.selectedSkinPreset || state.username || 'StevePlayer');
  }
  updateSummaryUI(); saveCurrentConfig();
}

function setServerIpEverywhere(ip) {
  state.serverIp = (ip || '').trim();
  const qInput = document.getElementById('quickServerInput'), sInput = document.getElementById('serverIpInput');
  if (qInput) qInput.value = state.serverIp;
  if (sInput) sInput.value = state.serverIp;
  document.querySelectorAll('.srv-pill').forEach((p) => p.classList.toggle('active', p.dataset.srv === state.serverIp));
  if (typeof renderFavoriteServers === 'function') renderFavoriteServers();
  updateSummaryUI(); saveCurrentConfig();
}

function syncBoosterCheckboxes() {
  [['homeAikarCheck', 'aikarFlagsCheck', 'aikarFlags'], ['homeHibernateCheck', 'hideLauncherCheck', 'hideLauncherOnPlay'], ['homeFastSkipCheck', 'fastSkipCheck', 'fastSkipHash']].forEach(([hId, sId, key]) => {
    const hEl = document.getElementById(hId), sEl = document.getElementById(sId);
    if (hEl) hEl.checked = Boolean(state[key]);
    if (sEl) sEl.checked = Boolean(state[key]);
  });
  const advText = document.getElementById('advPerfSummaryText');
  if (advText) {
    const count = [state.aikarFlags, state.hideLauncherOnPlay, state.fastSkipHash].filter(Boolean).length;
    advText.textContent = count > 0 ? `✓ Đang bật ${count}/3 tối ưu` : 'Chế độ tiêu chuẩn';
  }
}

function setLaunchUiState(phase, statusMsg) {
  const btnLaunch = document.getElementById('btnLaunch');
  const launchBtnText = document.getElementById('launchBtnText');
  const btnKill = document.getElementById('btnForceKill');
  const statusEl = document.getElementById('statusText');
  const pctEl = document.getElementById('progressPercent');
  const barEl = document.getElementById('progressBar');
  const trackEl = document.getElementById('dockProgressTrack');

  state.launchPhase = phase;
  if (phase === 'idle') {
    state.isLaunching = false;
    if (btnLaunch) {
      btnLaunch.disabled = false;
      btnLaunch.classList.remove('is-starting', 'is-playing');
    }
    if (launchBtnText) launchBtnText.textContent = '▶ CHƠI NGAY';
    if (btnKill) btnKill.classList.add('hidden');
    if (trackEl) trackEl.classList.add('hidden');
    if (pctEl) pctEl.classList.add('hidden');
    if (statusEl) statusEl.textContent = statusMsg || '🟢 Trạng thái: Sẵn sàng vào game';
  } else if (phase === 'starting') {
    state.isLaunching = true;
    if (btnLaunch) {
      btnLaunch.disabled = true;
      btnLaunch.classList.add('is-starting');
      btnLaunch.classList.remove('is-playing');
    }
    if (launchBtnText) launchBtnText.textContent = '⏳ ĐANG KHỞI ĐỘNG...';
    if (btnKill) {
      btnKill.classList.remove('hidden');
      const sp = btnKill.querySelector('span');
      if (sp) sp.textContent = '✕ HỦY KHỞI ĐỘNG';
    }
    if (trackEl) trackEl.classList.remove('hidden');
    if (pctEl) {
      pctEl.classList.remove('hidden');
      pctEl.textContent = '0%';
    }
    if (barEl) barEl.style.width = '6%';
    if (statusMsg && statusEl) statusEl.textContent = statusMsg;
  } else if (phase === 'playing') {
    state.isLaunching = true;
    if (btnLaunch) {
      btnLaunch.disabled = true;
      btnLaunch.classList.remove('is-starting');
      btnLaunch.classList.add('is-playing');
    }
    if (launchBtnText) launchBtnText.textContent = '🎮 ĐANG TRONG GAME';
    if (btnKill) {
      btnKill.classList.remove('hidden');
      const sp = btnKill.querySelector('span');
      if (sp) sp.textContent = '⏹ DỪNG GAME NGAY';
    }
    if (trackEl) trackEl.classList.add('hidden');
    if (pctEl) pctEl.classList.add('hidden');
    if (statusEl) statusEl.textContent = statusMsg || '🟢 Đang chơi Minecraft — Ngủ đông 0% GPU';
  }
}

function appendLog(line, type = 'normal') {
  const out = document.getElementById('consoleOutput');
  if (!out) return;
  const div = document.createElement('div'); div.className = `log-entry ${type}`; div.textContent = line;
  out.appendChild(div); out.scrollTop = out.scrollHeight;
}


async function checkAndPromptLauncherUpdate(manualClick = false) {
  const updBtnText = document.getElementById('updateBtnText');
  if (manualClick && updBtnText) updBtnText.textContent = '⏳ Đang kiểm tra...';
  const res = await window.aetherAPI.checkForUpdate();
  if (!res?.ok) {
    if (manualClick && updBtnText) {
      updBtnText.textContent = '⚠ Lỗi mạng';
      setTimeout(() => (updBtnText.textContent = '🔄 Cập nhật'), 2000);
    }
    return;
  }

  if (!res.hasUpdate) {
    if (updBtnText) updBtnText.textContent = `✓ v${res.currentVersion}`;
    if (manualClick) {
      await askUserAgreement({
        title: '✓ Launcher Đã Ở Phiên Bản Mới Nhất',
        message: `Bạn đang sử dụng phiên bản mới nhất của Aether Craft Launcher (v${res.currentVersion}). Khi nào có bản mới, Launcher sẽ tự động thông báo ngay lúc mở!`,
        agreeText: 'Đã hiểu',
        cancelText: 'Đóng'
      });
    }
    return;
  }

  if (updBtnText) updBtnText.textContent = `🚀 Cập nhật v${res.latestVersion}!`;
  const ask = await askUserAgreement({
    title: `🚀 Có Bản Cập Nhật Launcher Mới (v${res.latestVersion})!`,
    message: `Phát hiện phiên bản mới v${res.latestVersion} trên GitHub Cloud (bản hiện tại: v${res.currentVersion}). Bấm "Cập Nhật Ngay" để Launcher tự động tải về, tự tắt bản cũ và mở bản mới lên ngay lập tức!`,
    agreeText: '⚡ Cập Nhật Ngay (Tự tắt & Mở mới)',
    cancelText: 'Để sau'
  });

  if (!ask.agreed) return;

  const modal = document.getElementById('userConfirmModal');
  const titleEl = document.getElementById('modalTitleText');
  const bodyEl = document.getElementById('modalBodyText');
  const btnAgree = document.getElementById('btnModalAgree');
  const btnCancel = document.getElementById('btnModalCancel');

  modal.classList.remove('hidden');
  titleEl.textContent = `⏳ Đang Tải Bản Cập Nhật v${res.latestVersion}...`;
  bodyEl.textContent = 'Đang tải gói nâng cấp từ GitHub Cloud (0%)... Sau khi tải xong Launcher sẽ tự tắt và mở lại bản mới!';
  btnAgree.disabled = true;
  btnAgree.textContent = 'Đang cập nhật...';
  btnCancel.classList.add('hidden');

  window.aetherAPI.onUpdateProgress((pct) => {
    bodyEl.textContent = `Đang tải gói nâng cấp từ GitHub Cloud (${pct}%)... Vui lòng đợi vài giây!`;
    btnAgree.textContent = `Đang tải ${pct}%...`;
  });

  const instRes = await window.aetherAPI.installUpdateNow(res.downloadUrl, res.latestVersion);
  if (!instRes?.ok) {
    btnAgree.disabled = false;
    btnCancel.classList.remove('hidden');
    bodyEl.textContent = `Lỗi khi tải bản cập nhật: ${instRes?.error || 'Không xác định'}`;
    btnAgree.textContent = 'Đóng';
    btnAgree.onclick = () => modal.classList.add('hidden');
  }
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
  }
  syncFeaturedServersIntoState();
  saveCurrentConfig();

  document.querySelectorAll('#serverCategoryBar [data-srvcat]').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('#serverCategoryBar [data-srvcat]').forEach((b) => b.classList.toggle('active', b === btn));
      state.serverCategoryFilter = btn.dataset.srvcat || 'all';
      renderFavoriteServers();
    };
  });

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
  refreshLoaderBuilds();

  document.getElementById('btnMin').onclick = () => window.aetherAPI.minimize();
  document.getElementById('btnMax').onclick = () => window.aetherAPI.maximize();
  document.getElementById('btnClose').onclick = () => window.aetherAPI.close();

  document.getElementById('btnTrimRam').onclick = async () => {
    const txt = document.getElementById('ramBoostText'); txt.textContent = 'Đang dọn...';
    const res = await window.aetherAPI.trimRamNow();
    if (res.ok) {
      document.getElementById('ramBadge').textContent = `RAM trống: ${res.freeMemGB}/${sys.totalMemGB} GB`;
      txt.textContent = '✓ Đã dọn!'; setTimeout(() => (txt.textContent = '⚡ Dọn'), 1500);
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
      if (nav.dataset.tab === 'worlds') { renderLocalWorlds(); if (typeof pingAllFavoriteServers === 'function') pingAllFavoriteServers(); }
    };
  });
  document.getElementById('btnGoModStore').onclick = () => document.querySelector('.nav-item[data-tab="mods"]').click();
  const btnBanWorlds = document.getElementById('btnBannerWorlds');
  if (btnBanWorlds) btnBanWorlds.onclick = () => document.querySelector('.nav-item[data-tab="worlds"]').click();
  document.querySelectorAll('#ramPresetBar .ram-pill-btn').forEach((btn) => {
    btn.classList.toggle('active', parseInt(btn.dataset.ram, 10) === state.ramGB);
    btn.onclick = () => {
      state.ramGB = parseInt(btn.dataset.ram, 10);
      ramSlider.value = state.ramGB;
      document.getElementById('ramValueDisplay').textContent = `${state.ramGB} GB`;
      document.querySelectorAll('#ramPresetBar .ram-pill-btn').forEach((b) => b.classList.toggle('active', b === btn));
      updateSummaryUI();
      saveCurrentConfig();
    };
  });
  const btnBanShots = document.getElementById('btnBannerScreenshots');
  if (btnBanShots) btnBanShots.onclick = () => window.aetherAPI.openSubFolder(state.gameDir, 'screenshots');
  const btnOpenMig = document.getElementById('btnOpenMigrateModal');
  if (btnOpenMig && typeof openLauncherMigrateModal === 'function') btnOpenMig.onclick = () => openLauncherMigrateModal();
  const btnQuickVerDir = document.getElementById('btnQuickOpenVersions');
  if (btnQuickVerDir) btnQuickVerDir.onclick = () => window.aetherAPI.openSubFolder(state.gameDir, 'versions');

    const btnElytra = document.getElementById('btnToggleElytra');
  if (btnElytra) {
    btnElytra.onclick = async () => {
      state.backEquipment = state.backEquipment === 'elytra' ? 'cape' : 'elytra';
      if (state.backEquipment === 'elytra' && state.capeType === 'none') state.capeType = 'mojang';
      if (skinViewer?.playerObject) {
        skinViewer.playerObject.rotation.y = state.backEquipment === 'elytra' ? Math.PI * 0.78 : 0;
      }
      await applyCapeToViewer(state.capeType);
      document.getElementById('statusText').textContent = state.backEquipment === 'elytra'
        ? '✓ Đã đeo Cánh cứng Elytra 3D (Xoay lưng 3/4 để xem trọn bộ cánh)!'
        : '✓ Đã chuyển sang chế độ Áo choàng (Cape 3D).';
    };
  }
  let idleGpuTimer = null;
  const scheduleIdleGpuPause = (delayMs = 2200) => {
    if (idleGpuTimer) clearTimeout(idleGpuTimer);
    idleGpuTimer = setTimeout(() => {
      if (skinViewer && !skinViewer.autoRotate && !stageElForGpu?.matches(':hover')) {
        skinViewer.render();
        skinViewer.renderPaused = true;
      }
    }, delayMs);
  };
  const stageElForGpu = document.getElementById('webglStageWrap');
  if (stageElForGpu) {
    stageElForGpu.addEventListener('mouseenter', () => {
      if (idleGpuTimer) clearTimeout(idleGpuTimer);
      if (skinViewer) skinViewer.renderPaused = false;
    });
    stageElForGpu.addEventListener('mouseleave', () => {
      if (skinViewer && !skinViewer.autoRotate) {
        skinViewer.render();
        skinViewer.renderPaused = true;
      }
    });
  }
  window.addEventListener('blur', () => {
    if (skinViewer) {
      skinViewer.render();
      skinViewer.renderPaused = true;
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (skinViewer && document.hidden) {
      skinViewer.renderPaused = true;
    }
  });
  scheduleIdleGpuPause(2500);
  const btnStageFx = document.getElementById('btnStageBgFx');
  const stageWrapEl = document.getElementById('webglStageWrap');
  if (btnStageFx && stageWrapEl) {
    const modes = [
      { id: 'stars', cls: 'stage-bg-stars', label: '✨ Sao Đêm' },
      { id: 'aurora', cls: 'stage-bg-aurora', label: '🌈 Cực Quang' },
      { id: 'daylight', cls: 'stage-bg-daylight', label: '☀️ Ban Ngày' }
    ];
    btnStageFx.onclick = () => {
      const idx = modes.findIndex((m) => m.id === (state.stageBgMode || 'stars'));
      const next = modes[(idx + 1) % modes.length];
      state.stageBgMode = next.id;
      stageWrapEl.classList.remove('stage-bg-stars', 'stage-bg-aurora', 'stage-bg-daylight');
      stageWrapEl.classList.add(next.cls);
      btnStageFx.textContent = next.label;
    };
  }
  const btnOuter = document.getElementById('btnToggleOuterLayer');
  if (btnOuter) {
    btnOuter.onclick = () => {
      state.outerLayerVisible = !state.outerLayerVisible;
      btnOuter.classList.toggle('active', state.outerLayerVisible); btnOuter.textContent = state.outerLayerVisible ? 'Lớp Áo 3D: BẬT' : 'Lớp Áo 3D: TẮT';
      if (skinViewer?.playerObject?.skin) {
        skinViewer.playerObject.skin.setOuterLayerVisible(state.outerLayerVisible);
        skinViewer.render();
      }
    };
  }
  document.querySelectorAll('#winResolutionBar .res-pill-btn').forEach((btn) => {
    const isAct = btn.dataset.res === (state.winResolution || '1280x720');
    btn.classList.toggle('active', isAct);
    if (isAct) {
      const resBadge = document.getElementById('settingsResBadge');
      if (resBadge) resBadge.textContent = btn.textContent;
    }
    btn.onclick = () => {
      state.winResolution = btn.dataset.res;
      document.querySelectorAll('#winResolutionBar .res-pill-btn').forEach((b) => b.classList.toggle('active', b === btn));
      const resBadge = document.getElementById('settingsResBadge');
      if (resBadge) resBadge.textContent = btn.textContent;
      saveCurrentConfig();
    };
  });
  const btnPingAll = document.getElementById('btnPingAllServers');
  if (btnPingAll) btnPingAll.onclick = () => { if (typeof pingAllFavoriteServers === 'function') pingAllFavoriteServers(); };
  document.querySelectorAll('#modQuickCategoryBar .mqt-chip').forEach((chip) => {
    chip.onclick = () => {
      document.querySelectorAll('#modQuickCategoryBar .mqt-chip').forEach((c) => c.classList.toggle('active', c === chip));
      const targetType = chip.dataset.mtype || 'mod';
      state.activeModStoreType = targetType;
      state.modCategory = chip.dataset.mcat || '';
      document.querySelectorAll('.mtype-btn').forEach((b) => b.classList.toggle('active', b.dataset.ptype === targetType));
      const searchIn = document.getElementById('modSearchInput');
      if (searchIn) searchIn.value = chip.dataset.mquery || '';
      loadModrinthStore(false);
    };
  });
  const btnMoreModCats = document.getElementById('btnToggleMoreModCats');
  const moreCatsDrawer = document.getElementById('modMoreCatsDrawer');
  if (btnMoreModCats && moreCatsDrawer) {
    btnMoreModCats.onclick = () => {
      const isHidden = moreCatsDrawer.classList.toggle('hidden');
      btnMoreModCats.classList.toggle('active', !isHidden);
      btnMoreModCats.textContent = isHidden ? '+ Bộ lọc khác (10) ▾' : '▲ Thu gọn bộ lọc';
    };
  }
  document.querySelectorAll('#fullVerFilterBar [data-vfilter]').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('#fullVerFilterBar [data-vfilter]').forEach((b) => b.classList.toggle('active', b === btn));
      state.fullVersionFilter = btn.dataset.vfilter || 'all';
      renderFullVersionTable(document.getElementById('versionSearchInput')?.value || '');
    };
  });
  document.querySelectorAll('#modSortBar [data-msort]').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('#modSortBar [data-msort]').forEach((b) => b.classList.toggle('active', b === btn));
      state.modSortBy = btn.dataset.msort || 'downloads';
      loadModrinthStore(false);
    };
  });
  const btnModAllVer = document.getElementById('btnToggleModAllVersions');
  if (btnModAllVer) {
    btnModAllVer.onclick = () => {
      state.modAllVersions = !state.modAllVersions;
      updateSummaryUI();
      loadModrinthStore(false);
    };
  }
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const info = await window.aetherAPI.getSystemInfo();
      if (info && info.totalMemGB) {
        document.getElementById('ramBadge').textContent = `RAM trống: ${info.freeMemGB}/${info.totalMemGB} GB`;
        const usedPct = Math.max(10, Math.min(95, Math.round(((info.totalMemGB - info.freeMemGB) / info.totalMemGB) * 100)));
        const fillEl = document.getElementById('ramLiveBarFill');
        if (fillEl) fillEl.style.width = `${usedPct}%`;
      }
    } catch (_) {}
  }, 3500);
  const btnRot = document.getElementById('btnToggleRotate');
  if (btnRot) {
    btnRot.onclick = () => {
      if (!skinViewer) return;
      skinViewer.autoRotate = !skinViewer.autoRotate;
      if (skinViewer.autoRotate) skinViewer.renderPaused = false;
      btnRot.classList.toggle('active', skinViewer.autoRotate);
      scheduleIdleGpuPause(2500);
    };
  }
  const btnCam = document.getElementById('btnResetCam');
  if (btnCam) {
    btnCam.onclick = () => {
      if (!skinViewer) return;
      skinViewer.camera.position.set(-14, 11, 42);
      if (skinViewer.playerObject) skinViewer.playerObject.rotation.y = 0;
      skinViewer.renderPaused = false;
      skinViewer.render();
      scheduleIdleGpuPause(2000);
    };
  }
  document.querySelectorAll('#skinPresetBar .skin-preset-chip').forEach((chip) => {
    chip.onclick = () => {
      document.querySelectorAll('#skinPresetBar .skin-preset-chip').forEach((c) => c.classList.toggle('active', c === chip));
      state.selectedSkinPreset = chip.dataset.skinpreset; saveCurrentConfig(); loadCharacterSkin(chip.dataset.skinpreset); document.getElementById('statusText').textContent = '✓ Đã áp dụng Skin 3D (' + chip.textContent + ') — Tự động lưu vào Game khi bấm CHƠI NGAY!';
    };
  });

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
      const normUrl = typeof convertSkinTo64x64DataUrl === 'function'
        ? await convertSkinTo64x64DataUrl(res.dataUrl)
        : res.dataUrl;
      currentSkinDataUrl = normUrl;
      state.cachedSkinDataUrl = normUrl;
      saveCurrentConfig();
      if (skinViewer) {
        try {
          await skinViewer.loadSkin(normUrl, { model: state.skinModel });
          skinViewer.render();
        } catch (_) {}
      }
      draw2DAvatarFace(normUrl);
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
  document.getElementById('loaderVersionSelect').onchange = (e) => { state.selectedLoaderVersion = e.target.value; updateSummaryUI(); saveCurrentConfig(); };
  document.getElementById('versionSearchInput').oninput = (e) => renderFullVersionTable(e.target.value);

  const bFps1 = document.getElementById('btnOneClickFpsBoost'); if (bFps1) bFps1.onclick = (e) => runOneClickFpsBoost(e.currentTarget);
  const bFps2 = document.getElementById('btnStoreFpsBoost'); if (bFps2) bFps2.onclick = (e) => runOneClickFpsBoost(e.currentTarget);

  document.querySelectorAll('.mtype-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.mtype-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeModStoreType = btn.dataset.ptype;
      state.modCategory = '';
      const searchIn = document.getElementById('modSearchInput');
      if (searchIn) searchIn.value = '';
      document.querySelectorAll('#modQuickCategoryBar .mqt-chip').forEach((c, idx) => c.classList.toggle('active', idx === 0 && state.activeModStoreType === 'mod'));
      loadModrinthStore(false);
    };
  });
  document.getElementById('btnSearchModrinth').onclick = () => loadModrinthStore(false);
  document.getElementById('modSearchInput').onkeydown = (e) => { if (e.key === 'Enter') loadModrinthStore(false); };
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

  if (document.getElementById('btnAddServer')) document.getElementById('btnAddServer').onclick = () => {
    const nameEl = document.getElementById('newServerNameInput'), ipEl = document.getElementById('newServerIpInput');
    const name = nameEl.value.trim() || 'Minecraft Server', ip = ipEl.value.trim();
    if (!ip) return;
    state.favoriteServers.unshift({ name, ip }); nameEl.value = ''; ipEl.value = '';
    renderFavoriteServers(); saveCurrentConfig();
  };
  document.getElementById('btnOpenScreenshots').onclick = () => window.aetherAPI.openSubFolder(state.gameDir, 'screenshots');
  if (document.getElementById('btnOpenSavesFolder')) document.getElementById('btnOpenSavesFolder').onclick = () => window.aetherAPI.openSubFolder(state.gameDir, 'saves');
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
    update3DNameTag(state.username); updateCrackUuidPreview(state.username); updateSummaryUI(); saveCurrentConfig();
  };
  document.getElementById('btnReloadSkin').onclick = () => { state.selectedSkinPreset = ''; saveCurrentConfig(); loadCharacterSkin(state.username); renderSavedAccounts(); };
  document.getElementById('btnSaveAccount').onclick = () => {
    const clean = (state.username || 'StevePlayer').trim();
    if (clean && !state.savedAccounts.includes(clean)) { state.savedAccounts.push(clean); renderSavedAccounts(); saveCurrentConfig(); }
  };

  document.getElementById('btnMsLogin').onclick = async () => {
    const btn = document.getElementById('btnMsLogin');
    const stEl = document.getElementById('statusText');
    btn.disabled = true;
    btn.querySelector('span').textContent = '🌐 Đang chờ chọn tài khoản trên Trình duyệt...';
    if (stEl) stEl.textContent = '🌐 Đã mở trình duyệt Web — Hãy bấm chọn tài khoản Microsoft của bạn trên trình duyệt!';
    const res = await window.aetherAPI.loginMicrosoft();
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Đồng Bộ Tài Khoản Microsoft (Trình Duyệt)';
    if (res?.ok && res.profile) {
      state.msProfile = res.profile;
      setAuthModeUI('microsoft');
      saveCurrentConfig();
      if (stEl) stEl.textContent = `✓ Đã đồng bộ tài khoản Microsoft: ${res.profile.displayName || res.profile.name}!`;
    } else if (res?.error) {
      if (stEl) stEl.textContent = `⚠ ${res.error}`;
    }
  };
  document.getElementById('btnMsLogout').onclick = () => {
    state.msProfile = null;
    setAuthModeUI('microsoft');
    saveCurrentConfig();
    const stEl = document.getElementById('statusText');
    if (stEl) stEl.textContent = 'Đã đăng xuất tài khoản Microsoft.';
  };

  document.querySelectorAll('.srv-pill').forEach((pill) => { pill.onclick = () => setServerIpEverywhere(pill.dataset.srv); });
  if (document.getElementById('quickServerInput')) document.getElementById('quickServerInput').oninput = (e) => setServerIpEverywhere(e.target.value);
  if (document.getElementById('serverIpInput')) document.getElementById('serverIpInput').oninput = (e) => setServerIpEverywhere(e.target.value);

  const bindTogglePair = (homeId, setId, key) => {
    const hEl = document.getElementById(homeId), sEl = document.getElementById(setId);
    if (hEl) hEl.onchange = (e) => { state[key] = e.target.checked; if (sEl) sEl.checked = e.target.checked; syncBoosterCheckboxes(); saveCurrentConfig(); };
    if (sEl) sEl.onchange = (e) => { state[key] = e.target.checked; if (hEl) hEl.checked = e.target.checked; syncBoosterCheckboxes(); saveCurrentConfig(); };
  };
  bindTogglePair('homeAikarCheck', 'aikarFlagsCheck', 'aikarFlags');
  bindTogglePair('homeHibernateCheck', 'hideLauncherCheck', 'hideLauncherOnPlay');
  bindTogglePair('homeFastSkipCheck', 'fastSkipCheck', 'fastSkipHash');

  const btnToggleAdv = document.getElementById('btnToggleAdvRam');
  const advRamBody = document.getElementById('homeAdvRamBody');
  const advToggleText = document.getElementById('advToggleBtnText');
  if (btnToggleAdv && advRamBody) {
    btnToggleAdv.onclick = () => {
      const isHidden = advRamBody.classList.toggle('hidden');
      btnToggleAdv.classList.toggle('active', !isHidden);
      if (advToggleText) {
        advToggleText.textContent = isHidden ? '⚙️ Chỉnh RAM & Tối ưu ▾' : '▲ Thu gọn cấu hình';
      }
    };
  }

  document.querySelectorAll('#wardrobeTabNav .wtab-btn').forEach((btn) => {
    btn.onclick = () => {
      const targetTab = btn.dataset.wtab;
      document.querySelectorAll('#wardrobeTabNav .wtab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.wardrobe-toolbar .wtab-panel').forEach((panel) => {
        const match = panel.id === `wtab-${targetTab}`;
        panel.classList.toggle('active', match);
        panel.classList.toggle('hidden', !match);
      });
    };
  });

  document.getElementById('javaPathInput').oninput = (e) => { state.javaPath = e.target.value.trim() || 'java'; saveCurrentConfig(); };
  document.getElementById('gameDirInput').oninput = (e) => { state.gameDir = e.target.value.trim(); saveCurrentConfig(); };
  document.getElementById('crackSkinSyncToggle').onchange = (e) => { state.crackSkinSync = e.target.checked; saveCurrentConfig(); };
  document.getElementById('btnOpenDir').onclick = () => window.aetherAPI.openGameDir(state.gameDir);
  document.getElementById('btnClearConsole').onclick = () => { document.getElementById('consoleOutput').innerHTML = ''; };
  const btnCopyCon = document.getElementById('btnCopyConsole');
  if (btnCopyCon) {
    btnCopyCon.onclick = () => {
      const text = document.getElementById('consoleOutput')?.innerText || '';
      navigator.clipboard?.writeText(text);
      btnCopyCon.textContent = '✓ Đã sao chép!';
      setTimeout(() => (btnCopyCon.textContent = '📋 Sao chép Log'), 1500);
    };
  }
  const btnAutoJava = document.getElementById('btnAutoDetectJava');
  if (btnAutoJava) {
    btnAutoJava.onclick = async () => {
      const info = await window.aetherAPI.getSystemInfo();
      if (info?.detectedJava) {
        state.javaPath = info.detectedJava;
        document.getElementById('javaPathInput').value = state.javaPath;
        saveCurrentConfig();
        btnAutoJava.textContent = '✓ Đã tìm thấy Java!';
        setTimeout(() => (btnAutoJava.textContent = '🔍 Tự Dò Java'), 1600);
      }
    };
  }
  const btnOpenDirSet = document.getElementById('btnOpenGameDirSettings');
  if (btnOpenDirSet) btnOpenDirSet.onclick = () => window.aetherAPI.openGameDir(state.gameDir);
  const btnCopyJava = document.getElementById('btnCopyJavaPath');
  if (btnCopyJava) {
    btnCopyJava.onclick = () => {
      navigator.clipboard?.writeText(state.javaPath || '');
      btnCopyJava.textContent = '✓ Đã chép';
      setTimeout(() => (btnCopyJava.textContent = '📋 Sao chép'), 1400);
    };
  }
  const btnCopyGDir = document.getElementById('btnCopyGameDir');
  if (btnCopyGDir) {
    btnCopyGDir.onclick = () => {
      navigator.clipboard?.writeText(state.gameDir || '');
      btnCopyGDir.textContent = '✓ Đã chép';
      setTimeout(() => (btnCopyGDir.textContent = '📋 Sao chép'), 1400);
    };
  }
  document.querySelectorAll('[data-opensub]').forEach((btn) => {
    btn.onclick = () => window.aetherAPI.openSubFolder(state.gameDir, btn.dataset.opensub);
  });
  const btnSetMig = document.getElementById('btnSettingsMigrate');
  if (btnSetMig && typeof openLauncherMigrateModal === 'function') {
    btnSetMig.onclick = () => openLauncherMigrateModal();
  }
  const btnSnap3D = document.getElementById('btnSnap3DSkin');
  if (btnSnap3D) {
    btnSnap3D.onclick = () => {
      if (!skinViewer) return;
      skinViewer.render();
      const canvas = document.getElementById('skinViewerCanvas');
      if (!canvas) return;
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `AetherCraft-3D-${state.username || 'Skin'}.png`;
      a.click();
      document.getElementById('statusText').textContent = '📸 Đã chụp & tải xuống ảnh Nhân Vật 3D (.PNG nền trong suốt)!';
    };
  }

  document.getElementById('btnForceKill').onclick = async () => {
    await window.aetherAPI.forceKillGame();
    setLaunchUiState('idle', 'Đã dừng Minecraft & giải phóng RAM!');
  };

  document.getElementById('btnLaunch').onclick = async () => {
    if (state.isLaunching) return;
    if (state.authMode === 'microsoft' && !state.msProfile) {
      document.getElementById('statusText').textContent = 'Vui lòng đăng nhập Microsoft trước!'; return;
    }
    const isInstalled = isVersionInstalledOnDisk(state.selectedVersion);
    if (!isInstalled || !state.skipLaunchConfirm) {
      const ask = await askUserAgreement({
        title: isInstalled ? '🚀 Xác Nhận Khởi Chạy Minecraft (Java)' : '📥 Xác Nhận Tải & Khởi Chạy Minecraft',
        message: isInstalled
          ? `Bạn có đồng ý khởi chạy Minecraft ${state.selectedVersion} (${state.selectedCore.toUpperCase()}) với ${state.ramGB} GB RAM ngay bây giờ không?`
          : `Phiên bản Minecraft ${state.selectedVersion} (${state.selectedCore.toUpperCase()}) chưa có trên máy. Bạn có đồng ý tải về và khởi chạy không?`,
        showDontAsk: isInstalled,
        agreeText: '✓ Đồng Ý Chạy Game',
        cancelText: '✕ Hủy bỏ'
      });
      if (!ask.agreed) return;
      if (ask.dontAskAgain) {
        state.skipLaunchConfirm = true;
        saveCurrentConfig();
      }
    }
    setLaunchUiState('starting', `Đang khởi tạo Minecraft ${state.selectedVersion} (${state.selectedCore.toUpperCase()})...`);

    const rawActiveSkin = currentSkinDataUrl || state.cachedSkinDataUrl || createFallbackSteveSkinDataUrl();
    const finalSkinDataUrl = typeof convertSkinTo64x64DataUrl === 'function'
      ? await convertSkinTo64x64DataUrl(rawActiveSkin)
      : rawActiveSkin;

    const res = await window.aetherAPI.launchGame({
      authMode: state.authMode, username: state.username, crackSkinSync: state.crackSkinSync,
      msProfile: state.msProfile, mcVersion: state.selectedVersion, loaderType: state.selectedCore,
      loaderVersion: state.selectedLoaderVersion, ramGB: state.ramGB, javaPath: state.javaPath,
      gameDir: state.gameDir, useAikarFlags: state.aikarFlags, fastSkipHash: state.fastSkipHash,
      hideLauncherOnPlay: state.hideLauncherOnPlay, serverIp: state.serverIp, cpuCores: state.cpuCores,
      skinDataUrl: finalSkinDataUrl, skinModel: state.skinModel, winResolution: state.winResolution
    });

    if (!res.ok) {
      setLaunchUiState('idle', `Lỗi khởi động: ${res.error}`);
      appendLog(`Lỗi khởi động: ${res.error}`, 'error');
    }
  };

  await refreshInstalledVersions();
  if (!state.acceptedEula) {
    const eulaAsk = await askUserAgreement({
      title: '🛡️ Điều Khoản Sử Dụng & Cài Đặt Aether Craft Launcher',
      message: 'Trước khi bắt đầu sử dụng Launcher và tải tài nguyên Minecraft, vui lòng đọc và xác nhận bạn đồng ý với các điều khoản dưới đây:',
      showEula: true,
      agreeText: '✓ Tôi Đồng Ý & Sử Dụng',
      cancelText: '✕ Không Đồng Ý (Thoát)'
    });
    if (!eulaAsk.agreed) {
      window.aetherAPI.close();
      return;
    }
    state.acceptedEula = true;
    saveCurrentConfig();
  }
  await refreshLocalAddonsCount();
  const btnUpd = document.getElementById('btnCheckUpdate'); if (btnUpd) btnUpd.onclick = () => checkAndPromptLauncherUpdate(true);
  setTimeout(() => checkAndPromptLauncherUpdate(false), 1200);
  const verRes = await window.aetherAPI.getVersions();
  if (verRes.ok && verRes.data?.versions?.length) {
    state.versions = verRes.data.versions;
    renderVersionOptions(); await refreshLoaderBuilds();
  }

  window.aetherAPI.onProgress((p) => {
    if (state.launchPhase === 'playing') return;
    document.getElementById('dockProgressTrack')?.classList.remove('hidden');
    document.getElementById('progressPercent')?.classList.remove('hidden');
    document.getElementById('progressPercent').textContent = `${p.percent}%`;
    document.getElementById('progressBar').style.width = `${p.percent}%`;
    document.getElementById('statusText').textContent = `Đang tải (${p.type}): ${p.task}/${p.total}`;
  });
  window.aetherAPI.onStatus((st) => {
    if (state.launchPhase !== 'playing') {
      document.getElementById('statusText').textContent = st;
    }
    appendLog(st, 'info');
  });
  window.aetherAPI.onLog((line) => {
    appendLog(line);
    if (state.launchPhase === 'starting' && (line.includes('LWJGL') || line.includes('OpenAL initialized') || line.includes('Sound engine started') || line.includes('Created: ') || line.includes('Setting user:'))) {
      if (skinViewer) skinViewer.renderPaused = true;
      setLaunchUiState('playing', '🟢 Đang chơi Minecraft — Ngủ đông 0% GPU');
    }
  });
  window.aetherAPI.onGameReady(() => {
    if (skinViewer) skinViewer.renderPaused = true;
    setLaunchUiState('playing', '🟢 Đang chơi Minecraft — Ngủ đông 0% GPU');
  });
  window.aetherAPI.onClose(async (code) => {
    if (skinViewer) skinViewer.renderPaused = false;
    await refreshInstalledVersions();
    updateSummaryUI();
    const exitMsg = (code === 0 || code === null || code === undefined)
      ? 'Đã thoát Minecraft mượt mà (Mã: 0)'
      : `Minecraft đã đóng (Mã: ${code}) — Đã giải phóng RAM`;
    setLaunchUiState('idle', exitMsg);
  });
});