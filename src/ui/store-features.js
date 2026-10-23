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
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 8, 8, 8, 8, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 40, 8, 8, 8, 0, 0, canvas.width, canvas.height);
  };
  img.src = imgSource;
}

async function runOneClickFpsBoost(btnElement) {
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
  const sideEl = document.getElementById('sideModsCount');
  if (sideEl) sideEl.textContent = `${items.filter((i) => i.enabled).length} Mod`;
  const tabCountEl = document.getElementById('localAddonCount');
  if (tabCountEl) tabCountEl.textContent = items.length;
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