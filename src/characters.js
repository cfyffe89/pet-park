// The other things the player can become: vehicles, dinosaurs and animals.
// Each one is built from simple shapes, faces +z and stands on y = 0, like the dog and the cat.
//
// build(root, body) fills `body` (the part that bobs) and, for vehicles, puts the wheels on `root`.
// It returns a rig that animal.js animates the same way for every character:
//   baseY  body height when standing
//   legs   [{ pivot, off, amp, front }]  swing around x while walking (off = step timing)
//   wheels [{ g, r }]                    roll around x while driving
//   head, tail[], eyes[]                 look around, sway, blink
//   pose(st)                             the character's own extras (jaw, ladder, stop sign ...)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { lerp } from './math.js';

// --- Small helpers. Nothing is shared between characters, so a swap can free everything. ---
function kit() {
  const mats = new Map();
  const M = (color, rough = 0.7, extra) => {
    const key = color + ':' + rough + (extra ? JSON.stringify(extra) : '');
    if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra }));
    return mats.get(key);
  };
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, typeof mat === 'number' ? M(mat) : mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const group = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const box = (w, h, d, r = 0.05) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
  const cyl = (rt, rb, h, n = 12) => new THREE.CylinderGeometry(rt, rb, h, n);
  const ball = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
  const cap = (r, len, n = 10) => new THREE.CapsuleGeometry(r, len, 4, n);
  // Each lamp has its own material, so lamps can flash one at a time.
  const lamp = (parent, color, r, x, y, z) =>
    add(parent, ball(r, 10, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.3, emissive: color, emissiveIntensity: 0.5 }), x, y, z);

  // Friendly round eyes. The group is what blinks.
  const eye = (parent, x, y, z, s, turn = 0) => {
    const g = group(parent, x, y, z);
    g.rotation.y = turn;
    add(g, ball(s, 12, 10), M(0xffffff, 0.3));
    add(g, ball(s * 0.62, 10, 8), M(0x23232b, 0.3), 0, 0, s * 0.5);
    add(g, ball(s * 0.2, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), s * 0.18, s * 0.22, s * 0.95).castShadow = false;
    return g;
  };

  // A wheel that rolls around x.
  const wheel = (parent, r, w, x, y, z, hubColor = 0xe9e4da) => {
    const g = group(parent, x, y, z);
    add(g, cyl(r, r, w, 16), M(0x34363c, 0.9)).rotation.z = Math.PI / 2;
    add(g, cyl(r * 0.5, r * 0.5, w + 0.02, 10), M(hubColor, 0.5)).rotation.z = Math.PI / 2;
    // A spoke, so the turning shows.
    add(g, box(w + 0.03, r * 0.25, r * 0.95, 0.01), M(hubColor, 0.5));
    return { g, r };
  };

  // A leg that hangs from a hip pivot.
  const leg = (parent, x, y, z, len, r, color, footColor, off, amp, front) => {
    const pivot = group(parent, x, y, z);
    add(pivot, cap(r, Math.max(0.01, len - 2 * r - 0.06)), color, 0, -len / 2 + 0.03, 0);
    add(pivot, cyl(r * 1.1, r * 1.2, 0.1, 10), footColor, 0, -len + 0.05, 0);
    return { pivot, off, amp, front };
  };

  // A chain of segments along +z (neck) or -z (tail). Returns the groups.
  const chain = (parent, n, segLen, r0, r1, color, dir, bend0, bend) => {
    const out = [];
    let p = parent;
    for (let i = 0; i < n; i++) {
      const g = group(p, 0, 0, i === 0 ? 0 : dir * segLen);
      g.rotation.x = i === 0 ? bend0 : bend;
      const r = lerp(r0, r1, i / Math.max(1, n - 1));
      add(g, cap(r, segLen * 0.75, 10), color, 0, 0, dir * segLen / 2).rotation.x = Math.PI / 2;
      out.push(g);
      p = g;
    }
    return out;
  };

  return { M, add, group, box, cyl, ball, cap, lamp, eye, wheel, leg, chain };
}

const TROT = [0, Math.PI, Math.PI, 0];  // order: right front, left front, right hind, left hind
const PACE = [0, Math.PI, 0, Math.PI];  // giraffes move both legs on one side together
const GLASS = 0xbfe6f5;

let giraffeTex = null;
function giraffeSkin() {
  if (giraffeTex) return giraffeTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#f6dc9a';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#c47a32';
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = 6, c = 256 / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cx = (i + 0.5) * c + (rnd() - 0.5) * c * 0.25, cy = (j + 0.5) * c + (rnd() - 0.5) * c * 0.25;
      g.beginPath();
      const sides = 6;
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2 + rnd() * 0.4;
        const rr = c * (0.36 + rnd() * 0.08);
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    }
  }
  giraffeTex = new THREE.CanvasTexture(cv);
  giraffeTex.colorSpace = THREE.SRGBColorSpace;
  giraffeTex.wrapS = giraffeTex.wrapT = THREE.RepeatWrapping;
  return giraffeTex;
}

// ===================== Vehicles =====================

function fireTruck(root, body) {
  const { M, add, group, box, cyl, lamp, eye, wheel } = kit();
  const red = M(0xe8433a, 0.45), white = M(0xf4f4f4, 0.5), steel = M(0xc9ccd2, 0.35), dark = M(0x3a3d44, 0.8);
  add(body, box(0.9, 0.22, 1.95, 0.06), dark, 0, 0.36, 0);
  add(body, box(0.92, 0.62, 0.62, 0.14), red, 0, 0.78, 0.63);          // cab
  add(body, box(0.78, 0.28, 0.04, 0.03), M(GLASS, 0.15), 0, 0.9, 0.94);
  for (const s of [-1, 1]) add(body, box(0.04, 0.24, 0.36, 0.03), M(GLASS, 0.15), s * 0.46, 0.9, 0.66);
  add(body, box(0.92, 0.55, 1.25, 0.1), red, 0, 0.74, -0.33);           // back with the lockers
  add(body, box(0.94, 0.07, 1.2, 0.02), white, 0, 0.6, -0.33);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(body, box(0.02, 0.18, 0.32, 0.02), steel, s * 0.47, 0.8, -0.75 + i * 0.4);
  add(body, box(0.96, 0.12, 0.1, 0.04), steel, 0, 0.36, 1.0);            // bumper
  for (const s of [-1, 1]) lamp(body, 0xfff6cc, 0.06, s * 0.32, 0.55, 0.96);
  const eyes = [-1, 1].map((s) => eye(body, s * 0.18, 0.92, 0.97, 0.08));
  // Light bar
  add(body, box(0.6, 0.08, 0.16, 0.03), dark, 0, 1.12, 0.63);
  const lights = [lamp(body, 0xff3b3b, 0.07, -0.18, 1.18, 0.63), lamp(body, 0x3b8bff, 0.07, 0.18, 1.18, 0.63)];
  // Hose reel at the back
  const reel = add(body, cyl(0.16, 0.16, 0.5, 14), M(0xffd24a, 0.5), 0, 0.68, -1.0);
  reel.rotation.z = Math.PI / 2;
  // Ladder that lifts up when the siren plays
  const ladder = group(body, 0, 1.13, -0.85);
  for (const s of [-1, 1]) add(ladder, box(0.05, 0.05, 1.3, 0.02), steel, s * 0.17, 0, 0.65);
  for (let i = 0; i < 6; i++) add(ladder, box(0.34, 0.03, 0.03, 0.01), steel, 0, 0, 0.08 + i * 0.22);
  const wheels = [];
  for (const z of [-0.62, 0.62]) for (const s of [-1, 1]) wheels.push(wheel(root, 0.23, 0.18, s * 0.44, 0.23, z, 0xd8d8d8));
  return {
    baseY: 0, wheels, eyes,
    pose({ t, env, speaking }) {
      ladder.rotation.x = -0.75 * env;
      const flash = speaking ? Math.sin(t * 16) : -1;
      lights[0].material.emissiveIntensity = flash > 0 ? 1.6 : 0.3;
      lights[1].material.emissiveIntensity = flash < 0 && speaking ? 1.6 : 0.3;
    },
  };
}

function schoolBus(root, body) {
  const { M, add, group, box, cyl, lamp, eye, wheel } = kit();
  const yellow = M(0xffc531, 0.45), black = M(0x2d2e33, 0.7);
  add(body, box(0.96, 0.82, 1.78, 0.14), yellow, 0, 0.78, -0.26);       // passenger box
  add(body, box(0.86, 0.42, 0.48, 0.12), yellow, 0, 0.55, 0.83);         // the round nose
  add(body, box(0.98, 0.04, 1.8, 0.02), black, 0, 0.74, -0.26);
  add(body, box(0.98, 0.04, 1.8, 0.02), black, 0, 0.56, -0.26);
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) add(body, box(0.02, 0.24, 0.26, 0.03), M(GLASS, 0.15), s * 0.48, 0.97, -1.0 + i * 0.32);
  add(body, box(0.8, 0.3, 0.03, 0.03), M(GLASS, 0.15), 0, 0.98, 0.63);
  add(body, box(0.02, 0.5, 0.24, 0.03), M(GLASS, 0.15), 0.48, 0.78, 0.48); // door
  const eyes = [-1, 1].map((s) => eye(body, s * 0.2, 0.99, 0.66, 0.085));
  for (const z of [1.08, -1.17]) add(body, box(0.98, 0.1, 0.07, 0.03), black, 0, 0.38, z);
  for (const s of [-1, 1]) lamp(body, 0xfff6cc, 0.06, s * 0.3, 0.6, 1.07);
  const flashers = [-1, 1].map((s) => lamp(body, 0xff5a3d, 0.055, s * 0.36, 1.16, 0.62));
  // Stop sign that swings out on the left side
  const arm = group(body, -0.5, 0.82, 0.32);
  const sign = add(arm, cyl(0.14, 0.14, 0.025, 8), M(0xe8433a, 0.5), 0, 0, -0.18);
  sign.rotation.z = Math.PI / 2;
  sign.rotation.x = Math.PI / 8;
  const rim = add(arm, cyl(0.155, 0.155, 0.015, 8), M(0xffffff, 0.5), 0.005, 0, -0.18);
  rim.rotation.z = Math.PI / 2;
  rim.rotation.x = Math.PI / 8;
  const wheels = [];
  for (const z of [-0.68, 0.72]) for (const s of [-1, 1]) wheels.push(wheel(root, 0.24, 0.18, s * 0.45, 0.24, z));
  return {
    baseY: 0, wheels, eyes,
    pose({ t, env, speaking }) {
      arm.rotation.y = (Math.PI / 2) * Math.min(1, env * 1.6);
      const on = speaking && Math.sin(t * 12) > 0;
      flashers[0].material.emissiveIntensity = on ? 1.6 : 0.25;
      flashers[1].material.emissiveIntensity = !on && speaking ? 1.6 : 0.25;
    },
  };
}

// Tracks for the bulldozer and the excavator: a dark belt with rollers that turn.
function tracks(k, root, w, len, x) {
  const wheels = [];
  for (const s of [-1, 1]) {
    k.add(root, k.box(w, 0.3, len, 0.14), k.M(0x3a3d44, 0.9), s * x, 0.15, 0);
    for (let i = 0; i < 3; i++) {
      const wl = k.wheel(root, 0.1, 0.04, s * (x + w / 2 + 0.01), 0.15, (i - 1) * len * 0.33, 0x9aa0a8);
      wheels.push(wl);
    }
  }
  return wheels;
}

function bulldozer(root, body) {
  const k = kit();
  const { M, add, group, box, cyl, lamp, eye } = k;
  const yellow = M(0xffbe2e, 0.5), dark = M(0x3a3d44, 0.8);
  const wheels = tracks(k, root, 0.28, 1.25, 0.42);
  add(body, box(0.66, 0.38, 1.0, 0.1), yellow, 0, 0.48, -0.05);
  add(body, box(0.6, 0.55, 0.52, 0.1), yellow, 0, 0.94, -0.22);        // cab
  add(body, box(0.5, 0.3, 0.03, 0.03), M(GLASS, 0.15), 0, 1.0, 0.05);
  for (const s of [-1, 1]) add(body, box(0.03, 0.28, 0.4, 0.03), M(GLASS, 0.15), s * 0.3, 1.0, -0.22);
  add(body, box(0.66, 0.06, 0.58, 0.03), dark, 0, 1.24, -0.22);
  const eyes = [-1, 1].map((s) => eye(body, s * 0.13, 1.02, 0.07, 0.07));
  const pipe = add(body, cyl(0.04, 0.04, 0.4, 8), dark, 0.22, 0.85, 0.28);
  const puff = add(pipe, k.ball(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0 }), 0, 0.3, 0);
  puff.castShadow = false;
  lamp(body, 0xffa53d, 0.06, 0, 1.31, -0.22);
  // Blade on two arms
  const blade = group(body, 0, 0.42, 0.2);
  for (const s of [-1, 1]) add(blade, box(0.06, 0.08, 0.5, 0.02), dark, s * 0.3, 0, 0.22);
  add(blade, box(1.12, 0.4, 0.1, 0.04), yellow, 0, -0.02, 0.5).rotation.x = -0.15;
  add(blade, box(1.12, 0.05, 0.08, 0.02), M(0xb9bcc4, 0.4), 0, -0.22, 0.54);
  return {
    baseY: 0, wheels, eyes,
    pose({ t, env, speaking, u }) {
      blade.rotation.x = -0.35 * env;
      blade.position.y = 0.42 + 0.1 * env;
      // A little puff of smoke when the engine goes "brrm"
      const p = speaking ? (u * 2.2) % 1 : 1;
      puff.material.opacity = speaking ? 0.7 * (1 - p) : 0;
      puff.position.y = 0.25 + p * 0.5;
      puff.scale.setScalar(1 + p * 2.5);
    },
  };
}

function excavator(root, body) {
  const k = kit();
  const { M, add, group, box, cyl, lamp, eye } = k;
  const yellow = M(0xffbe2e, 0.5), dark = M(0x3a3d44, 0.8);
  const wheels = tracks(k, root, 0.28, 1.2, 0.38);
  const upper = group(body, 0, 0.32, 0);
  add(upper, cyl(0.3, 0.3, 0.08, 16), dark, 0, 0.02, 0);
  add(upper, box(0.85, 0.4, 0.9, 0.1), yellow, 0, 0.26, -0.15);
  add(upper, box(0.82, 0.3, 0.28, 0.1), dark, 0, 0.24, -0.62);          // counterweight
  add(upper, box(0.42, 0.52, 0.46, 0.1), yellow, -0.2, 0.7, 0.1);       // cab
  add(upper, box(0.36, 0.3, 0.03, 0.03), M(GLASS, 0.15), -0.2, 0.76, 0.34);
  add(upper, box(0.03, 0.3, 0.36, 0.03), M(GLASS, 0.15), -0.42, 0.76, 0.1);
  const eyes = [-1, 1].map((s) => eye(upper, -0.2 + s * 0.09, 0.78, 0.36, 0.055));
  const beacon = lamp(upper, 0xffa53d, 0.06, -0.2, 1.0, 0.1);
  // Arm: boom -> stick -> bucket
  const boom = group(upper, 0.2, 0.45, 0.25);
  add(boom, box(0.14, 0.16, 0.95, 0.05), yellow, 0, 0, 0.45);
  const stick = group(boom, 0, 0, 0.9);
  add(stick, box(0.12, 0.13, 0.65, 0.04), yellow, 0, 0, 0.3);
  const bucket = group(stick, 0, 0, 0.62);
  add(bucket, box(0.36, 0.24, 0.26, 0.06), dark, 0, -0.06, 0.1);
  for (let i = 0; i < 3; i++) add(bucket, box(0.05, 0.06, 0.07, 0.015), M(0xb9bcc4, 0.4), -0.12 + i * 0.12, -0.17, 0.22);
  return {
    baseY: 0, wheels, eyes,
    pose({ t, env, speaking, u, moving }) {
      // Tucked arm, held up in front. "Speak" does one big scoop.
      const s = speaking ? Math.sin(u * Math.PI * 2) : 0;
      boom.rotation.x = -0.75 + 0.55 * env + (moving ? 0 : Math.sin(t * 0.7) * 0.03);
      stick.rotation.x = 1.5 - 0.5 * env + s * 0.2;
      bucket.rotation.x = 0.7 + s * 0.8;
      upper.rotation.y = speaking ? Math.sin(u * Math.PI * 2) * 0.35 : 0;
      beacon.material.emissiveIntensity = 0.3 + 0.6 * Math.max(0, Math.sin(t * 3));
    },
  };
}

// ===================== Dinosaurs =====================

function tRex(root, body) {
  const { M, add, group, box, ball, cap, cyl, eye, chain } = kit();
  const green = M(0x6cbf5a, 0.75), belly = M(0xdcebaa, 0.8), spike = M(0xffb347, 0.6), dark = M(0x3d6b33, 0.8);
  add(body, cap(0.3, 0.45, 14), green).rotation.x = Math.PI / 2 - 0.2;
  add(body, ball(0.27), belly, 0, -0.1, 0.18).scale.set(0.9, 0.8, 1.05);
  add(body, cap(0.2, 0.2), green, 0, 0.22, 0.36).rotation.x = 0.6;     // neck
  const head = group(body, 0, 0.38, 0.5);
  add(head, box(0.38, 0.3, 0.5, 0.13), green, 0, 0.04, 0.14);
  const jaw = group(head, 0, -0.06, -0.02);
  add(jaw, box(0.32, 0.1, 0.44, 0.05), belly, 0, -0.05, 0.2);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const tooth = add(head, new THREE.ConeGeometry(0.022, 0.06, 5), 0xffffff, s * 0.13, -0.12, 0.2 + i * 0.07);
    tooth.rotation.x = Math.PI;
  }
  for (const s of [-1, 1]) add(head, ball(0.02, 6, 5), dark, s * 0.06, 0.08, 0.39);
  for (const s of [-1, 1]) add(head, box(0.1, 0.04, 0.12, 0.02), dark, s * 0.13, 0.21, 0.13);
  const eyes = [-1, 1].map((s) => eye(head, s * 0.15, 0.15, 0.16, 0.065, s * 0.4));
  // Tiny arms
  const arms = [-1, 1].map((s) => {
    const p = group(body, s * 0.2, -0.04, 0.32);
    add(p, cap(0.04, 0.1, 6), green, 0, -0.06, 0.04).rotation.x = 0.8;
    return p;
  });
  // Back spikes
  for (let i = 0; i < 5; i++) add(body, new THREE.ConeGeometry(0.05, 0.12, 4), spike, 0, 0.3 - Math.abs(i - 1) * 0.02, 0.25 - i * 0.16);
  // Big legs
  const legs = [-1, 1].map((s, i) => {
    const pivot = group(body, s * 0.2, -0.05, -0.05);
    add(pivot, cap(0.14, 0.25), green, 0, -0.22, 0);
    add(pivot, cap(0.08, 0.3), green, 0, -0.6, -0.02);
    add(pivot, box(0.18, 0.08, 0.27, 0.03), dark, 0, -0.86, 0.06);
    return { pivot, off: i * Math.PI, amp: 0.7, front: false };
  });
  const tail = chain(body, 4, 0.28, 0.2, 0.06, green, -1, -0.15, 0.08);
  tail[0].position.set(0, 0.03, -0.42);
  return {
    baseY: 0.92, legs, head, tail, eyes,
    pose({ t, env, speaking }) {
      jaw.rotation.x = 0.55 * env;
      head.rotation.x -= 0.35 * env;
      arms.forEach((a, i) => (a.rotation.x = speaking ? Math.sin(t * 18 + i * 3) * 0.5 : Math.sin(t * 1.5 + i) * 0.1));
    },
  };
}

function barosaurus(root, body) {
  const { M, add, group, box, ball, cyl, eye, chain } = kit();
  const skin = M(0x7fb3c8, 0.75), belly = M(0xe4efe6, 0.8), spot = M(0x5b8fa8, 0.8), dark = M(0x3f6676, 0.8);
  add(body, ball(0.5, 16, 12), skin).scale.set(0.85, 0.75, 1.35);
  add(body, ball(0.44, 14, 10), belly, 0, -0.1, 0.05).scale.set(0.85, 0.7, 1.3);
  for (const [x, z, r] of [[0.15, 0.2, 0.1], [-0.18, -0.15, 0.12], [0.08, -0.4, 0.08], [-0.1, 0.35, 0.07]]) add(body, ball(r, 8, 6), spot, x, 0.34, z).scale.set(1, 0.4, 1);
  const legs = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([x, z], i) => {
    const pivot = group(body, x * 0.28, -0.15, z * 0.42);
    add(pivot, cyl(0.12, 0.11, 0.8, 12), skin, 0, -0.42, 0);
    add(pivot, cyl(0.13, 0.14, 0.1, 12), dark, 0, -0.85, 0);
    return { pivot, off: TROT[i], amp: 0.4, front: z > 0 };
  });
  const neck = chain(body, 5, 0.38, 0.17, 0.09, skin, 1, -0.9, -0.05);
  neck[0].position.set(0, 0.18, 0.55);
  const head = group(neck[4], 0, 0, 0.38);
  head.rotation.x = 1.05;
  add(head, box(0.2, 0.17, 0.32, 0.08), skin, 0, 0, 0.1);
  add(head, box(0.17, 0.06, 0.2, 0.03), belly, 0, -0.07, 0.15);
  head.userData.rx = 1.05;
  const eyes = [-1, 1].map((s) => eye(head, s * 0.09, 0.05, 0.12, 0.05, s * 0.5));
  const tail = chain(body, 7, 0.32, 0.17, 0.035, skin, -1, -0.3, 0.05);
  tail[0].position.set(0, 0.08, -0.6);
  return {
    baseY: 1.05, legs, head, tail, eyes, neck,
    pose({ t, env, moving }) {
      neck[0].rotation.x = -0.9 - 0.3 * env + Math.sin(t * 0.5) * 0.04;
      for (let i = 1; i < neck.length; i++) neck[i].rotation.y = Math.sin(t * 0.6 - i * 0.4) * (moving ? 0.03 : 0.06);
      head.rotation.x += 0.3 * env;
    },
  };
}

// ===================== Animals =====================

function giraffe(root, body) {
  const { M, add, group, box, ball, cyl, cap, eye } = kit();
  const skin = new THREE.MeshStandardMaterial({ map: giraffeSkin(), roughness: 0.8 });
  const tan = M(0xf6dc9a, 0.8), brown = M(0x8a5426, 0.8), dark = M(0x3d2a1e, 0.7);
  add(body, ball(0.42, 16, 12), skin).scale.set(0.72, 0.78, 1.1);
  const legs = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([x, z], i) => {
    const pivot = group(body, x * 0.16, -0.18, z * 0.28);
    add(pivot, cyl(0.06, 0.045, 1.0, 10), skin, 0, -0.5, 0);
    add(pivot, ball(0.06, 8, 6), tan, 0, -0.55, 0);
    add(pivot, cyl(0.05, 0.06, 0.08, 10), dark, 0, -1.03, 0);
    return { pivot, off: PACE[i], amp: 0.35, front: z > 0 };
  });
  const neck = group(body, 0, 0.18, 0.3);
  neck.rotation.x = -1.1;
  const nk = add(neck, cyl(0.075, 0.13, 1.2, 12), skin, 0, 0, 0.6);
  nk.rotation.x = Math.PI / 2;
  add(neck, box(0.04, 0.08, 1.1, 0.02), brown, 0, 0.1, 0.55);           // mane
  const head = group(neck, 0, 0, 1.2);
  head.rotation.x = 1.25;
  head.userData.rx = 1.25;
  add(head, cap(0.1, 0.2, 10), skin, 0, 0, 0.1).rotation.x = Math.PI / 2;
  add(head, ball(0.09, 10, 8), tan, 0, -0.02, 0.27).scale.set(1, 0.85, 1);
  for (const s of [-1, 1]) {
    add(head, cyl(0.022, 0.025, 0.14, 6), skin, s * 0.05, 0.13, 0.0);
    add(head, ball(0.035, 8, 6), brown, s * 0.05, 0.21, 0.0);
    const ear = add(head, new THREE.ConeGeometry(0.035, 0.12, 6), tan, s * 0.12, 0.07, -0.03);
    ear.rotation.z = -s * 1.2;
    add(head, ball(0.012, 6, 5), dark, s * 0.035, 0.0, 0.35);
  }
  const eyes = [-1, 1].map((s) => eye(head, s * 0.085, 0.06, 0.12, 0.04, s * 0.6));
  const tail = [group(body, 0, 0.1, -0.44)];
  tail[0].rotation.x = -1.25;
  add(tail[0], cyl(0.015, 0.02, 0.5, 6), skin, 0, 0, -0.25).rotation.x = Math.PI / 2;
  add(tail[0], ball(0.05, 8, 6), dark, 0, 0, -0.52).scale.set(0.8, 0.8, 1.6);
  return {
    baseY: 1.22, legs, head, tail, eyes, stride: 0.75,
    pose({ t, env, moving }) {
      neck.rotation.x = -1.1 + Math.sin(t * 0.7) * 0.03 + 0.25 * env;
      head.rotation.x -= 0.3 * env;
      neck.rotation.y = moving ? 0 : Math.sin(t * 0.3) * 0.15;
    },
  };
}

function pig(root, body) {
  const { M, add, group, box, ball, cyl, eye } = kit();
  const pink = M(0xf6aabb, 0.75), deep = M(0xe9879d, 0.7), dark = M(0x6b3846, 0.6);
  add(body, ball(0.3, 16, 12), pink).scale.set(0.9, 0.85, 1.15);
  const head = group(body, 0, 0.08, 0.32);
  add(head, ball(0.2, 16, 12), pink);
  const snout = add(head, cyl(0.09, 0.1, 0.09, 14), deep, 0, -0.04, 0.2);
  snout.rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) add(head, ball(0.02, 6, 5), dark, s * 0.035, -0.04, 0.25);
  const ears = [-1, 1].map((s) => {
    const e = group(head, s * 0.11, 0.15, 0.0);
    const c = add(e, new THREE.ConeGeometry(0.07, 0.13, 4), pink, 0, 0.05, 0.02);
    c.rotation.x = 0.7;
    return e;
  });
  const eyes = [-1, 1].map((s) => eye(head, s * 0.09, 0.06, 0.15, 0.045, s * 0.3));
  const legs = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([x, z], i) => {
    const pivot = group(body, x * 0.14, -0.12, z * 0.18);
    add(pivot, cyl(0.06, 0.055, 0.17, 10), pink, 0, -0.08, 0);
    add(pivot, cyl(0.055, 0.055, 0.07, 10), deep, 0, -0.2, 0);
    return { pivot, off: TROT[i], amp: 0.6, front: z > 0 };
  });
  const tail = [group(body, 0, 0.08, -0.33)];
  add(tail[0], new THREE.TorusGeometry(0.045, 0.014, 6, 14, Math.PI * 1.7), pink, 0, 0, -0.03).rotation.y = Math.PI / 2;
  return {
    baseY: 0.36, legs, head, tail, eyes,
    pose({ t, env, speaking }) {
      for (const [i, e] of ears.entries()) e.rotation.z = (i ? -1 : 1) * (0.1 + 0.3 * env);
      head.rotation.x += speaking ? Math.sin(t * 22) * 0.12 : 0;
      tail[0].rotation.z = t * 6;
    },
  };
}

function horse(root, body) {
  const { M, add, group, box, ball, cyl, cap, eye, chain } = kit();
  const coat = M(0xa8683c, 0.7), mane = M(0x3b2618, 0.8), light = M(0xf2e3cf, 0.8), hoof = M(0x2c2622, 0.6);
  add(body, cap(0.26, 0.6, 14), coat).rotation.x = Math.PI / 2;
  const legs = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([x, z], i) => {
    const pivot = group(body, x * 0.15, -0.12, z * 0.36);
    add(pivot, cap(0.07, 0.55, 8), coat, 0, -0.38, 0);
    add(pivot, cyl(0.075, 0.075, 0.08, 10), light, 0, -0.7, 0);
    add(pivot, cyl(0.075, 0.085, 0.1, 10), hoof, 0, -0.79, 0);
    return { pivot, off: TROT[i], amp: 0.6, front: z > 0 };
  });
  const neck = group(body, 0, 0.1, 0.42);
  neck.rotation.x = -0.95;
  add(neck, cap(0.13, 0.4, 10), coat, 0, 0, 0.28).rotation.x = Math.PI / 2;
  add(neck, box(0.06, 0.12, 0.55, 0.03), mane, 0, 0.13, 0.25);
  const head = group(neck, 0, 0, 0.55);
  head.rotation.x = 1.55;
  head.userData.rx = 1.55;
  add(head, box(0.18, 0.2, 0.46, 0.08), coat, 0, 0, 0.14);
  add(head, box(0.17, 0.17, 0.16, 0.07), light, 0, -0.02, 0.33);
  add(head, box(0.05, 0.03, 0.18, 0.015), light, 0, 0.1, 0.12);        // white blaze
  for (const s of [-1, 1]) {
    const ear = add(head, new THREE.ConeGeometry(0.04, 0.12, 6), coat, s * 0.06, 0.13, -0.04);
    ear.rotation.z = -s * 0.2;
    add(head, ball(0.015, 6, 5), hoof, s * 0.04, 0.0, 0.42);
  }
  add(head, box(0.08, 0.06, 0.12, 0.03), mane, 0, 0.11, 0.0);           // forelock
  const eyes = [-1, 1].map((s) => eye(head, s * 0.095, 0.05, 0.1, 0.045, s * 0.7));
  const tail = chain(body, 3, 0.18, 0.06, 0.04, mane, -1, -0.9, -0.3);
  tail[0].position.set(0, 0.14, -0.55);
  return {
    baseY: 0.92, legs, head, tail, eyes,
    pose({ t, env }) {
      neck.rotation.x = -0.95 - 0.35 * env;
      head.rotation.x -= 0.25 * env;
    },
  };
}

function gorilla(root, body) {
  const { M, add, group, box, ball, cap, eye } = kit();
  const fur = M(0x3b3a40, 0.9), silver = M(0x8f9096, 0.9), face = M(0x6e5a4f, 0.7), dark = M(0x2a2228, 0.6);
  const torso = group(body, 0, 0, 0);
  torso.rotation.x = -0.35;
  add(torso, ball(0.38, 16, 12), fur).scale.set(1, 0.95, 1.05);
  add(torso, ball(0.3, 14, 10), silver, 0, 0.14, -0.14).scale.set(1, 0.7, 1.05);
  add(torso, ball(0.24, 12, 10), face, 0, -0.04, 0.2).scale.set(1, 0.95, 0.6);
  const head = group(body, 0, 0.36, 0.3);
  add(head, ball(0.19, 14, 12), fur).scale.set(1, 1.05, 0.95);
  add(head, ball(0.14, 12, 10), face, 0, -0.05, 0.1).scale.set(1.05, 0.9, 0.7);
  add(head, box(0.28, 0.05, 0.08, 0.02), dark, 0, 0.06, 0.13);           // brow
  for (const s of [-1, 1]) {
    add(head, ball(0.016, 6, 5), dark, s * 0.03, -0.06, 0.2);
    add(head, ball(0.045, 8, 6), face, s * 0.18, 0.0, 0.0);
  }
  const eyes = [-1, 1].map((s) => eye(head, s * 0.06, 0.02, 0.14, 0.035));
  const arms = [];
  const legs = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([x, z], i) => {
    const front = z > 0;
    const pivot = group(body, x * (front ? 0.33 : 0.2), front ? 0.15 : -0.18, front ? 0.18 : -0.2);
    if (front) {
      add(pivot, cap(0.1, 0.55, 10), fur, 0, -0.4, 0);
      add(pivot, ball(0.11, 10, 8), face, 0, -0.76, 0.02);
      arms.push({ pivot, side: x });
    } else {
      add(pivot, cap(0.1, 0.2, 10), fur, 0, -0.22, 0);
      add(pivot, box(0.15, 0.08, 0.22, 0.04), face, 0, -0.46, 0.04);
    }
    return { pivot, off: TROT[i], amp: front ? 0.5 : 0.6, front };
  });
  return {
    baseY: 0.68, legs, head, tail: [], eyes,
    pose({ t, env, speaking }) {
      // Sit up and pat the chest: "dum dum dum".
      body.rotation.x -= 0.55 * env;
      body.position.y += 0.08 * env;
      head.rotation.x += 0.35 * env;
      for (const a of arms) {
        const beat = speaking ? Math.max(0, Math.sin(t * 22 + (a.side > 0 ? 0 : Math.PI))) : 0;
        a.pivot.rotation.x = lerp(a.pivot.rotation.x, -1.2 - beat * 0.3, env);
        a.pivot.rotation.z = a.side * -0.5 * env;
      }
      for (const lg of legs) if (!lg.front) lg.pivot.rotation.x = lerp(lg.pivot.rotation.x, 0.55, env);
    },
  };
}

// Same controls and hop for everyone. Sizes stay toy-like so every character fits the park.
//   voice: the Sound method for B, and when the player becomes this character
//   camDist / camLift: how far back the camera sits and how high it looks
//   swimDepth: big ones wade through the pond instead of swimming
export const CHARACTERS = {
  pig:        { build: pig,        voice: 'oink',   speed: 5.6, radius: 0.34, swimDepth: 0.3,  camDist: 5.8, camLift: 0.45, speakLen: 0.6 },
  horse:      { build: horse,      voice: 'neigh',  speed: 6.6, radius: 0.42, swimDepth: 0.6,  camDist: 7.0, camLift: 0.8,  speakLen: 1.0 },
  giraffe:    { build: giraffe,    voice: 'hum',    speed: 5.8, radius: 0.4,  swimDepth: 1.0,  camDist: 8.5, camLift: 1.3,  speakLen: 1.0, stride: 0.75 },
  gorilla:    { build: gorilla,    voice: 'thump',  speed: 5.8, radius: 0.42, swimDepth: 0.5,  camDist: 6.8, camLift: 0.6,  speakLen: 1.2 },
  trex:       { build: tRex,       voice: 'roar',   speed: 6.0, radius: 0.42, swimDepth: 0.6,  camDist: 7.2, camLift: 0.9,  speakLen: 1.0, heavy: true },
  barosaurus: { build: barosaurus, voice: 'call',   speed: 5.6, radius: 0.55, swimDepth: 1.1,  camDist: 9.5, camLift: 1.5,  speakLen: 1.4, heavy: true, stride: 0.6 },
  firetruck:  { build: fireTruck,  voice: 'siren',  speed: 6.4, radius: 0.5,  swimDepth: 0.5,  camDist: 7.5, camLift: 0.55, speakLen: 2.0, vehicle: true },
  schoolbus:  { build: schoolBus,  voice: 'honk',   speed: 6.2, radius: 0.52, swimDepth: 0.5,  camDist: 7.8, camLift: 0.55, speakLen: 1.4, vehicle: true },
  bulldozer:  { build: bulldozer,  voice: 'vroom',  speed: 5.6, radius: 0.55, swimDepth: 0.5,  camDist: 7.2, camLift: 0.55, speakLen: 1.2, vehicle: true },
  excavator:  { build: excavator,  voice: 'digger', speed: 5.6, radius: 0.5,  swimDepth: 0.5,  camDist: 7.4, camLift: 0.6,  speakLen: 1.4, vehicle: true },
};
