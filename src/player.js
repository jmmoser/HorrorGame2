// First-person controller: movement, stamina, flashlight, interaction, hiding.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, damp, dampAngle, wrapAngle, lerp } from './util.js';
import { audio } from './audio.js';

const EYE = 1.64, EYE_CROUCH = 0.98;

export class Player {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.pos = { x: 0, z: 0 };
    this.vel = { x: 0, z: 0 };
    this.yaw = 0; this.pitch = 0;
    this.eye = EYE;
    this.crouch = false; this.sprinting = false;
    this.stamina = 1; this.exhausted = false; this.staminaDelay = 0;
    this.bob = 0; this.bobAmp = 0; this.stepSide = 1;
    this.frozen = false;
    this.hidden = null;       // locker
    this.peek = null;         // {pos, yaw, pitch}
    this.forceLook = null;    // {target: Vector3, k}
    this.hasLight = false; this.lightOn = false; this.battery = 1;
    this.flick = 1; this.flickT = 0;
    this.moving = 0;
    this.shake = 0;
    this.lean = 0;
    this.target = null;       // current interactable
    this.radius = 0.32;
    this.kick = 0;            // fov kick

    // flashlight rig
    const q = game.quality;
    this.light = new THREE.SpotLight(0xfff0d8, 0, 34, 0.56, 0.6, 1.15);
    this.light.castShadow = q !== 'low';
    this.light.shadow.mapSize.set(q === 'high' ? 1024 : 512, q === 'high' ? 1024 : 512);
    this.light.shadow.camera.near = 0.25; this.light.shadow.camera.far = 30;
    this.light.shadow.bias = -0.002; this.light.shadow.normalBias = 0.02;
    if (q !== 'low') this.light.map = game.T.cookie;
    game.scene.add(this.light); game.scene.add(this.light.target);
    this.lightDir = new THREE.Vector3(0, 0, -1);
    // faint personal glow so total darkness is still navigable
    this.aura = new THREE.PointLight(0xa8b4c0, 0.9, 7, 1.6);
    game.scene.add(this.aura);

    this._fwd = new THREE.Vector3(); this._right = new THREE.Vector3(); this._v = new THREE.Vector3();
  }

  place(x, z, yaw = 0) {
    this.pos.x = x; this.pos.z = z; this.yaw = yaw; this.pitch = 0;
    this.vel.x = this.vel.z = 0;
    this.lightDir.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  }

  get top() { return this.crouch ? 1.1 : 1.8; }
  forward(out = this._fwd) { return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }

  toggleLight() {
    if (!this.hasLight || this.hidden) return;
    this.lightOn = !this.lightOn;
    audio.play('click');
  }

  look(dx, dy) {
    if (this.frozen && !this.peek && !this.hidden) return;
    const s = this.game.settings.sensitivity * 0.0022;
    this.yaw -= dx * s; this.pitch -= dy * s;
    if (this.hidden) {
      const d = wrapAngle(this.yaw - this.hidden.baseYaw);
      this.yaw = this.hidden.baseYaw + clamp(d, -0.7, 0.7);
      this.pitch = clamp(this.pitch, -0.4, 0.4);
    } else if (this.peek) {
      const d = wrapAngle(this.yaw - this.peek.yaw);
      this.yaw = this.peek.yaw + clamp(d, -0.3, 0.3);
      this.pitch = clamp(this.pitch, -0.25, 0.2);
    } else this.pitch = clamp(this.pitch, -1.45, 1.45);
  }

  enterLocker(lk) {
    const g = this.game;
    if (this.hidden || this.frozen || this._lockerBusy) return;
    this._lockerBusy = true;
    lk.fast = false; lk.target = 1;
    audio.play('doorOpen', { pos: { x: lk.x, y: 1.2, z: lk.z }, gain: 0.5, dur: 0.3, pitch: 1.6 });
    this.frozen = true;
    // was she watching?
    lk.compromised = g.matron.active && g.matron.canSeePoint(this.pos.x, this.pos.z, 18);
    g.sched.after(0.28, () => {
      this.hidden = lk; lk.occupied = true;
      lk.baseYaw = lk.rot + Math.PI; this.yaw = lk.baseYaw; this.pitch = 0;
      this.pos.x = lk.x - lk.outX * 0.02; this.pos.z = lk.z - lk.outZ * 0.02;
      this.crouch = false;
      this.vel.x = this.vel.z = 0;
      this.lightWasOn = this.lightOn; this.lightOn = false;
      lk.target = 0;
      lk.interact.enabled = false;
      audio.play('doorClose', { pos: { x: lk.x, y: 1.2, z: lk.z }, gain: 0.5 });
      this.frozen = false; this._lockerBusy = false;
      g.ui.hint('Stay still. [E] to step out.', 4);
      g.onHide(lk);
    });
  }

  exitLocker(force = false) {
    const lk = this.hidden;
    if (!lk || this._lockerBusy) return;
    this._lockerBusy = true;
    lk.fast = force; lk.target = 1;
    audio.play('doorOpen', { pos: { x: lk.x, y: 1.2, z: lk.z }, gain: 0.5, dur: 0.3, pitch: 1.5 });
    this.game.noise(lk.x, lk.z, 5);
    this.game.sched.after(force ? 0.01 : 0.22, () => {
      this.hidden = null; lk.occupied = false; lk.compromised = false;
      this.pos.x = lk.x + lk.outX * 0.8; this.pos.z = lk.z + lk.outZ * 0.8;
      this.lightOn = this.lightWasOn && this.hasLight;
      lk.interact.enabled = true;
      this._lockerBusy = false;
      if (!force) this.game.sched.after(0.5, () => { if (!lk.occupied) lk.target = 0; });
    });
  }

  update(dt, input) {
    const g = this.game, L = g.level;
    // ---- movement ----
    let ix = 0, iz = 0;
    const canMove = !this.frozen && !this.hidden && !this.peek;
    if (canMove) { ix = input.moveX; iz = input.moveZ; }
    const len = Math.hypot(ix, iz);
    if (len > 1) { ix /= len; iz /= len; }
    if (canMove && input.crouchPressed) this.crouch = !this.crouch;
    const wantSprint = canMove && input.sprint && iz > 0.3 && !this.crouch && !this.exhausted;
    this.sprinting = wantSprint && len > 0.1;
    if (this.sprinting) {
      this.stamina -= dt / 6.5; this.staminaDelay = 1.2;
      if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; }
    } else {
      this.staminaDelay -= dt;
      if (this.staminaDelay <= 0) this.stamina = Math.min(1, this.stamina + dt / (this.exhausted ? 7 : 9));
      if (this.exhausted && this.stamina > 0.35) this.exhausted = false;
    }
    const speed = this.crouch ? 1.25 : this.sprinting ? 5.3 : 2.65;
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    const wx = (-sn * iz + cs * ix) * speed, wz = (-cs * iz - sn * ix) * speed;
    const acc = len > 0.01 ? 11 : 9;
    this.vel.x = damp(this.vel.x, wx, acc, dt); this.vel.z = damp(this.vel.z, wz, acc, dt);
    if (!this.hidden && !this.peek) {
      const ox = this.pos.x, oz = this.pos.z;
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      L.collide(this.pos, this.radius, this.top);
      // feed back blocked motion into velocity so we do not "stick" into walls
      if (dt > 0) { this.vel.x = lerp(this.vel.x, (this.pos.x - ox) / dt, 0.5); this.vel.z = lerp(this.vel.z, (this.pos.z - oz) / dt, 0.5); }
    }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.moving = sp;

    // ---- head bob + footsteps ----
    const bobRate = this.crouch ? 5.2 : this.sprinting ? 3.2 : 4.1;
    if (sp > 0.3 && canMove) {
      const prev = this.bob;
      this.bob += sp * dt * bobRate * 0.62;
      if (Math.floor(prev / Math.PI) !== Math.floor(this.bob / Math.PI)) {
        this.stepSide = -this.stepSide;
        const vol = this.crouch ? 0.25 : this.sprinting ? 1.15 : 0.6;
        audio.play('footstep', { surface: L.surface(this.pos.x, this.pos.z), gain: vol });
        g.noise(this.pos.x, this.pos.z, this.crouch ? 1.6 : this.sprinting ? 15 : 6.5, 'step');
      }
    }
    this.bobAmp = damp(this.bobAmp, sp > 0.3 && canMove ? Math.min(1, sp / 3) : 0, 8, dt);
    this.eye = damp(this.eye, this.crouch ? EYE_CROUCH : EYE, 9, dt);

    // ---- scripted look ----
    if (this.forceLook) {
      const t = this.forceLook.target;
      const dx = t.x - this.pos.x, dz = t.z - this.pos.z, dy = t.y - this.eye;
      const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      this.yaw = dampAngle(this.yaw, yaw, this.forceLook.k, dt);
      this.pitch = damp(this.pitch, clamp(pitch, -1.3, 1.3), this.forceLook.k, dt);
    }

    // ---- camera ----
    const cam = this.camera;
    const bx = Math.cos(this.bob) * 0.028 * this.bobAmp, by = Math.abs(Math.sin(this.bob)) * 0.05 * this.bobAmp * (this.sprinting ? 1.5 : 1);
    if (this.peek) cam.position.copy(this.peek.pos);
    else if (this.hidden) cam.position.set(this.pos.x, 1.52, this.pos.z);
    else cam.position.set(this.pos.x + cs * bx, this.eye - by, this.pos.z - sn * bx);
    // strafe lean + breathing sway
    this.lean = damp(this.lean, canMove ? -ix * 0.012 * (sp / 2.6) : 0, 6, dt);
    const t = g.time;
    const breathe = Math.sin(t * 1.3) * 0.004 + Math.sin(t * 0.7) * 0.003;
    let sy = 0, sx = 0, sz = 0;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    if (this.shake > 0) {
      const s2 = this.shake * this.shake;
      sy = (Math.random() - 0.5) * 0.09 * s2; sx = (Math.random() - 0.5) * 0.07 * s2; sz = (Math.random() - 0.5) * 0.12 * s2;
    }
    cam.rotation.set(this.pitch + breathe + sx - by * 0.12, this.yaw + sy, this.lean + sz + Math.sin(this.bob) * 0.004 * this.bobAmp, 'YXZ');
    this.kick = damp(this.kick, this.sprinting ? 1 : 0, 5, dt);
    const fov = g.baseFov + this.kick * 7 + g.fovPunch;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }

    // ---- flashlight ----
    const fwd = this.forward(this._fwd);
    this._right.set(cs, 0, -sn);
    if (this.hasLight) {
      this.lightDir.lerp(fwd, 1 - Math.exp(-13 * dt)).normalize();
      const sway = Math.sin(this.bob) * 0.012 * this.bobAmp;
      this.light.position.copy(cam.position).addScaledVector(this._right, 0.2).addScaledVector(fwd, 0.05);
      this.light.position.y -= 0.16;
      this._v.copy(this.lightDir); this._v.y += sway - 0.012; this._v.addScaledVector(this._right, sway * 0.6 - 0.018);
      this.light.target.position.copy(this.light.position).addScaledVector(this._v, 10);
      if (this.lightOn) this.battery = Math.max(0, this.battery - dt / 520);
      // flicker: low battery, or something is near
      this.flickT -= dt;
      const fear = g.fear;
      if (this.flickT <= 0) {
        const p = (this.battery < 0.12 ? 0.5 : 0) + Math.max(0, fear - 0.55) * 1.1 + g.flickerBoost;
        if (Math.random() < p) { this.flick = Math.random() < 0.5 ? 0.08 : 0.45; this.flickT = 0.03 + Math.random() * 0.09; }
        else { this.flick = 1; this.flickT = 0.05 + Math.random() * 0.25; }
      }
      const power = this.battery <= 0 ? 0.07 : 0.55 + 0.45 * Math.min(1, this.battery * 4);
      const want = this.lightOn && !g.lightsKilled && !g.scareDim ? 190 * power * this.flick : 0;
      this.light.intensity = want;
      this.aura.intensity = damp(this.aura.intensity, (this.lightOn ? 3.6 * power : 0.9) * (g.lightsKilled ? 0.25 : 1) * (g.scareDim ? 0.1 : 1), 8, dt);
    } else {
      this.aura.intensity = 0.9;
    }
    this.aura.position.copy(cam.position);

    // ---- interaction target ----
    this.target = null;
    if (!this.frozen && !this.peek && !this.hidden) {
      let best = -1e9;
      const cp = cam.position;
      for (const it of L.interactables) {
        if (!it.enabled) continue;
        const dx = it.pos.x - cp.x, dy = it.pos.y - cp.y, dz = it.pos.z - cp.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > it.radius) continue;
        const dot = d < 0.01 ? 1 : (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
        const need = it.cone ?? (d < 0.9 ? 0.55 : 0.8);
        if (dot < need) continue;
        const score = dot * 2 - d * 0.35;
        if (score > best) { best = score; this.target = it; }
      }
    }
  }
}
