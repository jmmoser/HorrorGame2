// Small shared helpers.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// Frame-rate independent exponential approach.
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const dampAngle = (a, b, lambda, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Tiny tween/timeline scheduler driven by the game clock (pauses with the game).
export class Scheduler {
  constructor() { this.items = []; this.time = 0; }
  after(delay, fn) {
    const it = { at: this.time + delay, fn, dead: false };
    this.items.push(it);
    return it;
  }
  // Runs fn(t01, dt) every frame for `dur` seconds, then done().
  tween(dur, fn, done) {
    const it = { start: this.time, dur, tw: fn, done, dead: false };
    this.items.push(it);
    return it;
  }
  cancel(it) { if (it) it.dead = true; }
  clear() { this.items.length = 0; }
  update(dt) {
    this.time += dt;
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.dead) continue;
      if (it.tw) {
        const t = it.dur <= 0 ? 1 : clamp((this.time - it.start) / it.dur, 0, 1);
        it.tw(t, dt);
        if (t >= 1) { it.dead = true; if (it.done) it.done(); }
      } else if (this.time >= it.at) {
        it.dead = true;
        it.fn();
      }
    }
    if (items.length > 64) this.items = items.filter((i) => !i.dead);
    else for (let i = items.length - 1; i >= 0; i--) if (items[i].dead) items.splice(i, 1);
  }
}
