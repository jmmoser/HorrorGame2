// HUSH — bootstrap and main loop.
import * as THREE from '../vendor/three.module.min.js';
import { buildTextures, setAnisotropy } from './textures.js';
import { makeProps } from './props.js';
import { Level } from './level.js';
import { configureShell, populate } from './world.js';
import { Player } from './player.js';
import { Matron } from './matron.js';
import { Events } from './events.js';
import { syncRoomLights } from './roomlights.js';
import { PostFX } from './postfx.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { audio } from './audio.js';
import { Scheduler, clamp, damp, pick } from './util.js';
import { cellX as cx, cellZ as cz } from './map.js';
import { DEATH_TIPS, ENDING } from './story.js';

const $ = (id) => document.getElementById(id);
const tick = () => new Promise((r) => setTimeout(r, 0));
const store = {
  get(k, d) { try { const v = localStorage.getItem('hush.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('hush.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};

class Game {
  constructor() {
    this.canvas = $('game');
    this.ui = new UI();
    this.input = new Input(this.canvas);
    this.sched = new Scheduler();
    this.state = 'loading';
    this.time = 0; this.playTime = 0; this.deaths = 0;
    this.inv = { fuses: 0, keys: new Set() };
    this.fear = 0; this.fearBoost = 0; this.flickerBoost = 0; this.chaseAmt = 0;
    this.lightsKilled = false; this.hemiBoost = 0; this.fovPunch = 0;
    this.dead = false;
    this.fx = { glitch: 0, chroma: 0, flash: 0, flashColor: new THREE.Color(1, 1, 1), static: 0, fade: 1, fadeTo: 1, fadeRate: 1, peekTo: 0, slats: 0, peek: 0 };
    const mobile = this.input.touch;
    this.settings = {
      sensitivity: store.get('sens', 1), volume: store.get('vol', 0.8), brightness: store.get('bright', 1),
      fov: store.get('fov', 74), quality: store.get('quality', mobile ? 'medium' : 'high'),
    };
    this.quality = this.settings.quality;
    this.baseFov = this.settings.fov;
    this.cp = null;
    this.slow = 0; this.fpsAcc = 0; this.fpsN = 0;
    this.returnTo = 'menu';
    if (mobile) document.body.classList.add('touch');
  }

  // ---------------------------------------------------------------------------
  async boot() {
    const ui = this.ui;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    } catch (e) { return this.fatal('This game needs WebGL 2. Your browser or device could not start it.'); }
    const r = this.renderer;
    if (!r.capabilities.isWebGL2) return this.fatal('This game needs WebGL 2.');
    r.setPixelRatio(1);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NoToneMapping;
    r.setClearColor(0x000000, 1);
    setAnisotropy(Math.min(8, r.capabilities.getMaxAnisotropy()));

    ui.loading(0.05, 'Finding the fuse box…');
    await tick();
    try {
      await Promise.race([
        Promise.all([document.fonts.load('64px "Rock Salt"'), document.fonts.load('40px "IM Fell English"')]),
        new Promise((res) => setTimeout(res, 2500)),
      ]);
    } catch (e) { /* fall back to system fonts */ }

    ui.loading(0.12, 'Painting the walls…');
    await tick();
    this.T = buildTextures((p) => ui.loading(0.12 + p * 0.4));
    await tick();

    ui.loading(0.55, 'Unlocking the east wing…');
    await tick();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x010203, 0.05);
    this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.05, 70);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.hemi = new THREE.HemisphereLight(0x8fa3c0, 0x4a4238, 0.5);
    this.scene.add(this.hemi);
    this.fxLight = new THREE.PointLight(0xffffff, 0, 8, 1.6);
    this.scene.add(this.fxLight);

    this.level = new Level(this.scene, this.T, this.quality);
    configureShell(this.level);
    this.level.buildShell();
    await tick();
    ui.loading(0.68, 'Making the beds…');
    await tick();
    populate(this.level, this.T, makeProps(this.T));
    this._doorInteracts();
    this.level.finalize();
    await tick();

    ui.loading(0.82, 'Waking her…');
    await tick();
    this.player = new Player(this);
    this.matron = new Matron(this);
    this.events = new Events(this);
    this._dust();
    this.post = new PostFX(r);
    this.resize();
    window.addEventListener('resize', () => this.resize());

    ui.loading(0.92, 'Turning out the lights…');
    await tick();
    this._menuPose();
    try { r.compile(this.scene, this.camera); r.initTexture(this.matron.faceScream); r.initTexture(this.matron.faceCalm); } catch (e) { /* optional */ }
    this.render(0.016);
    await tick();
    ui.loading(1, '');

    this._bindUI();
    this.input.onLockChange = (locked, failed) => this._lockChanged(locked, failed);
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.pause(); });

    this.state = 'menu';
    let restarted = false;
    try { restarted = !!sessionStorage.getItem('hush.restart'); } catch (e) { /* */ }
    if (store.get('warned', false) && restarted) ui.show('menu'); else ui.show('warning');
    try { sessionStorage.removeItem('hush.restart'); } catch (e) { /* */ }
    this.fx.fade = 0; this.fx.fadeTo = 0;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  fatal(msg) { const f = $('fatal'); f.textContent = msg; f.hidden = false; this.ui.hideAll(); }

  // ---------------------------------------------------------------------------
  _doorInteracts() {
    const L = this.level;
    for (const d of L.doorList) {
      if (d.kind === 'shutter' || d.kind === 'front' || d.name === 'iso3') continue;
      d.interact = L.addInteract({
        id: 'door:' + d.name, pos: new THREE.Vector3(d.x, 1.15, d.z), radius: 1.95, cone: 0.72,
        prompt: () => (d.open ? 'Close' : 'Open'),
        use: () => this.useDoor(d),
      });
    }
  }

  _dust() {
    const N = this.quality === 'low' ? 200 : 520, B = 9;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = Math.random() * B; pos[i * 3 + 1] = Math.random() * 3; pos[i * 3 + 2] = Math.random() * B; seed[i] = Math.random() * 100; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.dustU = { uCam: { value: new THREE.Vector3() }, uLP: { value: new THREE.Vector3() }, uLD: { value: new THREE.Vector3(0, 0, -1) }, uI: { value: 0 }, uTime: { value: 0 }, uSize: { value: 30 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        uniform vec3 uCam, uLP, uLD; uniform float uI, uTime, uSize; attribute float seed; varying float vA;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.21 + seed) * 0.35; p.y += sin(uTime * 0.13 + seed * 1.7) * 0.25; p.z += cos(uTime * 0.17 + seed * 0.6) * 0.35;
          p.xz = mod(p.xz - uCam.xz + ${(B / 2).toFixed(1)}, ${B.toFixed(1)}) - ${(B / 2).toFixed(1)} + uCam.xz;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vec3 L = p - uLP; float d = length(L);
          float c = dot(L / d, uLD);
          vA = smoothstep(0.86, 0.97, c) * uI / (1.0 + d * d * 0.22) * smoothstep(0.25, 0.8, -mv.z);
          gl_PointSize = clamp(uSize / -mv.z, 1.0, 5.0);
        }`,
      fragmentShader: `
        varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA; if (a < 0.003) discard; gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a, a); }`,
    });
    this.dust = new THREE.Points(g, m);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  _menuPose() {
    const m = this.matron;
    m.override = true; m.root.visible = true;
    m.root.position.set(cx(15) - 0.2, 0, cz(9) + 0.2); m.root.rotation.y = 0;
    m.head.rotation.set(0.12, 0, 0.42);
    this.level.objs.c1end.state = 'flicker';
  }

  resize() {
    const w = Math.max(2, this.canvas.clientWidth), h = Math.max(2, this.canvas.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    const s = this.quality === 'high' ? Math.min(dpr, 1.25) : this.quality === 'medium' ? Math.min(dpr, 1) : Math.min(dpr, 1) * 0.66;
    const rw = Math.max(2, Math.round(w * s)), rh = Math.max(2, Math.round(h * s));
    this.renderer.setSize(rw, rh, false);
    this.post.setSize(rw, rh, this.quality);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.dustU.uSize.value = rh * 0.03;
  }

  setQuality(q) {
    if (q === this.quality) return;
    this.quality = this.settings.quality = q; store.set('quality', q);
    const p = this.player;
    p.light.castShadow = q !== 'low';
    p.light.map = q !== 'low' ? this.T.cookie : null;
    p.light.shadow.mapSize.set(q === 'high' ? 1024 : 512, q === 'high' ? 1024 : 512);
    if (p.light.shadow.map) { p.light.shadow.map.dispose(); p.light.shadow.map = null; }
    this.resize();
  }

  // ---------------------------------------------------------------------------
  _bindUI() {
    const ui = this.ui, s = this.settings;
    $('btn-accept').onclick = () => { store.set('warned', true); audio.init(); audio.resume(); audio.setVolume(s.volume); ui.show('menu'); };
    $('btn-begin').onclick = () => this.begin();
    const openSettings = (from) => { this.returnTo = from; ui.show('settings'); };
    const openHow = (from) => { this.returnTo = from; ui.show('how'); };
    $('btn-settings').onclick = () => openSettings('menu'); $('btn-settings2').onclick = () => openSettings('pause');
    $('btn-how').onclick = () => openHow('menu'); $('btn-how2').onclick = () => openHow('pause');
    $('btn-settings-back').onclick = () => ui.show(this.returnTo); $('btn-how-back').onclick = () => ui.show(this.returnTo);
    $('btn-resume').onclick = () => this.resume();
    const restart = () => { try { sessionStorage.setItem('hush.restart', '1'); } catch (e) { /* */ } try { audio.suspend(); } catch (e) { /* */ } location.reload(); };
    $('btn-restart').onclick = restart; $('btn-again').onclick = restart;
    $('btn-retry').onclick = () => this.respawn();
    $('note-close').onclick = () => this.closeNote();

    const bind = (id, key, storeKey, apply) => {
      const el = $(id); el.value = s[key];
      el.oninput = () => { s[key] = parseFloat(el.value); store.set(storeKey, s[key]); if (apply) apply(s[key]); };
    };
    bind('set-sens', 'sensitivity', 'sens');
    bind('set-vol', 'volume', 'vol', (v) => audio.setVolume(v));
    bind('set-bright', 'brightness', 'bright');
    bind('set-fov', 'fov', 'fov', (v) => { this.baseFov = v; });
    const seg = $('set-quality');
    const mark = () => [...seg.children].forEach((b) => b.classList.toggle('on', b.dataset.q === this.quality));
    [...seg.children].forEach((b) => { b.onclick = () => { this.setQuality(b.dataset.q); mark(); }; });
    mark(); this._markQuality = mark;

    this.canvas.addEventListener('click', () => {
      if (this.state === 'play' && !this.input.locked && !this.input.touch && !this.input.dragLook) this.input.requestLock();
    });
  }

  _lockChanged(locked, failed) {
    if (failed) { this._dragTipUntil = performance.now() + 7000; return; }
    if (!locked && this.state === 'play') this.pause();
  }

  begin() {
    audio.init(); audio.resume(); audio.setVolume(this.settings.volume);
    this.ui.hideAll(); this.ui.hud(true);
    if (this.input.touch) this.ui.el.touch.hidden = false;
    this.input.enabled = true;
    this.input.requestLock();
    const m = this.matron; m.override = false; m.root.visible = false;
    this.level.objs.c1end.state = 'on';
    this.fx.fade = 1; this.fx.fadeTo = 1;
    this.events.begin();
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause'; this.ui.show('pause'); audio.suspend();
    this.input.exitLock();
  }
  resume() {
    this.ui.hideAll(); this.state = 'play'; audio.resume();
    this.input.requestLock(); this.last = performance.now();
  }

  // ---------------------------------------------------------------------------
  noise(x, z, radius) { if (this.matron.active) this.matron.hear(x, z, radius); }
  checkpoint() { const p = this.player; this.cp = { x: p.pos.x, z: p.pos.z, yaw: p.yaw }; }

  onPickup(pk) { this.events.pickup(pk); }
  onHide() { /* hook */ }
  onMatronDoor() { this.fearBoost = Math.max(this.fearBoost, 0.6); }
  onSpotted() {
    this.fearBoost = 1; this.player.shake = Math.max(this.player.shake, 0.7); this.fx.glitch = Math.max(this.fx.glitch, 0.35);
    audio.play('stinger', { gain: 0.7, dur: 1.2 });
    if (!this._runHint) { this._runHint = true; this.ui.hint('RUN', 2.5); }
  }

  readNote(id) {
    audio.play('paper');
    this.state = 'note'; this.noteT = this.time;
    this.input.exitLock();
    this.ui.showNote(id, (nid) => {
      this.state = 'play'; audio.play('paper', { gain: 0.3 });
      this.input.requestLock(); this.last = performance.now();
      this.events.noteClosed(nid);
    });
  }
  closeNote() { if (this.state === 'note') this.ui.closeNote(); }

  useDoor(d) {
    const p = this.player, ui = this.ui, pos = { x: d.x, y: 1.1, z: d.z };
    if (this.events.doorSpecial(d)) return;
    if (d.sealed) { d.shake = 1; audio.play('locked', { pos }); ui.subtitle('It will not move.', 2.5); return; }
    if (d.locked) {
      if (this.inv.keys.has(d.key)) { d.locked = false; audio.play('lever', { pos, gain: 0.6 }); ui.subtitle('Unlocked.', 2); }
      else {
        d.shake = 1; audio.play('locked', { pos });
        if (d.name === 'ward') { ui.subtitle('Locked. The ward wing — the Director kept a key.', 4); if (!this._wardObj) { this._wardObj = true; ui.objective('The ward wing is locked. Find the Director’s key.'); } }
        else { ui.subtitle('Locked. The basement key must be somewhere on the wards.', 4); if (!this._baseObj) { this._baseObj = true; ui.objective('Find the basement key.'); } }
        return;
      }
    }
    if (d.barred) {
      if (d.sideOf(p.pos.x, p.pos.z) === d._barSide()) { d.barred = false; d.barMesh.visible = false; audio.play('thud', { pos, gain: 0.8 }); ui.subtitle('You lift the bar away.', 2.5); }
      else { d.shake = 1; audio.play('locked', { pos }); ui.subtitle('Barred from the other side.', 3); return; }
    }
    d.setOpen(!d.open, d.sideOf(p.pos.x, p.pos.z));
    this.noise(d.x, d.z, 7.5);
  }

  lockerKill(lk) {
    if (this.dead) return;
    lk.fast = true; lk.target = 1;
    audio.play('slam', { pos: { x: lk.x, y: 1.2, z: lk.z }, gain: 1.3 });
    this.player.hidden = null; lk.occupied = false; lk.interact.enabled = true;
    this.die();
  }

  die() {
    if (this.dead || this.state === 'ending') return;
    this.dead = true; this.deaths++;
    audio.stopLoop('hum', 0.05);
    this.events.deathScare(() => {
      this.state = 'dead';
      $('death-tip').textContent = pick(DEATH_TIPS);
      this.ui.hud(false); this.ui.show('death');
      this.input.exitLock();
      audio.duck(0.3, 0.5);
    });
  }

  respawn() {
    const p = this.player, cp = this.cp;
    this.ui.hideAll(); this.ui.hud(true);
    p.hidden = null; p.peek = null; p.frozen = false; p.forceLook = null; p._lockerBusy = false;
    for (const lk of this.level.objs.lockers) { lk.occupied = false; lk.target = 0; lk.compromised = false; lk.interact.enabled = true; }
    p.place(cp.x, cp.z, cp.yaw);
    p.battery = Math.max(p.battery, 0.5); p.stamina = 1; p.exhausted = false; p.crouch = false; p.shake = 0;
    this.fx.peekTo = 0; this.fx.glitch = 0; this.fx.fade = 1; this.fx.fadeTo = 0; this.fx.fadeRate = 0.6;
    this.fear = 0; this.fearBoost = 0; this.chaseAmt = 0;
    this.dead = false; this.state = 'play';
    audio.duck(1, 1); audio.resume();
    this.events.afterRespawn();
    this.input.requestLock(); this.last = performance.now();
  }

  finish() {
    const ui = this.ui;
    this.input.exitLock();
    ui.hud(false); this.ui.el.touch.hidden = true;
    ui.show('ending');
    audio.duck(0.6, 2);
    const box = $('ending-lines'); box.innerHTML = '';
    ENDING.forEach((line, i) => {
      const el = document.createElement('p'); el.textContent = line; box.appendChild(el);
      setTimeout(() => el.classList.add('on'), 600 + i * 3300);
    });
    setTimeout(() => {
      ui.hideAll();
      this.events.endingSting(() => {
        box.hidden = true;
        const m = Math.floor(this.playTime / 60), s = Math.floor(this.playTime % 60);
        $('ending-stats').textContent = `You got out in ${m}:${String(s).padStart(2, '0')}` + (this.deaths ? `, after she found you ${this.deaths === 1 ? 'once' : this.deaths + ' times'}.` : '. She never laid a hand on you.');
        $('ending-final').hidden = false;
        ui.show('ending');
      });
    }, 600 + ENDING.length * 3300 + 3200);
  }

  // ---------------------------------------------------------------------------
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = (now - this.last) / 1000; this.last = now;
    if (!(dt > 0)) dt = 0.016;
    const raw = dt;
    dt = Math.min(dt, 0.05);
    const inp = this.input.frame();
    const st = this.state;

    if (st === 'menu') {
      this.time += dt;
      const c = this.camera, t = this.time;
      c.position.set(cx(15) + Math.sin(t * 0.21) * 0.12, 1.5 + Math.sin(t * 0.33) * 0.03, cz(18) + 0.8);
      c.rotation.set(Math.sin(t * 0.27) * 0.012 - 0.02, Math.sin(t * 0.17) * 0.03, Math.sin(t * 0.13) * 0.008);
      if (Math.abs(c.fov - 58) > 0.01) { c.fov = 58; c.updateProjectionMatrix(); }
      this.level.update(dt, c.position.x, c.position.z, 1);
      this.player.aura.intensity = 0; this.player.light.intensity = 0;
      audio.update(dt, { fear: 0.3, chase: 0, rain: 0.5, buzz: this.level.buzz, basement: false, exhausted: 0, heart: 0 });
      this.render(dt);
      return;
    }

    if (st === 'play' || st === 'intro' || st === 'ending') {
      this.time += dt;
      if (st === 'play') {
        this.playTime += dt;
        if (inp.pause) { this.pause(); return; }
        this.player.look(inp.lookX, inp.lookY);
        if (inp.light) this.player.toggleLight();
        if (inp.interact) {
          if (this.player.hidden) this.player.exitLocker();
          else if (this.player.target) this.player.target.use(this);
        }
      }
      this.sched.update(dt);
      const p = this.player;
      p.update(dt, st === 'play' ? inp : { moveX: 0, moveZ: 0 });
      if (!this.dead && st !== 'ending') this.matron.update(dt);
      if (st !== 'intro') this.events.update(dt);
      this.level.update(dt, p.pos.x, p.pos.z, this.lightsKilled ? 0.0 : 1);
      this._feel(dt);
      this.ui.update(dt);
      const tgt = p.target;
      this.ui.prompt(st === 'play' && !this.dead ? (p.hidden ? 'Step out' : tgt ? (typeof tgt.prompt === 'function' ? tgt.prompt() : tgt.prompt) : null) : null);
      this.ui.setBattery(p.battery, p.hasLight); this.ui.setStamina(p.stamina);
      // tell the player how to look when the mouse is not captured
      const inpt = this.input, tip = this.ui.el.resumeTip;
      const dragTip = inpt.dragLook && performance.now() < (this._dragTipUntil || 0);
      const needClick = st === 'play' && !inpt.touch && !inpt.dragLook && !inpt.locked;
      const want = dragTip ? 'Hold the mouse button and drag to look' : needClick ? 'Click to look around' : '';
      if (want !== this._tip) { this._tip = want; tip.textContent = want; tip.hidden = !want; }
      this._autoQuality(raw);
    } else if (st === 'note') {
      if ((inp.interact || inp.pause) && performance.now() - (this._noteOpenAt || 0) > 350) this.closeNote();
    } else if (st === 'pause') {
      if (inp.pause) { this.resume(); }
    }
    if (st !== 'note') this._noteOpenAt = performance.now();
    if (st === 'dead') { this.time += dt; this.sched.update(dt); }
    this.render(dt);
  }

  // fear, audio mix and screen effects
  _feel(dt) {
    const p = this.player, m = this.matron, fx = this.fx, L = this.level;
    let target = 0;
    const chasing = m.active && (m.state === 'chase' || m.finale);
    if (m.active) target = chasing ? 1 : clamp(1 - (m.dist - 3) / 17, 0, 1) * (m.los ? 1 : 0.7);
    this.fearBoost = Math.max(0, this.fearBoost - dt * 0.1);
    this.fear = damp(this.fear, Math.max(target, this.fearBoost), target > this.fear ? 3 : 0.9, dt);
    this.chaseAmt = damp(this.chaseAmt, chasing && !this.dead ? 1 : 0, chasing ? 6 : 0.7, dt);
    this.hemiBoost = Math.max(0, this.hemiBoost - dt * 4);
    this.hidEyes = damp(this.hidEyes || 0, p.hidden ? 1 : 0, 0.8, dt);
    this.hemi.intensity = 0.5 + this.hemiBoost * 1.6 + this.hidEyes * 1.1;

    const basement = L.isBasement(p.pos.z);
    const rain = basement ? 0 : clamp(1 - Math.hypot(p.pos.x - cx(15), p.pos.z - cz(25)) / 24, 0, 1);
    audio.update(dt, {
      fear: this.fear, chase: this.chaseAmt, rain, buzz: this.lightsKilled ? 0 : L.buzz, basement,
      exhausted: p.exhausted ? 1 : clamp((0.4 - p.stamina) * 2, 0, 1), quiet: this.state !== 'play' && this.state !== 'ending',
      heart: clamp(this.fear * 1.1 + (p.hidden && m.active && m.dist < 8 ? 0.5 : 0), 0, 1),
    });
    const cam = this.camera;
    audio.setListener(cam.position, p.forward(), { x: 0, y: 1, z: 0 });

    fx.glitch = Math.max(0, fx.glitch - dt * 2.4);
    fx.chroma = damp(fx.chroma, 0, 4, dt);
    fx.flash = Math.max(0, fx.flash - dt * 2.5);
    if (fx.fade !== fx.fadeTo) { const d = fx.fadeTo - fx.fade, s = fx.fadeRate * dt; fx.fade = Math.abs(d) <= s ? fx.fadeTo : fx.fade + Math.sign(d) * s; }
    fx.slats = damp(fx.slats, p.hidden ? 1 : 0, 10, dt);
    fx.peek = damp(fx.peek, fx.peekTo, 7, dt);

    // hiding: a little cold light falls through the slats onto whatever stands outside
    if (p.hidden && !this.scareDim) {
      const lk = p.hidden, fl = this.fxLight;
      fl.position.set(lk.x + lk.outX * 0.75, 2.0, lk.z + lk.outZ * 0.75);
      fl.color.setRGB(0.5, 0.62, 0.8); fl.intensity = 0.9 * this.hidEyes; fl.distance = 5;
      this._lockLight = true;
    } else if (this._lockLight) { this._lockLight = false; this.fxLight.intensity = 0; }

    // looking straight at her distorts the picture
    let stare = 0;
    if (m.active && m.los && m.dist < 14) {
      const f = p.forward(); const dx = m.x - p.pos.x, dz = m.z - p.pos.z;
      stare = clamp(((dx * f.x + dz * f.z) / (m.dist || 1) - 0.8) * 5, 0, 1) * clamp(1 - m.dist / 14, 0, 1);
    }
    if (this.scareDim) stare = 0;
    this.stare = damp(this.stare || 0, stare, this.scareDim ? 30 : 5, dt);

    // dust in the beam
    const du = this.dustU;
    du.uCam.value.copy(cam.position); du.uLP.value.copy(p.light.position); du.uLD.value.copy(p.lightDir);
    du.uI.value = p.light.intensity > 1 ? 0.5 * Math.min(1, p.light.intensity / 100) : 0; du.uTime.value = this.time;
  }

  _autoQuality(dt) {
    if (this.state !== 'play' || this.quality === 'low') return;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 3) {
      const avg = this.fpsAcc / this.fpsN; this.fpsAcc = 0; this.fpsN = 0;
      if (avg > 1 / 26) this.slow++; else this.slow = 0;
      if (this.slow >= 2) { this.slow = 0; this.setQuality(this.quality === 'high' ? 'medium' : 'low'); if (this._markQuality) this._markQuality(); }
    }
  }

  render(dt) {
    const u = this.post.u, fx = this.fx, fear = this.state === 'menu' ? 0.25 : this.fear;
    const stare = this.stare || 0;
    u.uGrain.value = 0.065 + fear * 0.06 + stare * 0.06;
    u.uVignette.value = 0.9 + fear * 0.3;
    u.uChroma.value = 0.004 + fear * 0.007 + fx.chroma + stare * 0.02;
    u.uGlitch.value = Math.min(1, fx.glitch + stare * 0.25);
    u.uStatic.value = fx.static + stare * 0.03;
    u.uPulse.value = fear > 0.45 ? (fear - 0.45) * 1.3 * (0.55 + 0.45 * Math.sin(this.time * (5 + fear * 6))) : 0;
    u.uFade.value = fx.fade;
    u.uFlash.value = fx.flash; u.uFlashColor.value.copy(fx.flashColor);
    u.uExposure.value = this.settings.brightness * 1.15;
    u.uDesat.value = 0.2 + (this.player && this.player.hidden ? 0.25 : 0);
    u.uSlats.value = fx.slats; u.uPeek.value = fx.peek;
    u.uBlur.value = this.player && this.player.exhausted ? 0.25 : 0;
    syncRoomLights(this.camera);
    this.post.render(this.scene, this.camera, this.time);
  }
}

const game = new Game();
window.__hush = game;
game.boot().catch((e) => { console.error(e); game.fatal('Something went wrong starting the game: ' + (e && e.message ? e.message : e)); });
