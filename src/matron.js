// The Night Matron: procedural model, animation and stalking AI.
import * as THREE from '../vendor/three.module.min.js';
import { Parts, partsToObject } from './build.js';
import { texUtil } from './textures.js';
import { audio } from './audio.js';
import { clamp, damp, dampAngle, mulberry32, rand, wrapAngle, pick } from './util.js';
import { cellX, cellZ, toCol, toRow, idx, COLS, ROWS, BASEMENT_ROW, MAP } from './map.js';

const H = Math.PI / 2;

function faceCanvas(scream) {
  const W = 512, Hh = 640, c = texUtil.mk(W, Hh), g = c.getContext('2d'), rng = mulberry32(scream ? 77 : 78);
  // skin: grey, waxy, a little green
  const bg = g.createRadialGradient(W / 2, Hh * 0.42, 30, W / 2, Hh * 0.5, Hh * 0.6);
  bg.addColorStop(0, '#b3ad9a'); bg.addColorStop(0.55, '#8d8876'); bg.addColorStop(1, '#3a372e');
  g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
  texUtil.grunge(g, W, Hh, { cells: 6, seed: 5, alpha: 0.6 });
  texUtil.grunge(g, W, Hh, { cells: 40, seed: 6, alpha: 0.4, mode: 'overlay' });
  const hollow = (x, y, rx, ry, col, a) => {
    g.save(); g.translate(x, y); g.scale(rx, ry);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore();
  };
  // bruising: temples, cheeks, around the mouth
  hollow(W / 2, Hh * 0.74, 170, 110, 'rgba(46,26,40,1)', 0.75);
  hollow(W * 0.2, Hh * 0.6, 70, 130, 'rgba(40,30,36,1)', 0.75); hollow(W * 0.8, Hh * 0.6, 70, 130, 'rgba(40,30,36,1)', 0.75);
  hollow(W * 0.5, Hh * 0.2, 180, 60, 'rgba(60,56,44,1)', 0.4);
  // liver spots and rot
  for (let i = 0; i < 40; i++) texUtil.blob(g, rng, rng() * W, rng() * Hh, 3 + rng() * 14, rng() < 0.5 ? '#3e3a2c' : '#4a2a26', 0.18 + rng() * 0.3);
  // veins
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    let x = rng() < 0.5 ? rng() * W * 0.36 : W - rng() * W * 0.36, y = rng() * Hh * 0.9, a = rng() * 6.28;
    g.strokeStyle = `rgba(34,40,66,${0.35 + rng() * 0.35})`; g.lineWidth = 1 + rng() * 2;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 16; k++) { a += (rng() - 0.5) * 1.1; x += Math.cos(a) * 11; y += Math.sin(a) * 11; g.lineTo(x, y); }
    g.stroke();
  }
  // eye sockets: nothing in them
  const ey = Hh * 0.43, ex = W * 0.17, er = scream ? 60 : 52;
  for (const s of [-1, 1]) {
    const x = W / 2 + s * ex;
    hollow(x, ey, er * 2.0, er * 2.1, 'rgba(30,8,14,1)', 0.95);
    hollow(x, ey, er * 1.3, er * 1.35, 'rgba(0,0,0,1)', 1);
    g.fillStyle = '#000'; g.beginPath(); g.ellipse(x, ey, er * 0.8, er * (scream ? 0.95 : 0.74), 0, 0, 7); g.fill();
    // raw rim
    g.strokeStyle = 'rgba(96,14,14,0.55)'; g.lineWidth = 4; g.beginPath(); g.ellipse(x, ey, er * 0.86, er * (scream ? 1.0 : 0.8), 0, 0, 7); g.stroke();
    // black tears
    for (let i = 0; i < (scream ? 7 : 4); i++) {
      const tx = x + (rng() - 0.5) * er * 1.1, len = 70 + rng() * (scream ? 240 : 150);
      const gr = g.createLinearGradient(0, ey, 0, ey + len);
      gr.addColorStop(0, 'rgba(4,1,2,0.97)'); gr.addColorStop(1, 'rgba(24,4,6,0)');
      g.fillStyle = gr; g.fillRect(tx, ey + er * 0.3, 3 + rng() * 5, len);
    }
  }
  // nose: rotted away to two slits
  g.fillStyle = 'rgba(6,2,3,0.95)';
  g.beginPath(); g.ellipse(W / 2 - 14, Hh * 0.572, 7, 17, 0.3, 0, 7); g.fill();
  g.beginPath(); g.ellipse(W / 2 + 14, Hh * 0.572, 7, 17, -0.3, 0, 7); g.fill();
  if (!scream) {
    // the mouth is sewn shut
    const my = Hh * 0.7, x0 = W * 0.2, x1 = W * 0.8;
    const yAt = (t) => my + Math.sin(t * Math.PI) * 10 + Math.sin(t * 17) * 3;
    g.strokeStyle = 'rgba(60,8,10,0.75)'; g.lineWidth = 15;
    g.beginPath(); for (let i = 0; i <= 30; i++) { const t = i / 30; g.lineTo(x0 + (x1 - x0) * t, yAt(t)); } g.stroke();
    g.strokeStyle = '#050203'; g.lineWidth = 5;
    g.beginPath(); for (let i = 0; i <= 30; i++) { const t = i / 30; g.lineTo(x0 + (x1 - x0) * t, yAt(t)); } g.stroke();
    // thick black thread, pulled tight
    for (let i = 0; i <= 15; i++) {
      const t = (i + 0.3 * rng()) / 15, x = x0 + (x1 - x0) * t, y = yAt(t), h = 20 + rng() * 14, lean = (rng() - 0.5) * 16;
      g.strokeStyle = '#040404'; g.lineWidth = 3.4;
      g.beginPath(); g.moveTo(x - lean, y - h); g.lineTo(x + lean, y + h); g.stroke();
      if (rng() < 0.55) { g.beginPath(); g.moveTo(x + lean, y - h); g.lineTo(x - lean, y + h); g.stroke(); }
      g.fillStyle = 'rgba(70,8,8,0.8)';
      g.beginPath(); g.arc(x - lean, y - h, 3.2, 0, 7); g.fill(); g.beginPath(); g.arc(x + lean, y + h, 3.2, 0, 7); g.fill();
    }
    for (let i = 0; i < 7; i++) { const x = x0 + rng() * (x1 - x0), len = 30 + rng() * 110; const gr = g.createLinearGradient(0, my, 0, my + len); gr.addColorStop(0, 'rgba(40,4,6,0.9)'); gr.addColorStop(1, 'rgba(40,4,6,0)'); g.fillStyle = gr; g.fillRect(x, my + 8, 2 + rng() * 4, len); }
  } else {
    // ...until it tears open
    const mx = W / 2, my = Hh * 0.745, rx = 104, ry = 108;
    hollow(mx, my, rx * 1.7, ry * 1.5, 'rgba(52,6,8,1)', 0.95);
    const mg = g.createRadialGradient(mx, my, 8, mx, my, ry);
    mg.addColorStop(0, '#000'); mg.addColorStop(0.8, '#0c0102'); mg.addColorStop(1, '#3c0707');
    g.fillStyle = mg; g.beginPath(); g.ellipse(mx, my, rx, ry, 0, 0, 7); g.fill();
    // teeth: long, thin, wrong
    for (let i = 0; i < 19; i++) {
      const t = (i + 0.5) / 19, a = Math.PI + t * Math.PI;
      const x = mx + Math.cos(a) * rx * 0.95, y = my + Math.sin(a) * ry * 0.95;
      const len = 20 + rng() * 44, w = 4 + rng() * 5;
      g.fillStyle = rng() < 0.25 ? '#7a6a4a' : '#b9ae8c';
      g.beginPath(); g.moveTo(x - w, y - 2); g.lineTo(x + w, y - 2); g.lineTo(x + (mx - x) * 0.14 + (rng() - 0.5) * 6, y + len); g.closePath(); g.fill();
    }
    for (let i = 0; i < 17; i++) {
      const t = (i + 0.5) / 17, a = t * Math.PI;
      const x = mx + Math.cos(a) * rx * 0.93, y = my + Math.sin(a) * ry * 0.93;
      const len = 16 + rng() * 38, w = 4 + rng() * 5;
      g.fillStyle = rng() < 0.25 ? '#7a6a4a' : '#b9ae8c';
      g.beginPath(); g.moveTo(x - w, y + 2); g.lineTo(x + w, y + 2); g.lineTo(x + (mx - x) * 0.14 + (rng() - 0.5) * 6, y - len); g.closePath(); g.fill();
    }
    // torn cheeks and snapped thread
    g.strokeStyle = 'rgba(70,8,8,0.95)'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(mx - rx, my - 30); g.lineTo(W * 0.1, my - 96); g.stroke();
    g.beginPath(); g.moveTo(mx + rx, my - 30); g.lineTo(W * 0.9, my - 96); g.stroke();
    g.strokeStyle = '#040404'; g.lineWidth = 3;
    for (let i = 0; i < 18; i++) { const a = rng() * 6.28; const x = mx + Math.cos(a) * rx * 1.02, y = my + Math.sin(a) * ry * 1.02; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 34, y + 10 + rng() * 40); g.stroke(); }
  }
  for (let i = 0; i < 9; i++) texUtil.crack(g, rng, rng() * W, rng() * Hh * 0.55, 60 + rng() * 140, 1.4, 'rgba(14,8,8,0.8)');
  const vg = g.createRadialGradient(W / 2, Hh / 2, Hh * 0.26, W / 2, Hh / 2, Hh * 0.55);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.9)');
  g.fillStyle = vg; g.fillRect(0, 0, W, Hh);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// A skull-like head sculpted from a sphere: sunken sockets and cheeks, a tapered
// jaw, and (screaming) a jaw that has come unhinged around a real cavity.
function sculptHead(scream) {
  const g = new THREE.SphereGeometry(1, 60, 44);
  const p = g.attributes.position, uv = g.attributes.uv;
  const G = (dx, dy, sx, sy) => Math.exp(-(dx * dx) / (sx * sx) - (dy * dy) / (sy * sy));
  const ss = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    uv.setXY(i, x * 0.47 + 0.5, y * 0.47 + 0.5);
    const f = ss(-0.2, 0.3, z);
    let dz = 0;
    dz -= 0.24 * (G(x - 0.36, y - 0.15, 0.17, 0.14) + G(x + 0.36, y - 0.15, 0.17, 0.14)); // sockets
    dz += 0.07 * G(x, y - 0.36, 0.7, 0.07);                                                // brow
    dz += 0.11 * G(x, y - 0.02, 0.075, 0.2);                                               // nose ridge
    dz -= 0.12 * (G(x - 0.5, y + 0.32, 0.2, 0.26) + G(x + 0.5, y + 0.32, 0.2, 0.26));       // cheeks
    if (scream) dz -= 0.6 * ss(1.05, 0.5, Math.hypot(x / 0.44, (y + 0.51) / 0.37));         // the maw
    z += dz * f;
    x *= 1 - 0.36 * ss(0.15, -0.95, y);                                                    // jaw taper
    if (scream && y < -0.08) y = -0.08 + (y + 0.08) * 1.42;                                // unhinged
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function dressTexture() {
  const S = 512, c = texUtil.mk(S), g = c.getContext('2d'), rng = mulberry32(31);
  g.fillStyle = '#a9a595'; g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 3) { g.fillStyle = `rgba(0,0,0,${rng() * 0.1})`; g.fillRect(x, 0, 1, S); }
  texUtil.grunge(g, S, S, { cells: 5, seed: 12, alpha: 0.7 });
  // filth rising from the hem (v=0 is canvas bottom)
  let gr = g.createLinearGradient(0, S, 0, S * 0.35);
  gr.addColorStop(0, 'rgba(20,10,6,0.95)'); gr.addColorStop(0.5, 'rgba(50,14,8,0.5)'); gr.addColorStop(1, 'rgba(50,14,8,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) texUtil.blob(g, rng, rng() * S, S * (0.1 + rng() * 0.8), 10 + rng() * 46, rng() < 0.6 ? '#3a0806' : '#1c0f08', 0.5 + rng() * 0.4);
  for (let i = 0; i < 20; i++) { const x = rng() * S, y = rng() * S * 0.7; g.fillStyle = 'rgba(50,6,4,0.7)'; g.fillRect(x, y, 2 + rng() * 4, 30 + rng() * 120); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

export class Matron {
  constructor(game) {
    this.game = game;
    this.nav = game.level.nav;
    this.active = false;
    this.state = 'dormant';
    this.x = 0; this.z = 0; this.yaw = 0;
    this.speed = 0;
    this.path = null; this.pathI = 0;
    this.repath = 0; this.wait = 0;
    this.detect = 0; this.seeT = 99; this.lastSeen = { x: 0, z: 0 };
    this.sees = false;
    this.searchLeft = 0; this.calm = 0;
    this.doorWait = 0;
    this.stuckT = 0; this.lastPos = { x: 0, z: 0 };
    this.gait = 0; this.stutter = 0; this.twitch = 0; this.twitchT = 3;
    this.clickT = 3; this.stepT = 0;
    this.humming = false; this.hum = null;
    this.alertT = 0;
    this.grace = 0;
    this.visYaw = 0; this.screaming = false;
    this.rage = 0; this.finale = false;
    this._build();
  }

  // ---- model -----------------------------------------------------------------
  _build() {
    const T = this.game.T, M = T.mats;
    const root = (this.root = new THREE.Group());
    const skin = (this.skin = new THREE.MeshStandardMaterial({ color: 0x9a947f, roughness: 0.62, map: M.mannequin.map }));
    const dressMat = new THREE.MeshStandardMaterial({ map: dressTexture(), roughness: 0.92, side: THREE.DoubleSide });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 0.95 });

    // dress (lathe) with a ragged hem
    const pts = [[0.37, 0.02], [0.34, 0.25], [0.27, 0.62], [0.18, 1.02], [0.125, 1.24], [0.16, 1.44], [0.2, 1.6], [0.19, 1.7], [0.09, 1.8], [0.05, 1.84]].map(([r, y]) => new THREE.Vector2(r, y));
    const dg = new THREE.LatheGeometry(pts, 20);
    const dp = dg.attributes.position, rng = mulberry32(8);
    const hem = []; for (let i = 0; i <= 20; i++) hem.push(rng() * 0.22);
    hem[20] = hem[0];
    for (let i = 0; i < dp.count; i++) {
      const y = dp.getY(i);
      if (y < 0.03) { const seg = Math.round((Math.atan2(dp.getX(i), dp.getZ(i)) / (Math.PI * 2) + 1) % 1 * 20); dp.setY(i, y + hem[seg]); }
      dp.setZ(i, dp.getZ(i) * (0.72 + 0.28 * clamp(1 - y / 1.2, 0, 1)));
    }
    dg.computeVertexNormals();
    const dress = new THREE.Mesh(dg, dressMat); dress.castShadow = true;
    this.body = new THREE.Group(); this.body.add(dress); root.add(this.body);
    // collar bones / shoulders
    const sp = new Parts();
    sp.sphere(dressMat, 1, 0, 1.68, 0, 0.25, 0.07, 0.11);
    sp.cyl(skin, 0.032, 0.042, 0.2, 0, 1.9, 0.01, 0.12, 0, 0, 8);
    this.body.add(partsToObject(sp));

    // head
    const head = (this.head = new THREE.Group());
    head.position.set(0, 2.05, 0.03);
    this.geoCalm = sculptHead(false); this.geoScream = sculptHead(true);
    this.faceCalm = faceCanvas(false); this.faceScream = faceCanvas(true);
    this.faceMat = new THREE.MeshStandardMaterial({ map: this.faceCalm, roughness: 0.58 });
    const skull = (this.skull = new THREE.Mesh(this.geoCalm, this.faceMat));
    skull.scale.set(0.106, 0.148, 0.118); skull.castShadow = true;
    head.add(skull);
    // something far back in the sockets catches the light
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8d0b8 });
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.0026, 6, 5), this.eyeMat);
      e.position.set(s * 0.038, 0.022, 0.083); head.add(e); this.eyes.push(e);
    }
    // hair
    const hair = new Parts();
    hair.sphere(hairMat, 1, 0, 0.022, -0.03, 0.121, 0.15, 0.123, 0, 14, 10);
    const hr = mulberry32(4);
    for (let i = 0; i < 44; i++) {
      const a = -2.25 + (i / 43) * 4.5 + Math.PI; // sides and back
      const len = 0.35 + hr() * 0.55, r = 0.105 + hr() * 0.022;
      hair.box(hairMat, 0.007 + hr() * 0.012, len, 0.005, Math.sin(a) * r, -len / 2 + 0.06, Math.cos(a) * r - 0.02, (hr() - 0.5) * 0.12, a, (hr() - 0.5) * 0.12);
    }
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) hair.box(hairMat, 0.006, 0.3 + hr() * 0.3, 0.004, s * (0.086 + i * 0.008), -0.09 - i * 0.02, 0.07 - i * 0.02, 0.05, 0, s * 0.05);
    for (let i = 0; i < 3; i++) { const x = -0.06 + hr() * 0.12; hair.box(hairMat, 0.0016, 0.16 + hr() * 0.2, 0.0016, x, -0.02 - hr() * 0.05, 0.114 - Math.abs(x) * 0.3, 0.1, 0, (hr() - 0.5) * 0.3); }
    // cap
    hair.box(M.sheetClean, 0.15, 0.06, 0.09, 0, 0.142, 0.03, -0.25);
    hair.box(M.redMetal, 0.012, 0.04, 0.004, 0, 0.143, 0.077, -0.25); hair.box(M.redMetal, 0.036, 0.013, 0.004, 0, 0.143, 0.077, -0.25);
    head.add(partsToObject(hair));
    this.body.add(head);

    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.215, 1.66, 0);
      const up = new Parts();
      up.sphere(skin, 0.045, 0, 0, 0);
      up.cyl(skin, 0.036, 0.026, 0.5, 0, -0.25, 0, 0, 0, 0, 7);
      sh.add(partsToObject(up));
      const el = new THREE.Group(); el.position.set(0, -0.5, 0);
      const lo = new Parts();
      lo.sphere(skin, 0.03, 0, 0, 0);
      lo.cyl(skin, 0.026, 0.018, 0.52, 0, -0.26, 0, 0, 0, 0, 7);
      lo.box(skin, 0.07, 0.09, 0.022, 0, -0.56, 0);
      for (let i = 0; i < 4; i++) {
        const fx = -0.03 + i * 0.02, spread = (i - 1.5) * 0.09;
        lo.cyl(skin, 0.007, 0.009, 0.13, fx + spread * 0.5, -0.66, 0.005, 0.12, 0, spread, 5);
        lo.cyl(skin, 0.002, 0.007, 0.13, fx + spread * 1.5, -0.78, 0.03, 0.35, 0, spread * 1.2, 5);
      }
      lo.cyl(skin, 0.004, 0.009, 0.14, s * 0.05, -0.6, 0.02, 0.3, 0, s * 0.9, 5);
      el.add(partsToObject(lo));
      sh.add(el); this.body.add(sh);
      this.arms.push({ sh, el, s });
    }
    root.visible = false;
    this.game.scene.add(root);
  }

  // ---- lifecycle ---------------------------------------------------------------
  spawn(x, z, state = 'patrol') {
    this.active = true; this.root.visible = true;
    this.x = x; this.z = z; this.path = null; this.detect = 0; this.sees = false;
    this.root.position.set(x, 0, z);
    this.setState(state);
  }

  despawn() {
    this.active = false; this.root.visible = false; this.state = 'dormant';
    this._hum(false);
  }

  setState(s) {
    if (this.state === s) return;
    const prev = this.state;
    this.state = s;
    this.path = null; this.wait = 0;
    if (s === 'patrol') { this._hum(true); this.calm = 0; }
    else if (s === 'chase') {
      this._hum(false);
      if (prev !== 'chase') {
        this.alertT = 0.75;
        audio.play('scream', { pos: this.pos3(), gain: 1.0, dur: 0.75, pitch: 1.15 });
        this.game.onSpotted();
      }
    } else if (s === 'investigate') { this._hum(false); audio.play('croak', { pos: this.pos3(), gain: 0.9 }); }
    else if (s === 'search') { this._hum(false); this.searchLeft = 3; }
    else if (s === 'scripted') { /* controlled */ }
  }

  _hum(on) {
    if (on && !this.humming) { this.hum = audio.startLoop('hum', { pos: this.pos3(), gain: 0.95 }); this.humming = true; }
    else if (!on && this.humming) { audio.stopLoop('hum', 0.25); this.hum = null; this.humming = false; }
  }

  pos3(y = 1.9) { return { x: this.x, y, z: this.z }; }
  get basement() { return this.z >= BASEMENT_ROW * 2; }

  // ---- senses ------------------------------------------------------------------
  canSeePoint(px, pz, range) {
    const dx = px - this.x, dz = pz - this.z, d = Math.hypot(dx, dz);
    if (d > range) return false;
    if (d > 2.6) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      if ((dx * fx + dz * fz) / d < 0.2) return false;
    }
    return this.nav.los(this.x, this.z, px, pz);
  }

  visionRange() {
    const p = this.game.player;
    if (p.hidden) return 0;
    if (p.lightOn && !this.game.lightsKilled) return 17;
    return p.crouch ? 4.2 : 8;
  }

  hear(x, z, radius) {
    if (!this.active || this.state === 'chase' || this.state === 'scripted' || this.finale || this.grace > 0) return;
    const d = Math.hypot(x - this.x, z - this.z);
    if (d > radius) return;
    // sound carries poorly through walls
    if (!this.nav.los(this.x, this.z, x, z) && d > radius * 0.6) return;
    this.noiseAt = { x, z };
    if (this.state !== 'investigate') this.setState('investigate');
    this.path = null;
  }

  // ---- movement ----------------------------------------------------------------
  goTo(x, z) {
    const p = this.nav.findPath(this.x, this.z, x, z);
    this.path = p && p.length ? p : null; this.pathI = 0;
    return !!this.path;
  }

  _follow(dt, speed) {
    if (!this.path) return true;
    if (this.doorWait > 0) { this.doorWait -= dt; this.speed = 0; return false; }
    // skip ahead where the way is clear
    while (this.pathI + 1 < this.path.length && this.nav.clearWalk(this.x, this.z, this.path[this.pathI + 1].x, this.path[this.pathI + 1].z)) this.pathI++;
    const n = this.path[this.pathI];
    // door in the way?
    const door = this.nav.doorAt[n.cell];
    if (door && !door.open && door.kind !== 'gate' && door.kind !== 'shutter') {
      const dd = Math.hypot(door.x - this.x, door.z - this.z);
      if (dd < 1.5) {
        if (!door.aiCanOpen()) { this.path = null; return true; }
        const fast = this.state === 'chase' || this.finale;
        door.setOpen(true, door.sideOf(this.x, this.z), { fast });
        this.doorWait = fast ? 0.32 : 0.8;
        this.game.onMatronDoor(door, fast);
        return false;
      }
    }
    const dx = n.x - this.x, dz = n.z - this.z, d = Math.hypot(dx, dz);
    if (d < 0.18) {
      this.pathI++;
      if (this.pathI >= this.path.length) { this.path = null; return true; }
      return false;
    }
    const step = Math.min(d, speed * dt);
    this.x += (dx / d) * step; this.z += (dz / d) * step;
    this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), this.state === 'chase' || this.finale ? 12 : 5, dt);
    this.speed = speed;
    return false;
  }

  _randomWalkable(cx0, cz0, minD, maxD, tries = 30) {
    const basement = this.basement;
    for (let i = 0; i < tries; i++) {
      const a = rand(Math.PI * 2), d = rand(minD, maxD);
      const x = cx0 + Math.cos(a) * d, z = cz0 + Math.sin(a) * d;
      const c = toCol(x), r = toRow(z);
      if (c < 1 || r < 1 || c >= COLS - 1 || r >= ROWS - 1) continue;
      if ((r >= BASEMENT_ROW) !== basement) continue;
      if (!this.nav.passable(c, r) || this.nav.doorAt[idx(c, r)]) continue;
      return { x: cellX(c), z: cellZ(r) };
    }
    return null;
  }

  // ---- brain -------------------------------------------------------------------
  update(dt) {
    if (!this.active) return;
    const g = this.game, p = g.player;
    this.grace = Math.max(0, this.grace - dt);
    const dx = p.pos.x - this.x, dz = p.pos.z - this.z, dist = Math.hypot(dx, dz);
    this.dist = dist;
    this.speed = 0;

    if (this.state !== 'scripted' || this.scriptSense) {
      // vision
      const range = this.visionRange();
      this.sees = this.grace <= 0 && range > 0 && this.canSeePoint(p.pos.x, p.pos.z, range);
      if (this.sees) {
        this.seeT = 0; this.lastSeen.x = p.pos.x; this.lastSeen.z = p.pos.z;
        const tt = 0.22 + 0.95 * clamp(dist / range, 0, 1);
        this.detect = Math.min(1, this.detect + dt / tt);
      } else {
        this.seeT += dt;
        this.detect = Math.max(0, this.detect - dt * 0.35);
      }
      if (this.detect >= 1 && this.state !== 'chase' && !this.finale) this.setState('chase');
    }

    switch (this.state) {
      case 'patrol': this._patrol(dt); break;
      case 'investigate': this._investigate(dt); break;
      case 'chase': this._chase(dt, dist); break;
      case 'search': this._search(dt); break;
      case 'scripted': this._scripted(dt); break;
      case 'finale': this._finale(dt, dist); break;
    }

    // caught
    if ((this.state !== 'scripted' || this.scriptSense) && this.grace <= 0 && !p.hidden && !g.dead && dist < 1.05 && this.nav.los(this.x, this.z, p.pos.x, p.pos.z)) {
      g.die();
    }

    // stuck recovery
    this.stuckT += dt;
    if (this.stuckT > 2.5) {
      if (this.path && Math.hypot(this.x - this.lastPos.x, this.z - this.lastPos.z) < 0.25 && this.doorWait <= 0 && this.wait <= 0) this.path = null;
      this.lastPos.x = this.x; this.lastPos.z = this.z; this.stuckT = 0;
    }

    this._sounds(dt, dist);
    if (!this.override) this._animate(dt);
  }

  _patrol(dt) {
    const g = this.game, p = g.player;
    this.calm += dt;
    if (this.wait > 0) { this.wait -= dt; return; }
    if (!this.path) {
      // The director: she drifts closer the longer it has been quiet.
      const want = clamp(20 - this.calm * 0.22, 5, 20);
      let best = null, bs = 1e9;
      for (let i = 0; i < 7; i++) {
        const c = this._randomWalkable(p.pos.x, p.pos.z, 3, 26);
        if (!c) continue;
        const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
        const s = Math.abs(d - want) + Math.random() * 4;
        if (s < bs) { bs = s; best = c; }
      }
      if (best && this.goTo(best.x, best.z)) { /* walking */ } else this.wait = 1;
      return;
    }
    if (this._follow(dt, 1.3)) this.wait = rand(0.8, 3);
  }

  _investigate(dt) {
    if (this.wait > 0) {
      this.wait -= dt;
      this.yaw += Math.sin(this.game.time * 1.7) * dt * 1.4;
      if (this.wait <= 0) this.setState('search');
      return;
    }
    if (!this.path) {
      if (!this.noiseAt || !this.goTo(this.noiseAt.x, this.noiseAt.z)) { this.setState('patrol'); return; }
      if (Math.hypot(this.noiseAt.x - this.x, this.noiseAt.z - this.z) < 1.2) { this.path = null; this.wait = 2.5; return; }
    }
    if (this._follow(dt, 2.3)) this.wait = 2.8;
  }

  _chase(dt, dist) {
    const g = this.game, p = g.player;
    if (this.alertT > 0) { // the shriek: a beat for the player to run
      this.alertT -= dt;
      this.yaw = dampAngle(this.yaw, Math.atan2(p.pos.x - this.x, p.pos.z - this.z), 10, dt);
      return;
    }
    this.repath -= dt;
    const tx = this.seeT < 1.2 ? p.pos.x : this.lastSeen.x, tz = this.seeT < 1.2 ? p.pos.z : this.lastSeen.z;
    if (this.seeT < 1.2) { this.lastSeen.x = p.pos.x; this.lastSeen.z = p.pos.z; }
    if (this.repath <= 0 || !this.path) {
      this.repath = 0.3;
      if (!this.goTo(tx, tz)) {
        // direct approach when in the same cell / no path
        const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
        if (d > 0.3 && this.nav.los(this.x, this.z, tx, tz)) {
          const st = Math.min(d, 4.5 * dt); this.x += dx / d * st; this.z += dz / d * st;
          this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 12, dt); this.speed = 4.5;
        }
      }
    }
    const arrived = this._follow(dt, 4.5);
    // hidden in a locker?
    if (p.hidden) {
      if (p.hidden.compromised) {
        if (Math.hypot(p.hidden.x - this.x, p.hidden.z - this.z) < 1.6) { g.lockerKill(p.hidden); return; }
        this.lastSeen.x = p.hidden.x + p.hidden.outX * 0.9; this.lastSeen.z = p.hidden.z + p.hidden.outZ * 0.9;
        this.seeT = Math.min(this.seeT, 2);
      }
    }
    if (this.seeT > 6 || (arrived && this.seeT > 1.2)) this.setState('search');
  }

  _search(dt) {
    const g = this.game, p = g.player;
    if (this.wait > 0) {
      this.wait -= dt;
      this.yaw += Math.sin(g.time * 2.1) * dt * 1.8;
      return;
    }
    if (!this.path) {
      if (this.searchLeft-- <= 0) { this.setState('patrol'); return; }
      // sometimes she checks a locker. Maybe yours.
      let target = null;
      const lockers = g.level.objs.lockers.filter((l) => Math.hypot(l.x - this.x, l.z - this.z) < 14 && (l.z >= BASEMENT_ROW * 2) === this.basement);
      if (lockers.length && Math.random() < 0.6) {
        const mine = lockers.find((l) => l.occupied);
        const lk = mine && Math.random() < 0.7 ? mine : pick(lockers);
        target = { x: lk.x + lk.outX * 1.0, z: lk.z + lk.outZ * 1.0, locker: lk };
      } else target = this._randomWalkable(this.lastSeen.x, this.lastSeen.z, 2, 9);
      if (!target || !this.goTo(target.x, target.z)) { this.wait = 1; return; }
      this.searchTarget = target;
      return;
    }
    if (this._follow(dt, 1.9)) {
      const t = this.searchTarget;
      if (t && t.locker) {
        // lean in. listen.
        this.faceTarget = { x: t.locker.x, z: t.locker.z };
        this.wait = rand(3, 4.5);
        audio.play('croak', { pos: this.pos3(), gain: 0.9, dur: 1.6 });
        this.game.sched.after(this.wait, () => { this.faceTarget = null; });
      } else this.wait = rand(1.2, 2.5);
    }
  }

  // Scripted walk: follow a list of waypoints, then call done.
  script(points, speed, done) {
    this.setState('scripted');
    this.scriptPts = points.slice(); this.scriptSpeed = speed; this.scriptDone = done;
    this.path = null;
  }

  _scripted(dt) {
    if (this.wait > 0) { this.wait -= dt; return; }
    if (!this.path) {
      const n = this.scriptPts && this.scriptPts.shift();
      if (!n) { const d = this.scriptDone; this.scriptDone = null; if (d) d(); return; }
      if (n.wait) { this.wait = n.wait; if (n.fn) n.fn(); return; }
      if (!this.goTo(n.x, n.z)) return;
    }
    this._follow(dt, this.scriptSpeed);
  }

  startFinale() {
    this.finale = true; this.state = 'finale'; this._hum(false); this.path = null; this.alertT = 0;
  }

  _finale(dt, dist) {
    const p = this.game.player;
    this.repath -= dt;
    if (this.repath <= 0 || !this.path) { this.repath = 0.25; this.goTo(p.pos.x, p.pos.z); }
    // rubber band: terrifyingly fast when far, just barely outrunnable when close
    const sp = this.finaleSpeed ?? clamp(3.6 + (dist - 5) * 0.22, 3.9, 8.5);
    const arrived = this._follow(dt, sp);
    if (arrived || !this.path) {
      const dx = p.pos.x - this.x, dz = p.pos.z - this.z, d = Math.hypot(dx, dz);
      if (d > 0.3 && this.nav.los(this.x, this.z, p.pos.x, p.pos.z)) {
        const st = Math.min(d, sp * dt); this.x += dx / d * st; this.z += dz / d * st;
        this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 12, dt); this.speed = sp;
      }
    }
  }

  // ---- presentation ------------------------------------------------------------
  _sounds(dt, dist) {
    const g = this.game, p = g.player;
    const los = this.nav.los(this.x, this.z, p.pos.x, p.pos.z);
    this.los = los;
    if (this.hum) { this.hum.setPos(this.pos3()); this.hum.setMuffle(!los && dist > 6); }
    if (this.state === 'investigate' || this.state === 'search') {
      this.clickT -= dt;
      if (this.clickT <= 0) { this.clickT = rand(2.2, 5); audio.play('croak', { pos: this.pos3(), gain: 0.7 }); }
    }
    if ((this.state === 'chase' || this.finale) && this.speed > 2) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = 0.2;
        audio.play('footstep', { surface: 'wet', pos: this.pos3(0.2), gain: 1.5 });
        if (Math.random() < 0.035) audio.play('scream', { pos: this.pos3(), gain: 0.7, dur: 0.5, pitch: rand(1.0, 1.3) });
      }
    }
  }

  _animate(dt) {
    const g = this.game, t = g.time, p = g.player;
    const chasing = this.state === 'chase' || this.finale;
    this.gait += dt * (this.speed > 0.1 ? 2.2 + this.speed * 1.5 : 0.6);
    // stop-motion stutter: her pose only updates a few times a second
    this.stutter -= dt;
    const rate = chasing ? 1 / 24 : 1 / 9;
    if (this.stutter <= 0) {
      this.stutter = rate;
      const r = this.root;
      r.position.set(this.x, 0, this.z);
      let yaw = this.yaw;
      if (this.faceTarget) yaw = Math.atan2(this.faceTarget.x - this.x, this.faceTarget.z - this.z);
      this.visYaw = yaw;
      r.rotation.y = yaw;
      const sway = Math.sin(this.gait) * (chasing ? 0.09 : 0.045);
      this.body.rotation.z = sway;
      this.body.rotation.x = chasing ? 0.2 : this.faceTarget ? 0.28 : 0.03 + Math.sin(t * 0.4) * 0.02;
      this.body.position.y = Math.abs(Math.sin(this.gait)) * (chasing ? 0.05 : 0.02);
      // head: track the player when she can see them, otherwise loll
      this.twitchT -= rate;
      if (this.twitchT <= 0) { this.twitchT = rand(1.5, 5); this.twitch = rand(0.15, 0.4); this.twitchDir = Math.random() < 0.5 ? -1 : 1; }
      let hy = 0, hz = Math.sin(t * 0.6) * 0.22, hx = 0.08;
      if (this.sees || chasing || this.state === 'scripted' && this.lookAtPlayer) {
        hy = clamp(wrapAngle(Math.atan2(p.pos.x - this.x, p.pos.z - this.z) - yaw), -1.3, 1.3);
        hx = -0.1;
      }
      if (this.twitch > 0) { this.twitch -= rate; hz += this.twitchDir * (0.5 + Math.random() * 0.35); hy += (Math.random() - 0.5) * 0.3; }
      if (chasing) { hz += (Math.random() - 0.5) * 0.5; hx += (Math.random() - 0.5) * 0.2; }
      this.head.rotation.set(hx, hy, hz);
      // arms
      for (const a of this.arms) {
        if (chasing) {
          a.sh.rotation.x = -1.35 + Math.sin(this.gait * 1.3 + a.s) * 0.25 + (Math.random() - 0.5) * 0.15;
          a.sh.rotation.z = a.s * 0.12; a.el.rotation.x = -0.35 + (Math.random() - 0.5) * 0.2;
        } else if (this.faceTarget) {
          a.sh.rotation.x = -0.9; a.sh.rotation.z = a.s * 0.3; a.el.rotation.x = -1.1;
        } else {
          a.sh.rotation.x = Math.sin(this.gait + (a.s > 0 ? Math.PI : 0)) * 0.1 + 0.04;
          a.sh.rotation.z = a.s * 0.07; a.el.rotation.x = -0.08 + Math.sin(t * 1.1 + a.s) * 0.04;
        }
      }
    }
    // screaming face
    const scr = this.screaming || (this.state === 'chase' && this.alertT > 0);
    if (scr !== this._scr) this._applyFace(scr);
    // eyes glint brighter in the dark, further away
    this.eyeMat.color.setScalar(chasing ? 1.6 : 0.9);
  }

  // Place the model so her face is `d` metres in front of a camera, staring into it.
  faceCamera(camera, d, drop = 0) {
    const f = new THREE.Vector3(); camera.getWorldDirection(f);
    const hx = camera.position.x + f.x * d, hz = camera.position.z + f.z * d;
    const yaw = Math.atan2(-f.x, -f.z);
    this.root.position.set(hx - Math.sin(yaw) * 0.03, camera.position.y + f.y * d - 2.05 - drop, hz - Math.cos(yaw) * 0.03);
    this.root.rotation.y = yaw;
    this.body.rotation.set(0, 0, 0); this.body.position.y = 0;
    this.root.visible = true;
  }

  setScream(on) { this.screaming = on; this._applyFace(on); }
  _applyFace(scr) {
    this._scr = scr;
    this.faceMat.map = scr ? this.faceScream : this.faceCalm;
    this.skull.geometry = scr ? this.geoScream : this.geoCalm;
  }
}

export { MAP as _MAP };
