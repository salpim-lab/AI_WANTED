import type { PieceLandscape } from "./pieceLandscape";
import type { PuzzlePoint } from "./puzzle";

/** Return straight across decorations; terrace changes still go through stairs. */
export function findHomePath(landscape: PieceLandscape, from: PuzzlePoint, to: PuzzlePoint, radius: number): PuzzlePoint[] | null {
  const step = 0.14;
  const key = (x: number, z: number) => `${x},${z}`;
  const point = (x: number, z: number) => ({ x: from.x + x * step, z: from.z + z * step });
  const clearSegment = (a: PuzzlePoint, b: PuzzlePoint) => {
    const samples = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.04));
    for (let i = 1; i <= samples; i++) if (!landscape.canWalkHome(a.x + (b.x - a.x) * i / samples, a.z + (b.z - a.z) * i / samples, radius + 0.012)) return false;
    return true;
  };
  if (clearSegment(from, to)) return [from, to];
  const start = { x: 0, z: 0, g: 0, f: 0 };
  const open = [start];
  const costs = new Map([[key(0, 0), 0]]);
  const parents = new Map<string, string>();
  const nodes = new Map([[key(0, 0), from]]);
  for (let visited = 0; open.length && visited < 40000; visited++) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
    const node = open.splice(best, 1)[0];
    const id = key(node.x, node.z), p = point(node.x, node.z);
    if (node.g !== costs.get(id)) continue;
    if (Math.hypot(p.x - to.x, p.z - to.z) < step * 2 && clearSegment(p, to)) {
      const result = [p];
      let cursor = id;
      while (parents.has(cursor)) { cursor = parents.get(cursor)!; result.push(nodes.get(cursor)!); }
      result.reverse();
      result.push(to);
      // Join visible waypoints into long straight segments, retaining only stair turns.
      const route = [result[0]];
      for (let i = 0; i < result.length - 1;) {
        let next = result.length - 1;
        while (next > i + 1 && !clearSegment(result[i], result[next])) next--;
        route.push(result[next]);
        i = next;
      }
      return route;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = node.x + dx, z = node.z + dz, q = point(x, z);
      if (!landscape.canWalkHome(q.x, q.z, radius + 0.012)) continue;
      if (!clearSegment(p, q)) continue;
      const nextId = key(x, z), g = node.g + step * Math.hypot(dx, dz);
      if (g >= (costs.get(nextId) ?? Infinity)) continue;
      costs.set(nextId, g); parents.set(nextId, id); nodes.set(nextId, q);
      open.push({ x, z, g, f: g + Math.hypot(q.x - to.x, q.z - to.z) });
    }
  }
  return null;
}
