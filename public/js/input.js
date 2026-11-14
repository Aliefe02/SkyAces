// Keyboard (flying), mouse (looking around) and gamepad input.
//
// Flying:  W / S throttle 0–100% (S also air-brakes), A / D rudder, arrows pitch + bank.
// Mouse:   only moves the camera (free look); it never flies the jet.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.canvas = canvas;
    this.throttle = 0.8;                 // throttle lever 0..1 (shown as 0–100%); above 90% = afterburner
    this.look = { yaw: 0, pitch: 0 };    // camera free-look offset (radians)
    this.lastLook = 0;                   // time of the last mouse-look movement
    this.smooth = { pitch: 0, roll: 0, yaw: 0 };
    this.mouseDown = false;
    this.pressed = [];                   // one-shot key presses this frame
    this.wheel = 0;
    this.settings = { invertPitch: false, invertLook: false, lookRecenter: true, sensitivity: 1 };
    this.enabled = false;
    this.mapOpen = false;               // while the big map is open the mouse belongs to the map

    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (!this.enabled) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.push(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.mapOpen) return;
      if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* not allowed */ } }
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 1) { this.look.yaw = 0; this.look.pitch = 0; e.preventDefault(); }
      if (e.button === 2) this.pressed.push('MouseRight');
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.enabled || this.mapOpen || document.pointerLockElement !== canvas) return;
      const k = 0.0022 * this.settings.sensitivity;
      this.look.yaw -= e.movementX * k;
      this.look.pitch += (this.settings.invertLook ? 1 : -1) * e.movementY * k;
      this.look.pitch = Math.max(-1.35, Math.min(1.35, this.look.pitch));
      // keep yaw in -PI..PI so the auto-return takes the short way round
      if (this.look.yaw > Math.PI) this.look.yaw -= Math.PI * 2;
      if (this.look.yaw < -Math.PI) this.look.yaw += Math.PI * 2;
      this.lastLook = performance.now() / 1000;
    });
    addEventListener('wheel', (e) => { if (this.enabled && !this.mapOpen) this.wheel += Math.sign(e.deltaY); }, { passive: true });
  }

  get pointerLocked() { return document.pointerLockElement === this.canvas; }

  consumePresses() {
    const p = this.pressed;
    this.pressed = [];
    const w = this.wheel; this.wheel = 0;
    return { presses: p, wheel: w };
  }

  read(dt) {
    if (!this.enabled) {
      // controls released (menus, death screen): hands off the stick, throttle stays where it was
      const lever = this.throttle;
      return { pitch: 0, roll: 0, yaw: 0, throttle: Math.min(1, lever / 0.9), abLevel: Math.max(0, (lever - 0.9) / 0.1), lever, brake: false, fire: false, lookBack: false };
    }
    const k = this.keys;
    const has = (...codes) => codes.some((c) => k.has(c));
    let pitchT = (has('ArrowDown') ? 1 : 0) - (has('ArrowUp') ? 1 : 0);
    const rollT = (has('ArrowRight') ? 1 : 0) - (has('ArrowLeft') ? 1 : 0);
    const yawT = (has('KeyD') ? 1 : 0) - (has('KeyA') ? 1 : 0);
    if (this.settings.invertPitch) pitchT = -pitchT;

    const approach = (cur, target, rate) => {
      const d = target - cur;
      const step = rate * dt;
      return Math.abs(d) <= step ? target : cur + Math.sign(d) * step;
    };
    this.smooth.pitch = approach(this.smooth.pitch, pitchT, pitchT === 0 ? 6 : 3.5);
    this.smooth.roll = approach(this.smooth.roll, rollT, rollT === 0 ? 8 : 5);
    this.smooth.yaw = approach(this.smooth.yaw, yawT, yawT === 0 ? 6 : 4);

    // W / S move the throttle lever between 0% and 100%; holding S is also the air brake
    let brake = has('KeyS');
    if (has('KeyW')) this.throttle = Math.min(1, this.throttle + 0.45 * dt);
    if (brake) this.throttle = Math.max(0, this.throttle - 0.45 * dt);

    // free look slowly returns behind the jet when the mouse is left alone
    if (this.settings.lookRecenter && performance.now() / 1000 - this.lastLook > 1.5) {
      const decay = Math.exp(-2.5 * dt);
      this.look.yaw *= decay; this.look.pitch *= decay;
    }

    let pitch = this.smooth.pitch;
    let roll = this.smooth.roll;
    let yaw = this.smooth.yaw;
    let fire = this.mouseDown || has('Space');

    // gamepad: left stick fly, right stick X rudder, triggers throttle, B flares
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
      roll += dz(gp.axes[0] || 0);
      pitch += (this.settings.invertPitch ? -1 : 1) * dz(gp.axes[1] || 0);
      yaw += dz(gp.axes[2] || 0);
      const rt = gp.buttons[7]?.value || 0, lt = gp.buttons[6]?.value || 0;
      if (rt > 0.1) this.throttle = Math.min(1, this.throttle + rt * 0.5 * dt);
      if (lt > 0.1) this.throttle = Math.max(0, this.throttle - lt * 0.5 * dt);
      if (lt > 0.6) brake = true;
      if (gp.buttons[0]?.pressed || gp.buttons[5]?.pressed) fire = true;
      const prev = this._padPrev || [];
      if (gp.buttons[3]?.pressed && !prev[3]) this.pressed.push('Gamepad_Next');
      if (gp.buttons[2]?.pressed && !prev[2]) this.pressed.push('KeyC');
      if (gp.buttons[1]?.pressed && !prev[1]) this.pressed.push('KeyF');
      this._padPrev = gp.buttons.map((b) => b.pressed);
      break;
    }

    const c = (v) => Math.max(-1, Math.min(1, v));
    const lever = this.throttle;
    return {
      pitch: c(pitch), roll: c(roll), yaw: c(yaw),
      throttle: Math.min(1, lever / 0.9),          // engine power up to 90% lever
      abLevel: Math.max(0, (lever - 0.9) / 0.1),   // afterburner from 90% to 100%
      lever,
      brake, fire,
      lookBack: has('KeyV'),
    };
  }

  reset() {
    this.look.yaw = this.look.pitch = 0;
    this.smooth.pitch = this.smooth.roll = this.smooth.yaw = 0;
    this.throttle = 0.8;
    this.mouseDown = false;
  }
}
