// Game-wide tuning. Shared by server and client so both agree on the rules.
// All distances are meters, times are seconds, speeds are m/s.

export const CONFIG = {
  G: 9.81,

  // World
  MAP_HALF: 9000,          // combat area is a square of 2*MAP_HALF meters
  TERRAIN_HALF: 16000,     // terrain mesh extends past the combat area
  CEILING: 9000,           // hard altitude limit
  OUT_OF_BOUNDS_TIME: 10,  // seconds outside the area before you are destroyed

  // Spawning
  SPAWN_ALT_MIN: 1600,
  SPAWN_ALT_MAX: 2800,
  SPAWN_SPEED: 210,
  SPAWN_PROTECTION: 3,
  RESPAWN_DELAY: 3,

  // Networking
  SNAPSHOT_RATE: 20,       // server -> client snapshots per second
  CLIENT_SEND_RATE: 20,    // client -> server state updates per second
  INTERP_DELAY: 0.1,       // remote entities are rendered this far in the past

  // Minigun
  GUN: {
    fireRate: 30,          // rounds per second
    muzzleVelocity: 1050,
    lifetime: 1.3,         // seconds a round lives (~1.4 km effective range)
    damage: 2.2,
    damageScale: 0.6,      // multiplies every jet's per-round gun damage (1 = original, lower = weaker guns)
    hitRadius: 7,          // generous hit sphere around a jet
    spread: 0.0035,        // radians of random dispersion
    heatPerShot: 1 / 130,  // ~4.3 s of continuous fire to overheat
    coolRate: 0.32,        // heat drained per second
    overheatLockout: 0.35, // must cool below this after overheating
  },

  // Locking missile: needs a target in front of the nose and inside LOCK_RANGE.
  LOCK_MISSILE: {
    lockRange: 2000,       // meters
    mag: 1,                // missiles ready to fire before a reload (per-jet override)
    salvoGap: 0.35,        // seconds between shots of the same salvo
    lockCone: 30 * Math.PI / 180, // half-angle of the "in front" cone
    lockGrace: 0.3,        // lock survives brief flicker out of the cone
    reload: 2.5,
    damage: 75,
    blastRadius: 16,
    proximityFuse: 9,
    accel: 260,
    maxSpeed: 650,
    burnTime: 4.5,
    lifetime: 12.0,
    coastDrag: 0.06,       // fraction of speed lost per second after the motor burns out
    turnG: 32,             // max lateral acceleration in G
    navConstant: 4,        // proportional navigation gain
    armTime: 0.12,
  },

  // Non-locking (rocket-style) missile: flies straight where you point it.
  DUMB_MISSILE: {
    reload: 2.5,
    mag: 1,
    salvoGap: 0.3,
    damage: 100,
    blastRadius: 18,
    proximityFuse: 8,
    accel: 320,
    maxSpeed: 600,
    burnTime: 2.5,
    lifetime: 5.0,
    armTime: 0.15,
  },

  // Flares: decoy lock-on missiles that are tracking you.
  FLARES: {
    cooldown: 5,           // seconds between flare drops
    count: 6,              // flares per drop
    lifetime: 4,           // seconds a flare burns
    decoyChance: 0.8,      // chance each missile already tracking you goes for a flare
    lateDecoyChance: 0.6,  // chance a missile fired at you while flares burn goes for them
  },

  // Bots fill the server so there's always someone to fight.
  // Number of bots = max(0, BOT_FILL - humanPlayers). Override with env BOT_FILL.
  BOT_FILL: 4,

  STEALTH_PER_POINT: 5,   // meters of enemy lock range removed per stealth point (0–100)

  CRASH_CREDIT_WINDOW: 8, // seconds: crashing after being hit credits the attacker

  // City in the middle of the map. The grid is CITY_BLOCKS x CITY_BLOCKS blocks.
  CITY: {
    enabled: true,
    block: 170,            // block pitch (road center to road center)
    road: 34,              // road width
    blocks: 38,            // blocks per side -> city is 6.46 km across
    ground: 30,            // flattened ground height inside the city
    blend: 1600,           // distance over which terrain blends back to hills
  },
};

export const WEAPONS = ['gun', 'lock', 'dumb'];
export const WEAPON_NAMES = { gun: 'MINIGUN', lock: 'IR MISSILE (LOCK)', dumb: 'ROCKET (NO LOCK)' };
