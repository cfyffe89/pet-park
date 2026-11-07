// The city: roads, buildings, construction vehicles, slow friendly traffic and ramps.
// It sits far away from the park (at x = 400) and is reached through a gate at the park edge.
// Walking into the city gate's glowing doorway brings the animal back to the park.
import * as THREE from 'three';
import { heightAt, colliders, areas, pathDist, POND } from './world.js';
import { mulberry32, smoothstep, wrapAngle } from './math.js';
import { makeCar, makeBus, makeDigger, makeDumpTruck, makeMixer, makeCrane, makeCone, add, rbox, mat } from './vehicles.js';

export const CITY = { x: 400, z: 0 };
const BASE = 0.05;     // the city floor, a little above the pond level so the animal never swims here
const WALK = 34;       // the animal stays inside |x|, |z| <= WALK (city space)
const LOOP = 24;       // centre line of the loop road
const ROAD_W = 7;
const LANE = 25.75;    // the traffic drives in the outer lane
const CORNER = 7.5;

const rng = mulberry32(4242);
const rand = (a, b) => a + (b - a) * rng();
const ease = (s) => s * s * (3 - 2 * s);

// --- Ramps: smooth humps to run up and hop off. Heights match the meshes exactly. ---
// rot: the direction the ramp runs (same convention as the animal heading).
const RAMPS = [
  // Ramp park (north-west square)
  { x: -8, z: 9, rot: 0, up: 2.4, top: 1.2, down: 2.4, w: 2.6, h: 0.55, color: '#ffd45c' },
  { x: -15, z: 10, rot: 0, up: 3.6, top: 1.6, down: 3.6, w: 3.2, h: 1.1, color: '#7cc0ff' },
  { x: -14, z: 17.5, rot: Math.PI / 2, up: 0.9, top: 0.3, down: 0.9, w: 2.4, h: 0.32, color: '#ff9fbf' },
  { x: -10.6, z: 17.5, rot: Math.PI / 2, up: 0.9, top: 0.3, down: 0.9, w: 2.4, h: 0.32, color: '#ff9fbf' },
  { x: -7.2, z: 17.5, rot: Math.PI / 2, up: 0.9, top: 0.3, down: 0.9, w: 2.4, h: 0.32, color: '#ff9fbf' },
  // Plaza (south-east square): one big ramp
  { x: 11.5, z: -11.5, rot: Math.PI / 4, up: 4.2, top: 2.0, down: 4.2, w: 3.6, h: 1.45, color: '#9be08f' },
  { x: 6.5, z: -16.5, rot: -Math.PI / 4, up: 1.8, top: 0.8, down: 1.8, w: 2.4, h: 0.45, color: '#ffd45c' },
];
for (const r of RAMPS) {
  r.s = Math.sin(r.rot);
  r.c = Math.cos(r.rot);
  r.len = r.up + r.top + r.down;
}
// A soft sand pile in the construction site.
const MOUND = { x: 13.5, z: 13, r: 3.2, h: 1.1 };

function rampHeight(r, x, z) {
  const dx = x - r.x, dz = z - r.z;
  const u = dx * r.s + dz * r.c + r.len / 2, v = Math.abs(dx * r.c - dz * r.s), hw = r.w / 2;
  if (v >= hw || u <= 0 || u >= r.len) return 0;
  const p = u < r.up ? ease(u / r.up) : u < r.up + r.top ? 1 : ease((r.len - u) / r.down);
  return r.h * p * smoothstep(hw, hw - 0.45, v);
}

function moundHeight(x, z) {
  const d = Math.hypot(x - MOUND.x, z - MOUND.z) / MOUND.r;
  if (d >= 1) return 0;
  const c = Math.cos(d * Math.PI * 0.5);
  return MOUND.h * c * c;
}

// Ground height in city space.
function cityHeight(x, z) {
  let h = moundHeight(x, z);
  for (const r of RAMPS) {
    if (Math.abs(x - r.x) > r.len && Math.abs(z - r.z) > r.len) continue;
    const rh = rampHeight(r, x, z);
    if (rh > h) h = rh;
  }
  return BASE + h;
}

// --- Canvas pictures ---
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function groundTexture() {
  const S = 2048, k = S / 100;
  return canvasTex(S, S, (g) => {
    const X = (x) => (x + 50) * k;
    const rect = (x0, z0, x1, z1, c) => {
      g.fillStyle = c;
      g.fillRect(X(x0), X(z0), (x1 - x0) * k, (z1 - z0) * k);
    };
    rect(-50, -50, 50, 50, '#ddd8ce'); // pavement
    // Grass strip where the trees and lamps stand
    g.strokeStyle = '#a9d47a';
    g.lineWidth = 3.4 * k;
    g.beginPath();
    g.roundRect(X(-31.6), X(-31.6), 63.2 * k, 63.2 * k, 9 * k);
    g.stroke();
    // Squares inside the loop
    rect(3, 3, 20.5, 20.5, '#dcc093');       // construction site: dirt
    rect(-20.5, 3, -3, 20.5, '#c3d3e4');     // ramp park: soft blue
    rect(-20.5, -20.5, -3, -3, '#b3b8c0');   // parking
    rect(3, -20.5, 20.5, -3, '#ead9c0');     // plaza
    // Dirt speckles
    g.fillStyle = '#c9ab7b';
    for (let i = 0; i < 400; i++) g.fillRect(X(rand(3.2, 20.3)), X(rand(3.2, 20.3)), rand(3, 9), rand(3, 9));
    // Plaza tiles
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 2;
    for (let i = 3; i <= 20.5; i += 1.5) {
      g.beginPath(); g.moveTo(X(i), X(-20.5)); g.lineTo(X(i), X(-3)); g.stroke();
      g.beginPath(); g.moveTo(X(3), X(-i)); g.lineTo(X(20.5), X(-i)); g.stroke();
    }
    // Parking bays
    g.strokeStyle = '#ffffff';
    g.lineWidth = 0.14 * k;
    for (const zr of [[-11, -5.5], [-18, -12.5]]) {
      for (let x = -19.5; x <= -4; x += 3.5) {
        g.beginPath(); g.moveTo(X(x), X(zr[0])); g.lineTo(X(x), X(zr[1])); g.stroke();
      }
    }
    // Roads
    g.strokeStyle = '#8f949e';
    g.lineWidth = ROAD_W * k;
    g.beginPath();
    g.roundRect(X(-LOOP), X(-LOOP), LOOP * 2 * k, LOOP * 2 * k, CORNER * k);
    g.stroke();
    rect(-3, -LOOP, 3, LOOP, '#8f949e');
    rect(-LOOP, -3, LOOP, 3, '#8f949e');
    // Dashed middle lines
    g.strokeStyle = '#fff4c2';
    g.lineWidth = 0.18 * k;
    g.setLineDash([1.6 * k, 1.4 * k]);
    g.beginPath();
    g.roundRect(X(-LOOP), X(-LOOP), LOOP * 2 * k, LOOP * 2 * k, CORNER * k);
    g.stroke();
    g.beginPath(); g.moveTo(X(0), X(-20.5)); g.lineTo(X(0), X(20.5)); g.stroke();
    g.beginPath(); g.moveTo(X(-20.5), X(0)); g.lineTo(X(20.5), X(0)); g.stroke();
    g.setLineDash([]);
    // Zebra crossings
    g.fillStyle = '#ffffff';
    const zebraX = (cx, z0, z1) => { for (let x = cx - 2.6; x < cx + 2.6; x += 0.9) g.fillRect(X(x), X(z0), 0.5 * k, (z1 - z0) * k); };
    const zebraZ = (cz, x0, x1) => { for (let z = cz - 2.6; z < cz + 2.6; z += 0.9) g.fillRect(X(x0), X(z), (x1 - x0) * k, 0.5 * k); };
    zebraX(0, -27.3, -20.7); zebraX(0, 20.7, 27.3);
    zebraZ(0, -27.3, -20.7); zebraZ(0, 20.7, 27.3);
    // Soft grass rim around everything
    g.strokeStyle = '#a9d47a';
    g.lineWidth = 2 * k;
    g.strokeRect(X(-36.5), X(-36.5), 73 * k, 73 * k);
  });
}

const windowTex = new Map();
function wallTexture(wall) {
  if (windowTex.has(wall)) return windowTex.get(wall);
  const t = canvasTex(128, 128, (g) => {
    g.fillStyle = wall;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#ffffff';
    g.fillRect(30, 26, 68, 66);
    g.fillStyle = '#bfe3f4';
    g.fillRect(36, 32, 56, 54);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillRect(40, 36, 14, 22);
    g.fillStyle = '#ffffff';
    g.fillRect(62, 32, 4, 54);
    g.fillRect(26, 92, 76, 7);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  windowTex.set(wall, t);
  return t;
}

function rampTexture(color) {
  const t = canvasTex(64, 128, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 64, 128);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let y = -16; y < 128; y += 32) {
      g.beginPath();
      g.moveTo(0, y + 16); g.lineTo(32, y); g.lineTo(64, y + 16);
      g.lineTo(64, y + 26); g.lineTo(32, y + 10); g.lineTo(0, y + 26);
      g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Round picture signs over the gates: a car and houses (to the city), a tree and sun (to the park).
function signTexture(toCity) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
    g.fillStyle = toCity ? '#cfe9ff' : '#d8f2c4';
    g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.fill();
    g.save();
    g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.clip();
    if (toCity) {
      g.fillStyle = '#ffb3a7'; g.fillRect(40, 70, 50, 110);
      g.fillStyle = '#ffd77a'; g.fillRect(96, 50, 56, 130);
      g.fillStyle = '#a9c8ff'; g.fillRect(158, 90, 52, 90);
      g.fillStyle = '#ffffff';
      for (const [x, y] of [[50, 84], [70, 84], [50, 110], [70, 110], [106, 64], [130, 64], [106, 92], [130, 92], [168, 104], [190, 104]]) g.fillRect(x, y, 12, 14);
      g.fillStyle = '#8f949e'; g.fillRect(0, 178, 256, 80);
      // Car
      g.fillStyle = '#ff7b6b';
      g.beginPath(); g.roundRect(70, 150, 116, 40, 16); g.fill();
      g.beginPath(); g.roundRect(96, 126, 64, 34, 14); g.fill();
      g.fillStyle = '#bfe6f5'; g.beginPath(); g.roundRect(104, 132, 48, 22, 8); g.fill();
      g.fillStyle = '#3a3d44';
      g.beginPath(); g.arc(98, 192, 14, 0, Math.PI * 2); g.arc(158, 192, 14, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = '#ffe066'; g.beginPath(); g.arc(186, 72, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8fcf6a'; g.fillRect(0, 176, 256, 80);
      g.fillStyle = '#8a6446'; g.fillRect(104, 120, 22, 70);
      g.fillStyle = '#5e9e48';
      g.beginPath(); g.arc(115, 104, 46, 0, Math.PI * 2); g.arc(82, 126, 30, 0, Math.PI * 2); g.arc(150, 126, 30, 0, Math.PI * 2); g.fill();
      for (const [x, c] of [[50, '#ff9ab8'], [180, '#ffe066'], [206, '#c9a2ff']]) {
        g.fillStyle = c; g.beginPath(); g.arc(x, 196, 10, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
  });
}

function glowTexture() {
  return canvasTex(64, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 64, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 128);
  });
}

// --- A gate with a glowing doorway. Faces +z. ---
function makeGate(toCity) {
  const root = new THREE.Group();
  const postMat = mat(toCity ? 0xff8f8f : 0x7fc77a, 0.5);
  for (const s of [-1, 1]) {
    add(root, rbox(0.4, 3.0, 0.4, 0.12), postMat, s * 1.5, 1.4, 0);
    add(root, rbox(0.6, 0.3, 0.6, 0.1), mat(0xffffff, 0.5), s * 1.5, 0.15, 0);
  }
  const arch = add(root, new THREE.TorusGeometry(1.5, 0.2, 10, 24, Math.PI), mat(toCity ? 0xffd45c : 0xffd45c, 0.5), 0, 2.9, 0);
  arch.castShadow = true;
  const sign = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), new THREE.MeshBasicMaterial({ map: signTexture(toCity), side: THREE.DoubleSide }));
  sign.position.set(0, 4.15, 0.05);
  root.add(sign);
  add(root, rbox(1.7, 1.7, 0.1, 0.05), mat(0xffffff, 0.5), 0, 4.15, -0.03).scale.set(0.95, 0.95, 1);
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTexture(), color: toCity ? 0xbfe4ff : 0xd8f7c4, transparent: true, opacity: 0.6,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.9), glowMat);
  glow.position.y = 1.45;
  root.add(glow);
  // Sparkles drifting up through the doorway
  const sparkGeo = new THREE.OctahedronGeometry(0.06, 0);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sparks = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(sparkGeo, sparkMat);
    root.add(m);
    sparks.push({ m, x: rand(-1.1, 1.1), seed: rand(0, 10), z: rand(-0.2, 0.2) });
  }
  return {
    root,
    animate(t) {
      glowMat.opacity = 0.45 + 0.2 * Math.sin(t * 2);
      for (const s of sparks) {
        const p = (t * 0.35 + s.seed) % 1;
        s.m.position.set(s.x + Math.sin(t + s.seed) * 0.1, 0.2 + p * 2.6, s.z);
        s.m.scale.setScalar(Math.sin(p * Math.PI));
        s.m.rotation.y = t * 2 + s.seed;
      }
    },
  };
}

// --- Buildings ---
const WALLS = ['#ffd2c4', '#ffe9a8', '#cfe3ff', '#d9f0c8', '#f2d4f0', '#ffe0bf', '#d4ece9'];
function makeBuilding(w, h, d, wall, roofColor) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv, pos = geo.attributes.position, nrm = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    const x = pos.getX(i), y = pos.getY(i) + h / 2, z = pos.getZ(i);
    const [a, b] = nx > 0.5 ? [z, y] : ny > 0.5 ? [x, z] : [x, y];
    uv.setXY(i, a / 3, b / 3);
  }
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(wall), roughness: 0.85 });
  const roof = mat(roofColor, 0.9);
  const m = new THREE.Mesh(geo, [wallMat, wallMat, roof, roof, wallMat, wallMat]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class City {
  constructor(scene, sound, keep = []) {
    this.scene = scene;
    this.sound = sound;
    this.keep = new Set(keep);
    this.inCity = false;
    this.root = new THREE.Group();
    this.root.position.set(CITY.x, 0, CITY.z);
    this.root.visible = false;
    scene.add(this.root);
    this.statics = [];      // circles (world space) shared with the park colliders list
    this.boxes = [];        // building boxes (world space)
    this.animated = [];
    this.pushables = [];
    this.traffic = [];
    this.fade = 0;
    this.fadeDir = 0;
    this.cool = 0;
    this.beepCool = 0;
    this.bumpCool = 0;
    this.lastDt = 1 / 60;
    this.hidden = [];

    this.buildGround();
    this.buildRamps();
    this.buildBuildings();
    this.buildStreet();
    this.buildSite();
    this.buildParking();
    this.buildTraffic();
    this.buildGates();
    this.makeOverlay();

    const self = this;
    areas.push({
      contains: (x, z) => Math.abs(x - CITY.x) < 150 && Math.abs(z - CITY.z) < 150,
      heightAt: (x, z) => cityHeight(x - CITY.x, z - CITY.z),
      collide: (pos, r) => self.collide(pos, r),
      clamp: (pos, margin) => self.clamp(pos, margin),
    });
  }

  // A circle the animal can not pass, in city space.
  addStatic(x, z, r, tall = false) {
    const c = { x: x + CITY.x, z: z + CITY.z, r, tall };
    this.statics.push(c);
    colliders.push(c);
  }

  // Place a model in city space and add its circles.
  place(model, x, z, rot, animated = true) {
    model.root.position.set(x, cityHeight(x, z), z);
    model.root.rotation.y = rot;
    this.root.add(model.root);
    const s = Math.sin(rot), c = Math.cos(rot);
    for (const k of model.circles || []) this.addStatic(x + k.x * c + k.z * s, z - k.x * s + k.z * c, k.r, k.tall);
    if (animated && model.animate) this.animated.push(model);
    return model;
  }

  buildGround() {
    const g = new THREE.PlaneGeometry(100, 100);
    g.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }));
    ground.position.y = BASE;
    ground.receiveShadow = true;
    this.root.add(ground);
    const far = new THREE.Mesh(new THREE.PlaneGeometry(500, 500).rotateX(-Math.PI / 2), mat(0xb9d39a, 1));
    far.position.y = BASE - 0.15;
    this.root.add(far);
  }

  buildRamps() {
    for (const r of RAMPS) {
      const geo = new THREE.PlaneGeometry(r.w, r.len, 8, Math.ceil(r.len * 4));
      geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const lx = p.getX(i), lz = p.getZ(i);
        // Back to city space to share the exact height function
        const x = r.x + lx * r.c + lz * r.s, z = r.z - lx * r.s + lz * r.c;
        p.setY(i, rampHeight(r, x, z) + 0.012);
        uv.setXY(i, (lx / r.w + 0.5), lz / 1.2);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: rampTexture(r.color), roughness: 0.7 }));
      m.position.set(r.x, BASE, r.z);
      m.rotation.y = r.rot;
      m.castShadow = true;
      m.receiveShadow = true;
      this.root.add(m);
    }
    // Sand pile
    const mg = new THREE.RingGeometry(0.001, MOUND.r, 32, 10);
    mg.rotateX(-Math.PI / 2);
    const p = mg.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, moundHeight(p.getX(i) + MOUND.x, p.getZ(i) + MOUND.z) + 0.01);
    mg.computeVertexNormals();
    const mound = new THREE.Mesh(mg, mat(0xe8c886, 1, { flatShading: true }));
    mound.position.set(MOUND.x, BASE, MOUND.z);
    mound.receiveShadow = true;
    mound.castShadow = true;
    this.root.add(mound);
  }

  buildBuildings() {
    const side = (along, fixed, dir, from, to) => {
      for (let a = from; a < to - 4;) {
        const w = Math.min(rand(7, 12), to - a), d = 8, h = rand(6, 16);
        const wall = WALLS[Math.floor(rng() * WALLS.length)];
        const b = makeBuilding(along === 'x' ? w : d, h, along === 'x' ? d : w, wall, rng() < 0.5 ? 0xb8a99a : 0x9fb0c0);
        const ca = a + w / 2, cf = fixed + dir * d / 2;
        const x = along === 'x' ? ca : cf, z = along === 'x' ? cf : ca;
        b.position.set(x, BASE + h / 2, z);
        this.root.add(b);
        // A door and a striped awning facing the street
        const fx = along === 'x' ? 0 : -dir, fz = along === 'x' ? -dir : 0;
        const door = add(this.root, rbox(1.3, 2.2, 0.2, 0.08), mat(0x9a6a4a, 0.7), x + fx * (d / 2), BASE + 1.1, z + fz * (d / 2));
        door.rotation.y = along === 'x' ? 0 : Math.PI / 2;
        if (rng() < 0.6) {
          const aw = add(this.root, rbox(Math.min(w - 1, 5), 0.18, 1.3, 0.08), mat(['#ff8f8f', '#7cc0ff', '#9be08f', '#ffd45c'][Math.floor(rng() * 4)], 0.6),
            x + fx * (d / 2 + 0.6) + (along === 'x' ? 2.5 : 0), BASE + 2.9, z + fz * (d / 2 + 0.6) + (along === 'x' ? 0 : 2.5));
          aw.rotation.y = along === 'x' ? 0 : Math.PI / 2;
        }
        if (rng() < 0.5) add(this.root, rbox(1.4, 1.2, 1.4, 0.2), mat(0xe9e4da, 0.7), x + rand(-1, 1), BASE + h + 0.6, z + rand(-1, 1));
        this.boxes.push({ x0: x - (along === 'x' ? w : d) / 2 + CITY.x, x1: x + (along === 'x' ? w : d) / 2 + CITY.x, z0: z - (along === 'x' ? d : w) / 2 + CITY.z, z1: z + (along === 'x' ? d : w) / 2 + CITY.z });
        a += w + 0.6;
      }
    };
    side('x', -41.5, -1, -50, 50);
    side('x', 41.5, 1, -50, 50);
    side('z', -41.5, -1, -40.5, 40.5);
    side('z', 41.5, 1, -40.5, 40.5);
  }

  buildStreet() {
    // Trees on the grass strip, in a ring around the loop road
    const trees = [];
    for (let a = -27; a <= 27; a += 9) {
      if (Math.abs(a) < 4) continue;
      trees.push([a, 31.6], [31.6, a]);
      if (a > -27) trees.push([a, -31.6], [-31.6, a]); // keep the gate corner open
    }
    // Plaza trees
    trees.push([17.5, -5.5], [5.5, -6], [17, -18]);
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.32, 2.6, 7).translate(0, 1.3, 0);
    const blobGeo = new THREE.IcosahedronGeometry(1, 1);
    const trunks = new THREE.InstancedMesh(trunkGeo, mat(0x8a6446, 0.9), trees.length);
    const blobs = new THREE.InstancedMesh(blobGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }), trees.length * 2);
    const d = new THREE.Object3D(), col = new THREE.Color();
    const greens = [0x5e9e48, 0x6fae4f, 0x86bb57, 0x4f8f45];
    trees.forEach(([x, z], i) => {
      const s = rand(1.0, 1.25);
      d.position.set(x, BASE - 0.1, z); d.rotation.set(0, rand(0, 6), 0); d.scale.set(s, s * 1.4, s); d.updateMatrix();
      trunks.setMatrixAt(i, d.matrix);
      for (let k = 0; k < 2; k++) {
        d.position.set(x + (k ? s * 0.8 : 0), BASE + s * (k ? 3.8 : 4.2), z + (k ? s * 0.3 : 0));
        d.rotation.set(rand(0, 1), rand(0, 6), rand(0, 1));
        d.scale.set(s * (k ? 1.2 : 1.8), s * (k ? 0.95 : 1.3), s * (k ? 1.2 : 1.8));
        d.updateMatrix();
        blobs.setMatrixAt(i * 2 + k, d.matrix);
        blobs.setColorAt(i * 2 + k, col.setHex(greens[(i + k) % greens.length]));
      }
      this.addStatic(x, z, 0.32 * s, true);
    });
    for (const m of [trunks, blobs]) { m.castShadow = true; m.receiveShadow = true; this.root.add(m); }

    // Street lamps on the sidewalk
    const lampPost = (x, z) => {
      add(this.root, new THREE.CylinderGeometry(0.07, 0.09, 3.4, 8), mat(0x5b6a7a, 0.6), x, BASE + 1.7, z);
      add(this.root, new THREE.SphereGeometry(0.26, 12, 8), mat(0xfff4cc, 0.4, { emissive: 0xfff0c0, emissiveIntensity: 0.4 }), x, BASE + 3.5, z);
      this.addStatic(x, z, 0.12);
    };
    for (const a of [-13.5, 13.5]) { lampPost(a, -29.2); lampPost(a, 29.2); lampPost(-29.2, a); lampPost(29.2, a); }

    // Traffic lights at the crossroads in the middle (they change colour slowly, just for fun)
    for (const [x, z] of [[3.6, 3.6], [-3.6, -3.6]]) {
      const g = new THREE.Group();
      g.position.set(x, BASE, z);
      add(g, new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), mat(0x5b6a7a, 0.6), 0, 1.3, 0);
      add(g, rbox(0.36, 0.95, 0.3, 0.08), mat(0x3a3d44, 0.6), 0, 2.9, 0);
      const lights = [0xff6b5e, 0xffd45c, 0x7fdc7a].map((c, i) => {
        const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0, roughness: 0.4 });
        for (const f of [-1, 1]) add(g, new THREE.SphereGeometry(0.1, 10, 8), m, 0, 3.2 - i * 0.3, f * 0.15);
        return m;
      });
      this.root.add(g);
      this.addStatic(x, z, 0.12);
      this.animated.push({ animate: (t) => { const k = Math.floor(t / 4) % 3; lights.forEach((m, i) => (m.emissiveIntensity = i === k ? 0.9 : 0.05)); } });
    }

    // A low hedge all around the edge, so the end of the city is easy to read
    const hedge = [];
    for (let a = -35; a < 35; a += 1.75) hedge.push([a, -35.2, 0], [a, 35.2, 0], [-35.2, a, 1], [35.2, a, 1]);
    const hm = new THREE.InstancedMesh(rbox(1.9, 0.9, 0.9, 0.35), mat(0x6fae4f, 0.9), hedge.length);
    hedge.forEach(([x, z, r], i) => {
      d.position.set(x, BASE + 0.4, z); d.rotation.set(0, r ? Math.PI / 2 : 0, 0); d.scale.setScalar(1); d.updateMatrix();
      hm.setMatrixAt(i, d.matrix);
    });
    hm.castShadow = true;
    hm.receiveShadow = true;
    this.root.add(hm);

    // Plaza benches
    for (const [x, z, r] of [[16, -8.5, -Math.PI / 2], [8.5, -5, Math.PI]]) {
      const b = new THREE.Group();
      b.position.set(x, BASE, z);
      b.rotation.y = r;
      for (let i = 0; i < 3; i++) add(b, rbox(1.8, 0.06, 0.15, 0.02), mat(0xa8774f, 0.85), 0, 0.45, -0.18 + i * 0.18);
      add(b, rbox(1.8, 0.3, 0.06, 0.02), mat(0xa8774f, 0.85), 0, 0.75, -0.3);
      for (const s of [-0.8, 0.8]) add(b, rbox(0.06, 0.45, 0.5, 0.02), mat(0x4a4f55, 0.6), s, 0.22, 0);
      this.root.add(b);
      this.addStatic(x, z, 0.95);
    }
  }

  buildSite() {
    this.place(makeCrane(13), 18, 18.2, -Math.PI * 0.75);
    this.place(makeDigger(), 8.5, 15, Math.PI / 2);
    this.place(makeDumpTruck(), 13.5, 6.8, Math.PI / 2);
    this.place(makeMixer(), 6.2, 7.5, 0.15);
    // A striped barrier and some cones (the cones can be pushed and hopped over)
    for (const [x, z, r] of [[19.5, 9.5, 0], [10.5, 19.6, Math.PI / 2]]) {
      const g = new THREE.Group();
      g.position.set(x, BASE, z);
      g.rotation.y = r;
      add(g, rbox(0.12, 0.9, 0.12, 0.04), mat(0xffffff, 0.6), 0, 0.45, -1.1);
      add(g, rbox(0.12, 0.9, 0.12, 0.04), mat(0xffffff, 0.6), 0, 0.45, 1.1);
      add(g, rbox(0.1, 0.3, 2.4, 0.06), mat(0xff8f8f, 0.6), 0, 0.8, 0);
      this.root.add(g);
      const s = Math.sin(r), c = Math.cos(r);
      for (const k of [-0.8, 0, 0.8]) this.addStatic(x + k * s, z + k * c, 0.35);
    }
    for (const [x, z] of [[4, 4], [4, 11], [4, 19.5], [11, 4], [19.5, 4], [-5, 5], [-5, 7], [-5, 9], [-18.5, 5]]) this.addPushable(makeCone(), x, z, 0, 'cone');
  }

  buildParking() {
    const colors = [0xff8f8f, 0x7cc0ff, 0x9be08f, 0xffd45c, 0xc9a2ff, 0xffb36b];
    let i = 0;
    for (const x of [-17.75, -14.25, -10.75]) this.addPushable(makeCar(colors[i++ % 6]), x, -8.2, Math.PI, 'car');
    for (const x of [-15.75, -8.75, -5.25]) this.addPushable(makeCar(colors[i++ % 6]), x, -15.3, 0, 'car');
  }

  addPushable(model, x, z, rot, kind) {
    model.root.position.set(x, cityHeight(x, z), z);
    model.root.rotation.y = rot;
    this.root.add(model.root);
    const car = kind === 'car';
    this.pushables.push({
      model, kind, x: x + CITY.x, z: z + CITY.z, vx: 0, vz: 0, yaw: rot, spin: 0, tip: 0, tipDir: 0,
      r: car ? 0.95 : 0.26, mass: car ? 1.6 : 0.12, height: car ? 1.3 : 0.62,
    });
  }

  buildTraffic() {
    // The loop: a rounded square, driven anticlockwise (seen from above) in the outer lane.
    const half = LANE, rc = CORNER + (LANE - LOOP), straight = 2 * (half - rc);
    this.loopLen = 4 * straight + 2 * Math.PI * rc;
    this.loopAt = (s) => {
      s = ((s % this.loopLen) + this.loopLen) % this.loopLen;
      const seg = straight + (Math.PI / 2) * rc;
      const i = Math.floor(s / seg), u = s - i * seg;
      // Side i starts at the corner centre (cx, cz) and runs in direction (dx, dz)
      const sides = [
        [half, -half + rc, 0, 1],   // east side, going +z
        [half - rc, half, -1, 0],   // north side, going -x
        [-half, half - rc, 0, -1],  // west side, going -z
        [-half + rc, -half, 1, 0],  // south side, going +x
      ];
      const [sx, sz, dx, dz] = sides[i];
      if (u < straight) return { x: sx + dx * u, z: sz + dz * u, h: Math.atan2(dx, dz) };
      // Turn left around the corner: n points outward from the corner centre at the start of the turn.
      const a = (u - straight) / rc, ca = Math.cos(a), sa = Math.sin(a);
      const nx = dz, nz = -dx;
      const cx = sx + dx * straight - nx * rc, cz = sz + dz * straight - nz * rc;
      return { x: cx + rc * (nx * ca + dx * sa), z: cz + rc * (nz * ca + dz * sa), h: Math.atan2(dx * ca - nx * sa, dz * ca - nz * sa) };
    };
    const addVehicle = (model, s, speed) => {
      this.root.add(model.root);
      const v = { model, s, speed: 0, max: speed, circles: model.circles.map((c) => ({ ...c, wx: 0, wz: 0 })), wait: 0, x: 0, z: 0, h: 0 };
      this.traffic.push(v);
      this.placeTraffic(v);
    };
    addVehicle(makeBus(), 10, 2.0);
    addVehicle(makeCar(0x7cc0ff, { roof: 0xffffff }), this.loopLen * 0.38, 2.4);
    addVehicle(makeCar(0xff8f8f), this.loopLen * 0.7, 2.4);
  }

  placeTraffic(v) {
    const p = this.loopAt(v.s);
    v.x = p.x + CITY.x;
    v.z = p.z + CITY.z;
    v.h = p.h;
    v.model.root.position.set(p.x, BASE, p.z);
    v.model.root.rotation.y = p.h;
    const s = Math.sin(p.h), c = Math.cos(p.h);
    for (const k of v.circles) {
      k.wx = v.x + k.x * c + k.z * s;
      k.wz = v.z - k.x * s + k.z * c;
    }
  }

  buildGates() {
    // City side: in the open south-west corner, facing the middle of the city.
    // The animal arrives about one camera length in front of a gate, so the camera never starts behind it.
    const AHEAD = 6.3;
    const cg = -31.2, crot = Math.PI / 4, cs = Math.sin(crot), cc = Math.cos(crot);
    this.cityGate = makeGate(false);
    this.cityGate.root.position.set(cg, BASE, cg);
    this.cityGate.root.rotation.y = crot;
    this.root.add(this.cityGate.root);
    for (const k of [-1.5, 1.5]) this.addStatic(cg + k * cc, cg - k * cs, 0.3);
    this.cityGateWorld = { x: CITY.x + cg, z: CITY.z + cg, rot: crot };
    this.cityArrive = { x: CITY.x + cg + cs * AHEAD, z: CITY.z + cg + cc * AHEAD, h: crot };

    // Park side: at the park edge where there is a clear way from the path.
    const a = this.pickGateAngle();
    const R = 47;
    const gx = Math.cos(a) * R, gz = Math.sin(a) * R, rot = Math.atan2(-gx, -gz);
    this.parkGate = makeGate(true);
    this.parkGate.root.position.set(gx, heightAt(gx, gz) - 0.05, gz);
    this.parkGate.root.rotation.y = rot;
    this.scene.add(this.parkGate.root);
    const s = Math.sin(rot), c = Math.cos(rot);
    for (const k of [-1.5, 1.5]) colliders.push({ x: gx + k * c, z: gz - k * s, r: 0.3 });
    this.parkGateWorld = { x: gx, z: gz, rot };
    this.parkArrive = { x: gx + s * AHEAD, z: gz + c * AHEAD, h: rot };
    this.gateAngle = a;
    this.buildSpur(a, R);
  }

  // Find the edge angle with the most room around the way from the round path to the edge.
  pickGateAngle() {
    let best = 0, bestScore = -1e9;
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * Math.PI * 2;
      let clear = 1e9;
      const pr = 32 + 3 * Math.sin(3 * a + 0.6) + 1.5 * Math.sin(5 * a);
      for (let r = pr + 1; r <= 49; r += 0.8) {
        for (const lat of [-1.8, 0, 1.8]) {
          const x = Math.cos(a) * r - Math.sin(a) * lat, z = Math.sin(a) * r + Math.cos(a) * lat;
          for (const c of colliders) clear = Math.min(clear, Math.hypot(x - c.x, z - c.z) - c.r);
          if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 3) clear = -1;
        }
      }
      // Prefer the side the animal looks at when the game starts (toward the pond, a = -0.75).
      const score = Math.min(clear, 2.5) - Math.abs(wrapAngle(a + 0.75)) * 0.25;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  // A sandy path from the round park path to the gate.
  buildSpur(a, R) {
    const pr = 32 + 3 * Math.sin(3 * a + 0.6) + 1.5 * Math.sin(5 * a);
    const r0 = pr - 0.5, r1 = R + 0.8, n = Math.ceil((r1 - r0) * 2);
    const pos = [], uvs = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const r = r0 + ((r1 - r0) * i) / n;
      for (const lat of [-1.3, 1.3]) {
        const x = Math.cos(a) * r - Math.sin(a) * lat, z = Math.sin(a) * r + Math.cos(a) * lat;
        pos.push(x, heightAt(x, z) + 0.035, z);
        uvs.push(lat < 0 ? 0 : 1, i / n);
      }
      if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const tex = canvasTex(64, 64, (c) => {
      const gr = c.createLinearGradient(0, 0, 64, 0);
      gr.addColorStop(0, 'rgba(220,203,155,0)');
      gr.addColorStop(0.25, 'rgba(220,203,155,1)');
      gr.addColorStop(0.75, 'rgba(220,203,155,1)');
      gr.addColorStop(1, 'rgba(220,203,155,0)');
      c.fillStyle = gr;
      c.fillRect(0, 0, 64, 64);
    });
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.receiveShadow = true;
    this.scene.add(m);
  }

  makeOverlay() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:#fffaf0;opacity:0;pointer-events:none;z-index:5';
    document.body.appendChild(el);
    this.overlay = el;
  }

  // --- Area hooks used by world.js ---
  clamp(pos, margin) {
    const m = WALK - margin;
    const lx = pos.x - CITY.x, lz = pos.z - CITY.z;
    const cx = Math.max(-m, Math.min(m, lx)), cz = Math.max(-m, Math.min(m, lz));
    if (cx === lx && cz === lz) return false;
    pos.x = cx + CITY.x;
    pos.z = cz + CITY.z;
    return true;
  }

  collide(pos, r) {
    for (const b of this.boxes) {
      const cx = Math.max(b.x0, Math.min(b.x1, pos.x)), cz = Math.max(b.z0, Math.min(b.z1, pos.z));
      const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      }
    }
    // Moving traffic: a soft wall
    for (const v of this.traffic) for (const c of v.circles) pushOut(pos, c.wx, c.wz, c.r + r, 1);
    // Pushables: the animal moves them, and heavier things slow the animal down.
    for (const p of this.pushables) {
      if (pos.y > cityHeight(p.x - CITY.x, p.z - CITY.z) + p.height) continue; // hopping over
      const dx = p.x - pos.x, dz = p.z - pos.z, min = p.r + r, d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, o = min - d;
      const share = p.mass / (p.mass + 1);
      pos.x -= nx * o * share;
      pos.z -= nz * o * share;
      const move = o * (1 - share);
      p.x += nx * move;
      p.z += nz * move;
      const want = (move / this.lastDt) * 1.05, vn = p.vx * nx + p.vz * nz;
      if (vn < want) {
        p.vx += nx * (want - vn);
        p.vz += nz * (want - vn);
      }
      if (p.kind === 'car') {
        // Pushing near the front or back turns the car a little
        const f = Math.sin(p.yaw), g = Math.cos(p.yaw);
        const along = (pos.x - p.x) * f + (pos.z - p.z) * g, side = nx * g - nz * f;
        p.spin -= along * side * move * 3;
      } else {
        p.tip = Math.min(1, p.tip + move * 4);
        p.tipDir = Math.atan2(nx, nz);
      }
      if (this.bumpCool <= 0 && move > 0.002 && this.sound.running) {
        this.sound.boop(p.kind === 'car' ? 0.9 : 0.25);
        this.bumpCool = 0.5;
      }
    }
  }

  // --- Each frame ---
  update(dt, t, player, cam) {
    this.lastDt = Math.max(dt, 1 / 240);
    this.cool -= dt;
    this.beepCool -= dt;
    this.bumpCool -= dt;
    this.parkGate.animate(t);

    // Gates
    if (this.fadeDir === 0 && this.cool <= 0) {
      const gate = this.inCity ? this.cityGateWorld : this.parkGateWorld;
      const dx = player.pos.x - gate.x, dz = player.pos.z - gate.z;
      const s = Math.sin(gate.rot), c = Math.cos(gate.rot);
      const across = dx * c - dz * s, through = dx * s + dz * c;
      if (Math.abs(across) < 1.2 && Math.abs(through) < 0.5) {
        this.fadeDir = 1;
        this.chime();
      }
    }
    if (this.fadeDir !== 0) {
      this.fade += this.fadeDir * dt / (this.fadeDir > 0 ? 0.45 : 0.6);
      if (this.fade >= 1) {
        this.fade = 1;
        this.fadeDir = -1;
        this.go(!this.inCity, player, cam);
      } else if (this.fade <= 0) {
        this.fade = 0;
        this.fadeDir = 0;
      }
      this.overlay.style.opacity = this.fade.toFixed(3);
    }

    if (!this.inCity) return;
    this.cityGate.animate(t);
    for (const m of this.animated) m.animate(t, dt);
    this.updateTraffic(dt, player);
    this.updatePushables(dt);
  }

  chime() {
    if (!this.sound.running) return;
    const now = this.sound.ctx.currentTime;
    [72, 76, 79, 84].forEach((n, i) => {
      const f = 440 * Math.pow(2, (n - 69) / 12);
      this.sound.tone(now + i * 0.09, 'sine', f, f, 0.35, 0.035);
    });
  }

  // Move the animal to the other place, while the screen is white.
  go(toCity, player, cam) {
    const dest = toCity ? this.cityArrive : this.parkArrive;
    player.pos.set(dest.x, heightAt(dest.x, dest.z), dest.z);
    player.heading = dest.h;
    player.vy = 0;
    player.grounded = true;
    player.speed = Math.min(player.speed, 2);
    cam.yaw = dest.h;
    cam.dist = 2.6; // start close, in front of the gate, then ease back
    cam.first = true;
    this.inCity = toCity;
    this.root.visible = toCity;
    if (toCity) {
      this.hidden = this.scene.children.filter((o) => o.visible && o !== this.root && !o.isLight && o.renderOrder !== -1 && !this.keep.has(o));
      for (const o of this.hidden) o.visible = false;
    } else {
      for (const o of this.hidden) o.visible = true;
      this.hidden = [];
    }
    this.cool = 1.0;
  }

  updateTraffic(dt, player) {
    for (const v of this.traffic) {
      const f = Math.sin(v.h), g = Math.cos(v.h);
      const reach = v.circles[0].z + v.circles[0].r + 3.2;
      let blocked = false, byAnimal = false;
      const check = (x, z, w) => {
        const dx = x - v.x, dz = z - v.z;
        const ahead = dx * f + dz * g, side = Math.abs(dx * g - dz * f);
        if (ahead > 0 && ahead < reach && side < 1.0 + w) return true;
        return false;
      };
      if (check(player.pos.x, player.pos.z, 0.5)) blocked = byAnimal = true;
      for (const o of this.traffic) if (o !== v && check(o.x, o.z, 0.9)) blocked = true;
      const target = blocked ? 0 : v.max;
      v.speed += Math.sign(target - v.speed) * Math.min(Math.abs(target - v.speed), (blocked ? 3 : 0.8) * dt);
      v.wait = byAnimal ? v.wait + dt : 0;
      // A friendly "beep beep" when the animal is standing in the road
      if (byAnimal && v.wait > 1.2 && this.beepCool <= 0 && this.sound.running) {
        const now = this.sound.ctx.currentTime;
        this.sound.tone(now, 'triangle', 660, 640, 0.14, 0.04);
        this.sound.tone(now + 0.2, 'triangle', 660, 640, 0.14, 0.04);
        this.beepCool = 5;
      }
      const ds = v.speed * dt;
      v.s += ds;
      v.model.roll(ds);
      this.placeTraffic(v);
      v.model.body.position.y = Math.sin(v.s * 3) * 0.015;
    }
  }

  updatePushables(dt) {
    const list = this.pushables;
    for (const p of list) {
      const car = p.kind === 'car';
      if (car) {
        // Cars roll easily forward and back, but slide sideways only a little.
        const f = Math.sin(p.yaw), g = Math.cos(p.yaw);
        let vf = p.vx * f + p.vz * g, vs = p.vx * g - p.vz * f;
        vf *= Math.exp(-1.4 * dt);
        vs *= Math.exp(-5 * dt);
        p.vx = vf * f + vs * g;
        p.vz = vf * g - vs * f;
        p.yaw += p.spin * dt;
        p.spin *= Math.exp(-4 * dt);
        p.model.roll(vf * dt);
      } else {
        const k = Math.exp(-2.5 * dt);
        p.vx *= k;
        p.vz *= k;
        p.tip *= Math.exp(-3 * dt);
      }
      // Downhill on ramps and the sand pile
      const lx = p.x - CITY.x, lz = p.z - CITY.z;
      const hx = cityHeight(lx + 0.3, lz) - cityHeight(lx - 0.3, lz), hz = cityHeight(lx, lz + 0.3) - cityHeight(lx, lz - 0.3);
      p.vx -= hx * 8 * dt;
      p.vz -= hz * 8 * dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;

      for (const c of this.statics) bounce(p, c.x, c.z, c.r + p.r);
      for (const v of this.traffic) for (const c of v.circles) {
        // Traffic nudges things out of the road, toward the pavement
        if (pushOut(p, c.wx, c.wz, c.r + p.r, 1)) {
          const ox = p.x - CITY.x, oz = p.z - CITY.z, l = Math.hypot(ox, oz) || 1;
          p.vx += (ox / l) * 2 * dt;
          p.vz += (oz / l) * 2 * dt;
        }
      }
      // Stay inside the city edge
      const m = WALK - p.r;
      if (Math.abs(p.x - CITY.x) > m) { p.x = CITY.x + Math.sign(p.x - CITY.x) * m; p.vx *= -0.4; }
      if (Math.abs(p.z - CITY.z) > m) { p.z = CITY.z + Math.sign(p.z - CITY.z) * m; p.vz *= -0.4; }
    }
    // Pushables push each other
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const dx = b.x - a.x, dz = b.z - a.z, min = a.r + b.r, d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, o = min - d, wa = b.mass / (a.mass + b.mass);
      a.x -= nx * o * wa; a.z -= nz * o * wa;
      b.x += nx * o * (1 - wa); b.z += nz * o * (1 - wa);
      const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rel < 0) {
        const j2 = -rel * 0.8;
        a.vx -= nx * j2 * wa; a.vz -= nz * j2 * wa;
        b.vx += nx * j2 * (1 - wa); b.vz += nz * j2 * (1 - wa);
      }
    }
    for (const p of list) {
      const lx = p.x - CITY.x, lz = p.z - CITY.z, root = p.model.root;
      root.position.set(lx, cityHeight(lx, lz), lz);
      if (p.kind === 'car') {
        const f = Math.sin(p.yaw), g = Math.cos(p.yaw);
        const pitch = Math.atan2(cityHeight(lx + f, lz + g) - cityHeight(lx - f, lz - g), 2);
        const roll = Math.atan2(cityHeight(lx + g * 0.5, lz - f * 0.5) - cityHeight(lx - g * 0.5, lz + f * 0.5), 1);
        root.rotation.set(-pitch, p.yaw, roll, 'YXZ');
      } else {
        const w = p.tip * 0.5 * Math.sin(performance.now() * 0.02);
        root.rotation.set(Math.cos(p.tipDir) * w, 0, -Math.sin(p.tipDir) * w);
      }
    }
  }
}

function pushOut(p, cx, cz, min, k) {
  const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= min * min || d2 < 1e-8) return false;
  const d = Math.sqrt(d2), s = ((min - d) / d) * k;
  p.x += dx * s;
  p.z += dz * s;
  return true;
}

function bounce(p, cx, cz, min) {
  const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= min * min || d2 < 1e-8) return;
  const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
  p.x = cx + nx * min;
  p.z = cz + nz * min;
  const vn = p.vx * nx + p.vz * nz;
  if (vn < 0) {
    p.vx -= 1.4 * vn * nx;
    p.vz -= 1.4 * vn * nz;
  }
}
