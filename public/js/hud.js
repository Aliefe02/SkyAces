// 2D heads-up display drawn on a canvas overlay.
import * as THREE from 'three';
import { CONFIG, WEAPON_NAMES } from '/shared/config.js';

const GREEN = '#86ff9e';
const GREEN_DIM = 'rgba(134,255,158,0.55)';
const RED = '#ff4b4b';
const YELLOW = '#ffd84b';
const _v = new THREE.Vector3();

export class HUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.dpr = dpr;
    this.w = innerWidth; this.h = innerHeight;
    this.canvas.width = this.w * dpr; this.canvas.height = this.h * dpr;
    this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px';
  }

  // world point -> screen {x, y, on (in front of camera)}
  project(camera, p) {
    _v.copy(p).project(camera);
    const behind = _v.z > 1;
    return { x: (_v.x * 0.5 + 0.5) * this.w, y: (-_v.y * 0.5 + 0.5) * this.h, on: !behind, ndcX: _v.x, ndcY: _v.y };
  }

  clear() {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
  }

  draw(camera, d) {
    this.clear();
    const g = this.ctx, W = this.w, H = this.h;
    g.lineWidth = 1.6;
    g.font = '600 13px "Rajdhani", "Segoe UI", sans-serif';
    g.textBaseline = 'middle';

    const pos = d.pos;
    const fwd = d.fwd;

    // ---- pitch ladder
    this.ladder(camera, d);

    // ---- boresight / gun cross
    const bs = this.project(camera, _v.copy(pos).addScaledVector(fwd, 1000));
    const bsx = bs.x, bsy = bs.y;
    if (bs.on) {
      g.strokeStyle = GREEN;
      g.beginPath();
      g.moveTo(bsx - 14, bsy); g.lineTo(bsx - 5, bsy);
      g.moveTo(bsx + 5, bsy); g.lineTo(bsx + 14, bsy);
      g.moveTo(bsx, bsy - 14); g.lineTo(bsx, bsy - 5);
      g.moveTo(bsx, bsy + 5); g.lineTo(bsx, bsy + 10);
      g.stroke();
    }

    // ---- flight path marker
    if (d.speed > 5) {
      const fp = this.project(camera, _v.copy(pos).addScaledVector(d.vel, 1000 / d.speed));
      if (fp.on) {
        g.strokeStyle = GREEN;
        g.beginPath(); g.arc(fp.x, fp.y, 7, 0, Math.PI * 2);
        g.moveTo(fp.x - 7, fp.y); g.lineTo(fp.x - 17, fp.y);
        g.moveTo(fp.x + 7, fp.y); g.lineTo(fp.x + 17, fp.y);
        g.moveTo(fp.x, fp.y - 7); g.lineTo(fp.x, fp.y - 13);
        g.stroke();
      }
    }

    // ---- lock cone
    if (d.weapon === 'lock' && bs.on) {
      const r = (Math.tan(d.weaponsInfo.lock.lockCone) / Math.tan((camera.fov * Math.PI) / 360)) * (H / 2);
      g.save();
      g.setLineDash([6, 8]);
      g.strokeStyle = d.lockTarget ? RED : GREEN_DIM;
      g.beginPath(); g.arc(bsx, bsy, Math.min(r, H * 0.6), 0, Math.PI * 2); g.stroke();
      g.restore();
      g.fillStyle = d.lockTarget ? RED : GREEN_DIM;
      g.textAlign = 'center';
      g.fillText(d.lockTarget ? 'LOCKED — FIRE!' : `SEEKING  ·  RANGE ${(d.weaponsInfo.lock.lockRange / 1000).toFixed(1)} km`, bsx, bsy + Math.min(r, H * 0.6) + 16);
    }

    // ---- targets
    for (const t of d.targets) this.target(camera, t, d);

    // ---- gun lead pipper
    if (d.lead && d.weapon === 'gun') {
      const lp = this.project(camera, d.lead.point);
      if (lp.on) {
        g.strokeStyle = d.lead.onTarget ? RED : YELLOW;
        g.lineWidth = 2;
        g.beginPath(); g.arc(lp.x, lp.y, 9, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.arc(lp.x, lp.y, 1.8, 0, Math.PI * 2); g.fillStyle = g.strokeStyle; g.fill();
        g.lineWidth = 1.6;
      }
    }

    // ---- hit marker
    if (d.hitMarker > 0) {
      g.strokeStyle = `rgba(255,255,255,${Math.min(1, d.hitMarker * 4)})`;
      g.lineWidth = 2.5;
      g.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.moveTo(bsx + sx * 8, bsy + sy * 8); g.lineTo(bsx + sx * 16, bsy + sy * 16); }
      g.stroke();
      g.lineWidth = 1.6;
    }

    // ---- mouse stick
    if (d.mouseStick) {
      const cx = W / 2, cy = H / 2, R = 60;
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath(); g.arc(cx + d.mouseStick.x * R, cy + d.mouseStick.y * R, 3.5, 0, Math.PI * 2); g.fill();
    }

    this.tapes(d);
    // (the tactical map in public/js/map.js now occupies the bottom-left corner)
    this.weapons(d);
    this.warnings(d);
  }

  ladder(camera, d) {
    const g = this.ctx;
    const heading = d.info.heading;
    const sinH = Math.sin(heading), cosH = Math.cos(heading);
    const dirAt = (pitchDeg, dh) => {
      const p = (pitchDeg * Math.PI) / 180;
      const h = heading + dh;
      return new THREE.Vector3(Math.sin(h) * Math.cos(p), Math.sin(p), -Math.cos(h) * Math.cos(p));
    };
    const cur = (d.info.pitch * 180) / Math.PI;
    g.save();
    g.font = '600 11px "Rajdhani", sans-serif';
    for (let p = -80; p <= 80; p += 10) {
      if (Math.abs(p - cur) > 35) continue;
      const half = p === 0 ? 0.16 : 0.07;
      const gap = p === 0 ? 0.03 : 0.025;
      const segs = [[-half, -gap], [gap, half]];
      g.strokeStyle = p === 0 ? GREEN : GREEN_DIM;
      g.setLineDash(p < 0 ? [5, 5] : []);
      for (const [a, b] of segs) {
        const A = this.project(camera, _v.copy(d.camPos).addScaledVector(dirAt(p, a), 1000));
        const ax = A.x, ay = A.y, aon = A.on;
        const B = this.project(camera, _v.copy(d.camPos).addScaledVector(dirAt(p, b), 1000));
        if (!aon || !B.on) continue;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(B.x, B.y); g.stroke();
        if (p !== 0 && b === half) { g.fillStyle = GREEN_DIM; g.fillText(String(p), B.x + 6, B.y); }
      }
    }
    g.restore();
  }

  tapes(d) {
    const g = this.ctx, W = this.w, H = this.h;
    const cy = H / 2;
    // speed (left) and altitude (right) boxes
    const kmh = Math.round(d.speed * 3.6);
    const box = (x, label, value, sub) => {
      g.strokeStyle = GREEN; g.fillStyle = 'rgba(0,20,8,0.35)';
      g.fillRect(x - 48, cy - 16, 96, 32); g.strokeRect(x - 48, cy - 16, 96, 32);
      g.fillStyle = GREEN; g.textAlign = 'center';
      g.font = '700 20px "Rajdhani", sans-serif';
      g.fillText(value, x, cy + 1);
      g.font = '600 11px "Rajdhani", sans-serif';
      g.fillText(label, x, cy - 26);
      if (sub) g.fillText(sub, x, cy + 28);
    };
    box(W / 2 - Math.min(330, W * 0.3), 'SPEED km/h', String(kmh), `M ${(d.speed / 340).toFixed(2)}`);
    box(W / 2 + Math.min(330, W * 0.3), 'ALT m', String(Math.round(d.pos.y)), `AGL ${Math.round(d.agl)}`);

    // G / AoA / throttle under the speed box
    const lx = W / 2 - Math.min(330, W * 0.3) - 48;
    g.textAlign = 'left';
    g.font = '600 13px "Rajdhani", sans-serif';
    g.fillStyle = d.g > 8.5 ? YELLOW : GREEN;
    g.fillText(`G  ${d.g.toFixed(1)}`, lx, cy + 52);
    g.fillStyle = GREEN;
    g.fillText(`α  ${((d.aoa * 180) / Math.PI).toFixed(0)}°`, lx, cy + 70);
    g.fillStyle = d.ab ? '#ffa94b' : GREEN;
    if (d.brake) { g.fillStyle = YELLOW; g.fillText('AIR BRAKE', lx, cy + 88); }

    // throttle gauge: lever position 0–100% (afterburner range 90–100% in orange)
    const tx0 = lx - 34, th = 150, ty0 = cy - th / 2, tw0 = 12;
    g.fillStyle = 'rgba(0,20,8,0.35)'; g.fillRect(tx0, ty0, tw0, th);
    g.fillStyle = 'rgba(255,150,60,0.25)'; g.fillRect(tx0, ty0, tw0, th * 0.1);
    const lev = Math.max(0, Math.min(1, d.lever));
    g.fillStyle = lev > 0.9 ? '#ffa94b' : GREEN;
    g.fillRect(tx0, ty0 + th * (1 - lev), tw0, th * lev);
    g.strokeStyle = GREEN_DIM; g.strokeRect(tx0, ty0, tw0, th);
    g.beginPath(); g.moveTo(tx0 - 3, ty0 + th * 0.1); g.lineTo(tx0 + tw0 + 3, ty0 + th * 0.1); g.stroke();
    g.textAlign = 'center'; g.font = '700 16px "Rajdhani", sans-serif';
    g.fillStyle = lev > 0.9 ? '#ffa94b' : GREEN;
    g.fillText(`${Math.round(lev * 100)}%`, tx0 + tw0 / 2, ty0 + th + 14);
    g.font = '600 10px "Rajdhani", sans-serif';
    g.fillText(d.ab ? 'AB' : 'THR', tx0 + tw0 / 2, ty0 - 9);
    g.textAlign = 'left';

    // heading tape
    const hdg = (d.info.heading * 180) / Math.PI;
    const tw = Math.min(420, W * 0.5), tx = W / 2, ty = 44;
    g.save();
    g.beginPath(); g.rect(tx - tw / 2, ty - 20, tw, 40); g.clip();
    g.strokeStyle = GREEN; g.fillStyle = GREEN; g.textAlign = 'center';
    const pxPerDeg = tw / 90;
    for (let a = Math.floor(hdg - 50); a <= hdg + 50; a++) {
      if (a % 5) continue;
      const x = tx + (a - hdg) * pxPerDeg;
      const n = ((a % 360) + 360) % 360;
      g.beginPath(); g.moveTo(x, ty + 8); g.lineTo(x, ty + (n % 10 ? 13 : 17)); g.stroke();
      if (n % 30 === 0) {
        const lbl = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[n] ?? String(n / 10).padStart(2, '0');
        g.fillText(lbl, x, ty - 4);
      }
    }
    g.restore();
    g.fillStyle = GREEN;
    g.beginPath(); g.moveTo(tx, ty + 20); g.lineTo(tx - 5, ty + 27); g.lineTo(tx + 5, ty + 27); g.fill();
    g.font = '700 13px "Rajdhani", sans-serif';
    g.fillText(String(Math.round(hdg) % 360).padStart(3, '0'), tx, ty + 38);

    // health bar
    const hw = 260, hx = W / 2 - hw / 2, hy = H - 42;
    const frac = Math.max(0, d.hp / d.maxHp);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(hx, hy, hw, 10);
    g.fillStyle = frac > 0.5 ? '#5dff8a' : frac > 0.25 ? YELLOW : RED;
    g.fillRect(hx, hy, hw * frac, 10);
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.strokeRect(hx, hy, hw, 10);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '600 12px "Rajdhani", sans-serif';
    g.fillText(`${d.jetName}  ·  HULL ${Math.ceil(d.hp)} / ${d.maxHp}`, W / 2, hy - 10);
  }

  target(camera, t, d) {
    const g = this.ctx, W = this.w, H = this.h;
    const s = this.project(camera, t.pos);
    const col = t.locked ? RED : t.inLockZone ? YELLOW : t.protected ? 'rgba(255,255,255,0.6)' : '#ff6b6b';
    const distTxt = t.dist < 1000 ? `${Math.round(t.dist)} m` : `${(t.dist / 1000).toFixed(1)} km`;
    const margin = 30;
    const onScreen = s.on && s.x > margin && s.x < W - margin && s.y > margin && s.y < H - margin;
    if (onScreen) {
      const size = Math.max(10, Math.min(46, 2600 / Math.max(t.dist, 1)));
      g.strokeStyle = col; g.lineWidth = t.locked ? 2.5 : 1.6;
      if (t.locked) {
        g.beginPath(); g.moveTo(s.x, s.y - size - 4); g.lineTo(s.x + size + 4, s.y); g.lineTo(s.x, s.y + size + 4); g.lineTo(s.x - size - 4, s.y); g.closePath(); g.stroke();
      }
      const c = size * 0.45;
      g.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = s.x + sx * size, y = s.y + sy * size;
        g.moveTo(x, y - sy * c); g.lineTo(x, y); g.lineTo(x - sx * c, y);
      }
      g.stroke();
      g.lineWidth = 1.6;
      g.fillStyle = col; g.textAlign = 'center';
      g.font = '600 12px "Rajdhani", sans-serif';
      if (t.dist < 6000 || t.locked) {
        g.fillText(t.name, s.x, s.y - size - 12);
        g.fillText(`${t.jet} · ${distTxt}`, s.x, s.y + size + 12);
        // small health bar
        const bw = 36;
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(s.x - bw / 2, s.y + size + 21, bw, 3);
        g.fillStyle = col; g.fillRect(s.x - bw / 2, s.y + size + 21, bw * Math.max(0, t.hp / t.maxHp), 3);
      }
      if (t.locked) { g.font = '700 14px "Rajdhani", sans-serif'; g.fillText('LOCK', s.x, s.y - size - 28); }
    } else {
      // edge arrow toward an off-screen enemy
      let nx = s.ndcX, ny = s.ndcY;
      if (!s.on) { nx = -nx; ny = -ny; }
      const ang = Math.atan2(-ny, nx);
      const rx = W / 2 - 50, ry = H / 2 - 50;
      const k = Math.min(rx / Math.abs(Math.cos(ang) || 1e-6), ry / Math.abs(Math.sin(ang) || 1e-6));
      const x = W / 2 + Math.cos(ang) * k, y = H / 2 + Math.sin(ang) * k;
      g.save();
      g.translate(x, y); g.rotate(ang);
      g.fillStyle = col;
      g.beginPath(); g.moveTo(12, 0); g.lineTo(-6, -8); g.lineTo(-6, 8); g.closePath(); g.fill();
      g.restore();
      if (t.dist < 3000) {
        g.fillStyle = col; g.textAlign = 'center'; g.font = '600 11px "Rajdhani", sans-serif';
        g.fillText(distTxt, x - Math.cos(ang) * 22, y - Math.sin(ang) * 22);
      }
    }
  }

  radar(d) {
    const g = this.ctx, H = this.h;
    const R = 78, cx = 24 + R, cy = H - 24 - R;
    const range = 5000;
    g.fillStyle = 'rgba(0,25,10,0.45)';
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = GREEN_DIM;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, R / 2, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.stroke();
    const h = d.info.heading;
    const toRadar = (p) => {
      const dx = p.x - d.pos.x, dz = p.z - d.pos.z;
      // rotate so our heading points up
      const rx = dx * Math.cos(h) + dz * Math.sin(h);
      const ry = -dx * Math.sin(h) + dz * Math.cos(h);
      let x = (rx / range) * R, y = (ry / range) * R;
      const l = Math.hypot(x, y);
      if (l > R - 3) { x *= (R - 3) / l; y *= (R - 3) / l; }
      return [cx + x, cy + y];
    };
    for (const t of d.targets) {
      const [x, y] = toRadar(t.pos);
      g.fillStyle = t.locked ? RED : '#ff7070';
      const above = t.pos.y > d.pos.y + 300, below = t.pos.y < d.pos.y - 300;
      g.beginPath();
      if (above) { g.moveTo(x, y - 4); g.lineTo(x + 4, y + 3); g.lineTo(x - 4, y + 3); }
      else if (below) { g.moveTo(x, y + 4); g.lineTo(x + 4, y - 3); g.lineTo(x - 4, y - 3); }
      else g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
    for (const m of d.missiles) {
      const [x, y] = toRadar(m.pos);
      g.fillStyle = m.threat ? RED : '#fff';
      g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // map boundary hint
    const edge = Math.max(Math.abs(d.pos.x), Math.abs(d.pos.z));
    g.fillStyle = GREEN; g.textAlign = 'center'; g.font = '600 11px "Rajdhani", sans-serif';
    g.fillText('5 km', cx, cy + R + 12);
    g.beginPath(); g.moveTo(cx, cy - 6); g.lineTo(cx + 5, cy + 5); g.lineTo(cx - 5, cy + 5); g.closePath(); g.fill();
    if (edge > CONFIG.MAP_HALF * 0.85) { g.fillStyle = YELLOW; g.fillText('NEAR BOUNDARY', cx, cy - R - 10); }
  }

  weapons(d) {
    // status text, bar fraction, bad flag and ammo for a missile magazine
    const magRow = (m) => {
      const ammoTxt = m.mag > 1 ? `${m.ammo}/${m.mag}  ` : '';
      let status;
      if (m.ammo > 0) status = m.reloadLeft > 0 ? `${ammoTxt}READY · refill ${m.reloadLeft.toFixed(1)}s` : `${ammoTxt}READY`;
      else status = `${ammoTxt}RELOAD ${m.reloadLeft.toFixed(1)}s`;
      const frac = m.reloadLeft > 0 ? 1 - m.reloadLeft / m.reload : 1;
      return [status, frac, false, m];
    };
    const g = this.ctx, W = this.w, H = this.h;
    const x = W - 250, y0 = H - 176;
    g.textAlign = 'left';
    const rows = [
      ['gun', '1', d.weaponsInfo.gun.name.toUpperCase(), d.overheated ? 'OVERHEAT' : `HEAT ${Math.round(d.heat * 100)}%`, 1 - d.heat, d.overheated],
      ['lock', '2', d.weaponsInfo.lock.name.toUpperCase() + ' (LOCK)', ...magRow(d.mags.lock)],
      ['dumb', '3', 'ROCKETS (NO LOCK)', ...magRow(d.mags.dumb)],
      ['flare', 'F', `FLARES ×${d.weaponsInfo.flares.count}`, d.flareCd > 0 ? `COOLDOWN ${d.flareCd.toFixed(1)}s` : 'READY', 1 - d.flareCd / d.flareMax, false],
    ];
    rows.forEach(([id, key, name, status, frac, bad, ammo], i) => {
      const y = y0 + i * 36;
      const sel = d.weapon === id;
      g.fillStyle = sel ? 'rgba(134,255,158,0.18)' : 'rgba(0,0,0,0.35)';
      g.fillRect(x, y, 226, 30);
      if (sel) { g.strokeStyle = GREEN; g.strokeRect(x, y, 226, 30); }
      g.fillStyle = sel ? GREEN : 'rgba(255,255,255,0.75)';
      g.font = '700 13px "Rajdhani", sans-serif';
      g.fillText(`[${key}] ${name}`, x + 8, y + 10);
      if (ammo) {
        // one pip per missile in the magazine: filled = loaded
        for (let k = 0; k < ammo.mag; k++) {
          const px = x + 214 - (ammo.mag - 1 - k) * 11, py = y + 10;
          g.beginPath(); g.arc(px, py, 4, 0, Math.PI * 2);
          if (k < ammo.ammo) { g.fillStyle = GREEN; g.fill(); }
          else { g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.2; g.stroke(); }
        }
        g.lineWidth = 1.6;
      }
      g.font = '600 11px "Rajdhani", sans-serif';
      g.fillStyle = bad ? RED : status.includes('READY') ? GREEN : YELLOW;
      g.fillText(status, x + 8, y + 23);
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x + 110, y + 20, 108, 4);
      g.fillStyle = bad ? RED : GREEN; g.fillRect(x + 110, y + 20, 108 * Math.max(0, Math.min(1, frac)), 4);
    });
  }

  warnings(d) {
    const g = this.ctx, W = this.w, H = this.h;
    const blink = Math.floor(d.time * 4) % 2 === 0;
    const msgs = [];
    if (d.missileWarning) msgs.push([RED, d.flareCd > 0 ? '⚠ MISSILE INCOMING — BREAK HARD!' : '⚠ MISSILE INCOMING — PRESS F FOR FLARES', true]);
    if (d.pullUp) msgs.push([RED, 'PULL UP', true]);
    if (d.stalled) msgs.push([YELLOW, 'STALL', true]);
    if (d.superM) msgs.push(['#9fd8ff', 'POST-STALL BRAKING', false]);
    if (d.oob != null) msgs.push([YELLOW, `RETURN TO COMBAT AREA  ${Math.ceil(d.oob)}`, false]);
    if (d.protected > 0) msgs.push(['#9fd8ff', `SPAWN PROTECTION ${d.protected.toFixed(1)}s`, false]);
    g.textAlign = 'center';
    g.font = '700 22px "Rajdhani", sans-serif';
    msgs.forEach(([c, m, bl], i) => {
      if (bl && !blink) return;
      g.fillStyle = c;
      g.fillText(m, W / 2, H * 0.24 + i * 30);
    });
  }
}
