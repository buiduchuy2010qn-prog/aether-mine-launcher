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
  theme: 'lunar',
  versions: [],
  cpuCores: 8,
  isLaunching: false
};

let skinViewer = null;
let skinFetchTimer = null;

function generateClassicSteveSkinDataUrl() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);

  const fill = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };

  fill(8, 0, 8, 8, '#4a3121');
  fill(16, 0, 8, 8, '#9c6e54');
  fill(0, 8, 32, 8, '#b9856a');
  fill(8, 8, 8, 2, '#4a3121');
  fill(8, 10, 1, 1, '#4a3121');
  fill(15, 10, 1, 1, '#4a3121');
  fill(0, 8, 8, 3, '#4a3121');
  fill(16, 8, 8, 3, '#4a3121');
  fill(24, 8, 8, 6, '#4a3121');
  fill(9, 12, 2, 1, '#ffffff');
  fill(13, 12, 2, 1, '#ffffff');
  fill(10, 12, 1, 1, '#4338ca');
  fill(13, 12, 1, 1, '#4338ca');
  fill(11, 13, 2, 1, '#9c6e54');
  fill(10, 14, 4, 1, '#714935');

  fill(20, 16, 8, 4, '#0891b2');
  fill(28, 16, 8, 4, '#0e7490');
  fill(16, 20, 24, 12, '#06b6d4');
  fill(20, 20, 8, 12, '#0891b2');
  fill(22, 20, 4, 2, '#b9856a');

  fill(44, 16, 4, 4, '#0891b2');
  fill(48, 16, 4, 4, '#b9856a');
  fill(40, 20, 16, 4, '#06b6d4');
  fill(40, 24, 16, 8, '#b9856a');

  fill(36, 48, 4, 4, '#0891b2');
  fill(40, 48, 4, 4, '#b9856a');
  fill(32, 52, 16, 4, '#06b6d4');
  fill(32, 56, 16, 8, '#b9856a');

  fill(4, 16, 4, 4, '#3730a3');
  fill(8, 16, 4, 4, '#3f3f46');
  fill(0, 20, 16, 10, '#4338ca');
  fill(0, 30, 16, 2, '#52525b');

  fill(20, 48, 4, 4, '#3730a3');
  fill(24, 48, 4, 4, '#3f3f46');
  fill(16, 52, 16, 10, '#4338ca');
  fill(16, 62, 16, 2, '#52525b');

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

  skinViewer = new window.skinview3d.SkinViewer({
    canvas,
    width: 265,
    height: 290,
    skin: fallbackSkin
  });

  skinViewer.fov = 48;
  skinViewer.zoom = 0.86;
  skinViewer.globalLight.intensity = 2.4;
  skinViewer.cameraLight.intensity = 1.6;
  skinViewer.animation = new window.skinview3d.WalkingAnimation();
  skinViewer.animation.speed = 0.85;

  const wrap = canvas.parentElement;
  if (wrap && window.ResizeObserver) {
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(210, Math.floor(entry.contentRect.width));
        const h = Math.max(210, Math.floor(entry.contentRect.height));
        skinViewer.setSize(w, h);
      }
    });
    ro.observe(wrap);
  }
}

function setSkinPose(poseName) {
  if (!skinViewer || !window.skinview3d) return;
  document.querySelectorAll('.pose-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.pose === poseName);
  });

  if (poseName === 'walk') {
    skinViewer.animation = new window.skinview3d.WalkingAnimation();
    skinViewer.animation.speed = 0.85;
  } else if (poseName === 'run') {
    skinViewer.animation = new window.skinview3d.RunningAnimation();
    skinViewer.animation.speed = 0.9;
  } else if (poseName === 'wave') {
    skinViewer.animation = new window.skinview3d.WaveAnimation();
  } else {
    skinViewer.animation = new window.skinview3d.IdleAnimation();
  }
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
  const valid = ['lunar', 'modrinth', 'feather', 'badlion', 'prism'];
  state.theme = valid.includes(themeName) ? themeName : 'lunar';
  document.documentElement.setAttribute('data-theme', state.theme);
  document.querySelectorAll('.ts-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.themePick === state.theme);
  });
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
  uuidEl.textContent = uuid;
}

function updateSummaryUI() {
  const activeName =
    state.authMode === 'microsoft' && state.msProfile?.name
      ? state.msProfile.name
      : state.username || 'StevePlayer';

  document.getElementById('sidebarPlayerName').textContent = activeName;
  const badge = document.getElementById('sidebarAuthBadge');
  badge.textContent = state.authMode === 'microsoft' && state.msProfile ? 'BẢN QUYỀN MICROSOFT' : 'CRACK / OFFLINE';

  const coreUpper = state.selectedCore.toUpperCase();
  document.getElementById('selectedCoreBadge').textContent = coreUpper;
  document.getElementById('heroActiveBadge').textContent = `${state.selectedVersion} • ${coreUpper} CORE`;

  const authLabel =
    state.authMode === 'microsoft' && state.msProfile
      ? `Microsoft (${state.msProfile.name})`
      : `Crack (${activeName})`;

  const srvText = state.serverIp ? ` • Server: <strong>${state.serverIp}</strong>` : '';
  document.getElementById('launchSummaryText').innerHTML =
    `Tài khoản: <strong>${authLabel}</strong> • Bản: <strong>${state.selectedVersion} (${coreUpper})</strong> • RAM: <strong>${state.ramGB} GB</strong>${srvText}`;
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
    document.getElementById('msProfileName').textContent = state.msProfile.name;
    document.getElementById('msProfileUuid').textContent = `UUID: ${state.msProfile.uuid}`;
    load3DSkinForUsername(state.msProfile.name);
  } else if (state.authMode === 'microsoft') {
    document.getElementById('msNotLoggedBox').classList.remove('hidden');
    document.getElementById('msLoggedBox').classList.add('hidden');
  } else {
    load3DSkinForUsername(state.username);
  }

  updateSummaryUI();
  saveCurrentConfig();
}

function renderVersionOptions() {
  const select = document.getElementById('versionSelect');
  if (!select || !state.versions.length) return;

  const filtered = state.versions.filter((v) => {
    if (state.selectedVersionType === 'release') return v.type === 'release';
    if (state.selectedVersionType === 'snapshot') return v.type === 'snapshot';
    return v.type === 'old_beta' || v.type === 'old_alpha';
  });

  select.innerHTML = '';
  filtered.slice(0, 180).forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `${v.id} (${v.type === 'release' ? 'Chính thức' : v.type})`;
    if (v.id === state.selectedVersion) opt.selected = true;
    select.appendChild(opt);
  });

  if (!filtered.some((v) => v.id === state.selectedVersion) && filtered[0]) {
    state.selectedVersion = filtered[0].id;
    select.value = state.selectedVersion;
  }

  refreshLoaderBuilds();
  updateSummaryUI();
}

async function refreshLoaderBuilds() {
  const group = document.getElementById('loaderBuildGroup');
  const select = document.getElementById('loaderVersionSelect');
  if (state.selectedCore === 'vanilla') {
    group.style.opacity = '0.45';
    select.disabled = true;
    select.innerHTML = '<option value="">Nguyên bản Mojang (Không dùng Loader)</option>';
    state.selectedLoaderVersion = '';
    return;
  }

  group.style.opacity = '1';
  select.disabled = false;
  select.innerHTML = '<option value="">Đang đồng bộ danh sách Core...</option>';

  const res = await window.aetherAPI.getLoaders(state.selectedVersion, state.selectedCore);
  select.innerHTML = '<option value="">Tự động chọn bản ổn định mới nhất</option>';
  if (res.ok && Array.isArray(res.data)) {
    res.data.forEach((b) => {
      const opt = document.createElement('option');
      opt.value = b.version;
      opt.textContent = `${state.selectedCore.toUpperCase()} — ${b.version}${b.stable ? ' (Ổn định)' : ''}`;
      select.appendChild(opt);
    });
  }
}

function selectCoreAndVersion(core, ver, artUrl) {
  if (core) {
    state.selectedCore = core;
    document.querySelectorAll('.core-pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.core === core);
    });
    document.querySelectorAll('.core-detail-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.pickCore === core);
    });
  }

  if (ver) {
    state.selectedVersion = ver;
    const found = state.versions.find((v) => v.id === ver);
    if (found) {
      state.selectedVersionType =
        found.type === 'release' ? 'release' : found.type === 'snapshot' ? 'snapshot' : 'old';
      document.querySelectorAll('.vtype-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.vtype === state.selectedVersionType);
      });
    }
    renderVersionOptions();
  } else {
    refreshLoaderBuilds();
    updateSummaryUI();
  }

  if (artUrl) {
    const hero = document.getElementById('heroBanner');
    if (hero) hero.style.backgroundImage = `url('${artUrl}')`;
  }

  saveCurrentConfig();
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

  document.querySelectorAll('.ts-chip').forEach((chip) => {
    chip.onclick = () => {
      applyTheme(chip.dataset.themePick);
      saveCurrentConfig();
    };
  });

  const saved = await window.aetherAPI.getConfig();
  if (saved) Object.assign(state, saved);
  applyTheme(state.theme);

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
      txt.textContent = 'Đã dọn mượt!';
      setTimeout(() => (txt.textContent = 'Dọn RAM Ngay'), 1500);
    }
  };

  const ramSlider = document.getElementById('ramSlider');
  ramSlider.max = Math.max(4, sys.totalMemGB);
  if (!saved?.ramGB) {
    state.ramGB = Math.min(6, Math.max(3, Math.floor(sys.totalMemGB / 2)));
  }
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

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
    };
  });

  document.querySelectorAll('.pose-btn').forEach((btn) => {
    btn.onclick = () => setSkinPose(btn.dataset.pose);
  });

  document.querySelectorAll('.skin-preset-chip').forEach((chip) => {
    chip.onclick = () => {
      const skinName = chip.dataset.skin;
      if (state.authMode === 'crack') {
        state.username = skinName;
        document.getElementById('usernameInput').value = skinName;
        updateCrackUuidPreview();
        updateSummaryUI();
        saveCurrentConfig();
      }
      load3DSkinForUsername(skinName);
    };
  });

  document.querySelectorAll('.sq-chip').forEach((chip) => {
    chip.onclick = () => {
      document.querySelectorAll('.sq-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.serverIp = chip.dataset.server || '';
      document.getElementById('serverIpInput').value = state.serverIp;
      updateSummaryUI();
      saveCurrentConfig();
    };
  });

  document.getElementById('serverIpInput').oninput = (e) => {
    state.serverIp = e.target.value.trim();
    updateSummaryUI();
    saveCurrentConfig();
  };

  document.querySelectorAll('.wp-chip').forEach((chip) => {
    chip.onclick = () => {
      document.querySelectorAll('.wp-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      document.getElementById('heroBanner').style.backgroundImage = `url('${chip.dataset.wp}')`;
    };
  });

  document.querySelectorAll('.quick-ver-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.quick-ver-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectCoreAndVersion(btn.dataset.quickCore, btn.dataset.quickVer, btn.dataset.art);
    };
  });

  document.querySelectorAll('[data-select-ver]').forEach((card) => {
    card.onclick = () => {
      selectCoreAndVersion(card.dataset.selectCore, card.dataset.selectVer);
      document.querySelector('[data-tab="play"]')?.click();
    };
  });

  document.querySelectorAll('[data-pick-core]').forEach((card) => {
    card.onclick = () => {
      selectCoreAndVersion(card.dataset.pickCore, null);
      document.querySelector('[data-tab="play"]')?.click();
    };
  });

  document.getElementById('tabBtnCrack').onclick = () => setAuthModeUI('crack');
  document.getElementById('tabBtnMicrosoft').onclick = () => setAuthModeUI('microsoft');

  const userInp = document.getElementById('usernameInput');
  userInp.oninput = (e) => {
    state.username = e.target.value.trim() || 'StevePlayer';
    updateCrackUuidPreview();
    updateSummaryUI();
    saveCurrentConfig();
    clearTimeout(skinFetchTimer);
    skinFetchTimer = setTimeout(() => load3DSkinForUsername(state.username), 450);
  };

  document.getElementById('btnReloadSkin').onclick = () => load3DSkinForUsername(state.username);

  document.getElementById('crackSkinSyncToggle').onchange = (e) => {
    state.crackSkinSync = e.target.checked;
    saveCurrentConfig();
  };

  document.getElementById('hideLauncherCheck').onchange = (e) => {
    state.hideLauncherOnPlay = e.target.checked;
    saveCurrentConfig();
  };

  document.getElementById('btnMsLogin').onclick = async () => {
    const btn = document.getElementById('btnMsLogin');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Đang mở cổng Microsoft OAuth2...';
    const res = await window.aetherAPI.loginMicrosoft();
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Đăng Nhập Microsoft OAuth2';

    if (res.ok && res.profile) {
      state.msProfile = res.profile;
      setAuthModeUI('microsoft');
      appendLog(`Đăng nhập Bản Quyền thành công: ${res.profile.name}`, 'info');
    } else if (res.error) {
      appendLog(`Đăng nhập Microsoft: ${res.error}`, 'error');
    }
  };

  document.getElementById('btnMsLogout').onclick = () => {
    state.msProfile = null;
    setAuthModeUI('microsoft');
    saveCurrentConfig();
  };

  document.querySelectorAll('.core-pill').forEach((pill) => {
    pill.onclick = () => selectCoreAndVersion(pill.dataset.core, null);
  });

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
    updateSummaryUI();
    saveCurrentConfig();
  };

  document.getElementById('loaderVersionSelect').onchange = (e) => {
    state.selectedLoaderVersion = e.target.value;
  };

  ramSlider.oninput = (e) => {
    state.ramGB = Number(e.target.value);
    document.getElementById('ramValueDisplay').textContent = `${state.ramGB} GB`;
    updateSummaryUI();
    saveCurrentConfig();
  };

  document.getElementById('javaPathInput').oninput = (e) => {
    state.javaPath = e.target.value.trim() || 'java';
    saveCurrentConfig();
  };

  document.getElementById('gameDirInput').oninput = (e) => {
    state.gameDir = e.target.value.trim();
    saveCurrentConfig();
  };

  document.getElementById('fastSkipCheck').onchange = (e) => {
    state.fastSkipHash = e.target.checked;
    saveCurrentConfig();
  };

  document.getElementById('aikarFlagsCheck').onchange = (e) => {
    state.aikarFlags = e.target.checked;
    saveCurrentConfig();
  };

  document.getElementById('btnOpenDir').onclick = () => window.aetherAPI.openGameDir(state.gameDir);
  document.getElementById('btnClearConsole').onclick = () => {
    document.getElementById('consoleOutput').innerHTML = '';
  };

  document.getElementById('btnForceKill').onclick = async () => {
    await window.aetherAPI.forceKillGame();
    document.getElementById('btnForceKill').classList.add('hidden');
    document.getElementById('statusText').textContent = 'Đã tắt nhanh Minecraft & giải phóng RAM mượt mà!';
  };

  const verRes = await window.aetherAPI.getVersions();
  if (verRes.ok && verRes.data?.versions) {
    state.versions = verRes.data.versions;
    renderVersionOptions();
  }

  window.aetherAPI.onProgress((p) => {
    document.getElementById('progressPercent').textContent = `${p.percent}%`;
    document.getElementById('progressBar').style.width = `${p.percent}%`;
    document.getElementById('statusText').textContent = `Đang tải đa luồng (${p.type}): ${p.task}/${p.total}`;
  });

  window.aetherAPI.onStatus((st) => {
    document.getElementById('statusText').textContent = st;
    appendLog(st, 'info');
  });

  window.aetherAPI.onLog((line) => appendLog(line));

  window.aetherAPI.onGameReady(() => {
    if (skinViewer) skinViewer.renderPaused = true;
    document.getElementById('btnForceKill').classList.remove('hidden');
    document.getElementById('statusText').textContent = 'Minecraft đang chạy (Launcher đã ngủ đông 0% GPU)';
  });

  window.aetherAPI.onClose((code) => {
    state.isLaunching = false;
    if (skinViewer) skinViewer.renderPaused = false;
    document.getElementById('btnForceKill').classList.add('hidden');
    const btn = document.getElementById('btnLaunch');
    btn.disabled = false;
    document.getElementById('launchBtnText').textContent = 'CHƠI NGAY';
    document.getElementById('launchBtnSub').textContent = 'VÀO NHANH • TẮT MƯỢT';
    document.getElementById('statusText').textContent = `Đã đóng Minecraft mượt mà & giải phóng RAM (Mã: ${code})`;
  });

  document.getElementById('btnLaunch').onclick = async () => {
    if (state.isLaunching) return;

    if (state.authMode === 'microsoft' && !state.msProfile) {
      document.getElementById('statusText').textContent = 'Vui lòng đăng nhập Microsoft trước khi vào game!';
      return;
    }

    state.isLaunching = true;
    const btn = document.getElementById('btnLaunch');
    btn.disabled = true;
    document.getElementById('btnForceKill').classList.remove('hidden');
    document.getElementById('launchBtnText').textContent = 'ĐANG CHẠY GAME...';
    document.getElementById('launchBtnSub').textContent = 'SMOOTH-EXIT ACTIVE';

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
      document.getElementById('launchBtnSub').textContent = 'THỬ LẠI';
      document.getElementById('statusText').textContent = `Lỗi: ${res.error}`;
      appendLog(`Lỗi khởi động: ${res.error}`, 'error');
    }
  };
});