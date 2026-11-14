// Sky, terrain, water, clouds and lighting.
import * as THREE from 'three';
import { terrainHeight } from '/shared/terrain.js';
import { CONFIG } from '/shared/config.js';

export const SUN_DIR = new THREE.Vector3(0.45, 0.55, -0.35).normalize();
const HORIZON = new THREE.Color(0xc4d6e8);
const ZENITH = new THREE.Color(0x3a6fb5);

export function createWorld(scene, renderer) {
  scene.fog = new THREE.Fog(HORIZON.clone(), 2500, 30000);
  scene.background = HORIZON.clone();

  // ---- sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: SUN_DIR }, horizon: { value: HORIZON }, zenith: { value: ZENITH } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 sunDir; uniform vec3 horizon; uniform vec3 zenith; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, -1.0, 1.0);
        vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.55));
        col = mix(col, horizon * 0.85, smoothstep(0.0, -0.2, h));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.25);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(70000, 32, 16), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  // environment reflections from the sky
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat.clone()));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(100, 16), new THREE.MeshBasicMaterial({ color: 0x4a5a40 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -5;
  envScene.add(ground);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.7;

  // ---- lights
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.position.copy(SUN_DIR).multiplyScalar(10000);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x55643f, 0.9));

  // ---- terrain
  const size = CONFIG.TERRAIN_HALF * 2;
  const seg = 320;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const sand = new THREE.Color(0xc9b98a), grass = new THREE.Color(0x5d7a3a), forest = new THREE.Color(0x3b5528),
    rock = new THREE.Color(0x7a7267), snow = new THREE.Color(0xf2f4f7), seabed = new THREE.Color(0x8a8a6a);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
  }
  geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i);
    const slope = 1 - nor.getY(i);
    const n = Math.sin(x * 0.013) * Math.cos(z * 0.011) * 0.5 + Math.sin(x * 0.0031 + z * 0.0027) * 0.5;
    if (h < 0) c.copy(seabed);
    else if (h < 25) c.copy(sand);
    else if (h < 450) c.copy(grass).lerp(forest, Math.min(1, Math.max(0, 0.5 + n * 0.6)));
    else if (h < 1300) c.copy(forest).lerp(rock, Math.min(1, (h - 450) / 850));
    else c.copy(rock).lerp(snow, Math.min(1, (h - 1300) / 300));
    if (slope > 0.25 && h > 25) c.lerp(rock, Math.min(1, (slope - 0.25) * 2.2));
    if (h > 1550 && slope < 0.35) c.lerp(snow, 0.85);
    c.multiplyScalar(0.92 + n * 0.08);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(terrain);

  // ---- water
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(240000, 240000),
    new THREE.MeshStandardMaterial({ color: 0x1f4f6e, roughness: 0.15, metalness: 0.3 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.5;
  scene.add(water);

  // ---- combat-area boundary (faint red walls)
  const wallMat = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false });
  const H = CONFIG.MAP_HALF;
  for (let i = 0; i < 4; i++) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, CONFIG.CEILING), wallMat);
    wall.position.y = CONFIG.CEILING / 2;
    const a = (i * Math.PI) / 2;
    wall.position.x = Math.sin(a) * H;
    wall.position.z = Math.cos(a) * H;
    wall.rotation.y = a;
    scene.add(wall);
  }

  // ---- clouds
  const cloudTex = makeCloudTexture();
  const clouds = new THREE.Group();
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 150; i++) {
    const cx = (rnd() - 0.5) * 30000, cz = (rnd() - 0.5) * 30000, cy = 2200 + rnd() * 1800;
    const puffs = 5 + Math.floor(rnd() * 6);
    const scale = 0.6 + rnd() * 1.2;
    for (let k = 0; k < puffs; k++) {
      const m = new THREE.SpriteMaterial({ map: cloudTex, color: 0xffffff, transparent: true, opacity: 0.75 + rnd() * 0.2, depthWrite: false, fog: true });
      const s = new THREE.Sprite(m);
      const r = (300 + rnd() * 500) * scale;
      s.scale.set(r * 2, r * 1.3, 1);
      s.position.set(cx + (rnd() - 0.5) * 900 * scale, cy + (rnd() - 0.5) * 180, cz + (rnd() - 0.5) * 900 * scale);
      m.rotation = rnd() * Math.PI * 2;
      s.userData.baseOpacity = m.opacity;
      s.userData.radius = r;
      clouds.add(s);
    }
  }
  scene.add(clouds);

  // Fade puffs that get close to the camera: avoids a white-out and huge overdraw
  // (dozens of screen-filling sprites) when flying through the cloud layer.
  function updateClouds(camPos) {
    for (const s of clouds.children) {
      const d = s.position.distanceTo(camPos);
      const r = s.userData.radius;
      const k = Math.min(1, Math.max(0, (d - r * 0.6) / (r * 1.4)));
      s.material.opacity = s.userData.baseOpacity * k;
      s.visible = k > 0.02;
    }
  }

  return { terrain, water, sky, clouds, updateClouds };
}

function makeCloudTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  for (let i = 0; i < 28; i++) {
    const x = S / 2 + (Math.random() - 0.5) * S * 0.45;
    const y = S / 2 + (Math.random() - 0.5) * S * 0.3;
    const r = S * (0.12 + Math.random() * 0.18);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const shade = 235 + Math.floor(Math.random() * 20);
    grd.addColorStop(0, `rgba(${shade},${shade},${shade + 5},0.55)`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
