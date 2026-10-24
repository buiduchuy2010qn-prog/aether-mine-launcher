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
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c68642'; ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = '#4a2f1b'; ctx.fillRect(8, 0, 16, 8); ctx.fillRect(8, 8, 8, 3);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(9, 12, 2, 1); ctx.fillRect(13, 12, 2, 1);
  ctx.fillStyle = '#3b5998'; ctx.fillRect(10, 12, 1, 1); ctx.fillRect(12, 12, 1, 1);
  ctx.fillStyle = '#0ea5e9'; ctx.fillRect(16, 20, 24, 12);
  ctx.fillStyle = '#1e3a8a'; ctx.fillRect(0, 20, 16, 12);
  return c.toDataURL('image/png');
}

function buildCapeDataUrl(type) {
  if (!type || type === 'none') return null;
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const ctx = c.getContext('2d');
  const palettes = {
    mojang: { bg1: '#991b1b', bg2: '#dc2626', border: '#fbbf24', icon: '#fef08a' },
    gold: { bg1: '#78350f', bg2: '#d97706', border: '#fde047', icon: '#fffbeb' },
    cherry: { bg1: '#9d174d', bg2: '#f472b6', border: '#fbcfe8', icon: '#ffffff' },
    diamond: { bg1: '#0f172a', bg2: '#0284c7', border: '#38bdf8', icon: '#e0f2fe' }
  };
  const p = palettes[type] || palettes.mojang;
  ctx.fillStyle = p.bg1; ctx.fillRect(0, 0, 24, 20);
  ctx.fillStyle = p.bg2; ctx.fillRect(1, 1, 10, 16); ctx.fillRect(12, 1, 10, 16);
  ctx.fillStyle = p.border; ctx.fillRect(1, 1, 10, 1); ctx.fillRect(1, 16, 10, 1); ctx.fillRect(1, 1, 1, 16); ctx.fillRect(10, 1, 1, 16);
  ctx.fillStyle = p.icon; ctx.fillRect(4, 5, 4, 6); ctx.fillRect(3, 6, 6, 4);
  ctx.fillStyle = p.bg1; ctx.fillRect(5, 7, 2, 2);
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
      const faceData = octx.getImageData(8, 8, 8, 8).data;
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
  grid.innerHTML = res.hits.map((item) => {
    const dl = item.downloads > 1000000 ? `${(item.downloads / 1000000).toFixed(1)}M tải` : `${Math.round(item.downloads / 1000)}K tải`;
    const tags = (item.categories || []).map((c) => `<span class="mod-tag">${c}</span>`).join('');
    return `<div class="mod-card"><div class="mod-card-top"><img class="mod-icon" src="${item.iconUrl || ''}" alt="" /><div><div class="mod-title">${item.title}</div><div class="mod-meta">bởi ${item.author || 'Creator'} • ${dl}</div></div></div><div class="mod-desc">${item.description || ''}</div><div class="mod-card-foot"><div class="mod-tags">${tags}</div><button class="btn-install-mod" data-slug="${item.slug}">⬇ Tải 1-Click</button></div></div>`;
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
  container.innerHTML = state.favoriteServers.map((srv, idx) => `<div class="srv-card-row"><div><strong style="font-size:13px;">🌐 ${srv.name}</strong><div style="font-size:11px;color:var(--accent);font-weight:700;margin-top:2px;">IP: ${srv.ip}</div></div><div style="display:flex;gap:6px;"><button class="btn-install-mod" data-joinsrv="${srv.ip}">▶ Vào Thẳng Server</button><button class="vtype-btn" data-delsrv="${idx}" style="color:#ef4444;">Xóa</button></div></div>`).join('');
  container.querySelectorAll('[data-joinsrv]').forEach((btn) => {
    btn.onclick = () => {
      setServerIpEverywhere(btn.dataset.joinsrv);
      document.querySelector('.nav-item[data-tab="play"]').click();
      document.getElementById('btnLaunch').click();
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