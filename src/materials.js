import * as THREE from 'three';
import * as T from './textures.js';

// Box-mapping: derive UVs from the (scaled) local position of a unit box so textures keep their
// real-world size no matter how each instance is scaled. Optional atlas picks a variant per instance.
export function boxMapped(mat, tileU, tileV, atlas = 0) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.bmTile = { value: new THREE.Vector2(tileU, tileV) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 bmTile;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_INSTANCING
          vec3 bmS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        #else
          vec3 bmS = vec3(1.0);
        #endif
        vec3 bmP = (position + 0.5) * bmS;
        vec3 bmN = abs(normal);
        vec2 bmUv;
        if (bmN.x > bmN.y && bmN.x > bmN.z) bmUv = vec2(bmP.z, bmP.y);
        else if (bmN.y > bmN.z) bmUv = vec2(bmP.x, bmP.z);
        else bmUv = vec2(bmP.x, bmP.y);
        bmUv /= bmTile;
        ${atlas ? `
        #ifdef USE_INSTANCING
          float bmVar = mod(float(gl_InstanceID) * 3.0 + floor(float(gl_InstanceID) / 7.0), ${atlas.toFixed(1)});
        #else
          float bmVar = 0.0;
        #endif
        bmUv.y = (clamp(bmUv.y, 0.004, 0.996) + bmVar) / ${atlas.toFixed(1)};` : ''}
        #ifdef USE_MAP
          vMapUv = bmUv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = bmUv;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = bmUv;
        #endif
      `);
  };
  mat.customProgramCacheKey = () => 'bm' + tileU + '_' + tileV + '_' + atlas;
  return mat;
}

let M = null;
export function materials() {
  if (M) return M;
  const brick = T.brickTextures('red');
  const brickY = T.brickTextures('yellow');
  const block = T.brickTextures('grey');
  const conc = T.concreteTextures();
  const shingles = T.shingleTextures();
  const pine = T.woodTextures('pine');
  const floor = T.woodTextures('floor');
  const paintWood = T.woodTextures('paint');
  const corr = T.corrugatedTextures([176, 184, 190]);
  const tread = T.treadPlateTextures();

  M = {
    brick: boxMapped(new THREE.MeshStandardMaterial({ map: brick.map, normalMap: brick.normalMap, roughnessMap: brick.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2) }), 0.66, 0.3, brick.variants),
    brickYellow: boxMapped(new THREE.MeshStandardMaterial({ map: brickY.map, normalMap: brickY.normalMap, roughnessMap: brickY.roughnessMap, roughness: 1 }), 0.66, 0.3, brickY.variants),
    block: boxMapped(new THREE.MeshStandardMaterial({ map: block.map, normalMap: block.normalMap, roughnessMap: block.roughnessMap, roughness: 1 }), 0.66, 0.3, block.variants),
    concrete: boxMapped(new THREE.MeshStandardMaterial({ map: conc.map, normalMap: conc.normalMap, roughness: 0.92 }), 1.2, 1.2),
    shingles: boxMapped(new THREE.MeshStandardMaterial({ map: shingles.map, normalMap: shingles.normalMap, roughness: 0.95 }), 1.0, 1.0),
    soffit: boxMapped(new THREE.MeshStandardMaterial({ map: pine.map, normalMap: pine.normalMap, roughness: 0.8 }), 1.0, 1.0),
    fascia: boxMapped(new THREE.MeshStandardMaterial({ map: paintWood.map, roughness: 0.6, color: 0xf4f1ea }), 1.0, 1.0),
    floorWood: boxMapped(new THREE.MeshStandardMaterial({ map: floor.map, normalMap: floor.normalMap, roughness: 0.55 }), 1.6, 1.6),
    timber: boxMapped(new THREE.MeshStandardMaterial({ map: pine.map, normalMap: pine.normalMap, roughness: 0.75 }), 1.2, 1.2),
    metalRoof: boxMapped(new THREE.MeshStandardMaterial({ map: corr.map, normalMap: corr.normalMap, roughness: 0.45, metalness: 0.6 }), 1.2, 1.2),
    metalWall: boxMapped(new THREE.MeshStandardMaterial({ map: corr.map, normalMap: corr.normalMap, roughness: 0.5, metalness: 0.5, color: 0x9fb4c4 }), 1.0, 1.0),

    paintYellow: new THREE.MeshPhysicalMaterial({ color: 0xf2b200, roughness: 0.42, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
    paintYellowWorn: new THREE.MeshStandardMaterial({ color: 0xd99f0a, roughness: 0.65, metalness: 0.15 }),
    paintOrange: new THREE.MeshPhysicalMaterial({ color: 0xe86a10, roughness: 0.42, metalness: 0.1, clearcoat: 0.45, clearcoatRoughness: 0.3 }),
    paintGrey: new THREE.MeshStandardMaterial({ color: 0xb9bcbf, roughness: 0.5, metalness: 0.2 }),
    paintWhite: new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.45, metalness: 0.05 }),
    paintBlue: new THREE.MeshStandardMaterial({ color: 0x1f5fa8, roughness: 0.45, metalness: 0.1 }),
    paintRed: new THREE.MeshStandardMaterial({ color: 0xc0261b, roughness: 0.4, metalness: 0.1 }),
    paintGreen: new THREE.MeshStandardMaterial({ color: 0x1e8a3c, roughness: 0.4, metalness: 0.1 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 0.55, metalness: 0.6 }),
    blackPaint: new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.5, metalness: 0.3 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8e9398, roughness: 0.38, metalness: 0.85 }),
    galvanized: new THREE.MeshStandardMaterial({ color: 0xb4b9bd, roughness: 0.45, metalness: 0.8 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.08, metalness: 1.0 }),
    trackSteel: new THREE.MeshStandardMaterial({ color: 0x35373a, roughness: 0.62, metalness: 0.75 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151516, roughness: 0.9, metalness: 0.0 }),
    blackPlastic: new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.6, metalness: 0.0 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.85 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xbfd6e0, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.32, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide }),
    cabGlass: new THREE.MeshPhysicalMaterial({ color: 0x1b2a33, roughness: 0.03, metalness: 0.2, transparent: true, opacity: 0.55, envMapIntensity: 2.0, depthWrite: false, side: THREE.DoubleSide }),
    pvc: new THREE.MeshStandardMaterial({ color: 0xf5f4ef, roughness: 0.35 }),
    doorWood: new THREE.MeshStandardMaterial({ map: T.woodTextures('dark').map, roughness: 0.55, color: 0xb05a3a }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd4a640, roughness: 0.25, metalness: 1 }),
    lightLens: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: 0.6, roughness: 0.1 }),
    amberLens: new THREE.MeshStandardMaterial({ color: 0xffa000, emissive: 0xff8000, emissiveIntensity: 0.8, roughness: 0.2, transparent: true, opacity: 0.9 }),
    redLens: new THREE.MeshStandardMaterial({ color: 0xff2010, emissive: 0xaa0000, emissiveIntensity: 0.6, roughness: 0.2 }),
    hazard: new THREE.MeshStandardMaterial({ map: T.hazardTexture(), roughness: 0.5 }),
    tread: new THREE.MeshStandardMaterial({ map: tread.map, normalMap: tread.normalMap, roughness: 0.4, metalness: 0.8 }),
    concretePlain: new THREE.MeshStandardMaterial({ map: conc.map, normalMap: conc.normalMap, roughness: 0.9 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x5f6e7a, roughness: 0.95 }),
    vertex: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xd9a27c, roughness: 0.7 }),
    hiVis: new THREE.MeshStandardMaterial({ color: 0xff7a00, roughness: 0.65, emissive: 0x401000, emissiveIntensity: 0.2 }),
    reflective: new THREE.MeshStandardMaterial({ color: 0xdcdcdc, roughness: 0.2, metalness: 0.6 }),
    denim: new THREE.MeshStandardMaterial({ color: 0x2f4058, roughness: 0.9 }),
    boot: new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.7 }),
    hardhat: new THREE.MeshPhysicalMaterial({ color: 0xffd000, roughness: 0.3, clearcoat: 0.6 }),
    wood: new THREE.MeshStandardMaterial({ map: pine.map, roughness: 0.75 }),
  };
  return M;
}
