import * as THREE from 'three';
import { Input } from './input.js';
import { buildWorld, heightAt, WATER_Y, collide, clampPark } from './world.js';
import { Animal, ORDER } from './animal.js';
import { FollowCam } from './camera.js';
import { Balls, Leaves, Butterflies, Ripples, Poof } from './props.js';
import { Sound } from './audio.js';
import { City } from './city.js';
import { buildPlatforms } from './platforms.js';
import { standTop, pushOut, obstacles } from './obstacles.js';
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
const platforms = buildPlatforms(scene); // before the world, so trees and grass keep clear
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
  onTop: false, // standing on a stump, log, rock or platform
  coyote: 0,    // a hop still works for a moment after walking off an edge
  jumpBuf: 0,   // a hop pressed just before landing still happens
  climbT: 0,    // time spent pushing into something; then the animal scrambles up by itself
  visY: 0,
  lastFloor: 0,
};
player.pos.y = heightAt(player.pos.x, player.pos.z);

const cam = new FollowCam(camera, player.heading);
const balls = new Balls(scene, sound);
const leaves = new Leaves(scene, world.trees, sound);
const butterflies = new Butterflies(scene, world.flowerSpots);
const ripples = new Ripples(scene);
const poof = new Poof(scene);
const city = new City(scene, sound, [animal.root]); // reached through the gate at the park edge
const input = new Input();
const hint = document.getElementById('hint');
// Ask for fullscreen once, on the first gesture. After that only F toggles it,
// so leaving fullscreen (F or Esc) sticks and later presses don't pull it back.
let autoFullscreenDone = !!window.__noFullscreen;
input.onGesture = (e) => {
  sound.start();
  if (autoFullscreenDone) return;
  autoFullscreenDone = true;
  // F has its own handler below; requesting here too would double up.
  if (e?.code === 'KeyF') return;
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
};

let swapCool = 0, speakCool = 0, rippleT = 0, t = 0, hello = 0;
const clock = new THREE.Clock();
const focus = new THREE.Vector3();

addEventListener('keydown', (e) => {
  if (e.code === 'KeyF' && !e.repeat) {
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
  if (inp.any) sound.start();
  if (sound.running) hint.classList.add('gone');

  const k = animal.k;
  swapCool -= dt;
  speakCool -= dt;

  // --- Move, relative to the camera ---
  const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
  const wx = fx * inp.my - fz * inp.mx;
  const wz = fz * inp.my + fx * inp.mx;
  const m = Math.min(1, Math.hypot(wx, wz));

  const depth = player.onTop ? -1 : WATER_Y - heightAt(player.pos.x, player.pos.z);
  const wasSwimming = player.swimming;
  player.swimming = depth > k.swimDepth * 0.8 && player.pos.y < WATER_Y + 0.1;
  const maxSpeed = k.speed * (player.swimming ? 0.5 : depth > 0 ? 0.8 : 1);

  if (m > 0.08) player.heading = approachAngle(player.heading, Math.atan2(wx, wz), 9 * dt);
  const target = m * maxSpeed;
  player.speed = approach(player.speed, target, (target > player.speed ? 10 : 8) * dt);

  player.pos.x += Math.sin(player.heading) * player.speed * dt;
  player.pos.z += Math.cos(player.heading) * player.speed * dt;
  collide(player.pos, k.radius);
  const blocker = pushOut(player.pos, k.radius, player.pos.y);
  if (clampPark(player.pos, 0)) player.speed *= 0.9;

  // --- Up and down ---
  const ground = heightAt(player.pos.x, player.pos.z);
  const wet = WATER_Y - ground;
  let floorY = wet > 0 ? Math.max(ground, WATER_Y - k.swimDepth) : ground;
  // While rising from a hop, only the ground counts. Tops count when standing or falling.
  const top = player.grounded || player.vy <= 0 ? standTop(player.pos.x, player.pos.z, player.pos.y) : -Infinity;
  const onTop = top > floorY;
  if (onTop) floorY = top;
  let landed = false;

  // Walked off an edge: fall.
  if (player.grounded && floorY < player.pos.y - 0.15) {
    player.grounded = false;
    player.vy = 0;
  }

  player.jumpBuf = inp.jump ? JUMP_BUFFER : player.jumpBuf - dt;
  if (player.jumpBuf > 0 && (player.grounded || player.coyote > 0)) {
    player.vy = player.swimming ? 4 : 5.5;
    player.grounded = false;
    player.jumpBuf = 0;
    player.coyote = 0;
    sound.hop();
  }

  // Pushing into a stump or step for a moment: scramble up it.
  const climbH = blocker ? blocker.top - player.pos.y : 99;
  if (AUTO_CLIMB > 0 && m > 0.5 && player.grounded && climbH < AUTO_CLIMB_MAX) {
    player.climbT += dt;
    if (player.climbT > AUTO_CLIMB) {
      player.vy = Math.sqrt(2 * 16 * (climbH + 0.25));
      player.grounded = false;
      player.climbT = 0;
      sound.hop();
    }
  } else player.climbT = 0;

  if (player.grounded) {
    player.pos.y = floorY;
  } else {
    player.vy -= 16 * dt;
    player.pos.y += player.vy * dt;
    if (player.pos.y <= floorY) {
      player.pos.y = floorY;
      if (player.vy < -3) {
        landed = true;
        if (wet > 0.05 && !onTop) {
          sound.splash(1);
          ripples.spawn(player.pos.x, player.pos.z, 1.6);
        } else sound.land();
      } else if (onTop && player.vy < -1) sound.land();
      if (onTop && !player.onTop) animal.happyT = Math.max(animal.happyT, 1.2); // tail wag
      player.vy = 0;
      player.grounded = true;
    }
  }
  player.coyote = player.grounded ? COYOTE : player.coyote - dt;
  player.onTop = onTop && player.grounded;
  if (player.grounded) player.lastFloor = floorY;
  if (player.swimming && !wasSwimming) {
    sound.splash(0.8);
    ripples.spawn(player.pos.x, player.pos.z, 1.3);
  }

  player.idle = player.speed < 0.2 && player.grounded && !inp.jump ? player.idle + dt : 0;

  // --- Buttons ---
  // After a change, the new character says hello by itself, so it is clear what it is.
  if (hello > 0) {
    hello -= dt;
    if (hello <= 0) {
      inp.speak = true;
      speakCool = -1;
    }
  }
  if (inp.speak && speakCool < 0) {
    animal.speak();
    sound[animal.k.voice]();
    speakCool = Math.max(0.6, animal.k.speakLen * 0.8);
    player.idle = Math.min(player.idle, 3);
  }
  // Y goes to the next character: dog, cat, pig, horse ... and back to the dog.
  if (inp.swap && swapCool < 0) {
    animal.setKind(ORDER[(ORDER.indexOf(animal.kind) + 1) % ORDER.length]);
    poof.spawn(player.pos);
    sound.swap();
    swapCool = 0.6;
    hello = 0.35;
    player.idle = 0;
  }
  cam.targetDist = animal.k.camDist;
  cam.targetLift = animal.k.camLift;

  // --- Tilt with the slope ---
  const hf = heightAt(player.pos.x + Math.sin(player.heading) * 0.3, player.pos.z + Math.cos(player.heading) * 0.3);
  const hb = heightAt(player.pos.x - Math.sin(player.heading) * 0.3, player.pos.z - Math.cos(player.heading) * 0.3);
  const slope = player.swimming || player.onTop ? 0 : Math.atan2(hf - hb, 0.6);
  player.pitch += (slope - player.pitch) * Math.min(1, dt * 8);

  // Step up smoothly instead of popping up.
  const dy = player.pos.y - player.visY;
  player.visY = player.grounded && dy > 0.08 ? player.visY + dy * Math.min(1, dt * 22) : player.pos.y;
  animal.root.position.set(player.pos.x, player.visY, player.pos.z);
  animal.root.rotation.set(-player.pitch, player.heading, 0, 'YXZ');
  animal.update(dt, player, t);

  if (animal.stepped) animal.k.heavy && depth <= 0.05 ? sound.stomp() : sound.step(depth > 0.05);
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
  if (!player.grounded) focus.y = Math.min(focus.y, Math.max(floorY, player.lastFloor) + 0.6);
  cam.update(dt, focus, player.heading, player.speed / k.speed, inp);
  world.update(dt, t, player.pos, camera);
  city.update(dt, t, player, cam);
  platforms.update(dt, t);
}
requestAnimationFrame(frame);

// Forgiving platforming for small children.
const COYOTE = 0.18, JUMP_BUFFER = 0.25;
const AUTO_CLIMB = 0.45;      // seconds of pushing into a step before the animal hops up by itself (0 = off)
const AUTO_CLIMB_MAX = 1.05;  // the highest step it will hop up by itself

// For testing in a browser console: __game.sim(2) runs 2 seconds of game time, then draws.
window.__game = {
  player, animal, cam, balls, leaves, sound, city, obstacles, step,
  sim(seconds) {
    for (let i = 0; i < seconds * 60; i++) step(1 / 60);
    renderer.render(scene, camera);
  },
};
