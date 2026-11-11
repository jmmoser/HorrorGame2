// Prop builders. Each returns a Parts list in local space.
// Convention: the prop's back is at -z, it faces +z. Origin on the floor.
import * as THREE from '../vendor/three.module.min.js';
import { Parts } from './build.js';

const PI = Math.PI, H = PI / 2;

export function makeProps(T) {
  const M = T.mats;
  const P = {};
  const rodX = (p, mat, r, len, x, y, z) => p.cyl(mat, r, r, len, x, y, z, 0, 0, H, 8);
  const rodZ = (p, mat, r, len, x, y, z) => p.cyl(mat, r, r, len, x, y, z, H, 0, 0, 8);
  const rodY = (p, mat, r, len, x, y, z) => p.cyl(mat, r, r, len, x, y + len / 2, z, 0, 0, 0, 8);

  // ---- ward ---------------------------------------------------------------
  P.bed = ({ body = false, sheet = true, bare = false, child = false } = {}) => {
    const p = new Parts();
    const w = child ? 0.8 : 0.95, l = child ? 1.6 : 1.95;
    for (const sx of [-1, 1]) {
      rodY(p, M.enamel, 0.025, 1.1, sx * (w / 2 - 0.02), 0, -l / 2 + 0.02);
      rodY(p, M.enamel, 0.025, 0.82, sx * (w / 2 - 0.02), 0, l / 2 - 0.02);
      rodZ(p, M.enamel, 0.02, l, sx * (w / 2 - 0.02), 0.36, 0);
    }
    rodX(p, M.enamel, 0.022, w, 0, 1.08, -l / 2 + 0.02); rodX(p, M.enamel, 0.018, w, 0, 0.62, -l / 2 + 0.02);
    rodX(p, M.enamel, 0.022, w, 0, 0.8, l / 2 - 0.02);
    for (let i = -2; i <= 2; i++) { rodY(p, M.enamel, 0.012, 0.46, i * w * 0.17, 0.62, -l / 2 + 0.02); }
    for (let i = -2; i <= 2; i++) { rodY(p, M.enamel, 0.012, 0.4, i * w * 0.17, 0.4, l / 2 - 0.02); }
    p.box(M.rust, w - 0.06, 0.03, l - 0.06, 0, 0.36, 0);
    p.box(M.mattress, w - 0.08, 0.14, l - 0.1, 0, 0.45, 0);
    if (!bare) {
      p.box(M.sheetClean, 0.5, 0.09, 0.32, 0, 0.56, -l / 2 + 0.26, 0, 0.1);
      if (sheet) {
        p.box(M.sheet, w - 0.02, 0.05, l * 0.72, 0, 0.535, l * 0.12);
        p.box(M.sheet, w + 0.02, 0.3, 0.02, 0, 0.4, l / 2 - 0.08);
        p.box(M.sheet, 0.02, 0.22, l * 0.7, w / 2, 0.43, l * 0.12);
        p.box(M.sheet, 0.02, 0.26, l * 0.7, -w / 2, 0.41, l * 0.12);
      }
    }
    if (body) {
      p.sphere(M.sheet, 1, 0, 0.6, -l / 2 + 0.3, 0.13, 0.12, 0.15);
      p.sphere(M.sheet, 1, 0, 0.58, -0.25, 0.26, 0.13, 0.36);
      p.sphere(M.sheet, 1, 0, 0.56, 0.35, 0.2, 0.1, 0.5);
      p.sphere(M.sheet, 1, 0.06, 0.6, l / 2 - 0.2, 0.09, 0.11, 0.07);
      p.box(M.sheet, w + 0.02, 0.04, l - 0.1, 0, 0.54, 0);
    }
    p.collider(0, 0, w, l, 0, 1.0);
    p.navBlock = true;
    return p;
  };

  P.nightstand = () => {
    const p = new Parts();
    p.box(M.enamel, 0.42, 0.62, 0.38, 0, 0.31, 0);
    p.box(M.steelDark, 0.36, 0.02, 0.01, 0, 0.45, 0.195);
    p.box(M.steelDark, 0.1, 0.02, 0.03, 0, 0.52, 0.2);
    p.collider(0, 0, 0.42, 0.38, 0, 0.7);
    return p;
  };

  P.ivStand = () => {
    const p = new Parts();
    rodY(p, M.steel, 0.012, 1.8, 0, 0, 0);
    for (let i = 0; i < 4; i++) rodX(p.push(0, 0.03, 0, i * H), M.steel, 0.012, 0.3, 0.15, 0, 0) && p.pop();
    rodX(p, M.steel, 0.008, 0.3, 0, 1.78, 0);
    p.box(M.glass, 0.1, 0.18, 0.04, 0.13, 1.62, 0);
    return p;
  };

  P.screen = () => { // folding privacy screen
    const p = new Parts();
    for (let i = 0; i < 3; i++) {
      p.push(-0.7 + i * 0.7, 0, 0, i % 2 ? 0.35 : -0.35);
      rodY(p, M.enamel, 0.015, 1.7, -0.33, 0, 0); rodY(p, M.enamel, 0.015, 1.7, 0.33, 0, 0);
      p.box(M.curtain, 0.64, 1.3, 0.01, 0, 1.0, 0);
      p.pop();
    }
    p.collider(0, 0, 2.0, 0.3, 0, 1.8);
    return p;
  };

  P.wheelchair = () => {
    const p = new Parts();
    p.box(M.cloth, 0.46, 0.04, 0.44, 0, 0.5, 0);
    p.box(M.cloth, 0.46, 0.46, 0.03, 0, 0.78, -0.22, -0.08);
    for (const sx of [-1, 1]) {
      p.torus(M.rubber, 0.3, 0.02, sx * 0.29, 0.3, -0.06, 0, H, 0, 18);
      p.torus(M.steel, 0.26, 0.008, sx * 0.31, 0.3, -0.06, 0, H, 0, 14);
      for (let i = 0; i < 6; i++) p.cyl(M.steel, 0.004, 0.004, 0.58, sx * 0.29, 0.3, -0.06, (i * PI) / 6, 0, 0, 4);
      p.torus(M.rubber, 0.075, 0.018, sx * 0.22, 0.08, 0.36, 0, H, 0, 10);
      rodY(p, M.steel, 0.012, 0.5, sx * 0.24, 0.08, 0.3);
      rodY(p, M.steel, 0.012, 0.75, sx * 0.24, 0.3, -0.24);
      rodZ(p, M.steel, 0.012, 0.56, sx * 0.24, 0.66, 0.02);
      rodZ(p, M.rubber, 0.018, 0.12, sx * 0.24, 1.03, -0.3);
      p.box(M.steelDark, 0.12, 0.015, 0.16, sx * 0.14, 0.16, 0.42, 0.3);
    }
    return p;
  };

  P.gurney = ({ body = false } = {}) => {
    const p = new Parts();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      rodY(p, M.steel, 0.018, 0.72, sx * 0.3, 0.08, sz * 0.8);
      p.torus(M.rubber, 0.06, 0.02, sx * 0.3, 0.07, sz * 0.8, 0, H, 0, 8);
    }
    for (const sx of [-1, 1]) rodZ(p, M.steel, 0.015, 1.9, sx * 0.3, 0.8, 0);
    rodX(p, M.steel, 0.012, 0.6, 0, 0.35, 0.8); rodX(p, M.steel, 0.012, 0.6, 0, 0.35, -0.8);
    p.box(M.steelDark, 0.64, 0.03, 1.9, 0, 0.8, 0);
    p.box(M.rubber, 0.6, 0.06, 1.8, 0, 0.845, 0);
    if (body) {
      p.sphere(M.sheet, 1, 0, 0.95, -0.7, 0.12, 0.11, 0.13);
      p.sphere(M.sheet, 1, 0, 0.94, -0.2, 0.25, 0.12, 0.36);
      p.sphere(M.sheet, 1, 0, 0.92, 0.4, 0.19, 0.09, 0.48);
      p.box(M.sheet, 0.66, 0.03, 1.84, 0, 0.885, 0);
      p.box(M.sheet, 0.68, 0.3, 0.02, 0, 0.75, 0.92);
    }
    p.collider(0, 0, 0.66, 1.9, 0, 1.0);
    p.navBlock = true;
    return p;
  };

  // ---- furniture ----------------------------------------------------------
  P.desk = ({ w = 1.5 } = {}) => {
    const p = new Parts();
    p.box(M.wood, w, 0.05, 0.75, 0, 0.76, 0);
    p.box(M.woodDark, 0.42, 0.7, 0.7, -w / 2 + 0.23, 0.36, 0);
    p.box(M.woodDark, 0.42, 0.7, 0.7, w / 2 - 0.23, 0.36, 0);
    p.box(M.woodDark, w - 0.1, 0.5, 0.03, 0, 0.5, -0.34);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
      p.box(M.wood, 0.36, 0.19, 0.02, sx * (w / 2 - 0.23), 0.14 + i * 0.22, 0.355);
      p.box(M.steelDark, 0.1, 0.02, 0.02, sx * (w / 2 - 0.23), 0.14 + i * 0.22, 0.375);
    }
    p.collider(0, 0, w, 0.75, 0, 0.85);
    p.navBlock = true;
    return p;
  };

  P.chair = ({ fallen = false } = {}) => {
    const p = new Parts();
    if (fallen) p.push(0, 0.22, 0, 0, -H * 0.98);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rodY(p, M.woodDark, 0.02, sz < 0 ? 0.95 : 0.45, sx * 0.19, 0, sz * 0.19);
    p.box(M.wood, 0.44, 0.04, 0.44, 0, 0.46, 0);
    p.box(M.wood, 0.42, 0.14, 0.03, 0, 0.86, -0.19);
    p.box(M.wood, 0.42, 0.06, 0.03, 0, 0.66, -0.19);
    if (fallen) p.pop();
    p.collider(0, fallen ? -0.3 : 0, 0.44, fallen ? 0.9 : 0.44, 0, 0.9);
    return p;
  };

  P.cabinet = ({ open = 0 } = {}) => { // filing cabinet
    const p = new Parts();
    p.box(M.lockerDark, 0.48, 1.35, 0.6, 0, 0.675, 0);
    for (let i = 0; i < 4; i++) {
      const out = i === open - 1 ? 0.3 : 0;
      p.box(M.locker, 0.44, 0.29, 0.02 + out, 0, 0.19 + i * 0.32, 0.305 + out / 2);
      p.box(M.steel, 0.14, 0.025, 0.025, 0, 0.24 + i * 0.32, 0.325 + out);
      p.box(M.paper, 0.09, 0.05, 0.005, 0, 0.14 + i * 0.32, 0.317 + out);
    }
    p.collider(0, 0, 0.48, 0.6, 0, 1.4);
    return p;
  };

  P.bookshelf = ({ w = 1.2, h = 2.0, books = true } = {}) => {
    const p = new Parts();
    p.box(M.woodDark, 0.04, h, 0.34, -w / 2, h / 2, 0); p.box(M.woodDark, 0.04, h, 0.34, w / 2, h / 2, 0);
    p.box(M.woodDark, w, h, 0.02, 0, h / 2, -0.16);
    const n = Math.floor(h / 0.4);
    let seed = 1;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i <= n; i++) {
      const y = 0.04 + (i * (h - 0.08)) / n;
      p.box(M.wood, w, 0.03, 0.33, 0, y, 0);
      if (books && i < n) {
        let x = -w / 2 + 0.08;
        while (x < w / 2 - 0.1) {
          const bw = 0.03 + r() * 0.05, bh = 0.2 + r() * 0.12;
          if (r() < 0.72) p.box(r() < 0.5 ? M.cloth : r() < 0.5 ? M.woodDark : M.lockerDark, bw, bh, 0.2, x + bw / 2, y + 0.015 + bh / 2, 0.02, 0, 0, (r() - 0.5) * 0.12);
          x += bw + 0.004 + (r() < 0.1 ? 0.12 : 0);
        }
      }
    }
    p.collider(0, 0, w, 0.36, 0, h);
    return p;
  };

  P.shelf = ({ w = 1.8, boxes = true } = {}) => { // metal storage racking
    const p = new Parts();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(M.rust, 0.04, 2.2, 0.04, sx * (w / 2 - 0.02), 1.1, sz * 0.22);
    let seed = 7;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 4; i++) {
      const y = 0.15 + i * 0.62;
      p.box(M.steelDark, w, 0.025, 0.48, 0, y, 0);
      if (boxes) {
        let x = -w / 2 + 0.1;
        while (x < w / 2 - 0.3) {
          const bw = 0.25 + r() * 0.3, bh = 0.18 + r() * 0.3;
          if (r() < 0.75) p.box(r() < 0.6 ? M.woodLight : M.cloth, bw, bh, 0.36, x + bw / 2, y + 0.012 + bh / 2, (r() - 0.5) * 0.06, 0, (r() - 0.5) * 0.2);
          else if (r() < 0.5) p.cyl(M.glass, 0.06, 0.06, 0.2, x + 0.1, y + 0.11, 0);
          x += bw + 0.05;
        }
      }
    }
    p.collider(0, 0, w, 0.5, 0, 2.2);
    p.navBlock = true;
    return p;
  };

  P.crate = ({ s = 0.7 } = {}) => {
    const p = new Parts();
    p.box(M.woodLight, s, s, s, 0, s / 2, 0);
    for (const sy of [0.08, s - 0.08]) { p.box(M.wood, s + 0.03, 0.09, s + 0.03, 0, sy, 0); }
    p.collider(0, 0, s, s, 0, s);
    return p;
  };

  P.boxes = () => {
    const p = new Parts();
    p.box(M.woodLight, 0.5, 0.36, 0.42, 0, 0.18, 0, 0, 0.2);
    p.box(M.woodLight, 0.44, 0.3, 0.38, 0.03, 0.51, 0.02, 0, -0.15);
    p.box(M.woodLight, 0.36, 0.28, 0.3, 0.5, 0.14, 0.12, 0, 0.5);
    p.collider(0.12, 0.03, 0.9, 0.55, 0, 0.7);
    return p;
  };

  P.barrel = () => {
    const p = new Parts();
    p.cyl(M.rust, 0.29, 0.29, 0.88, 0, 0.44, 0, 0, 0, 0, 14);
    for (const y of [0.04, 0.3, 0.58, 0.85]) p.cyl(M.steelDark, 0.3, 0.3, 0.03, 0, y, 0, 0, 0, 0, 14);
    p.collider(0, 0, 0.56, 0.56, 0, 0.9);
    return p;
  };

  P.bench = () => {
    const p = new Parts();
    p.box(M.wood, 1.7, 0.05, 0.42, 0, 0.45, 0);
    p.box(M.wood, 1.7, 0.36, 0.04, 0, 0.78, -0.2, -0.1);
    for (const sx of [-1, 1]) { p.box(M.woodDark, 0.05, 0.45, 0.4, sx * 0.78, 0.225, 0); p.box(M.woodDark, 0.05, 0.55, 0.05, sx * 0.78, 0.7, -0.2); }
    p.collider(0, 0, 1.7, 0.45, 0, 0.9);
    return p;
  };

  P.reception = () => { // long counter, 3.6m wide
    const p = new Parts();
    p.box(M.woodDark, 3.6, 1.05, 0.12, 0, 0.525, 0.3);
    p.box(M.wood, 3.7, 0.05, 0.5, 0, 1.07, 0.12);
    p.box(M.wood, 3.5, 0.04, 0.6, 0, 0.74, -0.2);
    for (const sx of [-1, 1]) p.box(M.woodDark, 0.1, 1.05, 0.9, sx * 1.8, 0.525, -0.1);
    for (let i = -3; i <= 3; i++) p.box(M.wood, 0.03, 0.9, 0.02, i * 0.5, 0.5, 0.37);
    p.collider(0, 0.05, 3.7, 0.95, 0, 1.2);
    p.navBlock = true;
    return p;
  };

  P.plant = () => {
    const p = new Parts();
    p.cyl(M.rust, 0.2, 0.15, 0.36, 0, 0.18, 0, 0, 0, 0, 10);
    let seed = 3;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 7; i++) {
      const a = r() * 6.28, t = 0.2 + r() * 0.5, len = 0.5 + r() * 0.7;
      p.push(0, 0.36, 0, a, t);
      p.cyl(M.woodDark, 0.004, 0.012, len, 0, len / 2, 0, 0, 0, 0, 4);
      p.pop();
    }
    p.collider(0, 0, 0.4, 0.4, 0, 1.2);
    return p;
  };

  P.couch = () => {
    const p = new Parts();
    p.box(M.cloth, 1.8, 0.4, 0.8, 0, 0.22, 0);
    p.box(M.cloth, 1.8, 0.5, 0.2, 0, 0.62, -0.32, -0.12);
    for (const sx of [-1, 1]) p.box(M.cloth, 0.2, 0.6, 0.8, sx * 0.85, 0.32, 0);
    p.box(M.sheet, 0.75, 0.1, 0.6, -0.38, 0.47, 0.06); p.box(M.sheet, 0.75, 0.1, 0.6, 0.38, 0.47, 0.06);
    p.collider(0, 0, 1.8, 0.8, 0, 0.9);
    p.navBlock = true;
    return p;
  };

  P.armchair = () => {
    const p = new Parts();
    p.box(M.cloth, 0.8, 0.4, 0.76, 0, 0.22, 0);
    p.box(M.cloth, 0.8, 0.55, 0.18, 0, 0.66, -0.3, -0.15);
    for (const sx of [-1, 1]) p.box(M.cloth, 0.16, 0.58, 0.76, sx * 0.36, 0.31, 0);
    p.collider(0, 0, 0.8, 0.76, 0, 0.9);
    return p;
  };

  P.table = ({ r = 0.55, h = 0.72 } = {}) => {
    const p = new Parts();
    p.cyl(M.wood, r, r, 0.04, 0, h, 0, 0, 0, 0, 18);
    p.cyl(M.woodDark, 0.05, 0.05, h, 0, h / 2, 0);
    p.cyl(M.woodDark, 0.3, 0.3, 0.03, 0, 0.015, 0, 0, 0, 0, 12);
    p.collider(0, 0, r * 1.5, r * 1.5, 0, h + 0.1);
    return p;
  };

  P.tvStand = () => { // CRT television on a trolley; screen quad added by the level
    const p = new Parts();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rodY(p, M.steelDark, 0.015, 0.9, sx * 0.34, 0, sz * 0.22);
    p.box(M.steelDark, 0.76, 0.03, 0.52, 0, 0.9, 0); p.box(M.steelDark, 0.76, 0.03, 0.52, 0, 0.3, 0);
    p.box(M.woodDark, 0.72, 0.56, 0.5, 0, 1.2, 0);
    p.box(M.blackMetal, 0.6, 0.46, 0.02, -0.03, 1.2, 0.25);
    p.box(M.steel, 0.05, 0.3, 0.02, 0.31, 1.2, 0.255);
    rodY(p, M.steel, 0.004, 0.5, -0.1, 1.48, -0.1); p.cyl(M.steel, 0.004, 0.004, 0.5, 0.12, 1.7, -0.1, 0, 0, -0.5, 4);
    p.collider(0, 0, 0.76, 0.52, 0, 1.5);
    p.navBlock = true;
    return p;
  };

  P.radiator = () => {
    const p = new Parts();
    for (let i = -5; i <= 5; i++) p.box(M.enamel, 0.07, 0.6, 0.14, i * 0.09, 0.42, 0);
    rodX(p, M.rust, 0.02, 1.1, 0, 0.14, 0);
    rodY(p, M.rust, 0.02, 0.14, 0.52, 0, 0);
    p.collider(0, 0, 1.05, 0.16, 0, 0.8);
    return p;
  };

  P.clock = () => {
    const p = new Parts();
    p.cyl(M.woodDark, 0.19, 0.19, 0.05, 0, 0, 0, H, 0, 0, 20);
    p.cyl(M.paper, 0.165, 0.165, 0.052, 0, 0, 0.002, H, 0, 0, 20);
    p.box(M.black, 0.012, 0.11, 0.004, 0.02, 0.04, 0.03, 0, 0, -0.4);
    p.box(M.black, 0.01, 0.15, 0.004, -0.045, 0.045, 0.03, 0, 0, 0.75);
    return p;
  };

  P.frame = (mat, w = 0.6, h = 0.75) => {
    const p = new Parts();
    p.box(M.woodDark, w + 0.08, h + 0.08, 0.03, 0, 0, 0);
    p.plane(mat, w, h, 0, 0, 0.017);
    return p;
  };

  // ---- lockers --------------------------------------------------------------
  P.lockerShell = () => {
    const p = new Parts();
    const w = 0.62, d = 0.56, h = 2.0;
    p.box(M.lockerDark, w, h, 0.02, 0, h / 2, -d / 2 + 0.01);
    p.box(M.lockerDark, 0.02, h, d, -w / 2 + 0.01, h / 2, 0); p.box(M.lockerDark, 0.02, h, d, w / 2 - 0.01, h / 2, 0);
    p.box(M.lockerDark, w, 0.03, d, 0, h - 0.015, 0); p.box(M.lockerDark, w, 0.08, d, 0, 0.04, 0);
    p.collider(0, 0, w, d, 0, h);
    return p;
  };
  P.lockerDoor = () => { // hinge at local x=0, door extends +x, front face at z=0
    const p = new Parts();
    const w = 0.6, h = 1.9;
    p.box(M.locker, w, h, 0.02, w / 2, h / 2 + 0.08, 0);
    for (let i = 0; i < 6; i++) p.box(M.blackMetal, w * 0.6, 0.014, 0.01, w / 2, 1.5 + i * 0.045, 0.012);
    for (let i = 0; i < 4; i++) p.box(M.blackMetal, w * 0.6, 0.014, 0.01, w / 2, 0.3 + i * 0.045, 0.012);
    p.box(M.steel, 0.03, 0.12, 0.03, w - 0.07, 1.05, 0.02);
    return p;
  };
  P.locker = () => {
    const p = P.lockerShell();
    p.push(-0.3, 0, 0.27); p.list.push(...P.lockerDoor().list.map((q) => ({ ...q, m: p.top.clone().multiply(q.m) }))); p.pop();
    return p;
  };

  // ---- bathroom -------------------------------------------------------------
  P.sink = () => {
    const p = new Parts();
    p.box(M.porcelain, 0.56, 0.16, 0.42, 0, 0.82, 0.0);
    p.box(M.glassDark, 0.42, 0.02, 0.28, 0, 0.9, 0.02);
    rodY(p, M.rust, 0.03, 0.74, 0, 0, -0.08);
    rodY(p, M.steel, 0.012, 0.12, 0, 0.9, -0.15); rodZ(p, M.steel, 0.012, 0.12, 0, 1.02, -0.1);
    p.box(M.woodDark, 0.5, 0.66, 0.025, 0, 1.55, -0.2);
    p.box(M.glassDark, 0.44, 0.6, 0.01, 0, 1.55, -0.185);
    p.collider(0, 0, 0.56, 0.42, 0, 1.0);
    return p;
  };

  P.stallWall = ({ len = 1.6 } = {}) => {
    const p = new Parts();
    p.box(M.enamel, 0.05, 1.9, len, 0, 1.05, 0);
    rodY(p, M.steel, 0.02, 0.12, 0, 0, len / 2 - 0.1); rodY(p, M.steel, 0.02, 0.12, 0, 0, -len / 2 + 0.1);
    p.collider(0, 0, 0.08, len, 0, 2.0);
    return p;
  };

  P.showerHead = () => {
    const p = new Parts();
    rodY(p, M.rust, 0.015, 2.1, 0, 0, 0);
    rodZ(p, M.rust, 0.015, 0.3, 0, 2.1, 0.15);
    p.cyl(M.steel, 0.07, 0.02, 0.07, 0, 2.06, 0.3, 0, 0, 0, 10);
    p.torus(M.steel, 0.05, 0.012, 0, 1.1, 0.02, 0, 0, 0, 10);
    return p;
  };

  P.drain = () => { const p = new Parts(); p.cyl(M.blackMetal, 0.1, 0.1, 0.012, 0, 0.006, 0, 0, 0, 0, 12); return p; };

  // ---- toys ---------------------------------------------------------------
  P.blocks = () => {
    const p = new Parts();
    const mats = [M.redMetal, M.yellowMetal, M.locker, M.woodLight];
    let seed = 11;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 9; i++) p.box(mats[i % 4], 0.11, 0.11, 0.11, (r() - 0.5) * 0.9, 0.055, (r() - 0.5) * 0.9, 0, r() * 3);
    p.box(mats[0], 0.11, 0.11, 0.11, 0, 0.165, 0, 0, 0.4);
    return p;
  };

  P.rockingHorse = () => {
    const p = new Parts();
    p.box(M.woodLight, 0.22, 0.26, 0.7, 0, 0.62, 0);
    p.box(M.woodLight, 0.14, 0.36, 0.16, 0, 0.88, 0.32, 0.5);
    p.box(M.woodLight, 0.12, 0.14, 0.32, 0, 1.02, 0.5, 0.25);
    p.box(M.black, 0.125, 0.03, 0.03, 0, 1.06, 0.52);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(M.woodLight, 0.05, 0.5, 0.06, sx * 0.1, 0.3, sz * 0.26, sz * 0.25);
    for (const sx of [-1, 1]) p.torus(M.redMetal, 0.75, 0.025, sx * 0.14, 0.78, 0, 0, H, PI + 0.95, 14, 1.25);
    p.box(M.redMetal, 0.24, 0.03, 0.3, 0, 0.76, -0.02);
    p.cyl(M.woodDark, 0.01, 0.01, 0.34, 0, 0.74, -0.42, 0.6);
    return p;
  };

  P.toyChest = () => {
    const p = new Parts();
    p.box(M.redMetal, 0.9, 0.45, 0.5, 0, 0.225, 0);
    p.box(M.yellowMetal, 0.92, 0.04, 0.52, 0, 0.5, -0.12, -0.5);
    p.collider(0, 0, 0.9, 0.5, 0, 0.6);
    return p;
  };

  P.doll = () => {
    const p = new Parts();
    p.sphere(M.porcelain, 0.07, 0, 0.36, 0, 1, 1.1, 1);
    p.sphere(M.cloth, 1, 0, 0.2, 0, 0.08, 0.13, 0.07);
    p.sphere(M.black, 0.014, -0.028, 0.37, 0.06); p.sphere(M.black, 0.014, 0.028, 0.37, 0.06);
    for (const sx of [-1, 1]) {
      p.cyl(M.porcelain, 0.015, 0.02, 0.2, sx * 0.05, 0.05, 0.1, H * 0.9, 0, sx * 0.2, 6);
      p.cyl(M.porcelain, 0.012, 0.016, 0.16, sx * 0.1, 0.2, 0.02, 0, 0, sx * 0.5, 6);
    }
    return p;
  };

  P.musicBoxTable = () => {
    const p = new Parts();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rodY(p, M.woodLight, 0.02, 0.5, sx * 0.3, 0, sz * 0.22);
    p.box(M.woodLight, 0.72, 0.03, 0.54, 0, 0.51, 0);
    p.box(M.woodDark, 0.2, 0.09, 0.14, 0, 0.57, 0);
    p.box(M.woodDark, 0.2, 0.015, 0.14, 0, 0.67, -0.07, -1.1);
    p.cyl(M.porcelain, 0.012, 0.022, 0.08, 0, 0.66, 0.0, 0, 0, 0, 6);
    p.collider(0, 0, 0.72, 0.54, 0, 0.7);
    return p;
  };

  // ---- nurse / medical -------------------------------------------------------
  P.counter = ({ w = 2 } = {}) => {
    const p = new Parts();
    p.box(M.enamel, w, 0.95, 0.6, 0, 0.475, 0);
    p.box(M.steel, w + 0.04, 0.03, 0.64, 0, 0.965, 0);
    for (let x = -w / 2 + 0.25; x < w / 2; x += 0.5) p.box(M.steelDark, 0.03, 0.14, 0.02, x, 0.6, 0.31);
    p.collider(0, 0, w, 0.6, 0, 1.0);
    p.navBlock = true;
    return p;
  };

  P.medCabinet = () => {
    const p = new Parts();
    p.box(M.enamel, 0.9, 1.8, 0.4, 0, 0.9, 0);
    p.box(M.glass, 0.38, 0.8, 0.01, -0.21, 1.3, 0.205); p.box(M.glass, 0.38, 0.8, 0.01, 0.21, 1.3, 0.205);
    p.box(M.steelDark, 0.02, 1.7, 0.02, 0, 0.9, 0.21);
    let seed = 5;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 10; i++) p.cyl(M.rust, 0.025, 0.025, 0.07 + r() * 0.06, -0.35 + r() * 0.7, 1.0 + (i % 3) * 0.26, 0.12, 0, 0, 0, 6);
    p.collider(0, 0, 0.9, 0.4, 0, 1.8);
    return p;
  };

  P.cart = () => {
    const p = new Parts();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rodY(p, M.steel, 0.012, 0.8, sx * 0.28, 0.05, sz * 0.18);
    p.box(M.steel, 0.62, 0.02, 0.42, 0, 0.82, 0); p.box(M.steel, 0.62, 0.02, 0.42, 0, 0.4, 0);
    p.box(M.steelDark, 0.2, 0.02, 0.12, -0.1, 0.84, 0);
    p.cyl(M.glass, 0.03, 0.03, 0.1, 0.18, 0.88, 0.05); p.cyl(M.rust, 0.035, 0.035, 0.07, 0.2, 0.445, -0.05);
    p.collider(0, 0, 0.62, 0.42, 0, 0.9);
    return p;
  };

  // ---- morgue ---------------------------------------------------------------
  P.morgueWall = ({ n = 2 } = {}) => { // bank of drawers n wide x 3 tall, each bay 0.8m
    const p = new Parts();
    const w = n * 0.82 + 0.1;
    p.box(M.steelDark, w, 2.25, 0.5, 0, 1.125, 0);
    p.collider(0, 0, w, 0.5, 0, 2.3);
    return p;
  };
  P.morgueDoor = () => {
    const p = new Parts();
    p.box(M.steel, 0.74, 0.64, 0.04, 0, 0, 0);
    p.box(M.steelDark, 0.08, 0.24, 0.05, 0.25, 0, 0.04);
    p.box(M.paper, 0.12, 0.07, 0.005, -0.18, 0.2, 0.023);
    return p;
  };
  P.slab = ({ body = true } = {}) => { // autopsy table
    const p = new Parts();
    p.box(M.steel, 0.8, 0.05, 2.0, 0, 0.88, 0);
    for (const sx of [-1, 1]) p.box(M.steel, 0.03, 0.05, 2.0, sx * 0.4, 0.92, 0);
    p.cyl(M.steelDark, 0.14, 0.2, 0.86, 0, 0.43, -0.5, 0, 0, 0, 10); p.cyl(M.steelDark, 0.14, 0.2, 0.86, 0, 0.43, 0.5, 0, 0, 0, 10);
    if (body) {
      p.sphere(M.sheet, 1, 0, 1.0, -0.75, 0.12, 0.11, 0.13);
      p.sphere(M.sheet, 1, 0, 0.99, -0.25, 0.26, 0.12, 0.36);
      p.sphere(M.sheet, 1, 0, 0.97, 0.4, 0.2, 0.09, 0.5);
      p.sphere(M.sheet, 1, 0.05, 1.0, 0.86, 0.08, 0.1, 0.06);
      p.box(M.sheet, 0.76, 0.03, 1.9, 0, 0.93, 0);
    }
    p.collider(0, 0, 0.8, 2.0, 0, 1.1);
    p.navBlock = true;
    return p;
  };

  // ---- industrial -----------------------------------------------------------
  P.boiler = () => {
    const p = new Parts();
    p.cyl(M.rust, 0.95, 0.95, 3.2, 0, 1.25, 0, 0, 0, H, 18);
    for (const x of [-1.5, -0.75, 0, 0.75, 1.5]) p.cyl(M.pipe, 0.98, 0.98, 0.07, x, 1.25, 0, 0, 0, H, 18);
    p.sphere(M.rust, 0.95, -1.6, 1.25, 0, 0.35, 1, 1); p.sphere(M.rust, 0.95, 1.6, 1.25, 0, 0.35, 1, 1);
    p.box(M.blackMetal, 0.7, 0.3, 1.2, -1, 0.15, 0); p.box(M.blackMetal, 0.7, 0.3, 1.2, 1, 0.15, 0);
    p.box(M.blackMetal, 0.6, 0.5, 0.1, 0, 0.9, 0.93);
    p.cyl(M.steel, 0.09, 0.09, 0.04, 0.9, 1.6, 0.86, H * 0.8, 0, 0, 12);
    p.cyl(M.paper, 0.075, 0.075, 0.045, 0.9, 1.6, 0.865, H * 0.8, 0, 0, 12);
    rodY(p, M.pipe, 0.09, 1.2, -0.9, 2.1, 0); rodY(p, M.pipe, 0.06, 1.2, 0.6, 2.1, -0.2);
    p.torus(M.redMetal, 0.12, 0.018, 0.6, 2.5, -0.05, 0, 0, 0, 10);
    p.collider(0, 0, 3.7, 1.9, 0, 2.4);
    p.navBlock = true;
    return p;
  };

  P.furnace = () => {
    const p = new Parts();
    p.box(M.blackMetal, 1.4, 1.9, 1.0, 0, 0.95, 0);
    p.box(M.rust, 0.7, 0.5, 0.06, 0, 0.6, 0.52);
    for (let i = -3; i <= 3; i++) p.box(M.blackMetal, 0.03, 0.4, 0.03, i * 0.09, 0.6, 0.56);
    rodY(p, M.pipe, 0.16, 1.2, 0, 1.9, -0.1);
    p.collider(0, 0, 1.4, 1.0, 0, 2.0);
    p.navBlock = true;
    return p;
  };

  P.generator = () => {
    const p = new Parts();
    p.box(M.blackMetal, 2.2, 0.25, 1.1, 0, 0.125, 0);
    p.box(M.yellowMetal, 1.2, 0.95, 0.9, -0.4, 0.72, 0);
    p.cyl(M.steelDark, 0.42, 0.42, 0.8, 0.7, 0.72, 0, 0, 0, H, 14);
    p.cyl(M.rust, 0.46, 0.46, 0.08, 0.3, 0.72, 0, 0, 0, H, 14);
    for (let i = 0; i < 6; i++) p.box(M.blackMetal, 0.02, 0.6, 0.7, -0.85 + i * 0.12, 0.74, 0.11);
    rodY(p, M.pipe, 0.06, 1.7, -0.7, 1.2, -0.3);
    p.box(M.redMetal, 0.25, 0.2, 0.2, -0.2, 1.3, 0.2);
    p.cyl(M.rubber, 0.03, 0.03, 1.6, 0.5, 0.2, 0.6, 0, 0.6, H, 6);
    p.collider(0, 0, 2.2, 1.1, 0, 1.4);
    p.navBlock = true;
    return p;
  };

  P.pipeRun = ({ len = 2, r = 0.06, n = 2, valve = false } = {}) => { // along x, hung under ceiling
    const p = new Parts();
    for (let i = 0; i < n; i++) {
      p.cyl(i % 2 ? M.pipe : M.rust, r * (1 - i * 0.25), r * (1 - i * 0.25), len, 0, -i * 0.02, i * (r * 2.6), 0, 0, H, 8);
    }
    p.box(M.blackMetal, 0.03, 0.2, r * 2.6 * n + 0.05, 0, 0.1, r * 1.3 * (n - 1));
    if (valve) { p.torus(M.redMetal, 0.09, 0.014, 0.3, -0.14, 0, H, 0, 0, 10); rodY(p, M.steel, 0.012, 0.14, 0.3, -0.14, 0); }
    return p;
  };

  P.ductRun = ({ len = 2 } = {}) => {
    const p = new Parts();
    p.box(M.steelDark, len, 0.3, 0.45, 0, 0, 0);
    p.box(M.steel, 0.04, 0.33, 0.48, 0, 0, 0);
    return p;
  };

  P.stairs = ({ up = false } = {}) => { // flight filling a 2m cell footprint, going away along -z
    const p = new Parts();
    const n = 8;
    for (let i = 0; i < n; i++) {
      const y = up ? (i + 1) * 0.2 : -(i) * 0.2;
      p.box(M.steelDark, 1.9, 0.2, 0.3, 0, y - 0.1, 0.85 - i * 0.26);
    }
    for (const sx of [-1, 1]) {
      p.cyl(M.rust, 0.02, 0.02, 2.6, sx * 0.9, up ? 1.7 : 0.15, -0.1, up ? -0.92 : 0.92, 0, 0, 6);
      rodY(p, M.rust, 0.02, 0.95, sx * 0.9, 0, 0.95);
    }
    if (!up) { p.box(M.black, 1.96, 1.8, 0.02, 0, -0.9, -1.0); p.box(M.black, 0.02, 1.8, 2.0, -0.98, -0.9, 0); p.box(M.black, 0.02, 1.8, 2.0, 0.98, -0.9, 0); p.box(M.black, 1.96, 0.02, 2.0, 0, -1.8, 0); }
    else p.box(M.black, 1.9, 1.6, 0.02, 0, 2.2, -1.02);
    return p;
  };

  P.ambulanceCot = () => P.gurney({ body: false });

  P.pallet = () => {
    const p = new Parts();
    for (let i = -2; i <= 2; i++) p.box(M.woodLight, 0.18, 0.025, 1.1, i * 0.24, 0.13, 0);
    for (const z of [-0.5, 0, 0.5]) p.box(M.wood, 1.15, 0.1, 0.1, 0, 0.06, z);
    return p;
  };

  // Humanoid dummy. Returns {body: Parts, head: Parts, headY}
  P.figure = ({ mat = M.mannequin, armL = [0, 0, 0.08], armR = [0, 0, -0.08], h = 1.78, lean = 0 } = {}) => {
    const p = new Parts();
    const s = h / 1.78;
    p.push(0, 0, 0, 0, lean);
    for (const sx of [-1, 1]) {
      p.cyl(mat, 0.075 * s, 0.055 * s, 0.45 * s, sx * 0.095 * s, 0.675 * s, 0, 0, 0, 0, 8);
      p.cyl(mat, 0.055 * s, 0.04 * s, 0.42 * s, sx * 0.095 * s, 0.25 * s, 0, 0, 0, 0, 8);
      p.box(mat, 0.08 * s, 0.05 * s, 0.22 * s, sx * 0.095 * s, 0.025 * s, 0.05 * s);
    }
    p.sphere(mat, 1, 0, 0.95 * s, 0, 0.165 * s, 0.11 * s, 0.11 * s);
    p.sphere(mat, 1, 0, 1.25 * s, 0, 0.175 * s, 0.26 * s, 0.115 * s);
    p.cyl(mat, 0.04 * s, 0.05 * s, 0.1 * s, 0, 1.53 * s, 0, 0, 0, 0, 8);
    for (const [sx, a] of [[-1, armL], [1, armR]]) {
      p.push(sx * 0.2 * s, 1.43 * s, 0, 0, a[0], a[2]);
      p.sphere(mat, 0.055 * s, 0, 0, 0);
      p.cyl(mat, 0.045 * s, 0.035 * s, 0.3 * s, 0, -0.16 * s, 0, 0, 0, 0, 7);
      p.push(0, -0.31 * s, 0, 0, a[1] || 0, 0);
      p.cyl(mat, 0.035 * s, 0.028 * s, 0.28 * s, 0, -0.14 * s, 0, 0, 0, 0, 7);
      p.sphere(mat, 1, 0, -0.33 * s, 0, 0.03 * s, 0.06 * s, 0.022 * s);
      p.pop(); p.pop();
    }
    p.pop();
    const head = new Parts();
    head.sphere(mat, 1, 0, 0.04 * s, 0.01 * s, 0.085 * s, 0.115 * s, 0.1 * s, 0, 14, 10);
    return { body: p, head, headY: 1.6 * s };
  };

  return P;
}

export { THREE as _THREE };
