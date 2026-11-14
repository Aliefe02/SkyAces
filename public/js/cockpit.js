// First-person cockpit. Drawn as a separate layer on top of the world (its own scene, rendered
// after clearing depth), so the jet's own fuselage can never cover it and the camera always sits
// inside the cockpit: instrument panel with live displays, HUD glass, consoles, stick and
// throttle that follow your inputs, your legs, canopy glass and frames.
import * as THREE from 'three';
import { SUN_DIR } from './world.js';

const mat = (color, rough = 0.75, metal = 0.2) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const PANEL = mat(0x2b2f35, 0.85, 0.15);
const PANEL_DARK = mat(0x1b1e22, 0.9, 0.1);
const WALL = mat(0x3a3f46, 0.85, 0.1);
const SUIT = mat(0x4b5536, 0.95, 0);
const BOOT = mat(0x1a1a1a, 0.7, 0.1);
const METAL = mat(0x8a9097, 0.4, 0.8);
const GRIP = mat(0x1d1d1d, 0.9, 0);
const YELLOW = mat(0xe0b818, 0.6, 0.1);
const FRAME = mat(0x30343a, 0.6, 0.5);

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { c, g: c.getContext('2d'), tex };
}

// static texture for side consoles: panels, knobs and switches
function consoleTexture() {
  const { g, tex } = canvas(256, 512);
  g.fillStyle = '#2c3036'; g.fillRect(0, 0, 256, 512);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 8; y < 500; y += 70) {
    g.strokeStyle = '#4a5058'; g.lineWidth = 3; g.strokeRect(10, y, 236, 62);
    for (let k = 0; k < 5; k++) {
      const x = 30 + k * 45, yy = y + 30;
      if (rnd() < 0.5) { g.beginPath(); g.arc(x, yy, 11, 0, Math.PI * 2); g.fillStyle = '#15171a'; g.fill(); g.fillStyle = '#c8c8c8'; g.fillRect(x - 1, yy - 11, 2, 9); }
      else { g.fillStyle = '#9aa0a6'; g.fillRect(x - 3, yy - 12, 6, 20); g.fillStyle = '#e8e8e8'; g.fillRect(x - 6, yy - 16, 12, 6); }
    }
    g.fillStyle = 'rgba(230,230,230,0.6)'; g.font = '11px monospace'; g.fillText(['RADIO', 'IFF', 'LIGHTS', 'FUEL', 'ENG', 'EW', 'NAV'][Math.floor(y / 70) % 7], 16, y + 58);
  }
  return tex;
}

function keypadTexture() {
  const { g, tex } = canvas(128, 64);
  g.fillStyle = '#1e2126'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#062010'; g.fillRect(6, 4, 116, 16);
  g.fillStyle = '#3cff7a'; g.font = '10px monospace'; g.fillText('UHF 251.0  TCN', 10, 15);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) { g.fillStyle = '#444a52'; g.fillRect(8 + c * 19, 24 + r * 13, 15, 10); }
  return tex;
}

export class Cockpit {
  constructor() {
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.0);
    sun.position.copy(SUN_DIR).multiplyScalar(100);
    this.scene.add(sun, sun.target);
    this.scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x55643f, 1.1));
    this.jet = null;
    this.mfdTimer = 0;
  }

  // eye position for a jet: just above the seat, inside the canopy
  static eyeFor(def) {
    const cn = def.model.canopy;
    return new THREE.Vector3(0, cn.y + 0.16, cn.z + 0.18);
  }

  build(def, environment) {
    if (this.jet === def.id) return;
    this.jet = def.id;
    this.scene.environment = environment || null;
    this.root.clear();
    const M = def.model, cn = M.canopy;
    const E = Cockpit.eyeFor(def);
    const ey = E.y, ez = E.z;
    const W = Math.min(0.8, cn.rx * 1.7);    // cockpit width
    const panelZ = ez - 0.72;
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, parent = this.root) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      parent.add(mesh);
      return mesh;
    };

    // ---- tub: floor, side walls, canopy sills
    add(new THREE.BoxGeometry(W, 0.02, 1.25), PANEL_DARK, 0, ey - 0.88, ez - 0.25);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.03, 0.5, 1.3), WALL, s * (W / 2 + 0.01), ey - 0.5, ez - 0.25);
      add(new THREE.BoxGeometry(0.08, 0.035, 1.5), FRAME, s * (W / 2 - 0.01), ey - 0.24, ez - 0.2);
    }

    // ---- instrument panel
    const panel = add(new THREE.BoxGeometry(W * 0.86, 0.42, 0.06), PANEL, 0, ey - 0.38, panelZ, -0.22);
    // glare shield: a slim hood over the panel with a rounded front lip
    const glare = add(new THREE.BoxGeometry(W * 0.82, 0.03, 0.17), PANEL, 0, ey - 0.165, panelZ - 0.02);
    add(new THREE.CylinderGeometry(0.018, 0.018, W * 0.82, 12), PANEL_DARK, 0, ey - 0.165, panelZ + 0.065, 0, 0, Math.PI / 2);
    glare.castShadow = false;

    // displays: F-35 gets one wide panoramic screen, everyone else three MFDs
    this.displays = [];
    const screen = (w, h, x, y, kind) => {
      const cv = canvas(kind === 'wide' ? 512 : 256, kind === 'wide' ? 192 : 256);
      const m = new THREE.MeshBasicMaterial({ map: cv.tex, toneMapped: false });
      const bezel = add(new THREE.BoxGeometry(w + 0.03, h + 0.03, 0.015), PANEL_DARK, x, y, 0.035, 0, 0, 0, panel);
      add(new THREE.PlaneGeometry(w, h), m, 0, 0, 0.009, 0, 0, 0, bezel);
      // bezel buttons
      for (let k = 0; k < 5; k++) for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.012, 0.012, 0.01), METAL, sx * (w / 2 + 0.008), -h / 2 + (k + 0.5) * (h / 5), 0.01, 0, 0, 0, bezel);
      this.displays.push({ ...cv, kind });
    };
    if (M.cockpit === 'wide') screen(W * 0.78, 0.2, 0, -0.06, 'wide');
    else {
      screen(0.15, 0.15, -W * 0.27, -0.07, 'radar');
      screen(0.12, 0.12, 0, -0.1, 'horizon');
      screen(0.15, 0.15, W * 0.27, -0.07, 'sms');
    }
    // small round standby gauges
    for (const gx of [-0.06, 0.06]) {
      const gauge = add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 20), PANEL_DARK, gx, 0.14, 0.035, Math.PI / 2, 0, 0, panel);
      add(new THREE.CircleGeometry(0.026, 20), new THREE.MeshBasicMaterial({ color: 0x0b0d0f }), 0, 0.011, 0, -Math.PI / 2, 0, 0, gauge);
    }

    // ---- HUD: combiner glass and frame on the glare shield, up-front control panel below it
    const hudZ = panelZ + 0.1;
    const hud = add(new THREE.PlaneGeometry(0.2, 0.15), new THREE.MeshPhysicalMaterial({ color: 0x9effc0, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.4, side: THREE.DoubleSide, depthWrite: false }), 0, ey - 0.05, hudZ, 0.22);
    hud.renderOrder = 2;
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.008, 0.16, 0.008), FRAME, s * 0.104, ey - 0.055, hudZ - 0.01, 0.22);
    add(new THREE.BoxGeometry(0.22, 0.04, 0.12), PANEL_DARK, 0, ey - 0.125, hudZ - 0.04);
    add(new THREE.BoxGeometry(0.2, 0.1, 0.04), new THREE.MeshStandardMaterial({ map: keypadTexture(), roughness: 0.8 }), 0, ey - 0.21, panelZ + 0.08, -0.35);

    // ---- side consoles
    const ctex = consoleTexture();
    for (const s of [-1, 1]) {
      const cm = new THREE.MeshStandardMaterial({ map: ctex, roughness: 0.85 });
      add(new THREE.BoxGeometry(0.14, 0.06, 0.66), [WALL, WALL, cm, WALL, WALL, WALL], s * (W / 2 - 0.08), ey - 0.56, ez - 0.12);
    }

    // ---- throttle (left console), moves with the throttle lever
    this.throttle = new THREE.Group();
    this.throttle.position.set(-(W / 2 - 0.08), ey - 0.52, ez - 0.02);
    this.root.add(this.throttle);
    add(new THREE.BoxGeometry(0.025, 0.025, 0.16), METAL, 0, 0.04, -0.07, 0, 0, 0, this.throttle);
    add(new THREE.BoxGeometry(0.05, 0.07, 0.09), GRIP, 0, 0.08, -0.15, 0, 0, 0, this.throttle);

    // ---- control stick: centre stick, or a side-stick on the right console (F-16 / F-22 / F-35)
    this.stick = new THREE.Group();
    const side = !!M.sideStick;
    if (side) this.stick.position.set(W / 2 - 0.08, ey - 0.53, ez - 0.2);
    else this.stick.position.set(0, ey - 0.86, ez - 0.32);
    this.root.add(this.stick);
    const len = side ? 0.1 : 0.4;
    add(new THREE.CylinderGeometry(0.012, 0.016, len, 8), METAL, 0, len / 2, 0, 0, 0, 0, this.stick);
    add(new THREE.BoxGeometry(0.045, 0.11, 0.05), GRIP, 0, len + 0.05, 0, 0, 0, 0, this.stick);
    add(new THREE.BoxGeometry(0.014, 0.014, 0.02), YELLOW, 0, len + 0.1, -0.02, 0, 0, 0, this.stick); // trigger/pickle
    if (!side) add(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 12), BOOT, 0, 0.02, 0, 0, 0, 0, this.stick);

    // ---- pilot's legs and boots on the rudder pedals
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.13, 0.13, 0.46), SUIT, s * 0.11, ey - 0.63, ez - 0.15, 0.25);
      add(new THREE.BoxGeometry(0.11, 0.42, 0.12), SUIT, s * 0.11, ey - 0.78, ez - 0.47, -0.35);
      add(new THREE.BoxGeometry(0.1, 0.07, 0.2), BOOT, s * 0.11, ey - 0.95, ez - 0.6);
      add(new THREE.BoxGeometry(0.11, 0.02, 0.15), METAL, s * 0.11, ey - 0.99, ez - 0.62, -0.5);
    }

    // ---- seat (visible when looking back) with headrest and ejection handle
    add(new THREE.BoxGeometry(0.5, 0.85, 0.12), PANEL_DARK, 0, ey - 0.38, ez + 0.32, -0.18);
    add(new THREE.BoxGeometry(0.36, 0.3, 0.16), PANEL_DARK, 0, ey + 0.1, ez + 0.36);
    add(new THREE.TorusGeometry(0.07, 0.012, 6, 14, Math.PI), YELLOW, 0, ey - 0.84, ez - 0.02, -Math.PI / 2);

    // ---- canopy glass from the inside + frame bows + mirrors
    const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.MeshPhysicalMaterial({
      color: cn.tint, transparent: true, opacity: 0.1, roughness: 0.03, metalness: 0.9, side: THREE.BackSide, depthWrite: false, envMapIntensity: 1.4,
    }));
    glass.scale.set(cn.rx, cn.ry, cn.rz);
    glass.position.set(0, cn.y, cn.z);
    glass.renderOrder = 3;
    this.root.add(glass);
    const bows = cn.frames || [];  // bubble canopies (F-16, F-22) have no frame in front
    for (const fz of bows) {
      const k = Math.sqrt(Math.max(0.05, 1 - fz * fz));
      const g = new THREE.TorusGeometry(1, 0.035, 6, 32, Math.PI);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { p.setX(i, p.getX(i) * cn.rx * k * 0.97); p.setY(i, p.getY(i) * cn.ry * k * 0.97); }
      g.computeVertexNormals();
      add(g, FRAME, 0, cn.y, cn.z + fz * cn.rz);
    }
    const mirror = new THREE.MeshStandardMaterial({ color: 0x9fb3c4, roughness: 0.02, metalness: 1 });
    // rear-view mirrors on the first canopy bow (or the windscreen edge on frameless canopies)
    const fz = bows.length ? Math.min(...bows) : -0.55, fk = Math.sqrt(1 - fz * fz);
    for (const mx of [-0.55, 0, 0.55]) {
      const a = Math.PI / 2 - mx;
      add(new THREE.BoxGeometry(0.12, 0.045, 0.01), mirror, Math.cos(a) * cn.rx * fk * 0.9, cn.y + Math.sin(a) * cn.ry * fk * 0.9 - 0.04, cn.z + fz * cn.rz + 0.06, 0.3);
    }
  }

  // ------------------------------------------------------------ per-frame update
  // d: { pitch, roll, yaw (stick), lever, heading, pitchAng, rollAng, speed, alt, g, contacts:[{bearing, dist, locked, alt}], lockRange,
  //      weapons:{gun, lock, dumb, flare}, hp, maxHp }
  update(d, dt) {
    // stick and throttle follow the controls
    if (this.stick) this.stick.rotation.set(-d.pitch * 0.28, 0, -d.roll * 0.28);
    if (this.throttle) this.throttle.rotation.x = -0.45 + d.lever * 0.9;
    this.mfdTimer -= dt;
    const slow = this.mfdTimer <= 0;
    if (slow) this.mfdTimer = 0.12;
    for (const s of this.displays) {
      if (s.kind === 'horizon') { this.drawHorizon(s.g, 256, 256, d); s.tex.needsUpdate = true; }
      else if (s.kind === 'wide') {
        s.g.fillStyle = '#020804'; s.g.fillRect(0, 0, 512, 192);
        s.g.save(); this.drawRadar(s.g, 192, 192, d); s.g.restore();
        s.g.save(); s.g.translate(192, 0); this.drawHorizon(s.g, 160, 192, d); s.g.restore();
        s.g.save(); s.g.translate(352, 0); this.drawSms(s.g, 160, 192, d); s.g.restore();
        s.tex.needsUpdate = true;
      } else if (slow) {
        if (s.kind === 'radar') this.drawRadar(s.g, 256, 256, d);
        else this.drawSms(s.g, 256, 256, d);
        s.tex.needsUpdate = true;
      }
    }
  }

  drawRadar(g, w, h, d) {
    g.fillStyle = '#020a05'; g.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.92, R = h * 0.85;
    const range = Math.max(2000, d.lockRange * 1.5);
    g.strokeStyle = 'rgba(60,255,122,0.35)'; g.lineWidth = 1.5;
    for (const f of [1 / 3, 2 / 3, 1]) { g.beginPath(); g.arc(cx, cy, R * f, Math.PI * 1.17, Math.PI * 1.83); g.stroke(); }
    for (const a of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(a * 1.15) * R, cy - Math.cos(a * 1.15) * R); g.stroke(); }
    // lock range ring
    g.setLineDash([4, 4]); g.strokeStyle = 'rgba(255,200,60,0.6)';
    g.beginPath(); g.arc(cx, cy, R * (d.lockRange / range), Math.PI * 1.17, Math.PI * 1.83); g.stroke(); g.setLineDash([]);
    for (const c of d.contacts) {
      if (Math.abs(c.bearing) > 1.0 || c.dist > range) continue;
      const r = R * (c.dist / range);
      const x = cx + Math.sin(c.bearing) * r, y = cy - Math.cos(c.bearing) * r;
      g.fillStyle = c.locked ? '#ff4040' : '#3cff7a';
      g.fillRect(x - 4, y - 4, 8, 8);
      if (c.locked) { g.strokeStyle = '#ff4040'; g.strokeRect(x - 8, y - 8, 16, 16); }
    }
    g.fillStyle = '#3cff7a'; g.font = `${Math.round(h / 16)}px monospace`;
    g.fillText(`RDR ${(range / 1000).toFixed(1)}km`, 8, h / 12);
  }

  drawHorizon(g, w, h, d) {
    g.save();
    g.beginPath(); g.rect(0, 0, w, h); g.clip();
    g.translate(w / 2, h / 2);
    g.rotate(-d.rollAng);
    const ppd = h / 60; // pixels per degree of pitch
    const off = (d.pitchAng * 180 / Math.PI) * ppd;
    g.fillStyle = '#2f6db0'; g.fillRect(-w * 2, -h * 3 + off, w * 4, h * 3);
    g.fillStyle = '#7a4f2a'; g.fillRect(-w * 2, off, w * 4, h * 3);
    g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-w * 2, off); g.lineTo(w * 2, off); g.stroke();
    g.lineWidth = 1.5; g.fillStyle = '#fff'; g.font = `${Math.round(h / 20)}px monospace`;
    for (let p = -30; p <= 30; p += 10) {
      if (!p) continue;
      const y = off - p * ppd;
      g.beginPath(); g.moveTo(-w * 0.15, y); g.lineTo(w * 0.15, y); g.stroke();
      g.fillText(String(p), w * 0.17, y + 4);
    }
    g.restore();
    // fixed aircraft symbol
    g.strokeStyle = '#ffd040'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(w * 0.28, h / 2); g.lineTo(w * 0.44, h / 2); g.lineTo(w * 0.5, h * 0.56); g.lineTo(w * 0.56, h / 2); g.lineTo(w * 0.72, h / 2); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, w, h * 0.12);
    g.fillStyle = '#fff'; g.font = `${Math.round(h / 14)}px monospace`; g.textAlign = 'center';
    g.fillText(String(Math.round((d.heading * 180) / Math.PI) % 360).padStart(3, '0'), w / 2, h * 0.09);
    g.textAlign = 'left';
  }

  drawSms(g, w, h, d) {
    g.fillStyle = '#020804'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3cff7a';
    const fs = Math.round(h / 14);
    g.font = `${fs}px monospace`;
    const lines = [
      `SPD ${Math.round(d.speed * 3.6)}`,
      `ALT ${Math.round(d.alt)}`,
      `G   ${d.g.toFixed(1)}`,
      `THR ${Math.round(d.lever * 100)}%`,
      `GUN ${d.weapons.gun}`,
      `MSL ${d.weapons.lock}`,
      `RKT ${d.weapons.dumb}`,
      `FLR ${d.weapons.flare}`,
    ];
    lines.forEach((l, i) => g.fillText(l, 8, fs * 1.25 * (i + 1)));
    // hull bar
    const frac = Math.max(0, d.hp / d.maxHp);
    g.fillStyle = '#123'; g.fillRect(8, h - fs - 6, w - 16, fs * 0.6);
    g.fillStyle = frac > 0.5 ? '#3cff7a' : frac > 0.25 ? '#ffd040' : '#ff4040';
    g.fillRect(8, h - fs - 6, (w - 16) * frac, fs * 0.6);
  }

  render(renderer, camera, jetGroup) {
    this.root.position.copy(jetGroup.position);
    this.root.quaternion.copy(jetGroup.quaternion);
    this.root.updateMatrixWorld(true);
    renderer.clearDepth();
    renderer.render(this.scene, camera);
  }
}
