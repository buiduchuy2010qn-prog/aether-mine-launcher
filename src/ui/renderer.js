const CURATED_FPS_MODS = [
  {
    slug: 'fabric-api',
    title: 'Fabric API (Bắt buộc)',
    icon: '🧩',
    tag: 'Thư viện lõi',
    desc: 'Thư viện cốt lõi bắt buộc phải có cho hầu hết các Mod trên nền tảng Fabric / Quilt.'
  },
  {
    slug: 'sodium',
    title: 'Sodium (Siêu Tăng FPS)',
    icon: '⚡',
    tag: '+300% FPS',
    desc: 'Thay thế bộ dựng hình của Minecraft, tăng gấp 3-4 lần FPS và xóa hoàn toàn giật lag.'
  },
  {
    slug: 'lithium',
    title: 'Lithium (Tối Ưu Logic)',
    icon: '🔋',
    tag: 'Giảm tải CPU',
    desc: 'Tối ưu hóa vật lý, AI quái vật và tải Chunk mà không làm thay đổi cơ chế gốc của game.'
  },
  {
    slug: 'customskinloader',
    title: 'CustomSkinLoader (Skin Crack)',
    icon: '👕',
    tag: 'Hiện Skin Offline',
    desc: 'Giúp tài khoản Offline (Crack) tự động hiển thị Skin & Áo choàng theo tên hoặc file .png tải lên!'
  },
  {
    slug: 'ferrite-core',
    title: 'FerriteCore (Giảm 45% RAM)',
    icon: '🧠',
    tag: 'Siêu nhẹ RAM',
    desc: 'Giảm gần một nửa lượng bộ nhớ RAM tiêu thụ của Minecraft, cực tốt cho máy yếu hoặc nhiều mod.'
  },
  {
    slug: 'entityculling',
    title: 'EntityCulling',
    icon: '👁️',
    tag: 'Bỏ vẽ vật khuất',
    desc: 'Không dựng hình các thực thể/rương/quái vật nằm sau tường mà người chơi không nhìn thấy.'
  },
  {
    slug: 'iris',
    title: 'Iris Shaders',
    icon: '✨',
    tag: 'Chạy Shader mượt',
    desc: 'Hỗ trợ cài đặt mọi gói Shader đẹp lung linh kết hợp hoàn hảo với Sodium.'
  },
  {
    slug: 'modmenu',
    title: 'Mod Menu',
    icon: '📋',
    tag: 'Quản lý Mod',
    desc: 'Thêm nút danh sách Mod và chỉnh cài đặt từng Mod ngay trong màn hình chính của game.'
  }
];

let appState = {
  config: null,
  allVersions: [],
  localMods: [],
  systemInfo: null,
  isLaunching: false,
  rotY: -28,
  rotX: -12
};

const els = {
  btnMinimize: document.getElementById('btnMinimize'),
  btnMaximize: document.getElementById('btnMaximize'),
  btnClose: document.getElementById('btnClose'),
  btnToggleTheme: document.getElementById('btnToggleTheme'),
  topRamBadge: document.getElementById('topRamBadge'),
  topLoaderBadge: document.getElementById('topLoaderBadge'),
  sidebarHeadCanvas: document.getElementById('sidebarHeadCanvas'),
  sidebarUsername: document.getElementById('sidebarUsername'),
  sidebarModeDot: document.getElementById('sidebarModeDot'),
  sidebarModeText: document.getElementById('sidebarModeText'),
  heroVersionBadge: document.getElementById('heroVersionBadge'),
  voxelStage: document.getElementById('voxelStage'),
  voxelScene: document.getElementById('voxelScene'),
  mcPlayerRig: document.getElementById('mcPlayerRig'),
  stageNametag: document.getElementById('stageNametag'),
  btnUploadSkin: document.getElementById('btnUploadSkin'),
  authCardStatusTag: document.getElementById('authCardStatusTag'),
  tabBtnOffline: document.getElementById('tabBtnOffline'),
  tabBtnMicrosoft: document.getElementById('tabBtnMicrosoft'),
  offlineAuthView: document.getElementById('offlineAuthView'),
  microsoftAuthView: document.getElementById('microsoftAuthView'),
  msLoggedOutBox: document.getElementById('msLoggedOutBox'),
  msLoggedInBox: document.getElementById('msLoggedInBox'),
  btnLoginMicrosoft: document.getElementById('btnLoginMicrosoft'),
  msAccountName: document.getElementById('msAccountName'),
  msAccountUuid: document.getElementById('msAccountUuid'),
  btnRefreshMicrosoft: document.getElementById('btnRefreshMicrosoft'),
  btnLogoutMicrosoft: document.getElementById('btnLogoutMicrosoft'),
  usernameInput: document.getElementById('usernameInput'),
  btnSaveUsername: document.getElementById('btnSaveUsername'),
  offlineUuidText: document.getElementById('offlineUuidText'),
  btnCopyUuid: document.getElementById('btnCopyUuid'),
  savedProfilesList: document.getElementById('savedProfilesList'),
  versionInstalledStatus: document.getElementById('versionInstalledStatus'),
  chkShowSnapshots: document.getElementById('chkShowSnapshots'),
  versionSearchInput: document.getElementById('versionSearchInput'),
  versionSelect: document.getElementById('versionSelect'),
  storeTargetBadge: document.getElementById('storeTargetBadge'),
  btnInstallFpsBundle: document.getElementById('btnInstallFpsBundle'),
  curatedModsGrid: document.getElementById('curatedModsGrid'),
  modrinthSearchInput: document.getElementById('modrinthSearchInput'),
  btnSearchModrinth: document.getElementById('btnSearchModrinth'),
  modrinthResultsGrid: document.getElementById('modrinthResultsGrid'),
  localModsCountBadge: document.getElementById('localModsCountBadge'),
  localModsSummaryTag: document.getElementById('localModsSummaryTag'),
  localModsContainer: document.getElementById('localModsContainer'),
  btnRefreshMods: document.getElementById('btnRefreshMods'),
  sysHardwareSummary: document.getElementById('sysHardwareSummary'),
  ramValueDisplay: document.getElementById('ramValueDisplay'),
  ramSlider: document.getElementById('ramSlider'),
  chkFpsBoostJvm: document.getElementById('chkFpsBoostJvm'),
  chkFullscreen: document.getElementById('chkFullscreen'),
  chkHideLauncher: document.getElementById('chkHideLauncher'),
  javaRuntimesList: document.getElementById('javaRuntimesList'),
  gameDirInput: document.getElementById('gameDirInput'),
  btnPickGameDir: document.getElementById('btnPickGameDir'),
  customJavaInput: document.getElementById('customJavaInput'),
  btnPickJava: document.getElementById('btnPickJava'),
  btnClearJava: document.getElementById('btnClearJava'),
  consoleOutput: document.getElementById('consoleOutput'),
  btnCopyLogs: document.getElementById('btnCopyLogs'),
  btnClearLogs: document.getElementById('btnClearLogs'),
  statusStageBadge: document.getElementById('statusStageBadge'),
  statusMessageText: document.getElementById('statusMessageText'),
  statusPercentText: document.getElementById('statusPercentText'),
  progressBarFill: document.getElementById('progressBarFill'),
  btnLaunchGame: document.getElementById('btnLaunchGame'),
  btnStopGame: document.getElementById('btnStopGame'),
  launchBtnSub: document.getElementById('launchBtnSub')
};

/**
 * Generate a crisp default 64x64 Steve Skin Canvas (instant offline fallback!)
 */
function createDefaultSteveSkinCanvas() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');

  // Skin base (Head)
  ctx.fillStyle = '#d29d74';
  ctx.fillRect(0, 0, 32, 16);

  // Hair (Top, Back, Sides, Front bangs)
  ctx.fillStyle = '#4a3121';
  ctx.fillRect(8, 0, 8, 8);   // Top
  ctx.fillRect(24, 8, 8, 8);  // Back
  ctx.fillRect(0, 8, 8, 3);   // Right side top
  ctx.fillRect(16, 8, 8, 3);  // Left side top
  ctx.fillRect(8, 8, 8, 2);   // Forehead hair
  ctx.fillRect(8, 10, 1, 1);
  ctx.fillRect(15, 10, 1, 1);

  // Eyes (White + Indigo pupils)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(9, 12, 2, 1);
  ctx.fillRect(13, 12, 2, 1);
  ctx.fillStyle = '#4338ca';
  ctx.fillRect(10, 12, 1, 1);
  ctx.fillRect(13, 12, 1, 1);

  // Nose & Mouth
  ctx.fillStyle = '#b47b56';
  ctx.fillRect(11, 13, 2, 1);
  ctx.fillStyle = '#7c472b';
  ctx.fillRect(10, 14, 4, 1);

  // Torso (Cyan Steve Shirt)
  ctx.fillStyle = '#06b6d4';
  ctx.fillRect(16, 16, 24, 16);
  ctx.fillStyle = '#0891b2';
  ctx.fillRect(20, 20, 8, 12);
  // Neck V
  ctx.fillStyle = '#d29d74';
  ctx.fillRect(22, 20, 4, 2);

  // Right & Left Arms (Cyan sleeve + skin arm)
  const paintArm = (ox, oy) => {
    ctx.fillStyle = '#d29d74';
    ctx.fillRect(ox, oy, 16, 16);
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(ox, oy + 4, 16, 4);
  };
  paintArm(40, 16);
  paintArm(32, 48);

  // Right & Left Legs (Blue Jeans + Gray Shoes)
  const paintLeg = (ox, oy) => {
    ctx.fillStyle = '#3b429f';
    ctx.fillRect(ox, oy, 16, 16);
    ctx.fillStyle = '#475569';
    ctx.fillRect(ox, oy + 14, 16, 2);
  };
  paintLeg(0, 16);
  paintLeg(16, 48);

  return c;
}

/**
 * Slice a 64x64 (or 64x32 legacy) Minecraft Skin image onto all 3D Voxel Rig faces + Sidebar Head
 */
function applySkinSourceTo3DRig(imgSource) {
  const isLegacy64x32 = imgSource.height === 32;
  const faces = els.mcPlayerRig.querySelectorAll('canvas.face');

  faces.forEach(canvas => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    const uvAttr = (isLegacy64x32 && canvas.dataset.fallbackUv) ? canvas.dataset.fallbackUv : canvas.dataset.uv;
    if (!uvAttr) return;
    const [sx, sy, sw, sh] = uvAttr.split(',').map(Number);
    if (sy + sh > imgSource.height) return;

    ctx.drawImage(imgSource, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  });

  // Also paint 2D Head + Hat on Sidebar mini-avatar
  const headCtx = els.sidebarHeadCanvas.getContext('2d');
  headCtx.clearRect(0, 0, 40, 40);
  headCtx.imageSmoothingEnabled = false;
  headCtx.drawImage(imgSource, 8, 8, 8, 8, 0, 0, 40, 40);
  headCtx.drawImage(imgSource, 40, 8, 8, 8, 0, 0, 40, 40);
}

function loadPlayerSkin3D(username, customDataUrl = '') {
  const cleanName = (username || 'Steve').trim() || 'Steve';
  els.stageNametag.textContent = cleanName;

  if (customDataUrl) {
    const img = new Image();
    img.onload = () => applySkinSourceTo3DRig(img);
    img.src = customDataUrl;
    return;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => applySkinSourceTo3DRig(img);
  img.onerror = () => {
    const fallbackImg = new Image();
    fallbackImg.crossOrigin = 'anonymous';
    fallbackImg.onload = () => applySkinSourceTo3DRig(fallbackImg);
    fallbackImg.onerror = () => applySkinSourceTo3DRig(createDefaultSteveSkinCanvas());
    fallbackImg.src = `https://mc-heads.net/skin/${encodeURIComponent(cleanName)}`;
  };
  img.src = `https://minotar.net/skin/${encodeURIComponent(cleanName)}`;
}

function init3DStageRotation() {
  // Render Steve immediately before network finishes
  applySkinSourceTo3DRig(createDefaultSteveSkinCanvas());

  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  els.voxelStage.addEventListener('mousedown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    appState.rotY += dx * 0.85;
    appState.rotX = Math.max(-45, Math.min(35, appState.rotX - dy * 0.5));
    els.voxelScene.style.transform = `rotateX(${appState.rotX}deg) rotateY(${appState.rotY}deg)`;
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
  });

  // Pose buttons
  document.querySelectorAll('.pose-btn[data-pose]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pose-btn[data-pose]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      els.mcPlayerRig.className = `mc-player-rig ${btn.dataset.pose}`;
    });
  });

  // Custom .png skin upload
  els.btnUploadSkin.addEventListener('click', async () => {
    const dataUrl = await window.launcherAPI.pickSkinFile();
    if (dataUrl) {
      appState.config.customSkinDataUrl = dataUrl;
      loadPlayerSkin3D(els.usernameInput.value, dataUrl);
      appendLog('[Aether] Đã áp dụng file Skin .png mới lên Nhân vật 3D và lưu vào CustomSkinLoader!');
    }
  });
}

function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  els.btnToggleTheme.textContent = t === 'light' ? '☀️ Giao Diện Sáng' : '🌙 Giao Diện Tối';
}

function appendLog(line) {
  if (!line) return;
  const div = document.createElement('div');
  div.className = 'log-line';
  if (line.includes('[Aether]') || line.includes('[Microsoft Auth]')) div.classList.add('log-aether');
  else if (line.includes('[LỖI]') || line.toLowerCase().includes('error') || line.toLowerCase().includes('exception')) div.classList.add('log-error');
  else if (line.includes('[Modrinth]')) div.classList.add('log-modrinth');
  div.textContent = line;
  els.consoleOutput.appendChild(div);
  els.consoleOutput.scrollTop = els.consoleOutput.scrollHeight;
}

function updateStatusBar({ stage = 'idle', message = '', percent = 0 }) {
  const stageLabels = {
    idle: 'SẴN SÀNG',
    init: 'KHỞI TẠO',
    java: 'TẢI JAVA',
    loader: 'CÀI CORE',
    download: 'TẢI DỮ LIỆU',
    'mod-download': 'TẢI MOD',
    launching: 'ĐANG CHẠY GAME',
    error: 'GẶP LỖI'
  };
  els.statusStageBadge.textContent = stageLabels[stage] || stage.toUpperCase();
  if (message) els.statusMessageText.textContent = message;
  const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
  els.statusPercentText.textContent = `${pct}%`;
  els.progressBarFill.style.width = `${pct}%`;
}

function syncAuthAndBadgesUI() {
  const cfg = appState.config;
  if (!cfg) return;

  const isMsMode = cfg.authMode === 'microsoft';
  const loaderUpper = (cfg.loader || 'fabric').toUpperCase();

  els.tabBtnOffline.classList.toggle('active', !isMsMode);
  els.tabBtnMicrosoft.classList.toggle('active', isMsMode);
  els.offlineAuthView.style.display = isMsMode ? 'none' : 'block';
  els.microsoftAuthView.style.display = isMsMode ? 'block' : 'none';

  const msAcc = cfg.msAccount;
  if (msAcc && msAcc.name) {
    els.msLoggedOutBox.style.display = 'none';
    els.msLoggedInBox.style.display = 'block';
    els.msAccountName.textContent = msAcc.name;
    els.msAccountUuid.textContent = msAcc.uuid;
  } else {
    els.msLoggedOutBox.style.display = 'block';
    els.msLoggedInBox.style.display = 'none';
  }

  const activePlayerName = (isMsMode && msAcc?.name) ? msAcc.name : (cfg.username || 'Steve');
  els.sidebarUsername.textContent = activePlayerName;
  loadPlayerSkin3D(activePlayerName, isMsMode ? '' : cfg.customSkinDataUrl);

  if (isMsMode) {
    els.authCardStatusTag.textContent = msAcc?.name ? '✓ Bản Quyền MS' : 'Chưa đăng nhập MS';
    els.sidebarModeText.textContent = msAcc?.name ? 'Bản Quyền (MSA)' : 'Chờ đăng nhập MS';
    els.sidebarModeDot.style.background = '#0284c7';
  } else {
    els.authCardStatusTag.textContent = 'Offline (Crack)';
    els.sidebarModeText.textContent = 'Offline (Crack)';
    els.sidebarModeDot.style.background = '#16a34a';
  }

  const modeShort = isMsMode ? 'BẢN QUYỀN' : 'OFFLINE';
  els.topRamBadge.textContent = `RAM: ${cfg.ramMb} MB`;
  els.topLoaderBadge.textContent = `${loaderUpper} • ${cfg.mcVersion}`;
  els.heroVersionBadge.textContent = `MINECRAFT ${cfg.mcVersion}`;
  els.launchBtnSub.textContent = `${loaderUpper} • ${cfg.mcVersion} • ${modeShort}`;
  els.storeTargetBadge.textContent = `Minecraft ${cfg.mcVersion} (${loaderUpper})`;

  document.querySelectorAll('.core-card').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.loader === cfg.loader);
  });

  document.querySelectorAll('.era-card').forEach(card => {
    card.classList.toggle('active', card.dataset.ver === cfg.mcVersion);
  });

  const verObj = appState.allVersions.find(v => v.id === cfg.mcVersion);
  if (verObj && verObj.installed) {
    els.versionInstalledStatus.textContent = '✓ Đã tải sẵn';
  } else {
    els.versionInstalledStatus.textContent = '☁ Tự tải khi bấm Chơi';
  }
}

function updateOfflineProfileUI(username, uuid) {
  const clean = (username || 'Steve').trim() || 'Steve';
  els.usernameInput.value = clean;
  els.offlineUuidText.textContent = uuid;

  const profiles = appState.config?.savedProfiles || [clean];
  els.savedProfilesList.innerHTML = '';
  profiles.forEach(prof => {
    const btn = document.createElement('button');
    btn.className = `profile-chip ${prof === clean ? 'active' : ''}`;
    btn.textContent = prof;
    btn.addEventListener('click', async () => {
      const updated = await window.launcherAPI.saveConfig({ username: prof, authMode: 'offline', customSkinDataUrl: '' });
      appState.config = updated;
      updateOfflineProfileUI(updated.username, updated.uuid);
      syncAuthAndBadgesUI();
    });
    els.savedProfilesList.appendChild(btn);
  });
}

function renderVersionDropdown() {
  const showSnapshots = els.chkShowSnapshots.checked;
  const search = (els.versionSearchInput.value || '').trim().toLowerCase();
  const currentVer = appState.config?.mcVersion || '1.20.4';

  const filtered = appState.allVersions.filter(v => {
    if (!showSnapshots && v.type !== 'release') return false;
    if (search && !v.id.toLowerCase().includes(search)) return false;
    return true;
  });

  els.versionSelect.innerHTML = '';
  filtered.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    const tag = v.installed ? ' [Đã tải]' : '';
    const typeTag = v.type !== 'release' ? ` (${v.type})` : '';
    opt.textContent = `Minecraft ${v.id}${typeTag}${tag}`;
    if (v.id === currentVer) opt.selected = true;
    els.versionSelect.appendChild(opt);
  });

  if (!filtered.some(v => v.id === currentVer) && !search) {
    const opt = document.createElement('option');
    opt.value = currentVer;
    opt.textContent = `Minecraft ${currentVer}`;
    opt.selected = true;
    els.versionSelect.prepend(opt);
  }
}

function renderJavaRuntimes() {
  const sys = appState.systemInfo;
  if (!sys) return;

  const descriptions = {
    8: 'Dùng cho bản 1.8.9 → 1.16.5',
    17: 'Dùng cho bản 1.17 → 1.20.4',
    21: 'Dùng cho bản 1.20.5 → 1.21.4+',
    25: 'Dùng cho bản mới 26.x+'
  };

  els.javaRuntimesList.innerHTML = '';
  [8, 17, 21, 25].forEach(major => {
    const info = sys.runtimes?.[major] || { installed: false };
    const card = document.createElement('div');
    card.className = 'java-item';
    card.innerHTML = `
      <div>
        <div class="java-title">☕ Java ${major} (64-bit)</div>
        <div class="java-sub">${descriptions[major]}</div>
      </div>
      <div>
        ${info.installed
          ? `<span class="mc-badge mc-badge-green">✓ Đã Cài</span>`
          : `<button class="btn-secondary btn-install-java" data-major="${major}">⬇ Tải Ngay</button>`
        }
      </div>
    `;
    els.javaRuntimesList.appendChild(card);
  });

  els.javaRuntimesList.querySelectorAll('.btn-install-java').forEach(btn => {
    btn.addEventListener('click', async () => {
      const major = Number(btn.dataset.major);
      btn.disabled = true;
      btn.textContent = 'Đang tải...';
      try {
        const res = await window.launcherAPI.installJava(major);
        if (res.ok) {
          appState.systemInfo.runtimes = res.runtimes;
          renderJavaRuntimes();
          appendLog(`[Aether] Cài đặt thành công Java ${major}: ${res.javaPath}`);
        }
      } catch (err) {
        appendLog(`[LỖI] Tải Java ${major} thất bại: ${err.message}`);
        btn.disabled = false;
        btn.textContent = 'Thử lại';
      }
    });
  });
}

async function refreshLocalMods() {
  const mods = await window.launcherAPI.listLocalMods();
  appState.localMods = mods;
  els.localModsCountBadge.textContent = mods.length;
  els.localModsSummaryTag.textContent = `${mods.length} file mod`;

  els.localModsContainer.innerHTML = '';
  if (mods.length === 0) {
    els.localModsContainer.innerHTML = `
      <div style="text-align:center; padding: 26px; color: var(--text-dim); font-size: 13px;">
        Chưa có bản Mod nào trong thư mục <code>mods/</code>.<br/>
        Hãy qua tab <strong>⚡ Kho Mod &amp; FPS</strong> để cài đặt Sodium &amp; CustomSkinLoader chỉ với 1 cú nhấp chuột!
      </div>
    `;
  } else {
    mods.forEach(m => {
      const row = document.createElement('div');
      row.className = 'local-mod-row';
      row.innerHTML = `
        <div class="local-mod-info">
          <span style="font-size:16px;">${m.enabled ? '🟢' : '⚪'}</span>
          <div>
            <div class="local-mod-name">${m.displayName}</div>
            <div class="local-mod-size">${m.fileName} • ${m.sizeKb} KB</div>
          </div>
        </div>
        <div class="local-mod-actions">
          <button class="btn-secondary btn-toggle-mod" data-file="${m.fileName}">
            ${m.enabled ? 'Tắt Mod' : 'Bật Mod'}
          </button>
          <button class="btn-secondary btn-del-mod" data-file="${m.fileName}" style="color:#ef4444;">
            🗑️ Xóa
          </button>
        </div>
      `;
      els.localModsContainer.appendChild(row);
    });

    els.localModsContainer.querySelectorAll('.btn-toggle-mod').forEach(btn => {
      btn.addEventListener('click', async () => {
        await window.launcherAPI.toggleLocalMod(btn.dataset.file);
        await refreshLocalMods();
        renderCuratedMods();
      });
    });

    els.localModsContainer.querySelectorAll('.btn-del-mod').forEach(btn => {
      btn.addEventListener('click', async () => {
        await window.launcherAPI.deleteLocalMod(btn.dataset.file);
        await refreshLocalMods();
        renderCuratedMods();
      });
    });
  }
}

function isSlugInstalled(slug) {
  const norm = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
  return appState.localMods.some(m => m.fileName.toLowerCase().replace(/[^a-z0-9]/g, '').includes(norm));
}

function renderCuratedMods() {
  els.curatedModsGrid.innerHTML = '';
  CURATED_FPS_MODS.forEach(mod => {
    const installed = isSlugInstalled(mod.slug);
    const card = document.createElement('div');
    card.className = 'mod-card';
    card.innerHTML = `
      <div class="mod-card-top">
        <div class="mod-icon">${mod.icon}</div>
        <div>
          <div class="mod-title">${mod.title}</div>
          <div class="mod-desc">${mod.desc}</div>
        </div>
      </div>
      <div class="mod-card-footer">
        <span class="mod-tag">${mod.tag}</span>
        <button class="btn-primary btn-install-curated" data-slug="${mod.slug}" ${installed ? 'style="background:#0284c7;"' : ''}>
          ${installed ? '✓ Đã Cài (Cài Lại)' : '⬇ Cài Đặt'}
        </button>
      </div>
    `;
    els.curatedModsGrid.appendChild(card);
  });

  els.curatedModsGrid.querySelectorAll('.btn-install-curated').forEach(btn => {
    btn.addEventListener('click', async () => {
      await installSingleModrinthMod(btn.dataset.slug, btn);
    });
  });
}

async function installSingleModrinthMod(slugOrId, buttonEl) {
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = 'Đang tải...';
  }
  try {
    if (appState.config.loader === 'vanilla') {
      appState.config = await window.launcherAPI.saveConfig({ loader: 'fabric' });
      syncAuthAndBadgesUI();
      appendLog('[Aether] Đã tự động chuyển Core sang FABRIC để chạy Mod.');
    }
    const res = await window.launcherAPI.installModrinthMod({
      slugOrId,
      mcVersion: appState.config.mcVersion,
      loader: appState.config.loader
    });
    if (res.ok) {
      await refreshLocalMods();
      renderCuratedMods();
      if (buttonEl) {
        buttonEl.textContent = '✓ Đã Cài';
        buttonEl.disabled = false;
      }
    }
  } catch (err) {
    appendLog(`[LỖI Modrinth]: ${err.message}`);
    updateStatusBar({ stage: 'error', message: err.message, percent: 0 });
    if (buttonEl) {
      buttonEl.textContent = 'Lỗi (Thử lại)';
      buttonEl.disabled = false;
    }
  }
}

async function searchModrinthMods() {
  const query = els.modrinthSearchInput.value.trim();
  els.btnSearchModrinth.disabled = true;
  els.btnSearchModrinth.textContent = 'Đang tìm...';
  els.modrinthResultsGrid.innerHTML = `<div style="color:var(--text-muted); font-size:13px;">Đang tìm kiếm trên Modrinth cho bản ${appState.config.mcVersion}...</div>`;

  try {
    const hits = await window.launcherAPI.searchModrinth({
      query,
      mcVersion: appState.config.mcVersion,
      loader: appState.config.loader
    });
    els.modrinthResultsGrid.innerHTML = '';
    if (hits.length === 0) {
      els.modrinthResultsGrid.innerHTML = `<div style="color:var(--text-dim); font-size:13px;">Không tìm thấy bản Mod nào khớp với từ khóa cho phiên bản ${appState.config.mcVersion}.</div>`;
    } else {
      hits.forEach(h => {
        const card = document.createElement('div');
        card.className = 'mod-card';
        card.innerHTML = `
          <div class="mod-card-top">
            ${h.iconUrl ? `<img class="mod-icon" src="${h.iconUrl}" alt="" />` : `<div class="mod-icon">🧩</div>`}
            <div>
              <div class="mod-title">${h.title}</div>
              <div class="mod-desc">${h.description || ''}</div>
            </div>
          </div>
          <div class="mod-card-footer">
            <span class="mod-tag">⬇ ${(h.downloads || 0).toLocaleString()} lượt tải</span>
            <button class="btn-primary btn-install-search" data-slug="${h.slug}">⬇ Tải Mod</button>
          </div>
        `;
        els.modrinthResultsGrid.appendChild(card);
      });

      els.modrinthResultsGrid.querySelectorAll('.btn-install-search').forEach(btn => {
        btn.addEventListener('click', () => installSingleModrinthMod(btn.dataset.slug, btn));
      });
    }
  } catch (err) {
    els.modrinthResultsGrid.innerHTML = `<div style="color:#ef4444; font-size:13px;">Lỗi khi tìm kiếm: ${err.message}</div>`;
  } finally {
    els.btnSearchModrinth.disabled = false;
    els.btnSearchModrinth.textContent = 'Tìm Kiếm Mod';
  }
}

async function initApp() {
  init3DStageRotation();

  els.btnMinimize.addEventListener('click', () => window.launcherAPI.minimizeWindow());
  els.btnMaximize.addEventListener('click', () => window.launcherAPI.maximizeWindow());
  els.btnClose.addEventListener('click', () => window.launcherAPI.closeWindow());

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  appState.config = await window.launcherAPI.getConfig();
  appState.systemInfo = await window.launcherAPI.getSystemInfo();

  applyTheme(appState.config.theme || 'light');
  els.btnToggleTheme.addEventListener('click', async () => {
    const nextTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
    appState.config = await window.launcherAPI.saveConfig({ theme: nextTheme });
  });

  updateOfflineProfileUI(appState.config.username, appState.config.uuid);
  syncAuthAndBadgesUI();

  // Dual-Auth Mode Switching
  els.tabBtnOffline.addEventListener('click', async () => {
    appState.config = await window.launcherAPI.saveConfig({ authMode: 'offline' });
    syncAuthAndBadgesUI();
  });

  els.tabBtnMicrosoft.addEventListener('click', async () => {
    appState.config = await window.launcherAPI.saveConfig({ authMode: 'microsoft' });
    syncAuthAndBadgesUI();
  });

  els.btnLoginMicrosoft.addEventListener('click', async () => {
    els.btnLoginMicrosoft.disabled = true;
    els.btnLoginMicrosoft.querySelector('span').textContent = 'Đang chờ đăng nhập Microsoft...';
    const res = await window.launcherAPI.loginMicrosoft();
    els.btnLoginMicrosoft.disabled = false;
    els.btnLoginMicrosoft.querySelector('span').textContent = 'Đăng Nhập Microsoft Chính Hãng';

    if (res.ok) {
      appState.config = res.config;
      syncAuthAndBadgesUI();
      updateStatusBar({ stage: 'idle', message: `Đăng nhập Bản Quyền thành công: ${res.msAccount.name}!`, percent: 100 });
    } else {
      updateStatusBar({ stage: 'error', message: res.error, percent: 0 });
    }
  });

  els.btnRefreshMicrosoft.addEventListener('click', async () => {
    els.btnRefreshMicrosoft.disabled = true;
    els.btnRefreshMicrosoft.textContent = 'Đang làm mới...';
    const res = await window.launcherAPI.refreshMicrosoft();
    els.btnRefreshMicrosoft.disabled = false;
    els.btnRefreshMicrosoft.textContent = '🔄 Gia Hạn Token';
    if (res.ok) {
      appState.config = res.config;
      syncAuthAndBadgesUI();
      updateStatusBar({ stage: 'idle', message: `Đã làm mới Token bản quyền cho ${res.msAccount.name}`, percent: 100 });
    } else {
      updateStatusBar({ stage: 'error', message: res.error, percent: 0 });
    }
  });

  els.btnLogoutMicrosoft.addEventListener('click', async () => {
    appState.config = await window.launcherAPI.logoutMicrosoft();
    syncAuthAndBadgesUI();
  });

  // Configure RAM Slider
  const maxSysRam = Math.max(4096, Math.floor(appState.systemInfo.totalRamMb * 0.85 / 512) * 512);
  els.ramSlider.max = maxSysRam;
  els.ramSlider.value = appState.config.ramMb;
  els.ramValueDisplay.textContent = `${appState.config.ramMb} MB (${(appState.config.ramMb / 1024).toFixed(1)} GB)`;
  els.sysHardwareSummary.textContent = `CPU: ${appState.systemInfo.cpuModel} (${appState.systemInfo.cpuCores} luồng đa nhân) • Tổng RAM máy: ${(appState.systemInfo.totalRamMb / 1024).toFixed(1)} GB`;

  els.chkFpsBoostJvm.checked = Boolean(appState.config.fpsBoostJvm);
  els.chkFullscreen.checked = Boolean(appState.config.fullscreen);
  els.chkHideLauncher.checked = Boolean(appState.config.hideLauncherOnPlay);
  els.gameDirInput.value = appState.config.gameDir;
  els.customJavaInput.value = appState.config.customJavaPath || '';

  renderJavaRuntimes();
  await refreshLocalMods();
  renderCuratedMods();

  // Load Mojang Version Manifest
  try {
    const verData = await window.launcherAPI.getVersions();
    appState.allVersions = verData.versions;
    renderVersionDropdown();
    syncAuthAndBadgesUI();
    appendLog(`[Aether] Đã tải danh sách ${verData.versions.length} phiên bản Minecraft từ Mojang API (Bản mới nhất: ${verData.latest.release}).`);
  } catch (err) {
    appendLog(`[LỖI] Không thể tải danh sách phiên bản: ${err.message}`);
  }

  // Offline Profile typing -> Live 3D Skin update
  let typingTimer;
  els.usernameInput.addEventListener('input', () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(async () => {
      const prof = await window.launcherAPI.getOfflineProfile(els.usernameInput.value);
      els.offlineUuidText.textContent = prof.uuid;
      if (appState.config.authMode === 'offline') {
        els.sidebarUsername.textContent = prof.username;
        loadPlayerSkin3D(prof.username, '');
      }
    }, 300);
  });

  els.btnSaveUsername.addEventListener('click', async () => {
    const clean = els.usernameInput.value.trim() || 'Steve';
    appState.config = await window.launcherAPI.saveConfig({ username: clean, authMode: 'offline', customSkinDataUrl: '' });
    updateOfflineProfileUI(appState.config.username, appState.config.uuid);
    syncAuthAndBadgesUI();
    appendLog(`[Aether] Đã đổi nhân vật 3D & hồ sơ Offline: ${appState.config.username} (UUID: ${appState.config.uuid})`);
  });

  els.btnCopyUuid.addEventListener('click', () => {
    navigator.clipboard.writeText(els.offlineUuidText.textContent);
    els.btnCopyUuid.textContent = '✓';
    setTimeout(() => { els.btnCopyUuid.textContent = '📋'; }, 1200);
  });

  // 5-Core & Era Version Selection
  document.querySelectorAll('.core-card').forEach(btn => {
    btn.addEventListener('click', async () => {
      appState.config = await window.launcherAPI.saveConfig({ loader: btn.dataset.loader });
      syncAuthAndBadgesUI();
    });
  });

  document.querySelectorAll('.era-card').forEach(card => {
    card.addEventListener('click', async () => {
      const ver = card.dataset.ver;
      const autoLoader = (ver === '1.8.9' && appState.config.loader === 'fabric') ? 'legacy-fabric' : appState.config.loader;
      appState.config = await window.launcherAPI.saveConfig({ mcVersion: ver, loader: autoLoader });
      renderVersionDropdown();
      syncAuthAndBadgesUI();
    });
  });

  els.chkShowSnapshots.addEventListener('change', renderVersionDropdown);
  els.versionSearchInput.addEventListener('input', renderVersionDropdown);
  els.versionSelect.addEventListener('change', async () => {
    appState.config = await window.launcherAPI.saveConfig({ mcVersion: els.versionSelect.value });
    syncAuthAndBadgesUI();
  });

  // Modrinth Bundle & Search
  els.btnInstallFpsBundle.addEventListener('click', async () => {
    els.btnInstallFpsBundle.disabled = true;
    els.btnInstallFpsBundle.textContent = '⏳ Đang cài đặt bộ FPS Boost + Skin...';
    const bundleSlugs = ['fabric-api', 'sodium', 'lithium', 'customskinloader', 'ferrite-core', 'entityculling', 'modmenu'];
    for (const slug of bundleSlugs) {
      await installSingleModrinthMod(slug, null);
    }
    els.btnInstallFpsBundle.disabled = false;
    els.btnInstallFpsBundle.textContent = '✓ Đã Cài Trọn Bộ FPS Boost!';
    setTimeout(() => {
      els.btnInstallFpsBundle.textContent = '🚀 Cài Đặt Trọn Bộ Tăng FPS + Skin (1-Click)';
    }, 3000);
  });

  els.btnSearchModrinth.addEventListener('click', searchModrinthMods);
  els.modrinthSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchModrinthMods();
  });

  // Folders & Local Mods
  document.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('click', () => {
      window.launcherAPI.openFolder(card.dataset.folder);
    });
  });
  els.btnRefreshMods.addEventListener('click', refreshLocalMods);

  // Settings Controls
  els.ramSlider.addEventListener('input', () => {
    const val = Number(els.ramSlider.value);
    els.ramValueDisplay.textContent = `${val} MB (${(val / 1024).toFixed(1)} GB)`;
  });
  els.ramSlider.addEventListener('change', async () => {
    appState.config = await window.launcherAPI.saveConfig({ ramMb: Number(els.ramSlider.value) });
    syncAuthAndBadgesUI();
  });

  document.querySelectorAll('.ram-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const ram = Math.min(Number(els.ramSlider.max), Number(chip.dataset.ram));
      els.ramSlider.value = ram;
      els.ramValueDisplay.textContent = `${ram} MB (${(ram / 1024).toFixed(1)} GB)`;
      appState.config = await window.launcherAPI.saveConfig({ ramMb: ram });
      syncAuthAndBadgesUI();
    });
  });

  els.chkFpsBoostJvm.addEventListener('change', async () => {
    appState.config = await window.launcherAPI.saveConfig({ fpsBoostJvm: els.chkFpsBoostJvm.checked });
  });
  els.chkFullscreen.addEventListener('change', async () => {
    appState.config = await window.launcherAPI.saveConfig({ fullscreen: els.chkFullscreen.checked });
  });
  els.chkHideLauncher.addEventListener('change', async () => {
    appState.config = await window.launcherAPI.saveConfig({ hideLauncherOnPlay: els.chkHideLauncher.checked });
  });

  els.btnPickGameDir.addEventListener('click', async () => {
    const picked = await window.launcherAPI.pickGameDir();
    if (picked) {
      appState.config.gameDir = picked;
      els.gameDirInput.value = picked;
      appState.systemInfo = await window.launcherAPI.getSystemInfo();
      renderJavaRuntimes();
      await refreshLocalMods();
    }
  });

  els.btnPickJava.addEventListener('click', async () => {
    const picked = await window.launcherAPI.pickJavaExe();
    if (picked) {
      appState.config.customJavaPath = picked;
      els.customJavaInput.value = picked;
    }
  });

  els.btnClearJava.addEventListener('click', async () => {
    appState.config = await window.launcherAPI.saveConfig({ customJavaPath: '' });
    els.customJavaInput.value = '';
  });

  els.btnCopyLogs.addEventListener('click', () => {
    navigator.clipboard.writeText(els.consoleOutput.innerText);
  });
  els.btnClearLogs.addEventListener('click', () => {
    els.consoleOutput.innerHTML = '';
  });

  // Engine IPC Events
  window.launcherAPI.onStatus((status) => updateStatusBar(status));
  window.launcherAPI.onLog((line) => appendLog(line));

  window.launcherAPI.onGameStarted(() => {
    els.btnStopGame.style.display = 'inline-block';
    els.btnLaunchGame.querySelector('.launch-main').textContent = 'GAME ĐANG CHẠY';
  });

  window.launcherAPI.onGameClosed(() => {
    appState.isLaunching = false;
    els.btnLaunchGame.disabled = false;
    els.btnStopGame.style.display = 'none';
    els.btnLaunchGame.querySelector('.launch-main').textContent = 'CHƠI NGAY';
    window.launcherAPI.getSystemInfo().then(info => {
      appState.systemInfo = info;
      renderJavaRuntimes();
    });
  });

  els.btnLaunchGame.addEventListener('click', async () => {
    if (appState.isLaunching) return;
    appState.isLaunching = true;
    els.btnLaunchGame.disabled = true;
    els.btnLaunchGame.querySelector('.launch-main').textContent = 'ĐANG KHỞI ĐỘNG...';

    const username = els.usernameInput.value.trim() || 'Steve';
    const res = await window.launcherAPI.launchGame({
      authMode: appState.config.authMode,
      username,
      mcVersion: els.versionSelect.value || appState.config.mcVersion,
      loader: appState.config.loader,
      ramMb: Number(els.ramSlider.value)
    });

    if (!res.ok) {
      appState.isLaunching = false;
      els.btnLaunchGame.disabled = false;
      els.btnLaunchGame.querySelector('.launch-main').textContent = 'CHƠI NGAY';
    }
  });

  els.btnStopGame.addEventListener('click', async () => {
    await window.launcherAPI.stopGame();
  });
}

document.addEventListener('DOMContentLoaded', initApp);
