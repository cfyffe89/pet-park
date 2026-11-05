// The park: terrain, pond, trees, flowers, grass, sky.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm, mulberry32, smoothstep, lerp } from './math.js';

export const PARK_R = 50;        // the animal stays inside this radius
export const WATER_Y = 0;
export const POND = { x: 13, z: -11, r: 7.5 };
const PATH_R = 32;
const TERRAIN_SIZE = 180;

export function pathDist(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  const pr = PATH_R + 3 * Math.sin(3 * a + 0.6) + 1.5 * Math.sin(5 * a);
  return Math.abs(r - pr);
}

export function heightAt(x, z) {
  let h = 1.6 + fbm(x * 0.025 + 10, z * 0.025 - 4) * 1.2;
  const r = Math.hypot(x, z);
  const rim = smoothstep(PARK_R - 4, PARK_R + 24, r);
  h += rim * rim * 16;
  const dp = Math.hypot(x - POND.x, z - POND.z);
  const t = 1 - smoothstep(POND.r * 0.55, POND.r + 2.5, dp);
  return lerp(h, -0.7, t);
}

export function normalAt(x, z, out = new THREE.Vector3()) {
  const e = 0.25;
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}

// Circles the animal and balls can not pass through.
export const colliders = [];

export function collide(pos, r) {
  for (const c of colliders) {
    const dx = pos.x - c.x, dz = pos.z - c.z;
    const min = c.r + r, d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2), k = (min - d) / d;
      pos.x += dx * k;
      pos.z += dz * k;
    }
  }
}

export function clampPark(pos, margin = 0) {
  const r = Math.hypot(pos.x, pos.z), max = PARK_R + 2 - margin;
  if (r > max) {
    pos.x *= max / r;
    pos.z *= max / r;
    return true;
  }
  return false;
}

// Shared uniforms for grass and flowers: wind time and the animal position.
export const foliageUniforms = {
  uTime: { value: 0 },
  uPlayer: { value: new THREE.Vector3(0, 0, 0) },
};

// Wind sway plus "part around the animal", done on the GPU.
function addFoliageMotion(material, sway = 0.06, pushR = 1.1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = foliageUniforms.uTime;
    shader.uniforms.uPlayer = foliageUniforms.uPlayer;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uPlayer;')
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#else
        vec3 root = vec3(0.0);
#endif
        float hgt = max(0.0, mvPosition.y - root.y);
        vec2 d = root.xz - uPlayer.xz;
        float dist = length(d);
        float push = 1.0 - smoothstep(0.15, ${pushR.toFixed(2)}, dist);
        push *= step(abs(uPlayer.y - root.y), 1.2);
        vec2 dir = dist > 0.001 ? d / dist : vec2(0.0);
        float w = sin(uTime * 1.7 + root.x * 0.37 + root.z * 0.23) + 0.5 * sin(uTime * 2.9 + root.z * 0.5);
        mvPosition.xz += (dir * push * 2.2 + vec2(w, w * 0.5) * ${sway.toFixed(3)}) * hgt;
        mvPosition.y -= push * 0.6 * hgt * hgt;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`
      );
  };
}

function isClear(x, z, margin) {
  for (const c of colliders) {
    const dx = x - c.x, dz = z - c.z, m = c.r + margin;
    if (dx * dx + dz * dz < m * m) return false;
  }
  return true;
}

export function buildWorld(scene) {
  const rng = mulberry32(20261105);
  const rand = (a, b) => a + (b - a) * rng();
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  // --- Sky ---
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x6fb6e6) },
        mid: { value: new THREE.Color(0xd2ecf6) },
        bottom: { value: new THREE.Color(0xf3e6cf) },
      },
      vertexShader: `varying vec3 vP;
        void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
        void main(){
          float h = vP.y;
          vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.55, h)) : mix(mid, bottom, smoothstep(0.0, -0.2, h));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
  );
  sky.renderOrder = -1;
  scene.add(sky);
  scene.fog = new THREE.Fog(0xd2ecf6, 50, 160);

  // --- Light ---
  scene.add(new THREE.HemisphereLight(0xd8efff, 0x8fae6a, 1.2));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const sunOffset = new THREE.Vector3(28, 48, 18);

  // --- Terrain ---
  const seg = 180;
  const tg = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, seg, seg);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grassA = new THREE.Color(0x7fb85a), grassB = new THREE.Color(0xa6d46c);
  const hillC = new THREE.Color(0x6aa35a), pathC = new THREE.Color(0xdccb9b);
  const sandC = new THREE.Color(0xd9c99a), mudC = new THREE.Color(0x7a9a6a);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = fbm(x * 0.12 + 3, z * 0.12 + 7, 3) * 0.5 + 0.5;
    col.copy(grassA).lerp(grassB, n);
    const r = Math.hypot(x, z);
    col.lerp(hillC, smoothstep(PARK_R, PARK_R + 25, r) * 0.7);
    const pm = 1 - smoothstep(0.9, 1.7, pathDist(x, z));
    col.lerp(pathC, pm * (1 - smoothstep(PARK_R - 6, PARK_R, r)));
    col.lerp(sandC, 1 - smoothstep(0.15, 0.6, h));
    if (h < 0) col.lerp(mudC, smoothstep(0, -0.5, h));
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // --- Pond ---
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(POND.r + 2.5, 48),
    new THREE.MeshStandardMaterial({ color: 0x86c9dc, transparent: true, opacity: 0.78, roughness: 0.12, metalness: 0.05 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND.x, WATER_Y, POND.z);
  water.receiveShadow = true;
  scene.add(water);

  const padGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.03, 14, 1, false, 0.4, Math.PI * 2 - 0.4);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x5f9e4a, roughness: 0.7 });
  const blossomMat = new THREE.MeshStandardMaterial({ color: 0xffc4d6, roughness: 0.6 });
  const pads = [];
  for (let i = 0; i < 7; i++) {
    const a = rand(0, Math.PI * 2), d = rand(1, POND.r * 0.65);
    const x = POND.x + Math.cos(a) * d, z = POND.z + Math.sin(a) * d;
    if (heightAt(x, z) > -0.2) continue;
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(x, WATER_Y + 0.02, z);
    pad.rotation.y = rand(0, 6.28);
    pad.scale.setScalar(rand(0.7, 1.3));
    if (rng() < 0.5) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), blossomMat);
      b.position.set(0.1, 0.08, 0);
      b.scale.set(1, 0.7, 1);
      pad.add(b);
    }
    scene.add(pad);
    pads.push({ mesh: pad, seed: rng() * 10 });
  }

  // --- Rocks around the pond ---
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xa9aaa4, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const a = rand(0, Math.PI * 2), d = POND.r + rand(-0.5, 1.8);
    const x = POND.x + Math.cos(a) * d, z = POND.z + Math.sin(a) * d;
    const s = rand(0.35, 0.8);
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(x, heightAt(x, z) + s * 0.25, z);
    rock.scale.set(s * rand(1, 1.4), s * rand(0.6, 0.9), s * rand(1, 1.3));
    rock.rotation.set(rand(0, 1), rand(0, 6), rand(0, 1));
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
    colliders.push({ x, z, r: s * 1.05 });
  }

  // --- Benches beside the path ---
  const wood = new THREE.MeshStandardMaterial({ color: 0xa8774f, roughness: 0.85 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.6 });
  for (const a of [0.4, 2.3, 4.4]) {
    const r = PATH_R + 3 * Math.sin(3 * a + 0.6) + 1.5 * Math.sin(5 * a) + 2.0;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const bench = new THREE.Group();
    const box = (w, h, d, m, px, py, pz) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(px, py, pz);
      b.castShadow = true;
      b.receiveShadow = true;
      bench.add(b);
    };
    for (let i = 0; i < 3; i++) box(1.8, 0.05, 0.14, wood, 0, 0.45, -0.18 + i * 0.18);
    for (let i = 0; i < 2; i++) box(1.8, 0.12, 0.05, wood, 0, 0.7 + i * 0.18, -0.3);
    for (const s of [-0.8, 0.8]) {
      box(0.06, 0.45, 0.5, iron, s, 0.22, 0);
      box(0.06, 0.6, 0.06, iron, s, 0.75, -0.3);
    }
    bench.position.set(x, heightAt(x, z), z);
    bench.rotation.y = Math.atan2(-x, -z);
    scene.add(bench);
    colliders.push({ x, z, r: 0.95 });
  }

  // --- Picnic blanket ---
  {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        g.fillStyle = (x + y) % 2 ? '#f6f1e7' : '#e8727a';
        g.fillRect(x * 16, y * 16, 16, 16);
      }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const bx = -7, bz = 8;
    const bg = new THREE.PlaneGeometry(2.6, 2.0, 12, 10);
    bg.rotateX(-Math.PI / 2);
    const bp = bg.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      bp.setY(i, heightAt(bx + bp.getX(i) * 0.94 - bp.getZ(i) * 0.34, bz + bp.getX(i) * 0.34 + bp.getZ(i) * 0.94) + 0.03);
    }
    bg.computeVertexNormals();
    const blanket = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    blanket.position.set(bx, 0, bz);
    blanket.rotation.y = -0.35;
    blanket.receiveShadow = true;
    scene.add(blanket);
  }

  // --- Trees ---
  const trees = [];
  const tryTree = (x, z, inside) => {
    if (inside) {
      if (Math.hypot(x, z) < 9) return false;
      if (pathDist(x, z) < 3) return false;
      if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 4) return false;
      if (Math.hypot(x + 7, z - 8) < 4) return false; // picnic blanket
    }
    for (const t of trees) if ((t.x - x) ** 2 + (t.z - z) ** 2 < (inside ? 30 : 20)) return false;
    // Inside the park: tall round trees only, so the camera passes under the leaves.
    trees.push({ x, z, s: inside ? rand(0.95, 1.4) : rand(0.85, 1.4), pine: !inside && rng() < 0.35, inside });
    return true;
  };
  for (let i = 0, n = 0; i < 600 && n < 55; i++) {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(rng()) * (PARK_R - 3);
    if (tryTree(Math.cos(a) * r, Math.sin(a) * r, true)) n++;
  }
  for (let i = 0, n = 0; i < 800 && n < 110; i++) {
    const a = rand(0, Math.PI * 2), r = rand(PARK_R + 3, 85);
    if (tryTree(Math.cos(a) * r, Math.sin(a) * r, false)) n++;
  }

  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.32, 2.6, 7);
  trunkGeo.translate(0, 1.3, 0);
  const blobGeo = new THREE.IcosahedronGeometry(1, 1);
  const coneGeo = new THREE.ConeGeometry(1, 2.2, 8);
  const blobs = [], cones = [];
  const greens = [0x5e9e48, 0x6fae4f, 0x86bb57, 0x4f8f45, 0x9cc65e];
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x8a6446, roughness: 0.9 }), trees.length);
  trees.forEach((t, i) => {
    const y = heightAt(t.x, t.z);
    const s = t.s;
    dummy.position.set(t.x, y - 0.1, t.z);
    dummy.rotation.set(0, rand(0, 6), 0);
    dummy.scale.set(s, s * (t.pine ? 0.8 : 1.4), s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    const g = greens[Math.floor(rng() * greens.length)];
    if (t.pine) {
      for (let k = 0; k < 3; k++)
        cones.push({ x: t.x, y: y + s * (2.0 + k * 1.05), z: t.z, sx: s * (1.5 - k * 0.35), sy: s * (1.1 - k * 0.15), c: g });
    } else {
      blobs.push({ x: t.x, y: y + s * 4.1, z: t.z, sx: s * 1.8, sy: s * 1.3, c: g });
      blobs.push({ x: t.x + s * 0.95, y: y + s * 3.75, z: t.z + s * 0.3, sx: s * 1.2, sy: s * 0.95, c: g });
      blobs.push({ x: t.x - s * 0.6, y: y + s * 4.9, z: t.z - s * 0.4, sx: s * 1.15, sy: s * 1.0, c: g });
    }
    if (t.inside) colliders.push({ x: t.x, z: t.z, r: 0.32 * s, tall: true });
  });
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  scene.add(trunks);

  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
  const makeCanopy = (geo, list) => {
    const m = new THREE.InstancedMesh(geo, leafMat, list.length);
    list.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(rand(0, 1), rand(0, 6), rand(0, 1) * (geo === coneGeo ? 0 : 1));
      if (geo === coneGeo) dummy.rotation.set(0, rand(0, 6), 0);
      dummy.scale.set(b.sx, b.sy, b.sx);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      col.setHex(b.c).offsetHSL(rand(-0.02, 0.02), 0, rand(-0.04, 0.04));
      m.setColorAt(i, col);
    });
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  };
  makeCanopy(blobGeo, blobs);
  makeCanopy(coneGeo, cones);

  // --- Bushes: a soft ring at the edge, plus a few inside ---
  const bushes = [];
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + rand(-0.03, 0.03);
    const r = PARK_R + rand(2.5, 6);
    bushes.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: rand(1.1, 1.8), inside: false });
  }
  for (let i = 0, n = 0; i < 300 && n < 18; i++) {
    const a = rand(0, Math.PI * 2), r = rand(10, PARK_R - 4);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (pathDist(x, z) < 2.5 || heightAt(x, z) < 0.5 || !isClear(x, z, 2.5)) continue;
    bushes.push({ x, z, s: rand(0.6, 1.0), inside: true });
    n++;
  }
  const bushMesh = new THREE.InstancedMesh(blobGeo, leafMat, bushes.length);
  bushes.forEach((b, i) => {
    dummy.position.set(b.x, heightAt(b.x, b.z) + b.s * 0.35, b.z);
    dummy.rotation.set(rand(0, 1), rand(0, 6), 0);
    dummy.scale.set(b.s * 1.3, b.s * 0.85, b.s * 1.2);
    dummy.updateMatrix();
    bushMesh.setMatrixAt(i, dummy.matrix);
    col.setHex(greens[i % greens.length]).offsetHSL(0, 0, -0.03);
    bushMesh.setColorAt(i, col);
    if (b.inside) colliders.push({ x: b.x, z: b.z, r: b.s * 1.05 });
  });
  bushMesh.castShadow = true;
  bushMesh.receiveShadow = true;
  scene.add(bushMesh);

  // --- Flowers in clusters ---
  const flowerSpots = [];
  for (let i = 0, n = 0; i < 400 && n < 22; i++) {
    const a = rand(0, Math.PI * 2), r = rand(5, PARK_R - 5);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (pathDist(x, z) < 2.5 || heightAt(x, z) < 0.5) continue;
    flowerSpots.push({ x, z });
    n++;
  }
  const flowerColors = [0xff9ab8, 0xffe066, 0xfff7f0, 0xc9a2ff, 0xffa95e, 0xff7b93, 0x8fc8ff];
  const flowers = [];
  for (const spot of flowerSpots) {
    const c = flowerColors[Math.floor(rng() * flowerColors.length)];
    const c2 = flowerColors[Math.floor(rng() * flowerColors.length)];
    const count = 60 + Math.floor(rng() * 50);
    for (let k = 0; k < count; k++) {
      const a = rand(0, Math.PI * 2), d = Math.sqrt(rng()) * 3;
      const x = spot.x + Math.cos(a) * d, z = spot.z + Math.sin(a) * d;
      if (pathDist(x, z) < 1.4 || heightAt(x, z) < 0.4 || !isClear(x, z, 0.2)) continue;
      flowers.push({ x, z, s: rand(0.75, 1.35), c: rng() < 0.75 ? c : c2 });
    }
  }
  const stemGeo = new THREE.CylinderGeometry(0.008, 0.011, 0.22, 4);
  stemGeo.translate(0, 0.11, 0);
  // Five small petals around a yellow-ish middle (the middle uses the same instance colour, lighter).
  const petals = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = new THREE.SphereGeometry(0.028, 6, 4);
    p.scale(1, 0.35, 0.7);
    p.translate(Math.cos(a) * 0.03, 0.225, Math.sin(a) * 0.03);
    petals.push(p);
  }
  const headGeo = mergeGeometries(petals);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x5e9a45, roughness: 0.9 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, flatShading: true });
  addFoliageMotion(stemMat, 0.12, 0.9);
  addFoliageMotion(headMat, 0.12, 0.9);
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, flowers.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, flowers.length);
  flowers.forEach((f, i) => {
    dummy.position.set(f.x, heightAt(f.x, f.z) - 0.02, f.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(f.s);
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
    heads.setMatrixAt(i, dummy.matrix);
    heads.setColorAt(i, col.setHex(f.c));
  });
  scene.add(stems, heads);

  // --- Grass tufts ---
  const blade = (rz, rx, h) => {
    const g = new THREE.ConeGeometry(0.035, h, 3);
    g.translate(0, h / 2, 0);
    g.rotateZ(rz);
    g.rotateX(rx);
    return g;
  };
  const tuftGeo = mergeGeometries([blade(0, 0, 0.32), blade(0.35, 0.1, 0.26), blade(-0.3, -0.15, 0.28), blade(0.1, -0.4, 0.24)]);
  const tuftMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  addFoliageMotion(tuftMat, 0.18, 1.0);
  const tufts = [];
  for (let i = 0; tufts.length < 9000 && i < 24000; i++) {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(rng()) * (PARK_R + 4);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (pathDist(x, z) < 1.3 || heightAt(x, z) < 0.35) continue;
    tufts.push({ x, z, s: rand(0.55, 1.05) });
  }
  const tuftMesh = new THREE.InstancedMesh(tuftGeo, tuftMat, tufts.length);
  const tuftA = new THREE.Color(0x6fae4c), tuftB = new THREE.Color(0x9fd067);
  tufts.forEach((t, i) => {
    dummy.position.set(t.x, heightAt(t.x, t.z) - 0.03, t.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(t.s, t.s * rand(0.8, 1.3), t.s);
    dummy.updateMatrix();
    tuftMesh.setMatrixAt(i, dummy.matrix);
    tuftMesh.setColorAt(i, col.copy(tuftA).lerp(tuftB, rng()));
  });
  tuftMesh.receiveShadow = true;
  scene.add(tuftMesh);

  // --- Clouds ---
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, fog: false, emissive: 0xdde8f0, emissiveIntensity: 0.35 });
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const parts = [];
    const n = 4 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const g = new THREE.IcosahedronGeometry(rand(3, 5.5), 1);
      g.translate(k * 4 - n * 2 + rand(-1, 1), rand(-0.8, 1.2), rand(-2, 2));
      parts.push(g);
    }
    const g = mergeGeometries(parts);
    g.scale(1, 0.55, 1);
    const cloud = new THREE.Mesh(g, cloudMat);
    const a = rand(0, Math.PI * 2), r = rand(70, 200);
    cloud.position.set(Math.cos(a) * r, rand(45, 70), Math.sin(a) * r);
    cloud.rotation.y = rand(0, 6);
    scene.add(cloud);
    clouds.push(cloud);
  }

  return {
    sun,
    flowerSpots,
    trees: trees.filter((t) => t.inside && !t.pine),
    update(dt, t, playerPos, camera) {
      foliageUniforms.uTime.value = t;
      foliageUniforms.uPlayer.value.copy(playerPos);
      sky.position.copy(camera.position);
      sun.position.copy(playerPos).add(sunOffset);
      sun.target.position.copy(playerPos);
      for (const c of clouds) {
        c.position.x += dt * 0.6;
        if (c.position.x > 220) c.position.x = -220;
      }
      for (const p of pads) p.mesh.position.y = WATER_Y + 0.02 + Math.sin(t * 0.8 + p.seed) * 0.01;
    },
  };
}
