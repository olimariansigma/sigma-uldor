// On-foot demolition worker: character controller, animated model, hammer, carrying and throwing rubble.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { box, cyl, merge } from './pieces.js';
import { INTACT, LOOSE, CARRIED } from './demolition.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const HALF = 0.55, RAD = 0.3;

export class Player {
  constructor(scene, physics, M, spawn) {
    this.scene = scene; this.world = physics.world; this.M = M;
    this.pos = spawn.clone();
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI; this.bodyYaw = Math.PI;
    this.grounded = false;
    this.carried = [];
    this.capacity = 3; this.damage = 1; this.splash = 0; this.hammerLevel = 0;
    this.swingT = -1; this.cooldown = 0; this.pickTimer = 0; this.throwTimer = 0;
    this.walkPhase = 0;
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + HALF + RAD, spawn.z));
    this.collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(HALF, RAD).setFriction(0.2), this.body);
    this.cc = this.world.createCharacterController(0.03);
    this.cc.setUp({ x: 0, y: 1, z: 0 });
    this.cc.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(52));
    this.cc.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(40));
    this.cc.enableAutostep(0.4, 0.12, true);
    this.cc.enableSnapToGround(0.35);
    this.cc.setApplyImpulsesToDynamicBodies(true);
    this.cc.setCharacterMass(60);
    this.buildModel();
  }

  buildModel() {
    const M = this.M;
    const g = new THREE.Group(); this.model = g; this.scene.add(g);
    const shirt = new THREE.MeshStandardMaterial({ color: 0x5a6470, roughness: 0.9 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x9a7a3a, roughness: 0.85 });
    const capsule = (r, l, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 10), mat); m.castShadow = true; return m; };
    // legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.11, 0.95, 0); g.add(hip);
      const thigh = capsule(0.085, 0.34, M.denim); thigh.position.y = -0.22; hip.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -0.45; hip.add(knee);
      const shin = capsule(0.075, 0.32, M.denim); shin.position.y = -0.2; knee.add(shin);
      const boot = new THREE.Mesh(merge([box(0.13, 0.12, 0.27, 0, -0.43, 0.04), box(0.14, 0.035, 0.29, 0, -0.485, 0.04)]), M.boot); boot.castShadow = true; knee.add(boot);
      this.legs.push({ hip, knee });
    }
    // torso
    this.torso = new THREE.Group(); this.torso.position.y = 0.95; g.add(this.torso);
    const belly = new THREE.Mesh(merge([box(0.36, 0.14, 0.22, 0, 0.05, 0), box(0.4, 0.04, 0.24, 0, 0.0, 0)]), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.6 }));
    belly.castShadow = true; this.torso.add(belly);
    const chest = capsule(0.19, 0.28, shirt); chest.scale.set(1.05, 1, 0.68); chest.position.y = 0.33; this.torso.add(chest);
    const vest = capsule(0.2, 0.24, M.hiVis); vest.scale.set(1.07, 0.98, 0.72); vest.position.y = 0.31; this.torso.add(vest);
    for (const y of [0.2, 0.36]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.035, 20, 1, true), M.reflective);
      band.scale.set(1.07, 1, 0.73); band.position.y = y; this.torso.add(band);
    }
    // head
    this.head = new THREE.Group(); this.head.position.y = 0.66; this.torso.add(this.head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10), M.skin); neck.position.y = 0.02; this.head.add(neck);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 18, 14), M.skin); skull.scale.set(0.95, 1.08, 1); skull.position.y = 0.17; skull.castShadow = true; this.head.add(skull);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 6), M.skin); nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.16, 0.115); this.head.add(nose);
    const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.02), new THREE.MeshStandardMaterial({ color: 0x223, roughness: 0.1, metalness: 0.4 })); glasses.position.set(0, 0.19, 0.105); this.head.add(glasses);
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.hardhat); hat.position.y = 0.21; hat.scale.set(1, 0.95, 1.08); hat.castShadow = true; this.head.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.015, 20), M.hardhat); brim.scale.set(1, 1, 1.15); brim.position.set(0, 0.215, 0.02); this.head.add(brim);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.26), M.hardhat); ridge.position.set(0, 0.34, 0); this.head.add(ridge);
    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.25, 0.47, 0); this.torso.add(sh);
      const upper = capsule(0.07, 0.24, shirt); upper.position.y = -0.15; sh.add(upper);
      const elbow = new THREE.Group(); elbow.position.y = -0.31; sh.add(elbow);
      const fore = capsule(0.058, 0.22, M.skin); fore.position.y = -0.14; elbow.add(fore);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.07), glove); hand.position.y = -0.3; hand.castShadow = true; elbow.add(hand);
      this.arms.push({ sh, elbow, hand });
    }
    // hammer in the right hand
    this.hammer = new THREE.Group();
    this.hammer.position.set(0, -0.3, 0.0);
    this.arms[1].elbow.add(this.hammer);
    this.setHammerLevel(0);
  }

  setHammerLevel(level) {
    this.hammerLevel = level;
    while (this.hammer.children.length) this.hammer.remove(this.hammer.children[0]);
    const M = this.M;
    const handleMat = level >= 2 ? M.blackPaint : M.wood;
    const len = [0.62, 0.8, 0.9, 0.95][level];
    const head = [[0.16, 0.07, 0.07], [0.22, 0.09, 0.09], [0.28, 0.12, 0.12], [0.32, 0.14, 0.14]][level];
    const handle = new THREE.Mesh(cyl(0.022, 0.026, len, 10, 0, 0, 0, null, Math.PI / 2), handleMat);
    handle.position.z = len / 2 - 0.12; handle.castShadow = true;
    const hm = new THREE.Mesh(new THREE.BoxGeometry(head[1], head[0], head[2]), level === 3 ? M.paintYellow : M.darkSteel);
    hm.position.set(0, 0, len - 0.12); hm.castShadow = true;
    this.hammer.add(handle, hm);
    if (level >= 1) { const grip = new THREE.Mesh(cyl(0.03, 0.03, 0.18, 10, 0, 0, 0.0, null, Math.PI / 2), M.rubber); this.hammer.add(grip); }
    this.hammerHead = hm;
  }

  setVisible(v) { this.model.visible = v; }

  teleport(p) {
    this.pos.copy(p);
    this.body.setTranslation({ x: p.x, y: p.y + HALF + RAD, z: p.z }, true);
    this.vel.set(0, 0, 0);
  }

  // ---------- per frame ----------
  update(dt, input, camYaw, aim, demo, crusher, fx, audio) {
    const mx = input.moveX, mz = input.moveY;
    const run = input.held('sprint');
    const speed = (run ? 6.8 : 4.3) * (this.carried.length > this.capacity * 0.7 ? 0.85 : 1);
    const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3().addScaledVector(fwd, mz).addScaledVector(right, mx);
    if (wish.lengthSq() > 1) wish.normalize();
    const accel = this.grounded ? 14 : 4;
    this.vel.x += (wish.x * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wish.z * speed - this.vel.z) * Math.min(1, accel * dt);
    this.vel.y -= 22 * dt;
    if (this.grounded && this.vel.y < 0) this.vel.y = -1;
    if (this.grounded && input.pressed('jump')) { this.vel.y = 7.2; this.grounded = false; }
    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    this.cc.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const mv = this.cc.computedMovement();
    this.grounded = this.cc.computedGrounded();
    if (this.grounded && this.vel.y < 0) this.vel.y = -1;
    if (!this.grounded && mv.y > desired.y + 0.001 && this.vel.y > 0) this.vel.y = 0; // bumped head
    const t = this.body.translation();
    const np = { x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z };
    if (np.y < -5) { np.x = 4; np.y = 2; np.z = 15; this.vel.set(0, 0, 0); }
    this.body.setNextKinematicTranslation(np);
    this.pos.set(np.x, np.y - HALF - RAD, np.z);

    // facing
    const moving = wish.lengthSq() > 0.01;
    if (moving || this.swingT >= 0 || this.carried.length) {
      const target = this.swingT >= 0 || !moving ? camYaw + Math.PI : Math.atan2(wish.x, wish.z);
      let d = target - this.bodyYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.bodyYaw += d * Math.min(1, dt * 12);
    }

    // ---------- actions ----------
    this.cooldown -= dt;
    this.target = this.aimPiece(aim, demo);
    if (input.held('hammer') && this.swingT < 0 && this.cooldown <= 0 && !this.carried.length) {
      this.swingT = 0; this.hitDone = false;
    }
    if (this.swingT >= 0) {
      this.swingT += dt / ([0.5, 0.48, 0.52, 0.42][this.hammerLevel]);
      if (this.swingT > 0.55 && !this.hitDone) { this.hitDone = true; this.strike(aim, demo, fx, audio); }
      if (this.swingT >= 1) { this.swingT = -1; this.cooldown = 0.05; }
    }
    // pick up
    this.pickTimer -= dt;
    if (input.held('pickup') && this.pickTimer <= 0 && this.carried.length < this.capacity) {
      this.pickTimer = 0.16;
      let p = this.target && this.target.state === LOOSE ? this.target : null;
      if (!p) {
        const near = demo.piecesInSphere(_v.copy(this.pos).add(new THREE.Vector3(0, 0.6, 0)), 2.4, [LOOSE]);
        near.sort((a, b) => a.pos.distanceToSquared(this.pos) - b.pos.distanceToSquared(this.pos));
        p = near[0];
      }
      if (p && demo.carry(p)) { this.carried.push(p); audio.pickup(p.pos); }
    }
    // throw
    this.throwTimer -= dt;
    if (input.held('throw') && this.throwTimer <= 0 && this.carried.length) {
      this.throwTimer = 0.2;
      this.throwOne(aim, demo, crusher, audio);
    }
    this.animate(dt, moving ? Math.hypot(this.vel.x, this.vel.z) : 0);
    this.placeCarried(demo);
  }

  aimPiece(aim, demo) {
    const ray = new RAPIER.Ray(aim.origin, aim.dir);
    const hit = this.world.castRay(ray, aim.max, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
    if (!hit) return null;
    const p = demo.pieceFromCollider(hit.collider);
    if (!p) return null;
    const point = new THREE.Vector3(aim.origin.x + aim.dir.x * hit.timeOfImpact, aim.origin.y + aim.dir.y * hit.timeOfImpact, aim.origin.z + aim.dir.z * hit.timeOfImpact);
    const chest = this.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
    if (point.distanceTo(chest) > 3.0) return null;
    this.aimPoint = point;
    return p;
  }

  strike(aim, demo, fx, audio) {
    const p = this.aimPiece(aim, demo);
    const dir = new THREE.Vector3(aim.dir.x, aim.dir.y, aim.dir.z);
    if (!p) { audio.hammer(this.pos, false); return; }
    const point = this.aimPoint.clone();
    demo.damage(p, this.damage, point, dir, 3 + this.hammerLevel);
    if (this.splash > 0) {
      const extra = demo.piecesInSphere(point, this.splash, [INTACT]).filter((q) => q !== p);
      for (const q of extra.slice(0, 6)) demo.damage(q, Math.max(1, this.damage - 1), q.pos, dir, 2);
    }
    audio.hammer(point, true);
    audio.impact(p.type.sound, 0.7, point);
    this.shake = 0.18;
  }

  throwOne(aim, demo, crusher, audio) {
    const p = this.carried.pop();
    const from = this.pos.clone().add(new THREE.Vector3(0, 1.75, 0)).addScaledVector(new THREE.Vector3(Math.sin(this.bodyYaw), 0, Math.cos(this.bodyYaw)), 0.95);
    let vel;
    const tgt = crusher.feedTarget.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 1.6));
    const toT = tgt.clone().sub(from);
    const dist = toT.length();
    const look = new THREE.Vector3(aim.dir.x, 0, aim.dir.z).normalize();
    const facing = look.dot(new THREE.Vector3(toT.x, 0, toT.z).normalize());
    if (dist < 11 && facing > 0.35) {
      // ballistic lob that always clears the hopper rim
      const g = 9.81, apex = Math.max(from.y, tgt.y) + 1.4;
      const vy = Math.sqrt(2 * g * (apex - from.y));
      const T = vy / g + Math.sqrt(2 * (apex - tgt.y) / g);
      vel = new THREE.Vector3(toT.x / T, vy, toT.z / T);
    } else {
      vel = new THREE.Vector3(aim.dir.x, aim.dir.y + 0.25, aim.dir.z).normalize().multiplyScalar(8.5);
    }
    vel.add(new THREE.Vector3(this.vel.x, 0, this.vel.z));
    demo.throwPiece(p, from, vel, { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 });
    audio.throwSnd(from);
  }

  dropAll(demo) {
    while (this.carried.length) {
      const p = this.carried.pop();
      const from = this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.0 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6));
      demo.throwPiece(p, from, new THREE.Vector3(0, 0, 0));
    }
  }

  placeCarried(demo) {
    if (!this.carried.length) return;
    const base = this.model.localToWorld(new THREE.Vector3(0, 1.2, 0.48));
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.bodyYaw);
    let y = 0;
    this.carried.forEach((p, i) => {
      const big = Math.max(p.size.x, p.size.y, p.size.z);
      const s = Math.min(1, 0.75 / big);
      if (i >= 5) { demo.placeCarried(p, base, q, 0); return; }
      const h = Math.min(p.size.x, p.size.y, p.size.z) * s;
      const pos = base.clone().add(new THREE.Vector3(0, y + h / 2, 0));
      y += h + 0.01;
      // lay flat-ish, long axis sideways
      const qq = q.clone();
      if (p.size.y > p.size.x) qq.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
      demo.placeCarried(p, pos, qq, s);
    });
  }

  animate(dt, speed) {
    this.model.position.copy(this.pos);
    this.model.rotation.y = this.bodyYaw;
    const [L, R] = this.legs;
    const [AL, AR] = this.arms;
    if (this.grounded && speed > 0.3) this.walkPhase += dt * (2.2 + speed * 1.25);
    const amp = this.grounded ? Math.min(1, speed / 5) : 0;
    const s = Math.sin(this.walkPhase);
    L.hip.rotation.x = s * 0.65 * amp; R.hip.rotation.x = -s * 0.65 * amp;
    L.knee.rotation.x = Math.max(0, -Math.cos(this.walkPhase)) * 0.9 * amp; R.knee.rotation.x = Math.max(0, Math.cos(this.walkPhase)) * 0.9 * amp;
    if (!this.grounded) { L.hip.rotation.x = -0.5; R.hip.rotation.x = 0.2; L.knee.rotation.x = 0.9; R.knee.rotation.x = 0.4; }
    this.torso.position.y = 0.95 + Math.abs(Math.cos(this.walkPhase)) * 0.04 * amp;
    this.torso.rotation.y = 0; this.torso.rotation.x = speed > 5 ? 0.12 : 0.03;
    this.hammer.visible = !this.carried.length;
    if (this.carried.length) {
      AL.sh.rotation.set(-1.25, 0, 0.12); AR.sh.rotation.set(-1.25, 0, -0.12);
      AL.elbow.rotation.x = -0.35; AR.elbow.rotation.x = -0.35;
    } else if (this.swingT >= 0) {
      const t = this.swingT;
      let a;
      if (t < 0.45) a = THREE.MathUtils.lerp(-0.2, -2.9, easeOut(t / 0.45));
      else if (t < 0.6) a = THREE.MathUtils.lerp(-2.9, -0.55, (t - 0.45) / 0.15);
      else a = THREE.MathUtils.lerp(-0.55, -0.3, (t - 0.6) / 0.4);
      AR.sh.rotation.set(a, 0, -0.1); AR.elbow.rotation.x = t < 0.45 ? -0.6 : -0.15;
      AL.sh.rotation.set(a * 0.85, 0, 0.35); AL.elbow.rotation.x = -0.4;
      this.torso.rotation.x = t < 0.45 ? -0.08 : 0.25;
      this.hammer.rotation.x = -0.3;
    } else {
      AL.sh.rotation.set(-s * 0.55 * amp, 0, 0.08); AR.sh.rotation.set(s * 0.45 * amp - 0.25, 0, -0.08);
      AL.elbow.rotation.x = -0.25; AR.elbow.rotation.x = -0.55;
      this.hammer.rotation.x = 0.9;
    }
  }
}

function easeOut(t) { return 1 - (1 - t) * (1 - t); }
