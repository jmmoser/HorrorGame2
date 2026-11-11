// Level core: static geometry, doors, collision, lights and interactables.
import * as THREE from '../vendor/three.module.min.js';
import {
  MAP, COLS, ROWS, CELL, WALL_H, DOORS, Nav, idx, charAt, isDoorChar, isFloorChar, isOpenChar,
  zoneAt, doorAxis, cellX, cellZ, toCol, toRow, BASEMENT_ROW,
} from './map.js';
import { Parts, Batcher, partsToObject, quadGeo, compose } from './build.js';
import { audio } from './audio.js';
import { clamp, damp, rand } from './util.js';
import { roomU, ROOM_LIGHTS } from './roomlights.js';

const H = Math.PI / 2;

const ZONE_STYLE = {
  l: { wall: 'lobby', floor: 'wood', ceil: 'tiles', step: 'wood' },
  c: { wall: 'corridor', floor: 'lino', ceil: 'tiles', step: 'lino' },
  o: { wall: 'office', floor: 'wood', ceil: 'tiles', step: 'wood' },
  s: { wall: 'brick', floor: 'concrete', ceil: 'concrete', step: 'concrete' },
  y: { wall: 'nurse', floor: 'lino', ceil: 'tiles', step: 'lino' },
  p: { wall: 'playroom', floor: 'linoRed', ceil: 'tiles', step: 'lino' },
  w: { wall: 'ward', floor: 'lino', ceil: 'tiles', step: 'lino' },
  n: { wall: 'nurse', floor: 'lino', ceil: 'tiles', step: 'lino' },
  b: { wall: 'bath', floor: 'tile', ceil: 'tiles', step: 'tile' },
  i: { wall: 'iso', floor: 'concrete', ceil: 'concrete', step: 'concrete' },
  x: { wall: 'concrete', floor: 'concrete', ceil: 'concrete', step: 'concrete' },
  t: { wall: 'concrete', floor: 'concrete', ceil: 'concrete', step: 'concrete' },
  m: { wall: 'morgue', floor: 'tileDark', ceil: 'concrete', step: 'tile' },
  k: { wall: 'brick', floor: 'concrete', ceil: 'concrete', step: 'concrete' },
  g: { wall: 'concrete', floor: 'concrete', ceil: 'concrete', step: 'concrete' },
  e: { wall: 'concrete', floor: 'concrete', ceil: 'concrete', step: 'concrete' },
};

// ---------------------------------------------------------------------------
export class Door {
  constructor(level, ch, c, r) {
    this.level = level;
    this.ch = ch; this.c = c; this.r = r;
    this.def = DOORS[ch] || {};
    this.name = this.def.name || ch;
    this.kind = this.def.kind || 'wood';
    this.axis = doorAxis(c, r);
    this.x = cellX(c); this.z = cellZ(r);
    this.open = false;
    this.angle = 0; this.target = 0; this.speed = 2.6;
    this.sealed = !!this.def.sealed;
    this.key = this.def.key || null;
    this.locked = !!this.key;
    this.bar = this.def.bar || null;
    this.barred = !!this.bar;
    this.raise = 0; this.raiseTarget = 0; // gate / shutter
    this.shake = 0;
    this.ow = this.kind === 'double' || this.kind === 'front' ? 1.7 : this.kind === 'gate' || this.kind === 'shutter' ? 2.0 : 1.1;
    this.colliders = [];
    this._build();
  }

  // local (lx along partition, lz along passage) -> world
  toWorld(lx, lz) {
    return this.axis === 'z' ? [this.x + lx, this.z + lz] : [this.x + lz, this.z - lx];
  }
  // which side (sign of local z) a world point is on
  sideOf(x, z) { return this.axis === 'z' ? Math.sign(z - this.z) || 1 : Math.sign(x - this.x) || 1; }

  _build() {
    const L = this.level, M = L.T.mats, ow = this.ow;
    const g = (this.group = new THREE.Group());
    g.position.set(this.x, 0, this.z);
    g.rotation.y = this.axis === 'z' ? 0 : H;
    L.scene.add(g);
    const metal = this.kind !== 'wood' && this.kind !== 'double' && this.kind !== 'front';
    const frameMat = metal ? M.frameMetal : M.frame;
    const world = new THREE.Matrix4().compose(g.position, g.quaternion, new THREE.Vector3(1, 1, 1));

    if (this.kind === 'gate') {
      const p = new Parts();
      for (let x = -0.94; x <= 0.95; x += 0.125) p.cyl(M.blackMetal, 0.014, 0.014, 2.5, x, 1.25, 0, 0, 0, 0, 6);
      for (const y of [0.12, 1.2, 2.4]) p.box(M.rust, 1.96, 0.05, 0.05, 0, y, 0);
      p.box(M.yellowMetal, 0.5, 0.3, 0.06, 0, 1.45, 0);
      this.leaf = partsToObject(p); g.add(this.leaf);
      const f = new Parts(); f.box(M.frameMetal, 2.0, 0.45, 0.3, 0, 2.78, 0);
      L.batch.addParts(f, world);
      this._addCollider(-1, 1, -0.1, 0.1, true);
      return;
    }
    if (this.kind === 'shutter') {
      const p = new Parts();
      p.box(M.steelDark, 1.98, 3.0, 0.05, 0, 1.5, 0);
      for (let y = 0.1; y < 3; y += 0.15) p.box(M.steel, 1.98, 0.035, 0.08, 0, y, 0);
      p.box(M.yellowMetal, 1.98, 0.12, 0.1, 0, 0.06, 0);
      this.leaf = partsToObject(p); g.add(this.leaf);
      this._addCollider(-1, 1, -0.12, 0.12, true);
      return;
    }

    // frame casing
    const f = new Parts();
    f.box(frameMat, 0.09, 2.2, 0.32, -(ow / 2 + 0.045), 1.1, 0);
    f.box(frameMat, 0.09, 2.2, 0.32, ow / 2 + 0.045, 1.1, 0);
    f.box(frameMat, ow + 0.18, 0.09, 0.32, 0, 2.2 + 0.045, 0);
    L.batch.addParts(f, world);
    // side panels + lintel with proper wall texture on each face
    for (const s of [-1, 1]) {
      const zone = this._zoneOnSide(s);
      const face = 0.12 * s;
      const quad = (lx0, lx1, y0, y1) => {
        // normal must point toward side s
        const [ax, az] = this.toWorld(s > 0 ? lx0 : lx1, face), [bx, bz] = this.toWorld(s > 0 ? lx1 : lx0, face);
        L.wallQuad(zone, ax, az, bx, bz, y0, y1);
      };
      quad(-1, -ow / 2 - 0.08, 0, WALL_H);
      quad(ow / 2 + 0.08, 1, 0, WALL_H);
      quad(-ow / 2 - 0.08, ow / 2 + 0.08, 2.27, WALL_H);
    }
    this._addCollider(-1, -ow / 2, -0.15, 0.15, false);
    this._addCollider(ow / 2, 1, -0.15, 0.15, false);
    this._addCollider(-ow / 2, ow / 2, -0.1, 0.1, true);

    const leafMat = this.kind === 'cell' ? M.doorCell : metal ? M.doorMetal : M.doorWood;
    const mkLeaf = (w, hingeSign) => {
      const pivot = new THREE.Group();
      pivot.position.set(hingeSign * ow / 2, 0, 0);
      const p = new Parts();
      const cx = -hingeSign * w / 2;
      p.box(leafMat, w - 0.02, 2.16, 0.05, cx, 1.09, 0);
      const hx = -hingeSign * (w - 0.1);
      for (const sz of [-1, 1]) {
        if (metal) p.box(M.steel, 0.04, 0.16, 0.05, hx, 1.02, sz * 0.045);
        else { p.cyl(M.steel, 0.022, 0.022, 0.06, hx, 1.02, sz * 0.05, H, 0, 0, 8); p.sphere(M.steel, 0.032, hx, 1.02, sz * 0.085); }
      }
      if (this.kind === 'cell') {
        p.box(M.blackMetal, 0.4, 0.2, 0.07, cx, 1.56, 0);
        p.box(M.glassDark, 0.34, 0.14, 0.075, cx, 1.56, 0);
        p.box(M.blackMetal, 0.36, 0.1, 0.07, cx, 0.55, 0);
      }
      if (this.kind === 'front') {
        p.box(M.glassDark, w * 0.55, 0.8, 0.055, cx, 1.55, 0);
      }
      const o = partsToObject(p);
      pivot.add(o);
      g.add(pivot);
      return pivot;
    };
    if (this.kind === 'double' || this.kind === 'front') {
      this.leaves = [mkLeaf(ow / 2, -1), mkLeaf(ow / 2, 1)];
      if (this.kind === 'front') {
        const p = new Parts();
        for (let i = -4; i <= 4; i++) p.torus(M.steel, 0.035, 0.009, i * 0.05, 1.05 + Math.abs(i) * 0.012, -0.05, i % 2 ? H : 0, 0, 0, 8);
        p.box(M.rust, 0.09, 0.12, 0.04, 0, 0.98, -0.06);
        g.add(partsToObject(p));
      }
    } else {
      this.leaves = [mkLeaf(ow, -1)];
    }
    if (this.barred) {
      // wooden bar across the door on the bar side
      const s = this._barSide();
      const p = new Parts();
      p.box(M.wood, ow + 0.5, 0.12, 0.06, 0, 1.1, s * 0.2);
      for (const sx of [-1, 1]) p.box(M.rust, 0.06, 0.2, 0.1, sx * (ow / 2 + 0.16), 1.1, s * 0.19);
      this.barMesh = partsToObject(p); g.add(this.barMesh);
    }
  }

  _barSide() { // local z sign of the side the bar is on
    const b = this.bar;
    if (this.axis === 'z') return b === 's' ? 1 : -1;
    return b === 'e' ? 1 : -1;
  }

  _zoneOnSide(s) {
    const [x, z] = this.toWorld(0, s * CELL);
    return zoneAt(toCol(x), toRow(z)) || zoneAt(this.c, this.r);
  }

  _addCollider(lx0, lx1, lz0, lz1, isLeaf) {
    const [x0, z0] = this.toWorld(lx0, lz0), [x1, z1] = this.toWorld(lx1, lz1);
    const col = this.level.addCollider(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1));
    if (isLeaf) this.leafCollider = col;
    this.colliders.push(col);
  }

  aiCanOpen() { return !this.sealed && !this.locked && !this.barred; }
  blocksSight() {
    if (this.kind === 'gate') return false;
    if (this.kind === 'shutter') return this.raise < 1.2;
    return Math.abs(this.angle) < 0.6;
  }

  setOpen(open, fromSide = 1, { fast = false, silent = false } = {}) {
    if (this.kind === 'gate' || this.kind === 'shutter') {
      this.open = open; this.raiseTarget = open ? (this.kind === 'gate' ? 2.55 : 2.3) : 0;
      return;
    }
    if (open === this.open) return;
    this.open = open;
    this.speed = fast ? 9 : 2.6;
    this.target = open ? -fromSide * 1.75 : 0;
    const pos = { x: this.x, y: 1.2, z: this.z };
    if (!silent) {
      if (open) audio.play(fast ? 'slam' : 'doorOpen', { pos, gain: fast ? 1.1 : 0.8 });
      else this._closing = true;
    }
  }

  slamShut() {
    if (!this.open) return;
    this.open = false; this.speed = 12; this.target = 0; this._closing = false; this._slam = true;
  }

  update(dt) {
    if (this.kind === 'gate' || this.kind === 'shutter') {
      const sp = this.kind === 'gate' ? 0.9 : this.riseSpeed || 0.22;
      if (this.raise < this.raiseTarget) this.raise = Math.min(this.raiseTarget, this.raise + sp * dt);
      else if (this.raise > this.raiseTarget) this.raise = Math.max(this.raiseTarget, this.raise - sp * 3 * dt);
      this.leaf.position.y = this.raise + (this.raise > 0.01 && this.raise < this.raiseTarget ? Math.sin(performance.now() * 0.05) * 0.004 : 0);
      this.leafCollider.minY = this.raise;
      this.leafCollider.enabled = this.raise < 2.0;
      return;
    }
    if (this.angle !== this.target) {
      const d = this.target - this.angle, step = this.speed * dt * (this.open ? 1 : 1.3);
      const before = this.angle;
      this.angle = Math.abs(d) <= step ? this.target : this.angle + Math.sign(d) * step;
      if (!this.open && this.angle === 0 && before !== 0) {
        const pos = { x: this.x, y: 1.2, z: this.z };
        if (this._slam) { audio.play('slam', { pos }); this._slam = false; }
        else audio.play('doorClose', { pos, gain: 0.7 });
      }
    }
    let a = this.angle;
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 3); a += Math.sin(performance.now() * 0.09) * 0.035 * this.shake; }
    this.leaves[0].rotation.y = -a;
    if (this.leaves[1]) this.leaves[1].rotation.y = a;
    this.leafCollider.enabled = Math.abs(this.angle) < 1.0;
  }
}

// ---------------------------------------------------------------------------
export class Level {
  constructor(scene, T, quality) {
    this.scene = scene; this.T = T; this.quality = quality;
    this.nav = new Nav();
    this.batch = new Batcher(12);
    this.buckets = new Array(COLS * ROWS).fill(null).map(() => []);
    this.doors = {}; this.doorList = [];
    this.lights = []; this.interactables = []; this.updaters = [];
    this.blockers = [];   // dynamic circles {x, z, r, enabled}
    this.markers = {}; this.objs = {};
    this.holes = new Set(); this.ceilHoles = new Set(); this.noWall = new Set();
    this.pickups = [];
    this.time = 0;
    this.buzz = 0;
    this._glintTex = this._makeGlint();
  }

  // ---- static shell ---------------------------------------------------------
  wallQuad(zone, ax, az, bx, bz, y0 = 0, y1 = WALL_H) {
    const st = ZONE_STYLE[zone] || ZONE_STYLE.c;
    const dx = bx - ax, dz = bz - az;
    let u0, u1;
    if (Math.abs(dx) > Math.abs(dz)) { u0 = (dx > 0 ? ax : -ax) / 4; u1 = (dx > 0 ? bx : -bx) / 4; }
    else { u0 = (dz > 0 ? az : -az) / 4; u1 = (dz > 0 ? bz : -bz) / 4; }
    const v0 = y0 / WALL_H, v1 = y1 / WALL_H;
    const g = quadGeo(new THREE.Vector3(ax, y0, az), new THREE.Vector3(bx, y0, bz), new THREE.Vector3(bx, y1, bz), new THREE.Vector3(ax, y1, az), [u0, v0, u1, v0, u1, v1, u0, v1]);
    this.batch.addRaw(this.T.walls[st.wall], g, (ax + bx) / 2, (az + bz) / 2);
  }

  buildShell() {
    const T = this.T;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = MAP[r][c];
      if (ch === '#') continue;
      const zone = zoneAt(c, r), st = ZONE_STYLE[zone];
      const x0 = c * CELL, x1 = x0 + CELL, z0 = r * CELL, z1 = z0 + CELL, k = idx(c, r);
      const V = (x, y, z) => new THREE.Vector3(x, y, z);
      if (!this.holes.has(k)) {
        this.batch.addRaw(T.floors[st.floor], quadGeo(V(x0, 0, z1), V(x1, 0, z1), V(x1, 0, z0), V(x0, 0, z0), [x0 / 2, -z1 / 2, x1 / 2, -z1 / 2, x1 / 2, -z0 / 2, x0 / 2, -z0 / 2]), x0 + 1, z0 + 1);
      }
      if (!this.ceilHoles.has(k)) {
        this.batch.addRaw(T.ceilings[st.ceil], quadGeo(V(x0, WALL_H, z0), V(x1, WALL_H, z0), V(x1, WALL_H, z1), V(x0, WALL_H, z1), [x0 / 2, z0 / 2, x1 / 2, z0 / 2, x1 / 2, z1 / 2, x0 / 2, z1 / 2]), x0 + 1, z0 + 1);
      }
      if (charAt(c, r - 1) === '#' && !this.noWall.has(k + ':n')) this.wallQuad(zone, x0, z0, x1, z0);
      if (charAt(c, r + 1) === '#' && !this.noWall.has(k + ':s')) this.wallQuad(zone, x1, z1, x0, z1);
      if (charAt(c - 1, r) === '#' && !this.noWall.has(k + ':w')) this.wallQuad(zone, x0, z1, x0, z0);
      if (charAt(c + 1, r) === '#' && !this.noWall.has(k + ':e')) this.wallQuad(zone, x1, z0, x1, z1);
      if (isDoorChar(ch)) {
        const d = new Door(this, ch, c, r);
        this.doors[d.name] = d; this.doorList.push(d);
        this.nav.doorAt[k] = d;
      }
    }
  }

  finalize() {
    const n = this.batch.build(this.scene);
    return n;
  }

  // ---- queries --------------------------------------------------------------
  zone(x, z) { return zoneAt(toCol(x), toRow(z)); }
  surface(x, z) { const zn = this.zone(x, z); return zn ? ZONE_STYLE[zn].step : 'lino'; }
  isBasement(z) { return z >= BASEMENT_ROW * CELL; }
  cell(c, r, dx = 0, dz = 0) { return [cellX(c) + dx, cellZ(r) + dz]; }

  // ---- collision ------------------------------------------------------------
  addCollider(minX, minZ, maxX, maxZ, minY = 0, maxY = 3) {
    const col = { minX, minZ, maxX, maxZ, minY, maxY, enabled: true };
    for (let r = toRow(minZ); r <= toRow(maxZ); r++) for (let c = toCol(minX); c <= toCol(maxX); c++) {
      if (c >= 0 && r >= 0 && c < COLS && r < ROWS) this.buckets[idx(c, r)].push(col);
    }
    return col;
  }

  // Resolve a circle against walls, colliders and dynamic blockers. Mutates and returns pos {x,z}.
  collide(pos, radius, top = 1.8) {
    for (let pass = 0; pass < 3; pass++) {
      const c0 = toCol(pos.x), r0 = toRow(pos.z);
      for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) {
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
        if (this.nav.solid[idx(c, r)]) this._push(pos, radius, c * CELL, r * CELL, (c + 1) * CELL, (r + 1) * CELL);
        const b = this.buckets[idx(c, r)];
        for (let i = 0; i < b.length; i++) {
          const col = b[i];
          if (!col.enabled || top <= col.minY + 0.02) continue;
          this._push(pos, radius, col.minX, col.minZ, col.maxX, col.maxZ);
        }
      }
      for (const b of this.blockers) {
        if (b.enabled === false) continue;
        const dx = pos.x - b.x, dz = pos.z - b.z, d = Math.hypot(dx, dz), m = radius + b.r;
        if (d < m && d > 1e-5) { pos.x = b.x + (dx / d) * m; pos.z = b.z + (dz / d) * m; }
      }
    }
    return pos;
  }

  _push(pos, radius, minX, minZ, maxX, maxZ) {
    const cx = clamp(pos.x, minX, maxX), cz = clamp(pos.z, minZ, maxZ);
    let dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) return;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2), k = (radius - d) / d;
      pos.x += dx * k; pos.z += dz * k;
    } else {
      // centre inside the box: push out through the nearest face
      const l = pos.x - minX, rr = maxX - pos.x, t = pos.z - minZ, b = maxZ - pos.z;
      const m = Math.min(l, rr, t, b);
      if (m === l) pos.x = minX - radius; else if (m === rr) pos.x = maxX + radius;
      else if (m === t) pos.z = minZ - radius; else pos.z = maxZ + radius;
    }
  }

  // ---- placement ------------------------------------------------------------
  put(parts, x, z, rot = 0, y = 0) {
    const m = compose(x, y, z, 0, rot, 0, 1, 1, 1);
    this.batch.addParts(parts, m);
    this._colliders(parts, x, z, rot, y);
    return m;
  }

  _colliders(parts, x, z, rot, y = 0) {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const made = [];
    for (const c of parts.colliders) {
      const cx = x + c.x * cs + c.z * sn, cz = z - c.x * sn + c.z * cs;
      const hw = (Math.abs(c.w * cs) + Math.abs(c.d * sn)) / 2, hd = (Math.abs(c.w * sn) + Math.abs(c.d * cs)) / 2;
      made.push(this.addCollider(cx - hw, cz - hd, cx + hw, cz + hd, y + c.minY, y + c.maxY));
      // Keep the AI from routing through furniture: block cells the prop mostly fills,
      // or whose centre it covers.
      for (let r = toRow(cz - hd); r <= toRow(cz + hd); r++) for (let cc = toCol(cx - hw); cc <= toCol(cx + hw); cc++) {
        if (cc < 0 || r < 0 || cc >= COLS || r >= ROWS) continue;
        const ox = Math.min(cx + hw, (cc + 1) * CELL) - Math.max(cx - hw, cc * CELL);
        const oz = Math.min(cz + hd, (r + 1) * CELL) - Math.max(cz - hd, r * CELL);
        const mx = cellX(cc), mz = cellZ(r);
        const centre = mx > cx - hw && mx < cx + hw && mz > cz - hd && mz < cz + hd;
        const big = parts.navBlock && (ox > 1.3 && oz > 0.9 || ox > 0.9 && oz > 1.3);
        if ((centre || big) && c.maxY > 0.5 && !this.nav.doorAt[idx(cc, r)]) this.nav.blocked[idx(cc, r)] = 1;
      }
    }
    return made;
  }

  // Place against a wall of cell (c,r). side: n/s/w/e. along: shift along the wall. depth: prop depth.
  wallPut(parts, c, r, side, depth = 0.5, along = 0, y = 0, gap = 0.02) {
    const [x, z, rot] = this.wallPos(c, r, side, depth, along, gap);
    return this.put(parts, x, z, rot, y);
  }
  wallPos(c, r, side, depth = 0.5, along = 0, gap = 0.02) {
    const off = 1 - depth / 2 - gap;
    const x = cellX(c), z = cellZ(r);
    if (side === 'n') return [x + along, z - off, 0];
    if (side === 's') return [x - along, z + off, Math.PI];
    if (side === 'w') return [x - off, z - along, H];
    return [x + off, z + along, -H];
  }

  dyn(parts, x, z, rot = 0, y = 0, withColliders = false) {
    const o = partsToObject(parts);
    o.position.set(x, y, z); o.rotation.y = rot;
    this.scene.add(o);
    if (withColliders) o.userData.colliders = this._colliders(parts, x, z, rot, y);
    return o;
  }

  decalWall(mat, c, r, side, w, h, y = 1.5, along = 0) {
    const [x, z, rot] = this.wallPos(c, r, side, 0, along, 0.012);
    const p = new Parts(); p.plane(mat, w, h, 0, 0, 0);
    this.batch.addParts(p, compose(x, y, z, 0, rot, 0, 1, 1, 1));
  }
  decalFloor(mat, x, z, size = 1.2, rot = 0, sz = size) {
    const p = new Parts(); p.plane(mat, size, sz, 0, 0, 0, -H);
    this.batch.addParts(p, compose(x, 0.012 + Math.random() * 0.004, z, 0, rot, 0, 1, 1, 1));
  }

  // ---- interactables ----------------------------------------------------------
  // {pos: Vector3, prompt: string|fn, use: fn(game), radius, enabled, id}
  addInteract(o) {
    const it = { radius: 2.0, enabled: true, ...o };
    this.interactables.push(it);
    return it;
  }

  _makeGlint() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.15, 'rgba(255,240,200,0.6)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(31, 4, 2, 56); g.fillRect(4, 31, 56, 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // A pickup with a faint glint so it can be found in the dark.
  addPickup(id, kind, parts, x, y, z, { rot = 0, prompt, glint = 0.16, radius = 1.9 } = {}) {
    const o = partsToObject(parts, { shadow: false });
    o.position.set(x, y, z); o.rotation.y = rot;
    this.scene.add(o);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glintTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5, fog: false }));
    sp.position.set(0, 0.08, 0); sp.scale.setScalar(glint);
    o.add(sp);
    const pk = { id, kind, obj: o, glint: sp, taken: false, phase: Math.random() * 6 };
    pk.interact = this.addInteract({
      id, pos: new THREE.Vector3(x, y, z), prompt, radius,
      use: (game) => { if (pk.taken) return; pk.taken = true; o.visible = false; pk.interact.enabled = false; game.onPickup(pk); },
    });
    this.pickups.push(pk);
    return pk;
  }

  // ---- lights ---------------------------------------------------------------
  addLight(x, z, { state = 'dead', color = 0xffe2b0, intensity = 1, type = 'tube', rot = 0, tag = '', y = WALL_H, mesh = true, range = 9 } = {}) {
    const M = this.T.mats;
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const base = new THREE.Color(color);
    if (mesh) {
      const p = new Parts();
      if (type === 'tube') {
        p.box(M.steelDark, 0.34, 0.07, 1.34, 0, -0.035, 0);
        p.box(mat, 0.07, 0.035, 1.2, -0.08, -0.085, 0); p.box(mat, 0.07, 0.035, 1.2, 0.08, -0.085, 0);
      } else if (type === 'bulb') {
        p.cyl(M.rubber, 0.006, 0.006, 0.5, 0, -0.25, 0, 0, 0, 0, 4);
        p.cyl(M.steelDark, 0.03, 0.16, 0.1, 0, -0.5, 0, 0, 0, 0, 10, true);
        p.sphere(mat, 0.045, 0, -0.56, 0, 1, 1.25, 1);
      } else { // cage
        p.box(M.blackMetal, 0.2, 0.06, 0.2, 0, -0.03, 0);
        p.cyl(mat, 0.06, 0.06, 0.14, 0, -0.12, 0, 0, 0, 0, 8);
        for (let i = 0; i < 4; i++) p.cyl(M.blackMetal, 0.006, 0.006, 0.18, Math.cos(i * H) * 0.08, -0.12, Math.sin(i * H) * 0.08, 0, 0, 0, 4);
      }
      const o = partsToObject(p, { shadow: false });
      o.position.set(x, y, z); o.rotation.y = rot;
      this.scene.add(o);
    }
    const ly = type === 'bulb' ? y - 0.6 : y - 0.12;
    const L = {
      x, z, y: ly, state, base, color: base.clone(), intensity, level: 0, mat, tag, range, rect: this.roomRect(x, z),
      t: Math.random() * 10, next: 0, burst: 0, override: null, basement: this.isBasement(z),
    };
    this.lights.push(L);
    return L;
  }

  setLights(tag, state) { for (const l of this.lights) if (l.tag === tag) { l.state = state; l.override = null; } }
  lightsByTag(tag) { return this.lights.filter((l) => l.tag === tag); }

  // Largest rectangle of same-zone floor around a point (world units).
  roomRect(x, z) {
    const c = toCol(x), r = toRow(z), z0 = charAt(c, r);
    let c0 = c, c1 = c, r0 = r, r1 = r, grew = true;
    const ok = (cc, rr) => charAt(cc, rr) === z0;
    const col = (cc) => { for (let rr = r0; rr <= r1; rr++) if (!ok(cc, rr)) return false; return true; };
    const row = (rr) => { for (let cc = c0; cc <= c1; cc++) if (!ok(cc, rr)) return false; return true; };
    while (grew) {
      grew = false;
      if (col(c0 - 1)) { c0--; grew = true; }
      if (col(c1 + 1)) { c1++; grew = true; }
      if (row(r0 - 1)) { r0--; grew = true; }
      if (row(r1 + 1)) { r1++; grew = true; }
    }
    return [c0 * CELL, r0 * CELL, (c1 + 1) * CELL, (r1 + 1) * CELL];
  }

  updateLights(dt, px, pz, mult = 1) {
    const basement = this.isBasement(pz);
    let buzz = 0;
    const cand = [];
    for (const l of this.lights) {
      let target;
      if (l.override !== null) target = l.override;
      else if (l.state === 'on') target = 0.92 + Math.sin(this.time * 97 + l.t) * 0.04;
      else if (l.state === 'flicker') {
        l.next -= dt;
        if (l.next <= 0) {
          if (l.burst > 0) { l.burst--; l.on = !l.on; l.next = rand(0.03, 0.12); }
          else { l.on = Math.random() < 0.75; l.burst = Math.random() < 0.5 ? ((Math.random() * 7) | 0) : 0; l.next = l.on ? rand(0.3, 3.5) : rand(0.08, 0.9); }
        }
        target = l.on ? 0.85 + Math.random() * 0.15 : 0.03;
      } else if (l.state === 'dying') {
        target = Math.random() < 0.3 ? 0.5 * Math.random() : 0.02;
      } else if (l.state === 'pulse') { // rotating alarm beacon
        target = 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(this.time * 5.5 + l.t)), 2);
      } else target = 0;
      l.level = l.state === 'on' ? damp(l.level, target, 12, dt) : target;
      const lv = l.level * mult;
      l.mat.color.copy(l.color).multiplyScalar(lv * 2.6 + (l.state === 'dead' ? 0 : 0.012));
      if (lv > 0.02 && l.basement === basement) {
        const d = Math.hypot(l.x - px, l.z - pz);
        if (d < 28) {
          const fade = clamp((28 - d) / 9, 0, 1);
          cand.push({ l, score: lv * l.intensity * fade / (1 + d * d / 50), fade, lv });
          if (l.state !== 'pulse') buzz = Math.max(buzz, lv / (1 + d * d / 6));
        }
      }
    }
    cand.sort((a, b) => b.score - a.score);
    for (let i = 0; i < ROOM_LIGHTS; i++) {
      const c = cand[i];
      if (c) {
        const k = c.lv * c.l.intensity * c.fade * 30 * (c.l.boost || 1);
        roomU.rlPosW.value[i].set(c.l.x, c.l.y, c.l.z);
        roomU.rlColor.value[i].set(c.l.color.r * k, c.l.color.g * k, c.l.color.b * k);
        roomU.rlRect.value[i].set(c.l.rect[0], c.l.rect[1], c.l.rect[2], c.l.rect[3]);
        roomU.rlRange.value[i] = c.l.range + 2;
      } else roomU.rlColor.value[i].set(0, 0, 0);
    }
    this.buzz = buzz;
  }

  // ---- per-frame --------------------------------------------------------------
  update(dt, px, pz, lightMult = 1) {
    this.time += dt;
    for (const d of this.doorList) d.update(dt);
    this.updateLights(dt, px, pz, lightMult);
    for (const p of this.pickups) {
      if (p.taken) continue;
      const s = 0.55 + 0.45 * Math.sin(this.time * 2.2 + p.phase);
      p.glint.material.opacity = 0.18 + s * 0.4;
      p.glint.material.rotation = this.time * 0.4 + p.phase;
    }
    for (const u of this.updaters) u(dt, this.time);
  }
}

export { ZONE_STYLE };
