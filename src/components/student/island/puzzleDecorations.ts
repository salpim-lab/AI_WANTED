import { seededRandom, type IslandLayout, type DecorationKind } from "./placement";
import { getPuzzleLayout, getPuzzlePiecePolygon, getPuzzleTerrainMetrics, puzzlePieceContains, PUZZLE_SEED, type PuzzlePoint } from "./puzzle";

export type PuzzleDecoration = { kind: DecorationKind; x: number; z: number; radius: number; footprint: number };

export function distanceToPuzzleRim(point: PuzzlePoint, polygon: PuzzlePoint[]) {
  let closest = Infinity;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    closest = Math.min(closest, Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz));
  }
  return closest;
}

function polygonCentroid(polygon: PuzzlePoint[]) {
  let area = 0, x = 0, z = 0;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    const cross = a.x * b.z - b.x * a.z;
    area += cross;
    x += (a.x + b.x) * cross;
    z += (a.z + b.z) * cross;
  }
  return { x: x / (3 * area), z: z / (3 * area) };
}

const decorationCache = new Map<string, ReturnType<typeof makePuzzleDecorationPlan>>();

function makePuzzleDecorationPlan(layout: IslandLayout, pieceIndex: number, seed: number) {
  const puzzle = getPuzzleLayout(layout, seed);
  const piece = puzzle.pieces[pieceIndex];
  if (!piece) throw new Error(`Unknown puzzle piece ${pieceIndex}`);
  const polygon = getPuzzlePiecePolygon(piece);
  const centre = polygonCentroid(polygon);
  const { W } = getPuzzleTerrainMetrics(layout, pieceIndex, "personal", seed);
  const surfaceY = layout.surfaceY + 0.015;
  const edgeMargin = W * 0.08;
  const centreMargin = W * 0.208;
  const spacing = W * 0.005;
  const minX = Math.min(...polygon.map((point) => point.x)), maxX = Math.max(...polygon.map((point) => point.x));
  const minZ = Math.min(...polygon.map((point) => point.z)), maxZ = Math.max(...polygon.map((point) => point.z));
  let decorations: PuzzleDecoration[] = [];
  const kinds: DecorationKind[] = ["tree", "tree", "rock", "rock", "flower", "flower", "flower", "bush", "bush", "grass", "grass", "grass"];
  for (let restart = 0; restart < 80; restart++) {
    const random = seededRandom(layout.seed * 7919 + seed * 31 + pieceIndex * 101 + restart * 9973);
    decorations = [];
    for (let kindIndex = 0; kindIndex < kinds.length; kindIndex++) {
      const kind = kinds[kindIndex];
      const radius = W * (kind === "tree" ? 0.05 : kind === "rock" ? 0.03 : kind === "flower" ? 0.025 : 0.02);
      // Bounds include the lobed tree crown, clustered rock offsets, petals and
      // blade tufts rather than just the object's centre point.
      const footprint = kind === "tree" ? radius * 1.3 : kind === "rock" ? radius * 1.4
        : kind === "flower" ? radius * 0.5 + W * 0.025 : kind === "bush" ? radius * 1.1 : radius * 0.6 + W * 0.016;
      for (let attempt = 0; attempt < 1800; attempt++) {
        const point = { x: minX + random() * (maxX - minX), z: minZ + random() * (maxZ - minZ) };
        if (!puzzlePieceContains(piece, point)) continue;
        if (distanceToPuzzleRim(point, polygon) < edgeMargin + footprint) continue;
        if (Math.hypot(point.x - centre.x, point.z - centre.z) < centreMargin + footprint) continue;
        if (decorations.some((placed) => Math.hypot(point.x - placed.x, point.z - placed.z) < footprint + placed.footprint + spacing)) continue;
        decorations.push({ kind, ...point, radius, footprint });
        break;
      }
      if (decorations.length !== kindIndex + 1) break;
    }
    if (decorations.length === kinds.length) break;
  }
  if (decorations.length !== kinds.length) throw new Error(`Cannot fit decorations on puzzle piece ${pieceIndex}: ${decorations.length}/${kinds.length}`);
  return { piece, polygon, centre, W, surfaceY, edgeMargin, centreMargin, spacing, decorations };
}

export function getPuzzleDecorationPlan(layout: IslandLayout, pieceIndex: number, seed = PUZZLE_SEED) {
  const cacheKey = `${layout.seed}:${seed}:${pieceIndex}`;
  let plan = decorationCache.get(cacheKey);
  if (!plan) {
    plan = makePuzzleDecorationPlan(layout, pieceIndex, seed);
    decorationCache.set(cacheKey, plan);
  }
  return plan;
}
