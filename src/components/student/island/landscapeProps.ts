import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { chisel } from "./islandTerrain";
import { seededRandom } from "./placement";
import type { PropKind, PropPlacement } from "./pieceLandscape";

// Every prop model is one vertex-coloured geometry in a shared unit
// convention (base at y = 0, door/front toward +Z). The landscape plan's
// scale vector maps that unit into the world, so procedural models and the
// imported GLB assets (islandAssets.ts) are interchangeable per key.
//
//   broadleaf/conifer  real size at scale 1 (≈2.7 / 3.0 tall)
//   bush/boulder/stone radius 1, height 1
//   stairs             x −0.5…0.5 wide, y 0…1 rise, low end at +Z
//   bridge             x −0.5…0.5 wide, z −0.5…0.5 long, deck ≈0.1–0.22
//   fence              one segment along X −0.5…0.5, 0.42 tall
//   house              real size, door toward +Z
export type PropKey = `${PropKind}:${number}`;
export const propKey = (kind: PropKind, variant: number): PropKey => `${kind}:${variant}`;

const BARK = "#8a5a36";
const WOOD = "#c48a55", WOOD_DARK = "#8e5e38", WOOD_LIGHT = "#d9a86c";
const BROADLEAF = [["#6dbb45", "#56a63c", "#8fd052"], ["#86c84b", "#6db343", "#a6d95a"], ["#5aa83f", "#468f37", "#78bf4a"]];
const CONIFER = [["#3f9a55", "#358a4a", "#4eaa5c"], ["#2f8a4f", "#27774a", "#3c9a58"], ["#a9c741", "#95b83a", "#bdd452"]];
const BUSH = [["#6cb846", "#58a63f"], ["#86c451", "#6db343"], ["#58a63f", "#4a9437"]];
const ROCK = { side: "#8b9097", dark: "#747a82", top: "#b0b4b8", moss: "#7fbf4a" };
const STONE = ["#b3aa9c", "#a39a8c", "#c4bcae"];
const FLOWERS = ["#f49ac0", "#fff6e8", "#ffd95a", "#c7a4f0"];

class ModelBuilder {
  private parts: THREE.BufferGeometry[] = [];
  private helper = new THREE.Object3D();

  add(source: THREE.BufferGeometry, color: THREE.ColorRepresentation, position: number[] = [0, 0, 0], scale: number[] = [1, 1, 1], rotation: number[] = [0, 0, 0]) {
    let geometry = source.index ? source.toNonIndexed() : source.clone();
    for (const name of Object.keys(geometry.attributes)) if (name !== "position") geometry.deleteAttribute(name);
    this.helper.position.fromArray(position);
    this.helper.scale.fromArray(scale);
    this.helper.rotation.set(rotation[0], rotation[1], rotation[2]);
    this.helper.updateMatrix();
    geometry = geometry.applyMatrix4(this.helper.matrix);
    const tint = new THREE.Color(color);
    const count = geometry.getAttribute("position").count;
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: count * 3 }, (_, i) => [tint.r, tint.g, tint.b][i % 3]), 3));
    this.parts.push(geometry);
    return this;
  }

  build() {
    const merged = mergeGeometries(this.parts, false)!;
    this.parts.forEach((part) => part.dispose());
    merged.computeVertexNormals();
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }
}

const box = (radius = 0.06) => new RoundedBoxGeometry(1, 1, 1, 1, radius);
const cube = new THREE.BoxGeometry(1, 1, 1);

// Recolour triangles by facing: pale tops, darker undersides, optional moss.
function shadeByFacing(geometry: THREE.BufferGeometry, top: string, side: string, under: string, moss?: string) {
  const position = geometry.getAttribute("position");
  const color = geometry.getAttribute("color");
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const tint = new THREE.Color();
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i); b.fromBufferAttribute(position, i + 1); c.fromBufferAttribute(position, i + 2);
    const ny = b.clone().sub(a).cross(c.clone().sub(a)).normalize().y;
    tint.set(moss && ny > 0.93 ? moss : ny > 0.45 ? top : ny < -0.3 ? under : side);
    for (let k = 0; k < 3; k++) color.setXYZ(i + k, tint.r, tint.g, tint.b);
  }
  color.needsUpdate = true;
  return geometry;
}

function fitUnit(geometry: THREE.BufferGeometry, radius = 1, height = 1) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const size = bounds.getSize(new THREE.Vector3());
  geometry.translate(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
  geometry.scale(radius * 2 / Math.max(size.x, size.z), height / size.y, radius * 2 / Math.max(size.x, size.z));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function broadleaf(variant: number) {
  const random = seededRandom(101 + variant);
  const palette = BROADLEAF[variant % BROADLEAF.length];
  const model = new ModelBuilder();
  model.add(new THREE.CylinderGeometry(0.1, 0.16, 1.3, 6).translate(0, 0.65, 0), BARK);
  model.add(new THREE.CylinderGeometry(0.04, 0.07, 0.55, 5).translate(0, 0.27, 0), BARK, [0.05, 0.85, 0], [1, 1, 1], [0, 0, -0.8]);
  const lobes = [[0, 1.95, 0, 0.78], [0.42, 1.6, 0.18, 0.56], [-0.38, 1.62, -0.2, 0.58], [0.1, 1.55, -0.45, 0.52], [-0.15, 1.58, 0.42, 0.5], [0.05, 2.35, 0.05, 0.5]];
  lobes.forEach(([x, y, z, r], k) => {
    const shape = chisel(new THREE.IcosahedronGeometry(1, 1), random, 0.09);
    model.add(shape, palette[k === 5 ? 2 : k % 2], [x, y, z], [r, r * 0.88, r], [random(), random() * 3, random()]);
  });
  return model.build();
}

function conifer(variant: number) {
  const random = seededRandom(211 + variant);
  const palette = CONIFER[variant % CONIFER.length];
  const model = new ModelBuilder();
  model.add(new THREE.CylinderGeometry(0.09, 0.13, 0.6, 6).translate(0, 0.3, 0), BARK);
  const tiers = 4;
  for (let k = 0; k < tiers; k++) {
    const width = 0.62 * (1 - k / (tiers + 0.8));
    const cone = chisel(new THREE.ConeGeometry(width, 0.95, 8, 1).translate(0, 0.47, 0), random, 0.025);
    model.add(cone, palette[k % 3], [0, 0.42 + k * 0.56, 0], [1, 1, 1], [0, random() * 3, 0]);
  }
  return model.build();
}

function bush(variant: number) {
  const random = seededRandom(307 + variant);
  const palette = BUSH[variant % BUSH.length];
  const model = new ModelBuilder();
  [[0, 0.5, 0, 0.62], [0.45, 0.38, 0.12, 0.46], [-0.4, 0.36, -0.1, 0.48], [0.05, 0.34, -0.45, 0.42], [-0.1, 0.33, 0.42, 0.42]].forEach(([x, y, z, r], k) => {
    model.add(chisel(new THREE.IcosahedronGeometry(1, 1), random, 0.08), palette[k % 2], [x, y, z], [r, r * 0.85, r]);
  });
  return fitUnit(model.build(), 1, 0.85);
}

function boulder(variant: number) {
  const random = seededRandom(401 + variant);
  const model = new ModelBuilder();
  if (variant === 0) {
    // Craggy peak: stacked, tapering chipped blocks with a leaning top.
    [[0, 0.18, 0, 1, 0.42], [0.08, 0.5, -0.05, 0.78, 0.4], [-0.05, 0.78, 0.04, 0.55, 0.36], [0.06, 1.02, 0, 0.32, 0.34]].forEach(([x, y, z, r, h]) => {
      model.add(chisel(new THREE.DodecahedronGeometry(1, 0), random, 0.16), ROCK.side, [x, y, z], [r, h, r * 0.9], [random() * 0.3, random() * 3, random() * 0.3]);
    });
    model.add(chisel(new THREE.ConeGeometry(0.22, 0.4, 5), random, 0.05), ROCK.side, [0.05, 1.28, 0], [1, 1, 1], [0.1, 0, 0.12]);
  } else {
    model.add(chisel(new THREE.DodecahedronGeometry(1, 0), random, 0.18), ROCK.side, [0, 0.5, 0], [1, 0.72, 0.92], [random() * 0.4, random() * 3, random() * 0.4]);
    model.add(chisel(new THREE.IcosahedronGeometry(1, 0), random, 0.14), ROCK.side, [0.45, 0.32, 0.25], [0.5, 0.45, 0.5], [random(), random(), random()]);
  }
  return fitUnit(shadeByFacing(model.build(), ROCK.top, ROCK.side, ROCK.dark, ROCK.moss));
}

function stone(variant: number) {
  const random = seededRandom(503 + variant);
  const shape = chisel(variant % 2 ? new THREE.DodecahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 0), random, 0.16);
  const model = new ModelBuilder().add(shape, STONE[variant % STONE.length], [0, 0, 0], [1, 0.7, 0.9]);
  return fitUnit(shadeByFacing(model.build(), "#d4ccbf", STONE[variant % STONE.length], "#8e8577"));
}

function stairs() {
  const model = new ModelBuilder();
  const steps = 5;
  for (let k = 0; k < steps; k++) {
    const depth = 1 / steps, top = (k + 1) / steps;
    model.add(box(0.03), k % 2 ? WOOD : WOOD_LIGHT, [0, top / 2, 0.5 - (k + 0.5) * depth], [0.9, top, depth * 1.02]);
  }
  const slope = Math.atan2(1, 1);
  for (const side of [-1, 1]) {
    model.add(box(0.02), WOOD_DARK, [side * 0.47, 0.55, 0], [0.08, 0.14, Math.SQRT2 * 1.02], [slope, 0, 0]);
    model.add(box(0.02), WOOD_DARK, [side * 0.47, 0.35, 0.42], [0.1, 0.7, 0.1]);
  }
  return model.build();
}

function bridge() {
  const model = new ModelBuilder();
  const planks = 16;
  const deck = (t: number) => 0.1 + 0.12 * Math.sin(Math.PI * t);
  for (let k = 0; k < planks; k++) {
    const t = (k + 0.5) / planks;
    const tilt = Math.atan(0.12 * Math.PI * Math.cos(Math.PI * t));
    model.add(box(0.015), k % 3 ? WOOD : WOOD_LIGHT, [0, deck(t), t - 0.5], [0.86, 0.05, 0.9 / planks], [-tilt, 0, 0]);
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < 8; k++) {
      const t0 = k / 8, t1 = (k + 1) / 8;
      const y0 = deck(t0), y1 = deck(t1);
      model.add(cube, WOOD_DARK, [side * 0.34, (y0 + y1) / 2 - 0.06, (t0 + t1) / 2 - 0.5], [0.08, 0.08, 1 / 8 + 0.01], [-Math.atan2(y1 - y0, 1 / 8), 0, 0]);
      model.add(box(0.015), WOOD_DARK, [side * 0.45, (y0 + y1) / 2 + 0.34, (t0 + t1) / 2 - 0.5], [0.05, 0.05, 1 / 8 + 0.01], [-Math.atan2(y1 - y0, 1 / 8), 0, 0]);
    }
    for (const t of [0.02, 0.5, 0.98]) model.add(box(0.015), WOOD_DARK, [side * 0.45, deck(t) + 0.18, t - 0.5], [0.07, 0.38, 0.05]);
  }
  return model.build();
}

function fence() {
  const model = new ModelBuilder();
  for (const x of [-0.5, 0.5]) {
    model.add(box(0.02), WOOD_LIGHT, [x, 0.21, 0], [0.12, 0.42, 0.075]);
    model.add(new THREE.ConeGeometry(0.06, 0.07, 4), WOOD_LIGHT, [x, 0.455, 0], [1, 1, 1], [0, Math.PI / 4, 0]);
  }
  for (const y of [0.16, 0.31]) model.add(box(0.012), WOOD, [0, y, 0.01], [1, 0.045, 0.035]);
  return model.build();
}

type HouseStyle = { width: number; depth: number; wall: number; walls: string; beams: string; roof: string; rise: number; chimney: boolean; gableWindow: boolean };
const HOUSE_STYLES: HouseStyle[] = [
  { width: 2.3, depth: 2.0, wall: 1.25, walls: "#f4e2bd", beams: "#9a643b", roof: "#d8613c", rise: 1.05, chimney: true, gableWindow: true },
  { width: 1.85, depth: 1.6, wall: 1.05, walls: "#c98f58", beams: "#8a5632", roof: "#8f4a2c", rise: 0.85, chimney: false, gableWindow: true },
  { width: 1.3, depth: 1.15, wall: 0.85, walls: "#b07a45", beams: "#7d5030", roof: "#5aa39a", rise: 0.62, chimney: false, gableWindow: false },
];

function house(variant: number, entrance = false) {
  const s = HOUSE_STYLES[variant % HOUSE_STYLES.length];
  const model = new ModelBuilder();
  const w = s.width - 0.2, d = s.depth - 0.2, base = 0.16, top = base + s.wall;
  model.add(box(0.05), "#bfb3a0", [0, base / 2, 0], [s.width - 0.05, base, s.depth - 0.05]);
  if (entrance) {
    const doorX = w * 0.18;
    // Hollow walls and a real doorway let the child pass behind the facade.
    // Keep the original exterior bounds: thickness extends inward so windows
    // and corner beams remain in front of the walls instead of coplanar.
    const thickness = 0.12;
    const frontZ = (d - thickness) / 2;
    model.add(cube, s.walls, [0, base + s.wall / 2, -frontZ], [w, s.wall, thickness]);
    for (const side of [-1, 1]) model.add(cube, s.walls, [side * (w - thickness) / 2, base + s.wall / 2, 0], [thickness, s.wall, d - 2 * thickness]);
    const left = doorX - 0.23, right = doorX + 0.23;
    model.add(cube, s.walls, [(-w / 2 + left) / 2, base + s.wall / 2, frontZ], [left + w / 2, s.wall, thickness]);
    model.add(cube, s.walls, [(right + w / 2) / 2, base + s.wall / 2, frontZ], [w / 2 - right, s.wall, thickness]);
    model.add(cube, s.walls, [doorX, base + 0.82 + (s.wall - 0.82) / 2, frontZ], [0.46, s.wall - 0.82, thickness]);
  } else model.add(box(0.05), s.walls, [0, base + s.wall / 2, 0], [w, s.wall, d]);
  for (const x of [-1, 1]) for (const z of [-1, 1]) model.add(box(0.02), s.beams, [x * w / 2, base + s.wall / 2, z * d / 2], [0.12, s.wall, 0.12]);
  model.add(box(0.02), s.beams, [0, top - 0.04, d / 2], [w, 0.09, 0.1]);
  // Gable prism in wall colour, a thin roof deck, then overlapping shingle
  // courses tilted a touch steeper so each lower edge lifts into a lip.
  const gable = new THREE.Shape();
  gable.moveTo(-d / 2, 0); gable.lineTo(d / 2, 0); gable.lineTo(0, s.rise); gable.closePath();
  model.add(new THREE.ExtrudeGeometry(gable, { depth: w, bevelEnabled: false }).translate(0, 0, -w / 2), s.walls, [0, top, 0], [1, 1, 1], [0, Math.PI / 2, 0]);
  const halfSpan = s.depth / 2 + 0.12, rise = s.rise + 0.1;
  const angle = Math.atan2(rise, halfSpan), slab = Math.hypot(rise, halfSpan) + 0.05;
  const roofWidth = s.width + 0.3, courses = Math.max(4, Math.round(slab / 0.17)), course = slab / courses;
  const roofDark = new THREE.Color(s.roof).multiplyScalar(0.72);
  const random = seededRandom(809 + variant);
  const tiles = Math.max(4, Math.round(roofWidth / 0.3)), tile = roofWidth / tiles;
  for (const side of [-1, 1]) {
    const cy = top - 0.02 + rise / 2, cz = side * halfSpan / 2;
    const down = [-Math.sin(angle), side * Math.cos(angle)], up = [Math.cos(angle), side * Math.sin(angle)];
    model.add(cube, roofDark, [0, cy, cz], [roofWidth - 0.04, 0.06, slab], [side * angle, 0, 0]);
    for (let k = 0; k < courses; k++) {
      const t = -slab / 2 + (k + 0.5) * course, lift = 0.06;
      const y = cy + t * down[0] + lift * up[0], z = cz + t * down[1] + lift * up[1];
      // Staggered, slightly uneven tiles with small gaps that show the dark deck.
      for (let j = k % 2 ? -0.5 : 0; j < tiles; j++) {
        const x0 = Math.max(0, j) * tile, x1 = Math.min(tiles, j + 1) * tile;
        const shade = new THREE.Color(s.roof).multiplyScalar(0.92 + random() * 0.16);
        model.add(box(0.02), shade, [-roofWidth / 2 + (x0 + x1) / 2, y, z], [x1 - x0 - 0.025, 0.06, course * 1.35], [side * (angle + 0.12), 0, (random() - 0.5) * 0.04]);
      }
    }
    // Barge boards trim both gable ends so the roof reads as built, not a plank.
    for (const x of [-1, 1]) model.add(box(0.02), s.beams, [x * (roofWidth / 2 + 0.02), cy + 0.03 * up[0], cz + 0.03 * up[1]], [0.07, 0.16, slab + 0.04], [side * angle, 0, 0]);
  }
  model.add(box(0.04), s.beams, [0, top + rise + 0.05, 0], [roofWidth + 0.08, 0.14, 0.2]);
  // Door, windows and a little porch step.
  if (!entrance) model.add(box(0.03), "#8a4f2c", [w * 0.18, base + 0.42, d / 2 + 0.03], [0.46, 0.8, 0.06]);
  if (!entrance) model.add(new THREE.SphereGeometry(0.035, 6, 4), "#f2c54e", [w * 0.18 + 0.14, base + 0.42, d / 2 + 0.07]);
  model.add(box(0.03), "#cdbb9d", [w * 0.18, 0.05, d / 2 + 0.2], [0.62, 0.1, 0.32]);
  const pane = (x: number, y: number, z: number, turn: number, size = 0.4) => {
    model.add(box(0.02), s.beams, [x, y, z], [size + 0.1, size + 0.06, 0.06], [0, turn, 0]);
    model.add(cube, "#fff0b3", [x + Math.sin(turn) * 0.02, y, z + Math.cos(turn) * 0.02], [size, size - 0.04, 0.04], [0, turn, 0]);
  };
  pane(-w * 0.24, base + s.wall * 0.55, d / 2 + 0.02, 0);
  pane(w / 2 + 0.02, base + s.wall * 0.55, 0, Math.PI / 2, 0.34);
  pane(-w / 2 - 0.02, base + s.wall * 0.55, 0, -Math.PI / 2, 0.34);
  if (s.gableWindow) pane(w / 2 + 0.02, top + s.rise * 0.35, 0, Math.PI / 2, 0.26);
  model.add(box(0.02), "#6fb043", [-w * 0.24, base + s.wall * 0.28, d / 2 + 0.1], [0.5, 0.1, 0.12]);
  for (let k = 0; k < 4; k++) model.add(new THREE.IcosahedronGeometry(0.05, 0), FLOWERS[k % 3], [-w * 0.24 - 0.18 + k * 0.12, base + s.wall * 0.28 + 0.07, d / 2 + 0.12]);
  if (s.chimney) {
    model.add(box(0.03), "#a89c8f", [w * 0.28, top + rise * 0.75, -halfSpan * 0.35], [0.3, 0.75, 0.3]);
    model.add(box(0.02), "#6f665e", [w * 0.28, top + rise * 0.75 + 0.4, -halfSpan * 0.35], [0.36, 0.08, 0.36]);
  }
  return model.build();
}

function flower(variant: number) {
  const random = seededRandom(601 + variant);
  const model = new ModelBuilder();
  const petal = new THREE.OctahedronGeometry(1, 0);
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2 + random(), r = 0.08 + random() * 0.12;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.16 + random() * 0.14;
    model.add(new THREE.CylinderGeometry(0.012, 0.012, h, 4).translate(0, h / 2, 0), "#5e9a3a", [x, 0, z]);
    for (let p = 0; p < 5; p++) {
      const b = p / 5 * Math.PI * 2;
      model.add(petal, FLOWERS[(variant + (k === 4 ? 1 : 0)) % FLOWERS.length], [x + Math.cos(b) * 0.04, h, z + Math.sin(b) * 0.04], [0.045, 0.014, 0.025], [0, -b, 0]);
    }
    model.add(new THREE.IcosahedronGeometry(0.022, 0), "#f2c54e", [x, h + 0.01, z]);
  }
  model.add(chisel(new THREE.IcosahedronGeometry(1, 0), random, 0.1), "#6cb846", [0, 0.05, 0], [0.18, 0.08, 0.18]);
  return model.build();
}

function lily(variant: number) {
  const model = new ModelBuilder();
  model.add(new THREE.CylinderGeometry(1, 1, 0.04, 9, 1, false, 0.4, Math.PI * 2 - 0.5), "#4fa84a", [0, 0.02, 0]);
  if (variant === 1) model.add(new THREE.OctahedronGeometry(0.3, 0), "#ffc3d8", [0.15, 0.12, 0.1], [1, 0.6, 1]);
  return model.build();
}

function foam() {
  const random = seededRandom(707);
  return new ModelBuilder().add(chisel(new THREE.IcosahedronGeometry(1, 0), random, 0.12), "#ffffff", [0, 0.3, 0]).build();
}

export function createProceduralModel(kind: PropKind, variant: number): THREE.BufferGeometry {
  switch (kind) {
    case "broadleaf": return broadleaf(variant);
    case "conifer": return conifer(variant);
    case "bush": return bush(variant);
    case "boulder": return boulder(variant);
    case "stone": return stone(variant);
    case "stairs": return stairs();
    case "bridge": return bridge();
    case "fence": return fence();
    case "house": return house(variant);
    case "flower": return flower(variant);
    case "lily": return lily(variant);
    case "foam": return foam();
  }
}

// Props that should not throw shadows (they lie on the ground or water).
const FLAT = new Set<PropKind>(["lily", "foam", "stone", "flower"]);

// One InstancedMesh per model key for every prop in `placements` — the
// classroom view batches all 20 pieces into the same handful of draw calls.
export function createLandscapeProps(placements: readonly PropPlacement[], library?: ReadonlyMap<PropKey, THREE.BufferGeometry>, interactiveHome = false) {
  const group = new THREE.Group();
  group.name = "landscape-props";
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0 });
  const buckets = new Map<PropKey, PropPlacement[]>();
  const mainHouse = interactiveHome ? placements.find((prop) => prop.kind === "house") : undefined;
  for (const prop of placements) {
    if (prop === mainHouse) {
      const style = HOUSE_STYLES[prop.variant % HOUSE_STYLES.length];
      const home = new THREE.Group();
      home.name = "homecoming-house";
      home.position.set(prop.x, prop.y, prop.z);
      home.rotation.y = prop.rotation;
      home.scale.set(...prop.scale);
      const body = new THREE.Mesh(house(prop.variant, true), material);
      body.castShadow = body.receiveShadow = true;
      home.add(body);
      const doorX = (style.width - 0.2) * 0.18, doorZ = (style.depth - 0.2) / 2 + 0.04;
      const hinge = new THREE.Group();
      hinge.name = "homecoming-door";
      hinge.position.set(doorX - 0.23, 0.16, doorZ);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.8, 0.06), new THREE.MeshStandardMaterial({ color: "#8a4f2c", roughness: 0.85 }));
      panel.position.set(0.23, 0.42, 0);
      panel.castShadow = panel.receiveShadow = true;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshStandardMaterial({ color: "#f2c54e" }));
      knob.position.set(0.37, 0.42, 0.04);
      hinge.add(panel, knob); home.add(hinge);
      home.userData.doorway = new THREE.Vector3(doorX, 0.18, doorZ);
      group.add(home);
      continue;
    }
    const key = propKey(prop.kind, prop.variant);
    buckets.set(key, [...(buckets.get(key) ?? []), prop]);
  }
  const helper = new THREE.Object3D();
  const shade = new THREE.Color();
  for (const [key, items] of buckets) {
    const [kind, variant] = key.split(":") as [PropKind, string];
    const shared = library?.get(key);
    const geometry = shared ? shared.clone() : createProceduralModel(kind, Number(variant));
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    items.forEach((item, index) => {
      helper.position.set(item.x, item.y, item.z);
      helper.rotation.set(0, item.rotation, 0);
      helper.scale.set(...item.scale);
      helper.updateMatrix();
      mesh.setMatrixAt(index, helper.matrix);
      mesh.setColorAt(index, shade.setScalar(0.9 + item.tint * 0.2));
    });
    mesh.name = `props-${key}`;
    mesh.castShadow = !FLAT.has(kind);
    mesh.receiveShadow = true;
    mesh.userData.excludeFromRaycast = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
