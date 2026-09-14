import { Shape, Vector2 } from "three";
import type { PuzzleEdges } from "./types";

export const TILE_SIZE = 5;
export const SURFACE_Y = 0.83;
export const FLOWER_BEDS = [[-1.62, 1.03], [-1.95, -0.45], [-0.08, -1.5], [1.98, 1.78], [0.32, -1.95], [-2.02, 1.89]] as const;

export function createGardenPath(): Shape {
  const path = new Shape();
  path.moveTo(-0.95, 0.40);
  path.bezierCurveTo(-0.25, 0.5, -0.48, -0.15, -0.29, -0.5);
  path.bezierCurveTo(-0.1, -1.1, 0.9, -1.23, 1.1, -2.47);
  path.lineTo(0.60, -2.47);
  path.bezierCurveTo(0.65, -1.45, -0.55, -1.18, -0.72, -0.7);
  path.bezierCurveTo(-1.0, -0.04, -0.8, 0.15, -1.17, 0.25);
  path.closePath();
  return path;
}

const pathOutline = createGardenPath().getPoints(28);

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
  const radius = 0.2;
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
      line(-0.72, h);
      curve(-0.36, h, -0.34, h + edge * 0.07, -0.43, h + edge * 0.26);
      curve(-0.79, h + edge * 0.91, 0.79, h + edge * 0.91, 0.43, h + edge * 0.26);
      curve(0.34, h + edge * 0.07, 0.36, h, 0.72, h);
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

// Keep future item placement clear of the cottage, pond, trees and tile edges.
export function canPlaceGift(x: number, z: number, points: Vector2[]): boolean {
  if (![[0, 0], [0.24, 0], [-0.24, 0], [0, 0.24], [0, -0.24]].every(([dx, dz]) => insideOutline(x + dx, z + dz, points))) return false;
  if (x > -1.8 && x < -0.2 && z > -1.8 && z < -0.25) return false;
  if (x > -1.95 && x < -0.7 && z > -0.28 && z < 0.16) return false;
  if (((x - 1.05) / 0.85) ** 2 + ((z - 0.15) / 1.03) ** 2 < 1) return false;
  if (insideOutline(x, z, pathOutline)) return false;
  if (FLOWER_BEDS.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 0.48)) return false;
  return ![[-1.92, -1.4], [1.65, -1.65], [2.0, 0.7]].some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 0.47);
}
