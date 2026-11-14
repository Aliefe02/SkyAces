// Sky Aces Online — game server.
// Serves the web client and runs the multiplayer session over WebSockets.
//
// Authority model:
//  - Each client simulates its own jet (smooth, lag-free flying) and streams its state.
//  - The server owns health, kills, missiles, reload timers and bots.
//  - Gun hits are detected by the shooter and sanity-checked here (rate + range).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { CONFIG } from './shared/config.js';
import { JETS, JET_IDS, weaponsFor, lockRangeAgainst, makeMagazines, magCanFire, magFire, pylonPoint } from './shared/jets.js';
import { v3, quat, clamp, bodyAxes, createPlaneState, stepPlane } from './shared/physics.js';
import { groundHeight } from './shared/terrain.js';
import { obstacleHeight, obstacleHeightNear } from './shared/city.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const BOT_FILL = process.env.BOT_FILL !== undefined ? Number(process.env.BOT_FILL) : CONFIG.BOT_FILL;
const G = CONFIG.G;

// ---------------------------------------------------------------- static files
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const ROUTES = [
  ['/lib/three.module.js', path.join(__dirname, 'node_modules/three/build/three.module.js')],
];
function resolveFile(urlPath) {
  for (const [route, file] of ROUTES) if (urlPath === route) return file;
  let base = path.join(__dirname, 'public');
  let rel = urlPath;
  if (urlPath.startsWith('/shared/')) { base = path.join(__dirname, 'shared'); rel = urlPath.slice('/shared'.length); }
  // three.js add-ons (decals) straight from the installed package
  if (urlPath.startsWith('/lib/addons/')) { base = path.join(__dirname, 'node_modules/three/examples/jsm'); rel = urlPath.slice('/lib/addons'.length); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base)) return null; // no path traversal
  return file;
}
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = resolveFile(urlPath);
  if (!file) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------------------------------------------------------------- game state
const players = new Map(); // id -> player
const missiles = new Map();
const flares = new Map();
let nextFlareId = 1;
let nextId = 1;
let nextMissileId = 1;
const now = () => performance.now() / 1000;
const startTime = now();
const serverTime = () => now() - startTime;

const BOT_NAMES = ['Viper', 'Maverick', 'Iceman', 'Ghost', 'Falcon', 'Raven', 'Cobra', 'Talon', 'Nomad', 'Blaze', 'Frost', 'Hunter', 'Rogue', 'Saber', 'Wolf', 'Jester'];

function makePlayer({ name, jet, ws = null, bot = false }) {
  const id = nextId++;
  const p = {
    id, name, jet, ws, bot,
    alive: false, hp: 0,
    p: [0, 2000, 0], q: [0, 0, 0, 1], v: [0, 0, -200],
    thr: 0.8, ab: false, firing: false,
    lastUpdate: now(),
    kills: 0, deaths: 0,
    protectedUntil: 0,
    mags: makeMagazines('f16'),   // missile magazines (rebuilt for the jet on every spawn)
    flareReady: 0,
    lastFlareAt: -99,
    lastHit: null,        // { by, time, weapon }
    gunBudget: 0,
    respawnAt: 0,
    ping: 0,
  };
  players.set(id, p);
  return p;
}

function send(pl, msg) {
  if (pl.ws && pl.ws.readyState === 1) pl.ws.send(JSON.stringify(msg));
}
function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const pl of players.values()) if (pl.ws && pl.ws.readyState === 1) pl.ws.send(data);
}
function broadcastRoster() {
  broadcast({
    t: 'roster',
    players: [...players.values()].filter((p) => p.joined !== false).map((p) => ({ id: p.id, name: p.name, jet: p.jet, bot: p.bot, k: p.kills, d: p.deaths, alive: p.alive, ping: Math.round(p.ping) })),
  });
}

// predicted position of a player right now (human states arrive with some delay)
function currentPos(pl) {
  if (pl.bot) return pl.p;
  const dt = Math.min(0.25, now() - pl.lastUpdate);
  return v3.addScaled(pl.p, pl.v, dt);
}

// ---------------------------------------------------------------- spawning
function findSpawn() {
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < 12; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 3500 + Math.random() * 4000;
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    const ground = Math.max(groundHeight(x, z), groundHeight(x * 0.9, z * 0.9));
    const y = Math.max(CONFIG.SPAWN_ALT_MIN + Math.random() * (CONFIG.SPAWN_ALT_MAX - CONFIG.SPAWN_ALT_MIN), ground + 900);
    const pos = [x, y, z];
    let minD = Infinity;
    for (const o of players.values()) if (o.alive) minD = Math.min(minD, v3.dist(o.p, pos));
    const score = Math.min(minD, 3000) + Math.random() * 300;
    if (score > bestScore) { bestScore = score; best = pos; }
  }
  // face roughly toward the map center
  const toCenter = v3.norm([-best[0], 0, -best[2]]);
  const jitter = (Math.random() - 0.5) * 0.8;
  const c = Math.cos(jitter), s = Math.sin(jitter);
  const dir = [toCenter[0] * c - toCenter[2] * s, 0, toCenter[0] * s + toCenter[2] * c];
  return { p: best, q: quat.lookDir(dir) };
}

function spawnPlayer(pl, jet) {
  if (jet && JETS[jet]) pl.jet = jet;
  const { p, q } = findSpawn();
  pl.p = p; pl.q = q;
  pl.v = v3.scale(quat.rotate(q, [0, 0, -1]), CONFIG.SPAWN_SPEED);
  pl.hp = JETS[pl.jet].flight.hp;
  pl.alive = true;
  pl.firing = false;
  pl.lastHit = null;
  pl.mags = makeMagazines(pl.jet);
  pl.nextPylon = 1; // first missile comes off the left wing
  pl.flareReady = 0;
  pl.protectedUntil = now() + CONFIG.SPAWN_PROTECTION;
  pl.lastUpdate = now();
  if (pl.bot) {
    pl.state = createPlaneState(p, q, CONFIG.SPAWN_SPEED);
    pl.state.throttle = 0.9;
    pl.ai = { target: null, retargetAt: 0, aimNoise: [0, 0, 0], noiseAt: 0, skill: 0.55 + Math.random() * 0.35, nextDumbTry: 0 };
  }
  send(pl, { t: 'spawned', p, q, speed: CONFIG.SPAWN_SPEED, jet: pl.jet, hp: pl.hp, prot: CONFIG.SPAWN_PROTECTION });
  broadcastRoster();
}

// ---------------------------------------------------------------- damage / kills
function applyDamage(victim, dmg, attackerId, weapon) {
  if (!victim.alive) return;
  if (now() < victim.protectedUntil) return;
  victim.hp -= dmg;
  victim.lastHit = { by: attackerId, time: now(), weapon };
  const attacker = players.get(attackerId);
  if (attacker) send(attacker, { t: 'hit', target: victim.id, dmg: Math.round(dmg * 10) / 10, w: weapon });
  send(victim, { t: 'hurt', by: attackerId, dmg: Math.round(dmg * 10) / 10, hp: victim.hp, w: weapon });
  if (victim.hp <= 0) killPlayer(victim, attackerId, weapon);
}

function killPlayer(victim, killerId, weapon) {
  if (!victim.alive) return;
  victim.alive = false;
  victim.hp = 0;
  victim.firing = false;
  victim.deaths++;
  const killer = players.get(killerId);
  if (killer && killer !== victim) {
    killer.kills++;
    // every kill repairs half of the killer's hull (two kills from near-dead = full)
    if (killer.alive) {
      const max = JETS[killer.jet].flight.hp;
      const before = killer.hp;
      killer.hp = Math.min(max, killer.hp + max / 2);
      send(killer, { t: 'heal', hp: Math.round(killer.hp), amount: Math.round(killer.hp - before) });
    }
  }
  broadcast({ t: 'kill', killer: killer && killer !== victim ? killer.id : null, victim: victim.id, w: weapon });
  broadcast({ t: 'boom', p: currentPos(victim).map((x) => Math.round(x)), s: 2 });
  send(victim, { t: 'died', by: killer && killer !== victim ? killer.id : null, w: weapon, respawn: CONFIG.RESPAWN_DELAY });
  if (victim.bot) victim.respawnAt = now() + CONFIG.RESPAWN_DELAY + 2;
  broadcastRoster();
}

function underFire(pl) {
  return !!(pl.lastHit && now() - pl.lastHit.time < CONFIG.CRASH_CREDIT_WINDOW && players.get(pl.lastHit.by));
}

function handleCrash(pl, reason) {
  if (!pl.alive) return;
  let killer = null, weapon = reason === 'oob' ? 'oob' : 'crash';
  if (pl.lastHit && now() - pl.lastHit.time < CONFIG.CRASH_CREDIT_WINDOW && players.get(pl.lastHit.by)) {
    killer = pl.lastHit.by;
  }
  killPlayer(pl, killer, weapon);
}

// ---------------------------------------------------------------- lock rules
function lockValid(shooter, target, tolerance = 1) {
  if (!target || !target.alive || target.id === shooter.id) return false;
  const L = weaponsFor(shooter.jet).lock;
  // stealthy targets can only be locked from closer in
  const range = lockRangeAgainst(shooter.jet, target.jet);
  const sp = currentPos(shooter), tp = currentPos(target);
  const rel = v3.sub(tp, sp);
  const d = v3.len(rel);
  const relSpeed = v3.len(v3.sub(target.v, shooter.v));
  // humans get a small fixed allowance for network delay (positions are ~0.1 s old)
  if (d > range + (tolerance > 1 ? 150 + 0.25 * relSpeed : 0)) return false;
  const f = quat.rotate(shooter.q, [0, 0, -1]);
  const ang = Math.acos(clamp(v3.dot(f, v3.scale(rel, 1 / (d || 1))), -1, 1));
  return ang <= L.lockCone * (tolerance > 1 ? 1.4 : 1);
}

function fireMissile(shooter, kind, targetId) {
  if (!shooter.alive) return false;
  const ws = weaponsFor(shooter.jet);
  const W = kind === 'lock' ? ws.lock : ws.dumb;
  const t = now();
  // magazine: ammo left and salvo spacing (a little latency tolerance for humans)
  if (!magCanFire(shooter.mags[kind], W, t, shooter.bot ? 0 : 0.25)) return false;
  let target = null;
  if (kind === 'lock') {
    target = players.get(targetId);
    if (!lockValid(shooter, target, shooter.bot ? 1 : 1.25)) return false;
  }
  magFire(shooter.mags[kind], W, t);
  shooter.protectedUntil = 0; // firing ends spawn protection
  const { f, u } = bodyAxes(shooter.q);
  // launch from under the wings, alternating left, right, left...
  shooter.nextPylon = shooter.nextPylon === -1 ? 1 : -1;
  const local = pylonPoint(shooter.jet, shooter.nextPylon);
  const pos = v3.add(currentPos(shooter), quat.rotate(shooter.q, local));
  const vel = v3.addScaled(v3.addScaled(shooter.v, f, 25), u, -6); // drops clear of the jet, then the motor pushes it
  const m = { id: nextMissileId++, kind, owner: shooter.id, target: target ? target.id : null, p: pos, v: vel, age: 0, flare: null, W };
  // target already has flares burning: the seeker may go for those instead
  const TF = target ? weaponsFor(target.jet).flares : null;
  if (target && now() - target.lastFlareAt < TF.lifetime * 0.6 && Math.random() < TF.lateDecoyChance) {
    const fl = [...flares.values()].filter((f) => f.owner === target.id);
    if (fl.length) { m.flare = fl[Math.floor(Math.random() * fl.length)].id; m.target = null; }
  }
  missiles.set(m.id, m);
  broadcast({ t: 'launch', id: m.id, k: kind, owner: shooter.id, target: m.target });
  return true;
}

function deployFlares(pl) {
  const F = weaponsFor(pl.jet).flares;
  const t = now();
  if (!pl.alive || t < pl.flareReady - 0.15) return false;
  pl.flareReady = t + F.cooldown;
  pl.lastFlareAt = t;
  const { f, u, r } = bodyAxes(pl.q);
  const base = currentPos(pl);
  const list = [];
  for (let k = 0; k < F.count; k++) {
    const side = k % 2 ? 1 : -1;
    let v = v3.scale(pl.v, 0.85);
    v = v3.addScaled(v, u, -25 - Math.random() * 15);
    v = v3.addScaled(v, r, side * (12 + Math.random() * 25));
    v = v3.addScaled(v, f, -15 - k * 6);
    const fl = { id: nextFlareId++, owner: pl.id, p: v3.addScaled(base, u, -1), v, age: -k * 0.08, life: F.lifetime };
    flares.set(fl.id, fl);
    list.push([fl.id, fl.p.map((x) => Math.round(x * 10) / 10), fl.v.map((x) => Math.round(x * 10) / 10), Math.round(-fl.age * 100) / 100]);
  }
  // missiles that are tracking this jet may be seduced by the flares
  const ids = list.map((x) => x[0]);
  for (const m of missiles.values()) {
    if (m.kind === 'lock' && m.target === pl.id && Math.random() < F.decoyChance) {
      m.flare = ids[Math.floor(Math.random() * ids.length)];
      m.target = null;
    }
  }
  broadcast({ t: 'flares', owner: pl.id, list });
  return true;
}

function updateFlares(dt) {
  for (const fl of [...flares.values()]) {
    fl.age += dt;
    if (fl.age < 0) { fl.p = v3.addScaled(fl.p, fl.v, dt); continue; }
    fl.v = v3.scale(fl.v, Math.exp(-0.9 * dt));
    fl.v[1] -= G * 0.4 * dt;
    fl.p = v3.addScaled(fl.p, fl.v, dt);
    if (fl.age > fl.life) flares.delete(fl.id);
  }
}

function detonate(m, pos) {
  const W = m.W;
  missiles.delete(m.id);
  broadcast({ t: 'boom', p: pos.map((x) => Math.round(x)), s: 1, m: m.id });
  for (const pl of players.values()) {
    if (!pl.alive || pl.id === m.owner) continue;
    const d = v3.dist(currentPos(pl), pos);
    if (d < W.blastRadius) {
      // full damage inside the proximity-fuse radius, falling off toward the blast edge
      const falloff = d <= W.proximityFuse + 1 ? 1 : 1 - 0.7 * ((d - W.proximityFuse - 1) / (W.blastRadius - W.proximityFuse - 1));
      applyDamage(pl, W.damage * falloff, m.owner, m.kind);
    }
  }
}

function updateMissiles(dt) {
  for (const m of [...missiles.values()]) {
    const W = m.W;
    m.age += dt;
    let speed = v3.len(m.v);
    let dir = v3.scale(m.v, 1 / (speed || 1));

    if (m.age < W.burnTime) speed = Math.min(W.maxSpeed, speed + W.accel * dt);
    else speed = Math.max(80, speed - speed * (W.coastDrag ?? 0.12) * dt);

    let decoy = m.flare != null ? flares.get(m.flare) : null;
    if (m.flare != null && !decoy) m.flare = null; // flare burnt out: missile flies on blind
    if (m.kind === 'lock' && (m.target != null || decoy)) {
      const tg = decoy || players.get(m.target);
      if (tg && (decoy || tg.alive)) {
        const tp = decoy ? decoy.p : currentPos(tg);
        const rel = v3.sub(tp, m.p);
        const d = v3.len(rel);
        const closing = Math.max(100, speed - v3.dot(tg.v, v3.norm(rel)));
        const tgo = clamp(d / closing, 0, 3);
        const aim = v3.addScaled(tp, tg.v, tgo);
        const want = v3.norm(v3.sub(aim, m.p));
        const maxTurn = (W.turnG * G / Math.max(speed, 50)) * dt;
        const ang = Math.acos(clamp(v3.dot(dir, want), -1, 1));
        if (ang > 1e-5) {
          const tt = Math.min(1, maxTurn / ang);
          dir = v3.norm(v3.add(v3.scale(dir, 1 - tt), v3.scale(want, tt)));
        }
      } else {
        m.target = null;
      }
    }
    const prev = m.p;
    m.v = v3.scale(dir, speed);
    m.v[1] -= m.age > W.burnTime ? G * dt * 0.5 : 0;
    m.p = v3.addScaled(m.p, m.v, dt);

    if (decoy && v3.dist(m.p, decoy.p) < 10) { detonate(m, m.p); continue; }

    // proximity fuse: closest approach along this tick's segment
    if (m.age > W.armTime) {
      const seg = v3.sub(m.p, prev);
      const segLen2 = v3.dot(seg, seg) || 1;
      let hitPos = null;
      for (const pl of players.values()) {
        if (!pl.alive || pl.id === m.owner) continue;
        const tp = currentPos(pl);
        const tt = clamp(v3.dot(v3.sub(tp, prev), seg) / segLen2, 0, 1);
        const cp = v3.addScaled(prev, seg, tt);
        if (v3.dist(cp, tp) < W.proximityFuse) { hitPos = cp; break; }
      }
      if (hitPos) { detonate(m, hitPos); continue; }
    }
    if (m.p[1] < obstacleHeight(m.p[0], m.p[2]) || m.age > W.lifetime) detonate(m, m.p);
  }
}

// ---------------------------------------------------------------- bots
function botInputToward(s, desired, spec, aggressive) {
  const local = quat.rotate(quat.conj(s.q), v3.norm(desired)); // x right, y up, -z forward
  const fwd = -local[2];
  const off = Math.acos(clamp(fwd, -1, 1));
  const inp = { pitch: 0, roll: 0, yaw: 0, throttle: 1, ab: false };
  if (off < 0.12) {
    inp.pitch = clamp(local[1] * 10, -1, 1);
    inp.yaw = clamp(local[0] * 8, -1, 1);
    // gently level the wings while tracking
    const { u, r } = bodyAxes(s.q);
    inp.roll = clamp(-r[1] * 0.8 + local[0] * 2, -1, 1);
  } else {
    const rollErr = Math.atan2(local[0], local[1]);
    inp.roll = clamp(rollErr * 2.2, -1, 1);
    inp.pitch = clamp(off * 2.5, 0, 1) * Math.max(0, Math.cos(rollErr)) * (aggressive ? 1 : 0.8);
    if (Math.abs(rollErr) < 0.5) inp.pitch = Math.max(inp.pitch, clamp(off * 2, 0, 1));
  }
  return inp;
}

function updateBot(b, dt) {
  const t = now();
  if (!b.alive) {
    if (t > b.respawnAt) spawnPlayer(b, JET_IDS[Math.floor(Math.random() * JET_IDS.length)]);
    return;
  }
  const spec = JETS[b.jet].flight;
  const s = b.state;
  const ai = b.ai;
  const { f } = bodyAxes(s.q);
  const speed = v3.len(s.v);

  // pick a target: nearest alive opponent, re-evaluated periodically
  if (t > ai.retargetAt || !players.get(ai.target)?.alive) {
    let best = null, bestD = Infinity;
    for (const o of players.values()) {
      if (o === b || !o.alive) continue;
      const d = v3.dist(o.p, s.p) * (o.bot ? 1.3 : 1); // slight preference for humans
      if (d < bestD) { bestD = d; best = o; }
    }
    ai.target = best ? best.id : null;
    ai.retargetAt = t + 6 + Math.random() * 4;
  }
  if (t > ai.noiseAt) {
    const n = (1 - ai.skill) * 0.12;
    ai.aimNoise = [(Math.random() - 0.5) * n, (Math.random() - 0.5) * n, (Math.random() - 0.5) * n];
    ai.noiseAt = t + 0.6 + Math.random();
  }

  const target = players.get(ai.target);
  let desired = f;
  let dist = Infinity, leadAng = Math.PI;
  if (target && target.alive) {
    const tp = currentPos(target);
    dist = v3.dist(tp, s.p);
    const tof = dist / (weaponsFor(b.jet).gun.muzzleVelocity + speed * 0.5);
    const lead = v3.addScaled(tp, target.v, tof);
    desired = v3.add(v3.norm(v3.sub(lead, s.p)), ai.aimNoise);
    leadAng = Math.acos(clamp(v3.dot(f, v3.norm(v3.sub(lead, s.p))), -1, 1));
  } else {
    // patrol toward the center
    desired = v3.norm([-s.p[0] + 0.001, 1500 - s.p[1], -s.p[2]]);
  }

  // stay inside the map
  const edge = Math.max(Math.abs(s.p[0]), Math.abs(s.p[2]));
  if (edge > CONFIG.MAP_HALF * 0.85) desired = v3.add(desired, v3.scale(v3.norm([-s.p[0], 0, -s.p[2]]), 2));

  // terrain avoidance: look ahead and pull up early
  let danger = 0;
  for (const la of [0.5, 1, 1.5, 2, 2.5, 3, 4, 5]) {
    const fp = v3.addScaled(s.p, s.v, la);
    const clearance = fp[1] - obstacleHeightNear(fp[0], fp[2]);
    if (clearance < 350) danger = Math.max(danger, 1 - clearance / 350 + 0.3);
  }
  const altAGL = s.p[1] - obstacleHeightNear(s.p[0], s.p[2]);
  if (altAGL < 500) danger = Math.max(danger, 0.6);
  if (danger > 0) desired = v3.add(v3.scale(v3.norm(desired), Math.max(0, 1 - danger)), [0, 2 * danger, 0]);
  if (s.p[1] > 7000) desired = v3.add(desired, [0, -0.6, 0]);

  const inp = botInputToward(s, desired, spec, dist < 2000);
  if (process.env.DEBUG_BOTS && (!ai.logAt || t > ai.logAt)) {
    ai.logAt = t + 3;
    console.log(`[bot ${b.name}] pos ${s.p.map(Math.round)} spd ${Math.round(speed)} agl ${Math.round(altAGL)} tgt ${target ? target.name : '-'} dist ${Math.round(dist)} lead ${(leadAng * 57.3).toFixed(1)} danger ${danger.toFixed(2)} inp p${inp.pitch.toFixed(2)} r${inp.roll.toFixed(2)}`);
  }
  // throttle management: keep energy up, avoid overshooting when close behind
  inp.throttle = 1;
  inp.ab = speed < 230 || dist > 2500 || danger > 0;
  if (target && dist < 350 && leadAng < 0.5 && speed > 260) { inp.throttle = 0.55; inp.ab = false; }

  stepPlane(s, inp, spec, dt);
  b.p = s.p; b.q = s.q; b.v = s.v; b.thr = s.throttle; b.ab = s.ab; b.ctl = [inp.pitch, inp.roll, inp.yaw];
  b.lastUpdate = t;

  if (s.p[1] < obstacleHeight(s.p[0], s.p[2]) + 3) { handleCrash(b, 'crash'); return; }

  // defensive flares when a lock-on missile is tracking this bot
  if (t >= b.flareReady) {
    for (const m of missiles.values()) {
      if (m.kind === 'lock' && m.target === b.id && v3.dist(m.p, s.p) < 1800 && Math.random() < dt * 2.5 * ai.skill) { deployFlares(b); break; }
    }
  }

  // weapons
  b.firing = false;
  if (target && target.alive && t > b.protectedUntil - CONFIG.SPAWN_PROTECTION + 1.5) {
    const GN = weaponsFor(b.jet).gun;
    if (dist < GN.muzzleVelocity * GN.lifetime * 0.75 && leadAng < 0.045) {
      b.firing = true;
      const hitAng = Math.atan(GN.hitRadius / dist);
      const accuracy = clamp(hitAng / Math.max(leadAng, 0.002), 0, 1) * (0.35 + 0.35 * ai.skill);
      applyDamage(target, GN.damage * GN.fireRate * dt * accuracy, b.id, 'gun');
    }
    // with a 2 km lock range bots would fire constantly, so they only take some shots
    const BW = weaponsFor(b.jet);
    if (t > (ai.nextLockTry || 0) && magCanFire(b.mags.lock, BW.lock, t) && lockValid(b, target)) {
      const midSalvo = b.mags.lock.ammo < BW.lock.mag; // finish a salvo once started
      if (midSalvo || Math.random() < 0.45) fireMissile(b, 'lock', target.id);
      ai.nextLockTry = b.mags.lock.ammo > 0 && b.mags.lock.ammo < BW.lock.mag ? t + BW.lock.salvoGap + 0.05 : t + 2 + Math.random() * 4;
    }
    if (magCanFire(b.mags.dumb, BW.dumb, t) && t > ai.nextDumbTry && dist < 650 && dist > 120 && leadAng < 0.03) {
      ai.nextDumbTry = t + 1.5;
      if (Math.random() < 0.6) fireMissile(b, 'dumb');
    }
  }
}

function balanceBots() {
  const humans = [...players.values()].filter((p) => !p.bot && p.joined).length;
  const bots = [...players.values()].filter((p) => p.bot);
  const want = humans > 0 ? Math.max(0, BOT_FILL - humans) : 0;
  if (bots.length < want) {
    for (let i = bots.length; i < want; i++) {
      const used = new Set(bots.map((b) => b.name));
      const nm = BOT_NAMES.find((n) => !used.has('[BOT] ' + n)) || 'Drone' + nextId;
      const b = makePlayer({ name: '[BOT] ' + nm, jet: JET_IDS[Math.floor(Math.random() * JET_IDS.length)], bot: true });
      b.joined = true;
      bots.push(b);
      spawnPlayer(b, b.jet);
    }
  } else if (bots.length > want) {
    for (const b of bots.slice(want)) removePlayer(b);
  }
}

function removePlayer(pl) {
  players.delete(pl.id);
  for (const m of missiles.values()) if (m.target === pl.id) m.target = null;
  broadcast({ t: 'left', id: pl.id });
  broadcastRoster();
}

// ---------------------------------------------------------------- networking
const wss = new WebSocketServer({ server, path: '/ws' });
const finite = (a, n) => Array.isArray(a) && a.length === n && a.every((x) => Number.isFinite(x));

wss.on('connection', (ws) => {
  const pl = makePlayer({ name: 'Pilot', jet: 'f16', ws });
  pl.joined = false;
  send(pl, { t: 'welcome', id: pl.id, time: serverTime() });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.t) {
      case 'join': {
        pl.name = String(msg.name || 'Pilot').replace(/[<>]/g, '').slice(0, 16) || 'Pilot';
        pl.joined = true;
        balanceBots();
        spawnPlayer(pl, JETS[msg.jet] ? msg.jet : 'f16');
        break;
      }
      case 'spawn': {
        if (!pl.joined || pl.alive) return;
        spawnPlayer(pl, JETS[msg.jet] ? msg.jet : pl.jet);
        break;
      }
      case 's': {
        if (!pl.alive || !finite(msg.p, 3) || !finite(msg.q, 4) || !finite(msg.v, 3)) return;
        pl.p = msg.p; pl.q = quat.norm(msg.q); pl.v = msg.v;
        pl.thr = clamp(+msg.thr || 0, 0, 1); pl.ab = !!msg.ab; pl.superM = !!msg.sm;
        pl.ctl = finite(msg.c, 3) ? msg.c.map((x) => clamp(x, -1, 1)) : [0, 0, 0];
        const wasFiring = pl.firing;
        pl.firing = !!msg.f;
        if (pl.firing && !wasFiring) pl.protectedUntil = 0;
        pl.lastUpdate = now();
        break;
      }
      case 'hit': {
        const target = players.get(msg.id);
        const n = Math.min(10, Math.max(0, Math.floor(msg.n) || 0));
        if (!pl.alive || !target || !target.alive || n === 0) return;
        const GN = weaponsFor(pl.jet).gun;
        const maxRange = GN.muzzleVelocity * GN.lifetime + 400;
        if (v3.dist(currentPos(pl), currentPos(target)) > maxRange) return;
        const allowed = Math.min(n, Math.floor(pl.gunBudget));
        if (allowed <= 0) return;
        pl.gunBudget -= allowed;
        applyDamage(target, allowed * GN.damage, pl.id, 'gun');
        break;
      }
      case 'fire': {
        if (msg.k === 'lock' || msg.k === 'dumb') fireMissile(pl, msg.k, msg.tg);
        break;
      }
      case 'crash': handleCrash(pl, msg.r === 'oob' ? 'oob' : 'crash'); break;
      case 'redeploy': {
        // change aircraft from the Esc menu: instant respawn, unless you were hit recently
        if (!pl.joined) return;
        const jet = JETS[msg.jet] ? msg.jet : pl.jet;
        if (pl.alive && underFire(pl)) { pl.jet = jet; killPlayer(pl, pl.lastHit.by, 'bailout'); return; }
        pl.alive = false;
        spawnPlayer(pl, jet);
        break;
      }
      case 'leave': {
        // back to the main menu: out of the match (and out of the scoreboard)
        if (pl.alive && underFire(pl)) killPlayer(pl, pl.lastHit.by, 'bailout');
        pl.alive = false;
        pl.joined = false;
        pl.firing = false;
        broadcastRoster();
        balanceBots();
        break;
      }
      case 'flare': deployFlares(pl); break;
      case 'ping': send(pl, { t: 'pong', c: msg.c, s: serverTime() }); if (Number.isFinite(msg.rtt)) pl.ping = msg.rtt; break;
    }
  });

  ws.on('close', () => {
    removePlayer(pl);
    balanceBots();
  });
});

// ---------------------------------------------------------------- main loops
const SIM_DT = 1 / 60;
let lastTick = now();
setInterval(() => {
  const t = now();
  let elapsed = Math.min(0.25, t - lastTick);
  lastTick = t;
  // refill gun-hit budget (anti-cheat: can't register more hits than the gun can fire)
  for (const pl of players.values()) {
    const rate = weaponsFor(pl.jet).gun.fireRate;
    pl.gunBudget = Math.min(rate * 1.2, pl.gunBudget + rate * 1.1 * elapsed);
  }
  while (elapsed > 1e-6) {
    const dt = Math.min(SIM_DT, elapsed);
    elapsed -= dt;
    for (const pl of players.values()) if (pl.bot) updateBot(pl, dt);
    updateMissiles(dt);
    updateFlares(dt);
  }
  // humans who stopped sending updates (frozen tab) are timed out of the fight
  for (const pl of players.values()) {
    if (!pl.bot && pl.alive && t - pl.lastUpdate > 8) handleCrash(pl, 'crash');
  }
}, 1000 / 60);

const r1 = (x) => Math.round(x * 10) / 10;
const r4 = (x) => Math.round(x * 10000) / 10000;
setInterval(() => {
  const t = now();
  const pl = [];
  for (const p of players.values()) {
    if (!p.joined || !p.alive) continue;
    const flags = 1 | (p.firing ? 2 : 0) | (p.ab ? 4 : 0) | (t < p.protectedUntil ? 8 : 0) | (p.superM ? 16 : 0);
    pl.push([p.id, p.p.map(r1), p.q.map(r4), p.v.map(r1), Math.max(0, Math.round(p.hp)), flags, Math.round(p.thr * 100) / 100, (p.ctl || [0, 0, 0]).map((x) => Math.round(x * 100) / 100)]);
  }
  const ms = [];
  for (const m of missiles.values()) ms.push([m.id, m.kind === 'lock' ? 1 : 0, m.p.map(r1), m.v.map(r1), m.owner, m.target ?? -1, m.flare ? 1 : 0]);
  broadcast({ t: 'snap', time: r4(serverTime()), pl, ms });
}, 1000 / CONFIG.SNAPSHOT_RATE);

server.listen(PORT, () => {
  console.log(`Sky Aces Online running at http://localhost:${PORT}  (bots fill to ${BOT_FILL})`);
});
