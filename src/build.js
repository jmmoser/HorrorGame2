// Geometry assembly helpers: describe props as lists of primitive parts, then
// merge them into a handful of draw calls.
import * as THREE from '../vendor/three.module.min.js';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
const cache = new Map();
function cylGeo(seg, ratio, open) {
  const k = `c${seg}:${ratio.toFixed(3)}:${open ? 1 : 0}`;
  if (!cache.has(k)) cache.set(k, new THREE.CylinderGeometry(ratio, 1, 1, seg, 1, open));
  return cache.get(k);
}
function sphGeo(ws, hs) {
  const k = `s${ws}:${hs}`;
  if (!cache.has(k)) cache.set(k, new THREE.SphereGeometry(1, ws, hs));
  return cache.get(k);
}
function torGeo(tube, seg, arc) {
  const k = `t${tube.toFixed(3)}:${seg}:${arc.toFixed(2)}`;
  if (!cache.has(k)) cache.set(k, new THREE.TorusGeometry(1, tube, 6, seg, arc));
  return cache.get(k);
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function compose(x, y, z, rx, ry, rz, sx, sy, sz) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

export class Parts {
  constructor() {
    this.list = [];       // {mat, geo, m}
    this.colliders = [];  // {x, z, w, d, minY, maxY} local, axis aligned
    this.stack = [new THREE.Matrix4()];
    this.navBlock = false;
  }
  get top() { return this.stack[this.stack.length - 1]; }
  push(x, y, z, ry = 0, rx = 0, rz = 0) { this.stack.push(this.top.clone().multiply(compose(x, y, z, rx, ry, rz, 1, 1, 1))); return this; }
  pop() { this.stack.pop(); return this; }
  add(mat, geo, m) { this.list.push({ mat, geo, m: this.top.clone().multiply(m) }); return this; }
  box(mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(mat, UNIT_BOX, compose(x, y, z, rx, ry, rz, w, h, d)); }
  // cylinder along Y by default. r1 = top radius, r2 = bottom radius
  cyl(mat, r1, r2, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 10, open = false) {
    return this.add(mat, cylGeo(seg, r2 > 0 ? r1 / r2 : 1, open), compose(x, y, z, rx, ry, rz, r2 || r1, h, r2 || r1));
  }
  sphere(mat, r, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, ws = 12, hs = 8) { return this.add(mat, sphGeo(ws, hs), compose(x, y, z, 0, ry, 0, r * sx, r * sy, r * sz)); }
  torus(mat, R, tube, x, y, z, rx = 0, ry = 0, rz = 0, seg = 14, arc = Math.PI * 2) { return this.add(mat, torGeo(tube / R, seg, arc), compose(x, y, z, rx, ry, rz, R, R, R)); }
  plane(mat, w, h, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(mat, UNIT_PLANE, compose(x, y, z, rx, ry, rz, w, h, 1)); }
  collider(x, z, w, d, minY = 0, maxY = 3) { this.colliders.push({ x, z, w, d, minY, maxY }); return this; }
}

// Merge a list of {mat, geo, m} into one geometry per material.
export function mergeByMaterial(list) {
  const groups = new Map();
  for (const p of list) {
    if (!groups.has(p.mat)) groups.set(p.mat, []);
    groups.get(p.mat).push(p);
  }
  const out = [];
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const [mat, parts] of groups) {
    let vc = 0, ic = 0;
    for (const p of parts) { vc += p.geo.attributes.position.count; ic += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count; }
    const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
    const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
    let vo = 0, io = 0;
    for (const p of parts) {
      const g = p.geo, gp = g.attributes.position, gn = g.attributes.normal, gu = g.attributes.uv;
      nm.getNormalMatrix(p.m);
      const flip = p.m.determinant() < 0;
      for (let i = 0; i < gp.count; i++) {
        v.fromBufferAttribute(gp, i).applyMatrix4(p.m);
        pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
        v.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize();
        nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
        if (gu) { uv[(vo + i) * 2] = gu.getX(i); uv[(vo + i) * 2 + 1] = gu.getY(i); }
      }
      if (g.index) {
        const gi = g.index.array;
        for (let i = 0; i < gi.length; i += 3) {
          idx[io + i] = gi[i] + vo; idx[io + i + 1] = gi[i + (flip ? 2 : 1)] + vo; idx[io + i + 2] = gi[i + (flip ? 1 : 2)] + vo;
        }
        io += gi.length;
      } else {
        for (let i = 0; i < gp.count; i++) idx[io + i] = vo + i;
        io += gp.count;
      }
      vo += gp.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    out.push({ mat, geo });
  }
  return out;
}

// Dynamic prop: a Group with one mesh per material.
export function partsToObject(parts, { shadow = true } = {}) {
  const g = new THREE.Group();
  for (const { mat, geo } of mergeByMaterial(parts.list)) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = shadow && !mat.transparent; mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

// Static world batcher, chunked for frustum culling.
export class Batcher {
  constructor(chunk = 12) { this.chunk = chunk; this.chunks = new Map(); }
  addParts(parts, world) {
    const key = `${Math.floor(world.elements[12] / this.chunk)}|${Math.floor(world.elements[14] / this.chunk)}`;
    if (!this.chunks.has(key)) this.chunks.set(key, []);
    const arr = this.chunks.get(key);
    for (const p of parts.list) arr.push({ mat: p.mat, geo: p.geo, m: world.clone().multiply(p.m) });
  }
  addRaw(mat, geo, x, z) {
    const key = `${Math.floor(x / this.chunk)}|${Math.floor(z / this.chunk)}`;
    if (!this.chunks.has(key)) this.chunks.set(key, []);
    this.chunks.get(key).push({ mat, geo, m: new THREE.Matrix4() });
  }
  build(parent) {
    let n = 0;
    for (const arr of this.chunks.values()) {
      for (const { mat, geo } of mergeByMaterial(arr)) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = !mat.transparent && !mat.userData.noShadow;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        parent.add(mesh); n++;
      }
    }
    this.chunks.clear();
    return n;
  }
}

// A quad with explicit corners (a,b,c,d counter-clockwise seen from the front) and uvs.
export function quadGeo(a, b, c, d, uvs) {
  const g = new THREE.BufferGeometry();
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
  g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export { compose };
