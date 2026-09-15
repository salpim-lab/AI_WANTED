import { MathUtils } from "three";
import type { IslandGift } from "./types";

// Mean meadow radius. The oval's long axis is 10% longer, its short axis 10% shorter.
export const ISLAND_RADIUS = 14;
// Height of the meadow rim. Gentle hills rise above it; the rock body hangs below.
export const SURFACE_Y = 0.83;
// Items stay this far inside the rim so they never sit on the rounded grass lip.
const EDGE_MARGIN = 0.9;
// The default camera looks from +X/+Z, so this long axis spans the screen horizontally.
const LONG_AXIS = -Math.PI / 4;

// Decorations hug the rim, measured by angle (deg, from +X toward +Z) and
// fraction of the local radius, so they stay inside any seeded outline.
// The default camera looks from 45°: tall trees stand on the far side
// (150°–300°) and only low rocks, flowers and grass sit in front.
const DECORATION_LAYOUT = [
  { kind: "tree", angle: 222, reach: 0.74, radius: 2.0 },
  { kind: "tree", angle: 284, reach: 0.82, radius: 1.3 },
  { kind: "pine", angle: 250, reach: 0.8, radius: 1.1 },
  { kind: "pine", angle: 196, reach: 0.82, radius: 0.95 },
  { kind: "pine", angle: 168, reach: 0.85, radius: 0.85 },
  { kind: "pine", angle: 306, reach: 0.86, radius: 0.8 },
  { kind: "bush", angle: 208, reach: 0.89, radius: 0.75 },
  { kind: "bush", angle: 266, reach: 0.9, radius: 0.8 },
  { kind: "bush", angle: 150, reach: 0.87, radius: 0.75 },
  { kind: "bush", angle: 322, reach: 0.88, radius: 0.7 },
  { kind: "grass", angle: 100, reach: 0.88, radius: 0.6 },
  { kind: "flower", angle: 128, reach: 0.84, radius: 0.85 },
  { kind: "flower", angle: 72, reach: 0.86, radius: 0.8 },
  { kind: "flower", angle: 12, reach: 0.86, radius: 0.8 },
  { kind: "rock", angle: 40, reach: 0.82, radius: 1.0 },
  { kind: "rock", angle: 338, reach: 0.87, radius: 0.75 },
  { kind: "rock", angle: 112, reach: 0.88, radius: 0.7 },
] as const;

// Small unreserved details scattered inside the no-placement shore band.
const SHORE_SCATTER = [
  { kind: "tuft", count: 46 },
  { kind: "bloom", count: 18 },
  { kind: "pebble", count: 16 },
] as const;

const HILLS = [
  { angle: 228, reach: 0.32, height: 1.35, width: 5.4 },
  { angle: 150, reach: 0.5, height: 0.95, width: 3.6 },
  { angle: 335, reach: 0.42, height: 0.75, width: 3.2 },
];

export type DecorationKind = (typeof DECORATION_LAYOUT)[number]["kind"];
export type Decoration = { kind: DecorationKind; x: number; z: number; radius: number };
export type ScatterKind = (typeof SHORE_SCATTER)[number]["kind"];
// `size` is a scale factor around 1; `tone` picks a palette entry.
export type Scatter = { kind: ScatterKind; x: number; z: number; size: number; tone: number };

export type IslandLayout = {
  seed: number;
  surfaceY: number;
  // Distance from the island centre to the meadow rim at an angle (radians, from +X toward +Z).
  radiusAt: (angle: number) => number;
  // Meadow height at a point inside the rim; SURFACE_Y at and beyond the rim.
  heightAt: (x: number, z: number) => number;
  decorations: Decoration[];
  // Grass tufts, blooms and pebbles that only ever land where items can't go.
  scatter: Scatter[];
  // Fresh deterministic stream for this island, so meshes can add their own detail.
  random: (salt: number) => () => number;
};

// mulberry32
export function seededRandom(seed: number) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createIslandLayout(seed: number): IslandLayout {
  const random = seededRandom(seed);
  const a = ISLAND_RADIUS * 1.1, b = ISLAND_RADIUS * 0.9;
  // A few low harmonics wobble the oval into an organic, never-circular rim.
  const waves = [[2, 0.04], [3, 0.032], [4, 0.022], [5, 0.014], [7, 0.007]].map(([k, amp]) => ({
    k, amp: amp * (0.6 + random() * 0.8), phase: random() * Math.PI * 2,
  }));
  const radiusAt = (angle: number) => {
    const u = angle - LONG_AXIS;
    const oval = 1 / Math.hypot(Math.cos(u) / a, Math.sin(u) / b);
    return oval * (1 + waves.reduce((sum, w) => sum + w.amp * Math.sin(w.k * angle + w.phase), 0));
  };
  const polar = (degrees: number, reach: number) => {
    const angle = MathUtils.degToRad(degrees);
    const r = radiusAt(angle) * reach;
    return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
  };

  const hills = HILLS.map((hill) => ({
    ...polar(hill.angle + (random() - 0.5) * 30, hill.reach),
    height: hill.height * (0.85 + random() * 0.3),
    width: hill.width,
  }));
  const heightAt = (x: number, z: number) => {
    const s = Math.hypot(x, z) / radiusAt(Math.atan2(z, x));
    if (s >= 1) return SURFACE_Y;
    const inland = 1 - MathUtils.smoothstep(s, 0.3, 1);
    const dome = 0.3 * (1 - s * s);
    const bumps = hills.reduce((sum, h) => sum + h.height * Math.exp(-((x - h.x) ** 2 + (z - h.z) ** 2) / (2 * h.width ** 2)), 0);
    return SURFACE_Y + dome + bumps * inland;
  };

  const decorations: Decoration[] = DECORATION_LAYOUT.map(({ kind, angle, reach, radius }) => ({ kind, radius, ...polar(angle, reach) }));
  const scatter = createScatter(seededRandom(seed * 7919 + 2), radiusAt, decorations);

  return {
    seed,
    surfaceY: SURFACE_Y,
    radiusAt,
    heightAt,
    decorations,
    scatter,
    random: (salt) => seededRandom(seed * 7919 + salt),
  };
}

// Scatter fills the shore band inside the edge margin, plus tufts at the foot
// of each decoration within its footprint, so it never takes open meadow.
function createScatter(random: () => number, radiusAt: (angle: number) => number, decorations: Decoration[]) {
  const scatter: Scatter[] = [];
  const trunks = decorations.filter((detail) => detail.kind === "tree" || detail.kind === "pine");
  for (const { kind, count } of SHORE_SCATTER) {
    for (let k = 0; k < count; k++) {
      const angle = (k + random() * 0.8) / count * Math.PI * 2;
      const r = radiusAt(angle) - (0.25 + random() * 0.5);
      const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
      if (trunks.some((tree) => Math.hypot(tree.x - x, tree.z - z) < tree.radius * 0.7)) continue;
      scatter.push({ kind, x, z, size: 0.75 + random() * 0.5, tone: Math.floor(random() * 4) });
    }
  }
  for (const detail of decorations) {
    if (detail.kind === "grass" || detail.kind === "flower") continue;
    for (let k = 0; k < 3; k++) {
      const angle = random() * Math.PI * 2;
      const reach = detail.radius * (0.75 + random() * 0.3) + 0.1;
      const x = detail.x + Math.cos(angle) * reach, z = detail.z + Math.sin(angle) * reach;
      if (Math.hypot(x, z) > radiusAt(Math.atan2(z, x)) - 0.25) continue;
      scatter.push({ kind: "tuft", x, z, size: 0.7 + random() * 0.4, tone: Math.floor(random() * 4) });
    }
  }
  return scatter;
}

// Only the rim, sparse natural details and confirmed items constrain the
// large long-term placement field.
export function canPlaceGift(x: number, z: number, layout: IslandLayout): boolean {
  const inside = Math.hypot(x, z) <= layout.radiusAt(Math.atan2(z, x)) - EDGE_MARGIN;
  return inside && !layout.decorations.some((detail) =>
    Math.hypot(detail.x - x, detail.z - z) < detail.radius + 0.55,
  );
}

export function canPlaceAmongGifts(x: number, z: number, layout: IslandLayout, gifts: IslandGift[], movingId: string | null = null): boolean {
  return canPlaceGift(x, z, layout) && !gifts.some((gift) => gift.id !== movingId && Math.hypot(gift.x - x, gift.z - z) < 0.75);
}
