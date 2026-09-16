import type { PuzzlePoint } from "./puzzle";

// Marching squares over a sampled scalar field. The same edge crossings feed
// both the traced outlines (cap holes, bank walls) and the filled water
// triangles, so every derived mesh shares one watertight boundary.
export type IsoGrid = { minX: number; minZ: number; cell: number; nx: number; nz: number; values: Float64Array };
export type IsoBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export function sampleIsoGrid(field: (x: number, z: number) => number, bounds: IsoBounds, cell: number): IsoGrid {
  const nx = Math.ceil((bounds.maxX - bounds.minX) / cell) + 1;
  const nz = Math.ceil((bounds.maxZ - bounds.minZ) / cell) + 1;
  const values = new Float64Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    values[i + j * nx] = field(bounds.minX + i * cell, bounds.minZ + j * cell);
  }
  return { minX: bounds.minX, minZ: bounds.minZ, cell, nx, nz, values };
}

function reader(grid: IsoGrid, level: number) {
  const { nx, cell, minX, minZ, values } = grid;
  const value = (i: number, j: number) => {
    const v = values[i + j * nx] - level;
    // Exact zeros would place a crossing on a corner and break the pairing.
    return Math.abs(v) < 1e-9 ? 1e-9 : v;
  };
  const crossing = (i0: number, j0: number, i1: number, j1: number): PuzzlePoint => {
    const a = value(i0, j0), b = value(i1, j1);
    const t = a / (a - b);
    return { x: minX + (i0 + (i1 - i0) * t) * cell, z: minZ + (j0 + (j1 - j0) * t) * cell };
  };
  return { value, crossing };
}

type Cell = { corners: [number, number][]; edges: [string, [number, number, number, number]][] };

function cellAt(i: number, j: number): Cell {
  // Corners 00, 10, 11, 01 and the edge that follows each of them.
  return {
    corners: [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]],
    edges: [
      [`h${i},${j}`, [i, j, i + 1, j]],
      [`v${i + 1},${j}`, [i + 1, j, i + 1, j + 1]],
      [`h${i},${j + 1}`, [i, j + 1, i + 1, j + 1]],
      [`v${i},${j}`, [i, j, i, j + 1]],
    ],
  };
}

// Closed outlines where field == level. The field must be positive along the
// grid border (pad the bounds) so every loop closes.
export function isoLoops(grid: IsoGrid, level = 0): PuzzlePoint[][] {
  const { value, crossing } = reader(grid, level);
  const links = new Map<string, string[]>();
  const points = new Map<string, PuzzlePoint>();
  const link = (a: string, b: string) => {
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  };
  for (let j = 0; j < grid.nz - 1; j++) for (let i = 0; i < grid.nx - 1; i++) {
    const cell = cellAt(i, j);
    const signs = cell.corners.map(([ci, cj]) => value(ci, cj) < 0);
    const crossed: string[] = [];
    cell.edges.forEach(([id, [i0, j0, i1, j1]], k) => {
      if (signs[k] === signs[(k + 1) % 4]) return;
      if (!points.has(id)) points.set(id, crossing(i0, j0, i1, j1));
      crossed.push(id);
    });
    if (crossed.length === 2) link(crossed[0], crossed[1]);
    else if (crossed.length === 4) {
      const centre = cell.corners.reduce((sum, [ci, cj]) => sum + value(ci, cj), 0) / 4 < 0;
      const [e0, e1, e2, e3] = cell.edges.map(([id]) => id);
      if (centre === signs[0]) { link(e0, e1); link(e2, e3); }
      else { link(e3, e0); link(e1, e2); }
    }
  }
  const loops: PuzzlePoint[][] = [];
  const visited = new Set<string>();
  for (const start of links.keys()) {
    if (visited.has(start)) continue;
    const loop: PuzzlePoint[] = [];
    let previous = "", current = start;
    while (!visited.has(current)) {
      visited.add(current);
      loop.push(points.get(current)!);
      const next = (links.get(current) ?? []).find((candidate) => candidate !== previous && !visited.has(candidate));
      if (!next) break;
      previous = current;
      current = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

// Triangles covering field < level, with the field value at every vertex so
// callers can shade by depth. Flat list: three entries per triangle.
export function isoFill(grid: IsoGrid, level = 0) {
  const { value, crossing } = reader(grid, level);
  const points: PuzzlePoint[] = [];
  const depth: number[] = [];
  const corner = (i: number, j: number): [PuzzlePoint, number] => [{ x: grid.minX + i * grid.cell, z: grid.minZ + j * grid.cell }, value(i, j)];
  const fan = (polygon: [PuzzlePoint, number][]) => {
    for (let k = 1; k < polygon.length - 1; k++) {
      for (const [point, v] of [polygon[0], polygon[k], polygon[k + 1]]) { points.push(point); depth.push(v); }
    }
  };
  for (let j = 0; j < grid.nz - 1; j++) for (let i = 0; i < grid.nx - 1; i++) {
    const cell = cellAt(i, j);
    const signs = cell.corners.map(([ci, cj]) => value(ci, cj) < 0);
    const inside = signs.filter(Boolean).length;
    if (!inside) continue;
    const polygon: [PuzzlePoint, number][] = [];
    const crossings: ([PuzzlePoint, number] | null)[] = cell.edges.map(([, [i0, j0, i1, j1]], k) =>
      signs[k] === signs[(k + 1) % 4] ? null : [crossing(i0, j0, i1, j1), 0]);
    const centreInside = cell.corners.reduce((sum, [ci, cj]) => sum + value(ci, cj), 0) / 4 < 0;
    if (inside === 2 && signs[0] === signs[2] && !centreInside) {
      // Saddle whose wet corners are not joined through the middle.
      for (let k = 0; k < 4; k++) if (signs[k]) {
        const previous = crossings[(k + 3) % 4]!, next = crossings[k]!;
        fan([corner(...cell.corners[k]), next, previous]);
      }
      continue;
    }
    for (let k = 0; k < 4; k++) {
      if (signs[k]) polygon.push(corner(...cell.corners[k]));
      if (crossings[k]) polygon.push(crossings[k]!);
    }
    fan(polygon);
  }
  return { points, depth };
}

export function loopArea(loop: PuzzlePoint[]) {
  return loop.reduce((sum, point, index) => {
    const next = loop[(index + 1) % loop.length];
    return sum + point.x * next.z - next.x * point.z;
  }, 0) / 2;
}

export function pointInLoop(point: PuzzlePoint, loop: PuzzlePoint[]) {
  let inside = false;
  for (let index = 0, previous = loop.length - 1; index < loop.length; previous = index++) {
    const a = loop[index], b = loop[previous];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
