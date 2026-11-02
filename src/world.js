// Static environment: sky, lighting, terrain, street, neighbourhood, construction site dressing.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import * as T from './textures.js';
import { box, cyl, merge, mulberry } from './pieces.js';
import { boxMapped } from './materials.js';
import { SITE, terrainHeight, lakeDist } from './site.js';

export { SITE };

export function buildWorld(scene, renderer, physics, M) {
  const statics = []; // {pos, size, rotY}
  const addStatic = (x, y, z, sx, sy, sz, rotY = 0) => statics.push({ pos: new THREE.Vector3(x, y, z), size: new THREE.Vector3(sx, sy, sz), rotY });

  // ---------- sky + lights ----------
  const sky = new Sky();
  sky.scale.setScalar(4500);
  const su = sky.material.uniforms;
  su.turbidity.value = 4.5; su.rayleigh.value = 1.4; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.82;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(48), THREE.MathUtils.degToRad(135));
  su.sunPosition.value.copy(sunDir);
  // the stock sky shader turns grey when the sun sets: blend towards a dark night gradient instead
  su.uDay = { value: 1 };
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace('void main() {', 'uniform float uDay;\nvoid main() {')
    .replace('gl_FragColor = vec4( retColor, 1.0 );', `float hz = pow( 1.0 - max( direction.y, 0.0 ), 4.0 );
      vec3 nightSky = mix( vec3( 0.0025, 0.005, 0.014 ), vec3( 0.018, 0.026, 0.045 ), hz );
      gl_FragColor = vec4( mix( nightSky, retColor, uDay ), 1.0 );`);
  scene.add(sky);

  // environment map from the sky
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky2 = new Sky(); sky2.scale.setScalar(1000);
  Object.assign(sky2.material.uniforms, THREE.UniformsUtils.clone(sky.material.uniforms));
  sky2.material.uniforms.sunPosition.value.copy(sunDir);
  envScene.add(sky2);
  const groundEnv = new THREE.Mesh(new THREE.CircleGeometry(900, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4a5040 }));
  groundEnv.position.y = -2; envScene.add(groundEnv);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.75;

  // clouds
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(2000, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
    new THREE.MeshBasicMaterial({ map: T.skyCloudTexture(), transparent: true, depthWrite: false, side: THREE.BackSide, fog: false, opacity: 0.85 }));
  clouds.material.map.repeat.set(3, 1);
  clouds.position.y = -300;
  scene.add(clouds);

  scene.fog = new THREE.Fog(0xc6d3df, 110, 700);

  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5b5040, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
  sun.position.copy(sunDir).multiplyScalar(80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 220;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
  scene.add(sun); scene.add(sun.target);

  // ---------- terrain (heightfield with a lake bowl) ----------
  const grass = T.grassTextures();
  const dirt = T.dirtTextures();
  const TS = SITE.terrainSize, N = SITE.terrainSeg || TS, STEP = TS / N;
  const tGeo = new THREE.PlaneGeometry(TS, TS, N, N).rotateX(-Math.PI / 2);
  const tp = tGeo.attributes.position;
  const mask = new Float32Array(tp.count * 2);
  const rn = mulberry(77);
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i);
    tp.setY(i, terrainHeight(x, z));
    const lx = Math.max(SITE.lotMin.x - x, x - SITE.lotMax.x, 0), lz = Math.max(SITE.lotMin.y - z, z - SITE.lotMax.y, 0);
    const out = Math.hypot(lx, lz);
    mask[i * 2] = THREE.MathUtils.clamp(1 - out / 3 + (rn() - 0.5) * 0.3, 0, 1);
    const ld = lakeDist(x, z);
    mask[i * 2 + 1] = THREE.MathUtils.clamp((1.35 - ld) / 0.3, 0, 1);
  }
  tGeo.setAttribute('aMask', new THREE.BufferAttribute(mask, 2));
  tGeo.computeVertexNormals();
  const terrainMat = new THREE.MeshStandardMaterial({ map: grass.map, normalMap: dirt.normalMap, roughness: 0.96 });
  terrainMat.map.repeat.set(TS / 4, TS / 4); terrainMat.normalMap.repeat.set(TS / 4, TS / 4);
  terrainMat.onBeforeCompile = (sh) => {
    sh.uniforms.dirtMap = { value: dirt.map };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aMask;\nvarying vec2 vMask;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMask = aMask;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D dirtMap;\nvarying vec2 vMask;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 dc = texture2D(dirtMap, vMapUv * 0.44).rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, dc, smoothstep(0.0, 1.0, vMask.x));
        diffuseColor.rgb = mix(diffuseColor.rgb, dc * vec3(0.5, 0.46, 0.4), vMask.y);`);
  };
  terrainMat.customProgramCacheKey = () => 'terrain';
  const terrain = new THREE.Mesh(tGeo, terrainMat);
  terrain.receiveShadow = true;
  scene.add(terrain);
  // outer grass ring beyond the heightfield
  const outerMat = new THREE.MeshStandardMaterial({ map: grass.map.clone(), roughness: 0.96 });
  outerMat.map.repeat.set(60, 60); outerMat.map.needsUpdate = true;
  for (const [x, z, w, d] of [[0, (TS / 2 + 400) / 2 + 0.0, 800, 400 - TS / 2], [0, -(TS / 2 + 400) / 2, 800, 400 - TS / 2], [(TS / 2 + 400) / 2, 0, 400 - TS / 2, TS], [-(TS / 2 + 400) / 2, 0, 400 - TS / 2, TS]]) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), outerMat); g.position.set(x, 0, z); g.receiveShadow = true; scene.add(g);
  }
  // lake water
  const L = SITE.lake;
  const wn = T.waterNormal();
  wn.repeat.set(3, 4);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({
    color: 0x2a5a66, roughness: 0.06, metalness: 0.0, normalMap: wn, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.86, envMapIntensity: 1.4, clearcoat: 1, clearcoatRoughness: 0.05 }));
  water.scale.set(L.rx * 1.2, 1, L.rz * 1.2);
  water.position.set(L.cx, L.water, L.cz);
  water.receiveShadow = true;
  scene.add(water);
  // reeds and rocks around the lake
  const reedGeo = merge(Array.from({ length: 5 }, (_, k) => cyl(0.008, 0.012, 1.1 + k * 0.12, 4, (k - 2) * 0.05, 0.55 + k * 0.06, (k % 2) * 0.04, null, (k - 2) * 0.08, 0, (k - 2) * 0.06)));
  const reedMat = new THREE.MeshStandardMaterial({ color: 0x6d7a3a, roughness: 0.9 });
  const rockGeo = new THREE.DodecahedronGeometry(0.35, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: 0.95, flatShading: true });
  const reeds = new THREE.InstancedMesh(reedGeo, reedMat, 40), rocks = new THREE.InstancedMesh(rockGeo, rockMat, 24);
  const mm = new THREE.Matrix4();
  for (let i = 0; i < 40; i++) {
    const a = rn() * Math.PI * 2, r = 1.0 + rn() * 0.12;
    const x = L.cx + Math.cos(a) * L.rx * r, z = L.cz + Math.sin(a) * L.rz * r;
    mm.compose(new THREE.Vector3(x, terrainHeight(x, z) - 0.1, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rn() * 6), new THREE.Vector3(1, 0.7 + rn() * 0.6, 1));
    reeds.setMatrixAt(i, mm);
  }
  for (let i = 0; i < 24; i++) {
    const a = rn() * Math.PI * 2, r = 1.12 + rn() * 0.15;
    const x = L.cx + Math.cos(a) * L.rx * r, z = L.cz + Math.sin(a) * L.rz * r;
    const s = 0.5 + rn() * 1.2;
    mm.compose(new THREE.Vector3(x, terrainHeight(x, z) + 0.05, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rn() * 3, rn() * 3, rn() * 3)), new THREE.Vector3(s, s * 0.6, s));
    rocks.setMatrixAt(i, mm);
  }
  shadowed(reeds); shadowed(rocks); scene.add(reeds, rocks);

  // ---------- street ----------
  const asph = T.asphaltTextures();
  const asphMat = new THREE.MeshStandardMaterial({ map: asph.map, normalMap: asph.normalMap, roughness: 0.9 });
  asphMat.map.repeat.set(100, 2.2); asphMat.normalMap.repeat.set(100, 2.2);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(500, 10).rotateX(-Math.PI / 2), asphMat);
  road.position.set(0, 0.02, SITE.streetZ + 3); road.receiveShadow = true; scene.add(road);
  const markMat = new THREE.MeshStandardMaterial({ color: 0xf0e8d0, roughness: 0.7 });
  const dashes = [];
  for (let x = -240; x < 240; x += 6) dashes.push(box(3, 0.01, 0.14, x, 0.025, SITE.streetZ + 3));
  dashes.push(box(500, 0.01, 0.12, 0, 0.025, SITE.streetZ - 1.6), box(500, 0.01, 0.12, 0, 0.025, SITE.streetZ + 7.6));
  scene.add(shadowed(new THREE.Mesh(merge(dashes), markMat), false, true));
  // sidewalks + curbs
  const conc = boxMapped(new THREE.MeshStandardMaterial({ map: T.concreteTextures([178, 176, 170], 8).map, normalMap: T.concreteTextures([178, 176, 170], 8).normalMap, roughness: 0.9 }), 1.5, 1.5);
  for (const z of [SITE.streetZ - 2.9, SITE.streetZ + 8.9]) {
    const walk = new THREE.Mesh(new THREE.BoxGeometry(500, 0.16, 2.6), conc);
    walk.position.set(0, 0.08, z); shadowed(walk, false, true); scene.add(walk);
    const joints = [];
    for (let x = -240; x < 240; x += 1.5) joints.push(box(0.02, 0.005, 2.6, x, 0.162, z));
    scene.add(new THREE.Mesh(merge(joints), new THREE.MeshStandardMaterial({ color: 0x8a8884, roughness: 1 })));
  }
  // street lights
  const poleGeo = merge([cyl(0.08, 0.12, 7, 10, 0, 3.5, 0), cyl(0.05, 0.05, 2.2, 8, 0, 6.9, 1.0, null, Math.PI / 2 - 0.15), box(0.28, 0.12, 0.6, 0, 7.0, 2.1)]);
  const lampGeo = box(0.22, 0.03, 0.5, 0, 6.93, 2.1);
  const lamps = []; // street lamp heads (for the night lights)
  for (let x = -90; x <= 90; x += 30) {
    for (const [z, r] of [[SITE.streetZ - 3.9, 0], [SITE.streetZ + 9.9, Math.PI]]) {
      if (Math.abs(x) < 20 && r === 0) continue;
      const pole = new THREE.Mesh(poleGeo, M.galvanized); pole.position.set(x + (r ? 15 : 0), 0, z); pole.rotation.y = r; shadowed(pole, true, false); scene.add(pole);
      const lamp = new THREE.Mesh(lampGeo, M.lightLens); lamp.position.copy(pole.position); lamp.rotation.y = r; scene.add(lamp);
      lamps.push(new THREE.Vector3(0, 6.9, 2.1).applyAxisAngle(new THREE.Vector3(0, 1, 0), r).add(pole.position));
    }
  }

  // ---------- neighbourhood across the street ----------
  const glowMats = []; // house windows that light up at night
  const neighbor = (x, z, w, d, brickMat, roofColor, rot = Math.PI) => {
    const g = new THREE.Group();
    const wallH = 2.9;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), brickMat); walls.position.y = wallH / 2 + 0.2; g.add(shadowed(walls, true, true));
    const found = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.25, d + 0.2), M.concretePlain); found.position.y = 0.12; g.add(shadowed(found, false, true));
    const pitch = 0.6, ov = 0.4;
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-d / 2 - ov, -ov * Math.tan(pitch)); roofShape.lineTo(0, (d / 2) * Math.tan(pitch)); roofShape.lineTo(d / 2 + ov, -ov * Math.tan(pitch));
    roofShape.lineTo(d / 2 + ov, -ov * Math.tan(pitch) + 0.18); roofShape.lineTo(0, (d / 2) * Math.tan(pitch) + 0.2); roofShape.lineTo(-d / 2 - ov, -ov * Math.tan(pitch) + 0.18);
    const rg = new THREE.ExtrudeGeometry(roofShape, { depth: w + 0.6, bevelEnabled: false });
    rg.translate(0, 0, -(w + 0.6) / 2); rg.rotateY(Math.PI / 2);
    const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.9, map: T.shingleTextures().map });
    roofMat.map = roofMat.map.clone(); roofMat.map.repeat.set(0.6, 0.6); roofMat.map.needsUpdate = true;
    const roof = new THREE.Mesh(rg, roofMat); roof.position.y = wallH + 0.2; g.add(shadowed(roof, true, true));
    const gable = new THREE.Shape(); gable.moveTo(-d / 2, 0); gable.lineTo(0, (d / 2) * Math.tan(pitch)); gable.lineTo(d / 2, 0);
    const gg = new THREE.ShapeGeometry(gable);
    for (const s of [-1, 1]) { const gm = new THREE.Mesh(gg, brickMat); gm.rotation.y = s * Math.PI / 2; gm.position.set(s * w / 2, wallH + 0.2, 0); g.add(gm); }
    const winMat = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.5, envMapIntensity: 1.5, emissive: 0xffc070, emissiveIntensity: 0 });
    glowMats.push(winMat);
    const frames = [], glass = [];
    for (let i = 0; i < Math.floor(w / 2.6); i++) {
      const wx = -w / 2 + 1.5 + i * 2.6;
      if (Math.abs(wx) < 0.8) continue;
      glass.push(box(1.1, 1.2, 0.02, wx, 1.7, d / 2 + 0.01));
      frames.push(box(1.24, 0.08, 0.08, wx, 2.34, d / 2 + 0.03), box(1.24, 0.08, 0.12, wx, 1.06, d / 2 + 0.05), box(0.08, 1.3, 0.08, wx - 0.6, 1.7, d / 2 + 0.03), box(0.08, 1.3, 0.08, wx + 0.6, 1.7, d / 2 + 0.03), box(0.05, 1.2, 0.05, wx, 1.7, d / 2 + 0.03));
    }
    frames.push(box(1.1, 2.2, 0.06, 0, 1.3, d / 2 + 0.02));
    g.add(shadowed(new THREE.Mesh(merge(glass), winMat), false, false));
    g.add(shadowed(new THREE.Mesh(merge(frames), M.pvc), true, false));
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.05, 0.06), M.doorWood); door.position.set(0, 1.25, d / 2 + 0.05); g.add(door);
    // back windows (same glazing), stone sills and lintels, a rendered plinth
    const backG = [], trim = [], backF = [];
    for (let i = 0; i < Math.floor(w / 2.6); i++) {
      const wx = -w / 2 + 1.5 + i * 2.6;
      for (const zs of [1, -1]) {
        if (zs > 0 && Math.abs(wx) < 0.8) continue;
        if (zs < 0) { backG.push(box(1.1, 1.2, 0.02, wx, 1.7, -d / 2 - 0.03)); backF.push(box(1.24, 1.32, 0.04, wx, 1.7, -d / 2 - 0.01)); }
        trim.push(box(1.4, 0.07, 0.2, wx, 1.02, zs * (d / 2 + 0.08)), box(1.36, 0.14, 0.05, wx, 2.42, zs * (d / 2 + 0.02)));
      }
    }
    trim.push(box(w + 0.06, 0.42, d + 0.06, 0, 0.42, 0));
    g.add(shadowed(new THREE.Mesh(merge(backG), winMat), false, false));
    g.add(shadowed(new THREE.Mesh(merge(backF), M.pvc), true, false));
    g.add(shadowed(new THREE.Mesh(merge(trim), M.concretePlain), true, true));
    // eaves: fascia boards, gutters and downpipes; chimney with a pot
    const eaveY = wallH + 0.2 - ov * Math.tan(pitch), eaves = [], white = [];
    for (const zs of [1, -1]) {
      white.push(box(w + 0.62, 0.18, 0.04, 0, eaveY + 0.05, zs * (d / 2 + ov + 0.02)));
      eaves.push(cyl(0.07, 0.07, w + 0.62, 10, 0, eaveY - 0.05, zs * (d / 2 + ov + 0.08), null, 0, 0, Math.PI / 2));
      for (const xs of [-1, 1]) eaves.push(cyl(0.045, 0.045, eaveY, 8, xs * (w / 2 + 0.2), eaveY / 2, zs * (d / 2 + 0.1)));
    }
    g.add(shadowed(new THREE.Mesh(merge(white), M.pvc), true, false));
    g.add(shadowed(new THREE.Mesh(merge(eaves), M.blackPaint), true, false));
    const chX = w / 2 - 1.3, ridgeY = wallH + 0.2 + (d / 2) * Math.tan(pitch);
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.7), brickMat); chim.position.set(chX, ridgeY - 0.15, -0.6); g.add(shadowed(chim));
    g.add(shadowed(new THREE.Mesh(merge([box(0.82, 0.08, 0.82, chX, ridgeY + 0.68, -0.6), cyl(0.1, 0.12, 0.35, 10, chX - 0.15, ridgeY + 0.88, -0.6), cyl(0.1, 0.12, 0.3, 10, chX + 0.15, ridgeY + 0.86, -0.6)]), M.concretePlain)));
    // porch: canopy on brackets, step, glazed door panel, handle, house number, wall lamp
    g.add(shadowed(new THREE.Mesh(merge([box(1.9, 0.09, 1.0, 0, 2.6, d / 2 + 0.5), box(0.06, 0.5, 0.06, -0.85, 2.3, d / 2 + 0.92, null, 0.6), box(0.06, 0.5, 0.06, 0.85, 2.3, d / 2 + 0.92, null, 0.6)]), M.pvc)));
    g.add(shadowed(new THREE.Mesh(merge([box(1.7, 0.16, 0.9, 0, 0.28, d / 2 + 0.45), box(1.2, 0.03, 4.2, 0, 0.21, d / 2 + 2.9)]), M.concretePlain), false, true));
    g.add(new THREE.Mesh(merge([box(0.5, 0.7, 0.02, 0, 1.65, d / 2 + 0.085)]), winMat));
    g.add(new THREE.Mesh(merge([box(0.04, 0.2, 0.05, 0.36, 1.2, d / 2 + 0.1), box(0.22, 0.14, 0.02, 0.85, 1.9, d / 2 + 0.02)]), M.chrome));
    const lampB = new THREE.Mesh(merge([box(0.14, 0.24, 0.12, -0.9, 2.05, d / 2 + 0.07)]), M.blackPaint); g.add(lampB);
    const lampL = new THREE.Mesh(box(0.09, 0.14, 0.02, -0.9, 2.03, d / 2 + 0.135), M.lightLens); g.add(lampL);
    g.position.set(x, 0, z); g.rotation.y = rot;
    scene.add(g);
    addStatic(x, 1.6, z, w, 3.2, d, rot);
  };
  const brickA = boxMapped(new THREE.MeshStandardMaterial({ map: T.brickTextures('red').map, normalMap: T.brickTextures('red').normalMap, roughness: 0.95 }), 0.66, 0.3, 0);
  const brickB = boxMapped(new THREE.MeshStandardMaterial({ map: T.brickTextures('yellow').map, normalMap: T.brickTextures('yellow').normalMap, roughness: 0.95 }), 0.66, 0.3, 0);
  for (const m of [brickA, brickB]) { m.map = m.map.clone(); m.map.repeat.set(1, 0.25); m.map.needsUpdate = true; }
  neighbor(-26, SITE.streetZ + 20, 11, 8, brickB, 0x6b4a3a);
  neighbor(-6, SITE.streetZ + 21, 12, 8.5, brickA, 0x3d4247);
  neighbor(15, SITE.streetZ + 20, 10, 8, brickB, 0x545a60);
  neighbor(36, SITE.streetZ + 21, 11.5, 8, brickA, 0x5a3a30);
  neighbor(-46, SITE.streetZ + 20, 10, 8, brickA, 0x46494d);
  // neighbour lots on our side
  neighbor(-128, -20, 10, 8.5, brickA, 0x3d4247, Math.PI / 2);
  neighbor(116, -30, 11, 8, brickB, 0x6b4a3a, -Math.PI / 2);
  neighbor(-128, -70, 11, 8, brickB, 0x545a60, Math.PI / 2);
  neighbor(116, -90, 10, 8.5, brickA, 0x5a3a30, -Math.PI / 2);

  // ---------- distant hills ----------
  const hillGeo = new THREE.RingGeometry(300, 1100, 128, 8).rotateX(-Math.PI / 2);
  const hp = hillGeo.attributes.position;
  const rr = mulberry(9);
  const bumps = Array.from({ length: 18 }, () => [rr() * Math.PI * 2, 8 + rr() * 22, 0.15 + rr() * 0.35]);
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), z = hp.getZ(i);
    const a = Math.atan2(z, x), r = Math.hypot(x, z);
    let h = 0;
    for (const [ba, bh, bw] of bumps) h += bh * Math.exp(-Math.pow(Math.atan2(Math.sin(a - ba), Math.cos(a - ba)) / bw, 2));
    h *= THREE.MathUtils.smoothstep(r, 320, 520) * (0.8 + 0.4 * Math.sin(r * 0.01));
    hp.setY(i, h - 1);
  }
  hillGeo.computeVertexNormals();
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x8aa070, roughness: 1 });
  scene.add(new THREE.Mesh(hillGeo, hillMat));

  // ---------- trees ----------
  buildTrees(scene, M);

  // ---------- construction site dressing ----------
  buildFence(scene, M, addStatic);
  buildSiteOffice(scene, M, addStatic, -33, 19.5);
  buildPortaloo(scene, M, addStatic, -25.5, 21.5);
  buildDumpster(scene, M, addStatic, 35, 19);
  buildCones(scene, M);
  buildPallets(scene, M, addStatic);
  buildSign(scene, M, addStatic);
  const buildSlab = buildPlotArea(scene, M, addStatic);
  // mobile light towers for the night shift (aimed at the demolition plots and the crusher)
  const towerLens = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, emissive: 0xfff6e4, emissiveIntensity: 0, roughness: 0.15 });
  const towers = [[-36, -58, -62, -84], [26, -60, 50, -84], [-6, -58, -6, -82], [24, -24, 14, -10]]
    .map(([x, z, tx, tz]) => buildLightTower(scene, M, addStatic, towerLens, x, z, tx, tz));

  // static physics
  const body = physics.world.createRigidBody(physics.R.RigidBodyDesc.fixed());
  // heightfield: heights[col * (rows + 1) + row], columns along x, rows along z
  const hf = new Float32Array((N + 1) * (N + 1));
  for (let col = 0; col <= N; col++) for (let row = 0; row <= N; row++) hf[col * (N + 1) + row] = terrainHeight(-TS / 2 + col * STEP, -TS / 2 + row * STEP);
  const terrainCollider = physics.world.createCollider(physics.R.ColliderDesc.heightfield(N, N, hf, new physics.R.Vector3(TS, 1, TS)).setFriction(1.0), body);
  for (const [x, z, w, d] of [[0, TS / 2 + 200, 1000, 400], [0, -TS / 2 - 200, 1000, 400], [TS / 2 + 200, 0, 400, TS], [-TS / 2 - 200, 0, 400, TS]]) {
    physics.world.createCollider(physics.R.ColliderDesc.cuboid(w / 2, 1, d / 2).setTranslation(x, -1, z).setFriction(1.0), body);
  }
  for (const s of statics) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rotY);
    physics.world.createCollider(physics.R.ColliderDesc.cuboid(s.size.x / 2, s.size.y / 2, s.size.z / 2).setTranslation(s.pos.x, s.pos.y, s.pos.z).setRotation(q), body);
  }

  return { sun, hemi, sky, clouds, water, terrainCollider, sunDir, lamps, glowMats, towers, towerLens, buildSlab, pmremEnv: scene.environment, updateShadow(focus) {
    sun.position.copy(focus).addScaledVector(sunDir, 80);
    sun.target.position.copy(focus);
    // snap to texel grid to avoid shimmering
    sun.target.updateMatrixWorld();
  } };
}

export function shadowed(m, cast = true, receive = true) { m.castShadow = cast; m.receiveShadow = receive; return m; }

// ---- trees: soft clustered canopies (normals bent outwards from the crown centre, so the foliage shades as one
// rounded mass instead of facets), darker inside and underneath; three kinds: broadleaf, conifer and birch
// deterministic noise from a position: vertices that share a corner always move together (no cracks)
const hash3 = (x, y, z) => { const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return h - Math.floor(h); };
function foliageClump(r, cx, cy, cz, rad, center, base, rnd, squash = 0.85) {
  const g = new THREE.IcosahedronGeometry(rad, 2);
  const p = g.attributes.position, n = new THREE.Vector3(), v = new THREE.Vector3();
  const cols = new Float32Array(p.count * 3), nrm = new Float32Array(p.count * 3);
  for (let k = 0; k < p.count; k++) {
    v.set(p.getX(k), p.getY(k), p.getZ(k));
    const bump = 1 + (Math.sin(v.x * 5.1 + v.y * 3.3) * Math.cos(v.z * 4.7 - v.y * 2.1)) * 0.12 + (hash3(v.x + cx, v.y + cy, v.z + cz) - 0.5) * 0.14;
    v.multiplyScalar(bump); v.y *= squash; v.add(new THREE.Vector3(cx, cy, cz));
    p.setXYZ(k, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const gn = g.attributes.normal;
  for (let k = 0; k < p.count; k++) {
    v.set(p.getX(k), p.getY(k), p.getZ(k));
    n.copy(v).sub(center).normalize().multiplyScalar(0.9).add(new THREE.Vector3(gn.getX(k), gn.getY(k), gn.getZ(k)).multiplyScalar(0.1)).normalize();
    nrm.set([n.x, n.y, n.z], k * 3);
    // ambient occlusion: dark deep inside and on the underside, lit on the outer top
    const out = THREE.MathUtils.clamp(v.distanceTo(center) / r, 0, 1.2);
    const up = THREE.MathUtils.clamp((v.y - center.y) / r * 0.5 + 0.5, 0, 1);
    const ao = 0.42 + 0.38 * out + 0.32 * up + (hash3(v.x, v.y, v.z) - 0.5) * 0.1;
    cols.set([base.r * ao, base.g * ao, base.b * ao], k * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}
function barkColors(g, col, birch = false, rnd = Math.random) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3), b = new THREE.Color(col);
  for (let k = 0; k < p.count; k++) {
    let s = 0.8 + rnd() * 0.3;
    if (birch && Math.sin(p.getY(k) * 9.0 + Math.sin(p.getX(k) * 13) * 2) > 0.82) s = 0.18; // dark birch marks
    c.set([b.r * s, b.g * s, b.b * s], k * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function branch(a, b, r0, r1) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, 7, 1, true); g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate(a.x, a.y, a.z);
}
function broadleafTree(r, hue, height) {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const top = V3((r() - 0.5) * 0.5, height, (r() - 0.5) * 0.5);
  const trunk = [branch(V3(0, -0.2, 0), V3(top.x * 0.4, height * 0.55, top.z * 0.4), 0.26, 0.17), branch(V3(top.x * 0.4, height * 0.55, top.z * 0.4), top, 0.17, 0.07)];
  // flared root collar
  trunk.push(new THREE.CylinderGeometry(0.24, 0.42, 0.5, 8, 1, true).translate(0, 0.15, 0));
  const center = V3(top.x * 0.6, height * 0.78, top.z * 0.6), R = 2.1 + r() * 0.6;
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + r(), y0 = height * (0.45 + i * 0.07);
    trunk.push(branch(V3(top.x * 0.4, y0, top.z * 0.4), V3(Math.cos(a) * R * 0.75, y0 + 1.1 + r() * 0.6, Math.sin(a) * R * 0.75), 0.09, 0.035));
  }
  const base = new THREE.Color().setHSL(hue + r() * 0.03, 0.42 + r() * 0.1, 0.25 + r() * 0.05);
  const clumps = [];
  const n = 13;
  for (let i = 0; i < n; i++) {
    // points on a slightly flattened ellipsoid shell, a few inside to fill it
    const u = r() * 2 - 1, a = r() * Math.PI * 2, rr = Math.sqrt(1 - u * u), shell = i < 10 ? 0.75 : 0.3;
    const cx = center.x + Math.cos(a) * rr * R * shell, cy = center.y + u * R * 0.72 * shell, cz = center.z + Math.sin(a) * rr * R * shell;
    const c = base.clone().offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.05);
    clumps.push(foliageClump(R, cx, cy, cz, 0.95 + r() * 0.55, center, c, r));
  }
  return { trunk: barkColors(merge(trunk), 0x5a4636, false, r), leaves: merge(clumps) };
}
function coniferTree(r, height) {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const trunk = [branch(V3(0, -0.2, 0), V3(0, height, 0), 0.22, 0.05)];
  const layers = [], base = new THREE.Color().setHSL(0.33, 0.42, 0.12);
  const tiers = 7;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1), rad = 2.3 * (1 - t * 0.82), y = 1.4 + t * (height - 1.6), h = 1.5 - t * 0.4;
    const g = new THREE.ConeGeometry(rad, h, 18, 3, true);
    const p = g.attributes.position, cols = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), yy = p.getY(k), z = p.getZ(k), d = Math.hypot(x, z);
      const jag = d > 0.1 ? 1 + Math.sin(Math.atan2(z, x) * 9 + i * 1.7) * 0.1 + (hash3(Math.round(x * 100), yy * 7 + i, Math.round(z * 100)) - 0.5) * 0.12 : 1;
      const droop = yy < -h * 0.45 ? -0.12 * (d / rad) : 0;
      p.setXYZ(k, x * jag, yy + droop, z * jag);
      const ao = 0.5 + 0.45 * (1 - (yy / h + 0.5)) * (d / rad) + 0.3 * (yy / h + 0.5) + t * 0.12;
      cols.set([base.r * ao, base.g * ao, base.b * ao], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.translate(0, y, 0); g.computeVertexNormals();
    layers.push(g);
  }
  return { trunk: barkColors(merge(trunk), 0x4a3a2c, false, r), leaves: merge(layers) };
}
function birchTree(r, height) {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const lean = V3((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8);
  const trunk = [branch(V3(0, -0.2, 0), V3(lean.x * 0.5, height * 0.6, lean.z * 0.5), 0.15, 0.1), branch(V3(lean.x * 0.5, height * 0.6, lean.z * 0.5), V3(lean.x, height, lean.z), 0.1, 0.04)];
  const center = V3(lean.x * 0.8, height * 0.74, lean.z * 0.8), R = 1.8;
  const base = new THREE.Color().setHSL(0.24, 0.45, 0.27);
  const clumps = [];
  for (let i = 0; i < 11; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
    clumps.push(foliageClump(R, center.x + Math.cos(a) * rr * R * 0.7, center.y + u * R * 1.1, center.z + Math.sin(a) * rr * R * 0.7, 0.7 + r() * 0.45, center, base.clone().offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.05), r, 1.1));
  }
  return { trunk: barkColors(merge(trunk), 0xe8e4da, true, r), leaves: merge(clumps) };
}

function buildTrees(scene, M) {
  const r = mulberry(31);
  const barkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const coneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const variants = [broadleafTree(r, 0.24, 5.2), broadleafTree(r, 0.21, 6.2), coniferTree(r, 8.5), birchTree(r, 6.8)];
  variants[2].mat = coneMat;
  const spots = [];
  const { lotMin: l0, lotMax: l1 } = SITE;
  for (let i = 0; i < 130; i++) {
    let x, z;
    const side = i % 4;
    if (side === 0) { x = l0.x - 6 - r() * 34; z = l0.y - 10 + r() * (l1.y - l0.y + 12); }
    else if (side === 1) { x = l1.x + 6 + r() * 34; z = l0.y - 10 + r() * (l1.y - l0.y + 12); }
    else if (side === 2) { x = l0.x - 30 + r() * (l1.x - l0.x + 60); z = l0.y - 6 - r() * 22; }
    else { x = -110 + r() * 220; z = SITE.streetZ + 12.5 + (r() < 0.5 ? 0 : 14) + r() * 2; if (Math.abs(((x + 46) % 20)) < 6) continue; }
    if (Math.abs(x + 128) < 9 && (Math.abs(z + 20) < 8 || Math.abs(z + 70) < 8)) continue;
    if (Math.abs(x - 116) < 9 && (Math.abs(z + 30) < 8 || Math.abs(z + 90) < 8)) continue;
    const bp = SITE.buildPlot; if (Math.abs(x - bp.x) < bp.w / 2 + 5 && Math.abs(z - bp.z) < bp.d / 2 + 5) continue; // keep the build plot clear
    spots.push([x, z, 0.8 + r() * 0.6, r() * Math.PI * 2, Math.floor(r() * 4)]);
  }
  variants.forEach((v, vi) => {
    const list = spots.filter((s) => s[4] === vi);
    const tr = new THREE.InstancedMesh(v.trunk, barkMat, list.length), lf = new THREE.InstancedMesh(v.leaves, v.mat || leafMat, list.length);
    const m = new THREE.Matrix4();
    list.forEach(([x, z, s, a], i) => { m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a), new THREE.Vector3(s, s, s)); tr.setMatrixAt(i, m); lf.setMatrixAt(i, m); });
    shadowed(tr, true, true); shadowed(lf, true, true);
    scene.add(tr, lf);
  });
  // trimmed hedges along the front gardens: rows of leafy clumps, open where each garden path comes through
  const hedgeClumps = [], hz = SITE.streetZ + 11.5, hb = new THREE.Color().setHSL(0.27, 0.45, 0.2);
  const doors = [-46, -26, -6, 15, 36];
  for (let x = -54; x <= 46; x += 0.8) {
    if (doors.some((dx) => Math.abs(x - dx) < 1.1)) continue;
    if (doors.every((dx) => Math.abs(x - dx) > 6.5)) continue;
    const c = new THREE.Vector3(x, 0.55, hz);
    hedgeClumps.push(foliageClump(0.9, x + (r() - 0.5) * 0.2, 0.62 + r() * 0.08, hz + (r() - 0.5) * 0.15, 0.55 + r() * 0.12, c, hb.clone().offsetHSL(0, 0, (r() - 0.5) * 0.04), r, 1.25));
  }
  const hedge = new THREE.Mesh(merge(hedgeClumps), leafMat); shadowed(hedge, true, true); scene.add(hedge);
}

function buildFence(scene, M, addStatic) {
  const panelW = 3.4, panelH = 2.0;
  const frame = merge([
    cyl(0.021, 0.021, panelH, 6, -panelW / 2 + 0.03, panelH / 2 + 0.12, 0), cyl(0.021, 0.021, panelH, 6, panelW / 2 - 0.03, panelH / 2 + 0.12, 0),
    cyl(0.021, 0.021, panelW, 6, 0, panelH + 0.11, 0, null, 0, 0, Math.PI / 2), cyl(0.021, 0.021, panelW, 6, 0, 0.13, 0, null, 0, 0, Math.PI / 2),
  ]);
  const meshGeo = new THREE.PlaneGeometry(panelW - 0.06, panelH - 0.04);
  meshGeo.translate(0, panelH / 2 + 0.12, 0);
  const chain = T.chainLinkTexture().clone();
  chain.repeat.set((panelW) / 0.12, panelH / 0.12); chain.needsUpdate = true;
  const meshMat = new THREE.MeshStandardMaterial({ map: chain, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 });
  const footGeo = merge([box(0.62, 0.14, 0.2, 0, 0.07, 0), box(0.5, 0.04, 0.16, 0, 0.16, 0)]);
  const footMat = new THREE.MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.9 });
  const placements = [];
  const { lotMin, lotMax } = SITE;
  const run = (x0, z0, x1, z1, gapFrom = null, gapTo = null) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / panelW);
    const ang = Math.atan2(-(z1 - z0), x1 - x0);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      if (gapFrom !== null && x > gapFrom && x < gapTo) continue;
      placements.push([x, z, ang, (len / n) / panelW]);
    }
    addStatic((x0 + x1) / 2, 1, (z0 + z1) / 2, Math.abs(x1 - x0) + 0.1, 2, Math.abs(z1 - z0) + 0.1);
  };
  run(lotMin.x, lotMin.y, lotMax.x, lotMin.y);
  run(lotMin.x, lotMin.y, lotMin.x, lotMax.y);
  run(lotMax.x, lotMin.y, lotMax.x, lotMax.y);
  // front fence with a gate gap: two runs
  const fz = lotMax.y;
  const [gate0, gate1] = SITE.gate;
  const fr = (a, b) => {
    const len = b - a, n = Math.round(len / panelW);
    for (let i = 0; i < n; i++) placements.push([a + (i + 0.5) * len / n, fz, 0, (len / n) / panelW]);
    addStatic((a + b) / 2, 1, fz, len, 2, 0.1);
  };
  fr(lotMin.x, gate0); fr(gate1, lotMax.x);
  const fi = new THREE.InstancedMesh(frame, M.galvanized, placements.length);
  const mi = new THREE.InstancedMesh(meshGeo, meshMat, placements.length);
  const ft = new THREE.InstancedMesh(footGeo, footMat, placements.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  placements.forEach(([x, z, a, s], i) => {
    q.setFromAxisAngle(up, a);
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, 1, 1)); fi.setMatrixAt(i, m); mi.setMatrixAt(i, m);
    const off = new THREE.Vector3(-panelW * s / 2, 0, 0).applyQuaternion(q);
    m.compose(new THREE.Vector3(x + off.x, 0, z + off.z), q, new THREE.Vector3(1, 1, 1)); ft.setMatrixAt(i, m);
  });
  shadowed(fi, true, false); shadowed(mi, true, false); shadowed(ft, true, true);
  scene.add(fi, mi, ft);
  // gate banner
  const bannerMat = new THREE.MeshStandardMaterial({ map: T.labelTexture('WRECKING YARD', { w: 1024, h: 200, bg: '#f2b705', font: '900 120px Arial', sub: 'DEMOLITION & RECYCLING · KEEP OUT', color: '#16171a' }), roughness: 0.6 });
  for (const [x, side] of [[gate0 - 2.8, 1], [gate1 + 2.8, 1], [gate0 - 2.8, -1], [gate1 + 2.8, -1]]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.9), bannerMat);
    banner.position.set(x, 1.3, fz + 0.04 * side); banner.rotation.y = side > 0 ? 0 : Math.PI; scene.add(banner);
  }
}

function buildSiteOffice(scene, M, addStatic, x, z) {
  const g = new THREE.Group();
  const W = 6.06, H = 2.6, D = 2.44;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), boxMapped(new THREE.MeshStandardMaterial({ map: T.corrugatedTextures([235, 236, 232]).map, normalMap: T.corrugatedTextures([235, 236, 232]).normalMap, roughness: 0.5, metalness: 0.3 }), 0.8, 0.8));
  body.position.y = H / 2 + 0.25; g.add(shadowed(body));
  const frame = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) frame.push(box(0.16, H + 0.12, 0.16, sx * (W / 2 - 0.05), H / 2 + 0.25, sz * (D / 2 - 0.05)));
  for (const sz of [-1, 1]) { frame.push(box(W, 0.14, 0.16, 0, 0.28, sz * (D / 2 - 0.05)), box(W, 0.14, 0.16, 0, H + 0.24, sz * (D / 2 - 0.05))); }
  frame.push(box(0.3, 0.25, D, -W / 2 + 0.3, 0.12, 0), box(0.3, 0.25, D, W / 2 - 0.3, 0.12, 0));
  g.add(shadowed(new THREE.Mesh(merge(frame), M.paintBlue)));
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x2b3a46, roughness: 0.08, metalness: 0.6 });
  for (const wx of [-1.6, 1.4]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.04), glassMat); win.position.set(wx, 1.75, D / 2 + 0.01); g.add(win);
    const bars = [];
    for (let i = 0; i < 6; i++) bars.push(box(0.03, 0.95, 0.03, wx - 0.5 + i * 0.2, 1.75, D / 2 + 0.05));
    bars.push(box(1.3, 0.06, 0.08, wx, 2.22, D / 2 + 0.04), box(1.3, 0.06, 0.08, wx, 1.28, D / 2 + 0.04));
    g.add(new THREE.Mesh(merge(bars), M.darkSteel));
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.0, 0.05), M.paintGrey); door.position.set(-0.1, 1.27, D / 2 + 0.02); g.add(door);
  const steps = [box(1.2, 0.08, 0.3, -0.1, 0.18, D / 2 + 0.2), box(1.2, 0.08, 0.3, -0.1, 0.0 + 0.04, D / 2 + 0.48)];
  g.add(shadowed(new THREE.Mesh(merge(steps), M.tread)));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), new THREE.MeshStandardMaterial({ map: T.labelTexture('SITE OFFICE', { w: 512, h: 128, bg: '#1f5fa8', color: '#fff', font: '900 70px Arial', italic: false }) }));
  sign.position.set(-0.1, 2.55, D / 2 + 0.03); g.add(sign);
  const ac = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.3), M.paintWhite); ac.position.set(2.3, 2.2, D / 2 + 0.15); g.add(shadowed(ac));
  g.position.set(x, 0, z); g.rotation.y = Math.PI;
  scene.add(g);
  addStatic(x, 1.4, z, W, 2.8, D);
}

// Trailer-mounted light tower: generator canopy on a single-axle trailer, four stabiliser jacks,
// a three-stage telescopic mast and a bar of four LED floodlights tilted towards the work area.
function buildLightTower(scene, M, addStatic, lens, x, z, tx, tz) {
  const g = new THREE.Group();
  const Y = 0xe8b40c, W = 0xeceae4, D = 0x2a2c30, K = 0x141518, G = 0x8b9096;
  const v = [];
  // chassis rails, drawbar A-frame, jockey wheel, tow eye
  for (const s of [-1, 1]) v.push(box(0.1, 0.14, 3.3, s * 0.62, 0.52, 0, D));
  v.push(box(1.34, 0.1, 0.1, 0, 0.52, 1.6, D), box(1.34, 0.1, 0.1, 0, 0.52, -1.6, D));
  for (const s of [-1, 1]) v.push(box(0.08, 0.08, 1.45, s * 0.33, 0.5, 2.2, D, 0, s * 0.42, 0));
  v.push(cyl(0.07, 0.07, 0.16, 12, 0, 0.5, 2.9, D, Math.PI / 2), cyl(0.04, 0.04, 0.55, 8, 0, 0.32, 2.62, G), cyl(0.09, 0.09, 0.06, 12, 0, 0.07, 2.62, K, 0, 0, Math.PI / 2));
  // generator canopy with louvres, doors, control panel and exhaust
  v.push(box(1.36, 1.1, 2.3, 0, 1.15, -0.25, Y), box(1.4, 0.06, 2.36, 0, 1.72, -0.25, Y), box(1.28, 0.06, 2.22, 0, 0.62, -0.25, D));
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) v.push(box(0.02, 0.035, 0.6, s * 0.69, 0.9 + i * 0.08, -0.95, K));
    v.push(box(0.012, 0.95, 0.012, s * 0.685, 1.15, 0.2, K), box(0.03, 0.08, 0.03, s * 0.7, 1.2, 0.05, G));
    v.push(box(0.02, 0.07, 0.4, s * 0.69, 1.55, 0.35, W)); // decal band
  }
  v.push(box(0.6, 0.45, 0.04, 0, 1.2, 0.92, D), box(0.46, 0.3, 0.02, 0, 1.24, 0.95, 0x3a4a3c));
  for (let i = 0; i < 3; i++) v.push(cyl(0.025, 0.025, 0.03, 10, -0.15 + i * 0.15, 1.04, 0.95, i === 0 ? 0xc0261b : 0x2a8a3a, Math.PI / 2));
  v.push(cyl(0.045, 0.045, 0.32, 10, 0.45, 1.88, -1.05, G), cyl(0.05, 0.05, 0.05, 10, 0.45, 2.06, -1.05, K));
  // axle, mudguards
  v.push(box(1.5, 0.08, 0.08, 0, 0.36, -0.3, D));
  for (const s of [-1, 1]) v.push(box(0.26, 0.04, 0.85, s * 0.83, 0.75, -0.3, D), box(0.26, 0.3, 0.04, s * 0.83, 0.6, 0.12, D));
  // stabiliser jacks at the four corners (outriggers swung out, feet on the ground)
  const feet = [[-1, 1.4], [1, 1.4], [-1, -1.5], [1, -1.5]];
  for (const [s, zz] of feet) {
    v.push(box(0.75, 0.08, 0.08, s * 0.95, 0.5, zz, Y), box(0.09, 0.62, 0.09, s * 1.3, 0.34, zz, Y), box(0.06, 0.25, 0.06, s * 1.3, 0.82, zz, G));
    v.push(box(0.26, 0.03, 0.26, s * 1.3, 0.015, zz, D));
  }
  const body = new THREE.Mesh(merge(v), M.vertex); shadowed(body); g.add(body);
  // wheels
  const tyre = cyl(0.33, 0.33, 0.2, 20, 0, 0, 0, null, 0, 0, Math.PI / 2);
  const rim = cyl(0.18, 0.18, 0.21, 14, 0, 0, 0, null, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) {
    const t = new THREE.Mesh(tyre, M.rubber); t.position.set(s * 0.83, 0.33, -0.3); g.add(shadowed(t));
    const r = new THREE.Mesh(rim, M.galvanized); r.position.copy(t.position); g.add(r);
  }
  // telescopic mast (three stages) rising from the back of the canopy, coiled cable, lamp bar
  const H = 9.2, mz = -1.25;
  const mast = merge([cyl(0.11, 0.11, 3.4, 12, 0, 1.75 + 1.7, mz), cyl(0.085, 0.085, 3.3, 12, 0, 1.75 + 3.4 + 1.5, mz), cyl(0.065, 0.065, 2.7, 12, 0, 1.75 + 6.4 + 1.05, mz),
    cyl(0.135, 0.135, 0.12, 12, 0, 1.75 + 3.38, mz), cyl(0.105, 0.105, 0.12, 12, 0, 1.75 + 6.48, mz), box(0.3, 0.5, 0.3, 0, 1.95, mz),
    box(0.16, 0.16, 0.42, 0, 2.2, mz + 0.28), cyl(0.06, 0.06, 0.18, 10, 0.18, 2.2, mz + 0.4, null, 0, 0, Math.PI / 2)]);
  g.add(shadowed(new THREE.Mesh(mast, M.galvanized)));
  const coil = []; for (let i = 0; i < 60; i++) { const a = i * 0.55; coil.push(new THREE.Vector3(Math.cos(a) * 0.15, 2.3 + i * 0.1, mz + Math.sin(a) * 0.15)); }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 240, 0.014, 5), M.blackPlastic));
  const bar = new THREE.Group(); bar.position.set(0, H + 0.1, mz); g.add(bar);
  bar.add(shadowed(new THREE.Mesh(merge([box(1.9, 0.08, 0.08, 0, 0, 0), box(0.08, 0.5, 0.08, 0, -0.25, 0), box(0.06, 0.06, 0.5, 0, 0.0, 0.0)]), M.darkSteel)));
  const heads = [];
  const yaw = Math.atan2(tx - x, tz - z);
  g.position.set(x, 0, z); g.rotation.y = yaw + Math.PI; // the canopy end faces away from the work, lamps lean over it
  const tilt = 0.55;
  for (const [hx, hy] of [[-0.6, 0.28], [0.6, 0.28], [-0.6, -0.28], [0.6, -0.28]]) {
    const h = new THREE.Group(); h.position.set(hx, hy, 0); h.rotation.x = -tilt; bar.add(h);
    // the head looks along -z of the group (towards the work area once the group is turned round)
    h.add(shadowed(new THREE.Mesh(merge([box(0.56, 0.4, 0.12, 0, 0, 0.04), box(0.6, 0.03, 0.14, 0, 0.21, 0.02), box(0.04, 0.3, 0.06, -0.3, 0, 0.04), box(0.04, 0.3, 0.06, 0.3, 0, 0.04)]), M.blackPaint)));
    for (let i = 0; i < 6; i++) h.add(new THREE.Mesh(box(0.012, 0.36, 0.1, -0.24 + i * 0.096, 0, 0.13), M.blackPaint));
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.34), lens); l.position.z = -0.025; l.rotation.y = Math.PI; h.add(l);
    heads.push(h);
  }
  scene.add(g); g.updateMatrixWorld(true);
  addStatic(x, 1.0, z, 2.0, 2.0, 3.4, yaw);
  const mw = new THREE.Vector3(0, 6, mz).applyMatrix4(g.matrixWorld);
  addStatic(mw.x, 6, mw.z, 0.3, 8, 0.3, yaw);
  const top = new THREE.Vector3(0, H + 0.1, mz).applyMatrix4(g.matrixWorld);
  return { pos: top, target: new THREE.Vector3(tx, 0, tz), heads };
}

// The plot across the road where you build your own house: a concrete foundation slab on a gravel apron, a path
// from the pavement and a board. Its top is the base of the first course of bricks.
function buildPlotArea(scene, M, addStatic) {
  const P = SITE.buildPlot, g = new THREE.Group(); g.position.set(P.x, 0, P.z); scene.add(g);
  const gravel = new THREE.MeshStandardMaterial({ map: T.gravelTextures().map, roughness: 1 });
  gravel.map = gravel.map.clone(); gravel.map.repeat.set(5, 4); gravel.map.needsUpdate = true;
  const apron = new THREE.Mesh(new THREE.BoxGeometry(P.w + 4, 0.06, P.d + 4), gravel); apron.position.y = 0.03; g.add(shadowed(apron, false, true));
  const slab = new THREE.Mesh(new THREE.BoxGeometry(P.w, P.top, P.d), boxMapped(M.concretePlain.clone(), 0.25, 0.25));
  slab.position.y = P.top / 2; g.add(shadowed(slab, false, true));
  // setting-out lines scribed in the slab every 1.2 m (one block length) so walls are easy to line up
  const lines = [];
  for (let x = -P.w / 2 + 1.2; x < P.w / 2 - 0.1; x += 1.2) lines.push(box(0.02, 0.005, P.d - 0.2, x, P.top + 0.002, 0));
  for (let z = -P.d / 2 + 1.2; z < P.d / 2 - 0.1; z += 1.2) lines.push(box(P.w - 0.2, 0.005, 0.02, 0, P.top + 0.002, z));
  g.add(new THREE.Mesh(merge(lines), new THREE.MeshBasicMaterial({ color: 0x8a8a84 })));
  // path from the pavement to the slab
  const path = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, P.z - P.d / 2 - (SITE.streetZ + 9.0)), M.concretePlain);
  path.position.set(0, 0.04, -(P.d / 2) - path.geometry.parameters.depth / 2); g.add(shadowed(path, false, true));
  // board on two posts at the street corner
  const board = new THREE.Group(); board.position.set(-P.w / 2 - 1.2, 0, -P.d / 2 - 1.2); board.rotation.y = Math.PI; g.add(board);
  board.add(shadowed(new THREE.Mesh(merge([box(0.1, 2.6, 0.1, -1.0, 1.3, 0), box(0.1, 2.6, 0.1, 1.0, 1.3, 0)]), M.wood)));
  const face = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 0.05), [M.paintWhite, M.paintWhite, M.paintWhite, M.paintWhite,
    new THREE.MeshStandardMaterial({ map: T.labelTexture('BUILD YOUR HOUSE', { w: 1024, h: 512, bg: '#1f5fa8', color: '#ffffff', font: '900 104px Arial', italic: false, sub: 'MORTAR FIRST, THEN LAY THE BLOCK' }) }), M.paintWhite]);
  face.position.y = 2.0; board.add(shadowed(face));
  addStatic(P.x, P.top / 2, P.z, P.w, P.top, P.d);
  return { x: P.x, z: P.z, w: P.w, d: P.d, top: P.top };
}

function buildPortaloo(scene, M, addStatic, x, z) {
  const blue = new THREE.MeshStandardMaterial({ color: 0x2f6fc0, roughness: 0.45 });
  const g = new THREE.Group();
  const geo = merge([box(1.12, 2.15, 1.12, 0, 1.13, 0), box(1.2, 0.08, 1.2, 0, 0.04, 0)]);
  g.add(shadowed(new THREE.Mesh(geo, blue)));
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.16, 4).rotateY(Math.PI / 4), new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.4, transparent: true, opacity: 0.92 }));
  roof.position.y = 2.28; g.add(shadowed(roof));
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.9, 0.04), new THREE.MeshStandardMaterial({ color: 0x245ca8, roughness: 0.5 })); door.position.set(0, 1.1, 0.57); g.add(door);
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.07), M.paintGreen); tag.position.set(0.3, 1.25, 0.6); g.add(tag);
  g.position.set(x, 0, z); g.rotation.y = Math.PI;
  scene.add(g); addStatic(x, 1.1, z, 1.2, 2.2, 1.2);
}

function buildDumpster(scene, M, addStatic, x, z) {
  const s = new THREE.Shape();
  s.moveTo(-2.0, 0); s.lineTo(2.0, 0); s.lineTo(2.6, 1.4); s.lineTo(-2.6, 1.4); s.closePath();
  const ex = new THREE.ExtrudeGeometry(s, { depth: 1.8, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
  ex.translate(0, 0.1, -0.9);
  const g = new THREE.Group();
  g.add(shadowed(new THREE.Mesh(ex, M.paintYellowWorn)));
  const fill = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 1.6), new THREE.MeshStandardMaterial({ map: T.gravelTextures().map, roughness: 1 })); fill.position.y = 1.3; g.add(fill);
  const hz = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), M.hazard); hz.position.set(-1.9, 1.0, 0.95); g.add(hz);
  const hz2 = hz.clone(); hz2.position.x = 1.9; g.add(hz2);
  g.position.set(x, 0, z); scene.add(g);
  addStatic(x, 0.75, z, 4.8, 1.5, 1.9);
}

function buildCones(scene, M) {
  const coneGeo = merge([cyl(0.03, 0.17, 0.62, 16, 0, 0.36, 0, 0xff5a10), box(0.38, 0.05, 0.38, 0, 0.025, 0, 0x1a1a1a), cyl(0.085, 0.12, 0.1, 16, 0, 0.38, 0, 0xf4f4f4), cyl(0.06, 0.075, 0.07, 16, 0, 0.53, 0, 0xf4f4f4)]);
  const spots = [[27.5, 23], [29.5, 23.2], [6.5, 23.1], [4.5, 23], [20, 4], [22, 6], [-6, 21], [2, 22], [10, 26.5], [24, 26.5]];
  const im = new THREE.InstancedMesh(coneGeo, M.vertex, spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, z], i) => { m.makeTranslation(x, 0, z); im.setMatrixAt(i, m); });
  scene.add(shadowed(im));
}

function buildPallets(scene, M, addStatic) {
  const p = [];
  const w = 0xc19a68;
  for (let i = 0; i < 5; i++) p.push(box(1.2, 0.025, 0.14, 0, 0.13, -0.43 + i * 0.215, w));
  for (const x of [-0.55, 0, 0.55]) p.push(box(0.1, 0.1, 1.0, x, 0.06, 0, 0xa98456));
  const blocks = [];
  for (let ly = 0; ly < 4; ly++) for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) blocks.push(box(0.38, 0.19, 0.48, -0.4 + i * 0.4, 0.24 + ly * 0.2, -0.25 + j * 0.5, 0x9a9890 + ((i + j + ly) % 2) * 0x080808));
  const palletGeo = merge(p), blockGeo = merge(blocks);
  for (const [x, z, r] of [[-37, 4, 0.2], [-37.5, 6, -0.1], [-36.6, 8.2, 0.4], [-37, 10.4, 0.1]]) {
    const pm = new THREE.Mesh(palletGeo, M.vertex); pm.position.set(x, 0, z); pm.rotation.y = r; scene.add(shadowed(pm));
    const bm = new THREE.Mesh(blockGeo, M.vertex); bm.position.copy(pm.position); bm.rotation.y = r; scene.add(shadowed(bm));
    addStatic(x, 0.5, z, 1.2, 1.0, 1.1, r);
  }
}

function buildSign(scene, M, addStatic) {
  const g = new THREE.Group();
  const legs = merge([box(0.1, 2.6, 0.1, -1.1, 1.3, 0), box(0.1, 2.6, 0.1, 1.1, 1.3, 0)]);
  g.add(shadowed(new THREE.Mesh(legs, M.wood)));
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 0.05), [M.paintWhite, M.paintWhite, M.paintWhite, M.paintWhite,
    new THREE.MeshStandardMaterial({ map: T.labelTexture('DANGER', { w: 512, h: 280, bg: '#ffffff', color: '#c0261b', font: '900 110px Arial', italic: false, sub: 'DEMOLITION IN PROGRESS · HARD HATS' }) }), M.paintWhite]);
  board.position.y = 2.0; g.add(shadowed(board));
  g.position.set(SITE.gate[0] - 3, 0, 24.4); g.rotation.y = 0;
  scene.add(g);
}
