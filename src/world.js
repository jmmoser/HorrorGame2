// World content: everything that goes inside the shell built by level.js.
import * as THREE from '../vendor/three.module.min.js';
import { cellX as cx, cellZ as cz, idx, CELL, WALL_H } from './map.js';
import { Parts, partsToObject } from './build.js';
import { texUtil } from './textures.js';
import { mulberry32 } from './util.js';

const H = Math.PI / 2, PI = Math.PI;

export function configureShell(L) {
  L.holes.add(idx(35, 1));        // stairs down (ground floor)
  L.ceilHoles.add(idx(2, 33));    // stairs up (basement)
  L.noWall.add(idx(38, 34) + ':e'); // loading bay exit looks outside
}

export function populate(L, T, P) {
  const M = T.mats, D = T.decals;
  const O = L.objs, MK = L.markers;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---- item models ----------------------------------------------------------
  const fuseMat = new THREE.MeshStandardMaterial({ color: 0xe0a848, emissive: 0x7a4208, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.1 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: 0.35, metalness: 0.9, emissive: 0x241a04 });
  const fusePart = () => {
    const p = new Parts();
    p.cyl(fuseMat, 0.02, 0.02, 0.09, 0, 0.022, 0, 0, 0, H, 10);
    p.cyl(M.steel, 0.023, 0.023, 0.025, -0.055, 0.022, 0, 0, 0, H, 10); p.cyl(M.steel, 0.023, 0.023, 0.025, 0.055, 0.022, 0, 0, 0, H, 10);
    return p;
  };
  const keyPart = () => {
    const p = new Parts();
    p.torus(brass, 0.035, 0.006, 0, 0.008, 0, H, 0, 0, 12);
    p.box(brass, 0.085, 0.008, 0.012, 0.075, 0.008, 0); p.box(brass, 0.012, 0.008, 0.03, 0.105, 0.008, 0.015); p.box(brass, 0.012, 0.008, 0.022, 0.085, 0.008, 0.012);
    p.torus(brass, 0.02, 0.005, -0.05, 0.008, 0.01, H, 0, 0, 10);
    return p;
  };
  const batteryPart = () => {
    const p = new Parts();
    for (const dz of [-0.02, 0.02]) { p.cyl(M.redMetal, 0.016, 0.016, 0.07, 0, 0.016, dz, 0, 0, H, 8); p.cyl(brass, 0.006, 0.006, 0.01, 0.04, 0.016, dz, 0, 0, H, 6); }
    return p;
  };
  const notePart = () => { const p = new Parts(); p.box(M.paper, 0.2, 0.004, 0.28, 0, 0.002, 0); p.box(M.black, 0.14, 0.0045, 0.004, 0, 0.002, -0.08); p.box(M.black, 0.14, 0.0045, 0.004, 0, 0.002, -0.04); p.box(M.black, 0.1, 0.0045, 0.004, -0.02, 0.002, 0); return p; };
  const flashlightPart = () => {
    const p = new Parts();
    p.cyl(M.blackMetal, 0.02, 0.02, 0.16, 0, 0.03, 0, 0, 0, H, 10);
    p.cyl(M.steel, 0.032, 0.022, 0.05, 0.1, 0.03, 0, 0, 0, -H, 10);
    p.cyl(new THREE.MeshBasicMaterial({ color: 0xfff2cc }), 0.027, 0.027, 0.004, 0.126, 0.03, 0, 0, 0, H, 10);
    return p;
  };
  const fuse = (id, x, y, z, rot = 0.4) => L.addPickup(id, 'fuse', fusePart(), x, y, z, { rot, prompt: 'Take the fuse', glint: 0.2 });
  const battery = (id, x, y, z) => L.addPickup(id, 'battery', batteryPart(), x, y, z, { rot: Math.random() * 3, prompt: 'Take batteries', glint: 0.12 });
  const note = (id, x, y, z, rot = 0) => L.addPickup(id, 'note', notePart(), x, y, z, { rot, prompt: 'Read', glint: 0.13 });
  const key = (id, x, y, z, rot = 0) => L.addPickup(id, 'key', keyPart(), x, y, z, { rot, prompt: 'Take the key', glint: 0.18 });
  O.fuse = fuse; // the morgue drawer creates its fuse later
  O.makeKey = key;

  // ---- helpers ----------------------------------------------------------------
  const placard = (text, c, r, side, along = 0) => {
    L.decalWall(T.sign([text], { w: 384, h: 96, font: 'bold 40px Georgia, serif', bg: '#16130f', fg: '#b8ad8c', seed: text.length * 7 }), c, r, side, 0.62, 0.155, 2.02, along);
  };
  const scrawl = (text, seed, c, r, side, w, y = 1.6, along = 0, color) => {
    const lines = text.split('\n').length;
    L.decalWall(T.scrawl(text, seed, color), c, r, side, w, w * (96 * lines + 40) / 512, y, along);
  };
  const blood = (c, r, side, s = 1.2, y = 1.3, along = 0, i = 0) => L.decalWall(D.blood[i % D.blood.length], c, r, side, s, s, y, along);
  const grime = (x, z, s = 1.6) => L.decalFloor(D.grimeFloor[(x * 7 + z) & 1], x, z, s, x + z);
  const pool = (x, z, s = 1.4, i = 0) => L.decalFloor(D.bloodFloor[i % 3], x, z, s, x * 3 + z);

  O.lockers = [];
  const hideLocker = (c, r, side, along = 0) => {
    const [x, z, rot] = L.wallPos(c, r, side, 0.56, along);
    L.put(P.lockerShell(), x, z, rot);
    const pivot = new THREE.Group();
    const cs = Math.cos(rot), sn = Math.sin(rot);
    pivot.position.set(x + (-0.3) * cs + 0.27 * sn, 0, z - (-0.3) * sn + 0.27 * cs);
    pivot.rotation.y = rot;
    const door = partsToObject(P.lockerDoor());
    pivot.add(door); L.scene.add(pivot);
    const lk = { x, z, rot, pivot, door, open: 0, target: 0, outX: sn, outZ: cs, occupied: false };
    lk.interact = L.addInteract({
      id: 'locker', pos: V(x + sn * 0.3, 1.2, z + cs * 0.3), prompt: 'Hide', radius: 1.7,
      use: (game) => game.player.enterLocker(lk),
    });
    O.lockers.push(lk);
    return lk;
  };
  L.updaters.push((dt) => {
    for (const lk of O.lockers) {
      if (lk.open !== lk.target) {
        const d = lk.target - lk.open, st = dt * (lk.fast ? 14 : 5);
        lk.open = Math.abs(d) < st ? lk.target : lk.open + Math.sign(d) * st;
        lk.door.rotation.y = -lk.open * 1.7;
      }
      lk.door.visible = !(lk.occupied && lk.open < 0.02);
      if (false) {
      }
    }
  });

  const drawing = (seed) => {
    const c = texUtil.mk(256, 200), g = c.getContext('2d'), rng = mulberry32(seed);
    g.fillStyle = '#cfc6a8'; g.fillRect(0, 0, 256, 200);
    const stick = (x, y, s, col, arms = 1) => {
      g.strokeStyle = col; g.lineWidth = 2.5 * s; g.lineCap = 'round';
      g.beginPath(); g.arc(x, y - 30 * s, 9 * s, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(x, y - 21 * s); g.lineTo(x, y + 8 * s);
      g.moveTo(x, y + 8 * s); g.lineTo(x - 8 * s, y + 26 * s); g.moveTo(x, y + 8 * s); g.lineTo(x + 8 * s, y + 26 * s);
      g.moveTo(x - 12 * s * arms, y - 6 * s + (arms > 1 ? 44 * s : 0)); g.lineTo(x, y - 12 * s); g.lineTo(x + 12 * s * arms, y - 6 * s + (arms > 1 ? 44 * s : 0));
      g.stroke();
    };
    const cols = ['#7a2a22', '#2a4a7a', '#3a6a2a', '#8a6a1a'];
    for (let i = 0; i < 4; i++) stick(40 + i * 34, 150 + rng() * 8, 0.8, cols[i]);
    stick(205, 110, 2.1, '#0a0a0a', 2.2);
    g.fillStyle = '#0a0a0a'; g.beginPath(); g.arc(205, 47, 17, 0, 7); g.fill();
    g.strokeStyle = '#0a0a0a'; g.lineWidth = 2;
    for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(190 + rng() * 30, 30 + rng() * 34); g.lineTo(190 + rng() * 30, 30 + rng() * 34); g.stroke(); }
    g.fillStyle = '#5a1a14'; g.font = 'bold 17px "Rock Salt", cursive'; g.fillText(seed % 2 ? 'shhhh' : 'be good', 20, 34);
    texUtil.grunge(g, 256, 200, { cells: 5, seed, alpha: 0.5 });
    return new THREE.MeshStandardMaterial({ map: T.canvasTex(c, { repeat: false }), roughness: 0.9, emissive: 0x222018, emissiveIntensity: 0.3 });
  };

  const mannequin = (x, z, yaw, seed) => {
    const rng = mulberry32(seed);
    const f = P.figure({ armL: [(rng() - 0.5) * 1.2, -rng() * 0.9, 0.1 + rng() * 0.25], armR: [(rng() - 0.5) * 1.2, -rng() * 0.9, -0.1 - rng() * 0.25] });
    const g = new THREE.Group();
    g.add(partsToObject(f.body));
    const head = partsToObject(f.head); head.position.y = f.headY; g.add(head);
    g.position.set(x, 0, z); g.rotation.y = yaw;
    L.scene.add(g);
    return { g, head, x, z, yaw, home: { x, z, yaw }, fallen: false };
  };

  // =============================== LOBBY ====================================
  L.put(P.reception(), 26, cz(21), 0);
  MK.flashlight = V(26.75, 1.1, cz(21) + 0.12);
  O.flashlightItem = L.addPickup('flashlight', 'flashlight', flashlightPart(), MK.flashlight.x, MK.flashlight.y, MK.flashlight.z, { rot: 1.2, prompt: 'Take the flashlight', glint: 0.01, radius: 2.3 });
  note('workOrder', 25.5, 1.098, cz(21) + 0.1, 0.25);
  L.wallPut(P.bench(), 19, 22, 'e', 0.45, 1.0);
  L.wallPut(P.bench(), 11, 22, 'w', 0.45, -1.0);
  L.put(P.plant(), cx(11) - 0.55, cz(24) + 0.55); L.put(P.plant(), cx(19) + 0.55, cz(24) + 0.55); L.put(P.plant(), cx(19) + 0.55, cz(20) - 0.55);
  for (const c of [12, 13, 17, 18]) L.wallPut(P.frame(T.portrait(c * 3), 0.62, 0.8), c, 20, 'n', 0.03, 0, 1.85);
  L.decalWall(T.sign(["ST. MAREN'S SANATORIUM", 'FOR CHILDREN  ·  EST. 1921'], { w: 640, h: 180, font: 'bold 36px Georgia, serif', bg: '#1a1410', fg: '#a8946a', seed: 9 }), 16, 20, 'n', 1.5, 0.42, 2.25, 0.1);
  L.wallPut(P.clock(), 14, 20, 'n', 0.05, 0, 2.3);
  O.windowMat = new THREE.MeshBasicMaterial({ color: 0x060b12 });
  O.windowMat.userData.noShadow = true;
  for (const c of [12, 13, 17, 18]) {
    const p = new Parts();
    p.box(M.woodDark, 1.2, 1.9, 0.06, 0, 0, 0);
    p.plane(O.windowMat, 1.04, 1.74, 0, 0, 0.034);
    p.box(M.woodDark, 0.05, 1.8, 0.08, 0, 0, 0.02); p.box(M.woodDark, 1.1, 0.05, 0.08, 0, 0.25, 0.02);
    for (let i = -3; i <= 3; i++) p.cyl(M.blackMetal, 0.008, 0.008, 1.76, i * 0.15, 0, 0.06, 0, 0, 0, 4);
    L.wallPut(p, c, 24, 's', 0.06, 0, 1.65);
  }
  L.addLight(cx(13), cz(22), { state: 'flicker', intensity: 0.55, tag: 'lobby', rot: H });
  L.addLight(cx(17), cz(22), { state: 'dead', tag: 'lobby', rot: H });
  grime(cx(15), cz(23)); grime(cx(13), cz(24), 2); grime(cx(18), cz(21), 2.2);
  L.addInteract({ id: 'frontDoor', pos: V(cx(15), 1.2, cz(25) - 0.3), prompt: 'Open', radius: 2.2, use: (g) => g.events.frontDoor() });
  MK.start = V(cx(15), 0, cz(24) - 0.1);

  // =============================== C1 =======================================
  L.addLight(cx(15), cz(18), { state: 'dead', tag: 'c1' });
  O.c1mid = L.addLight(cx(15), cz(15), { state: 'flicker', intensity: 0.8, tag: 'c1' });
  L.addLight(cx(15), cz(12), { state: 'dead', tag: 'c1' });
  O.c1end = L.addLight(cx(15), cz(9), { state: 'on', intensity: 0.75, tag: 'c1end' });
  for (let r = 9; r <= 19; r++) L.put(P.ductRun({ len: 2 }), cx(15) + 0.74, cz(r), H, 2.84);
  L.wallPut(P.radiator(), 15, 14, 'w', 0.16); L.wallPut(P.radiator(), 15, 10, 'e', 0.16);
  O.wheelchair = L.dyn(P.wheelchair(), cx(15) + 0.15, cz(11) - 0.4, 0);
  O.wheelchairBlock = { x: O.wheelchair.position.x, z: O.wheelchair.position.z, r: 0.42, enabled: true };
  L.blockers.push(O.wheelchairBlock);
  placard('DIRECTOR', 15, 16, 'w'); placard('DAY ROOM', 15, 16, 'e'); placard('STORES', 15, 11, 'w'); placard('WARDS', 15, 9, 'w');
  scrawl('hush', 1, 15, 13, 'e', 0.9, 1.5);
  L.decalWall(D.hands[0], 15, 9, 'e', 0.9, 0.9, 1.25);
  grime(cx(15), cz(13)); grime(cx(15), cz(17), 1.8); L.decalFloor(D.trail, cx(15) - 0.3, cz(10), 0.7, 0.1, 3.4);

  // =============================== OFFICE ===================================
  const deskX = cx(11), deskZ = cz(16) + 1;
  L.put(P.desk(), deskX, deskZ, H);
  L.put(P.chair(), deskX - 0.8, deskZ, H);
  L.put(P.chair({ fallen: true }), deskX + 1.5, deskZ + 0.7, 0.7);
  {
    const p = new Parts();
    p.box(M.blackMetal, 0.2, 0.06, 0.16, 0, 0.03, 0); p.box(M.blackMetal, 0.06, 0.04, 0.22, 0, 0.085, 0, 0, 0.1);
    p.cyl(M.paper, 0.045, 0.045, 0.005, 0, 0.062, 0.02, 0, 0, 0, 10);
    O.phone = L.dyn(p, deskX + 0.05, deskZ - 0.45, H, 0.785);
    MK.phone = V(deskX + 0.05, 0.85, deskZ - 0.45);
    O.phoneInteract = L.addInteract({ id: 'phone', pos: MK.phone, prompt: 'Answer', enabled: false, use: (g) => g.events.answerPhone() });
  }
  key('wardKey', deskX + 0.12, 0.787, deskZ + 0.45, 0.6);
  note('memo', deskX - 0.05, 0.787, deskZ + 0.02, H + 0.1);
  L.wallPut(P.bookshelf({ w: 1.8 }), 10, 15, 'n', 0.36); L.wallPut(P.bookshelf({ w: 1.8 }), 12, 15, 'n', 0.36);
  L.wallPut(P.cabinet({ open: 2 }), 9, 17, 'w', 0.6); L.wallPut(P.cabinet(), 9, 18, 'w', 0.6, -0.1);
  L.wallPut(P.frame(T.portrait(77), 0.7, 0.9), 11, 18, 's', 0.03, 0, 1.8);
  L.put(P.armchair(), cx(13) + 0.3, cz(15) - 0.2, -2.3);
  L.put(P.plant(), cx(9) - 0.5, cz(15) - 0.5);
  L.wallPut(P.clock(), 13, 18, 's', 0.05, 0, 2.2);
  O.officeLight = L.addLight(deskX, deskZ, { state: 'on', intensity: 0.5, color: 0xffd49a, tag: 'office' });

  // =============================== DAY ROOM =================================
  {
    const [x, z, rot] = L.wallPos(23, 16, 'e', 0.52, 1.0);
    L.put(P.tvStand(), x, z, rot);
    const canvas = texUtil.mk(128, 96);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.LinearFilter;
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0x000000 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.42), mat);
    screen.position.set(x - 0.265, 1.2, z - 0.03); screen.rotation.y = -H;
    L.scene.add(screen);
    O.tv = { screen, canvas, ctx: canvas.getContext('2d'), tex, mat, on: false, pos: V(x - 0.3, 1.2, z), face: 0 };
    MK.tv = O.tv.pos;
  }
  L.put(P.couch(), cx(20) + 0.6, cz(16) + 1, H);
  L.put(P.armchair(), cx(21) + 0.3, cz(18) + 0.1, 2.5); L.put(P.armchair(), cx(21) + 0.3, cz(15) - 0.1, 0.7);
  L.put(P.table(), cx(18), cz(15) + 0.1);
  L.put(P.chair(), cx(18) - 0.8, cz(15) + 0.1, H); L.put(P.chair({ fallen: true }), cx(18) + 0.9, cz(15) + 0.5, 2.2);
  L.put(P.table(), cx(18) + 0.3, cz(18) - 0.1);
  L.put(P.chair(), cx(18) + 0.3, cz(18) - 0.95, 0);
  note('letter', cx(18) + 0.35, 0.745, cz(18) - 0.15, 0.5);
  battery('bat1', cx(18) + 0.1, 0.745, cz(15) + 0.2);
  L.wallPut(P.bookshelf({ w: 1.8 }), 22, 18, 's', 0.36);
  L.wallPut(P.radiator(), 19, 15, 'n', 0.16, -0.6);
  scrawl('THE QUIET GAME', 2, 19, 18, 's', 1.7, 1.75, 0.5);
  scrawl('tommy lost', 3, 17, 16, 'w', 1.1, 1.2);
  placard('PLAY ROOM', 21, 15, 'n');
  L.addLight(cx(20), cz(16) + 1, { state: 'dead', tag: 'day' }); L.addLight(cx(18), cz(16) + 1, { state: 'dead', tag: 'day' });
  grime(cx(20), cz(17), 2.4); grime(cx(22), cz(15), 1.8);

  // =============================== PLAY ROOM ================================
  {
    const [x, z] = L.wallPos(20, 10, 'n', 0.54);
    L.put(P.musicBoxTable(), x, z, 0);
    MK.musicBox = V(x, 0.62, z);
    fuse('fuse1', x + 0.24, 0.527, z + 0.08, 0.5);
  }
  O.horse = L.dyn(P.rockingHorse(), cx(18), cz(11) + 0.2, 0.9);
  L.blockers.push({ x: cx(18), z: cz(11) + 0.2, r: 0.42 });
  L.wallPut(P.toyChest(), 17, 12, 'w', 0.5, -0.3);
  L.put(P.blocks(), cx(19) + 0.3, cz(12) + 0.5); L.put(P.blocks(), cx(22) - 0.2, cz(11) + 0.3, 1);
  L.put(P.doll(), cx(17) - 0.72, cz(13) + 0.72, 0.8); L.put(P.doll(), cx(17) - 0.6, cz(12) + 0.3, H, 0.47);
  L.put(P.doll(), cx(21), cz(12) + 0.2, PI);
  L.put(P.doll(), cx(20) - 0.22, cz(10) - 0.72, 0.2, 0.525);
  {
    const p = new Parts(); p.sphere(new THREE.MeshStandardMaterial({ color: 0x8a1a14, roughness: 0.45 }), 0.13, 0, 0, 0, 1, 1, 1, 0, 14, 10);
    O.ball = L.dyn(p, cx(22) + 0.6, cz(10) - 0.5, 0, 0.13);
  }
  L.wallPut(P.bed({ child: true }), 23, 12, 'e', 1.6, 0.25); L.wallPut(P.bed({ child: true, sheet: false }), 23, 13, 'e', 1.6, 0.35);
  L.put(P.table({ r: 0.4, h: 0.5 }), cx(18) + 0.3, cz(13) + 0.2);
  L.wallPut(P.frame(drawing(3), 0.5, 0.39), 18, 10, 'n', 0.03, 0.2, 1.3); L.wallPut(P.frame(drawing(4), 0.5, 0.39), 22, 10, 'n', 0.03, -0.3, 1.45);
  L.wallPut(P.frame(drawing(5), 0.5, 0.39), 17, 11, 'w', 0.03, 0.3, 1.2);
  scrawl('SHE HAS LONG ARMS\nso she can reach\nunder the bed', 4, 23, 10, 'e', 1.7, 1.65);
  O.playLight = L.addLight(cx(20), cz(11) + 1, { state: 'flicker', intensity: 0.5, color: 0xffcf90, tag: 'play' });
  grime(cx(19), cz(11), 2); grime(cx(22), cz(13), 1.6);

  // =============================== STORES ===================================
  for (const c of [6, 8, 10, 12]) L.wallPut(P.shelf(), c, 10, 'n', 0.5, c === 8 ? 0.2 : 0);
  for (const c of [7, 9, 11, 13]) L.wallPut(P.shelf({ boxes: c !== 11 }), c, 13, 's', 0.5);
  L.put(P.crate(), cx(5) - 0.5, cz(13) + 0.5, 0.2); L.put(P.crate({ s: 0.55 }), cx(5) - 0.45, cz(13) - 0.3, 0.5);
  L.put(P.boxes(), cx(9), cz(11) + 0.9, 0.4); L.put(P.boxes(), cx(12) + 0.4, cz(11) - 0.3, 2);
  L.put(P.crate(), cx(6) + 0.2, cz(12) - 0.2, 0.3);
  battery('bat2', cx(6) + 0.2, 0.705, cz(12) - 0.2);
  MK.storeBattery = V(cx(6) + 0.2, 0.7, cz(12) - 0.2);
  O.mannequins = [
    [cx(12) - 0.3, cz(11) + 0.6, -1.8], [cx(11) + 0.2, cz(12) + 0.5, -1.2], [cx(11) - 0.5, cz(10) + 0.6, -2.2], [cx(10) + 0.1, cz(12) - 0.1, -1.6],
    [cx(9) + 0.4, cz(10) + 0.7, -2.6], [cx(9) - 0.5, cz(12) + 0.6, -0.9], [cx(8) + 0.3, cz(11) + 0.5, -1.5], [cx(8) - 0.6, cz(10) + 0.8, 2.9],
    [cx(7) + 0.2, cz(12) + 0.6, -0.6], [cx(7) - 0.4, cz(11) + 0.2, -1.9], [cx(6) - 0.3, cz(10) + 0.9, 2.4], [cx(5) + 0.3, cz(11) + 0.9, -1.3],
  ].map(([x, z, yaw], i) => mannequin(x, z, yaw, 100 + i));
  placard('DRESSMAKING STORES', 13, 12, 'e', 0);
  L.addLight(cx(7), cz(11) + 1, { state: 'dead', type: 'bulb', tag: 'store' }); L.addLight(cx(11), cz(11) + 1, { state: 'dead', type: 'bulb', tag: 'store' });
  grime(cx(8), cz(12), 2.5); grime(cx(11), cz(11), 2);

  // =============================== C2 (ward corridor) =======================
  for (const c of [3, 8, 13, 18, 23, 28, 33]) L.addLight(cx(c), cz(7), { state: 'off', intensity: 0.85, tag: 'c2', rot: H });
  for (let c = 1; c <= 36; c++) if (c !== 4 && c !== 12 && c !== 18 && c !== 23 && c !== 27 && c !== 31 && c !== 35) L.put(P.ductRun({ len: 2 }), cx(c), cz(7) - 0.76, 0, 2.84);
  hideLocker(7, 7, 's'); hideLocker(20, 7, 's'); hideLocker(29, 7, 's', 0.3);
  L.wallPut(P.locker(), 8, 7, 's', 0.56, 0.66); L.wallPut(P.locker(), 21, 7, 's', 0.56, 0.66);
  L.put(P.gurney({ body: true }), cx(22) + 0.9, cz(7) + 0.5, H + 0.08);
  L.wallPut(P.radiator(), 6, 7, 'n', 0.16); L.wallPut(P.radiator(), 16, 7, 's', 0.16); L.wallPut(P.radiator(), 33, 7, 's', 0.16);
  L.put(P.ivStand(), cx(10) + 0.3, cz(7) - 0.6); L.put(P.wheelchair(), cx(33) - 0.5, cz(7) - 0.45, 2.2);
  L.addCollider(cx(33) - 0.85, cz(7) - 0.8, cx(33) - 0.15, cz(7) - 0.1);
  placard('WARD A', 5, 7, 'n', -0.75); placard('NIGHT STATION', 13, 7, 'n', -0.75); placard('HYDROTHERAPY', 19, 7, 'n', -0.75);
  placard('ISOLATION 1', 24, 7, 'n', -0.75); placard('ISOLATION 2', 28, 7, 'n', -0.75); placard('ISOLATION 3', 32, 7, 'n', -0.75);
  placard('STAIRS · BASEMENT', 34, 7, 'n', 0.6);
  scrawl('SHE HEARS YOU', 5, 15, 7, 'n', 1.8, 1.7);
  scrawl("DON'T RUN", 6, 26, 7, 's', 1.4, 1.6);
  blood(10, 7, 's', 1.3, 1.2, 0, 1); L.decalWall(D.hands[1], 28, 7, 'n', 0.9, 0.9, 1.2, 0.5);
  L.decalFloor(D.trail, cx(27), cz(7) - 0.5, 0.8, 0, 2.6);
  for (const c of [2, 9, 14, 21, 30, 35]) grime(cx(c), cz(7), 1.8);
  // C3 / C4
  L.addLight(cx(3), cz(10), { state: 'dead', tag: 'c3' });
  L.put(P.boxes(), cx(3) - 0.4, cz(12) + 0.5, 0.3);
  O.c4light = L.addLight(cx(25), cz(10), { state: 'flicker', intensity: 0.6, tag: 'c4' });
  hideLocker(25, 9, 'w');
  L.put(P.crate(), cx(25) + 0.55, cz(12) + 0.55, 0.1);

  // =============================== WARD A ===================================
  const bodies = [1, 1, 0, 1, 0, 1, 1, 0, 1];
  for (let c = 1; c <= 9; c++) {
    L.wallPut(P.bed({ body: !!bodies[c - 1], sheet: c !== 5 }), c, 1, 'n', 1.95, -0.25);
    L.wallPut(P.nightstand(), c, 1, 'n', 0.38, 0.64);
  }
  for (const c of [1, 2, 3, 6, 7, 8, 9]) {
    L.wallPut(P.bed({ body: c !== 3 && c !== 8 }), c, 5, 's', 1.95, -0.25);
    L.wallPut(P.nightstand(), c, 5, 's', 0.38, 0.64);
  }
  {
    const [x, z] = L.wallPos(9, 1, 'n', 0.38, 0.64);
    fuse('fuse2', x, 0.622, z, 0.9);
    MK.fuse2 = V(x, 0.62, z);
  }
  hideLocker(1, 3, 'w'); hideLocker(9, 3, 'e');
  L.put(P.screen(), cx(3) + 0.2, cz(2) + 0.9, 0.15); L.put(P.screen(), cx(7) - 0.2, cz(4) - 0.7, 0.1);
  L.put(P.ivStand(), cx(2) + 0.7, cz(1) + 0.2); L.put(P.ivStand(), cx(6) + 0.75, cz(5) - 0.3); L.put(P.ivStand(), cx(8) + 0.7, cz(1) + 0.3);
  L.put(P.wheelchair(), cx(2) - 0.3, cz(4) - 0.3, 0.8); L.addCollider(cx(2) - 0.65, cz(4) - 0.65, cx(2) + 0.05, cz(4) + 0.05);
  scrawl('LIGHTS OUT\nNO SOUND', 7, 9, 4, 'e', 1.5, 1.7, -0.2);
  blood(5, 1, 'n', 1.2, 1.2, -0.2, 2); pool(cx(5) - 0.2, cz(1) + 0.9, 1.5, 1);
  O.wardLights = [
    L.addLight(cx(3), cz(3), { state: 'flicker', intensity: 0.7, tag: 'ward', rot: H }),
    L.addLight(cx(7), cz(3), { state: 'on', intensity: 0.6, tag: 'ward', rot: H }),
  ];
  for (const c of [2, 5, 8]) grime(cx(c), cz(3), 2.2);

  // =============================== NIGHT STATION ============================
  L.put(P.counter({ w: 4 }), cx(13), cz(3) + 0.3, 0);
  {
    const [x, z] = L.wallPos(12, 1, 'n', 0.75, 0.4);
    L.put(P.desk(), x, z, 0);
    L.put(P.chair(), x, z + 0.75, PI + 0.3);
    note('log', x - 0.1, 0.787, z + 0.05, 0.1);
    MK.log = V(x, 0.8, z);
  }
  L.wallPut(P.medCabinet(), 14, 2, 'e', 0.4); L.put(P.cart(), cx(11) + 0.1, cz(4) + 0.5, 0.4);
  L.wallPut(P.cabinet(), 11, 2, 'w', 0.6); L.wallPut(P.cabinet({ open: 3 }), 11, 2, 'w', 0.6, 0.55);
  battery('bat3', cx(13) + 0.6, 0.985, cz(3) + 0.3);
  L.wallPut(P.clock(), 14, 1, 'n', 0.05, 0, 2.2);
  O.nurseLight = L.addLight(cx(12) + 1, cz(3) - 1, { state: 'on', intensity: 0.6, color: 0xd8ffe4, tag: 'nurse' });

  // =============================== HYDROTHERAPY =============================
  for (const c of [17, 18, 19, 20]) L.put(P.stallWall(), c * CELL, cz(1) - 0.2, 0);
  for (let c = 16; c <= 20; c++) {
    L.wallPut(P.showerHead(), c, 1, 'n', 0.05);
    L.put(P.drain(), cx(c), cz(1) - 0.2);
    const p = new Parts(); p.cyl(M.steel, 0.012, 0.012, 1.96, 0, 2.02, 0, 0, 0, H, 6);
    L.put(p, cx(c), cz(1) + 0.62, 0);
    if (c < 20) { // tattered, half-drawn curtains
      const q = new Parts(); const w = 0.5 + ((c * 7) % 5) * 0.12;
      for (let i = 0; i < 4; i++) q.box(M.curtain, w / 4 + 0.02, 1.7 - (i % 2) * 0.12, 0.012, -0.9 + w / 8 + i * (w / 4), 1.15 + (i % 2) * 0.06, (i % 2) * 0.03);
      L.put(q, cx(c), cz(1) + 0.62, 0);
    }
  }
  {
    const p = new Parts();
    for (let i = 0; i < 12; i++) p.box(M.curtain, 0.17, 1.75, 0.012, -0.9 + 0.082 + i * 0.158, 1.13, (i % 2) * 0.035);
    O.curtain = L.dyn(p, cx(20), cz(1) + 0.62, 0);
    O.curtainCol = L.addCollider(cx(20) - 1, cz(1) + 0.55, cx(20) + 1, cz(1) + 0.7);
    MK.curtain = V(cx(20), 1.2, cz(1) + 0.62);
    O.curtainInteract = L.addInteract({ id: 'curtain', pos: MK.curtain, prompt: 'Pull back the curtain', radius: 1.9, use: (g) => g.events.pullCurtain() });
    MK.shower = V(cx(20), 1.9, cz(1) - 0.6);
    MK.bathKey = V(cx(20) + 0.2, 0.02, cz(1) - 0.1);
  }
  L.wallPut(P.sink(), 16, 3, 'w', 0.42); L.wallPut(P.sink(), 16, 4, 'w', 0.42); L.wallPut(P.sink(), 16, 5, 'w', 0.42, 0.2);
  const tub = (x, z, rot) => {
    const p = new Parts();
    p.box(M.porcelain, 1.9, 0.62, 0.85, 0, 0.31, 0);
    p.box(M.cloth, 1.84, 0.03, 0.8, 0, 0.635, 0);
    p.cyl(M.black, 0.11, 0.11, 0.034, 0.7, 0.636, 0, 0, 0, 0, 12);
    for (const sx of [-0.5, 0, 0.5]) p.box(M.woodDark, 0.05, 0.035, 0.9, sx, 0.64, 0);
    p.collider(0, 0, 1.9, 0.85, 0, 0.8); p.navBlock = true;
    L.put(p, x, z, rot);
  };
  tub(cx(19) + 0.6, cz(3) + 0.2, 0); tub(cx(19) + 0.6, cz(4) + 0.6, 0);
  blood(20, 1, 'n', 1.3, 1.1, 0, 3); pool(cx(20), cz(1) - 0.1, 1.5, 0); pool(cx(17), cz(3), 1.2, 2);
  scrawl('wash them\nquiet', 8, 20, 3, 'e', 1.2, 1.6);
  O.bathLight = L.addLight(cx(18), cz(3), { state: 'flicker', intensity: 0.7, color: 0xdcecff, tag: 'bath' });

  // =============================== ISOLATION ================================
  L.wallPut(P.bed({ bare: true }), 22, 2, 'w', 1.95);
  note('cellNote', cx(24) - 0.1, 0.012, cz(1) + 0.2, 0.7);
  battery('bat4', cx(24) + 0.3, 0.012, cz(2) - 0.2);
  scrawl('quiet quiet quiet\nquiet quiet\nquiet', 9, 23, 1, 'n', 1.7, 1.5);
  scrawl('|||| |||| ||||\n|||| |||| ||', 10, 24, 3, 'e', 1.3, 1.2, 0, 'rgba(200,190,170,0.6)');
  L.addLight(cx(23), cz(3), { state: 'dead', type: 'bulb', tag: 'iso' });
  // cell 2: hers
  scrawl('IF SHE STOPS\nHUMMING\nHIDE', 11, 27, 1, 'n', 1.6, 1.6);
  blood(26, 3, 'w', 1.4, 1.2, 0, 0); blood(28, 2, 'e', 1.2, 1.4, 0, 2); pool(cx(27), cz(3), 1.8, 1);
  L.decalWall(D.hands[0], 27, 5, 's', 0.9, 0.9, 1.2, 0.7);
  L.addLight(cx(27), cz(3), { state: 'dead', type: 'bulb', tag: 'iso' });
  MK.matronSpawn = V(cx(27), 0, cz(2));
  // cell 3: the watcher
  L.wallPut(P.bed({ bare: true }), 30, 2, 'w', 1.95);
  {
    const f = P.figure({ mat: M.cloth, armL: [0, 0, 0.05], armR: [0, 0, -0.05], h: 1.7, lean: 0.1 });
    const g = new THREE.Group();
    g.add(partsToObject(f.body)); const head = partsToObject(f.head); head.position.set(0, f.headY - 0.02, 0.03); g.add(head);
    g.position.set(cx(32) + 0.45, 0, cz(1) - 0.4); g.rotation.y = PI * 0.8;
    L.scene.add(g);
    O.cellFigure = { g, head };
    MK.peek = V(cx(31), 1.56, cz(6) - 0.16);
    O.peekInteract = L.addInteract({ id: 'peek', pos: V(cx(31), 1.5, cz(6) + 0.2), prompt: 'Look through the slot', radius: 1.7, use: (g2) => g2.events.peek() });
  }
  L.addLight(cx(31), cz(3), { state: 'dead', type: 'bulb', tag: 'iso3' });

  // =============================== STAIRWELLS ===============================
  L.put(P.stairs(), cx(35), cz(1), 0);
  L.addCollider(cx(35) - 1, cz(1) - 1, cx(35) + 1, cz(1) + 0.75);
  L.addInteract({ id: 'stairsDown', pos: V(cx(35), 1.0, cz(1) + 1.0), prompt: 'Descend to the basement', radius: 2.3, use: (g) => g.events.useStairs(true) });
  L.addLight(cx(35), cz(3) + 1, { state: 'flicker', intensity: 0.6, type: 'bulb', tag: 'stairs' });
  L.put(P.crate(), cx(34) - 0.5, cz(4) + 0.4, 0.3); L.put(P.boxes(), cx(36) + 0.3, cz(5) + 0.4, 1.2);
  L.decalWall(T.sign(['B'], { w: 128, h: 128, font: 'bold 90px Georgia', bg: '#16130f', fg: '#a8946a', seed: 3 }), 34, 1, 'w', 0.4, 0.4, 1.9);
  MK.groundArrive = V(cx(35), 0, cz(3));
  L.put(P.stairs({ up: true }), cx(2), cz(33), 0);
  L.addCollider(cx(2) - 1, cz(33) - 1, cx(2) + 1, cz(33) + 0.75);
  L.addInteract({ id: 'stairsUp', pos: V(cx(2), 1.0, cz(33) + 1.0), prompt: 'Climb to the ward floor', radius: 2.3, use: (g) => g.events.useStairs(false) });
  L.addLight(cx(2), cz(35) - 0.5, { state: 'on', intensity: 0.5, type: 'bulb', tag: 'stairsB' });
  MK.basementArrive = V(cx(2), 0, cz(34) + 0.6);

  // =============================== BASEMENT CORRIDOR ========================
  for (const [c, st, inten] of [[6, 'on', 0.4], [10, 'flicker', 0.5], [14, 'dead', 0], [18, 'flicker', 0.5], [21, 'on', 0.35]]) {
    L.addLight(cx(c), cz(34), { state: st, intensity: inten, type: 'bulb', tag: 'base', color: 0xffd8a0 });
  }
  for (let c = 5; c <= 33; c++) if (c !== 23) L.put(P.pipeRun({ len: 2, n: 3, valve: c % 6 === 0 }), cx(c), cz(34) - 0.78, 0, 2.72);
  for (let c = 5; c <= 33; c += 2) if (c !== 23) L.put(P.pipeRun({ len: 2, n: 1, r: 0.09 }), cx(c), cz(34) + 0.8, 0, 2.6);
  L.put(P.barrel(), cx(9) + 0.62, cz(34) + 0.62); L.put(P.barrel(), cx(12) - 0.2, cz(34) + 0.65);
  hideLocker(15, 34, 'n'); hideLocker(20, 34, 's');
  placard('MORTUARY', 9, 34, 'n', -0.6); placard('BOILER ROOM', 18, 34, 'n', -0.6); placard('GENERATOR', 11, 34, 's', -0.6); placard('LOADING BAY', 22, 34, 'n', 0.2);
  scrawl('she is\ndown here\ntoo', 12, 6, 34, 's', 1.2, 1.6);
  for (const c of [7, 11, 16, 20, 26, 30]) grime(cx(c), cz(34), 1.9);
  blood(19, 34, 'n', 1.2, 1.2, 0.3, 1);

  // =============================== MORGUE ===================================
  {
    const [bx, bz] = L.wallPos(8, 28, 'n', 0.5, 1.0);
    L.put(P.morgueWall({ n: 6 }), bx, bz, 0);
    const front = bz + 0.27;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      if (i === 4 && j === 1) continue;
      const p = P.morgueDoor();
      L.put(p, bx + (i - 2.5) * 0.82, front, 0, 0.45 + j * 0.7);
    }
    const g = new THREE.Group();
    const p = P.morgueDoor();
    p.box(M.steel, 0.68, 0.03, 1.9, 0, -0.26, -0.97);
    p.sphere(M.sheet, 1, 0, -0.14, -0.4, 0.11, 0.1, 0.12);
    p.sphere(M.sheet, 1, 0, -0.15, -0.9, 0.23, 0.1, 0.34);
    p.sphere(M.sheet, 1, 0, -0.17, -1.5, 0.17, 0.08, 0.4);
    p.box(M.sheet, 0.64, 0.02, 1.8, 0, -0.235, -0.97);
    g.add(partsToObject(p));
    // an arm that will swing out
    const arm = new THREE.Group();
    const ap = new Parts();
    ap.cyl(M.mannequin, 0.028, 0.024, 0.3, 0, -0.15, 0, 0, 0, 0, 7); ap.cyl(M.mannequin, 0.024, 0.02, 0.28, 0, -0.44, 0, 0, 0, 0, 7);
    ap.sphere(M.mannequin, 1, 0, -0.62, 0, 0.03, 0.06, 0.02);
    for (let i = 0; i < 4; i++) ap.cyl(M.mannequin, 0.006, 0.008, 0.09, -0.024 + i * 0.016, -0.7, 0, 0, 0, 0, 4);
    const armO = partsToObject(ap); arm.add(armO);
    arm.position.set(0.3, -0.2, -0.75); arm.rotation.z = H * 0.96; arm.visible = false;
    g.add(arm);
    const x = bx + (4 - 2.5) * 0.82, y = 0.45 + 0.7;
    g.position.set(x, y, front + 0.14);
    L.scene.add(g);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: L._glintTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5, fog: false }));
    gl.scale.setScalar(0.16); gl.position.set(-0.3, 0.1, 0.06); g.add(gl);
    O.drawer = { g, arm, glint: gl, x, y, z0: front + 0.14, slide: 0, opened: false };
    MK.drawer = V(x, y, front + 0.2);
    O.drawerInteract = L.addInteract({ id: 'drawer', pos: MK.drawer, prompt: 'Pull the drawer', radius: 2.0, use: (g2) => g2.events.openDrawer() });
    MK.drawerBehind = V(bx + (1 - 2.5) * 0.82, 0.45, front);
  }
  L.put(P.slab({ body: true }), cx(7), cz(30) + 0.7, 0);
  L.put(P.slab({ body: false }), cx(10) + 0.3, cz(30) + 0.9, 0);
  L.put(P.cart(), cx(8) + 0.6, cz(31) + 0.2, 0.3);
  L.wallPut(P.sink(), 6, 31, 'w', 0.42); L.wallPut(P.cabinet(), 6, 32, 'w', 0.6);
  note('coroner', cx(10) + 0.3, 0.908, cz(30) + 1.2, 0.3);
  L.put(P.gurney({ body: true }), cx(10) + 0.4, cz(32) + 0.45, H);
  L.put(P.drain(), cx(8) + 1, cz(30) + 0.5);
  pool(cx(7) + 0.7, cz(30) + 0.8, 1.6, 2); blood(6, 30, 'w', 1.3, 1.2, 0, 3);
  O.morgueLight = L.addLight(cx(8) + 1, cz(30), { state: 'flicker', intensity: 0.75, color: 0xcfe6ff, tag: 'morgue' });

  // =============================== BOILER ROOM ==============================
  L.put(P.boiler(), cx(16), cz(29) - 0.2, 0);
  {
    const [x, z, rot] = L.wallPos(19, 31, 'e', 1.0);
    L.put(P.furnace(), x, z, rot);
    const glow = new THREE.MeshBasicMaterial({ color: 0xff5a14 });
    O.furnaceGlow = glow;
    const p = new Parts(); p.box(glow, 0.6, 0.38, 0.02, 0, 0.6, 0.535);
    L.put(p, x, z, rot);
    O.furnaceLight = L.addLight(x - 0.9, z, { state: 'on', intensity: 0.5, color: 0xff6a20, tag: 'furnace', mesh: false, y: 1.6, range: 6 });
  }
  for (let c = 13; c <= 19; c++) { L.put(P.pipeRun({ len: 2, n: 2, valve: c === 14 || c === 18 }), cx(c), cz(31) + 0.3, 0, 2.6); }
  for (const r of [30, 31, 32]) L.put(P.pipeRun({ len: 2, n: 2, r: 0.08 }), cx(14) - 0.3, cz(r), H, 2.78);
  {
    const p = new Parts(); p.cyl(M.pipe, 0.08, 0.08, 3, 0, 1.5, 0, 0, 0, 0, 8); p.cyl(M.rust, 0.11, 0.11, 0.06, 0, 1.1, 0, 0, 0, 0, 8);
    L.put(p, cx(13) - 0.8, cz(32) + 0.8); L.put(p, cx(19) + 0.8, cz(28) - 0.8); L.put(p, cx(13) - 0.75, cz(28) - 0.8);
  }
  L.put(P.barrel(), cx(13) - 0.5, cz(31) + 0.3); L.put(P.barrel(), cx(13) - 0.45, cz(32) - 0.1);
  L.wallPut(P.shelf(), 15, 32, 's', 0.5, 0.3);
  battery('bat5', cx(13) - 0.5, 0.9, cz(31) + 0.3);
  MK.steam1 = V(cx(14) + 0.5, 1.4, cz(31) + 0.3); MK.steam2 = V(cx(18), 1.6, cz(31) + 0.3);
  L.addLight(cx(15), cz(31), { state: 'dead', type: 'bulb', tag: 'boiler' });
  grime(cx(15), cz(31), 2.6); grime(cx(18), cz(30), 2);

  // =============================== GENERATOR ROOM ===========================
  L.put(P.generator(), cx(11) + 0.6, cz(38) + 0.3, 0);
  MK.generator = V(cx(11) + 0.6, 0.8, cz(38) + 0.3);
  {
    const [x, z, rot] = L.wallPos(8, 37, 'w', 0.14);
    const p = new Parts();
    p.box(M.lockerDark, 0.9, 1.0, 0.14, 0, 1.45, 0);
    p.box(M.blackMetal, 0.5, 0.42, 0.02, -0.14, 1.58, 0.075);
    for (let i = 0; i < 3; i++) p.box(M.steel, 0.11, 0.05, 0.03, -0.3 + i * 0.16, 1.58, 0.085);
    p.box(M.yellowMetal, 0.5, 0.1, 0.01, -0.14, 1.2, 0.075);
    p.cyl(M.rubber, 0.03, 0.03, 1.2, 0.3, 2.4, 0, 0, 0, 0, 6);
    L.put(p, x, z, rot);
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; L.scene.add(g);
    const fuses = [];
    for (let i = 0; i < 3; i++) {
      const f = partsToObject(fusePart(), { shadow: false });
      f.position.set(-0.3 + i * 0.16, 1.58, 0.1); f.rotation.z = H; f.visible = false;
      g.add(f); fuses.push(f);
    }
    const lever = new THREE.Group();
    const lp = new Parts(); lp.box(M.redMetal, 0.04, 0.34, 0.04, 0, 0.17, 0); lp.sphere(M.blackMetal, 0.04, 0, 0.36, 0);
    lever.add(partsToObject(lp)); lever.position.set(0.3, 1.45, 0.1); lever.rotation.x = -0.6;
    g.add(lever);
    const lamp = new THREE.MeshBasicMaterial({ color: 0x300000 });
    const lm = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), lamp); lm.position.set(0.3, 1.82, 0.08); g.add(lm);
    const wp = V(x + Math.sin(rot) * 0.2, 1.5, z + Math.cos(rot) * 0.2);
    O.breaker = { fuses, lever, lamp, pos: wp, inserted: false, pulled: false };
    MK.breaker = wp;
    O.breakerInteract = L.addInteract({ id: 'breaker', pos: wp, prompt: () => (O.breaker.inserted ? 'Throw the breaker' : 'Insert the fuses'), radius: 2.1, use: (g2) => g2.events.useBreaker() });
  }
  L.put(P.crate(), cx(8) - 0.5, cz(39) + 0.4, 0.2);
  note('lastNote', cx(8) - 0.5, 0.705, cz(39) + 0.4, 0.4);
  L.put(P.barrel(), cx(13) + 0.6, cz(36) - 0.5); L.put(P.barrel(), cx(13) + 0.55, cz(36) + 0.15); L.put(P.barrel(), cx(12) + 0.9, cz(36) - 0.6);
  L.wallPut(P.shelf(), 9, 39, 's', 0.5, -0.4);
  O.genLight = L.addLight(cx(10) + 1, cz(37) + 0.6, { state: 'on', intensity: 0.9, type: 'bulb', tag: 'gen', color: 0xffd8a0 });
  grime(cx(10), cz(37), 2.4);
  scrawl('RUN', 13, 10, 36, 'n', 1.0, 1.9, -1.2);

  // =============================== TUNNEL + BAY =============================
  for (const c of [8, 13, 18, 25, 28, 31]) L.addLight(cx(c) + 0.5, cz(34) + 0.3, { state: 'off', intensity: 1.0, type: 'cage', tag: 'alarm', color: 0xff2414 });
  L.put(P.barrel(), cx(26) + 0.6, cz(34) + 0.64); L.put(P.pallet(), cx(29), cz(34) + 0.4, 0.2); L.put(P.barrel(), cx(32) - 0.3, cz(34) - 0.66);
  scrawl('NO ONE LEAVES', 14, 28, 34, 'n', 1.9, 1.6);
  L.put(P.crate(), cx(34) - 0.5, cz(31) - 0.5); L.put(P.crate({ s: 0.6 }), cx(34) - 0.5, cz(31) - 0.5, 0.4, 0.7); L.put(P.crate(), cx(35) - 0.6, cz(31) - 0.55, 0.2);
  L.put(P.crate(), cx(37) + 0.5, cz(31) - 0.5, 0.1); L.put(P.pallet(), cx(36), cz(32), 0.3); L.put(P.barrel(), cx(34) - 0.6, cz(36) + 0.6); L.put(P.barrel(), cx(35) - 0.9, cz(36) + 0.62);
  L.put(P.gurney(), cx(36) + 0.4, cz(36) + 0.3, H + 0.3);
  L.put(P.boxes(), cx(37) + 0.3, cz(36) + 0.4, 2);
  {
    const [x, z, rot] = L.wallPos(37, 33, 'e', 0.08, 0.55);
    const p = new Parts();
    p.box(M.yellowMetal, 0.26, 0.4, 0.08, 0, 1.35, 0);
    L.put(p, x, z, rot);
    const btn = new THREE.MeshBasicMaterial({ color: 0x400000 });
    const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12), btn);
    bm.rotation.z = H; bm.position.set(x - 0.06, 1.4, z); L.scene.add(bm);
    O.shutterBtn = btn;
    MK.shutterBtn = V(x - 0.1, 1.35, z);
    O.shutterInteract = L.addInteract({ id: 'shutterBtn', pos: MK.shutterBtn, prompt: 'Open the shutter', radius: 2.1, use: (g) => g.events.pressShutter() });
  }
  for (const [x, z] of [[cx(35), cz(32)], [cx(36), cz(35)]]) L.addLight(x, z, { state: 'off', intensity: 1.0, type: 'cage', tag: 'alarm', color: 0xff2414 });
  L.addLight(cx(35) + 1, cz(33) + 1, { state: 'dead', type: 'bulb', tag: 'bay' });
  {
    // the outside: a cold, wet night
    const c = texUtil.mk(64, 256), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#020408'); gr.addColorStop(0.5, '#0a1220'); gr.addColorStop(0.62, '#18222e'); gr.addColorStop(0.66, '#05080a'); gr.addColorStop(1, '#010202');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), new THREE.MeshBasicMaterial({ map: t, fog: false }));
    m.position.set(cx(38) + 9, 3.2, cz(34)); m.rotation.y = -H; L.scene.add(m);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), new THREE.MeshStandardMaterial({ color: 0x0a0c0e, roughness: 0.3 }));
    ground.rotation.x = -H; ground.position.set(cx(38) + 6, -0.01, cz(34)); L.scene.add(ground);
  }
  MK.exit = V(cx(38) + 0.4, 0, cz(34));
  MK.gate = V(cx(23), 0, cz(34));

  // decorative ceiling height reference
  MK.ceil = WALL_H;
}
