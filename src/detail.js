// Detail kit for the machines: weathered materials, geometry batching and reusable small parts
// (rounded panels, bolts, hoses, lights, mirrors, rails, ladders, grilles, warning stickers).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ weathered materials
// Dust / mud toward the ground, chipped paint, grime streaks. All materials of one machine share uBase so
// the dirt line follows the machine when it drives onto a slab or floats on the lake.
const NOISE = `
  float wh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(wh(i), wh(i + vec2(1.0, 0.0)), f.x), mix(wh(i + vec2(0.0, 1.0)), wh(i + vec2(1.0, 1.0)), f.x), f.y); }`;

export function weathered(color, { rough = 0.45, metal = 0.12, clearcoat = 0.4, dirt = 1, wear = 1, base = null, side = THREE.FrontSide } = {}) {
  const m = clearcoat > 0
    ? new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: metal, clearcoat, clearcoatRoughness: 0.32, side })
    : new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, side });
  const u = { uBase: base || { value: 0 }, uDirt: { value: dirt }, uWear: { value: wear }, uDirtCol: { value: new THREE.Color(0x6f604c) } };
  m.userData.weather = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n#ifdef USE_INSTANCING\nvWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#else\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWP; uniform float uBase, uDirt, uWear; uniform vec3 uDirtCol;${NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float wH = vWP.y - uBase;
        float wN = wn(vWP.xz * 2.3 + vWP.y * 1.7) * 0.6 + wn(vWP.xz * 7.0 - vWP.y * 3.0) * 0.4;
        float wD = clamp((1.05 - wH) / 1.05, 0.0, 1.0); wD *= wD;
        float wS = smoothstep(0.62, 0.9, wn(vWP.xz * 11.0 + vWP.y * 9.0)) * clamp((1.6 - wH) / 1.6, 0.0, 1.0);
        float wDirt = clamp(wD * (0.45 + 0.7 * wN) + wS * 0.45, 0.0, 0.92) * uDirt;
        diffuseColor.rgb = mix(diffuseColor.rgb, uDirtCol * (0.8 + 0.4 * wN), wDirt);
        float wChip = step(0.972, wn(vWP.xy * 41.0 + vWP.z * 29.0)) * uWear;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.11, 0.1, 0.09), wChip * 0.85);
        float wSt = smoothstep(0.62, 1.0, wn(vec2((vWP.x + vWP.z) * 9.0, vWP.y * 0.7)));
        diffuseColor.rgb *= 1.0 - 0.14 * wSt * uWear;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.96, wDirt);');
  };
  m.customProgramCacheKey = () => 'weathered' + (clearcoat > 0 ? 'p' : 's');
  return m;
}

// per-machine material set
export function machineMaterials(M, paintHex, accentHex) {
  const base = { value: 0 };
  return {
    base,
    paint: weathered(paintHex, { base }),
    paint2: weathered(new THREE.Color(paintHex).multiplyScalar(0.82), { base, rough: 0.5 }),
    accent: weathered(accentHex ?? 0x18191b, { base, rough: 0.5, metal: 0.3, clearcoat: 0.2 }),
    black: weathered(0x17181a, { base, rough: 0.5, metal: 0.3, clearcoat: 0.15 }),
    steel: weathered(0x8e9398, { base, rough: 0.36, metal: 0.85, clearcoat: 0, wear: 0.4 }),
    dark: weathered(0x2b2d30, { base, rough: 0.55, metal: 0.6, clearcoat: 0, wear: 0.6 }),
    under: weathered(0x1d1e20, { base, rough: 0.7, metal: 0.4, clearcoat: 0, dirt: 1.4 }),
    rubber: weathered(0x141415, { base, rough: 0.92, metal: 0, clearcoat: 0, dirt: 1.2, wear: 0 }),
    galv: weathered(0xb0b6bb, { base, rough: 0.42, metal: 0.8, clearcoat: 0, wear: 0.3 }),
    grey: weathered(0x9a9ea2, { base, rough: 0.55, metal: 0.25, clearcoat: 0.1 }),
    hazard: M.hazard, chrome: M.chrome, glass: M.cabGlass, lens: M.lightLens, red: M.redLens, amber: M.amberLens,
    tread: M.tread, seat: M.seat, plastic: M.blackPlastic,
  };
}

// ------------------------------------------------------------------ batching
function norm(g) {
  g = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups();
  return g;
}
// merge every static mesh directly under `group` by material (keeps transparent / flagged ones)
export function bake(group) {
  const buckets = new Map();
  for (const c of [...group.children]) {
    if (!c.isMesh || c.isInstancedMesh || c.isSkinnedMesh || c.userData.keep || c.children.length) continue;
    if (Array.isArray(c.material) || c.material.transparent || c.material.vertexColors) continue;
    c.updateMatrix();
    const g = norm(c.geometry).applyMatrix4(c.matrix);
    const key = c.material.uuid + (c.castShadow ? 's' : 'n');
    if (!buckets.has(key)) buckets.set(key, { mat: c.material, cast: c.castShadow, list: [] });
    buckets.get(key).list.push(g);
    group.remove(c);
  }
  for (const b of buckets.values()) {
    const mesh = new THREE.Mesh(b.list.length === 1 ? b.list[0] : mergeGeometries(b.list, false), b.mat);
    mesh.castShadow = b.cast; mesh.receiveShadow = true;
    group.add(mesh);
  }
}

// ------------------------------------------------------------------ geometry helpers
export function rbox(w, h, d, r, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  return g.translate(x, y, z);
}
export function bx(w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  return g.translate(x, y, z);
}
export function cy(rt, rb, h, seg, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  return g.translate(x, y, z);
}
// cylinder along X (axles, pins)
export const pinX = (r, len, x, y, z, seg = 14) => cy(r, r, len, seg, x, y, z, 0, 0, Math.PI / 2);
export function tubeAB(a, b, r, seg = 10) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg); g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
  return g.translate(a.x, a.y, a.z);
}
export function hose(pts, r = 0.022, segs = 40) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : V(...p)))), segs, r, 6);
}
// hex bolt heads facing +normal at each point
export function bolts(points, normal = V(0, 0, 1), r = 0.016, h = 0.012) {
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), normal.clone().normalize());
  const list = points.map((p) => { const g = new THREE.CylinderGeometry(r, r, h, 6); g.translate(0, h / 2, 0); g.applyQuaternion(q); return g.translate(p.x, p.y, p.z); });
  return mergeGeometries(list.map(norm), false);
}
export function boltRow(a, b, n, normal, r, h) { const pts = []; for (let i = 0; i < n; i++) pts.push(a.clone().lerp(b, n === 1 ? 0.5 : i / (n - 1))); return bolts(pts, normal, r, h); }
export function boltCircle(c, R, n, normal, r = 0.016) {
  const nn = normal.clone().normalize(), t1 = new THREE.Vector3().crossVectors(nn, Math.abs(nn.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0)).normalize(), t2 = new THREE.Vector3().crossVectors(nn, t1);
  const pts = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push(c.clone().addScaledVector(t1, Math.cos(a) * R).addScaledVector(t2, Math.sin(a) * R)); }
  return bolts(pts, nn, r);
}
export function mergeG(list) { return mergeGeometries(list.map(norm), false); }

// path of handrail tubes through points with stanchions to y0
export function rail(points, r = 0.02, postsTo = null) {
  const parts = [];
  for (let i = 0; i < points.length - 1; i++) parts.push(tubeAB(V(...points[i]), V(...points[i + 1]), r, 8));
  if (postsTo !== null) for (const p of points) parts.push(tubeAB(V(p[0], postsTo, p[2]), V(...p), r * 0.9, 8));
  return mergeG(parts);
}
export function ladder(x, y0, y1, z, w = 0.38, step = 0.28, slant = 0) {
  const parts = [tubeAB(V(x - w / 2, y0, z), V(x - w / 2, y1, z + slant), 0.018, 8), tubeAB(V(x + w / 2, y0, z), V(x + w / 2, y1, z + slant), 0.018, 8)];
  for (let y = y0 + step * 0.6; y < y1; y += step) { const t = (y - y0) / (y1 - y0); parts.push(bx(w, 0.025, 0.06, x, y, z + slant * t)); }
  return mergeG(parts);
}

// ------------------------------------------------------------------ small assemblies (added to a parent group)
function add(parent, geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; }

export function workLight(parent, mats, x, y, z, ry = 0, rx = 0.15, size = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx, ry, 0); parent.add(g);
  add(g, rbox(0.2 * size, 0.14 * size, 0.1 * size, 0.02, 0, 0, 0), mats.black);
  add(g, bx(0.17 * size, 0.11 * size, 0.01, 0, 0, 0.051 * size), mats.lens, false).userData.keep = true;
  add(g, mergeG([bx(0.03, 0.12 * size, 0.03, 0, -0.12 * size, -0.02), bx(0.06, 0.02, 0.06, 0, -0.18 * size, -0.02)]), mats.dark);
  return g;
}
export function mirror(parent, mats, from, to, ry = 0) {
  add(parent, tubeAB(from, to, 0.012, 6), mats.black);
  const h = new THREE.Group(); h.position.copy(to); h.rotation.y = ry; parent.add(h);
  add(h, rbox(0.06, 0.24, 0.16, 0.02, 0, 0, 0), mats.black);
  const glass = add(h, bx(0.005, 0.2, 0.13, 0.032, 0, 0), new THREE.MeshStandardMaterial({ color: 0xcfd8e0, metalness: 1, roughness: 0.05 }), false);
  glass.userData.keep = true;
}
export function grille(parent, w, h, x, y, z, ry = 0, holes = 14) {
  const tex = T.perforatedTexture().clone(); tex.repeat.set(holes * w, holes * h); tex.needsUpdate = true;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, color: 0x2a2a2a, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.y = ry; parent.add(m);
  // dark cavity behind the grille
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x050505 }));
  back.position.copy(m.position); back.rotation.y = ry; back.translateZ(-0.02); parent.add(back); back.userData.keep = true;
  return m;
}

// ------------------------------------------------------------------ stickers / decals
const stickerCache = {};
export function sticker(kind) {
  if (stickerCache[kind]) return stickerCache[kind];
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  if (kind === 'warn') {
    x.fillStyle = '#ffd200'; x.beginPath(); x.moveTo(64, 8); x.lineTo(122, 116); x.lineTo(6, 116); x.closePath(); x.fill();
    x.lineWidth = 8; x.strokeStyle = '#111'; x.stroke(); x.fillStyle = '#111'; x.font = '900 70px Arial'; x.textAlign = 'center'; x.fillText('!', 64, 106);
  } else if (kind === 'crush') {
    x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#ffd200'; x.fillRect(6, 6, 116, 70); x.strokeStyle = '#111'; x.lineWidth = 5; x.strokeRect(6, 6, 116, 70);
    x.fillStyle = '#111'; x.beginPath(); x.arc(40, 40, 14, 0, 7); x.fill(); x.fillRect(60, 30, 50, 20);
    x.font = 'bold 22px Arial'; x.textAlign = 'center'; x.fillText('KEEP', 64, 100); x.fillText('CLEAR', 64, 122);
  } else if (kind === 'grease') {
    x.fillStyle = '#e8b300'; x.beginPath(); x.arc(64, 64, 58, 0, 7); x.fill(); x.fillStyle = '#111'; x.font = '900 40px Arial'; x.textAlign = 'center'; x.fillText('G', 64, 78);
  } else if (kind === 'lift') {
    x.fillStyle = '#111'; x.fillRect(0, 0, 128, 128); x.strokeStyle = '#ffd200'; x.lineWidth = 10; x.beginPath(); x.moveTo(64, 20); x.lineTo(64, 80); x.arc(64, 90, 18, -Math.PI / 2, Math.PI); x.stroke();
  } else if (kind === 'ce') {
    x.fillStyle = '#ddd'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#222'; x.font = 'bold 18px monospace';
    ['SERIAL', 'WY-24-' + Math.floor(Math.random() * 90000 + 10000), 'MAX 30 t', 'CE  2026'].forEach((t, i) => x.fillText(t, 8, 26 + i * 28));
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (stickerCache[kind] = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }));
}
export function stick(parent, kind, w, x, y, z, ry = 0, rx = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w), sticker(kind));
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0); parent.add(m); return m;
}
export function label(text, w, h, color = '#15171a', bg = null) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    map: T.labelTexture(text, { w: 1024, h: Math.round(1024 * h / w), color, bg, font: `900 ${Math.round(1024 * h / w * 0.7)}px Arial` }),
    transparent: !bg, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
  return m;
}
export function stripeDecal(w, h, colA = '#15171a', colB = null, angle = 0) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64; const x = c.getContext('2d');
  x.clearRect(0, 0, 512, 64);
  x.fillStyle = colA; x.beginPath(); x.moveTo(0, 18); x.lineTo(512, 6); x.lineTo(512, 30); x.lineTo(0, 46); x.closePath(); x.fill();
  if (colB) { x.fillStyle = colB; x.beginPath(); x.moveTo(0, 50); x.lineTo(512, 36); x.lineTo(512, 44); x.lineTo(0, 58); x.closePath(); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2 }));
}

export { V, add };
