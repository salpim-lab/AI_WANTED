import * as THREE from "three";
import { isoFill, pointInLoop } from "./isoContour";
import { stylizedNoise, STYLIZED_PALETTE } from "./islandTerrain";
import { TIER_BURY, TIER_PROFILE, tierRadiusAt, type LandscapePath, type PieceLandscape, type Tier } from "./pieceLandscape";
import type { PuzzlePoint } from "./puzzle";

// Meshes for the terraced top of one piece. Everything is flat-shaded,
// vertex-coloured and built from the landscape plan, never from textures.
const EARTH = ["#c98c58", "#b77a4a", "#a0683f", "#8a5836"];
const SHORE = "#e3cc92";
const BANK = "#9a6b45";
const WATER_SHALLOW = new THREE.Color("#8fe6df");
const WATER_DEEP = new THREE.Color("#35a9d8");
const PATH_CENTRE = new THREE.Color("#e6c48c");
const PATH_EDGE = new THREE.Color("#cfa56d");
const GRASS = STYLIZED_PALETTE.grass;

class Triangles {
  positions: number[] = [];
  colors: number[] = [];
  private color = new THREE.Color();
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();

  // `facing` orients the face (outward or up) so winding never has to be tracked.
  add(p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, color: THREE.ColorRepresentation, facing?: THREE.Vector3, shade = 1) {
    const x = p;
    let [y, z] = [q, r];
    if (facing) {
      const normal = this.a.subVectors(y, x).cross(this.b.subVectors(z, x));
      if (normal.dot(facing) < 0) [y, z] = [z, y];
    }
    this.color.set(color).multiplyScalar(shade);
    for (const v of [x, y, z]) {
      this.positions.push(v.x, v.y, v.z);
      this.colors.push(this.color.r, this.color.g, this.color.b);
    }
  }

  addColored(vertices: THREE.Vector3[], colors: THREE.Color[], facing: THREE.Vector3) {
    let order = [0, 1, 2];
    const normal = this.a.subVectors(vertices[1], vertices[0]).cross(this.b.subVectors(vertices[2], vertices[0]));
    if (normal.dot(facing) < 0) order = [0, 2, 1];
    for (const k of order) {
      this.positions.push(vertices[k].x, vertices[k].y, vertices[k].z);
      this.colors.push(colors[k].r, colors[k].g, colors[k].b);
    }
  }

  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
// Cheap deterministic per-face shade jitter (same trick as islandTerrain).
const jitter = (x: number, z: number, amount = 0.05) => 1 + ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) * amount;

function grassColor(x: number, z: number, lift = 0) {
  const noise = stylizedNoise(x, z, 0);
  const index = noise > 0.22 ? 0 : noise < -0.24 ? 2 : 1;
  return new THREE.Color(GRASS[index]).multiplyScalar(1 + lift);
}

function ringPoint(tier: Tier, k: number, ring: number) {
  const angle = k / tier.radii.length * Math.PI * 2;
  const bury = ring >= TIER_PROFILE.length;
  const profile = TIER_PROFILE[Math.min(ring, TIER_PROFILE.length - 1)];
  const offset = bury ? profile.offset + 0.05 : profile.offset;
  // Chunky low-poly bank: face rings wobble in and out a little.
  const face = ring >= 2 && ring <= 5 ? Math.sin(k * 2.7 + ring * 1.9 + tier.index) * 0.045 * tier.step : 0;
  const radius = tier.radii[k] + offset * tier.step + face;
  const y = bury ? tier.baseY - TIER_BURY : tier.baseY + tier.step * (1 - profile.drop);
  return new THREE.Vector3(tier.centre.x + Math.cos(angle) * radius, y, tier.centre.z + Math.sin(angle) * radius);
}

// A rounded earth terrace: grass top, grass rolling over the shoulder in
// uneven tongues, warm soil face, and a buried skirt that can stand in water.
function addTier(tris: Triangles, tier: Tier, seed: number) {
  const n = tier.radii.length;
  const rings = TIER_PROFILE.length + 1;
  const points = Array.from({ length: rings }, (_, ring) => Array.from({ length: n }, (_, k) => ringPoint(tier, k, ring)));
  const drip = Array.from({ length: n }, (_, k) => 2 + Math.round((Math.sin(k * 1.37 + seed) * 0.5 + Math.sin(k * 0.53 + seed * 2.1) * 0.5 + 1) * 0.9));
  const lift = tier.index * 0.03 + 0.02;
  for (let ring = 0; ring < rings - 1; ring++) for (let k = 0; k < n; k++) {
    const next = (k + 1) % n;
    const a = points[ring][k], b = points[ring][next], c = points[ring + 1][k], d = points[ring + 1][next];
    const mid = a.clone().add(d).multiplyScalar(0.5);
    const facing = new THREE.Vector3(mid.x - tier.centre.x, 0.6, mid.z - tier.centre.z).normalize();
    const grass = ring < Math.min(drip[k], drip[next]) || (ring < Math.max(drip[k], drip[next]) && ring < 3);
    const band = Math.min(EARTH.length - 1, Math.max(0, ring - 2));
    const color = grass ? grassColor(mid.x, mid.z, lift - ring * 0.04) : new THREE.Color(EARTH[band]);
    const shade = jitter(mid.x, mid.z);
    tris.add(a, b, c, color, facing, shade);
    tris.add(b, d, c, color, facing, shade * 0.98);
  }
  // Flat top: fan from the centre (each terrace outline is star-shaped).
  // Per-vertex colour from the meadow's world noise field, so the long fan
  // slivers blend smoothly instead of showing as radial stripes.
  const centre = new THREE.Vector3(tier.centre.x, tier.topY, tier.centre.z);
  const centreColor = grassColor(centre.x, centre.z, lift);
  const rimColors = points[0].map((p) => grassColor(p.x, p.z, lift));
  for (let k = 0; k < n; k++) {
    const next = (k + 1) % n;
    tris.addColored([centre, points[0][k], points[0][next]], [centreColor, rimColors[k], rimColors[next]], UP);
  }
}

function addWater(landscape: PieceLandscape, water: Triangles, shore: Triangles) {
  const plan = landscape.water!;
  const { points, depth } = isoFill(plan.grid, 0);
  const color = new THREE.Color();
  for (let k = 0; k < points.length; k += 3) {
    const vertices = [0, 1, 2].map((j) => new THREE.Vector3(points[k + j].x, plan.surfaceY, points[k + j].z));
    const colors = [0, 1, 2].map((j) => color.copy(WATER_SHALLOW).lerp(WATER_DEEP, THREE.MathUtils.smoothstep(-depth[k + j], 0.02, 0.55)).clone());
    water.addColored(vertices, colors, UP);
  }
  // Sandy shore ring between the cap hole and the water's edge.
  for (const outer of plan.shoreLoops) {
    const holes = plan.bankLoops.filter((loop) => pointInLoop(loop[0], outer));
    const contour = outer.map((p) => new THREE.Vector2(p.x, p.z));
    const cut = holes.map((loop) => loop.map((p) => new THREE.Vector2(p.x, p.z)));
    const all = [...outer, ...holes.flat()];
    for (const [ia, ib, ic] of THREE.ShapeUtils.triangulateShape(contour, cut)) {
      const [a, b, c] = [all[ia], all[ib], all[ic]].map((p) => new THREE.Vector3(p.x, landscape.capY, p.z));
      shore.add(a, b, c, SHORE, UP, jitter(a.x, a.z, 0.04));
    }
  }
  // Earth bank walls down to just under the water surface.
  for (const loop of plan.bankLoops) {
    for (let k = 0; k < loop.length; k++) {
      const p = loop[k], q = loop[(k + 1) % loop.length];
      const top = landscape.capY + 0.002, bottom = plan.surfaceY - 0.05;
      const a = new THREE.Vector3(p.x, top, p.z), b = new THREE.Vector3(q.x, top, q.z);
      const c = new THREE.Vector3(p.x, bottom, p.z), d = new THREE.Vector3(q.x, bottom, q.z);
      // Walls face the water: sample which side of the edge is wet.
      const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
      const nx = -(q.z - p.z), nz = q.x - p.x;
      const wetSide = plan.sdf(mx + nx * 0.05, mz + nz * 0.05) < 0 ? 1 : -1;
      const facing = new THREE.Vector3(nx * wetSide, 0, nz * wetSide);
      shore.add(a, b, c, BANK, facing, jitter(mx, mz));
      shore.add(b, d, c, BANK, facing, jitter(mx, mz) * 0.95);
    }
  }
  // Spring pools on the terrace that feed the fall.
  for (const pool of plan.pools) {
    const centre = new THREE.Vector3(pool.x, pool.y, pool.z);
    for (let k = 0; k < 10; k++) {
      const a0 = k / 10 * Math.PI * 2, a1 = (k + 1) / 10 * Math.PI * 2;
      const a = new THREE.Vector3(pool.x + Math.cos(a0) * pool.r, pool.y, pool.z + Math.sin(a0) * pool.r);
      const b = new THREE.Vector3(pool.x + Math.cos(a1) * pool.r, pool.y, pool.z + Math.sin(a1) * pool.r);
      water.addColored([centre, a, b], [WATER_DEEP, WATER_SHALLOW, WATER_SHALLOW], UP);
    }
  }
}

// A small fall draped over the terrace bank, from the spring to the pond.
function addWaterfall(landscape: PieceLandscape, fall: Triangles) {
  const plan = landscape.water!;
  const info = plan.waterfall;
  if (!info) return;
  const tier = landscape.tiers[info.tier];
  const columns = 5;
  const offsets = [...TIER_PROFILE.slice(1).map((p) => ({ offset: p.offset, y: tier.baseY + tier.step * (1 - p.drop) })),
    { offset: TIER_PROFILE[TIER_PROFILE.length - 1].offset + 0.25, y: plan.surfaceY + 0.01 }];
  const pool = plan.pools[0];
  const rows: THREE.Vector3[][] = [];
  const white = new THREE.Color("#ffffff"), light = new THREE.Color("#c9f1fb"), blue = new THREE.Color("#86d9f0");
  if (pool) {
    rows.push(Array.from({ length: columns }, (_, c) => {
      const angle = info.angle + (c / (columns - 1) - 0.5) * 2 * info.halfAngle * 0.8;
      const toward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      return new THREE.Vector3(pool.x, pool.y + 0.004, pool.z).addScaledVector(toward, pool.r * 0.6)
        .add(new THREE.Vector3(-toward.z, 0, toward.x).multiplyScalar((c / (columns - 1) - 0.5) * 0.3));
    }));
  }
  offsets.forEach(({ offset, y }, row) => {
    rows.push(Array.from({ length: columns }, (_, c) => {
      const angle = info.angle + (c / (columns - 1) - 0.5) * 2 * info.halfAngle * (1 + row * 0.06);
      // Water arcs a little clear of the bank as it falls.
      const radius = tierRadiusAt(tier, angle) + offset * tier.step + 0.05 + Math.max(0, offset) * tier.step * 0.5;
      return new THREE.Vector3(tier.centre.x + Math.cos(angle) * radius, y + (row === 0 ? 0.015 : 0), tier.centre.z + Math.sin(angle) * radius);
    }));
  });
  // Vertical streaks (alternate columns), blue at the lip, white foam below.
  const tone = (row: number, c: number) => row >= rows.length - 1 ? white
    : row < 2 ? blue.clone().lerp(c % 2 ? light : white, row * 0.4)
    : (c % 2 ? light : white);
  for (let row = 0; row < rows.length - 1; row++) for (let c = 0; c < columns - 1; c++) {
    const a = rows[row][c], b = rows[row][c + 1], d = rows[row + 1][c], e = rows[row + 1][c + 1];
    const out = new THREE.Vector3((a.x + e.x) / 2 - tier.centre.x, 1.2, (a.z + e.z) / 2 - tier.centre.z).normalize();
    fall.addColored([a, b, d], [tone(row, c), tone(row, c + 1), tone(row + 1, c)], out);
    fall.addColored([b, e, d], [tone(row, c + 1), tone(row + 1, c + 1), tone(row + 1, c)], out);
  }
}

// Soft-edged dirt ribbon laid on a flat level, rounded at both ends.
function addPath(tris: Triangles, path: LandscapePath) {
  const { points } = path;
  const y = path.y + 0.012;
  const half = (k: number) => path.width / 2 * (0.92 + 0.08 * Math.sin(k * 0.9));
  const sides = points.map((p, k) => {
    const a = points[Math.max(0, k - 1)], b = points[Math.min(points.length - 1, k + 1)];
    const t = new THREE.Vector2(b.x - a.x, b.z - a.z).normalize();
    const n = new THREE.Vector2(-t.y, t.x).multiplyScalar(half(k));
    return {
      left: new THREE.Vector3(p.x + n.x, y, p.z + n.y),
      centre: new THREE.Vector3(p.x, y, p.z),
      right: new THREE.Vector3(p.x - n.x, y, p.z - n.y),
      tangent: t,
    };
  });
  for (let k = 0; k < sides.length - 1; k++) {
    const s = sides[k], t = sides[k + 1];
    tris.addColored([s.left, t.left, s.centre], [PATH_EDGE, PATH_EDGE, PATH_CENTRE], UP);
    tris.addColored([t.left, t.centre, s.centre], [PATH_EDGE, PATH_CENTRE, PATH_CENTRE], UP);
    tris.addColored([s.centre, t.centre, s.right], [PATH_CENTRE, PATH_CENTRE, PATH_EDGE], UP);
    tris.addColored([t.centre, t.right, s.right], [PATH_CENTRE, PATH_EDGE, PATH_EDGE], UP);
  }
  for (const [index, sign] of [[0, -1], [sides.length - 1, 1]] as const) {
    const s = sides[index];
    const r = half(index);
    const start = Math.atan2(s.tangent.y, s.tangent.x) + (sign < 0 ? Math.PI / 2 : -Math.PI / 2);
    for (let k = 0; k < 6; k++) {
      const a0 = start + k / 6 * Math.PI, a1 = start + (k + 1) / 6 * Math.PI;
      const a = new THREE.Vector3(s.centre.x + Math.cos(a0) * r, y, s.centre.z + Math.sin(a0) * r);
      const b = new THREE.Vector3(s.centre.x + Math.cos(a1) * r, y, s.centre.z + Math.sin(a1) * r);
      tris.addColored([s.centre, a, b], [PATH_CENTRE, PATH_EDGE, PATH_EDGE], UP);
    }
  }
}

function meshOf(tris: Triangles, material: THREE.Material, name: string, kind: string) {
  const mesh = new THREE.Mesh(tris.geometry(), material);
  mesh.name = name;
  mesh.castShadow = kind === "terrace";
  mesh.receiveShadow = true;
  mesh.userData.surfaceKind = kind;
  return mesh;
}

// Returns the terraces, water and paths; all of them are placement-surface
// candidates (the scene resolves blocked hits to the nearest free spot).
export function createPieceTerrainMeshes(landscape: PieceLandscape) {
  const group = new THREE.Group();
  group.name = `piece-${landscape.pieceIndex + 1}-terraces`;
  const ground = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 });
  const terraces = new Triangles();
  landscape.tiers.forEach((tier) => addTier(terraces, tier, landscape.pieceIndex * 3.1 + tier.index));
  if (terraces.positions.length) group.add(meshOf(terraces, ground, "terraces", "terrace"));
  if (landscape.water) {
    const water = new Triangles(), shore = new Triangles(), fall = new Triangles();
    addWater(landscape, water, shore);
    addWaterfall(landscape, fall);
    const waterMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0, emissive: "#1d6f8a", emissiveIntensity: 0.12 });
    group.add(meshOf(water, waterMaterial, "water", "water"));
    group.add(meshOf(shore, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }), "shore-and-banks", "shore"));
    if (fall.positions.length) {
      const fallMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, emissive: "#8fd8ee", emissiveIntensity: 0.25, side: THREE.DoubleSide });
      const mesh = meshOf(fall, fallMaterial, "waterfall", "waterfall");
      mesh.userData.excludeFromRaycast = true;
      group.add(mesh);
    }
  }
  if (landscape.paths.length) {
    const paths = new Triangles();
    landscape.paths.forEach((path) => addPath(paths, path));
    const pathMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    group.add(meshOf(paths, pathMaterial, "dirt-paths", "path"));
  }
  return group;
}

// Cap holes: the shore outline of every pond and brook.
export function landscapeCapHoles(landscape: PieceLandscape): PuzzlePoint[][] {
  return landscape.water?.shoreLoops ?? [];
}
