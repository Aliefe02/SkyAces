// Procedural city in the middle of the map. Deterministic, so the server (missile and
// bot collisions) and every client (rendering, crash checks) build the exact same city.
import { CONFIG } from './config.js';
import { groundHeight } from './terrain.js';

const C = CONFIG.CITY;
export const CITY_HALF = C && C.enabled ? (C.blocks * C.block) / 2 : 0;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// buildings: { x, z, w, d, h, base, style } — x/z center, w along X, d along Z, h height above base
export const buildings = [];
export const parks = [];          // { x, z, size }
const cellLists = new Map();      // block index -> building indices
const cellMax = new Map();        // block index -> tallest roof in that block

function addBuilding(b, bi, bj) {
  const idx = buildings.length;
  buildings.push(b);
  const key = bi * 1000 + bj;
  if (!cellLists.has(key)) cellLists.set(key, []);
  cellLists.get(key).push(idx);
  cellMax.set(key, Math.max(cellMax.get(key) || 0, b.base + b.h));
}

if (C && C.enabled) {
  const rnd = rng(9001);
  const B = C.block, R = C.road;
  const n = C.blocks;
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cx = -CITY_HALF + (i + 0.5) * B;
      const cz = -CITY_HALF + (j + 0.5) * B;
      const r = Math.hypot(cx, cz);
      const downtown = Math.exp(-((r / 1300) ** 2));      // 1 in the center, fades out
      const midtown = Math.exp(-((r / 2600) ** 2));
      const lot = B - R;                                   // buildable square inside the roads

      // the landmark tower in the very center
      if (i === Math.floor(mid) && j === Math.floor(mid)) {
        addBuilding({ x: cx, z: cz, w: 62, d: 62, h: 640, base: C.ground, style: 3 }, i, j);
        continue;
      }
      if (rnd() < 0.05 + 0.08 * (1 - midtown)) { parks.push({ x: cx, z: cz, size: lot }); continue; }

      // split the block into 1, 2 or 4 lots
      const roll = rnd();
      const split = downtown > 0.5 ? (roll < 0.55 ? 1 : 2) : roll < 0.25 ? 1 : roll < 0.6 ? 2 : 4;
      const subs = [];
      if (split === 1) subs.push([0, 0, lot, lot]);
      else if (split === 2) {
        const alongX = rnd() < 0.5;
        for (const s of [-1, 1]) subs.push(alongX ? [s * lot / 4, 0, lot / 2, lot] : [0, s * lot / 4, lot, lot / 2]);
      } else for (const sx of [-1, 1]) for (const sz of [-1, 1]) subs.push([sx * lot / 4, sz * lot / 4, lot / 2, lot / 2]);

      for (const [ox, oz, lw, ld] of subs) {
        const fill = 0.62 + rnd() * 0.3;
        const w = lw * fill, d = ld * (0.62 + rnd() * 0.3);
        const jx = (lw - w) * (rnd() - 0.5) * 0.6, jz = (ld - d) * (rnd() - 0.5) * 0.6;
        const t = rnd();
        let h = 12 + t * t * (30 + 110 * midtown + 300 * downtown);
        if (downtown > 0.25 && rnd() < 0.06 * downtown) h = 330 + rnd() * 220; // occasional skyscraper
        const style = h > 160 ? (rnd() < 0.5 ? 0 : 1) : h > 50 ? (rnd() < 0.7 ? 1 : 2) : 2;
        addBuilding({ x: cx + ox + jx, z: cz + oz + jz, w, d, h, base: C.ground, style }, i, j);
      }
    }
  }
}

function blockIndex(x, z) {
  if (!CITY_HALF) return null;
  const i = Math.floor((x + CITY_HALF) / C.block), j = Math.floor((z + CITY_HALF) / C.block);
  if (i < 0 || j < 0 || i >= C.blocks || j >= C.blocks) return null;
  return i * 1000 + j;
}

// Roof height of the building at (x, z), or 0 if there is none.
export function buildingTop(x, z) {
  const key = blockIndex(x, z);
  if (key === null) return 0;
  const list = cellLists.get(key);
  if (!list) return 0;
  for (const idx of list) {
    const b = buildings[idx];
    if (Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2) return b.base + b.h;
  }
  return 0;
}

// Highest solid surface at (x, z): terrain, sea level or a rooftop.
export function obstacleHeight(x, z) {
  return Math.max(groundHeight(x, z), buildingTop(x, z));
}

// Tallest thing anywhere in the city block around (x, z) — conservative, for AI look-ahead.
export function obstacleHeightNear(x, z) {
  const key = blockIndex(x, z);
  const roof = key === null ? 0 : cellMax.get(key) || 0;
  return Math.max(groundHeight(x, z), roof);
}
