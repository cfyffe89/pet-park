// Things to play with: balls, leaf piles, butterflies, water ripples, a swap "poof".
import * as THREE from 'three';
import { heightAt, normalAt, WATER_Y, PARK_R, colliders } from './world.js';
import { mulberry32 } from './math.js';
import { standTop, pushOut } from './obstacles.js';

const rng = mulberry32(7);
const rand = (a, b) => a + (b - a) * rng();

function beachBallTexture(colors) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const g = cv.getContext('2d');
  colors.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect((i * 256) / colors.length, 0, 256 / colors.length + 1, 128);
  });
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 12);
  g.fillRect(0, 116, 256, 12);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Balls {
  constructor(scene, sound) {
    this.sound = sound;
    this.list = [];
    const defs = [
      { x: 3, z: 7, r: 0.45, c: ['#ff8a8a', '#ffffff', '#7cc7ff', '#ffffff', '#ffe27a', '#ffffff'] },
      { x: -5, z: 1, r: 0.32, c: ['#ffb36b', '#ffb36b'] },
      { x: 7, z: -1, r: 0.55, c: ['#9ee39b', '#ffffff', '#ff9ec7', '#ffffff', '#a8b8ff', '#ffffff'] },
      { x: -2, z: -7, r: 0.3, c: ['#c9a3ff', '#c9a3ff'] },
      { x: -18, z: 14, r: 0.4, c: ['#ffe27a', '#ffffff', '#ff8a8a', '#ffffff'] },
    ];
    for (const d of defs) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(d.r, 28, 18),
        new THREE.MeshStandardMaterial({ map: beachBallTexture(d.c), roughness: 0.45 })
      );
      mesh.castShadow = true;
      mesh.rotation.set(rand(0, 3), rand(0, 3), 0);
      scene.add(mesh);
      this.list.push({
        mesh, r: d.r,
        pos: new THREE.Vector3(d.x, heightAt(d.x, d.z) + d.r, d.z),
        vel: new THREE.Vector3(),
        cool: 0, wet: false,
      });
    }
    this.n = new THREE.Vector3();
    this.axis = new THREE.Vector3();
    this.q = new THREE.Quaternion();
  }

  update(dt, pl, ar) {
    const g = 14, n = this.n;
    for (const b of this.list) {
      const p = b.pos, v = b.vel;
      b.cool -= dt;
      v.y -= g * dt;

      const gy = heightAt(p.x, p.z);
      const inWater = gy < WATER_Y - 0.05;
      if (inWater) {
        const floatY = WATER_Y + b.r * 0.2;
        if (p.y < floatY) {
          v.y += (floatY - p.y) * 40 * dt + g * dt * 0.9;
          v.y *= Math.exp(-4 * dt);
        }
        v.x *= Math.exp(-0.7 * dt);
        v.z *= Math.exp(-0.7 * dt);
        if (!b.wet && p.y < WATER_Y + b.r) {
          b.wet = true;
          if (v.length() > 1.5) this.sound.splash(0.6);
        }
      } else if (b.wet && gy > WATER_Y + 0.1) b.wet = false;

      p.addScaledVector(v, dt);

      const floor = heightAt(p.x, p.z) + b.r;
      if (p.y < floor) {
        normalAt(p.x, p.z, n);
        p.y = floor;
        const vn = v.dot(n);
        if (vn < 0) {
          const e = vn < -1.5 ? 0.5 : 0;
          if (vn < -3 && b.cool < 0) {
            this.sound.boing(Math.min(1, -vn / 8), b.r);
            b.cool = 0.15;
          }
          v.addScaledVector(n, -vn * (1 + e));
        }
        const fr = Math.exp(-0.45 * dt);
        v.x *= fr;
        v.z *= fr;
      }

      // Stumps, logs, platforms: roll along the top, bounce off the sides.
      const top = standTop(p.x, p.z, p.y - b.r, 0, 0.05);
      if (p.y - b.r < top) {
        p.y = top + b.r;
        if (v.y < 0) v.y = v.y < -3 ? -v.y * 0.4 : 0;
        const fr = Math.exp(-0.45 * dt);
        v.x *= fr;
        v.z *= fr;
      }
      pushOut(p, b.r, p.y - b.r, 0.05, v);

      // Trees, rocks, benches
      for (const c of colliders) {
        const dx = p.x - c.x, dz = p.z - c.z, min = c.r + b.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
          p.x = c.x + nx * min;
          p.z = c.z + nz * min;
          const vn = v.x * nx + v.z * nz;
          if (vn < 0) {
            v.x -= 1.6 * vn * nx;
            v.z -= 1.6 * vn * nz;
            if (vn < -2 && b.cool < 0) {
              this.sound.boing(Math.min(1, -vn / 8) * 0.7, b.r);
              b.cool = 0.15;
            }
          }
        }
      }

      // Park edge: roll back in
      const r = Math.hypot(p.x, p.z);
      if (r > PARK_R) {
        const nx = p.x / r, nz = p.z / r;
        p.x = nx * PARK_R;
        p.z = nz * PARK_R;
        const vn = v.x * nx + v.z * nz;
        if (vn > 0) {
          v.x -= 1.5 * vn * nx;
          v.z -= 1.5 * vn * nz;
        }
      }

      // The animal nudges the ball
      const dx = p.x - pl.pos.x, dz = p.z - pl.pos.z;
      const min = b.r + ar, d2 = dx * dx + dz * dz;
      if (d2 < min * min && p.y - b.r < pl.pos.y + ar * 2.4 && p.y + b.r > pl.pos.y - 0.1) {
        const d = Math.sqrt(d2) || 0.001, nx = dx / d, nz = dz / d;
        p.x = pl.pos.x + nx * min;
        p.z = pl.pos.z + nz * min;
        const pvx = Math.sin(pl.heading) * pl.speed, pvz = Math.cos(pl.heading) * pl.speed;
        const rel = pvx * nx + pvz * nz - (v.x * nx + v.z * nz);
        if (rel > -0.2) {
          const light = 0.45 / b.r;
          const kick = (Math.max(0, rel) * 0.85 + 0.8) * Math.sqrt(light);
          v.x += nx * kick + pvx * 0.25;
          v.z += nz * kick + pvz * 0.25;
          v.y += (0.8 + Math.max(0, rel) * 0.35) * Math.sqrt(light);
          if (b.cool < 0) {
            this.sound.boop(b.r);
            b.cool = 0.25;
          }
        }
      }
    }

    // Balls bump each other
    for (let i = 0; i < this.list.length; i++)
      for (let j = i + 1; j < this.list.length; j++) {
        const a = this.list[i], b = this.list[j];
        const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
        const min = a.r + b.r, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          n.set(dx / d, dy / d, dz / d);
          const push = (min - d) / 2;
          a.pos.addScaledVector(n, -push);
          b.pos.addScaledVector(n, push);
          const rv = (b.vel.x - a.vel.x) * n.x + (b.vel.y - a.vel.y) * n.y + (b.vel.z - a.vel.z) * n.z;
          if (rv < 0) {
            const ma = a.r ** 3, mb = b.r ** 3, j2 = (-1.8 * rv) / (1 / ma + 1 / mb);
            a.vel.addScaledVector(n, -j2 / ma);
            b.vel.addScaledVector(n, j2 / mb);
          }
        }
      }

    // Roll the meshes
    for (const b of this.list) {
      const v = b.vel, sp = Math.hypot(v.x, v.z);
      if (sp > 0.01) {
        this.axis.set(v.z, 0, -v.x).normalize();
        this.q.setFromAxisAngle(this.axis, (sp * dt) / b.r);
        b.mesh.quaternion.premultiply(this.q);
      }
      b.mesh.position.copy(b.pos);
    }
  }
}

export class Leaves {
  constructor(scene, trees, sound) {
    this.sound = sound;
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.07);
    shape.quadraticCurveTo(0.065, 0, 0, 0.08);
    shape.quadraticCurveTo(-0.065, 0, 0, -0.07);
    const geo = new THREE.ShapeGeometry(shape, 3);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });

    const piles = [];
    const picks = [...trees].sort(() => rng() - 0.5);
    for (const t of picks) {
      if (piles.length >= 5) break;
      const a = rand(0, 6.28), x = t.x + Math.cos(a) * 1.8, z = t.z + Math.sin(a) * 1.8;
      if (heightAt(x, z) < 0.5) continue;
      piles.push({ x, z });
    }
    const per = 80, count = piles.length * per;
    this.count = count;
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.receiveShadow = true;
    this.p = new Float32Array(count * 3);
    this.v = new Float32Array(count * 3);
    this.rot = new Float32Array(count * 3);
    this.spin = new Float32Array(count * 3);
    this.rest = new Uint8Array(count);
    const palette = [0xe8833a, 0xd9572e, 0xf2b84b, 0xc8692f, 0xb94a2c, 0xe9a23b];
    const col = new THREE.Color();
    let i = 0;
    for (const pile of piles) {
      for (let k = 0; k < per; k++, i++) {
        const a = rand(0, 6.28), d = Math.sqrt(rng()) * 1.3;
        const x = pile.x + Math.cos(a) * d, z = pile.z + Math.sin(a) * d;
        this.p[i * 3] = x;
        this.p[i * 3 + 1] = heightAt(x, z) + 0.02 + (1 - d / 1.3) * 0.22 * rng();
        this.p[i * 3 + 2] = z;
        this.rot[i * 3] = rand(-0.5, 0.5);
        this.rot[i * 3 + 1] = rand(0, 6.28);
        this.rot[i * 3 + 2] = rand(-0.5, 0.5);
        this.rest[i] = 1;
        this.mesh.setColorAt(i, col.setHex(palette[Math.floor(rng() * palette.length)]).offsetHSL(0, 0, rand(-0.05, 0.05)));
      }
    }
    this.dummy = new THREE.Object3D();
    for (let j = 0; j < count; j++) this.write(j);
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
    this.rustleCool = 0;
  }

  write(i) {
    const d = this.dummy;
    d.position.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
    d.rotation.set(this.rot[i * 3], this.rot[i * 3 + 1], this.rot[i * 3 + 2]);
    d.updateMatrix();
    this.mesh.setMatrixAt(i, d.matrix);
  }

  update(dt, t, pl, landed) {
    this.rustleCool -= dt;
    const px = pl.pos.x, pz = pl.pos.z;
    const pvx = Math.sin(pl.heading) * pl.speed, pvz = Math.cos(pl.heading) * pl.speed;
    let changed = false, kicked = 0;
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      if (this.rest[i]) {
        const dx = this.p[o] - px, dz = this.p[o + 2] - pz, d2 = dx * dx + dz * dz;
        const near = Math.abs(this.p[o + 1] - pl.pos.y) < 0.8;
        const kick = near && ((pl.speed > 1.2 && d2 < 0.8) || (landed && d2 < 4));
        if (!kick) continue;
        const d = Math.sqrt(d2) || 0.01;
        const power = landed ? 1.4 : 0.6 + pl.speed * 0.12;
        this.v[o] = (dx / d) * rand(0.5, 2) * power + pvx * 0.4 + rand(-0.6, 0.6);
        this.v[o + 1] = rand(1.5, 3.5) * power;
        this.v[o + 2] = (dz / d) * rand(0.5, 2) * power + pvz * 0.4 + rand(-0.6, 0.6);
        this.spin[o] = rand(-8, 8);
        this.spin[o + 1] = rand(-4, 4);
        this.spin[o + 2] = rand(-8, 8);
        this.rest[i] = 0;
        kicked++;
      }
      // Flutter down
      const v = this.v;
      v[o + 1] -= 6 * dt;
      const drag = Math.exp(-1.6 * dt);
      v[o] = v[o] * drag + Math.sin(t * 5 + i) * 1.2 * dt;
      v[o + 2] = v[o + 2] * drag + Math.cos(t * 4 + i * 1.7) * 1.2 * dt;
      if (v[o + 1] < -1.2) v[o + 1] = -1.2;
      this.p[o] += v[o] * dt;
      this.p[o + 1] += v[o + 1] * dt;
      this.p[o + 2] += v[o + 2] * dt;
      for (let k = 0; k < 3; k++) this.rot[o + k] += this.spin[o + k] * dt;
      const ground = Math.max(heightAt(this.p[o], this.p[o + 2]), WATER_Y) + 0.015;
      if (this.p[o + 1] <= ground && v[o + 1] < 0) {
        this.p[o + 1] = ground;
        this.rest[i] = 1;
        this.rot[o] = rand(-0.3, 0.3);
        this.rot[o + 2] = rand(-0.3, 0.3);
      }
      this.write(i);
      changed = true;
    }
    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
    if (kicked > 3 && this.rustleCool < 0) {
      this.sound.rustle(Math.min(1, kicked / 25));
      this.rustleCool = 0.3;
    }
  }
}

export class Butterflies {
  constructor(scene, spots) {
    this.list = [];
    const colors = [0xfff3a0, 0xffffff, 0xa8d8ff, 0xffb070, 0xf7b6ff];
    const bodyGeo = new THREE.CapsuleGeometry(0.012, 0.06, 3, 6);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b3030 });
    const wingGeo = new THREE.CircleGeometry(0.06, 10);
    wingGeo.scale(1, 1.25, 1);
    wingGeo.rotateX(-Math.PI / 2);
    const wr = wingGeo.clone().translate(0.058, 0, 0);
    const wl = wingGeo.clone().translate(-0.058, 0, 0);
    for (let i = 0; i < 16; i++) {
      const home = spots[i % spots.length];
      const mat = new THREE.MeshStandardMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, roughness: 0.6, emissive: colors[i % colors.length], emissiveIntensity: 0.15 });
      const g = new THREE.Group();
      g.add(new THREE.Mesh(bodyGeo, bodyMat));
      const R = new THREE.Group(), L = new THREE.Group();
      R.add(new THREE.Mesh(wr, mat));
      L.add(new THREE.Mesh(wl, mat));
      g.add(R, L);
      g.traverse((o) => (o.castShadow = o.isMesh));
      const x = home.x + rand(-2, 2), z = home.z + rand(-2, 2);
      g.position.set(x, heightAt(x, z) + 0.8, z);
      scene.add(g);
      this.list.push({ g, R, L, home, seed: rand(0, 100), vel: new THREE.Vector3(), flee: 0, fx: 0, fz: 0 });
    }
    this.tmp = new THREE.Vector3();
  }

  update(dt, t, pl) {
    for (const b of this.list) {
      const p = b.g.position, s = b.seed;
      const dx = p.x - pl.pos.x, dz = p.z - pl.pos.z, dy = p.y - pl.pos.y;
      const d = Math.hypot(dx, dz);
      if (b.flee <= 0 && d < 2.6 && dy < 2) {
        b.flee = rand(2, 3.5);
        b.fx = dx / (d || 1);
        b.fz = dz / (d || 1);
      }
      const ground = heightAt(p.x, p.z);
      const target = this.tmp;
      if (b.flee > 0) {
        b.flee -= dt;
        target.set(p.x + b.fx * 4, ground + 2.4, p.z + b.fz * 4);
      } else {
        target.set(
          b.home.x + Math.sin(t * 0.31 + s) * 3 + Math.sin(t * 0.83 + s * 2) * 1.2,
          ground + 0.55 + Math.sin(t * 0.7 + s * 3) * 0.35,
          b.home.z + Math.cos(t * 0.27 + s * 1.3) * 3 + Math.cos(t * 0.91 + s) * 1.2
        );
      }
      const max = b.flee > 0 ? 3.2 : 1.4;
      target.sub(p);
      const len = target.length();
      if (len > max) target.multiplyScalar(max / len);
      b.vel.lerp(target, Math.min(1, dt * 2));
      b.vel.y += Math.sin(t * 9 + s) * 0.5 * dt * 10;
      p.addScaledVector(b.vel, dt);
      if (p.y < ground + 0.2) p.y = ground + 0.2;
      b.g.rotation.y = Math.atan2(b.vel.x, b.vel.z);
      const flap = Math.sin(t * (b.flee > 0 ? 26 : 16) + s) * 0.9 + 0.2;
      b.R.rotation.z = flap;
      b.L.rotation.z = -flap;
    }
  }
}

export class Ripples {
  constructor(scene) {
    this.pool = [];
    const geo = new THREE.RingGeometry(0.85, 1, 40);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.pool.push({ m, life: 0, size: 1 });
    }
    this.i = 0;
  }
  spawn(x, z, size = 1) {
    const r = this.pool[this.i++ % this.pool.length];
    r.m.position.set(x, WATER_Y + 0.015, z);
    r.life = 1;
    r.size = size;
    r.m.visible = true;
  }
  update(dt) {
    for (const r of this.pool) {
      if (r.life <= 0) continue;
      r.life -= dt * 0.7;
      const s = (0.2 + (1 - r.life) * 1.3) * r.size;
      r.m.scale.set(s, 1, s);
      r.m.material.opacity = Math.max(0, r.life) * 0.45;
      if (r.life <= 0) r.m.visible = false;
    }
  }
}

export class Poof {
  constructor(scene) {
    this.parts = [];
    const geo = new THREE.IcosahedronGeometry(0.12, 1);
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.parts.push({ m, v: new THREE.Vector3(), life: 0 });
    }
  }
  spawn(pos) {
    for (const p of this.parts) {
      const a = rand(0, 6.28), u = rand(0.2, 1);
      p.v.set(Math.cos(a) * 2 * u, rand(0.8, 2.2), Math.sin(a) * 2 * u);
      p.m.position.set(pos.x, pos.y + 0.4, pos.z);
      p.life = 1;
      p.m.visible = true;
      p.m.material.color.setHSL(rand(0, 1), 0.7, 0.88);
    }
  }
  update(dt) {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt * 1.4;
      p.v.multiplyScalar(Math.exp(-3 * dt));
      p.m.position.addScaledVector(p.v, dt);
      p.m.scale.setScalar(0.6 + (1 - p.life) * 1.6);
      p.m.material.opacity = Math.max(0, p.life) * 0.85;
      if (p.life <= 0) p.m.visible = false;
    }
  }
}
