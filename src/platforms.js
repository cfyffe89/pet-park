// Easy things to climb: tree stumps, logs, flat rocks, wooden platforms and stepping stones.
// Build these before buildWorld, so trees, bushes and grass keep clear of them.
import * as THREE from 'three';
import { heightAt, pathDist, POND, PARK_R, WATER_Y } from './world.js';
import { addCircle, addBox, nearObstacle } from './obstacles.js';
import { mulberry32 } from './math.js';

// Wood rings for the cut ends of stumps and logs.
function ringTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#e8c48e';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#c99a62';
  g.lineWidth = 3;
  for (let r = 8; r < 64; r += 9) {
    g.beginPath();
    g.arc(64, 64, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#7a5236';
  g.beginPath();
  g.arc(64, 64, 64, 0, Math.PI * 2);
  g.arc(64, 64, 58, 0, Math.PI * 2, true);
  g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Lowest and highest ground under a circle.
function groundRange(x, z, r) {
  let lo = heightAt(x, z), hi = lo;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, h = heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  return [lo, hi];
}

// Angle (for rotation.y) that points a mesh's local x axis along the world direction (dx, dz).
const along = (dx, dz) => Math.atan2(-dz, dx);

export function buildPlatforms(scene) {
  const rng = mulberry32(5150);
  const rand = (a, b) => a + (b - a) * rng();
  const rings = ringTexture();
  const bark = new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 0.95 });
  const cut = new THREE.MeshStandardMaterial({ map: rings, roughness: 0.85 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xb5b3aa, roughness: 0.9, flatShading: true });
  const deck = new THREE.MeshStandardMaterial({ color: 0xd19a63, roughness: 0.8 });
  const deckSide = new THREE.MeshStandardMaterial({ color: 0x9c6b45, roughness: 0.9 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xe5574f, roughness: 0.6 });
  const stalkMat = new THREE.MeshStandardMaterial({ color: 0xf6efe2, roughness: 0.8 });
  const flags = [];

  const place = (mesh) => {
    mesh.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    scene.add(mesh);
    return mesh;
  };

  // top: the flat top height. lo: the lowest ground under it, so it never floats.
  const stump = (x, z, r, top, lo) => {
    const h = top - lo + 0.15;
    const g = new THREE.CylinderGeometry(r * 0.92, r * 1.1, h, 16);
    g.translate(0, h / 2 - 0.15, 0);
    const m = new THREE.Mesh(g, [bark, cut, cut]);
    m.position.set(x, lo, z);
    m.rotation.y = rand(0, 6);
    place(m);
    // A little mushroom at the foot of some stumps.
    if (rng() < 0.5) {
      const a = rand(0, 6.28), mx = x + Math.cos(a) * r * 1.2, mz = z + Math.sin(a) * r * 1.2;
      const mush = new THREE.Group();
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 6), stalkMat);
      stalk.position.y = 0.06;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
      cap.position.y = 0.11;
      mush.add(stalk, cap);
      mush.position.set(mx, heightAt(mx, mz) - 0.01, mz);
      place(mush);
    }
    addCircle(x, z, r, top);
  };

  // A log lying on the ground along (dx, dz).
  const log = (x, z, len, r, dx, dz, top) => {
    const g = new THREE.CylinderGeometry(r, r, len, 14);
    g.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(g, [bark, cut, cut]);
    const angle = along(dx, dz);
    m.position.set(x, top - r, z);
    m.rotation.y = angle;
    place(m);
    addBox(x, z, len / 2, r * 0.9, angle, top);
  };

  // A low, flat-topped boulder.
  const rock = (x, z, r, top, lo) => {
    const h = top - lo + 0.2;
    const g = new THREE.CylinderGeometry(r * 0.82, r, h, 9, 2);
    g.translate(0, h / 2 - 0.2, 0);
    const p = g.attributes.position, s1 = rand(0, 6), s2 = rand(0, 6);
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i)), y = p.getY(i);
      const k = 1 + 0.1 * Math.sin(a * 3 + s1 + y) + 0.06 * Math.sin(a * 5 + s2);
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, rockMat);
    m.position.set(x, lo, z);
    m.rotation.y = rand(0, 6);
    place(m);
    addCircle(x, z, r * 0.85, top);
  };

  // A wooden platform: solid sides and a plank top.
  const platform = (x, z, w, d, angle, top, lo, flag) => {
    const grp = new THREE.Group();
    const h = top - lo + 0.15;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, h - 0.08, d - 0.08), deckSide);
    body.position.y = h / 2 - 0.15 - 0.04;
    grp.add(body);
    const n = Math.max(3, Math.round(w / 0.32));
    for (let i = 0; i < n; i++) {
      const pw = w / n;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.03, 0.08, d + 0.06), deck);
      plank.position.set(-w / 2 + pw * (i + 0.5), top - lo - 0.04, 0);
      grp.add(plank);
    }
    if (flag) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6), stalkMat);
      pole.position.set(w / 2 - 0.12, top - lo + 0.65, d / 2 - 0.12);
      grp.add(pole);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(0.5, -0.17);
      shape.lineTo(0, -0.34);
      const cloth = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshStandardMaterial({ color: 0xffc94a, roughness: 0.7, side: THREE.DoubleSide })
      );
      const fp = new THREE.Group();
      fp.position.set(w / 2 - 0.12, top - lo + 1.28, d / 2 - 0.12);
      fp.add(cloth);
      grp.add(fp);
      flags.push(fp);
    }
    grp.position.set(x, lo, z);
    grp.rotation.y = angle;
    place(grp);
    addBox(x, z, w / 2, d / 2, angle, top);
  };

  // --- The climbing corner, in view from the start ---
  // A top that sits `rise` above the lowest nearby ground (so walk-up steps stay walkable on a slope).
  const riseFrom = (x, z, r, rise) => {
    const [ringLo] = groundRange(x, z, r + 0.4), [, hi] = groundRange(x, z, r);
    return Math.max(ringLo + rise, hi + 0.1);
  };
  const low = (x, z, r) => groundRange(x, z, r + 0.3)[0] - 0.05;
  {
    // A flat rock to walk onto.
    rock(-0.5, -2.5, 0.75, riseFrom(-0.5, -2.5, 0.64, 0.2), low(-0.5, -2.5, 0.75));
    // Stumps like stairs, then a big platform: each is a small step, no hop needed.
    const s1 = riseFrom(0.8, -3.6, 0.48, 0.22);
    stump(0.8, -3.6, 0.48, s1, low(0.8, -3.6, 0.48));
    stump(1.7, -4.5, 0.48, s1 + 0.25, low(1.7, -4.5, 0.48));
    stump(2.7, -5.3, 0.52, s1 + 0.5, low(2.7, -5.3, 0.52));
    // The big platform, then a taller lookout with a flag (hop up to it).
    const a = 0.6, ax = Math.cos(a), az = -Math.sin(a), bx = Math.sin(a), bz = Math.cos(a);
    const px = 4.2, pz = -6.4, qx = px + ax * 1.75, qz = pz + az * 1.75;
    platform(px, pz, 2.4, 2.0, a, s1 + 0.75, low(px, pz, 1.6), false);
    platform(qx, qz, 1.4, 1.4, a, s1 + 1.25, low(qx, qz, 1.0), true);
    // A log that leads away from the platform, down to the grass.
    const lx = px + bx * 2.6, lz = pz + bz * 2.6, [llo, lhi] = groundRange(lx, lz, 1.6);
    log(lx, lz, 3.2, 0.24, bx, bz, (llo + lhi) / 2 + 0.45);
    // Hop-along stumps: each a little higher than the last.
    const h1 = riseFrom(0.5, -8, 0.45, 0.42);
    stump(0.5, -8, 0.45, h1, low(0.5, -8, 0.45));
    stump(1.7, -8.9, 0.45, h1 + 0.15, low(1.7, -8.9, 0.45));
    stump(3, -9.4, 0.45, h1 + 0.3, low(3, -9.4, 0.45));
  }

  // --- Stepping stones across the pond ---
  for (let i = 0; i < 8; i++) {
    const x = POND.x - 5.6 + i * 1.6, z = POND.z + Math.sin(i * 1.3) * 0.7;
    rock(x, z, 0.55, WATER_Y + 0.18, heightAt(x, z) - 0.05);
  }

  // --- Stumps, logs and rocks around the park ---
  const kinds = ['stump', 'stump', 'stump', 'stump', 'stump', 'stump', 'log', 'log', 'log', 'log', 'rock', 'rock', 'rock', 'rock'];
  for (let i = 0, n = 0; i < 500 && n < kinds.length; i++) {
    const a = rand(0, Math.PI * 2), d = rand(11, PARK_R - 5);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (pathDist(x, z) < 3.2) continue;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 4) continue;
    if (Math.hypot(x + 7, z - 8) < 6.5) continue; // picnic blanket
    if (nearObstacle(x, z, 4)) continue;
    const kind = kinds[n];
    const [lo, hi] = groundRange(x, z, kind === 'log' ? 1.6 : 0.8);
    if (hi - lo > 0.3) continue;
    if (kind === 'stump') stump(x, z, rand(0.4, 0.55), hi + rand(0.4, 0.65), lo - 0.05);
    else if (kind === 'rock') rock(x, z, rand(0.6, 0.9), hi + rand(0.18, 0.45), lo - 0.05);
    else {
      const r = rand(0.2, 0.26), t = rand(0, Math.PI);
      log(x, z, rand(2.4, 3.4), r, Math.cos(t), Math.sin(t), (lo + hi) / 2 + r * 2 - 0.03);
    }
    n++;
  }

  return {
    update(dt, t) {
      for (const f of flags) f.rotation.y = Math.sin(t * 2.3) * 0.25 + Math.sin(t * 5.1) * 0.08;
    },
  };
}
