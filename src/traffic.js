// Street traffic: hatchbacks, saloons, vans and pickups driving both ways along the road in front of the yard.
// Cars have no physics bodies; they read the street instead. They slow down and stop for people, machines, blocks
// lying on the road and the car in front, honk when someone stands in their way, go round a blockage through the
// other lane when it is clear, and bounce (with a thud) when a wheel drops into a pothole that has not been
// repaired. Repaired patches are smooth. At night their headlights glow. Traffic is local to each player.
import * as THREE from 'three';
import { SITE, terrainHeight } from './site.js';
import { box, merge } from './pieces.js';
import { tyreLathe, wheelRim } from './detail.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const COLORS = [0xc8102e, 0x1f4fa8, 0xe8e8e4, 0x1b1c1e, 0x8d9399, 0x2e6b3a, 0xe0a51a, 0x6a2a7a, 0x3a9ad0, 0xb4502a];
const KINDS = {
  hatch: { L: 3.9, W: 1.75, H: 1.48, wb: 2.45, r: 0.31, cabin: [-1.55, 0.95], vmax: 12 },
  saloon: { L: 4.6, W: 1.8, H: 1.42, wb: 2.75, r: 0.32, cabin: [-1.35, 1.05], vmax: 13 },
  van: { L: 5.1, W: 1.98, H: 2.25, wb: 3.2, r: 0.34, cabin: [1.0, 2.0], vmax: 10 },
  pickup: { L: 5.2, W: 1.9, H: 1.8, wb: 3.1, r: 0.38, cabin: [-0.2, 1.25], vmax: 11 },
};
const LANE = { east: SITE.streetZ + 4.9, west: SITE.streetZ + 1.1 }; // right-hand traffic: eastbound (+x) on the far lane
const END = 165;

// side profile (z, y) with rounded corners, extruded across x
function extrudeX(pts, w, bevel = 0.08) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: w - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 6 });
  g.rotateY(-Math.PI / 2); g.translate(w / 2 - bevel, 0, 0);
  return g;
}
function rounded(c, n = 4) {
  const out = [], N = c.length;
  for (let i = 0; i < N; i++) {
    const [z, y, r] = c[i];
    if (!r) { out.push([z, y]); continue; }
    const p = c[(i - 1 + N) % N], q = c[(i + 1) % N];
    const la = Math.hypot(p[0] - z, p[1] - y), lb = Math.hypot(q[0] - z, q[1] - y), rr = Math.min(r, la * 0.45, lb * 0.45);
    const a = [z + (p[0] - z) / la * rr, y + (p[1] - y) / la * rr], b = [z + (q[0] - z) / lb * rr, y + (q[1] - y) / lb * rr];
    for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * z + t * t * b[0], u * u * a[1] + 2 * u * t * y + t * t * b[1]]); }
  }
  return out;
}

export class Traffic {
  constructor(game) {
    this.g = game; this.cars = []; this.obstacles = []; this.obT = 0;
    const M = game.M;
    this.mats = {
      glass: new THREE.MeshPhysicalMaterial({ color: 0x1a2430, roughness: 0.05, metalness: 0.3, clearcoat: 1, envMapIntensity: 1.6 }),
      trim: new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.7 }),
      chrome: M.chrome, rubber: new THREE.MeshStandardMaterial({ color: 0x151516, roughness: 0.9 }), rim: new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.8 }),
      lens: M.lightLens, red: M.redLens, amber: M.amberLens, plate: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.4 }),
    };
    this.paints = new Map();
    const kinds = Object.keys(KINDS);
    for (let i = 0; i < 7; i++) {
      const dir = i % 2 ? -1 : 1, kind = kinds[i % kinds.length];
      const car = this.makeCar(kind, COLORS[(i * 3) % COLORS.length]);
      car.dir = dir; car.x = -140 + i * 41; car.z = dir > 0 ? LANE.east : LANE.west; car.laneZ = car.z;
      car.speed = car.k.vmax * 0.8; car.blockedT = 0; car.overtake = 0; car.honkT = 0; car.bounce = 0; car.bv = 0; car.pitch = 0; car.pv = 0; car.hit = new Set();
      this.cars.push(car);
      game.scene.add(car.root);
    }
  }
  paint(hex) {
    if (!this.paints.has(hex)) this.paints.set(hex, new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.35, metalness: 0.45, clearcoat: 0.9, clearcoatRoughness: 0.1 }));
    return this.paints.get(hex);
  }

  makeCar(kind, color) {
    const k = KINDS[kind], m = this.mats, root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const L = k.L, W = k.W, H = k.H, zf = L / 2, zb = -L / 2, sill = 0.32;
    const add = (geo, mat, parent = body, cast = true) => { const o = new THREE.Mesh(geo, mat); o.castShadow = cast; o.receiveShadow = true; parent.add(o); return o; };
    const paintMat = this.paint(color);
    const belt = kind === 'van' ? H - 0.95 : kind === 'pickup' ? 1.05 : 0.92;  // window line
    const [c0, c1] = k.cabin;                                                   // cabin from z c0 (back) to c1 (front)
    // lower body: bonnet, wings, doors and boot in one rounded profile
    let lower;
    if (kind === 'van') lower = [[zb, sill, 0.06], [zf, sill, 0.1], [zf, belt - 0.15, 0.2], [zf - 0.45, belt + 0.12, 0.2], [zb, belt + 0.12, 0.05]];
    else if (kind === 'pickup') lower = [[zb, sill, 0.05], [zf, sill, 0.12], [zf, 0.92, 0.15], [zf - 0.7, belt, 0.1], [zb, belt, 0.04]];
    else lower = [[zb, sill, 0.1], [zf, sill, 0.14], [zf, 0.72, 0.2], [zf - 0.9, belt, 0.25], [zb + 0.25, belt, 0.15], [zb, 0.75, 0.15]];
    add(extrudeX(rounded(lower), W, 0.1), paintMat);
    // glasshouse: glass band under a painted roof (the van is tall and has its own body)
    if (kind === 'van') {
      add(extrudeX(rounded([[zb, belt + 0.1, 0.04], [zf - 0.45, belt + 0.1, 0.1], [zf - 1.05, H, 0.25], [zb, H, 0.06]]), W - 0.02, 0.08), paintMat);
      add(extrudeX(rounded([[zf - 0.52, belt + 0.14, 0.04], [zf - 1.08, H - 0.1, 0.06], [zf - 1.6, H - 0.1, 0], [zf - 1.6, belt + 0.14, 0]]), W + 0.02, 0.02), m.glass);
    } else {
      const top = H, rake = 0.55, back = 0.45;
      add(extrudeX(rounded([[c0, belt - 0.02, 0], [c1, belt - 0.02, 0], [c1 - rake, top - 0.04, 0.12], [c0 + back, top - 0.04, 0.12]]), W - 0.18, 0.05), m.glass);
      add(extrudeX(rounded([[c0 + back - 0.02, top - 0.07, 0.04], [c1 - rake + 0.02, top - 0.07, 0.04], [c1 - rake - 0.06, top + 0.02, 0.05], [c0 + back + 0.06, top + 0.02, 0.05]]), W - 0.14, 0.03), paintMat);
      // pillars
      const pil = [];
      for (const s of [-1, 1]) { pil.push(box(0.05, 0.05, 0.05, 0, 0, 0)); pil.push(box(0.06, top - belt, 0.09, s * (W / 2 - 0.1), (top + belt) / 2, (c0 + c1) / 2 + 0.05)); }
      add(merge(pil), m.trim, body, false);
      if (kind === 'pickup') { // open bed behind the cab
        add(merge([box(W - 0.1, 0.06, -zb + c0 - 0.15, 0, belt - 0.05, (zb + c0) / 2), box(0.06, 0.45, -zb + c0 - 0.15, W / 2 - 0.08, belt + 0.2, (zb + c0) / 2), box(0.06, 0.45, -zb + c0 - 0.15, -W / 2 + 0.08, belt + 0.2, (zb + c0) / 2), box(W - 0.1, 0.45, 0.06, 0, belt + 0.2, zb + 0.08)]), paintMat);
      }
    }
    // bumpers, grille, lights, number plates, mirrors, door handles
    const dark = [box(W + 0.04, 0.22, 0.16, 0, sill + 0.08, zf + 0.02), box(W + 0.04, 0.22, 0.16, 0, sill + 0.08, zb - 0.02), box(W * 0.45, 0.16, 0.04, 0, sill + 0.3, zf + 0.02)];
    for (const s of [-1, 1]) dark.push(box(0.05, 0.12, 0.22, s * (W / 2 + 0.08), belt + 0.12, c1 - 0.12));
    add(merge(dark), m.trim);
    const fl = [], tl = [];
    for (const s of [-1, 1]) { fl.push(box(0.36, 0.13, 0.04, s * (W / 2 - 0.3), sill + 0.38, zf + 0.005)); tl.push(box(0.3, 0.14, 0.04, s * (W / 2 - 0.25), (kind === 'van' ? 1.0 : 0.82), zb - 0.005)); }
    add(merge(fl), m.lens, body, false); add(merge(tl), m.red, body, false);
    add(merge([box(0.52, 0.12, 0.02, 0, sill + 0.1, zf + 0.11), box(0.52, 0.12, 0.02, 0, sill + 0.1, zb - 0.11)]), m.plate, body, false);
    // wheels with arches
    const tg = tyreLathe(k.r, 0.22, k.r * 0.6, { lugs: 0, style: 'none' }), rw = wheelRim(k.r * 0.6, 0.2, { dish: 0.03, vents: 6 });
    const wheels = [];
    for (const z of [k.wb / 2, -k.wb / 2]) for (const s of [-1, 1]) {
      const hub = new THREE.Group(); hub.position.set(s * (W / 2 - 0.16), k.r, z); root.add(hub);
      const spin = new THREE.Group(); hub.add(spin);
      add(tg, m.rubber, spin); const rm = add(rw.rim, m.rim, spin, false); const rv = add(rw.vents, m.trim, spin, false);
      if (s < 0) { rm.rotation.y = Math.PI; rv.rotation.y = Math.PI; }
      wheels.push(spin);
    }
    return { root, body, wheels, k, kind };
  }

  // things a car must not drive into: people, machines, blocks on the road; refreshed a few times a second
  scan() {
    const g = this.g, list = [], z0 = SITE.streetZ - 1.3, z1 = SITE.streetZ + 7.3;
    const near = (z) => z > z0 - 2 && z < z1 + 2;
    for (const p of g.players.values()) { const pos = p.local ? g.player.pos : p.pos; if (pos && near(pos.z)) list.push({ x: pos.x, z: pos.z, r: 0.6, who: 'person' }); }
    for (const m of g.machines.values()) if (near(m.pos.z)) list.push({ x: m.pos.x, z: m.pos.z, r: m.radius * m.s * 0.75, who: 'machine' });
    for (const p of g.demo.pieces) if ((p.state === 1 || p.state === 0) && p.pos.z > z0 && p.pos.z < z1 && p.pos.y < 2.5 && p.pos.y > -1) list.push({ x: p.pos.x, z: p.pos.z, r: Math.max(p.size.x, p.size.z) * 0.5, who: 'debris' });
    this.obstacles = list;
  }

  setOn(on) { this.on = on !== false; for (const c of this.cars) c.root.visible = this.on; }
  update(dt) {
    const g = this.g;
    if (this.on === false) return;
    this.obT -= dt; if (this.obT <= 0) { this.obT = 0.25; this.scan(); }
    const night = g.dn ? g.dn.lit : 0;
    for (const c of this.cars) {
      const k = c.k, d = c.dir;
      // what is ahead in the band the car occupies
      let gap = 1e9, who = null;
      const half = k.W / 2 + 0.4;
      // rx: reach along the road, rz: half width across it
      const consider = (x, z, rx, rz, w) => { const ahead = (x - c.x) * d - k.L / 2; if (ahead < -k.L * 0.6 || ahead > 26) return; if (Math.abs(z - c.z) > half + rz) return; const gp = ahead - rx; if (gp < gap) { gap = gp; who = w; } };
      for (const o of this.obstacles) consider(o.x, o.z, o.r, o.r, o.who);
      for (const o of this.cars) if (o !== c) consider(o.x, o.z, o.k.L / 2, o.k.W / 2, o.dir === d ? 'car' : 'oncoming');
      // speed: cruise, slow down to stop ~3 m short
      const want = gap > 25 ? k.vmax : Math.max(0, Math.min(k.vmax, (gap - 3) * 0.9));
      c.speed += Math.sign(want - c.speed) * Math.min(Math.abs(want - c.speed), (want < c.speed ? 9 : 3) * dt);
      // blocked by something that will not move: go round through the other lane when it is clear
      if (c.speed < 0.3 && who && who !== 'car' && who !== 'oncoming') c.blockedT += dt; else c.blockedT = Math.max(0, c.blockedT - dt * 2);
      if (c.overtake > 0 && who === 'oncoming' && gap < 15) c.overtake = 0; // something coming: tuck back in
      if (c.blockedT > 2.5 && !c.overtake && who !== 'person') {
        const other = c.laneZ === LANE.east ? LANE.west : LANE.east;
        const clear = !this.cars.some((o) => o !== c && Math.abs(o.z - other) < 1.5 && Math.abs(o.x - c.x) < 45) && !this.obstacles.some((o) => Math.abs(o.z - other) < 1.8 && (o.x - c.x) * d > -3 && (o.x - c.x) * d < 30);
        if (clear) { c.overtake = 28; c.blockedT = 0; c.speed = 2; }
      }
      // honk at people and machines in the way
      c.honkT -= dt;
      if (c.speed < 0.5 && (who === 'person' || who === 'machine') && gap < 12 && c.honkT <= 0 && g.audio) {
        c.honkT = 5 + Math.random() * 3;
        const key = 'car' + this.cars.indexOf(c), pos = c.root.position.clone();
        g.audio.horn(key, pos, true, 1.5); setTimeout(() => g.audio.horn(key, pos, false), 260);
        setTimeout(() => { g.audio.horn(key, pos, true, 1.5); setTimeout(() => g.audio.horn(key, pos, false), 200); }, 420);
      }
      // move along the lane (or the other lane while overtaking)
      const step = c.speed * dt;
      c.x += d * step;
      if (c.overtake > 0) { c.overtake -= step; if (c.overtake <= 0) c.overtake = 0; }
      const targetZ = c.overtake > 0 ? (c.laneZ === LANE.east ? LANE.west : LANE.east) : c.laneZ;
      const dz = (targetZ - c.z) * Math.min(1, dt * 1.6); c.z += dz;
      if (c.x * d > END) { c.x = -END * d; c.overtake = 0; c.z = c.laneZ; c.speed = k.vmax * 0.8; this.respray(c); }
      // potholes: a wheel dropping into an unrepaired hole kicks the body (once per hole per pass)
      for (let hi = 0; hi < g.road.holes.length; hi++) {
        const h = g.road.holes[hi];
        if (h.filled >= h.need) continue;
        for (const [ax, az] of [[k.wb / 2, k.W / 2 - 0.16], [k.wb / 2, -k.W / 2 + 0.16], [-k.wb / 2, k.W / 2 - 0.16], [-k.wb / 2, -k.W / 2 + 0.16]]) {
          const wx = c.x + d * ax, wz = c.z + az * d;
          const key = hi * 8 + (ax > 0 ? 0 : 4) + (az > 0 ? 0 : 2);
          const inside = Math.hypot(wx - h.x, wz - h.z) < h.r * 0.85;
          if (inside && !c.hit.has(key) && c.speed > 1) {
            c.hit.add(key);
            const s = Math.min(1, c.speed / 10);
            c.bv -= 0.9 * s; c.pv += (ax > 0 ? -1 : 1) * 0.5 * s * d;
            if (g.audio) g.audio.impact('metal', 0.3 + 0.4 * s, new THREE.Vector3(wx, 0.3, wz));
          } else if (!inside) c.hit.delete(key);
        }
      }
      // suspension
      c.bv += (-c.bounce * 60 - c.bv * 7) * dt; c.bounce += c.bv * dt;
      c.pv += (-c.pitch * 50 - c.pv * 6) * dt; c.pitch += c.pv * dt;
      c.root.position.set(c.x, terrainHeight(c.x, c.z), c.z);
      c.root.rotation.y = d > 0 ? Math.PI / 2 : -Math.PI / 2;
      c.root.rotation.y += -Math.atan2(dz / Math.max(dt, 1e-3), Math.max(1, c.speed)) * d * 0.6;
      c.body.position.y = c.bounce * 0.12; c.body.rotation.x = c.pitch * 0.05;
      for (const w of c.wheels) w.rotation.x += step / k.r;
      // keep people out of a stopped car: nudge the player out if they walk into one
      const lp = g.player.pos, lx = (lp.x - c.x) * d, lz = (lp.z - c.z) * d;
      if (Math.abs(lx) < k.L / 2 + 0.3 && Math.abs(lz) < k.W / 2 + 0.3 && g.mode === 'foot') {
        const pushZ = ((k.W / 2 + 0.35) * Math.sign(lz || 1) - lz) * d * Math.min(1, dt * 10);
        g.player.pos.z += pushZ; if (g.player.center) g.player.center.z += pushZ;
      }
      c.night = night;
    }
  }
  respray(c) {
    const hex = COLORS[Math.floor(Math.random() * COLORS.length)];
    c.body.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshPhysicalMaterial && o.material !== this.mats.glass) o.material = this.paint(hex); });
  }
  // engine voices for the cars nearest to the listener
  voices(listener, out) {
    if (this.on === false) return;
    const near = [...this.cars].sort((a, b) => a.root.position.distanceToSquared(listener) - b.root.position.distanceToSquared(listener)).slice(0, 2);
    for (const c of near) out.push({ pos: c.root.position, running: true, rpm: 0.25 + Math.min(1, c.speed / c.k.vmax) * 0.5, hyd: 0, speed: c.speed, turn: 0, vmax: c.k.vmax, tons: c.kind === 'van' ? 3 : 1.4, tracked: false, breaker: false, vibrating: false, beep: false });
  }
}
