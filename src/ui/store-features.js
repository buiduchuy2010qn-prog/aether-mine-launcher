function askUserAgreement({ title, message, showEula = false, showDontAsk = false, agreeText = '✓ Tôi Đồng Ý', cancelText = '✕ Không Đồng Ý (Hủy)' }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('userConfirmModal');
    const titleEl = document.getElementById('modalTitleText');
    const bodyEl = document.getElementById('modalBodyText');
    const eulaBox = document.getElementById('modalEulaBox');
    const dontAskWrap = document.getElementById('modalDontAskWrap');
    const dontAskCheck = document.getElementById('modalDontAskCheck');
    const btnCancel = document.getElementById('btnModalCancel');
    const btnAgree = document.getElementById('btnModalAgree');

    titleEl.textContent = title || 'Xác Nhận Đồng Ý';
    bodyEl.textContent = message || 'Bạn có đồng ý tiếp tục thao tác này không?';
    eulaBox.classList.toggle('hidden', !showEula);
    dontAskWrap.classList.toggle('hidden', !showDontAsk);
    if (dontAskCheck) dontAskCheck.checked = false;
    btnCancel.textContent = cancelText;
    btnAgree.textContent = agreeText;

    modal.classList.remove('hidden');

    const cleanup = (agreed) => {
      modal.classList.add('hidden');
      btnCancel.onclick = null;
      btnAgree.onclick = null;
      resolve({ agreed, dontAskAgain: Boolean(dontAskCheck?.checked) });
    };

    btnCancel.onclick = () => cleanup(false);
    btnAgree.onclick = () => cleanup(true);
  });
}
function createFallbackSteveSkinDataUrl() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);

  const fill = (x, y, w, h, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  };

  // --- HEAD (x:0..32, y:0..16) ---
  fill(8, 0, 8, 8, '#3d2718');   // Top of head (hair)
  fill(16, 0, 8, 8, '#9c6e54');  // Bottom of head (neck/chin)
  fill(0, 8, 32, 8, '#b9856a');  // All 4 sides of head base skin
  // Hair on Front (8,8), Right (0,8), Left (16,8), Back (24,8)
  fill(8, 8, 8, 2, '#3d2718');
  fill(8, 10, 1, 1, '#3d2718');
  fill(15, 10, 1, 1, '#3d2718');
  fill(0, 8, 8, 3, '#3d2718');
  fill(0, 11, 3, 2, '#3d2718');
  fill(16, 8, 8, 3, '#3d2718');
  fill(21, 11, 3, 2, '#3d2718');
  fill(24, 8, 8, 6, '#3d2718');
  // Face details (Front: x=8..16, y=8..16)
  fill(9, 11, 2, 1, '#8c5d43');  // Left eyebrow
  fill(13, 11, 2, 1, '#8c5d43'); // Right eyebrow
  fill(9, 12, 2, 1, '#ffffff');  // Left eye white
  fill(13, 12, 2, 1, '#ffffff'); // Right eye white
  fill(10, 12, 1, 1, '#4338ca'); // Left pupil
  fill(13, 12, 1, 1, '#4338ca'); // Right pupil
  fill(11, 13, 2, 1, '#9c6e54'); // Nose
  fill(10, 14, 4, 1, '#5c3824'); // Mouth / goatee top
  fill(11, 15, 2, 1, '#5c3824'); // Goatee bottom

  // --- TORSO (x:16..40, y:16..32) ---
  fill(20, 16, 8, 4, '#0891b2');  // Top shoulder
  fill(28, 16, 8, 4, '#0e7490');  // Bottom waist
  fill(16, 20, 24, 12, '#06b6d4'); // All 4 torso faces (cyan shirt)
  fill(20, 20, 8, 12, '#0891b2');  // Front chest shading
  fill(22, 20, 4, 2, '#b9856a');   // Neck V-opening
  fill(23, 22, 2, 1, '#9c6e54');

  // --- RIGHT ARM (x:40..56, y:16..32) ---
  fill(44, 16, 4, 4, '#0891b2');   // Top sleeve
  fill(48, 16, 4, 4, '#9c6e54');   // Bottom hand
  fill(40, 20, 16, 4, '#06b6d4');  // Upper sleeve all sides
  fill(40, 24, 16, 8, '#b9856a');  // Lower arm skin all sides
  fill(44, 24, 4, 8, '#ad7a5e');   // Front arm shading

  // --- LEFT ARM (64x64 format: x:32..48, y:48..64) ---
  fill(36, 48, 4, 4, '#0891b2');   // Top sleeve
  fill(40, 48, 4, 4, '#9c6e54');   // Bottom hand
  fill(32, 52, 16, 4, '#06b6d4');  // Upper sleeve all sides
  fill(32, 56, 16, 8, '#b9856a');  // Lower arm skin all sides
  fill(36, 56, 4, 8, '#ad7a5e');   // Front arm shading

  // --- RIGHT LEG (x:0..16, y:16..32) ---
  fill(4, 16, 4, 4, '#312e81');    // Top hip
  fill(8, 16, 4, 4, '#334155');    // Bottom shoe sole
  fill(0, 20, 16, 10, '#3730a3');  // Indigo pants all sides
  fill(4, 20, 4, 10, '#4338ca');   // Front leg highlight
  fill(0, 30, 16, 2, '#475569');   // Gray shoes

  // --- LEFT LEG (64x64 format: x:16..32, y:48..64) ---
  fill(20, 48, 4, 4, '#312e81');   // Top hip
  fill(24, 48, 4, 4, '#334155');   // Bottom shoe sole
  fill(16, 52, 16, 10, '#3730a3'); // Indigo pants all sides
  fill(20, 52, 4, 10, '#4338ca');  // Front leg highlight
  fill(16, 62, 16, 2, '#475569');  // Gray shoes

  return c.toDataURL('image/png');
}
function buildCapeDataUrl(type) {
  if (!type || type === 'none') return null;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 32;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 32);

  const palettes = {
    mojang:  { rim: '#450a0a', bg1: '#991b1b', bg2: '#dc2626', shade: '#b91c1c', border: '#fbbf24', icon: '#fef08a' },
    gold:    { rim: '#451a03', bg1: '#78350f', bg2: '#d97706', shade: '#b45309', border: '#fde047', icon: '#fffbeb' },
    cherry:  { rim: '#500724', bg1: '#9d174d', bg2: '#f472b6', shade: '#db2777', border: '#fbcfe8', icon: '#ffffff' },
    diamond: { rim: '#082f49', bg1: '#0f172a', bg2: '#0284c7', shade: '#0369a1', border: '#38bdf8', icon: '#e0f2fe' }
  };
  const p = palettes[type] || palettes.mojang;

  // 1) CAPE UV REGION (strictly x: 0..22, y: 0..17 so it never bleeds into Elytra UV at x >= 22)
  ctx.fillStyle = p.bg1;
  ctx.fillRect(0, 0, 22, 17);
  ctx.fillStyle = p.bg2;
  ctx.fillRect(1, 1, 10, 16);
  ctx.fillRect(12, 1, 10, 16);
  ctx.fillStyle = p.border;
  ctx.fillRect(1, 1, 10, 1);
  ctx.fillRect(1, 16, 10, 1);
  ctx.fillRect(1, 1, 1, 16);
  ctx.fillRect(10, 1, 1, 16);
  ctx.fillStyle = p.icon;
  ctx.fillRect(4, 5, 4, 6);
  ctx.fillRect(3, 6, 6, 4);
  ctx.fillStyle = p.bg1;
  ctx.fillRect(5, 7, 2, 2);

  // 2) OFFICIAL MOJANG 1.21.11 ELYTRA PIXEL MAP (assets/minecraft/textures/entity/equipment/wings/elytra.png)
  // In Mojang's official elytra.png, x = 22..33 is 100% transparent and the entire curved wing shell
  // lives at x = 34..45, y = 0..21 so the 3D mesh renders as a razor-sharp single wing plane.
  const OFFICIAL_ELYTRA_MAP = [
    [143,143,143,143,143,143,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [81,81,77,81,81,81,81,77,0,0,0,0],
    [81,81,77,77,81,81,81,81,81,0,0,0],
    [0,81,77,77,81,81,81,81,81,77,0,0],
    [0,81,77,77,81,81,81,81,81,81,0,0],
    [0,81,77,81,77,81,81,81,92,92,0,0],
    [0,81,77,81,81,77,86,92,92,92,111,0],
    [0,86,77,81,81,86,86,86,92,102,111,0],
    [0,86,86,86,92,92,92,92,86,102,102,0],
    [0,92,86,92,86,92,92,102,111,111,120,0],
    [0,0,92,102,102,102,111,111,111,111,120,143],
    [0,0,102,111,111,111,102,111,111,120,127,143],
    [0,0,102,111,111,111,111,102,120,120,127,143],
    [0,0,111,111,120,127,127,127,127,127,120,136],
    [0,0,120,127,120,120,127,127,127,127,127,143],
    [0,0,0,120,127,127,120,120,120,127,143,143],
    [0,0,0,120,120,127,127,127,127,136,136,136],
    [0,0,0,136,143,136,143,143,143,143,143,143],
    [0,0,0,0,143,143,136,136,136,143,143,143],
    [0,0,0,0,136,143,143,143,143,136,136,136],
    [0,0,0,0,0,136,136,143,143,143,143,143]
  ];

  for (let dy = 0; dy < 22; dy++) {
    const row = OFFICIAL_ELYTRA_MAP[dy];
    for (let dx = 0; dx < 12; dx++) {
      const val = row[dx];
      if (!val) continue;
      if (val <= 81) ctx.fillStyle = p.rim;
      else if (val <= 92) ctx.fillStyle = p.bg1;
      else if (val <= 111) ctx.fillStyle = p.shade;
      else if (val <= 127) ctx.fillStyle = p.bg2;
      else ctx.fillStyle = p.border;
      ctx.fillRect(34 + dx, dy, 1, 1);
    }
  }

  return c.toDataURL('image/png');
}

function convertSkinTo64x64DataUrl(imgSource) {
  return new Promise((resolve) => {
    if (!imgSource) return resolve(createFallbackSteveSkinDataUrl());
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 64, 64);
      ctx.drawImage(img, 0, 0);

      try {
        const hatData = ctx.getImageData(32, 0, 32, 16).data;
        let hasTrans = false;
        for (let i = 3; i < hatData.length; i += 4) {
          if (hatData[i] < 250) { hasTrans = true; break; }
        }
        if (!hasTrans) ctx.clearRect(32, 0, 32, 16);
      } catch (_) {}

      if (img.height === 32) {
        ctx.clearRect(0, 32, 64, 32);
        const copyFlipped = (sx, sy, sw, sh, dx, dy) => {
          ctx.save();
          ctx.translate(dx + sw, dy);
          ctx.scale(-1, 1);
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
          ctx.restore();
        };
        copyFlipped(4, 16, 4, 4, 20, 48);
        copyFlipped(8, 16, 4, 4, 24, 48);
        copyFlipped(0, 20, 4, 12, 24, 52);
        copyFlipped(4, 20, 4, 12, 20, 52);
        copyFlipped(8, 20, 4, 12, 16, 52);
        copyFlipped(12, 20, 4, 12, 28, 52);

        copyFlipped(44, 16, 4, 4, 36, 48);
        copyFlipped(48, 16, 4, 4, 40, 48);
        copyFlipped(40, 20, 4, 12, 40, 52);
        copyFlipped(44, 20, 4, 12, 36, 52);
        copyFlipped(48, 20, 4, 12, 32, 52);
        copyFlipped(52, 20, 4, 12, 44, 52);
      }
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(imgSource);
    img.src = imgSource;
  });
}

function draw2DAvatarFace(imgSource) {
  const canvases = [
    document.getElementById('avatar2dCanvas'),
    document.getElementById('msCardAvatarCanvas')
  ].filter(Boolean);
  if (!canvases.length) return;
  const img = new Image();
  img.onload = () => {
    const off = document.createElement('canvas');
    off.width = img.width || 64;
    off.height = img.height || 64;
    const octx = off.getContext('2d');
    octx.drawImage(img, 0, 0);

    for (const canvas of canvases) {
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, canvas.width, canvas.height);

      try {
        const hatData = octx.getImageData(32, 0, 32, 16).data;
        let hasTransparent = false;
        let hasOpaque = false;
        for (let i = 3; i < hatData.length; i += 4) {
          if (hatData[i] < 245) hasTransparent = true;
          if (hatData[i] > 15) hasOpaque = true;
        }
        if (hasTransparent && hasOpaque) {
          ctx.drawImage(img, 40, 8, 8, 8, 0, 0, canvas.width, canvas.height);
        }

        const faceData = octx.getImageData(8, 8, 8, 6).data;
        const r0 = faceData[0], g0 = faceData[1], b0 = faceData[2];
        let solidHead = true;
        for (let i = 0; i < faceData.length; i += 4) {
          if (Math.abs(faceData[i] - r0) > 12 || Math.abs(faceData[i + 1] - g0) > 12 || Math.abs(faceData[i + 2] - b0) > 12) {
            solidHead = false;
            break;
          }
        }
        if (solidHead) {
          const w = canvas.width;
          ctx.fillStyle = `rgb(${r0}, ${g0}, ${b0})`;
          ctx.fillRect(0, 0, w, w);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(Math.round(w * 0.14), Math.round(w * 0.14), Math.round(w * 0.72), Math.round(w * 0.72));
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(Math.round(w * 0.28), Math.round(w * 0.30), Math.round(w * 0.12), Math.round(w * 0.14));
          ctx.fillRect(Math.round(w * 0.60), Math.round(w * 0.30), Math.round(w * 0.12), Math.round(w * 0.14));
          ctx.fillRect(Math.round(w * 0.28), Math.round(w * 0.62), Math.round(w * 0.44), Math.round(w * 0.10));
          ctx.fillRect(Math.round(w * 0.21), Math.round(w * 0.54), Math.round(w * 0.10), Math.round(w * 0.10));
          ctx.fillRect(Math.round(w * 0.69), Math.round(w * 0.54), Math.round(w * 0.10), Math.round(w * 0.10));
        }
      } catch (_) {}
    }
  };
  img.src = imgSource;
}
async function runOneClickFpsBoost(btnElement) {
  if (btnElement.dataset.alreadyInstalled === 'true') {
    await askUserAgreement({
      title: '✓ Gói X3 FPS Đã Được Cài Sẵn!',
      message: `Bộ Mod tối ưu X3 FPS (Sodium, Lithium, FerriteCore, EntityCulling, ImmediatelyFast, Iris) đã có sẵn trong máy cho phiên bản ${state.selectedVersion} rồi, bạn không cần tải lại nữa! Chỉ cần bấm CHƠI NGAY là vào game luôn.`,
      agreeText: 'Đã hiểu',
      cancelText: 'Đóng'
    });
    return;
  }
  const confirmRes = await askUserAgreement({
    title: '⚡ Xác Nhận Cài Đặt Gói X3 FPS',
    message: 'Bạn có đồng ý để Launcher tự động tải và cài đặt bộ Mod tối ưu FPS (Sodium, Lithium, FerriteCore, EntityCulling, ImmediatelyFast, Iris Shaders) vào thư mục .minecraft/mods không?',
    agreeText: '✓ Đồng Ý Cài Đặt',
    cancelText: '✕ Không, Hủy bỏ'
  });
  if (!confirmRes.agreed) return;
  if (state.selectedCore === 'vanilla') setCore('fabric');
  const origHtml = btnElement.innerHTML;
  btnElement.disabled = true; btnElement.innerHTML = '<span>⏳ Đang tải bộ X3 FPS...</span>';
  const descEl = document.getElementById('fpsBoostStatusText');
  if (descEl) descEl.textContent = `Đang tải tự động Sodium + Lithium + FerriteCore + EntityCulling + Iris cho ${state.selectedVersion}...`;
  const res = await window.aetherAPI.installFpsBoostPack({ mcVersion: state.selectedVersion, loaderType: state.selectedCore, gameDir: state.gameDir });
  btnElement.disabled = false;
  if (res?.ok) {
    btnElement.innerHTML = `<span>✓ Đã cài ${res.installed.length} Mod FPS!</span>`;
    if (descEl) descEl.textContent = `Đã cài thành công: ${res.installed.join(', ')}`;
    await refreshLocalAddonsCount();
  } else {
    btnElement.innerHTML = '<span>⚠ Thử lại</span>';
    if (descEl) descEl.textContent = `Lỗi tải gói FPS: ${res?.error || 'Kiểm tra mạng'}`;
  }
  setTimeout(() => { btnElement.innerHTML = origHtml; }, 4000);
}

async function refreshLocalAddonsCount() {
  const modsRes = await window.aetherAPI.listLocalAddons(state.gameDir, 'mods');
  const items = modsRes?.items || [];
  const enabledItems = items.filter((i) => i.enabled);
  const sideEl = document.getElementById('sideModsCount');
  if (sideEl) sideEl.textContent = `${enabledItems.length} Mod`;
  const tabCountEl = document.getElementById('localAddonCount');
  if (tabCountEl) tabCountEl.textContent = items.length;

  // Check if core FPS Boost pack is already installed for current selectedVersion
  const activeVer = state.selectedVersion || '1.21.4';
  const itemMatchesActiveVer = (item) => {
    if (Array.isArray(item.gameVersions) && item.gameVersions.length > 0) {
      return item.gameVersions.includes(activeVer);
    }
    if (item.mcVersion) return item.mcVersion === activeVer;
    return true;
  };
  const compatEnabled = enabledItems.filter(itemMatchesActiveVer);
  const lowerNames = compatEnabled.map((i) => i.cleanName.toLowerCase());
  const hasSodium = lowerNames.some((n) => n.startsWith('sodium-') || n.startsWith('embeddium-'));
  const hasLithium = lowerNames.some((n) => n.startsWith('lithium-') || n.startsWith('ferritecore-'));
  const btnHomeFps = document.getElementById('btnOneClickFpsBoost');
  const btnStoreFps = document.getElementById('btnStoreFpsBoost');
  const descEl = document.getElementById('fpsBoostStatusText');

  if (hasSodium && hasLithium) {
    if (btnHomeFps) {
      btnHomeFps.innerHTML = `<span>✓ Đã Cài X3 FPS (${activeVer})</span>`;
      btnHomeFps.dataset.alreadyInstalled = 'true';
    }
    if (btnStoreFps) {
      btnStoreFps.innerHTML = `<span>✓ Đã Cài Sẵn Bộ X3 FPS (${activeVer})</span>`;
      btnStoreFps.dataset.alreadyInstalled = 'true';
    }
    if (descEl) {
      descEl.textContent = `✓ Bộ Mod X3 FPS (${compatEnabled.length} Mod chuẩn ${activeVer}: Sodium, Lithium, Iris...) đã cài sẵn — Bấm CHƠI NGAY để vào game!`;
    }
  } else {
    if (btnHomeFps) {
      btnHomeFps.innerHTML = `<span>⚡ Cài X3 FPS (${activeVer})</span>`;
      btnHomeFps.dataset.alreadyInstalled = 'false';
    }
    if (btnStoreFps) {
      btnStoreFps.innerHTML = `<span>⚡ Cài Trọn Bộ X3 FPS (${activeVer})</span>`;
      btnStoreFps.dataset.alreadyInstalled = 'false';
    }
  }
}

async function loadModrinthStore(append = false) {
  const grid = document.getElementById('modrinthResultsGrid');
  const localWrap = document.getElementById('localAddonsWrap');
  const totalBadge = document.getElementById('modTotalCounterBadge');
  if (state.activeModStoreType === 'installed') {
    grid.classList.add('hidden');
    localWrap.classList.remove('hidden');
    if (totalBadge) totalBadge.textContent = 'Quản lý trong máy';
    await renderLocalAddonsManager();
    return;
  }
  localWrap.classList.add('hidden');
  grid.classList.remove('hidden');

  const pageSize = 48;
  if (!append) {
    state.modOffset = 0;
    state.modAccumulatedHits = [];
    grid.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-muted);font-weight:700;">⏳ Đang tải kho dữ liệu Full Mod từ Modrinth Official...</div>';
  } else {
    const oldMoreBtn = document.getElementById('btnLoadMoreMods');
    if (oldMoreBtn) {
      oldMoreBtn.disabled = true;
      oldMoreBtn.textContent = '⏳ Đang tải thêm 48 gói tiếp theo...';
    }
  }

  const query = document.getElementById('modSearchInput')?.value.trim() || '';
  const res = await window.aetherAPI.searchModrinth({
    query,
    projectType: state.activeModStoreType,
    mcVersion: state.selectedVersion,
    loaderType: state.selectedCore,
    category: state.modCategory || '',
    sortBy: state.modSortBy || 'downloads',
    offset: state.modOffset || 0,
    limit: pageSize,
    allVersions: Boolean(state.modAllVersions)
  });

  if (!res?.ok || (!res.hits?.length && !append)) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-muted);">Không tìm thấy kết quả phù hợp. Hãy bấm nút <strong>"Full Kho (Mọi Bản)"</strong> ở góc phải hoặc thử từ khóa khác!</div>';
    if (totalBadge) totalBadge.textContent = '0 kết quả';
    return;
  }

  const newHits = res.hits || [];
  const totalHits = res.totalHits || newHits.length;
  state.modAccumulatedHits = append ? [...(state.modAccumulatedHits || []), ...newHits] : newHits;
  state.modOffset = state.modAccumulatedHits.length;

  if (totalBadge) {
    totalBadge.textContent = `Hiện ${state.modAccumulatedHits.length} / ${totalHits.toLocaleString('vi-VN')}+ Gói`;
  }
  const modSearchInp = document.getElementById('modSearchInput');
  if (modSearchInp) {
    modSearchInp.placeholder = `Tìm nhanh trong ${totalHits.toLocaleString('vi-VN')}+ gói phù hợp (vd: Sodium, Iris, Create, Ice and Fire, Xaero)...`;
  }

  const folderMap = { mod: 'mods', shader: 'shaderpacks', resourcepack: 'resourcepacks' };
  const localCheck = await window.aetherAPI.listLocalAddons(state.gameDir, folderMap[state.activeModStoreType] || 'mods');
  const localItems = (localCheck?.items || []).filter((i) => i.enabled);
  const activeVer = state.selectedVersion || '1.21.4';

  const TAG_VI_MAP = {
    fabric: 'Fabric',
    forge: 'Forge',
    quilt: 'Quilt',
    neoforge: 'NeoForge',
    optimization: 'Tối ưu FPS',
    library: 'Thư viện',
    utility: 'Tiện ích',
    decoration: 'Trang trí',
    adventure: 'Phiêu lưu',
    worldgen: 'Thế giới',
    combat: 'Chiến đấu',
    equipment: 'Trang bị',
    magic: 'Phép thuật',
    technology: 'Công nghệ',
    storage: 'Kho đồ',
    food: 'Nông trại',
    mobs: 'Sinh vật',
    transportation: 'Phương tiện',
    management: 'Quản lý',
    'game-mechanics': 'Cơ chế',
    social: 'Cộng đồng',
    cursed: 'Giải trí',
    minigame: 'Minigame',
    atmosphere: 'Hiệu ứng',
    realistic: 'Chân thực',
    fantasy: 'Huyền ảo',
    'vanilla-like': 'Chuẩn gốc',
    ' vanilla-like': 'Chuẩn gốc',
    gui: 'Giao diện',
    models: 'Mô hình 3D',
    tweaks: 'Tinh chỉnh',
    blocks: 'Khối vuông',
    items: 'Vật phẩm',
    entities: 'Thực thể',
    environment: 'Môi trường',
    audio: 'Âm thanh',
    fonts: 'Phông chữ',
    simplistic: 'Tối giản',
    'semi-realistic': 'Bán chân thực',
    shadows: 'Bóng đổ',
    pbr: 'Bề mặt PBR',
    foliage: 'Cây cối',
    'colored-lighting': 'Ánh sáng màu',
    'path-tracing': 'Dò tia sáng',
    bloom: 'Phát sáng',
    reflections: 'Phản chiếu',
    high: 'Cấu hình cao',
    medium: 'Tầm trung',
    low: 'Máy yếu',
    potato: 'Siêu nhẹ',
    iris: 'Iris',
    optifine: 'OptiFine',
    canvas: 'Canvas',
    vanilla: 'Vanilla',
    datapack: 'Data Pack'
  };

  const HIDDEN_RETRO_TAGS = new Set([
    'babric', 'bta-babric', 'liteloader', 'modloader', 'risugamis-modloader',
    'rift', 'ornithe', 'nilloader', 'legacy-fabric'
  ]);

  const MOD_DESC_VI_MAP = {
    'fabric-api': 'Thư viện nền tảng bắt buộc cho Fabric: Cung cấp các kết nối cốt lõi để hầu hết các Mod Fabric hoạt động ổn định cùng nhau.',
    'sodium': 'Mod tối ưu đồ họa số 1 cho Minecraft: Tăng gấp 2–3 lần FPS, loại bỏ giật lag khung hình (stutter) và làm mượt game rõ rệt.',
    'iris': 'Trình chạy Shader hiện đại cho Minecraft: Giúp bật các gói bóng đổ (Shader Packs) tuyệt đẹp của OptiFine kết hợp mượt mà cùng Sodium.',
    'entityculling': 'Tối ưu FPS thông minh: Tự động ẩn và ngừng vẽ các sinh vật/khối vuông bị khuất sau tường để tăng mạnh tốc độ khung hình.',
    'cloth-config': 'Thư viện tạo bảng cài đặt (Config GUI) cho các Mod Minecraft, giúp bạn tùy chỉnh tính năng Mod trực tiếp ngay trong game.',
    'ferrite-core': 'Tối ưu hóa bộ nhớ RAM cực mạnh: Giảm tới 40–45% lượng RAM Minecraft tiêu thụ, giúp máy yếu chơi nhiều Mod không bị tràn RAM.',
    'modmenu': 'Thêm nút "Mods" vào màn hình chính và Menu tạm dừng, giúp xem danh sách các Mod đã cài và mở bảng chỉnh cài đặt từng Mod.',
    'lithium': 'Tối ưu hóa toàn diện logic game, vật lý, AI sinh vật và tải bản đồ (Chunk) mà không làm thay đổi bất kỳ cơ chế gốc nào của Minecraft.',
    'immediatelyfast': 'Tăng tốc độ vẽ giao diện (HUD, bản đồ, chữ), thực thể (Entities) và vật phẩm trên màn hình giúp tăng FPS rõ rệt.',
    'yacl': 'Thư viện giao diện cấu hình (YetAnotherConfigLib) hiện đại được nhiều Mod tối ưu và đồ họa sử dụng để tạo menu tùy chỉnh.',
    'fabric-language-kotlin': 'Thư viện hỗ trợ ngôn ngữ Kotlin bắt buộc cho các Mod hiện đại được viết bằng Kotlin trên nền tảng Fabric.',
    'xaeros-minimap': 'Bản đồ thu nhỏ (Minimap) góc màn hình: Hiển thị địa hình xung quanh, tọa độ, sinh vật và đánh dấu điểm dịch chuyển (Waypoint).',
    'xaeros-world-map': 'Bản đồ thế giới toàn màn hình (bấm phím M): Tự động lưu lại mọi vùng đất đã đi qua, kết hợp hoàn hảo với Xaero\'s Minimap.',
    'journeymap': 'Bản đồ thế giới & Minimap thời gian thực: Xem địa hình ngày/đêm, hang động, đánh dấu tọa độ và tìm đường về nhà dễ dàng.',
    'appleskin': 'Hiển thị chi tiết lượng thức ăn và độ bão hòa (Saturation) mà mỗi món ăn hồi lại ngay trên thanh độ đói và trong túi đồ.',
    'continuity': 'Kết nối liền mạch viền các khối kính, đá cát và kệ sách (Connected Textures) giống hệt tính năng nối kính của OptiFine.',
    'indium': 'Tiện ích mở rộng cho Sodium hỗ trợ chuẩn Fabric Rendering API, giúp các Mod như Continuity và Create hiển thị đúng đồ họa.',
    'sodium-extra': 'Bổ sung hàng chục tùy chọn đồ họa chuyên sâu cho Sodium: Bật/tắt sương mù, mây, hiệu ứng hạt, hoạt ảnh lửa/nước và hiện FPS góc màn hình.',
    'reeses-sodium-options': 'Làm lại giao diện Cài đặt Đồ họa (Video Settings) của Sodium thành dạng danh sách dọc kèm thanh tìm kiếm cực kỳ gọn gàng, dễ nhìn.',
    'lambdynamiclights': 'Ánh sáng động chân thực: Cầm đuốc, đèn lồng hoặc vật phát sáng trên tay sẽ tỏa sáng rực rỡ vùng xung quanh khi đi hang tối.',
    'dynamiclights': 'Ánh sáng động: Đuốc và vật phẩm phát sáng khi cầm trên tay hoặc ném ra đất sẽ tự động chiếu sáng môi trường xung quanh.',
    'zoomify': 'Phóng to tầm nhìn (Zoom ống nhòm) siêu mượt với hiệu ứng cuộn chuột phóng xa/gần và làm mượt chuyển động chuột giống OptiFine.',
    'wi-zoom': 'Ống nhòm phóng to siêu xa (lên tới 50x) bằng phím C hoặc cuộn chuột mà không cần chế tạo ống nhòm trong game.',
    'logical-zoom': 'Thêm phím tắt phóng to tầm nhìn (Zoom) đơn giản, gọn nhẹ giống hệt phím C của OptiFine.',
    'jei': 'Từ điển công thức chế tạo (Just Enough Items): Xem công thức ghép đồ và cách nung/pha chế của mọi vật phẩm ngay cạnh túi đồ.',
    'rei': 'Tra cứu công thức chế tạo (Roughly Enough Items): Giao diện tìm kiếm vật phẩm và xem công thức ghép đồ trực quan trong túi đồ.',
    'emi': 'Trình xem công thức chế tạo (EMI) hiện đại: Hỗ trợ cây công thức nhiều bước, tính toán nguyên liệu cần thiết và tìm kiếm siêu nhanh.',
    'jade': 'Hiển thị bảng thông tin ở đầu màn hình: Cho biết chính xác bạn đang nhìn vào khối vuông gì, sinh vật bao nhiêu máu, lò nung còn bao lâu.',
    'wthit': 'Cho biết tên khối vuông, máu quái vật, tiến độ cây trồng và nội dung trong rương ngay khi bạn chĩa tâm ngắm vào.',
    'architectury-api': 'Thư viện cầu nối trung gian giúp các Mod đa nền tảng chạy mượt mà trên cả Fabric, Forge và NeoForge.',
    'geckolib': 'Thư viện hoạt ảnh 3D cao cấp giúp các Mod vũ khí, rồng, Boss và sinh vật mới có chuyển động mượt mà, sống động.',
    'collective': 'Thư viện dùng chung cung cấp các hàm xử lý sự kiện và tiện ích cho hàng loạt Mod cải tiến lối chơi của Serilum.',
    'balm': 'Thư viện nền tảng đa năng hỗ trợ hệ thống phím tắt, cấu hình và mạng cho các Mod như Waystones, Cooking for Blockheads.',
    'bookshelf': 'Thư viện mã nguồn mở cung cấp công cụ xử lý công thức, thuộc tính vật phẩm và lệnh cho nhiều Mod khác.',
    'puzzles-lib': 'Thư viện lõi giúp đồng bộ tính năng và giao diện của hàng chục Mod tiện ích giữa Fabric và Forge.',
    'forge-config-api-port': 'Mang hệ thống quản lý file cấu hình của Forge/NeoForge sang Fabric để các Mod đa nền tảng hoạt động ổn định.',
    'cristel-lib': 'Thư viện hỗ trợ tạo và tùy chỉnh các công trình kiến trúc (Structures) tự nhiên trên bản đồ Minecraft.',
    'terrablender': 'Thư viện trộn địa hình giúp nhiều Mod thêm quần xã (Biome) mới cùng hoạt động chung trong một thế giới mà không xung đột.',
    'curios': 'Mở rộng thêm các ô trang bị phụ (nhẫn, dây chuyền, bùa hộ mệnh, ba lô) bên cạnh bộ giáp truyền thống.',
    'trinkets': 'Thêm hệ thống ô đeo trang sức, phụ kiện, cánh và ba lô cho nhân vật trên nền tảng Fabric.',
    'accessories': 'Hệ thống ô đeo phụ kiện và trang sức mở rộng thế hệ mới tương thích cả Trinkets lẫn Curios.',
    'carry-on': 'Cho phép dùng hai tay bê trực tiếp rương đầy đồ, lò nung hoặc bế cả động vật/dân làng đi đặt sang chỗ khác mà không cần đập vỡ.',
    'waystones': 'Thêm các Cột Đá Dịch Chuyển (Waystones) tại làng mạc hoặc tự chế tạo để dịch chuyển tức thời giữa các căn cứ xa nhau.',
    'natures-compass': 'La bàn tìm quần xã (Biome): Giúp tìm tọa độ và chỉ đường đến bất kỳ loại rừng, sa mạc, núi tuyết nào trên bản đồ.',
    'explorers-compass': 'La bàn nhà thám hiểm: Giúp dò tìm vị trí các công trình hiếm như Pháo đài cổ, Đền thờ, Hầm ngục, Biệt thự rừng.',
    'biomes-o-plenty': 'Đại tu thế giới với hơn 80 quần xã (Biome) mới tuyệt đẹp ở cả Overworld, Nether và End kèm cây cối, hoa cỏ độc đáo.',
    'terralith': 'Nâng cấp địa hình thế giới với gần 100 quần xã mới hùng vĩ (núi lửa, hẻm núi, rừng anh đào cổ đại) chỉ dùng khối vuông gốc.',
    'tectonic': 'Tái tạo địa hình kiến tạo mảng: Tạo ra những dãy núi cao chạm mây, sông ngòi uốn lượn, vách đá dựng đứng và đại dương sâu thẳm.',
    'incendium': 'Biến đổi hoàn toàn địa ngục Nether với 8 quần xã mới, 9 công trình lâu đài rực lửa, vũ khí huyền thoại và Boss cực mạnh.',
    'nullscape': 'Cải tạo thế giới The End thành không gian siêu thực, hùng vĩ với địa hình đảo bay đa tầng và các vùng sinh thái kỳ ảo.',
    'structory': 'Thêm hàng chục công trình kiến trúc hoang tàn, tháp canh, nhà cổ và di tích bí ẩn rải rác khắp thế giới kèm kho báu.',
    'create': 'Mod công nghệ cơ khí đình đám: Chế tạo bánh răng, băng chuyền, máy khoan tự động, cối xay gió và cả đoàn tàu hỏa chạy hơi nước!',
    'create-fabric': 'Phiên bản Fabric của Mod cơ khí Create: Xây dựng nhà máy tự động hóa bằng bánh răng, trục xoay, cánh tay robot và tàu hỏa.',
    'farmers-delight': 'Mở rộng nghề nông trại & nấu ăn: Thêm bếp lò, chảo rán, thớt thái thịt và hàng trăm món ăn ngon miệng tăng chỉ số mạnh mẽ.',
    'sophisticated-backpacks': 'Ba lô đeo lưng thông minh: Nâng cấp sức chứa cực lớn, có mô-đun tự nhặt đồ, tự nung quặng, tự cho nhân vật ăn khi đói.',
    'travelers-backpack': 'Ba lô phượt thủ đa năng: Có bình chứa chất lỏng 2 bên, bàn chế tạo tích hợp, túi ngủ trải ra nằm ngay và hiệu ứng đặc biệt.',
    'iron-chests': 'Nâng cấp rương gỗ thành Rương Sắt, Vàng, Kim Cương, Pha Lê và Obsidian với sức chứa gấp nhiều lần trong cùng 1 ô diện tích.',
    'tom-simple-storage': 'Hệ thống quản lý kho đồ tập trung: Kết nối hàng chục rương lại thành 1 màn hình duy nhất có thanh tìm kiếm và bàn chế tạo liền kề.',
    'applied-energistics-2': 'Công nghệ lưu trữ kỹ thuật số (AE2): Chuyển toàn bộ vật phẩm vào ổ đĩa năng lượng ME và tự động hóa chế tạo quy mô công nghiệp.',
    'refined-storage': 'Hệ thống mạng lưu trữ đồ đạc bằng máy tính: Gom hàng triệu vật phẩm từ mọi rương vào một bảng điều khiển thông minh.',
    'mekanism': 'Mod công nghệ cao: Chế tạo máy nhân năm quặng, lò phản ứng hạt nhân, bộ giáp cơ khí MekaSuit và jetpack bay lượn.',
    'botania': 'Mod ma thuật thiên nhiên: Sử dụng hoa thần kỳ để tạo năng lượng Mana, rèn giáp phép thuật, nhẫn thần và triệu hồi Boss Gaia.',
    'twilight-forest': 'Cổng dịch chuyển sang Rừng Chạng Vạng (Twilight Forest): Thế giới cổ tích đầy mê cung, lâu đài khổng lồ và chuỗi Boss huyền thoại.',
    'ice-and-fire-dragons': 'Thế giới Rồng Lửa & Rồng Băng: Săn rồng khổng lồ, ấp trứng thuần hóa rồng bay, rèn giáp vảy rồng và chiến đấu với quái vật thần thoại.',
    'alexs-mobs': 'Thêm hơn 85 loài động vật và quái vật sống động (Hổ, Voi, Cá Voi, Gấu, Đại Bàng...) với tập tính tự nhiên và vật phẩm rơi riêng biệt.',
    'alexs-caves': 'Thêm 5 quần xã hang động ngầm khổng lồ dưới lòng đất: Hang Khủng Long tiền sử, Hang Từ Trường, Hang Axit Độc, Hang Kẹo Ngọt và Vực Thẳm.',
    'mowzies-mobs': 'Thêm các Boss và quái vật tinh nhuệ có hoạt ảnh chiến đấu cực kỳ mượt mà, kỹ năng né đòn thông minh và vũ khí rơi độc nhất.',
    'l_enders_cataclysm': 'Thêm những hầm ngục đại thảm họa và chuỗi Boss siêu khủng khiếp với hiệu ứng kỹ năng hoành tráng như game nhập vai AAA.',
    'origins': 'Chọn Nguồn Gốc (Chủng tộc) khi bắt đầu game: Hóa thân thành Người Rồng, Người Cá, Bóng Ma, Người Nhện với siêu năng lực và điểm yếu riêng.',
    'pehkui': 'Cho phép phóng to nhân vật khổng lồ hoặc thu nhỏ tí hon đi lọt qua khe 1 ô vuông, tương thích tốt với các gói Origins.',
    'voice-chat': 'Đàm thoại giọng nói trong game (Simple Voice Chat): Nói chuyện trực tiếp qua mic với bạn bè đứng gần với hiệu ứng âm thanh vòm 3D.',
    'plasmo-voice': 'Hệ thống chat giọng nói theo khoảng cách (Proximity Voice Chat) với chất lượng âm thanh trong trẻo và khử ồn thông minh.',
    'sound-physics-remastered': 'Vật lý âm thanh chân thực: Tiếng bước chân và tiếng nổ vang vọng trong hang sâu, bị cản lại khi qua tường kín giống đời thực.',
    'ambientsounds': 'Bổ sung âm thanh thiên nhiên sống động: Tiếng chim hót trong rừng, tiếng gió thổi trên đỉnh núi, tiếng sóng biển và dế kêu ban đêm.',
    'presence-footsteps': 'Làm lại toàn bộ tiếng bước chân: Đi trên gỗ, đá, cỏ, cát, tuyết hay bùn đều phát ra âm thanh chân thực và sắc nét khác nhau.',
    'not-enough-animations': 'Bổ sung hoạt ảnh góc nhìn thứ 3 cho nhân vật: Thấy rõ tay đưa lên ăn uống, cầm bản đồ, chèo thuyền, leo thang và nạp cung tên.',
    'first-person-model': 'Nhìn thấy thân người, hai tay và chân của chính mình khi cúi xuống ở góc nhìn thứ nhất (First-Person) cực kỳ chân thực.',
    'skin-layers-3d': 'Biến lớp áo ngoài (mũ, tóc, tay áo, quần) từ mặt phẳng 2D thành mô hình khối 3D nổi sắc nét trên nhân vật.',
    'eating-animation': 'Thêm hoạt ảnh thức ăn vơi dần từng miếng sinh động mỗi khi nhân vật đang nhai đồ ăn hoặc uống thuốc.',
    'visuality': 'Thêm các hạt hiệu ứng bắt mắt: Đánh quái tóe tia sáng, xương vỡ vụn, lấp lánh trên quặng quý và gợn nước khi trời mưa.',
    'fallingtree': 'Chặt cây siêu tốc (FallingTree): Chỉ cần dùng rìu chặt 1 gốc cây dưới cùng là toàn bộ thân cây và lá sẽ tự động đổ xuống.',
    'treeharvester': 'Thu hoạch cây nhanh: Giữ phím Shift + chặt gốc cây để đốn hạ toàn bộ cây cổ thụ và làm rụng lá lấy mầm cây ngay lập tức.',
    'veinminer': 'Đào quặng theo mạch (VeinMiner): Đập 1 viên than hoặc sắt sẽ tự động đào luôn toàn bộ mạch quặng dính liền nhau.',
    'mouse-tweaks': 'Thao tác chuột siêu nhanh trong túi đồ: Giữ chuột kéo qua các ô để chuyển/chia đồ hàng loạt và dùng con lăn chuột rút từng món.',
    'inventory-profiles-next': 'Sắp xếp túi đồ & rương tự động chỉ bằng 1 nút bấm (phím R), kèm tính năng tự thay công cụ mới lên tay khi công cụ cũ bị gãy.',
    'controlling': 'Thêm thanh tìm kiếm vào phần Cài đặt Phím tắt (Keybinds): Dễ dàng lọc phím theo tên chức năng hoặc phát hiện các phím bị trùng nhau.',
    'searchables': 'Thư viện hỗ trợ tìm kiếm nâng cao với bộ lọc tự động hoàn thành cho thanh tìm kiếm phím tắt và vật phẩm.',
    'clumps': 'Gom hàng trăm quả cầu kinh nghiệm (XP Orbs) rơi ra thành một quả cầu lớn duy nhất để chống giật lag máy và hút XP ngay lập tức.',
    'spark': 'Công cụ chẩn đoán hiệu năng chuyên nghiệp: Phân tích chi tiết mức dùng CPU, RAM và tốc độ Tick để tìm ra nguyên nhân gây lag.',
    'krypton': 'Tối ưu hóa hệ thống mạng (Network Stack) của Minecraft: Giảm độ trễ Ping và tiết kiệm băng thông CPU khi chơi Multiplayer/LAN.',
    'modernfix': 'Bộ tối ưu tổng hợp cực mạnh: Giúp Minecraft khởi động nhanh gấp 2 lần, giảm mạnh lượng RAM tiêu thụ và sửa hàng chục lỗi rò rỉ bộ nhớ.',
    'noisium': 'Tăng tốc độ thuật toán tạo địa hình (Noise Generation) thêm 20–30%, giúp bay khám phá vùng đất mới tải Chunk nhanh hơn.',
    'c2me-fabric': 'Tải và tạo bản đồ đa nhân (Concurrent Chunk Management): Tận dụng toàn bộ nhân CPU để tải địa hình siêu tốc khi di chuyển nhanh.',
    'scalablelux': 'Tối ưu hóa hệ thống tính toán ánh sáng (Lighting Engine) bằng đa luồng, loại bỏ hiện tượng khựng game khi đi qua vùng mới.',
    'badoptimizations': 'Tối ưu các tác vụ ngầm dư thừa (bầu trời, sương mù, tính góc nhìn) khi không thay đổi để tăng thêm FPS cho máy yếu.',
    'moreculling': 'Mở rộng cơ chế ẩn bề mặt khuất cho lá cây, khung vật phẩm, biển báo và khối vuông để tăng mạnh FPS ở khu vực rừng rậm.',
    'dynamic-fps': 'Tự động giảm FPS và giải phóng GPU/CPU xuống gần 0% khi bạn thu nhỏ cửa sổ Minecraft hoặc chuyển sang dùng ứng dụng khác.',
    'enhanced-block-entities': 'Tối ưu hóa Rương, Biển báo, Giường và Đầu lâu: Chuyển sang mô hình khối tĩnh giúp tăng gấp đôi FPS ở khu vực kho chứa nhiều rương.',
    'fastquit': 'Thoát thế giới về Menu chính ngay lập tức: Cho phép lưu bản đồ chạy ngầm ở hậu cảnh để bạn không phải chờ màn hình "Saving World".',
    'memoryleakfix': 'Sửa triệt để các lỗi rò rỉ bộ nhớ RAM (Memory Leaks) tồn tại trong mã nguồn Minecraft khi chuyển thế giới hoặc chơi lâu.',
    'debugify': 'Sửa hơn 70 lỗi bug chính thức đã được ghi nhận trên Mojang Bug Tracker nhưng chưa được vá trong phiên bản gốc.',
    'bobby': 'Lưu trữ đệm các vùng đất đã đi qua trên máy để bạn nhìn xa tới 32–64 Chunks ngay cả trên Server giới hạn tầm nhìn 8 Chunks.',
    'distant-horizons': 'Tầm nhìn vô cực (LOD): Cho phép nhìn thấy núi non và công trình cách xa hàng trăm Chunks ở đường chân trời mà vẫn giữ FPS cao!',
    'nvidium': 'Tăng tốc vẽ địa hình bằng công nghệ Mesh Shaders độc quyền cho card đồ họa NVIDIA GTX 1600 / RTX, đẩy FPS lên hàng trăm khung hình.',
    'voxy': 'Công nghệ hiển thị tầm nhìn siêu xa (LoD Engine) tốc độ cao dành cho Sodium giúp nhìn toàn cảnh bản đồ rộng lớn cực mượt.',
    'worldedit': 'Công cụ xây dựng thần tốc: Sao chép, xoay, lấp đầy hàng triệu khối vuông, tạo quả cầu, núi non và chỉnh sửa địa hình bằng lệnh.',
    'axiom': 'Phần mềm chỉnh sửa 3D trực tiếp trong Minecraft: Nặn núi non, tô màu địa hình, xoay/kéo công trình bằng giao diện đồ họa chuyên nghiệp.',
    'litematica': 'Bản vẽ kiến trúc 3D (Schematic): Chiếu hình ảnh hologram công trình mẫu vào thế giới để bạn đặt từng khối theo đúng bản thiết kế.',
    'malilib': 'Thư viện cốt lõi bắt buộc để chạy bộ Mod kỹ thuật nổi tiếng của Masa: Litematica, MiniHUD, Tweakeroo và ItemScroller.',
    'minihud': 'Hiển thị thông tin kỹ thuật gọn nhẹ góc màn hình: Tọa độ, FPS, tốc độ di chuyển, vùng quái vật sinh sản và ranh giới Chunk.',
    'tweakeroo': 'Bộ công cụ kỹ thuật cao cấp: Đặt khối siêu tốc, khóa góc đặt khối, đổi công cụ tự động và hàng chục tinh chỉnh tiện lợi.',
    'itemscroller': 'Di chuyển vật phẩm trong rương và giao dịch với Dân làng cực nhanh chỉ bằng cách cuộn con lăn chuột hoặc kéo giữ chuột.',
    'freecam': 'Tách camera bay tự do xuyên tường (chế độ hồn ma) để quan sát hang động, kiểm tra mạch Redstone hoặc ngắm toàn cảnh công trình.',
    'replaymod': 'Quay phim hành trình chơi game dưới dạng 3D: Xem lại từ mọi góc máy, làm video tua nhanh (Timelapse) xây dựng tuyệt đẹp.',
    'flashback': 'Quay và dựng phim 3D trong Minecraft thế hệ mới: Ghi lại toàn bộ thế giới với dung lượng siêu nhẹ và trình chỉnh sửa góc quay trực quan.',
    'ears': 'Cho phép gắn thêm tai mèo, tai cáo, sừng, đuôi, cánh và phụ kiện 3D trực tiếp lên nhân vật từ file ảnh Skin.',
    'capes': 'Hiển thị đầy đủ áo choàng (Capes) của OptiFine, LabyMod, MinecraftCapes và Mojang cho mọi người chơi trong game.',
    'custom-skin-loader': 'Đồng bộ và hiển thị Skin HD, Áo choàng (Capes) từ nhiều nguồn máy chủ cho cả chế độ Offline/Crack lẫn Multiplayer.',
    'fabrishot': 'Chụp ảnh màn hình (Screenshot) độ phân giải siêu cao 4K / 8K sắc nét gấp nhiều lần kích thước màn hình thực tế.',
    'advancement-plaques': 'Thay thế thông báo Thành tựu (Advancements) góc trên bằng biểu ngữ huy chương vàng kèm hiệu ứng âm thanh sang trọng.',
    'iceberg': 'Thư viện đồ họa và sự kiện nền tảng cần thiết cho các Mod giao diện của Grend_G như Advancement Plaques, Legendary Tooltips.',
    'prism-lib': 'Thư viện xử lý màu sắc, hiệu ứng chuyển màu (Gradients) và viền khung giao diện cho các Mod trang trí HUD.',
    'legendary-tooltips': 'Làm đẹp khung thông tin vật phẩm (Tooltips): Thêm viền kim loại, vương miện và màu sắc phân cấp độ hiếm cho vũ khí, trang bị.',
    'betterf3': 'Biến màn hình thông số kỹ thuật F3 rối mắt thành bảng thông tin màu sắc chia từng nhóm rõ ràng, trực quan dễ đọc.',
    'chat-heads': 'Hiển thị ảnh đại diện khuôn mặt 3D của người chơi ngay trước mỗi dòng tin nhắn trong khung Chat.',
    'no-chat-reports': 'Bảo vệ quyền riêng tư trong khung Chat: Gỡ bỏ chữ ký mã hóa báo cáo tin nhắn để bạn trò chuyện an toàn trên các Server.',
    'entity-model-features': 'Hỗ trợ mô hình sinh vật tùy chỉnh (CEM - Custom Entity Models) giống OptiFine, cần thiết để chạy gói Fresh Animations.',
    'entity-texture-features': 'Hỗ trợ kết cấu sinh vật ngẫu nhiên, phát sáng trong đêm và chớp mắt (OptiFine ETF), dùng chung với Entity Model Features.',
    'cit-resewn': 'Cho phép gói tài nguyên đổi hình dạng vũ khí/vật phẩm khi đổi tên trong Đe (Anvil) hoặc phù phép giống tính năng CIT của OptiFine.',
    'polytone': 'Tùy chỉnh màu sắc bầu trời, sương mù, ánh sáng, màu nước và âm thanh theo từng quần xã cho các gói Resource Pack.',
    'fusion-connected-textures': 'Thư viện kết nối bề mặt khối vuông (Connected Textures) và mô hình nâng cao cho các gói Resource Pack thế hệ mới.',
    'chipped': 'Thêm hơn 10.000 biến thể khối trang trí đẹp mắt (gỗ chạm khắc, gạch hoa văn, kính màu, đèn lồng) dành cho tín đồ xây nhà.',
    'macaws-furniture': 'Thêm hàng trăm món đồ nội thất: Bàn ghế, tủ quần áo, kệ tivi, bàn làm việc, ghế sofa nhiều loại gỗ để trang trí nhà cửa.',
    'macaws-bridges': 'Thêm các loại cầu gỗ, cầu dây văng, cầu đá cổ điển và cầu đường sắt với lan can đẹp mắt để bắc qua sông, hẻm núi.',
    'macaws-doors': 'Thêm hàng chục mẫu cửa mới: Cửa trượt kiểu Nhật, cửa kính hiện đại, cửa hầm ngục, cửa chuồng trại và cửa cổng lâu đài.',
    'handcrafted': 'Bộ sưu tập nội thất phong cách châu Âu cổ điển: Ghế đệm, bàn ăn, tủ kệ, cúp trang trí, tượng đá và chậu cây cảnh tinh xảo.',
    'supplementaries': 'Thêm hàng trăm vật dụng thông minh hợp phong cách gốc: Biển chỉ đường, lọ thủy tinh, quả địa cầu, đồng hồ, bệ trưng bày và ròng rọc.',
    'moonlight': 'Thư viện cốt lõi cung cấp hệ thống dữ liệu bản đồ và vật phẩm động cho Supplementaries và các Mod trang trí.',
    'artifacts': 'Thêm các cổ vật và trang sức phép thuật quý hiếm nằm trong rương kho báu ngầm, mang lại kỹ năng đặc biệt khi đeo lên người.',
    'better-combat': 'Đại tu hệ thống chiến đấu cận chiến: Thêm hoạt ảnh vung kiếm hai tay, đâm giáo, chém vòng cung mượt mà như Minecraft Dungeons.',
    'bettercombat': 'Đại tu hệ thống chiến đấu cận chiến: Thêm hoạt ảnh vung kiếm hai tay, đâm giáo, chém vòng cung mượt mà như Minecraft Dungeons.',
    'playeranimator': 'Thư viện hoạt ảnh nhân vật giúp hiển thị các động tác múa kiếm, né đòn và tung chiêu thức của Better Combat.',
    'simply-swords': 'Thêm hơn 50 loại vũ khí cận chiến mới: Đại kiếm, song đao, lưỡi hái, thương dài, katana cùng vũ khí huyền thoại có kỹ năng riêng.',
    'corpse': 'Khi nhân vật chết sẽ để lại một bộ xương giữ toàn bộ đồ đạc bên trong, không bao giờ lo đồ bị cháy mất hay biến mất sau 5 phút.',
    'youre-in-grave-danger': 'Tạo một ngôi mộ tại đúng vị trí bạn tử trận để bảo quản nguyên vẹn toàn bộ trang bị và trả lại đúng từng ô khi bấm nhận lại.',
    'comforts': 'Thêm Túi Ngủ (ngủ qua đêm ngoài trời mà không làm mất điểm hồi sinh ở nhà) và Võng (ngủ ban ngày để tua nhanh đến ban đêm).',
    'polymorph': 'Cho phép bấm nút chọn món đồ muốn ghép khi có 2 công thức chế tạo trùng nguyên liệu nhau giữa các Mod.',
    'cherished-worlds': 'Cho phép gắn dấu Sao yêu thích để ghim thế giới quan trọng lên đầu danh sách và khóa bảo vệ không cho bấm xóa nhầm.',
    'better-advancements': 'Mở rộng cửa sổ Thành tựu (Advancements) rộng toàn màn hình với biểu tượng trực quan và xem rõ tiến độ từng nhiệm vụ.',
    'patchouli': 'Thư viện tạo sách hướng dẫn minh họa trực quan ngay trong game cho các Mod phép thuật và công nghệ.',
    'owo-lib': 'Thư viện giao diện (UI) và mạng hiện đại trên Fabric giúp các Mod tạo bảng điều khiển mượt mà.',
    'cardinal-components-api': 'Thư viện lưu trữ dữ liệu đính kèm thực thể, người chơi và thế giới cho các Mod lớn trên Fabric.',
    'placeholder-api': 'Thư viện hỗ trợ hiển thị biến văn bản động (tên người chơi, máu, ping, thời gian) trên bảng điểm và khung chat.',
    'midnightlib': 'Thư viện gọn nhẹ cung cấp giao diện chỉnh cài đặt (Config) tự động cho hàng chục Mod tiện ích.',
    'rightclickharvest': 'Thu hoạch nông sản bằng 1 cú Chuột Phải: Tự động hái lúa, cà rốt, khoai tây chín và trồng lại hạt giống ngay tại chỗ.',
    'complementary-unbound': 'Gói Shader đẹp và phổ biến nhất thế giới: Nước biển gợn sóng 3D, mây bồng bềnh chân thực, ánh nắng xuyên tán lá tuyệt đẹp.',
    'complementary-reimagined': 'Gói Shader giữ trọn vẹn phong cách khối vuông gốc của Minecraft (mây vuông, nước trong) nhưng nâng cấp ánh sáng và bóng đổ lung linh.',
    'bsl-shaders': 'Gói Shader kinh điển với tông màu ấm áp, ánh sáng dịu mắt, mặt nước trong vắt và tối ưu FPS cực tốt cho máy tầm trung.',
    'solas-shader': 'Gói Shader huyền ảo với hiệu ứng bầu trời đêm đầy tinh vân, cực quang rực rỡ, ánh sáng màu và sương mù điện ảnh.',
    'bliss-shader': 'Gói Shader bầu khí quyển động: Sương mù thay đổi theo thời tiết, ánh nắng hoàng hôn/bình minh chân thực và hỗ trợ Distant Horizons.',
    'makeup-ultra-fast': 'Gói Shader siêu nhẹ dành riêng cho máy yếu / Card Onboard: Vẫn có bóng đổ, nước đẹp và lá cây đung đưa mà giữ FPS cực cao.',
    'super-duper-vanilla': 'Gói Shader phong cách trailer chính thức của Mojang với ánh sáng rực rỡ, bóng đổ sắc nét và hiệu ứng mặt nước sống động.',
    'fresh-animations': 'Biến toàn bộ Dân làng, Quái vật và Động vật trong Minecraft có chuyển động bước đi, chớp mắt, lắc đầu sống động như phim hoạt hình!',
    'faithful-32x': 'Nâng cấp độ phân giải toàn bộ khối vuông và vật phẩm từ 16x16 lên 32x32 sắc nét gấp đôi nhưng vẫn giữ nguyên nét vẽ gốc.',
    'faithful-64x': 'Gói đồ họa độ phân giải cao 64x64 siêu nét, làm mịn chi tiết mọi khối vuông mà không làm mất bản sắc Minecraft gốc.',
    'bare-bones': 'Đưa đồ họa Minecraft về phong cách tối giản, tươi sáng và mịn màng giống hệt trong các video Trailer chính thức của Mojang.',
    'stay-true': 'Tinh chỉnh lại kết cấu khối vuông gốc: Thêm lá cây rậm rạp, hoa cỏ đa dạng và chuyển màu địa hình tự nhiên, hài hòa hơn.',
    'unique-dark': 'Chuyển toàn bộ giao diện túi đồ, rương, bàn chế tạo và menu sang tông màu Tối (Dark Mode) dịu mắt khi chơi ban đêm.',
    'low-on-fire': 'Hạ thấp ngọn lửa trên màn hình khi nhân vật bị cháy để không che khuất tầm nhìn lúc đang chiến đấu PvP hoặc đi Nether.',
    'glowing-ores': 'Làm các mạch quặng (Kim cương, Sắt, Vàng, Ngọc lục bảo...) có viền phát sáng nhẹ trong bóng tối để dễ nhận biết khi đào mỏ.'
  };

  function getVietnameseModExplanation(item, projectType) {
    const slugLower = String(item.slug || '').toLowerCase();
    const cleanSlug = slugLower.replace(/-(fabric|forge|neoforge|quilt|mod|pack)$/i, '');
    if (MOD_DESC_VI_MAP[slugLower]) return MOD_DESC_VI_MAP[slugLower];
    if (MOD_DESC_VI_MAP[cleanSlug]) return MOD_DESC_VI_MAP[cleanSlug];

    const raw = String(item.description || '').trim();
    const text = `${item.title || ''} ${raw} ${(item.categories || []).join(' ')}`.toLowerCase();
    const numMatch = raw.match(/\b(\d+\+?)\b/);
    const numStr = numMatch && parseInt(numMatch[1], 10) >= 3 ? `hơn ${numMatch[1]} ` : '';

    if (projectType === 'shader') {
      const sFeats = [];
      if (/low|potato|fast|fps|performance|lightweight/.test(text)) sFeats.push('tối ưu nhẹ máy giữ FPS cao');
      if (/water|wave|reflection/.test(text)) sFeats.push('mặt nước phản chiếu 3D');
      if (/cloud|sky|aurora|atmosphere|fog/.test(text)) sFeats.push('bầu trời, mây & sương mù điện ảnh');
      if (/shadow|light|sun|ray|pbr|bloom/.test(text)) sFeats.push('ánh nắng & bóng đổ thời gian thực');
      if (/vanilla|reimagined|cartoon|fantasy/.test(text)) sFeats.push('giữ nét thẩm mỹ hài hòa với Minecraft gốc');
      if (sFeats.length > 0) {
        return `Gói Shader nâng cấp đồ họa: Mang lại hiệu ứng ${sFeats.slice(0, 3).join(', ')} giúp thế giới Minecraft lung linh hơn.`;
      }
      return 'Gói Shader nâng cấp đồ họa ánh sáng: Hiệu ứng bóng đổ thời gian thực, mặt nước phản chiếu lung linh và bầu trời sống động.';
    }

    if (projectType === 'resourcepack') {
      const rFeats = [];
      if (/32x|64x|128x|hd|faithful|resolution/.test(text)) rFeats.push('nâng cấp độ phân giải sắc nét');
      if (/gui|hud|dark|menu|inventory/.test(text)) rFeats.push('làm đẹp giao diện túi đồ & menu');
      if (/3d|model|animation|entity|fresh/.test(text)) rFeats.push('bổ sung mô hình 3D & hoạt ảnh sinh động');
      if (/pvp|fps|short sword|low fire|clear|ore/.test(text)) rFeats.push('tối ưu tầm nhìn rõ ràng cho PvP & đào mỏ');
      if (/sound|audio|music|ambient/.test(text)) rFeats.push('cải thiện hiệu ứng âm thanh chân thực');
      if (rFeats.length > 0) {
        return `Gói Resource Pack đồ họa: Giúp ${rFeats.slice(0, 3).join(', ')} mà vẫn giữ trải nghiệm mượt mà.`;
      }
      return 'Gói tài nguyên đồ họa (Resource Pack): Làm mới kết cấu khối vuông, vật phẩm, mô hình và giao diện trong game đẹp mắt hơn.';
    }

    const features = [];
    if (/\b(library|api|core|config|framework|dependency|hook|shared code|kotlin)\b/.test(text) && !/\b(biome|weapon|boss|dungeon)\b/.test(text)) {
      return 'Thư viện nền tảng & cấu hình (API/Core): Hỗ trợ kỹ thuật bắt buộc giúp các Mod phụ thuộc khác khởi chạy ổn định trong Minecraft.';
    }
    if (/\b(fps|performance|lag|stutter|optimize|optimization|cull|culling|memory|ram|tick|chunk load|render engine|fast)\b/.test(text)) {
      features.push('tối ưu hiệu năng, tăng FPS và giảm giật lag/tiêu thụ RAM');
    }
    if (/\b(minimap|world map|waypoint|compass|radar|map)\b/.test(text)) {
      features.push('hiển thị bản đồ định vị, đánh dấu tọa độ (Waypoint) và dẫn đường');
    }
    if (/\b(recipe|jei|rei|emi|crafting|smelt|anvil|disenchant)\b/.test(text)) {
      features.push('tra cứu & mở rộng công thức chế tạo, rèn đúc vật phẩm tiện lợi');
    }
    if (/\b(backpack|chest|storage|inventory|sort|shulker|bag|crate|vault)\b/.test(text)) {
      features.push('mở rộng ba lô, rương chứa đồ và sắp xếp quản lý kho vật phẩm thông minh');
    }
    if (/\b(dragon|boss|monster|mob|creature|animal|wildlife|pet|wolf|dog|cat|bird|fish)\b/.test(text)) {
      features.push(`bổ sung ${numStr}sinh vật, động vật hoang dã và Boss chiến đấu mới`);
    }
    if (/\b(sword|weapon|combat|armor|shield|bow|crossbow|gun|pvp|attack|spear|dagger|katana|damage)\b/.test(text)) {
      features.push(`thêm ${numStr}vũ khí, giáp trụ và nâng cấp kỹ năng chiến đấu PvP/săn Boss`);
    }
    if (/\b(biome|terrain|worldgen|dimension|cave|nether|end|village|structure|dungeon|temple|tower|castle|ruin)\b/.test(text)) {
      features.push(`mở rộng thế giới với ${numStr}quần xã (Biome), hầm ngục và công trình kiến trúc mới`);
    }
    if (/\b(furniture|decor|chair|table|lamp|roof|bridge|window|door|building|chisel|statue|plushie|painting)\b/.test(text)) {
      features.push(`thêm ${numStr}đồ nội thất, vật phẩm trang trí và khối kiến trúc xây dựng nhà cửa`);
    }
    if (/\b(farm|food|crop|cook|kitchen|meal|tree|harvest|fishing|bake|fruit|tea|coffee|wine)\b/.test(text)) {
      features.push('mở rộng hệ thống trồng trọt, thu hoạch nông trại và chế biến ẩm thực');
    }
    if (/\b(magic|spell|mana|wand|enchant|potion|alchemy|ritual|artifact|trinket|ring|amulet|relic)\b/.test(text)) {
      features.push('bổ sung phép thuật, phù phép (Enchantments) và cổ vật mang năng lực đặc biệt');
    }
    if (/\b(machine|tech|energy|power|automation|pipe|factory|train|vehicle|car|plane|aircraft|ship|boat|redstone|gear)\b/.test(text)) {
      features.push('bổ sung máy móc công nghệ, tự động hóa dây chuyền và phương tiện di chuyển');
    }
    if (/\b(animation|3d|skin|cape|camera|first-person|first person|third person|particle|visual|sound|audio|footstep|voice|chat)\b/.test(text)) {
      features.push('nâng cấp hoạt ảnh chuyển động 3D, hiệu ứng hình ảnh, âm thanh và giao tiếp trong game');
    }
    if (/\b(zoom|keybind|tooltip|hud|gui|menu|screenshot|f3|grave|corpse|sleep|bed|villager|trade|xp|experience|vein|tree)\b/.test(text)) {
      features.push('cải tiến giao diện HUD, phím tắt và bổ sung các tiện ích hỗ trợ sinh tồn mượt mà');
    }

    if (features.length > 0) {
      const joined = features.slice(0, 2).join(', kết hợp ');
      return `Mod giúp ${joined} cho thế giới Minecraft của bạn.`;
    }
    return 'Mod mở rộng tính năng, bổ sung nội dung và cải thiện trải nghiệm lối chơi trong thế giới Minecraft.';
  }

  const cardsHtml = state.modAccumulatedHits.map((item) => {
    const dl = item.downloads > 1000000 ? `${(item.downloads / 1000000).toFixed(1)}M tải` : `${Math.max(1, Math.round(item.downloads / 1000))}K tải`;
    const activeLoaderKey = String(state.selectedCore || 'fabric').toLowerCase();
    const rawCats = (item.categories || []).map((c) => String(c || '').toLowerCase()).filter((c) => c && !HIDDEN_RETRO_TAGS.has(c));
    const loaderCats = rawCats.filter((c) => ['fabric', 'forge', 'quilt', 'neoforge', 'iris', 'optifine'].includes(c));
    const featureCats = rawCats.filter((c) => !['fabric', 'forge', 'quilt', 'neoforge', 'iris', 'optifine'].includes(c));
    const pickedLoader = state.activeModStoreType === 'mod'
      ? (loaderCats.includes(activeLoaderKey) ? [activeLoaderKey] : loaderCats.slice(0, 1))
      : [];
    // Never show conflicting loader tags (like NeoForge / Forge / Quilt) when filtering by activeLoaderKey (e.g. Fabric)
    const orderedCats = [...pickedLoader, ...featureCats].slice(0, 3);
    const tags = orderedCats
      .map((key) => `<span class="mod-tag">${TAG_VI_MAP[key] || key}</span>`)
      .join('');
    const slugLower = (item.slug || '').toLowerCase();
    const matchedLocal = localItems.find((li) => {
      if (li.slug && li.slug.toLowerCase() === slugLower) return true;
      const n = li.cleanName.toLowerCase();
      return n.includes(slugLower) || n.startsWith(slugLower.split('-')[0] + '-');
    });
    let isInstalledExact = false;
    let isInstalledOtherVer = '';
    if (matchedLocal) {
      if (state.activeModStoreType !== 'mod') {
        isInstalledExact = true;
      } else if (Array.isArray(matchedLocal.gameVersions) && matchedLocal.gameVersions.length > 0) {
        if (matchedLocal.gameVersions.includes(activeVer)) isInstalledExact = true;
        else isInstalledOtherVer = matchedLocal.mcVersion || matchedLocal.gameVersions[0] || 'khác';
      } else if (matchedLocal.mcVersion) {
        if (matchedLocal.mcVersion === activeVer) isInstalledExact = true;
        else isInstalledOtherVer = matchedLocal.mcVersion;
      } else {
        isInstalledExact = true;
      }
    }
    const btnText = isInstalledExact
      ? `✓ Đã Cài (${activeVer})`
      : (isInstalledOtherVer ? `🔄 Đổi sang ${activeVer}` : `⬇ Tải (${activeVer})`);
    const btnTitle = isInstalledOtherVer
      ? `Đang có bản ${isInstalledOtherVer} trong máy — Bấm để tự động tải và đổi sang bản ${activeVer}`
      : `Tự động chọn và cài đặt bản chuẩn cho Minecraft ${activeVer} (${state.selectedCore.toUpperCase()})`;
    const viDesc = getVietnameseModExplanation(item, state.activeModStoreType);
    const fullTooltip = item.description
      ? `${viDesc}\n\n[Mô tả gốc Modrinth]: ${item.description}`.replace(/"/g, '&quot;')
      : viDesc.replace(/"/g, '&quot;');
    return `<div class="mod-card">
      <div class="mod-card-top">
        <img class="mod-icon" src="${item.iconUrl || ''}" alt="" />
        <div class="mod-head-info">
          <div class="mod-title" title="${item.title}">${item.title}</div>
          <div class="mod-meta">bởi <strong>${item.author || 'Creator'}</strong> • ${dl}</div>
        </div>
      </div>
      <div class="mod-desc" title="${fullTooltip}">${viDesc}</div>
      <div class="mod-card-foot">
        <div class="mod-tags">${tags}</div>
        <button class="btn-install-mod ${isInstalledExact ? 'installed' : ''}" data-slug="${item.slug}" title="${btnTitle}">${btnText}</button>
      </div>
    </div>`;
  }).join('');

  const hasMore = state.modAccumulatedHits.length < totalHits && newHits.length > 0;
  const loadMoreHtml = hasMore
    ? `<div style="grid-column:1/-1;display:flex;justify-content:center;padding:14px 0 22px 0;">
         <button id="btnLoadMoreMods" class="btn-fps-boost-1click" style="padding:10px 28px;font-size:13px;">
           ➕ Xem Thêm 48 Gói Tiếp Theo (Đang hiện ${state.modAccumulatedHits.length} / ${totalHits.toLocaleString('vi-VN')}+ gói trên Modrinth)
         </button>
       </div>`
    : '';

  grid.innerHTML = cardsHtml + loadMoreHtml;

  const btnMore = document.getElementById('btnLoadMoreMods');
  if (btnMore) {
    btnMore.onclick = () => loadModrinthStore(true);
  }

  grid.querySelectorAll('.btn-install-mod').forEach((btn) => {
    btn.onclick = async () => {
      const cRes = await askUserAgreement({
        title: '📥 Xác Nhận Tải & Cài Đặt Tự Khớp Phiên Bản',
        message: `Bạn có đồng ý tự động tải và cài đặt gói "${btn.dataset.slug}" chuẩn phiên bản Minecraft ${state.selectedVersion} (${state.selectedCore.toUpperCase()}) kèm thư viện đi kèm vào máy không?`,
        agreeText: '✓ Đồng Ý Tải Về',
        cancelText: '✕ Không, Hủy'
      });
      if (!cRes.agreed) return;
      btn.disabled = true; btn.textContent = '⏳ Đang tải...';
      const r = await window.aetherAPI.installModrinth({ slug: btn.dataset.slug, projectType: state.activeModStoreType, mcVersion: state.selectedVersion, loaderType: state.selectedCore, gameDir: state.gameDir });
      if (r?.ok) {
        btn.textContent = `✓ Đã Cài (${state.selectedVersion})`;
        btn.classList.add('installed');
        btn.disabled = false;
        document.getElementById('statusText').textContent = `✓ Đã cài ${r.fileName} kèm thư viện tương thích cho Minecraft ${state.selectedVersion}!`;
        await refreshLocalAddonsCount();
      } else {
        btn.textContent = '⚠ Khác phiên bản';
        btn.title = r?.error || 'Không tương thích phiên bản đang chọn';
        btn.disabled = false;
        if (r?.error) document.getElementById('statusText').textContent = `⚠ ${r.error}`;
      }
    };
  });
}

async function renderLocalAddonsManager() {
  const listEl = document.getElementById('localAddonsList');
  if (!listEl) return;
  const res = await window.aetherAPI.listLocalAddons(state.gameDir, state.activeLocalFolder);
  const items = res?.items || [];
  await refreshLocalAddonsCount();
  if (items.length === 0) {
    listEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);">Chưa có file nào trong thư mục <strong>${state.activeLocalFolder}</strong>.</div>`;
    return;
  }
  const activeVer = state.selectedVersion || '1.21.4';
  listEl.innerHTML = items.map((item) => {
    const verTag = item.mcVersion
      ? `<span style="font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:99px;margin-left:8px;${item.mcVersion === activeVer || (item.gameVersions || []).includes(activeVer) ? 'background:rgba(16,185,129,0.14);color:#10b981;' : 'background:rgba(245,158,11,0.15);color:#f59e0b;'}">MC ${item.mcVersion}</span>`
      : '';
    return `<div class="addon-row"><div><strong style="font-size:12.5px;${item.enabled ? '' : 'text-decoration:line-through;opacity:0.6;'}">${item.cleanName}</strong>${verTag}<span style="font-size:11px;color:var(--text-muted);margin-left:8px;">${item.sizeKB} KB • ${item.enabled ? 'Đang Bật' : 'Đã Tắt (Tự cất)'}</span></div><div style="display:flex;gap:6px;"><button class="vtype-btn ${item.enabled ? 'active' : ''}" data-toggle="${item.name}">${item.enabled ? 'Đang Bật' : 'Bật Lại'}</button><button class="vtype-btn" style="color:#ef4444;" data-del="${item.name}">Xóa</button></div></div>`;
  }).join('');
  listEl.querySelectorAll('[data-toggle]').forEach((b) => { b.onclick = async () => { await window.aetherAPI.toggleLocalAddon(state.gameDir, state.activeLocalFolder, b.dataset.toggle); await renderLocalAddonsManager(); }; });
  listEl.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { await window.aetherAPI.deleteLocalAddon(state.gameDir, state.activeLocalFolder, b.dataset.del); await renderLocalAddonsManager(); }; });
}

function renderFavoriteServers() {
  const container = document.getElementById('favoriteServersList');
  if (!container) return;
  const badge = document.getElementById('activeServerBadge');
  if (badge) {
    badge.innerHTML = state.serverIp
      ? `Vào thẳng: <strong style="color:var(--accent);">${state.serverIp}</strong> <span id="btnClearActiveSrv" style="cursor:pointer;color:#ef4444;margin-left:4px;font-weight:800;" title="Hủy vào thẳng server">[✕]</span>`
      : 'Chế độ: Vào Menu chính';
    const clearBtn = document.getElementById('btnClearActiveSrv');
    if (clearBtn) clearBtn.onclick = () => setServerIpEverywhere('');
  }

  const allServers = state.favoriteServers || [];
  const catFilter = state.serverCategoryFilter || 'all';
  const filteredWithIdx = allServers
    .map((srv, idx) => ({ srv, idx }))
    .filter(({ srv }) => catFilter === 'all' || (srv.cat || 'vn') === catFilter);

  const countBadge = document.getElementById('serversCountBadge');
  if (countBadge) countBadge.textContent = `${filteredWithIdx.length} Server`;

  const catCounts = {
    all: allServers.length,
    vn: allServers.filter((s) => (s.cat || 'vn') === 'vn').length,
    crack: allServers.filter((s) => s.cat === 'crack').length,
    premium: allServers.filter((s) => s.cat === 'premium').length
  };
  document.querySelectorAll('#serverCategoryBar [data-srvcat]').forEach((btn) => {
    const c = btn.dataset.srvcat;
    if (c === 'all') btn.textContent = `Tất cả (${catCounts.all})`;
    else if (c === 'vn') btn.textContent = `🇻🇳 Việt Nam (${catCounts.vn})`;
    else if (c === 'crack') btn.textContent = `🔓 Quốc Tế Crack (${catCounts.crack})`;
    else if (c === 'premium') btn.textContent = `👑 Bản Quyền (${catCounts.premium})`;
  });

  if (filteredWithIdx.length === 0) {
    container.innerHTML = `<div class="empty-subpage-state">
      <div class="ess-icon">🌐</div>
      <div class="ess-title">Chưa có máy chủ Multiplayer nào trong danh mục này</div>
      <div class="ess-desc">Nhập tên và địa chỉ IP ở thanh bên trên rồi bấm <strong>+ Thêm Server</strong> để lưu máy chủ yêu thích.</div>
    </div>`;
    return;
  }
  container.innerHTML = filteredWithIdx.map(({ srv, idx }) => {
    const isSelected = state.serverIp === srv.ip;
    const pingInfo = (state.serverPingCache && state.serverPingCache[srv.ip]) || null;
    const latencyTag = pingInfo?.online && pingInfo.latencyMs ? `<span class="srv-latency-tag">${pingInfo.latencyMs}ms</span>` : '';
    const statusHtml = pingInfo
      ? (pingInfo.online
          ? `<span class="srv-ping-badge online">● ${(pingInfo.playersOnline || 0).toLocaleString('vi-VN')}/${(pingInfo.playersMax || 0).toLocaleString('vi-VN')} người</span>${latencyTag}`
          : `<span class="srv-ping-badge offline">● Ngoại tuyến</span>`)
      : `<span class="srv-ping-badge pending">⏳ Đang kiểm tra...</span>`;
    const iconHtml = pingInfo?.icon
      ? `<img class="srv-icon-img" src="${pingInfo.icon}" alt="" />`
      : `<div class="srv-icon-img srv-icon-fallback">🌐</div>`;
    const catBadge = srv.cat === 'premium'
      ? '<span class="srv-cat-pill premium">👑 Bản quyền</span>'
      : (srv.cat === 'crack' ? '<span class="srv-cat-pill crack">🔓 Crack Quốc Tế</span>' : '<span class="srv-cat-pill vn">🇻🇳 Việt Nam</span>');
    return `<div class="srv-card-row ${isSelected ? 'active' : ''}">
      <div class="srv-card-left">
        ${iconHtml}
        <div class="srv-card-meta">
          <div class="srv-title-line">
            <strong class="srv-name-text" title="${srv.name}">${srv.name}</strong>
            ${statusHtml}
          </div>
          <div class="srv-ip-line">${catBadge} • IP: <span>${srv.ip}</span></div>
        </div>
      </div>
      <div class="srv-card-actions">
        <button class="btn-install-mod ${isSelected ? 'installed' : ''}" data-joinsrv="${srv.ip}">${isSelected ? '✓ Đang chọn' : '▶ Tham gia'}</button>
        <div class="srv-secondary-btns">
          <button class="srv-icon-btn" data-copysrv="${srv.ip}" title="Sao chép địa chỉ IP: ${srv.ip}">📋</button>
          <button class="srv-icon-btn danger" data-delsrv="${idx}" title="Xóa máy chủ khỏi danh sách">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');
  container.querySelectorAll('[data-copysrv]').forEach((btn) => {
    btn.onclick = () => {
      navigator.clipboard?.writeText(btn.dataset.copysrv);
      const orig = btn.textContent;
      btn.textContent = '✓';
      document.getElementById('statusText').textContent = `📋 Đã sao chép địa chỉ IP: ${btn.dataset.copysrv}`;
      setTimeout(() => (btn.textContent = orig), 1400);
    };
  });
  container.querySelectorAll('[data-joinsrv]').forEach((btn) => {
    btn.onclick = () => {
      setServerIpEverywhere(btn.dataset.joinsrv);
      renderFavoriteServers();
      document.querySelector('.nav-item[data-tab="play"]').click();
      document.getElementById('statusText').textContent = `🌐 Đã chọn vào thẳng Server: ${btn.dataset.joinsrv} — Bấm CHƠI NGAY để kết nối!`;
    };
  });
  container.querySelectorAll('[data-delsrv]').forEach((btn) => {
    btn.onclick = () => { state.favoriteServers.splice(parseInt(btn.dataset.delsrv, 10), 1); renderFavoriteServers(); saveCurrentConfig(); };
  });
}

function renderHomeRecentWorlds(worlds = []) {
  const homeGrid = document.getElementById('homeRecentWorldsGrid');
  if (!homeGrid) return;
  const createCardHtml = `
    <button class="hw-create-card" id="btnHomeCreateWorldCard" title="Vào game tạo thế giới mới hoặc mở thư mục Saves">
      <div class="hw-create-plus">+</div>
      <div class="hw-create-label">Tạo thế giới mới</div>
      <div class="hw-create-sub">Bắt đầu hành trình</div>
    </button>
  `;
  const worldCards = worlds.slice(0, 4).map((w) => {
    const thumbUrl = w.iconDataUrl || 'app-banner-hero.png';
    return `
      <div class="hw-world-card" data-worldpath="${w.path}" title="Thế giới: ${w.name} (${w.lastPlayed})">
        <div class="hw-world-thumb" style="background-image:url('${thumbUrl}')"></div>
        <div class="hw-world-body">
          <div class="hw-world-info">
            <div class="hw-world-title">${w.name}</div>
            <div class="hw-world-sub">Chơi gần nhất: ${w.lastPlayed}</div>
          </div>
          <button class="hw-world-menu-btn" data-openworld="${w.path}" title="Mở thư mục thế giới này trong Explorer">⋮</button>
        </div>
      </div>
    `;
  });

  // If fewer than 4 local worlds exist, provide real actionable utility cards for remaining slots
  if (worldCards.length < 4) {
    worldCards.push(`
      <div class="hw-world-card" id="hwSyncExternalCard" title="Quét và đồng bộ thế giới từ TLauncher, Official, Modrinth, CurseForge, Prism">
        <div class="hw-world-thumb" style="background-image:url('app-banner-hero.png');background-size:280%;background-position:0% 70%;">
          <span class="hw-world-ver-tag">Đồng bộ</span>
        </div>
        <div class="hw-world-body">
          <div class="hw-world-info">
            <div class="hw-world-title">Đồng bộ Map Cũ</div>
            <div class="hw-world-sub">Từ Launcher khác trên máy</div>
          </div>
          <button class="hw-world-menu-btn" title="Mở trình đồng bộ">⋮</button>
        </div>
      </div>
    `);
  }
  if (worldCards.length < 4) {
    worldCards.push(`
      <div class="hw-world-card" id="hwOpenSavesDirCard" title="Mở thư mục .minecraft/saves trong Windows Explorer">
        <div class="hw-world-thumb" style="background-image:url('app-banner-hero.png');background-size:280%;background-position:100% 55%;">
          <span class="hw-world-ver-tag">.minecraft</span>
        </div>
        <div class="hw-world-body">
          <div class="hw-world-info">
            <div class="hw-world-title">Thư mục Saves</div>
            <div class="hw-world-sub">Quản lý file bản đồ trực tiếp</div>
          </div>
          <button class="hw-world-menu-btn" title="Mở thư mục Saves">⋮</button>
        </div>
      </div>
    `);
  }
  if (worldCards.length < 4) {
    worldCards.push(`
      <div class="hw-world-card" id="hwExploreModpackCard" title="Tải Modpack & Thế giới phiêu lưu từ kho Modrinth">
        <div class="hw-world-thumb" style="background-image:url('app-banner-hero.png');background-size:280%;background-position:58% 0%;">
          <span class="hw-world-ver-tag">Modrinth</span>
        </div>
        <div class="hw-world-body">
          <div class="hw-world-info">
            <div class="hw-world-title">Kho Mod & Pack</div>
            <div class="hw-world-sub">Khám phá gói mở rộng</div>
          </div>
          <button class="hw-world-menu-btn" title="Mở Kho Modrinth">⋮</button>
        </div>
      </div>
    `);
  }

  homeGrid.innerHTML = createCardHtml + worldCards.slice(0, 4).join('');

  const btnCreate = document.getElementById('btnHomeCreateWorldCard');
  if (btnCreate) {
    btnCreate.onclick = () => {
      const playBtn = document.getElementById('btnLaunch');
      if (playBtn && !state.isLaunching) playBtn.click();
    };
  }
  homeGrid.querySelectorAll('[data-openworld]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      window.aetherAPI.openGameDir(btn.dataset.openworld);
    };
  });
  homeGrid.querySelectorAll('.hw-world-card[data-worldpath]').forEach((card) => {
    card.onclick = () => {
      window.aetherAPI.openGameDir(card.dataset.worldpath);
    };
  });
  const syncCard = document.getElementById('hwSyncExternalCard');
  if (syncCard && typeof openLauncherMigrateModal === 'function') {
    syncCard.onclick = () => openLauncherMigrateModal();
  }
  const savesCard = document.getElementById('hwOpenSavesDirCard');
  if (savesCard) {
    savesCard.onclick = () => window.aetherAPI.openSubFolder(state.gameDir, 'saves');
  }
  const modCard = document.getElementById('hwExploreModpackCard');
  if (modCard) {
    modCard.onclick = () => document.querySelector('.nav-item[data-tab="mods"]')?.click();
  }
}

async function renderLocalWorlds() {
  const res = await window.aetherAPI.listLocalWorlds(state.gameDir);
  const worlds = res?.worlds || [];
  renderHomeRecentWorlds(worlds);
  const container = document.getElementById('localWorldsList');
  if (!container) return;
  const countBadge = document.getElementById('worldsCountBadge');
  if (countBadge) countBadge.textContent = `${worlds.length} Map`;
  if (worlds.length === 0) {
    container.innerHTML = `<div class="empty-subpage-state">
      <div class="ess-icon">🌍</div>
      <div class="ess-title">Chưa có thế giới chơi đơn nào trong <code>.minecraft/saves</code></div>
      <div class="ess-desc">Khi bạn tạo Thế giới mới trong game hoặc đồng bộ từ Launcher cũ, bản đồ sẽ tự động xuất hiện tại đây.</div>
      <div class="ess-actions">
        <button class="vtype-btn" id="btnEmptyOpenSaves">📂 Mở thư mục Saves</button>
        <button class="vtype-btn active" id="btnEmptyMigrateWorlds">🔄 Đồng bộ Map từ Launcher cũ</button>
      </div>
    </div>`;
    const bSaves = document.getElementById('btnEmptyOpenSaves');
    if (bSaves) bSaves.onclick = () => window.aetherAPI.openSubFolder(state.gameDir, 'saves');
    const bMig = document.getElementById('btnEmptyMigrateWorlds');
    if (bMig && typeof openLauncherMigrateModal === 'function') bMig.onclick = () => openLauncherMigrateModal();
    return;
  }
  container.innerHTML = worlds.map((w) => `<div class="world-card-row">
    <div class="world-left">
      ${w.iconDataUrl ? `<img class="world-icon" src="${w.iconDataUrl}" alt="" />` : '<div class="world-icon world-icon-fallback">🌍</div>'}
      <div class="world-meta-col">
        <strong class="world-title-text" title="${w.name}">${w.name}</strong>
        <div class="world-sub-text">🕒 Lần chơi cuối: ${w.lastPlayed}</div>
      </div>
    </div>
    <div class="world-card-actions">
      <button class="vtype-btn" data-openworld="${w.path}" title="Mở thư mục bản đồ này trong Windows Explorer">📂 Mở Thư Mục</button>
    </div>
  </div>`).join('');
  container.querySelectorAll('[data-openworld]').forEach((btn) => { btn.onclick = () => window.aetherAPI.openGameDir(btn.dataset.openworld); });
}
async function pingAllFavoriteServers() {
  if (!state.serverPingCache) state.serverPingCache = {};
  const btn = document.getElementById('btnPingAllServers');
  if (btn) btn.textContent = '⏳ Đang ping...';
  await Promise.all(
    (state.favoriteServers || []).map(async (srv) => {
      try {
        const res = await window.aetherAPI.pingServer(srv.ip);
        if (res?.ok) state.serverPingCache[srv.ip] = res;
      } catch (_) {}
    })
  );
  if (btn) btn.textContent = '📡 Ping';
  renderFavoriteServers();
}

let selectedMigrateSourcePath = '';

async function openLauncherMigrateModal() {
  const modal = document.getElementById('launcherMigrateModal');
  const listEl = document.getElementById('migrateDetectedList');
  const statusEl = document.getElementById('migrateStatusNotice');
  const btnClose = document.getElementById('btnMigrateClose');
  const btnRun = document.getElementById('btnMigrateRunNow');
  const btnPick = document.getElementById('btnPickCustomMigrateDir');
  if (!modal || !listEl) return;

  modal.classList.remove('hidden');
  statusEl.textContent = '⏳ Đang quét các Launcher đã cài trên máy...';
  listEl.innerHTML = '<div style="padding:18px;text-align:center;color:var(--text-muted);">Đang tìm TLauncher, Official, Modrinth, CurseForge, Prism, Feather...</div>';

  const res = await window.aetherAPI.scanExternalLaunchers(state.gameDir);
  const items = res?.items || [];

  const renderCards = (list) => {
    if (!list.length) {
      listEl.innerHTML = '<div style="padding:18px;text-align:center;color:var(--text-muted);">Chưa tìm thấy thư mục tự động. Hãy bấm <strong>"📂 Chọn Thư Mục Khác..."</strong> ở góc trên để chọn thư mục game cũ!</div>';
      statusEl.textContent = 'Hãy chọn thư mục chứa dữ liệu Minecraft cũ của bạn.';
      return;
    }
    if (!selectedMigrateSourcePath || !list.some((x) => x.path === selectedMigrateSourcePath)) {
      const firstExternal = list.find((x) => !x.isSharedRoot);
      selectedMigrateSourcePath = (firstExternal || list[0]).path;
    }
    listEl.innerHTML = list.map((it) => {
      const active = it.path === selectedMigrateSourcePath;
      const accText = it.accounts?.length ? ` • 👤 Tên cũ: <strong>${it.accounts.slice(0, 4).join(', ')}</strong>` : '';
      const metaText = it.detectedVersion ? ` • 🎯 Bản: <strong>${it.detectedVersion} ${(it.detectedCore || '').toUpperCase()}</strong>` : '';
      const cfgText = it.configsCount ? ` • ⚙️ <strong>${it.configsCount}</strong> Config` : '';
      const sharedBadge = it.isSharedRoot
        ? '<span style="color:#10b981;font-weight:800;font-size:11.5px;">✓ Đang dùng chung .minecraft</span>'
        : '<span style="color:var(--accent);font-weight:800;font-size:11.5px;">📥 Có thể chép sang</span>';
      return `<div class="addon-row migrate-source-card" data-migpath="${it.path}" style="cursor:pointer;border:1.8px solid ${active ? 'var(--accent)' : 'var(--border-col)'};background:${active ? 'var(--accent-glow)' : 'var(--bg-input)'};padding:12px 14px;border-radius:10px;">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <strong style="font-size:13.5px;color:var(--text-main);">${it.launcherName} — ${it.instanceName}</strong>
            ${sharedBadge}
          </div>
          <div style="font-size:12px;color:var(--text-muted);">
            🌍 <strong>${it.worldsCount}</strong> Thế giới • 🧩 <strong>${it.modsCount}</strong> Mods${cfgText} • ✨ <strong>${it.shadersCount + it.packsCount}</strong> Shaders/Packs${metaText}${accText}
          </div>
          <div style="font-size:11px;color:var(--text-muted);opacity:0.8;">📂 ${it.path}</div>
        </div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.migrate-source-card').forEach((card) => {
      card.onclick = () => {
        selectedMigrateSourcePath = card.dataset.migpath;
        renderCards(list);
      };
    });
    statusEl.textContent = `✓ Đã phát hiện ${list.length} nguồn dữ liệu Minecraft trên máy.`;
  };

  renderCards(items);

  btnClose.onclick = () => modal.classList.add('hidden');

  btnPick.onclick = async () => {
    const pickRes = await window.aetherAPI.pickCustomLauncherDir();
    if (pickRes?.ok && pickRes.dirPath) {
      selectedMigrateSourcePath = pickRes.dirPath;
      items.unshift({
        id: 'custom-' + Date.now(),
        launcherName: 'Thư mục tùy chọn',
        instanceName: pickRes.dirPath.split(/[\\/]/).pop() || 'Custom',
        path: pickRes.dirPath,
        isSharedRoot: false,
        worldsCount: '?',
        modsCount: '?',
        shadersCount: 0,
        packsCount: '?',
        versionsCount: '?',
        accounts: []
      });
      renderCards(items);
    }
  };

  btnRun.onclick = async () => {
    if (!selectedMigrateSourcePath) return;
    btnRun.disabled = true;
    btnRun.textContent = '⏳ Đang đồng bộ...';
    statusEl.textContent = '⏳ Đang đồng bộ Thế giới, Mods, Server & Tài khoản sang BlockWay Launcher...';
    const imp = await window.aetherAPI.importExternalLauncher({
      sourceDir: selectedMigrateSourcePath,
      targetGameDir: state.gameDir,
      syncWorlds: Boolean(document.getElementById('chkMigrateWorlds')?.checked),
      syncMods: Boolean(document.getElementById('chkMigrateMods')?.checked),
      syncShadersPacks: Boolean(document.getElementById('chkMigratePacks')?.checked),
      syncServersOptions: Boolean(document.getElementById('chkMigrateServers')?.checked)
    });
    btnRun.disabled = false;
    btnRun.textContent = '⚡ Đồng Bộ Ngay (1-Click)';

    if (imp?.ok) {
      const st = imp.stats || {};
      if (document.getElementById('chkMigrateServers')?.checked) {
        if (Array.isArray(st.accountsFound) && st.accountsFound.length > 0) {
          for (const acc of st.accountsFound) {
            if (!state.savedAccounts.some((a) => a.toLowerCase() === acc.toLowerCase())) {
              state.savedAccounts.push(acc);
            }
          }
          if (!imp.isSameDir && st.accountsFound[0]) {
            state.username = st.accountsFound[0];
            const uInp = document.getElementById('usernameInput');
            if (uInp) uInp.value = state.username;
            if (typeof loadCharacterSkin === 'function') loadCharacterSkin(state.username);
            if (typeof updateCrackUuidPreview === 'function') updateCrackUuidPreview(state.username);
          }
          renderSavedAccounts();
        }
        if (Array.isArray(st.serversFound) && st.serversFound.length > 0) {
          for (const srv of st.serversFound) {
            if (!state.favoriteServers.some((s) => s.ip.toLowerCase() === srv.ip.toLowerCase())) {
              state.favoriteServers.push(srv);
            }
          }
          renderFavoriteServers();
        }
      }
      if (st.detectedVersion) {
        state.selectedVersion = st.detectedVersion;
        const verSel = document.getElementById('versionSelect');
        if (verSel) verSel.value = st.detectedVersion;
      }
      if (st.detectedCore && typeof setCore === 'function') {
        setCore(st.detectedCore);
      } else if (typeof updateSummaryUI === 'function') {
        updateSummaryUI();
      }
      saveCurrentConfig();
      await refreshInstalledVersions();
      await refreshLocalAddonsCount();
      await renderLocalWorlds();
      const msg = imp.isSameDir
        ? `✓ Đã đồng bộ trực tiếp thư mục .minecraft (${st.worldsCopied} Thế giới, ${st.modsCopied} Mods, ${st.accountsFound?.length || 0} Tài khoản cũ)!`
        : `✓ Hoàn tất! Đã chuyển ${st.worldsCopied} Thế giới, ${st.modsCopied} Mods, ${st.configsCopied || 0} Config, ${st.packsCopied} Shaders/Packs & ${st.accountsFound?.length || 0} Tài khoản sang BlockWay Launcher!`;
      statusEl.textContent = msg;
      document.getElementById('statusText').textContent = msg;
    } else {
      statusEl.textContent = `⚠ Lỗi: ${imp?.error || 'Không thể đồng bộ thư mục này.'}`;
    }
  };
}
