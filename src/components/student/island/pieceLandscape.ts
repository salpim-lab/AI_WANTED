import { ISLAND_SCALE, seededRandom, type IslandLayout } from "./placement";
import { getPuzzleDisplayRotation, getPuzzleLayout, getPuzzlePiecePolygon, getPuzzleTerrainMetrics, puzzlePieceContains, PUZZLE_SEED, type PuzzlePiece, type PuzzlePoint } from "./puzzle";
import { distanceToPuzzleRim } from "./puzzleDecorations";
import { isoLoops, sampleIsoGrid, type IsoGrid } from "./isoContour";

// Diorama layout for one puzzle piece: rounded earth terraces, a brook with
// ponds, houses joined by dirt paths, stairs and a bridge, and a dense tree
// rim. Everything is derived from the piece outline and a per-piece seed, so
// the same student always gets the same island and all 20 pieces differ.
//
// The outer rim stays at the shared meadow height and every feature keeps a
// margin from the outline: neighbouring pieces still meet at one flat seam.

const TAU = Math.PI * 2;
// Meadow cap sits this far above layout.surfaceY (see puzzle.ts ringAt).
export const CAP_LIFT = 0.015;
export const TIER_ANGLES = 72;
// Rounded earth bank: outward offset (× step height) and drop fraction.
// First ring is where the flat top starts to round over; last is the foot.
export const TIER_PROFILE = [
  { offset: -0.42, drop: 0 },
  { offset: -0.2, drop: 0.035 },
  { offset: -0.05, drop: 0.13 },
  { offset: 0.05, drop: 0.38 },
  { offset: 0.11, drop: 0.64 },
  { offset: 0.19, drop: 0.87 },
  { offset: 0.3, drop: 1 },
] as const;
// The bank continues below the lower surface so it can stand in a pond.
export const TIER_BURY = 0.34;
export const WATER_BANK = 0.17;
export const WATER_LEVEL = 0.11;
export const SHORE_WIDTH = 0.16;
const WATER_CELL = 0.16;
const PATH_WIDTH = 0.62;

// Widest horizontal reach of each prop model at scale 1, measured from its
// vertical axis. Containment checks use these; imported GLBs are clamped to
// the same reach (islandAssets.ts), so no rotation can push one past the rim.
export const PROP_REACH = { broadleaf: 1.06, conifer: 0.65, bush: 1.04, boulder: 1.13, stone: 1.15, flower: 0.28, lily: 1.01, foam: 1.14 } as const;
// Each island must keep room for a semester of items (≈210). The forest is
// thinned until this many items fit at ITEM_GAP spacing (with a margin).
export const ITEM_CAPACITY = 210;
export const ITEM_RADIUS = 0.15;
export const ITEM_GAP = 0.3;
const CAPACITY_TARGET = 240;
export const HOUSE_REACH = [1.72, 1.43, 1.08] as const;

export type Tier = { index: number; step: number; baseY: number; topY: number; centre: PuzzlePoint; radii: number[] };
export type PropKind = "house" | "broadleaf" | "conifer" | "bush" | "boulder" | "stone" | "stairs" | "bridge" | "fence" | "flower" | "lily" | "foam";
export type PropPlacement = { kind: PropKind; variant: number; x: number; y: number; z: number; rotation: number; scale: [number, number, number]; tint: number };
export type Blocker = { x: number; z: number; r: number; id: string };
export type LandscapePath = { y: number; points: PuzzlePoint[]; width: number };
export type Waterfall = { tier: number; angle: number; halfAngle: number };
export type SpringPool = { x: number; z: number; r: number; y: number };
export type LandscapeWater = {
  sdf: (x: number, z: number) => number;
  grid: IsoGrid;
  bankLoops: PuzzlePoint[][];
  shoreLoops: PuzzlePoint[][];
  surfaceY: number;
  waterfall: Waterfall | null;
  pools: SpringPool[];
};

export type PieceLandscape = {
  pieceIndex: number;
  piece: PuzzlePiece;
  polygon: PuzzlePoint[];
  capY: number;
  edgeMargin: number;
  tiers: Tier[];
  water: LandscapeWater | null;
  paths: LandscapePath[];
  props: PropPlacement[];
  blockers: Blocker[];
  // Height of the walkable surface, on the same basis as layout.heightAt.
  heightAt: (x: number, z: number) => number;
  // Visual top surface (cap height) at a point.
  surfaceAt: (x: number, z: number) => number;
  // Items: flat ground, away from the rim, water, banks and fixed props.
  canPlace: (x: number, z: number, radius: number) => boolean;
};

type Frame = { centre: PuzzlePoint; back: PuzzlePoint; right: PuzzlePoint; uMin: number; uMax: number; vMin: number; vMax: number };

const add = (a: PuzzlePoint, b: PuzzlePoint, s = 1) => ({ x: a.x + b.x * s, z: a.z + b.z * s });
const dot = (a: PuzzlePoint, b: PuzzlePoint) => a.x * b.x + a.z * b.z;
const dist = (a: PuzzlePoint, b: PuzzlePoint) => Math.hypot(a.x - b.x, a.z - b.z);
const direction = (angle: number) => ({ x: Math.cos(angle), z: Math.sin(angle) });
const normalize = (p: PuzzlePoint) => { const l = Math.hypot(p.x, p.z) || 1; return { x: p.x / l, z: p.z / l }; };
const angleOf = (p: PuzzlePoint) => Math.atan2(p.z, p.x);
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

function polygonCentroid(polygon: PuzzlePoint[]) {
  let area = 0, x = 0, z = 0;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    const cross = a.x * b.z - b.x * a.z;
    area += cross; x += (a.x + b.x) * cross; z += (a.z + b.z) * cross;
  }
  return { x: x / (3 * area), z: z / (3 * area) };
}

// The default personal camera looks along displayed −Z; express that "far"
// direction in puzzle data so tall terraces and trees sit behind the meadow.
function makeFrame(layout: IslandLayout, pieceIndex: number, polygon: PuzzlePoint[]): Frame {
  const rotation = getPuzzleDisplayRotation(layout, pieceIndex, PUZZLE_SEED);
  const back = { x: Math.sin(rotation), z: -Math.cos(rotation) };
  const right = { x: Math.cos(rotation), z: Math.sin(rotation) };
  const centre = polygonCentroid(polygon);
  const us = polygon.map((p) => dot({ x: p.x - centre.x, z: p.z - centre.z }, right));
  const vs = polygon.map((p) => dot({ x: p.x - centre.x, z: p.z - centre.z }, back));
  return { centre, back, right, uMin: Math.min(...us), uMax: Math.max(...us), vMin: Math.min(...vs), vMax: Math.max(...vs) };
}

function profileDrop(offset: number) {
  const first = TIER_PROFILE[0], last = TIER_PROFILE[TIER_PROFILE.length - 1];
  if (offset <= first.offset) return 0;
  if (offset >= last.offset) return 1;
  for (let k = 1; k < TIER_PROFILE.length; k++) {
    const a = TIER_PROFILE[k - 1], b = TIER_PROFILE[k];
    if (offset <= b.offset) return a.drop + (b.drop - a.drop) * (offset - a.offset) / (b.offset - a.offset);
  }
  return 1;
}

export function tierRadiusAt(tier: Tier, angle: number) {
  const n = tier.radii.length;
  const f = ((angle / TAU) % 1 + 1) % 1 * n;
  const k = Math.floor(f) % n, t = f - Math.floor(f);
  return tier.radii[k] * (1 - t) + tier.radii[(k + 1) % n] * t;
}

// Signed outward distance from the tier's top edge, in step heights.
export function tierOffset(tier: Tier, x: number, z: number) {
  const dx = x - tier.centre.x, dz = z - tier.centre.z;
  return (Math.hypot(dx, dz) - tierRadiusAt(tier, Math.atan2(dz, dx))) / tier.step;
}

// "top": flat terrace top; "below": past the foot; "bank": the rounded cliff.
function tierZone(tier: Tier, x: number, z: number, radius: number) {
  const offset = tierOffset(tier, x, z), pad = radius / tier.step;
  if (offset <= TIER_PROFILE[0].offset - pad) return "top";
  if (offset >= TIER_PROFILE[TIER_PROFILE.length - 1].offset + pad) return "below";
  return "bank";
}

function rayLimit(centre: PuzzlePoint, angle: number, ok: (p: PuzzlePoint) => boolean, step = 0.1, max = 40) {
  const dir = direction(angle);
  let reach = 0;
  while (reach < max && ok(add(centre, dir, reach + step))) reach += step;
  return reach;
}

function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function segmentDistance(p: PuzzlePoint, a: PuzzlePoint, b: PuzzlePoint) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return { d: Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t), t };
}

function catmullRom(points: PuzzlePoint[], spacing: number) {
  const result: PuzzlePoint[] = [];
  for (let k = 0; k < points.length - 1; k++) {
    const p0 = points[Math.max(0, k - 1)], p1 = points[k], p2 = points[k + 1], p3 = points[Math.min(points.length - 1, k + 2)];
    const count = Math.max(2, Math.ceil(dist(p1, p2) / spacing));
    for (let s = 0; s < count; s++) {
      const t = s / count, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      result.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

function buildTier(index: number, centre: PuzzlePoint, frame: Frame, axes: { u: number; v: number }, step: number, baseY: number, random: () => number, fits: (p: PuzzlePoint) => boolean): Tier | null {
  if (!fits(centre)) return null;
  const waves = [2, 3, 5].map((k) => ({ k, amp: (k === 2 ? 0.07 : k === 3 ? 0.06 : 0.035) * (0.6 + random() * 0.8), phase: random() * TAU }));
  const outer = TIER_PROFILE[TIER_PROFILE.length - 1].offset * step + 0.08;
  const limits: number[] = [];
  let radii = Array.from({ length: TIER_ANGLES }, (_, k) => {
    const angle = k / TIER_ANGLES * TAU, dir = direction(angle);
    const du = dot(dir, frame.right), dv = dot(dir, frame.back);
    const ellipse = 1 / Math.sqrt((du / axes.u) ** 2 + (dv / axes.v) ** 2);
    const wobble = 1 + waves.reduce((sum, w) => sum + w.amp * Math.sin(w.k * angle + w.phase), 0);
    limits[k] = rayLimit(centre, angle, fits) - outer;
    return Math.min(ellipse * wobble, limits[k]);
  });
  // Clamp-and-blur keeps the bank round where the outline limits it.
  for (let pass = 0; pass < 5; pass++) {
    radii = radii.map((r, k) => Math.min(limits[k], radii[(k + TIER_ANGLES - 1) % TIER_ANGLES] * 0.25 + r * 0.5 + radii[(k + 1) % TIER_ANGLES] * 0.25));
  }
  if (Math.min(...radii) < 1.1) return null;
  return { index, step, baseY, topY: baseY + step, centre, radii };
}

type PlanContext = {
  layout: IslandLayout;
  piece: PuzzlePiece;
  polygon: PuzzlePoint[];
  frame: Frame;
  random: () => number;
  tiers: Tier[];
  water: LandscapeWater | null;
  blockers: Blocker[];
  props: PropPlacement[];
  paths: LandscapePath[];
  capY: number;
  edgeMargin: number;
};

function inside(ctx: PlanContext, p: PuzzlePoint) {
  return puzzlePieceContains(ctx.piece, p);
}

function rim(ctx: PlanContext, p: PuzzlePoint) {
  return inside(ctx, p) ? distanceToPuzzleRim(p, ctx.polygon) : -1;
}

// Which terrace level a footprint stands on (0 = meadow), or −1 on a bank.
function levelOf(ctx: PlanContext, p: PuzzlePoint, radius: number) {
  let level = 0;
  for (const tier of ctx.tiers) {
    const zone = tierZone(tier, p.x, p.z, radius);
    if (zone === "bank") return -1;
    if (zone === "top") level = tier.index + 1;
  }
  return level;
}

function levelY(ctx: PlanContext, level: number) {
  return level === 0 ? ctx.capY : ctx.tiers[level - 1].topY;
}

function offsetAt(tiers: Tier[], x: number, z: number) {
  return tiers.reduce((sum, tier) => sum + tier.step * (1 - profileDrop(tierOffset(tier, x, z))), 0);
}

function blocked(ctx: PlanContext, p: PuzzlePoint, radius: number, ignore: string[] = []) {
  return ctx.blockers.some((b) => !ignore.includes(b.id) && dist(b, p) < b.r + radius);
}

function wet(ctx: PlanContext, p: PuzzlePoint, radius: number) {
  return !!ctx.water && ctx.water.sdf(p.x, p.z) < radius + SHORE_WIDTH;
}

// A prop's full footprint must stay inside the outline, on one flat level.
function freeFor(ctx: PlanContext, p: PuzzlePoint, radius: number, level?: number) {
  if (rim(ctx, p) < radius + 0.06) return false;
  const found = levelOf(ctx, p, radius);
  if (found < 0 || (level !== undefined && found !== level)) return false;
  return !wet(ctx, p, radius) && !blocked(ctx, p, radius);
}

function place(ctx: PlanContext, kind: PropKind, variant: number, p: PuzzlePoint, y: number, rotation: number, scale: [number, number, number], tint = ctx.random()) {
  ctx.props.push({ kind, variant, x: p.x, y, z: p.z, rotation, scale, tint });
}

function sampleInPiece(ctx: PlanContext) {
  const { frame } = ctx;
  for (let attempt = 0; attempt < 60; attempt++) {
    const u = frame.uMin + ctx.random() * (frame.uMax - frame.uMin);
    const v = frame.vMin + ctx.random() * (frame.vMax - frame.vMin);
    const p = add(add(frame.centre, frame.right, u), frame.back, v);
    if (inside(ctx, p)) return p;
  }
  return frame.centre;
}

function local(ctx: PlanContext, p: PuzzlePoint) {
  const d = { x: p.x - ctx.frame.centre.x, z: p.z - ctx.frame.centre.z };
  return { u: dot(d, ctx.frame.right), v: dot(d, ctx.frame.back) };
}

function planTiers(ctx: PlanContext, terrainW: number) {
  const { frame, random, piece } = ctx;
  const halfU = (frame.uMax - frame.uMin) / 2, depth = frame.vMax - frame.vMin;
  const step1 = terrainW * (0.105 + random() * 0.015);
  const lean = (random() - 0.5) * 0.3;
  const axes = { u: halfU * (0.62 + random() * 0.12), v: depth * (0.3 + random() * 0.05) };
  let tier1: Tier | null = null, centre1 = frame.centre;
  // Odd corner pieces: slide the terrace toward the middle until it fits.
  for (const [shift, shrink] of [[0.42, 1], [0.3, 0.9], [0.18, 0.8], [0.06, 0.7], [0, 0.55]] as const) {
    centre1 = add(add(frame.centre, frame.back, frame.vMax * shift), frame.right, halfU * lean * shrink);
    tier1 = buildTier(0, centre1, frame, { u: axes.u * shrink, v: axes.v * shrink }, step1, ctx.capY, random, (p) => rim(ctx, p) >= 1.25);
    if (tier1) break;
  }
  if (!tier1) return;
  ctx.tiers.push(tier1);
  // Larger pieces get a third level tucked toward one back corner.
  if (piece.area < 190) return;
  const side = random() < 0.5 ? -1 : 1;
  const r1 = Math.min(...tier1.radii);
  const centre2 = add(add(centre1, frame.back, r1 * 0.28), frame.right, side * r1 * 0.45);
  const step2 = terrainW * (0.08 + random() * 0.012);
  const tier2 = buildTier(1, centre2, frame, { u: r1 * (0.52 + random() * 0.1), v: r1 * (0.42 + random() * 0.08) }, step2, tier1.topY, random,
    (p) => tierZone(tier1, p.x, p.z, 0.45) === "top" && rim(ctx, p) >= 1.25);
  if (tier2) ctx.tiers.push(tier2);
}

function planWater(ctx: PlanContext) {
  const tier = ctx.tiers[0];
  if (!tier) return;
  const { frame, random } = ctx;
  for (let attempt = 0; attempt < 10; attempt++) {
    const side = (attempt + (random() < 0.5 ? 0 : 1)) % 2 ? 1 : -1;
    const shrink = Math.max(0.45, 1 - attempt * 0.08);
    const fallDir = normalize(add({ x: frame.right.x * side * (0.7 + random() * 0.3), z: frame.right.z * side * (0.7 + random() * 0.3) }, frame.back, -0.65));
    const fallAngle = angleOf(fallDir);
    const edge = tierRadiusAt(tier, fallAngle);
    const pondR = (1.05 + random() * 0.35) * Math.max(0.75, shrink);
    // The pond's inner shore laps the lower half of the bank, below the fall.
    const pond1 = add(tier.centre, fallDir, edge + 0.12 * tier.step + pondR * 1.18);
    const start = local(ctx, pond1);
    const length = (start.v - (frame.vMin + 3.2)) * shrink;
    const brook = length > 2.4;
    const pond2R = (0.85 + random() * 0.4) * Math.max(0.8, shrink);
    const lateral = (random() - 0.35) * 0.22;
    const back = frame.back, right = frame.right;
    const controls = brook ? [
      pond1,
      add(add(pond1, back, -length * 0.34), right, side * length * (0.12 + lateral)),
      add(add(pond1, back, -length * 0.7), right, -side * length * (0.02 + lateral * 0.5)),
      add(add(pond1, back, -length), right, side * length * 0.08),
    ] : [pond1];
    const line = brook ? catmullRom(controls, 0.25) : [];
    const pond2 = controls[controls.length - 1];
    const phase = random() * TAU;
    const pondWaves = [random() * TAU, random() * TAU];
    const pond = (p: PuzzlePoint, c: PuzzlePoint, r: number, w: number) => {
      const a = Math.atan2(p.z - c.z, p.x - c.x);
      return dist(p, c) - r * (1 + 0.1 * Math.sin(2 * a + w) + 0.06 * Math.sin(3 * a - w));
    };
    const sdf = (x: number, z: number) => {
      const p = { x, z };
      let d = pond(p, pond1, pondR, pondWaves[0]);
      if (brook) {
        let best = Infinity, along = 0;
        for (let k = 0; k < line.length - 1; k++) {
          const s = segmentDistance(p, line[k], line[k + 1]);
          if (s.d < best) { best = s.d; along = k + s.t; }
        }
        d = smin(d, best - (0.36 + 0.07 * Math.sin(along * 0.45 + phase)), 0.5);
        d = smin(d, pond(p, pond2, pond2R, pondWaves[1]), 0.5);
      }
      return d;
    };
    const pad = 1.2;
    const all = [...controls, ...line];
    const bounds = {
      minX: Math.min(...all.map((p) => p.x)) - pondR - pad, maxX: Math.max(...all.map((p) => p.x)) + pondR + pad,
      minZ: Math.min(...all.map((p) => p.z)) - pondR - pad, maxZ: Math.max(...all.map((p) => p.z)) + pondR + pad,
    };
    const grid = sampleIsoGrid(sdf, bounds, WATER_CELL);
    let valid = true;
    for (let j = 0; j < grid.nz && valid; j++) for (let i = 0; i < grid.nx && valid; i++) {
      const value = grid.values[i + j * grid.nx];
      if (value > SHORE_WIDTH + 0.05) continue;
      const p = { x: grid.minX + i * grid.cell, z: grid.minZ + j * grid.cell };
      // Water never reaches the rim; only the pond may lap the terrace foot.
      if (rim(ctx, p) < 1.35) valid = false;
      else if (value < 0 && tierOffset(tier, p.x, p.z) < 0.06) valid = false;
      else if (ctx.tiers[1] && tierOffset(ctx.tiers[1], p.x, p.z) < TIER_PROFILE[TIER_PROFILE.length - 1].offset + 0.5) valid = false;
    }
    if (!valid) continue;
    const bankLoops = isoLoops(grid, 0);
    const shoreLoops = isoLoops(grid, SHORE_WIDTH);
    const halfAngle = 0.3 / edge;
    // A little spring pool feeds the fall from the terrace top.
    const poolR = 0.3;
    const poolAt = add(tier.centre, fallDir, edge + TIER_PROFILE[0].offset * tier.step - poolR - 0.12);
    const pools = tierZone(tier, poolAt.x, poolAt.z, poolR) === "top" && (!ctx.tiers[1] || tierZone(ctx.tiers[1], poolAt.x, poolAt.z, poolR) === "below")
      ? [{ ...poolAt, r: poolR, y: tier.topY + 0.012 }] : [];
    ctx.water = { sdf, grid, bankLoops, shoreLoops, surfaceY: ctx.capY - WATER_LEVEL, waterfall: { tier: 0, angle: fallAngle, halfAngle }, pools };
    // The fall itself and the pool are fixed features.
    const lip = add(tier.centre, fallDir, edge);
    ctx.blockers.push({ ...lip, r: 0.7, id: "waterfall" });
    pools.forEach((p) => ctx.blockers.push({ x: p.x, z: p.z, r: p.r + 0.35, id: "pool" }));
    return;
  }
}

const HOUSES = [
  { width: 2.3, depth: 2.0, height: 2.7 },
  { width: 1.85, depth: 1.6, height: 2.2 },
  { width: 1.3, depth: 1.15, height: 1.65 },
] as const;

// Houses read as the landmarks of the diorama, so they are drawn a bit large.
const HOUSE_SCALE = 1.2;

function houseRadius(variant: number) {
  return HOUSE_REACH[variant] * HOUSE_SCALE + 0.1;
}

type PlacedHouse = { variant: number; at: PuzzlePoint; facing: PuzzlePoint; door: PuzzlePoint; level: number; id: string };

function placeHouse(ctx: PlanContext, variant: number, level: number, id: string, score: (p: PuzzlePoint) => number, face: (p: PuzzlePoint) => PuzzlePoint): PlacedHouse | null {
  const r = houseRadius(variant);
  let best: PuzzlePoint | null = null, bestScore = -Infinity;
  for (let k = 0; k < 220; k++) {
    const p = sampleInPiece(ctx);
    if (!freeFor(ctx, p, r + 0.35, level)) continue;
    const s = score(p) + ctx.random() * 0.4;
    if (s > bestScore) { best = p; bestScore = s; }
  }
  if (!best) return null;
  const facing = normalize(face(best));
  const house = HOUSES[variant];
  const door = add(best, facing, house.depth / 2 * HOUSE_SCALE + 0.38);
  const y = levelY(ctx, level);
  place(ctx, "house", variant, best, y, Math.atan2(facing.x, facing.z), [HOUSE_SCALE, HOUSE_SCALE, HOUSE_SCALE]);
  ctx.blockers.push({ ...best, r, id });
  return { variant, at: best, facing, door, level, id };
}

type PlacedStairs = { top: PuzzlePoint; bottom: PuzzlePoint; upper: PuzzlePoint; lower: PuzzlePoint; tier: Tier; id: string };

function placeStairs(ctx: PlanContext, tier: Tier, prefer: (dir: PuzzlePoint) => number, id: string): PlacedStairs | null {
  const width = 0.82;
  let best: PlacedStairs | null = null, bestScore = -Infinity;
  const lower = tier.index;
  for (let k = 0; k < TIER_ANGLES; k++) {
    const angle = k / TIER_ANGLES * TAU, dir = direction(angle);
    const edge = tierRadiusAt(tier, angle);
    const top = add(tier.centre, dir, edge + TIER_PROFILE[0].offset * tier.step - 0.08);
    const run = TIER_PROFILE[TIER_PROFILE.length - 1].offset * tier.step - TIER_PROFILE[0].offset * tier.step + 0.08 + tier.step * 1.05 + 0.25;
    const bottom = add(top, dir, run);
    // Path landings just beyond each end of the flight.
    const upper = add(top, dir, -0.3), lower_ = add(bottom, dir, 0.3);
    if (rim(ctx, lower_) < 1.0 || levelOf(ctx, lower_, 0.3) !== lower || levelOf(ctx, upper, 0.05) !== tier.index + 1) continue;
    let clear = true;
    for (let s = 0; s <= 1.0001 && clear; s += 0.2) {
      const p = add(top, dir, run * s);
      if (wet(ctx, p, width / 2 + 0.1) || blocked(ctx, p, width / 2 + 0.1) || rim(ctx, p) < 0.9) clear = false;
    }
    if (!clear) continue;
    const score = prefer(dir) + ctx.random() * 0.15;
    if (score > bestScore) { bestScore = score; best = { top, bottom, upper, lower: lower_, tier, id }; }
  }
  if (!best) return null;
  const dir = normalize({ x: best.bottom.x - best.top.x, z: best.bottom.z - best.top.z });
  const run = dist(best.top, best.bottom);
  const mid = add(best.top, dir, run / 2);
  // Model: unit box, low end at local +Z, rising to 1 at local −Z.
  place(ctx, "stairs", 0, mid, tier.baseY, Math.atan2(dir.x, dir.z), [width, tier.step, run]);
  for (let s = 0; s <= 1.0001; s += 0.25) ctx.blockers.push({ ...add(best.top, dir, run * s), r: width / 2 + 0.12, id });
  return best;
}

type PathResult = { points: PuzzlePoint[]; crossing: [number, number] | null };

// A gently curving dirt path on one level. Returns null when it would touch
// a bank, the rim, a prop or (unless allowed) cross water more than once.
function tracePath(ctx: PlanContext, from: PuzzlePoint, to: PuzzlePoint, level: number, ignore: string[], allowCrossing: boolean): PathResult | null {
  const length = dist(from, to);
  if (length < 0.4) return null;
  const along = normalize({ x: to.x - from.x, z: to.z - from.z });
  const side = { x: -along.z, z: along.x };
  const bend = (ctx.random() - 0.5) * length * 0.22;
  const controls = [from, add(add(from, along, length * 0.33), side, bend), add(add(from, along, length * 0.67), side, -bend * 0.6), to];
  const points = catmullRom(controls, 0.18);
  const half = PATH_WIDTH / 2;
  let crossing: [number, number] | null = null;
  let wasWet = false;
  for (let k = 0; k < points.length; k++) {
    const p = points[k];
    const isWet = !!ctx.water && ctx.water.sdf(p.x, p.z) < half + 0.12;
    if (isWet !== wasWet) {
      if (isWet) {
        if (crossing || !allowCrossing) return null;
        crossing = [k, k];
      } else if (crossing) crossing[1] = k;
      wasWet = isWet;
    }
    if (isWet) continue;
    if (rim(ctx, p) < half + 0.5) return null;
    const found = levelOf(ctx, p, half + 0.05);
    const endpoint = k < 3 || k > points.length - 4;
    if (found !== level && !(endpoint && found === -1)) return null;
    if (blocked(ctx, p, half, ignore)) return null;
  }
  if (wasWet) return null;
  if (crossing && dist(points[crossing[0]], points[crossing[1]]) > 3.6) return null;
  return { points, crossing };
}

function addPath(ctx: PlanContext, points: PuzzlePoint[], level: number, id: string) {
  if (points.length < 2) return;
  ctx.paths.push({ y: levelY(ctx, level), points, width: PATH_WIDTH });
  for (let k = 0; k < points.length; k += 2) ctx.blockers.push({ ...points[k], r: PATH_WIDTH / 2, id });
}

function addBridge(ctx: PlanContext, path: PuzzlePoint[], crossing: [number, number]) {
  const a = path[Math.max(0, crossing[0] - 1)], b = path[Math.min(path.length - 1, crossing[1])];
  const dir = normalize({ x: b.x - a.x, z: b.z - a.z });
  const length = dist(a, b) + 0.75;
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  place(ctx, "bridge", 0, mid, ctx.capY, Math.atan2(dir.x, dir.z), [0.95, 1, length]);
  for (let s = -0.5; s <= 0.5001; s += 0.25) ctx.blockers.push({ ...add(mid, dir, length * s), r: 0.6, id: "bridge" });
}

function addFence(ctx: PlanContext, posts: PuzzlePoint[], y: number, level: number) {
  const tint = ctx.random();
  for (let k = 0; k < posts.length - 1; k++) {
    const a = posts[k], b = posts[k + 1];
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    if (levelOf(ctx, mid, 0.12) !== level || rim(ctx, mid) < 0.4 || blocked(ctx, mid, 0.2) || wet(ctx, mid, 0.1)) continue;
    const dir = normalize({ x: b.x - a.x, z: b.z - a.z });
    // Model: one segment along local X from −0.5 to 0.5 with a post at each end.
    place(ctx, "fence", 0, mid, y, Math.atan2(-dir.z, dir.x), [dist(a, b), 1, 1], tint);
    ctx.blockers.push({ ...mid, r: 0.3, id: "fence" });
  }
}

function tierEdgeFence(ctx: PlanContext, tier: Tier, from: number, to: number, avoid: number[]) {
  const posts: PuzzlePoint[][] = [[]];
  const spacingAngle = (a: number) => 0.62 / Math.max(0.5, tierRadiusAt(tier, a));
  for (let a = from; a <= to; a += spacingAngle(a)) {
    if (avoid.some((b) => Math.abs(wrap(a - b)) < 0.18 + 0.7 / tierRadiusAt(tier, a))) {
      if (posts[posts.length - 1].length) posts.push([]);
      continue;
    }
    const r = tierRadiusAt(tier, a) + TIER_PROFILE[0].offset * tier.step - 0.14;
    posts[posts.length - 1].push(add(tier.centre, direction(a), r));
  }
  posts.filter((run) => run.length > 1).forEach((run) => addFence(ctx, run, tier.topY, tier.index + 1));
}

function planSettlement(ctx: PlanContext) {
  const { frame, tiers, random } = ctx;
  const back = frame.back;
  const top = tiers.length;
  // Main house on the highest terrace, facing the viewer.
  const toward = (p: PuzzlePoint) => normalize({ x: -back.x + (frame.centre.x - p.x) * 0.04, z: -back.z + (frame.centre.z - p.z) * 0.04 });
  let houseA: PlacedHouse | null = null;
  // Small corner pieces get the smaller cottage so items and trees still fit.
  const mainVariant = ctx.piece.area < 150 ? 1 : 0;
  for (let level = top; level >= 0 && !houseA; level--) {
    houseA = placeHouse(ctx, mainVariant, level, "houseA", (p) => {
      const q = local(ctx, p);
      const tier = level ? tiers[level - 1] : null;
      return q.v * 0.25 - (tier ? dist(p, tier.centre) * 0.35 : 0);
    }, toward);
  }
  const stairs: PlacedStairs[] = [];
  const front = { x: -back.x, z: -back.z };
  for (let t = tiers.length - 1; t >= 0; t--) {
    const tier = tiers[t];
    const fall = ctx.water?.waterfall;
    const target = houseA && houseA.level === t + 1 ? houseA.door : null;
    const found = placeStairs(ctx, tier, (dir) => {
      let score = dot(dir, front) * 1.2;
      if (fall && t === 0) score -= Math.abs(wrap(angleOf(dir) - fall.angle)) < 0.8 ? 5 : 0;
      if (target) score -= dist(add(tier.centre, dir, tierRadiusAt(tier, angleOf(dir))), target) * 0.08;
      if (t === 1 && stairs[0]) score -= 0; // tier-2 stairs are placed first
      return score;
    }, `stairs${t}`);
    if (found) stairs[t] = found;
  }
  // Paths on each terrace: house door → stairs down, stairs landing → next stairs.
  for (let t = tiers.length - 1; t >= 0; t--) {
    const down = stairs[t];
    if (!down) continue;
    const level = t + 1;
    let start: PuzzlePoint | null = null, ignore: string[] = [down.id];
    if (houseA && houseA.level === level) { start = houseA.door; ignore = [...ignore, houseA.id]; }
    else if (stairs[t + 1]) { start = stairs[t + 1].lower; ignore = [...ignore, stairs[t + 1].id]; }
    if (!start) continue;
    for (let attempt = 0; attempt < 6; attempt++) {
      const traced = tracePath(ctx, start, down.upper, level, ignore, false);
      if (traced) { addPath(ctx, traced.points, level, `path${level}`); break; }
    }
  }
  // Meadow: from the lowest stairs across the brook (bridge) to a second house.
  const landing = stairs[0]?.lower ?? (houseA && houseA.level === 0 ? houseA.door : null);
  if (!landing) return { houseA, stairs };
  let houseB: PlacedHouse | null = null;
  const fallSide = ctx.water?.waterfall ? Math.sign(dot(direction(ctx.water.waterfall.angle), frame.right)) || 1 : (random() < 0.5 ? -1 : 1);
  for (let attempt = 0; attempt < 8 && !houseB; attempt++) {
    const candidate = placeHouse(ctx, 1, 0, "houseB", (p) => {
      const q = local(ctx, p);
      const d = dist(p, landing);
      return q.u * fallSide * 0.35 - Math.abs(d - 6) * 0.3 - Math.max(0, frame.vMin + 4.5 - q.v) * 2;
    }, (p) => normalize({ x: landing.x - p.x, z: landing.z - p.z }));
    if (!candidate) break;
    let traced: PathResult | null = null;
    for (let k = 0; k < 6 && !traced; k++) traced = tracePath(ctx, landing, candidate.door, 0, ["houseB", stairs[0]?.id ?? "", houseA?.id ?? ""], true);
    if (!traced) {
      ctx.props.pop();
      ctx.blockers = ctx.blockers.filter((b) => b.id !== "houseB");
      continue;
    }
    houseB = candidate;
    if (traced.crossing) {
      const [a, b] = traced.crossing;
      addPath(ctx, traced.points.slice(0, a + 1), 0, "pathB");
      addPath(ctx, traced.points.slice(b - 1), 0, "pathB");
      addBridge(ctx, traced.points, traced.crossing);
    } else addPath(ctx, traced.points, 0, "pathB");
  }
  // A small shed on big pieces, on the dry side.
  let shed: PlacedHouse | null = null;
  if (ctx.piece.area > 280) {
    shed = placeHouse(ctx, 2, 0, "shed", (p) => {
      const q = local(ctx, p);
      return -q.u * fallSide * 0.3 + q.v * 0.1 - Math.abs(dist(p, landing) - 4) * 0.25;
    }, (p) => normalize({ x: landing.x - p.x, z: landing.z - p.z }));
    if (shed) {
      const traced = tracePath(ctx, shed.door, landing, 0, ["shed", stairs[0]?.id ?? "", "pathB"], false);
      if (traced) addPath(ctx, traced.points, 0, "pathC");
    }
  }
  // Rail along the front of each terrace, leaving the stairs and fall open.
  tiers.forEach((tier, t) => {
    const avoid = [stairs[t] ? angleOf({ x: stairs[t].top.x - tier.centre.x, z: stairs[t].top.z - tier.centre.z }) : 99];
    if (t === 0 && ctx.water?.waterfall) avoid.push(ctx.water.waterfall.angle);
    const frontAngle = angleOf(front);
    const span = 0.9 + random() * 0.5;
    tierEdgeFence(ctx, tier, frontAngle - span, frontAngle + span * (0.6 + random() * 0.5), avoid);
  });
  // A short yard fence behind the lower house.
  if (houseB) {
    const house = HOUSES[houseB.variant];
    const behind = add(houseB.at, houseB.facing, -(house.depth / 2 * HOUSE_SCALE + 0.55));
    const across = { x: -houseB.facing.z, z: houseB.facing.x };
    const posts = [-1.5, -0.75, 0, 0.75, 1.5].map((s) => add(behind, across, s * (house.width * HOUSE_SCALE / 2.2)));
    addFence(ctx, posts, ctx.capY, 0);
  }
  return { houseA, houseB, shed, stairs };
}

function planMountain(ctx: PlanContext) {
  const { frame, random } = ctx;
  const fall = ctx.water?.waterfall;
  const dry = fall ? -(Math.sign(dot(direction(fall.angle), frame.right)) || 1) : 1;
  let radius = ctx.piece.area < 150 ? 1.3 + random() * 0.3 : 2.1 + random() * 0.45;
  let best: { p: PuzzlePoint; level: number } | null = null, bestScore = -Infinity;
  for (let k = 0; k < 600; k++) {
    if (k % 150 === 149 && !best) radius *= 0.82;
    const p = sampleInPiece(ctx);
    const level = levelOf(ctx, p, radius);
    if (level < 0 || !freeFor(ctx, p, radius + 0.2, level)) continue;
    const q = local(ctx, p);
    const score = q.v * 0.5 + q.u * dry * 0.35 + level * 0.6 + random() * 0.5;
    if (score > bestScore) { bestScore = score; best = { p, level }; }
  }
  if (!best) return;
  const y = levelY(ctx, best.level);
  const height = radius * (1.75 + random() * 0.4);
  // One tall peak and a skirt of smaller chunks: a craggy rock hill.
  place(ctx, "boulder", 0, best.p, y - 0.1, random() * TAU, [radius * 0.72, height, radius * 0.66]);
  const chunks = 5 + Math.floor(random() * 3);
  for (let k = 0; k < chunks; k++) {
    const a = k / chunks * TAU + random() * 0.5;
    const size = radius * (0.34 + random() * 0.2);
    // The whole chunk stays inside the hill's cleared radius.
    const reach = Math.min(radius * (0.45 + random() * 0.25), radius * 0.96 - PROP_REACH.boulder * size);
    place(ctx, "boulder", 1 + (k % 2), add(best.p, direction(a), reach), y - 0.08, random() * TAU, [size, size * (1.1 + random() * 1.3) * (height / 3), size * 0.9]);
  }
  ctx.blockers.push({ ...best.p, r: radius + 0.1, id: "mountain" });
}

type TreeSpot = PuzzlePoint & { r: number; prop: PropPlacement };

function planForest(ctx: PlanContext, trees: TreeSpot[]) {
  const { polygon, frame, random } = ctx;
  const lengths = [0];
  for (let k = 0; k < polygon.length; k++) lengths.push(lengths[k] + dist(polygon[k], polygon[(k + 1) % polygon.length]));
  const perimeter = lengths[polygon.length];
  const front = { x: -frame.back.x, z: -frame.back.z };
  const attempts = Math.round(perimeter * 4.5);
  for (let n = 0; n < attempts; n++) {
    const s = random() * perimeter;
    let k = 0;
    while (k < polygon.length - 1 && lengths[k + 1] < s) k++;
    const a = polygon[k], b = polygon[(k + 1) % polygon.length];
    const t = (s - lengths[k]) / Math.max(1e-6, lengths[k + 1] - lengths[k]);
    const edgePoint = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    let normal = normalize({ x: -(b.z - a.z), z: b.x - a.x });
    if (!inside(ctx, add(edgePoint, normal, 0.05))) normal = { x: -normal.x, z: -normal.z };
    // Edges facing the camera stay low so the meadow and items remain visible.
    const frontness = -dot(normal, front);
    const low = frontness > 0.35;
    const roll = random();
    // Broadleaf crowns are wider and get rejected more often, so they are
    // drawn more often to keep the mixed conifer/broadleaf rim.
    const kind: PropKind = low ? (roll < 0.7 ? "bush" : "conifer") : roll < 0.1 ? "bush" : roll < 0.45 ? "conifer" : "broadleaf";
    const size = low && kind !== "bush" ? 0.55 + random() * 0.15 : kind === "broadleaf" ? 0.72 + random() * 0.38 : 0.8 + random() * 0.45;
    const bushSize = 0.32 + random() * 0.22;
    const r = kind === "bush" ? bushSize * PROP_REACH.bush : PROP_REACH[kind as "conifer" | "broadleaf"] * size;
    const depth = r + 0.08 + random() ** 1.7 * (low ? 0.5 : 1.9);
    const p = add(edgePoint, normal, depth);
    if (low && kind !== "bush" && random() < 0.6) continue;
    if (rim(ctx, p) < r + 0.05) continue;
    const trunk = kind === "bush" ? r : 0.32;
    const level = levelOf(ctx, p, trunk);
    if (level < 0 || wet(ctx, p, trunk + 0.1) || blocked(ctx, p, kind === "bush" ? r : r * 0.62)) continue;
    // Crowns may touch for a lush rim, trunks keep their distance.
    if (trees.some((q) => dist(q, p) < (q.r + r) * 0.7)) continue;
    const y = levelY(ctx, level);
    const variant = Math.floor(random() * 3);
    if (kind === "bush") place(ctx, "bush", variant, p, y, random() * TAU, [bushSize, bushSize * (0.8 + random() * 0.3), bushSize]);
    else place(ctx, kind, variant, p, y, random() * TAU, [size, size * (0.9 + random() * 0.35), size]);
    trees.push({ ...p, r, prop: ctx.props[ctx.props.length - 1] });
  }
  const blockerOf = (tree: TreeSpot): Blocker => ({ x: tree.x, z: tree.z, r: tree.r * 0.8, id: "tree" });
  const fixed = ctx.blockers.length;
  trees.forEach((tree) => ctx.blockers.push(blockerOf(tree)));
  // Small pieces: drop the innermost trees until a semester of items fits.
  const byDepth = [...trees].sort((a, b) => rim(ctx, a) - rim(ctx, b));
  while (byDepth.length && itemCapacity(ctx) < CAPACITY_TARGET) {
    const removed = byDepth.splice(byDepth.length - Math.max(1, Math.ceil(byDepth.length * 0.08)));
    ctx.props = ctx.props.filter((prop) => !removed.some((tree) => tree.prop === prop));
    ctx.blockers = [...ctx.blockers.slice(0, fixed), ...byDepth.map(blockerOf)];
  }
}

function placeableAt(ctx: PlanContext, x: number, z: number, radius: number, edgeMargin = ctx.edgeMargin) {
  const p = { x, z };
  if (!inside(ctx, p) || distanceToPuzzleRim(p, ctx.polygon) < edgeMargin) return false;
  if (ctx.tiers.some((tier) => tierZone(tier, x, z, radius) === "bank")) return false;
  if (ctx.water && ctx.water.sdf(x, z) < radius + SHORE_WIDTH) return false;
  return !ctx.blockers.some((b) => dist(b, p) < b.r + radius);
}

// Items that fit on a grid whose spacing equals the item gap.
function itemCapacity(ctx: PlanContext) {
  const { polygon } = ctx;
  const xs = polygon.map((p) => p.x), zs = polygon.map((p) => p.z);
  let fits = 0;
  for (let x = Math.min(...xs); x < Math.max(...xs); x += ITEM_GAP) for (let z = Math.min(...zs); z < Math.max(...zs); z += ITEM_GAP) {
    if (placeableAt(ctx, x, z, ITEM_RADIUS)) fits++;
  }
  return fits;
}

function planDetails(ctx: PlanContext, houses: (PlacedHouse | null | undefined)[]) {
  const { random } = ctx;
  // Bushes and flowers hugging each house.
  for (const house of houses) {
    if (!house) continue;
    const size = HOUSES[house.variant];
    const across = { x: -house.facing.z, z: house.facing.x };
    for (const s of [-1, 1]) {
      const p = add(add(house.at, across, s * (size.width / 2 * HOUSE_SCALE + 0.45)), house.facing, (random() - 0.3) * size.depth * 0.6);
      const r = 0.34 + random() * 0.14;
      if (freeFor(ctx, p, r * PROP_REACH.bush, house.level)) {
        place(ctx, "bush", Math.floor(random() * 3), p, levelY(ctx, house.level), random() * TAU, [r, r * 0.9, r]);
        ctx.blockers.push({ ...p, r, id: "bush" });
      }
      const f = add(add(house.at, across, s * (size.width / 2 * HOUSE_SCALE - 0.2)), house.facing, size.depth / 2 * HOUSE_SCALE + 0.3);
      if (freeFor(ctx, f, PROP_REACH.flower, house.level)) {
        place(ctx, "flower", Math.floor(random() * 4), f, levelY(ctx, house.level), random() * TAU, [1, 1, 1]);
        ctx.blockers.push({ ...f, r: PROP_REACH.flower, id: "flower" });
      }
    }
  }
  // Pebbles on the shore, lily pads on the ponds, foam under the fall.
  const water = ctx.water;
  if (water) {
    for (const loop of water.bankLoops) {
      for (let k = 0; k < loop.length; k += 5) {
        if (random() < 0.45) continue;
        const p = loop[k], q = loop[(k + 1) % loop.length];
        const out = normalize({ x: -(q.z - p.z), z: q.x - p.x });
        const probe = add(p, out, 0.1);
        const sign = water.sdf(probe.x, probe.z) > 0 ? 1 : -1;
        const at = add(p, out, sign * (0.06 + random() * 0.14));
        const r = 0.09 + random() * 0.12;
        if (rim(ctx, at) < r + 0.3 || levelOf(ctx, at, r) !== 0 || blocked(ctx, at, r)) continue;
        place(ctx, "stone", Math.floor(random() * 3), at, ctx.capY - 0.03, random() * TAU, [r, r * (0.55 + random() * 0.3), r * (0.8 + random() * 0.3)]);
      }
    }
    const g = water.grid;
    let lilies = 0;
    for (let n = 0; n < 400 && lilies < 7; n++) {
      const p = { x: g.minX + random() * (g.nx - 1) * g.cell, z: g.minZ + random() * (g.nz - 1) * g.cell };
      if (water.sdf(p.x, p.z) > -0.28 || tierOffset(ctx.tiers[0], p.x, p.z) < 0.6) continue;
      const r = 0.13 + random() * 0.08;
      place(ctx, "lily", Math.floor(random() * 2), p, water.surfaceY + 0.006, random() * TAU, [r, 1, r]);
      lilies++;
    }
    const fall = water.waterfall;
    if (fall) {
      const tier = ctx.tiers[fall.tier];
      const dir = direction(fall.angle);
      const base = add(tier.centre, dir, tierRadiusAt(tier, fall.angle) + TIER_PROFILE[TIER_PROFILE.length - 1].offset * tier.step * 0.8);
      for (let k = 0; k < 6; k++) {
        const p = add(add(base, dir, random() * 0.35), { x: -dir.z, z: dir.x }, (random() - 0.5) * 0.55);
        const r = 0.1 + random() * 0.09;
        place(ctx, "foam", 0, p, water.surfaceY + 0.02, random() * TAU, [r, r * 0.6, r]);
      }
      for (const pool of water.pools) {
        for (let k = 0; k < 7; k++) {
          const a = k / 7 * TAU + random() * 0.4;
          if (Math.abs(wrap(a - fall.angle)) < 0.5) continue;
          const r = 0.09 + random() * 0.07;
          place(ctx, "stone", Math.floor(random() * 3), add(pool, direction(a), pool.r + 0.04), pool.y - 0.01, random() * TAU, [r, r * 0.7, r]);
        }
      }
    }
  }
  // Loose stones at the terrace feet and a few meadow boulders.
  for (const tier of ctx.tiers) {
    for (let k = 0; k < 9; k++) {
      const a = random() * TAU;
      const p = add(tier.centre, direction(a), tierRadiusAt(tier, a) + (TIER_PROFILE[TIER_PROFILE.length - 1].offset + 0.25) * tier.step + random() * 0.2);
      const r = 0.12 + random() * 0.14;
      if (!freeFor(ctx, p, r * PROP_REACH.stone, tier.index)) continue;
      place(ctx, "stone", Math.floor(random() * 3), p, levelY(ctx, tier.index) - 0.03, random() * TAU, [r, r * 0.7, r]);
      ctx.blockers.push({ ...p, r, id: "stone" });
    }
  }
  for (let k = 0; k < 4; k++) {
    const p = sampleInPiece(ctx);
    const r = 0.22 + random() * 0.2;
    const level = levelOf(ctx, p, r);
    if (level < 0 || rim(ctx, p) > 3.2 || !freeFor(ctx, p, r * PROP_REACH.boulder + 0.05, level)) continue;
    place(ctx, "boulder", 1 + (k % 2), p, levelY(ctx, level) - 0.04, random() * TAU, [r, r * 0.8, r]);
    ctx.blockers.push({ ...p, r, id: "boulder" });
  }
}

const landscapeCache = new Map<string, PieceLandscape>();

export function getPieceLandscape(layout: IslandLayout, pieceIndex: number): PieceLandscape {
  const key = `${layout.seed}:${PUZZLE_SEED}:${pieceIndex}`;
  let landscape = landscapeCache.get(key);
  if (!landscape) {
    landscape = createPieceLandscape(layout, pieceIndex);
    landscapeCache.set(key, landscape);
  }
  return landscape;
}

// Uncached build; the plan depends only on the layout seed and piece index.
export function createPieceLandscape(layout: IslandLayout, pieceIndex: number): PieceLandscape {
  const piece = getPuzzleLayout(layout, PUZZLE_SEED).pieces[pieceIndex];
  if (!piece) throw new Error(`Unknown puzzle piece ${pieceIndex}`);
  const polygon = getPuzzlePiecePolygon(piece);
  const { W } = getPuzzleTerrainMetrics(layout, pieceIndex, "personal", PUZZLE_SEED);
  const terrainW = W / ISLAND_SCALE;
  const ctx: PlanContext = {
    layout, piece, polygon, frame: makeFrame(layout, pieceIndex, polygon),
    random: seededRandom(layout.seed * 7919 + PUZZLE_SEED * 31 + pieceIndex * 7717),
    tiers: [], water: null, blockers: [], props: [], paths: [], capY: layout.surfaceY + CAP_LIFT, edgeMargin: terrainW * 0.08,
  };
  planTiers(ctx, terrainW);
  planWater(ctx);
  const settlement = planSettlement(ctx);
  planMountain(ctx);
  planDetails(ctx, [settlement.houseA, settlement.houseB, settlement.shed]);
  planForest(ctx, []);
  const { tiers, water, blockers, edgeMargin } = ctx;
  const offset = (x: number, z: number) => {
    const rise = offsetAt(tiers, x, z);
    return rise < 1e-6 && water && water.sdf(x, z) < 0 ? -WATER_LEVEL : rise;
  };
  const landscape: PieceLandscape = {
    pieceIndex, piece, polygon, capY: ctx.capY, edgeMargin, tiers, water, paths: ctx.paths, props: ctx.props, blockers,
    heightAt: (x, z) => layout.surfaceY + offset(x, z),
    surfaceAt: (x, z) => ctx.capY + offset(x, z),
    canPlace: (x, z, radius) => placeableAt(ctx, x, z, radius),
  };
  return landscape;
}

export function tierRingPoint(tier: Tier, angle: number, offset: number) {
  return add(tier.centre, direction(angle), tierRadiusAt(tier, angle) + offset * tier.step);
}
