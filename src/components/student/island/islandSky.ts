import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { seededRandom } from "./placement";

// Background clouds around the personal island. Everything is measured in
// units of the island's bounding radius, so the same numbers fit any piece.
//
// The layer is held in the camera's frame (screen right / screen up / toward
// the viewer) and pushed back behind the island, so at every orbit angle,
// elevation and zoom the island itself hides any cloud behind it — the meadow
// is never covered — and screen height stays above the bottom toolbar.
export const CLOUD_SETTINGS = {
  seed: 29,
  // 6–10 reads as a sky without crowding the frame.
  count: 8,
  // Drift to screen right, island radii per second (a crossing takes minutes).
  speed: 0.01,
  // Orbiting slides the layer sideways by this much per radian, for a little
  // parallax; farther clouds slide and drift less.
  parallax: 0.35,
  // Screen height of a cloud's centre, island radii from the island centre.
  // The island's bottom sits near -0.6, so -0.3 keeps clear of the toolbar;
  // above ~0.6 a cloud runs into the canvas top and the header badges.
  height: [-0.3, 0.55] as const,
  // Half width of the drift band. Past either end a cloud wraps round; it
  // shrinks away over the last `fade` of the band so the wrap never pops.
  spread: 1.9,
  fade: 0.18,
  // Keep the band's middle clear of cloud centres at low heights, so clouds
  // frame the island's sides rather than sitting behind its base.
  clearing: { halfWidth: 0.55, below: 0.35 },
  // Behind the island centre, island radii. Anything past 1 is fully behind.
  distance: [1.15, 1.9] as const,
  // Radius of the main puff, island radii, and puffs per cloud.
  size: [0.07, 0.13] as const,
  puffs: [4, 7] as const,
  // Nearest → farthest. Distance is split into `layers` tiers, one draw call each.
  opacity: [0.95, 0.5] as const,
  layers: 3,
  color: "#ffffff",
  shade: "#c9dcee",
};

type Puff = { offset: THREE.Vector3; scale: THREE.Vector3 };
type Cloud = { across: number; height: number; depth: number; layer: number; puffs: Puff[]; slot: number };

// One chunky puff, white on top easing into a pale blue underside, so the
// faceted shading reads as a toy cloud rather than a grey ball.
function createPuffGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const top = new THREE.Color(CLOUD_SETTINGS.color), under = new THREE.Color(CLOUD_SETTINGS.shade), tint = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    tint.copy(under).lerp(top, THREE.MathUtils.smoothstep(position.getY(i), -0.7, 0.4));
    colors.set([tint.r, tint.g, tint.b], i * 3);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.deleteAttribute("uv");
  return geometry;
}

function createCloudLayer(islandBox: THREE.Box3) {
  const settings = CLOUD_SETTINGS;
  const random = seededRandom(settings.seed);
  const radius = islandBox.getBoundingSphere(new THREE.Sphere()).radius;
  const between = (range: readonly [number, number]) => range[0] + random() * (range[1] - range[0]);

  const clouds: Cloud[] = [];
  for (let n = 0; n < settings.count; n++) {
    // Evenly spread along the band with jitter, so clouds never bunch up.
    const across = -settings.spread + ((n + 0.2 + random() * 0.6) / settings.count) * settings.spread * 2;
    let height = between(settings.height);
    if (Math.abs(across) < settings.clearing.halfWidth) height = Math.max(height, settings.clearing.below);
    const depth = between(settings.distance);
    const layer = Math.min(settings.layers - 1, Math.floor(((depth - settings.distance[0]) / (settings.distance[1] - settings.distance[0])) * settings.layers));
    const size = between(settings.size) * radius;
    const count = settings.puffs[0] + Math.floor(random() * (settings.puffs[1] - settings.puffs[0] + 1));
    // A broad middle puff flanked by smaller, lower ones.
    const puffs: Puff[] = Array.from({ length: count }, (_, i) => {
      const side = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
      const r = size * (1 - Math.abs(side) * 0.45) * (0.85 + random() * 0.3);
      return {
        offset: new THREE.Vector3(side * size * 1.35, r * 0.35 - Math.abs(side) * size * 0.25 + (random() - 0.5) * size * 0.2, (random() - 0.5) * size * 0.6),
        scale: new THREE.Vector3(r, r * 0.72, r * 0.85),
      };
    });
    clouds.push({ across, height, depth, layer, puffs, slot: 0 });
  }

  const geometry = createPuffGeometry();
  const group = new THREE.Group();
  group.name = "low-poly-clouds";
  const meshes = Array.from({ length: settings.layers }, (_, layer) => {
    const members = clouds.filter((cloud) => cloud.layer === layer);
    let slot = 0;
    for (const cloud of members) { cloud.slot = slot; slot += cloud.puffs.length; }
    const f = settings.layers === 1 ? 0 : layer / (settings.layers - 1);
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 1, metalness: 0, fog: false,
      // Enough self-light that the warm sun only warms the tops a little.
      emissive: "#eaf3fa", emissiveIntensity: 0.45,
      transparent: true, opacity: THREE.MathUtils.lerp(settings.opacity[0], settings.opacity[1], f),
    });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, slot));
    mesh.count = slot;
    mesh.name = `cloud-layer-${layer + 1}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.excludeFromRaycast = true;
    mesh.raycast = () => {};
    // Instances move every frame; skip the stale bounds check.
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Far layers draw first so nearer clouds blend over them.
    mesh.renderOrder = -layer;
    group.add(mesh);
    return mesh;
  });

  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), identity = new THREE.Quaternion();
  const span = settings.spread * 2;
  function layout(seconds: number, orbit: number) {
    for (const cloud of clouds) {
      // Farther clouds drift and slide less.
      const near = settings.distance[0] / cloud.depth;
      const raw = cloud.across + (seconds * settings.speed - orbit * settings.parallax) * near;
      const across = THREE.MathUtils.euclideanModulo(raw + settings.spread, span) - settings.spread;
      const grow = THREE.MathUtils.smoothstep(settings.spread - Math.abs(across), 0, settings.fade);
      for (const [i, puff] of cloud.puffs.entries()) {
        position.set(across * radius, cloud.height * radius, -cloud.depth * radius).addScaledVector(puff.offset, grow);
        matrix.compose(position, identity, scale.copy(puff.scale).multiplyScalar(Math.max(grow, 1e-4)));
        meshes[cloud.layer].setMatrixAt(cloud.slot + i, matrix);
      }
    }
    meshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
  }
  layout(0, 0);

  const toTarget = new THREE.Vector3();
  let orbit = 0, lastAzimuth: number | null = null;
  // Call on every rendered frame. Returns true while the clouds are moving.
  function update(now: number, camera: THREE.Camera, target: THREE.Vector3, still: boolean) {
    group.position.copy(target);
    group.quaternion.copy(camera.quaternion);
    // Unwrapped orbit angle, so a full turn does not jump the parallax.
    toTarget.subVectors(camera.position, target);
    const azimuth = Math.atan2(toTarget.x, toTarget.z);
    if (lastAzimuth !== null) orbit += THREE.MathUtils.euclideanModulo(azimuth - lastAzimuth + Math.PI, Math.PI * 2) - Math.PI;
    lastAzimuth = azimuth;
    layout(still ? 0 : now / 1000, orbit);
    return !still;
  }

  return { group, update };
}

// The classroom preview keeps its fixed clusters below the assembled island.
const CLASSROOM_CLOUDS = [
  { across: 0, depth: 0, y: -15, size: 5 },
  { across: -34, depth: 18, y: -13, size: 4.2 },
  { across: 36, depth: -14, y: -12, size: 4.6 },
  { across: -62, depth: -22, y: -6, size: 4 },
  { across: 60, depth: 20, y: -9, size: 3.6 },
];

function createClassroomClouds() {
  const random = seededRandom(91);
  const puff = new THREE.IcosahedronGeometry(1, 1);
  const clouds = new THREE.Group();
  CLASSROOM_CLOUDS.forEach((spot, clusterIndex) => {
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
  return { group: clouds, update: () => false };
}

// Low-poly clouds, kept out of the island camera-fit box (the caller measures
// the island before adding them).
export function createIslandSky(classroom: boolean, islandBox: THREE.Box3) {
  return classroom ? createClassroomClouds() : createCloudLayer(islandBox);
}
