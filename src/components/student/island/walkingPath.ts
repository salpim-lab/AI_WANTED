import { findHomePath } from "./homecoming";
import type { PieceLandscape, PropPlacement } from "./pieceLandscape";
import type { PuzzlePoint } from "./puzzle";

const distance = (a: PuzzlePoint, b: PuzzlePoint) => Math.hypot(a.x - b.x, a.z - b.z);
const routeLength = (points: PuzzlePoint[]) => points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
const localPoint = (stair: PropPlacement, p: PuzzlePoint) => ({
  x: (p.x - stair.x) * Math.cos(stair.rotation) - (p.z - stair.z) * Math.sin(stair.rotation),
  z: (p.x - stair.x) * Math.sin(stair.rotation) + (p.z - stair.z) * Math.cos(stair.rotation),
});
const stairPoint = (stair: PropPlacement, along: number): PuzzlePoint => ({
  x: stair.x + Math.sin(stair.rotation) * along,
  z: stair.z + Math.cos(stair.rotation) * along,
});

/** Flat-ground paths join mandatory, complete stair flights at their landings. */
export function findWalkingPath(
  landscape: PieceLandscape,
  from: PuzzlePoint,
  to: PuzzlePoint,
  radius: number,
  clearOfItems: (point: PuzzlePoint) => boolean = () => true,
): PuzzlePoint[] | null {
  const stairs = landscape.props.filter((prop) => prop.kind === "stairs");
  const canWalk = (x: number, z: number, clearance = radius) =>
    landscape.canWalk(x, z, clearance) && clearOfItems({ x, z });
  if (!canWalk(to.x, to.z)) return null;
  const clearSegment = (a: PuzzlePoint, b: PuzzlePoint) => {
    const count = Math.max(1, Math.ceil(distance(a, b) / 0.03));
    for (let i = 1; i <= count; i++) {
      if (!canWalk(a.x + (b.x - a.x) * i / count, a.z + (b.z - a.z) * i / count)) return false;
    }
    return true;
  };
  const occupyingStair = (p: PuzzlePoint) => stairs.find((stair) => {
    const local = localPoint(stair, p);
    return Math.abs(local.x) <= stair.scale[0] * 0.45
      && Math.abs(local.z) < stair.scale[2] / 2 + 0.3;
  });
  const points = [from, to];
  for (const stair of stairs) points.push(stairPoint(stair, -stair.scale[2] / 2 - 0.5),
    stairPoint(stair, stair.scale[2] / 2 + 0.5));
  const edges: { to: number; path: PuzzlePoint[]; length: number }[][] = points.map(() => []);
  const connect = (a: number, b: number, path: PuzzlePoint[]) => {
    const length = routeLength(path);
    edges[a].push({ to: b, path, length });
    edges[b].push({ to: a, path: [...path].reverse(), length });
  };
  // Never simplify across these edges: their two landings are part of the route.
  stairs.forEach((_, i) => {
    const upper = 2 + i * 2, lower = upper + 1;
    if (clearSegment(points[upper], points[lower])) connect(upper, lower, [points[upper], points[lower]]);
  });
  // If keyboard movement was interrupted halfway along stairs, continue from
  // the current height to an end rather than jumping back to a landing.
  for (const endpoint of [0, 1]) {
    const stair = occupyingStair(points[endpoint]);
    if (!stair) continue;
    const local = localPoint(stair, points[endpoint]);
    const centre = stairPoint(stair, local.z);
    const index = stairs.indexOf(stair);
    for (const landing of [2 + index * 2, 3 + index * 2]) {
      if (clearSegment(points[endpoint], centre) && clearSegment(centre, points[landing]))
        connect(endpoint, landing, [points[endpoint], centre, points[landing]]);
    }
  }
  const flatLandscape = { ...landscape, canWalkHome: (x: number, z: number, clearance: number) => {
    if (!canWalk(x, z, clearance)) return false;
    // Keep ordinary ground segments out of the entire flight, including the
    // flat lower steps that previously allowed entering or leaving halfway.
    return !stairs.some((stair) => {
      const local = localPoint(stair, { x, z });
      return Math.abs(local.x) < stair.scale[0] / 2 + clearance
        && Math.abs(local.z) < stair.scale[2] / 2 + 0.3;
    });
  } };
  // Find shortest paths between landings on the same level. Different levels
  // can only connect via one of the explicit stair edges above.
  for (let a = 0; a < points.length; a++) {
    if (a < 2 && occupyingStair(points[a])) continue;
    for (let b = a + 1; b < points.length; b++) {
      if (b < 2 && occupyingStair(points[b])) continue;
      if (Math.abs(landscape.heightAt(points[a].x, points[a].z) - landscape.heightAt(points[b].x, points[b].z)) > 0.03) continue;
      const path = findHomePath(flatLandscape, points[a], points[b], radius);
      if (path) connect(a, b, path);
    }
  }
  const costs = points.map(() => Infinity), visited = new Set<number>();
  const previous = new Map<number, { from: number; path: PuzzlePoint[] }>();
  costs[0] = 0;
  for (let count = 0; count < points.length; count++) {
    let best = -1;
    for (let i = 0; i < points.length; i++) if (!visited.has(i) && (best < 0 || costs[i] < costs[best])) best = i;
    if (best < 0 || !Number.isFinite(costs[best])) break;
    if (best === 1) {
      const paths: PuzzlePoint[][] = [];
      for (let cursor = 1; cursor !== 0;) {
        const entry = previous.get(cursor)!;
        paths.push(entry.path);
        cursor = entry.from;
      }
      return paths.reverse().reduce((route, path) => [...route, ...path.slice(1)], [from]);
    }
    visited.add(best);
    for (const edge of edges[best]) {
      if (costs[best] + edge.length >= costs[edge.to]) continue;
      costs[edge.to] = costs[best] + edge.length;
      previous.set(edge.to, { from: best, path: edge.path });
    }
  }
  return null;
}
