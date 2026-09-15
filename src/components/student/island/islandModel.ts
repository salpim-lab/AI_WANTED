import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { chisel, createTerrainGeometry } from "./islandTerrain";
import { createIslandLayout, type IslandLayout } from "./placement";
import { createPuzzlePieceLayerGeometry, getPuzzleLayout, PUZZLE_PIECE_COUNT, PUZZLE_SEED } from "./puzzle";
import type { GiftKind } from "./types";

const FOLIAGE = ["#6E9A3C", "#7FA844", "#8FB94F", "#A6C962"];
const NEEDLES = ["#3F7A45", "#4C8A4C", "#5C9A55"];
const BARK = ["#8E5E3C", "#9E6B44"];
const STONE = ["#9B948A", "#8A8078", "#A89C8C", "#B0A596"];
const BLOSSOM = ["#F4ACAA", "#D8B1DF", "#FFF4E2", "#F6D477"];

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
function createNaturalDetails(layout: IslandLayout, showTree: boolean) {
  const sculpt = new Sculpt(createPalette(true));
  const random = layout.random(3);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const blade = new THREE.ConeGeometry(1, 1, 3).translate(0, 0.5, 0);
  const stem = new THREE.CylinderGeometry(1, 1, 1, 4).translate(0, 0.5, 0);
  const petal = new THREE.OctahedronGeometry(1, 0);
  const shards = [
    () => chisel(new THREE.IcosahedronGeometry(1, 0), random, 0.18),
    () => chisel(new THREE.DodecahedronGeometry(1, 0), random, 0.16),
  ];
  // Sink slightly so bases don't float where the meadow slopes.
  const ground = (x: number, z: number) => layout.heightAt(x, z) - 0.06;

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

  for (const detail of layout.decorations) {
    const { x, z, radius } = detail;
    const y = ground(x, z);
    if (detail.kind === "tree") {
      if (!showTree) continue;
      const s = radius / 2;
      const top = trunk(x, z, y, 3.0 * s, 0.34 * s);
      // A short branch stub gives the trunk a crooked, grown look.
      sculpt.mesh(new THREE.CylinderGeometry(0.06 * s, 0.12 * s, 0.9 * s, 5).translate(0, 0.45 * s, 0), pick(BARK),
        [x, y + 1.7 * s, z], [1, 1, 1], [0, random() * Math.PI, 0.9]);
      const lobes = 4 + Math.floor(random() * 2);
      for (let k = 0; k < lobes; k++) {
        const a = k / lobes * Math.PI * 2 + random() * 0.6;
        const size = (1.0 + random() * 0.35) * s;
        sculpt.mesh(pick(shards)(), pick(FOLIAGE),
          [top.x + Math.cos(a) * 0.85 * s, top.y + (random() - 0.3) * 0.5 * s, top.z + Math.sin(a) * 0.85 * s],
          [size, size * 0.85, size], [random(), random() * Math.PI, random()]);
      }
      sculpt.mesh(pick(shards)(), pick(FOLIAGE), [top.x, top.y + 0.75 * s, top.z], [1.05 * s, 0.9 * s, 1.05 * s], [random(), random(), 0]);
    }
    if (detail.kind === "pine") {
      if (!showTree) continue;
      const s = radius;
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
        tuft(x + Math.cos(a) * radius * 0.45, z + Math.sin(a) * radius * 0.45, 1.1 + random() * 0.3);
      }
    }
    if (detail.kind === "flower") {
      const color = pick(BLOSSOM.slice(0, 3));
      for (let k = 0; k < 4; k++) {
        const a = k * 2.4 + random();
        bloom(x + Math.cos(a) * radius * 0.5, z + Math.sin(a) * radius * 0.5, 0.45 + random() * 0.25, k === 3 ? pick(BLOSSOM) : color, 1.15);
      }
      tuft(x, z, 1);
    }
    if (detail.kind === "rock") {
      // Two or three chipped stones of clearly different sizes, huddled together.
      stone(x, z, radius * 0.8);
      const a = random() * Math.PI * 2;
      stone(x + Math.cos(a) * radius * 0.7, z + Math.sin(a) * radius * 0.7, radius * 0.45);
      if (random() < 0.7) stone(x + Math.cos(a + 2.2) * radius * 0.62, z + Math.sin(a + 2.2) * radius * 0.62, radius * 0.28);
    }
  }

  for (const piece of layout.scatter) {
    if (piece.kind === "tuft") tuft(piece.x, piece.z, piece.size);
    if (piece.kind === "bloom") bloom(piece.x, piece.z, 0.3 + piece.size * 0.12, BLOSSOM[piece.tone], 0.85);
    if (piece.kind === "pebble") stone(piece.x, piece.z, 0.2 * piece.size + (piece.tone % 2) * 0.12);
  }

  const details = sculpt.finish();
  details.name = "rim-garden";
  return details;
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

const PUZZLE_LAYERS = [
  { depth: 0.38, y: 0, color: "#a8d477" },
  { depth: 1.95, y: -0.38, color: "#b77a4c" },
  { depth: 4.55, y: -2.33, color: "#8d8176" },
] as const;

function createPuzzlePieceLayers(layout: IslandLayout, pieceIndex: number, color: string) {
  const group = new THREE.Group();
  group.name = `puzzle-piece-layers-${pieceIndex + 1}`;
  let surface: THREE.Mesh | null = null;
  PUZZLE_LAYERS.forEach((layer, index) => {
    const mesh = new THREE.Mesh(
      createPuzzlePieceLayerGeometry(layout, pieceIndex, layer.depth, PUZZLE_SEED),
      new THREE.MeshStandardMaterial({ color: index === 0 ? color : layer.color, roughness: 0.94, metalness: 0, flatShading: false }),
    );
    mesh.position.y = layout.surfaceY + 0.015 + layer.y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `puzzle-piece-${pieceIndex + 1}-${index === 0 ? "grass" : index === 1 ? "soil" : "rock"}`;
    group.add(mesh);
    if (index === 0) surface = mesh;
  });
  return { group, surface: surface! };
}

function addRoundedBottomRocks(group: THREE.Group, layout: IslandLayout) {
  const random = layout.random(91);
  const rockMaterial = new THREE.MeshStandardMaterial({ color: "#827b72", roughness: 0.98, metalness: 0 });
  for (let index = 0; index < 9; index++) {
    const angle = (index / 9 + random() * 0.08) * Math.PI * 2;
    const radius = layout.radiusAt(angle) * (0.58 + random() * 0.15);
    const size = 0.65 + random() * 0.6;
    const rock = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), rockMaterial);
    rock.position.set(Math.cos(angle) * radius, layout.surfaceY - 6.55 + random() * 0.35, Math.sin(angle) * radius);
    rock.scale.set(size * (1.25 + random() * 0.35), size * (0.55 + random() * 0.25), size * (0.9 + random() * 0.3));
    rock.rotation.set(random() * 0.35, random() * Math.PI, random() * 0.35);
    rock.castShadow = true;
    rock.receiveShadow = true;
    rock.name = "rounded-bottom-rock";
    group.add(rock);
  }
}

// The class view is one shared floating island assembled from deterministic
// puzzle pieces. Each geometry is cached by puzzle.ts, so switching views does
// not rebuild the Voronoi cells or their curved tabs.
export function createPuzzleAssemblyModel(seed = 17) {
  const layout = createIslandLayout(seed);
  const puzzle = getPuzzleLayout(layout, PUZZLE_SEED);
  const group = new THREE.Group();
  group.name = "assembled-half-island";
  const palette = ["#9fca70", "#a9d17a", "#96c47a", "#b1d581", "#8fbd6e"];
  const pieces = new THREE.Group();
  pieces.name = `puzzle-pieces-${PUZZLE_PIECE_COUNT}`;
  puzzle.pieces.forEach((piece, index) => {
    pieces.add(createPuzzlePieceLayers(layout, piece.index, palette[index % palette.length]).group);
  });
  group.add(pieces);
  const surface = pieces.children[0].children[0] as THREE.Mesh;
  addRoundedBottomRocks(group, layout);
  return { group, surface, layout, puzzle };
}

export function createPuzzlePieceModel(seed = 17, pieceIndex = 0) {
  const layout = createIslandLayout(seed);
  const puzzle = getPuzzleLayout(layout, PUZZLE_SEED);
  const group = new THREE.Group();
  group.name = `student-puzzle-piece-${pieceIndex + 1}`;
  const layers = createPuzzlePieceLayers(layout, pieceIndex, "#a5cc76");
  group.add(layers.group);
  const surface = layers.surface;
  return { group, surface, layout, puzzle };
}

export function createGiftModel(kind: GiftKind) {
  const sculpt = new Sculpt();
  sculpt.rod("#be8250", [0, 0.1, 0], [0.18, 0.2, 0.18]);
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
  return sculpt.finish();
}

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
