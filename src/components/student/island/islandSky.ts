import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ISLAND_SCALE, seededRandom } from "./placement";

// Cloud spots in the default camera's frame: `across` runs along the screen,
// `depth` toward the viewer, `y` is height. Kept below the meadow so they
// frame the hanging rock without hiding the placement area.
const ISLAND_CLOUDS = [
  { across: -18, depth: -12, y: -1.2, size: 3.4 },
  { across: 0, depth: -15, y: -1.8, size: 3.8 },
  { across: 18, depth: -12, y: -1.3, size: 3.2 },
  { across: -10, depth: -9, y: -2.7, size: 2.5 },
  { across: 9, depth: -10, y: -2.4, size: 2.7 },
  { across: -17, depth: 2, y: -3.8, size: 2.5 },
  { across: 17, depth: 1, y: -4, size: 2.4 },
  { across: 0, depth: 4, y: -4.5, size: 3.3 },
];
const CLASSROOM_CLOUDS = [
  { across: 0, depth: 0, y: -15, size: 5 },
  { across: -34, depth: 18, y: -13, size: 4.2 },
  { across: 36, depth: -14, y: -12, size: 4.6 },
  { across: -62, depth: -22, y: -6, size: 4 },
  { across: 60, depth: 20, y: -9, size: 3.6 },
];

// Low-poly cloud clusters, kept outside the island camera-fit box.
export function createIslandSky(classroom: boolean) {
  const random = seededRandom(classroom ? 91 : 29);
  const puff = new THREE.IcosahedronGeometry(1, 1);
  const clouds = new THREE.Group();
  const spots = classroom
    ? CLASSROOM_CLOUDS.map((spot) => ({ across: spot.across, depth: spot.depth, y: spot.y, size: spot.size }))
    : ISLAND_CLOUDS.map((spot) => ({ ...spot, across: spot.across * ISLAND_SCALE, depth: spot.depth * ISLAND_SCALE }));
  spots.forEach((spot, clusterIndex) => {
    const puffs: THREE.BufferGeometry[] = [];
    const center = new THREE.Vector3(spot.across, spot.y, spot.depth);
    // A broad middle puff flanked by smaller ones reads as a cloud from any side.
    for (const offset of [-1.1, -0.5, 0, 0.55, 1.15]) {
      const size = spot.size * (1 - Math.abs(offset) * 0.42) * (0.85 + random() * 0.3);
      const position = center.clone()
        .add(new THREE.Vector3(offset * spot.size, (random() - 0.5) * spot.size * 0.14, (random() - 0.5) * spot.size * 0.6))
        .setY(center.y + size * 0.22);
      puffs.push(puff.clone().scale(size, size * 0.62, size * 0.85).translate(position.x, position.y, position.z));
    }
    const merged = mergeGeometries(puffs);
    puffs.forEach((geometry) => geometry.dispose());
    if (!merged) return;
    const cloud = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
      color: "#ffffff", emissive: "#e3f1f6", emissiveIntensity: 0.5, flatShading: true,
      roughness: 1, metalness: 0, transparent: true, opacity: 0.78,
    }));
    cloud.name = `cloud-cluster-${clusterIndex + 1}`;
    cloud.raycast = () => {};
    clouds.add(cloud);
  });
  puff.dispose();
  clouds.name = "low-poly-clouds";
  // Personal cliff remains unobstructed at every orbit angle.
  clouds.visible = classroom;
  clouds.userData.cloudDrift = !classroom;
  return clouds;
}
