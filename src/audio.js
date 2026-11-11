// Fully synthesized audio: no samples. Every sound is built from oscillators and noise.
import { clamp, rand, pick } from './util.js';

const LULLABY = [ // [semitones from A4, beats]  (original melody, A minor, 3/4)
  [-5, 1], [0, 2], [3, 1], [2, 2], [0, 1], [-1, 2], [-5, 3],
  [-4, 1], [0, 2], [5, 1], [3, 2], [2, 1], [0, 1], [-1, 1], [0, 3],
];
const st = (n) => 440 * Math.pow(2, n / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.volume = 0.8;
    this.loops = {};
    this.fear = 0; this.chase = 0;
    this._ambT = 4; this._heartT = 0; this._breathT = 0;
    this.heartRate = 0; this.heartGain = 0; this.breath = 0;
    this.ambientEnabled = true;
    this.listener = { x: 0, y: 1.6, z: 0 };
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8; this.limiter.knee.value = 6; this.limiter.ratio.value = 14;
    this.limiter.attack.value = 0.002; this.limiter.release.value = 0.18;
    this.master.connect(this.limiter); this.limiter.connect(ctx.destination);

    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.9; this.music.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = 1; this.amb.connect(this.master);

    // reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(3.2, 2.2);
    this.reverbIn = ctx.createGain();
    this.reverbOut = ctx.createGain(); this.reverbOut.gain.value = 0.9;
    this.reverbIn.connect(this.reverb); this.reverb.connect(this.reverbOut); this.reverbOut.connect(this.master);

    this.noise = { white: this._noiseBuf('white'), brown: this._noiseBuf('brown'), pink: this._noiseBuf('pink') };
    this.dist = this._distCurve(40);
    this.distHard = this._distCurve(300);

    this._buildAmbient();
    this.ready = true;
  }

  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  // ---- building blocks ----------------------------------------------------
  _noiseBuf(type) {
    const ctx = this.ctx, len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w;
      else if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    }
    return buf;
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const w = Math.random() * 2 - 1;
        const k = 0.25 + 0.7 * t; // darker tail
        lp = lp * k + w * (1 - k);
        d[i] = lp * Math.pow(1 - t, decay) * (i < 400 ? i / 400 : 1) * 1.6;
      }
      // a few early reflections
      for (let r = 0; r < 8; r++) {
        const p = Math.floor((0.01 + Math.random() * 0.08) * ctx.sampleRate);
        d[p] += (Math.random() * 2 - 1) * 0.6;
      }
    }
    return buf;
  }

  _distCurve(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    return c;
  }

  _noise(type = 'white', rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise[type]; s.loop = true; s.playbackRate.value = rate;
    s._off = Math.random() * 2.5;
    return s;
  }
  _startNoise(s, t, dur) { s.start(t, s._off); if (dur !== undefined) s.stop(t + dur); }

  _osc(type, freq) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq; return o; }
  _gain(v = 1) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  _filter(type, freq, q = 1) { const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }
  _shaper(curve) { const w = this.ctx.createWaveShaper(); w.curve = curve; w.oversample = '2x'; return w; }

  _panner(pos, ref = 1.6, rolloff = 1.3) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = ref; p.rolloffFactor = rolloff; p.maxDistance = 80;
    this._setPos(p, pos);
    return p;
  }
  _setPos(p, pos) {
    if (p.positionX) {
      const t = this.ctx.currentTime;
      p.positionX.setTargetAtTime(pos.x, t, 0.03); p.positionY.setTargetAtTime(pos.y ?? 1.4, t, 0.03); p.positionZ.setTargetAtTime(pos.z, t, 0.03);
    } else p.setPosition(pos.x, pos.y ?? 1.4, pos.z);
  }

  // Output chain for a one-shot. Returns the node sources should connect to.
  _out({ pos, gain = 1, reverb = 0.25, pan, bus, life = 4, ref, rolloff } = {}) {
    const ctx = this.ctx;
    const g = this._gain(gain);
    let tail = g;
    if (pos) { const p = this._panner(pos, ref, rolloff); g.connect(p); tail = p; }
    else if (pan !== undefined && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
    tail.connect(bus || this.sfx);
    let send = null;
    if (reverb > 0) { send = this._gain(reverb); tail.connect(send); send.connect(this.reverbIn); }
    setTimeout(() => { try { tail.disconnect(); if (send) send.disconnect(); g.disconnect(); } catch (e) { /* */ } }, (life + 4) * 1000);
    return g;
  }

  setListener(pos, fwd, up) {
    if (!this.ready) return;
    this.listener = pos;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos.x, t, 0.02); L.positionY.setTargetAtTime(pos.y, t, 0.02); L.positionZ.setTargetAtTime(pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.02); L.forwardY.setTargetAtTime(fwd.y, t, 0.02); L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      L.upX.setTargetAtTime(up.x, t, 0.02); L.upY.setTargetAtTime(up.y, t, 0.02); L.upZ.setTargetAtTime(up.z, t, 0.02);
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  // ---- ambient bed ----------------------------------------------------------
  _buildAmbient() {
    const ctx = this.ctx, t = ctx.currentTime;
    // sub drone
    const droneG = this._gain(0.0);
    const lp = this._filter('lowpass', 150, 0.7);
    for (const f of [36.7, 36.95, 55.2, 73.6]) {
      const o = this._osc(f < 50 ? 'sawtooth' : 'sine', f);
      const g = this._gain(f < 50 ? 0.5 : 0.25);
      o.connect(g); g.connect(lp); o.start(t);
    }
    const lfo = this._osc('sine', 0.07), lfoG = this._gain(40);
    lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start(t);
    lp.connect(droneG); droneG.connect(this.amb);
    const dSend = this._gain(0.3); droneG.connect(dSend); dSend.connect(this.reverbIn);
    this.droneG = droneG;

    // air / room tone
    const air = this._noise('brown'); const airLp = this._filter('lowpass', 420, 0.5);
    const airG = this._gain(0.0); air.connect(airLp); airLp.connect(airG); airG.connect(this.amb); air.start(t);
    const alfo = this._osc('sine', 0.11), alG = this._gain(120); alfo.connect(alG); alG.connect(airLp.frequency); alfo.start(t);
    this.airG = airG;

    // tension layer: dissonant high cluster, driven by fear
    const tenG = this._gain(0);
    const tenF = this._filter('bandpass', 1400, 0.8);
    for (const [f, d] of [[1108, 0.13], [1174, 0.17], [1245, 0.11], [587, 0.09], [2349, 0.21]]) {
      const o = this._osc('sine', f), g = this._gain(0.2);
      const l = this._osc('sine', d), lg = this._gain(0.2);
      l.connect(lg); lg.connect(g.gain); l.start(t);
      const v = this._osc('sine', 4 + d * 10), vg = this._gain(f * 0.004); v.connect(vg); vg.connect(o.frequency); v.start(t);
      o.connect(g); g.connect(tenF); o.start(t);
    }
    tenF.connect(tenG); tenG.connect(this.music);
    const tSend = this._gain(0.8); tenG.connect(tSend); tSend.connect(this.reverbIn);
    this.tenG = tenG;

    // low dread swell (fear)
    const dreadG = this._gain(0);
    const dr = this._osc('sawtooth', 49), dr2 = this._osc('sawtooth', 51.9);
    const drLp = this._filter('lowpass', 220, 2);
    dr.connect(drLp); dr2.connect(drLp); drLp.connect(dreadG); dreadG.connect(this.music); dr.start(t); dr2.start(t);
    this.dreadG = dreadG;

    // chase layer: pounding pulse + shrieking strings
    const chG = this._gain(0);
    const pulse = this._gain(0.5);
    const pLfo = this._osc('sawtooth', 5.2), pLg = this._gain(-0.5); pLfo.connect(pLg); pLg.connect(pulse.gain); pLfo.start(t);
    const pLp = this._filter('lowpass', 260, 3);
    for (const f of [55, 55.4, 110.3]) { const o = this._osc('sawtooth', f); o.connect(pLp); o.start(t); }
    const pSh = this._shaper(this.dist);
    pLp.connect(pSh); pSh.connect(pulse); pulse.connect(chG);
    const strG = this._gain(0.11);
    const strF = this._filter('highpass', 700, 0.7);
    const trem = this._osc('sine', 11), tremG = this._gain(0.06); trem.connect(tremG); tremG.connect(strG.gain); trem.start(t);
    for (const f of [932, 988, 1047, 1109, 1480, 1568]) { const o = this._osc('sawtooth', f * (1 + (Math.random() - 0.5) * 0.01)); o.connect(strF); o.start(t); }
    strF.connect(strG); strG.connect(chG);
    chG.connect(this.music);
    const cSend = this._gain(0.4); chG.connect(cSend); cSend.connect(this.reverbIn);
    this.chG = chG;

    // rain (lobby)
    const rain = this._noise('pink'); const rBp = this._filter('bandpass', 2400, 0.4); const rLp = this._filter('lowpass', 5000, 0.5);
    const rainG = this._gain(0); rain.connect(rBp); rBp.connect(rLp); rLp.connect(rainG); rainG.connect(this.amb); rain.start(t);
    this.rainG = rainG;

    // light buzz
    const buzzG = this._gain(0);
    const bz = this._osc('sawtooth', 100), bz2 = this._osc('square', 200.5);
    const bHp = this._filter('highpass', 900, 0.8), bg2 = this._gain(0.3);
    bz.connect(bHp); bz2.connect(bg2); bg2.connect(bHp); bHp.connect(buzzG); buzzG.connect(this.amb); bz.start(t); bz2.start(t);
    this.buzzG = buzzG;
  }

  // state: { fear, chase, rain, buzz, exhausted, dt, basement, quiet }
  update(dt, s) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.fear = s.fear; this.chase = s.chase;
    const q = s.quiet ? 0 : 1;
    this.droneG.gain.setTargetAtTime(0.2 * q + 0.08 * s.fear, t, 0.5);
    this.airG.gain.setTargetAtTime((s.basement ? 0.2 : 0.12) * q, t, 0.5);
    this.tenG.gain.setTargetAtTime(Math.pow(s.fear, 1.5) * 0.085 * q, t, 0.6);
    this.dreadG.gain.setTargetAtTime(Math.pow(s.fear, 2) * 0.16 * q, t, 0.6);
    this.chG.gain.setTargetAtTime(s.chase * 0.42, t, s.chase > 0.5 ? 0.15 : 1.2);
    this.rainG.gain.setTargetAtTime((s.rain || 0) * 0.16, t, 0.4);
    this.buzzG.gain.setTargetAtTime((s.buzz || 0) * 0.022, t, 0.03);

    // heartbeat
    const hr = s.heart ?? clamp(s.fear * 1.2, 0, 1);
    if (hr > 0.08) {
      this._heartT -= dt;
      if (this._heartT <= 0) {
        const bpm = 62 + hr * 90;
        this._heartT = 60 / bpm;
        this._heartbeat(0.25 + hr * 0.55);
      }
    }
    // exhausted breathing
    if (s.exhausted > 0.05) {
      this._breathT -= dt;
      if (this._breathT <= 0) { this._breathT = 0.95 - s.exhausted * 0.35; this._breath(s.exhausted); }
    }
    // random ambient one-shots
    if (this.ambientEnabled && !s.quiet) {
      this._ambT -= dt;
      if (this._ambT <= 0) {
        this._ambT = rand(5, 16) * (1 - s.fear * 0.4);
        this._ambientShot(s.basement);
      }
    }
  }

  _ambientShot(basement) {
    const L = this.listener, a = rand(Math.PI * 2), d = rand(9, 22);
    const pos = { x: L.x + Math.cos(a) * d, y: rand(0.5, 3), z: L.z + Math.sin(a) * d };
    const r = Math.random();
    if (r < 0.2) this.play('clang', { pos, gain: 0.5 });
    else if (r < 0.42) this.play('creak', { pos, gain: 0.6 });
    else if (r < 0.6) this.play('drip', { pos: { ...pos, x: L.x + Math.cos(a) * 5, z: L.z + Math.sin(a) * 5 }, gain: 0.5 });
    else if (r < 0.72) this.play('thud', { pos, gain: 0.7 });
    else if (r < 0.8) this.play('whisper', { pos: { x: L.x + Math.cos(a) * 3, y: 1.6, z: L.z + Math.sin(a) * 3 }, gain: 0.25 });
    else if (r < 0.9 && basement) this.play('pipes', { pos, gain: 0.6 });
    else this.play('stepsAbove', { gain: 0.5 });
  }

  // ---- one-shots ------------------------------------------------------------
  play(name, o = {}) {
    if (!this.ready) return;
    const fn = this['_s_' + name];
    if (!fn) { console.warn('no sound', name); return; }
    try { return fn.call(this, o); } catch (e) { console.warn('sound error', name, e); }
  }

  _env(param, t, pts) { // pts: [[time, value], ...] linear segments
    param.cancelScheduledValues(t);
    param.setValueAtTime(pts[0][1], t + pts[0][0]);
    for (let i = 1; i < pts.length; i++) param.linearRampToValueAtTime(pts[i][1], t + pts[i][0]);
  }

  _burst(dest, t, { type = 'white', dur = 0.1, f = 1000, q = 1, ft = 'bandpass', gain = 1, attack = 0.002, rate = 1 }) {
    const n = this._noise(type, rate), fl = this._filter(ft, f, q), g = this._gain(0);
    n.connect(fl); fl.connect(g); g.connect(dest);
    this._env(g.gain, t, [[0, 0], [attack, gain], [dur, 0]]);
    this._startNoise(n, t, dur + 0.05);
    return fl;
  }

  _thump(dest, t, { f0 = 90, f1 = 40, dur = 0.2, gain = 1, type = 'sine' }) {
    const o = this._osc(type, f0), g = this._gain(0);
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    o.connect(g); g.connect(dest);
    this._env(g.gain, t, [[0, 0], [0.004, gain], [dur, 0]]);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _s_footstep(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: (o.gain ?? 1) * 0.5, reverb: 0.22, life: 1 });
    const s = o.surface || 'lino', v = 0.85 + Math.random() * 0.3;
    if (s === 'wood') {
      this._thump(out, t, { f0: 130 * v, f1: 60, dur: 0.09, gain: 0.9 });
      this._burst(out, t, { dur: 0.06, f: 700 * v, q: 1.2, gain: 0.5 });
      if (Math.random() < 0.12) this._creak(out, t + 0.05, 0.25, 0.25);
    } else if (s === 'tile') {
      this._thump(out, t, { f0: 160 * v, f1: 80, dur: 0.05, gain: 0.5 });
      this._burst(out, t, { dur: 0.035, f: 2600 * v, q: 1.5, gain: 0.8 });
      this._burst(out, t + 0.012, { dur: 0.09, f: 900, q: 0.8, gain: 0.25 });
    } else if (s === 'concrete') {
      this._thump(out, t, { f0: 110 * v, f1: 50, dur: 0.07, gain: 0.7 });
      this._burst(out, t, { dur: 0.11, f: 1800 * v, q: 0.5, gain: 0.45 });
      this._burst(out, t + 0.03, { dur: 0.08, f: 4200, q: 0.8, gain: 0.12 });
    } else if (s === 'wet') {
      this._thump(out, t, { f0: 140 * v, f1: 60, dur: 0.07, gain: 0.8 });
      this._burst(out, t, { dur: 0.14, f: 1500 * v, q: 0.6, gain: 0.8 });
      this._burst(out, t + 0.02, { dur: 0.1, f: 5200, q: 1, gain: 0.3 });
    } else {
      this._thump(out, t, { f0: 120 * v, f1: 55, dur: 0.08, gain: 0.8 });
      this._burst(out, t, { dur: 0.05, f: 1300 * v, q: 1, gain: 0.45 });
    }
  }

  _s_click(o) {
    const t = this.now, out = this._out({ gain: o.gain ?? 0.35, reverb: 0.1, life: 1 });
    this._burst(out, t, { dur: 0.012, f: 3200, q: 2, gain: 1 });
    this._burst(out, t + 0.03, { dur: 0.02, f: 1800, q: 2, gain: 0.7 });
  }

  _s_pickup(o) {
    const t = this.now, out = this._out({ gain: o.gain ?? 0.3, reverb: 0.5, life: 2 });
    for (const [f, d] of [[392, 0], [587, 0.09]]) {
      const os = this._osc('sine', f), g = this._gain(0);
      os.connect(g); g.connect(out);
      this._env(g.gain, t + d, [[0, 0], [0.01, 0.5], [0.7, 0]]);
      os.start(t + d); os.stop(t + d + 0.8);
    }
    this._burst(out, t, { dur: 0.05, f: 900, gain: 0.5 });
  }

  _s_paper(o) {
    const t = this.now, out = this._out({ gain: o.gain ?? 0.4, reverb: 0.1, life: 1 });
    for (let i = 0; i < 5; i++) this._burst(out, t + i * 0.045 + Math.random() * 0.02, { dur: 0.05 + Math.random() * 0.05, f: 3000 + Math.random() * 3000, q: 0.7, gain: 0.3 + Math.random() * 0.4 });
  }

  _creak(dest, t, dur, gain, pitch = 1) {
    const o = this._osc('sawtooth', 30 * pitch);
    const pts = 6;
    o.frequency.setValueAtTime(rand(22, 34) * pitch, t);
    for (let i = 1; i <= pts; i++) o.frequency.linearRampToValueAtTime(rand(20, 70) * pitch, t + (dur * i) / pts);
    const f1 = this._filter('bandpass', rand(600, 900), 14), f2 = this._filter('bandpass', rand(1700, 2400), 12);
    const g = this._gain(0);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(dest);
    this._env(g.gain, t, [[0, 0], [dur * 0.15, gain * 3], [dur * 0.7, gain * 2.2], [dur, 0]]);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _s_creak(o) {
    const out = this._out({ pos: o.pos, gain: o.gain ?? 0.6, reverb: 0.6, life: 3 });
    this._creak(out, this.now, o.dur || rand(0.6, 1.6), 0.35, o.pitch || rand(0.7, 1.3));
  }

  _s_doorOpen(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 0.8, reverb: 0.45, life: 3 });
    this._burst(out, t, { dur: 0.04, f: 1500, q: 2, gain: 0.7 });
    this._thump(out, t + 0.01, { f0: 140, f1: 70, dur: 0.06, gain: 0.5 });
    this._creak(out, t + 0.06, o.dur || 1.0, 0.3, o.pitch || rand(0.8, 1.2));
  }

  _s_doorClose(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 0.8, reverb: 0.5, life: 3 });
    this._creak(out, t, 0.35, 0.2, 1.2);
    this._thump(out, t + 0.33, { f0: 110, f1: 45, dur: 0.16, gain: 1 });
    this._burst(out, t + 0.33, { dur: 0.08, f: 500, q: 0.7, gain: 0.8 });
    this._burst(out, t + 0.37, { dur: 0.02, f: 2400, q: 2, gain: 0.5 });
  }

  _s_slam(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 1.3, reverb: 0.9, life: 4, ref: 3 });
    this._thump(out, t, { f0: 150, f1: 32, dur: 0.4, gain: 1.4 });
    this._burst(out, t, { dur: 0.25, f: 400, q: 0.5, gain: 1.5, ft: 'lowpass' });
    this._burst(out, t, { dur: 0.05, f: 2800, q: 1, gain: 0.9 });
    this._burst(out, t + 0.06, { dur: 0.3, f: 180, q: 3, gain: 0.8 });
  }

  _s_locked(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 0.7, reverb: 0.3, life: 2 });
    for (let i = 0; i < 4; i++) {
      const tt = t + i * 0.085 + Math.random() * 0.015;
      this._burst(out, tt, { dur: 0.03, f: 1400 + Math.random() * 600, q: 3, gain: 0.8 });
      this._thump(out, tt, { f0: 180, f1: 90, dur: 0.05, gain: 0.5 });
    }
  }

  _s_bang(o) { // fist on a metal door
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 1.2, reverb: 0.7, life: 3, ref: 2.5 });
    this._thump(out, t, { f0: 120, f1: 40, dur: 0.22, gain: 1.4 });
    this._burst(out, t, { dur: 0.3, f: 230, q: 9, gain: 2 });
    this._burst(out, t, { dur: 0.22, f: 560, q: 12, gain: 1.2 });
    this._burst(out, t, { dur: 0.04, f: 2000, q: 1, gain: 0.7 });
  }

  _s_thud(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 0.8, reverb: 0.8, life: 3 });
    this._thump(out, t, { f0: 85, f1: 30, dur: 0.35, gain: 1.2 });
    this._burst(out, t, { dur: 0.2, f: 300, q: 0.6, ft: 'lowpass', gain: 0.8 });
  }

  _s_clang(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 0.5, reverb: 1, life: 5 });
    const base = o.f || rand(170, 420);
    for (const [m, d, a] of [[1, 2.2, 0.5], [2.76, 1.5, 0.35], [5.4, 0.9, 0.25], [8.93, 0.5, 0.15]]) {
      const os = this._osc('sine', base * m), g = this._gain(0);
      os.connect(g); g.connect(out);
      this._env(g.gain, t, [[0, 0], [0.003, a], [d, 0]]);
      os.start(t); os.stop(t + d + 0.1);
    }
    this._burst(out, t, { dur: 0.04, f: 3000, q: 0.8, gain: 0.5 });
  }

  _s_drip(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 0.4, reverb: 0.9, life: 2 });
    const f = rand(900, 1700);
    const os = this._osc('sine', f), g = this._gain(0);
    os.frequency.setValueAtTime(f, t); os.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.05);
    os.connect(g); g.connect(out);
    this._env(g.gain, t, [[0, 0], [0.004, 0.7], [0.07, 0]]);
    os.start(t); os.stop(t + 0.1);
  }

  _s_pipes(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 0.5, reverb: 1, life: 5 });
    const os = this._osc('sawtooth', rand(48, 70)), f = this._filter('bandpass', rand(140, 260), 8), g = this._gain(0);
    const l = this._osc('sine', rand(3, 7)), lg = this._gain(12); l.connect(lg); lg.connect(os.frequency);
    os.connect(f); f.connect(g); g.connect(out);
    const d = rand(1.5, 3);
    this._env(g.gain, t, [[0, 0], [d * 0.4, 1.4], [d, 0]]);
    os.start(t); l.start(t); os.stop(t + d + 0.1); l.stop(t + d + 0.1);
    if (Math.random() < 0.6) this._s_clang({ pos: o.pos, gain: 0.3, f: rand(300, 600) });
  }

  _s_stepsAbove(o) {
    const L = this.listener, a = rand(6.28);
    const n = 4 + ((Math.random() * 5) | 0), gap = rand(0.24, 0.5);
    let x = L.x + Math.cos(a) * 6, z = L.z + Math.sin(a) * 6;
    const dx = Math.cos(a + 2) * 0.9, dz = Math.sin(a + 2) * 0.9;
    const t = this.now;
    for (let i = 0; i < n; i++) {
      const out = this._out({ pos: { x: x + dx * i, y: 5, z: z + dz * i }, gain: (o.gain ?? 0.5), reverb: 0.8, life: 4 });
      this._thump(out, t + i * gap, { f0: 75, f1: 35, dur: 0.14, gain: 1.1 });
      this._burst(out, t + i * gap, { dur: 0.08, f: 240, ft: 'lowpass', gain: 0.5 });
    }
  }

  _s_whisper(o) {
    const t = this.now, dur = o.dur || rand(1.2, 2.4);
    const out = this._out({ pos: o.pos, pan: o.pan, gain: o.gain ?? 0.3, reverb: 0.7, life: dur + 1 });
    const n = this._noise('white');
    const f1 = this._filter('bandpass', 1200, 5), f2 = this._filter('bandpass', 2600, 6), hp = this._filter('highpass', 700, 0.7);
    const g = this._gain(0);
    n.connect(f1); n.connect(f2); f1.connect(hp); f2.connect(hp); hp.connect(g); g.connect(out);
    let tt = 0;
    g.gain.setValueAtTime(0, t);
    while (tt < dur) {
      const sy = rand(0.07, 0.2);
      g.gain.linearRampToValueAtTime(rand(0.5, 1), t + tt + sy * 0.3);
      g.gain.linearRampToValueAtTime(rand(0, 0.12), t + tt + sy);
      f1.frequency.setValueAtTime(rand(600, 1500), t + tt);
      f2.frequency.setValueAtTime(rand(1800, 3400), t + tt);
      tt += sy + (Math.random() < 0.2 ? rand(0.1, 0.25) : 0);
    }
    g.gain.linearRampToValueAtTime(0, t + dur + 0.1);
    this._startNoise(n, t, dur + 0.2);
  }

  _s_shh(o) { // "shhhhh" right in your ear
    const t = this.now, dur = o.dur || 1.6;
    const out = this._out({ pan: o.pan ?? -0.85, pos: o.pos, gain: o.gain ?? 0.6, reverb: 0.25, life: dur + 1 });
    const n = this._noise('white');
    const bp = this._filter('bandpass', 3400, 1.1), hp = this._filter('highpass', 1800, 0.7), g = this._gain(0);
    n.connect(bp); bp.connect(hp); hp.connect(g); g.connect(out);
    bp.frequency.setValueAtTime(4200, t); bp.frequency.linearRampToValueAtTime(2600, t + dur);
    this._env(g.gain, t, [[0, 0], [0.12, 1], [dur * 0.6, 0.8], [dur, 0]]);
    this._startNoise(n, t, dur + 0.1);
  }

  _s_stinger(o) { // dissonant orchestral hit
    const t = this.now, out = this._out({ gain: o.gain ?? 0.9, reverb: 0.7, life: 4, bus: this.music });
    const hp = this._filter('highpass', 600, 0.7);
    hp.connect(out);
    const dur = o.dur || 1.6;
    for (let i = 0; i < 9; i++) {
      const f = rand(1100, 2600);
      const os = this._osc('sawtooth', f), g = this._gain(0);
      const v = this._osc('sine', rand(6, 12)), vg = this._gain(f * 0.012); v.connect(vg); vg.connect(os.frequency);
      os.frequency.setValueAtTime(f * 0.94, t); os.frequency.linearRampToValueAtTime(f * 1.03, t + dur);
      os.connect(g); g.connect(hp);
      this._env(g.gain, t, [[0, 0], [0.008, 0.11], [0.15, 0.07], [dur, 0]]);
      os.start(t); v.start(t); os.stop(t + dur + 0.1); v.stop(t + dur + 0.1);
    }
    this._thump(out, t, { f0: 95, f1: 28, dur: 1.1, gain: 1.3 });
    this._burst(out, t, { dur: 0.25, f: 2000, q: 0.4, gain: 0.7 });
  }

  _s_boom(o) {
    const t = this.now, out = this._out({ gain: o.gain ?? 1, reverb: 0.6, life: 4, bus: this.music });
    this._thump(out, t, { f0: 70, f1: 24, dur: 2.0, gain: 1.5 });
    this._burst(out, t, { dur: 0.6, f: 160, ft: 'lowpass', q: 0.7, gain: 1.2, type: 'brown' });
  }

  _s_riser(o) { // tension swell
    const t = this.now, dur = o.dur || 3;
    const out = this._out({ gain: o.gain ?? 0.5, reverb: 0.6, life: dur + 2, bus: this.music });
    const n = this._noise('pink'), bp = this._filter('bandpass', 400, 2), g = this._gain(0);
    n.connect(bp); bp.connect(g); g.connect(out);
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(5000, t + dur);
    this._env(g.gain, t, [[0, 0], [dur * 0.9, 0.9], [dur, 0]]);
    this._startNoise(n, t, dur + 0.1);
    for (const f of [220, 233, 311, 466]) {
      const os = this._osc('sawtooth', f), og = this._gain(0), lp = this._filter('lowpass', 900, 1);
      os.frequency.setValueAtTime(f, t); os.frequency.exponentialRampToValueAtTime(f * 1.5, t + dur);
      lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(6000, t + dur);
      os.connect(lp); lp.connect(og); og.connect(out);
      this._env(og.gain, t, [[0, 0], [dur * 0.95, 0.16], [dur, 0]]);
      os.start(t); os.stop(t + dur + 0.1);
    }
  }

  // The scream. Loud, layered, ugly.
  _s_scream(o) {
    const t = this.now, dur = o.dur || 1.5;
    const out = this._out({ pos: o.pos, gain: o.gain ?? 1.5, reverb: 0.5, life: dur + 3, ref: 4, rolloff: 0.8 });
    const rough = this._gain(0.55);
    const rl = this._osc('sawtooth', o.rough || 37), rg = this._gain(0.45); rl.connect(rg); rg.connect(rough.gain); rl.start(t); rl.stop(t + dur + 0.6);
    const sh = this._shaper(this.distHard);
    const post = this._gain(0.4);
    rough.connect(sh); sh.connect(post); post.connect(out);
    const pitch = o.pitch || 1;
    for (const [mult, type, lvl] of [[1, 'sawtooth', 0.5], [1.414, 'sawtooth', 0.35], [2.02, 'square', 0.18], [0.5, 'sawtooth', 0.3]]) {
      const os = this._osc(type, 400 * mult * pitch);
      os.frequency.setValueAtTime(380 * mult * pitch, t);
      os.frequency.exponentialRampToValueAtTime(900 * mult * pitch, t + 0.09);
      os.frequency.linearRampToValueAtTime(820 * mult * pitch, t + dur * 0.6);
      os.frequency.linearRampToValueAtTime(600 * mult * pitch, t + dur + 0.3);
      const v = this._osc('sine', rand(9, 14)), vg = this._gain(55 * mult); v.connect(vg); vg.connect(os.frequency);
      const f1 = this._filter('bandpass', 1150, 3), f2 = this._filter('bandpass', 2900, 4), g = this._gain(0);
      os.connect(f1); os.connect(f2); f1.connect(g); f2.connect(g); g.connect(rough);
      this._env(g.gain, t, [[0, 0], [0.006, lvl * 2.4], [dur * 0.7, lvl * 2], [dur + 0.35, 0]]);
      os.start(t); v.start(t); os.stop(t + dur + 0.5); v.stop(t + dur + 0.5);
    }
    const n = this._noise('white'), nb = this._filter('bandpass', 3200, 0.9), ng = this._gain(0);
    n.connect(nb); nb.connect(ng); ng.connect(rough);
    this._env(ng.gain, t, [[0, 0], [0.004, 1.3], [0.1, 0.6], [dur, 0.45], [dur + 0.3, 0]]);
    this._startNoise(n, t, dur + 0.4);
    // impact
    const imp = this._out({ gain: (o.gain ?? 1.5) * (o.pos ? 0.35 : 0.9), reverb: 0.4, life: 3 });
    this._thump(imp, t, { f0: 110, f1: 26, dur: 0.9, gain: 1.6 });
    this._burst(imp, t, { dur: 0.09, f: 1200, q: 0.3, gain: 1.6 });
  }

  _s_croak(o) { // throat rattle
    const t = this.now, dur = o.dur || rand(0.7, 1.4);
    const out = this._out({ pos: o.pos, gain: o.gain ?? 0.8, reverb: 0.5, life: dur + 2, ref: 2.2 });
    const os = this._osc('sawtooth', 24);
    os.frequency.setValueAtTime(rand(16, 22), t); os.frequency.linearRampToValueAtTime(rand(30, 44), t + dur * 0.7); os.frequency.linearRampToValueAtTime(18, t + dur);
    const f1 = this._filter('bandpass', 1100, 7), f2 = this._filter('bandpass', 2500, 8), f3 = this._filter('bandpass', 520, 5), g = this._gain(0);
    os.connect(f1); os.connect(f2); os.connect(f3); f1.connect(g); f2.connect(g); f3.connect(g); g.connect(out);
    this._env(g.gain, t, [[0, 0], [0.05, 2.6], [dur * 0.8, 2.2], [dur, 0]]);
    os.start(t); os.stop(t + dur + 0.05);
  }

  _s_bulbPop(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 0.9, reverb: 0.5, life: 2 });
    this._burst(out, t, { dur: 0.03, f: 5000, q: 0.5, gain: 1.5, ft: 'highpass' });
    this._thump(out, t, { f0: 300, f1: 80, dur: 0.05, gain: 0.8 });
    for (let i = 0; i < 6; i++) this._burst(out, t + 0.05 + Math.random() * 0.4, { dur: 0.02, f: 6000 + Math.random() * 3000, q: 4, gain: 0.25 });
  }

  _s_zap(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 0.5, reverb: 0.3, life: 2 });
    const os = this._osc('sawtooth', 100), hp = this._filter('highpass', 1500, 1), g = this._gain(0);
    os.connect(hp); hp.connect(g); g.connect(out);
    const d = o.dur || 0.25;
    g.gain.setValueAtTime(0, t);
    for (let x = 0; x < d; x += 0.02) g.gain.setValueAtTime(Math.random() < 0.6 ? 1 : 0, t + x);
    g.gain.setValueAtTime(0, t + d);
    os.start(t); os.stop(t + d + 0.02);
  }

  _s_lever(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 1, reverb: 0.6, life: 3 });
    this._burst(out, t, { dur: 0.03, f: 2200, q: 2, gain: 1 });
    this._thump(out, t + 0.02, { f0: 130, f1: 40, dur: 0.25, gain: 1.4 });
    this._burst(out, t + 0.02, { dur: 0.2, f: 320, q: 6, gain: 1.4 });
  }

  _s_powerUp(o) {
    const t = this.now, out = this._out({ gain: o.gain ?? 0.7, reverb: 0.6, life: 5 });
    for (const m of [1, 2, 3.01]) {
      const os = this._osc('sawtooth', 20 * m), lp = this._filter('lowpass', 500, 1), g = this._gain(0);
      os.frequency.setValueAtTime(18 * m, t); os.frequency.exponentialRampToValueAtTime(100 * m, t + 2.4);
      os.connect(lp); lp.connect(g); g.connect(out);
      this._env(g.gain, t, [[0, 0], [1.5, 0.5 / m], [2.4, 0.5 / m], [3.4, 0]]);
      os.start(t); os.stop(t + 3.5);
    }
  }

  _s_tvOn(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 0.8, reverb: 0.3, life: 2 });
    this._thump(out, t, { f0: 200, f1: 50, dur: 0.12, gain: 1 });
    this._burst(out, t, { dur: 0.15, f: 4000, q: 0.5, gain: 0.8 });
  }

  _s_glitch(o) {
    const t = this.now, out = this._out({ gain: o.gain ?? 0.6, reverb: 0.1, life: 2 });
    const d = o.dur || 0.4;
    for (let x = 0; x < d; x += 0.03) {
      if (Math.random() < 0.7) this._burst(out, t + x, { dur: 0.03, f: rand(500, 7000), q: rand(0.5, 6), gain: rand(0.4, 1.2) });
      if (Math.random() < 0.3) this._thump(out, t + x, { f0: rand(100, 2000), f1: rand(100, 2000), dur: 0.03, gain: 0.5, type: 'square' });
    }
  }

  _s_bounce(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 0.7, reverb: 0.6, life: 2 });
    this._thump(out, t, { f0: 240, f1: 120, dur: 0.09, gain: 1 });
    this._burst(out, t, { dur: 0.03, f: 900, q: 1, gain: 0.3 });
  }

  _s_squeak(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 0.35, reverb: 0.5, life: 2 });
    const f = rand(1500, 2300);
    const os = this._osc('triangle', f), g = this._gain(0), bp = this._filter('bandpass', f, 6);
    os.frequency.setValueAtTime(f, t); os.frequency.linearRampToValueAtTime(f * rand(1.1, 1.35), t + 0.18);
    os.connect(bp); bp.connect(g); g.connect(out);
    this._env(g.gain, t, [[0, 0], [0.03, 0.8], [0.14, 0.5], [0.2, 0]]);
    os.start(t); os.stop(t + 0.25);
  }

  _s_drawer(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 0.9, reverb: 0.6, life: 3 });
    const fl = this._burst(out, t, { dur: 0.7, f: 320, q: 1.5, gain: 1.3, type: 'brown', attack: 0.1 });
    fl.frequency.linearRampToValueAtTime(520, t + 0.7);
    for (let i = 0; i < 8; i++) this._burst(out, t + i * 0.085, { dur: 0.02, f: 1800, q: 3, gain: 0.3 });
    this._thump(out, t + 0.7, { f0: 120, f1: 45, dur: 0.2, gain: 1.3 });
    this._burst(out, t + 0.7, { dur: 0.2, f: 420, q: 7, gain: 1.2 });
  }

  _s_curtain(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 0.8, reverb: 0.5, life: 2 });
    const fl = this._burst(out, t, { dur: 0.5, f: 2500, q: 0.8, gain: 0.7, attack: 0.05 });
    fl.frequency.linearRampToValueAtTime(5000, t + 0.4);
    for (let i = 0; i < 9; i++) this._burst(out, t + i * 0.045, { dur: 0.015, f: 5200 + Math.random() * 1500, q: 8, gain: 0.5 });
  }

  _s_steam(o) {
    const t = this.now, dur = o.dur || 1.6, out = this._out({ pos: o.pos, gain: o.gain ?? 1, reverb: 0.4, life: dur + 1 });
    const fl = this._burst(out, t, { dur, f: 3500, q: 0.4, ft: 'highpass', gain: 1, attack: 0.04 });
    fl.frequency.linearRampToValueAtTime(1800, t + dur);
  }

  _s_thunder(o) {
    const t = this.now, out = this._out({ gain: o.gain ?? 0.9, reverb: 0.9, life: 6, bus: this.amb });
    const fl = this._burst(out, t, { dur: 3.5, f: 500, ft: 'lowpass', q: 0.5, gain: 2.2, type: 'brown', attack: 0.02 });
    fl.frequency.exponentialRampToValueAtTime(90, t + 3.2);
    this._burst(out, t, { dur: 0.25, f: 1800, q: 0.4, gain: 0.9 });
    this._thump(out, t + 0.05, { f0: 60, f1: 25, dur: 2.2, gain: 1.1 });
  }

  _s_gasp(o) {
    const t = this.now, out = this._out({ gain: o.gain ?? 0.35, reverb: 0.15, life: 2 });
    const fl = this._burst(out, t, { dur: 0.45, f: 900, q: 1.6, gain: 1, attack: 0.25 });
    fl.frequency.exponentialRampToValueAtTime(2400, t + 0.4);
  }

  _s_bodyFall(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 1, reverb: 0.6, life: 3 });
    this._thump(out, t, { f0: 95, f1: 35, dur: 0.3, gain: 1.4 });
    this._burst(out, t, { dur: 0.18, f: 700, q: 0.5, gain: 0.9 });
    this._burst(out, t + 0.12, { dur: 0.12, f: 1400, q: 0.8, gain: 0.5 });
    this._thump(out, t + 0.16, { f0: 150, f1: 60, dur: 0.12, gain: 0.7 });
  }

  _s_fuse(o) {
    const t = this.now, out = this._out({ pos: o.pos, gain: o.gain ?? 0.8, reverb: 0.4, life: 2 });
    this._burst(out, t, { dur: 0.025, f: 2600, q: 2, gain: 1 });
    this._thump(out, t + 0.02, { f0: 220, f1: 110, dur: 0.07, gain: 0.8 });
    this._s_zap({ pos: o.pos, gain: 0.25, dur: 0.12 });
  }

  _heartbeat(gain) {
    const t = this.now, out = this._out({ gain, reverb: 0, life: 1 });
    this._thump(out, t, { f0: 62, f1: 36, dur: 0.12, gain: 1 });
    this._thump(out, t + 0.17, { f0: 54, f1: 32, dur: 0.14, gain: 0.75 });
  }

  _breath(amt) {
    const t = this.now, out = this._out({ gain: 0.12 + amt * 0.2, reverb: 0.05, life: 1 });
    const a = this._burst(out, t, { dur: 0.34, f: 1500, q: 1.2, gain: 0.7, attack: 0.18 });
    a.frequency.linearRampToValueAtTime(2100, t + 0.3);
    const b = this._burst(out, t + 0.4, { dur: 0.4, f: 1000, q: 1, gain: 0.9, attack: 0.1 });
    b.frequency.linearRampToValueAtTime(600, t + 0.8);
  }

  // ---- loops ----------------------------------------------------------------
  // Each loop: {stop(), setPos(pos), setGain(v)}
  _loopOut(pos, gain, reverb = 0.3, ref = 1.6, rolloff = 1.3) {
    const g = this._gain(0);
    const lp = this._filter('lowpass', 18000, 0.5);
    g.connect(lp);
    let tail = lp, p = null;
    if (pos) { p = this._panner(pos, ref, rolloff); lp.connect(p); tail = p; }
    tail.connect(this.sfx);
    const send = this._gain(reverb); tail.connect(send); send.connect(this.reverbIn);
    g.gain.setTargetAtTime(gain, this.now, 0.1);
    return {
      input: g, panner: p, lp,
      setPos: (q) => p && this._setPos(p, q),
      setGain: (v, tc = 0.1) => g.gain.setTargetAtTime(v, this.now, tc),
      setMuffle: (m) => lp.frequency.setTargetAtTime(m ? 700 : 18000, this.now, 0.15),
      kill: (fade = 0.1) => {
        g.gain.cancelScheduledValues(this.now); g.gain.setTargetAtTime(0, this.now, fade / 3);
        setTimeout(() => { try { tail.disconnect(); send.disconnect(); g.disconnect(); lp.disconnect(); } catch (e) { /* */ } }, fade * 1000 + 300);
      },
    };
  }

  startLoop(name, o = {}) {
    if (!this.ready) return null;
    this.stopLoop(name, 0.05);
    const fn = this['_l_' + name];
    if (!fn) return null;
    const h = fn.call(this, o);
    this.loops[name] = h;
    return h;
  }
  stopLoop(name, fade = 0.3) {
    const h = this.loops[name];
    if (h) { h.stop(fade); delete this.loops[name]; }
  }
  loop(name) { return this.loops[name]; }
  stopAllLoops() { for (const k of Object.keys(this.loops)) this.stopLoop(k, 0.05); }

  _timerLoop(out, interval, tick) {
    let alive = true, next = this.now + 0.05;
    const id = setInterval(() => {
      if (!alive || !this.ctx || this.ctx.state !== 'running') return;
      while (next < this.now + 0.25) { next += tick(Math.max(next, this.now)); }
    }, interval);
    return { ...out, stop: (fade = 0.2) => { alive = false; clearInterval(id); out.kill(fade); } };
  }

  // The Matron's lullaby: a breathy inhuman hum.
  _l_hum(o) {
    const out = this._loopOut(o.pos, o.gain ?? 0.9, 0.7, 2.5, 1.1);
    const t = this.now;
    const os = this._osc('sawtooth', 220), os2 = this._osc('triangle', 220);
    const vib = this._osc('sine', 5.3), vg = this._gain(4); vib.connect(vg); vg.connect(os.frequency); vg.connect(os2.frequency);
    const f1 = this._filter('bandpass', 330, 5), f2 = this._filter('bandpass', 880, 6), f3 = this._filter('lowpass', 1300, 1);
    const voice = this._gain(0);
    const g1 = this._gain(1), g2 = this._gain(0.4);
    os.connect(f1); os.connect(f2); f1.connect(g1); f2.connect(g2); g1.connect(f3); g2.connect(f3);
    os2.connect(f3); f3.connect(voice); voice.connect(out.input);
    const n = this._noise('pink'), nb = this._filter('bandpass', 1700, 2), ng = this._gain(0.03);
    n.connect(nb); nb.connect(ng); ng.connect(voice);
    os.start(t); os2.start(t); vib.start(t); n.start(t);
    let i = 0;
    const beat = 0.62;
    const h = this._timerLoop(out, 60, (when) => {
      const [semi, beats] = LULLABY[i % LULLABY.length];
      const f = st(semi - 12);
      const d = beats * beat;
      os.frequency.setTargetAtTime(f, when, 0.06); os2.frequency.setTargetAtTime(f, when, 0.06);
      voice.gain.setTargetAtTime(0.9, when, 0.08);
      voice.gain.setTargetAtTime(0.25, when + d * 0.75, 0.1);
      i++;
      let extra = 0;
      if (i % LULLABY.length === 7) extra = beat;            // breath between phrases
      if (i % LULLABY.length === 0) { extra = beat * 3; voice.gain.setTargetAtTime(0, when + d, 0.15); }
      return d + extra;
    });
    const stop0 = h.stop;
    h.stop = (fade) => { stop0(fade); setTimeout(() => { try { os.stop(); os2.stop(); vib.stop(); n.stop(); } catch (e) { /* */ } }, (fade || 0.2) * 1000 + 400); };
    return h;
  }

  _l_musicBox(o) {
    const out = this._loopOut(o.pos, o.gain ?? 0.55, 0.6, 1.5, 1.4);
    let i = 0;
    const h = this._timerLoop(out, 60, (when) => {
      const [semi, beats] = LULLABY[i % LULLABY.length];
      const speed = h.slow ? 0.34 * (1 + (h.slowN++) * 0.12) : 0.34;
      const f = st(semi + 12) * (h.slow ? 1 - h.slowN * 0.004 : 1);
      for (const [m, a, d] of [[1, 0.5, 1.1], [2.0, 0.12, 0.5], [3.01, 0.2, 0.3], [5.4, 0.06, 0.12]]) {
        const os = this._osc('sine', f * m), g = this._gain(0);
        os.connect(g); g.connect(out.input);
        this._env(g.gain, when, [[0, 0], [0.004, a], [d, 0]]);
        os.start(when); os.stop(when + d + 0.05);
      }
      i++;
      return beats * speed + (i % LULLABY.length === 0 ? 1.2 : 0);
    });
    h.slow = false; h.slowN = 0;
    h.windDown = () => { h.slow = true; };
    return h;
  }

  _l_static(o) {
    const out = this._loopOut(o.pos, o.gain ?? 0.5, 0.2, 1.5, 1.5);
    const n = this._noise('white'), hp = this._filter('highpass', 1200, 0.5), bp = this._filter('peaking', 3000, 1);
    bp.gain.value = 8;
    n.connect(hp); hp.connect(bp); bp.connect(out.input); n.start(this.now, n._off);
    const hum = this._osc('sawtooth', 60), hg = this._gain(0.08), hlp = this._filter('lowpass', 400, 1);
    hum.connect(hlp); hlp.connect(hg); hg.connect(out.input); hum.start();
    return { ...out, stop: (fade = 0.05) => { out.kill(fade); setTimeout(() => { try { n.stop(); hum.stop(); } catch (e) { /* */ } }, fade * 1000 + 300); } };
  }

  _l_phone(o) {
    const out = this._loopOut(o.pos, o.gain ?? 0.9, 0.5, 2, 1.0);
    return this._timerLoop(out, 80, (when) => {
      for (let k = 0; k < 2; k++) {
        const t0 = when + k * 0.55;
        const g = this._gain(0);
        const am = this._osc('square', 24), amg = this._gain(0.5);
        am.connect(amg); amg.connect(g.gain);
        for (const f of [1210, 1740, 2630, 3480]) { const os = this._osc('sine', f), og = this._gain(0.16); os.connect(og); og.connect(g); os.start(t0); os.stop(t0 + 0.5); }
        g.connect(out.input);
        g.gain.setValueAtTime(0.5, t0); g.gain.setValueAtTime(0.5, t0 + 0.38); g.gain.linearRampToValueAtTime(0, t0 + 0.48);
        am.start(t0); am.stop(t0 + 0.4);
        setTimeout(() => { try { g.disconnect(); } catch (e) { /* */ } }, 3000);
      }
      return 2.6;
    });
  }

  _l_generator(o) {
    const out = this._loopOut(o.pos, o.gain ?? 0.8, 0.4, 3, 1.2);
    const t = this.now, nodes = [];
    const lp = this._filter('lowpass', 300, 1);
    for (const f of [47, 94.5, 141]) { const os = this._osc('sawtooth', f); os.connect(lp); os.start(t); nodes.push(os); }
    const am = this._osc('sine', 15.6), amg = this._gain(0.3), g = this._gain(0.6);
    am.connect(amg); amg.connect(g.gain); am.start(t); nodes.push(am);
    lp.connect(g); g.connect(out.input);
    const n = this._noise('brown'), ng = this._gain(0.7), nlp = this._filter('lowpass', 900, 0.5);
    n.connect(nlp); nlp.connect(ng); ng.connect(out.input); n.start(t); nodes.push(n);
    return { ...out, stop: (fade = 0.5) => { out.kill(fade); setTimeout(() => nodes.forEach((x) => { try { x.stop(); } catch (e) { /* */ } }), fade * 1000 + 300); } };
  }

  _l_alarm(o) {
    const out = this._loopOut(null, o.gain ?? 0.16, 0.9);
    const t = this.now;
    const os = this._osc('square', 620), lp = this._filter('lowpass', 1500, 1), g = this._gain(0.6);
    const lfo = this._osc('square', 1.1), lg = this._gain(75); lfo.connect(lg); lg.connect(os.frequency);
    os.connect(lp); lp.connect(g); g.connect(out.input); os.start(t); lfo.start(t);
    return { ...out, stop: (fade = 0.5) => { out.kill(fade); setTimeout(() => { try { os.stop(); lfo.stop(); } catch (e) { /* */ } }, fade * 1000 + 300); } };
  }

  _l_shutter(o) {
    const out = this._loopOut(o.pos, o.gain ?? 1, 0.5, 3, 1.0);
    const t = this.now;
    const os = this._osc('sawtooth', 68), os2 = this._osc('square', 34.3), lp = this._filter('lowpass', 700, 2), g = this._gain(0.5);
    os.connect(lp); os2.connect(lp); lp.connect(g); g.connect(out.input); os.start(t); os2.start(t);
    const n = this._noise('white'), bp = this._filter('bandpass', 2200, 2), ng = this._gain(0.25);
    const am = this._osc('square', 9), amg = this._gain(0.25); am.connect(amg); amg.connect(ng.gain); am.start(t);
    n.connect(bp); bp.connect(ng); ng.connect(out.input); n.start(t);
    return { ...out, stop: (fade = 0.2) => { out.kill(fade); setTimeout(() => { try { os.stop(); os2.stop(); n.stop(); am.stop(); } catch (e) { /* */ } }, fade * 1000 + 300); } };
  }

  _l_shower(o) {
    const out = this._loopOut(o.pos, o.gain ?? 0.6, 0.5, 1.5, 1.6);
    const n = this._noise('white'), hp = this._filter('highpass', 2500, 0.4), n2 = this._noise('pink'), g2 = this._gain(0.8), lp = this._filter('lowpass', 1200, 0.5);
    n.connect(hp); hp.connect(out.input); n2.connect(lp); lp.connect(g2); g2.connect(out.input);
    n.start(this.now, n._off); n2.start(this.now, n2._off);
    return { ...out, stop: (fade = 0.15) => { out.kill(fade); setTimeout(() => { try { n.stop(); n2.stop(); } catch (e) { /* */ } }, fade * 1000 + 300); } };
  }

  // quick ducking of ambience for silence-before-the-scare
  duck(amount, time = 0.3) {
    if (!this.ready) return;
    this.amb.gain.setTargetAtTime(amount, this.now, time / 3);
    this.music.gain.setTargetAtTime(0.9 * amount, this.now, time / 3);
  }
}

export const audio = new AudioEngine();
export { pick as _pick };
