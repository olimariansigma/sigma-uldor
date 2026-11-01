// Build-time only: renders the 3D "WRECKING YARD" logo (extruded, bevelled letters on a hazard-striped steel
// plate, with a few flying cinder blocks) to a transparent PNG. Used by scripts/thumbs.cjs.
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

function stripes(w, h, n) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#141518'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#f2b705';
  const step = w / n;
  for (let i = -2; i < n + 2; i++) { x.beginPath(); x.moveTo(i * step, h); x.lineTo(i * step + step / 2, h); x.lineTo(i * step + step / 2 + h, 0); x.lineTo(i * step + h, 0); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function centred(geo) { geo.computeBoundingBox(); const b = geo.boundingBox; geo.translate(-(b.max.x + b.min.x) / 2, 0, 0); return b.max.x - b.min.x; }

export function renderLogo(fontJson, w, h) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture; scene.environmentIntensity = 0.55;
  const font = new FontLoader().parse(fontJson);
  const bevel = { bevelEnabled: true, curveSegments: 6, bevelSegments: 4 };

  const yellow = new THREE.MeshPhysicalMaterial({ color: 0xffa800, roughness: 0.36, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.25 });
  const yellowSide = new THREE.MeshStandardMaterial({ color: 0x8f4f00, roughness: 0.55, metalness: 0.2 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f0, roughness: 0.3, metalness: 0.05, clearcoat: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.45, metalness: 0.6 });

  const g = new THREE.Group(); scene.add(g);
  // WRECKING
  const t1 = new TextGeometry('WRECKING', { font, size: 1.35, depth: 0.42, bevelThickness: 0.06, bevelSize: 0.045, ...bevel });
  const w1 = centred(t1);
  const m1 = new THREE.Mesh(t1, [yellow, yellowSide]); m1.position.y = 0.55; m1.castShadow = true; g.add(m1);
  // YARD (wide spaced)
  const letters = 'YARD'.split(''); const ys = new THREE.Group(); g.add(ys);
  const lg = letters.map((ch) => { const tg = new TextGeometry(ch, { font, size: 0.9, depth: 0.32, bevelThickness: 0.05, bevelSize: 0.035, ...bevel }); return { tg, w: centred(tg) }; });
  const gap = 0.55, totalW = lg.reduce((a, b) => a + b.w, 0) + gap * (lg.length - 1);
  let x = -totalW / 2;
  for (const { tg, w: lw } of lg) { const mm = new THREE.Mesh(tg, [white, dark]); mm.position.set(x + lw / 2, -0.75, 0.05); mm.castShadow = true; ys.add(mm); x += lw + gap; }
  // steel plate behind with hazard stripes along the top
  const plateW = w1 + 1.1;
  const plate = new THREE.Mesh(new RoundedBoxGeometry(plateW, 3.25, 0.22, 3, 0.08), dark); plate.position.set(0, 0.25, -0.3); plate.receiveShadow = true; plate.castShadow = true; g.add(plate);
  const band = new THREE.Mesh(new THREE.BoxGeometry(plateW + 0.02, 0.32, 0.24), [dark, dark, dark, dark, new THREE.MeshStandardMaterial({ map: stripes(1024, 48, 22), roughness: 0.5, metalness: 0.2 }), dark]);
  band.position.set(0, 2.02, -0.29); g.add(band);
  const band2 = band.clone(); band2.position.y = -1.52; g.add(band2);
  // rivets
  const rivet = new THREE.SphereGeometry(0.05, 10, 6);
  for (const yy of [1.66, -1.16]) for (let i = 0; i < 12; i++) { const r = new THREE.Mesh(rivet, new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.9, roughness: 0.3 })); r.position.set(-plateW / 2 + 0.25 + i * (plateW - 0.5) / 11, yy, -0.18); g.add(r); }
  // flying cinder blocks + chips
  const cmu = new RoundedBoxGeometry(0.8, 0.4, 0.4, 2, 0.03);
  const cols = [0xd9472b, 0x2f7fd0, 0x38b24a, 0xf2b705, 0xb9b4aa];
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1;
    const b = new THREE.Mesh(i < 5 ? cmu : new THREE.DodecahedronGeometry(0.12 + rnd() * 0.1, 0), new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.85 }));
    b.position.set(side * (plateW / 2 + 0.1 + rnd() * 0.6), -1.3 + rnd() * 3.4, 0.2 + rnd() * 0.6);
    b.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); b.castShadow = true; g.add(b);
  }
  g.rotation.set(-0.05, 0.12, 0.035);

  const key = new THREE.DirectionalLight(0xfff0d8, 3.0); key.position.set(-4, 7, 9); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); const sc = key.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 6; sc.bottom = -6; sc.near = 1; sc.far = 30; key.shadow.bias = -0.0005;
  const rim = new THREE.DirectionalLight(0x9fc4ff, 2.2); rim.position.set(6, 3, -6);
  scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.25));
  const cam = new THREE.PerspectiveCamera(24, w / h, 0.1, 100);
  const box = new THREE.Box3().setFromObject(g); const sph = box.getBoundingSphere(new THREE.Sphere());
  const fitH = sph.radius / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), fitW = (box.max.x - box.min.x) / 2 / (Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * (w / h));
  cam.position.set(0, 0.3, Math.max(fitW, (box.max.y - box.min.y) / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) * 1.12 + 0.6);
  cam.lookAt(0, 0.25, 0);
  void fitH;
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  renderer.dispose();
  return url;
}
