// Sky Aces Online — browser client.
import * as THREE from 'three';
import { CONFIG, WEAPONS } from '/shared/config.js';
import { JETS, JET_IDS, weaponsFor, lockRangeAgainst, makeMagazines, magTick, magCanFire, magFire } from '/shared/jets.js';
import { measureJet } from '/shared/perf.js';
import { createPlaneState, stepPlane, flightInfo } from '/shared/physics.js';
import { obstacleHeight } from '/shared/city.js';
import { createWorld } from './world.js';
import { createCity } from './city.js';
import { buildJet, updateJetVisual, buildMissileMesh } from './jetModel.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { AudioFX } from './audio.js';
import { TacticalMap } from './map.js';
import { Cockpit } from './cockpit.js';

// ------------------------------------------------------------------ setup
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.3, 120000);
const world = createWorld(scene, renderer);
const city = createCity(scene, renderer);
const fx = new Effects(scene);
const hud = new HUD(document.getElementById('hud'));
const input = new Input(canvas);
const audio = new AudioFX();
const tmap = new TacticalMap(input);
const cockpit = new Cockpit();

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const $ = (id) => document.getElementById(id);
function lockPointer() {
  if (tmap.open) return; // the open map owns the mouse
  try { const p = canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* not allowed here */ }
}
const nowS = () => performance.now() / 1000;

// ------------------------------------------------------------------ state
let ws = null;
let myId = null;
let timeOffset = null;           // serverTime - clientTime
let rtt = 0;
let lastPingSent = 0;
let selectedJet = localStorage.getItem('jet') || 'f16';
if (!JETS[selectedJet]) selectedJet = 'f16';
let phase = 'menu';              // menu | flying | dead
let camMode = 'chase';
const roster = new Map();
const remotes = new Map();
const missiles = new Map();
const bullets = [];
const pendingHits = new Map();

const me = {
  state: null, jet: selectedJet, model: null, alive: false,
  hp: 100, maxHp: 100, weapon: 'gun', heat: 0, overheated: false,
  mags: makeMagazines('f16'), protectedUntil: 0,
  lockTarget: null, lockGraceUntil: 0, oobTime: 0, gunAccum: 0,
  firing: false, lastSend: 0, hitMarker: 0, killer: null, deathPos: null, deathTime: 0,
  noLockMsgAt: 0,
};

// camera rig
const camQuat = new THREE.Quaternion();
const camPos = new THREE.Vector3();
let camShake = 0;

// temp objects
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _eul = new THREE.Euler();
const FWD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ menu UI
function statBars(j) {
  const m = measureJet(j.id, j.flight);
  const w = weaponsFor(j.id);
  const bar = (label, value, frac) => `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.round(Math.max(0.06, Math.min(1, frac)) * 100)}%"></i></div><b>${value}</b></div>`;
  return [
    bar('Top speed', `${m.topSpeedKmh} km/h`, (m.topSpeedKmh - 1150) / 450),
    bar('Turn rate', `${m.sustainedTurn}°/s`, (m.sustainedTurn - 22) / 13),
    bar('Turn radius', `${m.turnRadius} m`, (360 - m.turnRadius) / 170),
    bar('Roll rate', `${m.rollRate}°/s`, (m.rollRate - 140) / 120),
    bar('Armor', `${j.flight.hp}`, (j.flight.hp - 80) / 60),
    bar('Lock range', `${(w.lock.lockRange / 1000).toFixed(1)} km`, (w.lock.lockRange - 1400) / 3600),
    bar('Missile dmg', `${w.lock.damage} ×${w.lock.mag}`, (w.lock.damage - 30) / 85),
    bar('Stealth', `${w.stealth} (−${w.stealth * CONFIG.STEALTH_PER_POINT} m)`, w.stealth / 100),
  ].join('') + `<div class="kit">${w.gun.name} · ${w.lock.name}<br>Flares ×${w.flares.count} every ${w.flares.cooldown}s <br>Missiles ×${w.lock.mag} per salvo, reload ${w.lock.reload}s · rockets ×${w.dumb.mag}</div><div class="real">Real: ${j.real || ''}</div>`;
}
function renderJetCards(el, onPick) {
  el.innerHTML = '';
  for (const id of JET_IDS) {
    const j = JETS[id];
    const b = document.createElement('button');
    b.className = 'jet' + (id === selectedJet ? ' sel' : '');
    b.innerHTML = `<div class="nm">${j.short}</div><div class="full">${j.name}</div><div class="role">${j.role}</div>${statBars(j)}`;
    b.onclick = () => { selectedJet = id; localStorage.setItem('jet', id); onPick(); };
    el.appendChild(b);
  }
}
function refreshCards() {
  renderJetCards($('jets'), () => { refreshCards(); setPreview(selectedJet); });
  renderJetCards($('deathJets'), refreshCards);
}
$('name').value = localStorage.getItem('callsign') || '';

// settings
const loadSetting = (k, d) => { const v = localStorage.getItem('opt_' + k); return v === null ? d : JSON.parse(v); };
input.settings.lookRecenter = loadSetting('lookRecenter', true);
input.settings.invertLook = loadSetting('invertLook', false);
input.settings.invertPitch = loadSetting('invert', false);
input.settings.sensitivity = loadSetting('sens', 1);
$('optRecenter').checked = input.settings.lookRecenter;
$('optInvertLook').checked = input.settings.invertLook;
$('optInvert').checked = input.settings.invertPitch;
$('optSens').value = input.settings.sensitivity;
$('optMute').checked = loadSetting('mute', false);
const saveSetting = (k, v) => localStorage.setItem('opt_' + k, JSON.stringify(v));
$('optRecenter').onchange = (e) => { input.settings.lookRecenter = e.target.checked; saveSetting('lookRecenter', e.target.checked); };
$('optInvertLook').onchange = (e) => { input.settings.invertLook = e.target.checked; saveSetting('invertLook', e.target.checked); };
$('optInvert').onchange = (e) => { input.settings.invertPitch = e.target.checked; saveSetting('invert', e.target.checked); };
$('optSens').oninput = (e) => { input.settings.sensitivity = +e.target.value; saveSetting('sens', +e.target.value); };
$('optMute').onchange = (e) => { audio.setMuted(e.target.checked); saveSetting('mute', e.target.checked); };

$('play').onclick = () => {
  const name = $('name').value.trim() || 'Pilot' + Math.floor(Math.random() * 900 + 100);
  localStorage.setItem('callsign', name);
  audio.init();
  audio.setMuted($('optMute').checked);
  send({ t: 'join', name, jet: selectedJet });
  lockPointer();
};
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('play').disabled) $('play').click(); });
$('respawn').onclick = () => doRespawn();
function doRespawn() {
  if ($('respawn').disabled) return;
  send({ t: 'spawn', jet: selectedJet });
  lockPointer();
}
addEventListener('keydown', (e) => { if (e.key === 'Enter' && phase === 'dead') doRespawn(); });
canvas.addEventListener('click', () => { if (phase === 'flying' && !input.pointerLocked && !tmap.open && !paused) lockPointer(); });

// ---------------------------------------------------------------- Esc menu
// The match is online and can't pause: while the menu is open the controls are released
// and the fly-by-wire keeps the jet flying straight and level.
let paused = false;
let wasLocked = false, lastUnlockAt = 0;
function openPause() {
  if (phase !== 'flying' || !me.alive || paused) return;
  paused = true;
  input.enabled = false;
  input.mouseDown = false;
  tmap.close();
  $('pause').classList.remove('hidden');
  $('pChangePanel').classList.add('hidden');
  $('pSettingsPanel').classList.add('hidden');
  $('pChange').classList.remove('active'); $('pSettings').classList.remove('active');
  if (document.pointerLockElement) document.exitPointerLock();
}
function hidePause() {
  paused = false;
  $('pause').classList.add('hidden');
}
function closePause() {
  if (!paused) return;
  hidePause();
  if (phase === 'flying' && me.alive) { input.enabled = true; lockPointer(); }
}
addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || phase !== 'flying') return;
  if (performance.now() - lastUnlockAt < 400) return; // this Esc already released the mouse -> menu is opening
  if (tmap.open) { toggleMap(); return; }
  paused ? closePause() : openPause();
});
// With the mouse captured, the browser uses Esc to release it (the page never sees the key),
// so losing the mouse while flying opens the menu too.
document.addEventListener('pointerlockchange', () => {
  const locked = !!document.pointerLockElement;
  if (!locked && wasLocked) {
    lastUnlockAt = performance.now();
    if (phase === 'flying' && me.alive && !paused && !tmap.open) openPause();
  }
  wasLocked = locked;
});
$('pResume').onclick = () => closePause();
$('pChange').onclick = () => {
  const open = $('pChangePanel').classList.toggle('hidden') === false;
  $('pSettingsPanel').classList.add('hidden'); $('pSettings').classList.remove('active');
  $('pChange').classList.toggle('active', open);
  if (open) renderPauseJets();
};
function renderPauseJets() {
  renderJetCards($('pauseJets'), renderPauseJets);
  $('pSwitch').textContent = selectedJet === me.jet ? `Respawn in ${JETS[selectedJet].short}` : `Switch to ${JETS[selectedJet].short} now`;
}
$('pSwitch').onclick = () => {
  send({ t: 'redeploy', jet: selectedJet });
  closePause();
};
$('pSettings').onclick = () => {
  const open = $('pSettingsPanel').classList.toggle('hidden') === false;
  $('pChangePanel').classList.add('hidden'); $('pChange').classList.remove('active');
  $('pSettings').classList.toggle('active', open);
  $('pMute').checked = $('optMute').checked;
  $('pInvert').checked = input.settings.invertPitch;
  $('pInvertLook').checked = input.settings.invertLook;
  $('pSens').value = input.settings.sensitivity;
};
// the Esc-menu settings mirror the main-menu ones
const mirror = (from, to, event = 'change') => $(from).addEventListener(event, (e) => {
  const el = $(to);
  if (el.type === 'checkbox') el.checked = e.target.checked; else el.value = e.target.value;
  el.dispatchEvent(new Event(event === 'input' ? 'input' : 'change'));
});
mirror('pMute', 'optMute'); mirror('pInvert', 'optInvert'); mirror('pInvertLook', 'optInvertLook'); mirror('pSens', 'optSens', 'input');
function leaveToMainMenu() {
  send({ t: 'leave' });
  document.exitPointerLock?.();
  showMenu();
  refreshCards();
  setPreview(selectedJet);
}
$('pMain').onclick = leaveToMainMenu;
$('deathMain').onclick = leaveToMainMenu;
// safety net: if anything captures the mouse while the map is open, release it again
document.addEventListener('pointerlockchange', () => {
  if (tmap.open && document.pointerLockElement) document.exitPointerLock?.();
});

// menu preview jet
let preview = null;
const PREVIEW_POS = new THREE.Vector3(0, 5200, 0);
function setPreview(id) {
  if (preview) scene.remove(preview.group);
  preview = buildJet(JETS[id]);
  preview.group.position.copy(PREVIEW_POS);
  scene.add(preview.group);
}
refreshCards();
setPreview(selectedJet);

// ------------------------------------------------------------------ networking
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  $('status').textContent = 'Connecting to server…';
  ws.onopen = () => {
    $('play').disabled = false;
    $('play').textContent = 'Take off';
    $('status').textContent = 'Connected.';
  };
  ws.onclose = () => {
    $('play').disabled = true;
    $('play').textContent = 'Disconnected';
    $('status').textContent = 'Lost connection to server — retrying…';
    if (phase !== 'menu') showMenu();
    myId = null;
    for (const id of [...remotes.keys()]) removeRemote(id);
    setTimeout(connect, 2000);
  };
  ws.onmessage = (ev) => handle(JSON.parse(ev.data));
}
function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
connect();

function serverNow() { return nowS() + (timeOffset ?? 0); }

function handle(m) {
  switch (m.t) {
    case 'welcome': myId = m.id; timeOffset = m.time - nowS(); break;
    case 'pong': rtt = (nowS() - m.c) * 1000; break;
    case 'roster': onRoster(m.players); break;
    case 'snap': onSnapshot(m); break;
    case 'spawned': onSpawned(m); break;
    case 'hit': me.hitMarker = 0.3; audio.hit(); break;
    case 'heal': me.hp = m.hp; me.lastHeal = { amount: m.amount, t: nowS() }; break; // shown with the kill message
    case 'hurt': onHurt(m); break;
    case 'kill': onKill(m); break;
    case 'died': onDied(m); break;
    case 'boom': onBoom(m); break;
    case 'launch': onLaunch(m); break;
    case 'flares': onFlares(m); break;
    case 'left': removeRemote(m.id); break;
  }
}

function onRoster(list) {
  roster.clear();
  for (const p of list) roster.set(p.id, p);
  for (const [id, r] of remotes) {
    const info = roster.get(id);
    if (!info) { removeRemote(id); continue; }
    if (info.jet !== r.jet) rebuildRemote(r, info.jet);
    r.name = info.name;
  }
  if (!$('scoreboard').classList.contains('hidden')) renderScoreboard();
  const humans = list.filter((p) => !p.bot).length, bots = list.length - humans;
  $('status').textContent = `Connected · ${humans} pilot${humans === 1 ? '' : 's'} online${bots ? ` · ${bots} bot${bots === 1 ? '' : 's'}` : ''}`;
}

function getRemote(id) {
  let r = remotes.get(id);
  if (!r) {
    const info = roster.get(id);
    const jet = info?.jet || 'f16';
    r = { id, jet, name: info?.name || '?', buf: [], hp: 100, alive: false, firing: false, ab: false, thr: 0.8, prot: false,
      pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), gunAcc: 0, lastSeen: 0, model: null };
    rebuildRemote(r, jet);
    remotes.set(id, r);
  }
  return r;
}
function rebuildRemote(r, jet) {
  if (r.model) scene.remove(r.model.group);
  r.jet = jet;
  r.model = buildJet(JETS[jet]);
  r.model.group.visible = false;
  scene.add(r.model.group);
}
function removeRemote(id) {
  const r = remotes.get(id);
  if (!r) return;
  scene.remove(r.model.group);
  remotes.delete(id);
}

function onSnapshot(m) {
  const sample = m.time - nowS();
  if (timeOffset === null) timeOffset = sample;
  // smooth toward the newest offset; jump forward fast if we fall behind
  timeOffset += (sample - timeOffset) * (sample > timeOffset ? 0.2 : 0.02);

  const seen = new Set();
  for (const [id, p, q, v, hp, flags, thr, ctl] of m.pl) {
    if (id === myId) {
      me.hp = hp;
      if (!(flags & 8)) me.protectedUntil = Math.min(me.protectedUntil, nowS());
      continue;
    }
    const r = getRemote(id);
    seen.add(id);
    r.buf.push({ t: m.time, p, q, v });
    if (r.buf.length > 30) r.buf.shift();
    r.hp = hp; r.firing = !!(flags & 2); r.ab = !!(flags & 4); r.prot = !!(flags & 8); r.superM = !!(flags & 16); r.thr = thr; r.ctl = ctl;
    if (!r.alive) { r.alive = true; r.buf = [{ t: m.time, p, q, v }]; }
    r.lastSeen = nowS();
  }
  for (const r of remotes.values()) if (!seen.has(r.id) && r.alive) { r.alive = false; r.model.group.visible = false; }

  const seenM = new Set();
  for (const [id, kind, p, v, owner, target] of m.ms) {
    seenM.add(id);
    let ms = missiles.get(id);
    if (!ms) {
      ms = { id, kind: kind ? 'lock' : 'dumb', owner, buf: [], mesh: buildMissileMesh(true), pos: new THREE.Vector3(...p), last: new THREE.Vector3(...p), target };
      scene.add(ms.mesh);
      missiles.set(id, ms);
    }
    ms.target = target;
    ms.buf.push({ t: m.time, p, v });
    if (ms.buf.length > 20) ms.buf.shift();
  }
  for (const [id, ms] of missiles) if (!seenM.has(id)) removeMissile(id);
}
function removeMissile(id) {
  const ms = missiles.get(id);
  if (!ms) return;
  scene.remove(ms.mesh);
  missiles.delete(id);
}

function onSpawned(m) {
  phase = 'flying';
  me.jet = m.jet;
  const spec = JETS[m.jet].flight;
  me.state = createPlaneState(m.p, m.q, m.speed);
  me.state.throttle = 0.85;
  me.alive = true;
  me.hp = m.hp; me.maxHp = spec.hp;
  me.heat = 0; me.overheated = false;
  me.mags = makeMagazines(m.jet);
  me.flareReady = 0;
  me.protectedUntil = nowS() + m.prot;
  me.lockTarget = null; me.oobTime = 0; me.gunAccum = 0; me.killer = null; me.deathPos = null;
  if (me.model) scene.remove(me.model.group);
  me.model = buildJet(JETS[m.jet]);
  scene.add(me.model.group);
  input.reset();
  input.enabled = true;
  // snap camera behind the jet
  camQuat.set(...m.q);
  camPos.set(...m.p);
  if (preview) preview.group.visible = false;
  $('menu').classList.add('hidden');
  $('death').classList.add('hidden');
  hidePause();
  centerMessage('');
}

function onHurt(m) {
  camShake = Math.min(1, camShake + m.dmg / 40);
  const el = $('damage');
  el.style.transition = 'none';
  el.style.opacity = Math.min(1, 0.35 + m.dmg / 60);
  requestAnimationFrame(() => { el.style.transition = 'opacity 0.6s'; el.style.opacity = 0; });
  audio.hurt();
  if (me.model && me.state) fx.sparks(me.model.group.position);
}

const WEAPON_LABEL = { gun: 'gun', lock: 'missile', dumb: 'rocket', crash: 'crash', oob: 'left the area', bailout: 'bailed out' };
function nameOf(id) { return roster.get(id)?.name || 'Unknown'; }
function onKill(m) {
  const feed = $('killfeed');
  const div = document.createElement('div');
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  if (m.killer != null) {
    div.innerHTML = `<b class="${m.killer === myId ? 'me' : ''}">${esc(nameOf(m.killer))}</b><em>[${WEAPON_LABEL[m.w] || m.w}]</em><b class="${m.victim === myId ? 'me' : ''}">${esc(nameOf(m.victim))}</b>`;
  } else {
    div.innerHTML = `<b class="${m.victim === myId ? 'me' : ''}">${esc(nameOf(m.victim))}</b><em>${m.w === 'oob' ? 'left the combat area' : 'crashed'}</em>`;
  }
  feed.prepend(div);
  while (feed.children.length > 6) feed.lastChild.remove();
  setTimeout(() => div.remove(), 6200);
  if (m.killer === myId && m.victim !== myId) {
    const heal = me.lastHeal && nowS() - me.lastHeal.t < 1 && me.lastHeal.amount > 0 ? `<br><span style="font-size:18px">+${me.lastHeal.amount} hull repaired</span>` : '';
    centerMessage(`<span style="color:#86ff9e">SPLASH! ${esc(nameOf(m.victim))} destroyed${heal}</span>`, 2.5);
  }
  const r = remotes.get(m.victim);
  if (r) { r.alive = false; r.model.group.visible = false; }
}

function onDied(m) {
  if (phase === 'menu') return;
  tmap.close();
  hidePause();
  me.alive = false;
  phase = 'dead';
  me.killer = m.by;
  me.deathTime = nowS();
  if (me.state && !me.deathPos) me.deathPos = new THREE.Vector3(...me.state.p);
  if (me.model) me.model.group.visible = false;
  input.enabled = false;
  document.exitPointerLock?.();
  $('deathTitle').textContent = m.by != null ? 'SHOT DOWN' : (m.w === 'oob' ? 'OUT OF BOUNDS' : 'CRASHED');
  $('deathBy').textContent = m.by != null ? `Killed by ${nameOf(m.by)} (${WEAPON_LABEL[m.w] || m.w})` : '';
  $('death').classList.remove('hidden');
  refreshCards();
  const btn = $('respawn');
  btn.disabled = true;
  const until = nowS() + (m.respawn || CONFIG.RESPAWN_DELAY);
  const tick = () => {
    const left = until - nowS();
    if (phase !== 'dead') return;
    if (left <= 0) { btn.disabled = false; btn.textContent = 'Respawn'; return; }
    btn.textContent = `Respawn in ${left.toFixed(1)}`;
    requestAnimationFrame(tick);
  };
  tick();
}

let lastLocalBoom = { t: 0, p: new THREE.Vector3() };
function onBoom(m) {
  const p = new THREE.Vector3(...m.p);
  if (m.m != null) removeMissile(m.m);
  if (nowS() - lastLocalBoom.t < 1.5 && lastLocalBoom.p.distanceTo(p) < 80) return; // already shown locally
  fx.explosion(p, m.s);
  const d = camera.position.distanceTo(p);
  audio.explosion(d);
  if (d < 300) camShake = Math.min(1, camShake + (1 - d / 300) * 0.8);
}
function onLaunch(m) {
  if (m.owner === myId) return;
  const r = remotes.get(m.owner);
  if (r && r.pos.distanceTo(camera.position) < 1500) audio.burst({ freq: 2500, sweepTo: 300, dur: 1, vol: 0.25 });
}

// ---- flares
const flareVis = [];
function dropFlares() {
  const t = nowS();
  if (!me.alive || t < me.flareReady) return;
  me.flareReady = t + weaponsFor(me.jet).flares.cooldown;
  send({ t: 'flare' });
}
function onFlares(m) {
  for (const [id, p, v, delay] of m.list) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.flashTex, color: 0xfff1c8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sprite.visible = false;
    scene.add(sprite);
    flareVis.push({ p: new THREE.Vector3(...p), v: new THREE.Vector3(...v), age: -delay, sprite, life: CONFIG.FLARES.lifetime });
  }
  const r = m.owner === myId ? null : remotes.get(m.owner);
  const d = r ? r.pos.distanceTo(camera.position) : 0;
  if (d < 2500) for (let k = 0; k < 3; k++) audio.burst({ freq: 1800, type: 'bandpass', dur: 0.12, vol: 0.35 / (1 + d / 400), delay: k * 0.09 });
}
function updateFlares(dt) {
  for (let i = flareVis.length - 1; i >= 0; i--) {
    const f = flareVis[i];
    f.age += dt;
    if (f.age >= 0) {
      f.v.multiplyScalar(Math.exp(-0.9 * dt));
      f.v.y -= 9.81 * 0.4 * dt;
    }
    f.p.addScaledVector(f.v, dt);
    const life = f.life;
    if (f.age > life) { scene.remove(f.sprite); f.sprite.material.dispose(); flareVis.splice(i, 1); continue; }
    if (f.age < 0) continue;
    const fade = Math.min(1, (life - f.age) / 0.8);
    f.sprite.visible = true;
    f.sprite.position.copy(f.p);
    f.sprite.scale.setScalar((7 + Math.random() * 4) * fade);
    f.sprite.material.opacity = fade;
    fx.fire.emit(f.p.x, f.p.y, f.p.z, 0, 0, 0, 0.15, 2.5, 0.8, fade, 1, 0.85, 0.5, 0);
    fx.smoke.emit(f.p.x, f.p.y, f.p.z, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, 2.5, 1.5, 7, 0.45 * fade, 0.85, 0.85, 0.85, 0.6, 0.8);
  }
}

function centerMessage(html, dur = 0) {
  const el = $('center-msg');
  el.innerHTML = html;
  clearTimeout(centerMessage._t);
  if (dur) centerMessage._t = setTimeout(() => (el.innerHTML = ''), dur * 1000);
}

function showMenu() {
  phase = 'menu';
  tmap.close();
  hidePause();
  me.alive = false;
  input.enabled = false;
  if (me.model) me.model.group.visible = false;
  $('menu').classList.remove('hidden');
  $('death').classList.add('hidden');
  if (preview) preview.group.visible = true;
}

function renderScoreboard() {
  const rows = [...roster.values()].sort((a, b) => b.k - a.k || a.d - b.d);
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  $('scoreboard').innerHTML = `<table><tr><th>Pilot</th><th>Jet</th><th>Kills</th><th>Deaths</th><th>Ping</th></tr>${rows
    .map((p) => `<tr class="${p.id === myId ? 'me' : ''} ${p.alive ? '' : 'dead'}"><td>${esc(p.name)}</td><td>${JETS[p.jet]?.short || p.jet}</td><td>${p.k}</td><td>${p.d}</td><td>${p.bot ? '—' : p.ping}</td></tr>`)
    .join('')}</table>`;
}

// ------------------------------------------------------------------ interpolation
function sampleBuffer(buf, t, outPos, outQuat, outVel) {
  if (!buf.length) return false;
  let i = buf.length - 1;
  while (i > 0 && buf[i - 1].t > t) i--;
  if (i > 0 && buf[i].t >= t && buf[i - 1].t <= t) {
    const a = buf[i - 1], b = buf[i];
    const k = (t - a.t) / ((b.t - a.t) || 1e-6);
    outPos.set(a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k);
    if (outQuat && a.q) { _q1.set(...a.q); outQuat.set(...b.q); outQuat.slerpQuaternions(_q1, outQuat.clone(), k); }
    outVel.set(a.v[0] + (b.v[0] - a.v[0]) * k, a.v[1] + (b.v[1] - a.v[1]) * k, a.v[2] + (b.v[2] - a.v[2]) * k);
    return true;
  }
  // outside the buffer: extrapolate from the nearest sample (limited)
  const s = t < buf[0].t ? buf[0] : buf[buf.length - 1];
  const dt = Math.max(-0.1, Math.min(0.35, t - s.t));
  outPos.set(s.p[0] + s.v[0] * dt, s.p[1] + s.v[1] * dt, s.p[2] + s.v[2] * dt);
  if (outQuat && s.q) outQuat.set(...s.q);
  outVel.set(...s.v);
  return true;
}

// ------------------------------------------------------------------ gameplay
function selectWeapon(w) {
  if (me.weapon === w) return;
  me.weapon = w;
}

function myAxes() {
  const q = _q1.set(...me.state.q);
  return {
    q: q.clone(),
    f: new THREE.Vector3(0, 0, -1).applyQuaternion(q),
    u: new THREE.Vector3(0, 1, 0).applyQuaternion(q),
    r: new THREE.Vector3(1, 0, 0).applyQuaternion(q),
  };
}

function updateLock(pos, fwd) {
  const L = weaponsFor(me.jet).lock;
  let best = null, bestAng = Infinity;
  for (const r of remotes.values()) {
    if (!r.alive || r.prot) continue;
    _v1.subVectors(r.pos, pos);
    const d = _v1.length();
    if (d > lockRangeAgainst(me.jet, r.jet)) continue; // stealth jets lock from closer
    const ang = fwd.angleTo(_v1);
    if (ang <= L.lockCone && ang < bestAng) { bestAng = ang; best = r.id; }
  }
  const t = nowS();
  if (best != null) { me.lockTarget = best; me.lockGraceUntil = t + L.lockGrace; }
  else if (t > me.lockGraceUntil) me.lockTarget = null;
  if (me.lockTarget != null && !remotes.get(me.lockTarget)?.alive) me.lockTarget = null;
}

function fireWeapons(ctrl, dt, pos, axes) {
  const t = nowS();
  const G = weaponsFor(me.jet).gun;
  me.firing = false;
  if (me.weapon === 'gun' && ctrl.fire && !me.overheated) {
    me.firing = true;
    me.protectedUntil = Math.min(me.protectedUntil, t);
    me.gunAccum += dt * G.fireRate;
    const gunWorld = me.model.gun.clone().applyQuaternion(axes.q).add(pos);
    const vel = new THREE.Vector3(...me.state.v);
    while (me.gunAccum >= 1) {
      me.gunAccum -= 1;
      const dir = axes.f.clone()
        .addScaledVector(axes.r, (Math.random() - 0.5) * 2 * G.spread)
        .addScaledVector(axes.u, (Math.random() - 0.5) * 2 * G.spread).normalize();
      // offset each round a little along its path so rounds fired in the same frame spread out
      const jitter = Math.random() * dt;
      const v = vel.clone().addScaledVector(dir, G.muzzleVelocity);
      bullets.push({ p: gunWorld.clone().addScaledVector(v, jitter), origin: gunWorld.clone(), v, life: G.lifetime, local: true, tracer: true, big: G.baseDamage > 3 });
      me.heat += G.heatPerShot;
      if (me.heat >= 1) { me.heat = 1; me.overheated = true; break; }
    }
    if (Math.random() < 0.5) fx.flash(gunWorld, 2.2, 0.05, 0xffe0a0);
  } else {
    me.gunAccum = 0;
  }
  if (!me.firing) {
    me.heat = Math.max(0, me.heat - G.coolRate * dt);
    if (me.overheated && me.heat < G.overheatLockout) me.overheated = false;
  }

  if ((me.weapon === 'lock' || me.weapon === 'dumb') && ctrl.fire) {
    const k = me.weapon;
    const W = weaponsFor(me.jet)[k];
    if (magCanFire(me.mags[k], W, t)) {
      if (k === 'lock' && me.lockTarget == null) {
        if (t > me.noLockMsgAt) { centerMessage(`<span style="color:#ffd84b">NO LOCK — get an enemy in front of you, within ${weaponsFor(me.jet).lock.lockRange} m</span>`, 1.5); me.noLockMsgAt = t + 1.5; }
      } else {
        send({ t: 'fire', k, tg: me.lockTarget });
        magFire(me.mags[k], W, t);
        me.protectedUntil = Math.min(me.protectedUntil, t);
        audio.missileLaunch();
      }
    }
  }
}

function updateBullets(dt) {
  const hitR2 = CONFIG.GUN.hitRadius * CONFIG.GUN.hitRadius;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    _v2.copy(b.p);
    b.p.addScaledVector(b.v, dt);
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && b.local) {
      // segment vs sphere against each remote jet (as we see it)
      _v3.subVectors(b.p, _v2);
      const segLen2 = _v3.lengthSq() || 1;
      for (const r of remotes.values()) {
        if (!r.alive) continue;
        _v1.subVectors(r.pos, _v2);
        const k = Math.max(0, Math.min(1, _v1.dot(_v3) / segLen2));
        const cx = _v2.x + _v3.x * k - r.pos.x, cy = _v2.y + _v3.y * k - r.pos.y, cz = _v2.z + _v3.z * k - r.pos.z;
        if (cx * cx + cy * cy + cz * cz < hitR2) {
          if (!r.prot) pendingHits.set(r.id, (pendingHits.get(r.id) || 0) + 1);
          fx.sparks(r.pos);
          dead = true;
          break;
        }
      }
    }
    if (!dead && b.p.y < obstacleHeight(b.p.x, b.p.z)) {
      dead = true;
      if (b.local && Math.random() < 0.3) fx.smoke.emit(b.p.x, b.p.y + 2, b.p.z, 0, 4, 0, 1.5, 3, 10, 0.4, 0.55, 0.5, 0.42, 1, 1);
    }
    if (dead) bullets.splice(i, 1);
  }
  for (const [id, n] of pendingHits) {
    let left = n;
    while (left > 0) { const c = Math.min(10, left); send({ t: 'hit', id, n: c }); left -= c; }
  }
  pendingHits.clear();
}

function crash(reason) {
  if (!me.alive) return;
  tmap.close();
  send({ t: 'crash', r: reason });
  const p = new THREE.Vector3(...me.state.p);
  fx.explosion(p, 2);
  audio.explosion(0);
  lastLocalBoom = { t: nowS(), p };
  me.alive = false; // server will confirm with 'died'
  me.model.group.visible = false;
  phase = 'dead';
  me.deathPos = p;
  me.deathTime = nowS();
  input.enabled = false;
}

// ------------------------------------------------------------------ main loop
const clock = new THREE.Clock();
let elapsed = 0;
let sendAcc = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  frameDt = dt;
  elapsed += dt;
  const t = nowS();
  const renderT = serverNow() - CONFIG.INTERP_DELAY;

  // ---- input
  const { presses, wheel } = input.consumePresses();
  for (const code of presses) {
    if (code === 'Digit1') selectWeapon('gun');
    if (code === 'Digit2') selectWeapon('lock');
    if (code === 'Digit3') selectWeapon('dumb');
    if (code === 'KeyC') camMode = camMode === 'chase' ? 'cockpit' : 'chase';
    if (code === 'MouseRight' || code === 'Gamepad_Next') selectWeapon(WEAPONS[(WEAPONS.indexOf(me.weapon) + 1) % 3]);
    if (code === 'KeyF') dropFlares();
    if (code === 'KeyM' && phase === 'flying' && me.alive) toggleMap();
    if (code === 'KeyN') { $('optMute').checked = !$('optMute').checked; audio.setMuted($('optMute').checked); }
  }
  if (wheel) selectWeapon(WEAPONS[(WEAPONS.indexOf(me.weapon) + (wheel > 0 ? 1 : 2)) % 3]);
  const tabHeld = input.keys.has('Tab') && phase !== 'menu';
  $('scoreboard').classList.toggle('hidden', !tabHeld);
  if (tabHeld && (elapsed * 4 | 0) !== (frame._sb | 0)) { frame._sb = elapsed * 4 | 0; renderScoreboard(); }
  $('resume').classList.toggle('hidden', !(phase === 'flying' && !input.pointerLocked && !tmap.open && !paused));

  const ctrl = input.read(dt);
  lastCtrl = ctrl;

  // ---- own jet
  let axes = null;
  if (me.alive && me.state) {
    const spec = JETS[me.jet].flight;
    const steps = Math.ceil(dt / (1 / 120));
    for (let i = 0; i < steps; i++) stepPlane(me.state, ctrl, spec, dt / steps);
    const pos = _v1.set(...me.state.p).clone();
    axes = myAxes();
    me.model.group.position.copy(pos);
    me.model.group.quaternion.copy(axes.q);
    me.model.group.visible = true;
    updateJetVisual(me.model, me.state.throttle, me.state.ab, elapsed, [ctrl.pitch, ctrl.roll, ctrl.yaw]);
    me.model.cabin.visible = camMode !== 'cockpit';
    me.model.canopy.visible = camMode !== 'cockpit';

    // ground / sea collision
    if (pos.y < obstacleHeight(pos.x, pos.z) + 2.5) crash('crash');
    // combat area
    if (Math.abs(pos.x) > CONFIG.MAP_HALF || Math.abs(pos.z) > CONFIG.MAP_HALF) {
      me.oobTime += dt;
      if (me.oobTime > CONFIG.OUT_OF_BOUNDS_TIME) crash('oob');
    } else me.oobTime = 0;

    if (me.alive) {
      updateLock(pos, axes.f);
      fireWeapons(ctrl, dt, pos, axes);

      // contrails at high G or high altitude, damage smoke
      if (Math.abs(me.state.g) > 6.5 || pos.y > 6500 || me.state.superM > 0.3) {
        for (const tip of me.model.wingtips) {
          const w = tip.clone().applyQuaternion(axes.q).add(pos);
          fx.smoke.emit(w.x, w.y, w.z, 0, 0, 0, 1.2, 0.5, 2.5, 0.35, 0.95, 0.95, 0.97, 0.5);
        }
      }
      emitDamageSmoke(me.model, pos, axes.q, me.hp / me.maxHp, dt);
    }

    // stream state to server
    sendAcc += dt;
    if (sendAcc >= 1 / CONFIG.CLIENT_SEND_RATE && me.alive) {
      sendAcc = 0;
      const r1 = (x) => Math.round(x * 100) / 100;
      send({ t: 's', p: me.state.p.map(r1), q: me.state.q.map((x) => Math.round(x * 1e5) / 1e5), v: me.state.v.map(r1), thr: r1(me.state.throttle), ab: me.state.ab, f: me.firing, c: [r1(ctrl.pitch), r1(ctrl.roll), r1(ctrl.yaw)], sm: me.state.superM > 0.3 });
    }
  }
  if (t - lastPingSent > 2) { lastPingSent = t; send({ t: 'ping', c: t, rtt: Math.round(rtt) }); }

  // ---- remote jets
  for (const r of remotes.values()) {
    if (!r.alive) continue;
    sampleBuffer(r.buf, renderT, r.pos, r.quat, r.vel);
    const g = r.model.group;
    g.visible = true;
    g.position.copy(r.pos);
    g.quaternion.copy(r.quat);
    updateJetVisual(r.model, r.thr, r.ab, elapsed + r.id, r.ctl);
    if (r.firing) {
      const RG = weaponsFor(r.jet).gun;
      r.gunAcc += dt * RG.fireRate * 0.6;
      const f = _v2.set(0, 0, -1).applyQuaternion(r.quat);
      while (r.gunAcc >= 1) {
        r.gunAcc -= 1;
        const gp = r.model.gun.clone().applyQuaternion(r.quat).add(r.pos);
        const v = r.vel.clone().addScaledVector(f, RG.muzzleVelocity);
        v.x += (Math.random() - 0.5) * 8; v.y += (Math.random() - 0.5) * 8;
        bullets.push({ p: gp.clone().addScaledVector(v, Math.random() * dt), origin: gp, v, life: RG.lifetime, local: false, tracer: true, big: RG.baseDamage > 3 });
      }
    }
    if (r.pos.y > 6500 || r.superM) {
      for (const tip of r.model.wingtips) {
        const w = tip.clone().applyQuaternion(r.quat).add(r.pos);
        fx.smoke.emit(w.x, w.y, w.z, 0, 0, 0, 1.2, 0.5, 2.5, 0.3, 0.95, 0.95, 0.97, 0.5);
      }
    }
    emitDamageSmoke(r.model, r.pos, r.quat, r.hp / (JETS[r.jet].flight.hp), dt);
  }

  // ---- missiles
  let missileWarning = false;
  const hudMissiles = [];
  for (const ms of missiles.values()) {
    const vel = _v3;
    sampleBuffer(ms.buf, renderT, ms.pos, null, vel);
    ms.mesh.position.copy(ms.pos);
    if (vel.lengthSq() > 1) ms.mesh.quaternion.setFromUnitVectors(FWD, _v2.copy(vel).normalize());
    // smoke trail: fill the gap since last frame
    const gap = ms.pos.distanceTo(ms.last);
    if (gap < 200) {
      const n = Math.min(12, Math.ceil(gap / 4));
      for (let i = 0; i < n; i++) {
        const k = i / n;
        const x = ms.last.x + (ms.pos.x - ms.last.x) * k, y = ms.last.y + (ms.pos.y - ms.last.y) * k, z = ms.last.z + (ms.pos.z - ms.last.z) * k;
        fx.smoke.emit(x, y, z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 3.5, 1.2, 7, 0.55, 0.9, 0.9, 0.9, 0.6, 0.6);
      }
      fx.fire.emit(ms.pos.x, ms.pos.y, ms.pos.z, 0, 0, 0, 0.08, 2.4, 1, 1, 1, 0.75, 0.35, 0);
    }
    ms.last.copy(ms.pos);
    if (ms.mesh.userData.flame) ms.mesh.userData.flame.scale.setScalar(0.8 + Math.random() * 0.4);
    const threat = ms.target === myId && me.alive;
    if (threat) missileWarning = true;
    hudMissiles.push({ pos: ms.pos, threat });
  }

  updateBullets(dt);
  updateFlares(dt);
  fx.drawTracers(bullets);

  // ---- camera
  updateCamera(dt, ctrl, axes);
  fx.setFog(scene.fog, renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360)) / renderer.getPixelRatio() * renderer.getPixelRatio());
  fx.update(dt);
  world.updateClouds(camera.position);
  city.update(elapsed);

  // ---- HUD
  if (phase === 'flying' && me.alive && axes) {
    drawHud(axes, missileWarning, hudMissiles);
  } else {
    hud.clear();
  }

  // ---- audio
  audio.update({
    active: phase === 'flying' && me.alive,
    throttle: me.state?.throttle || 0, ab: me.state?.ab, speed: me.state ? Math.hypot(...me.state.v) : 0,
    gun: me.firing, lock: me.weapon === 'lock' && me.alive ? (me.lockTarget != null ? 'locked' : 'search') : 'none',
    warning: missileWarning, t: elapsed,
  });

  // FPS meter: frames counted over half-second windows, plus the slowest frame in that window
  const nowMs = performance.now();
  fpsStat.frames++;
  fpsStat.worst = Math.max(fpsStat.worst, nowMs - fpsStat.last);
  fpsStat.last = nowMs;
  if (nowMs - fpsStat.start >= 500) {
    const fps = (fpsStat.frames * 1000) / (nowMs - fpsStat.start);
    const col = fps >= 50 ? '#86ff9e' : fps >= 30 ? '#ffd84b' : '#ff5b5b';
    const net = ws?.readyState === 1 ? `ping ${Math.round(rtt)} ms` : 'offline';
    $('netinfo').innerHTML = `<b style="color:${col}">${Math.round(fps)} FPS</b> · slowest frame ${Math.round(fpsStat.worst)} ms · ${net}`;
    fpsStat.frames = 0; fpsStat.worst = 0; fpsStat.start = nowMs;
  }
  const near = camMode === 'cockpit' && phase === 'flying' && me.alive ? 0.04 : 0.3;
  if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }
  renderer.render(scene, camera);
  if (camMode === 'cockpit' && phase === 'flying' && me.alive && me.model) {
    cockpit.build(JETS[me.jet], scene.environment);
    cockpit.update(cockpitData(ctrl), dt);
    renderer.autoClear = false;
    cockpit.render(renderer, camera, me.model.group);
    renderer.autoClear = true;
  }
}

// live data for the cockpit displays, stick and throttle
function cockpitData(ctrl) {
  const s = me.state, info = flightInfo(s), t = nowS();
  const pos = me.model.group.position;
  const invQ = me.model.group.quaternion.clone().invert();
  const contacts = [];
  for (const r of remotes.values()) {
    if (!r.alive) continue;
    const rel = r.pos.clone().sub(pos);
    const local = rel.clone().applyQuaternion(invQ);
    contacts.push({ bearing: Math.atan2(local.x, -local.z), dist: rel.length(), locked: me.lockTarget === r.id });
  }
  const W = weaponsFor(me.jet);
  const mag = (k) => { magTick(me.mags[k], W[k], t); const m = me.mags[k]; return m.ammo > 0 ? `${m.ammo}/${W[k].mag}` : `RLD ${Math.max(0, m.reloadEnd - t).toFixed(1)}`; };
  return {
    pitch: ctrl.pitch, roll: ctrl.roll, lever: input.throttle,
    heading: info.heading, pitchAng: info.pitch, rollAng: info.roll,
    speed: info.speed, alt: s.p[1], g: s.g, contacts, lockRange: W.lock.lockRange,
    hp: me.hp, maxHp: me.maxHp,
    weapons: { gun: me.overheated ? 'HOT' : `${Math.round(me.heat * 100)}%`, lock: mag('lock'), dumb: mag('dumb'), flare: t < me.flareReady ? `${(me.flareReady - t).toFixed(1)}s` : 'RDY' },
  };
}

let dmgSmokeAcc = 0;
let lastCtrl = {};
let frameDt = 1 / 60;
const fpsStat = { frames: 0, worst: 0, start: performance.now(), last: performance.now() };

function toggleMap() {
  const open = tmap.toggle(me.model ? me.model.group.position : null, hud.w, hud.h);
  if (!open) lockPointer(); // back to mouse-look
}
function emitDamageSmoke(model, pos, quat, frac, dt) {
  if (frac > 0.5) return;
  const heavy = frac < 0.25;
  const n = heavy ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const p = model.nozzles[0].clone().applyQuaternion(quat).add(pos);
    const s = heavy ? 0.12 : 0.3;
    fx.smoke.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 2.5, 1.5, 8, heavy ? 0.7 : 0.45, s, s, s, 0.8, 1);
    if (heavy && Math.random() < 0.5) fx.fire.emit(p.x, p.y, p.z, 0, 0, 0, 0.15, 2, 0.8, 0.9, 1, 0.5, 0.15, 0);
  }
}

function updateCamera(dt, ctrl, axes) {
  if (phase === 'menu') {
    // slow orbit around the preview jet
    const a = elapsed * 0.25;
    const L = JETS[selectedJet].model.length;
    camera.position.set(PREVIEW_POS.x + Math.sin(a) * L * 1.7, PREVIEW_POS.y + L * 0.35, PREVIEW_POS.z + Math.cos(a) * L * 1.7);
    camera.up.set(0, 1, 0);
    camera.lookAt(PREVIEW_POS.x - L * 0.25, PREVIEW_POS.y, PREVIEW_POS.z);
    camera.fov = 50; camera.updateProjectionMatrix();
    return;
  }
  if (!me.alive || !axes) {
    // death cam: watch the killer if visible, otherwise orbit the wreck
    const killer = me.killer != null ? remotes.get(me.killer) : null;
    if (killer && killer.alive) {
      const f = _v2.set(0, 0, -1).applyQuaternion(killer.quat);
      const target = killer.pos.clone().addScaledVector(f, -45).add(_v3.set(0, 12, 0));
      camera.position.lerp(target, 1 - Math.exp(-3 * dt));
      camera.up.set(0, 1, 0);
      camera.lookAt(killer.pos);
    } else if (me.deathPos) {
      const a = elapsed * 0.3;
      const cx = me.deathPos.x + Math.sin(a) * 120, cz = me.deathPos.z + Math.cos(a) * 120;
      camera.position.set(cx, Math.max(me.deathPos.y + 50, obstacleHeight(cx, cz) + 30), cz);
      camera.up.set(0, 1, 0);
      camera.lookAt(me.deathPos);
    }
    return;
  }

  const pos = me.model.group.position;
  const L = JETS[me.jet].model.length;
  const speed = Math.hypot(...me.state.v);
  // the camera's orientation lags the jet slightly, which shows the jet's motion
  camQuat.slerp(axes.q, 1 - Math.exp(-(camMode === 'cockpit' ? 30 : 7) * dt));

  let fov = 68 + Math.min(14, Math.max(0, (speed - 150) / 20));
  // mouse free-look (and V = look behind) rotate the view around the jet
  const lookQ = _q2.setFromEuler(_eul.set(input.look.pitch, input.look.yaw + (ctrl.lookBack ? Math.PI : 0), 0, 'YXZ'));
  if (camMode === 'cockpit') {
    // pilot's eye, inside the canopy (the cockpit itself is drawn as a separate layer)
    camera.position.copy(Cockpit.eyeFor(JETS[me.jet])).applyQuaternion(axes.q).add(pos);
    camera.quaternion.copy(axes.q).multiply(lookQ);
    camera.quaternion.multiply(_q1.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.1)); // natural slight look-down over the panel
    fov += 8;
  } else {
    const q = _q3.copy(camQuat).multiply(lookQ);
    const offset = _v2.set(0, L * 0.3, L * 1.45).applyQuaternion(q);
    camera.position.copy(pos).add(offset);
    camera.quaternion.copy(q);
    // tilt slightly down so the jet sits below the center
    camera.quaternion.multiply(_q1.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.06));
    // keep the camera above ground
    const gy = obstacleHeight(camera.position.x, camera.position.z) + 3;
    if (camera.position.y < gy) camera.position.y = gy;
  }
  // shake from gunfire, hits and high G
  const gShake = Math.max(0, Math.abs(me.state.g) - 7) * 0.01;
  const shake = camShake * 0.6 + (me.firing ? 0.06 : 0) + gShake + (me.state.ab ? 0.02 : 0);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    camera.rotation.z += (Math.random() - 0.5) * shake * 0.01;
  }
  camShake = Math.max(0, camShake - dt * 1.5);
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-3 * dt));
  camera.updateProjectionMatrix();
  camPos.copy(camera.position);
}

// ammo + reload progress of both missile magazines, for the HUD
function magazineStatus(t) {
  const out = {};
  for (const k of ['lock', 'dumb']) {
    const W = weaponsFor(me.jet)[k], m = me.mags[k];
    magTick(m, W, t);
    out[k] = { ammo: m.ammo, mag: W.mag, reloadLeft: m.reloadEnd ? Math.max(0, m.reloadEnd - t) : 0, reload: W.reload, gapLeft: Math.max(0, W.salvoGap - (t - m.lastShot)) };
  }
  return out;
}

function drawHud(axes, missileWarning, hudMissiles) {
  const myW = weaponsFor(me.jet);
  const pos = me.model.group.position;
  const vel = new THREE.Vector3(...me.state.v);
  const speed = vel.length();
  const info = flightInfo(me.state);
  const t = nowS();
  const targets = [];
  let lead = null, bestAng = Infinity;
  for (const r of remotes.values()) {
    if (!r.alive) continue;
    const dist = r.pos.distanceTo(pos);
    const rel = _v1.subVectors(r.pos, pos);
    const ang = axes.f.angleTo(rel);
    const inLockZone = dist <= lockRangeAgainst(me.jet, r.jet) && ang <= myW.lock.lockCone;
    targets.push({ id: r.id, name: r.name, jet: JETS[r.jet].short, pos: r.pos, dist, hp: r.hp, maxHp: JETS[r.jet].flight.hp, locked: me.lockTarget === r.id && me.weapon === 'lock', inLockZone, protected: r.prot });
    // gun lead for the enemy closest to the nose
    if (dist < 1600 && ang < 0.6 && ang < bestAng) {
      bestAng = ang;
      const relV = _v2.subVectors(r.vel, vel);
      let tof = dist / myW.gun.muzzleVelocity;
      const aim = new THREE.Vector3();
      for (let i = 0; i < 3; i++) { aim.copy(rel).addScaledVector(relV, tof); tof = aim.length() / myW.gun.muzzleVelocity; }
      const onTarget = axes.f.angleTo(aim) < Math.atan(CONFIG.GUN.hitRadius / aim.length());
      lead = { point: pos.clone().add(aim), onTarget };
    }
  }
  // look ahead for terrain
  let pullUp = false;
  for (const la of [1.5, 3, 4.5]) {
    const x = pos.x + vel.x * la, z = pos.z + vel.z * la, y = pos.y + vel.y * la;
    if (y < obstacleHeight(x, z) + 20 && vel.y < 0) pullUp = true;
  }
  hud.draw(camera, {
    pos, fwd: axes.f, vel, speed, info, camPos,
    agl: pos.y - obstacleHeight(pos.x, pos.z),
    g: me.state.g, aoa: me.state.aoa, throttle: me.state.throttle, lever: input.throttle, ab: me.state.ab,
    flareCd: Math.max(0, me.flareReady - t), flareMax: myW.flares.cooldown, weaponsInfo: myW,
    stalled: me.state.stalled, pullUp, superM: me.state.superM > 0.3, brake: !!lastCtrl.brake,
    hp: me.hp, maxHp: me.maxHp, jetName: JETS[me.jet].short,
    weapon: me.weapon, heat: me.heat, overheated: me.overheated,
    mags: magazineStatus(t),
    lockTarget: me.lockTarget, targets, lead, missiles: hudMissiles,
    missileWarning, oob: me.oobTime > 0 ? CONFIG.OUT_OF_BOUNDS_TIME - me.oobTime : null,
    protected: Math.max(0, me.protectedUntil - t),
    hitMarker: me.hitMarker, time: elapsed,

  });
  me.hitMarker = Math.max(0, me.hitMarker - 1 / 60);

  // tactical map (corner, or expanded with M)
  const enemies = [];
  for (const r of remotes.values()) {
    if (!r.alive) continue;
    enemies.push({ pos: r.pos, fwd: _v3.set(0, 0, -1).applyQuaternion(r.quat).clone(), name: r.name, jet: JETS[r.jet].short, dist: r.pos.distanceTo(pos), locked: me.lockTarget === r.id && me.weapon === 'lock' });
  }
  tmap.draw(hud.ctx, hud.w, hud.h, {
    dt: frameDt, me: { pos, fwd: axes.f }, enemies, missiles: hudMissiles,
    flares: flareVis.filter((f) => f.age >= 0).map((f) => f.p),
  });
}

frame();

// handy for debugging from the browser console
window.skyAces = { me, remotes, missiles, roster, input, tmap, get phase() { return phase; } };
