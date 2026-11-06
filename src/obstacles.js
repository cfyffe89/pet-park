// Things the animal can stand on: stumps, logs, rocks and platforms.
// Seen from above, each one is a circle or a turned box. Each has a flat top at height `top`.
// This file has no imports, so world.js, props.js and main.js can all use it.

export const obstacles = [];

export const STEP_UP = 0.3; // the animal walks up anything this low, with no hop
const GRACE = 0.3;          // the animal can stand this far past an edge, so it does not slip off

export function addCircle(x, z, r, top) {
  obstacles.push({ box: false, x, z, r, top });
}

// angle is the same as a three.js rotation.y
export function addBox(x, z, hx, hz, angle, top) {
  obstacles.push({ box: true, x, z, hx, hz, c: Math.cos(angle), s: Math.sin(angle), top });
}

// Distance from (x, z) to the edge of o, negative inside. Puts the outward direction in N.
const N = { x: 0, z: 0 };
function edgeDist(o, x, z) {
  const dx = x - o.x, dz = z - o.z;
  if (!o.box) {
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) {
      N.x = dx / d;
      N.z = dz / d;
    } else {
      N.x = 1;
      N.z = 0;
    }
    return d - o.r;
  }
  const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
  const qx = Math.abs(lx) - o.hx, qz = Math.abs(lz) - o.hz;
  let nx, nz, d;
  if (qx > 0 || qz > 0) {
    const ox = Math.max(qx, 0) * Math.sign(lx), oz = Math.max(qz, 0) * Math.sign(lz);
    d = Math.hypot(ox, oz);
    nx = ox / d;
    nz = oz / d;
  } else if (qx > qz) {
    d = qx;
    nx = Math.sign(lx) || 1;
    nz = 0;
  } else {
    d = qz;
    nx = 0;
    nz = Math.sign(lz) || 1;
  }
  N.x = nx * o.c + nz * o.s;
  N.z = -nx * o.s + nz * o.c;
  return d;
}

// The highest top at (x, z) that feet at feetY can stand on (feet may be a little below it).
// Returns -Infinity when there is none.
export function standTop(x, z, feetY, grace = GRACE, stepUp = STEP_UP) {
  let best = -Infinity;
  for (const o of obstacles) {
    if (o.top > feetY + stepUp || o.top <= best) continue;
    if (edgeDist(o, x, z) < grace) best = o.top;
  }
  return best;
}

// Push pos out of the sides of anything too tall to step onto.
// With vel, it also bounces the velocity (for balls). Returns the lowest thing that blocked, or null.
export function pushOut(pos, r, feetY, stepUp = STEP_UP, vel = null) {
  let blocked = null;
  for (const o of obstacles) {
    if (o.top <= feetY + stepUp) continue;
    const d = edgeDist(o, pos.x, pos.z);
    if (d >= r) continue;
    pos.x += N.x * (r - d);
    pos.z += N.z * (r - d);
    if (vel) {
      const vn = vel.x * N.x + vel.z * N.z;
      if (vn < 0) {
        vel.x -= 1.6 * vn * N.x;
        vel.z -= 1.6 * vn * N.z;
      }
    }
    if (!blocked || o.top < blocked.top) blocked = o;
  }
  return blocked;
}

// For placing trees, grass and flowers: is (x, z) within margin of any obstacle?
export function nearObstacle(x, z, margin) {
  for (const o of obstacles) if (edgeDist(o, x, z) < margin) return true;
  return false;
}
