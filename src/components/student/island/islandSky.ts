import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { seededRandom } from "./placement";

// Cloud spots in the default camera's frame: `across` runs along the screen,
// `depth` toward the viewer, `y` is height. Kept below the meadow so they
// frame the hanging rock without hiding the placement area.
const ISLAND_CLOUDS = [
  { across: 9, depth: -2, y: -12, size: 3.2 },
  { across: -7, depth: 3, y: -13.5, size: 2.6 },
  { across: -27, depth: -8, y: -4, size: 2.8 },
  { across: 26, depth: -12, y: -1, size: 2.4 },
  { across: -21, depth: 10, y: -10, size: 2.2 },
];
const CLASSROOM_CLOUDS = [
  { across: 0, depth: 0, y: -15, size: 5 },
  { across: -34, depth: 18, y: -13, size: 4.2 },
  { across: 36, depth: -14, y: -12, size: 4.6 },
  { across: -62, depth: -22, y: -6, size: 4 },
  { across: 60, depth: 20, y: -9, size: 3.6 },
];

// Static low-poly clouds; one merged mesh, never a click target.
export function createIslandSky(classroom: boolean) {
  const random = seededRandom(classroom ? 91 : 29);
  const across = new THREE.Vector3(1, 0, -1).normalize();
  const toward = new THREE.Vector3(1, 0, 1).normalize();
  const puff = new THREE.IcosahedronGeometry(1, 1);
  const puffs: THREE.BufferGeometry[] = [];
  for (const spot of classroom ? CLASSROOM_CLOUDS : ISLAND_CLOUDS) {
    const center = across.clone().multiplyScalar(spot.across).addScaledVector(toward, spot.depth).setY(spot.y);
    // A broad middle puff flanked by smaller ones reads as a cloud from any side.
    for (const offset of [-1.1, -0.5, 0, 0.55, 1.15]) {
      const size = spot.size * (1 - Math.abs(offset) * 0.42) * (0.85 + random() * 0.3);
      const position = center.clone()
        .addScaledVector(across, offset * spot.size)
        .addScaledVector(toward, (random() - 0.5) * spot.size * 0.6)
        .setY(center.y + size * 0.22);
      puffs.push(puff.clone().scale(size, size * 0.62, size * 0.85).translate(position.x, position.y, position.z));
    }
  }
  const merged = mergeGeometries(puffs);
  puffs.forEach((geometry) => geometry.dispose());
  puff.dispose();
  const clouds = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
    color: "#ffffff", emissive: "#e3f1f6", emissiveIntensity: 0.5, flatShading: true, roughness: 1, metalness: 0,
  }));
  clouds.name = "low-poly-clouds";
  clouds.raycast = () => {};
  return clouds;
}
