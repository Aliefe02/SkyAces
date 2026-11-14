// Renders the procedural city from shared/city.js: streets, parks, trees and
// instanced skyscrapers with procedural window facades (one draw call per building style).
import * as THREE from 'three';
import { CONFIG } from '/shared/config.js';
import { buildings, parks, CITY_HALF } from '/shared/city.js';

const STYLES = [
  // window cell width, floor height, mullion (fraction), sill (fraction), glass color
  { name: 'glass', win: [3.0, 3.8, 0.05, 0.07], glass: [0.16, 0.26, 0.34], wall: [0x5d6e78, 0x6b7c86, 0x4f6170] },
  { name: 'office', win: [3.6, 3.8, 0.1, 0.42], glass: [0.14, 0.2, 0.26], wall: [0xb8b1a4, 0xa9a49a, 0xc8c2b6, 0x9a9a96] },
  { name: 'lowrise', win: [3.4, 3.2, 0.3, 0.35], glass: [0.12, 0.15, 0.18], wall: [0xa4664c, 0xc9b79a, 0xd8d2c4, 0x8f8a80, 0xb5806a] },
  { name: 'landmark', win: [2.4, 4.2, 0.04, 0.05], glass: [0.12, 0.22, 0.36], wall: [0x40566c] },
];

function facadeMaterial(style) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.05 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWin = { value: new THREE.Vector4(...style.win) };
    shader.uniforms.uGlass = { value: new THREE.Color(...style.glass) };
    shader.uniforms.uBase = { value: CONFIG.CITY.ground };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCityPos;\nvarying vec3 vCityNormal;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 cityWP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cityWP = instanceMatrix * cityWP;
        #endif
        vCityPos = (modelMatrix * cityWP).xyz;
        vCityNormal = objectNormal;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCityPos;\nvarying vec3 vCityNormal;\nuniform vec4 uWin;\nuniform vec3 uGlass;\nuniform float uBase;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float cityWall = 1.0 - step(0.5, abs(vCityNormal.y));
        float hcoord = abs(vCityNormal.x) > 0.5 ? vCityPos.z : vCityPos.x;
        vec2 cell = vec2(hcoord / uWin.x, (vCityPos.y - uBase) / uWin.y);
        vec2 fc = fract(cell);
        float win = step(uWin.z, fc.x) * step(fc.x, 1.0 - uWin.z) * step(uWin.w, fc.y) * step(fc.y, 0.94);
        // fade the pattern to its average far away so it does not shimmer
        vec2 fw = fwidth(cell);
        float aa = clamp(1.0 - max(fw.x, fw.y) * 1.3, 0.0, 1.0);
        float coverage = (1.0 - 2.0 * uWin.z) * (0.94 - uWin.w);
        win = mix(coverage, win, aa) * cityWall * step(1.0, cell.y);
        float rnd = fract(sin(dot(floor(cell) + floor(vCityPos.xz * 0.013), vec2(12.9898, 78.233))) * 43758.5453);
        diffuseColor.rgb = mix(diffuseColor.rgb, uGlass * (0.7 + 0.6 * rnd), win);
        diffuseColor.rgb *= mix(0.8, 1.0, cityWall);                          // roofs a bit darker
        diffuseColor.rgb *= mix(0.55, 1.0, clamp((vCityPos.y - uBase) / 45.0, 0.0, 1.0)); // street-level shade
        float cityWinF = win;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.1, cityWinF);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.75, cityWinF);');
  };
  mat.customProgramCacheKey = () => 'facade-' + style.name;
  return mat;
}

function streetTexture(renderer) {
  const C = CONFIG.CITY;
  const S = 512;
  const px = S / C.block;            // pixels per meter
  const road = (C.road / 2) * px;    // half a road on each edge of the tile
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#3b3e42'; g.fillRect(0, 0, S, S);                       // asphalt
  g.fillStyle = '#8f8c86'; g.fillRect(road, road, S - 2 * road, S - 2 * road);           // sidewalk
  const sw = 3.5 * px;
  g.fillStyle = '#787b70'; g.fillRect(road + sw, road + sw, S - 2 * (road + sw), S - 2 * (road + sw)); // lot
  // center lines (on the tile edges, so neighbouring tiles complete them)
  g.fillStyle = '#d8c25a';
  for (let k = 0; k < S; k += 24) {
    if (k < road + 10 || k > S - road - 22) continue; // keep intersections clear
    g.fillRect(k, 0, 12, 2); g.fillRect(k, S - 2, 12, 2); g.fillRect(0, k, 2, 12); g.fillRect(S - 2, k, 2, 12);
  }
  // lane lines
  g.fillStyle = 'rgba(235,235,235,0.75)';
  const lane = road * 0.5;
  for (let k = road + 14; k < S - road - 14; k += 20) {
    g.fillRect(k, lane, 9, 1.5); g.fillRect(k, S - lane, 9, 1.5); g.fillRect(lane, k, 1.5, 9); g.fillRect(S - lane, k, 1.5, 9);
  }
  // crosswalks next to each intersection
  g.fillStyle = 'rgba(240,240,240,0.85)';
  for (const edge of [road + 2, S - road - 10]) {
    for (let k = 2; k < road - 2; k += 6) {
      g.fillRect(edge, k, 8, 3); g.fillRect(edge, S - k - 3, 8, 3);
      g.fillRect(k, edge, 3, 8); g.fillRect(S - k - 3, edge, 3, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(C.blocks, C.blocks);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

export function createCity(scene, renderer) {
  const C = CONFIG.CITY;
  if (!C || !C.enabled) return { update() {} };
  const group = new THREE.Group();
  scene.add(group);

  // streets
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2, CITY_HALF * 2),
    new THREE.MeshLambertMaterial({ map: streetTexture(renderer), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = C.ground + 0.25;
  group.add(ground);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let seed = 77;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  // buildings, one instanced mesh per style
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  for (let si = 0; si < STYLES.length; si++) {
    const list = buildings.filter((b) => b.style === si);
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(box, facadeMaterial(STYLES[si]), list.length);
    list.forEach((b, i) => {
      dummy.position.set(b.x, b.base, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const walls = STYLES[si].wall;
      color.setHex(walls[Math.floor(rnd() * walls.length)]).multiplyScalar(0.9 + rnd() * 0.2);
      mesh.setColorAt(i, color);
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  // rooftop clutter: AC units / penthouses, antennas and red aviation lights
  const roofBoxes = [], antennas = [], lights = [];
  for (const b of buildings) {
    const top = b.base + b.h;
    if (b.h > 25) {
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const w = Math.min(b.w * 0.4, 4 + rnd() * 10), d = Math.min(b.d * 0.4, 4 + rnd() * 10);
        roofBoxes.push([b.x + (rnd() - 0.5) * (b.w - w) * 0.8, top, b.z + (rnd() - 0.5) * (b.d - d) * 0.8, w, 2 + rnd() * 6, d]);
      }
    }
    if (b.h > 150) {
      const ah = b.style === 3 ? 120 : 15 + rnd() * 35;
      antennas.push([b.x, top, b.z, ah, b.style === 3 ? 3 : 0.8]);
      lights.push([b.x, top + ah, b.z]);
      for (const [sx, sz] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) lights.push([b.x + sx * b.w * 0.45, top + 0.5, b.z + sz * b.d * 0.45]);
    }
  }
  const roofMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x8c8e90, roughness: 0.9 }), roofBoxes.length);
  roofBoxes.forEach(([x, y, z, w, h, d], i) => { dummy.position.set(x, y, z); dummy.scale.set(w, h, d); dummy.updateMatrix(); roofMesh.setMatrixAt(i, dummy.matrix); });
  group.add(roofMesh);

  const antMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 1, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xb0b4b8, metalness: 0.6, roughness: 0.4 }), antennas.length);
  antennas.forEach(([x, y, z, h, r], i) => { dummy.position.set(x, y, z); dummy.scale.set(r, h, r); dummy.updateMatrix(); antMesh.setMatrixAt(i, dummy.matrix); });
  group.add(antMesh);

  const lightMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false });
  const lightMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1.6, 8, 6), lightMat, lights.length);
  lights.forEach(([x, y, z], i) => { dummy.position.set(x, y, z); dummy.scale.setScalar(1); dummy.updateMatrix(); lightMesh.setMatrixAt(i, dummy.matrix); });
  group.add(lightMesh);

  // parks with trees
  const parkMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x4f7a37, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), parks.length);
  const trees = [];
  parks.forEach((p, i) => {
    dummy.position.set(p.x, C.ground + 0.35, p.z); dummy.scale.set(p.size, 1, p.size); dummy.updateMatrix(); parkMesh.setMatrixAt(i, dummy.matrix);
    const n = 8 + Math.floor(rnd() * 10);
    for (let k = 0; k < n; k++) trees.push([p.x + (rnd() - 0.5) * p.size * 0.85, p.z + (rnd() - 0.5) * p.size * 0.85, 5 + rnd() * 5]);
  });
  group.add(parkMesh);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x35582a, flatShading: true }), trees.length);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 1, 5).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x5b4330 }), trees.length);
  trees.forEach(([x, z, s], i) => {
    dummy.position.set(x, C.ground + s * 0.9, z); dummy.scale.set(s * 0.6, s * 0.7, s * 0.6); dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, C.ground, z); dummy.scale.set(1, s * 0.6, 1); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
  });
  group.add(crowns, trunks);

  return {
    group,
    update(t) {
      // aviation lights blink
      lightMat.color.setHex(Math.floor(t * 1.2) % 2 ? 0x400a06 : 0xff2a1a);
    },
  };
}
