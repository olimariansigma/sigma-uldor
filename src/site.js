// Shared layout of the demolition yard (all positions in metres, y up).
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const SITE = {
  lotMin: new THREE.Vector2(-40, -36), lotMax: new THREE.Vector2(40, 24),
  gate: [8, 26],              // opening in the front fence (x range)
  streetZ: 30.5,              // kerb line of the street
  plots: [V(-4, 0, -14), V(-27, 0, -18)],
  crusherPos: V(14, 0, -2), crusherRot: 0,
  mixerPos: V(25, 0, 13),
  lake: { cx: 33.5, cz: -4, rx: 5.6, rz: 8.2, water: -0.45, depth: 2.6 },
  playerSpawn: V(4, 0.2, 10),
  machineYard: V(-26, 0, 6),
  terrainSize: 200,
};

// terrain height (0 everywhere except the lake bowl)
export function lakeDist(x, z) {
  const L = SITE.lake;
  return Math.hypot((x - L.cx) / L.rx, (z - L.cz) / L.rz);
}
export function terrainHeight(x, z) {
  const d = lakeDist(x, z);
  if (d >= 1.2) return 0;
  const t = THREE.MathUtils.smoothstep(d, 0.5, 1.2);
  return -SITE.lake.depth * (1 - t);
}
export function inWater(x, y, z) {
  return lakeDist(x, z) < 1.12 && y < SITE.lake.water && y > terrainHeight(x, z) - 0.3;
}
