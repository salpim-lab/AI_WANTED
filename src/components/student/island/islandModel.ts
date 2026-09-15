import * as THREE from "three";
import { createRockCliff } from "./rockCliff";
import { createGrassSkirt, requireInsideOutline } from "./grassSkirt";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { chisel, createTerrainGeometry, STYLIZED_PALETTE, stylizedNoise } from "./islandTerrain";
import { createIslandLayout, type Decoration, type IslandLayout, type Scatter } from "./placement";
import { createPuzzlePieceLayerGeometry, getPuzzleLayout, getPuzzlePiecePolygon, getPuzzleTerrainRing, islandCoordinates, puzzlePieceContains, PUZZLE_PIECE_COUNT, PUZZLE_SEED, type PuzzleTerrainMode } from "./puzzle";
import { createLandscapeProps, type PropKey } from "./landscapeProps";
import { getPieceLandscape, SHORE_WIDTH, type PieceLandscape } from "./pieceLandscape";
import { createPieceTerrainMeshes, landscapeCapHoles } from "./pieceTerrainMesh";
import type { GiftKind } from "./types";

const FOLIAGE = ["#6E9A3C", "#7FA844", "#8FB94F", "#A6C962"];
const NEEDLES = ["#3F7A45", "#4C8A4C", "#5C9A55"];
const BARK = ["#8E5E3C", "#9E6B44"];
const STONE = ["#9B948A", "#8A8078", "#A89C8C", "#B0A596"];
const BLOSSOM = ["#F4ACAA", "#D8B1DF", "#FFF4E2", "#F6D477"];
const GRASS_BLADE_INSTANCES = 1680;

// The legacy full-island model remains available for other screens; the active
// puzzle view uses the smooth layered pieces below.
function createTerrain(layout: IslandLayout) {
  const terrain = new THREE.Mesh(
    createTerrainGeometry(layout),
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: false, metalness: 0, roughness: 0.92 }),
  );
  terrain.castShadow = true;
  terrain.receiveShadow = true;
  terrain.name = "floating-island-terrain";
  return terrain;
}

// One material per colour, shared by every part painted from the same palette.
export type Palette = (color: string) => THREE.MeshStandardMaterial;
export function createPalette(flatShading = false): Palette {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  return (color) => {
    if (!materials.has(color)) {
      materials.set(color, new THREE.MeshStandardMaterial({ color, flatShading, metalness: 0, roughness: 0.88 }));
    }
    return materials.get(color)!;
  };
}

export class Sculpt {
  group = new THREE.Group();
  private material: Palette;
  private ball = new THREE.SphereGeometry(1, 12, 9);
  private box = new RoundedBoxGeometry(1, 1, 1, 2, 0.09);
  private cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);

  constructor(palette: Palette = createPalette()) {
    this.material = palette;
  }

  mesh(geometry: THREE.BufferGeometry, color: string, position: number[], scale = [1, 1, 1], rotation = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry, this.material(color));
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    this.group.add(mesh);
    return mesh;
  }

  sphere(color: string, position: number[], scale: number[], rotation?: number[]) {
    return this.mesh(this.ball, color, position, scale, rotation);
  }

  block(color: string, position: number[], scale: number[], rotation?: number[]) {
    return this.mesh(this.box, color, position, scale, rotation);
  }

  rod(color: string, position: number[], scale: number[], rotation?: number[]) {
    return this.mesh(this.cylinder, color, position, scale, rotation);
  }

  finish() {
    this.group.updateMatrixWorld(true);
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const originals = new Set<THREE.BufferGeometry>([this.ball, this.box, this.cylinder]);

    for (const object of this.group.children) {
      const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      originals.add(mesh.geometry);
      let geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      if (geometry.index) {
        const indexed = geometry;
        geometry = geometry.toNonIndexed();
        indexed.dispose();
      }
      geometry.deleteAttribute("tangent");
      const bucket = buckets.get(mesh.material) ?? [];
      bucket.push(geometry);
      buckets.set(mesh.material, bucket);
    }

    this.group.clear();
    for (const [material, geometries] of buckets) {
      const merged = mergeGeometries(geometries, false);
      geometries.forEach((geometry) => geometry.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    originals.forEach((geometry) => geometry.dispose());
    return this.group;
  }
}

// Faceted, flat-shaded shore garden: chipped stones, cone pines, angular
// broadleaf crowns, bushes, blade tufts and diamond-petal flowers. Only the
// island outline stays soft; everything standing on it keeps sharp edges.
function sculptNaturalDetails(
  sculpt: Sculpt,
  layout: IslandLayout,
  showTree: boolean,
  decorations: readonly Pick<Decoration, "kind" | "x" | "z" | "radius">[],
  scatter: readonly Scatter[],
  randomSalt: number,
  surfaceY?: number,
) {
  const random = layout.random(randomSalt);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const blade = new THREE.ConeGeometry(1, 1, 3).translate(0, 0.5, 0);
  const stem = new THREE.CylinderGeometry(1, 1, 1, 4).translate(0, 0.5, 0);
  const petal = new THREE.OctahedronGeometry(1, 0);
  const shards = [
    () => chisel(new THREE.IcosahedronGeometry(1, 0), random, 0.18),
    () => chisel(new THREE.DodecahedronGeometry(1, 0), random, 0.16),
  ];
  // Legacy meadow slopes slightly; puzzle caps are exactly flat and their
  // decoration bases sit on that cap, away from the bevel ring.
  const ground = (x: number, z: number) => surfaceY ?? layout.heightAt(x, z) - 0.06;

  function stone(x: number, z: number, size: number) {
    const y = ground(x, z);
    sculpt.mesh(pick(shards)(), pick(STONE), [x, y + size * 0.42, z],
      [size * (0.95 + random() * 0.3), size * (0.6 + random() * 0.25), size * (0.85 + random() * 0.3)],
      [(random() - 0.5) * 0.3, random() * Math.PI, (random() - 0.5) * 0.3]);
  }

  function tuft(x: number, z: number, size: number) {
    const y = ground(x, z);
    const count = 4 + Math.floor(random() * 3);
    for (let k = 0; k < count; k++) {
      const a = k / count * Math.PI * 2 + random() * 0.8;
      const lean = 0.25 + random() * 0.35;
      sculpt.mesh(blade, pick(FOLIAGE), [x + Math.cos(a) * 0.1 * size, y, z + Math.sin(a) * 0.1 * size],
        [0.07 * size, (0.38 + random() * 0.24) * size, 0.05 * size],
        [Math.sin(a) * lean, random() * Math.PI, -Math.cos(a) * lean]);
    }
  }

  function bloom(x: number, z: number, height: number, color: string, size = 1) {
    const y = ground(x, z);
    const tilt = (random() - 0.5) * 0.2;
    sculpt.mesh(stem, "#5E8A3A", [x, y, z], [0.03 * size, height * size, 0.03 * size], [tilt, 0, tilt]);
    sculpt.mesh(petal, "#7FA844", [x + 0.08 * size, y + 0.12 * size, z], [0.13 * size, 0.03 * size, 0.06 * size], [0, random() * Math.PI, 0.3]);
    const top = y + height * size;
    const turn = random() * Math.PI;
    for (let k = 0; k < 5; k++) {
      const a = turn + k * Math.PI * 2 / 5;
      sculpt.mesh(petal, color, [x + Math.cos(a) * 0.12 * size, top, z + Math.sin(a) * 0.12 * size],
        [0.13 * size, 0.035 * size, 0.07 * size], [0, -a, 0.25]);
    }
    sculpt.mesh(chisel(new THREE.IcosahedronGeometry(1, 0), random, 0.1), "#F2C54E", [x, top + 0.03 * size, z], [0.065 * size, 0.05 * size, 0.065 * size]);
  }

  // A tapered, slightly leaning six-sided trunk; returns where its top ends up.
  function trunk(x: number, z: number, y: number, height: number, width: number) {
    const lean = new THREE.Euler((random() - 0.5) * 0.24, 0, (random() - 0.5) * 0.24);
    const shape = new THREE.CylinderGeometry(width * (0.55 + random() * 0.15), width, height, 6).translate(0, height / 2, 0);
    sculpt.mesh(shape, pick(BARK), [x, y, z], [1, 1, 1], [lean.x, random() * Math.PI, lean.z]);
    return new THREE.Vector3(0, height, 0).applyEuler(lean).add(new THREE.Vector3(x, y, z));
  }

  for (const detail of decorations) {
    const { x, z } = islandCoordinates.toWorld(detail);
    const { radius } = detail;
    const y = ground(x, z);
    if (detail.kind === "tree") {
      if (!showTree) continue;
      const s = radius / 2;
      // Narrow puzzle pieces need a small crown footprint; lift its familiar
      // faceted trunk and lobes in Y so height stays about 18% of piece W.
      const heightScale = surfaceY === undefined ? 1 : 1.8;
      const top = trunk(x, z, y, 3.0 * s * heightScale, 0.34 * s);
      // A short branch stub gives the trunk a crooked, grown look.
      sculpt.mesh(new THREE.CylinderGeometry(0.06 * s, 0.12 * s, 0.9 * s * heightScale, 5).translate(0, 0.45 * s * heightScale, 0), pick(BARK),
        [x, y + 1.7 * s * heightScale, z], [1, 1, 1], [0, random() * Math.PI, 0.9]);
      const lobes = 4 + Math.floor(random() * 2);
      for (let k = 0; k < lobes; k++) {
        const a = k / lobes * Math.PI * 2 + random() * 0.6;
        const size = (1.0 + random() * 0.35) * s;
        sculpt.mesh(pick(shards)(), pick(FOLIAGE),
          [top.x + Math.cos(a) * 0.85 * s, top.y + (random() - 0.3) * 0.5 * s * heightScale, top.z + Math.sin(a) * 0.85 * s],
          [size, size * 0.85 * heightScale, size], [random(), random() * Math.PI, random()]);
      }
      sculpt.mesh(pick(shards)(), pick(FOLIAGE), [top.x, top.y + 0.75 * s * heightScale, top.z], [1.05 * s, 0.9 * s * heightScale, 1.05 * s], [random(), random(), 0]);
    }
    if (detail.kind === "pine") {
      if (!showTree) continue;
      const s = radius * 1.45;
      const top = trunk(x, z, y, 1.1 * s, 0.2 * s);
      const tiers = 3 + Math.floor(random() * 2);
      for (let k = 0; k < tiers; k++) {
        const width = (1 - k / (tiers + 0.6)) * 1.05 * s;
        const tier = chisel(new THREE.ConeGeometry(width, 1.5 * s, 7).translate(0, 0.75 * s, 0), random, 0.06 * s);
        sculpt.mesh(tier, NEEDLES[k % NEEDLES.length],
          [top.x + (random() - 0.5) * 0.08, top.y - 0.35 * s + k * 0.78 * s, top.z + (random() - 0.5) * 0.08],
          [1, 1, 1], [0, random() * Math.PI, (random() - 0.5) * 0.08]);
      }
    }
    if (detail.kind === "bush") {
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI * 2 / 3 + random();
        const reach = k === 3 ? 0 : radius * 0.38;
        const size = radius * (k === 3 ? 0.62 : 0.5 + random() * 0.12);
        sculpt.mesh(pick(shards)(), FOLIAGE[k],
          [x + Math.cos(a) * reach, y + size * (k === 3 ? 1.05 : 0.7), z + Math.sin(a) * reach],
          [size, size * 0.8, size], [random(), random() * Math.PI, random()]);
      }
    }
    if (detail.kind === "grass") {
      for (let k = 0; k < 4; k++) {
        const a = k * 2.4 + random();
        const size = surfaceY === undefined ? 1.1 + random() * 0.3 : 0.5 + random() * 0.08;
        tuft(x + Math.cos(a) * radius * 0.45, z + Math.sin(a) * radius * 0.45, size);
      }
    }
    if (detail.kind === "flower") {
      const color = pick(BLOSSOM.slice(0, 3));
      for (let k = 0; k < 4; k++) {
        const a = k * 2.4 + random();
        bloom(x + Math.cos(a) * radius * 0.5, z + Math.sin(a) * radius * 0.5, 0.45 + random() * 0.25, k === 3 ? pick(BLOSSOM) : color, surfaceY === undefined ? 1.15 : 0.68);
      }
      tuft(x, z, surfaceY === undefined ? 1 : 0.5);
    }
    if (detail.kind === "rock") {
      // Two or three chipped stones of clearly different sizes, huddled together.
      stone(x, z, radius * 0.8);
      const a = random() * Math.PI * 2;
      stone(x + Math.cos(a) * radius * 0.7, z + Math.sin(a) * radius * 0.7, radius * 0.45);
      if (random() < 0.7) stone(x + Math.cos(a + 2.2) * radius * 0.62, z + Math.sin(a + 2.2) * radius * 0.62, radius * 0.28);
    }
  }

  for (const piece of scatter) {
    const point = islandCoordinates.toWorld(piece);
    if (piece.kind === "tuft") tuft(point.x, point.z, piece.size);
    if (piece.kind === "bloom") bloom(point.x, point.z, 0.3 + piece.size * 0.12, BLOSSOM[piece.tone], 0.85);
    if (piece.kind === "pebble") stone(point.x, point.z, 0.2 * piece.size + (piece.tone % 2) * 0.12);
  }

}

function createNaturalDetails(layout: IslandLayout, showTree: boolean) {
  const sculpt = new Sculpt(createPalette(true));
  sculptNaturalDetails(sculpt, layout, showTree, layout.decorations, layout.scatter, 3);
  const details = sculpt.finish();
  details.name = "rim-garden";
  return details;
}

function addCliffMoss(sculpt: Sculpt, layout: IslandLayout, pieceIndex: number, mode: PuzzleTerrainMode) {
  const piece = getPuzzleLayout(layout, PUZZLE_SEED).pieces[pieceIndex];
  const polygon = getPuzzlePiecePolygon(piece);
  const centre = polygon.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), { x: 0, z: 0 });
  centre.x /= polygon.length; centre.z /= polygon.length;
  const random = layout.random(1200 + pieceIndex);
  // Moss clusters sit in gaps between cliff stones, including the lower rows.
  for (let index = 0; index < 19; index++) {
    const ring = getPuzzleTerrainRing(layout, pieceIndex, "rock", mode, 0.12 + random() * 0.7, PUZZLE_SEED);
    const point = ring[Math.floor(random() * ring.length)].clone();
    point.x += (centre.x - point.x) * 0.12; point.z += (centre.z - point.z) * 0.12;
    const sx = 0.07 + random() * 0.06, sy = 0.06 + random() * 0.05, sz = 0.06 + random() * 0.05;
    const footprint = [new THREE.Vector3(point.x + sx, point.y, point.z + sz), new THREE.Vector3(point.x + sx, point.y, point.z - sz), new THREE.Vector3(point.x - sx, point.y, point.z + sz), new THREE.Vector3(point.x - sx, point.y, point.z - sz)];
    if (!footprint.every(p => puzzlePieceContains(piece, { x: p.x, z: p.z }))) continue;
    requireInsideOutline(footprint, piece, "Cliff moss");
    sculpt.mesh(new THREE.IcosahedronGeometry(1, 0), index % 2 ? "#6e9a3c" : "#7fa844", [point.x, point.y - 0.05, point.z], [sx, sy, sz], [random(), random(), random()]);
  }
}

function addPuzzleNaturalDetails(sculpt: Sculpt, layout: IslandLayout, pieceIndex: number, mode: PuzzleTerrainMode) {
  addCliffMoss(sculpt, layout, pieceIndex, mode);
}

export function createIslandModel(seed = 17, showTree = true) {
  const layout = createIslandLayout(seed);
  const group = new THREE.Group();
  group.name = "floating-island";
  // The terrain doubles as the placement surface; callers keep only meadow hits.
  const surface = createTerrain(layout);
  group.add(surface);
  group.add(createNaturalDetails(layout, showTree));
  return { group, surface, layout };
}

function createPuzzlePieceLayers(layout: IslandLayout, pieceIndex: number, mode: PuzzleTerrainMode) {
  const group = new THREE.Group();
  group.name = `puzzle-piece-layers-${pieceIndex + 1}`;
  const landscape = getPieceLandscape(layout, pieceIndex);
  // The meadow cap keeps the exact puzzle outline; ponds and brooks are holes
  // in its top face only.
  const geometry = createPuzzlePieceLayerGeometry(layout, pieceIndex, "grass", mode, PUZZLE_SEED, landscapeCapHoles(landscape));
  const palette = STYLIZED_PALETTE.grass;
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i), y = positions.getY(i);
    // Use one world-space field across all puzzle pieces. A per-piece seed
    // would make the cap triangles read as diagonal seams at assembly time.
    const noise = stylizedNoise(x, z, 0);
    const paletteIndex = noise > 0.22 ? 0 : noise < -0.24 ? Math.min(2, palette.length - 1) : 1;
    tint.set(palette[paletteIndex]).multiplyScalar(1 + noise * 0.035 + Math.sin(y * 0.75) * 0.012);
    colors[i * 3] = tint.r; colors[i * 3 + 1] = tint.g; colors[i * 3 + 2] = tint.b;
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.88, metalness: 0, flatShading: true, vertexColors: true });
  const meadow = new THREE.Mesh(geometry, material);
  meadow.castShadow = true;
  meadow.receiveShadow = true;
  meadow.name = `puzzle-piece-${pieceIndex + 1}-grass`;
  meadow.userData.surfaceKind = "meadow";
  // Placement surface: meadow, terraces, water and paths (not the fall).
  const surface = new THREE.Group();
  surface.name = `puzzle-piece-${pieceIndex + 1}-surface`;
  surface.add(meadow);
  const terrain = createPieceTerrainMeshes(landscape);
  [...terrain.children].forEach((child) => (child.userData.excludeFromRaycast ? group : surface).add(child));
  group.add(surface);
  group.add(createRockCliff(layout, pieceIndex, mode));
  group.add(createGrassSkirt(layout, pieceIndex, mode, material));
  return { group, surface, landscape };
}

// Grass never grows in water, on paths, stairs or under houses.
const BARE_GROUND = /^(house|shed|stairs|path|bridge|pool|waterfall)/;
function grassSurfaceAt(landscape: PieceLandscape, x: number, z: number) {
  if (landscape.water && landscape.water.sdf(x, z) < SHORE_WIDTH + 0.04) return null;
  if (landscape.blockers.some((b) => BARE_GROUND.test(b.id) && Math.hypot(b.x - x, b.z - z) < b.r)) return null;
  const surface = landscape.surfaceAt(x, z);
  // Only flat ground: skip the rounded terrace banks.
  const probe = 0.12;
  const flat = [[probe, 0], [-probe, 0], [0, probe], [0, -probe]].every(([dx, dz]) => Math.abs(landscape.surfaceAt(x + dx, z + dz) - surface) < 0.01);
  return flat ? surface : null;
}

function addInstancedGrass(group: THREE.Group, layout: IslandLayout, pieceIndices: number[], bladesPerPiece: number) {
  const geometry = new THREE.ConeGeometry(0.035, 0.34, 3).translate(0, 0.17, 0);
  const material = new THREE.MeshStandardMaterial({ color: "#7fb347", roughness: 0.88, metalness: 0 });
  const mesh = new THREE.InstancedMesh(geometry, material, bladesPerPiece * pieceIndices.length);
  mesh.name = "instanced-grass-blades"; mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.excludeFromRaycast = true;
  const helper = new THREE.Object3D();
  let instance = 0;
  for (const pieceIndex of pieceIndices) {
    const piece = getPuzzleLayout(layout, PUZZLE_SEED).pieces[pieceIndex];
    const polygon = getPuzzlePiecePolygon(piece);
    const landscape = getPieceLandscape(layout, pieceIndex);
    const random = layout.random(700 + pieceIndex);
    const bounds = polygon.reduce((box, point) => ({ minX: Math.min(box.minX, point.x), maxX: Math.max(box.maxX, point.x), minZ: Math.min(box.minZ, point.z), maxZ: Math.max(box.maxZ, point.z) }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    const limit = instance + bladesPerPiece;
    let attempts = 0;
    while (instance < limit && attempts++ < bladesPerPiece * 10) {
      const x = bounds.minX + random() * (bounds.maxX - bounds.minX), z = bounds.minZ + random() * (bounds.maxZ - bounds.minZ);
      if (!puzzlePieceContains(piece, { x, z })) continue;
      const surfaceY = grassSurfaceAt(landscape, x, z);
      if (surfaceY === null) continue;
      const clusterScale = 0.65 + random() * 0.7;
      for (let blade = 0; blade < 4 && instance < limit; blade++) {
        helper.position.set(x + (random() - 0.5) * 0.16, surfaceY, z + (random() - 0.5) * 0.16);
        helper.rotation.set((random() - 0.5) * 0.35, random() * Math.PI, (random() - 0.5) * 0.35);
        helper.scale.set(clusterScale * (0.8 + random() * 0.3), clusterScale * (0.8 + random() * 0.45), clusterScale * (0.8 + random() * 0.3));
        helper.updateMatrix();
        const bound = 0.04 * clusterScale;
        const footprint = [new THREE.Vector3(helper.position.x + bound, 0, helper.position.z + bound), new THREE.Vector3(helper.position.x + bound, 0, helper.position.z - bound), new THREE.Vector3(helper.position.x - bound, 0, helper.position.z + bound), new THREE.Vector3(helper.position.x - bound, 0, helper.position.z - bound)];
        if (!footprint.every(point => puzzlePieceContains(piece, { x: point.x, z: point.z }))) continue;
        requireInsideOutline(footprint, piece, "Top grass blade");
        mesh.setMatrixAt(instance++, helper.matrix);
      }
    }
  }
  mesh.count = instance; mesh.instanceMatrix.needsUpdate = true; group.add(mesh);
}

// The classroom preview shows 20 pieces from far away: pebbles, flowers and
// foam are sub-pixel there and every second bush is enough for the rim.
const PREVIEW_SKIP = new Set(["stone", "flower", "foam"]);
export function collectLandscapeProps(layout: IslandLayout, pieceIndices: number[]) {
  const props = pieceIndices.flatMap((index) => getPieceLandscape(layout, index).props);
  if (pieceIndices.length === 1) return props;
  let bush = 0;
  return props.filter((prop) => !PREVIEW_SKIP.has(prop.kind) && (prop.kind !== "bush" || bush++ % 2 === 0));
}

function addLandscapeProps(group: THREE.Group, layout: IslandLayout, pieceIndices: number[], library?: ReadonlyMap<PropKey, THREE.BufferGeometry>) {
  const props = createLandscapeProps(collectLandscapeProps(layout, pieceIndices), library);
  group.add(props);
  return props;
}

// The class view is one shared floating island assembled from deterministic
// puzzle pieces. Each geometry is cached by puzzle.ts, so switching views does
// not rebuild the Voronoi cells or their curved tabs.
export function createPuzzleAssemblyModel(seed = 17, library?: ReadonlyMap<PropKey, THREE.BufferGeometry>) {
  const layout = createIslandLayout(seed);
  const puzzle = getPuzzleLayout(layout, PUZZLE_SEED);
  const group = new THREE.Group();
  group.name = "assembled-half-island";
  const pieces = new THREE.Group();
  pieces.name = `puzzle-pieces-${PUZZLE_PIECE_COUNT}`;
  const surface = new THREE.Group();
  surface.name = "assembled-placement-surface";
  puzzle.pieces.forEach((piece) => {
    const layers = createPuzzlePieceLayers(layout, piece.index, "classroom");
    pieces.add(layers.group);
    // Re-parented: every piece's walkable top lives in one raycast group.
    surface.add(layers.surface);
  });
  group.add(pieces, surface);
  const garden = new Sculpt(createPalette(true));
  puzzle.pieces.forEach((piece) => addPuzzleNaturalDetails(garden, layout, piece.index, "classroom"));
  const details = garden.finish();
  details.name = "assembled-puzzle-garden";
  group.add(details);
  const indices = puzzle.pieces.map((piece) => piece.index);
  const props = addLandscapeProps(group, layout, indices, library);
  addInstancedGrass(group, layout, indices, typeof window !== "undefined" && window.innerWidth < 700 ? 160 : 360);
  return { group, surface, layout, puzzle, props, pieceIndices: indices };
}

export function createPuzzlePieceModel(seed = 17, pieceIndex = 0, library?: ReadonlyMap<PropKey, THREE.BufferGeometry>) {
  const layout = createIslandLayout(seed);
  const puzzle = getPuzzleLayout(layout, PUZZLE_SEED);
  const group = new THREE.Group();
  group.name = `student-puzzle-piece-${pieceIndex + 1}`;
  const layers = createPuzzlePieceLayers(layout, pieceIndex, "personal");
  group.add(layers.group);
  const garden = new Sculpt(createPalette(true));
  addPuzzleNaturalDetails(garden, layout, pieceIndex, "personal");
  const details = garden.finish();
  details.name = `puzzle-piece-${pieceIndex + 1}-garden`;
  group.add(details);
  const props = addLandscapeProps(group, layout, [pieceIndex], library);
  addInstancedGrass(group, layout, [pieceIndex], typeof window !== "undefined" && window.innerWidth < 700 ? 880 : GRASS_BLADE_INSTANCES);
  return { group, surface: layers.surface, layout, puzzle, props, pieceIndices: [pieceIndex], landscape: layers.landscape };
}

// Swap the prop instances for another model library (e.g. once GLBs load).
export function replaceLandscapeProps(group: THREE.Group, previous: THREE.Group, layout: IslandLayout, pieceIndices: number[], library: ReadonlyMap<PropKey, THREE.BufferGeometry>) {
  const parent = previous.parent ?? group;
  parent.remove(previous);
  disposeObject(previous);
  const next = createLandscapeProps(collectLandscapeProps(layout, pieceIndices), library);
  parent.add(next);
  return next;
}

export function createGiftModel(kind: GiftKind) {
  const sculpt = new Sculpt();
  const pot = sculpt.rod("#be8250", [0, 0.1, 0], [0.18, 0.2, 0.18]);
  sculpt.rod("#d19c64", [0, 0.2, 0], [0.205, 0.065, 0.205]);
  sculpt.rod("#6d5639", [0, 0.237, 0], [0.165, 0.008, 0.165]);

  if (kind === "sprout") {
    sculpt.rod("#618348", [0, 0.41, 0], [0.022, 0.36, 0.022]);
    sculpt.sphere("#90b45e", [-0.12, 0.47, 0], [0.2, 0.07, 0.1], [0, 0.2, -0.5]);
    sculpt.sphere("#719b49", [0.12, 0.58, 0], [0.18, 0.06, 0.1], [0, -0.2, 0.5]);
  } else if (kind === "flower") {
    sculpt.rod("#618348", [0, 0.45, 0], [0.025, 0.43, 0.025]);
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      sculpt.sphere("#eaaaad", [Math.cos(angle) * 0.13, 0.68 + Math.sin(angle) * 0.13, 0], [0.105, 0.11, 0.06]);
    }
    sculpt.sphere("#ecca60", [0, 0.68, 0.035], [0.084, 0.084, 0.058]);
  } else {
    sculpt.rod("#a98b4d", [0, 0.45, 0], [0.021, 0.43, 0.021]);
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const angle = Math.PI / 2 + i * Math.PI / 5;
      const radius = i % 2 ? 0.12 : 0.25;
      if (i === 0) star.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      else star.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    star.closePath();
    sculpt.mesh(
      new THREE.ExtrudeGeometry(star, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2 }),
      "#e8bc49",
      [0, 0.69, -0.04],
    );
  }
  const potBox = new THREE.Box3().setFromObject(pot);
  const model = sculpt.finish();
  model.userData.baseDiameter = Math.max(potBox.max.x - potBox.min.x, potBox.max.z - potBox.min.z);
  return model;
}

export const GIFT_MODEL_HEIGHT = 0.94;

export function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
