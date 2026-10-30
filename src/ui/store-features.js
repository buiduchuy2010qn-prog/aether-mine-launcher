function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;

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
      const ctx = c.getContext('2d', { willReadFrequently: true });
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

function hasValidSkinOverlay(octx, rx, ry, rw, rh, imgW, imgH) {
  if (rx + rw > imgW || ry + rh > imgH) return false;
  try {
    const data = octx.getImageData(rx, ry, rw, rh).data;
    let hasTrans = false;
    let hasOpaque = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 245) hasTrans = true;
      if (data[i] > 15) hasOpaque = true;
      if (hasTrans && hasOpaque) return true;
    }
  } catch (_) {}
  return false;
}

function evaluateSkinFaceCandidate(octx, baseX, baseY, overX, overY, allowOver, imgW, imgH) {
  if (baseX + 8 > imgW || baseY + 8 > imgH) return { valid: false, score: -999, solid: false, baseX, baseY, overX, overY, allowOver: false };
  try {
    const base = octx.getImageData(baseX, baseY, 8, 8).data;
    const over = (allowOver && overX + 8 <= imgW && overY + 8 <= imgH) ? octx.getImageData(overX, overY, 8, 8).data : null;
    const p = new Uint8Array(256);
    let opaque = 0;
    for (let i = 0; i < 256; i += 4) {
      let r = base[i], g = base[i + 1], b = base[i + 2], a = base[i + 3];
      if (over && over[i + 3] > 15) {
        const al = over[i + 3] / 255;
        r = Math.round(over[i] * al + r * (1 - al));
        g = Math.round(over[i + 1] * al + g * (1 - al));
        b = Math.round(over[i + 2] * al + b * (1 - al));
        a = Math.max(a, over[i + 3]);
      }
      p[i] = r; p[i + 1] = g; p[i + 2] = b; p[i + 3] = a;
      if (a > 30) opaque++;
    }
    if (opaque < 24) {
      return { valid: false, score: -999, solid: false, baseX, baseY, overX, overY, allowOver: Boolean(over) };
    }
    const r0 = p[0], g0 = p[1], b0 = p[2];
    let solid = true;
    for (let i = 0; i < 8 * 6 * 4; i += 4) {
      if (Math.abs(p[i] - r0) > 12 || Math.abs(p[i + 1] - g0) > 12 || Math.abs(p[i + 2] - b0) > 12) {
        solid = false;
        break;
      }
    }
    let mSum = 0, mCnt = 0;
    for (let y = 2; y <= 6; y++) {
      for (let x = 0; x < 4; x++) {
        const l = (y * 8 + x) * 4;
        const r = (y * 8 + (7 - x)) * 4;
        mSum += Math.abs(p[l] - p[r]) + Math.abs(p[l + 1] - p[r + 1]) + Math.abs(p[l + 2] - p[r + 2]);
        mCnt++;
      }
    }
    const mirrorDiff = mSum / mCnt;
    let flatBottom = 0;
    for (let y = 5; y <= 7; y++) {
      let rowMax = 0;
      const i0 = (y * 8) * 4;
      for (let x = 1; x < 8; x++) {
        const ix = (y * 8 + x) * 4;
        rowMax = Math.max(rowMax, Math.abs(p[ix] - p[i0]) + Math.abs(p[ix + 1] - p[i0 + 1]) + Math.abs(p[ix + 2] - p[i0 + 2]));
      }
      if (rowMax <= 4) flatBottom++;
    }
    let eyeBonus = 0;
    for (let y = 2; y <= 6; y++) {
      const l1 = (y * 8 + 1) * 4, l2 = (y * 8 + 2) * 4;
      const r1 = (y * 8 + 6) * 4, r2 = (y * 8 + 5) * 4;
      const c1 = (y * 8 + 3) * 4, c2 = (y * 8 + 4) * 4;
      const sym1 = Math.abs(p[l1] - p[r1]) + Math.abs(p[l1 + 1] - p[r1 + 1]) + Math.abs(p[l1 + 2] - p[r1 + 2]);
      const sym2 = Math.abs(p[l2] - p[r2]) + Math.abs(p[l2 + 1] - p[r2 + 1]) + Math.abs(p[l2 + 2] - p[r2 + 2]);
      const ctr1 = Math.abs(p[l1] - p[c1]) + Math.abs(p[l1 + 1] - p[c1 + 1]) + Math.abs(p[l1 + 2] - p[c1 + 2]);
      const ctr2 = Math.abs(p[l2] - p[c2]) + Math.abs(p[l2 + 1] - p[c2 + 1]) + Math.abs(p[l2 + 2] - p[c2 + 2]);
      if ((sym1 < 55 && ctr1 >= 45) || (sym2 < 55 && ctr2 >= 45)) {
        eyeBonus = 55;
        break;
      }
    }
    const score = Math.round(120 - mirrorDiff * 0.6 + eyeBonus - (flatBottom >= 3 ? 55 : 0));
    return {
      valid: true,
      solid,
      r0, g0, b0,
      eyeBonus,
      score,
      baseX, baseY, overX, overY,
      allowOver: Boolean(over)
    };
  } catch (_) {
    return { valid: true, solid: false, score: 120, baseX, baseY, overX, overY, allowOver: false };
  }
}

function renderSmartSkinFaceToCanvas(canvas, img, sharedOffCtx = null) {
  if (!canvas || !img) return;
  const imgW = img.width || 64;
  const imgH = img.height || 64;
  let octx = sharedOffCtx;
  if (!octx) {
    const off = document.createElement('canvas');
    off.width = imgW;
    off.height = imgH;
    octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(img, 0, 0);
  }
  if (canvas.width !== 64 || canvas.height !== 64) {
    canvas.width = 64;
    canvas.height = 64;
  }
  canvas.classList.remove('is-custom-avatar');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // If image is not a standard 2:1 or 1:1 Minecraft skin (e.g. square HD icon), draw full image cleanly
  if (imgW > 128 && Math.abs(imgW - imgH) <= 4) {
    canvas.width = 128;
    canvas.height = 128;
    canvas.classList.add('is-custom-avatar');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return;
  }

  const hatValid = hasValidSkinOverlay(octx, 32, 0, 32, 16, imgW, imgH);
  const jacketValid = imgH >= 64 && hasValidSkinOverlay(octx, 16, 32, 24, 16, imgW, imgH);

  const headCand = evaluateSkinFaceCandidate(octx, 8, 8, 40, 8, hatValid, imgW, imgH);
  let chosen = headCand;

  // Smart fallback for mini / chest-face / backwards skins (e.g., head has sideways body stripes while chest (20,20) has the real face)
  if (!headCand.solid && (!headCand.valid || headCand.score < 100)) {
    const chestCand = evaluateSkinFaceCandidate(octx, 20, 20, 20, 36, jacketValid, imgW, imgH);
    const backCand = evaluateSkinFaceCandidate(octx, 24, 8, 56, 8, hatValid, imgW, imgH);
    for (const alt of [chestCand, backCand]) {
      if (alt.valid && !alt.solid && alt.eyeBonus > 0 && alt.score >= Math.max(125, headCand.score + 48)) {
        if (alt.score > chosen.score) chosen = alt;
      }
    }
  }

  if (chosen.solid && chosen === headCand) {
    const w = canvas.width;
    ctx.fillStyle = `rgb(${chosen.r0}, ${chosen.g0}, ${chosen.b0})`;
    ctx.fillRect(0, 0, w, w);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(w * 0.14), Math.round(w * 0.14), Math.round(w * 0.72), Math.round(w * 0.72));
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(Math.round(w * 0.28), Math.round(w * 0.30), Math.round(w * 0.12), Math.round(w * 0.14));
    ctx.fillRect(Math.round(w * 0.60), Math.round(w * 0.30), Math.round(w * 0.12), Math.round(w * 0.14));
    ctx.fillRect(Math.round(w * 0.28), Math.round(w * 0.62), Math.round(w * 0.44), Math.round(w * 0.10));
    ctx.fillRect(Math.round(w * 0.21), Math.round(w * 0.54), Math.round(w * 0.10), Math.round(w * 0.10));
    ctx.fillRect(Math.round(w * 0.69), Math.round(w * 0.54), Math.round(w * 0.10), Math.round(w * 0.10));
    return;
  }

  const bx = chosen.valid ? chosen.baseX : 8;
  const by = chosen.valid ? chosen.baseY : 8;
  ctx.drawImage(img, bx, by, 8, 8, 0, 0, canvas.width, canvas.height);
  if (chosen.valid && chosen.allowOver) {
    ctx.drawImage(img, chosen.overX, chosen.overY, 8, 8, 0, 0, canvas.width, canvas.height);
  }
}
window.renderSmartSkinFaceToCanvas = renderSmartSkinFaceToCanvas;

function draw2DAvatarFace(imgSource, opts = {}) {
  const canvases = [
    document.getElementById('avatar2dCanvas'),
    document.getElementById('msCardAvatarCanvas'),
    document.getElementById('playTabAvatarCanvas'),
    document.getElementById('popoverAvatarCanvas')
  ].filter(Boolean);

  const customAvatar = (typeof state === 'object' && state && state.customAvatarDataUrl) ? String(state.customAvatarDataUrl) : '';
  if (imgSource && imgSource !== customAvatar) {
    window.__lastSkinFaceSource = imgSource;
  }
  if (typeof window.syncCustomAvatarUI === 'function') {
    window.syncCustomAvatarUI();
  }
  if (!canvases.length) return;

  const renderSkinFallback = () => {
    const skinSrc = imgSource || window.__lastSkinFaceSource || (typeof state === 'object' && state?.cachedSkinDataUrl) || createFallbackSteveSkinDataUrl();
    if (!skinSrc) return;
    const img = new Image();
    img.onload = () => {
      const off = document.createElement('canvas');
      off.width = img.width || 64;
      off.height = img.height || 64;
      const octx = off.getContext('2d', { willReadFrequently: true });
      octx.drawImage(img, 0, 0);
      for (const canvas of canvases) {
        renderSmartSkinFaceToCanvas(canvas, img, octx);
      }
    };
    img.src = skinSrc;
  };

  if (!opts.forceSkin && customAvatar && /^data:image\//i.test(customAvatar)) {
    const cImg = new Image();
    cImg.onload = () => {
      for (const canvas of canvases) {
        if (canvas.width !== 128 || canvas.height !== 128) {
          canvas.width = 128;
          canvas.height = 128;
        }
        canvas.classList.add('is-custom-avatar');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(cImg, 0, 0, canvas.width, canvas.height);
      }
    };
    cImg.onerror = renderSkinFallback;
    cImg.src = customAvatar;
    return;
  }

  renderSkinFallback();
}
function getModStoreTarget() {
  const wantedDir = String(state.modTargetInstanceDir || '').trim();
  if (wantedDir && typeof packHub === 'object' && Array.isArray(packHub.instances)) {
    const inst = packHub.instances.find((x) => x && x.dir === wantedDir);
    if (inst) {
      const core = String(inst.loader || 'fabric').toLowerCase();
      return {
        isPack: true,
        inst,
        dir: inst.dir,
        mcVersion: inst.mcVersion || state.selectedVersion || '1.21.4',
        core,
        label: `📦 ${inst.name}`,
        shortName: inst.name || 'Modpack'
      };
    }
  }
  return {
    isPack: false,
    inst: null,
    dir: state.gameDir,
    mcVersion: state.selectedVersion || '1.21.4',
    core: String(state.selectedCore || 'fabric').toLowerCase(),
    label: '🏠 Thư mục chính (.minecraft)',
    shortName: '.minecraft'
  };
}
window.getModStoreTarget = getModStoreTarget;

async function refreshModTargetSelector(skipFetch = false) {
  const sel = document.getElementById('modTargetInstanceSelect');
  const bar = document.getElementById('modTargetInstanceBar');
  const playPackBtn = document.getElementById('btnModTargetPlayPack');
  if (!skipFetch && typeof packHub === 'object' && state.gameDir && window.aetherAPI?.packsInstances) {
    try {
      const res = await window.aetherAPI.packsInstances(state.gameDir);
      if (Array.isArray(res?.instances)) packHub.instances = res.instances;
    } catch (_) {}
  }
  const insts = (typeof packHub === 'object' && Array.isArray(packHub.instances)) ? packHub.instances : [];
  if (state.modTargetInstanceDir && !insts.some((x) => x.dir === state.modTargetInstanceDir)) {
    state.modTargetInstanceDir = '';
  }
  if (sel) {
    const opts = [
      `<option value="">🏠 Thư mục chính (.minecraft — MC ${escapeHtml(state.selectedVersion || '1.21.4')} • ${escapeHtml((state.selectedCore || 'fabric').toUpperCase())})</option>`,
      ...insts.map((inst) => {
        const ld = (typeof PACK_LOADER_LABEL === 'object' && PACK_LOADER_LABEL[inst.loader]) || String(inst.loader || 'fabric').toUpperCase();
        return `<option value="${escapeHtml(inst.dir)}">📦 ${escapeHtml(inst.name)} — MC ${escapeHtml(inst.mcVersion || '?')} • ${escapeHtml(ld)} (${Number(inst.modsCount) || 0} Mod)</option>`;
      })
    ];
    sel.innerHTML = opts.join('');
    sel.value = state.modTargetInstanceDir || '';
  }
  const target = getModStoreTarget();
  if (bar) bar.classList.toggle('is-pack-target', target.isPack);
  if (playPackBtn) playPackBtn.classList.toggle('hidden', !target.isPack);
  if (typeof updateSummaryUI === 'function') updateSummaryUI();
  return target;
}
window.refreshModTargetSelector = refreshModTargetSelector;

async function runOneClickFpsBoost(btnElement) {
  const isHomeBtn = btnElement?.id === 'btnOneClickFpsBoost';
  const target = isHomeBtn
    ? { isPack: false, inst: null, dir: state.gameDir, mcVersion: state.selectedVersion || '1.21.4', core: String(state.selectedCore || 'fabric').toLowerCase(), shortName: '.minecraft' }
    : getModStoreTarget();
  if (btnElement.dataset.alreadyInstalled === 'true') {
    await askUserAgreement({
      title: '✓ Gói X3 FPS Đã Được Cài Sẵn!',
      message: `Bộ Mod tối ưu X3 FPS (Sodium, Lithium, FerriteCore, EntityCulling, ImmediatelyFast, Iris) đã có sẵn trong ${target.isPack ? `gói “${target.shortName}”` : 'máy'} cho phiên bản ${target.mcVersion} rồi, bạn không cần tải lại nữa!`,
      agreeText: 'Đã hiểu',
      cancelText: 'Đóng'
    });
    return;
  }
  const confirmRes = await askUserAgreement({
    title: '⚡ Xác Nhận Cài Đặt Gói X3 FPS',
    message: `Bạn có đồng ý để Launcher tự động tải và cài đặt bộ Mod tối ưu FPS (Sodium, Lithium, FerriteCore, EntityCulling, ImmediatelyFast, Iris Shaders) vào ${target.isPack ? `gói Modpack “${target.shortName}” (MC ${target.mcVersion})` : 'thư mục .minecraft/mods'} không?`,
    agreeText: '✓ Đồng Ý Cài Đặt',
    cancelText: '✕ Không, Hủy bỏ'
  });
  if (!confirmRes.agreed) return;
  let useCore = target.core;
  if (!target.isPack && state.selectedCore === 'vanilla') {
    setCore('fabric');
    useCore = 'fabric';
  } else if (useCore === 'vanilla') {
    useCore = 'fabric';
  }
  const origHtml = btnElement.innerHTML;
  btnElement.disabled = true; btnElement.innerHTML = '<span>⏳ Đang tải bộ X3 FPS...</span>';
  const descEl = document.getElementById('fpsBoostStatusText');
  if (descEl) descEl.textContent = `Đang tải tự động Sodium + Lithium + FerriteCore + EntityCulling + Iris cho ${target.mcVersion}...`;
  const res = await window.aetherAPI.installFpsBoostPack({ mcVersion: target.mcVersion, loaderType: useCore, gameDir: target.dir });
  btnElement.disabled = false;
  if (res?.ok) {
    btnElement.innerHTML = `<span>✓ Đã cài ${res.installed.length} Mod FPS!</span>`;
    if (descEl) descEl.textContent = `Đã cài thành công: ${res.installed.join(', ')}`;
    await refreshLocalAddonsCount();
    if (document.getElementById('tab-mods')?.classList.contains('active') && state.activeModStoreType !== 'installed') {
      loadModrinthStore(false);
    }
    if (target.isPack && typeof refreshPackInstances === 'function') refreshPackInstances();
  } else {
    btnElement.innerHTML = '<span>⚠ Thử lại</span>';
    if (descEl) descEl.textContent = `Lỗi tải gói FPS: ${res?.error || 'Kiểm tra mạng'}`;
  }
  setTimeout(() => { btnElement.innerHTML = origHtml; }, 4000);
}

async function refreshLocalAddonsCount() {
  const mainModsRes = await window.aetherAPI.listLocalAddons(state.gameDir, 'mods');
  const mainItems = mainModsRes?.items || [];
  const mainEnabled = mainItems.filter((i) => i.enabled);
  const target = getModStoreTarget();
  const storeModsRes = target.isPack
    ? await window.aetherAPI.listLocalAddons(target.dir, 'mods')
    : mainModsRes;
  const storeItems = storeModsRes?.items || [];
  const storeEnabled = storeItems.filter((i) => i.enabled);

  const sideEl = document.getElementById('sideModsCount');
  if (sideEl) sideEl.textContent = `${mainEnabled.length} Mod`;
  const tabCountEl = document.getElementById('localAddonCount');
  if (tabCountEl) tabCountEl.textContent = storeItems.length;

  const isAddonLoaderCompat = (itemLoaders, effLoader, ver) => {
    if (!effLoader || effLoader === 'vanilla' || effLoader === 'optifine-standalone') return false;
    if (!Array.isArray(itemLoaders) || itemLoaders.length === 0) return true;
    if (itemLoaders.includes(effLoader)) return true;
    if (effLoader === 'quilt' && itemLoaders.includes('fabric')) return true;
    if (effLoader === 'forge' && ver === '1.20.1' && itemLoaders.includes('neoforge')) return true;
    return false;
  };

  const checkHasFpsPack = (enabledList, ver, effLoader) => {
    if (!effLoader || effLoader === 'vanilla' || effLoader === 'optifine-standalone') {
      return { installed: false, count: 0 };
    }
    const compat = enabledList.filter((item) => {
      if (!isAddonLoaderCompat(item.loaders, effLoader, ver)) return false;
      if (Array.isArray(item.gameVersions) && item.gameVersions.length > 0) return item.gameVersions.includes(ver);
      if (item.mcVersion) return item.mcVersion === ver;
      return true;
    });
    const lowerNames = compat.map((i) => i.cleanName.toLowerCase());
    const hasSodium = lowerNames.some((n) => n.startsWith('sodium-') || n.startsWith('embeddium-'));
    const hasLithium = lowerNames.some((n) => n.startsWith('lithium-') || n.startsWith('ferritecore-'));
    return { installed: hasSodium && hasLithium, count: compat.length };
  };

  const mainVer = state.selectedVersion || '1.21.4';
  const mainLoader = resolveUnderlyingModLoaderForCore(state.selectedCore || 'fabric', mainVer, state.selectedLoaderVersion || '', false);
  const mainFps = checkHasFpsPack(mainEnabled, mainVer, mainLoader);
  const storeVer = target.mcVersion || mainVer;
  const storeLoader = resolveUnderlyingModLoaderForCore(target.core || 'fabric', storeVer, '', target.isPack);
  const storeFps = target.isPack ? checkHasFpsPack(storeEnabled, storeVer, storeLoader) : mainFps;

  const btnHomeFps = document.getElementById('btnOneClickFpsBoost');
  const btnStoreFps = document.getElementById('btnStoreFpsBoost');
  const descEl = document.getElementById('fpsBoostStatusText');

  if (btnHomeFps) {
    btnHomeFps.innerHTML = mainFps.installed
      ? `<span>✓ Đã Cài X3 FPS (${mainVer})</span>`
      : `<span>⚡ Cài X3 FPS (${mainVer})</span>`;
    btnHomeFps.dataset.alreadyInstalled = mainFps.installed ? 'true' : 'false';
  }
  if (btnStoreFps) {
    btnStoreFps.innerHTML = storeFps.installed
      ? `<span>✓ Đã Cài Sẵn Bộ X3 FPS (${storeVer})</span>`
      : `<span>⚡ Cài Trọn Bộ X3 FPS (${storeVer})</span>`;
    btnStoreFps.dataset.alreadyInstalled = storeFps.installed ? 'true' : 'false';
  }
  if (descEl) {
    if (mainFps.installed) {
      descEl.textContent = `✓ Bộ Mod X3 FPS (${mainFps.count} Mod chuẩn ${mainVer}: Sodium, Lithium, Iris...) đã cài sẵn — Bấm CHƠI NGAY để vào game!`;
    } else if (/^✓\s*Bộ Mod X3 FPS/i.test(descEl.textContent || '')) {
      descEl.textContent = `Sẵn sàng trang bị 1-Click trọn bộ Mod tối ưu FPS (Sodium / Embeddium, FerriteCore, ModernFix...) cho MC ${mainVer}.`;
    }
  }
  if (typeof window.refreshSmartRamCoachUI === 'function') window.refreshSmartRamCoachUI();
}

function isMcPre114(ver) {
  const m = String(ver || '').match(/^1\.(\d+)(?:\.|\b)/);
  return Boolean(m && Number(m[1]) < 14);
}

function resolveUnderlyingModLoaderForCore(coreName, mcVer, loaderVer = '', isPack = false) {
  const c = String(coreName || 'fabric').toLowerCase();
  if (c === 'optifine' && !isPack) {
    if (loaderVer && loaderVer !== 'Auto-Shader-Zoom') return 'optifine-standalone';
    return isMcPre114(mcVer) ? 'forge' : 'fabric';
  }
  return c;
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

  const target = getModStoreTarget();
  const activeVer = target.mcVersion || '1.21.4';
  const activeCore = target.core || 'fabric';

  const query = document.getElementById('modSearchInput')?.value.trim() || '';
  const res = await window.aetherAPI.searchModrinth({
    query,
    projectType: state.activeModStoreType,
    mcVersion: activeVer,
    loaderType: activeCore,
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
  const localCheck = await window.aetherAPI.listLocalAddons(target.dir, folderMap[state.activeModStoreType] || 'mods');
  const localItems = (localCheck?.items || []).filter((i) => i.enabled);

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
    'zume': 'Phóng to ống nhòm (phím C + cuộn chuột xa/gần) siêu nhẹ, hỗ trợ đa nền tảng giống hệt phím Zoom của OptiFine.',
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
    'customskinloader': 'Đồng bộ và hiển thị đúng Skin, Áo choàng (Capes) riêng của từng người chơi khi chơi Offline / LAN / Server.',
    '3dskinlayers': 'Biến lớp áo ngoài (tóc, mũ, áo khoác, tay áo) trên Skin từ mặt phẳng 2D thành mô hình nổi 3D sống động.',
    'skinshuffle': 'Đổi nóng bộ trang phục Skin 3D ngay giữa lúc đang chơi trong thế giới hoặc Server mà không cần thoát game.',
    'evergreenhud': 'Giao diện HUD chiến đấu kiểu Lunar Client: Hiển thị FPS, Ping, tọa độ, tốc độ nhấp chuột CPS và bàn phím bấm Keystrokes.',
    'clean-keystrokes': 'Hiển thị bàn phím WASD + Chuột Trái/Phải kèm bộ đếm tốc độ nhấp chuột CPS gọn đẹp cho PvP / BedWars.',
    'armor-hud': 'Hiển thị trực quan độ bền Mũ, Áo giáp, Quần, Giày ngay cạnh thanh công cụ dưới màn hình khi giao tranh PvP.',
    'status-effect-bars': 'Hiển thị thanh thời gian đếm ngược của Táo vàng, Thuốc Tốc độ, Sức mạnh, Kháng lửa ngay trên màn hình.',
    'dynamiccrosshair': 'Tâm ngắm chiến đấu thông minh tự đổi kiểu và báo hiệu khi vung kiếm đủ lực hoặc nhắm trúng mục tiêu.',
    'freelook': 'Nhấn giữ phím để xoay góc nhìn camera 360° quan sát sau lưng khi đang chạy nước rút hoặc bắc cầu BedWars.',
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
    'entitytexturefeatures': 'Hỗ trợ kết cấu sinh vật ngẫu nhiên, phát sáng trong đêm và chớp mắt (OptiFine ETF), dùng chung với Entity Model Features.',
    'oculus': 'Trình chạy gói bóng đổ (Shader Packs) chuẩn OptiFine/Iris tốc độ cao dành cho nền tảng Forge.',
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

  // v40.3 PRO: Render top compatibility bar (#modCompatNoticeBar) aware of Modpack target
  const compatNoticeEl = document.getElementById('modCompatNoticeBar');
  if (compatNoticeEl) {
    if (target.isPack) {
      compatNoticeEl.className = 'mod-compat-notice-bar is-ok';
      compatNoticeEl.innerHTML = `
        <div class="mcnb-left">
          <span class="mcnb-icon">📦</span>
          <div>
            <strong>Đang cài trực tiếp vào Gói Modpack: ${escapeHtml(target.shortName)} (MC ${escapeHtml(activeVer)} • ${escapeHtml((PACK_LOADER_LABEL[activeCore] || activeCore).toUpperCase())})</strong>
            <span>Mọi Mod, Shader, Resource Pack bạn bấm tải bên dưới sẽ được cài gọn vào thư mục riêng của gói này mà không ảnh hưởng tới <code>.minecraft</code> gốc.</span>
          </div>
        </div>
        <div class="mcnb-actions">
          <button type="button" class="vtype-btn" id="btnModNoticeBackMain">🏠 Quay về .minecraft gốc</button>
          <button type="button" class="vtype-btn" id="btnModNoticeSwitchAll">${state.modAllVersions ? `🎯 Lọc riêng MC ${escapeHtml(activeVer)}` : '🌐 Xem mọi phiên bản MC'}</button>
        </div>`;
      const btnBackMain = compatNoticeEl.querySelector('#btnModNoticeBackMain');
      if (btnBackMain) {
        btnBackMain.onclick = async () => {
          state.modTargetInstanceDir = '';
          await refreshModTargetSelector(true);
          await refreshLocalAddonsCount();
          loadModrinthStore(false);
        };
      }
      const btnSwitchAll = compatNoticeEl.querySelector('#btnModNoticeSwitchAll');
      if (btnSwitchAll) {
        btnSwitchAll.onclick = () => document.getElementById('btnToggleModAllVersions')?.click();
      }
    } else if (state.activeModStoreType === 'mod' && activeCore === 'vanilla') {
      compatNoticeEl.className = 'mod-compat-notice-bar is-warn';
      compatNoticeEl.innerHTML = `
        <div class="mcnb-left">
          <span class="mcnb-icon">🔧</span>
          <div>
            <strong>Bạn đang chọn cấu hình Vanilla (Nguyên bản) — Cần bật Mod Loader để chạy Mod (.jar)!</strong>
            <span>Chọn nhanh 1 Loader bên phải (hoặc bấm nút <em>Cài &amp; Tự bật Loader</em> trên thẻ Mod bất kỳ để BlockWay tự thiết lập):</span>
          </div>
        </div>
        <div class="mcnb-actions">
          <button type="button" class="vtype-btn active" data-switchcore="fabric">⚡ Bật Fabric (Khuyên dùng)</button>
          <button type="button" class="vtype-btn" data-switchcore="forge">🔨 Bật Forge</button>
          <button type="button" class="vtype-btn" data-switchcore="neoforge">🦊 Bật NeoForge</button>
          <button type="button" class="vtype-btn" data-switchcore="quilt">🧵 Bật Quilt</button>
        </div>`;
      compatNoticeEl.querySelectorAll('[data-switchcore]').forEach((b) => {
        b.onclick = () => {
          if (typeof window.setCore === 'function') window.setCore(b.dataset.switchcore);
        };
      });
    } else if (state.activeModStoreType === 'mod' && activeCore === 'optifine') {
      const ofUnderlying = resolveUnderlyingModLoaderForCore(activeCore, activeVer, state.selectedLoaderVersion, target.isPack);
      if (ofUnderlying === 'optifine-standalone') {
        compatNoticeEl.className = 'mod-compat-notice-bar is-warn';
        compatNoticeEl.innerHTML = `
          <div class="mcnb-left">
            <span class="mcnb-icon">☕</span>
            <div>
              <strong>Bạn đang chọn hồ sơ OptiFine Java độc lập (${escapeHtml(state.selectedLoaderVersion)}) — Chưa nạp Mod (.jar)!</strong>
              <span>Hồ sơ OptiFine Java gốc chỉ chạy Shader, không nạp thư mục <code>mods/</code>. Hãy bật chế độ <strong>OptiFine Hỗ Trợ Mod</strong> hoặc <strong>Forge</strong> bên phải:</span>
            </div>
          </div>
          <div class="mcnb-actions">
            <button type="button" class="vtype-btn active" id="btnEnableOptifineModMode">🔆 Bật OptiFine Hỗ Trợ Mod (Khuyên dùng)</button>
            <button type="button" class="vtype-btn" data-switchcore="forge">🔨 Bật Forge</button>
          </div>`;
        const btnOfModMode = compatNoticeEl.querySelector('#btnEnableOptifineModMode');
        if (btnOfModMode) {
          btnOfModMode.onclick = async () => {
            state.selectedLoaderVersion = 'Auto-Shader-Zoom';
            const sel = document.getElementById('loaderVersionSelect');
            if (sel) sel.value = 'Auto-Shader-Zoom';
            if (typeof updateSummaryUI === 'function') updateSummaryUI();
            if (typeof saveCurrentConfig === 'function') saveCurrentConfig();
            loadModrinthStore(false);
          };
        }
        compatNoticeEl.querySelectorAll('[data-switchcore]').forEach((b) => {
          b.onclick = () => {
            if (typeof window.setCore === 'function') window.setCore(b.dataset.switchcore);
          };
        });
      } else {
        const runtimeLabel = (PACK_LOADER_LABEL[ofUnderlying] || ofUnderlying).toUpperCase();
        compatNoticeEl.className = 'mod-compat-notice-bar is-ok';
        compatNoticeEl.innerHTML = `
          <div class="mcnb-left">
            <span class="mcnb-icon">🔆</span>
            <div>
              <strong>Đang bật cấu hình: Minecraft ${escapeHtml(activeVer)} • OPTIFINE (Shader • Zoom — Chạy trực tiếp Mod ${escapeHtml(runtimeLabel)})</strong>
              <span>Mọi Mod ${escapeHtml(runtimeLabel)} bên dưới đều tương thích 100% và cài thẳng vào cấu hình OptiFine hiện tại mà không cần đổi Core.</span>
            </div>
          </div>
          <div class="mcnb-actions">
            <button type="button" class="vtype-btn" id="btnModNoticeOptifineHub">🔆 Bộ Chuẩn OptiFine</button>
            <button type="button" class="vtype-btn" id="btnModNoticeSwitchAll">${state.modAllVersions ? `🎯 Lọc riêng MC ${escapeHtml(activeVer)}` : '🌐 Xem mọi phiên bản MC'}</button>
          </div>`;
        compatNoticeEl.querySelector('#btnModNoticeOptifineHub')?.addEventListener('click', () => openOptifineHubModal(null));
        compatNoticeEl.querySelector('#btnModNoticeSwitchAll')?.addEventListener('click', () => document.getElementById('btnToggleModAllVersions')?.click());
      }
    } else if (state.activeModStoreType === 'mod') {
      compatNoticeEl.className = 'mod-compat-notice-bar is-ok';
      compatNoticeEl.innerHTML = `
        <div class="mcnb-left">
          <span class="mcnb-icon">✅</span>
          <div>
            <strong>Đang kiểm tra tương thích cho cấu hình: Minecraft ${escapeHtml(activeVer)} • ${escapeHtml(activeCore.toUpperCase())}</strong>
            <span>Mỗi Mod bên dưới đều hiển thị rõ có cài được ngay với phiên bản đang chọn hay cần tự động chuyển đúng cấu hình mà Mod yêu cầu.</span>
          </div>
        </div>
        <div class="mcnb-actions">
          <button type="button" class="vtype-btn" id="btnModNoticeSwitchAll">${state.modAllVersions ? `🎯 Lọc riêng MC ${escapeHtml(activeVer)}` : '🌐 Xem mọi phiên bản MC'}</button>
        </div>`;
      const btnSwitchAll = compatNoticeEl.querySelector('#btnModNoticeSwitchAll');
      if (btnSwitchAll) {
        btnSwitchAll.onclick = () => document.getElementById('btnToggleModAllVersions')?.click();
      }
    } else {
      compatNoticeEl.className = 'mod-compat-notice-bar hidden';
      compatNoticeEl.innerHTML = '';
    }
  }

  const pickBestReleaseVer = (vers = [], targetVer = '') => {
    if (!Array.isArray(vers) || !vers.length) return targetVer || '1.21.4';
    if (vers.includes(targetVer)) return targetVer;
    const baseParts = String(targetVer).split('-')[0].split('.');
    const familyPrefix = baseParts.length >= 2 ? `${baseParts[0]}.${baseParts[1]}` : targetVer;
    const famMatches = vers.filter((v) => v === familyPrefix || v.startsWith(`${familyPrefix}.`));
    if (famMatches.length) return famMatches[famMatches.length - 1];
    const releases = vers.filter((v) => /^(?:1|2[6-9])\.\d+(\.\d+)?$/.test(v));
    if (releases.length) return releases[releases.length - 1];
    return vers[vers.length - 1] || targetVer;
  };

  const cardsHtml = state.modAccumulatedHits.map((item) => {
    const dl = item.downloads > 1000000 ? `${(item.downloads / 1000000).toFixed(1)}M tải` : `${Math.max(1, Math.round(item.downloads / 1000))}K tải`;
    const userCore = String(activeCore || 'fabric').toLowerCase();
    const underlyingCore = resolveUnderlyingModLoaderForCore(userCore, activeVer, state.selectedLoaderVersion, target.isPack);
    const activeLoaderKey = (underlyingCore === 'vanilla' || underlyingCore === 'legacyfabric' || underlyingCore === 'optifine-standalone')
      ? (isMcPre114(activeVer) ? 'forge' : 'fabric')
      : underlyingCore;
    const rawCats = [...(item.categories || []), ...(item.displayCategories || [])]
      .map((c) => String(c || '').toLowerCase())
      .filter((c, idx, arr) => c && !HIDDEN_RETRO_TAGS.has(c) && arr.indexOf(c) === idx);
    const loaderCats = rawCats.filter((c) => ['fabric', 'forge', 'quilt', 'neoforge'].includes(c));
    const featureCats = rawCats.filter((c) => !['fabric', 'forge', 'quilt', 'neoforge', 'iris', 'optifine'].includes(c));
    const pickedLoader = state.activeModStoreType === 'mod'
      ? (loaderCats.includes(activeLoaderKey) ? [activeLoaderKey] : loaderCats.slice(0, 2))
      : [];
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

    // v40.1 PRO: Determine exact version & loader compatibility for this Mod card
    const modVers = Array.isArray(item.versions) ? item.versions : [];
    const baseParts = String(activeVer).split('-')[0].split('.');
    const familyPrefix = baseParts.length >= 2 ? `${baseParts[0]}.${baseParts[1]}` : activeVer;
    const supportsExactVer = modVers.length === 0 || modVers.includes(activeVer);
    const supportsFamilyVer = supportsExactVer || modVers.some((v) => v === familyPrefix || v.startsWith(`${familyPrefix}.`));
    const bestMcVer = pickBestReleaseVer(modVers, activeVer);

    const loaderCompatibleWith = (core) => {
      if (core === 'optifine-standalone') return false;
      if (!loaderCats.length) return true;
      if (loaderCats.includes(core)) return true;
      if (core === 'quilt' && loaderCats.includes('fabric')) return true;
      if (core === 'forge' && loaderCats.includes('neoforge') && !isMcPre114(activeVer)) return true;
      return false;
    };
    const prefLoader = loaderCompatibleWith(activeLoaderKey)
      ? activeLoaderKey
      : (loaderCats.includes('fabric') ? 'fabric' : (loaderCats[0] || activeLoaderKey));

    let compatBadgeHtml = '';
    let targetInstallVer = activeVer;
    let targetInstallCore = activeLoaderKey;
    let needsConfigSwitch = false;

    if (state.activeModStoreType !== 'mod') {
      compatBadgeHtml = `<div class="mod-compat-pill ok">✅ Tương thích ${target.isPack ? `gói ${escapeHtml(target.shortName)}` : `MC ${escapeHtml(activeVer)}`}</div>`;
    } else if (userCore === 'vanilla') {
      targetInstallVer = supportsFamilyVer ? activeVer : bestMcVer;
      targetInstallCore = prefLoader;
      needsConfigSwitch = true;
      compatBadgeHtml = `<div class="mod-compat-pill warn">🔧 Cần Loader ${(PACK_LOADER_LABEL[prefLoader] || prefLoader).toUpperCase()} • MC ${escapeHtml(targetInstallVer)} (Tự bật khi cài)</div>`;
    } else if (underlyingCore === 'optifine-standalone') {
      targetInstallVer = supportsFamilyVer ? activeVer : bestMcVer;
      const defaultOfRuntime = isMcPre114(targetInstallVer) ? 'forge' : 'fabric';
      targetInstallCore = (supportsFamilyVer && loaderCompatibleWith(defaultOfRuntime)) ? 'optifine' : prefLoader;
      needsConfigSwitch = true;
      compatBadgeHtml = `<div class="mod-compat-pill warn">🔆 Cần bật chế độ OptiFine Hỗ Trợ Mod (${escapeHtml((PACK_LOADER_LABEL[prefLoader] || prefLoader).toUpperCase())})</div>`;
    } else if (supportsFamilyVer && loaderCompatibleWith(underlyingCore)) {
      targetInstallVer = activeVer;
      targetInstallCore = userCore;
      const coreBadgeLabel = userCore === 'optifine'
        ? `OPTIFINE • ${(PACK_LOADER_LABEL[underlyingCore] || underlyingCore).toUpperCase()}`
        : (PACK_LOADER_LABEL[userCore] || userCore).toUpperCase();
      compatBadgeHtml = `<div class="mod-compat-pill ok">✅ Chơi được ngay trên ${target.isPack ? `gói ${escapeHtml(target.shortName)}` : `MC ${escapeHtml(activeVer)}`} (${escapeHtml(coreBadgeLabel)})</div>`;
    } else if (supportsFamilyVer && !loaderCompatibleWith(underlyingCore)) {
      targetInstallVer = activeVer;
      targetInstallCore = prefLoader;
      needsConfigSwitch = true;
      compatBadgeHtml = `<div class="mod-compat-pill warn">⚠️ Yêu cầu Loader ${escapeHtml(PACK_LOADER_LABEL[prefLoader] || prefLoader)} cho MC ${escapeHtml(activeVer)}</div>`;
    } else {
      targetInstallVer = bestMcVer;
      targetInstallCore = prefLoader;
      needsConfigSwitch = true;
      compatBadgeHtml = `<div class="mod-compat-pill switch">🔄 Hỗ trợ MC ${escapeHtml(bestMcVer)} • ${escapeHtml((PACK_LOADER_LABEL[prefLoader] || prefLoader).toUpperCase())}</div>`;
    }

    const btnText = isInstalledExact
      ? `✓ Đã Cài (${target.isPack ? 'Trong Gói' : activeVer})`
      : needsConfigSwitch
        ? (target.isPack
            ? `🏠 Cài vào .minecraft (${targetInstallVer})`
            : `⚡ Đổi sang ${targetInstallVer} (${(PACK_LOADER_LABEL[targetInstallCore] || targetInstallCore)}) & Cài`)
        : (isInstalledOtherVer
            ? `🔄 Đổi sang ${activeVer}`
            : (target.isPack ? `⬇ Cài vào Gói (${activeVer})` : `⬇ Tải (${activeVer})`));
    const btnTitle = needsConfigSwitch
      ? (target.isPack
          ? `Gói "${target.shortName}" dùng MC ${activeVer} (${userCore.toUpperCase()}). Bấm để chuyển về .minecraft gốc (${targetInstallVer}) và cài Mod này`
          : `Tự động chuyển cấu hình sang Minecraft ${targetInstallVer} (${(PACK_LOADER_LABEL[targetInstallCore] || targetInstallCore).toUpperCase()}) và cài đặt gói này`)
      : (isInstalledOtherVer
          ? `Đang có bản ${isInstalledOtherVer} — Bấm để tự động tải và đổi sang bản ${activeVer}`
          : `Tự động chọn và cài đặt bản chuẩn cho ${target.isPack ? `gói "${target.shortName}"` : `Minecraft ${activeVer}`} (${userCore.toUpperCase()})`);
    const viDesc = item._viTranslated || getVietnameseModExplanation(item, state.activeModStoreType);
    const fullTooltip = escapeHtml(
      item.description
        ? `${viDesc}\n\n[Mô tả gốc Modrinth]: ${item.description}`
        : viDesc
    );
    const safeIconUrl = /^https?:\/\//i.test(String(item.iconUrl || '')) ? escapeHtml(item.iconUrl) : '';
    const safeTitle = escapeHtml(item.title);
    const safeAuthor = escapeHtml(item.author || 'Creator');
    const safeSlug = escapeHtml(item.slug);
    const safeBtnTitle = escapeHtml(btnTitle);
    return `<div class="mod-card" data-modslug="${safeSlug}">
      <div class="mod-card-top">
        <img class="mod-icon" src="${safeIconUrl}" alt="" />
        <div class="mod-head-info">
          <div class="mod-title" title="${safeTitle}">${safeTitle}</div>
          <div class="mod-meta">bởi <strong>${safeAuthor}</strong> • ${dl}</div>
        </div>
      </div>
      ${compatBadgeHtml}
      <div class="mod-desc" data-moddesc="${safeSlug}" title="${fullTooltip}">${escapeHtml(viDesc)}</div>
      <div class="mod-card-foot">
        <div class="mod-tags">${tags}</div>
        <button class="btn-install-mod ${isInstalledExact ? 'installed' : ''} ${needsConfigSwitch ? 'needs-switch' : ''}" data-slug="${safeSlug}" data-title="${safeTitle}" data-targetver="${escapeHtml(targetInstallVer)}" data-targetcore="${escapeHtml(targetInstallCore)}" data-needsswitch="${needsConfigSwitch ? '1' : '0'}" title="${safeBtnTitle}">${escapeHtml(btnText)}</button>
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

  // v40.1 PRO: Auto-translate Modrinth descriptions that aren't in the static dictionary
  if (typeof window.aetherAPI?.translateToVi === 'function') {
    const toTrans = newHits.filter((it) => {
      const s = String(it.slug || '').toLowerCase();
      const cs = s.replace(/-(fabric|forge|neoforge|quilt|mod|pack)$/i, '');
      return !MOD_DESC_VI_MAP[s] && !MOD_DESC_VI_MAP[cs] && it.description && !it._viTranslated;
    }).slice(0, 24);
    if (toTrans.length > 0) {
      window.aetherAPI.translateToVi(toTrans.map((it) => it.description)).then((tr) => {
        if (!tr?.ok || !Array.isArray(tr.results)) return;
        toTrans.forEach((it, idx) => {
          const vi = tr.results[idx];
          if (vi) {
            it._viTranslated = vi;
            const el = grid.querySelector(`.mod-desc[data-moddesc="${CSS.escape(it.slug)}"]`);
            if (el) el.textContent = vi;
          }
        });
      }).catch(() => {});
    }
  }

  const btnMore = document.getElementById('btnLoadMoreMods');
  if (btnMore) {
    btnMore.onclick = () => loadModrinthStore(true);
  }

  grid.querySelectorAll('.btn-install-mod').forEach((btn) => {
    btn.onclick = async () => {
      let curTarget = getModStoreTarget();
      const targetVer = btn.dataset.targetver || curTarget.mcVersion;
      const targetCore = btn.dataset.targetcore || curTarget.core;
      const needsSwitch = btn.dataset.needsswitch === '1';
      const modTitle = btn.dataset.title || btn.dataset.slug;

      if (needsSwitch) {
        if (curTarget.isPack) {
          const cPackSwitch = await askUserAgreement({
            title: '📦 Mod Khác Phiên Bản Với Gói Modpack Đang Chọn',
            message: `Mod "${modTitle}" dành cho Minecraft ${targetVer} (${(PACK_LOADER_LABEL[targetCore] || targetCore).toUpperCase()}), trong khi gói Modpack "${curTarget.shortName}" cố định ở MC ${curTarget.mcVersion} (${curTarget.core.toUpperCase()}).\n\nBạn có muốn chuyển mục tiêu cài về Thư mục chính (.minecraft), tự động đổi cấu hình sang MC ${targetVer} (${(PACK_LOADER_LABEL[targetCore] || targetCore).toUpperCase()}) và cài Mod này không?`,
            agreeText: `🏠 Chuyển về .minecraft (${targetVer}) & Cài`,
            cancelText: '✕ Giữ nguyên Gói Modpack'
          });
          if (!cPackSwitch.agreed) return;
          state.modTargetInstanceDir = '';
          await refreshModTargetSelector(true);
          if (typeof window.selectMcVersionAndCore === 'function') {
            await window.selectMcVersionAndCore(targetVer, targetCore);
          }
          curTarget = getModStoreTarget();
        } else {
          const isStandaloneOfSwitch = targetCore === 'optifine' && state.selectedCore === 'optifine' && state.selectedLoaderVersion && state.selectedLoaderVersion !== 'Auto-Shader-Zoom';
          const cSwitch = await askUserAgreement({
            title: isStandaloneOfSwitch ? '🔆 Bật Chế Độ OptiFine Hỗ Trợ Mod' : '🔄 Tự Động Đổi Cấu Hình Theo Yêu Cầu Của Mod',
            message: isStandaloneOfSwitch
              ? `Bạn đang chọn hồ sơ OptiFine Java độc lập (${state.selectedLoaderVersion}) nên chưa nạp được Mod "${modTitle}".\n\nBạn có đồng ý bật chế độ "OptiFine Hỗ Trợ Mod (Shader • Zoom • Đuốc sáng)" trên MC ${targetVer} và cài Mod này ngay không?`
              : `Mod "${modTitle}" không chạy trên cấu hình hiện tại (${state.selectedVersion} • ${state.selectedCore.toUpperCase()}) mà yêu cầu cấu hình:\n\n• Phiên bản Minecraft: ${targetVer}\n• Mod Loader: ${(PACK_LOADER_LABEL[targetCore] || targetCore).toUpperCase()}\n\nBạn có đồng ý để BlockWay tự động chuyển sang cấu hình MC ${targetVer} (${(PACK_LOADER_LABEL[targetCore] || targetCore).toUpperCase()}) và tải cài đặt Mod này ngay không?`,
            agreeText: isStandaloneOfSwitch
              ? `🔆 Bật OptiFine Hỗ Trợ Mod (${targetVer}) & Cài`
              : `⚡ Đổi sang MC ${targetVer} (${(PACK_LOADER_LABEL[targetCore] || targetCore).toUpperCase()}) & Cài`,
            cancelText: '✕ Giữ cấu hình cũ'
          });
          if (!cSwitch.agreed) return;
          if (targetCore === 'optifine') {
            state.selectedLoaderVersion = 'Auto-Shader-Zoom';
          }
          if (typeof window.selectMcVersionAndCore === 'function') {
            await window.selectMcVersionAndCore(targetVer, targetCore);
          }
          curTarget = getModStoreTarget();
        }
      } else {
        const destDesc = curTarget.isPack
          ? `gói Modpack "${curTarget.shortName}" (MC ${curTarget.mcVersion} • ${curTarget.core.toUpperCase()})`
          : `Minecraft ${curTarget.mcVersion} (${curTarget.core.toUpperCase()})`;
        const cRes = await askUserAgreement({
          title: curTarget.isPack ? '📦 Cài Đặt Thêm Vào Gói Modpack' : '📥 Xác Nhận Tải & Cài Đặt Tự Khớp Phiên Bản',
          message: `Bạn có đồng ý tự động tải và cài đặt "${modTitle}" chuẩn ${destDesc} kèm thư viện bắt buộc đi kèm không?`,
          agreeText: curTarget.isPack ? '✓ Cài Vào Gói Modpack' : '✓ Đồng Ý Tải Về',
          cancelText: '✕ Không, Hủy'
        });
        if (!cRes.agreed) return;
      }

      btn.disabled = true; btn.textContent = '⏳ Đang tải...';
      const r = await window.aetherAPI.installModrinth({
        slug: btn.dataset.slug,
        projectType: state.activeModStoreType,
        mcVersion: curTarget.mcVersion,
        loaderType: curTarget.core,
        gameDir: curTarget.dir
      });
      if (r?.ok) {
        btn.textContent = `✓ Đã Cài (${curTarget.isPack ? 'Trong Gói' : curTarget.mcVersion})`;
        btn.classList.add('installed');
        btn.classList.remove('needs-switch');
        btn.disabled = false;
        const depsInfo = Array.isArray(r.installedDeps) && r.installedDeps.length > 0
          ? ` + tự động cài kèm ${r.installedDeps.length} thư viện bắt buộc (${r.installedDeps.join(', ')})`
          : '';
        const equipInfo = r.autoEquipped ? ' & tự bật ngay trong Game' : '';
        const targetLabel = curTarget.isPack ? `gói "${curTarget.shortName}"` : `Minecraft ${curTarget.mcVersion} (${curTarget.core.toUpperCase()})`;
        document.getElementById('statusText').textContent = `✓ Đã cài ${r.fileName}${equipInfo}${depsInfo} vào ${targetLabel}!`;
        if (r.autoEquipped || depsInfo || curTarget.isPack) {
          showAetherNotification(
            r.autoEquipped
              ? `✨ Đã cài & tự động bật ngay "${r.fileName}" trong Game${depsInfo} (${targetLabel})!`
              : `🧩 Đã cài ${r.fileName}${depsInfo} vào ${targetLabel}!`,
            'success',
            5000
          );
        }
        await refreshLocalAddonsCount();
        // v40.8: Shaders need Iris (Fabric) — if the player is still on Vanilla, switch to Fabric so the shader actually loads
        if (!curTarget.isPack && state.activeModStoreType === 'shader' && (state.selectedCore === 'vanilla' || !state.selectedCore)) {
          if (typeof window.selectMcVersionAndCore === 'function') {
            await window.selectMcVersionAndCore(state.selectedVersion || curTarget.mcVersion, 'fabric');
          } else {
            state.selectedCore = 'fabric';
            if (typeof saveCurrentConfig === 'function') saveCurrentConfig();
          }
          showAetherNotification('✨ Shader cần Iris + Sodium chạy trên Fabric — BlockWay đã tự chuyển nhân sang Fabric để vào game có Shader ngay!', 'info', 5200);
        }
        if (curTarget.isPack && typeof refreshPackInstances === 'function') {
          await refreshPackInstances();
        }
        if (needsSwitch) loadModrinthStore(false);
      } else {
        btn.textContent = '⚠ Khác phiên bản';
        btn.title = r?.error || 'Không tương thích phiên bản đang chọn';
        btn.disabled = false;
        if (r?.error) document.getElementById('statusText').textContent = `⚠ ${r.error}`;
      }
    };
  });
}

const addonUpdatesCache = new Map();

function getAddonUpdatesCacheKey(target, folderType) {
  return `${target?.dir || ''}|${folderType || 'mods'}|${target?.mcVersion || '1.21.4'}|${target?.core || 'fabric'}`;
}

function invalidateAddonUpdatesCache(target, folderType) {
  if (!target) {
    addonUpdatesCache.clear();
    return;
  }
  addonUpdatesCache.delete(getAddonUpdatesCacheKey(target, folderType));
}

async function refreshAddonUpdatesState(manualNotify = false) {
  if (typeof window.aetherAPI?.checkAddonUpdates !== 'function') return null;
  const target = getModStoreTarget();
  const folderType = state.activeLocalFolder || 'mods';
  const cacheKey = getAddonUpdatesCacheKey(target, folderType);
  if (manualNotify) addonUpdatesCache.delete(cacheKey);

  const btnCheck = document.getElementById('btnCheckAddonUpdates');
  if (btnCheck && manualNotify) {
    btnCheck.disabled = true;
    btnCheck.textContent = '⏳ Đang quét SHA-1...';
  }
  try {
    const updRes = await window.aetherAPI.checkAddonUpdates({
      gameDir: state.gameDir,
      instanceDir: target.isPack ? target.dir : '',
      folderType,
      mcVersion: target.mcVersion || '1.21.4',
      loaderType: target.core || 'fabric'
    });
    if (updRes?.ok) {
      addonUpdatesCache.set(cacheKey, updRes);
    }
    const btnUpdAll = document.getElementById('btnUpdateAllAddons');
    const cntSpan = document.getElementById('addonUpdatesCount');
    const count = Number(updRes?.updatesCount) || 0;
    if (cntSpan) cntSpan.textContent = String(count);
    if (btnUpdAll) btnUpdAll.classList.toggle('hidden', count <= 0);
    if (manualNotify && typeof showAetherNotification === 'function') {
      showAetherNotification(
        count > 0
          ? `⬆️ Phát hiện ${count} gói có bản mới hơn trên Modrinth cho MC ${target.mcVersion}!`
          : `✅ Toàn bộ gói trong thư mục ${folderType} đều đang ở bản mới nhất cho MC ${target.mcVersion}!`,
        count > 0 ? 'info' : 'success',
        4200
      );
    }
    return updRes;
  } catch (_) {
    return null;
  } finally {
    if (btnCheck && manualNotify) {
      btnCheck.disabled = false;
      btnCheck.textContent = '🔍 Kiểm Tra Bản Mới';
    }
  }
}

async function renderLocalAddonsManager(skipAutoUpdateScan = false) {
  const listEl = document.getElementById('localAddonsList');
  if (!listEl) return;
  const target = getModStoreTarget();
  const res = await window.aetherAPI.listLocalAddons(target.dir, state.activeLocalFolder);
  const allItems = res?.items || [];
  const q = (document.getElementById('modSearchInput')?.value || '').trim().toLowerCase();
  const items = q
    ? allItems.filter((it) => String(it.cleanName || it.name || '').toLowerCase().includes(q))
    : allItems;
  await refreshLocalAddonsCount();
  const cacheKey = getAddonUpdatesCacheKey(target, state.activeLocalFolder);
  const cachedUpd = addonUpdatesCache.get(cacheKey);
  const btnUpdAll = document.getElementById('btnUpdateAllAddons');
  const cntSpan = document.getElementById('addonUpdatesCount');
  if (cachedUpd) {
    const c = Number(cachedUpd.updatesCount) || 0;
    if (cntSpan) cntSpan.textContent = String(c);
    if (btnUpdAll) btnUpdAll.classList.toggle('hidden', c <= 0);
  } else if (btnUpdAll) {
    btnUpdAll.classList.add('hidden');
  }

  const ownerDesc = target.isPack ? `gói Modpack "${escapeHtml(target.shortName)}"` : '.minecraft';
  if (allItems.length === 0) {
    listEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);">Chưa có file nào trong thư mục <strong>${escapeHtml(state.activeLocalFolder)}</strong> của <strong>${ownerDesc}</strong>.</div>`;
    return;
  }
  if (items.length === 0) {
    listEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);">Không tìm thấy gói đã cài nào khớp với từ khóa <strong>"${escapeHtml(q)}"</strong> trong thư mục <strong>${escapeHtml(state.activeLocalFolder)}</strong> của <strong>${ownerDesc}</strong>.</div>`;
    return;
  }
  const activeVer = target.mcVersion || '1.21.4';
  const canEquipInGame = state.activeLocalFolder === 'shaderpacks' || state.activeLocalFolder === 'resourcepacks';
  const updMap = cachedUpd?.itemsMap || {};
  listEl.innerHTML = items.map((item) => {
    const rawVerLabel = item.mcVersion || item.mcDepSpec || '';
    const verTag = rawVerLabel
      ? `<span style="font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:99px;margin-left:8px;${item.mcVersion === activeVer || (item.gameVersions || []).includes(activeVer) ? 'background:var(--bw-ok-bg);color:var(--bw-ok-text);' : 'background:var(--bw-gold-bg);color:var(--bw-gold-text);'}">MC ${escapeHtml(rawVerLabel)}</span>`
      : '';
    const loaderTag = Array.isArray(item.loaders) && item.loaders.length > 0
      ? `<span style="font-size:10px;font-weight:800;padding:2px 6px;border-radius:99px;margin-left:6px;background:rgba(59,130,246,0.14);color:var(--accent);">${escapeHtml(item.loaders.map((l) => l.toUpperCase()).join('/'))}</span>`
      : '';
    const equipBadge = item.equippedInGame && item.enabled
      ? `<span style="font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:99px;margin-left:6px;background:var(--bw-ok-bg);color:var(--bw-ok-text);">✨ Đang bật trong Game</span>`
      : '';
    const safeClean = escapeHtml(item.cleanName);
    const safeName = escapeHtml(item.name);
    const updInfo = updMap[item.cleanName] || null;
    const updBadge = updInfo?.hasUpdate
      ? `<span class="addon-upd-pill" title="Có bản mới ${escapeHtml(updInfo.latestVersion)} trên Modrinth">⬆️ Bản mới: ${escapeHtml(updInfo.latestVersion)}</span>`
      : '';
    const updBtn = updInfo?.hasUpdate
      ? `<button class="btn-install-mod addon-upd-btn" data-updateaddon="${safeClean}" title="Cập nhật lên ${escapeHtml(updInfo.latestFileName || updInfo.latestVersion)} (tự giữ bản cũ để Hoàn tác 1-Click)">⬆️ Cập nhật</button>`
      : '';
    const rbBtn = updInfo?.canRollback
      ? `<button class="vtype-btn addon-rb-btn" data-rollbackaddon="${safeClean}" title="Hoàn tác về bản trước (${escapeHtml(updInfo.previousFileName || 'bản cũ')})">⏪ Hoàn tác</button>`
      : '';
    const equipBtn = canEquipInGame && item.enabled
      ? `<button class="vtype-btn ${item.equippedInGame ? 'active' : ''}" data-equip="${safeClean}" data-equipped="${item.equippedInGame ? '1' : '0'}" title="Kích hoạt hoặc tắt trực tiếp gói này trong cấu hình Minecraft mà không cần mở menu trong game">${item.equippedInGame ? '✓ Đang dùng' : '✨ Dùng trong Game'}</button>`
      : '';
    return `<div class="addon-row"><div><strong style="font-size:12.5px;${item.enabled ? '' : 'text-decoration:line-through;opacity:0.6;'}">${safeClean}</strong>${verTag}${loaderTag}${equipBadge}${updBadge}<span style="font-size:11px;color:var(--text-muted);margin-left:8px;">${Number(item.sizeKB) || 0} KB • ${item.enabled ? 'Đang Bật' : 'Đã Tắt (Tự cất)'}</span></div><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">${updBtn}${rbBtn}${equipBtn}<button class="vtype-btn ${item.enabled ? 'active' : ''}" data-toggle="${safeName}">${item.enabled ? 'Đang Bật' : 'Bật Lại'}</button><button class="vtype-btn" style="color:#ef4444;" data-del="${safeName}">Xóa</button></div></div>`;
  }).join('');
  listEl.querySelectorAll('[data-updateaddon]').forEach((b) => {
    b.onclick = async () => {
      const cleanFile = b.dataset.updateaddon;
      b.disabled = true;
      b.textContent = '⏳ Đang lên...';
      const r = await window.aetherAPI.updateLocalAddons({
        gameDir: state.gameDir,
        instanceDir: target.isPack ? target.dir : '',
        folderType: state.activeLocalFolder,
        fileNames: [cleanFile],
        mcVersion: activeVer,
        loaderType: target.core || 'fabric'
      });
      invalidateAddonUpdatesCache(target, state.activeLocalFolder);
      await refreshAddonUpdatesState(false);
      await renderLocalAddonsManager(true);
      if (r?.ok && r.updatedCount > 0 && typeof showAetherNotification === 'function') {
        const u = r.updated[0];
        showAetherNotification(`⬆️ Đã cập nhật "${u.from}" → "${u.to}" (đã cất bản cũ để có thể Hoàn tác 1-Click)!`, 'success', 4800);
      } else if (typeof showAetherNotification === 'function') {
        showAetherNotification(`⚠️ Không thể cập nhật "${cleanFile}": ${r?.failed?.[0]?.error || 'Đã ở bản mới nhất'}`, 'error', 4200);
      }
    };
  });
  listEl.querySelectorAll('[data-rollbackaddon]').forEach((b) => {
    b.onclick = async () => {
      const cleanFile = b.dataset.rollbackaddon;
      b.disabled = true;
      b.textContent = '⏳ Đang quay lại...';
      const r = await window.aetherAPI.rollbackLocalAddon({
        gameDir: state.gameDir,
        instanceDir: target.isPack ? target.dir : '',
        folderType: state.activeLocalFolder,
        fileName: cleanFile
      });
      invalidateAddonUpdatesCache(target, state.activeLocalFolder);
      await refreshAddonUpdatesState(false);
      await renderLocalAddonsManager(true);
      if (r?.ok && typeof showAetherNotification === 'function') {
        showAetherNotification(`⏪ Đã hoàn tác an toàn về bản cũ "${r.restoredTo}"!`, 'success', 4500);
      } else if (typeof showAetherNotification === 'function') {
        showAetherNotification(`⚠️ ${r?.error || 'Không thể hoàn tác'}`, 'error', 4000);
      }
    };
  });
  listEl.querySelectorAll('[data-equip]').forEach((b) => {
    b.onclick = async () => {
      const wantEnable = b.dataset.equipped !== '1';
      const r = await window.aetherAPI.equipLocalAddon({
        gameDir: target.dir,
        folderType: state.activeLocalFolder,
        fileName: b.dataset.equip,
        enable: wantEnable
      });
      if (r?.ok && typeof showAetherNotification === 'function') {
        showAetherNotification(
          wantEnable
            ? `✨ Đã kích hoạt "${b.dataset.equip}" trong Game! Khi bấm CHƠI NGAY sẽ áp dụng ngay lập tức.`
            : `⏸ Đã gỡ kích hoạt "${b.dataset.equip}" trong cấu hình Game.`,
          'success',
          3800
        );
      }
      if (typeof window.refreshSmartRamCoachUI === 'function') window.refreshSmartRamCoachUI();
      await renderLocalAddonsManager(true);
    };
  });
  listEl.querySelectorAll('[data-toggle]').forEach((b) => {
    b.onclick = async () => {
      await window.aetherAPI.toggleLocalAddon(target.dir, state.activeLocalFolder, b.dataset.toggle);
      await renderLocalAddonsManager(true);
      if (target.isPack && typeof refreshPackInstances === 'function') refreshPackInstances();
    };
  });
  listEl.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      await window.aetherAPI.deleteLocalAddon(target.dir, state.activeLocalFolder, b.dataset.del);
      invalidateAddonUpdatesCache(target, state.activeLocalFolder);
      await renderLocalAddonsManager(true);
      if (target.isPack && typeof refreshPackInstances === 'function') refreshPackInstances();
    };
  });

  if (!cachedUpd && !skipAutoUpdateScan) {
    refreshAddonUpdatesState(false).then((u) => {
      if (u?.ok && (u.updatesCount > 0 || u.rollbackCount > 0)) {
        renderLocalAddonsManager(true);
      }
    }).catch(() => {});
  }
}

// v40.8 Servers 2.0: soft hint when the server's reported version doesn't cover the selected Minecraft version
function serverVersionMismatchNote(verName, selected) {
  const sel = String(selected || '').trim();
  if (!sel || !/^\d+\.\d+/.test(sel)) return '';
  const found = String(verName || '').match(/\b(?:1\.\d{1,2}(?:\.\d{1,2})?|2\d\.\d{1,2}(?:\.\d{1,2})?)\b/g) || [];
  if (!found.length) return '';
  const tup = (v) => v.split('.').map((n) => Number(n) || 0);
  // compare only as many parts as the server wrote ("1.21" covers 1.21.x)
  const cmpPrefix = (a, b) => {
    const A = tup(a);
    const B = tup(b);
    for (let i = 0; i < B.length; i++) {
      const d = (A[i] || 0) - B[i];
      if (d) return d;
    }
    return 0;
  };
  if (found.length >= 2) {
    const sorted = [...found].sort((x, y) => cmpPrefix(x, y) || 0);
    const lo = sorted[0];
    const hi = sorted[sorted.length - 1];
    if (cmpPrefix(sel, lo) >= 0 && cmpPrefix(sel, hi) <= 0) return '';
    return `Server ghi hỗ trợ MC ${lo} → ${hi} — bạn đang chọn ${sel}. Nếu không vào được, đổi phiên bản ở Trang chủ.`;
  }
  if (/\+|\.x\b|-\s*$/i.test(verName) && cmpPrefix(sel, found[0]) >= 0) return '';
  if (cmpPrefix(sel, found[0]) === 0) return '';
  return `Server báo phiên bản ${found[0]} — bạn đang chọn ${sel}. Nhiều server vẫn vào được nhờ ViaVersion; nếu bị từ chối hãy đổi sang ${found[0]}.`;
}

function renderFavoriteServers() {
  const container = document.getElementById('favoriteServersList');
  if (!container) return;
  const badge = document.getElementById('activeServerBadge');
  if (badge) {
    badge.innerHTML = state.serverIp
      ? `Vào thẳng: <strong style="color:var(--accent);">${escapeHtml(state.serverIp)}</strong> <span id="btnClearActiveSrv" style="cursor:pointer;color:#ef4444;margin-left:4px;font-weight:800;" title="Hủy vào thẳng server">[✕]</span>`
      : 'Chế độ: Vào Menu chính';
    const clearBtn = document.getElementById('btnClearActiveSrv');
    if (clearBtn) clearBtn.onclick = () => setServerIpEverywhere('');
  }

  const allServers = state.favoriteServers || [];
  const catFilter = state.serverCategoryFilter || 'all';
  const srvQuery = (document.getElementById('serverSearchInput')?.value || '').trim().toLowerCase();
  const filteredWithIdx = allServers
    .map((srv, idx) => ({ srv, idx }))
    .filter(({ srv }) => {
      if (catFilter !== 'all' && (srv.cat || 'vn') !== catFilter) return false;
      if (srvQuery) {
        const hay = `${srv.name || ''} ${srv.ip || ''}`.toLowerCase();
        if (!hay.includes(srvQuery)) return false;
      }
      return true;
    });

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
    else if (c === 'vn') btn.textContent = `⭐ Việt Nam (${catCounts.vn})`;
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
  const pinnedSet = new Set(Array.isArray(state.pinnedServers) ? state.pinnedServers : []);
  // v40.8: 📌 pinned servers always on top
  filteredWithIdx.sort((a, b) => Number(pinnedSet.has(b.srv.ip)) - Number(pinnedSet.has(a.srv.ip)));
  container.innerHTML = filteredWithIdx.map(({ srv, idx }) => {
    const isSelected = state.serverIp === srv.ip;
    const isPinned = pinnedSet.has(srv.ip);
    const pingInfo = (state.serverPingCache && state.serverPingCache[srv.ip]) || null;
    const ms = Number(pingInfo?.latencyMs) || 0;
    const msClass = ms <= 0 ? '' : (ms < 80 ? 'good' : (ms < 180 ? 'mid' : 'bad'));
    const latencyTag = pingInfo?.online && ms ? `<span class="srv-latency-tag ${msClass}" title="Độ trễ thật từ máy bạn tới server">${ms}ms</span>` : '';
    const sampleTip = Array.isArray(pingInfo?.playersSample) && pingInfo.playersSample.length
      ? ` title="Đang chơi: ${escapeHtml(pingInfo.playersSample.join(', '))}"` : '';
    const statusHtml = pingInfo
      ? (pingInfo.online
          ? `<span class="srv-ping-badge online"${sampleTip}>● ${(pingInfo.playersOnline || 0).toLocaleString('vi-VN')}/${(pingInfo.playersMax || 0).toLocaleString('vi-VN')} người</span>${latencyTag}`
          : `<span class="srv-ping-badge offline">● Ngoại tuyến</span>`)
      : `<span class="srv-ping-badge pending">⏳ Đang kiểm tra...</span>`;
    const safeIcon = (pingInfo?.icon && /^data:image\/|^https?:\/\//i.test(String(pingInfo.icon))) ? escapeHtml(pingInfo.icon) : '';
    const iconHtml = safeIcon
      ? `<img class="srv-icon-img" src="${safeIcon}" alt="" />`
      : `<div class="srv-icon-img srv-icon-fallback">🌐</div>`;
    const catBadge = srv.cat === 'premium'
      ? '<span class="srv-cat-pill premium">👑 Bản quyền</span>'
      : (srv.cat === 'crack' ? '<span class="srv-cat-pill crack">🔓 Crack Quốc Tế</span>' : '<span class="srv-cat-pill vn">⭐ Việt Nam</span>');
    const safeSrvName = escapeHtml(srv.name);
    const safeSrvIp = escapeHtml(srv.ip);
    const verNote = pingInfo?.online ? serverVersionMismatchNote(pingInfo.version, state.selectedVersion) : '';
    const verBadge = pingInfo?.online && pingInfo.version
      ? `<span class="srv-ver-pill ${verNote ? 'warn' : ''}" title="${escapeHtml(verNote || `Server báo phiên bản: ${pingInfo.version}`)}">${verNote ? '⚠ ' : ''}${escapeHtml(String(pingInfo.version).slice(0, 34))}</span>`
      : '';
    const motdHtml = pingInfo?.online && pingInfo.motd
      ? `<div class="srv-motd-line" title="${escapeHtml(pingInfo.motd)}">${escapeHtml(pingInfo.motd).replace(/\n/g, ' • ')}</div>`
      : '';
    return `<div class="srv-card-row ${isSelected ? 'active' : ''} ${isPinned ? 'is-pinned' : ''}">
      <div class="srv-card-left">
        ${iconHtml}
        <div class="srv-card-meta">
          <div class="srv-title-line">
            <strong class="srv-name-text" title="${safeSrvName}">${isPinned ? '📌 ' : ''}${safeSrvName}</strong>
            ${statusHtml}
          </div>
          ${motdHtml}
          <div class="srv-ip-line">${catBadge} ${verBadge} • IP: <span>${safeSrvIp}</span></div>
        </div>
      </div>
      <div class="srv-card-actions">
        <button class="btn-install-mod srv-direct-btn" data-directsrv="${safeSrvIp}" title="Mở game và vào thẳng server này ngay (chỉ lần này)">🚀 Vào Thẳng</button>
        <button class="btn-install-mod ${isSelected ? 'installed' : ''}" data-joinsrv="${safeSrvIp}" title="Ghim server này vào nút CHƠI NGAY">${isSelected ? '✓ Đang chọn' : '▶ Tham gia'}</button>
        <div class="srv-secondary-btns">
          <button class="srv-icon-btn ${isPinned ? 'is-on' : ''}" data-pinsrv="${safeSrvIp}" title="${isPinned ? 'Bỏ ghim' : 'Ghim lên đầu danh sách'}">📌</button>
          <button class="srv-icon-btn" data-copysrv="${safeSrvIp}" title="Sao chép địa chỉ IP: ${safeSrvIp}">📋</button>
          <button class="srv-icon-btn danger" data-delsrv="${idx}" title="Xóa máy chủ khỏi danh sách">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');
  container.querySelectorAll('[data-pinsrv]').forEach((btn) => {
    btn.onclick = () => {
      const ip = btn.dataset.pinsrv;
      const list = Array.isArray(state.pinnedServers) ? state.pinnedServers : [];
      state.pinnedServers = list.includes(ip) ? list.filter((x) => x !== ip) : [ip, ...list];
      saveCurrentConfig();
      renderFavoriteServers();
    };
  });
  container.querySelectorAll('[data-directsrv]').forEach((btn) => {
    btn.onclick = () => {
      if (state.isLaunching) {
        showAetherNotification('⚠️ Minecraft đang chạy hoặc đang khởi động — hãy tắt game trước khi vào server khác.', 'error', 4000);
        return;
      }
      state.pendingOneShotServer = btn.dataset.directsrv;
      document.querySelector('.nav-item[data-tab="home"]')?.click();
      document.getElementById('btnLaunch')?.click();
    };
  });
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

async function quickLaunchWorld(w) {
  if (!w) return;
  if (state.isLaunching) {
    if (typeof showAetherNotification === 'function') {
      showAetherNotification('⚠️ Minecraft đang chạy hoặc đang khởi động. Hãy tắt game trước khi chuyển thế giới.', 'error', 4000);
    }
    return;
  }
  const folderName = String(w.folderName || w.name || '').trim();
  const worldTitle = String(w.name || folderName || 'Thế giới').trim();
  if (w.instanceDir && typeof launchPackInstance === 'function') {
    document.querySelector('.nav-item[data-tab="home"]')?.click();
    await launchPackInstance({
      name: w.instanceName || 'Modpack',
      dir: w.instanceDir,
      mcVersion: w.instanceMcVersion || w.version || '1.21.11',
      loader: w.instanceLoader || 'fabric',
      loaderVersion: w.instanceLoaderVersion || '',
      ramRecommendedGB: w.instanceRamGB || 4
    }, '', folderName, worldTitle);
    return;
  }
  const cleanVer = String(w.version || '').trim();
  const canSwitchVer = /^(?:1|2[6-9])\.\d+(?:\.\d+)?$/.test(cleanVer)
    && cleanVer !== state.selectedVersion
    && (
      (typeof isVersionInstalledOnDisk === 'function' && isVersionInstalledOnDisk(cleanVer))
      || (Array.isArray(state.versions) && state.versions.some((v) => v.id === cleanVer))
    );
  if (canSwitchVer && typeof window.selectMcVersionAndCore === 'function') {
    await window.selectMcVersionAndCore(cleanVer, state.selectedCore);
  }
  state.pendingQuickWorldFolder = folderName;
  state.pendingQuickWorldTitle = worldTitle;
  document.querySelector('.nav-item[data-tab="home"]')?.click();
  const playBtn = document.getElementById('btnLaunch');
  if (playBtn && !state.isLaunching) playBtn.click();
}
window.quickLaunchWorld = quickLaunchWorld;

function renderHomeRecentWorlds(worlds = []) {
  const homeGrid = document.getElementById('homeRecentWorldsGrid');
  if (!homeGrid) return;
  const recentSlice = worlds.slice(0, 3);
  const createCardHtml = `
    <button class="hw-create-card" id="btnHomeCreateWorldCard" title="Vào game tạo thế giới mới">
      <div class="hw-create-plus">+</div>
      <div class="hw-create-label">Tạo thế giới mới</div>
      <div class="hw-create-sub">Bắt đầu hành trình</div>
    </button>
  `;
  const worldCards = recentSlice.map((w, idx) => {
    const thumbUrl = (w.iconDataUrl && /^data:image\//i.test(String(w.iconDataUrl))) ? w.iconDataUrl : 'app-banner-hero.png';
    const safePath = escapeHtml(w.path);
    const safeName = escapeHtml(w.name);
    const safePlayed = escapeHtml(w.lastPlayed || 'Mới tạo');
    const verPart = w.version ? `MC ${escapeHtml(w.version)}` : 'Chơi đơn';
    const modePart = w.gameMode ? ` • ${escapeHtml(w.gameMode)}` : '';
    const verBadgeText = `${verPart}${modePart}`;
    const subLabel = w.instanceName
      ? `📦 ${escapeHtml(w.instanceName)} • ${safePlayed}`
      : `Chơi gần nhất: ${safePlayed}`;
    return `
      <div class="hw-world-card" data-worldpath="${safePath}" data-hwidx="${idx}" title="⚡ Bấm để vào thẳng thế giới: ${safeName} (${verBadgeText}${w.instanceName ? ` — Gói ${escapeHtml(w.instanceName)}` : ''} — ${safePlayed})">
        <div class="hw-world-thumb" style="background-image:url('${thumbUrl}')">
          <span class="hw-world-ver-tag">${verBadgeText}</span>
          <span class="hw-world-play-overlay">▶ Vào thẳng Map</span>
        </div>
        <div class="hw-world-body">
          <div class="hw-world-info">
            <div class="hw-world-title">${safeName}</div>
            <div class="hw-world-sub">${subLabel}</div>
          </div>
          <button class="hw-world-menu-btn" data-openworld="${safePath}" title="Mở thư mục thế giới này trong Explorer">⋮</button>
        </div>
      </div>
    `;
  });

  if (worldCards.length === 0) {
    worldCards.push(`
      <div class="hw-world-empty-notice">
        <strong>Chưa có thế giới chơi đơn nào</strong>
        <span>Các thế giới bạn tạo trong game sẽ tự động hiển thị tại đây — bấm trực tiếp vào thẻ thế giới để vào thẳng Map 1-Click!</span>
      </div>
    `);
  }

  homeGrid.innerHTML = createCardHtml + worldCards.join('');

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
  homeGrid.querySelectorAll('.hw-world-card[data-hwidx]').forEach((card) => {
    card.onclick = () => {
      const w = recentSlice[Number(card.dataset.hwidx)];
      if (w) quickLaunchWorld(w);
    };
  });
}

async function renderLocalWorlds() {
  const res = await window.aetherAPI.listLocalWorlds(state.gameDir);
  const worlds = res?.worlds || [];
  renderHomeRecentWorlds(worlds);
  const container = document.getElementById('localWorldsList');
  if (!container) return;
  const worldQuery = (document.getElementById('worldSearchInput')?.value || '').trim().toLowerCase();
  const filteredWorlds = worldQuery
    ? worlds.filter((w) => String(w.name || '').toLowerCase().includes(worldQuery) || String(w.folderName || '').toLowerCase().includes(worldQuery) || String(w.instanceName || '').toLowerCase().includes(worldQuery))
    : worlds;
  const countBadge = document.getElementById('worldsCountBadge');
  if (countBadge) {
    countBadge.textContent = worldQuery ? `${filteredWorlds.length}/${worlds.length} Map` : `${worlds.length} Map`;
  }
  if (typeof refreshWorldBackupsUI === 'function') refreshWorldBackupsUI(false);
  if (worlds.length === 0) {
    container.innerHTML = `<div class="empty-subpage-state">
      <div class="ess-icon">🌍</div>
      <div class="ess-title">Chưa có thế giới chơi đơn nào trong <code>.minecraft/saves</code></div>
      <div class="ess-desc">Khi bạn tạo Thế giới mới trong game, tải Bản đồ xây sẵn 1-Click hoặc đồng bộ từ Launcher cũ, bản đồ sẽ tự động xuất hiện tại đây.</div>
      <div class="ess-actions">
        <button class="btn-fps-boost-1click" id="btnEmptyBrowseWorldStore">🗺️ Tải Map Xây Sẵn &amp; Datapack (1-Click)</button>
        <button class="vtype-btn" id="btnEmptyOpenSaves">📂 Mở thư mục Saves</button>
        <button class="vtype-btn active" id="btnEmptyMigrateWorlds">📥 Đồng bộ dữ liệu từ Launcher cũ</button>
      </div>
    </div>`;
    const bStore = document.getElementById('btnEmptyBrowseWorldStore');
    if (bStore) bStore.onclick = () => document.getElementById('btnWorldsViewStore')?.click();
    const bSaves = document.getElementById('btnEmptyOpenSaves');
    if (bSaves) bSaves.onclick = () => window.aetherAPI.openSubFolder(state.gameDir, 'saves');
    const bMig = document.getElementById('btnEmptyMigrateWorlds');
    if (bMig && typeof openLauncherMigrateModal === 'function') bMig.onclick = () => openLauncherMigrateModal();
    return;
  }
  if (filteredWorlds.length === 0) {
    container.innerHTML = `<div class="empty-subpage-state">
      <div class="ess-icon">🔍</div>
      <div class="ess-title">Không tìm thấy thế giới nào khớp với "${escapeHtml(worldQuery)}"</div>
      <div class="ess-desc">Hãy thử nhập từ khóa khác hoặc xóa ô tìm kiếm để xem toàn bộ ${worlds.length} bản đồ trong máy.</div>
    </div>`;
    return;
  }
  container.innerHTML = filteredWorlds.map((w, idx) => {
    const safeName = escapeHtml(w.name);
    const safeFolder = escapeHtml(w.folderName || w.name);
    const safePlayed = escapeHtml(w.lastPlayed);
    const safePath = escapeHtml(w.path);
    const safeIcon = (w.iconDataUrl && /^data:image\//i.test(String(w.iconDataUrl))) ? escapeHtml(w.iconDataUrl) : '';
    const verInfo = w.version ? `Minecraft ${escapeHtml(w.version)}` : 'Chơi đơn';
    const modeInfo = w.gameMode ? ` (${escapeHtml(w.gameMode)})` : '';
    const packBadge = w.instanceName ? ` • <strong style="color:var(--accent);">📦 ${escapeHtml(w.instanceName)}</strong>` : '';
    const dpCount = Number(w.datapacksCount) || 0;
    const dpBadge = dpCount > 0 ? ` • <strong style="color:#10b981;">📜 ${dpCount} Datapack</strong>` : '';
    return `<div class="world-card-row">
    <div class="world-left">
      ${safeIcon ? `<img class="world-icon" src="${safeIcon}" alt="" />` : '<div class="world-icon world-icon-fallback">🌍</div>'}
      <div class="world-meta-col">
        <strong class="world-title-text" title="${safeName}">${safeName}</strong>
        <div class="world-sub-text">🎮 ${verInfo}${modeInfo}${packBadge}${dpBadge} • 🕒 Lần chơi cuối: ${safePlayed}</div>
      </div>
    </div>
    <div class="world-card-actions" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
      <button class="btn-install-mod" data-playworld="${safeName}" data-widx="${idx}" title="⚡ Vào thẳng thế giới ${safeName} (${w.instanceName ? `Gói ${escapeHtml(w.instanceName)}` : 'Minecraft'}) chỉ với 1 cú nhấp!">⚡ Vào Thẳng</button>
      <button class="vtype-btn world-rescue-btn" data-worldrescue="${safePath}" data-worldtitle="${safeName}" title="Xem Seed, tọa độ nhân vật (X, Y, Z), mở khóa lệnh, bật giữ đồ hoặc hồi sinh Hardcore">🛠️ Cứu hộ / Seed</button>
      <button class="vtype-btn" data-worlddatapacks="${safePath}" data-worldtitle="${safeName}" title="Quản lý hoặc thêm các gói Datapack đang gắn trong thế giới này">📜 Datapack${dpCount > 0 ? ` (${dpCount})` : ''}</button>
      <button class="vtype-btn" data-backupworld="${safeFolder}" data-worldpath="${safePath}" data-worldtitle="${safeName}" title="Sao lưu 1-Click thế giới này thành bản .zip an toàn">💾 Sao lưu</button>
      <button class="vtype-btn" data-exportworld="${safeFolder}" data-worldpath="${safePath}" data-worldtitle="${safeName}" title="Xuất thế giới này ra file .zip để chia sẻ với bạn bè">📤 Xuất Map</button>
      <button class="vtype-btn" data-openworld="${safePath}" title="Mở thư mục bản đồ này trong Windows Explorer">📂 Mở Thư Mục</button>
    </div>
  </div>`;
  }).join('');
  container.querySelectorAll('[data-openworld]').forEach((btn) => { btn.onclick = () => window.aetherAPI.openGameDir(btn.dataset.openworld); });
  container.querySelectorAll('[data-worldrescue]').forEach((btn) => {
    btn.onclick = () => {
      if (typeof window.openWorldRescueModal === 'function') {
        window.openWorldRescueModal(btn.dataset.worldrescue, btn.dataset.worldtitle);
      }
    };
  });
  container.querySelectorAll('[data-worlddatapacks]').forEach((btn) => {
    btn.onclick = () => {
      if (typeof window.openWorldDatapacksModal === 'function') {
        window.openWorldDatapacksModal(btn.dataset.worlddatapacks, btn.dataset.worldtitle);
      }
    };
  });
  container.querySelectorAll('[data-playworld]').forEach((btn) => {
    btn.onclick = () => {
      const w = filteredWorlds[Number(btn.dataset.widx)];
      if (w) quickLaunchWorld(w);
    };
  });
  container.querySelectorAll('[data-backupworld]').forEach((btn) => {
    btn.onclick = async () => {
      const folderOrPath = btn.dataset.worldpath || btn.dataset.backupworld;
      const worldTitle = btn.dataset.worldtitle || btn.dataset.backupworld;
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ Đang nén...';
      const r = await window.aetherAPI.backupLocalWorld(state.gameDir, folderOrPath);
      btn.disabled = false;
      btn.textContent = orig;
      if (r?.ok) {
        showAetherNotification(`💾 Đã sao lưu thế giới "${worldTitle}" (${r.fileName}, ${r.sizeMB} MB)!`, 'success', 4500);
        if (typeof refreshWorldBackupsUI === 'function') refreshWorldBackupsUI(false);
      } else {
        showAetherNotification(`⚠️ Không thể sao lưu: ${r?.error || 'Lỗi nén file'}`, 'error', 4500);
      }
    };
  });
  container.querySelectorAll('[data-exportworld]').forEach((btn) => {
    btn.onclick = async () => {
      const folderOrPath = btn.dataset.worldpath || btn.dataset.exportworld;
      const worldTitle = btn.dataset.worldtitle || btn.dataset.exportworld;
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ Đang xuất...';
      const r = await window.aetherAPI.exportWorldZip(state.gameDir, folderOrPath);
      btn.disabled = false;
      btn.textContent = orig;
      if (r?.ok) {
        showAetherNotification(`📤 Đã xuất Map "${worldTitle}" ra file .zip thành công!`, 'success', 4500);
      } else if (!r?.canceled) {
        showAetherNotification(`⚠️ Lỗi xuất Map: ${r?.error || 'Không thể lưu file'}`, 'error', 4500);
      }
    };
  });
  if (typeof refreshWorldBackupsUI === 'function') refreshWorldBackupsUI(false);
}
async function pingAllFavoriteServers(onlyMissing = false) {
  if (!state.serverPingCache) state.serverPingCache = {};
  if (state._pingAllRunning) {
    // servers added while a ping round is running (e.g. imported from servers.dat) get pinged right after
    state._pingAllQueued = true;
    return;
  }
  state._pingAllRunning = true;
  const btn = document.getElementById('btnPingAllServers');
  if (btn) { btn.textContent = '⏳ Đang ping...'; btn.disabled = true; }
  // v40.8: native status ping, max 6 at a time so it stays light on the network & CPU
  const queue = [...new Set((state.favoriteServers || []).map((s) => s.ip).filter(Boolean))]
    .filter((ip) => !onlyMissing || !state.serverPingCache[ip]);
  let rerenderTimer = null;
  const scheduleRender = () => {
    if (rerenderTimer) return;
    rerenderTimer = setTimeout(() => { rerenderTimer = null; renderFavoriteServers(); }, 250);
  };
  const worker = async () => {
    while (queue.length) {
      const ip = queue.shift();
      try {
        const res = await window.aetherAPI.pingServer(ip);
        state.serverPingCache[ip] = res && res.ok ? res : { ok: true, online: false };
      } catch (_) {
        state.serverPingCache[ip] = { ok: true, online: false };
      }
      scheduleRender();
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(6, queue.length || 1) }, worker));
  } finally {
    state._pingAllRunning = false;
    if (btn) { btn.textContent = '📡 Kiểm tra Ping'; btn.disabled = false; }
    renderFavoriteServers();
    if (state._pingAllQueued) {
      state._pingAllQueued = false;
      pingAllFavoriteServers(true);
    }
  }
}

// v40.8: two-way sync with the in-game Multiplayer list (servers.dat)
async function syncServersWithGameDat(silent = true) {
  if (!window.aetherAPI.syncServersDat || state.isLaunching) return;
  const now = Date.now();
  if (silent && state._lastServersDatSync && now - state._lastServersDatSync < 60000) return;
  state._lastServersDatSync = now;
  try {
    const featured = new Set((typeof DEFAULT_FEATURED_SERVERS !== 'undefined' ? DEFAULT_FEATURED_SERVERS : []).map((d) => String(d.ip).toLowerCase()));
    const pinned = new Set(Array.isArray(state.pinnedServers) ? state.pinnedServers : []);
    const writeServers = (state.favoriteServers || []).filter((s) => s && s.ip && (!featured.has(String(s.ip).toLowerCase()) || pinned.has(s.ip)));
    const res = await window.aetherAPI.syncServersDat({ gameDir: state.gameDir, servers: state.favoriteServers || [], writeServers, writeToGame: true });
    if (!res?.ok) return;
    const imported = Array.isArray(res.importedFromGame) ? res.importedFromGame : [];
    if (imported.length) {
      state.favoriteServers = [...(state.favoriteServers || []), ...imported.map((s) => ({ name: s.name, ip: s.ip, cat: 'vn' }))];
      saveCurrentConfig();
      renderFavoriteServers();
      pingAllFavoriteServers();
    }
    if (!silent || imported.length || res.addedToGame) {
      showAetherNotification(`🔄 Đồng bộ danh sách server với game: +${imported.length} từ Minecraft, +${res.addedToGame || 0} vào Multiplayer trong game.`, 'success', 4000);
    }
  } catch (_) {}
}
window.syncServersWithGameDat = syncServersWithGameDat;

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
      const accText = it.accounts?.length ? ` • 👤 Tên cũ: <strong>${it.accounts.slice(0, 4).map(escapeHtml).join(', ')}</strong>` : '';
      const metaText = it.detectedVersion ? ` • 🎯 Bản: <strong>${escapeHtml(it.detectedVersion)} ${escapeHtml((it.detectedCore || '').toUpperCase())}</strong>` : '';
      const cfgText = it.configsCount ? ` • ⚙️ <strong>${escapeHtml(it.configsCount)}</strong> Config` : '';
      const sharedBadge = it.isSharedRoot
        ? '<span style="color:var(--bw-ok-text);font-weight:800;font-size:11.5px;">✓ Đang dùng chung .minecraft</span>'
        : '<span style="color:var(--accent);font-weight:800;font-size:11.5px;">📥 Có thể chép sang</span>';
      const safeMigPath = escapeHtml(it.path);
      return `<div class="addon-row migrate-source-card" data-migpath="${safeMigPath}" style="cursor:pointer;border:1.8px solid ${active ? 'var(--accent)' : 'var(--border-col)'};background:${active ? 'var(--accent-glow)' : 'var(--bg-input)'};padding:12px 14px;border-radius:10px;">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <strong style="font-size:13.5px;color:var(--text-main);">${escapeHtml(it.launcherName)} — ${escapeHtml(it.instanceName)}</strong>
            ${sharedBadge}
          </div>
          <div style="font-size:12px;color:var(--text-muted);">
            🌍 <strong>${escapeHtml(it.worldsCount)}</strong> Thế giới • 🧩 <strong>${escapeHtml(it.modsCount)}</strong> Mods${cfgText} • ✨ <strong>${escapeHtml((Number(it.shadersCount) || 0) + (Number(it.packsCount) || 0) || it.packsCount)}</strong> Shaders/Packs${metaText}${accText}
          </div>
          <div style="font-size:11px;color:var(--text-muted);opacity:0.8;">📂 ${safeMigPath}</div>
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
      await renderLocalAddonsManager();
      if (typeof refreshLoaderBuilds === 'function') await refreshLoaderBuilds();
      if (typeof loadModrinthStore === 'function') loadModrinthStore(false);
      if (typeof updateSummaryUI === 'function') updateSummaryUI();
      const freshScan = await window.aetherAPI.scanExternalLaunchers(state.gameDir);
      if (freshScan?.items?.length) renderCards(freshScan.items);
      const srcItem = (freshScan?.items || items).find((x) => x.path === selectedMigrateSourcePath);
      const srcLabel = srcItem ? `${srcItem.launcherName} — ${srcItem.instanceName}` : selectedMigrateSourcePath;
      const destDir = imp.targetRoot || state.gameDir || '.minecraft';
      statusEl.innerHTML = `
        <div style="background:var(--bg-input);border:1.5px solid var(--accent);border-radius:10px;padding:10px 12px;margin-top:2px;color:var(--text-main);font-weight:600;line-height:1.5;">
          <div style="color:var(--accent);font-weight:800;font-size:12.5px;margin-bottom:4px;">${escapeHtml(msg)}</div>
          <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:6px;">
            📥 <strong>Nguồn:</strong> ${escapeHtml(srcLabel)}<br/>
            📂 <strong>Đã lưu vào thư mục:</strong> <code>${escapeHtml(destDir)}</code> <span>(\saves, \mods, \config, \shaderpacks, \resourcepacks)</span><br/>
            🔄 <strong>Đã tự làm mới:</strong> Mục <em>Chơi game (${escapeHtml(state.selectedVersion)} • ${escapeHtml((state.selectedCore || '').toUpperCase())})</em>, <em>Thế giới</em>, <em>Mod &amp; Pack (Đã cài trên máy)</em>, <em>Máy chủ</em> &amp; <em>Tài khoản</em>.
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
            <button type="button" class="vtype-btn active" id="btnMigGoMods" style="font-size:11.5px;padding:4px 10px;">🧩 Xem Mods Đã Đồng Bộ (${Number(st.modsCopied) || 0})</button>
            <button type="button" class="vtype-btn" id="btnMigGoWorlds" style="font-size:11.5px;padding:4px 10px;">🌍 Xem Thế Giới (${Number(st.worldsCopied) || 0})</button>
            <button type="button" class="vtype-btn" id="btnMigGoServers" style="font-size:11.5px;padding:4px 10px;">🌐 Xem Máy Chủ</button>
            <button type="button" class="vtype-btn" id="btnMigOpenDestFolder" style="font-size:11.5px;padding:4px 10px;">📂 Mở Thư Mục Đích</button>
          </div>
        </div>
      `;
      const goModsBtn = document.getElementById('btnMigGoMods');
      if (goModsBtn) {
        goModsBtn.onclick = async () => {
          modal.classList.add('hidden');
          document.querySelector('.nav-item[data-tab="mods"]')?.click();
          // v40.8: open the "Đã Cài" view + mods folder (old selectors pointed at elements that don't exist)
          document.querySelector('.mtype-btn[data-ptype="installed"]')?.click();
          state.activeLocalFolder = 'mods';
          document.querySelector('[data-localfolder="mods"]')?.click();
          await renderLocalAddonsManager();
          document.getElementById('localAddonsList')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        };
      }
      const goWorldsBtn = document.getElementById('btnMigGoWorlds');
      if (goWorldsBtn) {
        goWorldsBtn.onclick = async () => {
          modal.classList.add('hidden');
          document.querySelector('.nav-item[data-tab="worlds"]')?.click();
          await renderLocalWorlds();
        };
      }
      const goServersBtn = document.getElementById('btnMigGoServers');
      if (goServersBtn) {
        goServersBtn.onclick = () => {
          modal.classList.add('hidden');
          document.querySelector('.nav-item[data-tab="servers"]')?.click();
          renderFavoriteServers();
        };
      }
      const openDestBtn = document.getElementById('btnMigOpenDestFolder');
      if (openDestBtn) {
        openDestBtn.onclick = () => window.aetherAPI.openGameDir(state.gameDir);
      }
      if (typeof window.pushTopNotification === 'function') {
        window.pushTopNotification(`✓ Đã đồng bộ từ [${srcLabel}] vào ${destDir} và làm mới toàn bộ mục Mod, Thế giới, Phiên bản!`);
      }
      document.getElementById('statusText').textContent = msg;
    } else {
      statusEl.textContent = `⚠ Lỗi: ${imp?.error || 'Không thể đồng bộ thư mục này.'}`;
    }
  };
}

/* ============================================================================
   v40.0 PRO — KHO MODPACK TOÀN CẦU (UI)
   Modrinth • CurseForge • FTB • Technic • ATLauncher + Nhập file / link
   ============================================================================ */
const packHub = {
  kind: 'modpack',
  source: 'all',
  query: '',
  mc: '',
  loader: '',
  sort: 'smart',
  offset: 0,
  sourceOffsets: {},
  items: [],
  seen: new Set(),
  loading: false,
  inited: false,
  installing: false,
  launchingInstance: null,
  cfStatus: null,
  instances: [],
  viEnabled: true
};

const PACK_SOURCE_META = {
  modrinth: { label: 'Modrinth', cls: 'src-modrinth' },
  curseforge: { label: 'CurseForge', cls: 'src-curseforge' },
  ftb: { label: 'FTB', cls: 'src-ftb' },
  technic: { label: 'Technic', cls: 'src-technic' },
  atlauncher: { label: 'ATLauncher', cls: 'src-atlauncher' }
};

const PACK_LOADER_LABEL = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt', legacyfabric: 'Legacy Fabric', optifine: 'OptiFine', vanilla: 'Vanilla', datapack: 'Datapack' };

function packSourceMeta(src) {
  if (PACK_SOURCE_META[src]) return PACK_SOURCE_META[src];
  if (String(src || '').startsWith('import')) return { label: 'Nhập file', cls: 'src-import' };
  return { label: src || '?', cls: 'src-import' };
}

function packFmtNum(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}K`;
  return String(v);
}

function packFmtSize(bytes) {
  const b = Number(bytes) || 0;
  if (!b) return '';
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

function packDescToPlainText(desc, isHtml) {
  let text = String(desc || '');
  if (isHtml) {
    text = text
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ');
    try {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      text = doc.body.textContent || '';
    } catch (_) {
      text = text.replace(/<[^>]+>/g, ' ');
    }
  } else {
    text = text
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/(\*\*|__|`)/g, '');
  }
  return text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim().slice(0, 2600);
}

function packDescToSafeHtml(desc, isHtml) {
  return escapeHtml(packDescToPlainText(desc, isHtml)).replace(/\n/g, '<br>');
}

function packIconHtml(url, cls = 'pack-icon') {
  if (!url) return `<div class="${cls} pack-icon-fallback">📦</div>`;
  return `<img class="${cls}" src="${escapeHtml(url)}" alt="" loading="lazy" draggable="false" />`;
}

function packBindIconFallbacks(root) {
  root.querySelectorAll('img.pack-icon, img.pack-inst-icon, img.pack-modal-icon').forEach((img) => {
    img.addEventListener('error', () => {
      const div = document.createElement('div');
      div.className = `${img.className} pack-icon-fallback`;
      div.textContent = '📦';
      img.replaceWith(div);
    }, { once: true });
  });
}

function packNotify(msg, type = 'success', ms = 4500) {
  if (typeof showAetherNotification === 'function') showAetherNotification(msg, type, ms);
  else if (typeof window.pushTopNotification === 'function') window.pushTopNotification(msg);
}

/* ---------- Modal helpers ---------- */
function packOpenModal(html, wide = true) {
  const modal = document.getElementById('packHubModal');
  const card = document.getElementById('packHubModalCard');
  if (!modal || !card) return null;
  card.classList.toggle('pack-modal-wide', Boolean(wide));
  card.innerHTML = html;
  modal.classList.remove('hidden');
  card.querySelectorAll('[data-pmclose]').forEach((b) => { b.onclick = () => packCloseModal(); });
  modal.onclick = (e) => { if (e.target === modal) packCloseModal(); };
  packBindIconFallbacks(card);
  return card;
}

function packCloseModal() {
  document.getElementById('packHubModal')?.classList.add('hidden');
}

/* ---------- Progress ---------- */
function packShowProgress(text, pct, isError = false) {
  const box = document.getElementById('packsProgressBox');
  if (!box) return;
  box.classList.remove('hidden');
  box.classList.toggle('is-error', Boolean(isError));
  const t = document.getElementById('packsProgressText');
  const p = document.getElementById('packsProgressPct');
  const f = document.getElementById('packsProgressFill');
  if (t && text) t.textContent = text;
  if (typeof pct === 'number') {
    if (p) p.textContent = `${pct}%`;
    if (f) f.style.width = `${pct}%`;
  }
}

function packHideProgress(delay = 0) {
  setTimeout(() => {
    if (!packHub.installing && !packHub.launchingInstance) document.getElementById('packsProgressBox')?.classList.add('hidden');
  }, delay);
}

/* ---------- CurseForge key ---------- */
async function refreshCfKeyState() {
  const el = document.getElementById('packsCfKeyState');
  try {
    const st = await window.aetherAPI.packsCfKeyStatus();
    packHub.cfStatus = st;
    if (el) {
      el.textContent = !st?.hasKey ? 'Chưa có key' : st.valid ? '✅ Đã kết nối' : '⚠️ Key lỗi';
      el.parentElement?.classList.toggle('is-ok', Boolean(st?.valid));
    }
  } catch (_) {
    if (el) el.textContent = '?';
  }
}

function openCfKeyModal() {
  const st = packHub.cfStatus || {};
  const card = packOpenModal(`
    <div class="modal-head"><span class="card-dot emerald"></span><h3>🔑 Kết nối CurseForge API</h3></div>
    <div class="modal-body">
      <p>CurseForge là kho Modpack lớn nhất thế giới (nhiều gói Zombie / 100 Days / OneBlock chỉ có ở đây). Để tải gói qua BlockWay cần <strong>CurseForge API Key</strong> miễn phí.</p>
      <div class="pack-key-status ${st.valid ? 'ok' : ''}">${st.hasKey ? (st.valid ? `✅ Đang dùng key <code>${escapeHtml(st.masked || '')}</code>${st.searchAllowed ? ' • Tìm kiếm: OK' : ' • Tìm kiếm: đang giới hạn (dùng danh sách nổi bật)'}` : '⚠️ Key hiện tại không hợp lệ') : 'ℹ️ Chưa có key — Modrinth, FTB, Technic, ATLauncher vẫn hoạt động bình thường.'}</div>
      <input type="password" id="packCfKeyInput" class="pro-input" placeholder="Dán CurseForge API Key (bắt đầu bằng $2a$10$...)" autocomplete="off" />
      <p class="pack-modal-hint">🔒 Key chỉ lưu trên máy bạn (thư mục dữ liệu ứng dụng), không gửi lên GitHub. Lấy key tại <strong>console.curseforge.com</strong> → API Keys.</p>
      <div id="packCfKeyMsg" class="pack-modal-msg"></div>
    </div>
    <div class="modal-foot">
      <button class="btn-modal-cancel" id="btnCfKeyGuide">🌐 Mở trang lấy key</button>
      ${st.hasKey ? '<button class="btn-modal-cancel" id="btnCfKeyClear">🗑 Xóa key</button>' : ''}
      <button class="btn-modal-cancel" data-pmclose>Đóng</button>
      <button class="btn-modal-agree" id="btnCfKeySave">💾 Lưu &amp; Kiểm tra</button>
    </div>`, false);
  if (!card) return;
  card.querySelector('#btnCfKeyGuide').onclick = () => window.aetherAPI.openExternal('https://console.curseforge.com/');
  const msg = card.querySelector('#packCfKeyMsg');
  card.querySelector('#btnCfKeySave').onclick = async () => {
    const key = card.querySelector('#packCfKeyInput').value.trim();
    if (!key) { msg.textContent = '⚠️ Hãy dán key vào ô trên.'; return; }
    msg.textContent = '⏳ Đang kiểm tra key với máy chủ CurseForge...';
    const res = await window.aetherAPI.packsCfKeySet(key);
    if (res?.ok) {
      msg.textContent = `✅ Đã lưu key (${res.masked}). ${res.searchAllowed ? 'Tìm kiếm CurseForge đã bật.' : 'Key hợp lệ — tìm kiếm có thể cần vài phút để kích hoạt.'}`;
      await refreshCfKeyState();
      runPackSearch(true);
    } else {
      msg.textContent = `❌ ${res?.error || 'Không lưu được key.'}`;
    }
  };
  const clr = card.querySelector('#btnCfKeyClear');
  if (clr) clr.onclick = async () => { await window.aetherAPI.packsCfKeySet(''); await refreshCfKeyState(); packCloseModal(); runPackSearch(true); };
}

/* ---------- Search & results ---------- */
function packUpdateSourceTabsForKind() {
  const allowed = packHub.kind === 'modpack'
    ? ['all', 'modrinth', 'curseforge', 'ftb', 'technic', 'atlauncher']
    : ['all', 'modrinth', 'curseforge'];
  document.querySelectorAll('#packsSourceTabs [data-psrc]').forEach((b) => {
    b.classList.toggle('hidden', !allowed.includes(b.dataset.psrc));
  });
  if (!allowed.includes(packHub.source)) {
    packHub.source = 'all';
    document.querySelectorAll('#packsSourceTabs [data-psrc]').forEach((b) => b.classList.toggle('active', b.dataset.psrc === 'all'));
  }
  const loaderSel = document.getElementById('packsLoaderFilter');
  if (loaderSel) loaderSel.disabled = packHub.kind !== 'modpack';
}

function packJavaForMc(mcVer) {
  if (!mcVer) return 'Java 21/17 (Tự động)';
  const parts = String(mcVer).split('.').map((n) => parseInt(n, 10));
  const major = parts[0] || 1;
  const minor = parts[1] || 21;
  const patch = parts[2] || 0;
  if (major >= 26) return 'Java 25';
  if (minor > 20 || (minor === 20 && patch >= 5)) return 'Java 21';
  if (minor >= 17) return 'Java 17';
  return 'Java 8';
}

function packRenderCards(items, append) {
  const grid = document.getElementById('packsResultsGrid');
  if (!grid) return;
  const html = items.map((it) => {
    const sm = packSourceMeta(it.source);
    const vers = (it.mcVersions || []).slice(0, 3);
    const more = (it.mcVersions || []).length - vers.length;
    const loaders = (it.loaders || []).filter((l) => l !== 'datapack' || it.kind === 'datapack').slice(0, 4);
    const displaySummary = (packHub.viEnabled && it.summaryVi) ? it.summaryVi : (it.summary || 'Chưa có mô tả.');
    const reqMc = vers.length ? `MC ${vers.join(', ')}${more > 0 ? ` (+${more})` : ''}` : 'Tự nhận diện MC';
    const reqLd = loaders.length ? loaders.map((l) => PACK_LOADER_LABEL[l] || l).join(' / ') : (it.kind === 'world' ? 'Bản đồ (Save)' : it.kind === 'datapack' ? 'Datapack' : 'Tự thiết lập Loader');
    const safeMapBanner = ((it.kind === 'world' || packHub.kind === 'world') && /^https?:\/\//i.test(String(it.bannerUrl || '')))
      ? escapeHtml(it.bannerUrl)
      : '';
    return `<div class="pack-card${safeMapBanner ? ' has-map-banner' : ''}" data-uid="${escapeHtml(it.uid)}">
      ${safeMapBanner ? `<div class="pack-card-map-banner"><img src="${safeMapBanner}" alt="" loading="lazy" /></div>` : ''}
      <div class="pack-card-top">
        ${packIconHtml(it.iconUrl)}
        <div class="pack-head">
          <strong class="pack-title" title="${escapeHtml(it.title)}">${escapeHtml(it.title)}</strong>
          <span class="pack-author">${it.author ? `bởi ${escapeHtml(it.author)}` : '&nbsp;'}</span>
        </div>
        <span class="pack-src-badge ${sm.cls}">${sm.label}</span>
      </div>
      <p class="pack-summary">${escapeHtml(displaySummary)}</p>
      <div class="pack-tags">
        ${vers.map((v) => `<span class="pack-tag mc">MC ${escapeHtml(v)}</span>`).join('')}${more > 0 ? `<span class="pack-tag">+${more}</span>` : ''}
        ${loaders.map((l) => `<span class="pack-tag ld-${escapeHtml(l)}">${escapeHtml(PACK_LOADER_LABEL[l] || l)}</span>`).join('')}
        ${it.isHypixelClient ? `<span class="pack-tag" style="background:rgba(245,158,11,0.14);color:#d97706;border:1px solid rgba(245,158,11,0.35);" title="Gói gốc dành cho Server Hypixel, nhưng BlockWay sẽ tự động bơm thêm Đảo SkyBlock chơi đơn khi bạn cài đặt!">🌐 Phụ trợ Hypixel (+Tự thêm Đảo)</span>` : ''}
      </div>
      <div class="pack-req-strip" title="BlockWay sẽ tự động thiết lập đúng phiên bản Minecraft, Loader và Java khi bạn bấm cài đặt">
        ⚙️ Yêu cầu: <strong>${escapeHtml(reqMc)}</strong> • <strong>${escapeHtml(reqLd)}</strong> <em>(Tự thiết lập)</em>
      </div>
      <div class="pack-card-foot">
        <span class="pack-dl">${it.downloads ? `⬇ ${packFmtNum(it.downloads)} lượt tải` : (it.source === 'atlauncher' ? '🅰️ Gói ATLauncher' : '')}</span>
        <button class="btn-install-mod pack-open-btn" data-popen="${escapeHtml(it.uid)}">Chi tiết &amp; Cài ›</button>
      </div>
    </div>`;
  }).join('');
  if (append) grid.insertAdjacentHTML('beforeend', html);
  else grid.innerHTML = html || `<div class="empty-subpage-state" style="grid-column:1/-1;"><div class="ess-icon">🔍</div><div class="ess-title">Không tìm thấy gói nào</div><div class="ess-desc">Thử từ khóa khác (tiếng Anh: oneblock, zombie, skyblock...), bỏ bộ lọc phiên bản, hoặc tìm trên mạng rồi bấm 📥 Nhập file pack.</div></div>`;
  grid.querySelectorAll('[data-popen]').forEach((btn) => {
    btn.onclick = () => {
      const item = packHub.items.find((x) => x.uid === btn.dataset.popen);
      if (item) openPackDetail(item);
    };
  });
  grid.querySelectorAll('.pack-card').forEach((card) => {
    card.ondblclick = () => {
      const item = packHub.items.find((x) => x.uid === card.dataset.uid);
      if (item) openPackDetail(item);
    };
  });
  packBindIconFallbacks(grid);

  // Asynchronous Vietnamese translation for summaries
  if (packHub.viEnabled && window.aetherAPI?.translateToVi) {
    const needTr = items.filter((it) => it.summary && !it.summaryVi);
    if (needTr.length > 0) {
      window.aetherAPI.translateToVi(needTr.map((it) => it.summary)).then((trRes) => {
        if (!trRes?.ok || !Array.isArray(trRes.results)) return;
        const flags = Array.isArray(trRes.translatedFlags) ? trRes.translatedFlags : null;
        needTr.forEach((it, idx) => {
          const vi = trRes.results[idx];
          const didTranslate = flags ? Boolean(flags[idx]) : Boolean(vi && vi !== it.summary);
          if (vi && didTranslate) {
            it.summaryVi = vi;
            if (packHub.viEnabled) {
              const cardEl = grid.querySelector(`.pack-card[data-uid="${CSS.escape(it.uid)}"] .pack-summary`);
              if (cardEl) cardEl.textContent = vi;
            }
          }
        });
      }).catch(() => {});
    }
  }
}

async function runPackSearch(reset = true) {
  if (packHub.loading && !reset) return;
  packHub.loading = true;
  const reqId = (packHub.reqId = (packHub.reqId || 0) + 1);
  const snap = {
    query: packHub.query,
    kind: packHub.kind,
    source: packHub.source,
    mc: packHub.mc,
    loader: packHub.loader,
    sort: packHub.sort || 'smart'
  };
  if (reset) {
    packHub.offset = 0;
    packHub.sourceOffsets = {};
    packHub.items = [];
    packHub.seen = new Set();
    const grid = document.getElementById('packsResultsGrid');
    if (grid) grid.innerHTML = Array.from({ length: 8 }, () => '<div class="pack-card pack-skeleton"><div class="sk-line w60"></div><div class="sk-line"></div><div class="sk-line w80"></div></div>').join('');
  }
  const meta = document.getElementById('packsResultsMeta');
  if (meta) meta.textContent = '⏳ Đang tìm trên các kho Modpack toàn cầu...';
  const moreBtn = document.getElementById('btnPacksLoadMore');
  if (moreBtn && !reset) {
    moreBtn.disabled = true;
    moreBtn.textContent = '⏳ Đang tải thêm gói Modpack...';
  }
  try {
    const limit = snap.source === 'all' ? 30 : 24;
    const res = await window.aetherAPI.packsSearch({
      query: snap.query,
      kind: snap.kind,
      source: snap.source,
      mcVersion: snap.mc,
      loader: snap.kind === 'modpack' ? snap.loader : '',
      sort: snap.sort,
      offset: packHub.offset,
      sourceOffsets: packHub.sourceOffsets,
      limit
    });
    if (reqId !== packHub.reqId) return;
    if (!res?.ok) throw new Error(res?.error || 'Lỗi tìm kiếm');
    const fresh = (res.items || []).filter((it) => !packHub.seen.has(it.uid));
    fresh.forEach((it) => packHub.seen.add(it.uid));
    packHub.items.push(...fresh);
    packRenderCards(fresh, !reset);
    packHub.offset += limit;
    if (res.nextOffsets && typeof res.nextOffsets === 'object') {
      packHub.sourceOffsets = res.nextOffsets;
    }

    const totals = res.totals || {};
    const fmtSourceTotal = (v) => {
      if (v === 'no_key') return 'chưa gắn Key';
      if (v === null || v === undefined) return 'tạm bận';
      return packFmtNum(v);
    };
    const parts = Object.entries(totals).map(([k, v]) => `${packSourceMeta(k).label}: ${fmtSourceTotal(v)}`);
    const sum = Object.values(totals).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
    if (meta) meta.innerHTML = `🔎 Đang hiển thị <strong>${packHub.items.length}</strong>${sum > packHub.items.length ? ` / <strong>${packFmtNum(sum)}+</strong>` : ''} gói${packHub.query ? ` cho “${escapeHtml(packHub.query)}”` : ' đề xuất'} — ${parts.map((p) => escapeHtml(p)).join(' • ')}`;
    const badge = document.getElementById('packsTotalBadge');
    if (badge && !packHub.query && !packHub.mc && !packHub.loader && packHub.source === 'all' && packHub.kind === 'modpack' && sum > 40000) badge.textContent = `${packFmtNum(sum)}+ Gói`;

    const notice = document.getElementById('packsCfNotice');
    const warns = res.warnings || [];
    if (notice) {
      if (warns.includes('NO_CF_KEY')) {
        notice.innerHTML = '🔑 Chưa kết nối <strong>CurseForge</strong> (tùy chọn — kho lớn có nhiều gói Zombie / 100 Days). Modrinth, FTB, Technic &amp; ATLauncher vẫn tải trực tiếp bình thường! <button class="vtype-btn" id="btnPacksNoticeKey">Nhập API Key</button>';
        notice.classList.remove('hidden');
        notice.querySelector('#btnPacksNoticeKey').onclick = openCfKeyModal;
      } else if (warns.includes('CF_SEARCH_LIMITED')) {
        notice.innerHTML = 'ℹ️ Key CurseForge đang được kích hoạt quyền tìm kiếm — tạm hiển thị danh sách <strong>Nổi bật / Phổ biến</strong> của CurseForge. Thử lại sau vài phút.';
        notice.classList.remove('hidden');
      } else {
        const other = warns.filter((w) => !['NO_CF_KEY', 'CF_SEARCH_LIMITED'].includes(w));
        notice.innerHTML = other.length ? `⚠️ Một số nguồn tạm bận: ${other.map((w) => escapeHtml(w)).join(' • ')}` : '';
        notice.classList.toggle('hidden', !other.length);
      }
    }
    const anyMore = typeof res.hasMore === 'boolean'
      ? res.hasMore
      : Object.values(totals).some((t) => typeof t === 'number' && t > packHub.items.length);
    if (moreBtn) {
      moreBtn.disabled = false;
      moreBtn.textContent = `⬇ Xem thêm gói Modpack (đang hiện ${packHub.items.length}${sum > packHub.items.length ? ` / ${packFmtNum(sum)}+` : ''} gói)`;
      moreBtn.classList.toggle('hidden', !(fresh.length > 0 && anyMore));
    }
  } catch (err) {
    if (reqId !== packHub.reqId) return;
    if (meta) meta.textContent = `❌ ${err.message}`;
    if (moreBtn) { moreBtn.disabled = false; moreBtn.textContent = '⬇ Xem thêm gói Modpack'; }
    if (reset) packRenderCards([], false);
  } finally {
    if (reqId === packHub.reqId) packHub.loading = false;
  }
}

/* ---------- Detail modal ---------- */
async function openPackDetail(item) {
  const sm = packSourceMeta(item.source);
  const card = packOpenModal(`
    <div class="pack-modal-header">
      ${packIconHtml(item.iconUrl, 'pack-modal-icon')}
      <div class="pmh-info">
        <h3>${escapeHtml(item.title)}</h3>
        <div class="pmh-meta"><span class="pack-src-badge ${sm.cls}">${sm.label}</span>${item.downloads ? `<span>⬇ ${packFmtNum(item.downloads)} lượt tải</span>` : ''}${item.author ? `<span>👤 ${escapeHtml(item.author)}</span>` : ''}</div>
      </div>
      <button class="srv-icon-btn" data-pmclose title="Đóng">✕</button>
    </div>
    <div class="pack-modal-body"><div class="pack-modal-loading">⏳ Đang tải danh sách phiên bản từ ${sm.label}...</div></div>`);
  if (!card) return;
  const res = await window.aetherAPI.packsDetails({ source: item.source, id: item.id, kind: item.kind });
  const body = card.querySelector('.pack-modal-body');
  if (!res?.ok) {
    body.innerHTML = `<div class="pack-modal-msg error">❌ ${escapeHtml(res?.error || 'Không tải được thông tin gói.')}</div>`;
    return;
  }
  const kind = res.kind || item.kind;
  const mcSet = [...new Set((res.versions || []).map((v) => v.mcVersion).filter(Boolean))];
  const loaderSet = [...new Set((res.versions || []).map((v) => v.loader).filter(Boolean))];
  const firstVer = (res.versions || [])[0] || {};
  const sampleMc = firstVer.mcVersion || mcSet[0] || (item.mcVersions || [])[0] || '';
  const javaReq = packJavaForMc(sampleMc);
  const ramRecGB = firstVer.ramMB ? Math.max(2, Math.round(firstVer.ramMB / 1024)) : (kind === 'modpack' ? 4 : 2);
  const userRamGB = Number(state.totalMemGB) || 8;
  const ramOk = userRamGB >= ramRecGB + 1;
  const gallery = (res.gallery || []).slice(0, 4);
  const rawPlainDesc = packDescToPlainText(res.description || item.summary, res.descriptionIsHtml);
  body.innerHTML = `
    <div class="pack-modal-grid">
      <div class="pmg-left">
        <div class="pack-req-box">
          <div class="pack-req-box-head">
            <strong>📋 Cấu Hình Gói Yêu Cầu (Tự động thiết lập 100%)</strong>
            <span class="pack-req-badge ${ramOk ? 'ok' : 'warn'}">${ramOk ? `✅ Máy bạn (${userRamGB} GB RAM) đáp ứng tốt` : `⚠️ Cần ≥ ${ramRecGB} GB RAM (Máy bạn: ${userRamGB} GB)`}</span>
          </div>
          <div class="pack-req-grid">
            <div><span>Phiên bản MC</span><strong>${mcSet.length ? mcSet.slice(0, 4).map((v) => `MC ${escapeHtml(v)}`).join(', ') : (sampleMc ? `MC ${escapeHtml(sampleMc)}` : 'Tự nhận diện')}</strong></div>
            <div><span>Mod Loader</span><strong>${loaderSet.length ? loaderSet.map((l) => escapeHtml(PACK_LOADER_LABEL[l] || l)).join(' / ') : (kind === 'world' ? 'Bản đồ (Save)' : kind === 'datapack' ? 'Datapack' : 'Tự thiết lập')}</strong></div>
            <div><span>Java cần dùng</span><strong>☕ ${escapeHtml(javaReq)} (Tự tải)</strong></div>
            <div><span>RAM khuyến nghị</span><strong>⚡ ${ramRecGB} GB RAM</strong></div>
          </div>
          <p class="pack-req-note">💡 <strong>Không cần chỉnh phiên bản thủ công!</strong> Khi bạn chọn 1 bản bên phải và bấm <strong>⚡ Cài đặt</strong>, BlockWay sẽ tự tạo thư mục riêng cùng đúng phiên bản Minecraft + Loader mà gói yêu cầu.</p>
        </div>
        <div class="pack-desc-toolbar">
          <strong>📝 Mô tả chi tiết gói</strong>
          <button class="vtype-btn ${packHub.viEnabled ? 'active' : ''}" id="btnPackModalToggleVi">${packHub.viEnabled ? '🌐 Đang dịch Tiếng Việt' : '🌐 Bản gốc (Tiếng Anh)'}</button>
        </div>
        <div class="pack-desc" id="packModalDescText">${packDescToSafeHtml(res.description || item.summary, res.descriptionIsHtml)}</div>
        ${gallery.length ? `<div class="pack-gallery">${gallery.map((g) => `<img src="${escapeHtml(g)}" alt="" loading="lazy" draggable="false" />`).join('')}</div>` : ''}
        <button class="vtype-btn" id="btnPackOpenPage">🌐 Mở trang gốc trên ${sm.label}</button>
      </div>
      <div class="pmg-right">
        ${kind === 'modpack' ? `<label class="field-label">Tên gói trong BlockWay</label><input type="text" id="packInstNameInput" class="pro-input" maxlength="60" value="${escapeHtml(item.title)}" />` : ''}
        <div class="pack-ver-toolbar">
          <strong>📋 ${res.versions.length} phiên bản</strong>
          <select id="packVerMcFilter" class="pro-select packs-select"><option value="">Mọi bản MC</option>${mcSet.map((v) => `<option value="${escapeHtml(v)}">MC ${escapeHtml(v)}</option>`).join('')}</select>
        </div>
        <div class="pack-ver-list" id="packVerList"></div>
      </div>
    </div>`;
  card.querySelector('#btnPackOpenPage').onclick = () => window.aetherAPI.openExternal(res.url || item.url);
  packBindIconFallbacks(card);

  const descEl = card.querySelector('#packModalDescText');
  const btnModalVi = card.querySelector('#btnPackModalToggleVi');
  let cachedViDesc = '';
  let showingViModal = Boolean(packHub.viEnabled);
  const applyModalDescLang = async () => {
    if (!descEl) return;
    if (!showingViModal) {
      descEl.innerHTML = escapeHtml(rawPlainDesc).replace(/\n/g, '<br>');
      if (btnModalVi) {
        btnModalVi.classList.remove('active');
        btnModalVi.textContent = '🌐 Bản gốc (Bấm dịch Tiếng Việt)';
      }
      return;
    }
    if (btnModalVi) {
      btnModalVi.classList.add('active');
      btnModalVi.textContent = '⏳ Đang dịch Tiếng Việt...';
    }
    if (!cachedViDesc && window.aetherAPI?.translateToVi && rawPlainDesc) {
      try {
        const tr = await window.aetherAPI.translateToVi([rawPlainDesc.slice(0, 1600)]);
        if (tr?.ok && tr.results?.[0]) cachedViDesc = tr.results[0];
      } catch (_) {}
    }
    if (cachedViDesc && showingViModal) {
      descEl.innerHTML = escapeHtml(cachedViDesc).replace(/\n/g, '<br>');
    }
    if (btnModalVi && showingViModal) {
      btnModalVi.textContent = '✓ Tiếng Việt (Bấm xem bản gốc)';
    }
  };
  if (btnModalVi) {
    btnModalVi.onclick = () => {
      showingViModal = !showingViModal;
      applyModalDescLang();
    };
  }
  if (showingViModal) applyModalDescLang();

  const renderVers = () => {
    const f = card.querySelector('#packVerMcFilter').value;
    const list = (res.versions || []).filter((v) => !f || v.mcVersion === f || (v.mcVersions || []).includes(f)).slice(0, 60);
    const wrap = card.querySelector('#packVerList');
    wrap.innerHTML = list.map((v, i) => {
      const ld = v.loader ? (PACK_LOADER_LABEL[v.loader] || v.loader) : 'Tự nhận diện';
      const blocked = item.source === 'curseforge' && v.downloadable === false;
      let actions;
      if (blocked) {
        actions = `<button class="vtype-btn" data-pvact="cfpage" data-pvi="${i}">🌐 Mở trang tải</button><button class="vtype-btn" data-pvact="cfdone" data-pvi="${i}">📥 Đã tải xong</button>`;
      } else if (kind === 'datapack') {
        actions = `<button class="btn-install-mod" data-pvact="dp-world" data-pvi="${i}" ${v.compat?.ok === false ? 'disabled' : ''}>🌍 Gắn vào thế giới</button>${item.source === 'modrinth' ? `<button class="vtype-btn" data-pvact="dp-inst" data-pvi="${i}">📦 Tạo gói riêng</button>` : ''}`;
      } else if (kind === 'world') {
        actions = `<button class="btn-install-mod" data-pvact="world" data-pvi="${i}">🗺️ Cài bản đồ</button>`;
      } else {
        actions = `<button class="btn-install-mod" data-pvact="install" data-pvi="${i}" ${v.compat?.ok === false ? 'disabled' : ''}>⚡ Cài đặt</button>`;
      }
      return `<div class="pack-ver-row ${v.compat?.ok === false ? 'is-warn' : ''}">
        <div class="pvr-info">
          <strong title="${escapeHtml(v.name)}">${escapeHtml(v.name)}</strong>
          <div class="pvr-meta">
            ${v.mcVersion ? `<span class="pack-tag mc">MC ${escapeHtml(v.mcVersion)}</span>` : ''}
            <span class="pack-tag ld-${escapeHtml(v.loader || 'auto')}">${escapeHtml(ld)}${v.loaderVersion ? ` ${escapeHtml(v.loaderVersion)}` : ''}</span>
            ${v.releaseType && v.releaseType !== 'release' ? `<span class="pack-tag">${escapeHtml(v.releaseType)}</span>` : ''}
            ${v.fileSize ? `<span class="pack-tag">${packFmtSize(v.fileSize)}</span>` : ''}
            ${v.ramMB ? `<span class="pack-tag">RAM ${Math.round(v.ramMB / 1024)} GB</span>` : ''}
          </div>
          <span class="pvr-compat lvl-${escapeHtml(v.compat?.level || 'info')}">${escapeHtml(v.compat?.label || '')}</span>
        </div>
        <div class="pvr-actions">${actions}</div>
      </div>`;
    }).join('') || '<div class="pack-modal-msg">Không có phiên bản phù hợp bộ lọc.</div>';
    wrap.querySelectorAll('[data-pvact]').forEach((btn) => {
      btn.onclick = async () => {
        const v = list[Number(btn.dataset.pvi)];
        const act = btn.dataset.pvact;
        const instanceName = card.querySelector('#packInstNameInput')?.value?.trim() || item.title;
        if (act === 'install') {
          packCloseModal();
          startPackInstall({ item, version: v, instanceName });
        } else if (act === 'dp-inst') {
          packCloseModal();
          startPackInstall({ item: { ...item, kind: 'datapack' }, version: v, instanceName: `${item.title} (Datapack)` });
        } else if (act === 'dp-world') {
          openWorldPicker((worldPath) => startPackInstall({ item, version: v, mode: 'datapack-world', worldPath }));
        } else if (act === 'world') {
          packCloseModal();
          startPackInstall({ item: { ...item, kind: 'world' }, version: v, instanceName: item.title });
        } else if (act === 'cfpage') {
          window.aetherAPI.openExternal(`${String(res.url || item.url).replace(/\/+$/, '')}/download/${v.id}`);
          packNotify('🌐 Đã mở trang CurseForge — tải file .zip về thư mục Downloads rồi bấm “📥 Đã tải xong”.', 'success', 6000);
        } else if (act === 'cfdone') {
          const fileName = v.fileName || (v.name && /\.zip$/i.test(v.name) ? v.name : '');
          if (!fileName) {
            packCloseModal();
            doPackImportFile();
            return;
          }
          packCloseModal();
          packHub.installing = true;
          packShowProgress(`🔎 Đang tìm ${fileName} trong Downloads...`, 2);
          const r = await window.aetherAPI.packsImportFromDownloads({ fileName, gameDir: state.gameDir });
          packHub.installing = false;
          if (r?.notFound) { packHideProgress(); doPackImportFile(); return; }
          handlePackInstallResult(r, item.title);
        }
      };
    });
  };
  card.querySelector('#packVerMcFilter').onchange = renderVers;
  renderVers();
}

/* ---------- World picker (datapack) ---------- */
async function openWorldPicker(onPick) {
  const card = packOpenModal(`
    <div class="modal-head"><span class="card-dot emerald"></span><h3>🌍 Chọn thế giới để gắn Datapack</h3></div>
    <div class="modal-body"><div class="pack-modal-loading">⏳ Đang quét thế giới trong máy...</div></div>
    <div class="modal-foot"><button class="btn-modal-cancel" data-pmclose>Hủy</button></div>`, false);
  if (!card) return;
  const res = await window.aetherAPI.packsWorlds(state.gameDir);
  const body = card.querySelector('.modal-body');
  const worlds = res?.worlds || [];
  if (!worlds.length) {
    body.innerHTML = '<div class="pack-modal-msg">Chưa có thế giới nào. Hãy vào game tạo 1 thế giới mới (chế độ Siêu phẳng / Trống rất hợp với OneBlock), thoát ra rồi gắn datapack. Hoặc dùng nút “📦 Tạo gói riêng”.</div>';
    return;
  }
  body.innerHTML = `<p class="pack-modal-hint">Datapack sẽ được chép vào thư mục <code>datapacks</code> của thế giới. Lần mở thế giới tiếp theo sẽ tự kích hoạt.</p>
    <div class="pack-world-list">${worlds.map((w, i) => `<button class="pack-world-row" data-pwi="${i}"><strong>🌍 ${escapeHtml(w.name)}</strong><span>${escapeHtml(w.owner || '')}${w.version ? ` • MC ${escapeHtml(w.version)}` : ''}${w.lastPlayed ? ` • ${escapeHtml(w.lastPlayed)}` : ''}</span></button>`).join('')}</div>`;
  body.querySelectorAll('[data-pwi]').forEach((b) => {
    b.onclick = () => {
      const w = worlds[Number(b.dataset.pwi)];
      packCloseModal();
      onPick(w.path);
    };
  });
}

/* ---------- Install ---------- */
async function startPackInstall({ item, version, instanceName, mode, worldPath }) {
  if (packHub.installing) { packNotify('⏳ Đang cài một gói khác, vui lòng đợi...', 'error'); return; }
  packHub.installing = true;
  document.querySelector('.main-stage')?.scrollTo({ top: 0, behavior: 'smooth' });
  packShowProgress(`⏳ Bắt đầu cài “${item.title}” — ${version.name}...`, 1);
  const res = await window.aetherAPI.packsInstall({
    source: item.source,
    id: item.id,
    versionId: version.id,
    versionName: version.name,
    kind: item.kind,
    title: item.title,
    instanceName,
    iconUrl: item.iconUrl,
    pageUrl: item.url,
    mode,
    worldPath,
    gameDir: state.gameDir
  });
  packHub.installing = false;
  handlePackInstallResult(res, item.title);
}

function handlePackInstallResult(res, title) {
  if (!res?.ok) {
    if (res?.canceled) { packHideProgress(); return; }
    packShowProgress(`❌ Lỗi khi cài “${title || 'gói'}”: ${res?.error || 'không rõ'}`, 0, true);
    packNotify(`❌ ${res?.error || 'Cài gói thất bại'}`, 'error', 7000);
    return;
  }
  if (res.kind === 'datapack-needs-world') {
    packHideProgress();
    openWorldPicker(async (worldPath) => {
      packHub.installing = true;
      const r = await window.aetherAPI.packsImportFile({ filePath: res.filePath, gameDir: state.gameDir, worldTarget: worldPath });
      packHub.installing = false;
      handlePackInstallResult(r, title);
    });
    return;
  }
  packShowProgress(res.kind === 'world' ? `✅ Đã cài bản đồ vào saves: ${res.worldPath}` : res.kind === 'datapack' ? `✅ Đã gắn datapack vào thế giới: ${res.worldPath}` : res.kind === 'resourcepack' ? '✅ Đã thêm Resource Pack' : `✅ Đã cài xong “${res.instance?.name || title}”`, 100);
  packHideProgress(6000);
  refreshPackInstances();
  if (typeof renderLocalWorlds === 'function' && (res.kind === 'world' || res.kind === 'datapack')) renderLocalWorlds();
  if (res.instance) {
    const inst = res.instance;
    const manual = res.manual || [];
    const card = packOpenModal(`
      <div class="modal-head"><span class="card-dot emerald"></span><h3>🎉 Đã cài xong “${escapeHtml(inst.name)}”</h3></div>
      <div class="modal-body">
        <div class="pack-done-grid">
          <div><span>Minecraft</span><strong>${escapeHtml(inst.mcVersion || '?')}</strong></div>
          <div><span>Loader</span><strong>${escapeHtml(PACK_LOADER_LABEL[inst.loader] || inst.loader || '?')} ${escapeHtml(inst.loaderVersion || '')}</strong></div>
          <div><span>Số mod</span><strong>${Number(inst.modCount) || 0}</strong></div>
          <div><span>RAM gợi ý</span><strong>${Number(inst.ramRecommendedGB) || 4} GB</strong></div>
        </div>
        <p class="pack-modal-hint">📁 Thư mục riêng: <code>${escapeHtml(inst.dir)}</code><br>Lần chơi đầu tiên Launcher sẽ tự tải Minecraft, Loader và đúng bản Java cần thiết.</p>
        ${inst.autoIslandMode ? `<div class="pack-modal-msg" style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.35);color:var(--text-main);">🏝️ <strong>Đã tích hợp sẵn bộ tạo Đảo ${inst.autoIslandMode === 'oneblock' ? 'OneBlock' : 'SkyBlock'}!</strong><br>Cách mở Map: Bấm <strong>▶ Chơi ngay</strong> → chọn <strong>Chơi Đơn (Singleplayer)</strong> → bấm <strong>Tạo Thế Giới Mới (Create New World)</strong> là bạn sẽ đứng ngay trên Đảo Bay giữa hư không (có sẵn Cây Sồi + Rương Lava/Băng)!</div>` : ''}
        ${inst.datapackFile ? `<div class="pack-modal-msg">📜 Datapack <code>${escapeHtml(inst.datapackFile)}</code> nằm trong thư mục <code>blockway-datapacks</code> của gói. Khi tạo thế giới mới: <strong>Gói dữ liệu → Mở thư mục gói</strong> rồi kéo file vào.</div>` : ''}
        ${manual.length ? `<div class="pack-modal-msg warn">⚠️ Có <strong>${manual.length}</strong> tệp tác giả chặn tải tự động — bấm “Xem tệp cần tải tay” để hoàn tất.</div>` : ''}
      </div>
      <div class="modal-foot">
        ${manual.length ? '<button class="btn-modal-cancel" id="btnPackDoneManual">⚠️ Xem tệp cần tải tay</button>' : ''}
        <button class="btn-modal-cancel" data-pmclose>Để sau</button>
        <button class="btn-modal-agree" id="btnPackDonePlay">▶ Chơi ngay</button>
      </div>`, false);
    if (card) {
      card.querySelector('#btnPackDonePlay').onclick = () => { packCloseModal(); launchPackInstance(inst); };
      const mb = card.querySelector('#btnPackDoneManual');
      if (mb) mb.onclick = () => openManualDownloadsModal(inst);
    }
    if (typeof window.pushTopNotification === 'function') window.pushTopNotification(`📦 Đã cài Modpack “${inst.name}” (${inst.mcVersion} • ${String(inst.loader).toUpperCase()})`);
  } else {
    packNotify(res.kind === 'world' ? '🗺️ Đã cài bản đồ — vào Thế giới để xem!' : '✅ Hoàn tất!', 'success', 5000);
  }
}

/* ---------- Manual downloads ---------- */
function openManualDownloadsModal(inst) {
  const items = inst.manualPending || [];
  const card = packOpenModal(`
    <div class="modal-head"><span class="card-dot emerald"></span><h3>⚠️ ${items.length} tệp cần tải thủ công — “${escapeHtml(inst.name)}”</h3></div>
    <div class="modal-body">
      <p class="pack-modal-hint">Các tác giả này không cho launcher khác tải tự động. Bấm <strong>Mở trang tải</strong> cho từng tệp (lưu vào thư mục <strong>Downloads</strong>), sau đó bấm <strong>🔄 Quét Downloads</strong> — BlockWay sẽ tự chép vào đúng thư mục.</p>
      <div class="pack-manual-list">${items.map((m, i) => `<div class="pack-manual-row"><div><strong>${escapeHtml(m.name || m.fileName)}</strong><span>${escapeHtml(m.fileName || '')} → ${escapeHtml(m.folder || 'mods')}${m.reason ? ` • ${escapeHtml(m.reason)}` : ''}</span></div>${m.pageUrl ? `<button class="vtype-btn" data-pmopen="${i}">🌐 Mở trang tải</button>` : ''}</div>`).join('') || '<div class="pack-modal-msg">✅ Không còn tệp nào cần tải.</div>'}</div>
      <div id="packManualMsg" class="pack-modal-msg"></div>
    </div>
    <div class="modal-foot">
      <button class="btn-modal-cancel" id="btnPackManualFolder">📂 Mở thư mục gói</button>
      <button class="btn-modal-cancel" data-pmclose>Đóng</button>
      <button class="btn-modal-agree" id="btnPackManualScan">🔄 Quét Downloads</button>
    </div>`, false);
  if (!card) return;
  card.querySelectorAll('[data-pmopen]').forEach((b) => { b.onclick = () => window.aetherAPI.openExternal(items[Number(b.dataset.pmopen)].pageUrl); });
  card.querySelector('#btnPackManualFolder').onclick = () => window.aetherAPI.packsInstanceOpen({ gameDir: state.gameDir, dir: inst.dir });
  card.querySelector('#btnPackManualScan').onclick = async () => {
    const msg = card.querySelector('#packManualMsg');
    msg.textContent = '⏳ Đang quét thư mục Downloads...';
    const r = await window.aetherAPI.packsResolveManual({ gameDir: state.gameDir, dir: inst.dir });
    if (!r?.ok) { msg.textContent = `❌ ${r?.error || 'Lỗi'}`; return; }
    msg.textContent = `✅ Đã chép ${r.moved} tệp. Còn lại ${r.remaining.length} tệp.`;
    inst.manualPending = r.remaining;
    refreshPackInstances();
    if (!r.remaining.length) setTimeout(() => packCloseModal(), 1200);
  };
}

/* ---------- Instances ---------- */
async function refreshPackInstances() {
  const list = document.getElementById('packsInstancesList');
  if (!list) return;
  const res = await window.aetherAPI.packsInstances(state.gameDir);
  const insts = res?.instances || [];
  packHub.instances = insts;
  if (typeof refreshModTargetSelector === 'function') refreshModTargetSelector(true);
  const cnt = document.getElementById('packsInstCount');
  if (cnt) cnt.textContent = `${insts.length} gói`;
  if (!insts.length) {
    list.innerHTML = '<div class="pack-inst-empty">Chưa cài gói nào. Chọn một gói bên dưới (ví dụ <strong>OneBlock</strong> hoặc <strong>Zombie</strong>) rồi bấm <strong>⚡ Cài đặt</strong> — mọi thứ được thiết lập tự động.</div>';
    return;
  }
  list.innerHTML = insts.map((inst, i) => {
    const sm = packSourceMeta(inst.source);
    const pending = (inst.manualPending || []).length;
    const last = inst.lastPlayed ? new Date(inst.lastPlayed).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Chưa chơi';
    const instSlug = String(inst.dir || '').split(/[\\/]/).filter(Boolean).pop() || '';
    const playedSec = Number(state.playtimeStats?.byInstance?.[instSlug]) || 0;
    const playtimeBadge = playedSec > 0 && typeof window.formatPlaytimeVi === 'function'
      ? ` • <strong style="color:var(--accent);">⏱️ ${escapeHtml(window.formatPlaytimeVi(playedSec))}</strong>`
      : '';
    const isIslandCandidate = /(sky\s*block|one\s*block)/i.test(inst.name || '') && !inst.autoIslandMode && !(inst.worldsCount > 0);
    const islandBadge = inst.autoIslandMode
      ? ` • <strong style="color:#10b981;">🏝️ Đã tích hợp Đảo ${inst.autoIslandMode === 'oneblock' ? 'OneBlock' : 'SkyBlock'} (Bấm 🌍 Thế giới mới để vào thẳng đảo)</strong>`
      : '';
    return `<div class="pack-inst-row">
      ${packIconHtml(inst.iconUrl, 'pack-inst-icon')}
      <div class="pir-info">
        <div class="pir-title"><strong title="${escapeHtml(inst.name)}">${escapeHtml(inst.name)}</strong><span class="pack-src-badge ${sm.cls}">${sm.label}</span></div>
        <span class="pir-meta">MC ${escapeHtml(inst.mcVersion || '?')} • ${escapeHtml(PACK_LOADER_LABEL[inst.loader] || inst.loader || '?')} ${escapeHtml(inst.loaderVersion || '')} • ${inst.modsCount || 0} mod • ${inst.worldsCount || 0} thế giới • RAM gợi ý ${inst.ramRecommendedGB || 4} GB • ${escapeHtml(last)}${playtimeBadge}${islandBadge}</span>
      </div>
      <div class="pir-actions">
        ${pending ? `<button class="vtype-btn pir-warn" data-piact="manual" data-pii="${i}">⚠️ ${pending} tệp</button>` : ''}
        ${isIslandCandidate ? `<button class="vtype-btn" data-piact="equip-island" data-pii="${i}" title="Bơm tự động bộ tạo Đảo SkyBlock / OneBlock chơi đơn vào gói này">🏝️ Bơm Đảo Bay</button>` : ''}
        <button class="vtype-btn" data-piact="add-mods" data-pii="${i}" title="Cài thêm Mod / Shader / Resource Pack từ Modrinth trực tiếp vào gói này">➕ Cài thêm Mod</button>
        <button class="vtype-btn" data-piact="tweaker" data-pii="${i}" title="Chỉnh FOV, Sáng hang động Fullbright & tự gỡ trùng phím tắt cho gói Modpack này">🎛️ Phím tắt</button>
        <button class="vtype-btn pir-share" data-piact="export-mrpack" data-pii="${i}" title="Đóng gói bộ Mod này ra tệp .mrpack gọn nhẹ để lưu trữ hoặc gửi cho bạn bè qua Zalo / Discord">📦 Đóng gói gửi bạn</button>
        <button class="srv-icon-btn" data-piact="folder" data-pii="${i}" title="Mở thư mục gói">📂</button>
        <button class="srv-icon-btn" data-piact="mods" data-pii="${i}" title="Mở thư mục mods">🧩</button>
        <button class="srv-icon-btn danger" data-piact="delete" data-pii="${i}" title="Xóa gói">🗑</button>
        <button class="vtype-btn pir-coop" data-piact="coop" data-pii="${i}" title="Mở phòng chơi chung gói này qua Internet (e4mc + Mã Phòng BlockWay)">🤝 Mở Phòng</button>
        <button class="vtype-btn pir-newworld" data-piact="new-world" data-pii="${i}" title="Tạo thế giới mới (chọn chế độ, độ khó, seed, giữ đồ khi chết...) rồi vào thẳng">🌍 Thế giới mới</button>
        <button class="btn-install-mod pir-play" data-piact="play" data-pii="${i}" title="${inst.worldsCount > 0 ? 'Mở gói này' : 'Gói chưa có thế giới — bấm Chơi sẽ tự tạo sẵn & vào thẳng (nếu đang bật trong Cài đặt)'}">▶ Chơi</button>
      </div>
    </div>`;
  }).join('');
  packBindIconFallbacks(list);
  list.querySelectorAll('[data-piact]').forEach((b) => {
    b.onclick = async () => {
      const inst = insts[Number(b.dataset.pii)];
      const act = b.dataset.piact;
      if (act === 'play') launchPackInstance(inst);
      else if (act === 'new-world') openQuickWorldModal(inst);
      else if (act === 'add-mods') {
        state.modTargetInstanceDir = inst.dir;
        if (typeof window.switchMainTab === 'function') window.switchMainTab('mods');
        if (typeof showAetherNotification === 'function') {
          showAetherNotification(`📦 Đang chọn gói “${inst.name}” — mọi Mod, Shader, Resource Pack bạn bấm tải sẽ cài thẳng vào gói này!`, 'info', 4500);
        }
      }
      else if (act === 'equip-island') {
        const mode = /one\s*block/i.test(inst.name || '') ? 'oneblock' : 'skyblock';
        b.disabled = true;
        b.textContent = '⏳ Đang bơm Đảo...';
        packShowProgress(`🏝️ Đang tích hợp bộ tạo Đảo ${mode === 'oneblock' ? 'OneBlock' : 'SkyBlock'} vào “${inst.name}”...`, 20);
        const r = await window.aetherAPI.packsEquipIsland({ gameDir: state.gameDir, dir: inst.dir, mode });
        packHideProgress(3500);
        if (r?.ok) {
          packNotify(`🏝️ Đã tích hợp Đảo ${mode === 'oneblock' ? 'OneBlock' : 'SkyBlock'} vào “${inst.name}”! Vào Chơi Đơn → Tạo Thế Giới Mới để chơi ngay!`, 'success', 6500);
          refreshPackInstances();
        } else {
          b.disabled = false;
          b.textContent = '🏝️ Bơm Đảo Bay';
          packNotify(`❌ ${r?.error || 'Không thể tích hợp Đảo'}`, 'error', 5500);
        }
      }
      else if (act === 'tweaker') {
        if (typeof window.openGameTweakerModal === 'function') window.openGameTweakerModal(inst.dir);
      }
      else if (act === 'coop') {
        if (typeof hostCoopWithE4mc === 'function') hostCoopWithE4mc(inst);
      }
      else if (act === 'export-mrpack') {
        await exportMrpackUI({
          targetDir: inst.dir,
          packName: inst.name || 'BlockWay-Modpack',
          mcVersion: inst.mcVersion,
          loaderType: inst.loader || 'fabric',
          loaderVersion: inst.loaderVersion || ''
        });
      }
      else if (act === 'folder') window.aetherAPI.packsInstanceOpen({ gameDir: state.gameDir, dir: inst.dir });
      else if (act === 'mods') window.aetherAPI.packsInstanceOpen({ gameDir: state.gameDir, dir: inst.dir, sub: 'mods' });
      else if (act === 'manual') openManualDownloadsModal(inst);
      else if (act === 'delete') {
        const ask = await askUserAgreement({
          title: '🗑 Xóa gói Modpack',
          message: `Xóa vĩnh viễn gói “${inst.name}” cùng toàn bộ mod, cấu hình và ${inst.worldsCount || 0} thế giới bên trong? Thao tác không thể hoàn tác.`,
          agreeText: '🗑 Xóa gói',
          cancelText: '✕ Giữ lại'
        });
        if (!ask.agreed) return;
        const r = await window.aetherAPI.packsInstanceDelete({ gameDir: state.gameDir, dir: inst.dir });
        packNotify(r?.ok ? `🗑 Đã xóa gói “${inst.name}”` : `❌ ${r?.error || 'Không xóa được'}`, r?.ok ? 'success' : 'error');
        refreshPackInstances();
      }
    };
  });
}

/* ---------- Tạo thế giới mới & vào thẳng ---------- */
function quickWorldSupported(mcVersion) {
  const m = String(mcVersion || '').match(/^(\d+)\.(\d+)/);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major >= 2 || (major === 1 && minor >= 20);
}

function openQuickWorldModal(inst = null, prefillSeed = '', prefillName = '') {
  const isStandalone = !inst;
  const targetMcVer = isStandalone ? (state.selectedVersion || '1.21.4') : (inst.mcVersion || '1.21.4');
  const supported = quickWorldSupported(targetMcVer);
  const islandName = !isStandalone
    ? (inst.autoIslandMode === 'oneblock' ? 'Đảo OneBlock giữa khoảng không' : inst.autoIslandMode ? 'Đảo SkyBlock giữa khoảng không' : '')
    : '';
  const worldTypeLabel = islandName ? `🏝️ ${islandName}` : '🌳 Thế giới sinh tồn chuẩn Minecraft';
  const defaultName = String(prefillName || (isStandalone ? 'Thế giới mới' : (inst.name || 'Thế giới mới'))).slice(0, 48);
  const headTarget = isStandalone ? `Minecraft ${escapeHtml(targetMcVer)}` : escapeHtml(inst.name || 'Modpack');
  const card = packOpenModal(`
    <div class="modal-head"><span class="card-dot emerald"></span><h3>🌍 Tạo thế giới mới — ${headTarget}</h3></div>
    <div class="modal-body qw-body">
      ${supported ? '' : `<p class="pack-modal-hint">⚠️ Tạo thế giới tự động ngoài game cần Minecraft <strong>1.20 trở lên</strong> (đang chọn MC ${escapeHtml(targetMcVer)}). Hãy đổi sang 1.20+ hoặc bấm CHƠI NGAY để tạo trong game nhé.</p>`}
      <p class="pack-modal-hint">Kiểu thế giới: <strong>${worldTypeLabel}</strong> • MC ${escapeHtml(targetMcVer)}. Cấu hình sẵn chế độ, giữ đồ, hạt giống Seed đẹp rồi lưu sẵn hoặc vào thẳng không cần qua Menu!</p>
      <label class="qw-label">Tên thế giới</label>
      <input type="text" id="qwName" class="pro-input" maxlength="48" spellcheck="false" value="${escapeHtml(defaultName)}" />
      <label class="qw-label">Chế độ chơi</label>
      <div class="qw-seg" data-qwgroup="mode">
        <button type="button" class="vtype-btn active" data-v="survival">⚔️ Sinh tồn</button>
        <button type="button" class="vtype-btn" data-v="creative">🎨 Sáng tạo</button>
        <button type="button" class="vtype-btn" data-v="adventure">🧭 Phiêu lưu</button>
        <button type="button" class="vtype-btn" data-v="hardcore">💀 Hardcore</button>
      </div>
      <label class="qw-label">Độ khó</label>
      <div class="qw-seg" data-qwgroup="difficulty">
        <button type="button" class="vtype-btn" data-v="peaceful">🕊️ Hòa bình</button>
        <button type="button" class="vtype-btn" data-v="easy">🙂 Dễ</button>
        <button type="button" class="vtype-btn active" data-v="normal">😐 Thường</button>
        <button type="button" class="vtype-btn" data-v="hard">😈 Khó</button>
      </div>
      <label class="qw-label">Seed <span class="qw-sub">(để trống = ngẫu nhiên, hoặc bấm chọn nhanh Hạt giống có sẵn ảnh bản đồ bên dưới)</span></label>
      <input type="text" id="qwSeed" class="pro-input" maxlength="64" spellcheck="false" value="${escapeHtml(prefillSeed || '')}" placeholder="VD: 1691256543523180978 hoặc để trống..." />
      <div class="qw-seed-chips">
        <button type="button" class="mqt-chip" data-qwseed="1691256543523180978" data-qwtitle="Thung Lũng Anh Đào">🌸 Anh Đào Núi Tuyết</button>
        <button type="button" class="mqt-chip" data-qwseed="-4270204629242599305" data-qwtitle="Đảo Nấm Bình Yên">🍄 Đảo Nấm Không Quái</button>
        <button type="button" class="mqt-chip" data-qwseed="5706378859201728440" data-qwtitle="Biệt Thự & Thành Cổ">🏰 Biệt Thự + Làng</button>
        <button type="button" class="mqt-chip" data-qwseed="-3420545464665791887" data-qwtitle="Đảo Hoang San Hô">🏝️ Đảo San Hô</button>
        <button type="button" class="mqt-chip" data-qwseed="-7253978062019363248" data-qwtitle="Vương Quốc Gai Băng">❄️ Gai Băng Cổ Đại</button>
        <button type="button" class="mqt-chip" data-qwseed="8678942899319966093" data-qwtitle="Ốc Đảo Giàu Vàng">🏜️ Ốc Đảo Giàu Vàng</button>
        <button type="button" class="mqt-chip" data-qwseed="-4530634556500121041" data-qwtitle="Speedrun Phá Đảo">⚡ Speedrun</button>
        <button type="button" class="mqt-chip" data-qwseed="7092092118958763650" data-qwtitle="Hang Rêu Phát Sáng">🌲 Hang Rêu Phát Sáng</button>
      </div>
      <div id="qwSeedPreviewBox" class="qw-seed-preview hidden"></div>
      <div class="qw-toggles">
        <label class="settings-opt-item"><input type="checkbox" id="qwKeepInv" /><div class="soi-body"><strong>🎒 Giữ đồ khi chết</strong><span>Chết không bị rơi đồ và kinh nghiệm.</span></div></label>
        <label class="settings-opt-item"><input type="checkbox" id="qwAlwaysDay" /><div class="soi-body"><strong>☀️ Luôn ban ngày</strong><span>Dừng chu kỳ ngày đêm, quái ít xuất hiện hơn.</span></div></label>
        <label class="settings-opt-item"><input type="checkbox" id="qwBonusChest" /><div class="soi-body"><strong>🎁 Rương thưởng khởi đầu</strong><span>Có sẵn một rương đồ cơ bản cạnh chỗ xuất hiện.</span></div></label>
        <label class="settings-opt-item"><input type="checkbox" id="qwCheats" /><div class="soi-body"><strong>⌨️ Cho phép dùng lệnh</strong><span>Dùng được /gamemode, /time, /tp... (tắt khi chọn Hardcore).</span></div></label>
      </div>
    </div>
    <div class="modal-foot" style="gap:8px;flex-wrap:wrap;">
      <button class="btn-modal-cancel" data-pmclose>Hủy</button>
      ${isStandalone ? `<button class="btn-sync-skin" id="btnQwSaveOnly" ${supported ? '' : 'disabled'}>💾 Tạo Sẵn Vào Danh Sách</button>` : ''}
      <button class="btn-modal-agree" id="btnQwCreate" ${supported ? '' : 'disabled'}>🚀 Tạo &amp; Vào Thẳng</button>
    </div>`, true);
  if (!card) return;

  const pick = { mode: 'survival', difficulty: 'normal' };
  const seedInpEl = card.querySelector('#qwSeed');
  const seedPreviewBox = card.querySelector('#qwSeedPreviewBox');
  const syncQwSeedPreview = () => {
    const val = (seedInpEl?.value || '').trim();
    card.querySelectorAll('[data-qwseed]').forEach((c) => c.classList.toggle('active', Boolean(val) && c.dataset.qwseed === val));
    if (!seedPreviewBox) return;
    const matched = findCuratedSeedByValue(val);
    if (!matched) {
      seedPreviewBox.classList.add('hidden');
      seedPreviewBox.innerHTML = '';
      return;
    }
    const imgSrc = escapeHtml(matched.previewImage || `seeds/${matched.id}.jpg`);
    seedPreviewBox.classList.remove('hidden');
    seedPreviewBox.innerHTML = `
      <img class="qw-sp-thumb" src="${imgSrc}" alt="${escapeHtml(matched.title)}" />
      <div class="qw-sp-info">
        <div class="qw-sp-head">
          <strong>${escapeHtml(matched.title)}</strong>
          <span class="mod-compat-pill ok">✓ Tự gắn ảnh đại diện Map</span>
        </div>
        <div class="qw-sp-coords">📍 ${escapeHtml(matched.coordsHint || '')} • Mã Seed: <code>${escapeHtml(matched.seed)}</code></div>
        <p>${escapeHtml(matched.description || '')}</p>
      </div>
    `;
  };
  if (seedInpEl) {
    seedInpEl.addEventListener('input', syncQwSeedPreview);
  }
  card.querySelectorAll('[data-qwseed]').forEach((chip) => {
    chip.onclick = () => {
      const nameInp = card.querySelector('#qwName');
      const prevMatched = findCuratedSeedByValue((seedInpEl?.value || '').trim());
      if (seedInpEl) seedInpEl.value = chip.dataset.qwseed || '';
      if (nameInp) {
        const curName = nameInp.value.trim();
        const isAutoDefault = !curName || curName === 'Thế giới mới'
          || Array.from(card.querySelectorAll('[data-qwseed]')).some((c) => c.dataset.qwtitle === curName)
          || (prevMatched && String(prevMatched.title || '').includes(curName));
        if (isAutoDefault) {
          nameInp.value = chip.dataset.qwtitle || 'Thế giới mới';
        }
      }
      syncQwSeedPreview();
    };
  });
  syncQwSeedPreview();

  card.querySelectorAll('.qw-seg').forEach((grp) => {
    grp.querySelectorAll('button[data-v]').forEach((btn) => {
      btn.onclick = () => {
        grp.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        btn.classList.add('active');
        pick[grp.dataset.qwgroup] = btn.dataset.v;
        if (grp.dataset.qwgroup === 'mode') {
          const isHc = btn.dataset.v === 'hardcore';
          const cheats = card.querySelector('#qwCheats');
          if (cheats) { cheats.disabled = isHc; if (isHc) cheats.checked = false; }
          const diffGrp = card.querySelector('[data-qwgroup="difficulty"]');
          if (diffGrp) {
            diffGrp.classList.toggle('qw-disabled', isHc);
            if (isHc) {
              diffGrp.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x.dataset.v === 'hard'));
              pick.difficulty = 'hard';
            }
          }
        }
      };
    });
  });

  const collectOpts = () => {
    const isHc = pick.mode === 'hardcore';
    return {
      force: true,
      levelName: (card.querySelector('#qwName').value || '').trim() || defaultName,
      gameMode: isHc ? 'survival' : pick.mode,
      hardcore: isHc,
      difficulty: isHc ? 'hard' : pick.difficulty,
      seed: (card.querySelector('#qwSeed').value || '').trim(),
      keepInventory: card.querySelector('#qwKeepInv').checked,
      alwaysDay: card.querySelector('#qwAlwaysDay').checked,
      bonusChest: card.querySelector('#qwBonusChest').checked,
      allowCommands: !isHc && card.querySelector('#qwCheats').checked
    };
  };

  const runStandaloneCreate = async (launchImmediately) => {
    const opts = collectOpts();
    const btnSave = card.querySelector('#btnQwSaveOnly');
    const btnGo = card.querySelector('#btnQwCreate');
    if (btnSave) btnSave.disabled = true;
    if (btnGo) { btnGo.disabled = true; btnGo.textContent = '⏳ Đang khởi tạo Map...'; }
    try {
      const r = await window.aetherAPI.createStandaloneQuickWorld({
        gameDir: state.gameDir,
        instanceDir: '',
        mcVersion: targetMcVer,
        loaderType: state.selectedCore || 'fabric',
        ...opts
      });
      if (!r?.ok) {
        showAetherNotification(`⚠️ ${r?.error || 'Không thể tạo thế giới mới'}`, 'error', 4500);
        if (btnSave) btnSave.disabled = false;
        if (btnGo) { btnGo.disabled = false; btnGo.textContent = '🚀 Tạo & Vào Thẳng'; }
        return;
      }
      packCloseModal();
      await renderLocalWorlds();
      if (launchImmediately) {
        quickLaunchWorld({
          name: r.levelName || opts.levelName,
          folderName: r.folderName,
          path: r.worldDir,
          version: targetMcVer
        });
      } else {
        switchWorldsSubView('local');
        showAetherNotification(`🌍 Đã tạo sẵn thế giới "${r.levelName || opts.levelName}" (Seed: ${r.seed}) vào .minecraft/saves!`, 'success', 4800);
      }
    } catch (err) {
      if (btnSave) btnSave.disabled = false;
      if (btnGo) { btnGo.disabled = false; btnGo.textContent = '🚀 Tạo & Vào Thẳng'; }
      showAetherNotification(`⚠️ ${err.message}`, 'error', 4500);
    }
  };

  const btnSaveOnly = card.querySelector('#btnQwSaveOnly');
  if (btnSaveOnly) {
    btnSaveOnly.onclick = () => runStandaloneCreate(false);
  }

  card.querySelector('#btnQwCreate').onclick = () => {
    if (isStandalone) {
      runStandaloneCreate(true);
      return;
    }
    const opts = collectOpts();
    packCloseModal();
    launchPackInstance(inst, '', '', '', opts);
  };
  setTimeout(() => card.querySelector('#qwName')?.focus(), 50);
}
window.openQuickWorldModal = openQuickWorldModal;

async function launchPackInstance(inst, customServerIp = '', customWorldFolder = '', customWorldTitle = '', newWorldOptions = null) {
  if (state.isLaunching) { packNotify('⚠️ Minecraft đang chạy hoặc đang khởi động. Hãy tắt game trước.', 'error'); return; }
  if (state.authMode === 'microsoft' && !state.msProfile) { packNotify('⚠️ Vui lòng đăng nhập tài khoản Microsoft trước (Trang chủ → Tài khoản).', 'error'); return; }
  if (state.authMode === 'aether' && !state.cloudProfile) { packNotify('⚠️ Vui lòng đăng nhập BlockWay Cloud trước (Trang chủ → Tài khoản).', 'error'); return; }
  if (!inst.mcVersion) { packNotify('❌ Gói chưa xác định phiên bản Minecraft.', 'error'); return; }
  if ((inst.manualPending || []).length) {
    const ask = await askUserAgreement({
      title: '⚠️ Gói còn thiếu tệp',
      message: `Gói “${inst.name}” còn ${inst.manualPending.length} tệp chưa tải (tác giả chặn tải tự động). Game có thể lỗi khi thiếu mod. Vẫn chơi?`,
      agreeText: '▶ Vẫn chơi',
      cancelText: '⚠️ Xem tệp cần tải'
    });
    if (!ask.agreed) { openManualDownloadsModal(inst); return; }
  }
  const maxRam = Math.max(2, (Number(state.totalMemGB) || 8) - 2);
  const ram = Math.min(maxRam, Math.max(Number(state.ramGB) || 4, Number(inst.ramRecommendedGB) || 0));
  packHub.launchingInstance = inst;
  const launchCtx = {
    isPack: true,
    name: inst.name || 'Modpack',
    mcVersion: inst.mcVersion,
    core: inst.loader || 'vanilla',
    loaderType: inst.loader || 'vanilla',
    loaderVersion: inst.loaderVersion || '',
    ramGB: ram,
    instanceDir: inst.dir,
    inst
  };
  state.activeLaunchContext = launchCtx;
  state.lastLaunchContext = launchCtx;
  if (typeof updateSummaryUI === 'function') updateSummaryUI();
  // Bấm "Thế giới mới" → luôn tạo; bấm "Chơi" lần đầu (gói chưa có thế giới) → tự tạo nếu đang bật trong Cài đặt
  let autoCreateWorld = null;
  if (!customWorldFolder && !customServerIp) {
    if (newWorldOptions && typeof newWorldOptions === 'object') {
      autoCreateWorld = newWorldOptions;
    } else if (state.autoCreateFirstWorld !== false && !(Number(inst.worldsCount) > 0) && quickWorldSupported(inst.mcVersion)) {
      autoCreateWorld = { force: false, levelName: inst.name || 'Thế giới mới', gameMode: 'survival', difficulty: 'normal' };
    }
  }
  const statusMsg = customWorldFolder
    ? `⚡ Đang vào thẳng thế giới “${customWorldTitle || customWorldFolder}” — gói “${inst.name}” (MC ${inst.mcVersion})...`
    : autoCreateWorld
      ? `🌍 Đang tạo thế giới “${autoCreateWorld.levelName}” & vào thẳng — gói “${inst.name}” (MC ${inst.mcVersion})...`
      : `🚀 Đang khởi động “${inst.name}” (MC ${inst.mcVersion} • ${String(inst.loader).toUpperCase()} • RAM ${ram} GB)...`;
  packShowProgress(statusMsg, 5);
  setLaunchUiState('starting', statusMsg);
  const rawActiveSkin = currentSkinDataUrl || state.cachedSkinDataUrl || createFallbackSteveSkinDataUrl();
  const finalSkinDataUrl = typeof convertSkinTo64x64DataUrl === 'function' ? await convertSkinTo64x64DataUrl(rawActiveSkin) : rawActiveSkin;
  try { await window.aetherAPI.packsInstanceTouch({ gameDir: state.gameDir, dir: inst.dir }); } catch (_) {}
  const res = await window.aetherAPI.launchGame({
    authMode: state.authMode, username: state.username, crackSkinSync: state.crackSkinSync,
    msProfile: state.msProfile, cloudProfile: state.cloudProfile,
    mcVersion: inst.mcVersion, loaderType: inst.loader || 'vanilla', loaderVersion: inst.loaderVersion || '',
    ramGB: ram, javaPath: state.javaPath, gameDir: state.gameDir, instanceDir: inst.dir, packName: inst.name || 'Modpack',
    useAikarFlags: state.aikarFlags, fastSkipHash: state.fastSkipHash, hideLauncherOnPlay: state.hideLauncherOnPlay,
    serverIp: customWorldFolder ? '' : (customServerIp || ''), worldFolderName: customWorldFolder || '',
    autoCreateWorld,
    autoBackupWorlds: state.autoBackupWorlds !== false,
    autoViLang: state.autoViLang !== false, potatoGraphicsPreset: Boolean(state.potatoGraphicsPreset),
    smartRamCoach: state.smartRamCoach !== false,
    gentleSmoothMode: state.gentleSmoothMode !== false,
    deepSmoothEngine: state.deepSmoothEngine !== false,
    deepSmoothProfile: state.deepSmoothProfile || 'balanced',
    deepSmoothLayers: Array.isArray(state.deepSmoothLayers) ? state.deepSmoothLayers : null,
    cpuCores: state.cpuCores, skinDataUrl: finalSkinDataUrl, skinModel: state.skinModel, winResolution: state.winResolution
  });
  if (!res?.ok) {
    packHub.launchingInstance = null;
    setLaunchUiState('idle', `Lỗi khởi động gói: ${res?.error}`);
    if (typeof appendLog === 'function') appendLog(`Lỗi khởi động gói ${inst.name}: ${res?.error}`, 'error');
    packShowProgress(`❌ Lỗi khởi động: ${res?.error || 'không rõ'}`, 0, true);
  }
}

/* ---------- Import ---------- */
async function doPackImportFile() {
  if (packHub.installing) { packNotify('⏳ Đang cài một gói khác...', 'error'); return; }
  packHub.installing = true;
  packShowProgress('📥 Chọn file .mrpack / .zip để nhập...', 0);
  const res = await window.aetherAPI.packsImportFile({ gameDir: state.gameDir });
  packHub.installing = false;
  handlePackInstallResult(res, 'file nhập');
}

function openImportUrlModal() {
  const card = packOpenModal(`
    <div class="modal-head"><span class="card-dot emerald"></span><h3>🔗 Nhập gói từ link tải trực tiếp</h3></div>
    <div class="modal-body">
      <p class="pack-modal-hint">Dán link tải trực tiếp file <code>.mrpack</code> hoặc <code>.zip</code> (Modpack CurseForge, Prism/MultiMC, Technic, Map, Datapack). BlockWay sẽ tự tải về, nhận diện và cài đúng chỗ.</p>
      <input type="text" id="packUrlInput" class="pro-input" placeholder="https://.../ten-goi.zip" />
    </div>
    <div class="modal-foot"><button class="btn-modal-cancel" data-pmclose>Hủy</button><button class="btn-modal-agree" id="btnPackUrlGo">⬇ Tải &amp; Cài</button></div>`, false);
  if (!card) return;
  card.querySelector('#btnPackUrlGo').onclick = async () => {
    const url = card.querySelector('#packUrlInput').value.trim();
    if (!/^https?:\/\//i.test(url)) { packNotify('⚠️ Link phải bắt đầu bằng http:// hoặc https://', 'error'); return; }
    packCloseModal();
    packHub.installing = true;
    packShowProgress('⬇ Đang tải gói từ link...', 1);
    const res = await window.aetherAPI.packsImportUrl({ url, gameDir: state.gameDir });
    packHub.installing = false;
    handlePackInstallResult(res, 'gói từ link');
  };
}

function openPackWebSearch(site) {
  const q = (document.getElementById('packsSearchInput')?.value || packHub.query || '').trim();
  const qq = encodeURIComponent(q || (packHub.kind === 'world' ? 'oneblock map' : 'survival'));
  const cfClass = packHub.kind === 'world' ? 'worlds' : packHub.kind === 'datapack' ? 'data-packs' : 'modpacks';
  const urls = {
    google: `https://www.google.com/search?q=${encodeURIComponent(`minecraft ${packHub.kind === 'world' ? 'map' : packHub.kind === 'datapack' ? 'datapack' : 'modpack'} ${q} download`)}`,
    curseforge: `https://www.curseforge.com/minecraft/search?page=1&pageSize=20&sortBy=relevancy&class=${cfClass}&search=${qq}`,
    modrinth: `https://modrinth.com/${packHub.kind === 'datapack' ? 'datapacks' : 'modpacks'}?q=${qq}`,
    planetminecraft: `https://www.planetminecraft.com/projects/?keywords=${qq}`,
    youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(`minecraft ${q} modpack`)}`
  };
  if (urls[site]) window.aetherAPI.openExternal(urls[site]);
}

async function runQuickIslandInstall(mode = 'skyblock') {
  initPackHubUI();
  if (packHub.installing) {
    packNotify('⏳ Đang cài một gói khác, vui lòng đợi...', 'error');
    return;
  }
  if (typeof window.switchMainTab === 'function' && !document.getElementById('tab-packs')?.classList.contains('active')) {
    window.switchMainTab('packs');
  }
  packHub.installing = true;
  document.querySelector('.main-stage')?.scrollTo({ top: 0, behavior: 'smooth' });
  const label = mode === 'oneblock' ? 'Một Ô Đất OneBlock' : 'Đảo Sinh Tồn SkyBlock';
  packShowProgress(`🏝️ Đang tự động tạo gói “${label}” (kèm Sodium tăng FPS + bộ tạo Đảo Bay)...`, 5);
  const res = await window.aetherAPI.packsQuickIsland({
    gameDir: state.gameDir,
    mode,
    mcVersion: state.selectedVersion
  });
  packHub.installing = false;
  handlePackInstallResult(res, label);
}
window.runQuickIslandInstall = runQuickIslandInstall;

/* ---------- Init ---------- */
function initPackHubUI() {
  if (packHub.inited) return;
  packHub.inited = true;

  document.querySelectorAll('#packsKindTabs [data-pkind]').forEach((b) => {
    b.onclick = () => {
      packHub.kind = b.dataset.pkind;
      document.querySelectorAll('#packsKindTabs [data-pkind]').forEach((x) => x.classList.toggle('active', x === b));
      packUpdateSourceTabsForKind();
      runPackSearch(true);
    };
  });
  document.querySelectorAll('#packsSourceTabs [data-psrc]').forEach((b) => {
    b.onclick = () => {
      packHub.source = b.dataset.psrc;
      document.querySelectorAll('#packsSourceTabs [data-psrc]').forEach((x) => x.classList.toggle('active', x === b));
      runPackSearch(true);
    };
  });
  const input = document.getElementById('packsSearchInput');
  const doSearch = () => { packHub.query = (input?.value || '').trim(); document.querySelectorAll('#packsQuickCats [data-pq]').forEach((x) => x.classList.toggle('active', x.dataset.pq === packHub.query)); runPackSearch(true); };
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  const btnS = document.getElementById('btnPacksSearch');
  if (btnS) btnS.onclick = doSearch;
  document.querySelectorAll('#packsQuickCats [data-pq]').forEach((chip) => {
    chip.onclick = () => {
      const same = packHub.query === chip.dataset.pq;
      packHub.query = same ? '' : chip.dataset.pq;
      if (input) input.value = packHub.query;
      document.querySelectorAll('#packsQuickCats [data-pq]').forEach((x) => x.classList.toggle('active', !same && x === chip));
      runPackSearch(true);
    };
  });
  const mcSel = document.getElementById('packsMcFilter');
  if (mcSel) mcSel.onchange = () => { packHub.mc = mcSel.value; runPackSearch(true); };
  const ldSel = document.getElementById('packsLoaderFilter');
  if (ldSel) ldSel.onchange = () => { packHub.loader = ldSel.value; runPackSearch(true); };
  const sortSel = document.getElementById('packsSortFilter');
  if (sortSel) sortSel.onchange = () => { packHub.sort = sortSel.value || 'smart'; runPackSearch(true); };
  const more = document.getElementById('btnPacksLoadMore');
  if (more) more.onclick = () => runPackSearch(false);

  const btnVi = document.getElementById('btnPacksToggleVi');
  if (btnVi) {
    btnVi.onclick = () => {
      packHub.viEnabled = !packHub.viEnabled;
      btnVi.classList.toggle('active', packHub.viEnabled);
      btnVi.textContent = packHub.viEnabled ? '🌐 Mô tả: Tiếng Việt' : '🌐 Mô tả: Bản gốc';
      packRenderCards(packHub.items, false);
    };
  }

  const bImp = document.getElementById('btnPacksImportFile');
  if (bImp) bImp.onclick = doPackImportFile;
  const bQuickSky = document.getElementById('btnQuickInstallSkyBlock');
  if (bQuickSky) bQuickSky.onclick = () => runQuickIslandInstall('skyblock');
  const bQuickOne = document.getElementById('btnQuickInstallOneBlock');
  if (bQuickOne) bQuickOne.onclick = () => runQuickIslandInstall('oneblock');
  const bWorldsSky = document.getElementById('btnWorldsQuickSkyBlock');
  if (bWorldsSky) bWorldsSky.onclick = () => runQuickIslandInstall('skyblock');
  const bWorldsOne = document.getElementById('btnWorldsQuickOneBlock');
  if (bWorldsOne) bWorldsOne.onclick = () => runQuickIslandInstall('oneblock');
  const bUrl = document.getElementById('btnPacksImportUrl');
  if (bUrl) bUrl.onclick = openImportUrlModal;
  const bKey = document.getElementById('btnPacksCfKey');
  if (bKey) bKey.onclick = openCfKeyModal;
  const bRoot = document.getElementById('btnPacksOpenRoot');
  if (bRoot) bRoot.onclick = () => window.aetherAPI.packsInstanceOpen({ gameDir: state.gameDir });
  document.querySelectorAll('[data-pweb]').forEach((b) => { b.onclick = () => openPackWebSearch(b.dataset.pweb); });

  if (typeof window.aetherAPI.onPacksProgress === 'function') {
    window.aetherAPI.onPacksProgress((p) => {
      if (!p) return;
      packShowProgress(p.text, typeof p.percent === 'number' ? p.percent : undefined, p.stage === 'error');
    });
  }
  window.aetherAPI.onStatus?.((st) => {
    if (packHub.launchingInstance) packShowProgress(`🚀 ${packHub.launchingInstance.name}: ${st}`, undefined);
  });
  window.aetherAPI.onGameReady?.(() => {
    if (packHub.launchingInstance) {
      packShowProgress(`🟢 Đang chơi “${packHub.launchingInstance.name}”`, 100);
      packHub.launchingInstance = null;
      packHideProgress(5000);
      refreshPackInstances();
    }
  });
  window.aetherAPI.onClose?.(() => {
    if (packHub.launchingInstance) {
      packShowProgress(`ℹ️ Minecraft đã đóng — xem tab Công cụ → Nhật ký nếu gói lỗi khi khởi động.`, 0, true);
      packHub.launchingInstance = null;
    }
    if (document.getElementById('tab-packs')?.classList.contains('active')) refreshPackInstances();
  });
  packUpdateSourceTabsForKind();
}

function onPackHubTabShown() {
  initPackHubUI();
  refreshPackInstances();
  refreshCfKeyState();
  if (!packHub.items.length && !packHub.loading) runPackSearch(true);
}
window.onPackHubTabShown = onPackHubTabShown;
window.launchPackInstance = launchPackInstance;

/* ============================================================================
   v40.1 PRO — CHƠI CHUNG VỚI BẠN BÈ (3 CHẾ ĐỘ CO-OP: LAN • e4mc • MÃ PHÒNG)
   ============================================================================ */
const coopState = {
  inited: false,
  hostingActive: false,
  hostContext: null,
  activeRoom: null,
  localIps: []
};

function getCurrentPlayerDisplayName() {
  if (state.authMode === 'microsoft' && state.msProfile?.name) return state.msProfile.name;
  if (state.authMode === 'aether' && state.cloudProfile?.mcUsername) return state.cloudProfile.mcUsername;
  return state.username || 'StevePlayer';
}

function renderCoopActiveBanner(info) {
  const banner = document.getElementById('coopLiveHostBanner') || document.getElementById('coopActiveHostBanner');
  if (!banner) return;
  if (!info) {
    banner.classList.add('hidden');
    banner.innerHTML = '';
    return;
  }
  banner.classList.remove('hidden');
  banner.innerHTML = `
    <div class="coop-banner-left">
      <div class="coop-banner-title">🟢 ${escapeHtml(info.title || 'Đang mở phòng Co-op')}</div>
      <div class="coop-banner-sub">${escapeHtml(info.subtitle || '')}</div>
      ${info.roomCode ? `<div class="coop-banner-chips">
        <span class="coop-code-chip">🔑 Mã Phòng: <strong>${escapeHtml(info.roomCode)}</strong></span>
        ${info.joinAddress ? `<span class="coop-code-chip">🌐 Địa chỉ: <strong>${escapeHtml(info.joinAddress)}</strong></span>` : ''}
        <span class="coop-code-chip">🎮 MC ${escapeHtml(info.mcVersion || state.selectedVersion)} (${escapeHtml(String(info.loaderType || state.selectedCore).toUpperCase())})</span>
      </div>` : ''}
    </div>
    <div class="coop-banner-actions">
      ${info.roomCode ? `<button class="vtype-btn active" id="btnBannerCopyCode">📋 Chép Mã Phòng (${escapeHtml(info.roomCode)})</button>` : ''}
      ${info.joinAddress ? `<button class="vtype-btn" id="btnBannerCopyAddr">📋 Chép Địa Chỉ IP</button>` : ''}
      ${info.inviteToken ? `<button class="vtype-btn" id="btnBannerCopyToken" title="Mã mời tự động kèm đầy đủ cấu hình MC + Loader cho bạn bè ở mọi nơi">🔗 Chép Mã Mời Đầy Đủ</button>` : ''}
      <button class="srv-icon-btn" id="btnBannerHide" title="Ẩn thông báo">✕</button>
    </div>
  `;
  const bCode = banner.querySelector('#btnBannerCopyCode');
  if (bCode) {
    bCode.onclick = () => {
      navigator.clipboard?.writeText(info.roomCode);
      bCode.textContent = `✓ Đã chép ${info.roomCode}!`;
      setTimeout(() => { bCode.textContent = `📋 Chép Mã Phòng (${info.roomCode})`; }, 1800);
    };
  }
  const bAddr = banner.querySelector('#btnBannerCopyAddr');
  if (bAddr) {
    bAddr.onclick = () => {
      navigator.clipboard?.writeText(info.joinAddress);
      bAddr.textContent = '✓ Đã chép IP!';
      setTimeout(() => { bAddr.textContent = '📋 Chép Địa Chỉ IP'; }, 1800);
    };
  }
  const bTok = banner.querySelector('#btnBannerCopyToken');
  if (bTok) {
    bTok.onclick = () => {
      navigator.clipboard?.writeText(info.inviteToken);
      bTok.textContent = '✓ Đã chép Mã Mời!';
      setTimeout(() => { bTok.textContent = '🔗 Chép Mã Mời Đầy Đủ'; }, 1800);
    };
  }
  const bHide = banner.querySelector('#btnBannerHide');
  if (bHide) bHide.onclick = () => banner.classList.add('hidden');
}

// v40.8: backend returns IP objects { name, ip, type: 'lan' | 'vpn' } — normalise everywhere
function coopIpOf(x) {
  if (!x) return '';
  return typeof x === 'string' ? x : String(x.ip || '');
}
function coopIpLabelOf(x) {
  const ip = coopIpOf(x);
  if (!ip) return '';
  if (typeof x === 'object' && x.type === 'vpn') return `${ip} (VPN ${x.name || ''})`.replace(/\s+\)/, ')');
  return `${ip} (Wi-Fi / LAN)`;
}

async function scanCoopLanWorldsUI() {
  const listEl = document.getElementById('coopLanWorldsList');
  const ipBadge = document.getElementById('coopLocalIpStrip') || document.getElementById('coopLocalIpBadge');
  const btnScan = document.getElementById('btnCoopScanLan');
  if (!listEl) return;
  if (btnScan) {
    btnScan.disabled = true;
    btnScan.textContent = '⏳ Đang quét LAN...';
  }
  listEl.innerHTML = '<div class="coop-lan-empty">📡 Đang lắng nghe gói tin UDP Multicast (224.0.2.60:4445) trong mạng Wi-Fi / LAN / Radmin VPN...</div>';
  try {
    const scanFn = window.aetherAPI.scanLanWorlds || window.aetherAPI.coopScanLan;
    const res = await scanFn(2200);
    const ipList = (res?.localIps || []).filter((x) => coopIpOf(x));
    if (ipList.length) {
      coopState.localIps = ipList;
      if (ipBadge) ipBadge.innerHTML = `🖧 IP LAN máy bạn: <strong>${escapeHtml(ipList.map(coopIpLabelOf).join(' • '))}</strong>`;
    } else if (ipBadge) {
      ipBadge.innerHTML = '🖧 IP LAN máy bạn: <strong>127.0.0.1 (Chưa thấy mạng LAN)</strong>';
    }
    const worlds = res?.worlds || [];
    if (!worlds.length) {
      listEl.innerHTML = `<div class="coop-lan-empty">Chưa phát hiện thế giới LAN nào đang mở. Hãy bảo bạn bè vào thế giới → bấm <strong>Esc → Open to LAN</strong> (hoặc dùng <strong>🌐 Mở Phòng e4mc</strong> bên cạnh nếu khác mạng Wi-Fi).</div>`;
    } else {
      listEl.innerHTML = worlds.map((w, idx) => `
        <div class="coop-lan-row">
          <div class="clr-info">
            <strong>🏠 ${escapeHtml(w.motd || 'Thế giới LAN')}</strong>
            <span>🌐 <code>${escapeHtml(w.address)}</code> • Phát hiện trong mạng nội bộ</span>
          </div>
          <div class="clr-actions">
            <button class="vtype-btn" data-lancopy="${escapeHtml(w.address)}">📋 Chép IP</button>
            <button class="btn-install-mod" data-lanjoin="${escapeHtml(w.address)}" data-lanidx="${idx}">▶ Vào Ngay</button>
          </div>
        </div>
      `).join('');
      listEl.querySelectorAll('[data-lancopy]').forEach((b) => {
        b.onclick = () => {
          navigator.clipboard?.writeText(b.dataset.lancopy);
          b.textContent = '✓ Đã chép';
          setTimeout(() => { b.textContent = '📋 Chép IP'; }, 1500);
        };
      });
      listEl.querySelectorAll('[data-lanjoin]').forEach((b) => {
        b.onclick = () => {
          const addr = b.dataset.lanjoin;
          setServerIpEverywhere(addr);
          showAetherNotification(`🏠 Đã điền địa chỉ LAN ${addr} — Đang khởi chạy vào thẳng thế giới!`, 'success', 4000);
          document.getElementById('btnLaunch')?.click();
        };
      });
    }
  } catch (err) {
    listEl.innerHTML = `<div class="coop-lan-empty">⚠️ Lỗi quét mạng LAN: ${escapeHtml(err.message)}</div>`;
  } finally {
    if (btnScan) {
      btnScan.disabled = false;
      btnScan.textContent = '🔍 Quét Phòng LAN';
    }
  }
}

async function installCoopLanHelperModUI() {
  const btn = document.getElementById('btnCoopInstallLanMod');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Đang cài Mod Hỗ Trợ LAN...';
  }
  try {
    let targetCore = state.selectedCore;
    if (targetCore === 'vanilla') {
      targetCore = 'fabric';
      if (typeof window.selectMcVersionAndCore === 'function') {
        await window.selectMcVersionAndCore(state.selectedVersion, 'fabric');
      }
    }
    const prepFn = window.aetherAPI.prepareCoopHost || window.aetherAPI.coopPrepareHost;
    const enableVoiceChat = Boolean(document.getElementById('chkCoopVoiceChat')?.checked);
    const enableTeamQol = Boolean(document.getElementById('chkCoopTeamQol')?.checked);
    const res = await prepFn({
      mcVersion: state.selectedVersion,
      loaderType: targetCore,
      gameDir: state.gameDir,
      mode: 'lan',
      enableVoiceChat,
      enableTeamQol
    });
    if (res?.ok && res.installed?.length) {
      showAetherNotification(`🔓 Đã cài Mod hỗ trợ LAN (${res.installed.join(', ')}) cho MC ${state.selectedVersion} (${targetCore.toUpperCase()})! Bạn bè dùng tài khoản Offline/Crack có thể vào phòng LAN thoải mái.`, 'success', 5500);
    } else {
      showAetherNotification(`ℹ️ Đã bật ${targetCore.toUpperCase()} cho MC ${state.selectedVersion}. Khi vào thế giới hãy bấm Esc → Open to LAN để mở phòng!`, 'info', 4500);
    }
  } catch (err) {
    showAetherNotification(`⚠️ ${err.message}`, 'error', 4500);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔓 Cài Mod Hỗ Trợ LAN';
    }
  }
}

async function hostCoopWithE4mc(customInst = null) {
  if (state.isLaunching) {
    showAetherNotification('⚠️ Minecraft đang chạy hoặc đang khởi động. Nếu đã ở trong game, hãy bấm Esc → Open to LAN để lấy link e4mc!', 'info', 4500);
    return;
  }
  const btn = document.getElementById('btnCoopHostE4mc');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Đang chuẩn bị đường hầm e4mc...';
  }
  try {
    let mcVersion = customInst ? customInst.mcVersion : state.selectedVersion;
    let loaderType = customInst ? (customInst.loader || 'fabric') : state.selectedCore;
    const instanceDir = customInst ? customInst.dir : '';
    const modpackName = customInst ? customInst.name : '';

    if (!customInst && loaderType === 'vanilla') {
      loaderType = 'fabric';
      if (typeof window.selectMcVersionAndCore === 'function') {
        await window.selectMcVersionAndCore(mcVersion, 'fabric');
      }
      showAetherNotification(`🔄 Đã tự động bật Fabric cho MC ${mcVersion} để cài đặt đường hầm e4mc!`, 'info', 3500);
    }

    const prepFn = window.aetherAPI.prepareCoopHost || window.aetherAPI.coopPrepareHost;
    const enableVoiceChat = Boolean(document.getElementById('chkCoopVoiceChat')?.checked);
    const enableTeamQol = Boolean(document.getElementById('chkCoopTeamQol')?.checked);
    const prep = await prepFn({
      mcVersion,
      loaderType,
      gameDir: state.gameDir,
      instanceDir,
      mode: 'e4mc',
      enableVoiceChat,
      enableTeamQol
    });

    coopState.hostingActive = true;
    coopState.hostContext = {
      mcVersion,
      loaderType,
      modpackName,
      modpackSource: customInst?.source || '',
      modpackId: customInst?.sourceId || ''
    };

    const installedMods = prep?.installed || [];
    if (typeof window.switchMainTab === 'function') window.switchMainTab('servers');
    renderCoopActiveBanner({
      title: `🚀 Đang khởi động Chế Độ Chủ Phòng (${modpackName || `MC ${mcVersion} • ${loaderType.toUpperCase()}`})`,
      subtitle: installedMods.length
        ? `Đã tự trang bị ${installedMods.join(' + ')}. Khi vào Thế giới (Singleplayer), hãy bấm phím Esc → Open to LAN (Mở mạng LAN) — BlockWay sẽ tự bắt địa chỉ .e4mc.link và tạo Mã Phòng 6 ký tự tại đây!`
        : `Khi vào Thế giới (Singleplayer), hãy bấm phím Esc → Open to LAN (Mở mạng LAN) — BlockWay sẽ tự bắt cổng LAN và tạo Mã Phòng 6 ký tự tại đây!`,
      mcVersion,
      loaderType
    });

    if (customInst) {
      await launchPackInstance(customInst);
    } else {
      document.getElementById('btnLaunch')?.click();
    }
  } catch (err) {
    showAetherNotification(`⚠️ Lỗi chuẩn bị phòng Co-op: ${err.message}`, 'error', 5000);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🚀 Mở Thế Giới Qua Internet (Tự Cài e4mc & Chơi)';
    }
  }
}
window.hostCoopWithE4mc = hostCoopWithE4mc;

async function refreshPublicCoopRoomsUI(showWrap = false) {
  const wrap = document.getElementById('coopPublicRoomsList');
  if (!wrap) return;
  if (showWrap) wrap.classList.remove('hidden');
  try {
    const listFn = window.aetherAPI.listCoopRooms || window.aetherAPI.coopListRooms;
    const res = await listFn({ customDbUrl: state.customDbUrl });
    const rooms = res?.rooms || [];
    if (!rooms.length) {
      wrap.innerHTML = '<div class="coop-room-empty">Chưa có phòng công khai nào đang mở. Hãy bấm <strong>🚀 Mở Thế Giới Qua Internet</strong> hoặc <strong>➕ Tạo Mã Phòng</strong> để mở phòng đầu tiên!</div>';
      return;
    }
    wrap.classList.remove('hidden');
    wrap.innerHTML = rooms.map((r) => `
      <div class="coop-room-row">
        <div class="crr-info">
          <strong>🔑 <code>${escapeHtml(r.roomCode)}</code> — ${escapeHtml(r.worldName || `Phòng của ${r.hostName}`)}</strong>
          <span>👤 Chủ phòng: ${escapeHtml(r.hostName)} • 🎮 MC ${escapeHtml(r.mcVersion)} (${escapeHtml(String(r.loaderType || 'vanilla').toUpperCase())})${r.modpackName ? ` • 📦 ${escapeHtml(r.modpackName)}` : ''}</span>
        </div>
        <button class="btn-install-mod" data-joinroom="${escapeHtml(r.roomCode)}">▶ Vào Phòng</button>
      </div>
    `).join('');
    wrap.querySelectorAll('[data-joinroom]').forEach((b) => {
      b.onclick = () => {
        const inp = document.getElementById('coopJoinCodeInput') || document.getElementById('coopRoomCodeInput');
        if (inp) inp.value = b.dataset.joinroom;
        joinCoopRoomByCode(b.dataset.joinroom);
      };
    });
  } catch (_) {}
}

async function joinCoopRoomByCode(rawInput) {
  const inpEl = document.getElementById('coopJoinCodeInput') || document.getElementById('coopRoomCodeInput');
  const code = String((typeof rawInput === 'string' ? rawInput : '') || inpEl?.value || '').trim();
  let statusBox = document.getElementById('coopRoomStatusBox');
  if (!statusBox && inpEl?.parentElement) {
    statusBox = document.createElement('div');
    statusBox.id = 'coopRoomStatusBox';
    statusBox.className = 'coop-room-status hidden';
    inpEl.parentElement.insertAdjacentElement('afterend', statusBox);
  }
  const showSt = (msg, isErr = false) => {
    if (!statusBox) return;
    statusBox.classList.remove('hidden');
    statusBox.className = `coop-room-status ${isErr ? 'is-err' : 'is-ok'}`;
    statusBox.innerHTML = msg;
  };
  if (!code) {
    showSt('⚠️ Vui lòng nhập Mã Phòng 6 ký tự (VD: <code>BW8821</code>), Mã Mời <code>BW-...</code> hoặc địa chỉ <code>.e4mc.link</code> / <code>IP:Port</code>.', true);
    return;
  }

  // Case 1: Direct domain or IP:Port (e.g. *.e4mc.link or 192.168.1.5:25565)
  if ((code.includes('.') || code.includes(':')) && !code.toUpperCase().startsWith('BW-')) {
    setServerIpEverywhere(code);
    showSt(`✅ Đã thiết lập địa chỉ kết nối trực tiếp: <strong>${escapeHtml(code)}</strong>. Đang khởi chạy game!`);
    document.getElementById('btnLaunch')?.click();
    return;
  }

  // Case 2: BlockWay 6-character Room Code or BW-... Invite Token
  showSt('⏳ Đang tra cứu thông tin phòng & cấu hình phiên bản...');
  const getFn = window.aetherAPI.getCoopRoom || window.aetherAPI.coopGetRoom;
  const res = await getFn({ code, customDbUrl: state.customDbUrl });
  if (!res?.ok || !res.room) {
    showSt(`❌ ${escapeHtml(res?.error || 'Không tìm thấy Mã Phòng này.')}`, true);
    return;
  }

  const room = res.room;
  const reqMc = room.mcVersion || state.selectedVersion;
  const reqLoader = (room.loaderType || 'vanilla').toLowerCase();

  // Check if room uses an installed Modpack instance
  if (room.modpackName) {
    if (!packHub.instances?.length) {
      try {
        const instRes = await window.aetherAPI.packsInstances(state.gameDir);
        packHub.instances = instRes?.instances || [];
      } catch (_) {}
    }
    const matchingInst = (packHub.instances || []).find(
      (x) => x.name.toLowerCase() === room.modpackName.toLowerCase() || (room.modpackId && String(x.sourceId) === String(room.modpackId))
    );
    if (matchingInst) {
      showSt(`🎉 Đã khớp gói Modpack <strong>${escapeHtml(matchingInst.name)}</strong> (MC ${escapeHtml(reqMc)} • ${escapeHtml(reqLoader.toUpperCase())})! Đang vào thẳng phòng <strong>${escapeHtml(room.joinAddress)}</strong>...`);
      launchPackInstance(matchingInst, room.joinAddress);
      return;
    }
    const askPack = await askUserAgreement({
      title: `📦 Phòng Yêu Cầu Modpack "${room.modpackName}"`,
      message: `Phòng của ${room.hostName} đang chạy gói Modpack "${room.modpackName}" (MC ${reqMc} • ${reqLoader.toUpperCase()}).\n\nBạn muốn mở Kho Modpack để tải gói này trước, hay tự chỉnh sang MC ${reqMc} (${reqLoader.toUpperCase()}) và vào thẳng địa chỉ ${room.joinAddress}?`,
      agreeText: '📦 Mở Kho Modpack Tìm Gói Này',
      cancelText: `⚡ Tự chuyển MC ${reqMc} (${reqLoader.toUpperCase()}) & Vào Phòng`
    });
    if (askPack.agreed) {
      if (typeof window.switchMainTab === 'function') window.switchMainTab('packs');
      const pInput = document.getElementById('packsSearchInput');
      if (pInput) pInput.value = room.modpackName;
      packHub.query = room.modpackName;
      runPackSearch(true);
      return;
    }
  }

  // Auto-switch MC version and Loader if needed
  const needSwitch = state.selectedVersion !== reqMc || state.selectedCore !== reqLoader;
  if (needSwitch && typeof window.selectMcVersionAndCore === 'function') {
    await window.selectMcVersionAndCore(reqMc, reqLoader);
  }

  // v40.2 PRO: Auto-sync host's Mod Basket if room has mods attached
  if (Array.isArray(room.modBasket) && room.modBasket.length > 0 && typeof window.aetherAPI?.syncCoopModBasket === 'function') {
    showSt(`⏳ Phòng có đính kèm <strong>${room.modBasket.length} Mod</strong> của chủ phòng ${escapeHtml(room.hostName)}. Đang tự động kiểm tra & tải các Mod còn thiếu...`);
    const syncRes = await window.aetherAPI.syncCoopModBasket({
      gameDir: state.gameDir,
      modBasket: room.modBasket,
      mcVersion: reqMc,
      loaderType: reqLoader
    });
    if (syncRes?.ok) {
      await refreshLocalAddonsCount();
      if (syncRes.installedCount > 0) {
        showAetherNotification(`🤝 Đã tự động tải thêm ${syncRes.installedCount} Mod từ phòng của ${room.hostName}!`, 'success', 5000);
      }
    }
  }

  setServerIpEverywhere(room.joinAddress);
  const modCountInfo = Array.isArray(room.modBasket) && room.modBasket.length > 0 ? ` • <strong>${room.modBasket.length} Mod đã khớp</strong>` : '';
  showSt(`✅ Đã tự động đồng bộ cấu hình phòng của <strong>${escapeHtml(room.hostName)}</strong>: <strong>MC ${escapeHtml(reqMc)} (${escapeHtml(reqLoader.toUpperCase())})</strong>${modCountInfo} → <code>${escapeHtml(room.joinAddress)}</code>!`);
  showAetherNotification(`🤝 Đã khớp cấu hình phòng ${room.roomCode} (MC ${reqMc} • ${reqLoader.toUpperCase()})!`, 'success', 4500);
  document.getElementById('btnLaunch')?.click();
}

function openCreateCoopRoomModal() {
  const defaultAddr = coopState.activeRoom?.joinAddress || (coopIpOf(coopState.localIps[0]) ? `${coopIpOf(coopState.localIps[0])}:25565` : '');
  const card = packOpenModal(`
    <div class="modal-head"><span class="card-dot emerald"></span><h3>🔑 Tạo Mã Phòng BlockWay (6 Ký Tự)</h3></div>
    <div class="modal-body">
      <p class="pack-modal-hint">Nếu bạn đã mở thế giới qua <strong>e4mc</strong>, <strong>Radmin VPN / Zerotier</strong>, hoặc <strong>Mạng LAN</strong>, hãy dán địa chỉ vào đây để tạo <strong>Mã Phòng 6 ký tự</strong> (kèm tự động đồng bộ phiên bản MC + Loader + <strong>Giỏ Mod đang bật</strong> cho bạn bè).</p>
      <label class="field-label">Địa chỉ kết nối của bạn (Domain .e4mc.link hoặc IP:Port)</label>
      <input type="text" id="coopModalAddrInput" class="pro-input" placeholder="VD: vivid-fox.e4mc.link hoặc 26.45.12.8:25565" value="${escapeHtml(defaultAddr)}" />
      <label class="field-label" style="margin-top:8px;">Tên phòng hiển thị</label>
      <input type="text" id="coopModalWorldInput" class="pro-input" placeholder="VD: Sinh tồn OneBlock cùng anh em" value="Phòng của ${escapeHtml(getCurrentPlayerDisplayName())}" />
      <div id="coopModalResultBox" class="pack-modal-msg" style="margin-top:10px;">
        🎮 Cấu hình đính kèm: <strong>MC ${escapeHtml(state.selectedVersion)} (${escapeHtml(state.selectedCore.toUpperCase())})</strong> + tự động đính kèm <strong>Giỏ Mod đang bật</strong> để bạn bè không bị văng do thiếu Mod!
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn-modal-cancel" data-pmclose>Đóng</button>
      <button class="btn-modal-agree" id="btnCoopModalSubmit">⚡ Tạo Mã Phòng Ngay</button>
    </div>`, false);
  if (!card) return;
  const btnSub = card.querySelector('#btnCoopModalSubmit');
  const resBox = card.querySelector('#coopModalResultBox');
  btnSub.onclick = async () => {
    const addr = card.querySelector('#coopModalAddrInput')?.value.trim() || '';
    const worldName = card.querySelector('#coopModalWorldInput')?.value.trim() || `Phòng của ${getCurrentPlayerDisplayName()}`;
    if (!addr) {
      resBox.textContent = '⚠️ Vui lòng nhập địa chỉ .e4mc.link hoặc IP:Port của phòng!';
      return;
    }
    btnSub.disabled = true;
    btnSub.textContent = '⏳ Đang quét Giỏ Mod & tạo mã...';
    let modBasket = [];
    if (state.selectedCore !== 'vanilla' && typeof window.aetherAPI?.buildCoopModBasket === 'function') {
      try {
        const bRes = await window.aetherAPI.buildCoopModBasket({
          gameDir: state.gameDir,
          mcVersion: state.selectedVersion,
          loaderType: state.selectedCore
        });
        const list = bRes?.modBasket || bRes?.basket;
        if (bRes?.ok && Array.isArray(list)) modBasket = list;
      } catch (_) {}
    }
    const upsertFn = window.aetherAPI.upsertCoopRoom || window.aetherAPI.coopUpsertRoom;
    const r = await upsertFn({
      hostName: getCurrentPlayerDisplayName(),
      worldName,
      joinAddress: addr,
      mcVersion: state.selectedVersion,
      loaderType: state.selectedCore,
      modBasket,
      isPublic: true,
      customDbUrl: state.customDbUrl
    });
    btnSub.disabled = false;
    btnSub.textContent = '⚡ Tạo Mã Phòng Ngay';
    if (r?.ok && r.room) {
      coopState.activeRoom = r.room;
      const modNote = modBasket.length > 0 ? ` kèm ${modBasket.length} Mod` : '';
      renderCoopActiveBanner({
        title: `🟢 Phòng "${r.room.worldName}" đang hoạt động`,
        subtitle: `Gửi Mã Phòng 6 ký tự (${r.room.roomCode}) hoặc Mã Mời đầy đủ cho bạn bè để họ tự động cấu hình MC ${r.room.mcVersion} (${r.room.loaderType.toUpperCase()}${modNote}) và vào thẳng!`,
        roomCode: r.room.roomCode,
        joinAddress: r.room.joinAddress,
        inviteToken: r.room.inviteToken,
        mcVersion: r.room.mcVersion,
        loaderType: r.room.loaderType
      });
      refreshPublicCoopRoomsUI(true);
      packCloseModal();
      showAetherNotification(`🔑 Đã tạo Mã Phòng: ${r.room.roomCode} (${r.room.joinAddress}${modNote})!`, 'success', 5500);
    } else {
      resBox.textContent = `❌ ${r?.error || 'Không tạo được mã phòng.'}`;
    }
  };
}

function initCoopHubUI() {
  if (coopState.inited) return;
  coopState.inited = true;

  const btnScan = document.getElementById('btnCoopScanLan');
  if (btnScan) btnScan.onclick = scanCoopLanWorldsUI;

  const btnLanMod = document.getElementById('btnCoopInstallLanMod');
  if (btnLanMod) btnLanMod.onclick = installCoopLanHelperModUI;

  const btnHostE4mc = document.getElementById('btnCoopHostE4mc');
  if (btnHostE4mc) btnHostE4mc.onclick = () => hostCoopWithE4mc(null);

  const btnJoin = document.getElementById('btnCoopJoinRoom');
  if (btnJoin) btnJoin.onclick = () => joinCoopRoomByCode();

  const codeInp = document.getElementById('coopJoinCodeInput') || document.getElementById('coopRoomCodeInput');
  if (codeInp) codeInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinCoopRoomByCode(); });

  const btnCreateRoom = document.getElementById('btnCoopCreateRoomModal');
  if (btnCreateRoom) btnCreateRoom.onclick = openCreateCoopRoomModal;

  const btnRefreshRooms = document.getElementById('btnCoopRefreshRooms');
  if (btnRefreshRooms) btnRefreshRooms.onclick = () => refreshPublicCoopRoomsUI(true);

  if (typeof window.aetherAPI?.onCoopEvent === 'function') {
    window.aetherAPI.onCoopEvent(async (evt) => {
      if (!evt) return;
      const ctx = coopState.hostContext || {
        mcVersion: evt.mcVersion || state.selectedVersion,
        loaderType: evt.loaderType || state.selectedCore,
        modpackName: ''
      };
      let modBasket = [];
      if (ctx.loaderType !== 'vanilla' && !ctx.modpackName && typeof window.aetherAPI?.buildCoopModBasket === 'function') {
        try {
          const bRes = await window.aetherAPI.buildCoopModBasket({
            gameDir: state.gameDir,
            mcVersion: ctx.mcVersion,
            loaderType: ctx.loaderType
          });
          const list = bRes?.modBasket || bRes?.basket;
          if (bRes?.ok && Array.isArray(list)) modBasket = list;
        } catch (_) {}
      }
      const upsertFn = window.aetherAPI.upsertCoopRoom || window.aetherAPI.coopUpsertRoom;
      if ((evt.type === 'e4mc' || evt.type === 'e4mc-domain') && evt.domain) {
        const up = await upsertFn({
          roomCode: coopState.activeRoom?.roomCode || '',
          hostName: getCurrentPlayerDisplayName(),
          worldName: ctx.modpackName ? `${ctx.modpackName} (${getCurrentPlayerDisplayName()})` : `Thế giới của ${getCurrentPlayerDisplayName()}`,
          joinAddress: evt.domain,
          mcVersion: ctx.mcVersion,
          loaderType: ctx.loaderType,
          modpackName: ctx.modpackName || '',
          modpackSource: ctx.modpackSource || '',
          modpackId: ctx.modpackId || '',
          modBasket,
          isPublic: true,
          customDbUrl: state.customDbUrl
        });
        const room = up?.room || { roomCode: '', joinAddress: evt.domain, inviteToken: '' };
        coopState.activeRoom = room;
        try { navigator.clipboard?.writeText(evt.domain); } catch (_) {}
        renderCoopActiveBanner({
          title: `🌐 Đã Mở Phòng Internet (e4mc) Thành Công!`,
          subtitle: `Đã tự động sao chép địa chỉ ${evt.domain} vào bộ nhớ tạm! Bạn bè chỉ cần nhập Mã Phòng ${room.roomCode || evt.domain} trong BlockWay để tự đồng bộ Mod & vào thẳng.`,
          roomCode: room.roomCode,
          joinAddress: evt.domain,
          inviteToken: room.inviteToken,
          mcVersion: ctx.mcVersion,
          loaderType: ctx.loaderType
        });
        refreshPublicCoopRoomsUI(false);
        showAetherNotification(`🌐 Phòng e4mc đã mở: ${evt.domain} (Mã Phòng: ${room.roomCode || 'Sẵn sàng'}) — Đã tự sao chép!`, 'success', 8000);
      } else if (evt.type === 'lan-port' && evt.port) {
        const ip = coopIpOf(evt.localIps && evt.localIps[0]) || coopIpOf(coopState.localIps[0]) || '127.0.0.1';
        const lanAddr = `${ip}:${evt.port}`;
        // Only update banner with LAN address if e4mc hasn't already provided a public domain
        if (!coopState.activeRoom?.joinAddress?.includes('.e4mc.link')) {
          const up = await upsertFn({
            roomCode: coopState.activeRoom?.roomCode || '',
            hostName: getCurrentPlayerDisplayName(),
            worldName: `Phòng LAN của ${getCurrentPlayerDisplayName()}`,
            joinAddress: lanAddr,
            mcVersion: ctx.mcVersion,
            loaderType: ctx.loaderType,
            modpackName: ctx.modpackName || '',
            modBasket,
            isPublic: true,
            customDbUrl: state.customDbUrl
          });
          const room = up?.room || { roomCode: '', joinAddress: lanAddr, inviteToken: '' };
          coopState.activeRoom = room;
          renderCoopActiveBanner({
            title: `🏠 Đã Mở Cổng Mạng LAN (${lanAddr})`,
            subtitle: `Bạn bè cùng Wi-Fi / Radmin VPN có thể bấm "Quét Phòng LAN" hoặc nhập Mã Phòng ${room.roomCode} để vào ngay! (Nếu đã cài e4mc, đợi 2 giây để nhận thêm link .e4mc.link)`,
            roomCode: room.roomCode,
            joinAddress: lanAddr,
            inviteToken: room.inviteToken,
            mcVersion: ctx.mcVersion,
            loaderType: ctx.loaderType
          });
        }
      }
    });
  }
}

function onCoopHubTabShown() {
  initCoopHubUI();
  const cfgBadge = document.getElementById('coopActiveCfgBadge');
  if (cfgBadge) cfgBadge.textContent = `MC ${state.selectedVersion} • ${String(state.selectedCore || 'vanilla').toUpperCase()}`;
  refreshPublicCoopRoomsUI(false);
  scanCoopLanWorldsUI();
}
window.onCoopHubTabShown = onCoopHubTabShown;

/* ============================================================================
   v40.2 PRO — 5 NÂNG CẤP ĐỘT PHÁ (BÁC SĨ CRASH • ĐỒNG BỘ GIỎ MOD • TỰ NÂNG CẤP MOD • SAO LƯU MAP .ZIP • THƯ VIỆN ẢNH CHỤP)
   ============================================================================ */

// 1. Bác Sĩ Chẩn Đoán & Tự Sửa Lỗi Crash (Smart Crash Doctor & Auto-Healer)
let activeCrashDoctorTarget = null;

async function openCrashDoctorModal(exitCode = null, autoHealOnOpen = true) {
  const modal = document.getElementById('crashDoctorModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  const isPackCrash = exitCode !== null && Boolean(state.lastLaunchContext?.isPack && state.lastLaunchContext.instanceDir);
  const targetDir = isPackCrash ? state.lastLaunchContext.instanceDir : state.gameDir;
  const targetVer = isPackCrash ? (state.lastLaunchContext.mcVersion || state.selectedVersion) : state.selectedVersion;
  const targetCore = isPackCrash ? (state.lastLaunchContext.loaderType || 'fabric') : state.selectedCore;
  const targetRam = isPackCrash ? (state.lastLaunchContext.ramGB || 4) : (state.ramGB || 4);
  const targetLabel = isPackCrash
    ? `📦 ${state.lastLaunchContext.name} — MC ${targetVer} (${String(targetCore).toUpperCase()})`
    : `MC ${targetVer} (${String(targetCore || 'vanilla').toUpperCase()})`;
  activeCrashDoctorTarget = { isPack: isPackCrash, dir: targetDir, mcVersion: targetVer, loaderType: targetCore, inst: isPackCrash ? state.lastLaunchContext.inst : null };

  const subEl = document.getElementById('crashDoctorSub');
  const causesEl = document.getElementById('crashDoctorCausesList');
  const actionsEl = document.getElementById('crashDoctorActionsList');
  const statusMsgEl = document.getElementById('crashDoctorStatusMsg');
  const btnRelaunch = document.getElementById('btnCrashRelaunchNow');
  const rawLogEl = document.getElementById('crashDoctorRawPre') || document.getElementById('crashDoctorRawExcerpt');
  const consoleLines = Array.from(document.querySelectorAll('#consoleOutput .log-line, #consoleOutput .log-entry')).slice(-120).map((el) => el.textContent || '');

  const setRelaunchBusy = (busy) => {
    if (!btnRelaunch) return;
    btnRelaunch.disabled = Boolean(busy);
    btnRelaunch.textContent = busy
      ? '⏳ Đang tự sửa lỗi — Vui lòng đợi...'
      : '🚀 Đã Sửa Xong — Vào Lại Game Ngay';
  };

  const setDoctorStatus = (html, isErr = false) => {
    if (!statusMsgEl) return;
    if (!html) {
      statusMsgEl.classList.add('hidden');
      return;
    }
    statusMsgEl.classList.remove('hidden');
    statusMsgEl.className = `coop-room-status ${isErr ? 'is-err' : 'is-ok'}`;
    statusMsgEl.innerHTML = html;
  };

  setRelaunchBusy(true);
  if (subEl) {
    subEl.innerHTML = `⏳ <strong>Bác Sĩ BlockWay đang tự động khám nhật ký & kiểm tra thư mục <code>mods/</code></strong> cho cấu hình <strong>${escapeHtml(targetLabel)}</strong>...`;
  }
  if (causesEl) causesEl.innerHTML = '';
  if (actionsEl) actionsEl.innerHTML = '';
  setDoctorStatus('');

  const res = await window.aetherAPI.analyzeCrash({
    gameDir: targetDir,
    mcVersion: targetVer,
    loaderType: targetCore,
    ramGB: targetRam,
    exitCode,
    recentLogs: consoleLines.join('\n')
  });

  if (!res?.ok) {
    setRelaunchBusy(false);
    setDoctorStatus(`⚠️ Không thể đọc nhật ký lỗi: ${escapeHtml(res?.error || 'Lỗi không xác định')}`, true);
    return;
  }

  const realIssues = (res.causes || []).filter((c) => c.severity === 'high' || c.severity === 'medium');

  const renderCauses = (causesList) => {
    if (!causesEl) return;
    causesEl.innerHTML = (causesList || []).map((c) => {
      const isOk = c.severity === 'info' || c.severity === 'ok';
      const sevColor = c.severity === 'high' ? 'var(--bw-danger-text)' : (isOk ? 'var(--bw-ok-text)' : 'var(--bw-gold-text)');
      const sevBg = c.severity === 'high' ? 'rgba(239,68,68,0.1)' : (isOk ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)');
      const sevBorder = c.severity === 'high' ? 'rgba(239,68,68,0.32)' : (isOk ? 'rgba(16,185,129,0.32)' : 'rgba(245,158,11,0.32)');
      return `<div class="crash-cause-card" style="background:${sevBg};border:1px solid ${sevBorder};border-radius:10px;padding:12px 14px;margin-bottom:6px;">
        <div style="font-weight:800;font-size:13px;color:${sevColor};margin-bottom:4px;">${escapeHtml(c.title)}</div>
        <div style="font-size:12.2px;color:var(--text-main);line-height:1.5;">${escapeHtml(c.detail)}</div>
      </div>`;
    }).join('');
  };

  renderCauses(res.causes);

  if (subEl) {
    subEl.innerHTML = realIssues.length > 0
      ? `Phát hiện <strong>${realIssues.length} vấn đề</strong> trong cấu hình <strong>${escapeHtml(targetLabel)}</strong>. Hệ thống đang <strong>tự động sửa lỗi & đồng bộ Mod</strong> cho bạn:`
      : `Đã kiểm tra nhật ký & thư mục <code>mods/</code> cho <strong>${escapeHtml(targetLabel)}</strong>:`;
  }

  if (rawLogEl) {
    rawLogEl.textContent = res.rawExcerpt || res.rawSnippet || 'Chưa có dữ liệu nhật ký lỗi.';
  }

  // Automatic 1-Click Healer routine that fixes all detected issues without blocking popups
  const executeAutoHealAll = async () => {
    setRelaunchBusy(true);
    setDoctorStatus(`⏳ <strong>Đang tự động sửa lỗi:</strong> Quét SHA-1 toàn bộ Mod, tải thư viện còn thiếu và đồng bộ cho <strong>${escapeHtml(targetLabel)}</strong>...`);
    const fixedNotes = [];

    try {
      if (!isPackCrash && state.selectedCore === 'vanilla' && typeof window.selectMcVersionAndCore === 'function') {
        await window.selectMcVersionAndCore(state.selectedVersion, 'fabric');
        fixedNotes.push('Bật Fabric Loader');
      }

      const effectiveCoreNow = isPackCrash ? (targetCore === 'vanilla' ? 'fabric' : targetCore) : (state.selectedCore === 'vanilla' ? 'fabric' : state.selectedCore);
      const acts = Array.isArray(res.actions) ? res.actions : [];

      // 1. Handle conflict mods, RAM & Java upgrades first
      for (const act of acts) {
        if (act.type === 'disable-mod' && act.reason === 'conflict' && act.fileName) {
          try {
            const tr = await window.aetherAPI.toggleLocalAddon(targetDir, 'mods', act.fileName);
            if (tr?.ok && tr.enabled === false) fixedNotes.push(`Tắt xung đột ${act.fileName}`);
          } catch (_) {}
        } else if (act.type === 'increase-ram') {
          const targetGB = Math.min(16, Math.max((targetRam || 4) + 2, Number(act.targetRam) || 6));
          state.ramGB = targetGB;
          const ramSlider = document.getElementById('ramSlider');
          const ramVal = document.getElementById('ramValueDisplay');
          if (ramSlider) ramSlider.value = String(targetGB);
          if (ramVal) ramVal.textContent = `${targetGB} GB`;
          if (typeof updateSummaryUI === 'function') updateSummaryUI();
          saveCurrentConfig();
          fixedNotes.push(`Nâng RAM lên ${targetGB} GB`);
        } else if (act.type === 'install-java') {
          try {
            const jRes = await window.aetherAPI.autoInstallJava(Number(act.major || act.javaMajor) || 21, state.gameDir);
            if (jRes?.ok && jRes.javaPath) {
              state.javaPath = jRes.javaPath;
              const jInp = document.getElementById('javaPathInput');
              if (jInp) jInp.value = jRes.javaPath;
              saveCurrentConfig();
              fixedNotes.push(`Cấu hình Java ${act.major || 21}`);
            }
          } catch (_) {}
        }
      }

      // 2. Sync & strictly upgrade all local mods + auto-resolve JIJ dependencies
      const upgradedFromSet = new Set();
      const alreadyDisabledSet = new Set();
      const syncRes = await window.aetherAPI.syncAllModsToVersion({
        gameDir: targetDir,
        mcVersion: targetVer,
        loaderType: effectiveCoreNow
      });
      if (syncRes?.ok) {
        const upList = Array.isArray(syncRes.upgraded) ? syncRes.upgraded : [];
        const depList = Array.isArray(syncRes.depsInstalled) ? syncRes.depsInstalled : [];
        const keptList = Array.isArray(syncRes.kept) ? syncRes.kept : [];
        const disList = Array.isArray(syncRes.disabledIncompatible) ? syncRes.disabledIncompatible : [];
        upList.forEach((u) => { if (u?.from) upgradedFromSet.add(u.from); });
        disList.forEach((d) => alreadyDisabledSet.add(d));
        if (upList.length > 0) fixedNotes.push(`Nâng cấp ${upList.length} Mod sang bản ${targetVer}`);
        if (depList.length > 0) fixedNotes.push(`Cài thư viện ${depList.join(', ')}`);
        if (disList.length > 0) fixedNotes.push(`Tự tắt ${disList.length} Mod chưa hỗ trợ bản ${targetVer} (${disList.join(', ')})`);
        if (keptList.length > 0 && upList.length === 0 && disList.length === 0) fixedNotes.push(`Kiểm tra ${keptList.length} Mod chuẩn bản ${targetVer}`);
      }

      // 3. Ensure every explicitly detected missing library is installed & any un-upgraded offending jar is disabled
      for (const act of acts) {
        if (act.type === 'install-mod' && act.slug) {
          try {
            const r = await window.aetherAPI.installModrinth({
              slug: act.slug,
              projectType: 'mod',
              mcVersion: targetVer,
              loaderType: effectiveCoreNow,
              gameDir: targetDir
            });
            if (r?.ok && r.fileName && !r.skipped) {
              fixedNotes.push(`Cài thư viện ${r.fileName}`);
            }
          } catch (_) {}
        } else if (act.type === 'disable-mod' && act.reason !== 'conflict' && act.fileName) {
          if (!upgradedFromSet.has(act.fileName) && !alreadyDisabledSet.has(act.fileName)) {
            try {
              const tr = await window.aetherAPI.toggleLocalAddon(targetDir, 'mods', act.fileName);
              if (tr?.ok && tr.enabled === false) {
                fixedNotes.push(`Tự tắt ${act.fileName}`);
              }
            } catch (_) {}
          }
        }
      }

      await refreshLocalAddonsCount();
      if (!document.getElementById('localAddonsWrap')?.classList.contains('hidden')) {
        await renderLocalAddonsManager();
      }

      if (actionsEl) {
        actionsEl.querySelectorAll('.crash-fix-btn').forEach((b) => {
          b.disabled = true;
          if (!b.textContent.trim().startsWith('✓')) {
            b.textContent = `✓ ${b.textContent.trim().replace(/^[^\wÀ-ỹ]+\s*/, '')}`;
          }
        });
      }

      const summaryDetail = fixedNotes.length > 0 ? fixedNotes.join(' • ') : `Tất cả Mod đã khớp chuẩn với MC ${targetVer}`;
      if (subEl) {
        subEl.innerHTML = `✅ <strong>Đã xử lý xong toàn bộ xung đột &amp; thư viện thiếu</strong> cho <strong>${escapeHtml(targetLabel)}</strong>:`;
      }
      renderCauses([
        {
          severity: 'ok',
          title: `✅ Đã tự động sửa lỗi & đồng bộ toàn bộ Mod cho ${targetLabel}!`,
          detail: `${summaryDetail}. Bây giờ bạn có thể bấm ngay nút "🚀 Đã Sửa Xong — Vào Lại Game Ngay"!`
        }
      ]);
      setDoctorStatus(`🎉 <strong>Hoàn tất tự động sửa lỗi:</strong> ${escapeHtml(summaryDetail)}!`);
      showAetherNotification(`✅ Bác Sĩ Crash đã tự động sửa lỗi & đồng bộ Mod (${summaryDetail})!`, 'success', 5500);
    } catch (err) {
      setDoctorStatus(`⚠️ Lỗi trong quá trình tự sửa: ${escapeHtml(err.message)}`, true);
    } finally {
      setRelaunchBusy(false);
    }
  };

  if (actionsEl) {
    const acts = Array.isArray(res.actions) ? [...res.actions] : [];
    const healAllBtnHtml = `
      <button class="btn-fps-boost-1click" id="btnCrashAutoHealAll" style="padding:10px 16px;font-size:13px;font-weight:800;width:100%;justify-content:center;margin-bottom:6px;">
        ✨ Tự Động Sửa Tất Cả &amp; Đồng Bộ Toàn Bộ Mod Ngay (1-Click)
      </button>
    `;
    const itemBtnsHtml = acts.map((act, idx) => `
      <button class="vtype-btn crash-fix-btn" data-fixidx="${idx}" style="padding:8px 12px;font-size:12px;text-align:left;">
        ${escapeHtml(act.label)}
      </button>
    `).join('');
    actionsEl.innerHTML = healAllBtnHtml + `<div style="display:flex;flex-wrap:wrap;gap:6px;">${itemBtnsHtml}</div>`;

    const btnHealAll = document.getElementById('btnCrashAutoHealAll');
    if (btnHealAll) {
      btnHealAll.onclick = async () => {
        btnHealAll.disabled = true;
        btnHealAll.textContent = '⏳ Đang tự động sửa tất cả lỗi & nâng cấp Mod...';
        await executeAutoHealAll();
        btnHealAll.disabled = false;
        btnHealAll.textContent = '✓ Đã Tự Động Sửa Xong Tất Cả Lỗi!';
      };
    }

    actionsEl.querySelectorAll('.crash-fix-btn').forEach((btn) => {
      btn.onclick = async () => {
        const act = acts[Number(btn.dataset.fixidx)];
        if (!act) return;
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Đang xử lý...';
        try {
          if (act.type === 'install-mod' && act.slug) {
            const r = await window.aetherAPI.installModrinth({
              slug: act.slug,
              projectType: 'mod',
              mcVersion: targetVer,
              loaderType: targetCore === 'vanilla' ? 'fabric' : targetCore,
              gameDir: targetDir
            });
            if (r?.ok) {
              btn.textContent = `✓ Đã cài ${r.fileName}!`;
              setDoctorStatus(`✅ Đã tải & cài đặt thư viện <strong>${escapeHtml(r.fileName)}</strong> thành công!`);
              await refreshLocalAddonsCount();
            } else {
              btn.textContent = `⚠️ ${r?.error || 'Không tìm thấy bản phù hợp'}`;
              btn.disabled = false;
            }
          } else if (act.type === 'disable-mod' && act.fileName) {
            await window.aetherAPI.toggleLocalAddon(targetDir, 'mods', act.fileName);
            btn.textContent = `✓ Đã tắt ${act.fileName}`;
            setDoctorStatus(`🚫 Đã tự động tắt Mod <strong>${escapeHtml(act.fileName)}</strong> (chuyển sang .disabled)!`);
            await refreshLocalAddonsCount();
          } else if (act.type === 'sync-all-mods') {
            await executeAutoHealAll();
            btn.textContent = `✓ Đã đồng bộ toàn bộ Mod!`;
          } else if (act.type === 'increase-ram') {
            const targetGB = Math.min(16, Math.max((state.ramGB || 4) + 2, Number(act.targetRam) || 6));
            state.ramGB = targetGB;
            const ramSlider = document.getElementById('ramSlider');
            const ramVal = document.getElementById('ramValueDisplay');
            if (ramSlider) ramSlider.value = String(targetGB);
            if (ramVal) ramVal.textContent = `${targetGB} GB`;
            if (typeof updateSummaryUI === 'function') updateSummaryUI();
            saveCurrentConfig();
            btn.textContent = `✓ Đã nâng RAM lên ${targetGB} GB!`;
            setDoctorStatus(`⚡ Đã nâng mức cấp phát RAM lên <strong>${targetGB} GB</strong>!`);
          } else if (act.type === 'install-java') {
            const jRes = await window.aetherAPI.autoInstallJava(Number(act.major || act.javaMajor) || 21, state.gameDir);
            if (jRes?.ok && jRes.javaPath) {
              state.javaPath = jRes.javaPath;
              const jInp = document.getElementById('javaPathInput');
              if (jInp) jInp.value = jRes.javaPath;
              saveCurrentConfig();
              btn.textContent = `✓ Đã trang bị Java ${act.major || 21}!`;
              setDoctorStatus(`☕ Đã tải & cấu hình <strong>Java ${act.major || 21}</strong> thành công!`);
            } else {
              btn.textContent = orig;
              btn.disabled = false;
            }
          }
        } catch (err) {
          btn.textContent = orig;
          btn.disabled = false;
          setDoctorStatus(`⚠️ Lỗi khi tự sửa: ${escapeHtml(err.message)}`, true);
        }
      };
    });
  }

  // Auto-run healing immediately when issues are detected!
  if (autoHealOnOpen && realIssues.length > 0) {
    const btnHealAll = document.getElementById('btnCrashAutoHealAll');
    if (btnHealAll) {
      btnHealAll.disabled = true;
      btnHealAll.textContent = '⏳ Bác Sĩ đang tự động sửa lỗi & đồng bộ Mod...';
    }
    await executeAutoHealAll();
    if (btnHealAll) {
      btnHealAll.disabled = false;
      btnHealAll.textContent = '✓ Đã Tự Động Sửa Xong Tất Cả Lỗi!';
    }
  } else {
    setRelaunchBusy(false);
  }
}
window.openCrashDoctorModal = openCrashDoctorModal;

// 2. Nâng Cấp & Đồng Bộ Toàn Bộ Mod Sang Phiên Bản MC Đang Chọn
async function runSyncAllModsUI() {
  let target = getModStoreTarget();
  if (!target.isPack && state.selectedCore === 'vanilla' && typeof window.selectMcVersionAndCore === 'function') {
    await window.selectMcVersionAndCore(state.selectedVersion, 'fabric');
    showAetherNotification(`🔄 Đã tự động bật Fabric (${state.selectedVersion}) để đồng bộ Mod!`, 'info', 3000);
    target = getModStoreTarget();
  }

  const btn1 = document.getElementById('btnSyncAllModsToVer');
  const btn2 = document.getElementById('btnToolsSyncMods');
  const orig1 = btn1?.textContent;
  const orig2 = btn2?.textContent;
  if (btn1) { btn1.disabled = true; btn1.textContent = '⏳ Đang đồng bộ Mod...'; }
  if (btn2) { btn2.disabled = true; btn2.textContent = '⏳ Đang đồng bộ Mod...'; }

  const targetDesc = target.isPack ? `gói "${target.shortName}" (MC ${target.mcVersion} • ${target.core.toUpperCase()})` : `MC ${target.mcVersion} (${target.core.toUpperCase()})`;
  showAetherNotification(`🔄 Đang quét SHA-1 toàn bộ Mod và đồng bộ cho ${targetDesc}...`, 'info', 4500);

  try {
    const res = await window.aetherAPI.syncAllModsToVersion({
      gameDir: target.dir,
      mcVersion: target.mcVersion,
      loaderType: target.core === 'vanilla' ? 'fabric' : target.core
    });
    await refreshLocalAddonsCount();
    if (!document.getElementById('localAddonsWrap')?.classList.contains('hidden')) {
      await renderLocalAddonsManager();
    }
    if (res?.ok) {
      const upCount = Array.isArray(res.upgraded) ? res.upgraded.length : (res.updatedCount || 0);
      const depCount = Array.isArray(res.depsInstalled) ? res.depsInstalled.length : (res.depInstalledCount || 0);
      const keptCount = Array.isArray(res.kept) ? res.kept.length : (res.keptCount || 0);
      const disCount = Array.isArray(res.disabledIncompatible) ? res.disabledIncompatible.length : (res.disabledCount || 0);
      const msg = `✅ Hoàn tất đồng bộ Mod cho ${targetDesc}: Đã nâng cấp ${upCount} Mod, cài thêm ${depCount} thư viện phụ thuộc, giữ nguyên ${keptCount} Mod tương thích${disCount > 0 ? `, tự tắt ${disCount} Mod chưa hỗ trợ bản này` : ''}!`;
      document.getElementById('statusText').textContent = msg;
      showAetherNotification(msg, 'success', 6500);
    } else {
      showAetherNotification(`⚠️ Không thể đồng bộ Mod: ${res?.error || 'Lỗi kết nối Modrinth'}`, 'error', 4500);
    }
  } catch (err) {
    showAetherNotification(`⚠️ Lỗi đồng bộ Mod: ${err.message}`, 'error', 4500);
  } finally {
    if (btn1) { btn1.disabled = false; btn1.textContent = orig1 || '🔄 Đồng Bộ Mod Sang Bản Này'; }
    if (btn2) { btn2.disabled = false; btn2.textContent = orig2 || '🔄 Nâng Cấp Toàn Bộ Mod'; }
  }
}
window.runSyncAllModsUI = runSyncAllModsUI;

// 3. Xuất / Nhập Giỏ Mod Chơi Chung (.bwmods.json) & Đóng Gói Modpack Chuẩn Quốc Tế (.mrpack) — v40.9 PRO Share Pack 2.0
async function openShareModpackModal(customOpts = null) {
  if (!window.aetherAPI?.exportMrpack) return;
  const target = customOpts || (() => {
    const t = getModStoreTarget();
    const player = getCurrentPlayerDisplayName();
    return {
      targetDir: t.dir,
      packName: t.isPack ? (t.shortName || 'BlockWay-Modpack') : `Bộ Mod ${player} (${t.mcVersion})`,
      mcVersion: t.mcVersion,
      loaderType: t.core === 'vanilla' ? 'fabric' : t.core,
      loaderVersion: t.isPack ? (t.inst?.loaderVersion || '') : (state.selectedLoaderVersion || ''),
      isPack: t.isPack
    };
  })();

  let pv = { modsCount: 0, shadersCount: 0, resourcePacksCount: 0, configsCount: 0, hasKeybinds: false, hasServersDat: false, proprietaryFiles: [] };
  if (window.aetherAPI?.previewMrpackExport) {
    try {
      const r = await window.aetherAPI.previewMrpackExport({ gameDir: state.gameDir, targetDir: target.targetDir });
      if (r?.ok) pv = r;
    } catch (_) {}
  }

  const shadersAndRpCount = (pv.shadersCount || 0) + (pv.resourcePacksCount || 0);
  const propList = Array.isArray(pv.proprietaryFiles) ? pv.proprietaryFiles : [];

  const card = packOpenModal(`
    <div class="modal-head" style="justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:9px;">
        <span class="card-dot emerald"></span>
        <h3>📦 Đóng Gói &amp; Gửi Bộ Mod Cho Bạn Bè</h3>
      </div>
      <button class="vtype-btn" data-pmclose>✕ Đóng</button>
    </div>
    <div class="modal-body bw-share-pack-body">
      <p class="pack-modal-hint" style="margin:0;">
        Đóng gói từ <strong>${escapeHtml(target.isPack ? `Modpack “${target.packName}”` : `Thư mục game MC ${target.mcVersion} (${String(target.loaderType).toUpperCase()})`)}</strong> thành 1 tệp <code>.mrpack</code> gọn nhẹ.
        Bạn bè chỉ cần <strong>kéo-thả tệp này vào cửa sổ BlockWay</strong> là tự cài đủ phiên bản MC + Loader + Mod!
      </p>

      <div>
        <label class="qw-label" style="display:block;margin-bottom:5px;">Tên bộ Mod chia sẻ</label>
        <input type="text" id="inpSharePackTitle" class="pro-input" maxlength="60" value="${escapeHtml(target.packName)}" placeholder="Nhập tên gói (vd: Bộ Mod Sinh Tồn Nhóm Mình)..." />
      </div>

      <div class="bw-share-opts-grid">
        <label class="bw-share-opt-row">
          <input type="checkbox" id="chkShareMods" ${pv.modsCount > 0 ? 'checked' : ''} />
          <div>
            <strong>🧩 Các gói Mod đang bật (<code>mods/*.jar</code>)</strong>
            <span>Tìm thấy <strong>${pv.modsCount}</strong> Mod — tự ưu tiên lấy link gốc Modrinth giúp tệp siêu nhẹ</span>
          </div>
        </label>
        <label class="bw-share-opt-row">
          <input type="checkbox" id="chkSharePacks" ${shadersAndRpCount > 0 ? 'checked' : ''} />
          <div>
            <strong>✨ Shader &amp; Resource Pack (<code>${pv.shadersCount}</code> Shader • <code>${pv.resourcePacksCount}</code> Resource Pack)</strong>
            <span>Gửi kèm gói bóng đổ và gói tài nguyên bạn đang dùng</span>
          </div>
        </label>
        <label class="bw-share-opt-row">
          <input type="checkbox" id="chkShareConfigs" checked />
          <div>
            <strong>⚙️ Cấu hình tinh chỉnh Mod (<code>config/</code> — ${pv.configsCount} tệp an toàn)</strong>
            <span>Giúp bạn bè có sẵn thiết lập Mod đồng nhất, tự loại bỏ mọi tệp chứa tài khoản</span>
          </div>
        </label>
        <label class="bw-share-opt-row">
          <input type="checkbox" id="chkShareKeybinds" />
          <div>
            <strong>⌨️ Phím tắt &amp; góc nhìn FOV trong game (<code>options.txt</code>)</strong>
            <span>Tùy chọn: đồng bộ bảng phím bấm điều khiển của bạn sang máy người nhận</span>
          </div>
        </label>
        <label class="bw-share-opt-row">
          <input type="checkbox" id="chkShareServersDat" />
          <div>
            <strong>🌐 Danh sách Server đang lưu (<code>servers.dat</code>)</strong>
            <span>Mặc định tắt để tránh lộ IP máy chủ riêng — chỉ bật khi bạn muốn gửi luôn danh sách Server</span>
          </div>
        </label>
      </div>

      ${propList.length ? `<div class="pack-modal-msg warn" style="margin:0;">ℹ️ Tệp bản quyền đóng (<code>${escapeHtml(propList.join(', '))}</code>) sẽ tự động được bỏ qua khi đóng gói — máy bạn bè có thể bấm 1-Click <strong>🔆 Bộ Chuẩn OptiFine</strong> là chạy mượt tương đương.</div>` : ''}
      <div id="sharePackLiveMsg" class="pack-modal-msg hidden" style="margin:0;"></div>
    </div>
    <div class="modal-foot" style="justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <button type="button" class="vtype-btn" id="btnShareQuickBasket" title="Chỉ xuất danh sách tên Mod siêu nhẹ (.bwmods.json vài KB)">📤 Chỉ xuất Giỏ Mod nhẹ (.json)</button>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="btn-modal-cancel" data-pmclose>Đóng</button>
        <button type="button" class="btn-modal-agree" id="btnConfirmExportMrpack">📦 Chọn Nơi Lưu &amp; Đóng Gói (.mrpack)</button>
      </div>
    </div>`, false);

  if (!card) return;

  const btnBasket = card.querySelector('#btnShareQuickBasket');
  if (btnBasket) {
    btnBasket.onclick = async () => {
      packCloseModal();
      await exportModBasketUI(target.targetDir, target.mcVersion, target.loaderType);
    };
  }

  const btnGo = card.querySelector('#btnConfirmExportMrpack');
  const msgEl = card.querySelector('#sharePackLiveMsg');
  btnGo.onclick = async () => {
    const cleanName = (card.querySelector('#inpSharePackTitle')?.value || '').trim() || target.packName;
    const includeMods = Boolean(card.querySelector('#chkShareMods')?.checked);
    const includeShadersAndPacks = Boolean(card.querySelector('#chkSharePacks')?.checked);
    const includeConfigs = Boolean(card.querySelector('#chkShareConfigs')?.checked);
    const includeKeybinds = Boolean(card.querySelector('#chkShareKeybinds')?.checked);
    const includeServersDat = Boolean(card.querySelector('#chkShareServersDat')?.checked);

    if (!includeMods && !includeShadersAndPacks) {
      if (msgEl) {
        msgEl.classList.remove('hidden');
        msgEl.textContent = '⚠️ Hãy tích chọn ít nhất Mục Mod (.jar) hoặc Shader & Resource Pack để đóng gói.';
      }
      return;
    }

    const orig = btnGo.textContent;
    btnGo.disabled = true;
    btnGo.textContent = '⏳ Đang kiểm tra Mod & nén gói .mrpack...';
    if (msgEl) {
      msgEl.classList.remove('hidden');
      msgEl.textContent = '🔎 Đang đối chiếu nguồn tải Modrinth & đóng gói tệp chia sẻ...';
    }
    try {
      const res = await window.aetherAPI.exportMrpack({
        gameDir: state.gameDir,
        targetDir: target.targetDir,
        packName: cleanName,
        mcVersion: target.mcVersion,
        loaderType: target.loaderType,
        loaderVersion: target.loaderVersion || '',
        includeMods,
        includeShadersAndPacks,
        includeConfigs,
        includeKeybinds,
        includeServersDat,
        revealInExplorer: true,
        authorName: getCurrentPlayerDisplayName()
      });
      if (res?.ok) {
        packCloseModal();
        showAetherNotification(
          `📦 Đã đóng gói "${res.packName || cleanName}" (${res.totalItems || 0} gói • ${res.sizeMB || 0} MB) và mở sẵn thư mục chứa tệp! Gửi tệp .mrpack qua Zalo/Discord để bạn bè kéo-thả cài 1-Click!`,
          'success',
          7000
        );
      } else if (!res?.canceled) {
        if (msgEl) msgEl.textContent = `❌ ${res?.error || 'Không thể đóng gói .mrpack'}`;
        showAetherNotification(`⚠️ Không thể đóng gói .mrpack: ${res?.error || 'Lỗi không xác định'}`, 'error', 4500);
      } else if (msgEl) {
        msgEl.classList.add('hidden');
      }
    } catch (err) {
      if (msgEl) msgEl.textContent = `❌ ${err.message}`;
      showAetherNotification(`⚠️ Lỗi đóng gói .mrpack: ${err.message}`, 'error', 4500);
    } finally {
      btnGo.disabled = false;
      btnGo.textContent = orig;
    }
  };
}

async function exportMrpackUI(customOpts = null) {
  return openShareModpackModal(customOpts);
}
window.exportMrpackUI = exportMrpackUI;
window.openShareModpackModal = openShareModpackModal;

async function exportModBasketUI(overrideDir = '', overrideMc = '', overrideCore = '') {
  const target = getModStoreTarget();
  const dir = overrideDir || target.dir;
  const mcVersion = overrideMc || target.mcVersion;
  const loaderType = overrideCore || target.core;
  showAetherNotification('⏳ Đang quét danh sách Mod để xuất Giỏ Mod (.bwmods.json)...', 'info', 3000);
  const fn = window.aetherAPI.exportCoopModBasketFile || window.aetherAPI.exportCoopBasketFile;
  const res = await fn({
    gameDir: dir,
    mcVersion,
    loaderType,
    hostName: getCurrentPlayerDisplayName()
  });
  if (res?.ok) {
    showAetherNotification(`📤 Đã xuất Giỏ Mod (${res.modsCount || res.count || 0} Mod) ra file thành công! Hãy gửi file này cho bạn bè qua Zalo/Discord.`, 'success', 5500);
  } else if (!res?.canceled) {
    showAetherNotification(`⚠️ Không thể xuất Giỏ Mod: ${res?.error || 'Lỗi không xác định'}`, 'error', 4500);
  }
}

async function importModBasketUI() {
  const target = getModStoreTarget();
  const fn = window.aetherAPI.importCoopModBasketFile || window.aetherAPI.importCoopBasketFile;
  const res = await fn({
    gameDir: target.dir,
    mcVersion: target.mcVersion,
    loaderType: target.core
  });
  if (res?.ok) {
    if (!target.isPack && res.mcVersion && res.loaderType && (res.mcVersion !== state.selectedVersion || res.loaderType !== state.selectedCore)) {
      if (typeof window.selectMcVersionAndCore === 'function') {
        await window.selectMcVersionAndCore(res.mcVersion, res.loaderType);
      }
    }
    await refreshLocalAddonsCount();
    if (target.isPack && typeof refreshPackInstances === 'function') refreshPackInstances();
    if (!document.getElementById('localAddonsWrap')?.classList.contains('hidden')) {
      await renderLocalAddonsManager();
    }
    const instCnt = Array.isArray(res.installed) ? res.installed.length : (res.installedCount || 0);
    const hadCnt = Array.isArray(res.alreadyHad) ? res.alreadyHad.length : (res.skippedCount || 0);
    showAetherNotification(`📥 Đã nhập Giỏ Mod thành công! Tải mới ${instCnt} Mod, đã có sẵn ${hadCnt} Mod.`, 'success', 5500);
  } else if (!res?.canceled) {
    showAetherNotification(`⚠️ Lỗi nhập Giỏ Mod: ${res?.error || 'File không hợp lệ'}`, 'error', 4500);
  }
}

/* ============================================================================
   3B. v40.9.5: TRỢ LÝ OPTIFINE ĐA LOADER / ĐA PHIÊN BẢN & TÙY CHỌN TÍNH NĂNG LẺ
   ============================================================================ */
async function openOptifineHubModal(droppedJar = null) {
  if (typeof packHub === 'object' && (!Array.isArray(packHub.instances) || packHub.instances.length === 0) && state.gameDir && window.aetherAPI?.packsInstances) {
    try {
      const rInst = await window.aetherAPI.packsInstances(state.gameDir);
      if (Array.isArray(rInst?.instances)) packHub.instances = rInst.instances;
    } catch (_) {}
  }
  const packInstances = (typeof packHub === 'object' && Array.isArray(packHub.instances)) ? packHub.instances : [];
  const initTarget = getModStoreTarget();
  const rawInitCore = String(initTarget.core || state.selectedCore || 'optifine').toLowerCase();
  const initLoaderVal = ['optifine', 'fabric', 'forge', 'neoforge', 'quilt'].includes(rawInitCore) ? rawInitCore : 'optifine';
  const initMc = String(droppedJar?.mcVersion || initTarget.mcVersion || state.selectedVersion || '1.21.4');

  const releaseVers = Array.isArray(state.versions)
    ? state.versions.filter((v) => v && v.type === 'release').map((v) => String(v.id))
    : [];
  const fallbackVers = [
    '26.3', '26.2', '1.21.11', '1.21.10', '1.21.8', '1.21.5', '1.21.4', '1.21.1',
    '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.17.1', '1.16.5',
    '1.12.2', '1.8.9', '1.7.10'
  ];
  const allMcVers = Array.from(new Set([
    initMc,
    state.selectedVersion || '1.21.4',
    ...(releaseVers.length > 0 ? releaseVers : fallbackVers)
  ].filter(Boolean)));

  const droppedMc = droppedJar?.mcVersion || initMc;
  const droppedName = droppedJar?.fileName ? escapeHtml(droppedJar.fileName) : '';

  const targetDirOptionsHtml = [
    `<option value="" ${!initTarget.isPack ? 'selected' : ''}>🏠 Thư mục chính (.minecraft)</option>`,
    ...packInstances.map((inst) => {
      const ld = (typeof PACK_LOADER_LABEL === 'object' && PACK_LOADER_LABEL[inst.loader]) || String(inst.loader || 'fabric').toUpperCase();
      const sel = initTarget.isPack && initTarget.dir === inst.dir ? 'selected' : '';
      return `<option value="${escapeHtml(inst.dir)}" data-mc="${escapeHtml(inst.mcVersion || '')}" data-loader="${escapeHtml(String(inst.loader || 'fabric').toLowerCase())}" ${sel}>📦 ${escapeHtml(inst.name)} (MC ${escapeHtml(inst.mcVersion || '?')} • ${escapeHtml(ld)})</option>`;
    })
  ].join('');

  const mcOptionsHtml = allMcVers.map((v) => (
    `<option value="${escapeHtml(v)}" ${v === initMc ? 'selected' : ''}>Minecraft ${escapeHtml(v)}</option>`
  )).join('');

  const card = packOpenModal(`
    <div class="modal-head" style="justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:9px;">
        <span class="card-dot gold"></span>
        <h3>🔆 Trợ Lý OptiFine &amp; Bộ Chuẩn Đồ Họa Đa Nền Tảng</h3>
      </div>
      <button type="button" class="vtype-btn" data-pmclose>✕ Đóng</button>
    </div>
    <div class="modal-body bw-share-pack-body bw-of-modal-body">
      <div class="bw-of-target-box">
        <div class="bw-of-target-box-head">
          <span>🎯 <strong>Chỉ định đích cài đặt</strong> (Chọn tự do Thư mục / Modpack, Phiên bản MC &amp; Mod Loader):</span>
          <span class="bw-of-live-chip" id="ofLiveTargetChip">OPTIFINE • MC ${escapeHtml(initMc)}</span>
        </div>
        <div class="bw-of-target-grid">
          <label class="bw-of-field">
            <span>Nơi cài đặt</span>
            <select id="ofTargetDirSelect" class="bw-of-select">${targetDirOptionsHtml}</select>
          </label>
          <label class="bw-of-field">
            <span>Phiên bản Minecraft</span>
            <select id="ofTargetMcSelect" class="bw-of-select">${mcOptionsHtml}</select>
          </label>
          <label class="bw-of-field">
            <span>Nền tảng Mod Loader</span>
            <select id="ofTargetLoaderSelect" class="bw-of-select">
              <option value="optifine" ${initLoaderVal === 'optifine' ? 'selected' : ''}>🔆 Core OptiFine (Tự khớp Fabric/Forge)</option>
              <option value="fabric" ${initLoaderVal === 'fabric' ? 'selected' : ''}>🧵 Fabric (Siêu nhẹ • Khuyên dùng)</option>
              <option value="forge" ${initLoaderVal === 'forge' ? 'selected' : ''}>🔨 Forge (Mod truyền thống)</option>
              <option value="neoforge" ${initLoaderVal === 'neoforge' ? 'selected' : ''}>🦊 NeoForge (Hiện đại 1.20.1+)</option>
              <option value="quilt" ${initLoaderVal === 'quilt' ? 'selected' : ''}>🧩 Quilt (Mở rộng từ Fabric)</option>
            </select>
          </label>
        </div>
      </div>

      ${droppedJar?.filePath ? `
        <div class="bw-of-dropped-banner">
          <div class="bw-of-dropped-title">📥 Đã nhận diện tệp <code>${droppedName}</code> ${droppedJar.mcVersion ? `(dành cho <strong>MC ${escapeHtml(droppedJar.mcVersion)}</strong>)` : ''}</div>
          <div class="bw-of-dropped-desc">
            Chọn cách bạn muốn chạy tệp <code>OptiFine</code> này (hỗ trợ cả chạy độc lập kiểu Vanilla lẫn chạy chung Mod trên Core OptiFine / Forge):
          </div>
          <div class="bw-of-dropped-actions">
            <button type="button" class="btn-modal-agree" id="btnOfRunJavaInstaller" title="Tự chuẩn bị tệp nền MC và mở bộ cài chính chủ để tạo Profile OptiFine Độc Lập">☕ Cài Profile Độc Lập (Vanilla / Core OptiFine)</button>
            <button type="button" class="btn-sync-skin" id="btnOfAttachOptifineCore">🔆 Gắn vào Core OptiFine (${escapeHtml(droppedMc)})</button>
            <button type="button" class="vtype-btn" id="btnOfSwitchForgeJar">🔨 Chuyển sang Forge ${escapeHtml(droppedMc)} &amp; Bật</button>
          </div>
        </div>
      ` : ''}

      <div class="bw-of-section is-recommended">
        <div class="bw-of-sec-head-row">
          <div class="bw-of-sec-head">
            <span class="bw-of-badge">⭐ HỖ TRỢ FABRIC • FORGE • NEOFORGE • QUILT • OPTIFINE</span>
            <strong>🚀 Cài 1-Click "Bộ Chuẩn OptiFine Đời Mới" (Tích chọn tính năng tùy ý)</strong>
          </div>
          <div class="bw-of-zoom-bar">
            <select id="ofZoomModSelect" class="bw-of-select compact" title="Chọn Mod Zoom ống nhòm bạn thích">
              <option value="auto" selected>🔍 Mod Zoom: Tự động chuẩn nhất</option>
              <option value="zoomify">🔍 Zoomify (Cuộn mượt kiểu Lunar)</option>
              <option value="logical-zoom">🔍 Logical Zoom (Siêu nhẹ chuẩn Vanilla)</option>
              <option value="zume">🔍 Zume (Đa nền tảng Fabric/Forge/Neo)</option>
              <option value="wi-zoom">🔍 WI Zoom / Ok Zoomer (Phóng xa)</option>
            </select>
            <button type="button" class="vtype-btn" id="btnOfToggleAllFeats" style="padding:4px 9px;font-size:11px;">Bỏ chọn hết</button>
          </div>
        </div>
        <p class="bw-of-sec-desc" id="ofParityDynamicDesc">
          Tự động tải đúng bộ Mod tối ưu &amp; đồ họa tương thích cho <strong id="ofParityTargetInline">FABRIC • MC ${escapeHtml(initMc)}</strong> từ Modrinth mà <strong>không ép xung CPU/GPU</strong> — tích chọn những tính năng bạn muốn cài:
        </p>
        <div class="bw-of-feature-grid interactive" id="ofFeatureChecklist">
          <label class="bw-of-feat-check">
            <input type="checkbox" value="fps" checked />
            <div>
              <strong>⚡ Tăng FPS êm máy</strong>
              <span data-modhint="fps">Sodium + FerriteCore + EntityCulling</span>
            </div>
          </label>
          <label class="bw-of-feat-check">
            <input type="checkbox" value="shader" checked />
            <div>
              <strong>✨ Chạy mọi gói Shader</strong>
              <span data-modhint="shader">Iris Shaders / Oculus</span>
            </div>
          </label>
          <label class="bw-of-feat-check">
            <input type="checkbox" value="zoom" checked />
            <div>
              <strong>🔍 Phím Zoom ống nhòm</strong>
              <span data-modhint="zoom">Zoomify / Logical Zoom / Zume</span>
            </div>
          </label>
          <label class="bw-of-feat-check">
            <input type="checkbox" value="lights" checked />
            <div>
              <strong>🕯️ Đuốc cầm tay phát sáng</strong>
              <span data-modhint="lights">LambDynamicLights / RyoamicLights</span>
            </div>
          </label>
          <label class="bw-of-feat-check">
            <input type="checkbox" value="ctm" checked />
            <div>
              <strong>🪟 Kính &amp; Block nối liền</strong>
              <span data-modhint="ctm">Continuity / Fusion CTM</span>
            </div>
          </label>
          <label class="bw-of-feat-check">
            <input type="checkbox" value="entities" checked />
            <div>
              <strong>🐾 Fresh Animations &amp; Pack</strong>
              <span data-modhint="entities">EMF + ETF + Polytone / CIT</span>
            </div>
          </label>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:4px;">
          <span style="font-size:11.3px;color:var(--text-muted);">🛡️ Tự động cất gọn <code>OptiFine.jar</code> cũ (nếu trùng) để không bao giờ văng game.</span>
          <button type="button" class="btn-modal-agree" id="btnInstallOfParityNow">🔆 Cài 6/6 Tính Năng Đã Chọn</button>
        </div>
      </div>

      <div class="bw-of-section">
        <div class="bw-of-sec-head">
          <span class="bw-of-badge subtle">CHẠY ĐỘC LẬP (VANILLA / OPTIFINE) HOẶC CÙNG FORGE • MC 1.7.10 → MỚI NHẤT</span>
          <strong>📥 Dùng tệp <code>OptiFine_*.jar</code> gốc từ optifine.net (Hỗ trợ mọi phiên bản MC)</strong>
        </div>
        <p class="bw-of-sec-desc">
          Hỗ trợ đầy đủ từ <code>1.7.10</code>, <code>1.8.9</code>, <code>1.12.2</code> đến <code>1.20.x</code>, <code>1.21.x+</code>: bạn có thể cài làm <strong>Profile OptiFine Độc Lập</strong> (chạy trực tiếp như Vanilla không cần Mod Loader phụ — Launcher tự chuẩn bị sẵn tệp nền MC) hoặc gắn thẳng vào <code>mods/</code> của <strong>Core OptiFine / Forge</strong>. Chỉ cần tải tệp <code>.jar</code> từ trang chủ rồi chọn tệp hoặc kéo-thả vào cửa sổ BlockWay!
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;">
          <button type="button" class="vtype-btn" id="btnOpenOfficialOptifineSite">🌐 Mở trang tải optifine.net (Mọi phiên bản)</button>
          <button type="button" class="btn-sync-skin" id="btnPickLocalOptifineJar">📂 Chọn tệp OptiFine_*.jar trong máy</button>
        </div>
      </div>

      <div id="optifineHubStatusMsg" class="pack-modal-msg hidden" style="margin:0;"></div>
    </div>`, true);

  if (!card) return;
  const statusEl = card.querySelector('#optifineHubStatusMsg');
  const setStatus = (msg, isWarn = false) => {
    if (!statusEl) return;
    statusEl.classList.remove('hidden', 'warn');
    if (isWarn) statusEl.classList.add('warn');
    statusEl.innerHTML = msg;
  };

  const dirSel = card.querySelector('#ofTargetDirSelect');
  const mcSel = card.querySelector('#ofTargetMcSelect');
  const loaderSel = card.querySelector('#ofTargetLoaderSelect');
  const zoomSel = card.querySelector('#ofZoomModSelect');
  const toggleAllBtn = card.querySelector('#btnOfToggleAllFeats');
  const liveChip = card.querySelector('#ofLiveTargetChip');
  const inlineTargetEl = card.querySelector('#ofParityTargetInline');
  const btnParity = card.querySelector('#btnInstallOfParityNow');
  const featChecks = Array.from(card.querySelectorAll('#ofFeatureChecklist input[type="checkbox"]'));

  const getSelectedState = () => {
    const pickedDir = String(dirSel?.value || '').trim();
    const matchedPack = pickedDir ? packInstances.find((x) => x && x.dir === pickedDir) : null;
    const mcVer = matchedPack ? String(matchedPack.mcVersion || mcSel?.value || '1.21.4') : String(mcSel?.value || '1.21.4');
    const chosenCore = matchedPack
      ? String(matchedPack.loader || 'fabric').toLowerCase()
      : String(loaderSel?.value || 'optifine').toLowerCase();
    const underlyingLoader = chosenCore === 'optifine'
      ? (isMcPre114(mcVer) ? 'forge' : 'fabric')
      : (['fabric', 'forge', 'neoforge', 'quilt'].includes(chosenCore) ? chosenCore : 'fabric');
    const selectedFeatures = featChecks.filter((c) => c.checked).map((c) => c.value);
    const zoomMod = String(zoomSel?.value || 'auto');
    return {
      isPack: Boolean(matchedPack),
      pack: matchedPack,
      instanceDir: matchedPack ? matchedPack.dir : '',
      mcVer,
      chosenCore,
      underlyingLoader,
      selectedFeatures,
      zoomMod
    };
  };

  const syncModalDynamicUI = () => {
    const st = getSelectedState();
    if (mcSel) {
      if (st.isPack) {
        if (![...mcSel.options].some((o) => o.value === st.mcVer)) {
          const opt = document.createElement('option');
          opt.value = st.mcVer;
          opt.textContent = `Minecraft ${st.mcVer}`;
          mcSel.prepend(opt);
        }
        mcSel.value = st.mcVer;
        mcSel.disabled = true;
      } else {
        mcSel.disabled = false;
      }
    }
    if (loaderSel) {
      if (st.isPack) {
        if ([...loaderSel.options].some((o) => o.value === st.chosenCore)) loaderSel.value = st.chosenCore;
        loaderSel.disabled = true;
      } else {
        loaderSel.disabled = false;
      }
    }

    const coreBadgeText = st.chosenCore === 'optifine'
      ? `OPTIFINE (${st.underlyingLoader.toUpperCase()})`
      : st.chosenCore.toUpperCase();
    const destPrefix = st.isPack ? `📦 ${st.pack.name} • ` : '';
    if (liveChip) liveChip.textContent = `${destPrefix}${coreBadgeText} • MC ${st.mcVer}`;
    if (inlineTargetEl) inlineTargetEl.textContent = `${coreBadgeText} • MC ${st.mcVer}`;

    // Update per-loader mod hints so user sees exact mods for Fabric / Forge / NeoForge / Quilt
    const zoomHintMap = {
      auto: (st.underlyingLoader === 'forge' || st.underlyingLoader === 'neoforge') ? 'Zume / Zoomify / Just Zoom' : 'Zoomify / Logical Zoom / Zume',
      zoomify: 'Zoomify (Ưu tiên) / Zume',
      'logical-zoom': 'Logical Zoom (Ưu tiên) / Zoomify',
      zume: 'Zume (Ưu tiên) / Zoomify',
      'wi-zoom': 'WI Zoom / Ok Zoomer'
    };
    const hints = {
      fps: st.underlyingLoader === 'forge'
        ? 'Embeddium + FerriteCore + EntityCulling'
        : (st.underlyingLoader === 'neoforge' ? 'Sodium / Embeddium + FerriteCore' : 'Sodium + Sodium Extra + FerriteCore'),
      shader: st.underlyingLoader === 'forge'
        ? 'Oculus Shaders'
        : (st.underlyingLoader === 'neoforge' ? 'Iris / Oculus Shaders' : 'Iris Shaders'),
      zoom: zoomHintMap[st.zoomMod] || zoomHintMap.auto,
      lights: st.underlyingLoader === 'forge' ? 'RyoamicLights / DynamicLights' : 'LambDynamicLights / RyoamicLights',
      ctm: (st.underlyingLoader === 'forge' || st.underlyingLoader === 'neoforge') ? 'Fusion Connected Textures' : 'Continuity Connected Textures',
      entities: 'EMF + ETF + Polytone'
    };
    Object.entries(hints).forEach(([k, txt]) => {
      const el = card.querySelector(`[data-modhint="${k}"]`);
      if (el) el.textContent = txt;
    });

    if (toggleAllBtn) {
      toggleAllBtn.textContent = st.selectedFeatures.length === featChecks.length ? 'Bỏ chọn hết' : '✓ Chọn tất cả';
    }
    if (btnParity) {
      if (st.selectedFeatures.length === 0) {
        btnParity.disabled = true;
        btnParity.textContent = 'Hãy tích chọn ít nhất 1 tính năng';
      } else {
        btnParity.disabled = false;
        btnParity.textContent = `🔆 Cài ${st.selectedFeatures.length}/${featChecks.length} Tính Năng (${coreBadgeText} • ${st.mcVer})`;
      }
    }
  };

  dirSel?.addEventListener('change', syncModalDynamicUI);
  mcSel?.addEventListener('change', syncModalDynamicUI);
  loaderSel?.addEventListener('change', syncModalDynamicUI);
  zoomSel?.addEventListener('change', syncModalDynamicUI);
  featChecks.forEach((chk) => chk.addEventListener('change', syncModalDynamicUI));
  if (toggleAllBtn) {
    toggleAllBtn.onclick = () => {
      const allChecked = featChecks.every((c) => c.checked);
      featChecks.forEach((c) => { c.checked = !allChecked; });
      syncModalDynamicUI();
    };
  }
  syncModalDynamicUI();

  if (btnParity) {
    btnParity.onclick = async () => {
      const st = getSelectedState();
      if (!st.selectedFeatures.length) return;
      btnParity.disabled = true;
      btnParity.textContent = '⏳ Đang tải & đồng bộ các tính năng đã chọn...';
      try {
        state.modTargetInstanceDir = st.isPack ? st.instanceDir : '';
        if (typeof refreshModTargetSelector === 'function') await refreshModTargetSelector(true);

        if (!st.isPack && typeof window.selectMcVersionAndCore === 'function') {
          setStatus(`⚙️ Đang chuyển cấu hình sang <strong>${escapeHtml(st.chosenCore.toUpperCase())} • MC ${escapeHtml(st.mcVer)}</strong> và tải ${st.selectedFeatures.length} nhóm tính năng từ Modrinth...`);
          await window.selectMcVersionAndCore(st.mcVer, st.chosenCore);
        } else {
          setStatus(`⏳ Đang tải ${st.selectedFeatures.length} nhóm tính năng tương thích cho <strong>${escapeHtml(st.underlyingLoader.toUpperCase())} • MC ${escapeHtml(st.mcVer)}</strong>...`);
        }

        const res = await window.aetherAPI.installOptifineParity({
          gameDir: state.gameDir,
          instanceDir: st.isPack ? st.instanceDir : '',
          mcVersion: st.mcVer,
          loaderType: st.underlyingLoader,
          features: st.selectedFeatures,
          zoomMod: st.zoomMod
        });

        if (res?.ok) {
          await refreshLocalAddonsCount();
          if (st.isPack && typeof refreshPackInstances === 'function') refreshPackInstances();
          if (!document.getElementById('localAddonsWrap')?.classList.contains('hidden')) {
            await renderLocalAddonsManager();
          } else if (document.getElementById('tab-mods')?.classList.contains('active')) {
            loadModrinthStore(false);
          }
          const newCnt = (res.installed || []).length;
          const keptCnt = (res.alreadyPresent || []).length;
          const parkedNote = (res.parkedOptifine || []).length
            ? ` (đã tự động tắt ${res.parkedOptifine.join(', ')} để chống xung đột)`
            : '';
          packCloseModal();
          showAetherNotification(
            `🔆 Đã cài xong ${st.selectedFeatures.length} nhóm tính năng OptiFine cho ${st.chosenCore.toUpperCase()} ${st.mcVer} (${newCnt} mới, ${keptCnt} có sẵn)${parkedNote}!`,
            'success',
            6800
          );
        } else {
          setStatus(`⚠️ ${escapeHtml(res?.error || `Chưa tìm thấy bản tương thích trên Modrinth cho ${st.underlyingLoader.toUpperCase()} • MC ${st.mcVer}. Bạn có thể đổi sang Loader khác hoặc dùng tệp OptiFine_*.jar bên dưới!`)}`, true);
        }
      } catch (err) {
        setStatus(`⚠️ Lỗi cài Bộ Chuẩn OptiFine: ${escapeHtml(err.message)}`, true);
      } finally {
        syncModalDynamicUI();
      }
    };
  }

  const btnSite = card.querySelector('#btnOpenOfficialOptifineSite');
  if (btnSite) {
    btnSite.onclick = () => {
      const st = getSelectedState();
      window.aetherAPI.openExternal('https://optifine.net/downloads');
      setStatus(`🌐 Đã mở <strong>optifine.net/downloads</strong>. Bấm <em>Show all versions</em> để tìm đúng bản <strong>MC ${escapeHtml(st.mcVer)}</strong> (bấm <em>Mirror</em> để tải nhanh), rồi chọn tệp hoặc kéo-thả vào BlockWay!`);
    };
  }

  const btnPick = card.querySelector('#btnPickLocalOptifineJar');
  if (btnPick) {
    btnPick.onclick = async () => {
      const st = getSelectedState();
      const r = await window.aetherAPI.pickOptifineJar({
        gameDir: state.gameDir,
        instanceDir: st.isPack ? st.instanceDir : '',
        currentLoader: st.chosenCore || 'optifine',
        currentMcVersion: st.mcVer,
        action: st.isPack && st.underlyingLoader === 'forge' ? 'forge' : 'choice'
      });
      if (!r || r.canceled) return;
      if (!r.ok) {
        setStatus(`⚠️ ${escapeHtml(r.error || 'Tệp đã chọn không phải OptiFine hợp lệ.')}`, true);
        return;
      }
      if (r.kind === 'optifine-forge' || r.kind === 'optifine-core') {
        await refreshLocalAddonsCount();
        if (!document.getElementById('localAddonsWrap')?.classList.contains('hidden')) await renderLocalAddonsManager();
        const parkedMsg = (r.parkedMods || []).length ? ` • Đã tạm tắt ${r.parkedMods.length} Mod trùng render` : '';
        packCloseModal();
        showAetherNotification(`✅ Đã gắn ${r.fileName} vào mods/${parkedMsg}!`, 'success', 6500);
        return;
      }
      if (r.kind === 'optifine-choice') {
        packCloseModal();
        openOptifineHubModal(r);
      }
    };
  }

  const attachJarToCore = async (targetCoreMode) => {
    if (!droppedJar?.filePath) return;
    const targetMc = droppedJar.mcVersion || getSelectedState().mcVer;
    const r = await window.aetherAPI.handleOptifineJar({
      gameDir: state.gameDir,
      instanceDir: droppedJar.isInstance ? droppedJar.targetDir : '',
      filePath: droppedJar.filePath,
      currentLoader: targetCoreMode === 'optifine' ? 'optifine' : 'forge',
      currentMcVersion: targetMc,
      action: targetCoreMode === 'optifine' ? 'optifine-core' : 'forge'
    });
    if (r?.ok) {
      if (!droppedJar.isInstance && typeof window.selectMcVersionAndCore === 'function') {
        await window.selectMcVersionAndCore(targetMc, targetCoreMode === 'optifine' ? 'optifine' : 'forge');
      }
      await refreshLocalAddonsCount();
      if (!document.getElementById('localAddonsWrap')?.classList.contains('hidden')) await renderLocalAddonsManager();
      const parkedMsg = (r.parkedMods || []).length ? ` (đã tạm tắt ${r.parkedMods.join(', ')} để tránh xung đột)` : '';
      packCloseModal();
      showAetherNotification(
        `${targetCoreMode === 'optifine' ? '🔆 Đã gắn vào Core OptiFine' : '🔨 Đã chuyển sang Forge'} ${targetMc} & kích hoạt ${r.fileName}${parkedMsg}!`,
        'success',
        6500
      );
    } else {
      setStatus(`⚠️ ${escapeHtml(r?.error || 'Không thể gắn tệp OptiFine.jar.')}`, true);
    }
  };

  const btnAttachOfCore = card.querySelector('#btnOfAttachOptifineCore');
  if (btnAttachOfCore && droppedJar?.filePath) {
    btnAttachOfCore.onclick = async () => {
      btnAttachOfCore.disabled = true;
      try { await attachJarToCore('optifine'); } finally { btnAttachOfCore.disabled = false; }
    };
  }

  const btnSwitchForge = card.querySelector('#btnOfSwitchForgeJar');
  if (btnSwitchForge && droppedJar?.filePath) {
    btnSwitchForge.onclick = async () => {
      btnSwitchForge.disabled = true;
      try { await attachJarToCore('forge'); } finally { btnSwitchForge.disabled = false; }
    };
  }

  const btnJavaInstaller = card.querySelector('#btnOfRunJavaInstaller');
  if (btnJavaInstaller && droppedJar?.filePath) {
    btnJavaInstaller.onclick = async () => {
      const origTxt = btnJavaInstaller.textContent;
      btnJavaInstaller.disabled = true;
      btnJavaInstaller.textContent = '⏳ Đang chuẩn bị tệp nền MC & mở trình cài...';
      try {
        const r = await window.aetherAPI.handleOptifineJar({
          gameDir: state.gameDir,
          filePath: droppedJar.filePath,
          currentMcVersion: droppedMc,
          action: 'run-installer'
        });
        if (r?.ok) {
          if (!droppedJar.isInstance && typeof window.selectMcVersionAndCore === 'function') {
            try { await window.selectMcVersionAndCore(droppedMc, 'optifine'); } catch (_) {}
          }
          setStatus(`☕ Đã chuẩn bị sẵn tệp nền <strong>MC ${escapeHtml(droppedMc)}</strong>, chuyển sang Core <strong>OptiFine</strong> và mở bộ cài chính chủ! Chỉ cần bấm <strong>Install</strong> trong cửa sổ vừa hiện lên rồi nhấn CHƠI NGAY.`);
          showAetherNotification(`☕ Đã mở bộ cài OptiFine độc lập cho MC ${droppedMc}! Bấm Install là xong.`, 'info', 5500);
        } else {
          setStatus(`⚠️ ${escapeHtml(r?.error || 'Không mở được trình cài đặt Java.')}`, true);
        }
      } finally {
        btnJavaInstaller.disabled = false;
        btnJavaInstaller.textContent = origTxt;
      }
    };
  }
}
window.openOptifineHubModal = openOptifineHubModal;

// 4. Quản Lý Bản Sao Lưu Thế Giới (.zip) & Nhập Map Sinh Tồn
async function refreshWorldBackupsUI(toggleVisible = false) {
  const box = document.getElementById('worldBackupsBox');
  const listEl = document.getElementById('worldBackupsList');
  const countEl = document.getElementById('worldBackupsCount');
  if (toggleVisible && box) {
    box.classList.toggle('hidden');
  }
  const res = await window.aetherAPI.listWorldBackups(state.gameDir);
  const backups = res?.backups || res?.list || [];
  if (countEl) countEl.textContent = String(backups.length);
  if (!listEl) return;

  if (backups.length === 0) {
    listEl.innerHTML = `<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:12px;">Chưa có bản sao lưu thế giới nào. Khi bạn thoát Minecraft, BlockWay sẽ tự động sao lưu ngầm (hoặc bấm nút <strong>"💾 Sao lưu"</strong> trên bất kỳ thế giới nào bên dưới)!</div>`;
    return;
  }

  listEl.innerHTML = backups.map((b) => {
    const safeFile = escapeHtml(b.fileName);
    const safeWorld = escapeHtml(b.worldFolder || b.worldName || b.fileName);
    const dateStr = b.createdAt || '';
    const autoBadge = b.isAuto
      ? `<span style="font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:99px;margin-left:6px;background:var(--bw-ok-bg);color:var(--bw-ok-text);">🛡️ Tự động</span>`
      : '';
    const instBadge = b.instanceSlug
      ? `<span style="font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:99px;margin-left:5px;background:var(--bw-accent-soft);color:var(--accent);">📦 ${escapeHtml(b.instanceSlug)}</span>`
      : '';
    return `<div class="addon-row" style="padding:8px 12px;">
      <div>
        <strong style="font-size:12.5px;color:var(--text-main);">🌍 ${safeWorld}</strong>${autoBadge}${instBadge}
        <span style="font-size:11px;color:var(--text-muted);margin-left:8px;">🕒 ${escapeHtml(dateStr)} • 📦 ${escapeHtml(b.sizeMB)} MB (<code>${safeFile}</code>)</span>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn-install-mod" data-restorebackup="${safeFile}" style="padding:5px 10px;font-size:11.5px;">♻️ Khôi phục Map</button>
        <button class="vtype-btn" data-delbackup="${safeFile}" style="color:#ef4444;padding:5px 9px;font-size:11.5px;">🗑️ Xóa</button>
      </div>
    </div>`;
  }).join('');

  listEl.querySelectorAll('[data-restorebackup]').forEach((btn) => {
    btn.onclick = async () => {
      const fileName = btn.dataset.restorebackup;
      btn.disabled = true;
      btn.textContent = '⏳ Đang khôi phục...';
      const r = await window.aetherAPI.restoreWorldBackup(state.gameDir, fileName);
      btn.disabled = false;
      btn.textContent = '♻️ Khôi phục Map';
      if (r?.ok) {
        showAetherNotification(`♻️ Đã khôi phục thế giới "${r.restoredFolder || r.worldName}" thành công!`, 'success', 4500);
        await renderLocalWorlds();
      } else {
        showAetherNotification(`⚠️ Lỗi khôi phục: ${r?.error || 'Không thể giải nén'}`, 'error', 4500);
      }
    };
  });

  listEl.querySelectorAll('[data-delbackup]').forEach((btn) => {
    btn.onclick = async () => {
      await window.aetherAPI.deleteWorldBackup(state.gameDir, btn.dataset.delbackup);
      await refreshWorldBackupsUI(false);
    };
  });
}
window.refreshWorldBackupsUI = refreshWorldBackupsUI;

async function importWorldZipUI(customZipPath = '') {
  const btn = document.getElementById('btnImportWorldZip');
  const orig = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang nhập Map...'; }
  try {
    const r = await window.aetherAPI.importWorldZip(state.gameDir, customZipPath);
    if (r?.ok) {
      showAetherNotification(`📥 Đã nhập thế giới "${r.importedFolder || r.worldName}" vào .minecraft/saves thành công!`, 'success', 5000);
      await renderLocalWorlds();
    } else if (!r?.canceled) {
      showAetherNotification(`⚠️ Không thể nhập Map: ${r?.error || 'File .zip không hợp lệ'}`, 'error', 4500);
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig || '📥 Nhập Map (.zip)'; }
  }
}

// 5. Thư Viện Ảnh Chụp Trong Game (Screenshots Gallery & 1-Click Copy Zalo/Discord)
let activeScreenshotLightboxItem = null;

async function copyFramedScreenshotToClipboard(item) {
  if (!item || !item.fileUrl) return { ok: false, error: 'Không tìm thấy ảnh' };
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        const w = Math.max(640, img.naturalWidth || 1280);
        const h = Math.max(360, img.naturalHeight || 720);
        const barH = Math.max(46, Math.round(h * 0.068));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h + barH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        // Sleek bottom badge bar
        const grad = ctx.createLinearGradient(0, h, w, h + barH);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(0.55, '#1e1b4b');
        grad.addColorStop(1, '#0f172a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, h, w, barH);

        ctx.fillStyle = 'rgba(244, 114, 182, 0.75)';
        ctx.fillRect(0, h, w, 2);

        const padX = Math.round(barH * 0.42);
        const fontMain = Math.max(13, Math.round(barH * 0.36));
        const fontSub = Math.max(11, Math.round(barH * 0.30));
        const player = (document.getElementById('username')?.value || state.username || 'Player').trim();
        const mcVer = item.instanceName || state.selectedVersion || '1.21.4';
        const dateStr = item.dateLabel || (item.mtimeMs ? new Date(item.mtimeMs).toLocaleString('vi-VN') : new Date().toLocaleDateString('vi-VN'));

        ctx.textBaseline = 'middle';
        ctx.font = `600 ${fontMain}px "Inter", "Segoe UI", sans-serif`;
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(`⚡ BlockWay Launcher  •  MC ${mcVer}`, padX, h + barH / 2);

        const rightText = `👤 ${player}   •   📅 ${dateStr}`;
        ctx.font = `500 ${fontSub}px "Inter", "Segoe UI", sans-serif`;
        ctx.fillStyle = '#cbd5e1';
        const rightW = ctx.measureText(rightText).width;
        ctx.fillText(rightText, Math.max(padX + 260, w - padX - rightW), h + barH / 2);

        const dataUrl = canvas.toDataURL('image/png');
        const res = await window.aetherAPI.copyDataUrlToClipboard(dataUrl);
        resolve(res || { ok: false });
      } catch (err) {
        resolve({ ok: false, error: err.message });
      }
    };
    img.onerror = () => resolve({ ok: false, error: 'Không đọc được ảnh gốc' });
    img.src = item.fileUrl;
  });
}

async function openScreenshotsGalleryModal() {
  const modal = document.getElementById('screenshotsGalleryModal');
  const grid = document.getElementById('screenshotsGalleryGrid');
  const countBadge = document.getElementById('screenshotsCountBadge');
  const lightbox = document.getElementById('screenshotLightboxWrap') || document.getElementById('screenshotLightbox');
  if (!modal || !grid) return;

  modal.classList.remove('hidden');
  if (lightbox) lightbox.classList.add('hidden');
  grid.innerHTML = `<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-muted);">⏳ Đang tải thư viện ảnh chụp màn hình...</div>`;

  const listFn = window.aetherAPI.listLocalScreenshots || window.aetherAPI.listScreenshots;
  const res = await listFn(state.gameDir);
  const items = res?.items || res?.list || [];
  if (countBadge) countBadge.textContent = `${items.length} ảnh`;

  if (items.length === 0) {
    grid.innerHTML = `<div class="empty-subpage-state" style="grid-column:1/-1;">
      <div class="ess-icon">📸</div>
      <div class="ess-title">Chưa có ảnh chụp màn hình nào trong <code>.minecraft/screenshots</code></div>
      <div class="ess-desc">Khi đang chơi Minecraft, bạn chỉ cần bấm phím <strong>F2</strong> để chụp ảnh màn hình. Mọi bức ảnh sẽ hiện tại đây để bạn Copy dán thẳng vào Zalo / Discord hoặc đặt làm Hình nền Launcher!</div>
    </div>`;
    return;
  }

  grid.innerHTML = items.map((it, idx) => {
    const safeName = escapeHtml(it.name);
    const safeUrl = escapeHtml(it.fileUrl);
    const dateStr = it.dateLabel || (it.mtimeMs ? new Date(it.mtimeMs).toLocaleString('vi-VN') : '');
    return `<div class="screenshot-card" data-shotidx="${idx}">
      <div class="screenshot-thumb-wrap" data-viewshot="${idx}">
        <img src="${safeUrl}" alt="${safeName}" loading="lazy" class="screenshot-thumb-img" />
        <div class="screenshot-hover-overlay">🔍 Phóng to</div>
      </div>
      <div class="screenshot-card-meta">
        <div class="screenshot-name" title="${safeName}">${safeName}</div>
        <div class="screenshot-sub">${escapeHtml(dateStr)} • ${escapeHtml(it.sizeKB)} KB${it.instanceName ? ` • ${escapeHtml(it.instanceName)}` : ''}</div>
        <div class="screenshot-actions">
          <button class="btn-install-mod" data-copyshot="${idx}" title="Copy ảnh vào Clipboard để Ctrl+V dán thẳng vào Zalo, Discord, Messenger">📋 Copy</button>
          <button class="vtype-btn" data-copyframedshot="${idx}" title="Copy ảnh kèm khung thông tin (Phiên bản MC + Tên người chơi + Ngày chụp)">🏷️ Khung</button>
          <button class="vtype-btn" data-wallpapershot="${idx}" title="Đặt bức ảnh này làm hình nền trang chủ Launcher">🖼️ Nền</button>
          <button class="vtype-btn" data-delshot="${idx}" style="color:#ef4444;" title="Xóa ảnh này">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');

  let lightboxIdx = -1;
  const showLightbox = (item) => {
    activeScreenshotLightboxItem = item;
    lightboxIdx = items.indexOf(item);
    if (!lightbox) return;
    const imgEl = document.getElementById('screenshotLightboxImg');
    const nameEl = document.getElementById('screenshotLightboxName');
    if (imgEl) imgEl.src = item.fileUrl;
    const where = item.instanceName ? ` • ${item.instanceName}` : '';
    if (nameEl) nameEl.textContent = `${item.name} (${item.sizeKB} KB)${where} — ${lightboxIdx + 1}/${items.length} • ←/→ chuyển ảnh, Esc thu nhỏ`;
    lightbox.classList.remove('hidden');
    try { lightbox.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
  };
  window.__bwShotLightboxStep = (dir) => {
    if (!items.length) return;
    const next = ((lightboxIdx < 0 ? 0 : lightboxIdx) + dir + items.length) % items.length;
    showLightbox(items[next]);
  };

  grid.querySelectorAll('[data-viewshot]').forEach((el) => {
    el.onclick = () => {
      const it = items[Number(el.dataset.viewshot)];
      if (it) showLightbox(it);
    };
  });

  grid.querySelectorAll('[data-copyshot]').forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const it = items[Number(btn.dataset.copyshot)];
      if (!it) return;
      const r = await window.aetherAPI.copyScreenshotToClipboard(it.fullPath || it.path);
      if (r?.ok) {
        const orig = btn.textContent;
        btn.textContent = '✓ Đã Copy!';
        showAetherNotification(`📋 Đã copy ảnh "${it.name}" vào bộ nhớ tạm! Bạn có thể bấm Ctrl+V để dán ngay vào Zalo / Discord / Facebook.`, 'success', 4500);
        setTimeout(() => { btn.textContent = orig; }, 1600);
      }
    };
  });

  grid.querySelectorAll('[data-copyframedshot]').forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const it = items[Number(btn.dataset.copyframedshot)];
      if (!it) return;
      const orig = btn.textContent;
      btn.textContent = '⏳...';
      const r = await copyFramedScreenshotToClipboard(it);
      if (r?.ok) {
        btn.textContent = '✓ Đã Copy!';
        showAetherNotification(`🏷️ Đã copy ảnh "${it.name}" kèm khung thông tin (Phiên bản + Người chơi + Ngày chụp)! Bấm Ctrl+V để dán ngay vào Zalo / Discord.`, 'success', 4800);
        setTimeout(() => { btn.textContent = orig; }, 1600);
      } else {
        btn.textContent = orig;
        showAetherNotification(`⚠️ Không thể tạo khung ảnh: ${r?.error || 'Lỗi'}`, 'error', 3500);
      }
    };
  });

  grid.querySelectorAll('[data-wallpapershot]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const it = items[Number(btn.dataset.wallpapershot)];
      if (!it) return;
      if (typeof window.applyHeroWallpaper === 'function') window.applyHeroWallpaper(it.fileUrl, `📸 ${it.name}`);
      showAetherNotification(`🖼️ Đã đặt ảnh chụp "${it.name}" làm hình nền trang chủ Launcher! (Muốn về nền gốc: bấm "🔄 Nền mặc định")`, 'success', 4500);
    };
  });

  grid.querySelectorAll('[data-delshot]').forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const it = items[Number(btn.dataset.delshot)];
      if (!it) return;
      const delFn = window.aetherAPI.deleteLocalScreenshot || window.aetherAPI.deleteScreenshot;
      await delFn(state.gameDir, it.fullPath || it.name);
      openScreenshotsGalleryModal();
    };
  });
}
window.openScreenshotsGalleryModal = openScreenshotsGalleryModal;

function initV402FeaturesUI() {
  const crashModal = document.getElementById('crashDoctorModal');
  const shotsModal = document.getElementById('screenshotsGalleryModal');

  // Crash Doctor trigger buttons
  ['btnModsCrashDoctor', 'btnOpenCrashDoctor', 'btnConsoleCrashDoctor'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.onclick = () => openCrashDoctorModal(null, true);
  });

  // Crash Doctor close & footer buttons (matching exact IDs in index.html)
  ['btnCrashDoctorCloseTop', 'btnCrashDoctorClose', 'btnCloseCrashDoctor'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.onclick = () => crashModal?.classList.add('hidden');
  });
  if (crashModal) {
    crashModal.addEventListener('click', (e) => {
      if (e.target === crashModal) crashModal.classList.add('hidden');
    });
  }

  const btnCrashOpenMods = document.getElementById('btnCrashOpenModsDir');
  if (btnCrashOpenMods) {
    btnCrashOpenMods.onclick = () => {
      if (activeCrashDoctorTarget?.isPack && activeCrashDoctorTarget.dir) {
        window.aetherAPI.packsInstanceOpen({ gameDir: state.gameDir, dir: activeCrashDoctorTarget.dir, sub: 'mods' });
      } else {
        window.aetherAPI.openSubFolder(state.gameDir, 'mods');
      }
    };
  }

  // v40.8: upload the log to mclo.gs (redacted) and copy a share link
  const btnCrashShare = document.getElementById('btnCrashShareLog');
  if (btnCrashShare && window.aetherAPI.shareCrashLog) {
    btnCrashShare.onclick = async () => {
      const orig = btnCrashShare.textContent;
      btnCrashShare.disabled = true;
      btnCrashShare.textContent = '⏳ Đang tải log lên...';
      const consoleText = Array.from(document.querySelectorAll('#consoleOutput .log-line, #consoleOutput .log-entry')).slice(-400).map((el) => el.textContent || '').join('\n');
      const r = await window.aetherAPI.shareCrashLog({ gameDir: activeCrashDoctorTarget?.dir || state.gameDir, fallbackText: consoleText });
      btnCrashShare.disabled = false;
      btnCrashShare.textContent = orig;
      if (r?.ok && r.url) {
        showAetherNotification(`📤 Đã tạo link log: ${r.url} — link đã được copy, dán (Ctrl+V) vào Discord/Zalo để nhờ hỗ trợ!`, 'success', 7000);
        const st = document.getElementById('crashDoctorStatusMsg');
        if (st) {
          st.classList.remove('hidden');
          st.className = 'coop-room-status is-ok';
          st.innerHTML = `📤 Link chia sẻ nhật ký (đã che tên máy, IP &amp; mã đăng nhập): <a href="#" id="lnkCrashShared">${escapeHtml(r.url)}</a>`;
          const a = document.getElementById('lnkCrashShared');
          if (a) a.onclick = (ev) => { ev.preventDefault(); window.aetherAPI.openExternal(r.url); };
        }
      } else {
        showAetherNotification(`⚠️ Không tạo được link log: ${r?.error || 'Lỗi mạng'}`, 'error', 5000);
      }
    };
  }

  const btnCrashRelaunch = document.getElementById('btnCrashRelaunchNow');
  if (btnCrashRelaunch) {
    btnCrashRelaunch.onclick = () => {
      crashModal?.classList.add('hidden');
      if (activeCrashDoctorTarget?.isPack && activeCrashDoctorTarget.inst && !state.isLaunching) {
        launchPackInstance(activeCrashDoctorTarget.inst);
        return;
      }
      const playBtn = document.getElementById('btnLaunch');
      if (playBtn && !state.isLaunching) playBtn.click();
    };
  }

  // Sync All Mods buttons
  ['btnSyncAllModsToVer', 'btnToolsSyncMods'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.onclick = () => runSyncAllModsUI();
  });

  // Mod Basket Export/Import, .mrpack Share Pack 2.0 & OptiFine Hub buttons
  ['btnExportMrpack', 'btnModsSharePack'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.onclick = () => exportMrpackUI(null);
  });
  ['btnHomeOptifineHub', 'btnModsOptifineHub', 'btnToolsOptifineHub'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.onclick = () => openOptifineHubModal(null);
  });
  ['btnExportModBasket', 'btnCoopExportBasket'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.onclick = () => exportModBasketUI();
  });
  ['btnImportModBasket', 'btnCoopImportBasket'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.onclick = () => importModBasketUI();
  });

  // World Backups & Import Zip buttons
  const btnImportZip = document.getElementById('btnImportWorldZip');
  if (btnImportZip) btnImportZip.onclick = () => importWorldZipUI('');
  const btnToggleBackups = document.getElementById('btnToggleWorldBackups');
  if (btnToggleBackups) btnToggleBackups.onclick = () => refreshWorldBackupsUI(true);
  const btnCloseBackups = document.getElementById('btnCloseWorldBackupsBox');
  if (btnCloseBackups) btnCloseBackups.onclick = () => document.getElementById('worldBackupsBox')?.classList.add('hidden');

  // Drag & Drop .zip world onto #worldsDropZoneCard
  const worldsDropCard = document.getElementById('worldsDropZoneCard');
  if (worldsDropCard) {
    worldsDropCard.addEventListener('dragover', (e) => {
      e.preventDefault();
      worldsDropCard.style.borderColor = 'var(--accent)';
    });
    worldsDropCard.addEventListener('dragleave', () => {
      worldsDropCard.style.borderColor = '';
    });
    worldsDropCard.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.__bwHandled = true;
      worldsDropCard.style.borderColor = '';
      const files = Array.from(e.dataTransfer?.files || []);
      const getP = (f) => (window.aetherAPI.getPathForFile ? window.aetherAPI.getPathForFile(f) : f.path) || '';
      const zipFile = files.find((f) => f.name.toLowerCase().endsWith('.zip') && getP(f));
      if (zipFile) {
        await importWorldZipUI(getP(zipFile));
      }
    });
  }

  // Screenshots Gallery buttons (matching exact IDs in index.html)
  ['btnToolsOpenScreenshots'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.onclick = () => openScreenshotsGalleryModal();
  });
  ['btnGalleryCloseTop', 'btnCloseScreenshotsModal'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.onclick = () => shotsModal?.classList.add('hidden');
  });
  if (shotsModal) {
    shotsModal.addEventListener('click', (e) => {
      if (e.target === shotsModal) shotsModal.classList.add('hidden');
    });
  }
  const btnGalleryRefresh = document.getElementById('btnGalleryRefresh');
  if (btnGalleryRefresh) btnGalleryRefresh.onclick = () => openScreenshotsGalleryModal();
  ['btnGalleryOpenExplorer', 'btnScreenshotsOpenFolder'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.onclick = () => window.aetherAPI.openSubFolder(state.gameDir, 'screenshots');
  });

  // Lightbox actions inside Screenshots Modal
  const btnLightboxClose = document.getElementById('btnLightboxClose');
  if (btnLightboxClose) {
    btnLightboxClose.onclick = () => {
      document.getElementById('screenshotLightboxWrap')?.classList.add('hidden');
      document.getElementById('screenshotLightbox')?.classList.add('hidden');
    };
  }
  ['btnLightboxCopy', 'btnLightboxCopyImg'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.onclick = async () => {
        if (!activeScreenshotLightboxItem) return;
        const r = await window.aetherAPI.copyScreenshotToClipboard(activeScreenshotLightboxItem.fullPath || activeScreenshotLightboxItem.path);
        if (r?.ok) {
          showAetherNotification(`📋 Đã copy ảnh "${activeScreenshotLightboxItem.name}" vào Clipboard (Ctrl+V để dán vào Zalo/Discord)!`, 'success', 4500);
        }
      };
    }
  });
  const btnLightboxCopyFramed = document.getElementById('btnLightboxCopyFramed');
  if (btnLightboxCopyFramed) {
    btnLightboxCopyFramed.onclick = async () => {
      if (!activeScreenshotLightboxItem) return;
      const orig = btnLightboxCopyFramed.textContent;
      btnLightboxCopyFramed.textContent = '⏳ Đang tạo khung...';
      const r = await copyFramedScreenshotToClipboard(activeScreenshotLightboxItem);
      btnLightboxCopyFramed.textContent = orig;
      if (r?.ok) {
        showAetherNotification(`🏷️ Đã copy ảnh "${activeScreenshotLightboxItem.name}" kèm khung thông tin (Ctrl+V để dán vào Zalo/Discord)!`, 'success', 4800);
      } else {
        showAetherNotification(`⚠️ Không thể copy kèm khung: ${r?.error || 'Lỗi'}`, 'error', 3500);
      }
    };
  }
  ['btnLightboxSetBanner', 'btnLightboxSetWallpaper'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.onclick = () => {
        if (!activeScreenshotLightboxItem) return;
        if (typeof window.applyHeroWallpaper === 'function') window.applyHeroWallpaper(activeScreenshotLightboxItem.fileUrl, `📸 ${activeScreenshotLightboxItem.name}`);
        showAetherNotification(`🖼️ Đã đặt "${activeScreenshotLightboxItem.name}" làm hình nền trang chủ!`, 'success', 4000);
      };
    }
  });

  // v40.8: reset home banner to the default BlockWay wallpaper
  const btnGalleryResetWp = document.getElementById('btnGalleryResetWallpaper');
  if (btnGalleryResetWp) {
    btnGalleryResetWp.onclick = () => {
      if (typeof window.applyHeroWallpaper === 'function') window.applyHeroWallpaper('app-banner-hero.png', 'BlockWay');
      showAetherNotification('🔄 Đã đưa hình nền trang chủ về mặc định BlockWay.', 'success', 3000);
    };
  }

  // v40.8: lightbox keyboard — ←/→ browse, Esc closes the big preview first (then the gallery)
  document.addEventListener('keydown', (e) => {
    const wrap = document.getElementById('screenshotLightboxWrap');
    const galleryOpen = shotsModal && !shotsModal.classList.contains('hidden');
    const lbOpen = wrap && !wrap.classList.contains('hidden');
    if (!galleryOpen || !lbOpen) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (typeof window.__bwShotLightboxStep === 'function') window.__bwShotLightboxStep(e.key === 'ArrowRight' ? 1 : -1);
    } else if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      wrap.classList.add('hidden');
    }
  }, true);

  // Escape key closes Crash Doctor or Screenshots Gallery modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      crashModal?.classList.add('hidden');
      shotsModal?.classList.add('hidden');
    }
  });

  // Quick 1-Click SkyBlock & OneBlock buttons in Worlds tab
  const btnWSky = document.getElementById('btnWorldsQuickSkyBlock');
  if (btnWSky) btnWSky.onclick = () => runQuickIslandInstall('skyblock');
  const btnWOne = document.getElementById('btnWorldsQuickOneBlock');
  if (btnWOne) btnWOne.onclick = () => runQuickIslandInstall('oneblock');

  // v40.3 PRO: Per-Instance Mod Target Selector in #tab-mods
  const modTargetSel = document.getElementById('modTargetInstanceSelect');
  if (modTargetSel) {
    modTargetSel.onchange = async () => {
      state.modTargetInstanceDir = modTargetSel.value || '';
      await refreshModTargetSelector(true);
      await refreshLocalAddonsCount();
      loadModrinthStore(false);
    };
  }
  const btnModPlayPack = document.getElementById('btnModTargetPlayPack');
  if (btnModPlayPack) {
    btnModPlayPack.onclick = () => {
      const t = getModStoreTarget();
      if (t.isPack && t.inst && typeof launchPackInstance === 'function') {
        if (typeof window.switchMainTab === 'function') window.switchMainTab('home');
        launchPackInstance(t.inst);
      }
    };
  }
}

/* ============================================================================
   v40.6.0 PRO — 5 NÂNG CẤP SIÊU XỊN (UI CONTROLLERS)
   1) Trình Gỡ Trùng Phím Tắt Modpack & Tinh Chỉnh Cấu Hình Ngoài Game
   2) Quản Lý Cập Nhật Mod / Shader / Resource Pack 1-Click & Hoàn Tác Bản Cũ
   3) Kho Bản Đồ Xây Sẵn & Datapack 1-Click + Quản Lý Datapack Theo Map
   4) Combo Chơi Chung Nâng Cao: Đàm Thoại Voice Chat & Tổ Đội Sinh Tồn
   5) Cố Vấn RAM Tự Động & Chống Giật Khựng (Generational ZGC / Tuned G1GC)
   ============================================================================ */

function domEventToMcKeyCode(e) {
  if (!e) return '';
  if (e.type === 'mousedown') {
    if (e.button === 3) return 'key.mouse.4';
    if (e.button === 4) return 'key.mouse.5';
    if (e.button === 2) return 'key.mouse.right';
    if (e.button === 1) return 'key.mouse.middle';
    return '';
  }
  const code = String(e.code || '');
  if (code === 'Escape' || code === 'Delete' || code === 'Backspace') return 'key.keyboard.unknown';
  if (/^Key([A-Z])$/.test(code)) return `key.keyboard.${RegExp.$1.toLowerCase()}`;
  if (/^Digit([0-9])$/.test(code)) return `key.keyboard.${RegExp.$1}`;
  if (/^F([1-9]|1[0-2])$/.test(code)) return `key.keyboard.f${RegExp.$1}`;
  if (/^Numpad([0-9])$/.test(code)) return `key.keyboard.kp.${RegExp.$1}`;
  const map = {
    Space: 'key.keyboard.space',
    ShiftLeft: 'key.keyboard.left.shift',
    ShiftRight: 'key.keyboard.right.shift',
    ControlLeft: 'key.keyboard.left.control',
    ControlRight: 'key.keyboard.right.control',
    AltLeft: 'key.keyboard.left.alt',
    AltRight: 'key.keyboard.right.alt',
    Tab: 'key.keyboard.tab',
    CapsLock: 'key.keyboard.caps.lock',
    Backquote: 'key.keyboard.grave.accent',
    BracketLeft: 'key.keyboard.left.bracket',
    BracketRight: 'key.keyboard.right.bracket',
    Backslash: 'key.keyboard.backslash',
    Semicolon: 'key.keyboard.semicolon',
    Quote: 'key.keyboard.apostrophe',
    Comma: 'key.keyboard.comma',
    Period: 'key.keyboard.period',
    Slash: 'key.keyboard.slash',
    Minus: 'key.keyboard.minus',
    Equal: 'key.keyboard.equal',
    Insert: 'key.keyboard.insert',
    Home: 'key.keyboard.home',
    End: 'key.keyboard.end',
    PageUp: 'key.keyboard.page.up',
    PageDown: 'key.keyboard.page.down',
    Enter: 'key.keyboard.enter'
  };
  return map[code] || '';
}

function formatMcKeyCodeShortVi(rawCode) {
  const c = String(rawCode || '').trim();
  if (!c || c === 'key.keyboard.unknown' || c === '0') return 'Chưa gán';
  if (c.startsWith('key.keyboard.kp.')) return `Numpad ${c.slice(16).toUpperCase()}`;
  if (c.startsWith('key.keyboard.')) {
    const rest = c.slice(13);
    if (/^[a-z0-9]$/i.test(rest)) return `Phím ${rest.toUpperCase()}`;
    if (/^f\d+$/i.test(rest)) return rest.toUpperCase();
    const m = {
      'space': 'Phím Cách',
      'left.shift': 'Shift Trái',
      'right.shift': 'Shift Phải',
      'left.control': 'Ctrl Trái',
      'right.control': 'Ctrl Phải',
      'left.alt': 'Alt Trái',
      'right.alt': 'Alt Phải',
      'grave.accent': 'Phím ` (~)',
      'left.bracket': 'Phím [',
      'right.bracket': 'Phím ]',
      'backslash': 'Phím \\',
      'semicolon': 'Phím ;',
      'apostrophe': 'Phím \'',
      'comma': 'Phím ,',
      'period': 'Phím .',
      'slash': 'Phím /',
      'minus': 'Phím -',
      'equal': 'Phím ='
    };
    return m[rest] || `Phím ${rest.replace(/\./g, ' ').toUpperCase()}`;
  }
  if (c === 'key.mouse.left') return 'Chuột Trái';
  if (c === 'key.mouse.right') return 'Chuột Phải';
  if (c === 'key.mouse.middle') return 'Chuột Giữa';
  if (c === 'key.mouse.4') return 'Chuột Phụ 4';
  if (c === 'key.mouse.5') return 'Chuột Phụ 5';
  return c;
}

let activeKeyCaptureCleanup = null;

async function refreshToolsKeyConflictBadge() {
  if (typeof window.aetherAPI?.readGameTweaker !== 'function') return;
  try {
    const res = await window.aetherAPI.readGameTweaker({ gameDir: state.gameDir });
    if (!res?.ok) return;
    const badge = document.getElementById('toolsKeyConflictBadge');
    if (badge) {
      badge.textContent = res.conflictsCount > 0
        ? `⚠️ ${res.conflictsCount} cụm phím đang trùng`
        : `✓ ${res.totalKeybinds || 0} phím không trùng`;
    }
    const btnFb = document.getElementById('btnToolsQuickFullbright');
    if (btnFb) {
      const fbOn = Boolean(res.settings?.fullbright);
      btnFb.classList.toggle('is-ok', fbOn);
      btnFb.textContent = fbOn
        ? '💡 Sáng Hang Động (Fullbright): ĐANG BẬT'
        : '💡 Bật / Tắt Sáng Hang Động (Fullbright 1-Click)';
    }
  } catch (_) {}
}
window.refreshToolsKeyConflictBadge = refreshToolsKeyConflictBadge;

async function openGameTweakerModal(initialInstanceDir = null) {
  if (typeof window.aetherAPI?.readGameTweaker !== 'function') return;
  if (activeKeyCaptureCleanup) {
    try { activeKeyCaptureCleanup(); } catch (_) {}
    activeKeyCaptureCleanup = null;
  }
  if (!packHub.instances?.length && typeof window.aetherAPI?.packsInstances === 'function') {
    try {
      const rInst = await window.aetherAPI.packsInstances(state.gameDir);
      packHub.instances = rInst?.instances || [];
    } catch (_) {}
  }

  const defaultTarget = initialInstanceDir !== null
    ? String(initialInstanceDir || '')
    : (typeof getModStoreTarget === 'function' && getModStoreTarget().isPack ? getModStoreTarget().dir : '');

  let currentInstanceDir = defaultTarget;
  let filterConflictsOnly = false;
  let searchQuery = '';
  let pendingKeyChanges = {};
  let tweakerData = null;

  const card = packOpenModal(`
    <div class="modal-head" style="justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;align-items:center;gap:9px;">
        <span class="card-dot emerald"></span>
        <h3>🎛️ Tinh Chỉnh Cấu Hình Ngoài Game &amp; Gỡ Trùng Phím Tắt Modpack</h3>
      </div>
      <button class="vtype-btn" data-pmclose>✕ Đóng</button>
    </div>
    <div class="modal-body" id="tweakerModalBody" style="display:flex;flex-direction:column;gap:12px;">
      <div class="pack-modal-loading">⏳ Đang đọc cấu hình options.txt &amp; quét xung đột phím tắt...</div>
    </div>
    <div class="modal-foot" style="justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <button class="btn-modal-cancel" data-pmclose>Đóng</button>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn-sync-skin" id="btnTweakerOpenOptsFile">📄 Mở options.txt</button>
        <button class="btn-modal-agree" id="btnTweakerSaveAll">💾 Lưu Cấu Hình &amp; Phím Tắt</button>
      </div>
    </div>`, true);
  if (!card) return;

  const bodyEl = card.querySelector('#tweakerModalBody');

  const getActiveTargetMeta = () => {
    if (!currentInstanceDir) {
      return { instanceDir: '', mcVersion: state.selectedVersion || '1.21.4', label: '🏠 Thư mục chính (.minecraft)' };
    }
    const found = (packHub.instances || []).find((x) => x.dir === currentInstanceDir);
    return {
      instanceDir: currentInstanceDir,
      mcVersion: found?.mcVersion || state.selectedVersion || '1.21.4',
      label: found ? `📦 ${found.name} (MC ${found.mcVersion})` : `📦 ${currentInstanceDir}`
    };
  };

  const renderKeybindRows = () => {
    const listWrap = bodyEl.querySelector('#tweakerKeyListWrap');
    if (!listWrap || !tweakerData) return;

    const effectiveKeyMap = new Map();
    const enriched = (tweakerData.keybinds || []).map((kb) => {
      const code = pendingKeyChanges[kb.rawOptionKey] !== undefined ? pendingKeyChanges[kb.rawOptionKey] : kb.keyCode;
      const isUnbound = !code || code === 'key.keyboard.unknown' || code === '0';
      if (!isUnbound) {
        const norm = code.toLowerCase();
        effectiveKeyMap.set(norm, (effectiveKeyMap.get(norm) || 0) + 1);
      }
      return {
        ...kb,
        effectiveCode: code,
        effectiveLabel: pendingKeyChanges[kb.rawOptionKey] !== undefined ? formatMcKeyCodeShortVi(code) : kb.keyLabel,
        isUnbound
      };
    });

    const filtered = enriched.filter((kb) => {
      const collides = !kb.isUnbound && (effectiveKeyMap.get(kb.effectiveCode.toLowerCase()) || 0) > 1;
      if (filterConflictsOnly && !collides) return false;
      if (searchQuery) {
        const hay = `${kb.label} ${kb.actionId} ${kb.effectiveLabel}`.toLowerCase();
        if (!hay.includes(searchQuery)) return false;
      }
      return true;
    });

    if (!filtered.length) {
      listWrap.innerHTML = `<div class="tweaker-empty-keys">${
        tweakerData.totalKeybinds === 0
          ? 'ℹ️ Thư mục này chưa có phím tắt nào trong <code>options.txt</code> (hãy mở game 1 lần để các Mod ghi danh sách phím, sau đó quay lại đây bấm 1-Click gỡ trùng!). Bạn vẫn chỉnh sẵn được toàn bộ Cấu hình Đồ họa &amp; Sáng hang động bên trên!'
          : filterConflictsOnly
            ? '🎉 Tuyệt vời! Không có phím tắt nào bị trùng chức năng!'
            : '🔍 Không tìm thấy phím tắt nào khớp từ khóa.'
      }</div>`;
      return;
    }

    const choices = tweakerData.availableKeyChoices || [];
    listWrap.innerHTML = filtered.slice(0, 140).map((kb) => {
      const collides = !kb.isUnbound && (effectiveKeyMap.get(kb.effectiveCode.toLowerCase()) || 0) > 1;
      const hasCurrentInChoices = choices.some((c) => c.code === kb.effectiveCode);
      const selectOpts = [
        ...(hasCurrentInChoices ? [] : [{ code: kb.effectiveCode, label: kb.effectiveLabel }]),
        ...choices
      ].map((opt) => `<option value="${escapeHtml(opt.code)}" ${opt.code === kb.effectiveCode ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('');

      return `<div class="tweaker-key-row ${collides ? 'is-conflict' : ''}">
        <div class="tkr-info">
          <strong>${escapeHtml(kb.label)}</strong>
          <span><code>${escapeHtml(kb.actionId)}</code>${collides ? ' • <b class="tkr-warn">⚠️ Đang trùng phím!</b>' : ''}</span>
        </div>
        <div class="tkr-controls">
          <select class="pro-select tkr-select" data-kbselect="${escapeHtml(kb.rawOptionKey)}">${selectOpts}</select>
          <button type="button" class="vtype-btn tkr-cap-btn" data-kbcapture="${escapeHtml(kb.rawOptionKey)}" title="Bấm nút này rồi nhấn phím bất kỳ trên bàn phím (nhấn Esc để bỏ gán)">⌨️ Bấm phím</button>
        </div>
      </div>`;
    }).join('');

    listWrap.querySelectorAll('[data-kbselect]').forEach((sel) => {
      sel.onchange = () => {
        pendingKeyChanges[sel.dataset.kbselect] = sel.value;
        renderKeybindRows();
      };
    });

    listWrap.querySelectorAll('[data-kbcapture]').forEach((btn) => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        if (activeKeyCaptureCleanup) {
          try { activeKeyCaptureCleanup(); } catch (_) {}
          activeKeyCaptureCleanup = null;
        }
        const optKey = btn.dataset.kbcapture;
        btn.classList.add('active');
        btn.textContent = '👉 Nhấn 1 phím...';

        const finish = (mcCode) => {
          window.removeEventListener('keydown', onKey, true);
          window.removeEventListener('mousedown', onMouse, true);
          activeKeyCaptureCleanup = null;
          if (mcCode) {
            pendingKeyChanges[optKey] = mcCode;
          }
          renderKeybindRows();
        };
        const onKey = (ke) => {
          ke.preventDefault();
          ke.stopPropagation();
          const mapped = domEventToMcKeyCode(ke);
          if (mapped) finish(mapped);
        };
        const onMouse = (me) => {
          if (me.target === btn) return;
          const mapped = domEventToMcKeyCode(me);
          if (mapped && (me.button === 3 || me.button === 4 || me.button === 1)) {
            me.preventDefault();
            me.stopPropagation();
            finish(mapped);
          } else {
            finish('');
          }
        };
        activeKeyCaptureCleanup = () => {
          window.removeEventListener('keydown', onKey, true);
          window.removeEventListener('mousedown', onMouse, true);
        };
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('mousedown', onMouse, true);
      };
    });
  };

  const loadAndRenderTweaker = async (statusNotice = '') => {
    const meta = getActiveTargetMeta();
    pendingKeyChanges = {};
    tweakerData = await window.aetherAPI.readGameTweaker({
      gameDir: state.gameDir,
      instanceDir: meta.instanceDir
    });
    if (!tweakerData?.ok) {
      bodyEl.innerHTML = `<div class="pack-modal-msg warn">⚠️ Không đọc được cấu hình: ${escapeHtml(tweakerData?.error || 'Lỗi không xác định')}</div>`;
      return;
    }
    const s = tweakerData.settings || {};
    const instOptions = [
      `<option value="" ${!currentInstanceDir ? 'selected' : ''}>🏠 Thư mục chính (.minecraft — MC ${escapeHtml(state.selectedVersion || '1.21.4')})</option>`,
      ...(packHub.instances || []).map((inst) => `<option value="${escapeHtml(inst.dir)}" ${currentInstanceDir === inst.dir ? 'selected' : ''}>📦 ${escapeHtml(inst.name)} (MC ${escapeHtml(inst.mcVersion || '?')} • ${escapeHtml(String(inst.loader || '').toUpperCase())})</option>`)
    ].join('');

    const conflictsCount = Number(tweakerData.conflictsCount) || 0;
    const conflictSummaryHtml = conflictsCount > 0
      ? `<div class="tweaker-conflict-banner warn">
          <div>
            <strong>⚠️ Phát hiện ${conflictsCount} phím đang bị trùng nhiều chức năng cùng lúc!</strong>
            <span>Ví dụ: ${tweakerData.conflicts.slice(0, 2).map((c) => `<b>${escapeHtml(c.keyLabel)}</b> (${c.count} lệnh)`).join(', ')}. Bấm nút bên phải để tự động dời các phím phụ sang phím trống, giữ nguyên 100% cụm di chuyển <code>WASD</code>!</span>
          </div>
          <button type="button" class="btn-fps-boost-1click" id="btnTweakerAutoResolve">🪄 Tự Động Gỡ Trùng Tất Cả Phím (1-Click)</button>
        </div>`
      : `<div class="tweaker-conflict-banner ok">
          <div>
            <strong>✅ Không phát hiện xung đột phím tắt (${tweakerData.totalKeybinds || 0} phím đã kiểm tra)</strong>
            <span>Mọi chức năng trong <code>options.txt</code> đều có phím riêng biệt, sẵn sàng chiến mượt mà!</span>
          </div>
        </div>`;

    bodyEl.innerHTML = `
      <div class="tweaker-target-row">
        <span>🎯 Đang chỉnh cấu hình &amp; phím tắt cho:</span>
        <select id="tweakerTargetSelect" class="pro-select" style="flex:1;min-width:240px;">${instOptions}</select>
        <button type="button" class="btn-fps-boost-1click ${s.fullbright ? 'is-ok' : ''}" id="btnTweakerFullbright">
          ${s.fullbright ? '💡 Sáng Hang Động (Fullbright): ĐANG BẬT' : '💡 Bật Sáng Hang Động 1-Click (Fullbright)'}
        </button>
      </div>

      ${statusNotice ? `<div class="pack-modal-msg" style="border-color:rgba(16,185,129,0.45);background:rgba(16,185,129,0.12);">${statusNotice}</div>` : ''}

      <div class="tweaker-sliders-grid">
        <div class="tweaker-field">
          <div class="tf-top"><span>🔭 Góc nhìn (FOV)</span><strong id="twValFov">${s.fov === 110 ? '110 (Quake Pro)' : s.fov === 70 ? '70 (Chuẩn)' : s.fov}</strong></div>
          <input type="range" id="twInpFov" min="30" max="110" step="1" value="${s.fov}" />
        </div>
        <div class="tweaker-field">
          <div class="tf-top"><span>🏔️ Tầm nhìn (Render Distance)</span><strong id="twValRender">${s.renderDistance} Chunks</strong></div>
          <input type="range" id="twInpRender" min="2" max="32" step="1" value="${s.renderDistance}" />
        </div>
        <div class="tweaker-field">
          <div class="tf-top"><span>⚙️ Khoảng cách mô phỏng (Simulation)</span><strong id="twValSim">${s.simulationDistance} Chunks</strong></div>
          <input type="range" id="twInpSim" min="5" max="24" step="1" value="${s.simulationDistance}" />
        </div>
        <div class="tweaker-field">
          <div class="tf-top"><span>🚀 Giới hạn khung hình (Max FPS)</span><strong id="twValFps">${s.maxFps >= 260 ? 'Không giới hạn' : `${s.maxFps} FPS`}</strong></div>
          <input type="range" id="twInpFps" min="30" max="260" step="10" value="${s.maxFps}" />
        </div>
        <div class="tweaker-field">
          <div class="tf-top"><span>🔊 Âm lượng tổng (Master Volume)</span><strong id="twValVol">${s.masterVolume}%</strong></div>
          <input type="range" id="twInpVol" min="0" max="100" step="5" value="${s.masterVolume}" />
        </div>
        <div class="tweaker-switches-box">
          <label><input type="checkbox" id="twChkNoVsync" ${!s.enableVsync ? 'checked' : ''} /> <span>⚡ Tắt VSync (Giảm trễ chuột PvP)</span></label>
          <label><input type="checkbox" id="twChkNoAutoJump" ${!s.autoJump ? 'checked' : ''} /> <span>🦘 Tắt Tự động nhảy (Auto-Jump OFF)</span></label>
          <label><input type="checkbox" id="twChkRawMouse" ${s.rawMouseInput ? 'checked' : ''} /> <span>🖱️ Chuột thô chính xác (Raw Input)</span></label>
        </div>
      </div>

      ${conflictSummaryHtml}

      <div class="tweaker-key-toolbar">
        <input type="text" id="twKeySearchInput" class="pro-input" placeholder="🔍 Tìm nhanh chức năng hoặc tên phím (vd: Zoom, Voice, Waypoint, Minimap, Phím C)..." value="${escapeHtml(searchQuery)}" />
        <div class="vtype-group">
          <button type="button" class="vtype-btn ${!filterConflictsOnly ? 'active' : ''}" id="btnTwFilterAll">Tất cả (${tweakerData.totalKeybinds || 0})</button>
          <button type="button" class="vtype-btn ${filterConflictsOnly ? 'active' : ''}" id="btnTwFilterConflict">⚠️ Bị trùng (${conflictsCount})</button>
        </div>
      </div>

      <div class="tweaker-key-list" id="tweakerKeyListWrap"></div>
    `;

    bodyEl.querySelector('#tweakerTargetSelect').onchange = (e) => {
      currentInstanceDir = e.target.value || '';
      loadAndRenderTweaker();
    };

    const bindRange = (inpId, valId, fmt) => {
      const inp = bodyEl.querySelector(`#${inpId}`);
      const val = bodyEl.querySelector(`#${valId}`);
      if (inp && val) inp.oninput = () => { val.textContent = fmt(Number(inp.value)); };
    };
    bindRange('twInpFov', 'twValFov', (v) => (v === 110 ? '110 (Quake Pro)' : v === 70 ? '70 (Chuẩn)' : `${v}`));
    bindRange('twInpRender', 'twValRender', (v) => `${v} Chunks`);
    bindRange('twInpSim', 'twValSim', (v) => `${v} Chunks`);
    bindRange('twInpFps', 'twValFps', (v) => (v >= 260 ? 'Không giới hạn' : `${v} FPS`));
    bindRange('twInpVol', 'twValVol', (v) => `${v}%`);

    const btnFb = bodyEl.querySelector('#btnTweakerFullbright');
    if (btnFb) {
      btnFb.onclick = async () => {
        const wantEnable = !tweakerData.settings?.fullbright;
        btnFb.disabled = true;
        btnFb.textContent = wantEnable ? '⏳ Đang bật Sáng Hang Động...' : '⏳ Đang tắt...';
        const r = await window.aetherAPI.toggleFullbrightPack({
          gameDir: state.gameDir,
          instanceDir: meta.instanceDir,
          mcVersion: meta.mcVersion,
          enable: wantEnable
        });
        await refreshToolsKeyConflictBadge();
        await loadAndRenderTweaker(
          r?.enabled
            ? `💡 <strong>Đã bật Sáng Hang Động (Fullbright)!</strong> Đã chỉnh <code>gamma: 12.0</code>${r.packFileName ? ` và tự động kích hoạt gói <code>${escapeHtml(r.packFileName)}</code>` : ''} — vào hang tối hay dưới biển đều sáng rõ 100%!`
            : '🌙 Đã tắt Sáng Hang Động và trả độ sáng về chuẩn gốc.'
        );
      };
    }

    const btnResolve = bodyEl.querySelector('#btnTweakerAutoResolve');
    if (btnResolve) {
      btnResolve.onclick = async () => {
        btnResolve.disabled = true;
        btnResolve.textContent = '⏳ Đang tự động gỡ trùng...';
        const r = await window.aetherAPI.resolveKeybindConflicts({
          gameDir: state.gameDir,
          instanceDir: meta.instanceDir
        });
        await refreshToolsKeyConflictBadge();
        const details = (r?.changes || []).slice(0, 5).map(
          (ch) => `<code>${escapeHtml(ch.label)}</code>: ${escapeHtml(ch.fromLabel)} → <strong>${escapeHtml(ch.toLabel)}</strong>`
        ).join(' • ');
        await loadAndRenderTweaker(
          `🪄 <strong>Đã tự động gỡ trùng ${r?.resolvedCount || 0} phím tắt!</strong> ${details}${(r?.changes?.length || 0) > 5 ? ` (+${r.changes.length - 5} phím khác)` : ''}`
        );
      };
    }

    const searchInp = bodyEl.querySelector('#twKeySearchInput');
    if (searchInp) {
      searchInp.oninput = () => {
        searchQuery = searchInp.value.trim().toLowerCase();
        renderKeybindRows();
      };
    }
    const bAll = bodyEl.querySelector('#btnTwFilterAll');
    const bConf = bodyEl.querySelector('#btnTwFilterConflict');
    if (bAll) {
      bAll.onclick = () => {
        filterConflictsOnly = false;
        bAll.classList.add('active');
        bConf?.classList.remove('active');
        renderKeybindRows();
      };
    }
    if (bConf) {
      bConf.onclick = () => {
        filterConflictsOnly = true;
        bConf.classList.add('active');
        bAll?.classList.remove('active');
        renderKeybindRows();
      };
    }

    renderKeybindRows();
  };

  card.querySelector('#btnTweakerOpenOptsFile').onclick = () => {
    const meta = getActiveTargetMeta();
    window.aetherAPI.openGameDir(meta.instanceDir || state.gameDir);
  };

  card.querySelector('#btnTweakerSaveAll').onclick = async () => {
    const meta = getActiveTargetMeta();
    const btnSave = card.querySelector('#btnTweakerSaveAll');
    btnSave.disabled = true;
    btnSave.textContent = '⏳ Đang lưu...';
    const settingsPayload = {
      fov: Number(bodyEl.querySelector('#twInpFov')?.value || 70),
      renderDistance: Number(bodyEl.querySelector('#twInpRender')?.value || 12),
      simulationDistance: Number(bodyEl.querySelector('#twInpSim')?.value || 8),
      maxFps: Number(bodyEl.querySelector('#twInpFps')?.value || 120),
      masterVolume: Number(bodyEl.querySelector('#twInpVol')?.value || 100),
      enableVsync: !bodyEl.querySelector('#twChkNoVsync')?.checked,
      autoJump: !bodyEl.querySelector('#twChkNoAutoJump')?.checked,
      rawMouseInput: Boolean(bodyEl.querySelector('#twChkRawMouse')?.checked)
    };
    const r = await window.aetherAPI.saveGameTweaker({
      gameDir: state.gameDir,
      instanceDir: meta.instanceDir,
      settings: settingsPayload,
      keyChanges: pendingKeyChanges
    });
    btnSave.disabled = false;
    btnSave.textContent = '💾 Lưu Cấu Hình & Phím Tắt';
    await refreshToolsKeyConflictBadge();
    if (r?.ok) {
      if (typeof showAetherNotification === 'function') {
        showAetherNotification(`🎛️ Đã lưu cấu hình options.txt${r.updatedKeysCount > 0 ? ` & cập nhật ${r.updatedKeysCount} phím tắt` : ''} cho ${meta.label}!`, 'success', 4200);
      }
      await loadAndRenderTweaker(`✅ Đã lưu thành công cấu hình đồ họa${r.updatedKeysCount > 0 ? ` và ${r.updatedKeysCount} thay đổi phím tắt` : ''}!`);
    }
  };

  await loadAndRenderTweaker();
}
window.openGameTweakerModal = openGameTweakerModal;

/* ---------- Upgrade 3: World & Datapack 1-Click Store + Per-World Datapacks ---------- */
const worldStoreState = {
  view: 'local',
  category: 'all',
  loadedOnce: false,
  items: []
};

function switchWorldsSubView(viewMode = 'local') {
  const validModes = ['local', 'store', 'seeds'];
  worldStoreState.view = validModes.includes(viewMode) ? viewMode : 'local';
  const btnLocal = document.getElementById('btnWorldsViewLocal');
  const btnStore = document.getElementById('btnWorldsViewStore');
  const btnSeeds = document.getElementById('btnWorldsViewSeeds');
  const localCard = document.getElementById('worldsDropZoneCard');
  const storePanel = document.getElementById('worldStorePanel');
  const seedsPanel = document.getElementById('worldSeedsPanel');
  const backupsBox = document.getElementById('worldBackupsBox');

  btnLocal?.classList.toggle('active', worldStoreState.view === 'local');
  btnStore?.classList.toggle('active', worldStoreState.view === 'store');
  btnSeeds?.classList.toggle('active', worldStoreState.view === 'seeds');
  localCard?.classList.toggle('hidden', worldStoreState.view !== 'local');
  storePanel?.classList.toggle('hidden', worldStoreState.view !== 'store');
  seedsPanel?.classList.toggle('hidden', worldStoreState.view !== 'seeds');
  if (worldStoreState.view !== 'local') {
    backupsBox?.classList.add('hidden');
  }
  if (worldStoreState.view === 'store' && !worldStoreState.loadedOnce) {
    loadWorldStoreUI(true);
  }
  if (worldStoreState.view === 'seeds' && typeof window.renderSeedVaultUI === 'function') {
    window.renderSeedVaultUI();
  }
}
window.switchWorldsSubView = switchWorldsSubView;

async function loadWorldStoreUI(reset = true) {
  const grid = document.getElementById('worldStoreGrid');
  const badge = document.getElementById('worldStoreTotalBadge');
  if (!grid || typeof window.aetherAPI?.searchWorldStore !== 'function') return;
  worldStoreState.loadedOnce = true;

  const query = document.getElementById('worldStoreSearchInput')?.value.trim() || '';
  if (reset) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-muted);font-weight:700;">⏳ Đang tải Kho Bản Đồ Xây Sẵn &amp; Datapack...</div>';
  }

  const res = await window.aetherAPI.searchWorldStore({
    query,
    category: worldStoreState.category || 'all',
    mcVersion: state.selectedVersion || '1.21.4',
    offset: 0,
    limit: 24
  });

  const items = res?.items || [];
  worldStoreState.items = items;
  if (badge) {
    badge.textContent = res?.total ? `${Number(res.total).toLocaleString('vi-VN')}+ Gói` : `${items.length} Gói`;
  }

  if (!items.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-muted);">Không tìm thấy bản đồ hay Datapack nào khớp từ khóa. Hãy thử từ khóa khác (vd: <strong>OneBlock, SkyBlock, Dungeons, Parkour, Terralith</strong>)!</div>';
    return;
  }

  grid.innerHTML = items.map((it, idx) => {
    const dl = it.downloads >= 1e6 ? `${(it.downloads / 1e6).toFixed(1)}M lượt tải`
      : (it.downloads >= 1e3 ? `${(it.downloads / 1e3).toFixed(1)}K lượt tải` : `${it.downloads || 0} lượt tải`);
    const safeIcon = /^https?:\/\//i.test(String(it.iconUrl || '')) ? escapeHtml(it.iconUrl) : '';
    const safeBanner = /^https?:\/\//i.test(String(it.bannerUrl || '')) ? escapeHtml(it.bannerUrl) : '';
    const isCfWorld = it.source === 'curseforge-world';
    const typePill = isCfWorld
      ? '<span class="mod-compat-pill ok">🗺️ Bản đồ xây sẵn (CurseForge Map)</span>'
      : `<span class="mod-compat-pill ok">📜 Gói Thế Giới / Datapack • MC ${escapeHtml(it.versions?.[0] || state.selectedVersion || '1.21.4')}</span>`;
    const attachBtnHtml = isCfWorld
      ? ''
      : `<button type="button" class="vtype-btn" data-wsattach="${idx}" title="Gắn thêm Datapack này vào một Thế giới chơi đơn bạn đang có sẵn">➕ Gắn Vào Map Có Sẵn</button>`;
    const bannerVisual = safeBanner
      ? `<img class="wsc-banner-img" src="${safeBanner}" alt="${escapeHtml(it.title)}" loading="lazy" />
         <span class="svc-zoom-pill">🔍 Xem ảnh</span>`
      : `<div class="wsc-banner-fallback">
           ${safeIcon
             ? `<img class="wsc-banner-blur" src="${safeIcon}" alt="" loading="lazy" /><img class="wsc-banner-center-icon" src="${safeIcon}" alt="" loading="lazy" />`
             : '<span class="wsc-banner-emoji">🗺️</span>'}
         </div>`;

    return `<div class="mod-card world-store-card">
      <div class="wsc-banner-wrap" data-wszoom="${idx}" title="Nhấp để xem ảnh bản đồ & thông tin chi tiết">
        ${bannerVisual}
        <span class="wsc-dl-pill">⬇ ${dl}</span>
      </div>
      <div class="mod-card-top">
        ${safeIcon ? `<img class="mod-icon" src="${safeIcon}" alt="" loading="lazy" />` : '<div class="mod-icon" style="display:flex;align-items:center;justify-content:center;font-size:22px;">🗺️</div>'}
        <div class="mod-head-info">
          <div class="mod-title" title="${escapeHtml(it.title)}">${escapeHtml(it.title)}</div>
          <div class="mod-meta">bởi <strong>${escapeHtml(it.author || 'Creator')}</strong> • ${dl}</div>
        </div>
      </div>
      ${typePill}
      <div class="mod-desc" data-wsdesc="${idx}" title="${escapeHtml(it.description || '')}">${escapeHtml(it.description || 'Gói mở rộng thế giới & thử thách sinh tồn tự động cài đặt 1-Click.')}</div>
      <div class="mod-card-foot" style="flex-wrap:wrap;gap:6px;justify-content:flex-end;">
        ${attachBtnHtml}
        <button type="button" class="btn-install-mod" data-wsnew="${idx}" title="Tải về, tự động khởi tạo Thế giới mới tích hợp sẵn gói này và sẵn sàng vào thẳng chơi ngay!">🌍 Tạo Map Chơi Ngay</button>
      </div>
    </div>`;
  }).join('');

  if (typeof window.aetherAPI?.translateToVi === 'function') {
    const toTrans = items.slice(0, 24).filter((x) => x.description);
    if (toTrans.length) {
      window.aetherAPI.translateToVi(toTrans.map((x) => x.description)).then((tr) => {
        if (!tr?.ok || !Array.isArray(tr.results)) return;
        toTrans.forEach((itemObj, tIdx) => {
          const origIdx = items.indexOf(itemObj);
          const vi = tr.results[tIdx];
          if (vi && origIdx >= 0) {
            const dEl = grid.querySelector(`[data-wsdesc="${origIdx}"]`);
            if (dEl) dEl.textContent = vi;
          }
        });
      }).catch(() => {});
    }
  }

  grid.querySelectorAll('[data-wszoom]').forEach((bannerEl) => {
    bannerEl.onclick = () => {
      const idx = Number(bannerEl.dataset.wszoom);
      const it = items[idx];
      if (!it) return;
      const curDesc = grid.querySelector(`[data-wsdesc="${idx}"]`)?.textContent || it.description || '';
      openWorldStorePreviewModal(it, curDesc, () => {
        const triggerBtn = grid.querySelector(`[data-wsnew="${idx}"]`);
        if (triggerBtn) triggerBtn.click();
      });
    };
  });

  grid.querySelectorAll('[data-wsnew]').forEach((btn) => {
    btn.onclick = async () => {
      const it = items[Number(btn.dataset.wsnew)];
      if (!it) return;
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ Đang tạo Map...';
      try {
        const r = await window.aetherAPI.installWorldStoreItem({
          gameDir: state.gameDir,
          source: it.source,
          slugOrId: it.source === 'curseforge-world' ? it.projectId : it.slug,
          title: it.title,
          mcVersion: state.selectedVersion || '1.21.4',
          loaderType: state.selectedCore || 'fabric',
          mode: 'new-world',
          keepInventory: true,
          previewUrl: it.bannerUrl || it.iconUrl || ''
        });
        btn.disabled = false;
        btn.textContent = '✓ Đã tạo Map!';
        setTimeout(() => { btn.textContent = orig; }, 3000);
        if (!r?.ok) {
          showAetherNotification(`⚠️ ${r?.error || 'Không thể tạo bản đồ'}`, 'error', 5000);
          return;
        }
        await renderLocalWorlds();
        const displayTitle = r.levelName || r.worldName || it.title;
        const askPlay = await askUserAgreement({
          title: `🎉 Đã Tạo Xong Thế Giới “${displayTitle}”!`,
          message: `Thế giới "${displayTitle}" (MC ${r.mcVersion || state.selectedVersion}) đã được cài đặt sẵn sàng vào .minecraft/saves${r.datapackFile ? ` kèm Datapack "${r.datapackFile}" kích hoạt sẵn` : ''}.\n\nBạn có muốn mở Minecraft và vào thẳng thế giới này ngay bây giờ không?`,
          agreeText: '⚡ Vào Thẳng Thế Giới Ngay',
          cancelText: '🌍 Xem Trong Danh Sách Map'
        });
        if (askPlay.agreed) {
          quickLaunchWorld({
            name: displayTitle,
            folderName: r.worldName,
            path: r.worldPath,
            version: r.mcVersion || state.selectedVersion
          });
        } else {
          switchWorldsSubView('local');
        }
      } catch (err) {
        btn.disabled = false;
        btn.textContent = orig;
        showAetherNotification(`⚠️ ${err.message}`, 'error', 5000);
      }
    };
  });

  grid.querySelectorAll('[data-wsattach]').forEach((btn) => {
    btn.onclick = () => {
      const it = items[Number(btn.dataset.wsattach)];
      if (!it || typeof openWorldPicker !== 'function') return;
      openWorldPicker(async (worldPath) => {
        showAetherNotification(`⏳ Đang tải & gắn "${it.title}" vào thế giới đã chọn...`, 'info', 3500);
        const r = await window.aetherAPI.installWorldStoreItem({
          gameDir: state.gameDir,
          source: it.source,
          slugOrId: it.slug,
          title: it.title,
          mcVersion: state.selectedVersion || '1.21.4',
          loaderType: state.selectedCore || 'fabric',
          mode: 'attach-world',
          targetWorldPath: worldPath
        });
        if (r?.ok) {
          await renderLocalWorlds();
          showAetherNotification(`✅ Đã gắn "${r.datapackFile || it.title}" vào thế giới "${r.worldName}"! Vào lại Map hoặc gõ /reload là chạy ngay.`, 'success', 5200);
        } else {
          showAetherNotification(`⚠️ ${r?.error || 'Không thể gắn Datapack'}`, 'error', 4800);
        }
      });
    };
  });
}
window.loadWorldStoreUI = loadWorldStoreUI;

async function openWorldDatapacksModal(worldPath, worldTitle) {
  if (typeof window.aetherAPI?.listWorldDatapacks !== 'function') return;
  const card = packOpenModal(`
    <div class="modal-head" style="justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="card-dot emerald"></span>
        <h3>📜 Gói Datapack Trong Thế Giới “${escapeHtml(worldTitle || 'Map')}”</h3>
      </div>
      <button class="vtype-btn" data-pmclose>✕ Đóng</button>
    </div>
    <div class="modal-body" id="worldDpModalBody">
      <div class="pack-modal-loading">⏳ Đang đọc danh sách Datapack...</div>
    </div>
    <div class="modal-foot" style="justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <button class="btn-sync-skin" id="btnWorldDpOpenDir">📂 Mở Thư Mục Datapacks</button>
      <div style="display:flex;gap:8px;">
        <button class="btn-modal-cancel" data-pmclose>Đóng</button>
        <button class="btn-modal-agree" id="btnWorldDpBrowseStore">➕ Tải Thêm Datapack Từ Kho</button>
      </div>
    </div>`, false);
  if (!card) return;

  const body = card.querySelector('#worldDpModalBody');
  const refreshList = async () => {
    const res = await window.aetherAPI.listWorldDatapacks({
      gameDir: state.gameDir,
      worldNameOrPath: worldPath
    });
    const list = res?.items || [];
    if (!list.length) {
      body.innerHTML = `<div class="pack-modal-msg">Thế giới này hiện chưa gắn gói Datapack mở rộng nào. Bấm <strong>➕ Tải Thêm Datapack Từ Kho</strong> bên dưới để gắn thêm hầm ngục, chặt cây nhanh hoặc địa hình mới chỉ với 1-Click!</div>`;
      return;
    }
    body.innerHTML = `<div class="pack-manual-list">${list.map((d) => `
      <div class="pack-manual-row">
        <div>
          <strong>📦 ${escapeHtml(d.name)}</strong>
          <span>${d.isDirectory ? 'Thư mục giải nén' : `${d.sizeKB} KB (.zip)`}</span>
        </div>
        <button type="button" class="vtype-btn" style="color:#ef4444;" data-delwdp="${escapeHtml(d.name)}">🗑 Gỡ bỏ</button>
      </div>`).join('')}</div>`;
    body.querySelectorAll('[data-delwdp]').forEach((b) => {
      b.onclick = async () => {
        await window.aetherAPI.deleteWorldDatapack({
          gameDir: state.gameDir,
          worldNameOrPath: worldPath,
          fileName: b.dataset.delwdp
        });
        await refreshList();
        await renderLocalWorlds();
      };
    });
  };

  card.querySelector('#btnWorldDpOpenDir').onclick = () => {
    window.aetherAPI.openGameDir(`${worldPath}/datapacks`);
  };
  card.querySelector('#btnWorldDpBrowseStore').onclick = () => {
    packCloseModal();
    if (typeof window.switchMainTab === 'function') window.switchMainTab('worlds');
    switchWorldsSubView('store');
  };

  await refreshList();
}
window.openWorldDatapacksModal = openWorldDatapacksModal;

/* ---------- Upgrade 5: Smart RAM & Generational ZGC / G1GC Coach ---------- */
let smartRamDebounceTimer = null;
let latestSmartRamAdvice = null;

function refreshSmartRamCoachUI() {
  if (typeof window.aetherAPI?.analyzeSmartRamCoach !== 'function') return;
  if (smartRamDebounceTimer) clearTimeout(smartRamDebounceTimer);
  smartRamDebounceTimer = setTimeout(async () => {
    try {
      const ctx = state.activeLaunchContext;
      const res = await window.aetherAPI.analyzeSmartRamCoach({
        gameDir: state.gameDir,
        instanceDir: ctx?.instanceDir || '',
        mcVersion: ctx?.mcVersion || state.selectedVersion || '1.21.4',
        loaderType: ctx?.core || state.selectedCore || 'fabric',
        requestedRamGB: state.ramGB || 4,
        smartRamAuto: state.smartRamCoach !== false,
        javaPath: state.javaPath || '',
        cpuCores: state.cpuCores || 8
      });
      if (!res?.ok) return;
      latestSmartRamAdvice = res;
      const bar = document.getElementById('smartRamCoachBar');
      const pill = document.getElementById('smartRamGcPill');
      const txt = document.getElementById('smartRamAdviceText');
      const btnApply = document.getElementById('btnApplySmartRam');
      if (pill) {
        pill.textContent = res.gcMode === 'zgc-gen' ? '⚡ Generational ZGC' : '🚀 Tuned G1GC';
      }
      if (txt) {
        txt.textContent = res.adviceText;
      }
      if (bar) {
        bar.classList.toggle('is-warn', res.adviceStatus !== 'optimal');
      }
      if (btnApply) {
        const recInt = Math.max(2, Math.round(res.recommendedRamGB || 4));
        const isMatched = Math.round(Number(state.ramGB) || 4) === recInt;
        btnApply.textContent = isMatched ? `✓ Chuẩn vàng (${recInt} GB)` : `⚡ Cấp ${recInt} GB Chuẩn`;
        btnApply.classList.toggle('active', isMatched);
      }
    } catch (_) {}
  }, 140);
}
window.refreshSmartRamCoachUI = refreshSmartRamCoachUI;

async function applySmartRamCoachRecommendation(notify = true) {
  if (typeof window.aetherAPI?.analyzeSmartRamCoach !== 'function') return;
  const ctx = state.activeLaunchContext;
  const res = await window.aetherAPI.analyzeSmartRamCoach({
    gameDir: state.gameDir,
    instanceDir: ctx?.instanceDir || '',
    mcVersion: ctx?.mcVersion || state.selectedVersion || '1.21.4',
    loaderType: ctx?.core || state.selectedCore || 'fabric',
    requestedRamGB: state.ramGB || 4,
    forceRecommend: true,
    javaPath: state.javaPath || '',
    cpuCores: state.cpuCores || 8
  });
  if (!res?.ok) return;
  const targetRam = Math.max(2, Math.round(res.recommendedRamGB || 4));
  state.ramGB = targetRam;
  const slider = document.getElementById('ramSlider');
  if (slider) slider.value = String(targetRam);
  const disp = document.getElementById('ramValueDisplay');
  if (disp) disp.textContent = `${targetRam} GB`;
  document.getElementById('btnRamAuto')?.classList.add('active');
  if (typeof updateSummaryUI === 'function') updateSummaryUI();
  if (typeof saveCurrentConfig === 'function') saveCurrentConfig();
  if (notify && typeof showAetherNotification === 'function') {
    showAetherNotification(
      `📊 Cố vấn RAM đã cân chỉnh ${targetRam} GB cho ${res.profileLabel} (${res.gcModeLabel} • chừa an toàn cho Windows)!`,
      'success',
      4200
    );
  }
}
window.applySmartRamCoachRecommendation = applySmartRamCoachRecommendation;

function initV406FeaturesUI() {
  // 1. Game Tweaker & Keybind Conflict Fixer buttons
  ['btnModsGameTweaker', 'btnToolsGameTweaker'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.onclick = () => {
        const customDir = id === 'btnModsGameTweaker' && typeof getModStoreTarget === 'function' && getModStoreTarget().isPack
          ? getModStoreTarget().dir
          : '';
        openGameTweakerModal(customDir);
      };
    }
  });

  const btnQuickFb = document.getElementById('btnToolsQuickFullbright');
  if (btnQuickFb) {
    btnQuickFb.onclick = async () => {
      const cur = await window.aetherAPI.readGameTweaker({ gameDir: state.gameDir });
      const wantEnable = !cur?.settings?.fullbright;
      btnQuickFb.disabled = true;
      btnQuickFb.textContent = wantEnable ? '⏳ Đang bật Fullbright...' : '⏳ Đang tắt Fullbright...';
      const r = await window.aetherAPI.toggleFullbrightPack({
        gameDir: state.gameDir,
        mcVersion: state.selectedVersion || '1.21.4',
        enable: wantEnable
      });
      btnQuickFb.disabled = false;
      await refreshToolsKeyConflictBadge();
      if (typeof showAetherNotification === 'function') {
        showAetherNotification(
          r?.enabled
            ? '💡 Đã bật Sáng Hang Động 1-Click (Fullbright gamma 12.0 + gói ánh sáng)! Vào hang tối sáng rõ 100%!'
            : '🌙 Đã tắt Sáng Hang Động (Fullbright) về ánh sáng mặc định.',
          'success',
          4200
        );
      }
    };
  }

  // 2. Smart Addon Updater buttons in #tab-mods (Installed view)
  const btnCheckUpd = document.getElementById('btnCheckAddonUpdates');
  if (btnCheckUpd) {
    btnCheckUpd.onclick = async () => {
      await refreshAddonUpdatesState(true);
      await renderLocalAddonsManager(true);
    };
  }
  const btnUpdAll = document.getElementById('btnUpdateAllAddons');
  if (btnUpdAll) {
    btnUpdAll.onclick = async () => {
      const target = getModStoreTarget();
      btnUpdAll.disabled = true;
      const origHtml = btnUpdAll.innerHTML;
      btnUpdAll.textContent = '⏳ Đang cập nhật tất cả...';
      const r = await window.aetherAPI.updateLocalAddons({
        gameDir: state.gameDir,
        instanceDir: target.isPack ? target.dir : '',
        folderType: state.activeLocalFolder || 'mods',
        fileNames: [],
        mcVersion: target.mcVersion || '1.21.4',
        loaderType: target.core || 'fabric'
      });
      btnUpdAll.disabled = false;
      btnUpdAll.innerHTML = origHtml;
      invalidateAddonUpdatesCache(target, state.activeLocalFolder);
      await refreshAddonUpdatesState(false);
      await renderLocalAddonsManager(true);
      if (typeof showAetherNotification === 'function') {
        showAetherNotification(
          r?.updatedCount > 0
            ? `⬆️ Đã cập nhật ${r.updatedCount} gói lên bản mới nhất! Bản cũ được cất an toàn để bạn Hoàn tác 1-Click bất cứ lúc nào.`
            : 'ℹ️ Tất cả gói đều đã ở phiên bản mới nhất.',
          'success',
          5000
        );
      }
    };
  }

  // 3. World & Datapack 1-Click Store in #tab-worlds
  const btnWLocal = document.getElementById('btnWorldsViewLocal');
  const btnWStore = document.getElementById('btnWorldsViewStore');
  if (btnWLocal) btnWLocal.onclick = () => switchWorldsSubView('local');
  if (btnWStore) btnWStore.onclick = () => switchWorldsSubView('store');

  const btnWsSearch = document.getElementById('btnWorldStoreSearch');
  const inpWsSearch = document.getElementById('worldStoreSearchInput');
  if (btnWsSearch) btnWsSearch.onclick = () => loadWorldStoreUI(true);
  if (inpWsSearch) {
    inpWsSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadWorldStoreUI(true);
    });
  }
  document.querySelectorAll('#worldStoreCatBar [data-wscat]').forEach((chip) => {
    chip.onclick = () => {
      document.querySelectorAll('#worldStoreCatBar [data-wscat]').forEach((c) => c.classList.toggle('active', c === chip));
      worldStoreState.category = chip.dataset.wscat || 'all';
      if (inpWsSearch) inpWsSearch.value = '';
      loadWorldStoreUI(true);
    };
  });

  // 4. Co-op Voice Chat & Team Survival Combo 1-Click in #tab-servers
  const btnCoopCombo = document.getElementById('btnCoopInstallCombo');
  if (btnCoopCombo && typeof window.aetherAPI?.installCoopComboPack === 'function') {
    btnCoopCombo.onclick = async () => {
      let includeVoice = Boolean(document.getElementById('chkCoopVoiceChat')?.checked);
      const includeTeamQol = Boolean(document.getElementById('chkCoopTeamQol')?.checked);
      if (!includeVoice && !includeTeamQol) {
        includeVoice = true;
        const vcChk = document.getElementById('chkCoopVoiceChat');
        if (vcChk) vcChk.checked = true;
      }
      let targetCore = state.selectedCore;
      if (targetCore === 'vanilla') {
        targetCore = 'fabric';
        if (typeof window.selectMcVersionAndCore === 'function') {
          await window.selectMcVersionAndCore(state.selectedVersion, 'fabric');
        }
      }
      btnCoopCombo.disabled = true;
      const origText = btnCoopCombo.textContent;
      btnCoopCombo.textContent = '⏳ Đang cài Combo Voice & Tổ Đội...';
      try {
        const r = await window.aetherAPI.installCoopComboPack({
          gameDir: state.gameDir,
          mcVersion: state.selectedVersion || '1.21.4',
          loaderType: targetCore,
          includeVoice,
          includeTeamQol
        });
        await refreshLocalAddonsCount();
        if (r?.ok && r.installed?.length) {
          showAetherNotification(
            `🎙️ Đã trang bị ${r.installed.length} gói (${r.installed.slice(0, 3).join(', ')}${r.installed.length > 3 ? '...' : ''}) cho MC ${state.selectedVersion}! Khi tạo Mã Phòng bạn bè sẽ được tự đồng bộ đủ 100%!`,
            'success',
            5500
          );
        } else {
          showAetherNotification(`ℹ️ Phiên bản MC ${state.selectedVersion} chưa có bản phát hành của một số Mod trong Combo trên Modrinth.`, 'info', 4500);
        }
      } catch (err) {
        showAetherNotification(`⚠️ ${err.message}`, 'error', 4500);
      } finally {
        btnCoopCombo.disabled = false;
        btnCoopCombo.textContent = origText;
      }
    };
  }

  // 5. Smart RAM Coach Apply button in #tab-play
  const btnApplyRam = document.getElementById('btnApplySmartRam');
  if (btnApplyRam) {
    btnApplyRam.onclick = () => applySmartRamCoachRecommendation(true);
  }
  setTimeout(() => refreshSmartRamCoachUI(), 650);
}

/* ============================================================================
   v40.7 PRO: ONLINE SKIN HUB + FRIEND SKIN SYNC, PVP LUNAR MODE,
              WORLD NBT RESCUE + SEED VAULT, AND 1-CLICK REPLAY STUDIO
   ============================================================================ */
const onlineSkinHubState = {
  category: 'popular',
  page: 1,
  loadedOnce: false,
  items: []
};

function getCurrentActivePlayerName() {
  if (state.authMode === 'microsoft' && state.msProfile?.name) return state.msProfile.name;
  if (state.authMode === 'aether' && state.cloudProfile?.mcUsername) return state.cloudProfile.mcUsername;
  return state.username || 'StevePlayer';
}

async function loadOnlineSkinHubUI(resetPage = false) {
  const grid = document.getElementById('onlineSkinGrid');
  const badge = document.getElementById('onlineSkinCountBadge');
  if (!grid || typeof window.aetherAPI?.searchOnlineSkins !== 'function') return;
  onlineSkinHubState.loadedOnce = true;
  if (resetPage) onlineSkinHubState.page = 1;

  const query = document.getElementById('onlineSkinSearchInput')?.value.trim() || '';
  grid.innerHTML = '<div style="grid-column:1/-1;padding:22px;text-align:center;color:var(--text-muted);font-weight:700;">⏳ Đang tải mẫu nhân vật 3D từ Kho Skin...</div>';

  try {
    const res = await window.aetherAPI.searchOnlineSkins({
      query,
      category: onlineSkinHubState.category || 'popular',
      page: onlineSkinHubState.page || 1
    });
    const items = res?.items || [];
    onlineSkinHubState.items = items;
    if (badge) {
      badge.textContent = items.length > 0 ? `${items.length} Mẫu • Trang ${onlineSkinHubState.page}` : 'Kho Mojang & Cộng Đồng';
    }
    if (!items.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;padding:22px;text-align:center;color:var(--text-muted);">Không tìm thấy Skin khớp từ khóa này. Hãy thử nhập tên người chơi khác hoặc chọn chủ đề bên trên!</div>';
      return;
    }

    grid.innerHTML = items.map((sk, idx) => {
      const safePreview = /^https:\/\//i.test(String(sk.previewUrl || '')) ? escapeHtml(sk.previewUrl) : '';
      const safeFace = /^https:\/\//i.test(String(sk.faceUrl || '')) ? escapeHtml(sk.faceUrl) : '';
      const safeName = escapeHtml(sk.name || 'Skin 3D');
      const safeBadge = escapeHtml(sk.badge || '🌐 Skin 3D');
      return `<div class="online-skin-card">
        <span class="osc-badge">${safeBadge}</span>
        <div class="osc-preview-wrap">
          <img class="osc-body-img" src="${safePreview}" data-fallback="${safeFace}" alt="${safeName}" loading="lazy" />
        </div>
        <strong class="osc-name" title="${safeName}">${safeName}</strong>
        <button type="button" class="btn-install-mod osc-wear-btn" data-wearskin="${idx}">👕 Mặc Ngay</button>
      </div>`;
    }).join('');

    grid.querySelectorAll('.osc-body-img').forEach((img) => {
      img.addEventListener('error', () => {
        const fb = img.dataset.fallback;
        if (fb && img.src !== fb) {
          img.src = fb;
        }
      }, { once: true });
    });

    grid.querySelectorAll('[data-wearskin]').forEach((btn) => {
      btn.onclick = async () => {
        const sk = items[Number(btn.dataset.wearskin)];
        if (!sk) return;
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Đang mặc...';
        try {
          const r = await window.aetherAPI.applyOnlineSkin({
            gameDir: state.gameDir,
            username: getCurrentActivePlayerName(),
            textureUrl: sk.textureUrl,
            skinName: sk.name
          });
          if (!r?.ok || !r.dataUrl) {
            throw new Error(r?.error || 'Không tải được ảnh Skin này');
          }
          if (typeof window.applyExternalSkinDataUrl === 'function') {
            await window.applyExternalSkinDataUrl(r.dataUrl, r.skinName || sk.name);
          }
          btn.textContent = '✓ Đang mặc!';
          showAetherNotification(`👕 Đã mặc Skin "${sk.name}" lên mô hình 3D và đồng bộ sẵn vào game!`, 'success', 4000);
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = orig;
          }, 2200);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = orig;
          showAetherNotification(`⚠️ ${err.message}`, 'error', 4200);
        }
      };
    });
  } catch (err) {
    grid.innerHTML = `<div style="grid-column:1/-1;padding:22px;text-align:center;color:var(--text-muted);">⚠️ Không kết nối được Kho Skin trực tuyến (${escapeHtml(err.message)}).</div>`;
  }
}
window.loadOnlineSkinHubUI = loadOnlineSkinHubUI;
window.onSkinTabShown = () => {
  if (!onlineSkinHubState.loadedOnce) {
    loadOnlineSkinHubUI(true);
  }
};

/* ---------- Upgrade 2: Lunar-Style 1-Click PvP / BedWars Mode ---------- */
async function refreshPvpModeUI() {
  if (typeof window.aetherAPI?.getPvpModeState !== 'function') return;
  try {
    const res = await window.aetherAPI.getPvpModeState({
      gameDir: state.gameDir,
      instanceDir: state.modTargetInstanceDir || ''
    });
    const isOn = Boolean(res?.enabled);
    const count = Array.isArray(res?.activeMods) ? res.activeMods.length : 0;
    const card = document.getElementById('pvpClientModeCard');
    const badge = document.getElementById('pvpModeStateBadge');
    const btnMain = document.getElementById('btnTogglePvpClientMode');
    const btnTool = document.getElementById('btnToolsPvpQuickToggle');

    card?.classList.toggle('is-active', isOn);
    if (badge) {
      badge.textContent = isOn ? `🟢 Đang bật (${count} gói PvP)` : 'Đang tắt';
    }
    if (btnMain) {
      btnMain.textContent = isOn ? '🛑 Tắt Chế Độ PvP (Về Sinh Tồn)' : '⚔️ Bật Chế Độ PvP 1-Click';
    }
    if (btnTool) {
      btnTool.classList.toggle('is-ok', isOn);
      btnTool.textContent = isOn ? '⚔️ Chế Độ PvP HUD: ĐANG BẬT' : '⚔️ Bật / Tắt Chế Độ PvP HUD';
    }
  } catch (_) {}
}
window.refreshPvpModeUI = refreshPvpModeUI;

async function handleTogglePvpModeClick(triggerBtn) {
  if (typeof window.aetherAPI?.togglePvpMode !== 'function') return;
  const cur = await window.aetherAPI.getPvpModeState({
    gameDir: state.gameDir,
    instanceDir: state.modTargetInstanceDir || ''
  });
  const wantEnable = !cur?.enabled;

  let targetCore = state.selectedCore || 'fabric';
  if (wantEnable && !state.modTargetInstanceDir && (targetCore === 'vanilla' || targetCore === 'legacyfabric')) {
    targetCore = 'fabric';
    if (typeof window.selectMcVersionAndCore === 'function') {
      await window.selectMcVersionAndCore(state.selectedVersion || '1.21.4', 'fabric');
    }
  }

  const origText = triggerBtn?.textContent || '';
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.textContent = wantEnable ? '⏳ Đang trang bị HUD PvP & Lửa Thấp...' : '⏳ Đang gỡ HUD PvP...';
  }
  try {
    const r = await window.aetherAPI.togglePvpMode({
      gameDir: state.gameDir,
      instanceDir: state.modTargetInstanceDir || '',
      mcVersion: state.selectedVersion || '1.21.4',
      loaderType: targetCore,
      enable: wantEnable
    });
    await refreshLocalAddonsCount();
    await refreshPvpModeUI();
    if (wantEnable) {
      const n = r?.installedMods?.length || 0;
      showAetherNotification(
        `⚔️ Đã bật Chế Độ Chiến Đấu PvP (${n} gói HUD + Tự chạy nhanh ToggleSprint + Lửa thấp không che màn hình)! Sẵn sàng chiến BedWars / BoxPvP!`,
        'success',
        5500
      );
    } else {
      showAetherNotification(
        `🌿 Đã tắt Chế Độ PvP (tạm cất ${r?.disabledCount || 0} gói HUD PvP và gỡ gói Lửa thấp), trả lại nguyên vẹn bộ Mod sinh tồn!`,
        'info',
        4500
      );
    }
  } catch (err) {
    if (triggerBtn) triggerBtn.textContent = origText;
    showAetherNotification(`⚠️ ${err.message}`, 'error', 4500);
  } finally {
    if (triggerBtn) triggerBtn.disabled = false;
    await refreshPvpModeUI();
  }
}

/* ---------- Upgrade 3: World NBT Inspector, Hardcore Rescue & Seed Vault ---------- */
const INLINE_CURATED_SEEDS_FALLBACK = [
  {
    id: 'cherry-ring-mountain',
    title: '🌸 Thung Lũng Anh Đào Ôm Trọn Hồ Núi Tuyết',
    seed: '1691256543523180978',
    badge: 'Đẹp Nhất Xây Nhà',
    coordsHint: 'Spawn gần X: 120, Z: 80',
    previewImage: 'seeds/cherry-ring-mountain.jpg',
    description: 'Vòng núi tuyết hùng vĩ khép kín bao quanh thung lũng hoa anh đào hồng rực, hồ nước trong vắt ở giữa và ngôi làng bình yên sát bên.'
  },
  {
    id: 'mushroom-safe-island',
    title: '🍄 Quần Đảo Nấm Khổng Lồ (100% Không Quái Ban Đêm)',
    seed: '-4270204629242599305',
    badge: 'An Toàn Tuyệt Đối',
    coordsHint: 'Xuất hiện ngay trên Đảo Nấm',
    previewImage: 'seeds/mushroom-safe-island.jpg',
    description: 'Đảo Nấm rộng lớn nằm giữa đại dương ngay điểm xuất hiện — ban đêm không bao giờ tự sinh Zombie/Creeper, lý tưởng để xây đại căn cứ.'
  },
  {
    id: 'mansion-village-ancient',
    title: '🏰 Biệt Thự Rừng + Làng Cổ + Thành Cổ Ngầm Sát Nhau',
    seed: '5706378859201728440',
    badge: 'Siêu Hiếm 3-Trong-1',
    coordsHint: 'Ngay sát điểm xuất hiện (X: 60, Z: 90)',
    previewImage: 'seeds/mansion-village-ancient.jpg',
    description: 'Vừa vào thế giới đã đứng trước tòa Biệt thự Woodland Mansion khổng lồ ghép liền với ngôi làng dân làng và thành cổ Ancient City sâu bên dưới.'
  },
  {
    id: 'coral-castaway-island',
    title: '🏝️ Đảo Hoang San Hô Rực Rỡ & Kho Báu Tàu Đắm',
    seed: '-3420545464665791887',
    badge: 'Sinh Tồn Đảo Hoang',
    coordsHint: 'Đảo chính tại X: 0, Z: 0',
    previewImage: 'seeds/coral-castaway-island.jpg',
    description: 'Thử thách sinh tồn trên hòn đảo nhỏ giữa vùng biển ấm rực rỡ san hô phát sáng ban đêm, bao quanh bởi xác tàu đắm và phế tích biển.'
  },
  {
    id: 'ice-spikes-frozen-kingdom',
    title: '❄️ Vương Quốc Gai Băng Cổ Đại & Làng Tuyết',
    seed: '-7253978062019363248',
    badge: 'Cảnh Quan Kỳ Vĩ',
    coordsHint: 'Gai băng tại X: -150, Z: 120',
    previewImage: 'seeds/ice-spikes-frozen-kingdom.jpg',
    description: 'Hàng trăm cột băng xanh cao vút nối liền rặng núi tuyết trắng xóa, có sẵn làng tuyết Igloo và cổng địa ngục cổ ngay gần điểm xuất hiện.'
  },
  {
    id: 'badlands-gold-oasis',
    title: '🏜️ Ốc Đảo Hẻm Núi Đỏ Giàu Vàng & Đền Sa Mạc',
    seed: '8678942899319966093',
    badge: 'Giàu Tài Nguyên',
    coordsHint: 'Ốc đảo tại X: 40, Z: -60',
    previewImage: 'seeds/badlands-gold-oasis.jpg',
    description: 'Sự giao thoa tuyệt đẹp giữa hồ nước xanh, làng sa mạc, Kim tự tháp chứa kho báu và dãy núi đất nung Badlands lộ thiên đầy mỏ vàng.'
  },
  {
    id: 'speedrun-bastion-fortress',
    title: '⚡ Hạt Giống Phá Đảo Thần Tốc (Làng Rèn + Pháo Đài Gần)',
    seed: '-4530634556500121041',
    badge: 'Speedrun Chuẩn',
    coordsHint: 'Làng & Hồ Lava ngay cạnh Spawn',
    previewImage: 'seeds/speedrun-bastion-fortress.jpg',
    description: 'Có sẵn làng thợ rèn lấy sắt/đồ ăn và hồ dung nham dựng cổng Nether mở thẳng ra khu vực sát Pháo đài Nether Fortress và Bastion.'
  },
  {
    id: 'lush-cave-ancient-taiga',
    title: '🌲 Rừng Tùng Cổ Thụ & Đại Hang Động Rêu Phát Sáng',
    seed: '7092092118958763650',
    badge: 'Hang Động Tuyệt Đẹp',
    coordsHint: 'Cửa hang lớn tại X: -80, Z: 40',
    previewImage: 'seeds/lush-cave-ancient-taiga.jpg',
    description: 'Rừng thông khổng lồ phủ rêu phong bên trên một quần thể hang động Lush Caves rực sáng quả mọng phát quang và cá kỳ nhông Axolotl.'
  }
];

let cachedCuratedSeeds = null;

function findCuratedSeedByValue(seedStr) {
  const clean = String(seedStr || '').trim();
  if (!clean) return null;
  const list = (Array.isArray(cachedCuratedSeeds) && cachedCuratedSeeds.length)
    ? cachedCuratedSeeds
    : INLINE_CURATED_SEEDS_FALLBACK;
  return list.find((s) => String(s.seed) === clean) || null;
}

function openSeedPreviewModal(s) {
  if (!s) return;
  const imgSrc = escapeHtml(s.previewImage || `seeds/${s.id}.jpg`);
  const cleanTitle = String(s.title || 'Thế giới mới').replace(/^[^\p{L}\p{N}]+/u, '').split('(')[0].trim().slice(0, 48);
  const card = packOpenModal(`
    <div class="modal-head" style="justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:8px;min-width:0;">
        <span class="card-dot emerald"></span>
        <h3>${escapeHtml(s.title)}</h3>
      </div>
      <button class="vtype-btn" data-pmclose>✕ Đóng</button>
    </div>
    <div class="modal-body seed-preview-modal-body">
      <div class="spm-hero-frame">
        <img class="spm-hero-img" src="${imgSrc}" alt="${escapeHtml(s.title)}" />
        <div class="svc-banner-overlay-top">
          <span class="svc-badge-pill">🌱 ${escapeHtml(s.badge || 'Hạt giống tuyển chọn')}</span>
          <span class="svc-badge-pill">Chuẩn MC 1.20 → 26.x</span>
        </div>
        <div class="svc-banner-overlay-bot">
          <span class="svc-coords-pill">📍 ${escapeHtml(s.coordsHint || '')}</span>
        </div>
      </div>
      <p class="spm-desc">${escapeHtml(s.description || '')}</p>
      <div class="svc-seed-row">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="field-hint-mini" style="font-weight:800;">Mã Hạt Giống (Seed):</span>
          <code class="svc-seed-code">${escapeHtml(s.seed)}</code>
        </div>
        <button type="button" class="vtype-btn" id="btnModalCopySeed">📋 Copy Seed</button>
      </div>
    </div>
    <div class="modal-foot" style="justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <span class="field-hint-mini">🖼️ Tự gắn sẵn ảnh đại diện thế giới vào <code>.minecraft/saves</code> khi tạo Map</span>
      <div style="display:flex;gap:8px;">
        <button class="btn-modal-cancel" data-pmclose>Đóng</button>
        <button class="btn-modal-agree" id="btnModalCreateFromSeed">🌍 Tạo Map Với Seed Này</button>
      </div>
    </div>`, true);
  if (!card) return;
  const copyBtn = card.querySelector('#btnModalCopySeed');
  if (copyBtn) {
    copyBtn.onclick = () => {
      window.aetherAPI.copyTextToClipboard(s.seed);
      showAetherNotification(`📋 Đã sao chép mã Seed "${s.seed}" vào khay nhớ tạm!`, 'success', 3000);
    };
  }
  const createBtn = card.querySelector('#btnModalCreateFromSeed');
  if (createBtn) {
    createBtn.onclick = () => {
      packCloseModal();
      openQuickWorldModal(null, s.seed, cleanTitle);
    };
  }
}

function openWorldStorePreviewModal(it, displayDesc, onCreateWorld) {
  if (!it) return;
  const safeBanner = /^https?:\/\//i.test(String(it.bannerUrl || '')) ? escapeHtml(it.bannerUrl) : '';
  const safeIcon = /^https?:\/\//i.test(String(it.iconUrl || '')) ? escapeHtml(it.iconUrl) : '';
  const dl = it.downloads >= 1e6 ? `${(it.downloads / 1e6).toFixed(1)}M lượt tải`
    : (it.downloads >= 1e3 ? `${(it.downloads / 1e3).toFixed(1)}K lượt tải` : `${it.downloads || 0} lượt tải`);
  const card = packOpenModal(`
    <div class="modal-head" style="justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:8px;min-width:0;">
        <span class="card-dot emerald"></span>
        <h3>🗺️ ${escapeHtml(it.title)}</h3>
      </div>
      <button class="vtype-btn" data-pmclose>✕ Đóng</button>
    </div>
    <div class="modal-body seed-preview-modal-body">
      <div class="spm-hero-frame">
        ${safeBanner
          ? `<img class="spm-hero-img" src="${safeBanner}" alt="${escapeHtml(it.title)}" />`
          : `<div class="wsc-banner-fallback" style="height:260px;">${safeIcon ? `<img class="wsc-banner-blur" src="${safeIcon}" alt="" /><img class="wsc-banner-center-icon" src="${safeIcon}" alt="" style="width:92px;height:92px;" />` : '<span class="wsc-banner-emoji">🗺️</span>'}</div>`}
        <div class="svc-banner-overlay-bot">
          <span class="svc-coords-pill">👤 bởi ${escapeHtml(it.author || 'Creator')} • ⬇ ${dl}</span>
        </div>
      </div>
      <p class="spm-desc">${escapeHtml(displayDesc || it.description || '')}</p>
    </div>
    <div class="modal-foot" style="justify-content:flex-end;gap:8px;">
      <button class="btn-modal-cancel" data-pmclose>Đóng</button>
      <button class="btn-modal-agree" id="btnWsModalCreate">🌍 Tạo Map Chơi Ngay</button>
    </div>`, true);
  if (!card) return;
  const createBtn = card.querySelector('#btnWsModalCreate');
  if (createBtn) {
    createBtn.onclick = () => {
      packCloseModal();
      if (typeof onCreateWorld === 'function') onCreateWorld();
    };
  }
}

async function renderSeedVaultUI() {
  const grid = document.getElementById('seedVaultGrid');
  if (!grid || typeof window.aetherAPI?.getCuratedSeedsVault !== 'function') return;
  if (!cachedCuratedSeeds) {
    try {
      const res = await window.aetherAPI.getCuratedSeedsVault();
      cachedCuratedSeeds = (res?.seeds || []).map((s) => {
        const fb = INLINE_CURATED_SEEDS_FALLBACK.find((x) => x.id === s.id);
        return { ...fb, ...s, previewImage: s.previewImage || fb?.previewImage || `seeds/${s.id}.jpg` };
      });
    } catch (_) {
      cachedCuratedSeeds = INLINE_CURATED_SEEDS_FALLBACK;
    }
  }
  const seeds = cachedCuratedSeeds.length ? cachedCuratedSeeds : INLINE_CURATED_SEEDS_FALLBACK;

  grid.innerHTML = seeds.map((s, idx) => {
    const imgSrc = escapeHtml(s.previewImage || `seeds/${s.id}.jpg`);
    return `
    <div class="mod-card seed-vault-card">
      <div class="svc-banner-wrap" data-zoomseed="${idx}" title="Nhấp để phóng to ảnh bản đồ & xem chi tiết">
        <img class="svc-banner-img" src="${imgSrc}" alt="${escapeHtml(s.title)}" loading="lazy" />
        <div class="svc-banner-overlay-top">
          <span class="svc-badge-pill">🌱 ${escapeHtml(s.badge || 'Hạt giống tuyển chọn')}</span>
          <span class="svc-zoom-pill">🔍 Phóng to</span>
        </div>
        <div class="svc-banner-overlay-bot">
          <span class="svc-coords-pill">📍 ${escapeHtml(s.coordsHint || '')}</span>
        </div>
      </div>
      <div class="svc-body">
        <div class="svc-title" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</div>
        <div class="mod-desc svc-desc">${escapeHtml(s.description || '')}</div>
        <div class="svc-seed-row">
          <code class="svc-seed-code">${escapeHtml(s.seed)}</code>
          <button type="button" class="vtype-btn svc-copy-btn" data-copyseed="${idx}" title="Sao chép mã Seed này">📋 Copy Seed</button>
        </div>
        <div class="mod-card-foot svc-foot">
          <button type="button" class="vtype-btn" data-zoomseed="${idx}" title="Xem ảnh phóng to sắc nét">🖼️ Xem ảnh</button>
          <button type="button" class="btn-install-mod" data-createseed="${idx}">🌍 Tạo Map Với Seed Này</button>
        </div>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('[data-zoomseed]').forEach((el) => {
    el.onclick = () => {
      const s = seeds[Number(el.dataset.zoomseed)];
      if (s) openSeedPreviewModal(s);
    };
  });

  grid.querySelectorAll('[data-copyseed]').forEach((btn) => {
    btn.onclick = () => {
      const s = seeds[Number(btn.dataset.copyseed)];
      if (!s) return;
      window.aetherAPI.copyTextToClipboard(s.seed);
      showAetherNotification(`📋 Đã sao chép mã Seed "${s.seed}" vào khay nhớ tạm!`, 'success', 3000);
    };
  });

  grid.querySelectorAll('[data-createseed]').forEach((btn) => {
    btn.onclick = () => {
      const s = seeds[Number(btn.dataset.createseed)];
      if (!s) return;
      const cleanTitle = String(s.title || 'Thế giới mới').replace(/^[^\p{L}\p{N}]+/u, '').split('(')[0].trim().slice(0, 48);
      openQuickWorldModal(null, s.seed, cleanTitle);
    };
  });
}
window.renderSeedVaultUI = renderSeedVaultUI;

async function openWorldRescueModal(worldPath, worldTitle) {
  if (typeof window.aetherAPI?.inspectWorldDetails !== 'function') return;
  const card = packOpenModal(`
    <div class="modal-head" style="justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:8px;min-width:0;">
        <span class="card-dot emerald"></span>
        <h3 id="worldRescueTitleLabel">🛠️ Cứu Hộ &amp; Thông Tin Thế Giới — “${escapeHtml(worldTitle || 'Map')}”</h3>
      </div>
      <button class="vtype-btn" data-pmclose>✕ Đóng</button>
    </div>
    <div class="modal-body" id="worldRescueModalBody" style="overflow-x:hidden;">
      <div class="pack-modal-loading">⏳ Đang đọc dữ liệu nhị phân level.dat của thế giới...</div>
    </div>
    <div class="modal-foot" style="justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <span class="field-hint-mini">🛡️ Tự tạo bản dự phòng <code>level.dat.bw-bak</code> an toàn trước khi sửa (đóng Map trong game trước khi áp dụng).</span>
      <button class="btn-modal-cancel" data-pmclose>Đóng</button>
    </div>`, true);
  if (!card) return;

  const body = card.querySelector('#worldRescueModalBody');
  const titleEl = card.querySelector('#worldRescueTitleLabel');

  const applyPatchAndReload = async (patches, successMsg, triggerBtn) => {
    if (triggerBtn) triggerBtn.disabled = true;
    try {
      const r = await window.aetherAPI.rescuePatchWorld({
        gameDir: state.gameDir,
        worldNameOrPath: worldPath,
        patches
      });
      if (!r?.ok) {
        showAetherNotification(`⚠️ ${r?.error || 'Không thể cập nhật dữ liệu thế giới'}`, 'error', 4500);
        if (triggerBtn) triggerBtn.disabled = false;
        return;
      }
      showAetherNotification(successMsg, 'success', 4200);
      await renderLocalWorlds();
      renderDetails(r);
    } catch (err) {
      if (triggerBtn) triggerBtn.disabled = false;
      showAetherNotification(`⚠️ ${err.message}`, 'error', 4500);
    }
  };

  const renderDetails = (info) => {
    if (!info?.ok) {
      body.innerHTML = `<div class="pack-modal-msg">⚠️ Không đọc được dữ liệu thế giới: ${escapeHtml(info?.error || 'Lỗi không xác định')}</div>`;
      return;
    }
    if (titleEl && info.levelName) {
      titleEl.textContent = `🛠️ Cứu Hộ & Thông Tin Thế Giới — “${info.levelName}”`;
    }
    const p = info.playerPos;
    const sp = info.spawnPos || { x: 0, y: 72, z: 0 };
    const coordStr = p ? `${p.x}, ${p.y}, ${p.z}` : `${sp.x}, ${sp.y}, ${sp.z}`;
    const weatherLabel = info.thundering ? '⛈️ Đang giông bão' : (info.raining ? '🌧️ Đang mưa' : '☀️ Trời quang');
    const needHardcoreRevive = Boolean(info.hardcore || p?.isDead);

    body.innerHTML = `
      <div class="world-rescue-seed-bar">
        <div class="wrs-left">
          <span class="wrs-label">🌱 Hạt giống (Seed):</span>
          <code class="svc-seed-code">${escapeHtml(info.seed || 'Chưa xác định')}</code>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${info.seed ? '<button type="button" class="vtype-btn" id="btnWrCopySeed">📋 Sao chép Seed</button>' : ''}
          ${info.seed ? '<button type="button" class="btn-sync-skin" id="btnWrCloneSeed">🌍 Tạo Map Mới Từ Seed Này</button>' : ''}
        </div>
      </div>

      <div class="world-rescue-grid">
        <div class="wr-stat-tile">
          <span class="wr-stat-k">📍 Vị trí nhân vật hiện tại</span>
          <strong class="wr-stat-v">${p ? `X: ${p.x} • Y: ${p.y} • Z: ${p.z}` : `Spawn: X: ${sp.x}, Y: ${sp.y}, Z: ${sp.z}`}</strong>
          <div class="wr-stat-sub">
            <span>${escapeHtml(p ? p.dimensionLabel : 'Chưa vào thế giới lần đầu')}</span>
            <button type="button" class="vtype-btn wr-mini-copy" id="btnWrCopyCoords">📋 Copy tọa độ</button>
          </div>
        </div>
        <div class="wr-stat-tile">
          <span class="wr-stat-k">🎮 Chế độ &amp; Độ khó</span>
          <strong class="wr-stat-v">${escapeHtml(info.gameModeLabel || info.gameMode)}</strong>
          <span class="wr-stat-sub">Độ khó: <strong>${escapeHtml(info.difficultyLabel)}</strong> • MC ${escapeHtml(info.mcVersion || '?')}</span>
        </div>
        <div class="wr-stat-tile">
          <span class="wr-stat-k">⏳ Thời gian &amp; Thời tiết</span>
          <strong class="wr-stat-v">Ngày thứ ${Number(info.dayCount || 0)} (${escapeHtml(info.timePhase || 'Ban ngày')})</strong>
          <span class="wr-stat-sub">${weatherLabel}</span>
        </div>
        <div class="wr-stat-tile">
          <span class="wr-stat-k">❤️ Nhân vật &amp; Quy tắc</span>
          <strong class="wr-stat-v">${p ? `❤️ ${p.health}/20 Máu • ⭐ Cấp ${p.xpLevel}` : '❤️ 20/20 Máu (Mới tạo)'}</strong>
          <span class="wr-stat-sub">Giữ đồ: <strong>${info.keepInventory ? 'BẬT' : 'TẮT'}</strong> • Lệnh Cheat: <strong>${info.allowCommands ? 'BẬT' : 'TẮT'}</strong></span>
        </div>
      </div>

      ${needHardcoreRevive ? `
      <div class="wr-hardcore-banner">
        <div>
          <strong>💖 Cứu Hộ Khẩn Cấp Thế Giới Hardcore / Tử Trận</strong>
          <span>Gỡ khóa Hardcore, hồi đầy 20 Máu + Thức ăn, xóa trạng thái Khán giả để bạn chơi tiếp công trình tâm huyết!</span>
        </div>
        <button type="button" class="btn-fps-boost-1click" id="btnWrReviveHardcore">💖 Hồi Sinh Khỏi Hardcore Ngay</button>
      </div>` : ''}

      <div class="wr-actions-section">
        <span class="wr-sec-title">⚡ Công Cụ Cứu Hộ &amp; Chỉnh Nhanh 1-Click:</span>
        <div class="wr-actions-grid">
          <button type="button" class="btn-sync-skin ${info.allowCommands ? 'is-ok' : ''}" id="btnWrToggleCheats">
            ${info.allowCommands ? '⌨️ Dùng Lệnh (/gamemode, /tp): ĐANG BẬT' : '🔓 Mở Khóa Dùng Lệnh (/gamemode, /tp)'}
          </button>
          <button type="button" class="btn-sync-skin ${info.keepInventory ? 'is-ok' : ''}" id="btnWrToggleKeepInv">
            ${info.keepInventory ? '🎒 Giữ Đồ Khi Chết: ĐANG BẬT' : '🎒 Bật Giữ Đồ Khi Chết (KeepInventory)'}
          </button>
          <button type="button" class="btn-sync-skin" id="btnWrTeleportSpawn" title="Đưa nhân vật về lại tọa độ xuất hiện ban đầu ở Overworld khi bị kẹt dưới vực Void, dung nham hoặc lỗi Chunk">
            🏠 Đưa Nhân Vật Về Điểm Xuất Hiện (${sp.x}, ${sp.y}, ${sp.z})
          </button>
          <button type="button" class="btn-sync-skin" id="btnWrClearWeather">
            ☀️ Đặt Lại Ban Ngày &amp; Tạnh Mưa Bão
          </button>
        </div>
      </div>

      <div class="wr-actions-section">
        <span class="wr-sec-title">🎮 Đổi Nhanh Chế Độ Chơi Mặc Định:</span>
        <div class="qw-seg">
          <button type="button" class="vtype-btn ${!info.hardcore && info.gameMode === 'survival' ? 'active' : ''}" data-wrmode="survival">⚔️ Sinh tồn</button>
          <button type="button" class="vtype-btn ${info.gameMode === 'creative' ? 'active' : ''}" data-wrmode="creative">🎨 Sáng tạo</button>
          <button type="button" class="vtype-btn ${info.gameMode === 'adventure' ? 'active' : ''}" data-wrmode="adventure">🧭 Phiêu lưu</button>
          <button type="button" class="vtype-btn ${info.gameMode === 'spectator' ? 'active' : ''}" data-wrmode="spectator">👻 Khán giả</button>
        </div>
      </div>
    `;

    const bCopySeed = body.querySelector('#btnWrCopySeed');
    if (bCopySeed) {
      bCopySeed.onclick = () => {
        window.aetherAPI.copyTextToClipboard(info.seed);
        showAetherNotification(`📋 Đã sao chép Seed "${info.seed}"!`, 'success', 2800);
      };
    }
    const bCloneSeed = body.querySelector('#btnWrCloneSeed');
    if (bCloneSeed) {
      bCloneSeed.onclick = () => {
        packCloseModal();
        openQuickWorldModal(null, info.seed, `${info.levelName || 'Bản sao'} (Mới)`.slice(0, 38));
      };
    }
    const bCopyCoords = body.querySelector('#btnWrCopyCoords');
    if (bCopyCoords) {
      bCopyCoords.onclick = () => {
        window.aetherAPI.copyTextToClipboard(coordStr);
        showAetherNotification(`📋 Đã sao chép tọa độ "${coordStr}"!`, 'success', 2800);
      };
    }
    const bRevive = body.querySelector('#btnWrReviveHardcore');
    if (bRevive) {
      bRevive.onclick = () => applyPatchAndReload(
        { reviveHardcore: true, allowCommands: true },
        `💖 Đã hồi sinh nhân vật khỏi Hardcore (20/20 Máu, Chế độ Sinh tồn) trong "${info.levelName}"!`,
        bRevive
      );
    }
    const bCheats = body.querySelector('#btnWrToggleCheats');
    if (bCheats) {
      bCheats.onclick = () => applyPatchAndReload(
        { allowCommands: !info.allowCommands },
        info.allowCommands ? '🔒 Đã tắt quyền dùng lệnh Cheat trong thế giới.' : '🔓 Đã mở khóa dùng lệnh (/gamemode, /tp, /locate...) trong thế giới!',
        bCheats
      );
    }
    const bKeep = body.querySelector('#btnWrToggleKeepInv');
    if (bKeep) {
      bKeep.onclick = () => applyPatchAndReload(
        { keepInventory: !info.keepInventory },
        info.keepInventory ? '🎒 Đã tắt Giữ đồ khi chết.' : '🎒 Đã bật Giữ đồ khi chết (keepInventory = true) cho thế giới!',
        bKeep
      );
    }
    const bTpSpawn = body.querySelector('#btnWrTeleportSpawn');
    if (bTpSpawn) {
      bTpSpawn.onclick = () => applyPatchAndReload(
        { teleportToSpawn: true },
        `🏠 Đã đưa nhân vật an toàn về Điểm xuất hiện (${sp.x}, ${sp.y}, ${sp.z}) tại Overworld!`,
        bTpSpawn
      );
    }
    const bWeather = body.querySelector('#btnWrClearWeather');
    if (bWeather) {
      bWeather.onclick = () => applyPatchAndReload(
        { clearWeatherAndDay: true },
        '☀️ Đã đặt lại bình minh trời quang tạnh mưa cho thế giới!',
        bWeather
      );
    }
    body.querySelectorAll('[data-wrmode]').forEach((btn) => {
      btn.onclick = () => {
        const m = btn.dataset.wrmode;
        applyPatchAndReload({ gameMode: m }, `🎮 Đã chuyển thế giới sang chế độ ${btn.textContent.trim()}!`, btn);
      };
    });
  };

  try {
    const info = await window.aetherAPI.inspectWorldDetails({
      gameDir: state.gameDir,
      worldNameOrPath: worldPath
    });
    renderDetails(info);
  } catch (err) {
    body.innerHTML = `<div class="pack-modal-msg">⚠️ ${escapeHtml(err.message)}</div>`;
  }
}
window.openWorldRescueModal = openWorldRescueModal;

/* ---------- Upgrade 4: 1-Click Replay & TikTok Cam Studio ---------- */
let cachedReplayVideosFolder = '';

async function refreshReplayStudioUI() {
  const badge = document.getElementById('replayStudioBadge');
  const btnInstall = document.getElementById('btnInstallReplayStudio');
  if (!badge || typeof window.aetherAPI?.getReplayStudioStatus !== 'function') return;
  try {
    const st = await window.aetherAPI.getReplayStudioStatus({
      gameDir: state.gameDir,
      instanceDir: state.modTargetInstanceDir || ''
    });
    if (st?.videosFolder) cachedReplayVideosFolder = st.videosFolder;
    if (st?.equipped) {
      const ffLabel = st.ffmpegReady ? 'Xuất MP4 Sẵn sàng' : 'Chưa cài bộ xuất MP4';
      const recBadge = st.recordingsCount > 0 ? ` • ${st.recordingsCount} Bản quay` : '';
      badge.textContent = `🟢 ${st.activeReplayMod}${st.hasFreecam ? ' + Freecam' : ''} • ${ffLabel}${recBadge}`;
      if (btnInstall) {
        btnInstall.textContent = st.ffmpegReady
          ? `✓ Đã Trang Bị ${st.activeReplayMod} & Xuất MP4 (Bấm Cài Lại / Cập Nhật)`
          : `🎬 Bổ Sung Bộ Kết Xuất Video MP4 Tự Động`;
      }
    } else {
      badge.textContent = st?.ffmpegReady ? 'Sẵn sàng bộ xuất MP4 • Chưa gắn Mod quay' : 'Sẵn sàng trang bị 1-Click';
      if (btnInstall) {
        btnInstall.textContent = '🎬 Trang Bị Bộ Quay Phim 3D & Xuất Video MP4';
      }
    }
  } catch (_) {}
}
window.refreshReplayStudioUI = refreshReplayStudioUI;
window.refreshPvpAndReplayStates = () => {
  refreshPvpModeUI();
  refreshReplayStudioUI();
};

function initV407FeaturesUI() {
  // 1. Seed Vault Sub-Tab in #tab-worlds
  const btnWSeeds = document.getElementById('btnWorldsViewSeeds');
  if (btnWSeeds) btnWSeeds.onclick = () => switchWorldsSubView('seeds');

  // 2. Online Skin Hub & Co-op Friend Skin Sync in #tab-skin
  const btnSkinSearch = document.getElementById('btnOnlineSkinSearch');
  const inpSkinSearch = document.getElementById('onlineSkinSearchInput');
  if (btnSkinSearch) btnSkinSearch.onclick = () => loadOnlineSkinHubUI(true);
  if (inpSkinSearch) {
    inpSkinSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadOnlineSkinHubUI(true);
    });
  }
  document.querySelectorAll('#onlineSkinCatBar [data-skincat]').forEach((chip) => {
    chip.onclick = () => {
      document.querySelectorAll('#onlineSkinCatBar [data-skincat]').forEach((c) => c.classList.toggle('active', c === chip));
      onlineSkinHubState.category = chip.dataset.skincat || 'popular';
      if (inpSkinSearch) inpSkinSearch.value = '';
      loadOnlineSkinHubUI(true);
    };
  });
  const btnSkinNext = document.getElementById('btnOnlineSkinNextPage');
  if (btnSkinNext) {
    btnSkinNext.onclick = () => {
      onlineSkinHubState.page = ((onlineSkinHubState.page || 1) % 12) + 1;
      loadOnlineSkinHubUI(false);
    };
  }

  const btnFriendSkin = document.getElementById('btnInstallFriendSkinSync');
  if (btnFriendSkin && typeof window.aetherAPI?.installFriendSkinSync === 'function') {
    btnFriendSkin.onclick = async () => {
      let targetCore = state.selectedCore || 'fabric';
      if (!state.modTargetInstanceDir && (targetCore === 'vanilla' || targetCore === 'legacyfabric')) {
        targetCore = 'fabric';
        if (typeof window.selectMcVersionAndCore === 'function') {
          await window.selectMcVersionAndCore(state.selectedVersion || '1.21.4', 'fabric');
        }
      }
      const orig = btnFriendSkin.textContent;
      btnFriendSkin.disabled = true;
      btnFriendSkin.textContent = '⏳ Đang cài CustomSkinLoader + Lớp Áo 3D + Capes...';
      try {
        const friendNames = Array.from(new Set([
          getCurrentActivePlayerName(),
          ...(Array.isArray(state.savedAccounts) ? state.savedAccounts : [])
        ]));
        const r = await window.aetherAPI.installFriendSkinSync({
          gameDir: state.gameDir,
          instanceDir: state.modTargetInstanceDir || '',
          mcVersion: state.selectedVersion || '1.21.4',
          loaderType: targetCore,
          friendNames
        });
        await refreshLocalAddonsCount();
        if (r?.ok) {
          showAetherNotification(
            `🤝 Đã trang bị đồng bộ Skin đa người chơi (${r.installed.length} gói)! Khi chơi chung LAN / e4mc / Mã Phòng, bạn bè sẽ thấy đúng Skin & Lớp áo 3D riêng của nhau (không bị trùng Steve/Alex)!`,
            'success',
            5800
          );
        } else {
          showAetherNotification(`ℹ️ Phiên bản MC ${state.selectedVersion} chưa có bản CustomSkinLoader tương ứng trên Modrinth.`, 'info', 4500);
        }
      } catch (err) {
        showAetherNotification(`⚠️ ${err.message}`, 'error', 4500);
      } finally {
        btnFriendSkin.disabled = false;
        btnFriendSkin.textContent = orig;
      }
    };
  }

  // 3. Lunar-Style PvP Mode Toggle in #tab-servers & #tab-tools
  const btnPvpMain = document.getElementById('btnTogglePvpClientMode');
  if (btnPvpMain) btnPvpMain.onclick = () => handleTogglePvpModeClick(btnPvpMain);
  const btnPvpTool = document.getElementById('btnToolsPvpQuickToggle');
  if (btnPvpTool) btnPvpTool.onclick = () => handleTogglePvpModeClick(btnPvpTool);

  // 4. Replay Studio & Cinematic Cam in #tab-tools
  const btnInstallReplay = document.getElementById('btnInstallReplayStudio');
  if (btnInstallReplay && typeof window.aetherAPI?.installReplayStudioPack === 'function') {
    btnInstallReplay.onclick = async () => {
      let targetCore = state.selectedCore || 'fabric';
      if (!state.modTargetInstanceDir && (targetCore === 'vanilla' || targetCore === 'legacyfabric')) {
        targetCore = 'fabric';
        if (typeof window.selectMcVersionAndCore === 'function') {
          await window.selectMcVersionAndCore(state.selectedVersion || '1.21.4', 'fabric');
        }
      }
      const orig = btnInstallReplay.textContent;
      btnInstallReplay.disabled = true;
      btnInstallReplay.textContent = '⏳ Đang cài Flashback / ReplayMod + Freecam + Bộ xuất MP4...';
      try {
        const r = await window.aetherAPI.installReplayStudioPack({
          gameDir: state.gameDir,
          instanceDir: state.modTargetInstanceDir || '',
          mcVersion: state.selectedVersion || '1.21.4',
          loaderType: targetCore,
          installFfmpeg: true
        });
        await refreshLocalAddonsCount();
        await refreshReplayStudioUI();
        if (r?.ok) {
          showAetherNotification(
            `🎬 Đã trang bị Studio Quay Phim 3D (${r.installed.join(', ')}) ${r.ffmpegReady ? 'kèm Bộ xuất Video MP4 tự động' : ''}! Vào game chơi xong mở mục Replays ngoài Menu để xoay góc máy điện ảnh và xuất clip!`,
            'success',
            6000
          );
        } else {
          btnInstallReplay.textContent = orig;
          showAetherNotification(`ℹ️ Phiên bản MC ${state.selectedVersion} (${targetCore.toUpperCase()}) hiện chưa có bản Flashback / ReplayMod trên Modrinth. Bạn hãy thử chọn Fabric 1.21.4 hoặc 1.21.1 nhé!`, 'info', 5200);
        }
      } catch (err) {
        btnInstallReplay.textContent = orig;
        showAetherNotification(`⚠️ ${err.message}`, 'error', 4500);
      } finally {
        btnInstallReplay.disabled = false;
      }
    };
  }

  const btnOpenReplayDir = document.getElementById('btnOpenReplayVideosDir');
  if (btnOpenReplayDir) {
    btnOpenReplayDir.onclick = async () => {
      const st = await window.aetherAPI.getReplayStudioStatus({
        gameDir: state.gameDir,
        instanceDir: state.modTargetInstanceDir || ''
      });
      const targetFolder = st?.videosFolder || cachedReplayVideosFolder || state.gameDir;
      window.aetherAPI.openGameDir(targetFolder);
    };
  }

  setTimeout(() => {
    refreshPvpModeUI();
    refreshReplayStudioUI();
  }, 850);
}

/* ===================== v40.8 PRO — KÉO-THẢ CÀI MỌI THỨ (Mod • Shader • Resource Pack • Map • Modpack) ===================== */
function initUniversalDropUI() {
  let overlay = document.getElementById('bwDropOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'bwDropOverlay';
    overlay.className = 'bw-drop-overlay hidden';
    overlay.innerHTML = `<div class="bw-drop-card">
      <div class="bw-drop-icon">📥</div>
      <div class="bw-drop-title">Thả file vào đây để cài tự động</div>
      <div class="bw-drop-sub">Mod &amp; OptiFine <code>.jar</code> • Shader / Resource Pack <code>.zip</code> • Map <code>.zip</code> • Modpack <code>.mrpack</code></div>
    </div>`;
    document.body.appendChild(overlay);
  }
  let dragDepth = 0;
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  const hide = () => { dragDepth = 0; overlay.classList.add('hidden'); };
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    dragDepth += 1;
    overlay.classList.remove('hidden');
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) overlay.classList.add('hidden');
  });
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); // never let Electron navigate to the dropped file
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('drop', async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    hide();
    if (e.__bwHandled) return; // a specific drop zone (e.g. Worlds card) already took it
    const files = Array.from(e.dataTransfer?.files || []);
    const paths = files.map((f) => (window.aetherAPI.getPathForFile ? window.aetherAPI.getPathForFile(f) : f.path)).filter(Boolean);
    if (!paths.length) return;
    await installDroppedPathsUI(paths);
  });
}

async function installDroppedPathsUI(paths) {
  if (!window.aetherAPI.installDroppedFiles) return;
  const instanceDir = state.modTargetInstanceDir || '';
  showAetherNotification(`📥 Đang nhận diện & cài ${paths.length} file...`, 'info', 2500);
  const res = await window.aetherAPI.installDroppedFiles({
    gameDir: state.gameDir,
    instanceDir,
    filePaths: paths,
    currentLoader: state.selectedCore || 'vanilla',
    currentMcVersion: state.selectedVersion || '1.21.4'
  });
  const results = res?.results || [];
  const okMsgs = [];
  let needFabricForShader = false;
  let pendingOptifineChoice = null;
  for (const r of results) {
    if (r.kind === 'mrpack' && r.deferred && r.filePath) {
      if (packHub.installing) { packNotify('⏳ Đang cài một gói khác...', 'error'); continue; }
      packHub.installing = true;
      packShowProgress(`📦 Đang nhập Modpack ${r.fileName}...`, 1);
      const pr = await window.aetherAPI.packsImportFile({ filePath: r.filePath, gameDir: state.gameDir });
      packHub.installing = false;
      handlePackInstallResult(pr, r.fileName);
      continue;
    }
    if (!r.ok) {
      showAetherNotification(`⚠️ ${r.fileName || 'File'}: ${r.error || 'Không cài được'}`, 'error', 6000);
      continue;
    }
    if (r.kind === 'optifine-choice') {
      pendingOptifineChoice = r;
      continue;
    }
    if (r.kind === 'optifine-forge') {
      if (!instanceDir && r.mcVersion && r.mcVersion !== state.selectedVersion && typeof window.selectMcVersionAndCore === 'function') {
        try { await window.selectMcVersionAndCore(r.mcVersion, 'forge'); } catch (_) {}
      }
      const parkedTag = (r.parkedMods || []).length ? ` (đã tạm tắt ${r.parkedMods.length} Mod trùng render)` : '';
      okMsgs.push(`🔆 OptiFine ${r.fileName}${parkedTag}`);
    } else if (r.kind === 'mod') {
      const core = String(state.selectedCore || 'vanilla').toLowerCase();
      const loaders = (r.loaders || []).map((l) => String(l).toLowerCase());
      const mismatch = loaders.length && !instanceDir && core !== 'vanilla' && !loaders.includes(core) && !((core === 'quilt' || core === 'optifine') && loaders.includes('fabric'));
      okMsgs.push(`🧩 Mod ${r.fileName}${loaders.length ? ` (${loaders.join('/')})` : ''}${mismatch ? ` ⚠ bạn đang chọn ${core.toUpperCase()}` : ''}`);
    } else if (r.kind === 'shader') {
      okMsgs.push(`✨ Shader ${r.fileName} (đã bật sẵn)`);
      if (!instanceDir && String(state.selectedCore || 'vanilla').toLowerCase() === 'vanilla') needFabricForShader = true;
    } else if (r.kind === 'resourcepack') {
      okMsgs.push(`🎨 Resource Pack ${r.fileName} (đã bật sẵn)`);
    } else if (r.kind === 'world') {
      okMsgs.push(`🗺️ Map ${r.worldName || r.fileName}`);
    }
  }
  if (needFabricForShader && typeof window.selectMcVersionAndCore === 'function') {
    try { await window.selectMcVersionAndCore(state.selectedVersion, 'optifine'); } catch (_) {}
    okMsgs.push('🔆 Đã bật Core OptiFine để tự động chạy Shader');
  }
  if (okMsgs.length) showAetherNotification(`✅ Đã cài: ${okMsgs.join(' • ')}`, 'success', 6500);
  if (pendingOptifineChoice) {
    openOptifineHubModal(pendingOptifineChoice);
  }
  try {
    if (typeof refreshLocalAddonsCount === 'function') await refreshLocalAddonsCount();
    if (results.some((r) => r.kind === 'world' && r.ok) && typeof renderLocalWorlds === 'function') renderLocalWorlds();
  } catch (_) {}
}
window.installDroppedPathsUI = installDroppedPathsUI;

/* ===================== v41.0.0 PRO SIGNATURE FEATURE — ⚡ TURBO SMOOTH CORE™ (6-LAYER DEEP GAME FILE OPTIMIZER) ===================== */
const DS_ALL_LAYERS = ['vanilla_io', 'optifine', 'sodium', 'modernfix', 'culling_hud', 'jvm_lowlatency'];

function getDeepSmoothProfileLabelVi(profile) {
  if (profile === 'esports') return '⚡ Siêu Mượt PvP';
  if (profile === 'ultra_low') return '🚀 Cứu Máy Yếu';
  return '🍃 Mượt Êm Chuẩn';
}

async function refreshDeepSmoothBadgesUI(customInstanceDir = null) {
  if (typeof window.aetherAPI?.inspectDeepSmooth !== 'function') return null;
  const instanceDir = customInstanceDir !== null ? customInstanceDir : (state.modTargetInstanceDir || '');
  try {
    const st = await window.aetherAPI.inspectDeepSmooth({
      gameDir: state.gameDir,
      instanceDir,
      loaderType: state.selectedCore || 'fabric'
    });
    if (!st?.ok) return null;

    const autoOn = state.deepSmoothEngine !== false;
    const profLabel = getDeepSmoothProfileLabelVi(st.isOptimized ? st.activeProfile : (state.deepSmoothProfile || 'balanced'));
    const toolsBadge = document.getElementById('toolsDeepSmoothBadge');
    if (toolsBadge) {
      if (st.isOptimized) {
        toolsBadge.textContent = `🟢 Đã can thiệp ${st.touchedCount || 5} tệp (${profLabel})`;
        toolsBadge.classList.add('is-active');
      } else {
        toolsBadge.textContent = autoOn ? `🟢 Tự bật khi Chơi • ${profLabel}` : '⚪ Đang tắt tự động';
        toolsBadge.classList.toggle('is-active', autoOn);
      }
    }

    const btnQuickRev = document.getElementById('btnToolsQuickRevertDeepSmooth');
    if (btnQuickRev) {
      btnQuickRev.classList.toggle('hidden', !(st.hasBackup || st.isOptimized));
    }

    const heroBtn = document.getElementById('btnHeroTurboSmooth');
    if (heroBtn) {
      heroBtn.textContent = st.isOptimized
        ? `⚡ Turbo Smooth™: ${st.touchedCount || 5} tệp`
        : (autoOn ? '⚡ Turbo Smooth™ • BẬT' : '⚡ Turbo Smooth™');
      heroBtn.classList.toggle('is-active', Boolean(st.isOptimized || autoOn));
    }

    const sysBtn = document.getElementById('btnSysOptimize');
    if (sysBtn) {
      sysBtn.textContent = st.isOptimized ? `⚡ Đã mượt (${st.touchedCount || 5}) >` : '⚡ File Mượt >';
    }
    return st;
  } catch (_) {
    return null;
  }
}
window.refreshDeepSmoothBadgesUI = refreshDeepSmoothBadgesUI;

async function populateDeepSmoothTargetSelect(selectEl, preferredDir = '') {
  if (!selectEl) return;
  let instances = [];
  try {
    if (typeof window.aetherAPI?.packsInstances === 'function') {
      const r = await window.aetherAPI.packsInstances(state.gameDir);
      instances = Array.isArray(r?.items) ? r.items : (Array.isArray(r) ? r : []);
    }
  } catch (_) {}

  const esc = typeof window.escapeHtml === 'function' ? window.escapeHtml : (s) => String(s ?? '');
  const mcLbl = `${state.selectedVersion || '1.21.4'} • ${String(state.selectedCore || 'fabric').toUpperCase()}`;
  let html = `<option value="">🏠 Thư mục chính (MC ${esc(mcLbl)})</option>`;
  for (const inst of instances) {
    if (!inst?.dir) continue;
    const tag = `${inst.name || 'Modpack'} (MC ${inst.mcVersion || '?'} • ${String(inst.loader || 'mod').toUpperCase()})`;
    html += `<option value="${esc(inst.dir)}">📦 ${esc(tag)}</option>`;
  }
  selectEl.innerHTML = html;
  if (preferredDir && [...selectEl.options].some((o) => o.value === preferredDir)) {
    selectEl.value = preferredDir;
  } else {
    selectEl.value = '';
  }
}

async function openDeepSmoothStudioModal(preferredInstanceDir = null) {
  const modal = document.getElementById('deepSmoothStudioModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  const selTarget = document.getElementById('dsTargetDirSelect');
  const startInstance = preferredInstanceDir !== null ? preferredInstanceDir : (state.modTargetInstanceDir || '');
  await populateDeepSmoothTargetSelect(selTarget, startInstance);

  const syncModalStateFromDisk = async () => {
    const instDir = selTarget?.value || '';
    const st = await window.aetherAPI.inspectDeepSmooth({
      gameDir: state.gameDir,
      instanceDir: instDir,
      loaderType: state.selectedCore || 'fabric'
    });
    if (!st?.ok) return;

    const activeProf = st.isOptimized ? st.activeProfile : (state.deepSmoothProfile || 'balanced');
    document.querySelectorAll('#dsProfilesGrid .ds-profile-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.dsprofile === activeProf);
    });

    const curLayers = Array.isArray(state.deepSmoothLayers) && state.deepSmoothLayers.length
      ? state.deepSmoothLayers
      : (Array.isArray(st.activeLayers) && st.activeLayers.length ? st.activeLayers : DS_ALL_LAYERS);
    document.querySelectorAll('#dsLayersGrid input[data-dslayer]').forEach((chk) => {
      const on = curLayers.includes(chk.dataset.dslayer);
      chk.checked = on;
      chk.closest('.ds-layer-card')?.classList.toggle('is-checked', on);
    });

    const chkAuto = document.getElementById('dsAutoOnLaunchCheck');
    if (chkAuto) chkAuto.checked = state.deepSmoothEngine !== false;

    const liveBadge = document.getElementById('dsLiveStateBadge');
    if (liveBadge) {
      if (st.isOptimized) {
        liveBadge.textContent = `🟢 Đã tối ưu ${st.touchedCount || st.touchedFiles?.length || 5} tệp • ${getDeepSmoothProfileLabelVi(st.activeProfile)}`;
        liveBadge.classList.add('is-active');
      } else {
        liveBadge.textContent = '⚪ Nguyên bản';
        liveBadge.classList.remove('is-active');
      }
    }

    const shaderPill = document.getElementById('dsShaderGuardPill');
    if (shaderPill) {
      if (st.shaderGuardActive && st.activeShader) {
        shaderPill.textContent = '🛡️ Đang bảo vệ Shader';
        shaderPill.title = `Phát hiện gói Shader "${st.activeShader}" — tự giữ Fast Render = TẮT để chống lỗi đen màn hình`;
        shaderPill.classList.remove('hidden');
      } else {
        shaderPill.classList.add('hidden');
      }
    }

    const sodTag = document.getElementById('dsLayerTagSodium');
    if (sodTag) {
      sodTag.textContent = st.env?.hasEmbeddium ? '2 tệp .json' : 'sodium.json';
    }
    const ofDesc = document.getElementById('dsLayerDescOptifine');
    if (ofDesc) {
      if (st.shaderGuardActive && st.activeShader) {
        const esc = typeof window.escapeHtml === 'function' ? window.escapeHtml : (s) => String(s ?? '');
        ofDesc.innerHTML = `🛡️ Đang bật Shader <strong>${esc(st.activeShader)}</strong>: tự giữ Fast Render tắt để chống đen hình &amp; tối ưu hoạt ảnh.`;
      } else {
        ofDesc.textContent = 'Mở kết xuất vùng nhanh, hoạt ảnh thông minh & tự khóa Fast Render nếu bật Shader.';
      }
    }

    const btnRev = document.getElementById('btnDsRevertNow');
    if (btnRev) {
      btnRev.disabled = !(st.hasBackup || st.isOptimized);
    }

    const fb = document.getElementById('dsFeedbackBanner');
    if (fb) {
      const esc = typeof window.escapeHtml === 'function' ? window.escapeHtml : (s) => String(s ?? '');
      if (st.isOptimized && Array.isArray(st.touchedFiles) && st.touchedFiles.length) {
        fb.classList.add('is-tuned');
        const shortFiles = st.touchedFiles.map((f) => `<span class="ds-file-chip">${esc(f.replace(/^config\//, ''))}</span>`).join(' ');
        fb.innerHTML = `✅ <strong>Đang kích hoạt ${esc(getDeepSmoothProfileLabelVi(st.activeProfile))}:</strong> Đã tối ưu <strong>${st.touchedFiles.length} tệp</strong> ${shortFiles} — bấm <strong>Khôi phục gốc</strong> bất kỳ lúc nào!`;
      } else {
        fb.classList.remove('is-tuned');
        fb.innerHTML = '🛡️ <strong>An toàn 100%:</strong> Tự lưu bản gốc trước khi tối ưu — bấm <strong>Khôi phục gốc</strong> bất kỳ lúc nào để trả lại nguyên trạng mà không mất Phím tắt hay Thế giới.';
      }
    }
  };

  await syncModalStateFromDisk();
  modal.__syncFromDisk = syncModalStateFromDisk;
}
window.openDeepSmoothStudioModal = openDeepSmoothStudioModal;

function initV410TurboSmoothUI() {
  const modal = document.getElementById('deepSmoothStudioModal');
  if (!modal || modal.__dsBound) return;
  modal.__dsBound = true;

  const closeDsModal = () => modal.classList.add('hidden');
  document.getElementById('btnDsCloseTop')?.addEventListener('click', closeDsModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeDsModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeDsModal();
  });

  // Entry buttons across Home, Play, Mods & Tools
  ['btnHeroTurboSmooth', 'btnPlayTurboSmooth', 'btnModsTurboSmooth', 'btnToolsOpenDeepSmooth'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => openDeepSmoothStudioModal());
  });

  const selTarget = document.getElementById('dsTargetDirSelect');
  selTarget?.addEventListener('change', () => {
    if (typeof modal.__syncFromDisk === 'function') modal.__syncFromDisk();
  });

  const chkAuto = document.getElementById('dsAutoOnLaunchCheck');
  chkAuto?.addEventListener('change', (e) => {
    state.deepSmoothEngine = Boolean(e.target.checked);
    if (typeof window.syncAutoBackupAndDiscordUI === 'function') window.syncAutoBackupAndDiscordUI();
    saveCurrentConfig();
    refreshDeepSmoothBadgesUI();
  });

  document.querySelectorAll('#dsProfilesGrid .ds-profile-card').forEach((card) => {
    card.addEventListener('click', () => {
      const chosen = card.dataset.dsprofile || 'balanced';
      state.deepSmoothProfile = chosen;
      document.querySelectorAll('#dsProfilesGrid .ds-profile-card').forEach((c) => c.classList.toggle('active', c === card));
      saveCurrentConfig();
      refreshDeepSmoothBadgesUI();
    });
  });

  const collectCheckedLayers = () => {
    const out = [];
    document.querySelectorAll('#dsLayersGrid input[data-dslayer]').forEach((chk) => {
      if (chk.checked) out.push(chk.dataset.dslayer);
    });
    return out;
  };

  document.querySelectorAll('#dsLayersGrid input[data-dslayer]').forEach((chk) => {
    chk.addEventListener('change', () => {
      const checked = collectCheckedLayers();
      if (!checked.length) {
        chk.checked = true;
        showAetherNotification('ℹ️ Hãy giữ ít nhất 1 tầng tối ưu được chọn (hoặc dùng nút Khôi Phục Nguyên Bản để hoàn tác).', 'info', 3200);
        return;
      }
      chk.closest('.ds-layer-card')?.classList.toggle('is-checked', chk.checked);
      state.deepSmoothLayers = checked;
      saveCurrentConfig();
    });
  });

  document.getElementById('btnDsSelectAllLayers')?.addEventListener('click', () => {
    document.querySelectorAll('#dsLayersGrid input[data-dslayer]').forEach((chk) => {
      chk.checked = true;
      chk.closest('.ds-layer-card')?.classList.add('is-checked');
    });
    state.deepSmoothLayers = [...DS_ALL_LAYERS];
    saveCurrentConfig();
  });

  document.getElementById('btnDsTrimRam')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (typeof window.runLauncherRamTrim === 'function') {
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ Đang dọn RAM...';
      await window.runLauncherRamTrim(btn, null);
      btn.disabled = false;
      btn.textContent = '✓ Đã dọn sạch RAM!';
      setTimeout(() => { btn.textContent = orig; }, 1600);
    }
  });

  document.getElementById('btnDsOpenConfigDir')?.addEventListener('click', () => {
    const instDir = selTarget?.value || '';
    const targetRoot = instDir || state.gameDir;
    window.aetherAPI.openSubFolder(targetRoot, 'config');
  });

  const executeApply = async (instanceDir, triggerBtn) => {
    if (typeof window.aetherAPI?.applyDeepSmooth !== 'function') return;
    const chosenProfile = state.deepSmoothProfile || 'balanced';
    const chosenLayers = Array.isArray(state.deepSmoothLayers) && state.deepSmoothLayers.length
      ? state.deepSmoothLayers
      : [...DS_ALL_LAYERS];
    const origText = triggerBtn?.textContent || '';
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.textContent = '⏳ Đang can thiệp sâu tệp cấu hình...';
    }
    const res = await window.aetherAPI.applyDeepSmooth({
      gameDir: state.gameDir,
      instanceDir: instanceDir || '',
      profile: chosenProfile,
      layers: chosenLayers,
      loaderType: state.selectedCore || 'fabric',
      autoLaunch: false
    });
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.textContent = origText;
    }
    if (res?.ok) {
      if (typeof modal.__syncFromDisk === 'function' && !modal.classList.contains('hidden')) {
        await modal.__syncFromDisk();
      }
      await refreshDeepSmoothBadgesUI();
      const count = res.touchedFiles?.length || 0;
      const shaderNote = res.shaderGuardActive ? ' • Bảo vệ Shader' : '';
      showAetherNotification(
        `⚡ Turbo Smooth Core™: Đã can thiệp mượt ${count} tệp (${getDeepSmoothProfileLabelVi(res.profile)}${shaderNote})!`,
        'success',
        4500
      );
    } else {
      showAetherNotification(`⚠️ Không thể ghi tệp tối ưu: ${res?.error || 'Lỗi không xác định'}`, 'error', 4500);
    }
  };

  const executeRevert = async (instanceDir, triggerBtn) => {
    if (typeof window.aetherAPI?.revertDeepSmooth !== 'function') return;
    const origText = triggerBtn?.textContent || '';
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.textContent = '⏳ Đang hoàn tác file gốc...';
    }
    const res = await window.aetherAPI.revertDeepSmooth({
      gameDir: state.gameDir,
      instanceDir: instanceDir || ''
    });
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.textContent = origText;
    }
    if (res?.ok) {
      if (typeof modal.__syncFromDisk === 'function' && !modal.classList.contains('hidden')) {
        await modal.__syncFromDisk();
      }
      await refreshDeepSmoothBadgesUI();
      showAetherNotification(
        res.nothingToRevert
          ? 'ℹ️ Thư mục này đang ở trạng thái nguyên bản (chưa có tệp nào cần hoàn tác).'
          : `↩️ Đã khôi phục nguyên trạng 100% (${res.totalReverted} tệp cấu hình gốc) — giữ nguyên toàn bộ Phím tắt & Thế giới!`,
        'success',
        4800
      );
    } else {
      showAetherNotification(`⚠️ Không thể hoàn tác: ${res?.error || 'Lỗi không xác định'}`, 'error', 4500);
    }
  };

  document.getElementById('btnDsApplyNow')?.addEventListener('click', (e) => {
    executeApply(selTarget?.value || '', e.currentTarget);
  });
  document.getElementById('btnDsRevertNow')?.addEventListener('click', (e) => {
    executeRevert(selTarget?.value || '', e.currentTarget);
  });
  document.getElementById('btnToolsQuickApplyDeepSmooth')?.addEventListener('click', (e) => {
    executeApply(state.modTargetInstanceDir || '', e.currentTarget);
  });
  document.getElementById('btnToolsQuickRevertDeepSmooth')?.addEventListener('click', (e) => {
    executeRevert(state.modTargetInstanceDir || '', e.currentTarget);
  });

  setTimeout(() => {
    refreshDeepSmoothBadgesUI();
  }, 600);
}

// =========================================================================
// v41.2.0 PRO: 5 OPT-IN POWER UPGRADES UI CONTROLLER
// 1. Headless Local Server Studio (#localServerStudioModal) + Hardware Advisor
// 2. Visual & Audio Boost Studio (#visualBoostStudioModal)
// 3. Screenshot Studio 2.0 Framed Copy (above)
// 4. Backup & Restore Controls + Servers (prefs:export / prefs:import)
// 5. Async Multi-Core Worldgen Boost (worldgenBoost:install)
// =========================================================================

let localServerRunningState = false;

async function refreshLocalServerStudioModalUI() {
  const modal = document.getElementById('localServerStudioModal');
  if (!modal || !window.aetherAPI.inspectLocalServer) return;
  const res = await window.aetherAPI.inspectLocalServer({ gameDir: state.gameDir });
  if (!res?.ok) return;

  localServerRunningState = Boolean(res.running);
  const hw = res.hardware || {};
  const banner = document.getElementById('lsHardwareAdviceBanner');
  const titleEl = document.getElementById('lsHwTitle');
  const msgEl = document.getElementById('lsHwMessage');
  const iconEl = document.getElementById('lsHwIcon');

  const tier = hw.tier || hw.level || 'medium';
  if (banner) {
    banner.classList.remove('is-low', 'is-medium', 'is-high');
    if (tier === 'low') {
      banner.classList.add('is-low');
      if (iconEl) iconEl.textContent = '⚠️';
    } else if (tier === 'high') {
      banner.classList.add('is-high');
      if (iconEl) iconEl.textContent = '✅';
    } else {
      banner.classList.add('is-medium');
      if (iconEl) iconEl.textContent = '💡';
    }
  }
  if (titleEl && (hw.badgeVi || hw.title)) titleEl.textContent = hw.badgeVi || hw.title;
  if (msgEl && (hw.adviceVi || hw.advice)) msgEl.textContent = hw.adviceVi || hw.advice;

  // Populate singleplayer worlds dropdown
  const worldSel = document.getElementById('lsWorldSource');
  const worldList = Array.isArray(res.worlds) ? res.worlds : (Array.isArray(res.singleplayerWorlds) ? res.singleplayerWorlds : []);
  if (worldSel) {
    const prevVal = worldSel.value;
    const opts = ['<option value="">🌱 Tạo thế giới Server mới (hoặc giữ world hiện tại)</option>'];
    for (const w of worldList) {
      const fName = w.folderName || w.folder || '';
      const dName = w.displayName || w.name || fName;
      opts.push(`<option value="${escapeHtml(fName)}">🗺️ Copy từ Chơi Đơn: ${escapeHtml(dName)} (${escapeHtml(fName)})</option>`);
    }
    worldSel.innerHTML = opts.join('');
    if (prevVal && Array.from(worldSel.options).some((o) => o.value === prevVal)) {
      worldSel.value = prevVal;
    }
  }

  // Sync version selector with current launcher version if available
  const verSel = document.getElementById('lsMcVersion');
  if (verSel && !localServerRunningState) {
    const curVer = res.meta?.mcVersion || state.selectedVersion || '1.21.4';
    if (Array.from(verSel.options).some((o) => o.value === curVer)) {
      verSel.value = curVer;
    }
  }

  // Sync RAM slider recommended default if not running
  const ramRange = document.getElementById('lsRamRange');
  const ramLabel = document.getElementById('lsRamValLabel');
  const recRamMB = hw.recommendedRamGB ? Math.round(hw.recommendedRamGB * 1024) : (hw.recommendedServerRamMB || 2048);
  if (ramRange && !localServerRunningState && recRamMB && !ramRange.dataset.userTouched) {
    ramRange.value = String(recRamMB);
    if (ramLabel) ramLabel.textContent = `${recRamMB} MB (${(recRamMB / 1024).toFixed(1)} GB)`;
  }

  updateLocalServerLivePillUI({
    running: res.running,
    pid: res.pid,
    mcVersion: res.meta?.mcVersion || state.selectedVersion || '1.21.4',
    port: res.meta?.port || res.savedProps?.port || 25565
  });

  const logBox = document.getElementById('lsConsoleOutput');
  const logsArr = Array.isArray(res.recentLogs) ? res.recentLogs : (Array.isArray(res.logs) ? res.logs : []);
  if (logBox && logsArr.length > 0) {
    logBox.textContent = logsArr.join('\n');
    logBox.scrollTop = logBox.scrollHeight;
  }
}

function updateLocalServerLivePillUI(st = {}) {
  localServerRunningState = Boolean(st.running);
  const pill = document.getElementById('lsStatusPill');
  const toggleBtn = document.getElementById('btnLsToggleServer');
  if (pill) {
    if (st.running) {
      pill.textContent = `🟢 Đang chạy (MC ${st.mcVersion || 'Server'} • Cổng ${st.port || 25565})`;
      pill.classList.add('is-running');
    } else if (st.starting) {
      pill.textContent = `⏳ ${st.message || 'Đang khởi động Server...'}`;
      pill.classList.remove('is-running');
    } else {
      pill.textContent = '⚪ Đang tắt';
      pill.classList.remove('is-running');
    }
  }
  if (toggleBtn) {
    toggleBtn.disabled = Boolean(st.starting);
    if (st.running) {
      toggleBtn.textContent = '⏹️ Dừng Server An Toàn (Lưu Map)';
      toggleBtn.classList.add('is-danger');
    } else if (st.starting) {
      toggleBtn.textContent = '⏳ Đang nạp Server...';
      toggleBtn.classList.remove('is-danger');
    } else {
      toggleBtn.textContent = '🚀 Khởi Động Trạm Server Ngầm';
      toggleBtn.classList.remove('is-danger');
    }
  }
}

async function openLocalServerStudioModal() {
  const modal = document.getElementById('localServerStudioModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  await refreshLocalServerStudioModalUI();
}
window.openLocalServerStudioModal = openLocalServerStudioModal;

async function refreshVisualBoostStudioModalUI() {
  const modal = document.getElementById('visualBoostStudioModal');
  if (!modal || !window.aetherAPI.getVisualBoostStatus) return;

  const selTarget = document.getElementById('vbTargetInstanceSelect');
  if (selTarget) {
    const prev = selTarget.value;
    const opts = [`<option value="">🏠 Hồ sơ chính (.minecraft — MC ${escapeHtml(state.selectedVersion || '1.21.4')})</option>`];
    try {
      const packsRes = await window.aetherAPI.packsInstancesList(state.gameDir);
      const list = Array.isArray(packsRes?.instances) ? packsRes.instances : [];
      for (const inst of list) {
        opts.push(`<option value="${escapeHtml(inst.dir)}">📦 ${escapeHtml(inst.name)} (MC ${escapeHtml(inst.minecraftVersion || '?')})</option>`);
      }
    } catch (_) {}
    selTarget.innerHTML = opts.join('');
    if (prev && Array.from(selTarget.options).some((o) => o.value === prev)) {
      selTarget.value = prev;
    } else if (state.modTargetInstanceDir && Array.from(selTarget.options).some((o) => o.value === state.modTargetInstanceDir)) {
      selTarget.value = state.modTargetInstanceDir;
    }
  }

  const instanceDir = selTarget?.value || '';
  const st = await window.aetherAPI.getVisualBoostStatus({ gameDir: state.gameDir, instanceDir });
  if (!st?.ok) return;

  let activeCount = 0;
  const packMap = st.packs || st.status || {};
  modal.querySelectorAll('[data-vbpack]').forEach((btn) => {
    const packId = btn.dataset.vbpack;
    const isOn = Boolean(packMap[packId]);
    if (isOn) activeCount++;
    btn.dataset.active = isOn ? '1' : '0';
    btn.textContent = isOn ? '✓ Đang Bật (Bấm để Tắt)' : '✨ Bật Ngay';
    btn.classList.toggle('is-active', isOn);
  });

  const badge = document.getElementById('vbStatusSummaryBadge');
  if (badge) {
    badge.textContent = activeCount > 0 ? `✓ Đang bật ${activeCount}/4 gói` : 'Sẵn sàng';
  }
}

async function openVisualBoostStudioModal() {
  const modal = document.getElementById('visualBoostStudioModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  await refreshVisualBoostStudioModalUI();
}
window.openVisualBoostStudioModal = openVisualBoostStudioModal;

async function runWorldgenBoostInstallUI(triggerBtn) {
  if (!window.aetherAPI.installWorldgenBoostPack) return;
  const origText = triggerBtn ? triggerBtn.textContent : '';
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.textContent = '⏳ Đang cài Đa Nhân...';
  }
  const instanceDir = state.modTargetInstanceDir || '';
  const mcVersion = state.selectedVersion || '1.21.4';
  const loaderType = state.selectedLoader || 'fabric';
  const res = await window.aetherAPI.installWorldgenBoostPack({
    gameDir: state.gameDir,
    instanceDir,
    mcVersion,
    loaderType
  });
  if (triggerBtn) {
    triggerBtn.disabled = false;
    triggerBtn.textContent = origText;
  }
  const installedArr = Array.isArray(res?.installed) ? res.installed : [];
  if (res?.ok && installedArr.length > 0) {
    showAetherNotification(
      `🚀 Đã trang bị ${installedArr.length} Mod nạp Chunk đa nhân (${installedArr.join(', ')}) cho MC ${mcVersion}! Bay Elytra hoặc chạy bộ khám phá map sẽ mượt hơn rõ rệt.`,
      'success',
      5500
    );
  } else {
    showAetherNotification(
      `⚠️ Chưa tìm thấy bản Mod nạp Chunk tương thích với MC ${mcVersion} (${loaderType}). Bạn hãy ưu tiên chọn Fabric 1.20.1 – 1.21.4 để đạt hiệu quả cao nhất!`,
      'info',
      5000
    );
  }
}

async function runBackupPlayerPrefsUI(triggerBtn) {
  if (!window.aetherAPI.exportPlayerPrefs) return;
  const orig = triggerBtn ? triggerBtn.textContent : '';
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.textContent = '⏳ Đang xuất...';
  }
  const res = await window.aetherAPI.exportPlayerPrefs({
    gameDir: state.gameDir,
    instanceDir: state.modTargetInstanceDir || '',
    favoriteServers: state.favoriteServers || [],
    pinnedServers: state.pinnedServers || []
  });
  if (triggerBtn) {
    triggerBtn.disabled = false;
    triggerBtn.textContent = orig;
  }
  if (res?.canceled) return;
  if (res?.ok) {
    showAetherNotification(
      `☁️ Đã xuất bản sao lưu Phím Tắt (${res.keybindsCount ?? res.keyCount ?? 0} phím), Độ nhạy chuột, Âm lượng & Danh sách Server ra file thành công!`,
      'success',
      5200
    );
  } else {
    showAetherNotification(`⚠️ Không thể xuất sao lưu: ${res?.error || 'Lỗi'}`, 'error', 4000);
  }
}

async function runRestorePlayerPrefsUI(triggerBtn) {
  if (!window.aetherAPI.importPlayerPrefs) return;
  const orig = triggerBtn ? triggerBtn.textContent : '';
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.textContent = '⏳ Đang nạp...';
  }
  const res = await window.aetherAPI.importPlayerPrefs({
    gameDir: state.gameDir,
    instanceDir: state.modTargetInstanceDir || ''
  });
  if (triggerBtn) {
    triggerBtn.disabled = false;
    triggerBtn.textContent = orig;
  }
  if (res?.canceled) return;
  if (res?.ok) {
    if (Array.isArray(res.favoriteServers) && res.favoriteServers.length > 0) {
      state.favoriteServers = res.favoriteServers;
      localStorage.setItem('aether_favorite_servers', JSON.stringify(res.favoriteServers));
    }
    if (Array.isArray(res.pinnedServers) && res.pinnedServers.length > 0) {
      state.pinnedServers = res.pinnedServers;
      localStorage.setItem('aether_pinned_servers', JSON.stringify(res.pinnedServers));
    }
    showAetherNotification(
      `📥 Đã khôi phục ${res.restoredKeys || 0} Phím Tắt, Độ nhạy chuột${(res.restoredServers || res.restoredServersDat) ? ' & Danh sách Server trong game' : ''} thành công!`,
      'success',
      5200
    );
  } else {
    showAetherNotification(`⚠️ Không thể khôi phục: ${res?.error || 'File không hợp lệ'}`, 'error', 4200);
  }
}

function initV412PowerSuiteUI() {
  const lsModal = document.getElementById('localServerStudioModal');
  const vbModal = document.getElementById('visualBoostStudioModal');

  // Trigger buttons for Local Server Studio
  ['btnOpenLocalServerStudio', 'btnToolsOpenLocalServer'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => openLocalServerStudioModal());
  });
  ['btnCloseLocalServerStudioTop', 'btnCloseLocalServerStudioFoot'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => lsModal?.classList.add('hidden'));
  });
  if (lsModal) {
    lsModal.addEventListener('click', (e) => {
      if (e.target === lsModal) lsModal.classList.add('hidden');
    });
  }

  // RAM slider in Local Server Studio
  const ramRange = document.getElementById('lsRamRange');
  const ramLabel = document.getElementById('lsRamValLabel');
  if (ramRange) {
    ramRange.addEventListener('input', () => {
      ramRange.dataset.userTouched = '1';
      const mb = Number(ramRange.value) || 2048;
      if (ramLabel) ramLabel.textContent = `${mb} MB (${(mb / 1024).toFixed(1)} GB)`;
    });
  }

  // Start / Stop Local Server button
  const btnLsToggle = document.getElementById('btnLsToggleServer');
  if (btnLsToggle) {
    btnLsToggle.addEventListener('click', async () => {
      if (localServerRunningState) {
        btnLsToggle.disabled = true;
        btnLsToggle.textContent = '⏳ Đang lưu Map & tắt...';
        const r = await window.aetherAPI.stopLocalServer();
        btnLsToggle.disabled = false;
        if (r?.ok) {
          showAetherNotification('🛑 Đã lưu thế giới và dừng Trạm Server Ngầm an toàn.', 'info', 4000);
        }
        await refreshLocalServerStudioModalUI();
        return;
      }

      const mcVersion = document.getElementById('lsMcVersion')?.value || '1.21.4';
      const ramMB = Number(document.getElementById('lsRamRange')?.value) || 2048;
      const ramGB = Math.max(1, Math.round((ramMB / 1024) * 10) / 10);
      const gamemode = document.getElementById('lsGamemode')?.value || 'survival';
      const onlineMode = document.getElementById('lsOfflineMode')?.value === 'true';
      const worldFolderName = document.getElementById('lsWorldSource')?.value || '';

      updateLocalServerLivePillUI({ starting: true, message: 'Đang chuẩn bị server.jar...' });
      const r = await window.aetherAPI.startLocalServer({
        gameDir: state.gameDir,
        mcVersion,
        ramGB,
        port: 25565,
        onlineMode,
        gamemode,
        difficulty: 'normal',
        maxPlayers: 10,
        viewDistance: 8,
        worldFolderName
      });
      if (r?.ok) {
        showAetherNotification(
          `🚀 Trạm Server Ngầm MC ${mcVersion} đang khởi chạy (0% GPU)! Bạn có thể vào Multiplayer -> Direct Connect nhập localhost:25565.`,
          'success',
          6000
        );
        await refreshLocalServerStudioModalUI();
      } else {
        updateLocalServerLivePillUI({ running: false });
        showAetherNotification(`⚠️ Không thể khởi chạy Server: ${r?.error || 'Lỗi'}`, 'error', 5000);
      }
    });
  }

  // Quick command buttons inside Local Server Studio
  lsModal?.querySelectorAll('[data-lscmd]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cmd = btn.dataset.lscmd;
      if (!cmd) return;
      const r = await window.aetherAPI.sendLocalServerCmd(cmd);
      if (r?.ok) {
        showAetherNotification(`⚡ Đã gửi lệnh "/${cmd}" vào Server!`, 'success', 2800);
      } else {
        showAetherNotification(`⚠️ ${r?.error || 'Server chưa chạy'}`, 'error', 3000);
      }
    });
  });

  const btnLsQuickOp = document.getElementById('btnLsQuickOp');
  if (btnLsQuickOp) {
    btnLsQuickOp.addEventListener('click', async () => {
      const player = (document.getElementById('username')?.value || state.username || 'Player').trim();
      const r = await window.aetherAPI.sendLocalServerCmd(`op ${player}`);
      if (r?.ok) {
        showAetherNotification(`👑 Đã cấp quyền Admin (OP) cho "${player}" trên Server!`, 'success', 3800);
      } else {
        showAetherNotification(`⚠️ ${r?.error || 'Server chưa chạy'}`, 'error', 3000);
      }
    });
  }

  const sendCustomServerCmd = async () => {
    const inp = document.getElementById('lsCmdInput');
    if (!inp) return;
    const cmd = inp.value.trim().replace(/^\//, '');
    if (!cmd) return;
    const r = await window.aetherAPI.sendLocalServerCmd(cmd);
    if (r?.ok) {
      inp.value = '';
    } else {
      showAetherNotification(`⚠️ ${r?.error || 'Server chưa chạy'}`, 'error', 3000);
    }
  };
  document.getElementById('btnLsSendCmd')?.addEventListener('click', sendCustomServerCmd);
  document.getElementById('lsCmdInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendCustomServerCmd();
  });
  document.getElementById('btnLsClearConsole')?.addEventListener('click', () => {
    const box = document.getElementById('lsConsoleOutput');
    if (box) box.textContent = 'Đã xóa màn hình nhật ký.';
  });
  document.getElementById('btnLsCopyIp')?.addEventListener('click', () => {
    navigator.clipboard?.writeText('localhost:25565');
    showAetherNotification('📋 Đã copy địa chỉ "localhost:25565"! Vào Multiplayer -> Direct Connect để dán.', 'success', 3800);
  });
  document.getElementById('btnLsOpenFolder')?.addEventListener('click', () => {
    window.aetherAPI.openSubFolder(state.gameDir, 'local-server');
  });

  // Live IPC listeners for Local Server logs & state
  if (window.aetherAPI.onLocalServerLog) {
    window.aetherAPI.onLocalServerLog((payload) => {
      const box = document.getElementById('lsConsoleOutput');
      if (box && payload?.line) {
        box.textContent += `\n${payload.line}`;
        if (box.textContent.length > 28000) {
          box.textContent = box.textContent.slice(-22000);
        }
        box.scrollTop = box.scrollHeight;
      }
    });
  }
  if (window.aetherAPI.onLocalServerState) {
    window.aetherAPI.onLocalServerState((st) => {
      updateLocalServerLivePillUI(st || {});
    });
  }

  // Trigger buttons for Visual & Audio Boost Studio
  ['btnModsVisualBoost', 'btnToolsOpenVisualBoost'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => openVisualBoostStudioModal());
  });
  ['btnCloseVisualBoostTop', 'btnCloseVisualBoostFoot'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => vbModal?.classList.add('hidden'));
  });
  if (vbModal) {
    vbModal.addEventListener('click', (e) => {
      if (e.target === vbModal) vbModal.classList.add('hidden');
    });
  }

  document.getElementById('vbTargetInstanceSelect')?.addEventListener('change', () => {
    refreshVisualBoostStudioModalUI();
  });
  document.getElementById('btnVbOpenResourcepacks')?.addEventListener('click', () => {
    const instDir = document.getElementById('vbTargetInstanceSelect')?.value || '';
    if (instDir) {
      window.aetherAPI.packsInstanceOpen({ gameDir: state.gameDir, dir: instDir, sub: 'resourcepacks' });
    } else {
      window.aetherAPI.openSubFolder(state.gameDir, 'resourcepacks');
    }
  });

  // Toggle buttons inside Visual Boost Studio
  vbModal?.querySelectorAll('[data-vbpack]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const packId = btn.dataset.vbpack;
      if (!packId) return;
      const currentlyActive = btn.dataset.active === '1';
      const enable = !currentlyActive;
      const instanceDir = document.getElementById('vbTargetInstanceSelect')?.value || '';
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = enable ? '⏳ Đang trang bị...' : '⏳ Đang tắt...';
      const r = await window.aetherAPI.toggleVisualBoostPack({
        gameDir: state.gameDir,
        instanceDir,
        packId,
        enable,
        mcVersion: state.selectedVersion || '1.21.4',
        loaderType: state.selectedLoader || 'fabric'
      });
      btn.disabled = false;
      if (r?.ok) {
        showAetherNotification(
          enable
            ? `✨ Đã bật gói "${packId}" thành công (0% tụt FPS)!`
            : `↩️ Đã tắt gói "${packId}".`,
          'success',
          4000
        );
        await refreshVisualBoostStudioModalUI();
      } else {
        btn.textContent = orig;
        showAetherNotification(`⚠️ Không thể đổi trạng thái: ${r?.error || 'Lỗi'}`, 'error', 4000);
      }
    });
  });

  // Worldgen Boost & Backup/Restore Prefs triggers (both in Tab Tools and inside Visual Boost Modal)
  ['btnToolsWorldgenBoost', 'btnVbQuickWorldgen'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', (e) => runWorldgenBoostInstallUI(e.currentTarget));
  });
  ['btnToolsBackupPrefs', 'btnVbQuickBackupPrefs'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', (e) => runBackupPlayerPrefsUI(e.currentTarget));
  });
  ['btnToolsRestorePrefs', 'btnVbQuickRestorePrefs'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', (e) => runRestorePlayerPrefsUI(e.currentTarget));
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initCoopHubUI();
  initV402FeaturesUI();
  initV406FeaturesUI();
  initV407FeaturesUI();
  initUniversalDropUI();
  initV410TurboSmoothUI();
  initV412PowerSuiteUI();
});
