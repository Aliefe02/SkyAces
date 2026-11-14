import { CONFIG } from './config.js';

// Jet catalogue. Every jet is data only:
//   flight -> numbers for the shared flight model (shared/physics.js)
//   model  -> parameters for the procedural 3D builder (public/js/jetModel.js)
// To add a new jet, copy one entry, change the numbers, and add it to JETS.
//
// Model coordinates: meters, nose points toward -Z, +Y is up, +X is right wing.
// Fuselage stations: [t (0 = nose, 1 = tail), halfWidth, top, bottom, squareness]
//   squareness: 1 = diamond, 2 = ellipse, >2 = boxy.
// Wing / stabilizer planforms: right-side outline as [x, z] points (mirrored for the left).
// Vertical tail profiles: [z, y] points, y measured from the tail's base.

export const JETS = {
  f16: {
    id: 'f16',
    name: 'F-16 Fighting Falcon',
    short: 'F-16',
    role: 'Agile all-rounder. Very fast roll, fast-firing 20 mm gun, short 2.4 km lock range.',
    flight: {
      hp: 100, maxG: 10.5, pitchRate: 1.17, rollRate: 4.4, yawRate: 0.55, lift: 0.0114,
      aoaMax: 0.44, aoaStall: 0.48, drag: 0.000168, induced: 0.00588, thrust: 13.9, abThrust: 9.2,
      tvc: 0, tvcYaw: false, cobraAoa: 1.15, cobraBrake: 8, ctrlSpeed: 120, response: 7.5,
    },
    // real-world reference the numbers above/below were scaled from
    real: 'Mach 2.05 · T/W 1.10 · wing load 431 kg/m² · roll ~320°/s · APG-68 radar',
    weapons: {
      gun: { name: 'M61A1 Vulcan 20 mm', fireRate: 40, damage: 1.7, muzzleVelocity: 1050, lifetime: 1.3, heatPerShot: 1 / 150 },
      lock: { name: 'AIM-120C AMRAAM', range: 2400, cone: 35, reload: 2.5, maxSpeed: 650, turnG: 30, burnTime: 4.5, lifetime: 11, damage: 75 },
      dumb: { name: 'Rockets', reload: 2.5, damage: 100 },
      flares: { cooldown: 5, count: 6, decoyChance: 0.8 },
      stealth: 20, // 0–100: enemy lock range against this jet drops by stealth × 5 m
    },
    model: {
      sideStick: true,
      insignia: 'us',
      length: 15.0,
      fuselage: [
        [0.000, 0.02, 0.02, 0.02, 2],
        [0.040, 0.24, 0.22, 0.20, 2],
        [0.113, 0.42, 0.40, 0.36, 2],
        [0.200, 0.50, 0.52, 0.50, 2],
        [0.300, 0.58, 0.66, 0.62, 2.2],
        [0.400, 0.78, 0.82, 0.70, 2.4],
        [0.533, 0.90, 0.84, 0.72, 2.6],
        [0.667, 0.88, 0.80, 0.68, 2.5],
        [0.800, 0.74, 0.70, 0.60, 2.3],
        [0.920, 0.58, 0.56, 0.52, 2.1],
        [1.000, 0.50, 0.48, 0.48, 2],
      ],
      radome: '#5f666d',
      canopy: { z: -3.4, y: 0.45, rx: 0.48, ry: 0.6, rz: 1.65, tint: '#3a4652', frames: [0.45] },
      pitot: 1.1,
      antennas: [[0, 0.84, 1.8], [0, -0.72, 3.4, -1]],
      stores: [{ x: 3.3, z: 2.3, type: 'missile' }, { x: 2.15, z: 1.8, type: 'tank' }],
      wings: { y: -0.12, dihedral: 0, thickness: 0.18, points: [[0.5, -3.1], [0.85, -1.6], [1.45, -0.3], [4.72, 2.44], [4.72, 3.45], [0.9, 3.5], [0.5, 3.5]], flaps: { x0: 1.15, x1: 4.2, chord: 0.75 } },
      hstab: { y: -0.05, dihedral: -10, thickness: 0.12, points: [[0.45, 4.5], [2.8, 6.1], [2.8, 6.8], [0.45, 7.2]] },
      vtails: { count: 1, x: 0, cant: 0, y: 0.62, thickness: 0.16, points: [[2.6, 0], [5.4, 3.2], [6.4, 3.2], [6.95, 0]] },
      ventrals: { x: 0.55, y: -0.5, cant: 0.3, points: [[3.6, 0], [4.4, -0.8], [5.0, -0.8], [5.3, 0]] },
      tail: { code: 'SA', num: '91-0412', stripe: '#2f5fa8' },
      intakes: [{ type: 'chin', z0: -2.7, z1: 2.5, y: -0.84, hw: 0.55, hh: 0.44, n: 2.6 }],
      nozzles: { count: 1, x: 0, y: 0, z: 7.0, r: 0.5, len: 1.0, shape: 'round' },
      wingtipMissiles: true,
      gun: [-0.6, 0.35, -3.2],
      eye: [0, 0.75, -4.4],
      paint: { scheme: 'twotone', colors: ['#9ba3ab', '#7d868f', '#b3bac1'] },
    },
  },

  f22: {
    id: 'f22',
    name: 'F-22 Raptor',
    short: 'F-22',
    role: 'Air dominance. Stealth 90, long 4.0 km lock, fastest without afterburner, few flares.',
    flight: {
      hp: 110, maxG: 11, pitchRate: 1.26, rollRate: 3.7, yawRate: 0.6, lift: 0.0121, aoaMax: 1,
      aoaStall: 0.5, drag: 0.000179, induced: 0.00618, thrust: 17.8, abThrust: 8.7, tvc: 0.75,
      tvcYaw: false, cobraAoa: 1.6, cobraBrake: 9.5, ctrlSpeed: 115, response: 7,
    },
    // real-world reference the numbers above/below were scaled from
    real: 'Mach 2.25 · supercruise 1.8 · T/W 1.26 · 2D thrust vectoring · APG-77 radar · stealth',
    weapons: {
      gun: { name: 'M61A2 Vulcan 20 mm', fireRate: 40, damage: 1.7, muzzleVelocity: 1050, lifetime: 1.3, heatPerShot: 1 / 135 },
      lock: { name: 'AIM-120D AMRAAM', range: 4000, cone: 30, mag: 2, reload: 4.6, maxSpeed: 680, turnG: 30, burnTime: 5, lifetime: 16, damage: 75 },
      dumb: { name: 'Rockets', reload: 3.0, damage: 100 },
      flares: { cooldown: 6, count: 4, decoyChance: 0.9 },
      stealth: 90, // 0–100: enemy lock range against this jet drops by stealth × 5 m
    },
    model: {
      sideStick: true,
      insignia: 'us',
      length: 18.9,
      facets: 16, // faceted flat-panel stealth skin
      fuselage: [
        [0.000, 0.02, 0.02, 0.02, 1.2],
        [0.048, 0.32, 0.16, 0.12, 1.15],
        [0.106, 0.72, 0.32, 0.22, 1.2],
        [0.169, 1.10, 0.48, 0.30, 1.25],
        [0.243, 1.55, 0.58, 0.40, 1.3],
        [0.307, 1.95, 0.62, 0.50, 1.4],
        [0.423, 2.05, 0.60, 0.52, 1.6],
        [0.582, 1.95, 0.56, 0.50, 1.7],
        [0.741, 1.65, 0.50, 0.45, 1.7],
        [0.857, 1.30, 0.44, 0.40, 1.8],
        [0.921, 1.10, 0.38, 0.36, 2.0],
      ],
      radome: '#7d848b',
      canopy: { z: -5.75, y: 0.42, rx: 0.46, ry: 0.6, rz: 2.2, tint: '#a08a3c' },
      antennas: [[0, 0.66, 2.4], [0, -0.55, 3.0, -1]],
      wings: { y: -0.1, dihedral: -3, thickness: 0.16, points: [[1.8, -1.6], [6.78, 3.3], [6.78, 4.7], [1.8, 6.2]], flaps: { x0: 2.3, x1: 6.3, chord: 0.85 } },
      hstab: { y: -0.08, dihedral: 0, thickness: 0.14, points: [[1.3, 6.4], [4.42, 8.4], [4.42, 9.5], [1.3, 9.7]] },
      vtails: { count: 2, x: 1.75, cant: 28, y: 0.5, thickness: 0.16, points: [[1.6, 0], [3.2, 3.3], [5.3, 3.3], [6.4, 0]] },
      intakes: [{ type: 'side', z0: -4.3, z1: -1.2, x: 1.5, y: -0.1, hw: 0.46, hh: 0.55, rake: 1.2 }],
      nozzles: { count: 2, x: 0.6, y: 0, z: 7.6, r: 0.55, len: 1.5, shape: 'square' },
      wingtipMissiles: false,
      gun: [1.4, 0.4, -2.0],
      eye: [0, 0.8, -5.8],
      paint: { scheme: 'stealth', colors: ['#8b9198', '#757c84', '#a2a8af'] },
      tail: { code: 'SA', num: '04-4069', stripe: '#8a1f1f', textColor: 'rgba(60,66,72,0.8)' },
    },
  },

  su57: {
    id: 'su57',
    name: 'Su-57 Felon',
    short: 'Su-57',
    role: 'Supermaneuverable. Longest lock (4.6 km) with a wide cone, stealth 65, hard-hitting 30 mm gun.',
    flight: {
      hp: 120, maxG: 11, pitchRate: 1.35, rollRate: 3.7, yawRate: 0.8, lift: 0.0125,
      aoaMax: 1.05, aoaStall: 0.52, drag: 0.000183, induced: 0.00627, thrust: 16.3, abThrust: 8.8,
      tvc: 0.9, tvcYaw: true, cobraAoa: 1.8, cobraBrake: 10, ctrlSpeed: 110, response: 7,
    },
    // real-world reference the numbers above/below were scaled from
    real: 'Mach 2.0 · supercruise 1.3 · T/W 1.19 · 3D thrust vectoring · N036 radar · reduced RCS',
    weapons: {
      gun: { name: 'GSh-30-1 30 mm', fireRate: 18, damage: 4.4, muzzleVelocity: 860, lifetime: 1.4, heatPerShot: 1 / 75 },
      lock: { name: 'R-77M', range: 4600, cone: 40, mag: 2, reload: 4.4, maxSpeed: 680, turnG: 33, burnTime: 5, lifetime: 18, damage: 80 },
      dumb: { name: 'Rockets', mag: 2, reload: 4.6, damage: 100 },
      flares: { cooldown: 5, count: 6, decoyChance: 0.85 },
      stealth: 65, // 0–100: enemy lock range against this jet drops by stealth × 5 m
    },
    model: {
      insignia: 'ru',
      iff: true,
      length: 20.1,
      facets: 24,
      fuselage: [
        [0.000, 0.02, 0.02, 0.02, 1.4],
        [0.040, 0.28, 0.20, 0.16, 1.4],
        [0.100, 0.50, 0.36, 0.26, 1.5],
        [0.159, 0.60, 0.50, 0.34, 1.6],
        [0.229, 0.72, 0.50, 0.34, 1.6],
        [0.289, 1.00, 0.42, 0.30, 1.4],
        [0.373, 1.85, 0.36, 0.26, 1.35],
        [0.498, 2.35, 0.34, 0.24, 1.35],
        [0.647, 2.25, 0.32, 0.24, 1.4],
        [0.771, 1.65, 0.30, 0.24, 1.5],
        [0.871, 0.80, 0.28, 0.24, 1.8],
        [0.945, 0.42, 0.26, 0.24, 2],
        [1.000, 0.16, 0.16, 0.16, 2],
      ],
      radome: '#4a5966',
      canopy: { z: -5.65, y: 0.44, rx: 0.48, ry: 0.58, rz: 1.75, tint: '#4d6070', frames: [-0.5, 0.3] },
      pitot: 0.7,
      irst: [0.2, 0.4, -7.9],
      antennas: [[0, 0.52, 3.2], [0, -0.3, 1.0, -1]],
      wings: { y: -0.08, dihedral: -2, thickness: 0.17, points: [[0.8, -4.45], [2.0, -1.45], [6.97, 4.25], [6.97, 5.65], [2.6, 6.35], [0.8, 6.35]], flaps: { x0: 2.8, x1: 6.6, chord: 0.8 } },
      hstab: { y: -0.15, dihedral: 0, thickness: 0.14, points: [[2.0, 6.2], [4.9, 8.5], [4.9, 9.5], [2.0, 9.95]] },
      vtails: { count: 2, x: 1.9, cant: 26, y: 0.25, thickness: 0.15, points: [[3.3, 0], [5.3, 2.5], [6.8, 2.5], [7.0, 0]] },
      intakes: [{ type: 'nacelle', z0: -3.65, z1: 7.45, x: 1.3, y: -0.58, hw: 0.56, hh: 0.46 }],
      nozzles: { count: 2, x: 1.3, y: -0.58, z: 7.45, r: 0.52, len: 1.2, shape: 'round', serrated: true },
      wingtipMissiles: false,
      gun: [0.9, 0.3, -3.8],
      eye: [0, 0.85, -6.7],
      paint: { scheme: 'splinter', colors: ['#8fa2b3', '#62788d', '#b6c3ce', '#43566a'] },
      tail: { code: '01', textColor: '#1d3f8a' },
    },
  },

  f15: {
    id: 'f15',
    name: 'F-15C Eagle',
    short: 'F-15',
    role: 'Fastest jet and very tough, 3.7 km lock, lots of flares, but turns the widest and is easy to lock.',
    flight: {
      hp: 130, maxG: 9.5, pitchRate: 1, rollRate: 3.4, yawRate: 0.5, lift: 0.00798, aoaMax: 0.52,
      aoaStall: 0.54, drag: 0.000142, induced: 0.00335, thrust: 13.9, abThrust: 8.6, tvc: 0,
      tvcYaw: false, cobraAoa: 1.1, cobraBrake: 7.5, ctrlSpeed: 125, response: 6,
    },
    // real-world reference the numbers above/below were scaled from
    real: 'Mach 2.5 · T/W 1.07 · wing load 358 kg/m² · APG-63(V)3 radar · 940-round gun',
    weapons: {
      gun: { name: 'M61A1 Vulcan 20 mm', fireRate: 40, damage: 1.7, muzzleVelocity: 1050, lifetime: 1.3, heatPerShot: 1 / 190 },
      lock: { name: 'AIM-120C AMRAAM', range: 3700, cone: 30, mag: 2, reload: 3.8, maxSpeed: 650, turnG: 30, burnTime: 4.5, lifetime: 15, damage: 75 },
      dumb: { name: 'Rockets', mag: 2, reload: 3.8, damage: 100 },
      flares: { cooldown: 4, count: 8, decoyChance: 0.8 },
      stealth: 5, // 0–100: enemy lock range against this jet drops by stealth × 5 m
    },
    model: {
      insignia: 'us',
      length: 19.4,
      fuselage: [
        [0.00, 0.02, 0.02, 0.02, 2.0],
        [0.04, 0.30, 0.28, 0.24, 2.0],
        [0.10, 0.50, 0.48, 0.42, 2.0],
        [0.18, 0.62, 0.60, 0.50, 2.1],
        [0.28, 0.95, 0.62, 0.60, 2.4],
        [0.40, 1.55, 0.62, 0.64, 3.0],
        [0.60, 1.60, 0.56, 0.60, 3.0],
        [0.80, 1.42, 0.50, 0.52, 3.0],
        [0.92, 1.25, 0.45, 0.46, 3.0],
        [1.00, 1.15, 0.42, 0.42, 3.0],
      ],
      radome: '#6f7680',
      canopy: { z: -5.8, y: 0.55, rx: 0.55, ry: 0.66, rz: 2.2, tint: '#3c4a57', frames: [-0.55] },
      antennas: [[0, 0.62, 2.6], [0, -0.64, 3.2, -1]],
      stores: [{ x: 3.6, z: 1.9, type: 'missile' }, { x: 2.6, z: 1.5, type: 'missile' }],
      wings: { y: 0.28, dihedral: -1, thickness: 0.2, points: [[1.5, -1.6], [6.5, 2.6], [6.5, 3.9], [1.5, 4.7]], flaps: { x0: 1.8, x1: 4.6, chord: 0.9 } },
      hstab: { y: 0.0, dihedral: 0, thickness: 0.14, points: [[1.3, 5.6], [4.3, 7.6], [4.3, 8.7], [1.3, 9.4]] },
      vtails: { count: 2, x: 1.25, cant: 0, y: 0.45, thickness: 0.16, points: [[4.4, 0], [7.0, 3.3], [8.3, 3.3], [8.9, 0]] },
      intakes: [{ type: 'side', z0: -4.3, z1: 1.5, x: 1.45, y: -0.1, hw: 0.55, hh: 0.75, rake: 0.7 }],
      nozzles: { count: 2, x: 0.62, y: 0, z: 9.0, r: 0.55, len: 1.0, shape: 'round' },
      wingtipMissiles: false,
      gun: [1.6, 0.5, -1.5],
      eye: [0, 0.98, -5.9],
      paint: { scheme: 'twotone', colors: ['#8c96a2', '#6e7985', '#a2abb5'] },
      tail: { code: 'SA', num: '86-0156', stripe: '#c9a227' },
    },
  },

  f35: {
    id: 'f35',
    name: 'F-35A Lightning II',
    short: 'F-35',
    role: 'Stealthiest (100: enemy locks lose 500 m), 3.5 km lock, wide cone, but slowest and weak at turning.',
    flight: {
      hp: 105, maxG: 9.3, pitchRate: 1, rollRate: 3, yawRate: 0.55, lift: 0.0102, aoaMax: 0.87,
      aoaStall: 0.5, drag: 0.000202, induced: 0.00608, thrust: 13.5, abThrust: 9, tvc: 0,
      tvcYaw: false, cobraAoa: 1.4, cobraBrake: 8.5, ctrlSpeed: 115, response: 6.5,
    },
    // real-world reference the numbers above/below were scaled from
    real: 'Mach 1.6 · T/W 1.07 · wing load 526 kg/m² · 50° AoA · APG-81 radar · stealth',
    weapons: {
      gun: { name: 'GAU-22/A 25 mm', fireRate: 28, damage: 2.6, muzzleVelocity: 1040, lifetime: 1.4, heatPerShot: 1 / 90 },
      lock: { name: 'AIM-120D AMRAAM', range: 3500, cone: 40, reload: 3.0, maxSpeed: 680, turnG: 30, burnTime: 5, lifetime: 14.5, damage: 75 },
      dumb: { name: 'Rockets', reload: 3.0, damage: 100 },
      flares: { cooldown: 6, count: 4, decoyChance: 0.9 },
      stealth: 100, // 0–100: enemy lock range against this jet drops by stealth × 5 m
    },
    model: {
      sideStick: true,
      cockpit: 'wide', // one big panoramic display
      insignia: 'us',
      length: 15.67,
      facets: 20,
      fuselage: [
        [0.000, 0.02, 0.02, 0.02, 1.3],
        [0.038, 0.25, 0.18, 0.13, 1.3],
        [0.115, 0.56, 0.40, 0.28, 1.35],
        [0.191, 0.80, 0.58, 0.42, 1.4],
        [0.274, 1.05, 0.68, 0.54, 1.5],
        [0.351, 1.45, 0.74, 0.62, 1.7],
        [0.479, 1.62, 0.76, 0.66, 1.9],
        [0.638, 1.50, 0.70, 0.60, 1.9],
        [0.798, 1.08, 0.60, 0.52, 1.9],
        [0.913, 0.78, 0.52, 0.48, 1.9],
        [1.000, 0.64, 0.48, 0.48, 2.0],
      ],
      radome: '#4b5056',
      canopy: { z: -4.6, y: 0.58, rx: 0.46, ry: 0.54, rz: 1.75, tint: '#7a6a3a', frames: [0.45] },
      antennas: [[0, 0.78, 1.5], [0, -0.68, 2.5, -1]],
      wings: { y: 0.05, dihedral: -2, thickness: 0.17, points: [[1.3, -3.6], [1.9, -0.6], [5.35, 1.9], [5.35, 3.4], [1.9, 4.3], [1.3, 4.3]], flaps: { x0: 2.0, x1: 4.9, chord: 0.75 } },
      hstab: { y: 0.05, dihedral: 0, thickness: 0.14, points: [[1.25, 4.6], [3.4, 6.6], [3.4, 7.6], [1.25, 8.1]] },
      vtails: { count: 2, x: 1.2, cant: 25, y: 0.55, thickness: 0.14, points: [[2.8, 0], [4.6, 2.4], [6.0, 2.4], [6.2, 0]] },
      intakes: [{ type: 'side', z0: -3.2, z1: -0.5, x: 1.2, y: 0.05, hw: 0.45, hh: 0.5, rake: 0.9 }],
      nozzles: { count: 1, x: 0, y: 0, z: 7.0, r: 0.62, len: 1.1, shape: 'round', serrated: true },
      wingtipMissiles: false,
      gun: [-1.0, 0.5, -1.5],
      eye: [0, 1.0, -5.0],
      paint: { scheme: 'stealth', colors: ['#5d6268', '#4b5056', '#73787e'] },
      tail: { code: 'SA', num: '19-5410', textColor: 'rgba(28,30,34,0.7)' },
    },
  },

  su35: {
    id: 'su35',
    name: 'Su-35 Flanker-E',
    short: 'Su-35',
    role: 'Heavy Flanker. Toughest jet, 4.3 km lock, best cobra, many flares, but a big radar target.',
    flight: {
      hp: 135, maxG: 10.8, pitchRate: 1.28, rollRate: 3.7, yawRate: 0.8, lift: 0.0123,
      aoaMax: 1, aoaStall: 0.52, drag: 0.000156, induced: 0.00615, thrust: 13.9, abThrust: 9.2,
      tvc: 0.9, tvcYaw: true, cobraAoa: 1.9, cobraBrake: 10.5, ctrlSpeed: 120, response: 6.5,
    },
    // real-world reference the numbers above/below were scaled from
    real: 'Mach 2.25 · T/W 1.10 · 3D thrust vectoring · Irbis-E radar · 12 weapon stations',
    weapons: {
      gun: { name: 'GSh-30-1 30 mm', fireRate: 18, damage: 4.4, muzzleVelocity: 860, lifetime: 1.4, heatPerShot: 1 / 75 },
      lock: { name: 'R-77-1', range: 4300, cone: 40, mag: 2, reload: 4.0, maxSpeed: 630, turnG: 33, burnTime: 4, lifetime: 17, damage: 80 },
      dumb: { name: 'Rockets', mag: 2, reload: 3.8, damage: 100 },
      flares: { cooldown: 4, count: 8, decoyChance: 0.8 },
      stealth: 10, // 0–100: enemy lock range against this jet drops by stealth × 5 m
    },
    model: {
      insignia: 'ru',
      iff: true,
      length: 21.9,
      fuselage: [
        [0.00, 0.02, 0.02, 0.02, 2.0],
        [0.04, 0.30, 0.30, 0.26, 2.0],
        [0.10, 0.48, 0.50, 0.42, 2.0],
        [0.18, 0.58, 0.66, 0.48, 2.0],
        [0.26, 0.90, 0.62, 0.45, 2.2],
        [0.38, 1.90, 0.55, 0.38, 3.0],
        [0.55, 2.20, 0.50, 0.35, 3.2],
        [0.72, 1.60, 0.45, 0.32, 3.0],
        [0.86, 0.70, 0.40, 0.32, 2.4],
        [1.00, 0.30, 0.28, 0.28, 2.0],
      ],
      radome: '#5c6a76',
      canopy: { z: -7.2, y: 0.62, rx: 0.5, ry: 0.6, rz: 1.9, tint: '#4c5c68', frames: [-0.5, 0.35] },
      pitot: 1.0,
      irst: [0.2, 0.38, -9.35],
      antennas: [[0, 0.52, 3.5], [0, -0.35, 1.5, -1]],
      stores: [{ x: 4.2, z: 2.3, type: 'missile' }, { x: 5.6, z: 3.1, type: 'missile' }],
      wings: { y: -0.05, dihedral: -2, thickness: 0.22, points: [[0.6, -6.0], [1.9, -2.6], [7.6, 3.4], [7.6, 4.6], [2.2, 5.6], [0.6, 5.6]], flaps: { x0: 2.4, x1: 6.9, chord: 0.9 } },
      hstab: { y: -0.3, dihedral: 0, thickness: 0.14, points: [[2.0, 6.6], [5.2, 8.6], [5.2, 9.8], [2.0, 10.3]] },
      vtails: { count: 2, x: 2.0, cant: 0, y: 0.2, thickness: 0.16, points: [[4.6, 0], [7.2, 3.4], [8.4, 3.4], [8.9, 0]] },
      ventrals: { x: 1.9, y: -0.4, cant: 0.15, points: [[6.0, 0], [7.0, -0.9], [7.7, -0.9], [8.0, 0]] },
      intakes: [{ type: 'nacelle', z0: -3.9, z1: 8.0, x: 1.3, y: -0.75, hw: 0.65, hh: 0.6 }],
      nozzles: { count: 2, x: 1.3, y: -0.75, z: 8.0, r: 0.6, len: 1.2, shape: 'round' },
      wingtipMissiles: true,
      gun: [1.0, 0.35, -5.0],
      eye: [0, 1.05, -7.4],
      paint: { scheme: 'splinter', colors: ['#a6b8c6', '#7290a8', '#d0d9df', '#5c7690'] },
      tail: { code: '05', textColor: '#b02a2a' },
    },
  },

  mig29: {
    id: 'mig29',
    name: 'MiG-29 Fulcrum',
    short: 'MiG-29',
    role: 'Close-in brawler. Very agile R-73 (45° cone, 42 G) but only 1.8 km range, zero stealth.',
    flight: {
      hp: 95, maxG: 11, pitchRate: 1.26, rollRate: 3.8, yawRate: 0.6, lift: 0.0116,
      aoaMax: 0.48, aoaStall: 0.52, drag: 0.000159, induced: 0.00648, thrust: 13.7, abThrust: 9.2,
      tvc: 0, tvcYaw: false, cobraAoa: 1.6, cobraBrake: 9, ctrlSpeed: 110, response: 7.5,
    },
    // real-world reference the numbers above/below were scaled from
    real: 'Mach 2.25 · T/W 1.09 · wing load 403 kg/m² · N019 radar · helmet-sight R-73',
    weapons: {
      gun: { name: 'GSh-30-1 30 mm', fireRate: 18, damage: 4.4, muzzleVelocity: 860, lifetime: 1.4, heatPerShot: 1 / 75 },
      lock: { name: 'R-73 (helmet-cued)', range: 1800, cone: 45, reload: 2.6, maxSpeed: 560, turnG: 42, burnTime: 3, lifetime: 9, damage: 70 },
      dumb: { name: 'Rockets', reload: 2.5, damage: 100 },
      flares: { cooldown: 5, count: 6, decoyChance: 0.75 },
      stealth: 0, // 0–100: enemy lock range against this jet drops by stealth × 5 m
    },
    model: {
      insignia: 'ru',
      iff: true,
      length: 17.3,
      fuselage: [
        [0.00, 0.02, 0.02, 0.02, 2.0],
        [0.04, 0.26, 0.26, 0.22, 2.0],
        [0.10, 0.42, 0.42, 0.36, 2.0],
        [0.18, 0.50, 0.56, 0.42, 2.0],
        [0.26, 0.80, 0.52, 0.40, 2.3],
        [0.38, 1.50, 0.48, 0.35, 3.0],
        [0.55, 1.70, 0.45, 0.33, 3.2],
        [0.72, 1.20, 0.42, 0.30, 3.0],
        [0.86, 0.55, 0.36, 0.30, 2.4],
        [1.00, 0.25, 0.25, 0.25, 2.0],
      ],
      radome: '#6c7470',
      canopy: { z: -5.5, y: 0.55, rx: 0.48, ry: 0.56, rz: 1.7, tint: '#465560', frames: [-0.5, 0.3] },
      pitot: 1.0,
      irst: [0.2, 0.32, -6.9],
      antennas: [[0, 0.46, 2.6], [0, -0.3, 1.0, -1]],
      stores: [{ x: 3.4, z: 1.6, type: 'missile' }, { x: 4.4, z: 2.1, type: 'missile' }],
      wings: { y: -0.05, dihedral: -2, thickness: 0.2, points: [[0.5, -5.2], [1.6, -1.8], [5.7, 2.3], [5.7, 3.4], [1.8, 4.3], [0.5, 4.3]], flaps: { x0: 2.0, x1: 5.0, chord: 0.7 } },
      hstab: { y: -0.25, dihedral: 0, thickness: 0.13, points: [[1.8, 5.0], [4.2, 6.6], [4.2, 7.5], [1.8, 8.0]] },
      vtails: { count: 2, x: 1.75, cant: 6, y: 0.25, thickness: 0.15, points: [[3.6, 0], [5.6, 2.8], [6.6, 2.8], [7.1, 0]] },
      intakes: [{ type: 'nacelle', z0: -2.9, z1: 6.6, x: 1.1, y: -0.6, hw: 0.55, hh: 0.52, rake: 0.9 }],
      nozzles: { count: 2, x: 1.1, y: -0.6, z: 6.6, r: 0.5, len: 1.0, shape: 'round' },
      wingtipMissiles: false,
      gun: [-0.9, 0.3, -3.2],
      eye: [0, 0.95, -5.7],
      paint: { scheme: 'splinter', colors: ['#a3aaa6', '#7b8580', '#c0c6c2', '#636d68'] },
      tail: { code: '27', textColor: '#1d3f8a' },
    },
  },

  typhoon: {
    id: 'typhoon',
    name: 'Eurofighter Typhoon',
    short: 'Typhoon',
    role: 'Best turning jet. 2.9 km Meteor is the fastest missile and burns longest, stealth 40.',
    flight: {
      hp: 100, maxG: 11.3, pitchRate: 1.35, rollRate: 4, yawRate: 0.55, lift: 0.012,
      aoaMax: 0.52, aoaStall: 0.56, drag: 0.000181, induced: 0.00535, thrust: 16, abThrust: 8.2,
      tvc: 0, tvcYaw: false, cobraAoa: 1.2, cobraBrake: 8.5, ctrlSpeed: 115, response: 7.5,
    },
    // real-world reference the numbers above/below were scaled from
    real: 'Mach 2.0 · supercruise 1.5 · T/W 1.15 · wing load 311 kg/m² · CAPTOR radar · DASS',
    weapons: {
      gun: { name: 'Mauser BK-27 27 mm', fireRate: 20, damage: 3.6, muzzleVelocity: 1025, lifetime: 1.3, heatPerShot: 1 / 85 },
      lock: { name: 'Meteor (ramjet)', range: 2900, cone: 35, reload: 2.5, maxSpeed: 720, turnG: 28, burnTime: 9, lifetime: 15, damage: 75 },
      dumb: { name: 'Rockets', reload: 2.5, damage: 100 },
      flares: { cooldown: 4.5, count: 6, decoyChance: 0.85 },
      stealth: 40, // 0–100: enemy lock range against this jet drops by stealth × 5 m
    },
    model: {
      insignia: 'eu',
      length: 15.96,
      fuselage: [
        [0.00, 0.02, 0.02, 0.02, 2.0],
        [0.05, 0.30, 0.30, 0.26, 2.0],
        [0.12, 0.46, 0.48, 0.40, 2.0],
        [0.22, 0.56, 0.62, 0.48, 2.0],
        [0.32, 0.70, 0.62, 0.55, 2.2],
        [0.45, 0.82, 0.60, 0.62, 2.4],
        [0.62, 0.85, 0.58, 0.60, 2.4],
        [0.80, 0.82, 0.55, 0.50, 2.4],
        [0.92, 0.78, 0.50, 0.45, 2.6],
        [1.00, 0.75, 0.45, 0.42, 2.8],
      ],
      radome: '#7d858c',
      canopy: { z: -4.8, y: 0.55, rx: 0.48, ry: 0.56, rz: 1.8, tint: '#3d4955', frames: [-0.5] },
      antennas: [[0, 0.6, 1.0], [0, -0.62, 3.0, -1]],
      stores: [{ x: 3.0, z: 3.2, type: 'missile' }, { x: 4.0, z: 4.2, type: 'missile' }],
      wings: { y: -0.25, dihedral: -2, thickness: 0.2, points: [[0.7, -1.2], [5.47, 5.1], [5.47, 5.7], [0.7, 6.6]], flaps: { x0: 1.2, x1: 5.0, chord: 0.8 } },
      hstab: null,
      canards: { y: 0.12, dihedral: 0, thickness: 0.1, points: [[0.5, -4.4], [2.0, -3.2], [2.0, -2.6], [0.5, -2.6]] },
      vtails: { count: 1, x: 0, cant: 0, y: 0.45, thickness: 0.16, points: [[3.0, 0], [6.0, 3.6], [7.0, 3.6], [7.4, 0]] },
      intakes: [{ type: 'chin', z0: -3.4, z1: 2.0, y: -0.85, hw: 0.75, hh: 0.4, n: 4 }],
      nozzles: { count: 2, x: 0.45, y: 0, z: 7.4, r: 0.45, len: 1.0, shape: 'round' },
      wingtipMissiles: false,
      gun: [0.6, 0.1, -2.5],
      eye: [0, 0.95, -4.9],
      paint: { scheme: 'solid', colors: ['#a1a9b0', '#8f979e', '#b6bdc3'] },
      tail: { code: 'SA', num: '30+71', stripe: '#3b7d3b' },
    },
  },
};

export const JET_IDS = Object.keys(JETS);

// Lock range of `shooterJet` against `targetJet`: its radar/missile range minus the target's
// stealth (stealth points × CONFIG.STEALTH_PER_POINT meters). F-35 (100) => -500 m.
export function lockRangeAgainst(shooterJet, targetJet) {
  return Math.max(0, weaponsFor(shooterJet).lock.lockRange - weaponsFor(targetJet).stealth * CONFIG.STEALTH_PER_POINT);
}

// Where missiles leave the jet (model coordinates): under the wing, on the missile pylon if the
// jet carries visible missiles, otherwise around mid-span. side: -1 left wing, +1 right wing.
export function pylonPoint(jetId, side) {
  const M = (JETS[jetId] || JETS.f16).model;
  const W = M.wings;
  const pts = W.points;
  const tip = Math.max(...pts.map((p) => p[0]));
  const store = (M.stores || []).find((st) => st.type === 'missile');
  const x = store ? store.x : tip * 0.5;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [s0, c0] = pts[i], [s1, c1] = pts[(i + 1) % pts.length];
    if (s0 === s1 || x < Math.min(s0, s1) || x > Math.max(s0, s1)) continue;
    const c = c0 + (c1 - c0) * ((x - s0) / (s1 - s0));
    lo = Math.min(lo, c); hi = Math.max(hi, c);
  }
  const z = store ? store.z : (lo + hi) / 2;
  const y = W.y - 0.55 + Math.sin(((W.dihedral || 0) * Math.PI) / 180) * x;
  return [side * x, y, z];
}

// ---- missile magazines: fire up to `mag` shots (salvoGap apart); the first shot starts the
// reload timer and when it runs out the magazine is full again. Shared by client and server.
export function makeMagazines(jetId) {
  const w = weaponsFor(jetId);
  return { lock: { ammo: w.lock.mag, reloadEnd: 0, lastShot: -99 }, dumb: { ammo: w.dumb.mag, reloadEnd: 0, lastShot: -99 } };
}
export function magTick(mag, W, t) {
  if (mag.reloadEnd && t >= mag.reloadEnd) { mag.ammo = W.mag; mag.reloadEnd = 0; }
}
// tol: latency allowance (server side) so a client that is a hair early isn't rejected
export function magCanFire(mag, W, t, tol = 0) {
  magTick(mag, W, t + tol);
  return mag.ammo > 0 && t - mag.lastShot >= W.salvoGap - tol;
}
export function magFire(mag, W, t) {
  mag.ammo--;
  mag.lastShot = t;
  if (!mag.reloadEnd) mag.reloadEnd = t + W.reload;
}

// Per-jet weapon stats merged over the defaults in CONFIG (so a jet only lists what differs).
const weaponCache = new Map();
export function weaponsFor(jetId) {
  if (weaponCache.has(jetId)) return weaponCache.get(jetId);
  const w = (JETS[jetId] || JETS.f16).weapons || {};
  const lock = { ...CONFIG.LOCK_MISSILE, ...(w.lock || {}) };
  if (w.lock?.range) lock.lockRange = w.lock.range;
  if (w.lock?.cone) lock.lockCone = (w.lock.cone * Math.PI) / 180;
  const out = {
    gun: { ...CONFIG.GUN, ...(w.gun || {}) },
    // (per-round damage is scaled below by CONFIG.GUN.damageScale)
    lock,
    dumb: { ...CONFIG.DUMB_MISSILE, ...(w.dumb || {}) },
    flares: { ...CONFIG.FLARES, ...(w.flares || {}) },
    stealth: w.stealth ?? 0,
  };
  out.gun.baseDamage = out.gun.damage;
  out.gun.damage = out.gun.damage * (CONFIG.GUN.damageScale ?? 1);
  weaponCache.set(jetId, out);
  return out;
}
