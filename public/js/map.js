// Tactical map. Small and north-up in the bottom-left corner while flying; press M and it
// grows out of that corner. While it is open the mouse belongs to the map:
// wheel = zoom (around the cursor), drag = move. The keyboard still flies the jet.
import { CONFIG } from '/shared/config.js';
import { terrainHeight } from '/shared/terrain.js';
import { buildings, parks, CITY_HALF } from '/shared/city.js';

const WORLD_R = 10500;        // the background image covers -R..R in x and z
const IMG = 640;              // background resolution (~33 m per pixel)
const SMALL = 210;            // corner map size in px
const SMALL_SPAN = 9000;      // meters shown across the corner map
const MARGIN = 16;

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

export class TacticalMap {
  constructor(input) {
    this.input = input;
    this.open = false;
    this.anim = 0;                 // 0 = corner, 1 = expanded
    this.view = { x: 0, z: 0, mpp: 30 };
    this.drag = null;
    this.rect = { x: 0, y: 0, w: SMALL, h: SMALL };
    this.bg = this.buildBackground();

    addEventListener('wheel', (e) => {
      if (!this.open || !this.inside(e.clientX, e.clientY)) return;
      const before = this.screenToWorld(e.clientX, e.clientY);
      const f = Math.exp(Math.sign(e.deltaY) * 0.18);
      this.view.mpp = Math.max(1.2, Math.min(60, this.view.mpp * f));
      const after = this.screenToWorld(e.clientX, e.clientY);
      // keep the point under the cursor fixed while zooming
      this.view.x += before.x - after.x;
      this.view.z += before.z - after.z;
    }, { passive: true });
    addEventListener('mousedown', (e) => {
      if (!this.open || !this.inside(e.clientX, e.clientY)) return;
      this.drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vz: this.view.z };
      document.body.style.cursor = 'grabbing';
    });
    addEventListener('mousemove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      if (!this.drag) return;
      this.view.x = this.drag.vx - (e.clientX - this.drag.x) * this.view.mpp;
      this.view.z = this.drag.vz - (e.clientY - this.drag.y) * this.view.mpp;
    });
    addEventListener('mouseup', () => { this.drag = null; if (this.open) document.body.style.cursor = 'grab'; });
  }

  // ---------------------------------------------------------------- background image
  buildBackground() {
    const c = document.createElement('canvas');
    c.width = c.height = IMG;
    const g = c.getContext('2d');
    const img = g.createImageData(IMG, IMG);
    const H = new Float32Array(IMG * IMG);
    const step = (WORLD_R * 2) / IMG;
    for (let j = 0; j < IMG; j++) {
      for (let i = 0; i < IMG; i++) H[j * IMG + i] = terrainHeight(-WORLD_R + (i + 0.5) * step, -WORLD_R + (j + 0.5) * step);
    }
    for (let j = 0; j < IMG; j++) {
      for (let i = 0; i < IMG; i++) {
        const h = H[j * IMG + i];
        let r, gg, b;
        if (h < 0) {
          const d = Math.min(1, -h / 160);
          r = 52 - 20 * d; gg = 98 - 30 * d; b = 128 - 20 * d;
        } else {
          if (h < 25) { r = 196; gg = 184; b = 140; }
          else if (h < 450) { const t = h / 450; r = lerp(96, 62, t); gg = lerp(128, 92, t); b = lerp(62, 44, t); }
          else if (h < 1300) { const t = (h - 450) / 850; r = lerp(62, 122, t); gg = lerp(92, 114, t); b = lerp(44, 104, t); }
          else { const t = Math.min(1, (h - 1300) / 300); r = lerp(122, 240, t); gg = lerp(114, 242, t); b = lerp(104, 246, t); }
          // hill shading, light from the north-west
          const hl = H[j * IMG + Math.max(0, i - 1)], hu = H[Math.max(0, j - 1) * IMG + i];
          const shade = Math.max(0.55, Math.min(1.35, 1 + ((hl - h) + (hu - h)) * 0.012));
          r *= shade; gg *= shade; b *= shade;
        }
        const k = (j * IMG + i) * 4;
        img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // city: street grid, parks and building footprints
    if (CITY_HALF) {
      const w2p = (v) => ((v + WORLD_R) / (WORLD_R * 2)) * IMG;
      const s = IMG / (WORLD_R * 2);
      g.fillStyle = '#6d6f72';
      g.fillRect(w2p(-CITY_HALF), w2p(-CITY_HALF), CITY_HALF * 2 * s, CITY_HALF * 2 * s);
      g.fillStyle = '#5c8a45';
      for (const p of parks) g.fillRect(w2p(p.x - p.size / 2), w2p(p.z - p.size / 2), p.size * s, p.size * s);
      for (const b of buildings) {
        const t = Math.min(1, b.h / 400);
        g.fillStyle = `rgb(${lerp(178, 70, t)},${lerp(176, 76, t)},${lerp(170, 92, t)})`;
        g.fillRect(w2p(b.x - b.w / 2), w2p(b.z - b.d / 2), Math.max(1, b.w * s), Math.max(1, b.d * s));
      }
    }
    return c;
  }

  // ---------------------------------------------------------------- layout / control
  inside(x, y) {
    const r = this.rect;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  screenToWorld(sx, sy) {
    const r = this.rect;
    return { x: this.view.x + (sx - (r.x + r.w / 2)) * this.view.mpp, z: this.view.z + (sy - (r.y + r.h / 2)) * this.view.mpp };
  }

  bigRect(W, H) {
    const w = Math.min(W - MARGIN * 2, Math.max(SMALL, W * 0.62));
    const h = Math.min(H - MARGIN * 2 - 40, Math.max(SMALL, H * 0.72));
    return { x: MARGIN, y: H - MARGIN - h, w, h };
  }

  toggle(playerPos, W, H) {
    this.open = !this.open;
    this.input.mapOpen = this.open;
    this.drag = null;
    if (this.open) {
      // open centered on the player, zoomed so the whole combat area fits
      const big = this.bigRect(W, H);
      this.view.x = playerPos ? playerPos.x : 0;
      this.view.z = playerPos ? playerPos.z : 0;
      this.view.mpp = Math.max(4, (CONFIG.MAP_HALF * 2.1) / Math.min(big.w, big.h));
      document.exitPointerLock?.();
      document.body.style.cursor = 'grab';
    } else {
      document.body.style.cursor = '';
    }
    return this.open;
  }

  // close immediately (death / menu), without the shrink animation
  close() { if (this.open) this.toggle(null, 0, 0); this.anim = 0; }

  // ---------------------------------------------------------------- drawing
  // d: { me: {pos, fwd}, enemies: [{pos, fwd, name, jet, locked}], missiles: [{pos, threat}], flares: [{x,z}], dt }
  draw(g, W, H, d) {
    this.anim = Math.max(0, Math.min(1, this.anim + (this.open ? 1 : -1) * d.dt * 5));
    const a = ease(this.anim);
    const small = { x: MARGIN, y: H - MARGIN - SMALL, w: SMALL, h: SMALL };
    const big = this.bigRect(W, H);
    const r = (this.rect = { x: small.x, y: lerp(small.y, big.y, a), w: lerp(small.w, big.w, a), h: lerp(small.h, big.h, a) });

    // corner map follows the player; the big map uses its own pan / zoom
    const follow = { x: d.me.pos.x, z: d.me.pos.z, mpp: SMALL_SPAN / SMALL };
    const cx = lerp(follow.x, this.view.x, a), cz = lerp(follow.z, this.view.z, a);
    const mpp = Math.exp(lerp(Math.log(follow.mpp), Math.log(this.view.mpp), a));
    const toS = (x, z) => [r.x + r.w / 2 + (x - cx) / mpp, r.y + r.h / 2 + (z - cz) / mpp];

    g.save();
    g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    g.fillStyle = '#26475f'; g.fillRect(r.x, r.y, r.w, r.h);
    g.globalAlpha = 0.92;
    const [ix, iy] = toS(-WORLD_R, -WORLD_R);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.bg, ix, iy, (WORLD_R * 2) / mpp, (WORLD_R * 2) / mpp);
    g.globalAlpha = 1;

    // zoomed in far enough: sharp building outlines on top of the image
    if (mpp < 7 && CITY_HALF) {
      const x0 = cx - (r.w / 2) * mpp, x1 = cx + (r.w / 2) * mpp, z0 = cz - (r.h / 2) * mpp, z1 = cz + (r.h / 2) * mpp;
      for (const b of buildings) {
        if (b.x + b.w < x0 || b.x - b.w > x1 || b.z + b.d < z0 || b.z - b.d > z1) continue;
        const t = Math.min(1, b.h / 400);
        const [sx, sy] = toS(b.x - b.w / 2, b.z - b.d / 2);
        g.fillStyle = `rgb(${lerp(190, 70, t)},${lerp(188, 78, t)},${lerp(182, 98, t)})`;
        g.fillRect(sx, sy, b.w / mpp, b.d / mpp);
        g.strokeStyle = 'rgba(30,30,30,0.5)'; g.lineWidth = 1; g.strokeRect(sx, sy, b.w / mpp, b.d / mpp);
        if (mpp < 2.5 && b.h > 60) { g.fillStyle = '#222'; g.font = '10px sans-serif'; g.textAlign = 'center'; g.fillText(`${Math.round(b.h)}m`, sx + b.w / mpp / 2, sy + b.d / mpp / 2 + 3); }
      }
    }

    // grid (2 km, 1 km when zoomed in) with labels on the big map
    const grid = mpp < 6 ? 1000 : 2000;
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
    g.font = '600 10px "Rajdhani", sans-serif'; g.fillStyle = 'rgba(255,255,255,0.45)';
    for (let x = Math.ceil((cx - (r.w / 2) * mpp) / grid) * grid; x < cx + (r.w / 2) * mpp; x += grid) {
      const [sx] = toS(x, 0);
      g.beginPath(); g.moveTo(sx, r.y); g.lineTo(sx, r.y + r.h); g.stroke();
      if (a > 0.5) { g.textAlign = 'left'; g.fillText(`${x / 1000}km`, sx + 3, r.y + 12); }
    }
    for (let z = Math.ceil((cz - (r.h / 2) * mpp) / grid) * grid; z < cz + (r.h / 2) * mpp; z += grid) {
      const [, sy] = toS(0, z);
      g.beginPath(); g.moveTo(r.x, sy); g.lineTo(r.x + r.w, sy); g.stroke();
      if (a > 0.5) { g.textAlign = 'left'; g.fillText(`${-z / 1000}km`, r.x + 3, sy - 3); }
    }

    // combat-area boundary
    const M = CONFIG.MAP_HALF;
    const [bx, by] = toS(-M, -M);
    g.setLineDash([8, 6]); g.strokeStyle = 'rgba(255,70,70,0.85)'; g.lineWidth = 2;
    g.strokeRect(bx, by, (M * 2) / mpp, (M * 2) / mpp);
    g.setLineDash([]);

    // landmark label
    if (a > 0.3 && CITY_HALF) {
      const [tx, ty] = toS(0, 0);
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.textAlign = 'center'; g.font = '700 12px "Rajdhani", sans-serif';
      g.fillText('CITY', tx, ty - CITY_HALF / mpp - 6);
    }

    // flares, missiles
    g.fillStyle = '#ffb347';
    for (const f of d.flares) { const [sx, sy] = toS(f.x, f.z); g.fillRect(sx - 1, sy - 1, 2, 2); }
    for (const m of d.missiles) {
      const [sx, sy] = toS(m.pos.x, m.pos.z);
      g.fillStyle = m.threat ? '#ff3b3b' : '#ffffff';
      g.beginPath(); g.arc(sx, sy, m.threat ? 3 : 2, 0, Math.PI * 2); g.fill();
    }

    // aircraft
    const plane = (pos, fwd, color, size, label, sub) => {
      const [sx, sy] = toS(pos.x, pos.z);
      const ang = Math.atan2(fwd.x, -fwd.z); // 0 = north
      g.save();
      g.translate(sx, sy); g.rotate(ang);
      g.fillStyle = color; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, -size); g.lineTo(size * 0.7, size * 0.8); g.lineTo(0, size * 0.35); g.lineTo(-size * 0.7, size * 0.8); g.closePath();
      g.fill(); g.stroke();
      g.restore();
      if (label && a > 0.4) {
        g.font = '600 11px "Rajdhani", sans-serif'; g.textAlign = 'left';
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(label, sx + size + 4, sy + 1);
        g.fillStyle = color; g.fillText(label, sx + size + 3, sy);
        if (sub) { g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillText(sub, sx + size + 3, sy + 12); }
      }
    };
    for (const e of d.enemies) {
      const alt = e.pos.y - d.me.pos.y;
      const altTxt = Math.abs(alt) < 150 ? 'same alt' : `${alt > 0 ? '▲' : '▼'} ${Math.abs(Math.round(alt / 100) * 100)} m`;
      plane(e.pos, e.fwd, e.locked ? '#ff2a2a' : '#ff6b6b', 7, `${e.name} · ${e.jet}`, `${(e.dist / 1000).toFixed(1)} km · ${altTxt}`);
    }
    plane(d.me.pos, d.me.fwd, '#86ff9e', 8, a > 0.4 ? 'YOU' : null);

    g.restore();

    // frame, north marker, scale bar, help
    g.strokeStyle = 'rgba(134,255,158,0.65)'; g.lineWidth = 1.5;
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    g.fillStyle = '#86ff9e'; g.font = '700 12px "Rajdhani", sans-serif'; g.textAlign = 'center';
    g.fillText('N ▲', r.x + r.w - 20, r.y + 14);
    const barM = mpp * 80 > 3000 ? 5000 : mpp * 80 > 1200 ? 2000 : mpp * 80 > 600 ? 1000 : mpp * 80 > 250 ? 500 : 200;
    const barPx = barM / mpp;
    const sbx = r.x + 10, sby = r.y + r.h - 12;
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(sbx - 4, sby - 14, barPx + 50, 20);
    g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(sbx, sby - 4); g.lineTo(sbx, sby); g.lineTo(sbx + barPx, sby); g.lineTo(sbx + barPx, sby - 4); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = '600 11px "Rajdhani", sans-serif';
    g.fillText(barM >= 1000 ? `${barM / 1000} km` : `${barM} m`, sbx + barPx + 6, sby);
    if (a > 0.6) {
      g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillText('Wheel: zoom · Drag: move · M: close', r.x + r.w - 10, r.y + r.h - 8);
      // cursor readout
      if (this.mouse && this.inside(this.mouse.x, this.mouse.y)) {
        const w = this.screenToWorld(this.mouse.x, this.mouse.y);
        const dist = Math.hypot(w.x - d.me.pos.x, w.z - d.me.pos.z);
        g.textAlign = 'left';
        g.fillText(`${(dist / 1000).toFixed(2)} km from you`, this.mouse.x + 14, this.mouse.y + 18);
      }
    } else {
      g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillText('M: map', r.x + r.w - 6, r.y + r.h - 6);
    }
  }
}
