// 22 machines on one generic Machine class. Builders live in mx-excavator.js and mx-vehicles.js; each one sets
// up groups, colliders and a "rig" that maps the five control channels (swing, boom, stick, curl, open) onto it.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { machineMaterials, weathered, bake, restPositions } from './detail.js';
import { buildExcavator } from './mx-excavator.js';
import { buildRoller, buildPaver, buildLoader, buildDozer, buildDumper, buildCrane, buildPainter, stepCrane } from './mx-vehicles.js';
import { buildTruck, TRUCK_SIZES } from './mx-truck.js';
import { terrainHeight, SITE } from './site.js';
import { machineGroups } from './demolition.js';
import { STARTS_OFF } from './mx-fun.js';

const clamp = THREE.MathUtils.clamp;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

const EX = 'excavator';
export const MACHINES = [
  // ---- excavators
  { id: 'tx330', tons: 30, family: EX, name: 'TORVA TX330 Demolition', brand: 'TORVA', model: 'TX330', icon: '🦾', desc: '30 t demolition excavator with a rotating sorting grapple.', scale: 1, paint: 0xf2b200, under: 'steel', cab: 'cab', boom: 'mono', attach: 'grapple', speed: 2.6 },
  { id: 'k35', tons: 3.5, family: EX, name: 'KESTREL K35 Mini', brand: 'KESTREL', model: 'K35', icon: '🐣', desc: 'Zero-tail mini digger: rubber tracks, canopy, dozer blade, swing-post boom. Fits inside houses.', scale: 0.48, paint: 0xff7300, under: 'rubber', cab: 'canopy', boom: 'mono', attach: 'minibucket', blade: true, zeroTail: true, mini: true, speed: 2.2 },
  { id: 'hr450', tons: 46, family: EX, name: 'VANTOR HR450 High Reach', brand: 'VANTOR', model: 'HR450', icon: '🦒', desc: 'Long-reach demolition machine, tilting cab, shear on a 15 m arm.', scale: 1.1, paint: 0xefefea, accent: 0xc0261b, under: 'steel', gauge: 1.42, cab: 'tilt', boom: 'long', stickLen: 5.2, attach: 'shear', speed: 1.6, heavy: true },
  { id: 'mw180', tons: 18, family: EX, name: 'MERIDIAN MW180 Wheeled', brand: 'MERIDIAN', model: 'MW180', icon: '🛞', desc: 'Fast wheeled excavator: dual tyres, outriggers, dozer blade, digging bucket.', scale: 0.92, paint: 0x2f9a46, accent: 0xf0f0ea, under: 'wheels', cab: 'cab', boom: 'mono', attach: 'bucket', blade: true, speed: 6.5 },
  { id: 'tx700', tons: 70, family: EX, name: 'TORVA TX700 Mass Excavator', brand: 'TORVA', model: 'TX700', icon: '🦣', desc: '70 t monster: walkways, twin stacks, ladder and a 2.4 m³ rock bucket.', scale: 1.4, paint: 0xf2b200, under: 'steel', cab: 'cab', boom: 'mono', attach: 'bigbucket', heavy: true, speed: 1.9 },
  { id: 'bx220', tons: 22, family: EX, name: 'BRUNO BX220 Breaker', brand: 'BRUNO', model: 'BX220', icon: '🔨', desc: 'Hydraulic hammer. Switch it on and it chews through walls, and through the road.', scale: 0.95, paint: 0xc41e1e, accent: 0x1b1b1b, under: 'steel', cab: 'cab', boom: 'mono', attach: 'breaker', speed: 2.4 },
  { id: 'mh24', tons: 24, family: EX, name: 'HALDEN MH24 Material Handler', brand: 'HALDEN', model: 'MH24', icon: '🐙', desc: 'Raised cab on a riser, straight boom and a five-tine orange-peel grab.', scale: 1.0, paint: 0xf4f4f0, accent: 0x1f5fa8, under: 'steel', gauge: 1.32, cab: 'elevated', boom: 'straight', stickLen: 4.0, attach: 'orangepeel', speed: 2.0 },
  { id: 'wh75', tons: 7.5, family: EX, name: 'HALDEN WH75 Claw', brand: 'HALDEN', model: 'WH75', icon: '🦀', desc: 'Wheeled log-claw excavator with dozer blade, outriggers and a black boom. The claw grabs a whole load of blocks.', scale: 0.85, paint: 0xf06a10, accent: 0x18191b, armPaint: 0x1c1d1f, under: 'wheels', cab: 'cab', boom: 'mono', stickLen: 3.2, attach: 'claw', blade: true, speed: 6.0, paintCab: true },
  { id: 'wh200', tons: 38, family: EX, name: 'HALDEN WH200 Big Claw', brand: 'HALDEN', model: 'WH200', icon: '🦞', desc: 'Huge wheeled material handler: raised cab, outriggers, dual tyres and a giant log claw that grabs a whole wall section of blocks in one bite.', scale: 1.12, paint: 0x6a3da6, accent: 0xf2b705, armPaint: 0x232427, under: 'wheels', cab: 'elevated', boom: 'straight', stickLen: 4.4, attach: 'claw', attachScale: 1.75, speed: 4.8 },
  { id: 'bg90', tons: 24, family: EX, name: 'TORVA BG90 Brick Grabber', brand: 'TORVA', model: 'BG90', icon: '🧱', desc: 'Dedicated block handler with a magnetic rotating clamp. Close it near some blocks and it pulls up to four of them neatly into place between the jaws, whatever way they lie, and holds them until you open it. Heavy, slow hydraulics.', scale: 0.95, paint: 0x2b63c6, accent: 0xf2b705, under: 'steel', cab: 'cab', boom: 'mono', attach: 'brickclamp', speed: 2.2, inertia: true },
  { id: 'amx', tons: 25, family: EX, name: 'AQUAMOLE AMX Amphibious', brand: 'AQUAMOLE', model: 'AMX', icon: '🦆', desc: 'Pontoon tracks so it floats. Carries a sealed water tank to fetch water from the lake.', scale: 0.95, paint: 0x18a598, accent: 0xf2f2ee, under: 'pontoon', cab: 'cab', boom: 'mono', stickLen: 3.8, attach: 'tank', amphibious: true, speed: 2.0 },
  { id: 'gp300', tons: 32, family: EX, name: 'GRANITE GP300 Pulverizer', brand: 'GRANITE', model: 'GP300', icon: '🦷', desc: 'Concrete pulverizer jaws that rip and crunch walls apart.', scale: 1.05, paint: 0x5f656b, accent: 0xff7a00, under: 'steel', cab: 'cab', boom: 'mono', attach: 'pulverizer', speed: 2.4 },
  { id: 'gx250', tons: 26, family: EX, name: 'GRANITE GX250 Crusher Bucket', brand: 'GRANITE', model: 'GX250', icon: '⚙️', desc: 'Scoop blocks, switch the crusher on and they become coloured dust right inside the bucket.', scale: 1.0, paint: 0x3b4148, accent: 0xffc400, under: 'steel', cab: 'cab', boom: 'mono', attach: 'crusher', speed: 2.4 },
  { id: 'lc200', tons: 20, family: EX, name: 'LIMEWORKS LC200 Concrete', brand: 'LIMEWORKS', model: 'LC200', icon: '🪣', desc: 'Concrete skip. Fill it at the mixer, then open the gate over a pothole or into the paver.', scale: 0.9, paint: 0x9acb12, accent: 0x1b1b1b, under: 'steel', cab: 'cab', boom: 'mono', stickLen: 3.2, attach: 'skip', speed: 2.6 },
  { id: 'sx5', tons: 9, family: EX, name: 'ALPINA SX5 Walking Spider', brand: 'ALPINA', model: 'SX5', icon: '🕷️', desc: 'Walking excavator on four legs: wheels at the back, steel claws at the front.', scale: 0.9, paint: 0xd8262b, accent: 0x222222, under: 'spider', cab: 'cab', boom: 'mono', stickLen: 3.0, attach: 'bucket', speed: 3.2 },
  { id: 'dr160', tons: 1.6, family: EX, name: 'BROCKMAN DR160 Demolition Robot', brand: 'BROCKMAN', model: 'DR160', icon: '🤖', desc: 'Remote-controlled demolition robot with outrigger legs and a breaker. Tiny but brutal.', scale: 0.55, paint: 0xf5f5f2, accent: 0xff6a00, under: 'robot', upper: 'robot', cab: 'none', boom: 'mono', stickLen: 2.6, attach: 'breaker', speed: 1.6 },
  // ---- special excavators
  { id: 'bl4', tons: 8.5, family: EX, name: 'BRAVO BL4 Backhoe Loader', brand: 'BRAVO', model: 'BL4', icon: '🚜', desc: 'Two machines in one, like the ones digging up city streets: a loader bucket on the front (T / Y raise it, Click tips it to dump) and a digging arm on the back with stabiliser legs. Quick on the road.', scale: 1, paint: 0xf3b21a, accent: 0x1d1e20, under: 'backhoe', cab: 'cab', boom: 'backhoe', stickLen: 2.5, attach: 'bucket', attachScale: 0.78, speed: 8.5 },
  { id: 'mg40', tons: 40, family: EX, name: 'HALDEN MG40 Scrap Magnet', brand: 'HALDEN', model: 'MG40', icon: '🧲', desc: 'Material handler with a huge electromagnet. Switch it on and loose blocks fly up and stick to it (up to 10), and it rips blocks right out of walls. Switch it off to drop the lot.', scale: 1.05, paint: 0x2e7d4f, accent: 0xf2c200, under: 'wheels', cab: 'elevated', boom: 'straight', stickLen: 4.0, attach: 'magnet', speed: 4.6 },
  { id: 'wb300', tons: 30, family: EX, name: 'TORVA WB300 Ball Swinger', brand: 'TORVA', model: 'WB300', icon: '⛓️', desc: 'An excavator with a 2-tonne wrecking ball on a chain. Whip the arm around and let the ball fly into walls. Click lets the chain out or reels it in.', scale: 1, paint: 0x2b2d31, accent: 0xff5a1f, armPaint: 0xff5a1f, under: 'steel', cab: 'cab', boom: 'mono', attach: 'xball', speed: 2.6 },
  { id: 'vx50', tons: 28, family: EX, name: 'VORTEX VX50 Block Blaster', brand: 'VORTEX', model: 'VX50', icon: '🌀', desc: 'A suction excavator gone wild. Switch the vacuum on and it sucks loose blocks into the nozzle and stacks them in the cage on its back (up to 8). Then hold T or Y to fire them out at walls.', scale: 1, paint: 0x7a3fd6, accent: 0x1b1c20, under: 'steel', cab: 'cab', boom: 'mono', attach: 'blaster', speed: 2.6 },
  { id: 'dc60', tons: 34, family: EX, name: 'GRINDA DC60 Drum Cutter', brand: 'GRINDA', model: 'DC60', icon: '🥁', desc: 'Twin spinning drums full of carbide picks. Switch them on and press into a wall or a heap of rubble: it grinds the blocks straight into coloured dust, and the dust counts as crushed.', scale: 1.05, paint: 0xe0571c, accent: 0x202124, under: 'steel', cab: 'cab', boom: 'mono', attach: 'cutter', heavy: true, speed: 2.3 },
  { id: 'rs30', tons: 30, family: EX, name: 'SAWTEK RS30 Rock Saw', brand: 'SAWTEK', model: 'RS30', icon: '🪚', desc: 'A 2-metre diamond saw blade on the arm. Spin it up and slice through walls: every block the blade passes through is cut clean out, so you can cut whole wall sections loose.', scale: 1, paint: 0x1f8fd6, accent: 0x15171a, under: 'steel', cab: 'cab', boom: 'mono', attach: 'saw', speed: 2.6 },
  { id: 'ad20', tons: 20, family: EX, name: 'TORQUE AD20 Auger Drill', brand: 'TORQUE', model: 'AD20', icon: '🌪️', desc: 'A giant spinning auger on a wheeled excavator. Bore straight through walls, or drill new potholes into the road in seconds.', scale: 0.95, paint: 0xc8d81e, accent: 0x1b1b1b, under: 'wheels', cab: 'cab', boom: 'mono', attach: 'auger', blade: true, speed: 6.0 },
  { id: 'vp12', tons: 14, family: EX, name: 'PLATO VP12 Plate Compactor', brand: 'PLATO', model: 'VP12', icon: '〰️', desc: 'A vibrating compaction plate on the arm. Press it on a filled pothole to compact it to a perfect finish, or hold it against a building to shake the blocks loose. Rubble nearby hops around.', scale: 0.8, paint: 0x3fa34d, accent: 0x18191b, under: 'rubber', cab: 'cab', boom: 'mono', attach: 'plate', speed: 2.4 },
  { id: 'fk18', tons: 18, family: EX, name: 'MERIDIAN FK18 Fork Handler', brand: 'MERIDIAN', model: 'FK18', icon: '🍴', desc: 'Wheeled excavator with pallet forks. Lower the forks next to a pile of blocks and lock: up to 8 blocks snap into a neat stack on the tines. Perfect for carrying pressed blocks to your building plot.', scale: 0.92, paint: 0xd9dde0, accent: 0x2f9a46, under: 'wheels', cab: 'cab', boom: 'mono', attach: 'forks', blade: true, speed: 6.5 },
  { id: 'hj40', tons: 4, family: EX, name: 'AQUAJET HJ40 Water Cannon', brand: 'AQUAJET', model: 'HJ40', icon: '💦', desc: 'Remote hydrodemolition robot: a high-pressure water jet that blasts blocks out of walls from 14 m away and sends loose ones flying. Aim it into the mixer to add water.', scale: 0.6, paint: 0x1aa6c9, accent: 0xf2f2ee, under: 'robot', upper: 'robot', cab: 'none', boom: 'mono', stickLen: 2.8, attach: 'jet', speed: 1.8 },
  // ---- road & site machines
  { id: 'cr64', tons: 9, family: 'roller', name: 'TORVA CR64 Tandem Roller', brand: 'TORVA', model: 'CR64', icon: '🛞', desc: 'Twin vibrating steel drums. Roll over a cement-filled pothole to compact it to a perfect finish.', scale: 1.0, paint: 0xf2b200, speed: 3.5 },
  { id: 'ap600', tons: 18, family: 'paver', name: 'VELOTA AP600 Paver', brand: 'VELOTA', model: 'AP600', icon: '🛣️', desc: 'Pour cement into its hopper, switch the flow on and drive over potholes to pave them.', scale: 1.0, paint: 0xf5c400, accent: 0x222222, speed: 2.2 },
  { id: 'wl950', tons: 24, family: 'loader', name: 'TORVA WL950 Wheel Loader', brand: 'TORVA', model: 'WL950', icon: '🚜', desc: 'Articulated loader with Z-bar arms and a 3 m bucket. Scoops a mountain of blocks or dust.', scale: 1.0, paint: 0xf2b200, speed: 6.0 },
  { id: 'dz80', tons: 22, family: 'dozer', name: 'TORVA DZ80 Bulldozer', brand: 'TORVA', model: 'DZ80', icon: '🐂', desc: 'Pushes walls flat and shoves rubble to the crusher. Rear ripper included.', scale: 1.0, paint: 0xf2b200, speed: 2.8 },
  { id: 'td6', tons: 6, family: 'dumper', name: 'KESTREL TD6 Tracked Dumper', brand: 'KESTREL', model: 'TD6', icon: '🛻', desc: 'Rubber-tracked dumper with a slewing, tipping skip. Load it with blocks and drive them anywhere.', scale: 1.0, paint: 0xff7300, speed: 3.5 },
  { id: 'lp20', tons: 9, family: 'painter', name: 'LINEA LP20 Road Painter', brand: 'LINEA', model: 'LP20', icon: '🎨', desc: 'Road painting truck with a spray bar behind the rear axle. Pick a colour, switch the sprayer on and drive over a repaired pothole to paint the patch.', scale: 1, paint: 0xf2f2ee, accent: 0xe8501c, speed: 7.5 },
  { id: 'cc250', tons: 80, family: 'crane', name: 'VANTOR CC250 Wrecking Ball', brand: 'VANTOR', model: 'CC250', icon: '⚫', desc: 'Crawler crane with a 16 m lattice boom and a swinging wrecking ball. Classic.', scale: 1.0, paint: 0xd11f1f, accent: 0x222222, speed: 1.4 },
  // ---- tipper trucks (rear-tipping body; every truck comes in three sizes, see TRUCK_VARIANTS below)
  { id: 'tk370', tons: 16, family: 'truck', size: 's', name: 'VELKA G370 Box Tipper', brand: 'VELKA', model: 'G370', icon: '🚚', desc: 'Workhorse tipper in yard yellow with a square steel box body and a top-hinged tailgate that swings up when you tip. Wide flat floor for whole wall sections of blocks.', scale: 1, paint: 0xf2b705, accent: 0x1b1d20, bodyPaint: 0xf0b000, chassisPaint: 0x1d1e20, trim: 'work', body: 'box', bodyLabel: 'VELKA BAU', toolName: 'Steel box tipping body', speed: 10 },
  { id: 'tk410', tons: 26, family: 'truck', size: 'm', name: 'VELKA R410 XT Tipper', brand: 'VELKA', model: 'R410 XT', icon: '🚚', desc: 'Construction tipper: white cab-over cab, heavy XT bumper with skid plate, off-road tyres and a half-pipe body. Load it with blocks, back it up to the intake behind the crusher and tip.', scale: 1, paint: 0xf1f1ee, accent: 0x1b1d20, bodyPaint: 0xeeeeea, chassisPaint: 0x26282b, trim: 'xt', bodyLabel: 'VELKA KIPP', toolName: 'Half-pipe tipping body', speed: 9.8 },
  { id: 'tk650', tons: 35, family: 'truck', size: 'l', name: 'VELKA S650 V8 Tipper', brand: 'VELKA', model: 'S650 V8', icon: '🚛', desc: 'Flagship V8 tipper: silver metallic high-roof cab, chrome grille, roof light bar and polished rims, with a lightweight aluminium half-pipe body. The fastest truck on the yard.', scale: 1, paint: 0x9aa1a8, accent: 0x15171a, bodyPaint: 0xa7acb1, bodyMetal: true, chassisPaint: 0x17181a, trim: 'chrome', roof: 'high', bodyLabel: 'VELKA ALU', toolName: 'Aluminium half-pipe body', speed: 11 },
];

// every truck in the other two sizes: hidden from the spawn grid, picked with the size buttons in the showroom
for (const b of MACHINES.filter((x) => x.family === 'truck')) {
  for (const k of ['s', 'm', 'l']) {
    if (k === b.size) continue;
    const d = { s: -1, m: 0, l: 1 }[k] - { s: -1, m: 0, l: 1 }[b.size];
    MACHINES.push({ ...b, id: b.id + k, size: k, variantOf: b.id, tons: Math.round(b.tons + d * 9), speed: +(b.speed - d * 0.5).toFixed(1) });
  }
}
// every vehicle is 3 km/h faster than its base figure above
for (const m of MACHINES) m.speed = +(m.speed + 3 / 3.6).toFixed(3);
export const truckVariants = (id) => { const base = MACHINES.find((x) => x.id === id); const root = base.variantOf || base.id; return MACHINES.filter((x) => x.id === root || x.variantOf === root).sort((a, b) => 'sml'.indexOf(a.size) - 'sml'.indexOf(b.size)); };
export const BASE_MACHINES = MACHINES.filter((x) => !x.variantOf);
export { TRUCK_SIZES };

const BUILDERS = { excavator: buildExcavator, roller: buildRoller, paver: buildPaver, loader: buildLoader, dozer: buildDozer, dumper: buildDumper, crane: buildCrane, truck: buildTruck, painter: buildPainter };

export class Machine {
  constructor(ctx, spec, id, pos, yaw) {
    this.ctx = ctx; this.spec = spec; this.id = id; this.M = ctx.M; this.family = spec.family;
    this.s = spec.scale;
    this.root = new THREE.Group(); this.root.position.copy(pos); this.root.rotation.y = yaw;
    ctx.scene.add(this.root);
    this.model = new THREE.Group(); this.model.scale.setScalar(this.s); this.root.add(this.model);
    this.mats = machineMaterials(ctx.M, spec.paint, spec.accent);
    if (spec.armPaint) this.armMat = weathered(spec.armPaint, { base: this.mats.base, rough: 0.5 });
    this.yaw = yaw; this.swing = 0; this.boom = 0; this.stickA = 0; this.curl = 0; this.rot = 0; this.open = 1; this.openTarget = 1; this.chv = {};
    this.speed = 0; this.turn = 0; this.steerVis = 0; this.rpm = 0; this.hyd = 0;
    this.driver = -1; this.held = []; this.payload = { kind: null, kg: 0, color: new THREE.Color(0.5, 0.5, 0.5) };
    this.bodies = []; this.cylinders = []; this.probes = []; this.colliderSets = []; this.bakeList = [];
    this.tracks = []; this.wheels = []; this.steerWheels = []; this.extraMeshes = [];
    BUILDERS[spec.family](this);
    // buildings use big (1.2 m) blocks: grapples and buckets hold fewer of them
    if (this.att && this.att.pieces && this.att.behaviour !== 'clamp') this.att.pieces = Math.max(1, Math.round(this.att.pieces / (this.att.behaviour === 'jaw' ? 2 : 3)));
    const d = this.defaults || {};
    this.boom = d.boom ?? 0; this.stickA = d.stick ?? 0; this.curl = d.curl ?? 0;
    if (['breaker', 'skip', 'crusher'].includes(spec.attach) || STARTS_OFF.has(spec.attach) || spec.under === 'backhoe' || spec.family !== EX) { this.open = 0; this.openTarget = 0; }
    // merge static parts to keep draw calls low (every group: children never move relative to it)
    const groups = []; this.model.traverse((o) => { if (o.isGroup) groups.push(o); });
    for (const g of groups) bake(g);
    for (const o of this.extraMeshes) if (o.isGroup) bake(o);
    this.buildPhysics();
    this.pose();
    // spawn with the tool clear of the ground: raise the boom until nothing is below grade
    if (this.breakShapes.length && this.rig.limits.boom && this.family !== 'dozer') {
      const lo = this.rig.limits.boom[0];
      for (let i = 0; i < 60 && this.armPenetration() > -0.05 && this.boom > lo; i++) { this.boom = Math.max(lo, this.boom - 0.04); this.pose(); }
    }
    this.levelClamp();
    restPositions(this.root, this.extraMeshes);
    this.syncBodies(true);
    this.prevProbe = this.probes.map((p) => p.obj.getWorldPosition(new THREE.Vector3()));
    this.lastGp = this.grabPoint.getWorldPosition(new THREE.Vector3());
  }

  get pos() { return this.root.position; }
  // brick clamp: pick the curl that makes the clamp hang level
  levelClamp() {
    if (!this.att || !this.att.rotor) return;
    const L = this.rig.limits.curl, q = new THREE.Quaternion(), d = new THREE.Vector3();
    let best = this.curl, bv = 9;
    for (let c = L[0]; c <= L[1]; c += 0.02) { this.curl = c; this.pose(); d.set(0, 0, 1).applyQuaternion(this.att.rotor.getWorldQuaternion(q)); if (d.y < bv) { bv = d.y; best = c; } }
    this.curl = best; this.pose();
  }
  // object that held pieces are attached to (the clamp's rotor, otherwise the attachment)
  holdFrame() { return (this.att && this.att.rotor) || this.attach; }
  anchor(parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; }

  // ======================================================================= pose
  groundAt(x, z) {
    const h = this.ctx.groundAt ? this.ctx.groundAt(x, z) : terrainHeight(x, z);
    if (this.spec.amphibious) return Math.max(h, SITE.lake.water - 0.95 * this.s);
    return h;
  }
  pose() {
    this.root.rotation.y = this.yaw;
    this.root.position.y = this.groundAt(this.root.position.x, this.root.position.z) + (this.floating ? Math.sin(performance.now() * 0.0015) * 0.04 : 0);
    this.mats.base.value = this.root.position.y;
    this.rig.apply(this);
    this.root.updateMatrixWorld(true);
    this.updateCylinders();
    const att = this.att;
    if (att && att.contents && att.bulk) {
      const f = this.payload.kg / this.capacity();
      att.contents.visible = f > 0.01;
      if (f > 0.01) {
        att.contents.material.color.copy(this.payload.kind === 'water' ? new THREE.Color(0x3a6f80) : this.payload.color);
        if (att.contentsScale) att.contents.scale.copy(att.contentsScale).multiplyScalar(0.35 + 0.65 * Math.min(1, f));
        else att.contents.position.z = 1.45 - Math.min(1, f) * 0.85;
      }
    }
    if (this.hopperFill) {
      const f = this.payload.kg / this.capacity();
      this.hopperFill.visible = f > 0.01;
      this.hopperFill.position.y = 0.08 + Math.min(1, f) * 0.6;
      this.hopperFill.material.color.copy(this.payload.color);
    }
  }
  capacity() { const b = this.att && this.att.bulk; if (!b) return 1; return b.capacity * (this.family === EX && this.att.kind !== 'minibucket' ? this.s ** 3 : 1); }

  updateCylinders() {
    const up = new THREE.Vector3(0, 1, 0);
    for (const c of this.cylinders) {
      const pa = this.upper.worldToLocal(c.a.getWorldPosition(new THREE.Vector3()));
      const pb = this.upper.worldToLocal(c.b.getWorldPosition(new THREE.Vector3()));
      const dv = pb.clone().sub(pa); const len = dv.length(); dv.normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(up, dv);
      const bl = Math.max(0.3, len * 0.58);
      c.barrel.position.copy(pa); c.barrel.quaternion.copy(q); c.barrel.scale.set(1, bl, 1);
      c.rod.position.copy(pb); c.rod.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(up, dv.clone().negate())); c.rod.scale.set(1, Math.max(0.1, len - bl * 0.75 + 0.05), 1);
      c.eye.position.copy(pb); c.eye.quaternion.copy(q);
      if (c.clevis) { c.clevis.position.copy(pa); c.clevis.quaternion.copy(q); }
    }
  }

  // ======================================================================= physics
  buildPhysics() {
    this.blockShapes = []; this.breakShapes = [];
    if (this.ctx.preview) return; // showroom / thumbnails: visuals only
    const W = this.ctx.physics.world, s = this.s;
    for (const set of this.colliderSets) {
      const body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      const s = this.s * (set.k || 1); // set.k: extra scale of a scaled-up attachment
      for (const [x, y, z, sx, sy, sz, rx = 0, rz = 0] of set.boxes) {
        const rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz));
        W.createCollider(RAPIER.ColliderDesc.cuboid(sx * s / 2, sy * s / 2, sz * s / 2).setTranslation(x * s, y * s, z * s).setRotation(rq).setFriction(set.friction ?? 1.0).setCollisionGroups(machineGroups(this.id)), body);
        const cub = (d) => new RAPIER.Cuboid(Math.max(0.02, sx * s / 2 + d), Math.max(0.02, sy * s / 2 + d), Math.max(0.02, sz * s / 2 + d));
        const info = { obj: set.obj, off: new THREE.Vector3(x, y, z), rq, shape: cub(-0.03) };
        // inner: may not overlap intact blocks (hard stop). Between inner and outer the machine is pressing
        // against the wall and damages it (machineLogic) until the blocks give way.
        if (set.chassis) { info.off.y = Math.max(y, sy / 2 + 0.2 / s); info.inner = cub(-0.22); info.outer = cub(0.12); this.blockShapes.push(info); }
        if (set.breaks) this.breakShapes.push({ ...info, ball: !!set.ball, shape: cub(0.02), inner: cub(-0.16), outer: cub(0.04) });
      }
      this.bodies.push({ obj: set.obj, body });
    }
  }
  destroy() {
    if (!this.ctx.preview) for (const { body } of this.bodies) this.ctx.physics.world.removeRigidBody(body);
    this.ctx.scene.remove(this.root);
    for (const o of this.extraMeshes) this.ctx.scene.remove(o);
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  syncBodies(teleport = false) {
    for (const b of this.bodies) {
      const { obj, body } = b;
      obj.getWorldPosition(_v); obj.getWorldQuaternion(_q);
      // a part that has not moved since last frame is left alone: no new kinematic target, so the physics engine
      // does not re-index its colliders or keep the blocks around a parked machine awake
      const still = !teleport && b.lp && b.lp.distanceToSquared(_v) < 1e-10 && Math.abs(b.lq.dot(_q)) > 1 - 1e-10;
      if (!b.lp) { b.lp = new THREE.Vector3(); b.lq = new THREE.Quaternion(); }
      b.lp.copy(_v); b.lq.copy(_q);
      if (still) { if (b.still) continue; b.still = true; } else b.still = false;
      if (teleport) { body.setTranslation(_v, true); body.setRotation(_q, true); }
      else {
        // Rapier 0.14 never moves a kinematic body's world centre of mass, and the solver uses it as the lever arm
        // for the body's spin: loads on a turning truck bed got dragged sideways. Refresh it every frame.
        body.recomputeMassPropertiesFromColliders();
        body.setNextKinematicTranslation(_v); body.setNextKinematicRotation(_q);
      }
    }
  }
  // world pose of a collision box. Called many times a frame, so each box reuses its own vector / quaternion:
  // use the result straight away (copy it to keep it)
  shapePose(b) {
    if (!b._pq) b._pq = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    b._pq.p.copy(b.off).applyMatrix4(b.obj.matrixWorld);
    b.obj.getWorldQuaternion(b._pq.q).multiply(b.rq);
    return b._pq;
  }
  // { hard, push }: hard = overlaps something solid (or blocks deeper than the press margin),
  // push = touching intact building blocks (they take damage on the authority side)
  contactState(others, arm = true) {
    const W = this.ctx.physics.world, ctx = this.ctx;
    let hard = false, push = false, pushBody = false;
    const test = (b, shape, onPiece) => {
      const { p, q } = this.shapePose(b);
      W.intersectionsWithShape(p, q, shape, (c) => {
        if (ctx.isGround && ctx.isGround(c)) return true;
        if (ctx.isPiece && ctx.isPiece(c)) { onPiece(); return true; }
        hard = true; return false;
      }, RAPIER.QueryFilterFlags.ONLY_FIXED);
    };
    for (const b of this.blockShapes) {
      test(b, b.shape, () => {});
      if (hard) return { hard, push };
      test(b, b.inner, () => { hard = true; });
      if (hard) return { hard, push };
      test(b, b.outer, () => { pushBody = true; });
    }
    if (arm) for (const b of this.breakShapes) {
      const { p, q } = this.shapePose(b);
      W.intersectionsWithShape(p, q, b.inner, (c) => { if (ctx.isPiece && ctx.isPiece(c)) { hard = true; return false; } return true; }, RAPIER.QueryFilterFlags.ONLY_FIXED);
      if (hard) return { hard, push };
      W.intersectionsWithShape(p, q, b.outer, (c) => { if (ctx.isPiece && ctx.isPiece(c)) { push = true; return false; } return true; }, RAPIER.QueryFilterFlags.ONLY_FIXED);
    }
    if (!this.spec.amphibious && terrainHeight(this.root.position.x, this.root.position.z) < -0.25) hard = true;
    for (const o of others) {
      if (o === this) continue;
      const d = Math.hypot(o.root.position.x - this.root.position.x, o.root.position.z - this.root.position.z);
      if (d < (o.radius * o.s + this.radius * this.s) * 0.7) hard = true;
    }
    return { hard, push, pushBody };
  }
  blocked(others) { const c = this.contactState(others, false); return c.hard || c.pushBody; }

  // deepest point of any arm / attachment / blade collider below the ground (negative = clear)
  armPenetration() {
    let worst = -9;
    const ga = this.ctx.groundAt || terrainHeight;
    for (const b of this.breakShapes) {
      if (b.ball) continue; // a ball on a rope / chain is not part of the arm
      const { p, q } = this.shapePose(b);
      const h = b.shape.halfExtents;
      for (let i = 0; i < 8; i++) {
        _v.set(i & 1 ? h.x : -h.x, i & 2 ? h.y : -h.y, i & 4 ? h.z : -h.z).applyQuaternion(q).add(p);
        const d = ga(_v.x, _v.z) - _v.y;
        if (d > worst) worst = d;
      }
    }
    return worst;
  }

  // ======================================================================= local control (driver)
  drive(dt, c, others) {
    const sp = this.spec, rig = this.rig;
    const prev = { x: this.root.position.x, z: this.root.position.z, yaw: this.yaw, swing: this.swing };
    const armPrev = { boom: this.boom, stickA: this.stickA, curl: this.curl, rot: this.rot };
    const pen0 = this.breakShapes.length ? this.armPenetration() : -9;
    this.floating = sp.amphibious && terrainHeight(this.root.position.x, this.root.position.z) < SITE.lake.water - 0.95 * this.s;
    const vmax = sp.speed * (this.floating ? 0.6 : 1);
    const want = c.drive * vmax;
    if (rig.accel) {
      // trucks: limited engine pull and braking so a load does not slide out
      const dv = want - this.speed, lim = (Math.sign(dv) === Math.sign(this.speed) || !this.speed ? rig.accel : rig.brake) * dt;
      this.speed += clamp(dv, -lim, lim);
    } else this.speed += (want - this.speed) * Math.min(1, dt * (rig.drive === 'tank' ? 2.5 : 1.5));
    if (rig.drive === 'car') {
      let lock = 0.45;
      // speed-sensitive steering: cap the sideways acceleration (wheelbase * a / v^2) on long, heavy vehicles
      if (rig.maxLat) lock = Math.min(lock, Math.atan(rig.maxLat * rig.wheelbase * this.s / Math.max(1, this.speed * this.speed)));
      this.steerVis += (c.steer * -lock - this.steerVis) * Math.min(1, dt * 4);
      this.turn = (this.speed / (rig.wheelbase ? rig.wheelbase * this.s : 2.7)) * Math.tan(this.steerVis);
    } else if (rig.drive === 'artic') {
      this.steerVis += (c.steer * -0.6 - this.steerVis) * Math.min(1, dt * 2.5);
      this.turn = (this.speed / (rig.wheelbase * this.s)) * Math.sin(this.steerVis) * 1.6;
    } else this.turn += (-c.steer * 0.75 - this.turn) * Math.min(1, dt * 3);
    this.yaw += this.turn * dt;
    this.root.position.x += Math.sin(this.yaw) * this.speed * dt;
    this.root.position.z += Math.cos(this.yaw) * this.speed * dt;
    const L = rig.limits, R = rig.rates;
    const chan = (key, prop, input) => {
      if (!(key in L) && !(key === 'swing' && rig.swing)) return;
      let rate = input * (R[key] || 0.6);
      // heavy machines: the hydraulics take time to speed up and keep moving a moment after you let go
      if (sp.inertia) { const cv = this.chv[key] || 0; rate = this.chv[key] = cv + (rate - cv) * Math.min(1, dt * 1.6); }
      let v = this[prop] + rate * dt;
      const lim = L[key];
      if (lim) { const cl = clamp(v, lim[0], lim[1]); if (cl !== v) this.chv[key] = 0; v = cl; }
      this[prop] = v;
    };
    chan('swing', 'swing', c.swing);
    chan('boom', 'boom', this.family === 'crane' ? c.boom : c.boom);
    chan('stick', 'stickA', this.family === 'crane' ? -c.stick : c.stick);
    chan('curl', 'curl', c.curl);
    chan('rot', 'rot', c.rot || 0);
    if (c.grabToggle) this.openTarget = this.openTarget > 0.5 ? 0 : 1;
    this.open += Math.sign(this.openTarget - this.open) * Math.min(Math.abs(this.openTarget - this.open), dt * 1.8);
    this.pose();
    // the arm / bucket / blade may touch the ground but never sink into it
    if (this.breakShapes.length) {
      const pen = this.armPenetration();
      // only the arm controls are held back; driving onto a raised slab is allowed (the tool rides over it)
      const tol = this.att && ['scoop', 'skip', 'crusher', 'blade'].includes(this.att.behaviour) ? 0.3 : 0.1; // buckets may scrape
      if (pen > tol && pen > pen0 + 0.002) { Object.assign(this, armPrev); this.pose(); this.chv = {}; }
    }
    let cs = this.contactState(others);
    if (cs.hard) {
      const want = { x: this.root.position.x, z: this.root.position.z, yaw: this.yaw, swing: this.swing, boom: this.boom, stickA: this.stickA, curl: this.curl, rot: this.rot };
      // undo the drive / swing step first, then the arm step
      this.root.position.x = prev.x; this.root.position.z = prev.z; this.yaw = prev.yaw; this.swing = prev.swing; this.speed *= -0.1;
      this.chv = {}; // blocked hydraulics stall instead of storing momentum
      this.pose(); cs = this.contactState(others);
      if (cs.hard) {
        Object.assign(this, armPrev); this.pose(); cs = this.contactState(others);
        if (cs.hard) {
          // already stuck before this step (e.g. a wall collapsed onto the arm): let the operator move out
          this.root.position.x = want.x; this.root.position.z = want.z;
          Object.assign(this, { yaw: want.yaw, swing: want.swing, boom: want.boom, stickA: want.stickA, curl: want.curl, rot: want.rot });
          this.pose(); cs = { hard: false, push: true, pushBody: true };
        }
      }
    }
    // pressing into a wall: the authority side grinds the touched blocks down (machineLogic)
    // (arm / tool against the wall vs. the body or tracks driven into it)
    this.push = cs.push ? Math.min(1, Math.abs(c.swing) + Math.abs(c.boom) + Math.abs(c.stick) + Math.abs(c.curl) + Math.abs(c.rot || 0)) : 0;
    this.pushBody = cs.pushBody ? Math.min(1, Math.abs(c.drive) + Math.abs(c.steer) * 0.5) : 0;
    const moved = Math.hypot(this.root.position.x - prev.x, this.root.position.z - prev.z) * Math.sign(this.speed || 1);
    this.animateTracks(moved, this.yaw - prev.yaw);
    const motion = Math.abs(c.drive) + Math.abs(c.steer) + Math.abs(c.swing) + Math.abs(c.boom) + Math.abs(c.stick) + Math.abs(c.curl) + Math.abs(c.rot || 0);
    this.hyd += (Math.min(1, motion) - this.hyd) * Math.min(1, dt * 5);
    if (this.joyL) { this.joyL.rotation.set(c.boom * 0.3, 0, -c.swing * 0.3); this.joyR.rotation.set(c.stick * 0.3, 0, -c.curl * 0.3); }
  }

  animateTracks(dist, dyaw) {
    const g = (this.spec.gauge || (this.family === 'crane' ? 1.75 : this.family === 'dozer' ? 1.25 : this.spec.under === 'steel' ? 1.3 : 1.19)) * this.s;
    if (this.tracks.length) {
      const dl = (dist + dyaw * g) / this.s, dr = (dist - dyaw * g) / this.s;
      if (Math.abs(dl) > 1e-5 || Math.abs(dr) > 1e-5) { this.tracks[0].move(dr); this.tracks[1].move(dl); }
    }
    const r = this.family === 'roller' ? 0.68 : this.family === 'loader' ? 0.88 : this.family === 'truck' ? 0.54 : this.spec.under === 'spider' ? 0.58 : 0.55;
    for (const w of this.wheels) w.rotation.x += dist / ((w.userData.r || r) * this.s);
  }

  // ======================================================================= network pose
  packPose() { return [this.id, this.root.position.x, this.root.position.z, this.yaw, this.swing, this.boom, this.stickA, this.curl, this.open, this.steerVis, this.hyd, this.push || 0, this.rot, this.pushBody || 0]; }
  applyPose(a, i) { this.net = { x: a[i + 1], z: a[i + 2], yaw: a[i + 3], swing: a[i + 4], boom: a[i + 5], stick: a[i + 6], curl: a[i + 7], open: a[i + 8], steer: a[i + 9], hyd: a[i + 10], push: a[i + 11], rot: a[i + 12], pushBody: a[i + 13] }; }
  followNet(dt) {
    const n = this.net; if (!n) return;
    const k = 1 - Math.exp(-dt * 12);
    const px = this.root.position.x, pz = this.root.position.z, py = this.yaw;
    const ang = (a, b) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
    this.root.position.x += (n.x - px) * k; this.root.position.z += (n.z - pz) * k;
    this.yaw = ang(this.yaw, n.yaw); this.swing = ang(this.swing, n.swing);
    this.boom += (n.boom - this.boom) * k; this.stickA += (n.stick - this.stickA) * k; this.curl += (n.curl - this.curl) * k; this.rot += ((n.rot || 0) - this.rot) * k; this.open += (n.open - this.open) * k;
    this.openTarget = n.open > 0.5 ? 1 : 0;
    this.steerVis = n.steer; this.hyd = n.hyd; this.push = n.push || 0; this.pushBody = n.pushBody || 0;
    this.floating = this.spec.amphibious && terrainHeight(this.root.position.x, this.root.position.z) < SITE.lake.water - 0.95 * this.s;
    const dx = this.root.position.x - px, dz = this.root.position.z - pz;
    this.speed = (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / Math.max(dt, 1e-3);
    this.pose();
    this.animateTracks(dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw), this.yaw - py);
  }

  // ======================================================================= shared per-frame
  idle(dt, driven) {
    this.rpm += ((driven ? 0.35 + this.hyd * 0.65 : 0) - this.rpm) * Math.min(1, dt * (driven ? 2 : 0.6));
    if (!driven) { this.hyd *= Math.max(0, 1 - dt * 3); if (this.family !== EX) this.speed *= Math.max(0, 1 - dt * 4); }
    if (this.beacon) this.beacon.material.emissiveIntensity = driven ? 0.4 + Math.max(0, Math.sin(performance.now() * 0.012)) * 2 : 0.2;
    if (this.att && this.att.chisel) {
      const hitting = this.breakerActive && this.openTarget > 0.5;
      this.att.chisel.position.z = hitting ? Math.abs(Math.sin(performance.now() * 0.06)) * 0.12 : 0;
    }
    if (this.att && this.att.gauge) this.att.gauge.material.color.setHSL(0.55, 0.6, 0.35 + 0.5 * (1 - this.payload.kg / this.capacity()));
    this.vibrating = this.family === 'roller' && this.openTarget > 0.5;
    this.crushing = this.att && this.att.behaviour === 'crusher' && this.openTarget > 0.5 && this.held.length > 0;
    if (this.vibrating || this.crushing) this.rig.apply(this);
    if (this.family === 'crane') this.ballSt = stepCrane(this, dt, (x, z) => this.groundAt(x, z));
    if (this.funIdle) this.funIdle(dt);
  }

  serialize() {
    const p = this.payload;
    return { id: this.id, spec: this.spec.id, pose: [this.root.position.x, this.root.position.z, this.yaw, this.swing, this.boom, this.stickA, this.curl, this.open, this.openTarget, this.rot].map((v) => Math.round(v * 1e4) / 1e4),
      payload: [p.kind, Math.round(p.kg * 10) / 10, +p.color.r.toFixed(4), +p.color.g.toFixed(4), +p.color.b.toFixed(4)], driver: this.driver };
  }
  restorePose(a) {
    [this.root.position.x, this.root.position.z, this.yaw, this.swing, this.boom, this.stickA, this.curl, this.open, this.openTarget] = a;
    this.rot = a[9] || 0;
    this.pose(); this.syncBodies(true);
    this.prevProbe = this.probes.map((p) => p.obj.getWorldPosition(new THREE.Vector3()));
  }
  setPayload(kind, kg, r, g, b) { this.payload.kind = kg > 0.01 ? kind : null; this.payload.kg = kg > 0.01 ? kg : 0; this.payload.color.setRGB(r, g, b); }

  seatWorld() { return this.seat.getWorldPosition(new THREE.Vector3()); }
  doorWorld() { const d = this.door.getWorldPosition(new THREE.Vector3()); d.y = this.root.position.y; return d; }
  camDistance() { return 11 * Math.max(0.6, this.s) * (this.spec.boom === 'long' ? 1.5 : 1) * (this.camScale || 1); }
}

// control labels per machine family (touch buttons + key hints)
export function controlsFor(m) {
  const f = m.family, a = m.spec.attach;
  if (f === 'loader') return { right: 'LIFT', stickOut: null, stickIn: null, curlIn: 'RACK', curlOut: 'DUMP', grab: null, hint: '<kbd>↑</kbd><kbd>↓</kbd> lift arms · <kbd>Z</kbd><kbd>X</kbd> rack / dump bucket' };
  if (f === 'dozer') return { right: 'BLADE', stickOut: 'RIP ↓', stickIn: 'RIP ↑', curlIn: 'TILT ↑', curlOut: 'TILT ↓', grab: null, hint: '<kbd>↑</kbd><kbd>↓</kbd> blade · <kbd>Z</kbd><kbd>X</kbd> pitch · <kbd>R</kbd><kbd>F</kbd> ripper' };
  if (f === 'dumper') return { right: 'SLEW', stickOut: null, stickIn: null, curlIn: 'TIP', curlOut: 'LOWER', grab: null, hint: '<kbd>←</kbd><kbd>→</kbd> slew skip · <kbd>Z</kbd><kbd>X</kbd> tip / lower' };
  if (f === 'truck') return { right: null, stickOut: null, stickIn: null, curlIn: 'TIP', curlOut: 'LOWER', grab: null, hint: '<kbd>Z</kbd><kbd>X</kbd> tip / lower the body · back up to where you want the load, then tip' };
  if (f === 'painter') return { right: null, stickOut: null, stickIn: null, curlIn: null, curlOut: null, rot: true, grab: '🎨<small>SPRAY</small>', hint: '<kbd>Click</kbd>/<kbd>Space</kbd> sprayer on / off · <kbd>T</kbd><kbd>Y</kbd> paint colour · drive over a repaired pothole to paint it' };
  if (f === 'roller') return { right: null, stickOut: null, stickIn: null, curlIn: null, curlOut: null, grab: '〰️<small>VIBRATE</small>', hint: '<kbd>Click</kbd>/<kbd>Space</kbd> drum vibration on / off' };
  if (f === 'paver') return { right: 'SCREED', stickOut: null, stickIn: null, curlIn: 'WINGS ↑', curlOut: 'WINGS ↓', grab: '🛣️<small>PAVE</small>', hint: '<kbd>Click</kbd>/<kbd>Space</kbd> paving flow · <kbd>Z</kbd><kbd>X</kbd> hopper wings' };
  if (f === 'crane') return { right: 'SWING · BOOM', stickOut: 'LOWER', stickIn: 'HOIST', curlIn: null, curlOut: null, grab: null, hint: '<kbd>←</kbd><kbd>→</kbd> swing · <kbd>↑</kbd><kbd>↓</kbd> boom · <kbd>R</kbd><kbd>F</kbd> winch' };
  if (m.spec.under === 'backhoe') return { right: 'SWING · BOOM', stickOut: 'ARM OUT', stickIn: 'ARM IN', curlIn: 'CURL', curlOut: 'DUMP', rot: true, rotLabels: ['LOADER ↓', 'LOADER ↑'], grab: '🪣<small>FRONT</small>', hint: '<kbd>←</kbd><kbd>→</kbd> swing · <kbd>↑</kbd><kbd>↓</kbd> boom · <kbd>R</kbd><kbd>F</kbd> arm · <kbd>Z</kbd><kbd>X</kbd> curl the rear bucket · <kbd>T</kbd><kbd>Y</kbd> front loader down / up · <kbd>Click</kbd> tip the front bucket (drive into rubble with it lowered to fill it)' };
  const FUN = { magnet: ['🧲<small>MAGNET</small>', 'magnet on / off'], xball: ['⛓️<small>CHAIN</small>', 'chain out / in · swing hard to smash'], blaster: ['🌀<small>VACUUM</small>', 'vacuum on / off · hold <kbd>T</kbd> or <kbd>Y</kbd> to fire blocks'],
    cutter: ['🥁<small>DRUMS</small>', 'drums on / off'], saw: ['🪚<small>SAW</small>', 'saw on / off'], auger: ['🌪️<small>DRILL</small>', 'drill on / off'], plate: ['〰️<small>VIBRATE</small>', 'vibration on / off'], forks: ['🔒<small>LOCK</small>', 'lock / unlock the blocks on the forks'], jet: ['💦<small>JET</small>', 'water jet on / off'] }[a];
  if (FUN) return { right: 'SWING · BOOM', stickOut: 'ARM OUT', stickIn: 'ARM IN', curlIn: 'CURL', curlOut: 'CURL', grab: FUN[0], ...(a === 'blaster' ? { rot: true, rotLabels: ['FIRE', 'FIRE'] } : {}), hint: '<kbd>←</kbd><kbd>→</kbd> swing · <kbd>↑</kbd><kbd>↓</kbd> boom · <kbd>R</kbd><kbd>F</kbd> arm · <kbd>Z</kbd><kbd>X</kbd> curl · <kbd>Click</kbd> ' + FUN[1] };
  if (a === 'brickclamp') return { right: 'SWING · BOOM', stickOut: 'ARM OUT', stickIn: 'ARM IN', curlIn: 'TILT', curlOut: 'TILT', rot: true, grab: '✊<small>CLAMP</small>', hint: '<kbd>←</kbd><kbd>→</kbd> swing · <kbd>↑</kbd><kbd>↓</kbd> boom · <kbd>R</kbd><kbd>F</kbd> arm · <kbd>Z</kbd><kbd>X</kbd> tilt · <kbd>T</kbd><kbd>Y</kbd> rotate clamp · <kbd>Click</kbd> magnetic clamp (grabs up to 4 blocks)' };
  const g = a === 'breaker' ? '🔨<small>HAMMER</small>' : a === 'skip' ? '🚪<small>GATE</small>' : a === 'crusher' ? '⚙️<small>CRUSH</small>' : ['bucket', 'bigbucket', 'minibucket', 'tank'].includes(a) ? null : '✊<small>GRAB</small>';
  return { right: 'SWING · BOOM', stickOut: 'ARM OUT', stickIn: 'ARM IN', curlIn: 'CURL', curlOut: 'DUMP', grab: g, hint: '<kbd>←</kbd><kbd>→</kbd> swing · <kbd>↑</kbd><kbd>↓</kbd> boom · <kbd>R</kbd><kbd>F</kbd> arm · <kbd>Z</kbd><kbd>X</kbd> curl' + (g ? ' · <kbd>Click</kbd> tool' : '') };
}
