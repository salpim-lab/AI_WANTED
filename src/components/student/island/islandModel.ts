import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createTerrainGeometry } from "./islandTerrain";
import { createPuzzleShape, NATURAL_DECORATIONS, SURFACE_Y, TILE_SIZE } from "./puzzleGeometry";
import type { GiftKind, PuzzleEdges } from "./types";

// The terrain hangs ~13% of a tile below the grass; the shadow catcher floats a
// little further down so the island still reads as a small floating diorama.
export const ISLAND_SHADOW_Y = SURFACE_Y - TILE_SIZE * 0.2;

// Grass cap, soil sliver, rock body and cliff boulders share one vertex-coloured
// flat-shaded mesh: a single draw call per island.
function createTerrain(shape: THREE.Shape, seed: number) {
  const terrain = new THREE.Mesh(
    createTerrainGeometry(shape, { tileSize: TILE_SIZE, surfaceY: SURFACE_Y, seed }),
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, metalness: 0, roughness: 0.92 }),
  );
  terrain.castShadow = true;
  terrain.receiveShadow = true;
  terrain.name = "low-poly-grass-soil-rock-base";
  return terrain;
}

class Sculpt {
  group = new THREE.Group();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private ball = new THREE.SphereGeometry(1, 12, 9);
  private box = new RoundedBoxGeometry(1, 1, 1, 2, 0.09);
  private cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);

  material(color: string) {
    if (!this.materials.has(color)) {
      this.materials.set(color, new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 0.88 }));
    }
    return this.materials.get(color)!;
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

function createNaturalDetails() {
  const sculpt = new Sculpt();

  for (const [index, detail] of NATURAL_DECORATIONS.entries()) {
    const y = SURFACE_Y;
    if (detail.kind === "grass") {
      const bladeColors = ["#668b3f", "#789c49", "#86a954"];
      for (let blade = 0; blade < 7; blade++) {
        const angle = blade * 2.399963 + index * 0.61;
        const distance = blade % 3 * 0.075;
        const height = 0.22 + (blade % 4) * 0.045;
        sculpt.rod(
          bladeColors[(blade + index) % bladeColors.length],
          [detail.x + Math.cos(angle) * distance, y + height / 2, detail.z + Math.sin(angle) * distance],
          [0.022, height, 0.022],
          [Math.sin(angle) * 0.2, 0, Math.cos(angle) * 0.2],
        );
      }
    }

    if (detail.kind === "flower") {
      const petalColors = ["#f3d8d2", "#f1e7bd", "#d7c9e8"];
      sculpt.rod("#668b3f", [detail.x, y + 0.18, detail.z], [0.018, 0.36, 0.018]);
      for (let petal = 0; petal < 5; petal++) {
        const angle = petal * Math.PI * 2 / 5;
        sculpt.sphere(
          petalColors[index % petalColors.length],
          [detail.x + Math.cos(angle) * 0.09, y + 0.39, detail.z + Math.sin(angle) * 0.09],
          [0.08, 0.035, 0.06],
          [0, -angle, 0],
        );
      }
      sculpt.sphere("#e7b94b", [detail.x, y + 0.405, detail.z], [0.055, 0.045, 0.055]);
    }

    if (detail.kind === "rock") {
      const rockColors = ["#a6a18c", "#b7ad91", "#92998a"];
      sculpt.sphere(
        rockColors[index % rockColors.length],
        [detail.x, y + 0.16, detail.z],
        [0.34 + index % 2 * 0.08, 0.19 + index % 3 * 0.035, 0.28],
        [0.08 * (index % 3), index * 0.37, -0.07],
      );
      if (index % 2 === 0) {
        sculpt.sphere(
          "#8f9781",
          [detail.x + 0.27, y + 0.09, detail.z + 0.12],
          [0.18, 0.11, 0.15],
          [0, index * 0.21, 0],
        );
      }
    }
  }

  const details = sculpt.finish();
  details.name = "sparse-natural-details";
  return details;
}

export function createIslandModel(edges: PuzzleEdges, seed = 17) {
  const shape = createPuzzleShape(edges);
  const outline = shape.getPoints(32);
  const group = new THREE.Group();
  group.name = "empty-puzzle-island";

  group.add(createTerrain(shape, seed));
  group.add(createNaturalDetails());

  const surface = new THREE.Mesh(
    new THREE.ShapeGeometry(shape, 32),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = SURFACE_Y;
  surface.name = "item-placement-surface";
  group.add(surface);

  return { group, surface, outline };
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

export function createChildCharacter(kind: GiftKind, holding: boolean) {
  const sculpt = new Sculpt();
  const skin = "#e8b98d";
  const shirt = "#f2c86f";
  const shorts = "#6687a0";
  const hair = "#4f3a30";

  sculpt.block(shirt, [0, 0.78, 0], [0.56, 0.64, 0.34]);
  sculpt.block(shorts, [0, 0.47, 0], [0.58, 0.22, 0.36]);
  sculpt.rod(skin, [-0.17, 0.25, 0], [0.075, 0.42, 0.075]);
  sculpt.rod(skin, [0.17, 0.25, 0], [0.075, 0.42, 0.075]);
  sculpt.block("#f4f0df", [-0.17, 0.07, 0.035], [0.23, 0.11, 0.38]);
  sculpt.block("#f4f0df", [0.17, 0.07, 0.035], [0.23, 0.11, 0.38]);
  sculpt.sphere(skin, [0, 1.34, 0], [0.35, 0.39, 0.34]);
  sculpt.sphere(hair, [0, 1.57, -0.02], [0.36, 0.19, 0.35]);
  sculpt.sphere(hair, [-0.27, 1.48, 0], [0.12, 0.18, 0.17]);
  sculpt.sphere(hair, [0.27, 1.48, 0], [0.12, 0.18, 0.17]);
  sculpt.sphere("#47372f", [-0.11, 1.36, 0.31], [0.027, 0.037, 0.018]);
  sculpt.sphere("#47372f", [0.11, 1.36, 0.31], [0.027, 0.037, 0.018]);
  sculpt.sphere("#d88f79", [0, 1.23, 0.33], [0.08, 0.025, 0.018]);

  if (holding) {
    sculpt.rod(skin, [-0.38, 0.88, 0.18], [0.07, 0.48, 0.07], [0.9, 0, -0.55]);
    sculpt.rod(skin, [0.38, 0.88, 0.18], [0.07, 0.48, 0.07], [0.9, 0, 0.55]);
  } else {
    sculpt.rod(skin, [-0.38, 0.86, 0], [0.07, 0.48, 0.07], [0, 0, -0.26]);
    sculpt.rod(skin, [0.35, 1.13, 0], [0.07, 0.62, 0.07], [0, 0, -0.8]);
    sculpt.sphere(skin, [0.62, 1.38, 0], [0.095, 0.095, 0.095]);
  }

  const character = sculpt.finish();
  character.name = holding ? "child-holding-item" : "child-waving";
  if (holding) {
    const gift = createGiftModel(kind);
    gift.scale.setScalar(0.78);
    gift.position.set(0, 0.78, 0.45);
    character.add(gift);
  }
  return character;
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
