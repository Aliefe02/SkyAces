// Shared flight model (runs in the browser for the player, and on the server for bots).
// Plain arrays so it has no dependency on three.js.
//
// Model summary (fly-by-wire style, like the real F-16 / F-22 / Su-57):
//  - Stick commands body rotation rates (pitch / roll / yaw).
//  - The FBW limits pitch rate to stay under max G, and limits angle of attack (AoA).
//  - Lift is produced by AoA and grows with speed^2, so velocity follows the nose.
//  - Drag (parasitic + induced from AoA) bleeds energy in hard turns.
//  - Gravity trades speed for altitude. Slow down too much and you stall.
//  - With the stick centered, the FBW trims for 1 G so the jet holds its flight path.
//  - Thrust-vectoring jets keep control authority at low speed and allow very high AoA.

import { CONFIG } from './config.js';

const G = CONFIG.G;

// ---------- tiny vector / quaternion helpers ----------
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  addScaled: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
};

export const quat = {
  mul(a, b) {
    const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
    return [
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    ];
  },
  norm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; },
  // rotate vector v by quaternion q
  rotate(q, v) {
    const [x, y, z, w] = q;
    const ix = w * v[0] + y * v[2] - z * v[1];
    const iy = w * v[1] + z * v[0] - x * v[2];
    const iz = w * v[2] + x * v[1] - y * v[0];
    const iw = -x * v[0] - y * v[1] - z * v[2];
    return [
      ix * w + iw * -x + iy * -z - iz * -y,
      iy * w + iw * -y + iz * -x - ix * -z,
      iz * w + iw * -z + ix * -y - iy * -x,
    ];
  },
  conj: (q) => [-q[0], -q[1], -q[2], q[3]],
  fromAxisAngle(axis, angle) {
    const s = Math.sin(angle / 2);
    return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
  },
  // rotation from small body-rate vector (rad) — exact axis-angle
  fromRotVec(r) {
    const a = Math.hypot(r[0], r[1], r[2]);
    if (a < 1e-9) return [0, 0, 0, 1];
    return quat.fromAxisAngle([r[0] / a, r[1] / a, r[2] / a], a);
  },
  // orientation whose forward (-Z) looks along dir, with up close to worldUp
  lookDir(dir, up = [0, 1, 0]) {
    const f = v3.norm(dir);
    let r = v3.cross(f, up);
    if (v3.len(r) < 1e-4) r = [1, 0, 0];
    r = v3.norm(r);
    const u = v3.cross(r, f);
    // rotation matrix columns: right, up, back(-f)
    const m00 = r[0], m01 = u[0], m02 = -f[0];
    const m10 = r[1], m11 = u[1], m12 = -f[1];
    const m20 = r[2], m21 = u[2], m22 = -f[2];
    const tr = m00 + m11 + m22;
    let x, y, z, w;
    if (tr > 0) {
      const s = 0.5 / Math.sqrt(tr + 1);
      w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s;
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
      w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
    }
    return quat.norm([x, y, z, w]);
  },
};

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function bodyAxes(q) {
  return {
    f: quat.rotate(q, [0, 0, -1]),
    u: quat.rotate(q, [0, 1, 0]),
    r: quat.rotate(q, [1, 0, 0]),
  };
}

export function createPlaneState(p, q, speed) {
  const f = quat.rotate(q, [0, 0, -1]);
  return {
    p: p.slice(),
    q: q.slice(),
    v: v3.scale(f, speed),
    w: [0, 0, 0],      // smoothed commanded rates: pitch, yaw, roll
    throttle: 0.8,
    ab: false,
    g: 1,              // current load factor (for HUD / effects)
    aoa: 0,
    stalled: false,
  };
}

// input: { pitch, roll, yaw in [-1,1], throttle in [0,1], ab: bool, brake: bool }
//
// Post-stall braking ("cobra"): holding the brake while pulling (or kicking rudder) hard
// lets the nose go far past the normal AoA limit. The jet keeps flying roughly along its
// old path with the nose pitched up / yawed sideways, and the huge drag bleeds speed fast.
// Let go and the fly-by-wire brings the nose back down to the flight path.
export function stepPlane(s, input, spec, dt) {
  const { f, u, r } = bodyAxes(s.q);
  let speed = v3.len(s.v);
  const vhat = speed > 1 ? v3.scale(s.v, 1 / speed) : f;
  if (speed < 1) speed = 1;

  // air density falls with altitude
  const rho = Math.exp(-Math.max(0, s.p[1]) / 9500);

  // ---- angle of attack / sideslip ----
  const vf = v3.dot(s.v, f), vu = v3.dot(s.v, u), vr = v3.dot(s.v, r);
  const aoa = Math.atan2(-vu, vf);
  const beta = Math.atan2(vr, Math.abs(vf) + 0.001);
  const absA = Math.abs(aoa);

  // ---- post-stall maneuver blend (0 = normal FBW, 1 = full cobra mode) ----
  const turning = Math.max(Math.abs(input.pitch), Math.abs(input.yaw));
  const wantSuper = !!input.brake && turning > 0.25 && speed > 60;
  s.superM = clamp((s.superM || 0) + (wantSuper ? 3 : -1.2) * dt, 0, 1);
  const sm = s.superM;
  const cobraAoa = spec.cobraAoa ?? 1.4;
  const aoaMaxEff = spec.aoaMax + (cobraAoa - spec.aoaMax) * sm;

  // ---- engine ----
  s.throttle += clamp(input.throttle - s.throttle, -0.7 * dt, 0.7 * dt);
  // afterburner: abLevel 0..1 (throttle above 90%), or a plain on/off flag (bots)
  const abWant = s.throttle > 0.95 ? (input.abLevel ?? (input.ab ? 1 : 0)) : 0;
  s.abLevel = (s.abLevel || 0) + clamp(abWant - (s.abLevel || 0), -2 * dt, 2 * dt);
  s.ab = s.abLevel > 0.05;
  const thrustAcc = (spec.thrust * s.throttle + spec.abThrust * s.abLevel) * (0.45 + 0.55 * rho);

  // ---- aerodynamic forces ----
  const q2 = speed * speed * rho;
  let cl;
  if (absA <= spec.aoaStall) cl = aoa;
  else {
    // beyond the stall lift fades away toward zero at ~90 degrees
    const t = clamp((absA - spec.aoaStall) / (Math.PI / 2 - spec.aoaStall), 0, 1);
    cl = Math.sign(aoa) * spec.aoaStall * (1 - 0.85 * t * t * (3 - 2 * t));
  }
  let liftAcc = spec.lift * cl * q2;
  const maxLift = spec.maxG * G * 1.1 * (1 - 0.55 * sm); // in cobra mode the path bends less
  liftAcc = clamp(liftAcc, -maxLift, maxLift);

  // lift acts perpendicular to velocity, in the plane of body-up
  let liftDir = v3.sub(u, v3.scale(vhat, v3.dot(u, vhat)));
  const ll = v3.len(liftDir);
  liftDir = ll > 1e-4 ? v3.scale(liftDir, 1 / ll) : u;

  let sideDir = v3.sub(r, v3.scale(vhat, v3.dot(r, vhat)));
  const sl = v3.len(sideDir);
  sideDir = sl > 1e-4 ? v3.scale(sideDir, 1 / sl) : r;
  const sideMax = 65 * (1 - 0.5 * sm);
  const sideAcc = clamp(-spec.lift * 0.45 * beta * q2, -sideMax, sideMax);

  // drag: parasitic + induced (AoA and sideslip) + air brake. Induced drag is capped so
  // normal flight stays sane, but the cap opens up in cobra mode for very hard braking.
  const aEff = Math.min(absA, 1.4);
  const bEff = Math.min(Math.abs(beta), 1.2);
  const inducedCap = (6 + ((spec.cobraBrake ?? 9) - 6) * sm) * G;
  const induced = Math.min(inducedCap, spec.induced * (aEff * aEff + 0.6 * bEff * bEff) * q2);
  const airbrake = input.brake ? spec.drag * 1.3 * q2 : 0;
  const dragAcc = spec.drag * q2 + induced + airbrake;

  let acc = v3.scale(f, thrustAcc);
  acc = v3.addScaled(acc, liftDir, liftAcc);
  acc = v3.addScaled(acc, sideDir, sideAcc);
  acc = v3.addScaled(acc, vhat, -dragAcc);
  acc[1] -= G;

  // load factor felt by the pilot (aero + thrust, along body up)
  const aeroAcc = v3.addScaled(v3.scale(liftDir, liftAcc), sideDir, sideAcc);
  s.g = v3.dot(aeroAcc, u) / G;
  s.aoa = aoa;
  s.beta = beta;
  s.stalled = sm < 0.2 && absA > spec.aoaStall + 0.05 && speed < 160;

  // ---- control (fly-by-wire) ----
  const eff = clamp(speed / spec.ctrlSpeed, 0.18, 1) * (0.6 + 0.4 * rho);
  const tvcAuth = spec.tvc * clamp(0.35 + s.throttle, 0, 1);
  const effPitch = Math.max(eff, tvcAuth, 0.7 * sm);
  const effYaw = Math.max(spec.tvcYaw ? Math.max(eff, tvcAuth) : eff, 0.7 * sm);
  const effRoll = Math.max(eff, spec.tvc * 0.5);

  const maxGRate = (spec.maxG * G) / speed;
  let pitchCmd = input.pitch * spec.pitchRate * effPitch * (1 + 1.2 * sm);
  // FBW G-limit on pitch rate (relaxed in cobra mode: the nose may rotate faster than the path)
  const hiLim = maxGRate * 1.05 + (2.6 - maxGRate * 1.05) * sm;
  const loLim = maxGRate * 0.45 + (2.0 - maxGRate * 0.45) * sm;
  pitchCmd = clamp(pitchCmd, -Math.max(loLim, 0.1), Math.max(hiLim, 0.1));
  const yawCmd = input.yaw * spec.yawRate * effYaw * (1 + 2.2 * sm);
  const rollCmd = input.roll * spec.rollRate * effRoll;

  const k = 1 - Math.exp(-spec.response * dt);
  s.w[0] += (pitchCmd - s.w[0]) * k;
  s.w[1] += (yawCmd - s.w[1]) * k;
  s.w[2] += (rollCmd - s.w[2]) * k;

  // rate at which the flight path is currently curving in the pitch plane
  const pathRate = v3.dot(acc, liftDir) / speed;

  // 1 G auto-trim with the stick centered: drive AoA to the value that holds the flight path
  const neutral = 1 - Math.min(1, Math.abs(input.pitch) * 3);
  const needLift = G * v3.dot([0, 1, 0], liftDir);
  const aoaTrim = clamp(needLift / Math.max(spec.lift * q2, 1e-3), -spec.aoaMax * 0.5, Math.min(spec.aoaMax, spec.aoaStall));
  let pitchRate = s.w[0] + (aoaTrim - aoa) * 3.5 * neutral * eff + pathRate * neutral;

  // AoA limiter: the nose may lead the flight path only up to the (blended) AoA limit
  const aoaMin = -aoaMaxEff * 0.5;
  const back = 2.2 + 0.8 * (1 - sm);  // how hard the FBW pushes the nose back (gentler after a cobra)
  pitchRate = Math.min(pitchRate, pathRate + clamp((aoaMaxEff - aoa) * 6, -back, 3));
  pitchRate = Math.max(pitchRate, pathRate + clamp((aoaMin - aoa) * 6, -3, back));

  // yaw: sideslip decays (weathervane), limited to betaMax (much larger in cobra mode)
  const betaMax = 0.35 + 0.85 * sm;
  let yawRate = s.w[1] + beta * 2.5 * eff * (1 - 0.85 * sm);
  yawRate = Math.max(yawRate, (beta - betaMax) * 4);
  yawRate = Math.min(yawRate, (beta + betaMax) * 4);

  // integrate attitude (body frame: +X pitch-up, +Y yaw-left, +Z roll-left)
  const rot = [pitchRate * dt, -yawRate * dt, -s.w[2] * dt];
  s.q = quat.norm(quat.mul(s.q, quat.fromRotVec(rot)));

  // integrate motion
  s.v = v3.addScaled(s.v, acc, dt);
  s.p = v3.addScaled(s.p, s.v, dt);

  // hard ceiling
  if (s.p[1] > CONFIG.CEILING) {
    s.p[1] = CONFIG.CEILING;
    if (s.v[1] > 0) s.v[1] *= 0.5;
  }
  return s;
}

// Euler-ish readouts for the HUD
export function flightInfo(s) {
  const { f, u } = bodyAxes(s.q);
  const pitch = Math.asin(clamp(f[1], -1, 1));
  let heading = Math.atan2(f[0], -f[2]); // 0 = north (-Z), clockwise positive toward +X
  if (heading < 0) heading += Math.PI * 2;
  // roll: angle of body up around forward relative to world up
  const right = v3.norm(v3.cross(f, [0, 1, 0]));
  const upRef = v3.cross(right, f);
  const roll = Math.atan2(v3.dot(u, right), v3.dot(u, upRef));
  return { pitch, heading, roll, speed: v3.len(s.v) };
}
