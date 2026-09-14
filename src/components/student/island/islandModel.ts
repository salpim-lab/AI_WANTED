import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createGardenPath, createPuzzleShape, FLOWER_BEDS, insideOutline, SURFACE_Y } from "./puzzleGeometry";
import type { GiftKind, PuzzleEdges } from "./types";

function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Small sculpted primitives are merged by material: detailed, real geometry
// without a draw call for every leaf, roof tile or blade of grass.
class Sculpt {
  group = new THREE.Group();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private ball = new THREE.SphereGeometry(1, 10, 7);
  private box = new RoundedBoxGeometry(1, 1, 1, 2, 0.09);
  private cylinder = new THREE.CylinderGeometry(1, 1, 1, 9);

  material(color: string) {
    if (!this.materials.has(color)) this.materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.88 }));
    return this.materials.get(color)!;
  }

  mesh(geometry: THREE.BufferGeometry, color: string, p: number[], s = [1, 1, 1], r = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry, this.material(color));
    mesh.position.set(p[0], p[1], p[2]);
    mesh.scale.set(s[0], s[1], s[2]);
    mesh.rotation.set(r[0], r[1], r[2]);
    this.group.add(mesh);
    return mesh;
  }

  sphere(color: string, p: number[], s: number[], r?: number[]) { return this.mesh(this.ball, color, p, s, r); }
  block(color: string, p: number[], s: number[], r?: number[]) { return this.mesh(this.box, color, p, s, r); }
  rod(color: string, p: number[], s: number[], r?: number[]) { return this.mesh(this.cylinder, color, p, s, r); }

  finish() {
    this.group.updateMatrixWorld(true);
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const originals = new Set<THREE.BufferGeometry>([this.ball, this.box, this.cylinder]);
    for (const object of this.group.children) {
      const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      originals.add(mesh.geometry);
      let geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      if (geometry.index) { const old = geometry; geometry = geometry.toNonIndexed(); old.dispose(); }
      // Normal/position/uv are shared by all sculpted primitives.
      geometry.deleteAttribute("tangent");
      const bucket = buckets.get(mesh.material) ?? [];
      bucket.push(geometry);
      buckets.set(mesh.material, bucket);
    }
    this.group.clear();
    for (const [material, geometries] of buckets) {
      const merged = mergeGeometries(geometries, false);
      geometries.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    originals.forEach((g) => g.dispose());
    return this.group;
  }
}

function tree(s: Sculpt, x: number, z: number, size: number, rand: () => number) {
  const y = SURFACE_Y;
  s.rod("#916039", [x, y + size * 0.53, z], [size * 0.12, size * 1.06, size * 0.12], [0, 0, -0.07]);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    s.sphere("#916039", [x + Math.cos(a) * size * 0.12, y + 0.07, z + Math.sin(a) * size * 0.12], [size * 0.22, 0.1, 0.1], [0, -a, 0]);
  }
  s.rod("#916039", [x + size * 0.18, y + size * 0.84, z], [size * 0.065, size * 0.7, size * 0.065], [0, 0, -0.65]);
  s.sphere("#557e30", [x, y + size * 1.35, z], [size * 0.68, size * 0.64, size * 0.64]);
  const colors = ["#719c39", "#85aa3e", "#94b949", "#628d35", "#a4be4a"];
  for (let i = 0; i < 115; i++) {
    const v = 1 - 2 * (i + 0.5) / 115;
    const a = i * 2.399963;
    const radius = Math.sqrt(1 - v * v);
    const px = Math.cos(a) * radius, pz = Math.sin(a) * radius;
    s.sphere(colors[Math.floor(rand() * colors.length)],
      [x + px * size * 0.63, y + size * (1.35 + v * 0.58), z + pz * size * 0.61],
      [size * 0.14, size * 0.24, size * 0.10], [pz * 0.65, a, -px * 0.65]);
  }
}

function flower(s: Sculpt, x: number, z: number, color: string, size = 1) {
  const y = SURFACE_Y + 0.11 * size;
  s.rod("#668638", [x, y, z], [0.012 * size, 0.22 * size, 0.012 * size]);
  s.sphere("#709a3c", [x - 0.04 * size, y - 0.025, z], [0.08 * size, 0.025 * size, 0.035 * size], [0, 0, -0.5]);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    s.sphere(color, [x + Math.cos(a) * 0.065 * size, y + 0.11 * size, z + Math.sin(a) * 0.065 * size], [0.059 * size, 0.025 * size, 0.037 * size], [0, -a, 0]);
  }
  s.sphere("#efbf43", [x, y + 0.125 * size, z], [0.037 * size, 0.024 * size, 0.037 * size]);
}

function cottage(s: Sculpt, roofColor: string) {
  const x = -0.94, z = -1.03, y = SURFACE_Y;
  s.block("#e9ddba", [x, y + 0.55, z], [1.1, 1.1, 0.95]);
  const gable = new THREE.Shape();
  gable.moveTo(-0.55, 0); gable.lineTo(0.55, 0); gable.lineTo(0, 0.6); gable.closePath();
  s.mesh(new THREE.ExtrudeGeometry(gable, { depth: 0.95, bevelEnabled: false }), "#e9ddba", [x, y + 1.05, z - 0.475]);
  for (const side of [-1, 1]) {
    s.block("#b76532", [x + side * 0.32, y + 1.34, z], [0.93, 0.105, 1.24], [0, 0, -side * 0.75]);
    for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) {
      const dx = 0.08 + row * 0.142;
      s.block((row + col) % 3 ? roofColor : "#d88b45", [x + side * dx, y + 1.70 - dx * 0.94, z - 0.53 + col * 0.177], [0.23, 0.095, 0.169], [0, 0, -side * 0.75]);
    }
  }
  for (let i = 0; i < 8; i++) s.sphere(roofColor, [x, y + 1.75, z - 0.57 + i * 0.16], [0.10, 0.085, 0.1]);
  s.block("#e5d2a5", [x + 0.26, y + 1.76, z - 0.28], [0.22, 0.66, 0.24]);
  s.block("#efe2c0", [x + 0.26, y + 2.09, z - 0.28], [0.31, 0.12, 0.32]);
  s.block("#72614a", [x + 0.26, y + 2.156, z - 0.28], [0.18, 0.015, 0.19]);
  const front = z + 0.488;
  s.block("#b7874f", [x, y + 0.36, front + 0.015], [0.48, 0.73, 0.09]);
  s.sphere("#b7874f", [x, y + 0.70, front + 0.016], [0.24, 0.24, 0.048]);
  s.block("#885d38", [x, y + 0.33, front + 0.065], [0.35, 0.66, 0.02]);
  s.sphere("#885d38", [x, y + 0.64, front + 0.063], [0.177, 0.19, 0.015]);
  for (let i = -1; i <= 1; i++) s.block("#ba8a51", [x + i * 0.10, y + 0.32, front + 0.08], [0.012, 0.62, 0.012]);
  s.sphere("#594d3b", [x + 0.11, y + 0.34, front + 0.103], [0.033, 0.033, 0.025]);
  s.block("#d5c8a5", [x, y + 0.035, front + 0.22], [0.65, 0.1, 0.28]);
  s.block("#e3d6b4", [x, y + 0.075, front + 0.10], [0.59, 0.14, 0.20]);
  s.sphere("#ae824a", [x, y + 1.16, front + 0.02], [0.16, 0.16, 0.055]);
  s.sphere("#709da0", [x, y + 1.16, front + 0.055], [0.119, 0.119, 0.025]);
  s.block("#e4c794", [x, y + 1.16, front + 0.08], [0.025, 0.24, 0.025]);
  s.block("#e4c794", [x, y + 1.16, front + 0.08], [0.24, 0.025, 0.025]);
  s.block("#aa804f", [x - 0.558, y + 0.56, z], [0.065, 0.42, 0.37]);
  s.block("#739a99", [x - 0.60, y + 0.56, z], [0.02, 0.31, 0.26]);
  s.block("#e4c794", [x - 0.62, y + 0.56, z], [0.02, 0.31, 0.025]);
  s.block("#e4c794", [x - 0.62, y + 0.56, z], [0.02, 0.025, 0.28]);
  for (let i = 0; i < 4; i++) s.block("#b98b4d", [-1.8 + i * 0.30, y + 0.18, -0.07], [0.09, 0.4, 0.09]);
  for (const dy of [0.10, 0.27]) s.block("#c79959", [-1.35, y + dy, -0.07], [0.96, 0.075, 0.055]);
}

export function createIslandModel(edges: PuzzleEdges, seed = 17, detailed = true, roofColor = "#cb763b") {
  const s = new Sculpt();
  const rand = random(seed);
  const shape = createPuzzleShape(edges);
  const points = shape.getPoints(28);
  const soil = new THREE.ExtrudeGeometry(shape, { depth: 0.65, bevelEnabled: true, bevelThickness: 0.085, bevelSize: 0.07, bevelSegments: 3, steps: 1, curveSegments: 22 });
  s.mesh(soil, "#bb7847", [0, 0.07, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]);
  const grass = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.065, bevelSize: 0.065, bevelSegments: 3, curveSegments: 22 });
  s.mesh(grass, "#90ad4e", [0, 0.7, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]);

  // A winding sandy path through the middle, with a broad free lawn in front.
  const path = createGardenPath();
  s.mesh(new THREE.ShapeGeometry(path, 28), "#d9bd7e", [0, SURFACE_Y + 0.006, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]);
  const pathPoints = path.getPoints(28);

  cottage(s, roofColor);
  tree(s, -1.92, -1.4, 1.07, rand);
  tree(s, 1.65, -1.65, 0.91, rand);
  tree(s, 2, 0.7, 0.55, rand);

  // Pond: shallow basin, water surface, rim stones and lily pads.
  s.sphere("#b9b28b", [1.05, SURFACE_Y + 0.01, 0.15], [0.73, 0.055, 0.91]);
  s.sphere("#68b7b4", [1.05, SURFACE_Y + 0.027, 0.15], [0.65, 0.04, 0.83]);
  s.sphere("#8acac2", [0.9, SURFACE_Y + 0.054, 0.15], [0.29, 0.008, 0.54]);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    const size = 0.09 + rand() * 0.08;
    s.sphere(i % 3 ? "#c9c4a6" : "#a5aa8b", [1.05 + Math.cos(a) * 0.71, SURFACE_Y + size * 0.5, 0.15 + Math.sin(a) * 0.88], [size, size * 0.67, size * 0.85], [rand(), rand(), rand()]);
  }
  for (const [x, z] of [[1.32, -0.29], [1.45, -0.17], [0.86, 0.57]]) {
    s.sphere("#86a447", [x, SURFACE_Y + 0.074, z], [0.12, 0.013, 0.09]);
  }
  for (const [x, z] of [[0.44, 0.61], [1.45, -0.64], [1.73, 0.53]]) {
    for (let i = 0; i < 6; i++) s.sphere(i % 2 ? "#76973b" : "#a0b843", [x + (rand() - 0.5) * 0.15, SURFACE_Y + 0.16, z + (rand() - 0.5) * 0.15], [0.025, 0.16 + rand() * 0.12, 0.028], [(rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.7]);
  }

  for (const [x, z] of FLOWER_BEDS) {
    for (let i = 0; i < 8; i++) {
      const bx = x + (rand() - 0.5) * 0.45, bz = z + (rand() - 0.5) * 0.38;
      s.sphere(i % 2 ? "#799e3d" : "#6b8f34", [bx, SURFACE_Y + 0.09, bz], [0.14, 0.12 + rand() * 0.12, 0.13]);
      flower(s, bx, bz, ["#f4edd2", "#eaaaad", "#e6bf4c"][i % 3], 0.8 + rand() * 0.7);
    }
  }
  for (let i = 0; i < (detailed ? 1550 : 240); i++) {
    const x = (rand() - 0.5) * 6.5, z = (rand() - 0.5) * 6.5;
    if (!insideOutline(x, z, points) || insideOutline(x, z, pathPoints)) continue;
    if (x > -1.6 && x < -0.35 && z > -1.65 && z < -0.5) continue;
    if (((x - 1.05) / 0.83) ** 2 + ((z - 0.15) / 1.0) ** 2 < 1) continue;
    const color = ["#a2b957", "#b0c369", "#7f9f41", "#91ae4b"][i % 4];
    s.sphere(color, [x, SURFACE_Y + 0.016, z], [0.018 + rand() * 0.018, 0.016 + rand() * 0.036, 0.018], [rand() * 0.5, rand() * 3, rand() * 0.4]);
    if (i % 33 === 0) flower(s, x, z, "#f4edd2", 0.4);
  }
  for (let i = 0; i < points.length; i += detailed ? 6 : 20) {
    const p = points[i];
    const size = 0.025 + rand() * 0.052;
    s.sphere(i % 3 ? "#cba779" : "#c7bc99", [p.x * 1.013, 0.17 + rand() * 0.39, -p.y * 1.013], [size, size * 0.8, size * 0.67]);
  }
  const group = s.finish();
  group.name = "puzzle-island";
  const surface = new THREE.Mesh(new THREE.ShapeGeometry(shape, 28), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = SURFACE_Y;
  surface.name = "item-placement-surface";
  group.add(surface);
  return { group, surface, outline: points };
}

export function createGiftModel(kind: GiftKind) {
  const s = new Sculpt();
  s.rod("#be8250", [0, 0.1, 0], [0.18, 0.2, 0.18]);
  s.rod("#d19c64", [0, 0.2, 0], [0.205, 0.065, 0.205]);
  s.rod("#6d5639", [0, 0.237, 0], [0.165, 0.008, 0.165]);
  if (kind === "sprout") {
    s.rod("#618348", [0, 0.41, 0], [0.022, 0.36, 0.022]);
    s.sphere("#90b45e", [-0.12, 0.47, 0], [0.20, 0.07, 0.10], [0, 0.2, -0.5]);
    s.sphere("#719b49", [0.12, 0.58, 0], [0.18, 0.06, 0.10], [0, -0.2, 0.5]);
  } else if (kind === "flower") {
    s.rod("#618348", [0, 0.45, 0], [0.025, 0.43, 0.025]);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      s.sphere("#eaaaad", [Math.cos(a) * 0.13, 0.68 + Math.sin(a) * 0.13, 0], [0.105, 0.11, 0.06]);
    }
    s.sphere("#ecca60", [0, 0.68, 0.035], [0.084, 0.084, 0.058]);
  } else {
    s.rod("#a98b4d", [0, 0.45, 0], [0.021, 0.43, 0.021]);
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.12 : 0.25;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    star.closePath();
    s.mesh(new THREE.ExtrudeGeometry(star, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2 }), "#e8bc49", [0, 0.69, -0.04]);
  }
  return s.finish();
}

export function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      geometries.add(o.geometry);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => materials.add(m));
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
