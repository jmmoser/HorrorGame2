// Procedural textures: everything in the game is painted at load time on canvases.
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32 } from './util.js';

let ANISO = 4;
export function setAnisotropy(a) { ANISO = a; }

function mk(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// --- tileable fractal value noise -----------------------------------------
const noiseCache = new Map();
function noiseCanvas(size, cells, seed, octaves = 4) {
  const key = size + ':' + cells + ':' + seed + ':' + octaves;
  if (noiseCache.has(key)) return noiseCache.get(key);
  const rng = mulberry32(seed);
  const c = mk(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const acc = new Float32Array(size * size);
  let amp = 1, total = 0, period = cells;
  for (let o = 0; o < octaves; o++) {
    const lat = new Float32Array(period * period);
    for (let i = 0; i < lat.length; i++) lat[i] = rng();
    const scale = period / size;
    for (let y = 0; y < size; y++) {
      const fy = y * scale, y0 = Math.floor(fy), ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      const ya = (y0 % period) * period, yb = ((y0 + 1) % period) * period;
      for (let x = 0; x < size; x++) {
        const fx = x * scale, x0 = Math.floor(fx), tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const xa = x0 % period, xb = (x0 + 1) % period;
        const a = lat[ya + xa] + (lat[ya + xb] - lat[ya + xa]) * sx;
        const b = lat[yb + xa] + (lat[yb + xb] - lat[yb + xa]) * sx;
        acc[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
    total += amp; amp *= 0.5; period *= 2;
  }
  for (let i = 0; i < acc.length; i++) {
    const v = Math.max(0, Math.min(255, (acc[i] / total) * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  noiseCache.set(key, c);
  return c;
}

// Draw noise over a canvas with a blend mode. contrast stretches around mid-grey.
function grunge(ctx, w, h, { cells = 4, seed = 1, mode = 'multiply', alpha = 0.5, octaves = 4 } = {}) {
  const n = noiseCanvas(256, cells, seed, octaves);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = mode;
  ctx.drawImage(n, 0, 0, w, h);
  ctx.restore();
}

// Per-pixel speckle.
function speckle(ctx, w, h, rng, count, color, minS = 1, maxS = 2, alpha = 0.5) {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = alpha * rng();
    const s = minS + rng() * (maxS - minS);
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
  ctx.restore();
}

function crack(ctx, rng, x, y, len, width, color, angle = rng() * Math.PI * 2) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  let a = angle;
  const seg = 7;
  for (let i = 0; i < len / seg; i++) {
    a += (rng() - 0.5) * 0.9;
    x += Math.cos(a) * seg; y += Math.sin(a) * seg;
    ctx.lineTo(x, y);
    if (rng() < 0.06 && len > 40) crack(ctx, rng, x, y, len * 0.4, width * 0.7, color, a + (rng() - 0.5) * 2);
  }
  ctx.stroke();
  ctx.restore();
}

function blob(ctx, rng, x, y, r, color, alpha = 1, jag = 0.35, pts = 14) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const rr = r * (1 - jag + rng() * jag * 2);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * (0.7 + rng() * 0.5);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function normalFromHeight(hc, strength = 2) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = mk(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const d = img.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) / 255 * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) / 255 * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * w + x) * 4;
      d[i] = (-dx * inv * 0.5 + 0.5) * 255;
      d[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      d[i + 2] = (inv * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function tex(canvas, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Build a PBR texture set from a painter that draws colour, height and roughness.
function surface(w, h, painter, normalStrength = 2.2) {
  const c = mk(w, h), hc = mk(w, h), rc = mk(w, h);
  const ctx = c.getContext('2d'), hx = hc.getContext('2d'), rx = rc.getContext('2d');
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, w, h);
  rx.fillStyle = '#d0d0d0'; rx.fillRect(0, 0, w, h);
  painter(ctx, hx, rx, w, h);
  return {
    map: tex(c),
    normalMap: tex(normalFromHeight(hc, normalStrength), { srgb: false }),
    roughnessMap: tex(rc, { srgb: false }),
  };
}

function matFrom(set, opts = {}) {
  return new THREE.MeshStandardMaterial({
    map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap,
    roughness: 1, metalness: 0, ...opts,
  });
}

// ---------------------------------------------------------------------------
// Walls: texture covers 4m x 3m (u wraps every 4m, v spans floor to ceiling).
// ---------------------------------------------------------------------------
function wallSet(o) {
  const W = 1024, H = 768;
  const rng = mulberry32(o.seed || 7);
  const yOf = (m) => H * (1 - m / 3);
  return surface(W, H, (ctx, hx, rx) => {
    const style = o.style || 'plaster';
    ctx.fillStyle = o.base; ctx.fillRect(0, 0, W, H);

    if (style === 'plaster') {
      grunge(ctx, W, H, { cells: 3, seed: o.seed + 1, alpha: 0.55 });
      grunge(ctx, W, H, { cells: 24, seed: o.seed + 2, alpha: 0.25, mode: 'overlay' });
      grunge(hx, W, H, { cells: 48, seed: o.seed + 3, alpha: 0.18, mode: 'overlay', octaves: 3 });
      // wainscot
      const wy = yOf(o.wainH || 1.15);
      ctx.fillStyle = o.wains; ctx.fillRect(0, wy, W, H - wy);
      ctx.save(); ctx.beginPath(); ctx.rect(0, wy, W, H - wy); ctx.clip();
      grunge(ctx, W, H, { cells: 5, seed: o.seed + 4, alpha: 0.6 });
      grunge(ctx, W, H, { cells: 40, seed: o.seed + 5, alpha: 0.3, mode: 'overlay' });
      ctx.restore();
      rx.fillStyle = '#7a7a7a'; rx.fillRect(0, wy, W, H - wy);
      if (o.panels) {
        // wood panelling: vertical boards
        for (let x = 0; x < W; x += 64) {
          ctx.fillStyle = `rgba(0,0,0,${0.08 + rng() * 0.18})`; ctx.fillRect(x, wy, 64, H - wy);
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, wy, 3, H - wy);
          hx.fillStyle = '#505050'; hx.fillRect(x, wy, 4, H - wy);
          for (let k = 0; k < 14; k++) {
            ctx.fillStyle = `rgba(20,10,0,${rng() * 0.2})`;
            ctx.fillRect(x + 6 + rng() * 52, wy, 1 + rng() * 2, H - wy);
          }
        }
      }
      // trim rail
      ctx.fillStyle = o.trim || '#1c1a14'; ctx.fillRect(0, wy - 10, W, 14);
      hx.fillStyle = '#b8b8b8'; hx.fillRect(0, wy - 10, W, 14);
      rx.fillStyle = '#606060'; rx.fillRect(0, wy - 10, W, 14);
      // peeling paint
      for (let i = 0; i < (o.peel ?? 9); i++) {
        const x = rng() * W, y = rng() * H * 0.95, r = 14 + rng() * 55;
        blob(ctx, rng, x + 2, y + 2, r * 1.06, 'rgba(255,255,240,0.25)');
        blob(ctx, rng, x, y, r, o.under || '#4d473c', 0.95);
        blob(hx, rng, x, y, r, '#585858', 1);
        blob(rx, rng, x, y, r, '#f0f0f0', 1);
      }
    } else if (style === 'tile') {
      const ts = o.tileSize || 48;
      grunge(ctx, W, H, { cells: 3, seed: o.seed + 1, alpha: 0.4 });
      rx.fillStyle = '#505050'; rx.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += ts) {
        for (let x = 0; x < W; x += ts) {
          const v = rng();
          ctx.fillStyle = v < 0.06 ? 'rgba(40,35,25,0.55)' : `rgba(${v > 0.5 ? '255,255,255' : '0,0,0'},${rng() * 0.09})`;
          ctx.fillRect(x + 2, y + 2, ts - 4, ts - 4);
          if (v < 0.04) { rx.fillStyle = '#e0e0e0'; rx.fillRect(x, y, ts, ts); }
        }
      }
      ctx.strokeStyle = o.grout || '#2a2823'; ctx.lineWidth = 4;
      hx.strokeStyle = '#303030'; hx.lineWidth = 5;
      rx.strokeStyle = '#f0f0f0'; rx.lineWidth = 4;
      for (const g of [ctx, hx, rx]) {
        g.beginPath();
        for (let y = 0; y <= H; y += ts) { g.moveTo(0, y); g.lineTo(W, y); }
        for (let x = 0; x <= W; x += ts) { g.moveTo(x, 0); g.lineTo(x, H); }
        g.stroke();
      }
      if (o.band) { ctx.fillStyle = o.band; ctx.globalAlpha = 0.75; ctx.fillRect(0, yOf(1.5), W, ts); ctx.globalAlpha = 1; }
    } else if (style === 'concrete') {
      grunge(ctx, W, H, { cells: 4, seed: o.seed + 1, alpha: 0.7 });
      grunge(ctx, W, H, { cells: 32, seed: o.seed + 2, alpha: 0.35, mode: 'overlay' });
      grunge(hx, W, H, { cells: 40, seed: o.seed + 3, alpha: 0.3, mode: 'overlay' });
      speckle(ctx, W, H, rng, 2500, '#000', 1, 3, 0.35);
      speckle(hx, W, H, rng, 1200, '#000', 1, 4, 0.6);
      for (let y = 96; y < H; y += 192) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, y, W, 3);
        hx.fillStyle = '#404040'; hx.fillRect(0, y, W, 4);
        for (let x = 64; x < W; x += 256) {
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(x, y + 48, 7, 0, 7); ctx.fill();
          hx.fillStyle = '#202020'; hx.beginPath(); hx.arc(x, y + 48, 7, 0, 7); hx.fill();
        }
      }
      if (o.stripe) {
        const sy = yOf(1.25);
        ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = o.stripe; ctx.fillRect(0, sy, W, 44); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(0, sy, W, 44); ctx.clip();
        for (let i = 0; i < 30; i++) blob(ctx, rng, rng() * W, sy + rng() * 44, 6 + rng() * 22, o.base, 0.9);
        ctx.restore();
      }
    } else if (style === 'brick') {
      const bh = 32, bw = 96;
      ctx.fillStyle = o.grout || '#1d1a17'; ctx.fillRect(0, 0, W, H);
      hx.fillStyle = '#303030'; hx.fillRect(0, 0, W, H);
      let row = 0;
      for (let y = 0; y < H; y += bh, row++) {
        for (let x = (row % 2 ? -bw / 2 : 0); x < W; x += bw) {
          const t = rng();
          const [r0, g0, b0] = o.brick || [92, 48, 38];
          const k = 0.7 + t * 0.5;
          ctx.fillStyle = `rgb(${r0 * k | 0},${g0 * k | 0},${b0 * k | 0})`;
          ctx.fillRect(x + 2, y + 2, bw - 5, bh - 5);
          if (x < 0) ctx.fillRect(x + W + 2, y + 2, bw - 5, bh - 5);
          hx.fillStyle = `rgb(${150 + t * 50 | 0},${150 + t * 50 | 0},${150 + t * 50 | 0})`;
          hx.fillRect(x + 3, y + 3, bw - 7, bh - 7);
          if (x < 0) hx.fillRect(x + W + 3, y + 3, bw - 7, bh - 7);
        }
      }
      grunge(ctx, W, H, { cells: 4, seed: o.seed + 1, alpha: 0.65 });
      grunge(ctx, W, H, { cells: 48, seed: o.seed + 2, alpha: 0.35, mode: 'overlay' });
      grunge(hx, W, H, { cells: 64, seed: o.seed + 3, alpha: 0.25, mode: 'overlay' });
    } else if (style === 'padded') {
      const ps = 128;
      grunge(ctx, W, H, { cells: 4, seed: o.seed + 1, alpha: 0.6 });
      for (let y = 0; y < H; y += ps) for (let x = 0; x < W; x += ps) {
        const g = hx.createRadialGradient(x + ps / 2, y + ps / 2, 4, x + ps / 2, y + ps / 2, ps * 0.72);
        g.addColorStop(0, '#e8e8e8'); g.addColorStop(1, '#3a3a3a');
        hx.fillStyle = g; hx.fillRect(x, y, ps, ps);
        const g2 = ctx.createRadialGradient(x + ps / 2, y + ps / 2, 4, x + ps / 2, y + ps / 2, ps * 0.75);
        g2.addColorStop(0, 'rgba(255,255,255,0.05)'); g2.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = g2; ctx.fillRect(x, y, ps, ps);
        ctx.fillStyle = '#15120e'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
        if (rng() < 0.25) blob(ctx, rng, x + rng() * ps, y + rng() * ps, 10 + rng() * 30, '#2b1c12', 0.5);
      }
      grunge(hx, W, H, { cells: 64, seed: o.seed + 3, alpha: 0.12, mode: 'overlay' });
    }

    // --- shared ageing ---
    // water stains running down from the ceiling
    for (let i = 0; i < (o.stains ?? 10); i++) {
      const x = rng() * W, wd = 12 + rng() * 70, len = H * (0.25 + rng() * 0.75);
      const g = ctx.createLinearGradient(0, 0, 0, len);
      const a = 0.18 + rng() * 0.3;
      g.addColorStop(0, `rgba(38,28,14,${a})`); g.addColorStop(1, 'rgba(38,28,14,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - wd / 2, 0); ctx.lineTo(x + wd / 2, 0);
      ctx.lineTo(x + wd * 0.2 + (rng() - 0.5) * 20, len); ctx.lineTo(x - wd * 0.2, len * (0.7 + rng() * 0.3));
      ctx.closePath(); ctx.fill();
    }
    // cracks
    for (let i = 0; i < (o.cracks ?? 5); i++) {
      const x = rng() * W, y = rng() * H, len = 80 + rng() * 260;
      const seedState = rng();
      const r1 = mulberry32(seedState * 1e6 | 0), r2 = mulberry32(seedState * 1e6 | 0);
      const ang = rng() * 6.28;
      crack(ctx, r1, x, y, len, 1.6, 'rgba(8,6,4,0.8)', ang);
      crack(hx, r2, x, y, len, 3, '#101010', ang);
    }
    // grime: floor line and ceiling line
    let g = ctx.createLinearGradient(0, H, 0, H - 150);
    g.addColorStop(0, 'rgba(8,6,3,0.82)'); g.addColorStop(1, 'rgba(8,6,3,0)');
    ctx.fillStyle = g; ctx.fillRect(0, H - 150, W, 150);
    g = ctx.createLinearGradient(0, 0, 0, 110);
    g.addColorStop(0, 'rgba(8,6,3,0.7)'); g.addColorStop(1, 'rgba(8,6,3,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 110);
    // baseboard
    if (o.baseboard !== false) {
      ctx.fillStyle = o.baseboard || '#14110d'; ctx.fillRect(0, H - 30, W, 30);
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, H - 30, W, 2);
      hx.fillStyle = '#c0c0c0'; hx.fillRect(0, H - 30, W, 30);
      rx.fillStyle = '#707070'; rx.fillRect(0, H - 30, W, 30);
    }
    grunge(rx, W, H, { cells: 6, seed: o.seed + 9, alpha: 0.35, mode: 'overlay' });
    if (o.extra) o.extra(ctx, hx, rx, W, H, rng, yOf);
  }, o.normal || 2.4);
}

// ---------------------------------------------------------------------------
// Floors: texture covers 2m x 2m.
// ---------------------------------------------------------------------------
function floorSet(o) {
  const S = 512;
  const rng = mulberry32(o.seed || 11);
  return surface(S, S, (ctx, hx, rx) => {
    const style = o.style;
    if (style === 'lino') {
      const n = 4, ts = S / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        ctx.fillStyle = (x + y) % 2 ? o.a : o.b;
        ctx.fillRect(x * ts, y * ts, ts, ts);
        ctx.fillStyle = `rgba(0,0,0,${rng() * 0.15})`; ctx.fillRect(x * ts, y * ts, ts, ts);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2;
      hx.strokeStyle = '#555'; hx.lineWidth = 2;
      for (const g of [ctx, hx]) {
        g.beginPath();
        for (let i = 0; i <= n; i++) { g.moveTo(i * ts, 0); g.lineTo(i * ts, S); g.moveTo(0, i * ts); g.lineTo(S, i * ts); }
        g.stroke();
      }
      rx.fillStyle = '#6a6a6a'; rx.fillRect(0, 0, S, S);
      // scuffs
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < 60; i++) {
        ctx.lineWidth = 0.5 + rng() * 1.5;
        const x = rng() * S, y = rng() * S, a = rng() * 6.28, l = 10 + rng() * 60;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
      }
    } else if (style === 'wood') {
      const n = 8, pw = S / n;
      for (let i = 0; i < n; i++) {
        const k = 0.75 + rng() * 0.4;
        const [r, g, b] = o.rgb || [70, 44, 24];
        ctx.fillStyle = `rgb(${r * k | 0},${g * k | 0},${b * k | 0})`;
        ctx.fillRect(i * pw, 0, pw, S);
        for (let j = 0; j < 30; j++) {
          ctx.fillStyle = `rgba(0,0,0,${rng() * 0.16})`;
          ctx.fillRect(i * pw + rng() * pw, 0, 1 + rng() * 2, S);
        }
        const off = rng() * S;
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(i * pw, off, pw, 2);
        hx.fillStyle = '#404040'; hx.fillRect(i * pw, off, pw, 3);
        ctx.fillRect(i * pw, 0, 2, S);
        hx.fillRect(i * pw, 0, 3, S);
      }
      rx.fillStyle = '#8a8a8a'; rx.fillRect(0, 0, S, S);
    } else if (style === 'tile') {
      const n = o.n || 8, ts = S / n;
      ctx.fillStyle = o.a; ctx.fillRect(0, 0, S, S);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const v = rng();
        ctx.fillStyle = o.b && (x + y) % 2 ? o.b : `rgba(0,0,0,${v * 0.14})`;
        ctx.fillRect(x * ts, y * ts, ts, ts);
        if (v < 0.07) { ctx.fillStyle = 'rgba(30,22,12,0.5)'; ctx.fillRect(x * ts, y * ts, ts, ts); }
      }
      ctx.strokeStyle = '#191714'; ctx.lineWidth = 3;
      hx.strokeStyle = '#2a2a2a'; hx.lineWidth = 4;
      rx.fillStyle = '#404040'; rx.fillRect(0, 0, S, S);
      rx.strokeStyle = '#f0f0f0'; rx.lineWidth = 3;
      for (const g of [ctx, hx, rx]) {
        g.beginPath();
        for (let i = 0; i <= n; i++) { g.moveTo(i * ts, 0); g.lineTo(i * ts, S); g.moveTo(0, i * ts); g.lineTo(S, i * ts); }
        g.stroke();
      }
    } else if (style === 'concrete') {
      ctx.fillStyle = o.a; ctx.fillRect(0, 0, S, S);
      speckle(ctx, S, S, rng, 3000, '#000', 1, 3, 0.3);
      speckle(ctx, S, S, rng, 800, '#fff', 1, 2, 0.12);
      speckle(hx, S, S, rng, 1500, '#000', 1, 3, 0.5);
      rx.fillStyle = '#c8c8c8'; rx.fillRect(0, 0, S, S);
      for (let i = 0; i < 4; i++) {
        const st = rng();
        const x = rng() * S, y = rng() * S, l = 100 + rng() * 300, a = rng() * 6.28;
        crack(ctx, mulberry32(st * 1e6 | 0), x, y, l, 1.5, 'rgba(0,0,0,0.8)', a);
        crack(hx, mulberry32(st * 1e6 | 0), x, y, l, 3, '#080808', a);
      }
    }
    grunge(ctx, S, S, { cells: 3, seed: o.seed + 1, alpha: o.dirt ?? 0.65 });
    grunge(ctx, S, S, { cells: 20, seed: o.seed + 2, alpha: 0.3, mode: 'overlay' });
    grunge(hx, S, S, { cells: 40, seed: o.seed + 3, alpha: 0.2, mode: 'overlay' });
    // dirt blotches & wet patches (wet = low roughness, tileable-ish)
    for (let i = 0; i < (o.blotches ?? 10); i++) {
      const x = 60 + rng() * (S - 120), y = 60 + rng() * (S - 120), r = 15 + rng() * 45;
      blob(ctx, rng, x, y, r, '#0a0806', 0.2 + rng() * 0.25);
    }
    for (let i = 0; i < (o.wet ?? 3); i++) {
      const x = 80 + rng() * (S - 160), y = 80 + rng() * (S - 160), r = 30 + rng() * 50;
      const g = rx.createRadialGradient(x, y, r * 0.2, x, y, r);
      g.addColorStop(0, 'rgba(20,20,20,0.95)'); g.addColorStop(1, 'rgba(20,20,20,0)');
      rx.fillStyle = g; rx.fillRect(x - r, y - r, r * 2, r * 2);
      const g2 = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
      g2.addColorStop(0, 'rgba(0,0,0,0.35)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    grunge(rx, S, S, { cells: 5, seed: o.seed + 7, alpha: 0.45, mode: 'overlay' });
  }, o.normal || 2);
}

function ceilingSet(o) {
  const S = 512;
  const rng = mulberry32(o.seed || 21);
  return surface(S, S, (ctx, hx, rx) => {
    ctx.fillStyle = o.a; ctx.fillRect(0, 0, S, S);
    if (o.style === 'tiles') {
      const n = 2, ts = S / n;
      speckle(ctx, S, S, rng, 5000, '#000', 1, 2.5, 0.5);
      speckle(hx, S, S, rng, 5000, '#000', 1, 2.5, 0.7);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (rng() < 0.3) { ctx.fillStyle = `rgba(0,0,0,${0.2 + rng() * 0.3})`; ctx.fillRect(x * ts, y * ts, ts, ts); }
      }
      ctx.strokeStyle = '#0c0b09'; ctx.lineWidth = 7;
      hx.strokeStyle = '#d0d0d0'; hx.lineWidth = 8;
      for (const g of [ctx, hx]) {
        g.beginPath();
        for (let i = 0; i <= n; i++) { g.moveTo(i * ts, 0); g.lineTo(i * ts, S); g.moveTo(0, i * ts); g.lineTo(S, i * ts); }
        g.stroke();
      }
      for (let i = 0; i < 5; i++) {
        const x = 60 + rng() * (S - 120), y = 60 + rng() * (S - 120), r = 25 + rng() * 55;
        blob(ctx, rng, x, y, r, '#2a1c0c', 0.45);
        blob(ctx, rng, x, y, r * 0.7, '#1a1208', 0.4);
      }
    } else {
      speckle(ctx, S, S, rng, 3000, '#000', 1, 3, 0.4);
      speckle(hx, S, S, rng, 2000, '#000', 1, 3, 0.5);
      for (let y = 0; y < S; y += 128) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, y, S, 3); hx.fillStyle = '#303030'; hx.fillRect(0, y, S, 4); }
    }
    grunge(ctx, S, S, { cells: 3, seed: o.seed + 1, alpha: 0.75 });
    grunge(ctx, S, S, { cells: 24, seed: o.seed + 2, alpha: 0.3, mode: 'overlay' });
  }, 1.8);
}

// ---------------------------------------------------------------------------
// Prop materials
// ---------------------------------------------------------------------------
function metalSet(seed, rustAmt = 0.5, scratch = 60) {
  const S = 256;
  const rng = mulberry32(seed);
  return surface(S, S, (ctx, hx, rx) => {
    ctx.fillStyle = '#e4e4e4'; ctx.fillRect(0, 0, S, S);
    grunge(ctx, S, S, { cells: 4, seed, alpha: 0.5 });
    rx.fillStyle = '#707070'; rx.fillRect(0, 0, S, S);
    for (let i = 0; i < 26 * rustAmt; i++) {
      const x = rng() * S, y = rng() * S, r = 5 + rng() * 26;
      blob(ctx, rng, x, y, r, rng() < 0.5 ? '#5a2c12' : '#3a1c0c', 0.75);
      blob(rx, rng, x, y, r, '#f4f4f4', 1);
      blob(hx, rng, x, y, r, '#6a6a6a', 1);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    for (let i = 0; i < scratch; i++) {
      ctx.lineWidth = 0.5 + rng();
      const x = rng() * S, y = rng() * S, a = rng() * 6.28, l = 5 + rng() * 40;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    grunge(ctx, S, S, { cells: 32, seed: seed + 2, alpha: 0.3, mode: 'overlay' });
    grunge(rx, S, S, { cells: 8, seed: seed + 3, alpha: 0.5, mode: 'overlay' });
  }, 1.5);
}

function woodSet(seed) {
  const S = 256;
  const rng = mulberry32(seed);
  return surface(S, S, (ctx, hx, rx) => {
    ctx.fillStyle = '#d8d0c4'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = `rgba(30,15,0,${rng() * 0.22})`;
      ctx.fillRect(0, rng() * S, S, 1 + rng() * 2.5);
    }
    for (let i = 0; i < 40; i++) { hx.fillStyle = `rgba(0,0,0,${rng() * 0.3})`; hx.fillRect(0, rng() * S, S, 1 + rng() * 2); }
    grunge(ctx, S, S, { cells: 4, seed, alpha: 0.55 });
    rx.fillStyle = '#909090'; rx.fillRect(0, 0, S, S);
    grunge(rx, S, S, { cells: 6, seed: seed + 3, alpha: 0.5, mode: 'overlay' });
  }, 1.4);
}

function fabricSet(seed, stripes = false, stains = 6) {
  const S = 256;
  const rng = mulberry32(seed);
  return surface(S, S, (ctx, hx, rx) => {
    ctx.fillStyle = '#e6e2d8'; ctx.fillRect(0, 0, S, S);
    if (stripes) for (let x = 0; x < S; x += 32) { ctx.fillStyle = 'rgba(40,50,80,0.5)'; ctx.fillRect(x, 0, 6, S); ctx.fillRect(x + 10, 0, 2, S); }
    // weave
    for (let i = 0; i < S; i += 2) {
      hx.fillStyle = i % 4 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
      hx.fillRect(0, i, S, 1); hx.fillRect(i, 0, 1, S);
    }
    grunge(ctx, S, S, { cells: 4, seed, alpha: 0.5 });
    grunge(hx, S, S, { cells: 5, seed: seed + 5, alpha: 0.5, mode: 'overlay' });
    for (let i = 0; i < stains; i++) {
      const x = rng() * S, y = rng() * S, r = 8 + rng() * 34;
      blob(ctx, rng, x, y, r, rng() < 0.4 ? '#3a0a06' : '#4a3a1c', 0.35 + rng() * 0.3);
    }
    rx.fillStyle = '#f0f0f0'; rx.fillRect(0, 0, S, S);
  }, 1.2);
}

// Door leaf: 1 x 2.1 m panel door.
function doorSet(kind, seed) {
  const W = 256, H = 512;
  const rng = mulberry32(seed);
  return surface(W, H, (ctx, hx, rx) => {
    if (kind === 'wood') {
      ctx.fillStyle = '#6b6a58'; ctx.fillRect(0, 0, W, H);
      rx.fillStyle = '#808080'; rx.fillRect(0, 0, W, H);
      for (const [x, y, w, h] of [[30, 30, 196, 150], [30, 210, 196, 120], [30, 360, 196, 122]]) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#62614f'; ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
        hx.fillStyle = '#404040'; hx.fillRect(x, y, w, h);
        hx.fillStyle = '#707070'; hx.fillRect(x + 8, y + 8, w - 16, h - 16);
      }
      for (let i = 0; i < 16; i++) {
        const x = rng() * W, y = rng() * H, r = 6 + rng() * 28;
        blob(ctx, rng, x, y, r, '#2e2518', 0.9); blob(hx, rng, x, y, r, '#5a5a5a', 1); blob(rx, rng, x, y, r, '#f0f0f0', 1);
      }
    } else {
      ctx.fillStyle = kind === 'cell' ? '#4a5350' : '#4c4a45'; ctx.fillRect(0, 0, W, H);
      rx.fillStyle = '#606060'; rx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3; ctx.strokeRect(12, 12, W - 24, H - 24);
      hx.strokeStyle = '#b0b0b0'; hx.lineWidth = 6; hx.strokeRect(12, 12, W - 24, H - 24);
      for (let y = 22; y < H; y += 52) for (const x of [22, W - 22]) {
        ctx.fillStyle = '#2a2824'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
        hx.fillStyle = '#e0e0e0'; hx.beginPath(); hx.arc(x, y, 5, 0, 7); hx.fill();
      }
      for (let i = 0; i < 26; i++) {
        const x = rng() * W, y = rng() * H, r = 5 + rng() * 30;
        blob(ctx, rng, x, y, r, rng() < 0.5 ? '#4e2610' : '#2e160a', 0.8); blob(rx, rng, x, y, r, '#f8f8f8', 1); blob(hx, rng, x, y, r, '#686868', 1);
      }
      // scratch marks low on the door
      ctx.strokeStyle = 'rgba(190,180,160,0.35)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 26; i++) {
        const x = 40 + rng() * 170, y = 300 + rng() * 150;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rng() - 0.5) * 16, y + 30 + rng() * 60); ctx.stroke();
      }
    }
    grunge(ctx, W, H, { cells: 4, seed: seed + 1, alpha: 0.6 });
    const g = ctx.createLinearGradient(0, H, 0, H - 120);
    g.addColorStop(0, 'rgba(0,0,0,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, H - 120, W, 120);
  }, 2);
}

// ---------------------------------------------------------------------------
// Decals (transparent)
// ---------------------------------------------------------------------------
function decalMat(canvas, opts = {}) {
  const t = tex(canvas, { repeat: false });
  return new THREE.MeshStandardMaterial({
    map: t, transparent: true, depthWrite: false, roughness: opts.rough ?? 0.45, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, ...opts.extra,
  });
}

function bloodSplat(seed, drip = true) {
  const S = 256, c = mk(S), ctx = c.getContext('2d'), rng = mulberry32(seed);
  const cx = S / 2, cy = S * 0.42;
  for (let i = 0; i < 5; i++) blob(ctx, rng, cx + (rng() - 0.5) * 50, cy + (rng() - 0.5) * 40, 22 + rng() * 34, i % 2 ? '#3d0503' : '#560806', 0.9, 0.5, 18);
  for (let i = 0; i < 70; i++) {
    const a = rng() * 6.28, d = 30 + rng() * 85;
    ctx.fillStyle = '#4a0604'; ctx.globalAlpha = 0.5 + rng() * 0.5;
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + rng() * 5, 1 + rng() * 2.5, a, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (drip) for (let i = 0; i < 9; i++) {
    const x = cx + (rng() - 0.5) * 110, len = 30 + rng() * 110, w = 2 + rng() * 5;
    const g = ctx.createLinearGradient(0, cy, 0, cy + len);
    g.addColorStop(0, 'rgba(70,6,4,0.95)'); g.addColorStop(1, 'rgba(50,4,3,0.2)');
    ctx.fillStyle = g; ctx.fillRect(x, cy, w, len);
    ctx.beginPath(); ctx.arc(x + w / 2, cy + len, w * 0.8, 0, 7); ctx.fill();
  }
  return c;
}

function handprints(seed) {
  const S = 256, c = mk(S), ctx = c.getContext('2d'), rng = mulberry32(seed);
  const hand = (x, y, s, rot) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(72,6,4,0.85)';
    ctx.beginPath(); ctx.ellipse(0, 0, 17, 20, 0, 0, 7); ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.rotate(-0.42 + i * 0.28); ctx.beginPath(); ctx.ellipse(0, -36, 4.2, 15, 0, 0, 7); ctx.fill(); ctx.restore();
    }
    ctx.save(); ctx.rotate(-1.15); ctx.beginPath(); ctx.ellipse(0, -24, 4.5, 11, 0, 0, 7); ctx.fill(); ctx.restore();
    // smear downwards
    const g = ctx.createLinearGradient(0, 0, 0, 120);
    g.addColorStop(0, 'rgba(72,6,4,0.6)'); g.addColorStop(1, 'rgba(72,6,4,0)');
    ctx.fillStyle = g; ctx.fillRect(-15, 5, 30, 120);
    ctx.restore();
  };
  hand(90, 80, 1, -0.2 + rng() * 0.2); hand(170, 70, 1, 0.15 + rng() * 0.2);
  ctx.globalCompositeOperation = 'destination-out';
  speckle(ctx, S, S, rng, 1400, '#000', 1, 3, 0.9);
  return c;
}

function scrawl(text, seed, color = 'rgba(60,5,3,0.92)', font = 'Rock Salt') {
  const lines = text.split('\n');
  const W = 512, H = 96 * lines.length + 40;
  const c = mk(W, H), ctx = c.getContext('2d'), rng = mulberry32(seed);
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((ln, li) => {
    let size = 64;
    ctx.font = `${size}px "${font}", "Brush Script MT", cursive`;
    const mw = ctx.measureText(ln).width;
    if (mw > W - 50) size = Math.floor(size * (W - 50) / mw);
    const chars = ln.split('');
    ctx.font = `${size}px "${font}", "Brush Script MT", cursive`;
    let x = W / 2 - ctx.measureText(ln).width / 2;
    for (const ch of chars) {
      const cw = ctx.measureText(ch).width;
      ctx.save();
      ctx.translate(x + cw / 2, 60 + li * 96 + (rng() - 0.5) * 12);
      ctx.rotate((rng() - 0.5) * 0.22);
      ctx.fillText(ch, 0, 0);
      if (rng() < 0.3 && ch !== ' ') {
        const len = 12 + rng() * 40;
        const g = ctx.createLinearGradient(0, 0, 0, len);
        g.addColorStop(0, color); g.addColorStop(1, 'rgba(60,5,3,0)');
        ctx.fillStyle = g; ctx.fillRect((rng() - 0.5) * cw * 0.5, size * 0.2, 2 + rng() * 2, len);
        ctx.fillStyle = color;
      }
      ctx.restore();
      x += cw;
    }
  });
  ctx.globalCompositeOperation = 'destination-out';
  speckle(ctx, W, H, rng, 2600, '#000', 1, 3, 0.8);
  return c;
}

function floorStain(seed, color = '#2a0403') {
  const S = 256, c = mk(S), ctx = c.getContext('2d'), rng = mulberry32(seed);
  for (let i = 0; i < 6; i++) blob(ctx, rng, S / 2 + (rng() - 0.5) * 70, S / 2 + (rng() - 0.5) * 70, 30 + rng() * 55, color, 0.75, 0.3, 20);
  ctx.globalCompositeOperation = 'destination-out';
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return c;
}

function dragTrail(seed) {
  const W = 128, H = 512, c = mk(W, H), ctx = c.getContext('2d'), rng = mulberry32(seed);
  for (let i = 0; i < 26; i++) {
    const x = 20 + rng() * 88;
    ctx.strokeStyle = `rgba(66,6,4,${0.25 + rng() * 0.5})`; ctx.lineWidth = 2 + rng() * 10;
    ctx.beginPath(); ctx.moveTo(x, rng() * 60);
    for (let y = 40; y < H; y += 40) ctx.lineTo(x + (rng() - 0.5) * 14, y);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'destination-out';
  speckle(ctx, W, H, rng, 2500, '#000', 1, 4, 0.8);
  const g = ctx.createLinearGradient(0, H * 0.7, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.7, W, H * 0.3);
  return c;
}

function flashlightCookie() {
  const S = 256, c = mk(S), ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#fff'); g.addColorStop(0.22, '#f4f0e6'); g.addColorStop(0.3, '#b8b4ac');
  g.addColorStop(0.55, '#8c8880'); g.addColorStop(0.72, '#a09c94'); g.addColorStop(0.8, '#55524c');
  g.addColorStop(0.97, '#000');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const rng = mulberry32(99);
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = `rgba(120,120,120,${0.2 + rng() * 0.3})`; ctx.lineWidth = 1 + rng() * 2;
    ctx.beginPath(); ctx.arc(S / 2 + (rng() - 0.5) * 8, S / 2 + (rng() - 0.5) * 8, 20 + rng() * 90, 0, 7); ctx.stroke();
  }
  blob(ctx, rng, S * 0.62, S * 0.4, 10, '#777', 0.5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Framed picture / sign textures
function signCanvas(lines, { w = 512, h = 160, bg = '#20241f', fg = '#c9c3a8', font = 'bold 54px Georgia, serif', seed = 5, border = true } = {}) {
  const c = mk(w, h), ctx = c.getContext('2d'), rng = mulberry32(seed);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  if (border) { ctx.strokeStyle = fg; ctx.globalAlpha = 0.6; ctx.lineWidth = 4; ctx.strokeRect(10, 10, w - 20, h - 20); ctx.globalAlpha = 1; }
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = font;
  const lh = h / (lines.length + 1);
  lines.forEach((l, i) => ctx.fillText(l, w / 2, lh * (i + 1)));
  grunge(ctx, w, h, { cells: 5, seed, alpha: 0.6 });
  for (let i = 0; i < 12; i++) blob(ctx, rng, rng() * w, rng() * h, 5 + rng() * 22, '#1a0f06', 0.5);
  return c;
}

function portraitCanvas(seed) {
  const W = 256, H = 320, c = mk(W, H), ctx = c.getContext('2d'), rng = mulberry32(seed);
  const g = ctx.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H / 2, H * 0.7);
  g.addColorStop(0, '#4a4034'); g.addColorStop(1, '#100c08');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // figure: shoulders, head; eyes scratched out
  ctx.fillStyle = '#17130f';
  ctx.beginPath(); ctx.ellipse(W / 2, H * 1.02, 95, 120, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#9a8c78';
  ctx.beginPath(); ctx.ellipse(W / 2, H * 0.4, 42, 56, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#d8d2c2';
  ctx.beginPath(); ctx.moveTo(W / 2 - 46, H * 0.27); ctx.lineTo(W / 2 + 46, H * 0.27); ctx.lineTo(W / 2 + 36, H * 0.16); ctx.lineTo(W / 2 - 36, H * 0.16); ctx.fill();
  ctx.strokeStyle = '#0a0705'; ctx.lineWidth = 2.5;
  for (let i = 0; i < 46; i++) {
    const x = W / 2 + (rng() - 0.5) * 70, y = H * 0.37 + (rng() - 0.5) * 16;
    ctx.beginPath(); ctx.moveTo(x - 14, y + (rng() - 0.5) * 12); ctx.lineTo(x + 14, y + (rng() - 0.5) * 12); ctx.stroke();
  }
  grunge(ctx, W, H, { cells: 4, seed, alpha: 0.7 });
  grunge(ctx, W, H, { cells: 30, seed: seed + 1, alpha: 0.4, mode: 'overlay' });
  return c;
}

// ---------------------------------------------------------------------------
export function buildTextures(progress = () => {}) {
  const T = { walls: {}, floors: {}, ceilings: {}, mats: {}, decals: {} };

  const wall = (name, o) => { T.walls[name] = matFrom(wallSet(o)); };
  wall('lobby', { seed: 11, base: '#8f8468', wains: '#3a2718', panels: true, trim: '#1c120a', wainH: 1.3, peel: 5 });
  wall('corridor', { seed: 21, base: '#97957c', wains: '#3f5a4c', trim: '#1b2019', peel: 12, stains: 12 });
  wall('office', { seed: 31, base: '#85795e', wains: '#33241a', panels: true, wainH: 1.0, peel: 6 });
  progress(0.1);
  wall('ward', { seed: 41, base: '#8d9686', wains: '#4a6a62', trim: '#1b2019', peel: 14, stains: 14 });
  wall('playroom', {
    seed: 51, base: '#a3935c', wains: '#6a4a3c', peel: 12,
    extra: (ctx, hx, rx, W, H, rng, yOf) => {
      // faded nursery frieze
      ctx.save(); ctx.globalAlpha = 0.28;
      for (let x = 30; x < W; x += 85) {
        const y = yOf(1.75) + Math.sin(x * 0.05) * 14;
        ctx.fillStyle = ['#7a2a22', '#2a4a6a', '#3a5a2a'][(x / 85 | 0) % 3];
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * 6.283 - 1.57, r = i % 2 ? 9 : 21;
          ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.fill();
      }
      ctx.restore();
    },
  });
  wall('bath', { seed: 61, style: 'tile', base: '#9ea39a', tileSize: 48, band: '#33524c', stains: 14, cracks: 3, baseboard: false });
  progress(0.2);
  wall('morgue', { seed: 71, style: 'tile', base: '#7f8d84', tileSize: 64, stains: 16, cracks: 4, baseboard: false });
  wall('concrete', { seed: 81, style: 'concrete', base: '#5f5d57', stains: 16, cracks: 7, baseboard: false, stripe: '#7a6418' });
  wall('brick', { seed: 91, style: 'brick', base: '#3a2a22', stains: 10, cracks: 2, baseboard: false, normal: 3 });
  wall('iso', { seed: 101, style: 'padded', base: '#8a8370', stains: 8, cracks: 0, baseboard: false, normal: 4 });
  wall('nurse', { seed: 111, base: '#9a9a8a', wains: '#5a6a5a', peel: 8 });
  progress(0.35);

  const floor = (name, o) => { T.floors[name] = matFrom(floorSet(o)); };
  floor('lino', { seed: 12, style: 'lino', a: '#77745c', b: '#3e4a40' });
  floor('linoRed', { seed: 22, style: 'lino', a: '#7c7460', b: '#5a2f28' });
  floor('wood', { seed: 32, style: 'wood', wet: 1 });
  floor('tile', { seed: 42, style: 'tile', a: '#8f948a', wet: 7, blotches: 14 });
  floor('tileDark', { seed: 52, style: 'tile', a: '#6b756d', b: 'rgba(20,30,26,0.5)', n: 4, wet: 6 });
  floor('concrete', { seed: 62, style: 'concrete', a: '#55534e', wet: 6, blotches: 14 });
  progress(0.5);

  T.ceilings.tiles = matFrom(ceilingSet({ seed: 13, style: 'tiles', a: '#8c8a7c' }));
  T.ceilings.concrete = matFrom(ceilingSet({ seed: 23, style: 'concrete', a: '#4a4844' }));

  // prop materials (tinted variants share texture sets)
  const metalA = metalSet(301, 0.6), metalB = metalSet(302, 1.2), metalClean = metalSet(303, 0.15, 30);
  const wood = woodSet(311), fabric = fabricSet(321), ticking = fabricSet(322, true, 9), fabricClean = fabricSet(323, false, 2);
  const M = T.mats;
  M.locker = matFrom(metalA, { color: 0x596b62, metalness: 0.5 });
  M.lockerDark = matFrom(metalB, { color: 0x3c4742, metalness: 0.5 });
  M.rust = matFrom(metalB, { color: 0x7a5a48, metalness: 0.6 });
  M.steel = matFrom(metalClean, { color: 0x9aa0a0, metalness: 0.85 });
  M.steelDark = matFrom(metalA, { color: 0x4a4e50, metalness: 0.8 });
  M.enamel = matFrom(metalSet(304, 0.3, 40), { color: 0xa9a89b, metalness: 0.25 });
  M.blackMetal = matFrom(metalA, { color: 0x1c1c1e, metalness: 0.7 });
  M.pipe = matFrom(metalB, { color: 0x5c4436, metalness: 0.7 });
  M.yellowMetal = matFrom(metalB, { color: 0x8a7420, metalness: 0.4 });
  M.redMetal = matFrom(metalA, { color: 0x7a1c14, metalness: 0.4 });
  M.wood = matFrom(wood, { color: 0x5a3c26 });
  M.woodDark = matFrom(wood, { color: 0x2c1c12 });
  M.woodLight = matFrom(wood, { color: 0x8a7050 });
  M.sheet = matFrom(fabric, { color: 0xb8b4a6 });
  M.sheetClean = matFrom(fabricClean, { color: 0xc8c4b8 });
  M.mattress = matFrom(ticking, { color: 0xa8a090 });
  M.curtain = matFrom(fabric, { color: 0x7d8a80, side: THREE.DoubleSide });
  M.cloth = matFrom(fabric, { color: 0x4a3a34 });
  M.plastic = new THREE.MeshStandardMaterial({ color: 0xb9b3a4, roughness: 0.55, map: metalClean.map });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.9 });
  M.paper = new THREE.MeshStandardMaterial({ color: 0xc8bf9e, roughness: 0.95, emissive: 0x2a281e, emissiveIntensity: 0.35 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x0a1210, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.55 });
  M.glassDark = new THREE.MeshStandardMaterial({ color: 0x030505, roughness: 0.06, metalness: 0.8 });
  M.black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  M.porcelain = new THREE.MeshStandardMaterial({ color: 0xa8a89c, roughness: 0.25, map: metalClean.map });
  M.mannequin = new THREE.MeshStandardMaterial({ color: 0x8c8474, roughness: 0.5, map: fabricClean.map });
  M.doorWood = matFrom(doorSet('wood', 401));
  M.doorMetal = matFrom(doorSet('metal', 402), { metalness: 0.55 });
  M.doorCell = matFrom(doorSet('cell', 403), { metalness: 0.55 });
  M.frame = matFrom(wood, { color: 0x241a12 });
  M.frameMetal = matFrom(metalB, { color: 0x34363a, metalness: 0.6 });
  progress(0.7);

  const D = T.decals;
  D.blood = [1, 2, 3, 4].map((s) => decalMat(bloodSplat(500 + s)));
  D.bloodFloor = [1, 2, 3].map((s) => decalMat(floorStain(520 + s), { rough: 0.15 }));
  D.grimeFloor = [1, 2].map((s) => decalMat(floorStain(530 + s, '#0a0907'), { rough: 0.3 }));
  D.hands = [1, 2].map((s) => decalMat(handprints(540 + s)));
  D.trail = decalMat(dragTrail(550), { rough: 0.2 });
  T.scrawl = (text, seed = 1, color) => decalMat(scrawl(text, 600 + seed, color), { rough: 0.6 });
  T.sign = (lines, o) => new THREE.MeshStandardMaterial({ map: tex(signCanvas(lines, o), { repeat: false }), roughness: 0.7 });
  T.portrait = (seed) => new THREE.MeshStandardMaterial({ map: tex(portraitCanvas(seed), { repeat: false }), roughness: 0.6 });
  T.cookie = flashlightCookie();
  T.canvasTex = tex;
  progress(1);
  return T;
}

export const texUtil = { mk, grunge, blob, speckle, noiseCanvas, tex, crack };
