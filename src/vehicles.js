// Toy-like cars and construction vehicles, built from soft rounded shapes.
// Every model faces +z (the same way as the animal at heading 0) and stands on y = 0.
// Each builder returns { root, animate(t, dt) } and the circles that block the animal, in local space.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const mats = new Map();
export function mat(color, rough = 0.6, extra = {}) {
  const key = color + ':' + rough + ':' + JSON.stringify(extra);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra }));
  return mats.get(key);
}

const geos = new Map();
const cached = (key, make) => {
  if (!geos.has(key)) geos.set(key, make());
  return geos.get(key);
};
export const rbox = (w, h, d, r = 0.1) =>
  cached(`rb${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)));
const cyl = (rt, rb, h, n = 16) => cached(`cy${rt},${rb},${h},${n}`, () => new THREE.CylinderGeometry(rt, rb, h, n));
const sphere = (r) => cached(`sp${r}`, () => new THREE.SphereGeometry(r, 16, 10));

export function add(parent, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const GLASS = 0xbfe6f5, TYRE = 0x3a3d44, HUB = 0xe9e4da;

// A wheel that turns around the x axis.
function wheel(parent, r, w, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const tyre = add(g, cyl(r, r, w, 18), mat(TYRE, 0.9));
  tyre.rotation.z = Math.PI / 2;
  const hub = add(g, cyl(r * 0.5, r * 0.5, w + 0.02, 12), mat(HUB, 0.5));
  hub.rotation.z = Math.PI / 2;
  parent.add(g);
  return g;
}

// Two friendly round eyes on a windscreen, so vehicles look like characters.
function eyes(parent, x, y, z, s = 1) {
  for (const side of [-1, 1]) {
    add(parent, sphere(0.09 * s), mat(0xffffff, 0.3), x + side * 0.2 * s, y, z);
    add(parent, sphere(0.05 * s), mat(0x2b2b33, 0.3), x + side * 0.2 * s, y, z + 0.05 * s);
  }
}

function lamp(parent, x, y, z, color = 0xfff6cc, r = 0.08) {
  return add(parent, sphere(r), mat(color, 0.3, { emissive: color, emissiveIntensity: 0.6 }), x, y, z);
}

// --- A small round car ---
export function makeCar(color, opts = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  add(body, rbox(1.15, 0.5, 2.1, 0.22), mat(color, 0.45), 0, 0.5, 0);
  add(body, rbox(1.0, 0.5, 1.15, 0.22), mat(color, 0.45), 0, 0.92, -0.15);
  add(body, rbox(0.94, 0.36, 1.18, 0.15), mat(GLASS, 0.15), 0, 0.95, -0.15);
  if (opts.eyes !== false) eyes(body, 0, 0.98, 0.45, 0.9);
  for (const s of [-1, 1]) {
    lamp(body, s * 0.38, 0.56, 1.04);
    lamp(body, s * 0.4, 0.56, -1.04, 0xff8a7a, 0.06);
  }
  if (opts.roof) add(body, rbox(0.4, 0.18, 0.3, 0.06), mat(opts.roof, 0.4), 0, 1.24, -0.15);
  const wheels = [];
  for (const z of [-0.65, 0.65]) for (const s of [-1, 1]) wheels.push(wheel(root, 0.26, 0.2, s * 0.55, 0.26, z));
  return {
    root, wheels, body, circles: [{ x: 0, z: 0.45, r: 0.62 }, { x: 0, z: -0.45, r: 0.62 }],
    roll(dist) { for (const w of wheels) w.rotation.x += dist / 0.26; },
  };
}

// --- A little bus for the slow traffic ---
export function makeBus() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  add(body, rbox(1.5, 1.5, 4.2, 0.3), mat(0xffc94d, 0.45), 0, 1.15, 0);
  add(body, rbox(1.3, 0.35, 4.1, 0.1), mat(0xffffff, 0.5), 0, 0.55, 0);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) add(body, rbox(0.06, 0.55, 0.7, 0.05), mat(GLASS, 0.15), s * 0.75, 1.4, -1.35 + i * 0.85);
  add(body, rbox(1.3, 0.6, 0.06, 0.05), mat(GLASS, 0.15), 0, 1.4, 2.1);
  eyes(body, 0, 1.45, 2.13, 1.3);
  for (const s of [-1, 1]) lamp(body, s * 0.55, 0.7, 2.12);
  const wheels = [];
  for (const z of [-1.4, 1.4]) for (const s of [-1, 1]) wheels.push(wheel(root, 0.34, 0.24, s * 0.72, 0.34, z));
  return {
    root, wheels, body,
    circles: [{ x: 0, z: 1.4, r: 0.85 }, { x: 0, z: 0, r: 0.85 }, { x: 0, z: -1.4, r: 0.85 }],
    roll(dist) { for (const w of wheels) w.rotation.x += dist / 0.34; },
  };
}

// --- Digger: tracks, a turning cab, and an arm that scoops slowly ---
export function makeDigger() {
  const root = new THREE.Group();
  const yellow = mat(0xffc23d, 0.5), dark = mat(0x4a4d55, 0.85);
  for (const s of [-1, 1]) {
    add(root, rbox(0.62, 0.62, 2.7, 0.3), dark, s * 0.85, 0.32, 0);
    for (let i = 0; i < 4; i++) {
      const w = add(root, cyl(0.18, 0.18, 0.64, 12), mat(0x8a8d95, 0.6), s * 0.85, 0.32, -0.9 + i * 0.6);
      w.rotation.z = Math.PI / 2;
    }
  }
  const upper = new THREE.Group();
  upper.position.y = 0.72;
  root.add(upper);
  add(upper, cyl(0.6, 0.6, 0.18, 20), dark, 0, 0.05, 0);
  add(upper, rbox(2.0, 0.8, 2.1, 0.2), yellow, 0, 0.5, -0.2);
  add(upper, rbox(1.9, 0.5, 0.6, 0.2), yellow, 0, 0.45, -1.2);
  const cab = add(upper, rbox(0.95, 1.05, 1.0, 0.2), yellow, -0.48, 1.4, 0.25);
  add(upper, rbox(0.8, 0.6, 0.06, 0.04), mat(GLASS, 0.15), -0.48, 1.55, 0.76);
  add(upper, rbox(0.06, 0.55, 0.75, 0.04), mat(GLASS, 0.15), -0.97, 1.55, 0.25);
  eyes(upper, -0.48, 1.6, 0.8, 1);
  const beacon = lamp(upper, -0.48, 2.0, 0.25, 0xffa53d, 0.1);
  cab.castShadow = true;

  // Arm: boom -> stick -> bucket, each turning around x.
  const boom = new THREE.Group();
  boom.position.set(0.45, 0.85, 0.75);
  upper.add(boom);
  add(boom, rbox(0.32, 0.36, 2.4, 0.12), yellow, 0, 0, 1.1);
  const stick = new THREE.Group();
  stick.position.set(0, 0, 2.25);
  boom.add(stick);
  add(stick, rbox(0.26, 0.3, 1.7, 0.1), yellow, 0, 0, 0.8);
  const bucket = new THREE.Group();
  bucket.position.set(0, 0, 1.6);
  stick.add(bucket);
  add(bucket, rbox(0.75, 0.5, 0.55, 0.12), dark, 0, -0.12, 0.2);
  for (let i = 0; i < 4; i++) add(bucket, rbox(0.1, 0.12, 0.14, 0.03), mat(0xb9bcc4, 0.5), -0.27 + i * 0.18, -0.34, 0.45);

  return {
    root, circles: [{ x: 0, z: 0.7, r: 1.15 }, { x: 0, z: -0.7, r: 1.15 }],
    animate(t) {
      // A calm 10-second scoop: turn, dip, curl, lift, turn back.
      const p = (t % 10) / 10, s = Math.sin(p * Math.PI * 2);
      upper.rotation.y = Math.sin(t * 0.2) * 0.5;
      boom.rotation.x = -0.35 + s * 0.25;
      stick.rotation.x = 0.9 + Math.sin(p * Math.PI * 2 + 1.2) * 0.35;
      bucket.rotation.x = 0.6 + Math.sin(p * Math.PI * 2 + 2.2) * 0.5;
      beacon.material.emissiveIntensity = 0.4 + 0.5 * Math.max(0, Math.sin(t * 3));
    },
  };
}

// --- Dump truck: the bed tips up slowly now and then ---
export function makeDumpTruck() {
  const root = new THREE.Group();
  const orange = mat(0xff9a4a, 0.5), dark = mat(0x4a4d55, 0.85);
  add(root, rbox(1.6, 0.35, 4.2, 0.1), dark, 0, 0.75, -0.2);
  add(root, rbox(1.7, 1.25, 1.25, 0.25), orange, 0, 1.45, 1.35);
  add(root, rbox(1.5, 0.55, 0.06, 0.05), mat(GLASS, 0.15), 0, 1.7, 1.98);
  for (const s of [-1, 1]) add(root, rbox(0.06, 0.5, 0.8, 0.05), mat(GLASS, 0.15), s * 0.86, 1.7, 1.35);
  eyes(root, 0, 1.75, 2.0, 1.1);
  for (const s of [-1, 1]) lamp(root, s * 0.6, 1.05, 1.98);
  add(root, rbox(1.5, 0.18, 0.4, 0.06), mat(0xd8d8d8, 0.5), 0, 0.8, 2.05);

  const bed = new THREE.Group();
  bed.position.set(0, 1.0, -2.2);
  root.add(bed);
  const bedMat = mat(0xffc23d, 0.5);
  add(bed, rbox(1.8, 0.14, 2.8, 0.05), bedMat, 0, 0.05, 1.4);
  for (const s of [-1, 1]) add(bed, rbox(0.12, 0.8, 2.8, 0.05), bedMat, s * 0.84, 0.45, 1.4);
  add(bed, rbox(1.8, 1.0, 0.14, 0.05), bedMat, 0, 0.55, 2.75);
  add(bed, rbox(1.8, 0.7, 0.1, 0.05), bedMat, 0, 0.4, 0.05);
  const sand = add(bed, sphere(1), mat(0xe2c27d, 1), 0, 0.5, 1.5);
  sand.scale.set(0.72, 0.35, 1.2);

  const wheels = [];
  for (const z of [-1.7, -0.7, 1.35]) for (const s of [-1, 1]) wheels.push(wheel(root, 0.45, 0.32, s * 0.82, 0.45, z));
  return {
    root, circles: [{ x: 0, z: 1.3, r: 1.05 }, { x: 0, z: 0, r: 1.05 }, { x: 0, z: -1.4, r: 1.05 }],
    animate(t) {
      const p = t % 14;
      const up = p < 3 ? 0 : p < 6 ? (p - 3) / 3 : p < 8 ? 1 : p < 11 ? 1 - (p - 8) / 3 : 0;
      bed.rotation.x = -(up * up * (3 - 2 * up)) * 0.65;
    },
  };
}

function stripeTexture(a, b, n = 6) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = a;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = b;
  for (let i = -n; i < n * 2; i++) {
    g.beginPath();
    const w = 128 / n;
    g.moveTo(i * w, 0);
    g.lineTo(i * w + w / 2, 0);
    g.lineTo(i * w + w / 2 + 64, 128);
    g.lineTo(i * w + 64, 128);
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// --- Cement mixer: the striped drum keeps turning ---
export function makeMixer() {
  const root = new THREE.Group();
  const blue = mat(0x6fb3ff, 0.5), dark = mat(0x4a4d55, 0.85);
  add(root, rbox(1.5, 0.35, 4.4, 0.1), dark, 0, 0.75, -0.2);
  add(root, rbox(1.7, 1.25, 1.2, 0.25), blue, 0, 1.45, 1.45);
  add(root, rbox(1.5, 0.55, 0.06, 0.05), mat(GLASS, 0.15), 0, 1.7, 2.06);
  eyes(root, 0, 1.75, 2.08, 1.1);
  for (const s of [-1, 1]) lamp(root, s * 0.6, 1.05, 2.06);

  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    pts.push(new THREE.Vector2(0.25 + Math.sin(u * Math.PI) * 0.75 + (1 - u) * 0.15, (u - 0.5) * 3.0));
  }
  const drumGeo = new THREE.LatheGeometry(pts, 24);
  const drumMat = new THREE.MeshStandardMaterial({ map: stripeTexture('#ff8f8f', '#ffffff', 4), roughness: 0.5 });
  const drumPivot = new THREE.Group();
  drumPivot.position.set(0, 1.85, -0.9);
  drumPivot.rotation.x = Math.PI / 2 - 0.25;
  root.add(drumPivot);
  const drum = add(drumPivot, drumGeo, drumMat);
  add(root, rbox(0.3, 0.9, 0.3, 0.06), dark, 0, 1.3, 0.55);
  add(root, rbox(0.3, 0.5, 0.3, 0.06), dark, 0, 1.15, -2.3);
  const wheels = [];
  for (const z of [-1.7, -0.7, 1.45]) for (const s of [-1, 1]) wheels.push(wheel(root, 0.45, 0.32, s * 0.78, 0.45, z));
  return {
    root, circles: [{ x: 0, z: 1.3, r: 1.05 }, { x: 0, z: 0, r: 1.05 }, { x: 0, z: -1.4, r: 1.05 }],
    animate(t, dt) { drum.rotation.y += dt * 1.2; },
  };
}

function latticeTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.strokeStyle = '#ffffff';
  g.lineWidth = 7;
  g.strokeRect(3, 3, 58, 58);
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(64, 64);
  g.moveTo(64, 0); g.lineTo(0, 64);
  g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function latticeBox(w, h, d, color) {
  const geo = new THREE.BoxGeometry(w, h, d);
  // One lattice square per (short side) metre, on every face.
  const cell = Math.min(w, h, d);
  const uv = geo.attributes.uv, pos = geo.attributes.position, nrm = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const [a, b] = nx > 0.5 ? [z, y] : ny > 0.5 ? [x, z] : [x, y];
    uv.setXY(i, a / cell + 0.5, b / cell + 0.5);
  }
  const material = new THREE.MeshStandardMaterial({ color, alphaMap: latticeTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
  return { geo, material };
}

// --- Tower crane: the arm turns very slowly and a stack of toy blocks hangs from the hook ---
export function makeCrane(height = 13) {
  const root = new THREE.Group();
  const yellow = 0xffc23d;
  add(root, rbox(2.4, 0.6, 2.4, 0.1), mat(0x9aa0a8, 0.8), 0, 0.3, 0);
  const mast = latticeBox(0.9, height, 0.9, yellow);
  add(root, mast.geo, mast.material, 0, height / 2 + 0.6, 0);
  const top = new THREE.Group();
  top.position.y = height + 0.6;
  root.add(top);
  add(top, cyl(0.6, 0.6, 0.3, 16), mat(0x4a4d55, 0.8), 0, 0.15, 0);
  add(top, rbox(1.1, 1.0, 1.2, 0.15), mat(yellow, 0.5), 0.9, 0.0, 0.1);
  add(top, rbox(0.9, 0.5, 0.06, 0.05), mat(GLASS, 0.15), 0.9, 0.1, 0.72);
  const jib = latticeBox(0.7, 0.7, 11, yellow);
  add(top, jib.geo, jib.material, 0, 0.75, 4.3);
  const cjib = latticeBox(0.7, 0.6, 3.6, yellow);
  add(top, cjib.geo, cjib.material, 0, 0.7, -2.6);
  add(top, rbox(1.2, 1.0, 1.0, 0.1), mat(0x9aa0a8, 0.8), 0, 0.5, -3.9);
  add(top, cyl(0.12, 0.25, 2.2, 8), mat(yellow, 0.5), 0, 2.1, 0);
  const beacon = lamp(top, 0, 3.25, 0, 0xff6b5e, 0.14);
  const trolley = new THREE.Group();
  trolley.position.set(0, 0.35, 6.5);
  top.add(trolley);
  add(trolley, rbox(0.8, 0.25, 0.8, 0.05), mat(0x4a4d55, 0.8));
  const cable = add(trolley, cyl(0.025, 0.025, 1, 6), mat(0x2b2b33, 0.6));
  const hook = new THREE.Group();
  trolley.add(hook);
  add(hook, rbox(0.4, 0.3, 0.3, 0.06), mat(0xffc23d, 0.5));
  const blockColors = [0xff8f8f, 0x8fd18f, 0x8fbcff];
  blockColors.forEach((c, i) => add(hook, rbox(0.9, 0.5, 0.9, 0.1), mat(c, 0.5), (i - 1) * 0.12, -0.8 - i * 0.52, 0));
  return {
    root, circles: [{ x: 0, z: 0, r: 1.5, tall: true }],
    animate(t) {
      top.rotation.y = Math.sin(t * 0.05) * 1.4 + 0.4;
      trolley.position.z = 6.5 + Math.sin(t * 0.13) * 2.2;
      const drop = 4.5 + Math.sin(t * 0.21) * 1.6;
      hook.position.y = -drop;
      hook.rotation.y = Math.sin(t * 0.4) * 0.3;
      cable.scale.y = drop;
      cable.position.y = -drop / 2;
      beacon.material.emissiveIntensity = 0.3 + 0.7 * Math.max(0, Math.sin(t * 2));
    },
  };
}

// --- An orange traffic cone (pushable) ---
export function makeCone() {
  const root = new THREE.Group();
  add(root, rbox(0.5, 0.06, 0.5, 0.03), mat(0xff8a4a, 0.6), 0, 0.03, 0);
  add(root, cyl(0.04, 0.18, 0.62, 14), mat(0xff8a4a, 0.55), 0, 0.37, 0);
  add(root, cyl(0.1, 0.13, 0.12, 14), mat(0xffffff, 0.5), 0, 0.4, 0);
  return { root, circles: [{ x: 0, z: 0, r: 0.24 }] };
}
