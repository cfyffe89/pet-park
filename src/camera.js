// A calm follow camera. It drifts behind the animal and never needs the right stick.
import * as THREE from 'three';
import { heightAt, colliders } from './world.js';
import { clamp, wrapAngle } from './math.js';

export class FollowCam {
  constructor(camera, yaw) {
    this.cam = camera;
    this.yaw = yaw;
    this.pitch = 0.3;
    this.dist = 6;
    this.targetDist = 6;
    this.lift = this.targetLift = 0.45; // how far above the feet the camera looks (more for tall characters)
    this.focus = new THREE.Vector3();
    this.first = true;
    this.manualT = 0;
    this.tmp = new THREE.Vector3();
  }

  update(dt, target, heading, speedFrac, inp) {
    if (Math.abs(inp.cx) > 0.01 || Math.abs(inp.cy) > 0.01) {
      this.yaw -= inp.cx * 2.2 * dt;
      this.pitch = clamp(this.pitch - inp.cy * 1.2 * dt, 0.12, 0.85);
      this.manualT = 2.5;
    } else {
      this.manualT -= dt;
    }

    // Swing slowly behind the animal while it runs (not when it runs toward the camera).
    if (this.manualT <= 0 && speedFrac > 0.15) {
      const d = wrapAngle(heading - this.yaw);
      if (Math.abs(d) < 2.0) this.yaw += d * Math.min(1, 1.1 * speedFrac * dt);
    }

    // Move closer when a tree trunk is between the camera and the animal.
    const cp0 = Math.cos(this.pitch);
    const dx = -Math.sin(this.yaw), dz = -Math.cos(this.yaw);
    let want = this.targetDist;
    for (const c of colliders) {
      if (!c.tall) continue;
      const vx = c.x - target.x, vz = c.z - target.z;
      const s = vx * dx + vz * dz;
      if (s <= 0 || s > cp0 * want + 0.6) continue;
      const px = vx - dx * s, pz = vz - dz * s;
      if (px * px + pz * pz < (c.r + 0.35) ** 2) want = Math.min(want, (s - c.r - 0.45) / cp0);
    }
    want = Math.max(want, 1.3);
    const rate = want < this.dist ? 10 : 1.5;
    this.dist += (want - this.dist) * Math.min(1, dt * rate);

    if (this.first) {
      this.focus.copy(target);
      this.first = false;
    } else {
      const f = 1 - Math.exp(-6 * dt), fy = 1 - Math.exp(-3 * dt);
      this.focus.x += (target.x - this.focus.x) * f;
      this.focus.z += (target.z - this.focus.z) * f;
      this.focus.y += (target.y - this.focus.y) * fy;
    }

    this.lift += (this.targetLift - this.lift) * Math.min(1, dt * 3);
    const cp = Math.cos(this.pitch);
    const p = this.tmp.set(
      this.focus.x - Math.sin(this.yaw) * cp * this.dist,
      this.focus.y + Math.sin(this.pitch) * this.dist + this.lift - 0.05,
      this.focus.z - Math.cos(this.yaw) * cp * this.dist
    );
    const minY = heightAt(p.x, p.z) + 0.8;
    if (p.y < minY) p.y = minY;
    this.cam.position.copy(p);
    this.cam.lookAt(this.focus.x, this.focus.y + this.lift, this.focus.z);
  }
}
