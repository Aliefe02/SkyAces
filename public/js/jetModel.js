// Procedural jet builder. One generic builder turns the parameters in shared/jets.js
// (fuselage cross-sections, wing planforms, tail layout, intakes, nozzles, paint)
// into a 3D model, so new jets are just new data.
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

const DARK = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.9, metalness: 0.1, side: THREE.DoubleSide });
const NOZZLE = new THREE.MeshStandardMaterial({ color: 0x3b3d40, roughness: 0.45, metalness: 0.85 });
const NOZZLE_INNER = new THREE.MeshBasicMaterial({ color: 0x1a0d05, side: THREE.DoubleSide });
const HELMET = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.6 });
const MISSILE_MAT = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.5, metalness: 0.2 });
const VISOR = new THREE.MeshStandardMaterial({ color: 0x1a1408, roughness: 0.1, metalness: 0.9 });
const SEAT = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.8 });
const FRAME = new THREE.MeshStandardMaterial({ color: 0x3c4046, roughness: 0.6, metalness: 0.4 });
const SENSOR = new THREE.MeshStandardMaterial({ color: 0x0a1a20, roughness: 0.05, metalness: 0.9 });
const PETALS = new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 0.5, metalness: 0.8, flatShading: true, side: THREE.DoubleSide });
const TANK = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.5, metalness: 0.3 });
const DIAMOND_GEO = new THREE.SphereGeometry(1, 12, 8);

const textureCache = new Map();

// ------------------------------------------------------------------ paint
// Draws the color map and a matching roughness map (panel lines, worn patches and
// exhaust soot are rougher/darker), so the skin reads as painted metal up close.
function paintTexture(def) {
  if (textureCache.has(def.id)) return textureCache.get(def.id);
  const S = 1024;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const c = mk(), rc = mk();
  const g = c.getContext('2d'), r = rc.getContext('2d');
  const paint = def.model.paint;
  const [base, dark, light, extra] = paint.colors;
  let seed = def.id.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  g.fillStyle = base; g.fillRect(0, 0, S, S);
  r.fillStyle = 'rgb(140,140,140)'; r.fillRect(0, 0, S, S);

  if (paint.scheme === 'twotone') {
    // soft blotches of a second grey (F-16 / F-15 style)
    for (let i = 0; i < 26; i++) {
      g.fillStyle = dark; g.globalAlpha = 0.55;
      g.beginPath();
      const x = rnd() * S, y = rnd() * S, rr = 60 + rnd() * 140;
      g.ellipse(x, y, rr, rr * (0.4 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  } else if (paint.scheme === 'splinter') {
    // angular multi-tone splinter camo (Sukhoi / MiG style)
    const cols = [dark, light, extra || dark, dark];
    for (let i = 0; i < 90; i++) {
      g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.9;
      g.beginPath();
      const cx = rnd() * S, cy = rnd() * S, rr = 40 + rnd() * 120;
      const n = 3 + Math.floor(rnd() * 3);
      const a0 = rnd() * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        const a = a0 + (k / n) * Math.PI * 2 + rnd() * 0.6;
        const rad = rr * (0.5 + rnd());
        const px = cx + Math.cos(a) * rad * 1.8, py = cy + Math.sin(a) * rad * 0.7;
        k === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.closePath(); g.fill();
    }
  } else if (paint.scheme === 'stealth') {
    // dark stealth coating with lighter radar-absorbent panels and sawtooth edges (F-35 / F-22)
    for (let i = 0; i < 70; i++) {
      const x = rnd() * S, y = rnd() * S, w = 30 + rnd() * 140, h = 20 + rnd() * 90;
      g.fillStyle = rnd() < 0.6 ? light : dark; g.globalAlpha = 0.35 + rnd() * 0.3;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k <= 6; k++) g.lineTo(x + (k / 6) * w, y + (k % 2 ? 8 : 0));
      g.lineTo(x + w, y + h);
      for (let k = 6; k >= 0; k--) g.lineTo(x + (k / 6) * w, y + h + (k % 2 ? 8 : 0));
      g.closePath(); g.fill();
      r.fillStyle = 'rgba(190,190,190,0.5)'; r.fillRect(x, y, w, h);
    }
  } else {
    // subtle tonal variation
    for (let i = 0; i < 40; i++) {
      g.fillStyle = i % 2 ? dark : light; g.globalAlpha = 0.12;
      g.fillRect(rnd() * S, rnd() * S, 80 + rnd() * 200, 40 + rnd() * 120);
    }
  }
  g.globalAlpha = 1;

  // weathering: faint grime streaks running aft
  for (let i = 0; i < 60; i++) {
    const x = rnd() * S, y = rnd() * S, w = 2 + rnd() * 6, h = 30 + rnd() * 120;
    g.fillStyle = 'rgba(40,40,40,0.05)'; g.fillRect(x, y, w, h);
    r.fillStyle = 'rgba(200,200,200,0.25)'; r.fillRect(x, y, w, h);
  }
  // exhaust soot near the tail (top view: v = (z + 11) / 22, canvas is flipped)
  const L = def.model.length;
  const yTail = (1 - (L / 2 + 11) / 22) * S, ySoot = (1 - (L / 2 - 3 + 11) / 22) * S;
  const grd = g.createLinearGradient(0, ySoot, 0, yTail);
  grd.addColorStop(0, 'rgba(25,20,15,0)'); grd.addColorStop(1, 'rgba(25,20,15,0.45)');
  g.fillStyle = grd; g.fillRect(0, yTail, S, ySoot - yTail);
  r.fillStyle = 'rgba(220,220,220,0.4)'; r.fillRect(0, yTail, S, ySoot - yTail);

  // panel lines (drawn into both maps)
  for (let i = 0; i < 90; i++) {
    const x = rnd() * S, y = rnd() * S, len = (rnd() - 0.5) * 300, horiz = rnd() < 0.5;
    for (const [ctx, col, wdt] of [[g, 'rgba(18,22,26,0.4)', 1.3], [r, 'rgba(235,235,235,0.9)', 2]]) {
      ctx.strokeStyle = col; ctx.lineWidth = wdt;
      ctx.beginPath(); ctx.moveTo(x, y);
      horiz ? ctx.lineTo(x + len, y) : ctx.lineTo(x, y + len);
      ctx.stroke();
    }
  }
  // access panels (small rectangles)
  for (let i = 0; i < 40; i++) {
    const x = rnd() * S, y = rnd() * S, w = 12 + rnd() * 40, h = 12 + rnd() * 30;
    g.strokeStyle = 'rgba(18,22,26,0.35)'; g.lineWidth = 1; g.strokeRect(x, y, w, h);
    r.strokeStyle = 'rgba(230,230,230,0.8)'; r.lineWidth = 1.5; r.strokeRect(x, y, w, h);
  }
  // rivet dots
  g.fillStyle = 'rgba(30,34,38,0.25)';
  for (let i = 0; i < 1600; i++) g.fillRect(rnd() * S, rnd() * S, 1.5, 1.5);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const rough = new THREE.CanvasTexture(rc);
  rough.anisotropy = 8;
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
  const out = { map: tex, rough };
  textureCache.set(def.id, out);
  return out;
}

// Tail markings: a colored stripe across the top of the fin plus a code / number.
function tailDecalTexture(def) {
  const key = def.id + ':tail';
  if (textureCache.has(key)) return textureCache.get(key);
  const T = def.model.tail || {};
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  if (T.stripe) {
    g.fillStyle = T.stripe; g.fillRect(0, 18, 512, 46);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 64, 512, 4);
  }
  if (def.model.insignia === 'ru') {
    starPath(g, 256, 132, 104, 40); g.fillStyle = '#b81c1c'; g.fill();
    starPath(g, 256, 132, 90, 35); g.fillStyle = '#f2f2f2'; g.fill();
    starPath(g, 256, 132, 76, 29); g.fillStyle = '#d42020'; g.fill();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    textureCache.set(key, tex); return tex;
  }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = T.textColor || 'rgba(40,46,52,0.85)';
  if (T.code) { g.font = '900 110px "Arial Black", Arial, sans-serif'; g.fillText(T.code, 256, 140); }
  if (T.num) { g.font = '700 46px Arial, sans-serif'; g.fillText(T.num, 256, 222); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  textureCache.set(key, tex);
  return tex;
}

// Planar UVs picked per-vertex from the normal: top/bottom faces use (x,z), sides use (z,y).
function projectUV(geo) {
  geo.computeVertexNormals();
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (Math.abs(nor.getY(i)) > 0.55) { uv[i * 2] = (x + 10) / 20; uv[i * 2 + 1] = (z + 11) / 22; }
    else { uv[i * 2] = (z + 11) / 22 + 0.37; uv[i * 2 + 1] = (y + 5) / 10 + 0.21; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// ------------------------------------------------------------------ geometry helpers
function superellipse(theta, hw, top, bot, n) {
  const c = Math.cos(theta), s = Math.sin(theta);
  const e = 2 / n;
  const x = hw * Math.sign(c) * Math.pow(Math.abs(c), e);
  const y = (s >= 0 ? top : bot) * Math.sign(s) * Math.pow(Math.abs(s), e);
  return [x, y];
}

const catmull = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

// Sample a smooth profile through stations [[z, cx, cy, hw, top, bot, n], ...]
function sampleStations(st, z) {
  let i = 0;
  while (i < st.length - 2 && z > st[i + 1][0]) i++;
  const a = st[Math.max(0, i - 1)], b = st[i], c = st[i + 1], d = st[Math.min(st.length - 1, i + 2)];
  const t = Math.min(1, Math.max(0, (z - b[0]) / ((c[0] - b[0]) || 1)));
  const out = [z];
  for (let k = 1; k < 7; k++) {
    const lin = b[k] + (c[k] - b[k]) * t;
    const cr = catmull(a[k], b[k], c[k], d[k], t);
    out.push(k >= 3 && k <= 5 ? Math.max(0.01, cr) : (k === 6 ? lin : cr));
  }
  return out;
}

// Loft a tube through cross-sections. Options: z range, rake (front-face slant), caps.
function loft(st, { z0 = st[0][0], z1 = st[st.length - 1][0], slices = 40, ring = 28, rake = 0, capBack = true } = {}) {
  const verts = [];
  const idx = [];
  const rings = [];
  for (let i = 0; i <= slices; i++) {
    const z = z0 + (z1 - z0) * (i / slices);
    const [zz, cx, cy, hw, top, bot, n] = sampleStations(st, z);
    const start = verts.length / 3;
    rings.push({ start, cx, cy, z: zz });
    for (let j = 0; j < ring; j++) {
      const th = (j / ring) * Math.PI * 2;
      const [x, y] = superellipse(th, hw, top, bot, n);
      let vz = zz;
      if (rake && i === 0) vz += (-(y / (top || 1)) * 0.5 + Math.abs(x) / (hw || 1) * 0.35) * rake;
      verts.push(cx + x, cy + y, vz);
    }
  }
  for (let i = 0; i < slices; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j, b = i * ring + ((j + 1) % ring);
      const c = (i + 1) * ring + j, d = (i + 1) * ring + ((j + 1) % ring);
      idx.push(a, b, c, b, d, c);
    }
  }
  if (capBack) {
    const last = rings[rings.length - 1];
    const ci = verts.length / 3;
    verts.push(last.cx, last.cy, last.z);
    for (let j = 0; j < ring; j++) idx.push(last.start + j, last.start + ((j + 1) % ring), ci);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  // dark "opening" cap for the front ring (intakes)
  const front = new THREE.BufferGeometry();
  // recessed a little so the duct reads as an opening, with a spinner bulge in the middle
  const fv = [rings[0].cx, rings[0].cy, rings[0].z + 0.3 + rake * 0.2];
  for (let j = 0; j < ring; j++) fv.push(verts[j * 3], verts[j * 3 + 1], verts[j * 3 + 2] + 0.45);
  const fi = [];
  for (let j = 0; j < ring; j++) fi.push(0, 1 + ((j + 1) % ring), 1 + j);
  const fuv = [0.5, 0.5];
  for (let j = 0; j < ring; j++) { const th = (j / ring) * Math.PI * 2; fuv.push(0.5 + 0.5 * Math.cos(th), 0.5 + 0.5 * Math.sin(th)); }
  front.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
  front.setAttribute('position', new THREE.Float32BufferAttribute(fv, 3));
  front.setIndex(fi);
  front.computeVertexNormals();
  return { geo, front };
}

// Lifting surface with a real airfoil cross-section (NACA 4-digit thickness), built from an
// outline polygon of [span, chord] points. map(s, c, t) places local span / chord / thickness
// coordinates into model space. profile 'wedge' is used for hinged control surfaces.
function liftingSurface(outline, thickness, { map, mirror = false, taper = 0.5, profile = 'airfoil', spanSteps = 16, chordSteps = 18 } = {}) {
  const n = outline.length;
  const ss = outline.map((p) => p[0]);
  const smin = Math.min(...ss), smax = Math.max(...ss);
  const chordAt = (sp) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const [s0, c0] = outline[i], [s1, c1] = outline[(i + 1) % n];
      if (s0 === s1) continue;
      if (sp < Math.min(s0, s1) - 1e-9 || sp > Math.max(s0, s1) + 1e-9) continue;
      const c = c0 + (c1 - c0) * ((sp - s0) / (s1 - s0));
      lo = Math.min(lo, c); hi = Math.max(hi, c);
    }
    return [lo, hi];
  };
  const half = (u, th) => {
    if (profile === 'wedge') return (th / 2) * (1 - u) + 0.004;
    return 5 * th * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u * u * u - 0.1036 * u * u * u * u) + 0.002;
  };
  const verts = [], idx = [];
  const C = chordSteps, S = spanSteps;
  const eps = (smax - smin) * 1e-4;
  for (let i = 0; i <= S; i++) {
    const sp = Math.min(smax - eps, Math.max(smin + eps, smin + (smax - smin) * (i / S)));
    const [lo, hi] = chordAt(sp);
    const chord = Math.max(0.05, hi - lo);
    const f = (sp - smin) / ((smax - smin) || 1);
    const th = Math.min(thickness * (1 - taper * f), chord * 0.12);
    for (const side of [1, -1]) {           // top row, then bottom row
      for (let j = 0; j <= C; j++) {
        const u = profile === 'wedge' ? j / C : (1 - Math.cos((Math.PI * j) / C)) / 2;
        const c = lo + (hi - lo) * u;
        const p = map(mirror ? -sp : sp, c, side * half(u, th));
        verts.push(p[0], p[1], p[2]);
      }
    }
  }
  const row = (C + 1) * 2;
  const vi = (i, side, j) => i * row + (side > 0 ? 0 : C + 1) + j;
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < C; j++) {
      // top surface
      idx.push(vi(i, 1, j), vi(i + 1, 1, j), vi(i, 1, j + 1), vi(i + 1, 1, j), vi(i + 1, 1, j + 1), vi(i, 1, j + 1));
      // bottom surface (opposite winding)
      idx.push(vi(i, -1, j), vi(i, -1, j + 1), vi(i + 1, -1, j), vi(i + 1, -1, j), vi(i, -1, j + 1), vi(i + 1, -1, j + 1));
    }
  }
  // close root and tip
  for (const i of [0, S]) {
    const flip = i === 0;
    for (let j = 0; j < C; j++) {
      const a = vi(i, 1, j), b = vi(i, 1, j + 1), c = vi(i, -1, j), d = vi(i, -1, j + 1);
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  // the axis mapping (and mirroring) may flip handedness: make the top surface face +thickness
  const P = (k) => new THREE.Vector3(verts[k * 3], verts[k * 3 + 1], verts[k * 3 + 2]);
  const [a0, b0, c0] = [idx[0], idx[1], idx[2]];
  const nrm = P(b0).sub(P(a0)).cross(P(c0).sub(P(a0)));
  const tdir = new THREE.Vector3(...map(0, 0, 1)).sub(new THREE.Vector3(...map(0, 0, 0)));
  if (nrm.dot(tdir) < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  return geo;
}
// axis mappings: wings / stabilizers lie in XZ (span = x), fins in ZY (span = y)
const WING_MAP = (sp, c, t) => [sp, t, c];
const FIN_MAP = (sp, c, t) => [t, sp, c];
// thickness of a NACA section at chord fraction u (as a fraction of max thickness)
const naca = (u) => 10 * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);

// Thin lifting surface from a planform outline ([x, z] points), lying in the XZ plane.
function planformGeo(points, thickness, mirror, taper = true) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(mirror ? -x : x, z)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness * 0.5, bevelEnabled: true, bevelThickness: thickness * 0.25, bevelSize: 0.04, bevelSegments: 2, curveSegments: 1,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, thickness * 0.25, 0);
  // taper thickness toward the tip
  if (!taper) return geo;
  const xs = points.map((p) => p[0]);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const f = Math.min(1, Math.max(0, (Math.abs(pos.getX(i)) - xmin) / ((xmax - xmin) || 1)));
    pos.setY(i, pos.getY(i) * (1 - 0.6 * f));
  }
  return geo;
}

// Vertical fin from a side profile ([z, y] points), lying in the ZY plane.
function finGeo(points, thickness, taper = true) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness * 0.5, bevelEnabled: true, bevelThickness: thickness * 0.25, bevelSize: 0.03, bevelSegments: 2, curveSegments: 1,
  });
  geo.rotateY(Math.PI / 2);
  geo.translate(-thickness * 0.25, 0, 0);
  if (!taper) return geo;
  const ys = points.map((p) => Math.abs(p[1]));
  const ymax = Math.max(...ys) || 1;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const f = Math.min(1, Math.abs(pos.getY(i)) / ymax);
    pos.setX(i, pos.getX(i) * (1 - 0.55 * f));
  }
  return geo;
}

// Trailing-edge polyline of an outline: from the outermost trailing point back to the root.
// pts are [span, chord] pairs (wings: [x, z]; fins: [z, y] -> pass swapped).
function trailingEdge(pts) {
  const maxS = Math.max(...pts.map((p) => p[0]));
  let tip = -1;
  pts.forEach((p, i) => { if (p[0] > maxS - 0.01 && (tip < 0 || p[1] > pts[tip][1])) tip = i; });
  const te = pts.slice(tip);
  return (sp) => {
    for (let i = 0; i < te.length - 1; i++) {
      const [s0, c0] = te[i], [s1, c1] = te[i + 1];
      if ((sp <= s0 && sp >= s1) || (sp >= s0 && sp <= s1)) return c0 + (c1 - c0) * ((sp - s0) / ((s1 - s0) || 1));
    }
    return te[te.length - 1][1];
  };
}

// Put a geometry (already in model coordinates) on a hinge running from A to B.
function hinged(group, geo, A, B, mat) {
  projectUV(geo);
  geo.translate(-A.x, -A.y, -A.z);
  const pivot = new THREE.Group();
  pivot.position.copy(A);
  pivot.add(new THREE.Mesh(geo, mat));
  group.add(pivot);
  return { pivot, axis: B.clone().sub(A).normalize(), angle: 0 };
}

function addMesh(group, geo, mat, uv = true) {
  if (uv) projectUV(geo); else geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  group.add(m);
  return m;
}

// ------------------------------------------------------------------ decals & detail textures
const _helper = new THREE.Object3D();
const _ray = new THREE.Raycaster();
// Project a decal onto `mesh` near `point`, looking along -outward, image "up" = up.
function addDecal(group, mesh, point, outward, up, w, h, mat, depth = 1.2) {
  if (!mesh || !mat) return null;
  mesh.updateMatrixWorld(true);
  const dir = outward.clone().normalize();
  _ray.set(point.clone().addScaledVector(dir, 4), dir.clone().negate());
  const hit = _ray.intersectObject(mesh, false)[0];
  if (!hit) return null;
  _helper.position.copy(hit.point);
  _helper.up.copy(up);
  _helper.lookAt(hit.point.clone().add(dir));
  const raw = new DecalGeometry(mesh, hit.point, _helper.rotation.clone(), new THREE.Vector3(w, h, depth));
  // the projector box goes straight through thin parts (fins, wings): keep only triangles
  // facing outward, otherwise a mirrored copy shows up on the far side
  const pos = raw.attributes.position, nor = raw.attributes.normal, uv = raw.attributes.uv;
  const P = [], N = [], U = [];
  for (let t = 0; t < pos.count; t += 3) {
    let d = 0;
    for (let k = 0; k < 3; k++) d += nor.getX(t + k) * dir.x + nor.getY(t + k) * dir.y + nor.getZ(t + k) * dir.z;
    if (d / 3 < 0.2) continue;
    for (let k = 0; k < 3; k++) {
      P.push(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k));
      N.push(nor.getX(t + k), nor.getY(t + k), nor.getZ(t + k));
      U.push(uv.getX(t + k), uv.getY(t + k));
    }
  }
  raw.dispose();
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  dg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  dg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  const m = new THREE.Mesh(dg, mat);
  m.renderOrder = 1;
  group.add(m);
  return m;
}

function canvasTex(w, h, draw, key) {
  if (key && textureCache.has(key)) return textureCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (key) textureCache.set(key, t);
  return t;
}
function starPath(g, cx, cy, R, r) {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rad = k % 2 ? r : R;
    k ? g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad) : g.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.closePath();
}
const INSIGNIA = {
  // low-visibility US star-and-bar (grey on grey)
  us: () => canvasTex(512, 256, (g) => {
    g.fillStyle = 'rgba(58,64,72,0.62)'; g.strokeStyle = 'rgba(40,44,50,0.75)'; g.lineWidth = 5;
    g.fillRect(36, 104, 440, 52); g.strokeRect(36, 104, 440, 52);
    g.beginPath(); g.arc(256, 128, 96, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(150,158,166,0.7)'; starPath(g, 256, 132, 92, 36); g.fill();
  }, 'ins:us'),
  // Russian red star with white and red outlines
  ru: () => canvasTex(256, 256, (g) => {
    starPath(g, 128, 136, 122, 48); g.fillStyle = '#b81c1c'; g.fill();
    starPath(g, 128, 136, 106, 41); g.fillStyle = '#f2f2f2'; g.fill();
    starPath(g, 128, 136, 90, 35); g.fillStyle = '#d42020'; g.fill();
  }, 'ins:ru'),
  // low-visibility European roundel
  eu: () => canvasTex(256, 256, (g) => {
    g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.fillStyle = 'rgba(120,150,190,0.85)'; g.fill();
    g.beginPath(); g.arc(128, 128, 62, 0, Math.PI * 2); g.fillStyle = 'rgba(205,120,125,0.9)'; g.fill();
  }, 'ins:eu'),
};
const sideNumberTex = (txt, color) => canvasTex(512, 256, (g) => {
  g.font = '900 200px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 16; g.strokeStyle = '#f4f4f4'; g.strokeText(txt, 256, 136);
  g.fillStyle = color || '#1d3f8a'; g.fillText(txt, 256, 136);
}, 'num:' + txt + color);
const decalMaterial = (map) => new THREE.MeshStandardMaterial({
  map, transparent: true, roughness: 0.55, metalness: 0.15, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
});
// engine compressor face seen inside the intakes
const FAN_TEX = () => canvasTex(256, 256, (g) => {
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, '#3a3d42'); grd.addColorStop(1, '#14161a');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(150,155,165,0.55)'; g.lineWidth = 3;
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    g.beginPath(); g.moveTo(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30);
    g.quadraticCurveTo(128 + Math.cos(a + 0.25) * 80, 128 + Math.sin(a + 0.25) * 80, 128 + Math.cos(a + 0.35) * 126, 128 + Math.sin(a + 0.35) * 126);
    g.stroke();
  }
  g.beginPath(); g.arc(128, 128, 30, 0, Math.PI * 2); g.fillStyle = '#5a5e64'; g.fill();
  g.beginPath(); g.arc(122, 122, 10, 0, Math.PI * 2); g.fillStyle = '#9aa0a8'; g.fill();
}, 'fan');
// cockpit multi-function displays
const MFD_TEX = () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#04140a'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#3cff7a'; g.lineWidth = 2;
  g.strokeRect(10, 10, 108, 108);
  g.beginPath(); g.arc(64, 70, 36, Math.PI, 0); g.stroke();
  for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(16, 24 + k * 16); g.lineTo(30, 24 + k * 16); g.stroke(); }
  g.fillStyle = '#ffb030'; g.fillRect(58, 40, 12, 12);
}, 'mfd');

// ------------------------------------------------------------------ jet
export function buildJet(def) {
  const M = def.model;
  const group = new THREE.Group();
  const paintTex = paintTexture(def);
  const skin = new THREE.MeshPhysicalMaterial({
    map: paintTex.map, roughnessMap: paintTex.rough, roughness: 1, metalness: 0.3,
    clearcoat: 0.25, clearcoatRoughness: 0.45,
    bumpMap: paintTex.rough, bumpScale: -0.8, // engraved panel lines and rivets catch the light
  });
  const fanMat = new THREE.MeshStandardMaterial({ map: FAN_TEX(), roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide });
  const skinInside = skin.clone();
  skinInside.side = THREE.DoubleSide;
  const radome = new THREE.MeshPhysicalMaterial({ color: M.radome, roughness: 0.45, metalness: 0.15, clearcoat: 0.3 });
  const L = M.length;
  const half = L / 2;

  // fuselage: stations in [t, hw, top, bottom, n] -> loft stations [z, cx, cy, hw, top, bottom, n]
  const st = M.fuselage.map(([t, hw, top, bot, n]) => [-half + t * L, 0, 0, hw, top, bot, n]);
  const zr = -half + L * 0.085;
  addMesh(group, loft(st, { z0: st[0][0], z1: zr, slices: 14, ring: M.facets || 40, capBack: false }).geo, M.facets ? Object.assign(radome.clone(), { flatShading: true }) : radome);
  // stealth jets: fewer, flat-shaded facets around the body give sharp planar panels and chines
  const bodyMat = M.facets ? Object.assign(skin.clone(), { flatShading: true }) : skin;
  const fuselageMesh = addMesh(group, loft(st, { z0: zr, z1: st[st.length - 1][0], slices: M.facets ? 40 : 72, ring: M.facets || 48 }).geo, bodyMat);

  // canopy + pilot
  const cn = M.canopy;
  const glass = new THREE.MeshPhysicalMaterial({
    color: cn.tint, roughness: 0.03, metalness: 0.85, transparent: true, opacity: 0.8,
    clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6,
  });
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), glass);
  canopy.scale.set(cn.rx, cn.ry, cn.rz);
  canopy.position.set(0, cn.y, cn.z);
  group.add(canopy);
  const cabin = new THREE.Group(); // pilot + exterior cockpit details (hidden in first-person view)
  group.add(cabin);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), HELMET);
  helmet.position.set(0, cn.y + 0.12, cn.z + 0.25);
  cabin.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.205, 12, 8, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.3, Math.PI * 0.3), VISOR);
  visor.rotation.y = Math.PI;
  helmet.add(visor);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.16), SEAT);
  seat.position.set(0, cn.y + 0.02, cn.z + 0.52);
  seat.rotation.x = -0.25;
  cabin.add(seat);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.4, 0.3), HELMET);
  torso.position.set(0, cn.y - 0.25, cn.z + 0.3);
  cabin.add(torso);
  // cockpit interior: glare shield with instrument panel, displays, HUD glass, consoles
  const cockpit = new THREE.Group();
  const panelZ = cn.z - cn.rz * 0.42;
  const shield = new THREE.Mesh(new THREE.BoxGeometry(cn.rx * 1.45, 0.2, 0.42), SEAT);
  shield.position.set(0, cn.y + 0.02, panelZ);
  cockpit.add(shield);
  const mfdMat = new THREE.MeshBasicMaterial({ map: MFD_TEX() });
  for (const mx of [-0.2, 0, 0.2]) {
    const mfd = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.14), mfdMat);
    mfd.position.set(mx * cn.rx * 1.6, cn.y - 0.06, panelZ + 0.215);
    mfd.rotation.x = -0.25;
    cockpit.add(mfd);
  }
  const hudGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.17), new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  hudGlass.position.set(0, cn.y + 0.22, panelZ + 0.08);
  hudGlass.rotation.x = 0.35;
  cockpit.add(hudGlass);
  for (const sx of [-1, 1]) {
    const con = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.7), SEAT);
    con.position.set(sx * cn.rx * 0.72, cn.y - 0.12, cn.z + 0.05);
    cockpit.add(con);
  }
  const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.14), SEAT);
  headrest.position.set(0, cn.y + 0.42, cn.z + 0.6);
  cockpit.add(headrest);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 14, Math.PI), new THREE.MeshStandardMaterial({ color: 0xe8c020, roughness: 0.6 }));
  handle.position.set(0, cn.y + 0.58, cn.z + 0.6);
  cockpit.add(handle);
  const mask = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.12, 8), HELMET);
  mask.rotation.x = Math.PI / 2;
  mask.position.set(0, cn.y + 0.06, cn.z + 0.08);
  cockpit.add(mask);
  cabin.add(cockpit);
  // canopy frame bows
  for (const fz of cn.frames || []) {
    const k = Math.sqrt(Math.max(0.05, 1 - fz * fz));
    const g = new THREE.TorusGeometry(1, 0.03, 6, 28, Math.PI);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { pos.setX(i, pos.getX(i) * cn.rx * k); pos.setY(i, pos.getY(i) * cn.ry * k); }
    g.computeVertexNormals();
    const bow = new THREE.Mesh(g, FRAME);
    bow.position.set(0, cn.y, cn.z + fz * cn.rz);
    group.add(bow);
  }
  // nose pitot boom
  if (M.pitot) {
    const pg = new THREE.CylinderGeometry(0.015, 0.035, M.pitot, 6);
    pg.rotateX(Math.PI / 2);
    const pitot = new THREE.Mesh(pg, FRAME);
    pitot.position.set(0, 0, -half - M.pitot / 2 + 0.05);
    group.add(pitot);
  }
  // IRST sensor ball
  if (M.irst) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), SENSOR);
    ball.position.set(...M.irst);
    group.add(ball);
  }
  // blade antennas: [x, y, z, up(1) / down(-1)]
  for (const [ax, ay, az, dir = 1] of M.antennas || []) {
    const ag = new THREE.BoxGeometry(0.035, 0.36, 0.32);
    const p = ag.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setZ(i, p.getZ(i) + 0.14); p.setZ(i, p.getZ(i) * 0.6 + 0.08); }
    ag.computeVertexNormals();
    const ant = new THREE.Mesh(ag, FRAME);
    ant.position.set(ax, ay + 0.17 * dir, az);
    if (dir < 0) ant.rotation.z = Math.PI;
    group.add(ant);
  }

  // wings (mirrored) with hinged flaperons on the trailing edge
  const controls = { stabs: [], flaps: [], rudders: [] };
  let tipX = 0, tipZ = 0;
  const W = M.wings;
  const wxs = W.points.map((p) => p[0]);
  const wxmin = Math.min(...wxs), wxmax = Math.max(...wxs);
  const wingTE = trailingEdge(W.points);
  const wingLE = (x) => { // leading edge z at span x (smallest chord coordinate on the outline)
    let lo = Infinity;
    for (let i = 0; i < W.points.length; i++) {
      const [s0, c0] = W.points[i], [s1, c1] = W.points[(i + 1) % W.points.length];
      if (s0 === s1 || x < Math.min(s0, s1) || x > Math.max(s0, s1)) continue;
      lo = Math.min(lo, c0 + (c1 - c0) * ((x - s0) / (s1 - s0)));
    }
    return lo;
  };
  const wingMeshes = [];
  for (const side of [1, -1]) {
    const dih = side * (W.dihedral || 0) * Math.PI / 180;
    const geo = liftingSurface(W.points, W.thickness * 1.35, { map: WING_MAP, mirror: side < 0, taper: 0.55 });
    geo.rotateZ(dih);
    geo.translate(0, W.y, 0);
    wingMeshes.push(addMesh(group, geo, skin));
    if (W.flaps) {
      const { x0, x1, chord } = W.flaps;
      const z0 = wingTE(x0), z1 = wingTE(x1);
      const pts = [[x0, z0 - chord], [x1, z1 - chord], [x1, z1], [x0, z0]];
      const f = ((x0 + x1) / 2 - wxmin) / ((wxmax - wxmin) || 1);
      const hingeU = 1 - chord / Math.max(0.5, wingTE((x0 + x1) / 2) - wingLE((x0 + x1) / 2));
      const fg = liftingSurface(pts, W.thickness * 1.35 * (1 - 0.55 * f) * naca(Math.max(0.5, hingeU)) * 1.12, { map: WING_MAP, mirror: side < 0, taper: 0, profile: 'wedge', spanSteps: 4, chordSteps: 4 });
      fg.rotateZ(dih); fg.translate(0, W.y, 0);
      const rot = new THREE.Matrix4().makeRotationZ(dih);
      const A = new THREE.Vector3(side * x0, 0, z0 - chord).applyMatrix4(rot).add(new THREE.Vector3(0, W.y, 0));
      const B = new THREE.Vector3(side * x1, 0, z1 - chord).applyMatrix4(rot).add(new THREE.Vector3(0, W.y, 0));
      controls.flaps.push({ ...hinged(group, fg, A, B, skin), side });
    }
  }
  // all-moving stabilators, pivoting around the root mid-chord
  // (canards use the same all-moving pivot, but deflect the other way)
  for (const [S, kind] of [[M.hstab, 'stab'], [M.canards, 'canard']]) {
    if (!S) continue;
    const sxmin = Math.min(...S.points.map((p) => p[0]));
    const rootPts = S.points.filter((p) => p[0] < sxmin + 0.01);
    const pivotZ = rootPts.reduce((a, p) => a + p[1], 0) / rootPts.length;
    for (const side of [1, -1]) {
      const geo = liftingSurface(S.points, S.thickness * 1.3, { map: WING_MAP, mirror: side < 0, taper: 0.5, spanSteps: 10, chordSteps: 14 });
      geo.rotateZ(side * (S.dihedral || 0) * Math.PI / 180);
      geo.translate(0, S.y, 0);
      const A = new THREE.Vector3(side * sxmin, S.y, pivotZ);
      controls.stabs.push({ ...hinged(group, geo, A, A.clone().add(new THREE.Vector3(1, 0, 0)), skin), side, sign: kind === 'canard' ? -1 : 1 });
    }
  }
  {
    const pts = M.wings.points;
    tipX = Math.max(...pts.map((p) => p[0]));
    const tipPts = pts.filter((p) => p[0] > tipX - 0.01);
    tipZ = tipPts.reduce((a, p) => a + p[1], 0) / tipPts.length;
  }

  // vertical tails
  const vt = M.vtails;
  const finH = Math.max(...vt.points.map((p) => p[1]));
  const finTE = trailingEdge(vt.points.map(([z, y]) => [y, z]));
  // leading edge: z of the fin's front edge at height y (first point up to the tip)
  const finLE = (y) => {
    const pts = vt.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const [z0, y0] = pts[i], [z1, y1] = pts[i + 1];
      if (y1 > y0 && y >= y0 && y <= y1) return z0 + (z1 - z0) * ((y - y0) / (y1 - y0));
    }
    return pts[0][0];
  };
  const decalMat = M.tail ? new THREE.MeshStandardMaterial({
    map: tailDecalTexture(def), transparent: true, roughness: 0.6, metalness: 0.2,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false,
  }) : null;
  const finTip = vt.points.filter((p) => p[1] > finH - 0.01).reduce((a, p) => (p[0] > a[0] ? p : a));
  const beaconPos = [];
  for (let i = 0; i < vt.count; i++) {
    const side = vt.count === 1 ? 0 : (i === 0 ? 1 : -1);
    const cant = -side * vt.cant * Math.PI / 180;
    const geo = liftingSurface(vt.points.map(([z, y]) => [y, z]), vt.thickness * 1.3, { map: FIN_MAP, taper: 0.5, spanSteps: 12, chordSteps: 16 });
    geo.rotateZ(cant);
    geo.translate(side * vt.x, vt.y, 0);
    const finMesh = addMesh(group, geo, skin);
    // rudder on the lower trailing edge
    const rc = vt.rudderChord ?? 0.75;
    const y0 = finH * 0.12, y1 = finH * 0.78;
    const z0 = finTE(y0), z1 = finTE(y1);
    const ruH = vt.thickness * 1.3 * (1 - 0.5 * ((y0 + y1) / 2 / finH)) * naca(Math.max(0.5, 1 - rc / Math.max(0.8, finTE((y0 + y1) / 2) - finLE((y0 + y1) / 2)))) * 1.12;
    const rg = liftingSurface([[y0, z0 - rc], [y1, z1 - rc], [y1, z1], [y0, z0]], ruH, { map: FIN_MAP, taper: 0, profile: 'wedge', spanSteps: 4, chordSteps: 4 });
    rg.rotateZ(cant); rg.translate(side * vt.x, vt.y, 0);
    const rot = new THREE.Matrix4().makeRotationZ(cant);
    const off = new THREE.Vector3(side * vt.x, vt.y, 0);
    const A = new THREE.Vector3(0, y0, z0 - rc).applyMatrix4(rot).add(off);
    const B = new THREE.Vector3(0, y1, z1 - rc).applyMatrix4(rot).add(off);
    controls.rudders.push(hinged(group, rg, A, B, skin));
    beaconPos.push(new THREE.Vector3(0, finH + 0.05, finTip[0] - 0.1).applyMatrix4(rot).add(off));
    // tail markings on both faces of the fin
    if (M.tail) {
      const yc = finH * 0.5, hgt = finH * 0.42;
      const le = finLE(yc + hgt / 2), te = finTE(yc + hgt / 2);
      const wid = Math.max(0.5, (te - le) * 0.95);
      const zc = (finLE(yc) + finTE(yc)) / 2;
      const center = new THREE.Vector3(0, yc, zc).applyMatrix4(rot).add(off);
      const finUp = new THREE.Vector3(0, 1, 0).applyMatrix4(rot);
      for (const face of [1, -1]) {
        const nrm = new THREE.Vector3(face, 0, 0).applyMatrix4(rot);
        addDecal(group, finMesh, center, nrm, finUp, wid, hgt, decalMat);
      }
    }
  }
  if (M.ventrals) {
    const V = M.ventrals;
    for (const side of [1, -1]) {
      const geo = liftingSurface(V.points.map(([z, y]) => [y, z]), (V.thickness || 0.08) * 1.3, { map: FIN_MAP, taper: 0.4, spanSteps: 6, chordSteps: 10 });
      geo.rotateZ(side * (V.cant ?? 0.3));
      geo.translate(side * V.x, V.y, 0);
      addMesh(group, geo, skin);
    }
  }

  // intakes
  for (const it of M.intakes) {
    const sides = it.type === 'chin' ? [0] : [1, -1];
    for (const side of sides) {
      const x = (it.x || 0) * side;
      let st2;
      if (it.type === 'chin') {
        st2 = [
          [it.z0, 0, it.y, it.hw, it.hh, it.hh, it.n || 2.3],
          [it.z0 + 1.6, 0, it.y - 0.02, it.hw, it.hh, it.hh, it.n || 2.3],
          [it.z1, 0, it.y + 0.4, it.hw * 0.85, it.hh * 0.5, it.hh * 0.6, 2.2],
        ];
      } else if (it.type === 'side') {
        st2 = [
          [it.z0, x, it.y, it.hw * 0.85, it.hh, it.hh * 0.9, 3.2],
          [it.z0 + 2.2, x, it.y, it.hw, it.hh, it.hh, 3.0],
          [it.z1, x * 0.85, it.y, it.hw * 0.8, it.hh * 0.75, it.hh * 0.7, 2.6],
        ];
      } else { // nacelle running to the nozzle
        st2 = [
          [it.z0, x, it.y, it.hw, it.hh, it.hh, 4.0],
          [it.z0 + 2.5, x, it.y, it.hw, it.hh * 1.02, it.hh, 3.2],
          [it.z1 - 2.5, x, it.y, it.hw * 0.95, it.hh * 1.05, it.hh * 1.05, 2.4],
          [it.z1, x, it.y, it.hw * 0.9, it.hh * 1.0, it.hh * 1.0, 2.0],
        ];
      }
      const rake = it.rake ?? (it.type === 'nacelle' ? 0.8 : 0.3);
      // nacelles are closed at the back (behind the nozzle); intake ducts are solid from inside too
      // stealth jets: crisp, angular intake boxes instead of round pods
      const sharp = M.facets && it.type === 'side';
      if (sharp) for (const row of st2) row[6] = 4.5;
      const { geo, front } = loft(st2, { slices: it.type === 'nacelle' ? 30 : 14, ring: sharp ? 8 : 28, rake, capBack: it.type === 'nacelle' });
      addMesh(group, geo, sharp ? Object.assign(skinInside.clone(), { flatShading: true }) : skinInside);
      group.add(new THREE.Mesh(front, fanMat));
    }
  }

  // nozzles + afterburner flames
  const nz = M.nozzles;
  const flames = [];
  for (let i = 0; i < nz.count; i++) {
    const side = nz.count === 1 ? 0 : (i === 0 ? 1 : -1);
    const x = side * nz.x;
    let nozzle;
    if (nz.shape === 'square') {
      const { geo } = loft([
        [nz.z - 0.2, x, nz.y, nz.r * 1.05, nz.r * 0.9, nz.r * 0.9, 6],
        [nz.z + nz.len, x, nz.y, nz.r * 0.95, nz.r * 0.55, nz.r * 0.55, 8],
      ], { slices: 4, ring: 32, capBack: false });
      nozzle = addMesh(group, geo, NOZZLE, false);
      nozzle.material = NOZZLE.clone(); nozzle.material.side = THREE.DoubleSide;
    } else {
      const geo = new THREE.CylinderGeometry(nz.r * 0.86, nz.r, nz.len, 22, 1, true);
      geo.rotateX(Math.PI / 2);
      geo.translate(x, nz.y, nz.z + nz.len / 2 - 0.15);
      nozzle = new THREE.Mesh(geo, NOZZLE.clone());
      nozzle.material.side = THREE.DoubleSide;
      group.add(nozzle);
      // faceted petals on the exhaust lip + flame-holder ring inside
      const pg = new THREE.CylinderGeometry(nz.r * 0.84, nz.r * 0.9, nz.len * 0.45, 14, 1, true);
      pg.rotateX(Math.PI / 2);
      pg.translate(x, nz.y, nz.z + nz.len - 0.2);
      group.add(new THREE.Mesh(pg, PETALS));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(nz.r * 0.45, 0.04, 6, 18), NOZZLE);
      ring.position.set(x, nz.y, nz.z + 0.35);
      group.add(ring);
      // actuator ring around the nozzle base
      const act = new THREE.Mesh(new THREE.TorusGeometry(nz.r * 1.0, 0.035, 6, 24), NOZZLE);
      act.position.set(x, nz.y, nz.z - 0.05);
      group.add(act);
      if (nz.serrated) {
        // stealthy saw-tooth trailing edge on the nozzle petals (F-35 / Su-57)
        const teeth = 14, rl = nz.r * 0.87, zEnd = nz.z + nz.len - 0.05, tv = [];
        for (let k = 0; k < teeth; k++) {
          const a0 = (k / teeth) * Math.PI * 2, a1 = ((k + 1) / teeth) * Math.PI * 2, am = (a0 + a1) / 2;
          tv.push(x + Math.cos(a0) * rl, nz.y + Math.sin(a0) * rl, zEnd,
            x + Math.cos(a1) * rl, nz.y + Math.sin(a1) * rl, zEnd,
            x + Math.cos(am) * rl * 0.93, nz.y + Math.sin(am) * rl * 0.93, zEnd + 0.2);
        }
        const tg = new THREE.BufferGeometry();
        tg.setAttribute('position', new THREE.Float32BufferAttribute(tv, 3));
        tg.computeVertexNormals();
        group.add(new THREE.Mesh(tg, PETALS));
      }
    }
    // glowing engine face deep in the nozzle (faces aft; double-sided so it is never see-through)
    const inner = new THREE.Mesh(new THREE.CircleGeometry(nz.r * 0.95, 24), NOZZLE_INNER.clone());
    inner.position.set(x, nz.y, nz.z + 0.25);
    if (nz.shape === 'square') inner.scale.y = 0.6;
    group.add(inner);

    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const fg = new THREE.ConeGeometry(nz.r * 0.8, 1, 18, 1, true);
    fg.rotateX(-Math.PI / 2); fg.translate(0, 0, 0.5);
    const flame = new THREE.Mesh(fg, flameMat);
    flame.position.set(x, nz.y, nz.z + nz.len - 0.1);
    if (nz.shape === 'square') flame.scale.y = 0.6;
    const core = new THREE.Mesh(fg, coreMat);
    core.scale.set(0.55, nz.shape === 'square' ? 0.35 : 0.55, 0.5);
    flame.add(core);
    // shock diamonds: bright knots inside the afterburner plume
    const diamonds = [];
    for (let k = 0; k < 3; k++) {
      const dm = new THREE.Mesh(DIAMOND_GEO, new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      dm.position.z = 0.2 + k * 0.17;
      flame.add(dm);
      diamonds.push(dm);
    }
    group.add(flame);
    flames.push({ flame, core, inner, diamonds, r: nz.r });
  }

  // wingtip missiles / rails
  if (M.wingtipMissiles) {
    for (const side of [1, -1]) {
      const m = buildMissileMesh(false);
      m.position.set(side * (tipX + 0.12), M.wings.y, tipZ - 0.4);
      group.add(m);
    }
  }

  // underwing stores: missiles / fuel tanks on pylons (mirrored)
  for (const st of M.stores || []) {
    for (const side of [1, -1]) {
      const wy = M.wings.y - M.wings.thickness * 0.35;
      const isTank = st.type === 'tank';
      const drop = isTank ? 0.62 : 0.32;
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.09, drop, isTank ? 1.6 : 1.3), NOZZLE);
      pylon.position.set(side * st.x, wy - drop / 2, st.z);
      group.add(pylon);
      let store;
      if (isTank) {
        const prof = [];
        for (let k = 0; k <= 16; k++) { const t = k / 16; prof.push(new THREE.Vector2(0.38 * Math.sin(Math.PI * Math.pow(t, 0.8)) + 0.001, (t - 0.5) * 4.2)); }
        const tg = new THREE.LatheGeometry(prof, 16);
        tg.rotateX(Math.PI / 2);
        store = new THREE.Mesh(tg, TANK);
        store.position.set(side * st.x, wy - drop - 0.36, st.z);
      } else {
        store = buildMissileMesh(false);
        store.scale.setScalar(1.25);
        store.position.set(side * st.x, wy - drop - 0.1, st.z);
      }
      group.add(store);
    }
  }

  // blinking lights: red anti-collision beacons on the fins, white strobes on the wingtips
  const beacons = beaconPos.map((p) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    m.position.copy(p); group.add(m); return m;
  });
  const strobes = [-1, 1].map((sd) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    m.position.set(sd * (tipX + 0.06), M.wings.y + 0.1, tipZ + 0.25); group.add(m); return m;
  });

  // navigation lights
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  navR.position.set(-tipX - 0.05, M.wings.y + 0.1, tipZ);
  const navG = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), new THREE.MeshBasicMaterial({ color: 0x20ff40 }));
  navG.position.set(tipX + 0.05, M.wings.y + 0.1, tipZ);
  group.add(navR, navG);

  // ---- national insignia (projected decals that wrap onto the curved skin)
  const ins = M.insignia;
  if (ins && INSIGNIA[ins]) {
    const insMat = decalMaterial(INSIGNIA[ins]());
    const wide = ins === 'us';
    wingMeshes.forEach((wm, k) => {
      const side = k === 0 ? 1 : -1;
      const x = tipX * 0.6;
      const chord = wingTE(x) - wingLE(x);
      const size = Math.min(chord * 0.6, 1.7);
      const p = new THREE.Vector3(side * x, W.y, (wingLE(x) + wingTE(x)) / 2);
      addDecal(group, wm, p, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), size * (wide ? 2 : 1), size, insMat);
    });
    const up = new THREE.Vector3(0, 1, 0);
    if (ins === 'ru') {
      // big side number on the nose
      const num = sideNumberTex(M.tail?.code || '01', M.tail?.textColor);
      const numMat = decalMaterial(num);
      const z = cn.z + cn.rz * 0.15;
      for (const side of [1, -1]) addDecal(group, fuselageMesh, new THREE.Vector3(0, -0.05, z), new THREE.Vector3(side, -0.25, 0), up, 1.7, 0.85, numMat);
    } else {
      // fuselage roundel / star behind the intakes
      const aft = Math.max(cn.z + cn.rz + 1.2, ...M.intakes.filter((i) => i.type !== 'nacelle').map((i) => i.z1 + 0.9));
      const z = Math.min(aft, half - 3);
      for (const side of [1, -1]) addDecal(group, fuselageMesh, new THREE.Vector3(0, 0.05, z), new THREE.Vector3(side, 0, 0), up, wide ? 1.3 : 0.7, wide ? 0.65 : 0.7, insMat);
    }
  }

  // ---- gun muzzle on the side of the nose (side taken from the jet's real gun position)
  const gunZ = -half + L * 0.14;
  const gunHW = sampleStations(st, gunZ)[3];
  const gunSide = Math.sign(M.gun?.[0] || 1) || 1;
  const gunPos = new THREE.Vector3(gunSide * gunHW * 0.85, 0.05, gunZ);
  {
    const port = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.35, 10, 1, true), NOZZLE);
    port.rotation.x = Math.PI / 2;
    port.position.copy(gunPos).add(new THREE.Vector3(0, 0, 0.12));
    group.add(port);
    const bore = new THREE.Mesh(new THREE.CircleGeometry(0.04, 10), DARK);
    bore.position.copy(gunPos).add(new THREE.Vector3(0, 0, -0.04));
    group.add(bore);
  }

  // ---- small parts
  const smallMat = FRAME;
  // static discharge wicks on the wing tips and fin tips
  const wick = (p, dir) => {
    const g = new THREE.CylinderGeometry(0.007, 0.012, 0.32, 4);
    g.translate(0, 0.16, 0);
    const m = new THREE.Mesh(g, smallMat);
    m.position.copy(p);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    group.add(m);
  };
  const aft = new THREE.Vector3(0, 0, 1);
  for (const side of [1, -1]) {
    for (const dx of [0.2, 0.9]) {
      const x = tipX - dx;
      wick(new THREE.Vector3(side * x, W.y + Math.tan(side * (W.dihedral || 0) * Math.PI / 180) * x * side, wingTE(x) - 0.05), aft);
    }
  }
  for (let i = 0; i < vt.count; i++) {
    const side = vt.count === 1 ? 0 : (i === 0 ? 1 : -1);
    const rot = new THREE.Matrix4().makeRotationZ(-side * vt.cant * Math.PI / 180);
    const y = finH * 0.95;
    wick(new THREE.Vector3(0, y, finTE(y) - 0.05).applyMatrix4(rot).add(new THREE.Vector3(side * vt.x, vt.y, 0)), aft);
  }
  // angle-of-attack probes on the nose
  {
    const zP = -half + L * 0.1;
    const [, , , hw] = sampleStations(st, zP);
    for (const side of [1, -1]) {
      const g = new THREE.CylinderGeometry(0.008, 0.016, 0.2, 5);
      g.translate(0, 0.1, 0);
      const m = new THREE.Mesh(g, smallMat);
      m.position.set(side * hw * 0.92, 0.05, zP);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(side * 0.45, 0.15, -1).normalize());
      group.add(m);
    }
  }
  // IFF "bird slicer" blades ahead of the canopy (Russian jets)
  if (M.iff) {
    const zI = cn.z - cn.rz - 0.3;
    const top = sampleStations(st, zI)[4];
    for (const bx of [-0.11, 0, 0.11]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.1, 0.16), smallMat);
      b.position.set(bx, top + 0.04, zI + (bx === 0 ? -0.08 : 0));
      group.add(b);
    }
  }

  group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  return {
    group,
    flames,
    controls,
    beacons,
    strobes,
    ctl: [0, 0, 0],
    canopy,
    helmet,
    cabin,
    gun: gunPos,
    eye: new THREE.Vector3(...M.eye),
    nozzles: flames.map((f) => f.flame.position.clone()),
    wingtips: [new THREE.Vector3(-tipX, M.wings.y, tipZ + 0.3), new THREE.Vector3(tipX, M.wings.y, tipZ + 0.3)],
  };
}

// throttle 0..1, ab bool, ctl = [pitch, roll, yaw] stick inputs (moves the control surfaces)
export function updateJetVisual(parts, throttle, ab, t, ctl) {
  if (ctl && parts.controls) {
    const c = parts.ctl;
    for (let i = 0; i < 3; i++) c[i] += ((ctl[i] || 0) - c[i]) * 0.25;
    const [pitch, roll, yaw] = c;
    for (const s of parts.controls.stabs) s.pivot.quaternion.setFromAxisAngle(s.axis, -s.sign * (pitch * 0.3 + s.side * roll * 0.15));
    for (const f of parts.controls.flaps) {
      const teDown = -f.side * roll * 0.38 + pitch * 0.06;
      f.pivot.quaternion.setFromAxisAngle(f.axis, f.side * teDown);
    }
    for (const r of parts.controls.rudders) r.pivot.quaternion.setFromAxisAngle(r.axis, yaw * 0.45);
  }
  if (parts.beacons) {
    const on = (t % 1.1) < 0.12;
    for (const b of parts.beacons) b.visible = on;
    const st = (t % 1.5) > 0.75 && (t % 1.5) < 0.82;
    for (const s of parts.strobes) s.visible = st;
  }
  for (const f of parts.flames) {
    const flick = 0.85 + 0.15 * Math.sin(t * 55 + f.flame.position.x * 10) * Math.sin(t * 31);
    const len = ab ? 5.5 * flick : 0.6 + throttle * 0.8;
    f.flame.scale.z = len;
    f.flame.visible = ab || throttle > 0.7;
    f.flame.material.opacity = ab ? 0.75 * flick : (throttle - 0.7) * 0.15;
    f.flame.material.color.setHex(ab ? 0xff7a2a : 0xff8040);
    f.core.material.opacity = ab ? 0.9 : 0;
    for (let k = 0; k < f.diamonds.length; k++) {
      const dm = f.diamonds[k];
      dm.material.opacity = ab ? (0.55 - k * 0.15) * flick : 0;
      // the flame is stretched along z, so squash the diamond back into a lens shape
      dm.scale.set(f.r * (0.55 - k * 0.1), f.r * (0.55 - k * 0.1), (f.r * 0.5) / Math.max(0.5, len));
    }
    f.inner.material.color.setRGB(0.06 + throttle * 0.22 + (ab ? 0.7 : 0), 0.03 + throttle * 0.06 + (ab ? 0.35 : 0), 0.02 + (ab ? 0.05 : 0));
  }
}

// ------------------------------------------------------------------ missiles
export function buildMissileMesh(withFlame = true) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 2.6, 10), MISSILE_MAT);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.35, 10), MISSILE_MAT);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -1.47;
  g.add(nose);
  const finMat = MISSILE_MAT;
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.32, 0.28), finMat);
    fin.position.z = 1.1;
    fin.rotation.z = (i * Math.PI) / 2;
    fin.position.x = Math.sin((i * Math.PI) / 2) * -0.14;
    fin.position.y = Math.cos((i * Math.PI) / 2) * 0.14;
    g.add(fin);
    const can = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.16), finMat);
    can.position.set(fin.position.x * 0.9, fin.position.y * 0.9, -0.9);
    can.rotation.z = fin.rotation.z;
    g.add(can);
  }
  // seeker dome and identification bands
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.074, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), SENSOR);
  dome.rotation.x = -Math.PI / 2;
  dome.position.z = -1.6;
  g.add(dome);
  for (const [bz, col] of [[-1.2, 0xd9b52c], [-0.85, 0x8a5a2b], [0.6, 0x8a5a2b]]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.077, 0.077, 0.06, 10), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }));
    band.rotation.x = Math.PI / 2;
    band.position.z = bz;
    g.add(band);
  }
  if (withFlame) {
    const fm = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const fg = new THREE.ConeGeometry(0.12, 1.6, 10, 1, true);
    fg.rotateX(-Math.PI / 2); fg.translate(0, 0, 2.1);
    const flame = new THREE.Mesh(fg, fm);
    g.add(flame);
    g.userData.flame = flame;
  }
  return g;
}
