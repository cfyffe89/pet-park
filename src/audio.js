// Soft generative music and gentle sound effects. No audio files.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Cmaj7, Am7, Fmaj7, G6: slow and calm.
const CHORDS = [
  [48, 55, 64, 71],
  [45, 52, 60, 67],
  [41, 48, 57, 64],
  [43, 50, 59, 64],
];
const SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
const BEAT = 0.8;
const CHORD_LEN = BEAT * 12;

export class Sound {
  constructor() {
    this.ctx = null;
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  start() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.setup();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setup() {
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(c.destination);

    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(3.5);
    const rg = c.createGain();
    rg.gain.value = 0.6;
    this.reverb.connect(rg).connect(this.master);

    this.music = c.createGain();
    this.music.gain.value = 0.55;
    this.music.connect(this.master);
    const ms = c.createGain();
    ms.gain.value = 0.7;
    this.music.connect(ms).connect(this.reverb);

    this.delay = c.createDelay(1.5);
    this.delay.delayTime.value = BEAT * 0.75;
    const fb = c.createGain();
    fb.gain.value = 0.3;
    const dl = c.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2200;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(dl).connect(this.music);

    this.sfx = c.createGain();
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.master);
    const ss = c.createGain();
    ss.gain.value = 0.25;
    this.sfx.connect(ss).connect(this.reverb);

    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const now = c.currentTime;
    this.master.gain.setTargetAtTime(0.9, now, 1.5);
    this.nextChord = now + 0.2;
    this.nextBeat = now + 0.2 + BEAT * 2;
    this.chordIdx = 0;
    this.beatIdx = 0;
    this.mel = 4;
    this.nextBird = now + 5;
    this.wind();
    setInterval(() => this.tick(), 100);
  }

  impulse(sec) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return b;
  }

  tick() {
    const c = this.ctx;
    if (c.state !== 'running') return;
    const now = c.currentTime, ahead = now + 0.5;
    if (this.nextChord < now - 1) this.nextChord = now + 0.1;
    if (this.nextBeat < now - 1) this.nextBeat = now + 0.1;
    while (this.nextChord < ahead) {
      this.chord(this.nextChord, CHORDS[this.chordIdx % CHORDS.length]);
      this.chordIdx++;
      this.nextChord += CHORD_LEN;
    }
    while (this.nextBeat < ahead) {
      this.beat(this.nextBeat);
      this.nextBeat += BEAT;
    }
    if (now > this.nextBird) {
      this.birds(now + 0.05);
      this.nextBird = now + 6 + Math.random() * 12;
    }
  }

  chord(t, notes) {
    const c = this.ctx;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1000;
    lp.connect(this.music);
    notes.forEach((m, i) => {
      for (const [type, det, vol] of [['sine', 0, 0.05], ['triangle', 7, 0.025]]) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type;
        o.frequency.value = mtof(m);
        o.detune.value = det;
        const peak = vol * (i === 0 ? 1.3 : 1);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + 3);
        g.gain.setValueAtTime(peak, t + CHORD_LEN);
        g.gain.setTargetAtTime(0, t + CHORD_LEN, 1.2);
        o.connect(g).connect(lp);
        o.start(t);
        o.stop(t + CHORD_LEN + 6);
      }
    });
  }

  beat(t) {
    const bar = this.beatIdx % 4;
    this.beatIdx++;
    const chance = bar === 0 ? 0.6 : 0.3;
    if (Math.random() > chance) return;
    const steps = [-2, -1, -1, 0, 1, 1, 2];
    this.mel = Math.max(0, Math.min(SCALE.length - 1, this.mel + steps[Math.floor(Math.random() * steps.length)]));
    const off = Math.random() < 0.25 ? BEAT / 2 : 0;
    this.pluck(t + off, SCALE[this.mel] + 12, 0.055, this.music, true);
    if (Math.random() < 0.15) this.pluck(t + off, SCALE[Math.max(0, this.mel - 2)] + 12, 0.03, this.music, true);
  }

  pluck(t, midi, vol, dest, echo = false) {
    const c = this.ctx, f = mtof(midi);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    g.connect(dest);
    if (echo) g.connect(this.delay);
    for (const [mul, v] of [[1, 1], [2, 0.18], [3.01, 0.06]]) {
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'sine';
      o.frequency.value = f * mul;
      og.gain.value = v;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 2);
    }
  }

  birds(t) {
    const c = this.ctx;
    const n = 2 + Math.floor(Math.random() * 3);
    const base = 2600 + Math.random() * 1200;
    const pan = c.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.sfx);
    for (let i = 0; i < n; i++) {
      const t0 = t + i * (0.11 + Math.random() * 0.06);
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(base * (1 + Math.random() * 0.1), t0);
      o.frequency.exponentialRampToValueAtTime(base * 1.35, t0 + 0.06);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.018, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      o.connect(g).connect(pan);
      o.start(t0);
      o.stop(t0 + 0.12);
    }
  }

  wind() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 450;
    bp.Q.value = 0.6;
    const g = c.createGain();
    g.gain.value = 0.02;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.07;
    lg.gain.value = 0.014;
    lfo.connect(lg).connect(g.gain);
    src.connect(bp).connect(g).connect(this.master);
    src.start();
    lfo.start();
  }

  // --- Sound effects ---
  get ok() {
    return this.running;
  }

  noiseBurst(t, dur, type, freq, q, vol, attack = 0.005) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  tone(t, type, f0, f1, dur, vol, dest = this.sfx) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  step(water) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    if (water) this.noiseBurst(t, 0.14, 'bandpass', 800 + Math.random() * 500, 1.2, 0.05);
    else this.noiseBurst(t, 0.05, 'lowpass', 500 + Math.random() * 300, 0.7, 0.03);
  }

  hop() {
    if (!this.ok) return;
    this.tone(this.ctx.currentTime, 'sine', 330, 560, 0.12, 0.035);
  }

  land() {
    if (!this.ok) return;
    this.noiseBurst(this.ctx.currentTime, 0.12, 'lowpass', 260, 0.7, 0.06);
  }

  bark() {
    if (!this.ok) return;
    const c = this.ctx;
    for (const dt of [0, 0.2]) {
      const t = c.currentTime + dt;
      const o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(500, t);
      o.frequency.exponentialRampToValueAtTime(320, t + 0.11);
      bp.type = 'bandpass';
      bp.frequency.value = 1000;
      bp.Q.value = 1.8;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(bp).connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + 0.16);
    }
  }

  meow() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain();
    const vib = c.createOscillator(), vg = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(560, t);
    o.frequency.linearRampToValueAtTime(840, t + 0.18);
    o.frequency.linearRampToValueAtTime(500, t + 0.6);
    vib.frequency.value = 6;
    vg.gain.value = 10;
    vib.connect(vg).connect(o.frequency);
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.linearRampToValueAtTime(2100, t + 0.2);
    bp.frequency.linearRampToValueAtTime(1000, t + 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.06);
    g.gain.setValueAtTime(0.14, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.68);
    o.connect(bp).connect(g).connect(this.sfx);
    o.start(t);
    vib.start(t);
    o.stop(t + 0.7);
    vib.stop(t + 0.7);
  }

  boing(strength, r = 0.4) {
    if (!this.ok) return;
    const f = 260 * (0.45 / r);
    this.tone(this.ctx.currentTime, 'sine', f, f * 0.55, 0.25, 0.06 * strength + 0.01);
  }

  boop(r = 0.4) {
    if (!this.ok) return;
    const f = 420 * (0.45 / r);
    this.tone(this.ctx.currentTime, 'triangle', f, f * 0.7, 0.1, 0.05);
  }

  splash(v = 1) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.35, 'bandpass', 1400, 0.8, 0.08 * v);
    this.noiseBurst(t + 0.03, 0.25, 'bandpass', 600, 1, 0.05 * v);
  }

  rustle(v = 1) {
    if (!this.ok) return;
    this.noiseBurst(this.ctx.currentTime, 0.35, 'highpass', 2500, 0.6, 0.05 * v + 0.01, 0.05);
  }

  swap() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    [72, 76, 79, 84].forEach((m, i) => this.pluck(t + i * 0.07, m, 0.06, this.sfx));
  }
}
