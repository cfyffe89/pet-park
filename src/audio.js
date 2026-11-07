// Soft generative music and gentle sound effects. No audio files.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Cmaj7, Am7, Fmaj7, G6: slow and calm. Each chord has a low pad voicing and
// four chime notes in the C5-C6 range, where TV speakers are clear.
const CHORDS = [
  { pad: [48, 60, 64, 67], arp: [72, 76, 79, 83] },
  { pad: [45, 57, 60, 64], arp: [69, 72, 76, 79] },
  { pad: [41, 57, 60, 64], arp: [69, 72, 77, 81] },
  { pad: [43, 55, 59, 64], arp: [67, 71, 74, 79] },
];
// C major pentatonic: any note sounds fine over any chord.
const SCALE = [72, 74, 76, 79, 81, 84, 86, 88];
const CHIMES = [84, 86, 88, 91, 93, 96];
const BEAT = 0.75;
const CHORD_LEN = BEAT * 8;
// Music-box arpeggio: chord tone per beat, -1 is a rest.
const ARP = [0, 2, 1, 3, 2, -1, 1, -1];

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
    this.mel = 3;
    this.nextChimes = now + 12;
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
    if (this.ctx.state === 'running') this.schedule(this.ctx.currentTime);
  }

  schedule(now) {
    const ahead = now + 0.5;
    if (this.nextChord < now - 1) this.nextChord = now + 0.1;
    if (this.nextBeat < now - 1) this.nextBeat = now + 0.1;
    while (this.nextChord < ahead) {
      this.chord(this.nextChord, CHORDS[this.chordIdx % CHORDS.length].pad);
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
    if (now > this.nextChimes) {
      this.windChimes(now + 0.05);
      this.nextChimes = now + 20 + Math.random() * 25;
    }
  }

  // Quiet warm bed under the chimes.
  chord(t, notes) {
    const c = this.ctx;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.connect(this.music);
    notes.forEach((m, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = mtof(m);
      o.detune.value = (i % 2 ? 4 : -4);
      const peak = i === 0 ? 0.05 : 0.028;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 2.5);
      g.gain.setValueAtTime(peak, t + CHORD_LEN);
      g.gain.setTargetAtTime(0, t + CHORD_LEN, 1);
      o.connect(g).connect(lp);
      o.start(t);
      o.stop(t + CHORD_LEN + 5);
    });
  }

  beat(t) {
    const step = this.beatIdx % ARP.length;
    const ch = CHORDS[Math.floor(this.beatIdx / ARP.length) % CHORDS.length];
    this.beatIdx++;
    // Music box: soft, steady, so the music is always there.
    const a = ARP[step];
    if (a >= 0 && Math.random() > 0.12) this.chime(t, ch.arp[a], 0.1, this.music);
    // Melody: an occasional brighter chime on top, with an echo.
    if (step % 2 === 0 && Math.random() < (step === 0 ? 0.55 : 0.3)) {
      const steps = [-2, -1, -1, 0, 1, 1, 2];
      this.mel = Math.max(0, Math.min(SCALE.length - 1, this.mel + steps[Math.floor(Math.random() * steps.length)]));
      const off = Math.random() < 0.3 ? BEAT / 2 : 0;
      this.chime(t + off, SCALE[this.mel] + 12, 0.11, this.music, true);
    }
  }

  // A soft bell: sine partials, with the bright upper ones fading first.
  // The second fundamental is detuned a little, so the note shimmers.
  chime(t, midi, vol, dest, echo = false, len = 2.6) {
    const c = this.ctx, f = mtof(midi);
    const out = c.createGain();
    out.gain.value = vol;
    out.connect(dest);
    if (echo) out.connect(this.delay);
    for (const [mul, v, decay, det] of [[1, 0.6, len, 0], [1, 0.4, len, 5], [2, 0.2, len * 0.4, 0], [3, 0.06, len * 0.2, 0], [4.2, 0.03, len * 0.1, 0]]) {
      if (f * mul > 9000) continue;
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f * mul;
      o.detune.value = det;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.012);
      g.gain.setTargetAtTime(0, t + 0.012, decay / 4);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay + 0.2);
    }
  }

  windChimes(t) {
    const c = this.ctx;
    const pan = c.createStereoPanner();
    pan.pan.value = Math.random() * 1.2 - 0.6;
    pan.connect(this.music);
    const n = 4 + Math.floor(Math.random() * 4);
    let t0 = t;
    for (let i = 0; i < n; i++) {
      this.chime(t0, CHIMES[Math.floor(Math.random() * CHIMES.length)], 0.035, pan, false, 3.5);
      t0 += 0.12 + Math.random() * 0.3;
    }
  }

  // Short bell for sound effects.
  pluck(t, midi, vol, dest) {
    this.chime(t, midi, vol, dest, false, 1.6);
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

  // A friendly "ruff": a voiced sound shaped by two mouth resonances that open
  // then close, with a little breath at the start. Pitch varies on each press.
  bark() {
    if (!this.ok) return;
    const c = this.ctx;
    if (!this.voice) {
      // Glottal-like source: harmonics that fall off faster than a sawtooth.
      const n = 40, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) im[k] = 1 / Math.pow(k, 1.4);
      this.voice = c.createPeriodicWave(re, im);
    }
    const count = Math.random() < 0.6 ? 2 : 1;
    const p = 0.92 + Math.random() * 0.16;
    for (let i = 0; i < count; i++) {
      const t = c.currentTime + i * (0.24 + Math.random() * 0.05);
      const pp = p * (i ? 0.96 : 1);
      this.woof(t, 300 * pp, 0.2 * pp);
    }
  }

  woof(t, f0, len) {
    const c = this.ctx;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.2, t + 0.018);
    out.gain.setValueAtTime(0.2, t + len * 0.3);
    out.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    out.connect(lp).connect(this.sfx);

    // Two formants ("wuh" -> "ah" -> "f"), in parallel.
    const formants = [[550, 850, 500, 5, 1], [1150, 1500, 1000, 7, 0.45]].map(([a, b, e, q, v]) => {
      const bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = 'bandpass';
      bp.Q.value = q;
      bp.frequency.setValueAtTime(a, t);
      bp.frequency.linearRampToValueAtTime(b, t + len * 0.3);
      bp.frequency.linearRampToValueAtTime(e, t + len);
      g.gain.value = v * q * 0.5;
      bp.connect(g).connect(out);
      return bp;
    });

    const o = c.createOscillator();
    o.setPeriodicWave(this.voice);
    o.frequency.setValueAtTime(f0 * 0.85, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.15, t + len * 0.25);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + len);
    // A little roughness, as a real throat has.
    const wob = c.createOscillator(), wg = c.createGain();
    wob.frequency.value = 33 + Math.random() * 10;
    wg.gain.value = f0 * 0.03;
    wob.connect(wg).connect(o.frequency);
    const og = c.createGain();
    og.gain.value = 0.5;
    o.connect(og);
    for (const bp of formants) og.connect(bp);
    o.start(t);
    wob.start(t);
    o.stop(t + len + 0.05);
    wob.stop(t + len + 0.05);

    // Breath: a short puff of noise through the same mouth.
    const src = c.createBufferSource(), ng = c.createGain();
    src.buffer = this.noise;
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + len * 0.6);
    src.connect(ng);
    for (const bp of formants) ng.connect(bp);
    src.start(t, Math.random() * 1.5, len);
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
