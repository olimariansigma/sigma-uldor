// Machine showroom: a studio turntable that shows one machine in full 3D before you spawn it.
// Also renders the transparent machine thumbnails used by the spawn menu (build time, see scripts/thumbs.cjs).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MACHINES, Machine } from './machines.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class Showroom {
  constructor(game) {
    this.g = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
    this.envs = new Map();
    this.active = false;
    this.machine = null; this.spec = null;
    this.spin = 0.7; this.pitch = 0.2; this.zoom = 1; this.idleT = 0; this.dragging = false;

    this.bg = canvasTex(4, 512, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#30353d'); g.addColorStop(0.6, '#1a1d22'); g.addColorStop(1, '#15171b');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    // studio floor: polished concrete fading into the dark
    const floorTex = canvasTex(512, 512, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, '#5d626a'); g.addColorStop(0.4, '#363a41'); g.addColorStop(0.8, '#1a1c20'); g.addColorStop(1, '#15171b');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`; c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    });
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(60, 96), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.1 }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    // turntable with a hazard-striped rim
    const rimTex = canvasTex(1024, 32, (c, w, h) => {
      c.fillStyle = '#16181b'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#f2b705';
      for (let x = -h; x < w + h; x += 48) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 24, h); c.lineTo(x + 24 + h, 0); c.lineTo(x + h, 0); c.fill(); }
    });
    rimTex.wrapS = THREE.RepeatWrapping; rimTex.repeat.x = 3;
    const deck = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.35, metalness: 0.75 });
    this.table = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 96, 1, true), new THREE.MeshStandardMaterial({ map: rimTex, roughness: 0.5, metalness: 0.2 }));
    top.position.y = 0.05;
    const cap = new THREE.Mesh(new THREE.CircleGeometry(1, 96), deck); cap.rotation.x = -Math.PI / 2; cap.position.y = 0.1; cap.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.006, 6, 96), new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.3, metalness: 0.9 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.101;
    this.table.add(top, cap, ring);
    this.scene.add(this.table);
    // contact shadow only (thumbnails on transparent background)
    this.shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.38 }));
    this.shadowCatcher.rotation.x = -Math.PI / 2; this.shadowCatcher.receiveShadow = true; this.shadowCatcher.visible = false;
    this.scene.add(this.shadowCatcher);

    this.key = new THREE.DirectionalLight(0xfff1de, 2.4); this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048); this.key.shadow.bias = -0.0004; this.key.shadow.normalBias = 0.03;
    this.rim = new THREE.DirectionalLight(0xbcd4ff, 1.6);
    this.scene.add(this.key, this.key.target, this.rim, this.rim.target, new THREE.HemisphereLight(0xdfe8f5, 0x2a2622, 0.45));
  }

  envFor(renderer) {
    if (!this.envs.has(renderer)) {
      const pm = new THREE.PMREMGenerator(renderer);
      this.envs.set(renderer, pm.fromScene(new RoomEnvironment(), 0.04).texture);
      pm.dispose();
    }
    return this.envs.get(renderer);
  }

  ctx() { return { scene: this.scene, physics: null, M: this.g.M, preview: true, groundAt: () => this.deck || 0 }; }

  show(specId) {
    const spec = MACHINES.find((m) => m.id === specId);
    if (!spec) return;
    if (this.machine) this.machine.destroy();
    this.spec = spec;
    this.deck = 0.1;
    this.machine = new Machine(this.ctx(), spec, -1, new THREE.Vector3(0, 0, 0), this.spin);
    this.machine.driver = -1;
    // let the crane ball settle so it does not start mid-swing
    if (spec.family === 'crane') for (let i = 0; i < 240; i++) this.machine.idle(1 / 60, false);
    this.frame();
  }

  // compact "hero" pose so the whole machine reads well on a turntable
  heroPose() {
    const m = this.machine, L = m.rig.limits, cl = (v, k) => (L[k] ? Math.min(L[k][1], Math.max(L[k][0], v)) : v);
    if (m.family === 'excavator') {
      if (m.spec.boom === 'long') { m.boom = cl(-1.05, 'boom'); m.stickA = cl(2.1, 'stick'); m.curl = cl(1.1, 'curl'); }
      else { m.boom = cl(-0.62, 'boom'); m.stickA = cl(1.85, 'stick'); m.curl = cl(1.35, 'curl'); }
      if (m.att && m.att.jaws && m.att.jaws.length) m.open = 0.6;
      if (m.att && m.att.rotor) { m.boom = cl(-0.75, 'boom'); m.stickA = cl(1.6, 'stick'); m.levelClamp(); m.open = 1; }
    }
    if (m.family === 'loader') { m.boom = cl(0.15, 'boom'); m.curl = cl(0.4, 'curl'); }
  }

  // fit camera / lights / turntable to the machine's size. Uses a cylinder around the turntable axis so the
  // framing stays steady while the machine spins.
  frame() {
    const m = this.machine;
    this.heroPose();
    m.yaw = 0; m.pose();
    const box = new THREE.Box3().setFromObject(m.root);
    for (const e of m.extraMeshes) box.expandByObject(e);
    let R = 0;
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) R = Math.max(R, Math.hypot(x, z));
    this.R = R; this.y0 = Math.max(0, box.min.y); this.y1 = box.max.y;
    const foot = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    this.table.scale.set(foot * 0.55 + 0.4, 1, foot * 0.55 + 0.4);
    this.floor.scale.setScalar(Math.max(6, R * 2.6) / 60);
    this.fog = new THREE.Fog(0x15171b, R * 3, R * 8);
    const r = Math.max(R, this.y1);
    this.radius = r;
    this.key.position.set(r * 1.4, r * 2.4, r * 1.2); this.key.target.position.set(0, 0, 0);
    const sc = this.key.shadow.camera; sc.left = sc.bottom = -r * 1.3; sc.right = sc.top = r * 1.3; sc.near = 0.1; sc.far = r * 6; sc.updateProjectionMatrix();
    this.rim.position.set(-r * 1.6, r * 1.2, -r * 1.8);
    m.yaw = this.spin; m.pose();
  }

  // place the camera so every point in `pts` fits the frustum (pts relative to `target`)
  fit(pts, target, aspect, margin) {
    const p = this.pitch;
    const fwd = new THREE.Vector3(0, -Math.sin(p), -Math.cos(p)); // camera looks along fwd
    const right = new THREE.Vector3(1, 0, 0), up = new THREE.Vector3().crossVectors(right, fwd).negate();
    const tv = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * margin, th = tv * aspect;
    let d = 0.5;
    for (const q of pts) {
      const rel = q.clone().sub(target);
      const x = rel.dot(right), y = rel.dot(up), z = -rel.dot(fwd);
      d = Math.max(d, z + Math.abs(x) / th, z + Math.abs(y) / tv);
    }
    this.camera.position.copy(target).addScaledVector(fwd, -d * this.zoom);
    this.camera.lookAt(target);
  }

  placeCamera(aspect) {
    const pts = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; for (const y of [this.y0, this.y1]) pts.push(new THREE.Vector3(Math.cos(a) * this.R, y, Math.sin(a) * this.R)); }
    this.fit(pts, new THREE.Vector3(0, (this.y0 + this.y1) * 0.45, 0), aspect, 0.92);
  }

  update(dt) {
    if (!this.machine) return;
    this.idleT += dt;
    if (!this.dragging && this.idleT > 1.5) this.spin += dt * 0.32;
    this.machine.yaw = this.spin; this.machine.pose();
    this.machine.idle(dt, false);
    this.table.rotation.y = this.spin;
  }

  render(renderer, dt) {
    this.update(dt);
    this.scene.background = this.bg; this.scene.fog = this.fog || null;
    this.scene.environment = this.envFor(renderer); this.scene.environmentIntensity = 0.9;
    this.floor.visible = true; this.table.visible = true; this.shadowCatcher.visible = false;
    const s = renderer.getSize(new THREE.Vector2());
    this.camera.aspect = s.x / s.y;
    // keep the machine left of centre on wide screens (info panel sits on the right)
    this.camera.setViewOffset(s.x, s.y, s.x > s.y * 1.3 ? s.x * 0.16 : 0, s.x > s.y * 1.3 ? 0 : s.y * 0.12, s.x, s.y);
    this.camera.updateProjectionMatrix();
    this.placeCamera(this.camera.aspect * (s.x > s.y * 1.3 ? 0.68 : 1));
    if (this.fog) { const d = this.camera.position.distanceTo(new THREE.Vector3(0, (this.y0 + this.y1) * 0.45, 0)); this.fog.near = d + this.R * 0.9; this.fog.far = d + this.R * 4.5; }
    renderer.render(this.scene, this.camera);
  }

  // transparent product shot of one machine (build-time thumbnails)
  thumbnail(renderer, specId, w, h) {
    this.spin = 0.72; this.pitch = 0.2; this.zoom = 1;
    this.show(specId);
    this.scene.background = null; this.scene.fog = null;
    this.scene.environment = this.envFor(renderer); this.scene.environmentIntensity = 0.95;
    this.floor.visible = false; this.table.visible = false; this.shadowCatcher.visible = true;
    this.camera.aspect = w / h; this.camera.clearViewOffset(); this.camera.updateProjectionMatrix();
    // fit the real silhouette: sample mesh vertices in world space
    const m = this.machine; m.root.updateMatrixWorld(true);
    const pts = [], box = new THREE.Box3();
    const take = (o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.visible) return;
      const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 150));
      for (let i = 0; i < pos.count; i += step) { const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); pts.push(v); box.expandByPoint(v); }
    };
    m.root.traverse(take); for (const e of m.extraMeshes) e.traverse(take);
    this.zoom = 1;
    this.fit(pts, box.getCenter(new THREE.Vector3()), w / h, 0.94);
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    renderer.render(this.scene, this.camera);
    return renderer.domElement.toDataURL('image/webp', 0.9);
  }

  close() {
    this.active = false;
    if (this.machine) { this.machine.destroy(); this.machine = null; }
  }
}
