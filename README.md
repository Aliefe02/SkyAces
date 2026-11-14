# Sky Aces Online

Multiplayer jet dogfighting in the browser. Players pick one of eight jets (F-16, F-22, Su-57,
F-15, F-35, Su-35, MiG-29, Typhoon), spawn in the air
at different points around the map, and fight each other (plus bots when the server is quiet).

## Run it

```bash
npm install
npm start            # http://localhost:3000
```

Other people on your network can join at `http://<your-ip>:3000`. To play over the internet,
deploy the folder to any Node host (Render, Railway, Fly.io, a VPS…) — it is one Node process
serving both the page and the WebSocket (`/ws`). Env vars: `PORT` (default 3000),
`BOT_FILL` (bots fill the server up to this many pilots; `0` disables bots).

## Controls

| Input | Action |
|---|---|
| W / S | Throttle 0–100% (shown on the HUD gauge). 90–100% is the afterburner range; holding S also air-brakes |
| A / D | Turn left / right (rudder) |
| ← / → | Bank (roll) |
| ↑ / ↓ | Nose down / nose up (flip with "Invert pitch" in Settings) |
| Mouse (click the game to capture it) | Look around only — it never flies the jet. Middle click recenters |
| Hold S while pulling (↓) or turning (A/D) | Cobra: post-stall braking |
| F | Drop flares (count / cooldown depend on the jet) |
| M | Tactical map: grows out of the bottom-left corner. While open, the mouse only controls the map (wheel = zoom around the cursor, drag = move); M or Esc closes it. Keep flying with the keyboard |
| N | Mute sound |
| Esc | Menu: resume, change aircraft (instant respawn; counts as a death if you were hit in the last 8 s), settings & controls, main menu. The match keeps running, so your jet flies straight and level while it's open |
| Left click / Space | Fire selected weapon |
| 1 / 2 / 3, wheel, right click | Minigun / lock-on missile / unguided rocket |
| C | Chase camera / first-person cockpit (live radar, horizon and weapons displays; stick and throttle move with you) |
| V (hold) | Look behind |
| Tab (hold) | Scoreboard |

Gamepads work too (left stick fly, right stick rudder, triggers throttle, LT hard = brake, A/RB fire, B flares, Y next weapon).

### Cobra / post-stall braking

At speed, hold **S** while pulling the nose up (↓ or mouse) or kicking the rudder (A/D). The
fly-by-wire lets the nose go far past its normal limit — up to ~70° on the F-16, ~95° on the
F-22 and ~105° on the Su-57 — while the jet keeps sliding along its old path, and the drag
bleeds speed fast (roughly 300 → 80 m/s in 2.5 s). Let go of S and the nose drops back to the
flight path; push W to get your energy back. Great for making a chaser overshoot.

## Map

A procedural city (~3,200 buildings, a 640 m landmark tower in the center, streets and parks)
sits in the middle of the map, surrounded by hills, mountains and sea. Buildings are solid:
jets, bullets and missiles all collide with them. Settings live in `CONFIG.CITY`
(`shared/config.js`); set `enabled: false` to remove it.

## Jets

Every jet's numbers are scaled from its real-world stats (top speed / Mach, thrust-to-weight,
wing loading, roll rate, turn rates, radar, missile, gun, countermeasures, radar cross-section).
Game turn rates are ~1.4x the real ones to keep dogfights tight. The menu cards show the
measured in-game values (computed from the flight model, so they always stay accurate).

| Jet | Top speed | Turn (sustained) | Turn radius | Roll | Armor | Lock range / cone | Stealth | Gun | Flares |
|---|---|---|---|---|---|---|---|---|---|
| MiG-29 | 1475 km/h | 29.4°/s | 234 m | 218°/s | 95 | 1.8 km / 45° (agile R-73) | 0 | GSh-30-1 30 mm | 6, every 5 s |
| F-16 | 1441 km/h | 30.1°/s | 255 m | 252°/s | 100 | 2.4 km / 35° | 20 | M61A1 20 mm | 6, every 5 s |
| Typhoon | 1421 km/h | 34.3°/s | 207 m | 229°/s | 100 | 2.9 km / 35° (Meteor) | 40 | BK-27 27 mm | 6, every 4.5 s |
| F-35 | 1296 km/h | 25.9°/s | 274 m | 172°/s | 105 | 3.5 km / 40° | **100** | GAU-22/A 25 mm | 4, every 6 s |
| F-15 | 1547 km/h | 27.3°/s | 323 m | 195°/s | 130 | 3.7 km / 30° | 5 | M61A1 20 mm | 8, every 4 s |
| F-22 | 1495 km/h | 33.6°/s | 229 m | 212°/s | 110 | 4.0 km / 30° | 90 | M61A2 20 mm | 4, every 6 s |
| Su-35 | 1495 km/h | 32.2°/s | 217 m | 212°/s | 135 | 4.3 km / 40° | 10 | GSh-30-1 30 mm | 8, every 4 s |
| Su-57 | 1439 km/h | 33.6°/s | 215 m | 212°/s | 120 | 4.6 km / 40° | 65 | GSh-30-1 30 mm | 6, every 5 s |

**Stealth** (0–100): when someone tries to lock onto you, their lock range drops by
`stealth × 5 m` (`CONFIG.STEALTH_PER_POINT`). Example: a Su-57 (4.6 km) locking an F-35
(stealth 100) only gets 4.1 km; against a MiG-29 (stealth 0) it keeps the full 4.6 km.

Missile magazines: the F-15, Su-35, F-22 and Su-57 carry **2 lock-on missiles ready to fire**
(the F-15, Su-35 and Su-57 also 2 rockets). Fire both back to back (0.35 s apart); the first shot
starts the reload and when it finishes the magazine is full again — so their reload is longer
(3.8–4.6 s) than the single-shot jets' (2.5–3 s). The HUD shows one pip per missile.
Set `mag` and `reload` per weapon in `shared/jets.js`.

Missiles differ too: R-73 turns hardest but is short-ranged, Meteor is fastest and burns
longest, R-77 variants hit a bit harder. Tune everything per jet in `shared/jets.js`
(`flight`, `weapons`).

## Weapons

Every kill repairs **half your hull** (two kills from almost dead = full health).
Missiles and rockets launch from under the wings, alternating left, right, left...; the gun fires from the nose.

- **Flares (F)** — drop 6 burning flares; each lock-on missile already tracking you has an 80%
  chance to go after a flare instead, and missiles fired at you while they burn may too.
  Count and cooldown depend on the jet. Bots use them as well.

- **Gun** — each jet's real cannon: fast-firing 20 mm Vulcan, or slower, harder-hitting
  25/27/30 mm guns with fatter tracers. `CONFIG.GUN.damageScale` (in `shared/config.js`, now 0.6)
  scales every gun's damage at once. Overheats on long bursts; the HUD lead circle shows where to aim.
- **Lock-on missile** — locks only when an enemy is in front of the nose (30° cone) and within
  your jet's lock range (1.8–4.6 km, minus the target's stealth — see table). Homing (a hard, well-timed break turn can still beat it).
- **Rocket (no lock)** — flies straight where you point it, bigger warhead, 2.5 s reload.

## Project layout

```
server.js              HTTP + WebSocket server, damage/kills, missile simulation, bots
shared/config.js       All gameplay tuning (weapons, lock range, map size, spawn rules…)
shared/jets.js         Jet catalogue: flight-model numbers + 3D model parameters
shared/physics.js      Flight model (used by the browser and by server bots)
shared/terrain.js      Deterministic terrain (same heights on server and client)
shared/city.js         Deterministic city layout + building collision
public/js/city.js      City rendering (instanced buildings with window shader, streets, parks)
public/js/jetModel.js  Procedural jet builder (one builder, many jets)
public/js/main.js      Game client: networking, weapons, camera, game loop
public/js/hud.js       HUD (pitch ladder, targets, lock, throttle, weapons)
public/js/map.js       Tactical map (corner minimap, M to expand, zoom / pan)
public/js/world.js     Sky, terrain, water, clouds
public/js/effects.js   Smoke, fire, tracers, explosions
public/hangar.html     Hangar viewer — open /hangar.html to inspect every jet model
```

## Adding a jet

Copy an entry in `shared/jets.js`, give it a new id, and change the numbers:

- `flight` — G limit, roll/pitch rates, thrust, drag, AoA limit, thrust vectoring, hit points.
- `model` — fuselage cross-sections, wing/stabilizer outlines, flaperons, tail count and cant,
  intake style (`chin`, `side`, `nacelle`), nozzles (`round`/`square`), canopy and frames,
  pitot, sensor ball, antennas, underwing stores, paint scheme, `insignia` (`us` / `ru` / `eu`),
  `iff` blades, `serrated` nozzles. Wings and tails get real airfoil sections, and markings are
  projected decals that wrap onto the curved skin. Control surfaces move with
  the stick on every client; check them with "Move controls" in `/hangar.html`.

It appears automatically in the jet picker and works for bots. Check the look at `/hangar.html`.

## Notes

- Each client simulates its own jet and streams its position; the server owns health, kills,
  missiles, reloads and bots, and sanity-checks gun hits (rate and range). That keeps flying
  lag-free but is not cheat-proof.
- Jets pass through each other (no mid-air collisions).
