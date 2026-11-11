// Scripted moments: every scare, set piece and story beat.
import * as THREE from '../vendor/three.module.min.js';
import { audio } from './audio.js';
import { cellX as cx, cellZ as cz, toCol, toRow, BASEMENT_ROW, CELL } from './map.js';
import { clamp, lerp, rand, pick, wrapAngle, damp } from './util.js';
import { ENDING } from './story.js';

const H = Math.PI / 2;
const ease = (t) => 1 - Math.pow(1 - t, 3);

export class Events {
  constructor(game) {
    this.g = game;
    this.f = {};                 // story flags
    this.lightningT = 7;
    this.tvT = 0;
    this.randT = rand(50, 80);
    this.scrapeT = 0;
    this.puffs = [];
    this.zone = null; this.prevZone = null;
    this.horseT = 0;
    this._v = new THREE.Vector3();
  }

  get L() { return this.g.level; }
  get O() { return this.g.level.objs; }
  get MK() { return this.g.level.markers; }
  at(t, fn) { return this.g.sched.after(t, fn); }

  // =========================================================================
  begin() {
    const g = this.g, MK = this.MK;
    g.player.place(MK.start.x, MK.start.z, 0);
    g.fx.fade = 1; g.fx.fadeTo = 1;
    g.state = 'intro'; g.player.frozen = true;
    g.ui.card(['2:13 AM', "Saint Maren’s Sanatorium<small>closed since 1987</small>"], 2.5, () => {
      audio.play('slam', { pos: { x: MK.start.x, y: 1.4, z: MK.start.z + 1.6 }, gain: 1.4 });
      g.player.shake = 0.5;
      this.at(0.5, () => { g.fx.fadeTo = 0; g.fx.fadeRate = 0.4; g.state = 'play'; g.player.frozen = false; g.checkpoint(); });
      this.at(1.4, () => this.lightning());
      this.at(3.2, () => g.ui.objective('The door has locked itself behind you. Find a light.'));
      this.at(4.5, () => g.ui.hint(g.input.touch ? 'Left thumb moves · right thumb looks' : 'WASD move  ·  mouse look  ·  E use', 6));
    });
  }

  // =========================================================================
  update(dt) {
    const g = this.g, p = g.player, O = this.O, MK = this.MK, f = this.f;
    const c = toCol(p.pos.x), r = toRow(p.pos.z);
    this.zone = this.L.zone(p.pos.x, p.pos.z);
    const zoneChanged = this.zone !== this.prevZone;

    // the flashlight lies on the counter, still switched on
    if (!p.hasLight) {
      const d = this._v.set(0.36, 0.2, -0.91).normalize();
      p.light.position.set(MK.flashlight.x + d.x * 0.14, MK.flashlight.y + 0.04, MK.flashlight.z + d.z * 0.14);
      p.light.target.position.copy(p.light.position).addScaledVector(d, 6);
      p.light.intensity = 60 * (Math.random() < 0.02 ? 0.3 : 1);
    }

    // ---- lightning through the lobby windows ----
    if (!this.L.isBasement(p.pos.z)) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) { this.lightningT = rand(16, 40); if (p.pos.z > cz(13)) this.lightning(); }
    }

    // ---- C1: the wheelchair ----
    if (!f.wheelchair && p.hasLight && c === 15 && r <= 16 && r >= 13) {
      f.wheelchair = true;
      const w = O.wheelchair, z0 = w.position.z;
      let sq = 0;
      g.sched.tween(2.6, (t) => {
        w.position.z = z0 + ease(t) * 2.6; O.wheelchairBlock.z = w.position.z;
        sq -= 0.016; if (sq <= 0 && t < 0.9) { sq = 0.28; audio.play('squeak', { pos: { x: w.position.x, y: 0.3, z: w.position.z }, gain: 0.5 }); }
      });
      g.fearBoost = Math.max(g.fearBoost, 0.45);
    }

    // ---- day room: the television ----
    if (!f.tv && this.zone === 'y') {
      f.tv = true;
      this.at(0.7, () => {
        O.tv.on = true;
        audio.play('tvOn', { pos: MK.tv });
        audio.startLoop('static', { pos: MK.tv, gain: 0.5 });
      });
      if (!f.fuse1) audio.startLoop('musicBox', { pos: MK.musicBox, gain: 0.6 });
    }
    if (O.tv.on) {
      this.tvT -= dt;
      if (this.tvT <= 0) { this.tvT = 0.05; this.drawTV(); }
      g.fxLight.position.set(MK.tv.x - 0.6, 1.3, MK.tv.z);
      g.fxLight.color.setRGB(0.55, 0.7, 1.0);
      g.fxLight.intensity = 1.6 + Math.random() * 1.6; g.fxLight.distance = 8;
      const d = Math.hypot(p.pos.x - MK.tv.x, p.pos.z - MK.tv.z);
      if (!f.tvFace && d < 2.7 && this.zone === 'y') {
        f.tvFace = true;
        O.tv.face = 1;
        audio.play('glitch', { gain: 0.9, dur: 0.5 }); audio.play('stinger', { gain: 0.55, dur: 0.9 });
        g.fx.glitch = 0.7; p.shake = 0.5; g.fearBoost = 0.9;
        this.at(0.42, () => { O.tv.face = 0; });
        this.at(0.9, () => {
          O.tv.on = false; O.tv.mat.color.setScalar(0); g.fxLight.intensity = 0;
          audio.stopLoop('static', 0.02); audio.play('tvOn', { pos: MK.tv, gain: 0.5 });
        });
        this.at(2.4, () => audio.play('whisper', { pan: 0.8, gain: 0.4, dur: 1.8 }));
      }
    }

    // ---- play room: rocking horse after the fuse ----
    if (this.horseT > 0) {
      this.horseT -= dt;
      const a = Math.sin(g.time * 3.4) * 0.22 * Math.min(1, this.horseT / 2);
      O.horse.rotation.x = a;
      if (Math.abs(a) > 0.2 && !this._hsq) { this._hsq = true; audio.play('creak', { pos: { x: O.horse.position.x, y: 0.4, z: O.horse.position.z }, gain: 0.45, dur: 0.35, pitch: 1.5 }); }
      if (Math.abs(a) < 0.05) this._hsq = false;
    }

    // ---- C1: the figure at the end of the hall ----
    if (f.fuse1 && !f.hallFigure && this.zone === 'c' && c === 15 && r >= 14 && r <= 18 && !f.matronAwake) {
      f.hallFigure = 1;
      O.c1end.state = 'on';
      g.matron.override = true;
      g.matron.root.visible = true;
      g.matron.root.position.set(cx(15), 0, cz(9) + 0.3); g.matron.root.rotation.y = 0;
      g.matron.head.rotation.set(0.1, 0, 0.5);
      audio.play('boom', { gain: 0.5 });
      this.figT = 0;
    }
    if (f.hallFigure === 1) {
      const fwd = p.forward();
      const dx = cx(15) - p.pos.x, dz = cz(9) - p.pos.z, d = Math.hypot(dx, dz);
      const looking = (dx * fwd.x + dz * fwd.z) / d > 0.93;
      if (looking) this.figT += dt;
      if (this.figT > 0.9 || d < 9 || this.zone !== 'c') {
        f.hallFigure = 2;
        O.c1end.override = 0;
        audio.play('bulbPop', { pos: { x: cx(15), y: 2.8, z: cz(9) }, gain: 1.2 });
        audio.play('shh', { pan: 0, gain: 0.35, dur: 1.2 });
        g.lightsKilled = true; g.fearBoost = 1;
        this.at(0.45, () => {
          g.matron.root.visible = false; g.matron.override = false; g.lightsKilled = false;
          O.c1end.override = null; O.c1end.state = 'flicker';
        });
      }
    }

    // ---- stores: the dressmaker's dummies ----
    const inStore = p.pos.x > 10 && p.pos.x < 28 && p.pos.z > 20 && p.pos.z < 28;
    if (inStore) this.mannequins(dt);
    if (f.mannActive && !inStore && !f.mannDone && this.zone === 'c') {
      f.mannDone = true; f.mannActive = false;
      let best = null, bd = 1e9;
      for (const m of O.mannequins) { if (m.fallen) continue; const d = Math.hypot(m.x - cx(13), m.z - cz(12)); if (d < bd) { bd = d; best = m; } }
      if (best) this.at(0.6, () => { this.topple(best, 1); g.fearBoost = 0.8; });
    }

    // ---- C2: the lights ----
    if (!f.c2 && r === 7 && this.zone === 'c') { f.c2 = true; this.c2Sequence(); }

    // ---- isolation 2: something wants out ----
    if (!f.jBang && !f.matronAwake && f.c2done && Math.hypot(p.pos.x - cx(27), p.pos.z - cz(7)) < 2.6) {
      f.jBang = true;
      this.bangDoor(3);
    }

    // ---- bathroom: running water ----
    if (!f.shower && this.zone === 'b' && !f.curtain) { f.shower = true; audio.startLoop('shower', { pos: MK.shower, gain: 0.7 }); }

    // ---- boiler steam ----
    for (const k of ['steam1', 'steam2']) {
      if (!f[k] && Math.hypot(p.pos.x - MK[k].x, p.pos.z - MK[k].z) < 1.5) {
        f[k] = true;
        audio.play('steam', { pos: MK[k], gain: 1.3 });
        this.puff(MK[k]); p.shake = 0.35; g.fearBoost = Math.max(g.fearBoost, 0.7);
      }
    }
    this.updatePuffs(dt);

    // furnace breathing
    O.furnaceGlow.color.setRGB(1.6 + Math.sin(g.time * 2.3) * 0.5, 0.42 + Math.sin(g.time * 3.1) * 0.1, 0.08);

    // ---- finale ----
    if (f.finale && !f.escaped) this.finaleUpdate(dt);

    // ---- drifting dread when nothing else is happening ----
    if (g.state === 'play' && p.hasLight && !f.finale && g.matron.state !== 'chase') {
      this.randT -= dt;
      if (this.randT <= 0) { this.randT = rand(45, 95); this.randomScare(); }
    }

    if (zoneChanged) this.prevZone = this.zone;
  }

  // =========================================================================
  lightning() {
    const g = this.g, w = this.O.windowMat;
    const flash = (v) => { w.color.setRGB(0.55 * v + 0.02, 0.7 * v + 0.04, 1.0 * v + 0.07); g.hemiBoost = v; };
    flash(3); this.at(0.07, () => flash(0.2)); this.at(0.14, () => flash(4)); this.at(0.26, () => flash(1)); this.at(0.34, () => flash(0));
    this.at(rand(0.5, 1.6), () => audio.play('thunder', { gain: 0.9 }));
  }

  drawTV() {
    const tv = this.O.tv, ctx = tv.ctx;
    if (!this._tvImg) this._tvImg = ctx.createImageData(128, 96);
    const d = this._tvImg.data;
    const bar = (performance.now() * 0.05) % 96;
    for (let y = 0; y < 96; y++) {
      const b = Math.abs(y - bar) < 6 ? 60 : 0;
      for (let x = 0; x < 128; x++) {
        const i = (y * 128 + x) * 4, v = Math.random() * 190 + b;
        d[i] = v * 0.85; d[i + 1] = v * 0.95; d[i + 2] = v; d[i + 3] = 255;
      }
    }
    ctx.putImageData(this._tvImg, 0, 0);
    if (tv.face > 0) {
      ctx.globalAlpha = 0.92;
      ctx.drawImage(this.g.matron.faceScream.image, 18 + (Math.random() - 0.5) * 6, -14, 92, 124);
      ctx.globalAlpha = 1;
    }
    tv.tex.needsUpdate = true;
    tv.mat.color.setScalar(tv.face > 0 ? 2.4 : 1.5);
  }

  // =========================================================================
  frontDoor() {
    const g = this.g, d = this.L.doors.front;
    d.shake = 1;
    audio.play('locked', { pos: { x: d.x, y: 1.1, z: d.z } });
    g.ui.subtitle(this.f.power ? 'The lock is fused shut.' : 'Mag-locked. Dead. It needs power to release.', 3.5);
  }

  // Player used a normal door. Returns true if handled here.
  doorSpecial(door) {
    const g = this.g, f = this.f;
    if (door.name === 'iso2' && door.sealed) {
      door.shake = 1;
      audio.play('locked', { pos: { x: door.x, y: 1.1, z: door.z } });
      if (!f.matronAwake) { this.at(0.35, () => this.bangDoor(1, 1.6)); g.ui.subtitle('Something inside is breathing.', 3); }
      return true;
    }
    if (door.name === 'gate' && door.sealed) {
      audio.play('locked', { pos: { x: door.x, y: 1.1, z: door.z } });
      g.ui.subtitle('Electric gate. No power.', 3);
      return true;
    }
    return false;
  }

  bangDoor(n, gain = 1.3) {
    const g = this.g, d = this.L.doors.iso2;
    for (let i = 0; i < n; i++) this.at(i * 0.36, () => {
      d.shake = 1.4; audio.play('bang', { pos: { x: d.x, y: 1.3, z: d.z - 0.3 }, gain });
      g.player.shake = Math.max(g.player.shake, 0.45); g.fearBoost = 1;
    });
  }

  // =========================================================================
  pickup(pk) {
    const g = this.g, p = g.player, f = this.f, O = this.O, MK = this.MK;
    switch (pk.kind) {
      case 'flashlight':
        p.hasLight = true; p.lightOn = true;
        p.lightDir.copy(p.forward());
        audio.play('pickup');
        g.ui.objective('Restore the power. The breaker is in the basement.');
        this.at(1.5, () => g.ui.hint(g.input.touch ? 'Push the stick far to run' : 'F light  ·  Shift run  ·  C crouch', 6));
        g.checkpoint();
        break;
      case 'note':
        g.readNote(pk.id);
        break;
      case 'battery':
        p.battery = Math.min(1, p.battery + 0.45);
        audio.play('click', { gain: 0.5 });
        g.ui.hint('Batteries', 2);
        if (pk.id === 'bat2') this.storeBlackout();
        break;
      case 'key':
        g.inv.keys.add(pk.id);
        audio.play('pickup');
        if (pk.id === 'wardKey') {
          g.ui.hint('Ward wing key', 2.5);
          g.ui.objective('Unlock the ward wing, at the end of the hall.');
          this.at(2.0, () => this.phoneRing());
        } else if (pk.id === 'basementKey') {
          g.ui.hint('Basement key', 2.5);
          g.ui.objective('The basement stairs are at the east end of the ward corridor.');
          this.bathRun();
        }
        g.checkpoint();
        break;
      case 'fuse':
        g.inv.fuses++;
        g.ui.setFuses(g.inv.fuses);
        audio.play('pickup'); audio.play('fuse', { gain: 0.5 });
        if (pk.id === 'fuse1') this.playroomScare();
        else if (pk.id === 'fuse2') this.awaken();
        else if (pk.id === 'fuse3') this.morgueGrab();
        if (g.inv.fuses >= 3) this.at(6, () => g.ui.objective('Three fuses. Get them to the breaker.'));
        g.checkpoint();
        break;
    }
  }

  noteClosed(id) {
    const g = this.g, f = this.f, m = g.matron;
    if (id === 'workOrder' && !f.wo) { f.wo = true; g.ui.objective('Find three fuses. The breaker is in the basement.'); }
    if (id === 'log' && !f.logScare) {
      f.logScare = true;
      if (!(m.active && (m.state === 'chase' || m.dist < 9))) { this.at(0.05, () => this.faceFlash(0.5)); this.at(1.4, () => { this.O.nurseLight.state = 'flicker'; }); }
    }
  }

  // =========================================================================
  // Her face, filling the screen, for a moment.
  faceFlash(dur = 0.45, gain = 1.3) {
    const g = this.g, m = g.matron, cam = g.camera;
    const was = m.root.visible;
    m.override = true; m.setScream(true);
    audio.play('scream', { gain, dur: dur + 0.25, pitch: 1.2 }); audio.play('glitch', { gain: 0.6, dur });
    g.fx.glitch = 0.9; g.fx.chroma = 0.05; g.player.shake = 1.2; g.fearBoost = 1;
    g.sched.tween(dur, (t) => {
      m.faceCamera(cam, lerp(0.66, 0.43, ease(t)) + (Math.random() - 0.5) * 0.02, -0.045);
      m.head.rotation.set(-0.05, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.5);
      for (const a of m.arms) { a.sh.rotation.set(-1.5, 0, a.s * 0.5); a.el.rotation.x = -0.5; }
      this.scareLight(1);
      g.fx.glitch = Math.max(g.fx.glitch, 0.28);
    }, () => {
      m.override = false; m.setScream(false); m.root.visible = was && m.active;
      this.scareLight(0); g.fx.fade = 0.7; // blink
      audio.play('gasp');
    });
  }

  // Harsh light from below the chin; the flashlight is cut so nothing blows out.
  scareLight(on) {
    const g = this.g, cam = g.camera, L = g.fxLight;
    g.scareDim = !!on;
    if (!on) { L.intensity = 0; return; }
    const f = this._v; cam.getWorldDirection(f);
    L.position.copy(cam.position).addScaledVector(f, 0.1); L.position.y -= 0.3;
    L.color.setRGB(0.72, 0.86, 1.0); L.intensity = 0.42 + Math.random() * 0.3; L.distance = 2.5;
  }

  // Being caught.
  deathScare(done) {
    const g = this.g, m = g.matron, cam = g.camera, p = g.player;
    m.override = true; m.setScream(true); m._hum(false);
    p.frozen = true; p.forceLook = null;
    audio.play('scream', { gain: 1.9, dur: 1.4 }); audio.play('stinger', { gain: 0.8 });
    g.fx.glitch = 1; g.fx.chroma = 0.07; p.shake = 2; g.fearBoost = 1;
    g.fx.flash = 0.3; g.fx.flashColor.setRGB(0.5, 0, 0);
    g.sched.tween(1.15, (t) => {
      const d = lerp(0.95, 0.4, ease(Math.min(1, t * 3.2))) + (Math.random() - 0.5) * 0.025;
      m.faceCamera(cam, d, -0.05);
      m.head.rotation.set(-0.08 + (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.7);
      for (const a of m.arms) { a.sh.rotation.set(-1.45 + (Math.random() - 0.5) * 0.2, 0, a.s * (0.35 + Math.random() * 0.2)); a.el.rotation.x = -0.6; }
      this.scareLight(1);
      g.fx.glitch = Math.max(g.fx.glitch, 0.25 + t * 0.6); p.shake = Math.max(p.shake, 1.2);
      g.fovPunch = -10 * ease(t);
    }, () => {
      g.fx.fade = 1; g.fx.fadeTo = 1; g.fx.glitch = 0; g.fovPunch = 0;
      m.override = false; m.setScream(false); m.root.visible = false; this.scareLight(0);
      audio.play('boom', { gain: 0.9 });
      this.at(1.3, done);
    });
  }

  // =========================================================================
  phoneRing() {
    const f = this.f, O = this.O;
    if (f.phone) return;
    f.phone = 1;
    audio.startLoop('phone', { pos: this.MK.phone, gain: 1.0 });
    O.phoneInteract.enabled = true;
    this.g.fearBoost = 0.8;
    this.phoneTimeout = this.at(30, () => { if (f.phone === 1) { f.phone = 3; audio.stopLoop('phone', 0.05); O.phoneInteract.enabled = false; } });
  }

  answerPhone() {
    const g = this.g, f = this.f, O = this.O, L = this.L;
    if (f.phone !== 1) return;
    f.phone = 2;
    O.phoneInteract.enabled = false;
    audio.stopLoop('phone', 0.02); audio.play('click', { gain: 0.6 });
    g.player.frozen = true;
    const st = audio.startLoop('static', { gain: 0.1 });
    g.ui.subtitle('…', 2);
    this.at(1.6, () => { audio.play('whisper', { gain: 0.35, dur: 2.2, pan: -0.3 }); g.ui.subtitle('[ breathing ]', 2.4); });
    this.at(4.2, () => { audio.startLoop('hum', { gain: 0.32 }); g.ui.subtitle('[ someone is humming ]', 3.5); });
    this.at(9.0, () => { audio.stopLoop('hum', 0.03); audio.stopLoop('static', 0.03); audio.duck(0.15, 0.2); });
    this.at(10.3, () => {
      audio.play('shh', { pan: -0.9, gain: 0.9, dur: 1.7 });
      g.ui.subtitle('“Shhhhhh.”', 3);
      O.officeLight.state = 'off'; g.lightsKilled = true;
      L.doors.office.slamShut();
      g.player.shake = 0.6; g.fearBoost = 1;
      g.player.frozen = false;
    });
    this.at(11.6, () => { g.lightsKilled = false; audio.duck(1, 1.5); });
    this.at(13.5, () => audio.play('croak', { pos: { x: cx(13), y: 1.6, z: cz(15) }, gain: 0.8 }));
    this.at(16, () => {
      O.officeLight.state = 'flicker';
      const d = L.doors.office;
      if (!d.open) { d.speed = 0.5; d.open = true; d.target = 1.2; audio.play('doorOpen', { pos: { x: d.x, y: 1.2, z: d.z }, dur: 2.4, pitch: 0.7, gain: 0.9 }); }
    });
    this.at(19, () => { O.officeLight.state = 'on'; });
  }

  // =========================================================================
  playroomScare() {
    const g = this.g, f = this.f, O = this.O, p = g.player;
    f.fuse1 = true;
    audio.stopLoop('musicBox', 0.01);
    O.playLight.state = 'off';
    audio.duck(0.1, 0.1);
    g.fearBoost = 0.9; g.flickerBoost = 0.5;
    this.at(1.3, () => {
      audio.duck(1, 2);
      // the ball rolls out of the dark
      const b = O.ball, x0 = b.position.x, z0 = b.position.z;
      const tx = lerp(x0, p.pos.x, 0.82), tz = lerp(z0, p.pos.z, 0.82);
      let last = 0;
      g.sched.tween(3.2, (t) => {
        const e = ease(t);
        b.position.x = lerp(x0, tx, e); b.position.z = lerp(z0, tz, e);
        const hop = Math.abs(Math.sin(e * 9.5)) * 0.32 * (1 - e);
        b.position.y = 0.13 + hop;
        b.rotation.x += 0.2 * (1 - t);
        const ph = Math.floor(e * 9.5 / Math.PI);
        if (ph !== last && t < 0.75) { last = ph; audio.play('bounce', { pos: { x: b.position.x, y: 0.1, z: b.position.z }, gain: 0.9 * (1 - e) }); }
      });
    });
    this.at(2.2, () => { this.horseT = 9; });
    this.at(4.6, () => audio.play('shh', { pos: { x: cx(17), y: 0.8, z: cz(13) }, gain: 0.8, dur: 1.4 }));
    this.at(6.5, () => { O.playLight.state = 'flicker'; g.flickerBoost = 0; });
  }

  // =========================================================================
  mannequins(dt) {
    const g = this.g, p = g.player, O = this.O, f = this.f;
    const fwd = p.forward();
    const lit = p.lightOn && !g.lightsKilled;
    this.scrapeT -= dt;
    let moved = null;
    for (const m of O.mannequins) {
      if (m.fallen) continue;
      const dx = m.x - p.pos.x, dz = m.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.5) { this.topple(m, 0.8); continue; }
      const seen = lit && (dx * fwd.x + dz * fwd.z) / d > 0.45;
      if (seen) continue;
      const want = Math.atan2(-dx, -dz);
      if (f.mannActive) {
        if (d > 1.45) {
          const st = Math.min(d - 1.45, 2.1 * dt);
          let nx = m.x - (dx / d) * st, nz = m.z - (dz / d) * st, ok = true;
          for (const o of O.mannequins) if (o !== m && !o.fallen && Math.hypot(o.x - nx, o.z - nz) < 0.62) { ok = false; break; }
          nx = clamp(nx, 10.5, 27.5); nz = clamp(nz, 21.2, 26.8);
          if (ok) { m.x = nx; m.z = nz; moved = m; }
        }
        m.yaw = want;
        m.g.position.set(m.x, 0, m.z); m.g.rotation.y = m.yaw;
        m.head.rotation.set(0, 0, d < 2.5 ? 0.45 : 0.2);
      } else {
        // before they wake: only the heads follow you
        m.head.rotation.y = clamp(wrapAngle(want - m.yaw), -1.25, 1.25);
      }
    }
    if (moved && this.scrapeT <= 0) {
      this.scrapeT = rand(0.35, 1.1);
      audio.play('creak', { pos: { x: moved.x, y: 0.2, z: moved.z }, gain: 0.35, dur: 0.22, pitch: rand(1.6, 2.4) });
    }
  }

  topple(m, gain = 1) {
    if (m.fallen) return;
    m.fallen = true;
    const g = this.g, r0 = m.g.rotation.x;
    audio.play('bodyFall', { pos: { x: m.x, y: 0.4, z: m.z }, gain: 1.2 * gain });
    audio.play('clang', { pos: { x: m.x, y: 0.4, z: m.z }, gain: 0.25, f: 520 });
    g.noise(m.x, m.z, 11);
    g.sched.tween(0.42, (t) => { m.g.rotation.x = lerp(r0, -H * 0.97, t * t); m.g.position.y = 0.1 * t; });
  }

  storeBlackout() {
    const g = this.g, p = g.player, O = this.O, f = this.f;
    if (f.mannActive || f.mannDone) return;
    g.lightsKilled = true; g.fearBoost = 1;
    audio.play('zap', { gain: 0.4 }); audio.duck(0.2, 0.2);
    for (let i = 0; i < 7; i++) this.at(0.25 + i * 0.2, () => {
      const m = pick(O.mannequins);
      audio.play('creak', { pos: { x: m.x, y: 0.2, z: m.z }, gain: 0.5, dur: 0.25, pitch: rand(1.5, 2.6) });
    });
    this.at(1.75, () => {
      // they are all much closer now, and all facing you
      const alive = O.mannequins.filter((m) => !m.fallen);
      const base = Math.atan2(cx(13) - p.pos.x, cz(12) - p.pos.z); // toward the east door
      alive.forEach((m, i) => {
        const a = base + (i - (alive.length - 1) / 2) * 0.42, rr = 1.9 + (i % 3) * 0.55;
        m.x = clamp(p.pos.x + Math.sin(a) * rr, 10.5, 27.5); m.z = clamp(p.pos.z + Math.cos(a) * rr, 21.2, 26.8);
        m.yaw = Math.atan2(p.pos.x - m.x, p.pos.z - m.z);
        m.g.position.set(m.x, 0, m.z); m.g.rotation.y = m.yaw; m.head.rotation.set(0, 0, i % 2 ? 0.5 : -0.5);
      });
      g.lightsKilled = false; f.mannActive = true;
      audio.duck(1, 1); audio.play('stinger', { gain: 0.8 });
      p.shake = 0.7;
      this.at(1.5, () => g.ui.hint('Do not look away', 3.5));
    });
  }

  // =========================================================================
  c2Sequence() {
    const g = this.g, L = this.L, p = g.player;
    const ls = L.lightsByTag('c2').sort((a, b) => a.x - b.x);
    audio.play('lever', { gain: 0.9 });
    ls.forEach((l) => { l.state = 'on'; });
    g.fearBoost = 0.5;
    this.at(2.6, () => audio.play('riser', { dur: 2.6, gain: 0.45 }));
    const pairs = [[0, 6], [1, 5], [2, 4], [3, 3]];
    pairs.forEach(([a, b], i) => this.at(3.0 + i * 0.62, () => {
      for (const k of new Set([a, b])) { const l = ls[k]; l.state = 'dead'; l.override = null; audio.play('bulbPop', { pos: { x: l.x, y: 2.8, z: l.z }, gain: 1.3 }); }
      g.fearBoost = 1; p.shake = Math.max(p.shake, 0.2 + i * 0.12);
      if (i === 3) { g.lightsKilled = true; audio.duck(0.1, 0.1); }
    }));
    this.at(6.1, () => audio.play('croak', { pos: { x: p.pos.x - Math.sin(p.yaw + Math.PI) * 1.2, y: 1.7, z: p.pos.z - Math.cos(p.yaw + Math.PI) * 1.2 }, gain: 1.2, dur: 1.3 }));
    this.at(7.6, () => { g.lightsKilled = false; audio.duck(1, 2); ls[1].state = 'flicker'; ls[5].state = 'flicker'; this.f.c2done = true; });
    this.at(9, () => g.ui.objective('Find the fuses. Find a way down.'));
  }

  // =========================================================================
  peek() {
    const g = this.g, p = g.player, O = this.O, MK = this.MK, f = this.f, m = g.matron;
    if (f.peek) return;
    f.peek = true;
    O.peekInteract.enabled = false;
    p.peek = { pos: MK.peek.clone(), yaw: 0 }; p.yaw = 0; p.pitch = -0.04; p.frozen = true;
    g.fx.peekTo = 1;
    audio.duck(0.25, 0.5);
    const fig = O.cellFigure;
    const slam = !m.active && !f.matronAwake;
    this.at(2.6, () => { fig.head.rotation.y = 0.5; audio.play('creak', { pos: { x: cx(32), y: 1.5, z: cz(1) }, gain: 0.5, dur: 0.5, pitch: 0.7 }); });
    this.at(4.4, () => { g.lightsKilled = true; audio.play('zap', { gain: 0.3 }); });
    this.at(5.0, () => { g.lightsKilled = false; fig.g.visible = false; g.fearBoost = 1; });
    if (slam) {
      this.at(7.2, () => {
        // it was never in the corner
        audio.play('bang', { pos: { x: cx(31), y: 1.5, z: cz(6) }, gain: 1.6 });
        this.L.doors.iso3.shake = 1.5;
        this.faceFlash(0.6, 1.5);
      });
      this.at(7.85, () => this.endPeek());
    } else {
      this.at(6.6, () => {
        fig.g.visible = true; fig.g.position.set(cx(31), 0, cz(5) - 0.2); fig.g.rotation.y = 0; fig.head.rotation.set(0, 0, 0.6);
        audio.play('stinger', { gain: 0.9 }); p.shake = 1; g.fx.glitch = 0.6;
      });
      this.at(7.3, () => this.endPeek());
    }
  }

  endPeek() {
    const g = this.g, p = g.player;
    p.peek = null; p.frozen = false; g.fx.peekTo = 0;
    p.yaw = Math.PI * 0.15; p.pitch = 0;
    audio.duck(1, 1.5);
    this.at(1.2, () => { this.O.cellFigure.g.visible = false; });
  }

  // =========================================================================
  // Fuse two. She wakes.
  awaken() {
    const g = this.g, L = this.L, f = this.f, m = g.matron, MK = this.MK, O = this.O;
    f.matronAwake = true; f.wardScript = true;
    for (const t of ['ward', 'c2', 'nurse', 'c4', 'bath']) L.setLights(t, 'off');
    audio.duck(0.05, 0.1);
    g.fearBoost = 1; g.player.shake = 0.3;
    audio.play('boom', { gain: 0.8 });
    this.at(1.6, () => {
      const d = L.doors.iso2;
      d.sealed = false; d.setOpen(true, 1, { fast: true });
      audio.duck(1, 3);
    });
    this.at(3.0, () => g.ui.subtitle('Something down the hall has started humming.', 4.5));
    this.at(3.2, () => {
      m.spawn(MK.matronSpawn.x, MK.matronSpawn.z, 'patrol');
      m.scriptSense = true; m.grace = 0;
      const lockerE = O.lockers.find((l) => Math.abs(l.x - cx(9)) < 1.2 && Math.abs(l.z - cz(3)) < 1.2);
      m.script([
        { x: cx(27), z: cz(7) }, { x: cx(5), z: cz(7) }, { x: cx(4), z: cz(4) }, { x: cx(8), z: cz(3) },
        { wait: 3.4, fn: () => { if (lockerE && lockerE.occupied) { m.faceTarget = { x: lockerE.x, z: lockerE.z }; audio.play('croak', { pos: m.pos3(), gain: 1, dur: 1.8 }); this.at(3.3, () => { m.faceTarget = null; }); } } },
        { x: cx(2), z: cz(3) }, { wait: 2.2 }, { x: cx(4), z: cz(7) }, { x: cx(14), z: cz(7) },
      ], 1.75, () => { f.wardScript = false; m.setState('patrol'); });
      m._hum(true);
    });
    this.at(6.5, () => { g.ui.objective('She hears you. Hide.'); });
    this.at(8, () => g.ui.hint(g.input.touch ? 'Hide in a locker — before she sees you' : 'Hide in a locker  ·  or crouch (C), light off (F)', 7));
    this.at(48, () => { L.lightsByTag('c2').forEach((l, i) => { l.state = i === 1 || i === 4 ? 'flicker' : 'dead'; }); O.wardLights[0].state = 'flicker'; O.nurseLight.state = 'flicker'; O.bathLight.state = 'flicker'; O.c4light.state = 'flicker'; });
  }

  // =========================================================================
  pullCurtain() {
    const g = this.g, f = this.f, O = this.O, MK = this.MK;
    if (f.curtain) return;
    f.curtain = true;
    O.curtainInteract.enabled = false; O.curtainCol.enabled = false;
    audio.play('curtain', { pos: MK.curtain });
    audio.stopLoop('shower', 0.02);
    const c = O.curtain;
    g.sched.tween(0.45, (t) => { const e = ease(t); c.scale.x = lerp(1, 0.16, e); c.position.x = cx(20) + 0.82 * e; });
    g.fearBoost = 0.9;
    this.at(0.7, () => audio.play('drip', { pos: MK.shower, gain: 0.8 }));
    this.at(1.5, () => audio.play('drip', { pos: MK.shower, gain: 0.7 }));
    this.O.keyPickup = this._spawnKey();
  }

  _spawnKey() {
    // the key was created lazily so its glint does not show through the curtain
    const L = this.L, MK = this.MK;
    return L.objs.makeKey('basementKey', MK.bathKey.x, MK.bathKey.y, MK.bathKey.z, 1.1);
  }

  bathRun() {
    const g = this.g, p = g.player, O = this.O;
    O.bathLight.state = 'off'; g.flickerBoost = 0.6; g.fearBoost = 1;
    audio.duck(0.2, 0.2);
    // something runs at you out of the dark, and past
    const sx = cx(18), sz = cz(5) + 0.5;
    this.at(1.1, () => {
      const n = 9;
      for (let i = 0; i < n; i++) this.at(i * 0.13, () => {
        const t = i / (n - 1);
        const x = lerp(sx, p.pos.x, t * 1.15), z = lerp(sz, p.pos.z, t * 1.15);
        audio.play('footstep', { surface: 'wet', pos: { x, y: 0.1, z }, gain: 1.6 + t });
      });
      this.at(n * 0.13 - 0.2, () => {
        audio.play('scream', { gain: 0.9, dur: 0.45, pitch: 1.5 });
        p.shake = 1.1; g.fx.glitch = 0.5; g.lightsKilled = true; g.fx.chroma = 0.04;
        this.at(0.5, () => { g.lightsKilled = false; });
      });
    });
    this.at(4.5, () => { O.bathLight.state = 'flicker'; g.flickerBoost = 0; audio.duck(1, 2); });
  }

  // =========================================================================
  useStairs(down) {
    const g = this.g, p = g.player, MK = this.MK, f = this.f;
    if (p.frozen) return;
    p.frozen = true;
    g.fx.fadeTo = 1; g.fx.fadeRate = 1.6;
    for (let i = 0; i < 6; i++) this.at(0.3 + i * 0.42, () => audio.play('footstep', { surface: 'concrete', gain: 0.8 }));
    this.at(2.9, () => {
      const a = down ? MK.basementArrive : MK.groundArrive;
      p.place(a.x, a.z, down ? -H : Math.PI);
      p.frozen = false; g.fx.fadeTo = 0; g.fx.fadeRate = 0.7;
      if (down && !f.basement) {
        f.basement = true;
        g.ui.objective('Find the generator room.');
        this.at(2.5, () => audio.play('pipes', { pos: { x: cx(8), y: 2.5, z: cz(34) }, gain: 0.9 }));
      }
      g.checkpoint();
      this.relocateMatron(rand(22, 34));
    });
  }

  relocateMatron(delay) {
    const g = this.g, f = this.f, m = g.matron;
    if (!f.matronAwake || f.finale) return;
    f.wardScript = false;
    m.despawn();
    if (this._reloc) g.sched.cancel(this._reloc);
    this._reloc = this.at(delay, () => this.spawnFar());
  }

  spawnFar() {
    const g = this.g, m = g.matron, p = g.player, nav = this.L.nav;
    if (this.f.finale || g.dead) return;
    m.x = p.pos.x; m.z = p.pos.z; // so _randomWalkable picks the player's floor
    let best = null, bd = -1;
    for (let i = 0; i < 24; i++) {
      const c = m._randomWalkable(p.pos.x, p.pos.z, 12, 34);
      if (!c || nav.los(c.x, c.z, p.pos.x, p.pos.z)) continue;
      const d = nav.pathLength(c.x, c.z, p.pos.x, p.pos.z);
      if (d !== Infinity && d > bd && d > 14) { bd = d; best = c; if (d > 24) break; }
    }
    if (!best) { this._reloc = this.at(6, () => this.spawnFar()); return; }
    m.spawn(best.x, best.z, 'patrol');
    m.grace = 2;
  }

  // =========================================================================
  openDrawer() {
    const g = this.g, O = this.O, f = this.f, d = O.drawer;
    if (d.opened) return;
    d.opened = true; O.drawerInteract.enabled = false;
    audio.play('drawer', { pos: this.MK.drawer });
    g.noise(d.x, d.z0, 6);
    d.glint.visible = false;
    g.sched.tween(0.75, (t) => { d.g.position.z = d.z0 + ease(t) * 1.5; }, () => {
      O.fuse('fuse3', d.x - 0.02, d.y - 0.02, d.z0 + 1.5 - 0.88, 1.3);
    });
    g.fearBoost = Math.max(g.fearBoost, 0.7);
  }

  morgueGrab() {
    const g = this.g, O = this.O, d = O.drawer, p = g.player;
    // the arm
    d.arm.visible = true;
    audio.play('stinger', { gain: 0.9 }); audio.play('bodyFall', { pos: this.MK.drawer, gain: 1 });
    p.shake = 1; g.fx.glitch = 0.4; g.fearBoost = 1;
    g.sched.tween(1.6, (t) => {
      const sw = Math.exp(-t * 3.2) * Math.cos(t * 14);
      d.arm.rotation.z = H * 0.96 * (1 - Math.min(1, t * 6)) + sw * 0.5 * Math.min(1, t * 6);
    });
    this.at(1.3, () => { O.morgueLight.state = 'off'; audio.duck(0.25, 0.2); });
    const bx = this.MK.drawerBehind;
    for (let i = 0; i < 6; i++) this.at(2.0 + i * 0.33, () => {
      audio.play('bang', { pos: { x: bx.x + (i % 3) * 0.82 - 0.4, y: 0.6 + (i % 2) * 0.8, z: bx.z }, gain: 1.0 + i * 0.12 });
      p.shake = Math.max(p.shake, 0.3 + i * 0.08);
    });
    this.at(4.6, () => { O.morgueLight.state = 'flicker'; audio.duck(1, 2); });
  }

  // =========================================================================
  useBreaker() {
    const g = this.g, O = this.O, b = O.breaker, f = this.f;
    if (b.busy || b.pulled) return;
    if (!b.inserted) {
      if (g.inv.fuses < 3) {
        audio.play('locked', { pos: b.pos, gain: 0.5 });
        g.ui.subtitle(g.inv.fuses === 0 ? 'Three empty fuse sockets.' : `Three sockets. You have ${g.inv.fuses === 1 ? 'one fuse' : 'two fuses'}.`, 3.5);
        if (!f.breakerSeen) { f.breakerSeen = true; g.ui.objective('Find three fuses for the breaker.'); }
        return;
      }
      b.busy = true;
      for (let i = 0; i < 3; i++) this.at(i * 0.55, () => { b.fuses[i].visible = true; audio.play('fuse', { pos: b.pos }); });
      this.at(1.8, () => { b.inserted = true; b.busy = false; g.checkpoint(); g.ui.objective('Throw the breaker.'); });
      return;
    }
    b.pulled = true; O.breakerInteract.enabled = false;
    audio.play('lever', { pos: b.pos, gain: 1.2 });
    g.sched.tween(0.25, (t) => { b.lever.rotation.x = lerp(-0.6, 2.2, ease(t)); });
    this.at(0.3, () => this.powerOn());
  }

  powerOn() {
    const g = this.g, L = this.L, O = this.O, f = this.f, MK = this.MK, p = g.player;
    f.power = true;
    O.breaker.lamp.color.setRGB(0.2, 3, 0.3);
    audio.play('powerUp', { gain: 0.9 });
    audio.startLoop('generator', { pos: MK.generator, gain: 0.9 });
    p.shake = 0.4;
    // every light in the basement comes on. For a moment.
    for (const l of L.lights) if (l.basement && l.tag !== 'alarm' && l.tag !== 'furnace') { l.state = 'on'; l.boost = 2.6; if (!l.intensity) l.intensity = 0.6; }
    g.ui.subtitle('Power.', 2);
    this.at(2.6, () => {
      for (const l of L.lights) if (l.basement && l.tag !== 'alarm' && l.tag !== 'furnace') { l.state = 'off'; audio.play('bulbPop', { pos: { x: l.x, y: 2.6, z: l.z }, gain: 0.7 }); }
      L.setLights('alarm', 'pulse');
      audio.startLoop('alarm', { gain: 0.13 });
      audio.play('scream', { gain: 1.1, dur: 1.6, pitch: 0.9 });
      p.shake = 0.8; g.fearBoost = 1;
      const gate = L.doors.gate; gate.sealed = false; gate.setOpen(true);
      audio.play('drawer', { pos: MK.gate, gain: 1 });
      O.shutterBtn.color.setRGB(3, 0.2, 0.1);
      g.ui.objective('RUN. East, through the gate. The loading bay.');
      this.startFinale(2.2);
    });
  }

  startFinale(delay) {
    const g = this.g, f = this.f, m = g.matron;
    f.finale = true; f.shutter = 0; this.finaleT = 0; this.shutterAt = null;
    if (this._reloc) g.sched.cancel(this._reloc);
    m.despawn();
    this.at(delay, () => {
      if (g.dead) return;
      m.spawn(cx(5), cz(34), 'patrol');
      m.startFinale(); m.grace = 0.5;
      audio.play('scream', { pos: m.pos3(), gain: 1.2, dur: 1.0 });
    });
  }

  finaleUpdate(dt) {
    const g = this.g, p = g.player, m = g.matron, f = this.f, L = this.L, sh = L.doors.shutter;
    // adrenaline: you can run further than you ever could
    if (p.sprinting) p.stamina = Math.min(1, p.stamina + dt / 16);
    if (f.shutter === 1) {
      // she arrives a breath after the shutter clears crouch height
      const remain = this.shutterAt + 4.5 - g.time;
      m.finaleSpeed = remain > 0.25 ? clamp((m.dist - 1.4) / remain, 1.6, 8.5) : 8.5;
    } else m.finaleSpeed = undefined;
    // through
    if (p.pos.x > cx(38) - 0.35 && !f.escaped) this.escape();
  }

  pressShutter() {
    const g = this.g, f = this.f, L = this.L, O = this.O, MK = this.MK;
    if (!f.power) { audio.play('locked', { pos: MK.shutterBtn, gain: 0.6 }); g.ui.subtitle('Dead. No power.', 2.5); return; }
    if (f.shutter) return;
    f.shutter = 1; this.shutterAt = g.time;
    O.shutterInteract.enabled = false;
    O.shutterBtn.color.setRGB(0.2, 3, 0.3);
    audio.play('lever', { pos: MK.shutterBtn });
    const sh = L.doors.shutter;
    sh.sealed = false; sh.riseSpeed = 0.4; sh.setOpen(true);
    audio.startLoop('shutter', { pos: { x: sh.x, y: 1.5, z: sh.z }, gain: 1.1 });
    this.at(0.8, () => g.ui.hint(g.input.touch ? 'CROUCH under it' : 'Crouch (C) under it — do not wait', 5));
    this.at(5.8, () => audio.stopLoop('shutter', 0.3));
  }

  escape() {
    const g = this.g, f = this.f, L = this.L, p = g.player, m = g.matron, sh = L.doors.shutter;
    f.escaped = true; g.state = 'ending';
    p.frozen = true;
    // the shutter drops behind you
    sh.raiseTarget = 0; sh.open = false;
    audio.stopLoop('shutter', 0.05);
    this.at(0.25, () => { audio.play('slam', { pos: { x: sh.x, y: 0.5, z: sh.z }, gain: 1.6 }); p.shake = 1; });
    this.at(0.7, () => {
      m.despawn();
      for (let i = 0; i < 4; i++) this.at(i * 0.3, () => { audio.play('bang', { pos: { x: sh.x - 0.5, y: 1.2, z: sh.z }, gain: 1.5 }); p.shake = Math.max(p.shake, 0.6); });
      audio.play('scream', { pos: { x: sh.x - 1, y: 1.6, z: sh.z }, gain: 1.2, dur: 1.8, pitch: 0.95 });
    });
    this.at(2.6, () => { g.fx.fadeTo = 1; g.fx.fadeRate = 0.5; audio.stopLoop('alarm', 2); audio.stopLoop('generator', 2); });
    this.at(5.2, () => g.finish());
  }

  // The last word.
  endingSting(done) {
    const g = this.g;
    g.fx.fade = 0; g.fx.fadeTo = 0;
    g.lightsKilled = true;
    g.player.light.intensity = 0;
    this.faceFlash(0.55, 1.6);
    this.at(0.6, () => { g.fx.fade = 1; g.fx.fadeTo = 1; g.matron.root.visible = false; });
    this.at(1.0, () => { audio.play('shh', { pan: 0.85, gain: 0.8, dur: 2 }); });
    this.at(2.6, done);
  }

  // =========================================================================
  randomScare() {
    const g = this.g, p = g.player, L = this.L;
    const r = Math.random();
    if (r < 0.3) {
      g.lightsKilled = true; audio.play('zap', { gain: 0.3, dur: 0.15 });
      this.at(rand(0.5, 1.1), () => { g.lightsKilled = false; });
      this.at(0.3, () => audio.play('whisper', { pan: Math.random() < 0.5 ? -0.9 : 0.9, gain: 0.45, dur: 1.4 }));
      g.fearBoost = Math.max(g.fearBoost, 0.6);
    } else if (r < 0.6) {
      // a door, somewhere behind you
      const cands = L.doorList.filter((d) => d.open && d.kind !== 'gate' && d.kind !== 'shutter' && Math.hypot(d.x - p.pos.x, d.z - p.pos.z) > 7 && Math.hypot(d.x - p.pos.x, d.z - p.pos.z) < 30 && L.isBasement(d.z) === L.isBasement(p.pos.z) && !L.nav.los(d.x, d.z, p.pos.x, p.pos.z));
      if (cands.length) pick(cands).slamShut();
      else audio.play('slam', { pos: { x: p.pos.x + rand(-14, 14), y: 1, z: p.pos.z + rand(-14, 14) }, gain: 0.7 });
      g.fearBoost = Math.max(g.fearBoost, 0.5);
    } else if (r < 0.8) {
      audio.play('shh', { pan: Math.random() < 0.5 ? -0.8 : 0.8, gain: 0.3, dur: 1.3 });
      g.fearBoost = Math.max(g.fearBoost, 0.5);
    } else {
      for (const l of L.lights) if (l.level > 0.1 && l.override === null && l.state !== 'pulse') { l.override = 0; const ll = l; this.at(rand(0.6, 1.6), () => { ll.override = null; }); }
      audio.play('zap', { gain: 0.35, dur: 0.3 });
    }
  }

  // ---- steam -----------------------------------------------------------------
  puff(pos) {
    if (!this._puffTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      this._puffTex = new THREE.CanvasTexture(c);
    }
    const tex = this._puffTex;
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.0, depthWrite: false, color: 0xbfc8cc }));
      s.position.set(pos.x + rand(-0.15, 0.15), pos.y + rand(-0.2, 0.2), pos.z + rand(-0.15, 0.15));
      s.userData = { t: -i * 0.08, vx: rand(-0.5, 0.5), vy: rand(0.2, 0.9), vz: rand(-1.4, -0.4), life: rand(1.1, 1.8) };
      this.g.scene.add(s); this.puffs.push(s);
    }
  }
  updatePuffs(dt) {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const s = this.puffs[i], u = s.userData;
      u.t += dt;
      if (u.t < 0) continue;
      const k = u.t / u.life;
      s.position.x += u.vx * dt; s.position.y += u.vy * dt; s.position.z += u.vz * dt * (1 - k);
      s.scale.setScalar(0.3 + k * 2.2);
      s.material.opacity = 0.22 * (1 - k) * Math.min(1, u.t * 8);
      if (k >= 1) { this.g.scene.remove(s); s.material.dispose(); this.puffs.splice(i, 1); }
    }
  }

  // =========================================================================
  // After dying: put the world back into a playable state.
  afterRespawn() {
    const g = this.g, f = this.f, m = g.matron, L = this.L;
    g.lightsKilled = false; g.flickerBoost = 0;
    m.despawn(); m.finale = false; m.finaleSpeed = undefined; m.faceTarget = null;
    if (f.finale) {
      const sh = L.doors.shutter;
      sh.raise = 0; sh.raiseTarget = 0; sh.open = false; sh.sealed = true;
      f.shutter = 0; this.O.shutterInteract.enabled = true; this.O.shutterBtn.color.setRGB(3, 0.2, 0.1);
      audio.stopLoop('shutter', 0.05);
      this.at(1.0, () => g.ui.objective('RUN. East, through the gate. The loading bay.'));
      this.startFinale(3.2);
    } else if (f.matronAwake) {
      f.wardScript = false;
      this._reloc = this.at(7, () => this.spawnFar());
    }
  }
}
