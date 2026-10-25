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

  // 2) ELYTRA WING UV REGION (x: 22..46, y: 0..22 — Box UV u=22, v=0, w=10, h=20, d=2)
  // Sculpted 10x20 Minecraft Elytra curved wing silhouette (dx=0 outer edge .. dx=9 inner spine)
  const wingRows = [
    '..RRRRRRR.',
    '.RR11111RR',
    'RR1122211R',
    'R1122B221R',
    'R122BIB21R',
    'R12BIIIB1R',
    'R122BIB21R',
    'R1222B221R',
    'R12233211R',
    'R1223321R.',
    'R1233211R.',
    'R123B21R..',
    'R123211R..',
    'R13B21R...',
    'R13211R...',
    'R1321R....',
    '.R131R....',
    '.R11R.....',
    '..RRR.....',
    '...R......'
  ];
  const colorMap = {
    R: p.rim,
    '1': p.bg1,
    '2': p.bg2,
    '3': p.shade,
    B: p.border,
    I: p.icon
  };

  for (let dy = 0; dy < 20; dy++) {
    const row = wingRows[dy];
    for (let dx = 0; dx < 10; dx++) {
      const ch = row[dx];
      const col = colorMap[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      // Front (+z) wing face: x = 24..34, y = 2..22
      ctx.fillRect(24 + dx, 2 + dy, 1, 1);
      // Back (-z) wing face (mirrored horizontally so 3D silhouette matches front face): x = 36..46, y = 2..22
      ctx.fillRect(36 + (9 - dx), 2 + dy, 1, 1);
    }
    // Outer side edge (-x face, x: 22..24) only where outer rim (dx <= 1) is solid
    if (row[0] !== '.') {
      ctx.fillStyle = p.rim;
      ctx.fillRect(22, 2 + dy, 2, 1);
    }
    // Inner spine edge (+x face, x: 34..36) only where upper inner spine (dx === 9) is solid
    if (row[9] !== '.') {
      ctx.fillStyle = p.rim;
      ctx.fillRect(34, 2 + dy, 2, 1);
    }
  }
  // Top shoulder edge (+y face, x: 24..34, y: 0..2)
  ctx.fillStyle = p.rim;
  ctx.fillRect(26, 0, 7, 2);

  return c.toDataURL('image/png');
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
  const lowerNames = enabledItems.map((i) => i.cleanName.toLowerCase());
  const hasSodium = lowerNames.some((n) => n.startsWith('sodium-') || n.startsWith('embeddium-'));
  const hasLithium = lowerNames.some((n) => n.startsWith('lithium-') || n.startsWith('ferritecore-'));
  const btnHomeFps = document.getElementById('btnOneClickFpsBoost');
  const btnStoreFps = document.getElementById('btnStoreFpsBoost');
  const descEl = document.getElementById('fpsBoostStatusText');

  if (hasSodium && hasLithium) {
    if (btnHomeFps) {
      btnHomeFps.innerHTML = '<span>✓ Đã Cài Sẵn X3 FPS</span>';
      btnHomeFps.dataset.alreadyInstalled = 'true';
    }
    if (btnStoreFps) {
      btnStoreFps.innerHTML = '<span>✓ Đã Cài Sẵn Bộ X3 FPS</span>';
      btnStoreFps.dataset.alreadyInstalled = 'true';
    }
    if (descEl) {
      descEl.textContent = `✓ Bộ Mod X3 FPS (${enabledItems.length} Mod: Sodium, Lithium, Iris...) đã cài sẵn trong máy — Bấm CHƠI NGAY để vào game!`;
    }
  } else {
    if (btnHomeFps) {
      btnHomeFps.innerHTML = '<span>⚡ Cài Gói X3 FPS</span>';
      btnHomeFps.dataset.alreadyInstalled = 'false';
    }
    if (btnStoreFps) {
      btnStoreFps.innerHTML = '<span>⚡ Cài Trọn Bộ Mod X3 FPS</span>';
      btnStoreFps.dataset.alreadyInstalled = 'false';
    }
  }
}

async function loadModrinthStore() {
  const grid = document.getElementById('modrinthResultsGrid');
  const localWrap = document.getElementById('localAddonsWrap');
  if (state.activeModStoreType === 'installed') {
    grid.classList.add('hidden'); localWrap.classList.remove('hidden');
    await renderLocalAddonsManager(); return;
  }
  localWrap.classList.add('hidden'); grid.classList.remove('hidden');
  grid.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-muted);font-weight:700;">⏳ Đang tải kho dữ liệu từ Modrinth Official...</div>';
  const query = document.getElementById('modSearchInput')?.value.trim() || '';
  const res = await window.aetherAPI.searchModrinth({ query, projectType: state.activeModStoreType, mcVersion: state.selectedVersion, loaderType: state.selectedCore });
  if (!res?.ok || !res.hits?.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-muted);">Không tìm thấy kết quả phù hợp. Hãy thử từ khóa khác!</div>';
    return;
  }
  const folderMap = { mod: 'mods', shader: 'shaderpacks', resourcepack: 'resourcepacks' };
  const localCheck = await window.aetherAPI.listLocalAddons(state.gameDir, folderMap[state.activeModStoreType] || 'mods');
  const localNames = (localCheck?.items || []).map((i) => i.cleanName.toLowerCase());
  grid.innerHTML = res.hits.map((item) => {
    const dl = item.downloads > 1000000 ? `${(item.downloads / 1000000).toFixed(1)}M tải` : `${Math.round(item.downloads / 1000)}K tải`;
    const tags = (item.categories || []).map((c) => `<span class="mod-tag">${c}</span>`).join('');
    const slugLower = (item.slug || '').toLowerCase();
    const isInstalled = localNames.some((n) => n.includes(slugLower) || n.startsWith(slugLower.split('-')[0] + '-'));
    return `<div class="mod-card"><div class="mod-card-top"><img class="mod-icon" src="${item.iconUrl || ''}" alt="" /><div><div class="mod-title">${item.title}</div><div class="mod-meta">bởi ${item.author || 'Creator'} • ${dl}</div></div></div><div class="mod-desc">${item.description || ''}</div><div class="mod-card-foot"><div class="mod-tags">${tags}</div><button class="btn-install-mod ${isInstalled ? 'installed' : ''}" data-slug="${item.slug}">${isInstalled ? '✓ Đã Cài Sẵn' : '⬇ Tải 1-Click'}</button></div></div>`;
  }).join('');
  grid.querySelectorAll('.btn-install-mod').forEach((btn) => {
    btn.onclick = async () => {
      const cRes = await askUserAgreement({
        title: '📥 Xác Nhận Tải & Cài Đặt',
        message: `Bạn có đồng ý tải và cài đặt gói "${btn.dataset.slug}" cho phiên bản Minecraft ${state.selectedVersion} vào máy không?`,
        agreeText: '✓ Đồng Ý Tải Về',
        cancelText: '✕ Không, Hủy'
      });
      if (!cRes.agreed) return;
      btn.disabled = true; btn.textContent = '⏳ Đang tải...';
      const r = await window.aetherAPI.installModrinth({ slug: btn.dataset.slug, projectType: state.activeModStoreType, mcVersion: state.selectedVersion, loaderType: state.selectedCore, gameDir: state.gameDir });
      if (r?.ok) { btn.textContent = '✓ Đã Cài'; await refreshLocalAddonsCount(); }
      else { btn.textContent = '⚠ Lỗi'; btn.disabled = false; }
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
  listEl.innerHTML = items.map((item) => `<div class="addon-row"><div><strong style="font-size:12.5px;${item.enabled ? '' : 'text-decoration:line-through;opacity:0.6;'}">${item.cleanName}</strong><span style="font-size:11px;color:var(--text-muted);margin-left:8px;">${item.sizeKB} KB • ${item.enabled ? 'Đang Bật' : 'Đã Tắt'}</span></div><div style="display:flex;gap:6px;"><button class="vtype-btn ${item.enabled ? 'active' : ''}" data-toggle="${item.name}">${item.enabled ? 'Đang Bật' : 'Bật Lại'}</button><button class="vtype-btn" style="color:#ef4444;" data-del="${item.name}">Xóa</button></div></div>`).join('');
  listEl.querySelectorAll('[data-toggle]').forEach((b) => { b.onclick = async () => { await window.aetherAPI.toggleLocalAddon(state.gameDir, state.activeLocalFolder, b.dataset.toggle); await renderLocalAddonsManager(); }; });
  listEl.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { await window.aetherAPI.deleteLocalAddon(state.gameDir, state.activeLocalFolder, b.dataset.del); await renderLocalAddonsManager(); }; });
}

function renderFavoriteServers() {
  const container = document.getElementById('favoriteServersList');
  if (!container) return;
  const badge = document.getElementById('activeServerBadge');
  if (badge) {
    badge.innerHTML = state.serverIp
      ? `Đang chọn vào thẳng: <strong style="color:var(--accent);">${state.serverIp}</strong> <span id="btnClearActiveSrv" style="cursor:pointer;color:#ef4444;margin-left:4px;" title="Hủy vào thẳng server">[×]</span>`
      : 'Chế độ: Vào Menu chính bình thường';
    const clearBtn = document.getElementById('btnClearActiveSrv');
    if (clearBtn) clearBtn.onclick = () => setServerIpEverywhere('');
  }
  container.innerHTML = state.favoriteServers.map((srv, idx) => {
    const isSelected = state.serverIp === srv.ip;
    const pingInfo = (state.serverPingCache && state.serverPingCache[srv.ip]) || null;
    const statusHtml = pingInfo
      ? (pingInfo.online
          ? `<span class="srv-ping-badge online">🟢 ${pingInfo.playersOnline}/${pingInfo.playersMax} người</span>`
          : `<span class="srv-ping-badge offline">🔴 Offline</span>`)
      : `<span class="srv-ping-badge" style="color:var(--text-muted);">⏳ Đang ping...</span>`;
    const iconHtml = pingInfo?.icon
      ? `<img class="srv-icon-img" src="${pingInfo.icon}" alt="" />`
      : `<div class="srv-icon-img" style="display:grid;place-items:center;font-size:16px;background:var(--bg-card);">🌐</div>`;
    return `<div class="srv-card-row" style="${isSelected ? 'border-color:var(--accent);background:var(--accent-glow);' : ''}"><div style="display:flex;align-items:center;gap:10px;min-width:0;">${iconHtml}<div style="min-width:0;"><div style="display:flex;align-items:center;flex-wrap:wrap;"><strong style="font-size:12.5px;">${srv.name}</strong>${statusHtml}</div><div style="font-size:11px;color:var(--accent);font-weight:700;margin-top:2px;">IP: ${srv.ip}</div></div></div><div style="display:flex;gap:6px;align-items:center;flex-shrink:0;"><button class="vtype-btn" data-copysrv="${srv.ip}" title="Sao chép IP Server">📋 Copy</button><button class="btn-install-mod" data-joinsrv="${srv.ip}">${isSelected ? '✓ Đã Chọn' : '▶ Vào Server'}</button><button class="vtype-btn" data-delsrv="${idx}" style="color:#ef4444;" title="Xóa khỏi danh sách">×</button></div></div>`;
  }).join('');
  container.querySelectorAll('[data-copysrv]').forEach((btn) => {
    btn.onclick = () => {
      navigator.clipboard?.writeText(btn.dataset.copysrv);
      const orig = btn.textContent;
      btn.textContent = '✓ Đã Copy';
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
  if (worlds.length === 0) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Chưa có thế giới chơi đơn nào trong <code>.minecraft/saves</code>.</div>';
    return;
  }
  container.innerHTML = worlds.map((w) => `<div class="world-card-row"><div class="world-left">${w.iconDataUrl ? `<img class="world-icon" src="${w.iconDataUrl}" />` : '<div class="world-icon" style="display:grid;place-items:center;font-size:18px;">🌍</div>'}<div><strong style="font-size:13px;">${w.name}</strong><div style="font-size:10.5px;color:var(--text-muted);">Cập nhật: ${w.lastPlayed}</div></div></div><button class="vtype-btn" data-openworld="${w.path}">📂 Mở Thư Mục</button></div>`).join('');
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