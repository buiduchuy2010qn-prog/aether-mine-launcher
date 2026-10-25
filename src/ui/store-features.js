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
  const canvas = document.getElementById('avatar2dCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const img = new Image();
  img.onload = () => {
    const off = document.createElement('canvas');
    off.width = img.width || 64;
    off.height = img.height || 64;
    const octx = off.getContext('2d');
    octx.drawImage(img, 0, 0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 8, 8, 8, 8, 0, 0, canvas.width, canvas.height);

    try {
      // Only overlay hat layer (40, 8, 8, 8) if the hat region uses alpha transparency
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

      // Check if head (8,8,8,8) is a single solid color (like Dream's neon green skin)
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
        // Render Dream-style framed avatar: green border + white mask + pixel smiley eyes & mouth!
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
    ' vanilla-like': 'Chuẩn gốc'
  };

  const cardsHtml = state.modAccumulatedHits.map((item) => {
    const dl = item.downloads > 1000000 ? `${(item.downloads / 1000000).toFixed(1)}M tải` : `${Math.max(1, Math.round(item.downloads / 1000))}K tải`;
    const tags = (item.categories || [])
      .slice(0, 3)
      .map((c) => {
        const key = String(c || '').toLowerCase();
        return `<span class="mod-tag">${TAG_VI_MAP[key] || c}</span>`;
      })
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
    return `<div class="mod-card">
      <div class="mod-card-top">
        <img class="mod-icon" src="${item.iconUrl || ''}" alt="" />
        <div class="mod-head-info">
          <div class="mod-title" title="${item.title}">${item.title}</div>
          <div class="mod-meta">bởi <strong>${item.author || 'Creator'}</strong> • ${dl}</div>
        </div>
      </div>
      <div class="mod-desc" title="${(item.description || '').replace(/"/g, '&quot;')}">${item.description || 'Gói nội dung mở rộng chính thức từ kho Modrinth.'}</div>
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

async function renderLocalWorlds() {
  const container = document.getElementById('localWorldsList');
  if (!container) return;
  const res = await window.aetherAPI.listLocalWorlds(state.gameDir);
  const worlds = res?.worlds || [];
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
    statusEl.textContent = '⏳ Đang đồng bộ Thế giới, Mods, Server & Tài khoản sang Aether Craft...';
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
        : `✓ Hoàn tất! Đã chuyển ${st.worldsCopied} Thế giới, ${st.modsCopied} Mods, ${st.configsCopied || 0} Config, ${st.packsCopied} Shaders/Packs & ${st.accountsFound?.length || 0} Tài khoản sang Aether Craft!`;
      statusEl.textContent = msg;
      document.getElementById('statusText').textContent = msg;
    } else {
      statusEl.textContent = `⚠ Lỗi: ${imp?.error || 'Không thể đồng bộ thư mục này.'}`;
    }
  };
}
