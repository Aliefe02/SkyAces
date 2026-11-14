// Deterministic procedural terrain. Server and client compute identical heights,
// so ground collisions for missiles (server) and jets (client) match the visuals.

import { CONFIG } from './config.js';

const SEED = 1337;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const perm = new Uint8Array(512);
(() => {
  const rnd = mulberry32(SEED);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
})();

const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

// 2D simplex noise in [-1, 1]
export function simplex2(xin, yin) {
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s), j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const x0 = xin - (i - t), y0 = yin - (j - t);
  const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;
  let n = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) { const g = GRAD[perm[ii + perm[jj]] & 7]; t0 *= t0; n += t0 * t0 * (g[0] * x0 + g[1] * y0); }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) { const g = GRAD[perm[ii + i1 + perm[jj + j1]] & 7]; t1 *= t1; n += t1 * t1 * (g[0] * x1 + g[1] * y1); }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) { const g = GRAD[perm[ii + 1 + perm[jj + 1]] & 7]; t2 *= t2; n += t2 * t2 * (g[0] * x2 + g[1] * y2); }
  return 70 * n;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Raw terrain height (can be below sea level = water).
export function terrainHeight(x, z) {
  // continent mask: land in the middle-ish, sea toward the far edges + a few bays
  const d = Math.hypot(x, z) / 15000;
  const cont = simplex2(x * 0.00006 + 11.3, z * 0.00006 - 4.1) * 0.5 + 0.55 - d * d * 0.9;

  // rolling hills
  let h = 0, amp = 1, freq = 0.00035;
  for (let o = 0; o < 4; o++) {
    h += simplex2(x * freq, z * freq) * amp;
    amp *= 0.5; freq *= 2.03;
  }

  // ridged mountains
  let m = 0; amp = 1; freq = 0.00018;
  for (let o = 0; o < 4; o++) {
    const n = 1 - Math.abs(simplex2(x * freq + 50, z * freq - 70));
    m += n * n * amp;
    amp *= 0.5; freq *= 2.1;
  }
  const mountainMask = smoothstep(0.15, 0.6, simplex2(x * 0.00011 - 20, z * 0.00011 + 9) * 0.5 + 0.5);

  const land = smoothstep(0.0, 0.35, cont);
  let height = (h * 110 + 140) * land + m * 1150 * mountainMask * land - (1 - land) * 160 + 20;

  // flatten the ground under the city, blending back into the hills around it
  const C = CONFIG.CITY;
  if (C && C.enabled) {
    const half = (C.blocks * C.block) / 2 + 150;
    const edge = Math.max(Math.abs(x), Math.abs(z));
    const k = smoothstep(half, half + C.blend, edge);
    height = C.ground + (height - C.ground) * k;
  }
  return height;
}

// Height of the solid surface (water counts as the floor at sea level).
export function groundHeight(x, z) {
  return Math.max(0, terrainHeight(x, z));
}
