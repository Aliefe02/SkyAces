// Synthesized sound effects (no audio files needed).

export class AudioFX {
  constructor() { this.ctx = null; this.muted = false; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // engine: roaring noise + low turbine tone
    this.engNoise = this.loopNoise();
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 600;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engNoise.connect(this.engFilter).connect(this.engGain).connect(this.master);
    this.turbine = ctx.createOscillator(); this.turbine.type = 'sawtooth'; this.turbine.frequency.value = 120;
    this.turbFilter = ctx.createBiquadFilter(); this.turbFilter.type = 'bandpass'; this.turbFilter.frequency.value = 900; this.turbFilter.Q.value = 6;
    this.turbGain = ctx.createGain(); this.turbGain.gain.value = 0;
    this.turbine.connect(this.turbFilter).connect(this.turbGain).connect(this.master);
    this.turbine.start();

    // wind
    this.wind = this.loopNoise();
    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    this.wind.connect(this.windFilter).connect(this.windGain).connect(this.master);

    // minigun: noise chopped by a square LFO at the fire rate
    this.gunSrc = this.loopNoise();
    this.gunFilter = ctx.createBiquadFilter(); this.gunFilter.type = 'bandpass'; this.gunFilter.frequency.value = 700; this.gunFilter.Q.value = 0.8;
    this.gunGain = ctx.createGain(); this.gunGain.gain.value = 0;
    this.gunAM = ctx.createGain(); this.gunAM.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 30;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.5;
    lfo.connect(lfoAmt).connect(this.gunAM.gain); lfo.start();
    this.gunSrc.connect(this.gunFilter).connect(this.gunAM).connect(this.gunGain).connect(this.master);

    // lock / warning tones
    this.tone = ctx.createOscillator(); this.tone.type = 'sine'; this.tone.frequency.value = 900;
    this.toneGain = ctx.createGain(); this.toneGain.gain.value = 0;
    this.tone.connect(this.toneGain).connect(this.master); this.tone.start();
    this.warn = ctx.createOscillator(); this.warn.type = 'square'; this.warn.frequency.value = 1500;
    this.warnGain = ctx.createGain(); this.warnGain.gain.value = 0;
    this.warn.connect(this.warnGain).connect(this.master); this.warn.start();
  }

  loopNoise() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = true;
    s.loopStart = Math.random(); s.start(0, Math.random() * 1.5);
    return s;
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.55; }

  update({ throttle = 0, ab = false, speed = 0, gun = false, lock = 'none', warning = false, active = false, t = 0 }) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const set = (param, v, tc = 0.08) => param.setTargetAtTime(v, now, tc);
    const a = active ? 1 : 0;
    set(this.engGain.gain, a * (0.12 + throttle * 0.22 + (ab ? 0.3 : 0)));
    set(this.engFilter.frequency, 300 + throttle * 700 + (ab ? 900 : 0));
    set(this.turbGain.gain, a * (0.015 + throttle * 0.03));
    set(this.turbine.frequency, 90 + throttle * 160);
    set(this.windGain.gain, a * Math.min(0.25, speed / 1600));
    set(this.windFilter.frequency, 300 + speed * 2.5);
    set(this.gunGain.gain, a && gun ? 0.5 : 0, 0.02);

    // lock tone: slow beeps while searching, steady high tone when locked
    let tg = 0, tf = 900;
    if (lock === 'search') { tg = (Math.floor(t * 4) % 2) ? 0.05 : 0; tf = 800; }
    if (lock === 'locked') { tg = 0.07; tf = 1400; }
    set(this.toneGain.gain, a * tg, 0.01);
    set(this.tone.frequency, tf, 0.01);
    set(this.warnGain.gain, a && warning && (Math.floor(t * 9) % 2) ? 0.04 : 0, 0.005);
  }

  burst({ freq = 1000, dur = 0.5, vol = 0.5, type = 'lowpass', sweepTo = null, delay = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
  }

  missileLaunch() { this.burst({ freq: 3500, sweepTo: 300, dur: 1.3, vol: 0.5 }); }
  explosion(dist = 0) {
    const v = 1 / (1 + dist / 350);
    if (v < 0.03) return;
    this.burst({ freq: 900, sweepTo: 60, dur: 1.8, vol: 0.9 * v, delay: Math.min(1.5, dist / 1200) });
  }
  hit() { this.burst({ freq: 2500, type: 'bandpass', dur: 0.06, vol: 0.35 }); }
  hurt() { this.burst({ freq: 400, dur: 0.25, vol: 0.5 }); }
}
