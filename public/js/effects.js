// Particles (smoke, fire, contrails), gun tracers and explosions.
import * as THREE from 'three';

class ParticleSystem {
  constructor(scene, max, additive) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.rise = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: 800 }, fogColor: { value: new THREE.Color() }, fogNear: { value: 2500 }, fogFar: { value: 30000 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float scale;
        varying float vAlpha; varying vec3 vColor; varying float vDepth;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vDepth = -mv.z;
          gl_PointSize = clamp(aSize * scale / max(-mv.z, 0.1), 0.0, 900.0);
          vAlpha = aAlpha; vColor = aColor; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
        varying float vAlpha; varying vec3 vColor; varying float vDepth;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d);
          float a = smoothstep(0.5, 0.05, r) * vAlpha; if (a < 0.003) discard;
          float f = smoothstep(fogNear, fogFar, vDepth);
          gl_FragColor = vec4(mix(vColor, fogColor, f), a * (1.0 - f * 0.7)); }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, a0, r, g, b, drag = 0.5, rise = 0) {
    let i = this.count;
    if (i >= this.max) i = Math.floor(Math.random() * this.max); // recycle when full
    else this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.life[i] = 0; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
    this.drag[i] = drag; this.rise[i] = rise;
    this.size[i] = s0; this.alpha[i] = a0;
  }

  update(dt) {
    let i = 0;
    while (i < this.count) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        // swap-remove
        const j = --this.count;
        if (i !== j) {
          for (let k = 0; k < 3; k++) {
            this.pos[i * 3 + k] = this.pos[j * 3 + k];
            this.vel[i * 3 + k] = this.vel[j * 3 + k];
            this.col[i * 3 + k] = this.col[j * 3 + k];
          }
          this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j];
          this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j]; this.a0[i] = this.a0[j];
          this.drag[i] = this.drag[j]; this.rise[i] = this.rise[j];
          this.size[i] = this.size[j]; this.alpha[i] = this.alpha[j];
        }
        continue;
      }
      const t = this.life[i] / this.maxLife[i];
      const damp = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= damp; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * damp + this.rise[i] * dt; this.vel[i * 3 + 2] *= damp;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      this.alpha[i] = this.a0[i] * (1 - t) * Math.min(1, t * 12 + 0.2);
      i++;
    }
    this.geo.setDrawRange(0, this.count);
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.attributes[k].needsUpdate = true;
  }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.smoke = new ParticleSystem(scene, 9000, false);
    this.fire = new ParticleSystem(scene, 4000, true);
    this.flashes = [];
    // tracers
    this.maxTracers = 700;
    const tg = new THREE.BoxGeometry(0.16, 0.16, 1);
    const tm = new THREE.MeshBasicMaterial({ color: 0xffd77a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.tracerMesh = new THREE.InstancedMesh(tg, tm, this.maxTracers);
    this.tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracerMesh.count = 0;
    this.tracerMesh.frustumCulled = false;
    scene.add(this.tracerMesh);
    this.flashTex = makeGlowTexture();
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._z = new THREE.Vector3(0, 0, 1); this._d = new THREE.Vector3();
  }

  setFog(fog, pixelScale) {
    for (const ps of [this.smoke, this.fire]) {
      ps.material.uniforms.fogColor.value.copy(fog.color);
      ps.material.uniforms.fogNear.value = fog.near;
      ps.material.uniforms.fogFar.value = fog.far;
      ps.material.uniforms.scale.value = pixelScale;
    }
  }

  // bullets: array of {p:Vector3, v:Vector3}
  drawTracers(bullets) {
    let n = 0;
    for (const b of bullets) {
      if (n >= this.maxTracers) break;
      if (!b.tracer) continue;
      const speed = b.v.length();
      this._d.copy(b.v).divideScalar(speed || 1);
      this._q.setFromUnitVectors(this._z, this._d);
      // the streak grows out of the muzzle instead of starting 26 m long (which looked like it came from behind the jet)
      const flown = b.origin ? b.p.distanceTo(b.origin) : 26;
      const len = Math.max(0.5, Math.min(26, speed * 0.022, flown));
      this._p.copy(b.p).addScaledVector(this._d, -len / 2);
      const thick = b.big ? 1.8 : 1; // 25–30 mm rounds get fatter tracers
      this._s.set(thick, thick, len);
      this._m.compose(this._p, this._q, this._s);
      this.tracerMesh.setMatrixAt(n++, this._m);
    }
    this.tracerMesh.count = n;
    this.tracerMesh.instanceMatrix.needsUpdate = true;
  }

  flash(pos, size, life = 0.25, color = 0xffd090) {
    const m = new THREE.SpriteMaterial({ map: this.flashTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const s = new THREE.Sprite(m);
    s.position.copy(pos);
    s.scale.setScalar(size);
    this.scene.add(s);
    this.flashes.push({ s, life, t: 0, size });
  }

  explosion(pos, big = 1) {
    const R = (a) => (Math.random() - 0.5) * a;
    this.flash(pos, 60 * big, 0.35);
    for (let i = 0; i < 70 * big; i++) {
      const sp = 20 + Math.random() * 55 * big;
      const d = new THREE.Vector3(R(2), R(2), R(2)).normalize().multiplyScalar(sp);
      this.fire.emit(pos.x, pos.y, pos.z, d.x, d.y, d.z, 0.5 + Math.random() * 0.7, 6 * big, 18 * big, 1, 1, 0.55 + Math.random() * 0.3, 0.2, 2.5);
    }
    for (let i = 0; i < 45 * big; i++) {
      const sp = 8 + Math.random() * 30 * big;
      const d = new THREE.Vector3(R(2), R(2), R(2)).normalize().multiplyScalar(sp);
      const g = 0.12 + Math.random() * 0.15;
      this.smoke.emit(pos.x, pos.y, pos.z, d.x, d.y, d.z, 3 + Math.random() * 3, 10 * big, 40 * big, 0.75, g, g, g, 1.2, 1.5);
    }
    // burning debris
    if (big > 1) {
      for (let i = 0; i < 14; i++) {
        const d = new THREE.Vector3(R(2), Math.random(), R(2)).normalize().multiplyScalar(40 + Math.random() * 60);
        this.debris = this.debris || [];
        this.debris.push({ p: pos.clone(), v: d, t: 0, life: 2 + Math.random() * 2 });
      }
    }
  }

  sparks(pos) {
    for (let i = 0; i < 6; i++) {
      this.fire.emit(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0.25, 1.2, 0.4, 1, 1, 0.8, 0.4, 3);
    }
  }

  update(dt) {
    this.smoke.update(dt);
    this.fire.update(dt);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const k = f.t / f.life;
      f.s.material.opacity = Math.max(0, 1 - k);
      f.s.scale.setScalar(f.size * (1 + k * 0.6));
      if (k >= 1) { this.scene.remove(f.s); f.s.material.dispose(); this.flashes.splice(i, 1); }
    }
    if (this.debris) {
      for (let i = this.debris.length - 1; i >= 0; i--) {
        const d = this.debris[i];
        d.t += dt;
        d.v.y -= 9.81 * dt;
        d.p.addScaledVector(d.v, dt);
        this.fire.emit(d.p.x, d.p.y, d.p.z, 0, 0, 0, 0.4, 3, 1, 0.9, 1, 0.6, 0.2, 1);
        this.smoke.emit(d.p.x, d.p.y, d.p.z, 0, 0, 0, 2.5, 3, 12, 0.5, 0.15, 0.15, 0.15, 1, 1);
        if (d.t > d.life) this.debris.splice(i, 1);
      }
    }
  }
}

function makeGlowTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,220,150,0.8)');
  grd.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
