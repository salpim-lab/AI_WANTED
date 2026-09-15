import { Shape, Vector2 } from "three";
import type { IslandGift, PuzzleEdges } from "./types";

export const TILE_SIZE = 22;
export const SURFACE_Y = 0.83;

export const NATURAL_DECORATIONS = [
  { kind: "grass", x: -8.2, z: -6.8, radius: 0.42 },
  { kind: "grass", x: -7.6, z: 2.7, radius: 0.4 },
  { kind: "grass", x: -4.3, z: 7.4, radius: 0.45 },
  { kind: "grass", x: -0.8, z: -8.1, radius: 0.42 },
  { kind: "grass", x: 2.7, z: 8.3, radius: 0.44 },
  { kind: "grass", x: 6.8, z: -3.2, radius: 0.43 },
  { kind: "grass", x: 8.1, z: 5.2, radius: 0.4 },
  { kind: "flower", x: -6.2, z: -2.9, radius: 0.38 },
  { kind: "flower", x: -5.8, z: 5.4, radius: 0.38 },
  { kind: "flower", x: 1.8, z: -6.9, radius: 0.4 },
  { kind: "flower", x: 5.1, z: 6.7, radius: 0.38 },
  { kind: "flower", x: 7.6, z: 0.9, radius: 0.38 },
  { kind: "rock", x: -8.3, z: -0.8, radius: 0.48 },
  { kind: "rock", x: -3.6, z: -7.1, radius: 0.5 },
  { kind: "rock", x: -1.1, z: 8.0, radius: 0.46 },
  { kind: "rock", x: 4.8, z: -7.3, radius: 0.52 },
  { kind: "rock", x: 8.4, z: 3.1, radius: 0.48 },
] as const;

// Edges are north/east/south/west. Opposing neighbors always have inverse
// connectors; the outside of a completed classroom puzzle has flat edges.
export function classroomEdges(row: number, col: number, rows = 3, cols = 3): PuzzleEdges {
  return [
    row === 0 ? 0 : row % 2 ? -1 : 1,
    col === cols - 1 ? 0 : col % 2 ? 1 : -1,
    row === rows - 1 ? 0 : row % 2 ? -1 : 1,
    col === 0 ? 0 : col % 2 ? 1 : -1,
  ];
}

export function createPuzzleShape(edges: PuzzleEdges): Shape {
  const shape = new Shape();
  const h = TILE_SIZE / 2;
  const connectorScale = TILE_SIZE / 5;
  const radius = 0.2 * connectorScale;
  shape.moveTo(-h + radius, h);

  for (let side = 0; side < 4; side++) {
    const transform = (x: number, y: number): [number, number] => {
      const angle = -side * Math.PI / 2;
      return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
    };
    const line = (x: number, y: number) => shape.lineTo(...transform(x, y));
    const curve = (a: number, b: number, c: number, d: number, e: number, f: number) =>
      shape.bezierCurveTo(...transform(a, b), ...transform(c, d), ...transform(e, f));
    const edge = edges[side];
    if (edge !== 0) {
      line(-0.72 * connectorScale, h);
      curve(-0.36 * connectorScale, h, -0.34 * connectorScale, h + edge * 0.07 * connectorScale, -0.43 * connectorScale, h + edge * 0.26 * connectorScale);
      curve(-0.79 * connectorScale, h + edge * 0.91 * connectorScale, 0.79 * connectorScale, h + edge * 0.91 * connectorScale, 0.43 * connectorScale, h + edge * 0.26 * connectorScale);
      curve(0.34 * connectorScale, h + edge * 0.07 * connectorScale, 0.36 * connectorScale, h, 0.72 * connectorScale, h);
    }
    line(h - radius, h);
    curve(h - radius * 0.45, h, h, h - radius * 0.45, h, h - radius);
  }
  shape.closePath();
  return shape;
}

export function insideOutline(x: number, z: number, points: Vector2[]): boolean {
  const y = -z;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// Only the puzzle edge, sparse natural details and confirmed items constrain
// the large long-term placement field.
export function canPlaceGift(x: number, z: number, points: Vector2[]): boolean {
  const safelyInside = [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]
    .every(([dx, dz]) => insideOutline(x + dx, z + dz, points));
  return safelyInside && !NATURAL_DECORATIONS.some((detail) =>
    Math.hypot(detail.x - x, detail.z - z) < detail.radius + 0.55,
  );
}

export function canPlaceAmongGifts(x: number, z: number, outline: Vector2[], gifts: IslandGift[], movingId: string | null = null): boolean {
  return canPlaceGift(x, z, outline) && !gifts.some((gift) => gift.id !== movingId && Math.hypot(gift.x - x, gift.z - z) < 0.75);
}
