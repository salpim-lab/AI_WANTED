type Point = { x: number; z: number };
type Terrain = {
  polygon: Point[];
  canPlace: (x: number, z: number, radius: number) => boolean;
  surfaceAt: (x: number, z: number) => number;
};

/** Constructive packing test, not a mathematical upper bound or free-placement guarantee. */
export function findCapacityLayout(terrain: Terrain, radius: number, gap = 0.1, target = Infinity): Point[] {
  const xs = terrain.polygon.map(p => p.x), zs = terrain.polygon.map(p => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const spacing = radius * 2 + gap;
  const rowSpacing = spacing * Math.sqrt(3) / 2;
  const safe = (x: number, z: number) => {
    if (!terrain.canPlace(x, z, radius)) return false;
    const y = terrain.surfaceAt(x, z);
    // Check the entire circular footprint stays on flat, placeable terrain.
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      const px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
      if (!terrain.canPlace(px, pz, 0) || Math.abs(terrain.surfaceAt(px, pz) - y) > 0.03) return false;
    }
    return true;
  };
  let best: Point[] = [];
  for (const transpose of [false, true]) for (const offsetX of [0, 0.25, 0.5, 0.75]) for (const offsetZ of [0, 0.5]) {
    const points: Point[] = [];
    const uMin = transpose ? minZ : minX, uMax = transpose ? maxZ : maxX;
    const vMin = transpose ? minX : minZ, vMax = transpose ? maxX : maxZ;
    let row = 0;
    for (let v = vMin + offsetZ * rowSpacing; v <= vMax; v += rowSpacing, row++) {
      for (let u = uMin + offsetX * spacing + (row % 2) * spacing / 2; u <= uMax; u += spacing) {
        const x = transpose ? v : u, z = transpose ? u : v;
        if (safe(x, z)) points.push({ x, z });
        if (points.length >= target) return points;
      }
    }
    if (points.length > best.length) best = points;
  }
  return best;
}
