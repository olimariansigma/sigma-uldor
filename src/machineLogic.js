// Authority-side machine interactions: anything a moving arm / blade / ball touches breaks loose, grabbing,
// scooping, bulk material (dust, water, cement), breaker, crusher bucket, roller compaction, paving, wrecking ball.
import * as THREE from 'three';
import { paintOf } from './mx-vehicles.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { INTACT, LOOSE, HELD, machineBit } from './demolition.js';
import { inWater, terrainHeight } from './site.js';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const WATER_COL = new THREE.Color(0x3d7080);

export function machineInteract(m, dt, W) {
  const { demo, sfx } = W;
  const att = m.att, s = m.s;
  const active = m.driver >= 0 || m.hyd > 0.02 || Math.abs(m.speed) > 0.05 || m.family === 'crane';

  // ---- 1. contact. Kinematic parts never collide with fixed blocks in the physics engine, so the machine
  // stops at the wall (Machine.contactState) and the blocks it presses on or hits wear down here until they
  // break loose. Heavier machines and faster hits break them sooner; bricks are sticky, so it takes a moment.
  if (active) {
    const power = THREE.MathUtils.clamp((m.spec.tons || 20) / 20, 0.4, 3);
    const press = Math.max(m.push || 0, Math.min(1, m.hyd));
    m.prevBreak = m.prevBreak || [];
    const fxT = (m.fxT = (m.fxT || 0) - dt) <= 0;
    let anyHit = null;
    const hitWith = (shape, p, q, dmgFor) => {
      const hits = [];
      W.physics.world.intersectionsWithShape(p, q, shape, (c) => { const piece = demo.pieceFromCollider(c); if (piece && piece.state === INTACT) hits.push(piece); return hits.length < 12; }, RAPIER.QueryFilterFlags.ONLY_FIXED);
      for (const piece of hits) {
        const dmg = dmgFor(piece);
        if (dmg <= 0) continue;
        anyHit = piece;
        if (wear(demo, piece, dmg / Math.max(1, Math.sqrt(hits.length) * 0.5), p, sfx)) {
          const dir = m.family === 'crane' && m.ballSt ? m.ballSt.v.clone().clampLength(0, 6) : piece.pos.clone().sub(p).setY(0.3).normalize().multiplyScalar(2.6);
          const mass = piece.body ? piece.body.mass() : piece.size.x * piece.size.y * piece.size.z * piece.type.density;
          piece.body.applyImpulse({ x: dir.x * mass, y: dir.y * mass, z: dir.z * mass }, true);
        }
      }
      return hits.length;
    };
    m.breakShapes.forEach((b, i) => {
      const { p, q } = m.shapePose(b);
      const pv = m.prevBreak[i], v = pv ? p.distanceTo(pv) / Math.max(dt, 1e-3) : 0;
      m.prevBreak[i] = p.clone();
      if (m.family === 'crane' && m.ballSt) {
        const bs = m.ballSt.v.length();
        const n = hitWith(b.outer, p, q, () => Math.max(0, bs - 1.0) * 1.4);
        if (n && bs > 1) { m.ballSt.v.multiplyScalar(0.72); m.hyd = 1; }
        return;
      }
      if (press < 0.02 && v < 0.05) return;
      hitWith(b.outer, p, q, () => dt * power * (press * 9 + Math.min(v, 6) * 6));
    });
    // big loose panels the arm, tool or body presses on / knocks into crack and break into rubble chunks
    m.bigT = (m.bigT || 0) - dt;
    if (m.bigT <= 0) {
      m.bigT = 0.1;
      // never change the physics world inside a query callback (Rapier throws, and every later frame fails):
      // collect the pieces first, break them afterwards
      const cracked = new Set();
      const crack = (b, amount) => {
        const { p, q } = m.shapePose(b);
        W.physics.world.intersectionsWithShape(p, q, b.outer || b.shape, (c) => {
          const piece = demo.pieceFromCollider(c);
          if (piece && piece.state === LOOSE && demo.isBig(piece)) { piece.crack = (piece.crack || 0) + amount; if (piece.crack >= 1) cracked.add(piece); }
          return true;
        }, RAPIER.QueryFilterFlags.EXCLUDE_FIXED);
      };
      const mv = Math.min(1, Math.abs(m.speed) * 0.5 + m.hyd);
      if (mv > 0.05) {
        for (const b of m.breakShapes) crack(b, 0.1 * power * (0.4 + mv));
        for (const b of m.blockShapes) crack(b, 0.08 * power * Math.min(1, Math.abs(m.speed)));
      }
      for (const piece of cracked) if (piece.state === LOOSE) demo.shatter(piece, 0.8);
    }
    // driving the body / tracks / blade into a wall
    if ((m.pushBody || 0) > 0.02 || Math.abs(m.speed) > 0.2) {
      for (const b of m.blockShapes) {
        const { p, q } = m.shapePose(b);
        hitWith(b.outer, p, q, () => dt * power * (Math.max(m.pushBody || 0, Math.min(1, Math.abs(m.speed))) * 6));
      }
    }
    if (anyHit && fxT) {
      m.fxT = 0.09;
      const c = demo.chipColor(anyHit);
      sfx.chips(anyHit.pos, new THREE.Vector3(0, 1, 0), c, 3, 0.05, 2);
      if (Math.random() < 0.5) sfx.dust(anyHit.pos, c, 1, 0.6, { alpha: 0.35 });
      m.hitSnd = (m.hitSnd || 0) - 0.09;
      if (m.hitSnd <= 0) { sfx.impact(anyHit.type.sound, 0.55, anyHit.pos); m.hitSnd = 0.35; }
      m.hyd = Math.max(m.hyd, 0.6);
    }
  }

  const gp = m.grabPoint.getWorldPosition(new THREE.Vector3());
  const prevOpen = m.prevOpen ?? m.open, prevCurl = m.prevCurl ?? m.curl;
  m.prevOpen = m.open; m.prevCurl = m.curl;
  const beh = att ? att.behaviour : 'none';

  if (beh === 'jaw') {
    if (m.openTarget < 0.5 && prevOpen > 0.4 && m.open <= 0.4) grab(m, demo, gp, sfx, W.capacityScale || 1);
    if (m.openTarget > 0.5 && m.held.length && m.open > 0.3) releaseAll(m, demo, dt);
  } else if (beh === 'scoop' || beh === 'skip' || beh === 'crusher') {
    const mouth = att.mouth.getWorldPosition(new THREE.Vector3());
    const n = att.mouthN.clone().applyQuaternion(att.group.getWorldQuaternion(new THREE.Quaternion()));
    const up = n.y > 0.25, down = beh === 'skip' ? m.open > 0.5 : n.y < -0.3;
    const curlingIn = m.curl - prevCurl > 1e-4 || (m.family === 'loader' && m.curl - prevCurl > 1e-4);
    if (beh !== 'skip' && att.pieces > 0) {
      const room = att.pieces - m.held.length;
      // scoop while the bucket is facing up or actively curling through the pile
      if ((up || curlingIn) && room > 0 && (!m.payload.kg || beh === 'crusher')) scoop(m, demo, gp, Math.max(0.95, att.grabR * s * 1.15), room);
      if (down && m.held.length) releaseAll(m, demo, dt);
    }
    if (beh === 'crusher') crushInBucket(m, dt, W);
    if (!down && n.y > -0.2 && !m.held.length && beh !== 'crusher') fillBulk(m, dt, mouth, W);
    if (down && m.payload.kg > 0) pourBulk(m, dt, att.spout ? att.spout.getWorldPosition(new THREE.Vector3()) : mouth, n, W);
  } else if (beh === 'clamp') {
    clampLogic(m, dt, W, gp);
  } else if (beh === 'breaker') {
    m.breakerActive = m.openTarget > 0.5;
    if (m.breakerActive) breaker(m, dt, W);
  } else if (beh === 'roller') roller(m, dt, W);
  else if (beh === 'paver') paver(m, dt, W);
  else if (beh === 'paint') painter(m, dt, W);
  else if (beh === 'ball') wreckingBall(m, dt, W);
  else if (beh === 'bed' && (Math.abs(m.curl - prevCurl) > 1e-5 || m.curl > 0.3)) {
    // tipping a body is slow (below Rapier's sleep threshold), so blocks resting in it would stay asleep and
    // stick to the floor at any angle: wake whatever is in the body while it moves or stands raised
    m.wakeT = (m.wakeT || 0) - dt;
    if (m.wakeT <= 0) {
      m.wakeT = 0.2;
      const near = demo.piecesInSphere(gp, (att.wakeR || 2.4) * s, [LOOSE]);
      for (const p of near) p.body.wakeUp();
      // near full tip the body shudders, so a load wedged on itself still slides out over the rear edge
      if (att.dump && m.curl > att.dump.from) {
        const inv = _m.copy(att.group.matrixWorld).invert(), dir = att.dump.dir.clone().transformDirection(att.group.matrixWorld);
        const [hw, len, h] = att.dump.box;
        for (const p of near) {
          _p.copy(p.pos).applyMatrix4(inv);
          if (Math.abs(_p.x) > hw || _p.z < -1 || _p.z > len || _p.y < -0.6 || _p.y > h) continue;
          const mass = p.body.mass();
          p.body.applyImpulse({ x: dir.x * mass * 0.7, y: mass * 0.35, z: dir.z * mass * 0.7 }, true);
        }
      }
    }
  }

  // ---- held pieces follow the attachment
  const am = m.holdFrame().matrixWorld;
  for (const h of m.held) {
    if (h.p.state !== HELD) continue;
    _m.multiplyMatrices(am, h.local); _m.decompose(_p, _q, _s);
    demo.moveHeld(h.p, _p, _q);
  }
  m.held = m.held.filter((h) => h.p.state === HELD);
  m.lastGp = gp;
}

// ---- BG90 brick clamp: magnetic. Closing it pulls the blocks near the jaws into place (whatever way they lie) and
// they stay put, tilted or jerked, until you open it again.
function clampLogic(m, dt, W, gp) {
  const att = m.att, demo = W.demo, R = att.rotor;
  const prevOpen = m.cPrevOpen ?? m.open; m.cPrevOpen = m.open;
  const tell = (msg) => { if ((m.tellT || 0) < performance.now()) { m.tellT = performance.now() + 2500; W.tellDriver(m, msg); } };
  if (m.openTarget < 0.5 && prevOpen > 0.35 && m.open <= 0.35 && !m.held.length) {
    const inv = new THREE.Matrix4().copy(R.matrixWorld).invert();
    const near = [...demo.piecesInSphere(gp, 3.0 * m.s, [LOOSE]), ...demo.intactNear(gp, 2.6 * m.s, 24).filter((p) => !p.up.some((q) => q.state === INTACT))];
    const cand = [];
    for (const p of near) {
      if (demo.isBig(p)) continue;
      const lp = p.pos.clone().applyMatrix4(inv);
      if (Math.abs(lp.y) > 1.1 || Math.abs(lp.x) > 1.9 || lp.z < 0.1 || lp.z > 2.6) continue;
      cand.push({ p, lp });
    }
    if (!cand.length) return finishClamp(m, demo, gp, dt);
    // four slots between the jaws: two blocks end to end, two courses high
    cand.sort((x, y) => x.lp.lengthSq() - y.lp.lengthSq());
    const s = 1 / m.s, q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const used = [];
    for (const { p, lp } of cand) {
      if (m.held.length >= att.pieces) break;
      const half = (p.size.x / 2 + 0.03) * s, h = p.size.y * s;
      let best = null, bd = 1e9;
      for (const [sx, row] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) {
        if (used.some((u) => u[0] === sx && u[1] === row)) continue;
        const x = sx * half, z = 0.78 + row * h, d = (lp.x - x) ** 2 + (lp.z - z) ** 2;
        if (d < bd) { bd = d; best = [sx, row, x, z]; }
      }
      if (!best) break;
      const local = new THREE.Matrix4().compose(new THREE.Vector3(best[2], 0, best[3]), q0, new THREE.Vector3(s, s, s));
      if (demo.hold(p, m.id, local)) { m.held.push({ p, local }); used.push(best); }
    }
    if (m.held.length) { W.sfx.impact('metal', 0.8, gp); tell(`🧲 ${m.held.length} block${m.held.length > 1 ? 's' : ''} locked in the clamp`); }
  }
  finishClamp(m, demo, gp, dt);
}
function finishClamp(m, demo, gp, dt) {
  m.lastGpC = gp.clone(); m.lastVC = null; m.accSm = 0;
  if (m.openTarget > 0.5 && m.held.length && m.open > 0.45) releaseAll(m, demo, dt);
}

// grind an intact block down; returns true when it breaks loose
function wear(demo, p, dmg, at, sfx) {
  if (p.state !== INTACT) return false;
  p.hp -= dmg;
  if (p.hp <= 0) {
    demo.detach(p);
    if (p.type.sound === 'glass') sfx.glass(p.pos);
    return true;
  }
  demo.tintDamage(p);
  return false;
}

function grab(m, demo, gp, sfx, capScale) {
  const room = Math.round(m.att.pieces * capScale) - m.held.length;
  if (room <= 0) return;
  const s = m.s * (m.spec.attachScale || 1);
  // a claw closing on a big panel (roof, floor, door) crushes it into rubble chunks and grabs those instead
  let broke = false;
  for (const p of [...demo.piecesInSphere(gp, 1.6 * s, [LOOSE]), ...demo.intactNear(gp, 1.0 * s, 6)]) {
    if (!demo.isBig(p)) continue;
    if (p.state === INTACT) demo.detach(p);
    if (demo.shatter(p, 0.25).length) broke = true;
  }
  const cand = demo.piecesInSphere(gp, (broke ? 1.9 : 1.4) * s, [LOOSE]);
  const intact = demo.intactNear(gp, 0.85 * s, 12).filter((p) => !demo.isBig(p));
  const all = [...cand, ...intact].sort((a, b) => a.pos.distanceToSquared(gp) - b.pos.distanceToSquared(gp)).slice(0, room);
  const inv = new THREE.Matrix4().copy(m.holdFrame().matrixWorld).invert();
  const gl = m.holdFrame().worldToLocal(gp.clone());
  for (const p of all) {
    const pm = new THREE.Matrix4().compose(p.pos, p.quat, new THREE.Vector3(1, 1, 1));
    const local = new THREE.Matrix4().multiplyMatrices(inv, pm);
    const lp = new THREE.Vector3().setFromMatrixPosition(local);
    lp.x *= 0.7; lp.y = THREE.MathUtils.lerp(lp.y, gl.y, 0.55); lp.z = THREE.MathUtils.lerp(lp.z, gl.z, 0.35);
    local.setPosition(lp);
    if (!demo.hold(p, m.id, local)) continue;
    m.held.push({ p, local });
  }
  if (all.length) { sfx.impact(all[0].type.sound, 0.8, gp); sfx.dust(gp, demo.chipColor(all[0]), 4, 0.8); }
  if (sfx.clank) sfx.clank(gp, all.length ? 1 : 0.6);
}

function scoop(m, demo, gp, r, room) {
  const cand = demo.piecesInSphere(gp, r, [LOOSE]).sort((a, b) => a.pos.distanceToSquared(gp) - b.pos.distanceToSquared(gp)).slice(0, room);
  if (!cand.length) return;
  const inv = new THREE.Matrix4().copy(m.attach.matrixWorld).invert();
  const gl = m.attach.worldToLocal(gp.clone());
  for (const p of cand) {
    const local = new THREE.Matrix4().multiplyMatrices(inv, new THREE.Matrix4().compose(p.pos, p.quat, new THREE.Vector3(1, 1, 1)));
    // pull scooped blocks inside the bucket so they never sit outside the shell
    const lp = new THREE.Vector3().setFromMatrixPosition(local).lerp(gl, 0.45);
    local.setPosition(lp);
    if (demo.hold(p, m.id, local)) m.held.push({ p, local });
  }
}

export function releaseAll(m, demo, dt) {
  const gp = m.grabPoint.getWorldPosition(new THREE.Vector3());
  const vel = m.lastGp ? gp.clone().sub(m.lastGp).divideScalar(Math.max(dt, 1e-3)).clampLength(0, 6) : new THREE.Vector3();
  for (const h of m.held) demo.release(h.p, vel, machineBit(m.id));
  m.held = [];
}

function setPay(m, kind, kg, color, W) {
  m.payload.kind = kg > 0.01 ? kind : null;
  m.payload.kg = kg > 0.01 ? kg : 0;
  if (color) m.payload.color.copy(color);
  W.onPayload(m);
}

function fillBulk(m, dt, mouth, W) {
  const cap = m.capacity();
  const room = cap - m.payload.kg;
  if (room <= 1) return;
  const kinds = m.att.bulk.kinds, pk = m.payload.kind;
  if (kinds.includes('water') && (!pk || pk === 'water') && inWater(mouth.x, mouth.y, mouth.z)) {
    setPay(m, 'water', m.payload.kg + Math.min(room, 320 * dt), WATER_COL, W);
    if (Math.random() < 0.5) W.sfx.chips(mouth, new THREE.Vector3(0, -1, 0), 0x6aa0b0, 2, 0.05, 1.5);
    W.sfx.splash(mouth, 0.3);
    return;
  }
  if (kinds.includes('dust') && (!pk || pk === 'dust') && W.crusher.pileKg > 1) {
    const c = W.crusher.pileWorld(), { r } = W.crusher.pileDims();
    if (Math.hypot(mouth.x - c.x, mouth.z - c.z) < r * 1.0 && mouth.y < W.crusher.pileSurfaceY(mouth.x, mouth.z) + 0.45) {
      const got = W.crusher.take(Math.min(room, 320 * dt));
      if (got.kg > 0) {
        const tot = m.payload.kg + got.kg;
        const col = m.payload.kg ? m.payload.color.clone().lerp(got.color, got.kg / tot) : got.color;
        setPay(m, 'dust', tot, col, W);
        W.onPile(-got.kg);
        if (Math.random() < 0.4) W.sfx.dust(mouth, col.getHex(), 1, 0.5, { alpha: 0.35 });
      }
      return;
    }
  }
  if (kinds.includes('cement') && (!pk || pk === 'cement') && W.mixer.cement > 0.5) {
    const t = W.mixer.tubCenter;
    if (Math.hypot(mouth.x - t.x, mouth.z - t.z) < 1.3 && mouth.y < t.y + 0.3 && mouth.y > t.y - 1.1) {
      const got = W.mixer.takeCement(Math.min(room, 260 * dt));
      const tot = m.payload.kg + got.kg;
      const col = m.payload.kg ? m.payload.color.clone().lerp(got.color, got.kg / tot) : got.color;
      setPay(m, 'cement', tot, col, W);
      W.onMixer();
    }
  }
}

function pourBulk(m, dt, from, n, W) {
  const rate = (m.att.behaviour === 'skip' ? 260 : 360) * dt;
  const amt = Math.min(m.payload.kg, rate);
  const kind = m.payload.kind, col = m.payload.color.clone();
  let used = 0;
  const t = W.mixer.tubCenter;
  const paver = W.machines.find((o) => o.family === 'paver' && o !== m && Math.hypot(from.x - o.att.mouth.getWorldPosition(_p).x, from.z - _p.z) < 1.8 && from.y > _p.y - 0.6);
  const pc = W.crusher.pileWorld();
  const ph = W.press && W.press.hopperWorld;
  if (kind === 'dust' && ph && Math.hypot(from.x - ph.x, from.z - ph.z) < 1.6 && from.y > ph.y - 0.8 && from.y < ph.y + 5) {
    used = W.press.addDust(amt, col); if (used > 0) W.onPress();
  } else if (Math.hypot(from.x - t.x, from.z - t.z) < 1.7 && from.y > t.y - 0.6 && from.y < t.y + 5) {
    used = kind === 'water' ? W.mixer.addWater(amt) : kind === 'dust' ? W.mixer.addDust(amt, col) : W.mixer.addCement(amt, col);
    if (used > 0) W.onMixer();
  } else if (paver && kind === 'cement') {
    used = Math.min(amt, paver.capacity() - paver.payload.kg);
    if (used > 0) { const tot = paver.payload.kg + used; setPay(paver, 'cement', tot, paver.payload.kg ? paver.payload.color.clone().lerp(col, used / tot) : col, W); }
  } else if (kind === 'cement') {
    const h = W.road.nearest(from, 1.2);
    if (h >= 0 && from.y < 5) { used = W.road.fill(h, amt, col); if (used > 0) W.onRoad(); }
  } else if (kind === 'dust' && Math.hypot(from.x - pc.x, from.z - pc.z) < W.crusher.pileDims().r + 2.5) {
    W.crusher.deposit(amt, col); W.onDeposit(amt, col); used = amt;
  }
  setPay(m, kind, m.payload.kg - amt, null, W);
  W.sfx.chips(from, new THREE.Vector3(0, 0, 0).sub(n).multiplyScalar(0.3), kind === 'water' ? 0x6aa0b0 : col.getHex(), 3, 0.05, 0.6);
  if (Math.random() < 0.3) W.sfx.dust(from, kind === 'water' ? 0xc8dde3 : col.getHex(), 1, 0.4, { alpha: 0.3 });
  if (kind === 'water') W.sfx.splash(from, 0.2);
  m.lastPour = used > 0 ? 'ok' : 'spill';
}

// crusher bucket: held blocks become dust inside the bucket
function crushInBucket(m, dt, W) {
  if (!(m.openTarget > 0.5) || !m.held.length) return;
  m.cbTimer = (m.cbTimer || 0) - dt;
  if (m.cbTimer > 0) return;
  m.cbTimer = 0.32;
  const room = m.capacity() - m.payload.kg;
  if (room < 5) return;
  const h = m.held.pop();
  const p = h.p, kg = p.kg, col = W.demo.dustColor(p).clone();
  const at = p.pos.clone();
  W.demo.vanish(p);
  const tot = m.payload.kg + kg;
  setPay(m, 'dust', Math.min(m.capacity(), tot), m.payload.kg ? m.payload.color.clone().lerp(col, kg / tot) : col, W);
  W.onBucketCrush(kg, col);
  W.sfx.chips(at, new THREE.Vector3(0, -1, 0), col.getHex(), 6, 0.05, 2);
  W.sfx.dust(at, col.getHex(), 3, 0.6, { alpha: 0.45 });
  W.sfx.breaker(at, 0.6);
}

function breaker(m, dt, W) {
  m.bkTimer = (m.bkTimer || 0) - dt;
  if (m.bkTimer > 0) return;
  m.bkTimer = 0.11;
  const tip = m.att.tip.getWorldPosition(new THREE.Vector3());
  const dir = tip.clone().sub(m.attach.getWorldPosition(new THREE.Vector3())).normalize();
  const near = W.demo.intactNear(tip, 0.34 * Math.max(0.7, m.s), 4);
  if (near.length) {
    for (const p of near) W.demo.damage(p, 2, tip, dir, 3);
    W.sfx.breaker(tip, 1);
    m.hyd = 1;
    return;
  }
  const loose = W.demo.piecesInSphere(tip, 0.38 * Math.max(0.7, m.s), [LOOSE]);
  if (loose.length) { for (const p of loose.slice(0, 3)) W.demo.damage(p, 1, tip, dir, 3); W.sfx.breaker(tip, 0.7); return; }
  const g = terrainHeight(tip.x, tip.z);
  if (tip.y < g + 0.25) {
    W.sfx.breaker(tip, 0.8);
    W.sfx.chips(tip, dir, W.road.onRoad(tip.x, tip.z) ? 0x3a3b3e : 0x8a7a66, 4, 0.05, 2.5);
    W.sfx.dust(tip, 0x9a9488, 1, 0.5);
    if (W.road.onRoad(tip.x, tip.z)) {
      const k = Math.round(tip.x / 1.5) + ',' + Math.round(tip.z / 1.5);
      m.roadHits = m.roadHits || new Map();
      const n = (m.roadHits.get(k) || 0) + 1; m.roadHits.set(k, n);
      if (n === 30 && W.road.nearest(tip, 0.5, false) < 0 && W.road.onRoad(tip.x, tip.z - 1) && W.road.onRoad(tip.x, tip.z + 1)) { W.road.addHole(tip.x, tip.z, 0.8 + Math.random() * 0.3); W.onRoad(true); }
    }
  }
}

// tandem roller: drums compact freshly filled potholes
function roller(m, dt, W) {
  if (Math.abs(m.speed) < 0.15) return;
  for (const d of m.att.drums) {
    const c = d.getWorldPosition(new THREE.Vector3());
    for (const h of W.road.holes) {
      if (h.filled < h.need || h.comp >= 1) continue;
      if (Math.hypot(c.x - h.x, c.z - h.z) < h.r + 0.7) {
        h.comp = Math.min(1, h.comp + dt * Math.abs(m.speed) * (m.vibrating ? 0.45 : 0.2));
        W.road.refresh(h);
        if (Math.random() < dt * 4) W.sfx.dust(new THREE.Vector3(c.x, 0.15, c.z), h.dry < 0.75 ? 0xf0f0ee : 0x6a6a68, 1, 0.8, { alpha: 0.2, size: 0.6 });
        W.onRoad();
        if (h.comp >= 1) W.tellDriver(m, '⭐ Pothole compacted to a perfect finish!');
      }
    }
  }
}

// road painter: the spray bar paints repaired pothole patches it passes over
function painter(m, dt, W) {
  if (!(m.openTarget > 0.5) || Math.abs(m.speed) < 0.1) return;
  const n = m.att.nozzle.getWorldPosition(new THREE.Vector3());
  const col = new THREE.Color(paintOf(m)[1]);
  for (const h of W.road.holes) {
    if (Math.hypot(n.x - h.x, n.z - h.z) > h.r + 1.2) continue;
    if (h.filled < h.need) { if (!m.paintWarned) { m.paintWarned = true; W.tellDriver(m, '🎨 Repair that pothole first, then paint the patch'); } continue; }
    if (W.road.paint(h, col, dt * 1.6)) W.onRoad();
    if (h.paintAmt >= 1 && !h.paintTold) { h.paintTold = true; W.tellDriver(m, '🎨 Patch painted!'); }
  }
}

// paver: lays cement from the hopper into potholes it drives over
function paver(m, dt, W) {
  if (!(m.openTarget > 0.5) || m.payload.kind !== 'cement' || m.payload.kg <= 0) return;
  const sp = m.att.screedPoint.getWorldPosition(new THREE.Vector3());
  const h = W.road.nearest(sp, 1.6);
  if (h < 0) return;
  const used = W.road.fill(h, Math.min(m.payload.kg, 300 * dt), m.payload.color);
  if (used > 0) {
    // the screed lays a smooth, pre-compacted mat; the roller finishes it
    const hh = W.road.holes[h]; if (hh.comp < 0.3) { hh.comp = 0.3; W.road.refresh(hh); }
    setPay(m, 'cement', m.payload.kg - used, null, W);
    W.onRoad();
    if (Math.random() < 0.3) W.sfx.dust(sp, m.payload.color.getHex(), 1, 0.6, { alpha: 0.25 });
  }
}

// wrecking ball: the swinging ball smashes walls (contact handled above); add a heavy hit sound + shake
function wreckingBall(m, dt, W) {
  if (!m.ballSt) return;
  const sp = m.ballSt ? m.ballSt.v.length() : 0;
  if (sp > 2.5) {
    const hits = W.demo.piecesInSphere(m.ballSt.p, 0.75 * m.s, [LOOSE]);
    for (const p of hits.slice(0, 6)) if (p.body) p.body.applyImpulse({ x: m.ballSt.v.x * 0.15 * p.body.mass(), y: 0.2 * p.body.mass(), z: m.ballSt.v.z * 0.15 * p.body.mass() }, true);
  }
}
