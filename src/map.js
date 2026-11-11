// Level layout, navigation grid, line of sight and pathfinding.
// One cell = 2m. Ground floor occupies the top rows, the basement the bottom rows.

export const CELL = 2;
export const WALL_H = 3.0;

// Lowercase = floor (letter is the zone), '#' = solid, uppercase = door.
export const MAP = [
  '########################################', // 0
  '#wwwwwwwww#nnnn#bbbbb#iii#iii#iii#xxx###', // 1
  '#wwwwwwwww#nnnn#bbbbb#iii#iii#iii#xxx###', // 2
  '#wwwwwwwww#nnnn#bbbbb#iii#iii#iii#xxx###', // 3
  '#wwwwwwwww#nnnn#bbbbb#iii#iii#iii#xxx###', // 4
  '#wwwwwwwww#nnnn#bbbbb#iii#iii#iii#xxx###', // 5
  '####W#######N#####B####I###J###K###X####', // 6
  '#cccccccccccccccccccccccccccccccccccc###', // 7
  '###c###########A#########c##############', // 8
  '###c###########c#########c##############', // 9
  '###c#sssssssss#c#ppppppp#c##############', // 10
  '###cSsssssssss#c#pppppppQc##############', // 11
  '###c#sssssssssTc#ppppppp#c##############', // 12
  '#####sssssssss#c#ppppppp################', // 13
  '###############c####P###################', // 14
  '#########ooooo#c#yyyyyyy################', // 15
  '#########ooooo#c#yyyyyyy################', // 16
  '#########oooooOcYyyyyyyy################', // 17
  '#########ooooo#c#yyyyyyy################', // 18
  '###############c########################', // 19
  '###########lllllllll####################', // 20
  '###########lllllllll####################', // 21
  '###########lllllllll####################', // 22
  '###########lllllllll####################', // 23
  '###########lllllllll####################', // 24
  '###############F########################', // 25
  '########################################', // 26
  '########################################', // 27
  '######mmmmmm#kkkkkkk####################', // 28
  '######mmmmmm#kkkkkkk####################', // 29
  '######mmmmmmVkkkkkkk####################', // 30
  '######mmmmmm#kkkkkkk##############eeee##', // 31
  '######mmmmmm#kkkkkkk##############eeee##', // 32
  '#xxx####M########H################eeee##', // 33
  '#xxxUttttttttttttttttttZtttttttttteeeeE#', // 34
  '#xxx######G#######################eeee##', // 35
  '########gggggg####################eeee##', // 36
  '########gggggg####################eeee##', // 37
  '########gggggg##########################', // 38
  '########gggggg##########################', // 39
  '########################################', // 40
];

export const COLS = MAP[0].length;
export const ROWS = MAP.length;
for (const r of MAP) if (r.length !== COLS) throw new Error('Bad map row: ' + r);

export const BASEMENT_ROW = 27; // rows >= this are the basement

// Door definitions. key: item id required; bar: side ('w','e','n','s') it can be unbarred from.
export const DOORS = {
  F: { name: 'front', kind: 'front', sealed: true },
  O: { name: 'office' },
  Y: { name: 'dayroom' },
  P: { name: 'playroom' },
  T: { name: 'storageEast' },
  S: { name: 'storageWest', bar: 'w' },
  Q: { name: 'playroomEast', bar: 'e' },
  A: { name: 'ward', key: 'wardKey', kind: 'double' },
  W: { name: 'wardA' },
  N: { name: 'nurse' },
  B: { name: 'bath' },
  I: { name: 'iso1', kind: 'cell' },
  J: { name: 'iso2', kind: 'cell', sealed: true },
  K: { name: 'iso3', kind: 'cell', sealed: true },
  X: { name: 'stairs', key: 'basementKey', kind: 'metal' },
  U: { name: 'stairsB', kind: 'metal' },
  M: { name: 'morgue', kind: 'metal' },
  V: { name: 'morgueBoiler', kind: 'metal' },
  H: { name: 'boiler', kind: 'metal' },
  G: { name: 'generator', kind: 'metal' },
  Z: { name: 'gate', kind: 'gate', sealed: true },
  E: { name: 'shutter', kind: 'shutter', sealed: true },
};

export const ZONE_NAMES = {
  l: 'lobby', c: 'corridor', o: 'office', s: 'storage', y: 'dayroom', p: 'playroom',
  w: 'ward', n: 'nurse', b: 'bath', i: 'iso', x: 'stairs', t: 'tunnel', m: 'morgue',
  k: 'boiler', g: 'generator', e: 'bay',
};

export const idx = (c, r) => r * COLS + c;
export const inBounds = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
export const charAt = (c, r) => (inBounds(c, r) ? MAP[r][c] : '#');
export const isDoorChar = (ch) => ch >= 'A' && ch <= 'Z';
export const isFloorChar = (ch) => ch >= 'a' && ch <= 'z';
export const isOpenChar = (ch) => ch !== '#';
export const cellX = (c) => (c + 0.5) * CELL;
export const cellZ = (r) => (r + 0.5) * CELL;
export const toCol = (x) => Math.floor(x / CELL);
export const toRow = (z) => Math.floor(z / CELL);

// Zone of a cell; doors inherit from a neighbouring floor cell.
export function zoneAt(c, r) {
  const ch = charAt(c, r);
  if (isFloorChar(ch)) return ch;
  if (isDoorChar(ch)) {
    const order = [[0, 1], [0, -1], [-1, 0], [1, 0]];
    let found = null;
    for (const [dc, dr] of order) {
      const n = charAt(c + dc, r + dr);
      if (isFloorChar(n)) { if (n === 'c' || n === 't') return n; found = found || n; }
    }
    return found || 'c';
  }
  return null;
}

// Door passage axis: 'x' if you walk through it along x, else 'z'.
export function doorAxis(c, r) {
  return isOpenChar(charAt(c - 1, r)) || isOpenChar(charAt(c + 1, r)) ? 'x' : 'z';
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
export class Nav {
  constructor() {
    this.solid = new Uint8Array(COLS * ROWS);     // walls
    this.blocked = new Uint8Array(COLS * ROWS);   // props that block AI pathing
    this.doorAt = new Array(COLS * ROWS).fill(null); // Door objects (set by level)
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) this.solid[idx(c, r)] = MAP[r][c] === '#' ? 1 : 0;
  }

  walkable(c, r) {
    if (!inBounds(c, r)) return false;
    const i = idx(c, r);
    return !this.solid[i] && !this.blocked[i];
  }

  // Can the AI route through this cell? Sealed/locked doors are impassable.
  passable(c, r) {
    if (!this.walkable(c, r)) return false;
    const d = this.doorAt[idx(c, r)];
    if (d && !d.open && !d.aiCanOpen()) return false;
    return true;
  }

  // Line of sight on the grid (walls and closed doors block).
  los(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return true;
    let c = toCol(x0), r = toRow(z0);
    const c1 = toCol(x1), r1 = toRow(z1);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(CELL / dx) : Infinity;
    const tdz = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
    let tmx = dx !== 0 ? ((dx > 0 ? (c + 1) * CELL - x0 : x0 - c * CELL) / Math.abs(dx)) : Infinity;
    let tmz = dz !== 0 ? ((dz > 0 ? (r + 1) * CELL - z0 : z0 - r * CELL) / Math.abs(dz)) : Infinity;
    for (let n = 0; n < 200; n++) {
      if (c === c1 && r === r1) return true;
      if (tmx < tmz) { tmx += tdx; c += sx; } else { tmz += tdz; r += sz; }
      if (!inBounds(c, r) || this.solid[idx(c, r)]) return false;
      const d = this.doorAt[idx(c, r)];
      if (d && d.blocksSight()) {
        if (!(c === c1 && r === r1)) return false;
      }
    }
    return false;
  }

  // Straight walk check for path smoothing (walls, blocked cells and closed doors).
  clearWalk(x0, z0, x1, z1) {
    const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      for (const [ox, oz] of [[0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) {
        const c = toCol(x + ox), r = toRow(z + oz);
        if (!this.walkable(c, r)) return false;
        const d = this.doorAt[idx(c, r)];
        if (d) return false; // always path through door cell centres
      }
    }
    return true;
  }

  // A* over cells. Returns array of {x,z} world points (cell centres) or null.
  findPath(x0, z0, x1, z1) {
    const sc = toCol(x0), sr = toRow(z0);
    let gc = toCol(x1), gr = toRow(z1);
    if (!inBounds(sc, sr) || !inBounds(gc, gr)) return null;
    if (!this.passable(gc, gr)) {
      // nearest passable neighbour
      let best = null, bd = 1e9;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        if (this.passable(gc + dc, gr + dr)) {
          const d = Math.hypot(cellX(gc + dc) - x1, cellZ(gr + dr) - z1);
          if (d < bd) { bd = d; best = [gc + dc, gr + dr]; }
        }
      }
      if (!best) return null;
      [gc, gr] = best;
    }
    const start = idx(sc, sr), goal = idx(gc, gr);
    const N = COLS * ROWS;
    const g = new Float32Array(N).fill(Infinity);
    const f = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open = [start];
    g[start] = 0;
    f[start] = Math.abs(sc - gc) + Math.abs(sr - gr);
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.42], [1, -1, 1.42], [-1, 1, 1.42], [-1, -1, 1.42]];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1]; open.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cc = cur % COLS, cr = (cur / COLS) | 0;
      const curDoor = this.doorAt[cur];
      for (const [dc, dr, cost] of dirs) {
        const nc = cc + dc, nr = cr + dr;
        if (!this.passable(nc, nr) && idx(nc, nr) !== start) continue;
        const ni = idx(nc, nr);
        if (closed[ni]) continue;
        if (dc !== 0 && dr !== 0) {
          // no corner cutting, no diagonals through doors
          if (!this.passable(cc + dc, cr) || !this.passable(cc, cr + dr)) continue;
          if (curDoor || this.doorAt[ni] || this.doorAt[idx(cc + dc, cr)] || this.doorAt[idx(cc, cr + dr)]) continue;
        }
        const ng = g[cur] + cost + (this.doorAt[ni] && !this.doorAt[ni].open ? 1.5 : 0);
        if (ng < g[ni]) {
          g[ni] = ng;
          f[ni] = ng + Math.hypot(nc - gc, nr - gr);
          came[ni] = cur;
          open.push(ni);
        }
      }
    }
    if (came[goal] === -1 && goal !== start) return null;
    const cells = [];
    let cur = goal;
    while (cur !== -1 && cur !== start) { cells.push(cur); cur = came[cur]; }
    cells.reverse();
    const pts = cells.map((i) => ({ x: cellX(i % COLS), z: cellZ((i / COLS) | 0), cell: i }));
    return pts;
  }

  // Path length in metres (Infinity if unreachable).
  pathLength(x0, z0, x1, z1) {
    const p = this.findPath(x0, z0, x1, z1);
    if (!p) return Infinity;
    let len = 0, px = x0, pz = z0;
    for (const n of p) { len += Math.hypot(n.x - px, n.z - pz); px = n.x; pz = n.z; }
    return len;
  }
}
