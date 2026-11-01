// Local player: character controller, aiming, hammer swings, picking up and throwing blocks.
// Actions are routed through game.act() so they work in solo, as host and as a client.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { LOOSE, INTACT } from './demolition.js';
import { Avatar } from './avatar.js';

const HALF = 0.55, RAD = 0.3;

export class Player {
  constructor(game, spawn, shirt) {
    this.game = game; this.world = game.physics.world;
    this.pos = spawn.clone(); this.vel = new THREE.Vector3();
    this.bodyYaw = Math.PI; this.grounded = false;
    this.swingT = -1; this.cooldown = 0; this.pickTimer = 0; this.throwTimer = 0; this.shake = 0;
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
    this.avatar = new Avatar(game.scene, { shirt });
  }

  setEnabled(v) { this.body.setEnabled(v); this.avatar.group.visible = v; }
  teleport(p) {
    this.pos.copy(p);
    this.body.setTranslation({ x: p.x, y: p.y + HALF + RAD, z: p.z }, true);
    this.vel.set(0, 0, 0);
  }

  update(dt, input, camYaw, aim) {
    const g = this.game;
    const mx = input.moveX, mz = input.moveY;
    const carried = g.carriedBy(g.myId);
    const speed = (input.held('sprint') ? 6.8 : 4.3) * (carried.length > g.settings.carry * 0.7 ? 0.85 : 1);
    const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3().addScaledVector(fwd, mz).addScaledVector(right, mx);
    if (wish.lengthSq() > 1) wish.normalize();
    const inWaterNow = g.inWater(this.pos.x, this.pos.y + 0.6, this.pos.z);
    const accel = this.grounded ? 14 : 4;
    const sp = inWaterNow ? speed * 0.5 : speed;
    this.vel.x += (wish.x * sp - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wish.z * sp - this.vel.z) * Math.min(1, accel * dt);
    this.vel.y -= (inWaterNow ? 6 : 22) * dt;
    if (inWaterNow) this.vel.y = Math.max(this.vel.y, -1.5);
    if (this.grounded && this.vel.y < 0) this.vel.y = -1;
    if ((this.grounded || inWaterNow) && input.pressed('jump')) { this.vel.y = inWaterNow ? 4 : 7.2; this.grounded = false; }
    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    this.cc.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const mv = this.cc.computedMovement();
    this.grounded = this.cc.computedGrounded();
    if (this.grounded && this.vel.y < 0) this.vel.y = -1;
    if (!this.grounded && mv.y > desired.y + 0.001 && this.vel.y > 0) this.vel.y = 0;
    const t = this.body.translation();
    const np = { x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z };
    if (np.y < -8) { const s = g.spawnPoint(); np.x = s.x; np.y = s.y + 1; np.z = s.z; this.vel.set(0, 0, 0); }
    this.body.setNextKinematicTranslation(np);
    this.pos.set(np.x, np.y - HALF - RAD, np.z);

    const moving = wish.lengthSq() > 0.01;
    if (moving || this.swingT >= 0 || carried.length) {
      const target = this.swingT >= 0 || !moving ? camYaw + Math.PI : Math.atan2(wish.x, wish.z);
      let d = target - this.bodyYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.bodyYaw += d * Math.min(1, dt * 12);
    }

    // ---- actions
    this.cooldown -= dt;
    this.target = this.aimPiece(aim);
    if (input.held('hammer') && this.swingT < 0 && this.cooldown <= 0 && !carried.length) { this.swingT = 0; this.hitDone = false; }
    if (this.swingT >= 0) {
      this.swingT += dt / [0.5, 0.46, 0.5, 0.4][g.settings.hammer];
      if (this.swingT > 0.55 && !this.hitDone) { this.hitDone = true; this.strike(aim); }
      if (this.swingT >= 1) { this.swingT = -1; this.cooldown = 0.05; }
    }
    this.pickTimer -= dt;
    if (input.held('pickup') && this.pickTimer <= 0 && carried.length + (this.pending || 0) < g.settings.carry) {
      this.pickTimer = 0.16;
      let p = this.target && this.target.state === LOOSE ? this.target : null;
      if (!p) {
        const near = g.demo.piecesInSphere(this.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 2.4, [LOOSE]);
        near.sort((a, b) => a.pos.distanceToSquared(this.pos) - b.pos.distanceToSquared(this.pos));
        p = near.find((q) => !this.requested || !this.requested.has(q.id));
      }
      if (p) {
        this.requested = this.requested || new Set(); this.requested.add(p.id);
        setTimeout(() => this.requested && this.requested.delete(p.id), 1500);
        g.act('pickup', { id: p.id });
        g.audio.pickup(p.pos);
      }
    }
    this.throwTimer -= dt;
    if (input.held('throw') && this.throwTimer <= 0 && carried.length) { this.throwTimer = 0.2; this.throwOne(aim, carried[carried.length - 1]); }

    this.avatar.group.position.copy(this.pos);
    this.avatar.group.rotation.y = this.bodyYaw;
    this.avatar.animate(dt, { speed: moving ? Math.hypot(this.vel.x, this.vel.z) : 0, grounded: this.grounded, swingT: this.swingT, carrying: carried.length > 0, bucket: !!g.bucket.kind });
  }

  aimPiece(aim) {
    const ray = new RAPIER.Ray(aim.origin, aim.dir);
    const hit = this.world.castRay(ray, aim.max, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
    if (!hit) return null;
    const p = this.game.demo.pieceFromCollider(hit.collider);
    if (!p) return null;
    const point = new THREE.Vector3(aim.origin.x + aim.dir.x * hit.timeOfImpact, aim.origin.y + aim.dir.y * hit.timeOfImpact, aim.origin.z + aim.dir.z * hit.timeOfImpact);
    if (point.distanceTo(this.pos.clone().add(new THREE.Vector3(0, 1.1, 0))) > 3.0) return null;
    this.aimPoint = point;
    return p;
  }

  strike(aim) {
    const g = this.game;
    const p = this.aimPiece(aim);
    if (!p) { g.audio.hammer(this.pos, false); return; }
    g.act('hit', { id: p.id, point: this.aimPoint.toArray(), dir: [aim.dir.x, aim.dir.y, aim.dir.z] });
    g.audio.hammer(this.aimPoint, true);
    this.shake = 0.18;
  }

  throwOne(aim, p) {
    const g = this.game;
    const from = this.pos.clone().add(new THREE.Vector3(0, 1.75, 0)).addScaledVector(new THREE.Vector3(Math.sin(this.bodyYaw), 0, Math.cos(this.bodyYaw)), 0.95);
    const tgt = g.crusher.feedTarget.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 1.6));
    const toT = tgt.clone().sub(from);
    const look = new THREE.Vector3(aim.dir.x, 0, aim.dir.z).normalize();
    const facing = look.dot(new THREE.Vector3(toT.x, 0, toT.z).normalize());
    let vel;
    if (toT.length() < 11 && facing > 0.35) {
      const grav = 9.81, apex = Math.max(from.y, tgt.y) + 1.4;
      const vy = Math.sqrt(2 * grav * (apex - from.y));
      const T = vy / grav + Math.sqrt(2 * (apex - tgt.y) / grav);
      vel = new THREE.Vector3(toT.x / T, vy, toT.z / T);
    } else vel = new THREE.Vector3(aim.dir.x, aim.dir.y + 0.25, aim.dir.z).normalize().multiplyScalar(8.5);
    vel.add(new THREE.Vector3(this.vel.x, 0, this.vel.z));
    g.act('throw', { id: p.id, pos: from.toArray(), vel: vel.toArray(), spin: [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6] });
    g.audio.throwSnd(from);
  }
}
