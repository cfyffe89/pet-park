// The dog and the cat, built from simple shapes and animated in code.
import * as THREE from 'three';
import { approach, lerp, clamp } from './math.js';

export const KINDS = {
  dog: {
    speed: 6.0, radius: 0.34, swimDepth: 0.34, camDist: 6.2,
    fur: 0xd9a25e, light: 0xfff1dc, dark: 0x2b211c, ear: 0x9a6434, nose: 0x2b211c, inner: 0x9a6434,
    bodyR: 0.24, bodyLen: 0.48, legLen: 0.32, legR: 0.07, headR: 0.2, sitPitch: 0.5,
  },
  cat: {
    speed: 5.4, radius: 0.28, swimDepth: 0.27, camDist: 5.4,
    fur: 0x8e96a3, light: 0xf7f3ee, dark: 0x22252b, ear: 0x8e96a3, nose: 0xf0a0a8, inner: 0xf3b6bd,
    bodyR: 0.18, bodyLen: 0.44, legLen: 0.25, legR: 0.052, headR: 0.17, sitPitch: 0.6,
  },
};

export class Animal {
  constructor(kind) {
    this.root = new THREE.Group();
    this.phase = 0;
    this.amp = 0;
    this.sit = 0;
    this.air = 0;
    this.swim = 0;
    this.speakT = 0;
    this.happyT = 0;
    this.blinkT = 2;
    this.stepIndex = 0;
    this.stepped = false;
    this.setKind(kind);
  }

  setKind(kind) {
    this.kind = kind;
    this.k = KINDS[kind];
    for (const c of [...this.root.children]) {
      this.root.remove(c);
      c.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
    }
    this.build();
    this.happyT = 1.5;
  }

  build() {
    const k = this.k, isCat = this.kind === 'cat';
    const M = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const fur = M(k.fur), light = M(k.light), dark = M(k.dark, 0.3), ear = M(k.ear), nose = M(k.nose, 0.4), inner = M(k.inner);
    const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    const R = k.bodyR, half = k.bodyLen / 2, H = k.headR;
    this.baseY = k.legLen + k.legR + R * 0.35;

    const body = (this.body = new THREE.Group());
    body.position.y = this.baseY;
    this.root.add(body);

    const torso = add(body, new THREE.CapsuleGeometry(R, k.bodyLen, 6, 16), fur);
    torso.rotation.x = Math.PI / 2;
    add(body, new THREE.SphereGeometry(R * 0.8, 16, 12), light, 0, -R * 0.25, half * 0.85).scale.set(0.95, 0.85, 1.0);

    // Head
    const hp = (this.head = new THREE.Group());
    hp.position.set(0, R * 0.85, half + R * 0.6);
    body.add(hp);
    const head = add(hp, new THREE.SphereGeometry(H, 20, 16), fur);
    if (isCat) {
      head.scale.set(1.12, 0.95, 0.95);
      for (const s of [-1, 1]) add(hp, new THREE.SphereGeometry(H * 0.3, 12, 10), light, s * H * 0.2, -H * 0.33, H * 0.72);
      add(hp, new THREE.SphereGeometry(H * 0.1, 10, 8), nose, 0, -H * 0.14, H * 0.94).scale.set(1.2, 0.7, 0.8);
    } else {
      add(hp, new THREE.SphereGeometry(1, 16, 12), light, 0, -H * 0.32, H * 0.78).scale.set(H * 0.55, H * 0.45, H * 0.62);
      add(hp, new THREE.SphereGeometry(H * 0.16, 12, 10), nose, 0, -H * 0.16, H * 1.36).scale.set(1.2, 0.8, 0.9);
    }
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = add(hp, new THREE.SphereGeometry(H * 0.13, 12, 10), dark, s * H * 0.4, H * 0.14, H * 0.8);
      add(e, new THREE.SphereGeometry(H * 0.045, 8, 6), shine, H * 0.035, H * 0.05, H * 0.1).castShadow = false;
      this.eyes.push(e);
    }

    // Ears
    this.ears = [];
    for (const s of [-1, 1]) {
      const ep = new THREE.Group();
      hp.add(ep);
      if (isCat) {
        ep.position.set(s * H * 0.55, H * 0.72, -H * 0.05);
        const c = add(ep, new THREE.ConeGeometry(H * 0.32, H * 0.6, 4), ear, 0, H * 0.22, 0);
        c.rotation.y = Math.PI / 4;
        const ci = add(ep, new THREE.ConeGeometry(H * 0.2, H * 0.4, 4), inner, 0, H * 0.18, H * 0.09);
        ci.rotation.y = Math.PI / 4;
      } else {
        ep.position.set(s * H * 0.74, H * 0.5, -H * 0.05);
        add(ep, new THREE.SphereGeometry(1, 12, 10), ear, 0, -H * 0.42, 0).scale.set(H * 0.3, H * 0.6, H * 0.15);
      }
      this.ears.push({ pivot: ep, side: s });
    }

    // Legs
    this.legs = [];
    const L = (this.legL = this.baseY - R * 0.3);
    const legSpots = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (const [x, z] of legSpots) {
      const pivot = new THREE.Group();
      pivot.position.set(x * R * 0.55, -R * 0.3, z * half * 0.9);
      body.add(pivot);
      add(pivot, new THREE.CapsuleGeometry(k.legR, L - 2 * k.legR, 4, 10), fur, 0, -L / 2, 0);
      add(pivot, new THREE.SphereGeometry(k.legR * 1.25, 10, 8), light, 0, -L + k.legR * 0.9, k.legR * 0.3).scale.set(1, 0.75, 1.35);
      this.legs.push({ pivot, front: z > 0 });
    }

    // Sit pose values: front legs stretch to reach the ground, hind legs fold forward.
    const p = k.sitPitch, sitY = this.baseY - 0.1 * (R / 0.24);
    const frontY = sitY - 0.3 * R * Math.cos(p) + 0.9 * half * Math.sin(p);
    const hindY = sitY - 0.3 * R * Math.cos(p) - 0.9 * half * Math.sin(p);
    this.sitFrontScale = frontY / L;
    this.sitHindAngle = -Math.acos(clamp((hindY - 0.02) / L, 0, 1)) + p;

    // Tail
    const tp = new THREE.Group();
    tp.position.set(0, R * 0.35, -(half + R * 0.8));
    body.add(tp);
    this.tail = [];
    const n = isCat ? 6 : 3, segLen = isCat ? 0.075 : 0.1;
    let parent = tp;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      g.position.z = i === 0 ? 0 : -segLen;
      parent.add(g);
      const r = isCat ? 0.036 - i * 0.002 : 0.05 - i * 0.008;
      const m = add(g, new THREE.CapsuleGeometry(r, segLen, 4, 8), i === n - 1 && !isCat ? light : fur, 0, 0, -segLen / 2);
      m.rotation.x = Math.PI / 2;
      this.tail.push(g);
      parent = g;
    }
  }

  speak() {
    this.speakT = 0.5;
    this.happyT = 1.5;
  }

  // s: { speed, grounded, swimming, idle }
  update(dt, s, t) {
    const k = this.k, isCat = this.kind === 'cat';
    const moving = s.speed > 0.15;
    const sp = Math.min(1, s.speed / k.speed);

    this.air = approach(this.air, s.grounded ? 0 : 1, dt * 7);
    this.swim = approach(this.swim, s.swimming ? 1 : 0, dt * 4);
    const wantSit = s.idle > 4 && s.grounded && !s.swimming;
    this.sit = approach(this.sit, wantSit ? 1 : 0, dt * (wantSit ? 1.4 : 5));
    this.speakT = Math.max(0, this.speakT - dt);
    this.happyT = Math.max(0, this.happyT - dt);

    const rate = s.swimming ? 9 : moving ? 6 + s.speed * 2.4 : 0;
    this.phase += rate * dt;
    const targetAmp = s.swimming ? 0.7 : Math.min(1, s.speed / 1.5) * (0.45 + 0.4 * sp);
    this.amp = approach(this.amp, targetAmp, dt * 6);

    const si = Math.floor(this.phase / Math.PI);
    this.stepped = si !== this.stepIndex && (moving || s.swimming) && (s.grounded || s.swimming);
    this.stepIndex = si;

    const ph = this.phase, a = this.amp, sit = this.sit, air = this.air;
    const p = k.sitPitch * sit;

    // Body
    const bob = Math.abs(Math.sin(ph)) * 0.045 * a * (1 - this.swim);
    const breathe = Math.sin(t * 2.2) * 0.006;
    this.body.position.y = this.baseY + bob - 0.1 * sit * (k.bodyR / 0.24) + breathe;
    this.body.rotation.x = -p + Math.sin(ph * 2) * 0.03 * a - air * 0.1;
    this.body.rotation.z = Math.sin(ph) * 0.03 * a;

    // Legs
    const offs = [0, Math.PI, Math.PI, 0];
    this.legs.forEach((lg, i) => {
      let r = Math.sin(ph + offs[i]) * a * (lg.front ? 0.9 : 1.0);
      r = lerp(r, lg.front ? -0.9 : 0.8, air * (1 - this.swim));
      if (lg.front) {
        r = lerp(r, p, sit);
        lg.pivot.scale.y = lerp(1, this.sitFrontScale, sit);
      } else {
        r = lerp(r, this.sitHindAngle, sit);
      }
      lg.pivot.rotation.x = r;
    });

    // Head
    const idleLook = clamp(s.idle / 2, 0, 1);
    const speakEnv = Math.sin((this.speakT / 0.5) * Math.PI);
    this.head.rotation.y = Math.sin(t * 0.37 + 1) * 0.5 * idleLook;
    this.head.rotation.x = p * 0.85 - Math.sin(ph * 2) * 0.04 * a + Math.sin(t * 0.23) * 0.12 * idleLook - 0.4 * speakEnv - 0.25 * this.swim;
    this.head.rotation.z = Math.sin(t * 0.3) * 0.12 * idleLook;

    // Ears
    for (const e of this.ears) {
      if (isCat) {
        const twitch = Math.max(0, Math.sin(t * 0.9 + e.side * 2) - 0.97) * 12;
        e.pivot.rotation.z = -e.side * (0.2 + twitch * 0.3);
        e.pivot.rotation.x = -air * 0.3;
      } else {
        e.pivot.rotation.z = e.side * (0.25 + Math.sin(ph) * 0.12 * a + air * 0.6 + speakEnv * 0.3);
        e.pivot.rotation.x = -bob * 3 - air * 0.4;
      }
    }

    // Tail
    const happy = Math.min(1, this.happyT) + (moving ? 0.4 : 0);
    if (isCat) {
      this.tail[0].rotation.x = 0.55 + 0.25 * (1 - sit) - this.swim * 0.6;
      this.tail.forEach((g, i) => {
        if (i > 0) g.rotation.x = i < 3 ? 0.22 : -0.28;
        g.rotation.y = Math.sin(t * 1.8 - i * 0.6) * (0.16 + 0.1 * happy);
      });
    } else {
      this.tail[0].rotation.x = 0.55 + 0.3 * a - this.swim * 0.4 - sit * 0.6;
      this.tail[0].rotation.y = Math.sin(t * (moving ? 13 : 9)) * (0.2 + 0.4 * happy);
      for (let i = 1; i < this.tail.length; i++) this.tail[i].rotation.y = Math.sin(t * 13 - i * 0.8) * 0.2;
    }

    // Blink
    this.blinkT -= dt;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3.5;
    const closed = this.blinkT < 0.12 || (sit > 0.95 && isCat && Math.sin(t * 0.2) > 0.6);
    for (const e of this.eyes) e.scale.y = closed ? 0.15 : 1;
  }
}
