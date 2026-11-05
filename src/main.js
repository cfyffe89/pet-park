import * as THREE from 'three';
import { Input } from './input.js';
import { buildWorld, heightAt, WATER_Y, collide, clampPark } from './world.js';
import { Animal } from './animal.js';
import { FollowCam } from './camera.js';
import { Balls, Leaves, Butterflies, Ripples, Poof } from './props.js';
import { Sound } from './audio.js';
import { approach, approachAngle } from './math.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 900);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const sound = new Sound();
const world = buildWorld(scene);
const animal = new Animal('dog');
scene.add(animal.root);

const player = {
  pos: new THREE.Vector3(0, 0, 3),
  heading: 2.3,
  speed: 0,
  vy: 0,
  grounded: true,
  idle: 0,
  swimming: false,
  pitch: 0,
};
player.pos.y = heightAt(player.pos.x, player.pos.z);

const cam = new FollowCam(camera, player.heading);
const balls = new Balls(scene, sound);
const leaves = new Leaves(scene, world.trees, sound);
const butterflies = new Butterflies(scene, world.flowerSpots);
const ripples = new Ripples(scene);
const poof = new Poof(scene);
const input = new Input();
const hint = document.getElementById('hint');

let swapCool = 0, speakCool = 0, rippleT = 0, t = 0;
const clock = new THREE.Clock();
const focus = new THREE.Vector3();

addEventListener('keydown', (e) => {
  if (e.code === 'KeyF') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }
});

function frame() {
  step(Math.min(clock.getDelta(), 1 / 30));
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function step(dt) {
  t += dt;
  const inp = input.poll();

  // The first press starts the music. Browsers block sound until then.
  if (inp.any || inp.gesture) sound.start();
  if (inp.gesture && !document.fullscreenElement && !window.__noFullscreen)
    document.documentElement.requestFullscreen?.().catch(() => {});
  if (sound.running) hint.classList.add('gone');

  const k = animal.k;
  swapCool -= dt;
  speakCool -= dt;

  // --- Move, relative to the camera ---
  const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
  const wx = fx * inp.my - fz * inp.mx;
  const wz = fz * inp.my + fx * inp.mx;
  const m = Math.min(1, Math.hypot(wx, wz));

  const depth = WATER_Y - heightAt(player.pos.x, player.pos.z);
  const wasSwimming = player.swimming;
  player.swimming = depth > k.swimDepth * 0.8 && player.pos.y < WATER_Y + 0.1;
  const maxSpeed = k.speed * (player.swimming ? 0.5 : depth > 0 ? 0.8 : 1);

  if (m > 0.08) player.heading = approachAngle(player.heading, Math.atan2(wx, wz), 9 * dt);
  const target = m * maxSpeed;
  player.speed = approach(player.speed, target, (target > player.speed ? 10 : 8) * dt);

  player.pos.x += Math.sin(player.heading) * player.speed * dt;
  player.pos.z += Math.cos(player.heading) * player.speed * dt;
  collide(player.pos, k.radius);
  if (clampPark(player.pos, 0)) player.speed *= 0.9;

  // --- Up and down ---
  const ground = heightAt(player.pos.x, player.pos.z);
  const floorY = depth > 0 ? Math.max(ground, WATER_Y - k.swimDepth) : ground;
  let landed = false;
  if (inp.jump && player.grounded) {
    player.vy = player.swimming ? 4 : 5.5;
    player.grounded = false;
    sound.hop();
  }
  if (player.grounded) {
    player.pos.y = floorY;
  } else {
    player.vy -= 16 * dt;
    player.pos.y += player.vy * dt;
    if (player.pos.y <= floorY) {
      player.pos.y = floorY;
      if (player.vy < -3) {
        landed = true;
        if (depth > 0.05) {
          sound.splash(1);
          ripples.spawn(player.pos.x, player.pos.z, 1.6);
        } else sound.land();
      }
      player.vy = 0;
      player.grounded = true;
    }
  }
  if (player.swimming && !wasSwimming) {
    sound.splash(0.8);
    ripples.spawn(player.pos.x, player.pos.z, 1.3);
  }

  player.idle = player.speed < 0.2 && player.grounded && !inp.jump ? player.idle + dt : 0;

  // --- Buttons ---
  if (inp.speak && speakCool < 0) {
    animal.speak();
    animal.kind === 'dog' ? sound.bark() : sound.meow();
    speakCool = 0.6;
    player.idle = Math.min(player.idle, 3);
  }
  if (inp.swap && swapCool < 0) {
    animal.setKind(animal.kind === 'dog' ? 'cat' : 'dog');
    poof.spawn(player.pos);
    sound.swap();
    swapCool = 0.8;
    player.idle = 0;
  }
  cam.targetDist = animal.k.camDist;

  // --- Tilt with the slope ---
  const hf = heightAt(player.pos.x + Math.sin(player.heading) * 0.3, player.pos.z + Math.cos(player.heading) * 0.3);
  const hb = heightAt(player.pos.x - Math.sin(player.heading) * 0.3, player.pos.z - Math.cos(player.heading) * 0.3);
  const slope = player.swimming ? 0 : Math.atan2(hf - hb, 0.6);
  player.pitch += (slope - player.pitch) * Math.min(1, dt * 8);

  animal.root.position.copy(player.pos);
  animal.root.rotation.set(-player.pitch, player.heading, 0, 'YXZ');
  animal.update(dt, player, t);

  if (animal.stepped) sound.step(depth > 0.05);
  if (depth > 0.05 && (player.speed > 0.5 || player.swimming)) {
    rippleT -= dt;
    if (rippleT < 0) {
      ripples.spawn(player.pos.x, player.pos.z, 0.6 + player.speed * 0.08);
      rippleT = 0.35;
    }
  }

  // --- World ---
  balls.update(dt, player, k.radius);
  leaves.update(dt, t, player, landed);
  butterflies.update(dt, t, player);
  ripples.update(dt);
  poof.update(dt);

  focus.copy(player.pos);
  if (!player.grounded) focus.y = Math.min(focus.y, floorY + 0.6);
  cam.update(dt, focus, player.heading, player.speed / k.speed, inp);
  world.update(dt, t, player.pos, camera);
}
requestAnimationFrame(frame);

// For testing in a browser console: __game.sim(2) runs 2 seconds of game time, then draws.
window.__game = {
  player, animal, cam, balls, leaves, sound,
  sim(seconds) {
    for (let i = 0; i < seconds * 60; i++) step(1 / 60);
    renderer.render(scene, camera);
  },
};
