// Performance numbers for the jet cards, derived from each jet's flight-model values,
// so what the menu shows always matches how the jet actually flies.
import { createPlaneState, stepPlane } from './physics.js';

const G = 9.81;
const DT = 1 / 60;
const ALT = 3000;
const RHO = Math.exp(-ALT / 9500);
const LAPSE = 0.45 + 0.55 * RHO;

// Top speed in level flight at 3 km (simulated).
function topSpeed(spec, ab) {
  const s = createPlaneState([0, ALT, 0], [0, 0, 0, 1], 300);
  s.throttle = 1;
  for (let t = 0; t < 150; t += DT) {
    const climb = (ALT - s.p[1]) * 0.002 - s.v[1] * 0.01;
    stepPlane(s, { pitch: Math.max(-0.3, Math.min(0.3, climb)), roll: 0, yaw: 0, throttle: 1, abLevel: ab ? 1 : 0 }, spec, DT);
  }
  return Math.hypot(...s.v);
}

// Turn performance at 3 km with full afterburner, swept over speed:
//  instantaneous = best turn rate the wing / G-limit allows (bleeds energy),
//  sustained     = best turn rate where thrust still equals drag (no speed loss).
export function turnPerformance(sp) {
  const T = (sp.thrust + sp.abThrust) * LAPSE;
  let sus = { rate: 0, v: 0 }, inst = { rate: 0, v: 0 };
  for (let v = 80; v <= 450; v += 2) {
    const q2 = v * v * RHO;
    const nLift = Math.min(sp.maxG, (sp.lift * sp.aoaStall * q2) / G);
    const iRate = nLift > 1 ? (G * Math.sqrt(nLift * nLift - 1)) / v : 0;
    if (iRate > inst.rate) inst = { rate: iRate, v };
    const spare = T - sp.drag * q2;
    if (spare <= 0) continue;
    const aoa = Math.min(sp.aoaStall, Math.sqrt(Math.min(spare, 6 * G) / (sp.induced * q2)));
    const n = Math.min(sp.maxG, (sp.lift * aoa * q2) / G);
    const rate = n > 1 ? (G * Math.sqrt(n * n - 1)) / v : 0;
    if (rate > sus.rate) sus = { rate, v };
  }
  return { sus, inst };
}

const cache = new Map();
export function measureJet(id, spec) {
  if (cache.has(id)) return cache.get(id);
  const deg = 180 / Math.PI;
  const { sus, inst } = turnPerformance(spec);
  const out = {
    topSpeedKmh: Math.round(topSpeed(spec, true) * 3.6),
    milSpeedKmh: Math.round(topSpeed(spec, false) * 3.6),
    instantTurn: +(inst.rate * deg).toFixed(1),        // deg/s
    cornerKmh: Math.round(inst.v * 3.6),
    sustainedTurn: +(sus.rate * deg).toFixed(1),       // deg/s
    turnRadius: Math.round(sus.v / sus.rate),          // m, tightest sustained circle
    rollRate: Math.round(spec.rollRate * deg),         // deg/s at full stick
    thrustWeight: Math.round(((spec.thrust + spec.abThrust) / G) * 100) / 100,
  };
  cache.set(id, out);
  return out;
}
