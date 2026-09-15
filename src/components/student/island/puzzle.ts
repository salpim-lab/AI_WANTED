import { BufferGeometry, ExtrudeGeometry, Shape, ShapeGeometry } from "three";
import type { IslandLayout } from "./placement";

export const PUZZLE_PIECE_COUNT = 20;
export const PUZZLE_SEED = 20260915;
// Student 1 starts in the visually central piece; the rest can be reassigned
// without changing the generated geometry or the classroom assembly.
export const PUZZLE_STUDENT_PIECE_MAP: Record<number, number> = {
  1: 12, 2: 6, 3: 13, 4: 7, 5: 11, 6: 8, 7: 2, 8: 3, 9: 17, 10: 18,
  11: 1, 12: 4, 13: 9, 14: 14, 15: 16, 16: 19, 17: 0, 18: 5, 19: 10, 20: 15,
};

const OUTLINE_SAMPLES = 72;
const LLOYD_ITERATIONS = 14;
const EDGE_KEY_DIGITS = 4;
const TAB_MIN_LENGTH = 1.6;
const TAB_WIDTH = 0.28;

export type PuzzlePoint = { x: number; z: number };
export type PuzzleEdge = {
  a: PuzzlePoint;
  b: PuzzlePoint;
  internal: boolean;
  tab: PuzzlePoint[];
};
export type PuzzlePiece = {
  index: number;
  seed: PuzzlePoint;
  polygon: PuzzlePoint[];
  edges: PuzzleEdge[];
  area: number;
};
export type PuzzleLayout = {
  seed: number;
  pieces: PuzzlePiece[];
  outline: PuzzlePoint[];
};

function key(point: PuzzlePoint) {
  return `${point.x.toFixed(EDGE_KEY_DIGITS)},${point.z.toFixed(EDGE_KEY_DIGITS)}`;
}

function edgeKey(a: PuzzlePoint, b: PuzzlePoint) {
  const first = key(a), second = key(b);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function areaOf(polygon: PuzzlePoint[]) {
  return polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point.x * next.z - next.x * point.z;
  }, 0) / 2;
}

function pieceShape(piece: PuzzlePiece) {
  const shape = new Shape();
  getPuzzlePiecePolygon(piece).forEach((point, index) => index === 0 ? shape.moveTo(point.x, point.z) : shape.lineTo(point.x, point.z));
  shape.closePath();
  return shape;
}

function centroidOf(polygon: PuzzlePoint[]) {
  let twiceArea = 0, x = 0, z = 0;
  for (let index = 0; index < polygon.length; index++) {
    const point = polygon[index], next = polygon[(index + 1) % polygon.length];
    const cross = point.x * next.z - next.x * point.z;
    twiceArea += cross;
    x += (point.x + next.x) * cross;
    z += (point.z + next.z) * cross;
  }
  if (Math.abs(twiceArea) < 1e-8) return polygon[0];
  return { x: x / (3 * twiceArea), z: z / (3 * twiceArea) };
}

function clipByBisector(polygon: PuzzlePoint[], site: PuzzlePoint, other: PuzzlePoint) {
  if (!polygon.length) return [];
  const mx = (site.x + other.x) / 2, mz = (site.z + other.z) / 2;
  const nx = other.x - site.x, nz = other.z - site.z;
  const inside = (point: PuzzlePoint) => (point.x - mx) * nx + (point.z - mz) * nz <= 1e-9;
  const intersection = (a: PuzzlePoint, b: PuzzlePoint) => {
    const da = (a.x - mx) * nx + (a.z - mz) * nz;
    const db = (b.x - mx) * nx + (b.z - mz) * nz;
    const t = da / (da - db);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  };
  const result: PuzzlePoint[] = [];
  let previous = polygon[polygon.length - 1];
  let previousInside = inside(previous);
  for (const current of polygon) {
    const currentInside = inside(current);
    if (currentInside !== previousInside) result.push(intersection(previous, current));
    if (currentInside) result.push(current);
    previous = current;
    previousInside = currentInside;
  }
  return result;
}

function pointInPolygon(point: PuzzlePoint, polygon: PuzzlePoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index], b = polygon[previous];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function sampleOutline(layout: IslandLayout) {
  return Array.from({ length: OUTLINE_SAMPLES }, (_, index) => {
    const angle = index / OUTLINE_SAMPLES * Math.PI * 2;
    const radius = layout.radiusAt(angle);
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
  });
}

function makeInitialSeeds(outline: PuzzlePoint[], seed: number) {
  const random = layoutRandom(seed);
  const bounds = outline.reduce((result, point) => ({
    minX: Math.min(result.minX, point.x), maxX: Math.max(result.maxX, point.x),
    minZ: Math.min(result.minZ, point.z), maxZ: Math.max(result.maxZ, point.z),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const seeds: PuzzlePoint[] = [];
  // A lightly jittered 5×4 lattice prevents random corner clusters before
  // Lloyd relaxation, while still making the final cuts organic.
  for (let row = 0; row < 4; row++) for (let column = 0; column < 5; column++) {
    let x = bounds.minX + (column + 0.5) / 5 * (bounds.maxX - bounds.minX);
    let z = bounds.minZ + (row + 0.5) / 4 * (bounds.maxZ - bounds.minZ);
    x += (random() - 0.5) * (bounds.maxX - bounds.minX) * 0.045;
    z += (random() - 0.5) * (bounds.maxZ - bounds.minZ) * 0.045;
    const candidate = { x, z };
    if (pointInPolygon(candidate, outline)) seeds.push(candidate);
    else seeds.push({ x: (x + 0) * 0.92, z: (z + 0) * 0.92 });
  }
  return seeds;
}

function layoutRandom(seed: number) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCells(outline: PuzzlePoint[], seeds: PuzzlePoint[]) {
  return seeds.map((site) => seeds.reduce((cell, other) => site === other ? cell : clipByBisector(cell, site, other), outline));
}

function addSharedTabs(cells: PuzzlePoint[][]) {
  const occurrences = new Map<string, { cell: number; index: number; a: PuzzlePoint; b: PuzzlePoint }[]>();
  cells.forEach((polygon, cell) => polygon.forEach((a, index) => {
    const b = polygon[(index + 1) % polygon.length];
    const item = { cell, index, a, b };
    occurrences.set(edgeKey(a, b), [...(occurrences.get(edgeKey(a, b)) ?? []), item]);
  }));
  const shared = new Map<string, PuzzlePoint[]>();
  for (const [id, edges] of occurrences) {
    if (edges.length !== 2) continue;
    const [a, b] = [edges[0].a, edges[0].b].sort((left, right) => key(left).localeCompare(key(right)));
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < TAB_MIN_LENGTH) {
      shared.set(id, [{ ...a }, { ...b }]);
      continue;
    }
    const count = length > 4.5 ? 2 : 1;
    const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
    const nx = -dz, nz = dx;
    const points: PuzzlePoint[] = [{ ...a }];
    for (let tab = 0; tab < count; tab++) {
      const start = (tab + 0.5) / count - TAB_WIDTH / 2;
      const end = (tab + 0.5) / count + TAB_WIDTH / 2;
      const t0 = Math.max(0.06, start), t1 = Math.min(0.94, end);
      const depth = Math.min(length * 0.115, 0.72);
      points.push({ x: a.x + (b.x - a.x) * t0, z: a.z + (b.z - a.z) * t0 });
      // A sampled cosine arc keeps the tab round in the ShapeGeometry outline
      // while preserving the exact same path for the neighbouring piece.
      for (let sample = 1; sample <= 8; sample++) {
        const u = sample / 8;
        const t = t0 + (t1 - t0) * u;
        const bulge = Math.sin(Math.PI * u) ** 0.78;
        points.push({ x: a.x + (b.x - a.x) * t + nx * depth * bulge, z: a.z + (b.z - a.z) * t + nz * depth * bulge });
      }
    }
    points.push({ ...b });
    shared.set(id, points);
  }
  return { occurrences, shared };
}

export function createPuzzleLayout(layout: IslandLayout, seed = PUZZLE_SEED): PuzzleLayout {
  const outline = sampleOutline(layout);
  let seeds = makeInitialSeeds(outline, seed);
  for (let iteration = 0; iteration < LLOYD_ITERATIONS; iteration++) {
    const cells = makeCells(outline, seeds);
    seeds = cells.map((cell, index) => {
      const centre = centroidOf(cell);
      return pointInPolygon(centre, outline) ? centre : seeds[index];
    });
  }
  const cells = makeCells(outline, seeds);
  const { occurrences, shared } = addSharedTabs(cells);
  const pieces = cells.map((polygon, index) => {
    const edges = polygon.map((a, edgeIndex) => {
      const b = polygon[(edgeIndex + 1) % polygon.length];
      return { a, b, internal: (occurrences.get(edgeKey(a, b))?.length ?? 0) === 2, tab: shared.get(edgeKey(a, b)) ?? [a, b] };
    });
    return { index, seed: seeds[index], polygon, edges, area: Math.abs(areaOf(polygon)) };
  });
  return { seed, pieces, outline };
}

const layoutCache = new Map<string, PuzzleLayout>();
const geometryCache = new Map<string, BufferGeometry>();

export function getPuzzleLayout(layout: IslandLayout, seed = PUZZLE_SEED) {
  const cacheKey = `${layout.seed}:${seed}`;
  let result = layoutCache.get(cacheKey);
  if (!result) {
    result = createPuzzleLayout(layout, seed);
    layoutCache.set(cacheKey, result);
  }
  return result;
}

export function getPuzzlePiecePolygon(piece: PuzzlePiece) {
  const points: PuzzlePoint[] = [];
  piece.edges.forEach((edge) => {
    const curve = edge.internal ? edge.tab : [edge.a, edge.b];
    const forward = key(edge.a) < key(edge.b);
    const ordered = forward ? curve : [...curve].reverse();
    points.push(...(points.length ? ordered.slice(1) : ordered));
  });
  return points;
}

export function createPuzzlePieceGeometry(layout: IslandLayout, pieceIndex: number, seed = PUZZLE_SEED) {
  const cacheKey = `${layout.seed}:${seed}:${pieceIndex}`;
  const cached = geometryCache.get(cacheKey);
  if (cached) return cached.clone();
  const piece = getPuzzleLayout(layout, seed).pieces[pieceIndex];
  if (!piece) throw new Error(`Unknown puzzle piece ${pieceIndex}`);
  const geometry = new ShapeGeometry(pieceShape(piece), 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  geometryCache.set(cacheKey, geometry.clone());
  return geometry;
}

export function createPuzzlePieceLayerGeometry(layout: IslandLayout, pieceIndex: number, depth: number, seed = PUZZLE_SEED) {
  const cacheKey = `${layout.seed}:${seed}:${pieceIndex}:layer:${depth}`;
  const cached = geometryCache.get(cacheKey);
  if (cached) return cached.clone();
  const piece = getPuzzleLayout(layout, seed).pieces[pieceIndex];
  if (!piece) throw new Error(`Unknown puzzle piece ${pieceIndex}`);
  const geometry = new ExtrudeGeometry(pieceShape(piece), {
    depth,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 8,
  });
  // ExtrudeGeometry grows toward +Z. Move that range below the top plane
  // before rotating XY into the island's XZ ground plane.
  geometry.translate(0, 0, -depth);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  geometryCache.set(cacheKey, geometry.clone());
  return geometry;
}

export function puzzlePieceContains(piece: PuzzlePiece, point: PuzzlePoint) {
  return pointInPolygon(point, piece.polygon);
}

export function puzzleAreaStats(layout: PuzzleLayout) {
  const areas = layout.pieces.map((piece) => piece.area);
  return { min: Math.min(...areas), max: Math.max(...areas), ratio: Math.max(...areas) / Math.min(...areas) };
}
