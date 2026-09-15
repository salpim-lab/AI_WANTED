import { BufferGeometry, Color, Euler, Float32BufferAttribute, IcosahedronGeometry, Matrix4, ShapeUtils, Vector2, Vector3, type Shape } from "three";

// Low-poly diorama base under the exact puzzle outline: a thin bevelled grass
// cap, an uneven sliver of soil and a tapering rock body built from irregular
// rings. Everything is seeded and generated once per island, then returned as a
// single vertex-coloured geometry (one draw call).

export type TerrainOptions = { tileSize: number; surfaceY: number; seed: number };

type RingPoint = { t: number; x: number; y: number; z: number; groove: boolean };
type Chunk = { start: number; end: number; tone: number; push: number; drop: number; lift: number; tuck: number };

export function terrainProportions(tileSize: number) {
  return {
    grass: tileSize * 0.019,
    soil: tileSize * 0.021,
    rockBands: [tileSize * 0.025, tileSize * 0.033, tileSize * 0.023] as const,
    rockDrop: tileSize * 0.024,
    rim: tileSize * 0.0034,
  };
}

const color = (hex: string) => new Color(hex);
const PALETTE = {
  grass: color("#89aa55"),
  grassLight: color("#96b45f"),
  grassDark: color("#7f9f4e"),
  bevel: color("#9ab862"),
  lip: color("#7b9a4a"),
  under: color("#6b5a44"),
  soil: [color("#9b754f"), color("#876247"), color("#755540")],
  rock: [color("#807665"), color("#6c665a"), color("#58584f")],
  groove: color("#484b46"),
  moss: color("#7f8f55"),
};

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const wrap = (t: number) => ((t % 1) + 1) % 1;

// Smooth periodic noise along the outline parameter t (integer frequencies keep it seamless).
function periodicNoise(random: () => number, frequencies: number[]) {
  const terms = frequencies.map((frequency) => ({ frequency, phase: random() * Math.PI * 2, amplitude: 0.5 + random() * 0.5 }));
  const total = terms.reduce((sum, term) => sum + term.amplitude, 0);
  return (t: number) => terms.reduce((sum, term) => sum + term.amplitude * Math.sin(term.frequency * Math.PI * 2 * t + term.phase), 0) / total;
}

function createOutline(shape: Shape) {
  const raw = shape.getSpacedPoints(900);
  if (raw.length > 1 && raw[0].distanceToSquared(raw[raw.length - 1]) < 1e-8) raw.pop();
  // Shape Y becomes world -Z (the cap is laid flat by rotating -90° around X).
  const points = raw.map((point) => new Vector2(point.x, -point.y));
  const count = points.length;
  const cumulative = new Float64Array(count + 1);
  let doubleArea = 0;
  for (let i = 0; i < count; i++) {
    const a = points[i], b = points[(i + 1) % count];
    cumulative[i + 1] = cumulative[i] + a.distanceTo(b);
    doubleArea += a.x * b.y - b.x * a.y;
  }
  const perimeter = cumulative[count];
  const outwardSign = doubleArea > 0 ? 1 : -1;
  const reach = Math.max(1, Math.round(0.85 / (perimeter / count)));
  const normals = points.map((_, i) => {
    const a = points[(i - reach + count) % count], b = points[(i + reach) % count];
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return new Vector2(outwardSign * (b.y - a.y) / length, -outwardSign * (b.x - a.x) / length);
  });

  function at(t: number) {
    const distance = wrap(t) * perimeter;
    let low = 0, high = count;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (cumulative[middle] <= distance) low = middle;
      else high = middle;
    }
    const f = (distance - cumulative[low]) / (cumulative[low + 1] - cumulative[low] || 1);
    const a = points[low], b = points[(low + 1) % count];
    const na = normals[low], nb = normals[(low + 1) % count];
    const nx = na.x + (nb.x - na.x) * f, nz = na.y + (nb.y - na.y) * f;
    const length = Math.hypot(nx, nz) || 1;
    return { x: a.x + (b.x - a.x) * f, z: a.y + (b.y - a.y) * f, nx: nx / length, nz: nz / length };
  }

  function contains(x: number, z: number) {
    let inside = false;
    for (let i = 0, j = count - 1; i < count; j = i++) {
      const a = points[i], b = points[j];
      if ((a.y > z) !== (b.y > z) && x < (b.x - a.x) * (z - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  function clearance(x: number, z: number) {
    let best = Infinity;
    for (const point of points) best = Math.min(best, (point.x - x) ** 2 + (point.y - z) ** 2);
    return Math.sqrt(best);
  }

  // Stitched bands run top→bottom along increasing t; flip when that winding faces inward.
  return { perimeter, at, contains, clearance, flip: doubleArea > 0 };
}

type Outline = ReturnType<typeof createOutline>;

// Bowyer–Watson Delaunay triangulation for an evenly faceted flat meadow.
function delaunay(points: Vector2[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
  }
  const size = Math.max(maxX - minX, maxY - minY) * 20;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const all = [...points, new Vector2(cx - size, cy - size), new Vector2(cx + size, cy - size), new Vector2(cx, cy + size)];
  const count = points.length;
  const circle = (a: number, b: number, c: number) => {
    const A = all[a], B = all[b], C = all[c];
    const d = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
    if (Math.abs(d) < 1e-12) return { a, b, c, x: 0, y: 0, r2: Infinity };
    const aa = A.lengthSq(), bb = B.lengthSq(), cc = C.lengthSq();
    const x = (aa * (B.y - C.y) + bb * (C.y - A.y) + cc * (A.y - B.y)) / d;
    const y = (aa * (C.x - B.x) + bb * (A.x - C.x) + cc * (B.x - A.x)) / d;
    return { a, b, c, x, y, r2: (A.x - x) ** 2 + (A.y - y) ** 2 };
  };
  let triangles = [circle(count, count + 1, count + 2)];
  for (let i = 0; i < count; i++) {
    const p = all[i];
    const edges = new Map<number, [number, number]>();
    const keep: typeof triangles = [];
    for (const triangle of triangles) {
      if ((p.x - triangle.x) ** 2 + (p.y - triangle.y) ** 2 < triangle.r2 - 1e-9) {
        for (const [u, v] of [[triangle.a, triangle.b], [triangle.b, triangle.c], [triangle.c, triangle.a]]) {
          const key = Math.min(u, v) * 100003 + Math.max(u, v);
          if (edges.has(key)) edges.delete(key);
          else edges.set(key, [u, v]);
        }
      } else {
        keep.push(triangle);
      }
    }
    for (const [u, v] of edges.values()) keep.push(circle(u, v, i));
    triangles = keep;
  }
  return triangles.filter((triangle) => triangle.a < count && triangle.b < count && triangle.c < count);
}

class ColoredMesh {
  positions: number[] = [];
  colors: number[] = [];
  private ab = new Vector3();
  private ac = new Vector3();

  private bounce = new Color();

  triangle(a: Vector3 | RingPoint, b: Vector3 | RingPoint, c: Vector3 | RingPoint, tint: Color) {
    this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    // Baked warm bounce: faces turned toward the ground only see the hemisphere's
    // ground colour, so lift them to keep undersides from sinking into green-black.
    this.ab.set(b.x - a.x, b.y - a.y, b.z - a.z);
    this.ac.set(c.x - a.x, c.y - a.y, c.z - a.z);
    const normalY = this.ab.cross(this.ac).normalize().y;
    const color = normalY < 0
      ? this.bounce.copy(tint).lerp(PALETTE.soil[1], -normalY * 0.18).multiplyScalar(1 - normalY * 0.85)
      : tint;
    for (let i = 0; i < 3; i++) this.colors.push(color.r, color.g, color.b);
  }

  // Emit with the face normal pointing up (+1) or down (-1).
  facing(a: Vector3 | RingPoint, b: Vector3 | RingPoint, c: Vector3 | RingPoint, tint: Color, direction: 1 | -1) {
    this.ab.set(b.x - a.x, b.y - a.y, b.z - a.z);
    this.ac.set(c.x - a.x, c.y - a.y, c.z - a.z);
    const normalY = this.ab.z * this.ac.x - this.ab.x * this.ac.z;
    if (normalY * direction >= 0) this.triangle(a, b, c, tint);
    else this.triangle(a, c, b, tint);
  }

  build() {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

// Zip two rings with different vertex counts by their outline parameter. Mixed
// fan directions keep the facets from repeating like a triangulated belt.
function stitch(
  mesh: ColoredMesh,
  upper: RingPoint[],
  lower: RingPoint[],
  flip: boolean,
  paint: (a: RingPoint, b: RingPoint, c: RingPoint, t: number) => Color,
) {
  const upperAt = (k: number) => upper[k % upper.length];
  const lowerAt = (k: number) => lower[k % lower.length];
  const upperT = (k: number) => upper[k % upper.length].t + Math.floor(k / upper.length);
  const lowerT = (k: number) => lower[k % lower.length].t + Math.floor(k / lower.length);
  let i = 0, j = 0;
  while (i < upper.length || j < lower.length) {
    const advanceUpper = j >= lower.length || (i < upper.length && upperT(i + 1) < lowerT(j + 1));
    const a = upperAt(i), b = lowerAt(j);
    const c = advanceUpper ? upperAt(i + 1) : lowerAt(j + 1);
    const t = wrap((upperT(i) + lowerT(j) + (advanceUpper ? upperT(i + 1) : lowerT(j + 1))) / 3);
    const tint = paint(a, b, c, t);
    if (flip) mesh.triangle(a, c, b, tint);
    else mesh.triangle(a, b, c, tint);
    if (advanceUpper) i++;
    else j++;
  }
}

export function createTerrainGeometry(shape: Shape, { tileSize, surfaceY, seed }: TerrainOptions) {
  const random = seededRandom(seed * 7919 + 13);
  const size = terrainProportions(tileSize);
  const outline = createOutline(shape);
  const { perimeter } = outline;
  const unit = 1 / perimeter;
  const mesh = new ColoredMesh();
  const tint = new Color();
  const jitter = (base: Color, amount: number) => tint.copy(base).multiplyScalar(1 + (random() - 0.5) * amount);

  // --- Rock masses: uneven chunks around the perimeter -------------------------
  const chunkWidths = Array.from({ length: Math.max(8, Math.round(perimeter / 6.6)) }, () => 0.5 + random() * 1.1);
  const widthTotal = chunkWidths.reduce((sum, width) => sum + width, 0);
  let cursor = random();
  const chunks: Chunk[] = chunkWidths.map((width) => {
    const start = cursor;
    cursor += width / widthTotal;
    const toneRoll = random();
    return {
      start,
      end: cursor,
      tone: toneRoll < 0.34 ? 0 : toneRoll < 0.72 ? 1 : 2,
      push: -0.12 + random() * 0.46,
      drop: random() < 0.45 ? 0.45 + random() * 0.55 : random() * 0.3,
      lift: (random() - 0.5) * 0.3,
      tuck: (random() - 0.5) * 0.035,
    };
  });
  const first = chunks[0].start;
  const chunkAt = (t: number) => {
    const shifted = wrap(t - first) + first;
    const chunk = chunks.find((candidate) => shifted < candidate.end) ?? chunks[chunks.length - 1];
    const u = Math.min(1, Math.max(0, (shifted - chunk.start) / (chunk.end - chunk.start)));
    return { chunk, profile: Math.pow(Math.sin(Math.PI * u), 0.55) };
  };
  const boundaries = chunks.map((chunk) => wrap(chunk.start));

  const drips = Array.from({ length: Math.round(perimeter / 13) }, () => ({
    center: random(),
    width: (0.45 + random() * 0.9) * unit,
    depth: size.grass * (0.3 + random() * 0.5),
  }));
  const drip = (t: number) => drips.reduce((deepest, item) => {
    const distance = Math.abs(wrap(t - item.center + 0.5) - 0.5) / item.width;
    return Math.max(deepest, distance < 1 ? item.depth * (1 - distance * distance) : 0);
  }, 0);

  const soilNoise = periodicNoise(random, [3, 7, 12, 19]);
  const soilInset = periodicNoise(random, [5, 11]);
  const bandNoise = [periodicNoise(random, [4, 9, 15]), periodicNoise(random, [3, 8, 13]), periodicNoise(random, [5, 10, 17])];
  const scaleNoise = [periodicNoise(random, [2, 6, 11]), periodicNoise(random, [3, 7, 12]), periodicNoise(random, [4, 9])];
  const transition = periodicNoise(random, [6, 14, 23]);

  const grassBottom = surfaceY - size.grass;
  const soilY = (t: number) => grassBottom - size.soil * (1 + 0.38 * soilNoise(t)) - drip(t) * 0.9;
  const rockY: ((t: number) => number)[] = [
    (t: number) => soilY(t) - size.rockBands[0] * (1 + 0.3 * bandNoise[0](t)) - chunkAt(t).chunk.lift * chunkAt(t).profile * 0.5,
    (t: number) => rockY[0](t) - size.rockBands[1] * (1 + 0.32 * bandNoise[1](t)) - chunkAt(t).chunk.lift * chunkAt(t).profile,
    (t: number) => {
      const { chunk, profile } = chunkAt(t);
      return rockY[1](t) - size.rockBands[2] * (0.85 + 0.35 * bandNoise[2](t)) - size.rockDrop * chunk.drop * Math.pow(profile, 0.8);
    },
  ];

  // Keep every soil/rock vertex tucked under the grass cap (important around the
  // puzzle sockets, where scaling toward the centre can drift under the hole).
  const tuckUnder = (point: RingPoint, margin: number) => {
    const { nx, nz } = outline.at(point.t);
    for (let step = 0; step < 30; step++) {
      if (outline.contains(point.x, point.z) && outline.clearance(point.x, point.z) >= margin) return point;
      point.x -= nx * 0.08;
      point.z -= nz * 0.08;
    }
    return point;
  };

  const ringTimes = (spacing: number, extras: number[] = []) => {
    const count = Math.max(12, Math.round(perimeter / spacing));
    const offset = random() / count;
    const minGap = spacing * 0.32 * unit;
    const times = Array.from({ length: count }, (_, i) => wrap((i + (random() - 0.5) * 0.7) / count + offset))
      .filter((t) => extras.every((extra) => Math.abs(wrap(t - extra + 0.5) - 0.5) > minGap));
    return [...times.map((t) => ({ t, groove: false })), ...extras.map((t) => ({ t, groove: true }))].sort((a, b) => a.t - b.t);
  };

  const ring = (
    times: { t: number; groove: boolean }[],
    place: (t: number, groove: boolean) => { scale: number; offset: number; y: number },
    margin = 0,
  ) => {
    const build = (t: number, groove: boolean): RingPoint => {
      const sample = outline.at(t);
      const { scale, offset, y } = place(t, groove);
      const point = { t, groove, x: sample.x * scale + sample.nx * offset, y, z: sample.z * scale + sample.nz * offset };
      return margin > 0 ? tuckUnder(point, margin) : point;
    };
    let points = times.map(({ t, groove }) => build(t, groove));
    // On concave socket curves a long chord can cut outside the grass footprint;
    // split those spans so the rock never peeks out from under the cap.
    for (let pass = 0; margin > 0 && pass < 3; pass++) {
      const refined: RingPoint[] = [];
      points.forEach((point, i) => {
        refined.push(point);
        const next = points[(i + 1) % points.length];
        const x = (point.x + next.x) / 2, z = (point.z + next.z) / 2;
        if (!outline.contains(x, z) || outline.clearance(x, z) < margin * 0.5) {
          refined.push(build(wrap(point.t + wrap(next.t - point.t) / 2), false));
        }
      });
      if (refined.length === points.length) break;
      points = refined.sort((a, b) => a.t - b.t);
    }
    return points;
  };

  // --- Grass cap ---------------------------------------------------------------
  const capCount = Math.max(48, Math.round(perimeter / 0.55));
  const capTimes = Array.from({ length: capCount }, (_, i) => ({ t: i / capCount, groove: false }));
  const edge = ring(capTimes, () => ({ scale: 1, offset: 0, y: surfaceY }));
  const bevel = ring(capTimes, () => ({ scale: 1, offset: size.rim * 0.6, y: surfaceY - size.grass * 0.1 }));
  const rim = ring(capTimes, () => ({ scale: 1, offset: size.rim, y: surfaceY - size.grass * 0.3 }));
  const lip = ring(capTimes, (t) => ({ scale: 1, offset: size.rim * 0.7, y: grassBottom - drip(t) }));
  const underside = ring(capTimes, (t) => ({ scale: 1, offset: -size.rim * 1.5, y: grassBottom - drip(t) + size.grass * 0.12 }));

  // Flat meadow: outline vertices plus a jittered interior field, Delaunay-faceted.
  const meadowPoints = edge.map((point) => new Vector2(point.x, point.z));
  const spacing = 1.9;
  const half = tileSize * 0.75;
  for (let gx = -half; gx <= half; gx += spacing) {
    for (let gz = -half; gz <= half; gz += spacing) {
      const x = gx + (random() - 0.5) * spacing * 0.55;
      const z = gz + (random() - 0.5) * spacing * 0.55;
      if (outline.contains(x, z) && outline.clearance(x, z) > 0.8) meadowPoints.push(new Vector2(x, z));
    }
  }
  const meadowPhase = [random() * 6.3, random() * 6.3, random() * 6.3];
  const meadowTone = (x: number, z: number) => 0.5 * Math.sin(x * 0.33 + z * 0.19 + meadowPhase[0])
    + 0.3 * Math.sin(-x * 0.17 + z * 0.41 + meadowPhase[1])
    + 0.2 * Math.sin(x * 0.63 - z * 0.52 + meadowPhase[2]);
  for (const { a, b, c } of delaunay(meadowPoints)) {
    const A = meadowPoints[a], B = meadowPoints[b], C = meadowPoints[c];
    const cx = (A.x + B.x + C.x) / 3, cz = (A.y + B.y + C.y) / 3;
    if (!outline.contains(cx, cz)) continue;
    const tone = meadowTone(cx, cz) * 0.8 + (random() - 0.5) * 0.45;
    tint.copy(PALETTE.grass).lerp(tone > 0 ? PALETTE.grassLight : PALETTE.grassDark, Math.min(1, Math.abs(tone)));
    mesh.facing(new Vector3(A.x, surfaceY, A.y), new Vector3(B.x, surfaceY, B.y), new Vector3(C.x, surfaceY, C.y), tint, 1);
  }

  const { flip } = outline;
  stitch(mesh, edge, bevel, flip, () => jitter(PALETTE.bevel, 0.06));
  stitch(mesh, bevel, rim, flip, () => jitter(PALETTE.grass, 0.06));
  stitch(mesh, rim, lip, flip, (_a, _b, _c, t) => jitter(drip(t) > 0.02 ? PALETTE.grassDark : PALETTE.lip, 0.07));
  stitch(mesh, lip, underside, flip, () => jitter(PALETTE.under, 0.05));

  // --- Soil sliver ---------------------------------------------------------------
  const soilBottom = ring(ringTimes(0.95), (t) => ({
    scale: 1,
    offset: -size.rim * 2.4 - 0.05 * (soilInset(t) + 1),
    y: soilY(t),
  }), 0.12);
  stitch(mesh, underside, soilBottom, flip, (a, b, c) => {
    const depth = (surfaceY - (a.y + b.y + c.y) / 3) / (size.grass + size.soil * 1.4);
    const index = Math.min(2, Math.max(0, Math.floor(depth * 2.2 + (random() - 0.5) * 0.9)));
    return jitter(PALETTE.soil[index], 0.08);
  });

  // --- Rock body: ring 0 is the soil bottom, then ~0.99 → ~0.96 → ~0.83 -------------
  const grooveInset = (groove: boolean, amount: number) => groove ? amount : 0;
  const rock1 = ring(ringTimes(1.45, boundaries), (t, groove) => {
    const { chunk, profile } = chunkAt(t);
    return {
      scale: 0.988 + 0.006 * scaleNoise[0](t),
      offset: -size.rim * 2.6 + chunk.push * 0.55 * profile - grooveInset(groove, 0.2),
      y: rockY[0](t),
    };
  }, 0.2);
  const rock2 = ring(ringTimes(1.8, boundaries), (t, groove) => {
    const { chunk, profile } = chunkAt(t);
    return {
      scale: 0.958 + 0.014 * scaleNoise[1](t),
      offset: chunk.push * profile - grooveInset(groove, 0.32),
      y: rockY[1](t),
    };
  }, 0.3);
  const rock3 = ring(ringTimes(2.2, boundaries), (t, groove) => {
    const { chunk, profile } = chunkAt(t);
    return {
      scale: 0.83 + 0.02 * scaleNoise[2](t) + chunk.tuck,
      offset: chunk.push * 0.45 * profile - grooveInset(groove, 0.22),
      y: rockY[2](t),
    };
  }, 0.4);

  const rockTone = (t: number, band: number, groove: boolean) => {
    const { chunk } = chunkAt(t);
    if (groove && random() < 0.85) return tint.copy(PALETTE.rock[2]).lerp(PALETTE.groove, 0.7).multiplyScalar(1 + (random() - 0.5) * 0.06);
    tint.copy(PALETTE.rock[chunk.tone]);
    if (band === 0) {
      tint.lerp(PALETTE.rock[0], 0.3);
      if (transition(t) > 0.3) tint.lerp(PALETTE.soil[2], 0.38);
    }
    if (band === 2) tint.lerp(PALETTE.rock[2], 0.12);
    return tint.multiplyScalar(1 + (random() - 0.5) * 0.09);
  };
  // Only faces running along a crack (two groove corners) take the deep groove tone.
  const inCrack = (a: RingPoint, b: RingPoint, c: RingPoint) => Number(a.groove) + Number(b.groove) + Number(c.groove) >= 2;
  stitch(mesh, soilBottom, rock1, flip, (a, b, c, t) => rockTone(t, 0, inCrack(a, b, c)));
  stitch(mesh, rock1, rock2, flip, (a, b, c, t) => rockTone(t, 1, inCrack(a, b, c)));
  stitch(mesh, rock2, rock3, flip, (a, b, c, t) => rockTone(t, 2, inCrack(a, b, c)));

  // Underside: triangulate the irregular bottom ring.
  const bottomContour = rock3.map((point) => new Vector2(point.x, point.z));
  for (const [a, b, c] of ShapeUtils.triangulateShape(bottomContour, [])) {
    mesh.facing(rock3[a], rock3[b], rock3[c], jitter(PALETTE.rock[2], 0.06), -1);
  }

  addOutcrops(mesh, outline, random, {
    count: 5 + Math.floor(random() * 3),
    heightAt: (t) => rockY[0](t) + (rockY[1](t) - rockY[0](t)) * (0.35 + random() * 0.5),
    scaleAt: (t) => 0.975 + 0.006 * scaleNoise[0](t),
    toneAt: (t) => PALETTE.rock[Math.min(chunkAt(t).chunk.tone, 1)],
  });

  return mesh.build();
}

// A handful of chunky boulders poking out of the cliff at uneven spots.
function addOutcrops(
  mesh: ColoredMesh,
  outline: Outline,
  random: () => number,
  { count, heightAt, scaleAt, toneAt }: {
    count: number;
    heightAt: (t: number) => number;
    scaleAt: (t: number) => number;
    toneAt: (t: number) => Color;
  },
) {
  const base = new IcosahedronGeometry(1, 0);
  const source = base.getAttribute("position");
  const tint = new Color();
  const matrix = new Matrix4();
  const tilt = new Matrix4();
  const vertex = new Vector3();
  const tangent = new Vector3();
  const up = new Vector3(0, 1, 0);
  const outward = new Vector3();
  const offset = random();

  for (let k = 0; k < count; k++) {
    const t = wrap(offset + (k + random() * 0.55) / count);
    const sample = outline.at(t);
    const radius = 0.32 + random() * 0.28;
    const scale = scaleAt(t);
    outward.set(sample.nx, 0, sample.nz);
    tangent.set(sample.nz, 0, -sample.nx);
    matrix.makeBasis(tangent, up, outward);
    tilt.makeRotationFromEuler(new Euler((random() - 0.5) * 0.5, (random() - 0.5) * 0.8, (random() - 0.5) * 0.4));
    matrix.multiply(tilt).scale(new Vector3(radius * (1.15 + random() * 0.45), radius * (0.7 + random() * 0.25), radius * (0.75 + random() * 0.25)));

    // Deterministic per-corner jitter, shared by coincident corners so faces stay closed.
    const corners = new Map<string, Vector3>();
    const corner = (x: number, y: number, z: number) => {
      const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      if (!corners.has(key)) corners.set(key, new Vector3(x * (0.82 + random() * 0.3), y * (0.82 + random() * 0.3), z * (0.82 + random() * 0.3)));
      return corners.get(key)!;
    };

    // Pull the boulder in until it sits under the grass; drop it where it cannot (tight sockets).
    let fits = false;
    const center = new Vector3();
    const placed: Vector3[] = [];
    const y = heightAt(t);
    for (let attempt = 0; attempt < 10 && !fits; attempt++) {
      const reach = radius * 0.3 - attempt * 0.1;
      center.set(sample.x * scale + sample.nx * reach, y, sample.z * scale + sample.nz * reach);
      placed.length = 0;
      for (let i = 0; i < source.count; i++) {
        const local = corner(source.getX(i), source.getY(i), source.getZ(i));
        placed.push(vertex.copy(local).applyMatrix4(matrix).add(center).clone());
      }
      fits = placed.every((point) => outline.contains(point.x, point.z) && outline.clearance(point.x, point.z) > 0.06);
    }
    if (!fits) continue;

    const toneBase = toneAt(t);
    for (let i = 0; i < placed.length; i += 3) {
      const a = placed[i], b = placed[i + 1], c = placed[i + 2];
      const normal = tangent.copy(b).sub(a).cross(vertex.copy(c).sub(a)).normalize();
      tint.copy(toneBase).multiplyScalar(1 + (random() - 0.5) * 0.12);
      if (normal.y > 0.6 && random() < 0.45) tint.lerp(PALETTE.moss, 0.45);
      mesh.triangle(a, b, c, tint);
    }
  }
  base.dispose();
}
