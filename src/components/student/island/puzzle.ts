import { BufferGeometry, Float32BufferAttribute, Shape, ShapeGeometry, ShapeUtils, Vector2, Vector3 } from "three";
import type { IslandLayout } from "./placement";

const ISLAND_SCALE = 2.75;

export const PUZZLE_PIECE_COUNT = 20;
export const PUZZLE_SEED = 20260915;
// Student 1 starts in the visually central piece; the rest can be reassigned
// without changing the generated geometry or the classroom assembly.
export const PUZZLE_STUDENT_PIECE_MAP: Record<number, number> = {
  1: 12, 2: 6, 3: 13, 4: 7, 5: 11, 6: 8, 7: 2, 8: 3, 9: 17, 10: 18,
  11: 1, 12: 4, 13: 9, 14: 14, 15: 16, 16: 19, 17: 0, 18: 5, 19: 10, 20: 15,
};

const OUTLINE_SAMPLES = 72;
// Keep the 5×4 scaffold regular. The old Lloyd relaxation made the student
// piece a many-sided blob; regular cells make its four classic puzzle sides
// legible at a glance and keep the tab controls below easy to tune.
const LLOYD_ITERATIONS = 0;
const EDGE_KEY_DIGITS = 4;
export const PUZZLE_TAB_MIN_LENGTH = 1.6;
export const PUZZLE_TAB_COUNT_SHORT = 1;
export const PUZZLE_TAB_COUNT_LONG = 1;
export const PUZZLE_TAB_WIDTH = 0.27;
export const PUZZLE_TAB_DEPTH = 0.16;
export const PUZZLE_TAB_SAMPLES = 10;

export type PuzzlePoint = { x: number; z: number };

// Display-only orientation; puzzle data and generated geometry stay unchanged.
export function getPuzzleDisplayRotation(layout: IslandLayout, pieceIndex: number, seed = PUZZLE_SEED) {
  const piece = getPuzzleLayout(layout, seed).pieces[pieceIndex];
  if (!piece) throw new Error(`Unknown puzzle piece ${pieceIndex}`);
  const points = getPuzzlePiecePolygon(piece);
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanZ = points.reduce((sum, point) => sum + point.z, 0) / points.length;
  let xx = 0, zz = 0, xz = 0;
  points.forEach((point) => {
    const x = point.x - meanX, z = point.z - meanZ;
    xx += x * x;
    zz += z * z;
    xz += x * z;
  });
  const axis = 0.5 * Math.atan2(2 * xz, xx - zz);
  // PCA gives the footprint's major axis. Rotate that axis onto world X so
  // the initial +Z camera sees the longest direction as the screen horizontal.
  return -axis;
}

// The one bridge between puzzle data XZ, world XZ, and Shape XY.
// rotateX(-π/2) maps Shape Y to negative world Z; the Shape encoding lives here.
export function createIslandCoordinates(displayRotation = 0) {
  return {
  toWorld(point: PuzzlePoint, y = 0) {
    return new Vector3(point.x, y, point.z);
  },
  toData(point: PuzzlePoint) {
    return { x: point.x, z: point.z };
  },
  toDisplayedWorld(point: PuzzlePoint, y = 0) {
    return this.toWorld(point, y).applyAxisAngle(new Vector3(0, 1, 0), displayRotation);
  },
  fromDisplayedWorld(point: Vector3) {
    return this.toData(point.clone().applyAxisAngle(new Vector3(0, 1, 0), -displayRotation));
  },
  toShape(point: PuzzlePoint) {
    const world = this.toWorld(point);
    return new Vector2(world.x, -world.z);
  },
  };
}
export const islandCoordinates = createIslandCoordinates();
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
  getPuzzlePiecePolygon(piece).forEach((point, index) => {
    const vertex = islandCoordinates.toShape(point);
    if (index === 0) shape.moveTo(vertex.x, vertex.y);
    else shape.lineTo(vertex.x, vertex.y);
  });
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

function makeInitialSeeds(outline: PuzzlePoint[]) {
  const bounds = outline.reduce((result, point) => ({
    minX: Math.min(result.minX, point.x), maxX: Math.max(result.maxX, point.x),
    minZ: Math.min(result.minZ, point.z), maxZ: Math.max(result.maxZ, point.z),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const seeds: PuzzlePoint[] = [];
  // A regular 5×4 lattice keeps the student piece broad and readable.
  for (let row = 0; row < 4; row++) for (let column = 0; column < 5; column++) {
    const x = bounds.minX + (column + 0.5) / 5 * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + (row + 0.5) / 4 * (bounds.maxZ - bounds.minZ);
    // No per-cell jitter: the large central student piece should have four
    // clean sides, while only the shared tab geometry provides the organic
    // puzzle character.
    let candidate = { x, z };
    // The rounded-square corners can sit outside the lattice bounds. Pull
    // those few seeds toward the centre until every Voronoi cell is valid.
    for (let shrink = 0; shrink < 8 && !pointInPolygon(candidate, outline); shrink++) {
      candidate = { x: candidate.x * 0.82, z: candidate.z * 0.82 };
    }
    seeds.push(candidate);
  }
  return seeds;
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
    if (length < PUZZLE_TAB_MIN_LENGTH) {
      shared.set(id, [{ ...a }, { ...b }]);
      continue;
    }
    const count = length > 7 ? PUZZLE_TAB_COUNT_LONG : PUZZLE_TAB_COUNT_SHORT;
    const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
    const nx = -dz, nz = dx;
    const points: PuzzlePoint[] = [{ ...a }];
    for (let tab = 0; tab < count; tab++) {
      const start = (tab + 0.5) / count - PUZZLE_TAB_WIDTH / 2;
      const end = (tab + 0.5) / count + PUZZLE_TAB_WIDTH / 2;
      const t0 = Math.max(0.06, start), t1 = Math.min(0.94, end);
      const depth = Math.min(length * PUZZLE_TAB_DEPTH, 0.95);
      points.push({ x: a.x + (b.x - a.x) * t0, z: a.z + (b.z - a.z) * t0 });
      // A sampled cosine arc keeps the tab round in the ShapeGeometry outline
      // while preserving the exact same path for the neighbouring piece.
      for (let sample = 1; sample <= PUZZLE_TAB_SAMPLES; sample++) {
        const u = sample / PUZZLE_TAB_SAMPLES;
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
  let seeds = makeInitialSeeds(outline);
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
    const forward = key(edge.a) === key(curve[0]);
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

export type PuzzleTerrainMode = "personal" | "classroom";
export type PuzzleTerrainLayer = "grass" | "rock";

type RimVertex = PuzzlePoint & { exteriorWeight: number };

function pieceWidth(piece: PuzzlePiece) {
  const points = getPuzzlePiecePolygon(piece);
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minZ = Math.min(...points.map((point) => point.z));
  const maxZ = Math.max(...points.map((point) => point.z));
  return ((maxX - minX) + (maxZ - minZ)) / 2;
}

export function getPuzzleTerrainMetrics(layout: IslandLayout, pieceIndex: number, mode: PuzzleTerrainMode, seed = PUZZLE_SEED) {
  const puzzle = getPuzzleLayout(layout, seed);
  const piece = puzzle.pieces[pieceIndex];
  if (!piece) throw new Error(`Unknown puzzle piece ${pieceIndex}`);
  const personalWidth = pieceWidth(piece);
  // Shared class width aligns every internal wall and the grass/rock seam in Y.
  const W = mode === "personal" ? personalWidth
    : puzzle.pieces.reduce((sum, candidate) => sum + pieceWidth(candidate), 0) / puzzle.pieces.length;
  // A diorama block should read as roughly 25–30% as deep as its short side.
  // `terrainW` is the displayed footprint scale, so this totals about 26.7%
  // of the puzzle piece width while keeping the proportions deterministic.
  const terrainW = W / ISLAND_SCALE;
  const grass = terrainW * 0.065, rock = terrainW * (0.19 + 0.48);
  return { W, personalWidth, grass, rock, total: grass + rock, bevel: terrainW * 0.018 };
}

function rimVertices(piece: PuzzlePiece): RimVertex[] {
  const rim: RimVertex[] = [];
  for (const edge of piece.edges) {
    const path = edge.internal ? edge.tab : Array.from({ length: 9 }, (_, index) => ({
      x: edge.a.x + (edge.b.x - edge.a.x) * index / 8,
      z: edge.a.z + (edge.b.z - edge.a.z) * index / 8,
    }));
    const ordered = key(edge.a) === key(path[0]) ? path : [...path].reverse();
    for (let index = 0; index < ordered.length - 1; index++) {
      rim.push({ ...ordered[index], exteriorWeight: edge.internal ? 0 : Math.sin(Math.PI * index / (ordered.length - 1)) });
    }
  }
  return rim;
}

const ease = (t: number) => t * t * (3 - 2 * t);

function boundaryWave(point: PuzzlePoint, W: number) {
  const sine = Math.sin(point.x * 1.31 + point.z * 0.46) * 0.65
    + Math.sin(point.z * 1.77 - point.x * 0.34) * 0.35;
  const noise = Math.sin(point.x * 6.12 + point.z * 3.71) * Math.sin(point.z * 4.19 - point.x * 2.03);
  return (W / ISLAND_SCALE) * 0.012 * (sine + noise * 0.25);
}

function ringAt(piece: PuzzlePiece, rim: RimVertex[], metrics: ReturnType<typeof getPuzzleTerrainMetrics>, mode: PuzzleTerrainMode, layer: PuzzleTerrainLayer, t: number, surfaceY: number) {
  const centre = centroidOf(piece.polygon);
  return rim.map((point) => {
    const weight = mode === "personal" ? 1 : point.exteriorWeight;
    const boundary = boundaryWave(point, metrics.W) * weight;
    let scale = 1, y = surfaceY;
    if (layer === "grass") {
      // Only the grass lip overhangs. The tab/socket outline below remains
      // vertical so neighbouring pieces can meet flush after extrusion.
      scale -= (metrics.bevel / metrics.W) * Math.sin(Math.PI * t) * weight;
      y -= metrics.grass * t;
    } else {
      y -= metrics.grass + boundary * (1 - ease(t)) + metrics.rock * t;

    }
    return islandCoordinates.toWorld({ x: centre.x + (point.x - centre.x) * scale, z: centre.z + (point.z - centre.z) * scale }, y);
  });
}

export function getPuzzleTerrainRing(layout: IslandLayout, pieceIndex: number, layer: PuzzleTerrainLayer, mode: PuzzleTerrainMode, t: number, seed = PUZZLE_SEED) {
  const piece = getPuzzleLayout(layout, seed).pieces[pieceIndex];
  const metrics = getPuzzleTerrainMetrics(layout, pieceIndex, mode, seed);
  return ringAt(piece, rimVertices(piece), metrics, mode, layer, t, layout.surfaceY + 0.015);
}

// `holes` cut the top cap only (ponds and brooks); the outline rings, side
// walls and bottom cap are unchanged, so pieces still meet flush.
export function createPuzzlePieceLayerGeometry(layout: IslandLayout, pieceIndex: number, layer: PuzzleTerrainLayer, mode: PuzzleTerrainMode, seed = PUZZLE_SEED, holes: PuzzlePoint[][] = []) {
  const holeKey = holes.map((hole) => `${hole.length}@${hole[0].x.toFixed(3)},${hole[0].z.toFixed(3)}`).join(";");
  const cacheKey = `${layout.seed}:${seed}:${pieceIndex}:terrain:${mode}:${layer}:${holeKey}`;
  const cached = geometryCache.get(cacheKey);
  if (cached) return cached.clone();
  const piece = getPuzzleLayout(layout, seed).pieces[pieceIndex];
  if (!piece) throw new Error(`Unknown puzzle piece ${pieceIndex}`);
  const metrics = getPuzzleTerrainMetrics(layout, pieceIndex, mode, seed);
  const rim = rimVertices(piece);
  // Rock has nine contours: its bottom retains every puzzle tab and socket.
  const fractions = layer === "rock" ? [0, 1] : [0, 0.25, 0.5, 0.75, 1];
  const rings = fractions.map((t) => ringAt(piece, rim, metrics, mode, layer, t, layout.surfaceY + 0.015));
  const positions = rings.flatMap((ring) => ring.flatMap((point) => [point.x, point.y, point.z]));
  const n = rim.length;
  // Side UVs follow the actual perimeter rather than the vertex count. This
  // keeps texture scale stable through straight edges and puzzle tabs.
  const perimeter: number[] = [0];
  for (let index = 1; index <= n; index++) {
    const previous = rim[index - 1], current = rim[index % n];
    perimeter[index] = perimeter[index - 1] + Math.hypot(current.x - previous.x, current.z - previous.z);
  }
  const perimeterLength = perimeter[n] || 1;
  const uvs: number[] = [];
  for (let row = 0; row < rings.length; row++) for (let index = 0; index < n; index++) {
    uvs.push(perimeter[index] / perimeterLength * 7.5, row / Math.max(1, rings.length - 1));
  }
  const indices: number[] = [];
  const clockwise = areaOf(rim) < 0;
  for (let row = 0; row < rings.length - 1; row++) for (let index = 0; index < n; index++) {
    const next = (index + 1) % n, upper = row * n, lower = (row + 1) * n;
    const quad = [upper + index, upper + next, lower + index, upper + next, lower + next, lower + index];
    if (clockwise) {
      indices.push(quad[0], quad[2], quad[1], quad[3], quad[5], quad[4]);
    } else indices.push(...quad);
  }
  const holeStart = positions.length / 3;
  const holeY = rings[0][0].y;
  const holePoints = holes.flat();
  holePoints.forEach((point) => { positions.push(point.x, holeY, point.z); uvs.push(0, 0); });
  for (const [row, top] of [[0, true], [rings.length - 1, false]] as const) {
    const contour = rings[row].map((point) => islandCoordinates.toShape(point));
    const cut = top ? holes.map((hole) => hole.map((point) => islandCoordinates.toShape(point))) : [];
    const vertex = (i: number) => i < n ? { index: row * n + i, point: rings[row][i] } : { index: holeStart + i - n, point: holePoints[i - n] };
    for (const [ia, ib, ic] of ShapeUtils.triangulateShape(contour, cut)) {
      const [a, b, c] = [vertex(ia), vertex(ib), vertex(ic)];
      const winding = (b.point.z - a.point.z) * (c.point.x - a.point.x) - (b.point.x - a.point.x) * (c.point.z - a.point.z);
      // Sampling straight shore sections creates collinear triplets; omitting
      // their zero-area triangles keeps cap normals stable after Float32 packing.
      if (Math.abs(winding) < 1e-7) continue;
      const upward = winding > 0;
      const flip = top !== upward;
      indices.push(a.index, (flip ? c : b).index, (flip ? b : c).index);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometryCache.set(cacheKey, geometry.clone());
  return geometry;
}

export function puzzlePieceContains(piece: PuzzlePiece, point: PuzzlePoint) {
  return pointInPolygon(point, getPuzzlePiecePolygon(piece));
}

export function puzzleAreaStats(layout: PuzzleLayout) {
  const areas = layout.pieces.map((piece) => piece.area);
  return { min: Math.min(...areas), max: Math.max(...areas), ratio: Math.max(...areas) / Math.min(...areas) };
}
