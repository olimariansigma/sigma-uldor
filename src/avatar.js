// Blocky avatar: bacon hair, smiley face, black open jacket over a graphic tee, dark pants, white shoes.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures.js';
import { box, cyl, merge, paint } from './pieces.js';

export const SHIRTS = ['#2f6db5', '#c8322a', '#2f9a46', '#7a3fc0', '#e07b12', '#14a3a0', '#d9468f', '#d9b20f'];
const SKIN = 0xd6d6d6;

const shared = {};
function mats() {
  if (shared.skin) return shared;
  shared.skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 });
  shared.jacket = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.75 });
  shared.pants = new THREE.MeshStandardMaterial({ map: T.pantsTexture(), roughness: 0.95 });
  shared.shoe = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 });
  shared.hair = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  shared.face = new THREE.MeshBasicMaterial({ map: T.faceTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  shared.hairGeo = baconHair();
  shared.head = new RoundedBoxGeometry(0.5, 0.5, 0.5, 4, 0.13);
  return shared;
}

function baconHair() {
  const parts = [];
  const cA = 0x8c4a1a, cB = 0xb8692a, cC = 0xd99045;
  const lock = (r, len, x, y, z, rx, ry, rz, col, sx = 1, sz = 1) => {
    const g = new THREE.CapsuleGeometry(r, len, 4, 10);
    g.scale(sx, 1, sz);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    g.translate(x, y, z);
    paint(g, col);
    parts.push(g);
  };
  // crown
  const cap = new THREE.SphereGeometry(0.29, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
  cap.scale(1.0, 0.75, 1.06); cap.translate(0, 0.15, -0.01); paint(cap, cA); parts.push(cap);
  // wavy layered locks around the sides and back
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI * 0.62 + (i / 10) * Math.PI * 1.24; // back and sides only: a = 0 is the back of the head
    const x = Math.sin(a) * 0.265, z = -Math.cos(a) * 0.265;
    lock(0.068, 0.18 + (i % 3) * 0.03, x, 0.07 - (i % 2) * 0.03, z, -Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3, i % 2 ? cB : cA, 1, 0.8);
  }
  // swoopy fringe sweeping across the forehead, partly over one eye
  lock(0.075, 0.3, 0.02, 0.2, 0.225, 0.1, 0, 1.3, cB, 1, 0.6);
  lock(0.065, 0.24, -0.12, 0.16, 0.235, 0.15, 0, 1.05, cC, 1, 0.6);
  lock(0.055, 0.16, 0.16, 0.12, 0.235, 0.2, 0, 0.55, cA, 1, 0.6);
  lock(0.06, 0.22, -0.2, 0.22, 0.16, -0.3, 0, 1.4, cA, 1, 0.8);
  // tufts on top
  lock(0.07, 0.18, 0.08, 0.3, 0.02, 0.4, 0, -0.9, cC);
  lock(0.065, 0.16, -0.1, 0.29, -0.06, -0.3, 0, 0.9, cB);
  return merge(parts);
}

export class Avatar {
  constructor(scene, { shirt = SHIRTS[0], name = null } = {}) {
    const m = mats();
    this.scene = scene;
    const g = this.group = new THREE.Group(); scene.add(g);
    const sh = new THREE.MeshStandardMaterial({ map: T.shirtTexture(shirt), roughness: 0.8 });
    const front = sh.map.clone(); front.repeat.set(0.5, 1); front.offset.set(0, 0); front.needsUpdate = true;
    const backT = sh.map.clone(); backT.repeat.set(0.5, 1); backT.offset.set(0.5, 0); backT.needsUpdate = true;
    const fMat = new THREE.MeshStandardMaterial({ map: front, roughness: 0.8 });
    const bMat = new THREE.MeshStandardMaterial({ map: backT, roughness: 0.8 });
    const C = (o) => { o.castShadow = true; o.receiveShadow = true; return o; };
    // legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.155, 0.62, 0); g.add(hip);
      hip.add(C(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3).translate(0, -0.25, 0), m.pants)));
      hip.add(C(new THREE.Mesh(merge([box(0.31, 0.12, 0.33, 0, -0.56, 0.015), box(0.31, 0.03, 0.34, 0, -0.605, 0.02)]), m.shoe)));
      this.legs.push(hip);
    }
    // torso: front shows the tee with the open jacket, the rest is jacket
    this.torso = new THREE.Group(); this.torso.position.y = 0.62; g.add(this.torso);
    this.torso.add(C(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.31).translate(0, 0.31, 0), [bMat, bMat, m.jacket, m.jacket, fMat, bMat])));
    // jacket collar + open lapels in 3D
    this.torso.add(C(new THREE.Mesh(merge([box(0.18, 0.08, 0.04, -0.17, 0.6, 0.15, null, 0, 0, 0.25), box(0.18, 0.08, 0.04, 0.17, 0.6, 0.15, null, 0, 0, -0.25), box(0.62, 0.06, 0.05, 0, 0.61, -0.14)]), m.jacket)));
    // arms: black short sleeve over grey skin
    this.arms = [];
    for (const s of [-1, 1]) {
      const shp = new THREE.Group(); shp.position.set(s * 0.465, 0.5, 0); this.torso.add(shp);
      shp.add(C(new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.27, 0.31).translate(0, -0.005, 0), m.jacket)));
      shp.add(C(new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.38, 0.29).translate(0, -0.32, 0), m.skin)));
      // C-shaped hand hint
      shp.add(C(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.12).translate(0, -0.53, 0.06), m.skin)));
      const hand = new THREE.Object3D(); hand.position.set(0, -0.5, 0.05); shp.add(hand);
      this.arms.push({ sh: shp, hand });
    }
    // head + face + hair
    this.head = new THREE.Group(); this.head.position.y = 0.62 + 0.27; this.torso.add(this.head);
    this.head.position.y = 0.62 + 0.25;
    this.head.add(C(new THREE.Mesh(m.head, m.skin)));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), m.face); face.position.set(0, -0.02, 0.252); this.head.add(face);
    this.head.add(C(new THREE.Mesh(m.hairGeo, m.hair)));
    // tools
    this.hammer = new THREE.Group(); this.arms[1].hand.add(this.hammer);
    this.bucket = new THREE.Group(); this.arms[0].hand.add(this.bucket); this.bucket.visible = false;
    const pail = new THREE.CylinderGeometry(0.17, 0.13, 0.3, 20, 1, true);
    this.bucket.add(C(new THREE.Mesh(pail, new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }))));
    this.bucket.add(new THREE.Mesh(new THREE.CircleGeometry(0.13, 20).rotateX(-Math.PI / 2).translate(0, -0.15, 0), new THREE.MeshStandardMaterial({ color: 0x777777 })));
    const handle = new THREE.TorusGeometry(0.17, 0.01, 6, 20, Math.PI); this.bucket.add(new THREE.Mesh(handle, new THREE.MeshStandardMaterial({ color: 0x333333 })));
    this.bucketFill = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4 }));
    this.bucket.add(this.bucketFill);
    this.bucket.position.set(0, -0.25, 0);
    this.bucketPivot = this.bucket;
    // cement trowel (shown instead of the hammer when it is selected): wooden handle, steel ferrule, pointed blade with cement
    this.trowel = new THREE.Group(); this.arms[1].hand.add(this.trowel); this.trowel.visible = false;
    const tH = new THREE.Mesh(cyl(0.024, 0.02, 0.2, 10, 0, 0, 0, null, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 0.6 }));
    tH.position.z = 0.04;
    const tF = new THREE.Mesh(cyl(0.012, 0.012, 0.12, 8, 0, 0, 0, null, -0.6), new THREE.MeshStandardMaterial({ color: 0x8e9499, metalness: 0.8, roughness: 0.3 }));
    tF.position.set(0, -0.03, 0.17);
    const bs = new THREE.Shape(); bs.moveTo(-0.07, 0); bs.lineTo(0.07, 0); bs.lineTo(0, 0.22); bs.closePath();
    const tB = new THREE.Mesh(new THREE.ExtrudeGeometry(bs, { depth: 0.006, bevelEnabled: false }).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb8bec4, metalness: 0.85, roughness: 0.25 }));
    tB.position.set(0, -0.07, 0.18); tB.castShadow = true;
    this.trowelLoad = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9a9a95, roughness: 0.9 }));
    this.trowelLoad.scale.set(1, 0.5, 1.4); this.trowelLoad.position.set(0, -0.064, 0.25);
    this.trowel.add(tH, tF, tB, this.trowelLoad);
    this.tool = 'hammer';
    this.setHammer(1);
    if (name) this.setName(name);
    this.phase = 0;
  }

  setHammer(level) {
    while (this.hammer.children.length) this.hammer.remove(this.hammer.children[0]);
    const M = mats();
    const len = [0.62, 0.8, 0.9, 0.95][level] || 0.8;
    const head = [[0.16, 0.07, 0.07], [0.22, 0.09, 0.09], [0.28, 0.12, 0.12], [0.32, 0.14, 0.14]][level] || [0.22, 0.09, 0.09];
    const handle = new THREE.Mesh(cyl(0.022, 0.026, len, 10, 0, 0, 0, null, Math.PI / 2), new THREE.MeshStandardMaterial({ color: level >= 2 ? 0x1b1b1b : 0x9a6a3a, roughness: 0.7 }));
    handle.position.z = len / 2 - 0.12; handle.castShadow = true;
    const hm = new THREE.Mesh(new THREE.BoxGeometry(head[1], head[0], head[2]), new THREE.MeshStandardMaterial({ color: level === 3 ? 0xf2b200 : 0x2c2e31, metalness: 0.6, roughness: 0.45 }));
    hm.position.set(0, 0, len - 0.12); hm.castShadow = true;
    this.hammer.add(handle, hm);
  }

  setTool(t, color = null) {
    this.tool = t;
    if (color) this.trowelLoad.material.color.copy(color);
  }

  setName(name, color = '#ffffff') {
    if (this.tag) { this.group.remove(this.tag); this.tag.material.map.dispose(); }
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x = c.getContext('2d');
    x.font = 'bold 64px Arial'; const w = Math.min(500, x.measureText(name).width + 50);
    x.fillStyle = 'rgba(0,0,0,0.55)'; x.beginPath(); x.roundRect((512 - w) / 2, 18, w, 92, 30); x.fill();
    x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, 256, 66);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
    this.tag.scale.set(1.6, 0.4, 1); this.tag.position.y = 2.25;
    this.group.add(this.tag);
  }

  setBucket(kind, kg, color) {
    this.bucket.visible = !!kind && kg > 0.01;
    if (!this.bucket.visible) return;
    this.bucketFill.position.y = -0.13 + Math.min(1, kg / 25) * 0.25;
    this.bucketFill.material.color.copy(kind === 'water' ? new THREE.Color(0x3d7080) : color);
    this.bucketFill.material.roughness = kind === 'dust' ? 0.95 : 0.25;
  }

  // state: {speed, grounded, swingT, carrying, bucket}
  animate(dt, st) {
    const amp = st.grounded ? Math.min(1, st.speed / 5) : 0;
    if (st.grounded && st.speed > 0.3) this.phase += dt * (3 + st.speed * 1.4);
    const s = Math.sin(this.phase);
    const [L, R] = this.legs, [AL, AR] = this.arms;
    L.rotation.x = s * 0.8 * amp; R.rotation.x = -s * 0.8 * amp;
    if (!st.grounded) { L.rotation.x = -0.4; R.rotation.x = 0.3; }
    this.torso.position.y = 0.62 + Math.abs(Math.cos(this.phase)) * 0.03 * amp;
    this.torso.rotation.x = 0;
    this.hammer.visible = !st.carrying && this.tool !== 'trowel';
    this.trowel.visible = !st.carrying && this.tool === 'trowel';
    this.trowel.rotation.x = st.swingT >= 0 ? -0.6 : -0.2;
    if (st.carrying) {
      AL.sh.rotation.set(-1.45, 0, 0.1); AR.sh.rotation.set(-1.45, 0, -0.1);
    } else if (st.swingT >= 0) {
      const t = st.swingT;
      let a;
      if (t < 0.45) a = THREE.MathUtils.lerp(-0.3, -3.0, 1 - (1 - t / 0.45) ** 2);
      else if (t < 0.6) a = THREE.MathUtils.lerp(-3.0, -0.9, (t - 0.45) / 0.15);
      else a = THREE.MathUtils.lerp(-0.9, -0.3, (t - 0.6) / 0.4);
      AR.sh.rotation.set(a, 0, 0); AL.sh.rotation.set(a * 0.9, 0, 0.25);
      this.torso.rotation.x = t < 0.45 ? -0.05 : 0.15;
      this.hammer.rotation.x = -1.2;
    } else {
      AL.sh.rotation.set(-s * 0.8 * amp + (st.bucket ? -0.25 : 0), 0, st.bucket ? 0.15 : 0);
      AR.sh.rotation.set(s * 0.8 * amp - 0.15, 0, 0);
      this.hammer.rotation.x = -0.3;
      if (!st.grounded) { AL.sh.rotation.x = -2.6; AR.sh.rotation.x = -2.6; }
    }
    this.bucket.rotation.x = -AL.sh.rotation.x;
  }

  dispose() { this.scene.remove(this.group); }
}
