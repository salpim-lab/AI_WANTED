import { BufferGeometry, Color, DodecahedronGeometry, Float32BufferAttribute, IcosahedronGeometry, MeshStandardMaterial, Vector3 } from "three";
import type { IslandLayout } from "./placement";

const ISLAND_SCALE = 2.75;

// Shared broad colour variation for grass and rock. The low frequency
// keeps the scene hand-painted instead of photographic.
export const STYLIZED_NOISE_SCALE = 0.22;
export function stylizedNoise(x: number, z: number, seed = 0) {
  const phase = seed * 0.731;
  return Math.sin(x * STYLIZED_NOISE_SCALE + z * 0.13 + phase) * 0.58
    + Math.sin(x * 0.11 - z * STYLIZED_NOISE_SCALE * 0.82 - phase * 1.7) * 0.27
    + Math.sin(x * 0.055 + z * 0.071 + phase * 2.3) * 0.15;
}

export const STYLIZED_PALETTE = {
  grass: ["#9ccc5a", "#7fb347", "#5f9a3a"],
  rock: ["#8a8f96", "#5f656d", "#3e434a", "#6b625a"],
} as const;

// The meadow's colour at a world point: three palette steps picked by the same
// low-frequency field, plus a faint tint jitter. The puzzle cap (islandModel)
// and the rim roll (grassOverhang) both read from this, so the roll carries the
// meadow's own colour variation over the edge instead of a flat green band.
export function stylizedGrassColor(x: number, z: number, y = 0, out = new Color()) {
  const noise = stylizedNoise(x, z, 0);
  const index = noise > 0.22 ? 0 : noise < -0.24 ? 2 : 1;
  return out.set(STYLIZED_PALETTE.grass[index]).multiplyScalar(1 + noise * 0.035 + Math.sin(y * 0.75) * 0.012);
}

// One material for the whole meadow: the flat cap, the rim roll it turns into
// and everything hanging off it. Passing a single instance around is what keeps
// the cap/roll join from reading as two different surfaces.
export function createMeadowMaterial() {
  return new MeshStandardMaterial({ color: "#ffffff", roughness: 0.88, metalness: 0, flatShading: true, vertexColors: true });
}

// Nudges every distinct corner by its own random offset: faces stay joined,
// but each stone, crown or blade gets a chipped, one-off silhouette.
export function chisel<T extends BufferGeometry>(geometry: T, random: () => number, amount: number) {
  const position = geometry.getAttribute("position");
  const offsets = new Map<string, Vector3>();
  const corner = new Vector3();
  for (let i = 0; i < position.count; i++) {
    corner.fromBufferAttribute(position, i);
    const key = `${corner.x.toFixed(4)},${corner.y.toFixed(4)},${corner.z.toFixed(4)}`;
    let offset = offsets.get(key);
    if (!offset) {
      offset = new Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(amount * 2);
      offsets.set(key, offset);
    }
    position.setXYZ(i, corner.x + offset.x, corner.y + offset.y, corner.z + offset.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// A closed loop of vertices at one level of the island, evenly spaced by angle.
type Ring = Vector3[];

// Side profile below the meadow rim, top to tip. Grass rings grow outward by
// world units (the rounded lip); rock rings scale the local radius.
// Each ring's colour paints the band between it and the next ring.
const RIM_COLOR = "#A8D467";
const GRASS_LIP = [
  { grow: 0.24, drop: 0.18, color: "#8DC152" },
  { grow: 0.34, drop: 0.46, color: "#78AE47" },
  { grow: 0.22, drop: 0.82, color: "#557F37", hem: true },
  // Tucked just under the hem so the grass reads as a thick overhanging carpet.
  { grow: -0.08, drop: 0.76, color: "#4f7f2f", hem: true },
];
const ROCK_STRATA = [
  { scale: 0.99, drop: 1.65, count: 64, color: "#6f757c" },
  { scale: 0.97, drop: 2.45, count: 60, color: "#5c6168" },
  { scale: 0.93, drop: 3.7, count: 56, color: "#4a4f56" },
  { scale: 0.88, drop: 4.75, count: 48, color: "#7c7a74" },
  { scale: 0.78, drop: 5.9, count: 44, color: "#66605a" },
  { scale: 0.62, drop: 6.8, count: 40, color: "#4a4f56" },
];
// The footprint is larger now, but the hanging body grows only moderately so
// the island does not read as a three-times-thicker rock.
export const TERRAIN_DEPTH = 18.5;

const RIM_COUNT = 72;
const MEADOW_RINGS = [0.16, 0.28, 0.4, 0.52, 0.64, 0.76, 0.88];
const LOW_GRASS = new Color("#86B94B"), HIGH_GRASS = new Color("#A4CF63");

export function createTerrainGeometry(layout: IslandLayout) {
  const { radiusAt, heightAt, surfaceY } = layout;
  const random = layout.random(1);
  const positions: number[] = [], colors: number[] = [];
  const tint = new Color();

  function triangle(a: Vector3, b: Vector3, c: Vector3, color: Color | string) {
    if (a === b || b === c || a === c) return;
    // Per-face shade jitter gives the faceted low-poly look.
    const shade = 1 + (Math.sin((a.x + b.x + c.x) * 12.9898 + (a.z + b.z + c.z) * 78.233) * 43758.5453 % 1) * 0.045;
    tint.set(color).multiplyScalar(shade);
    for (const v of [a, b, c]) {
      positions.push(v.x, v.y, v.z);
      colors.push(tint.r, tint.g, tint.b);
    }
  }

  // Zip two loops with possibly different vertex counts. `upper` is the ring
  // nearer the meadow centre / higher up, which keeps every face outward.
  function stitch(upper: Ring, lower: Ring, color: (a: Vector3, b: Vector3, c: Vector3) => Color | string) {
    const n = upper.length, m = lower.length;
    for (let i = 0, j = 0; i < n || j < m;) {
      if (j >= m || (i < n && (i + 1) / n <= (j + 1) / m)) {
        const a = upper[i % n], b = upper[(i + 1) % n], c = lower[j % m];
        triangle(a, b, c, color(a, b, c));
        i++;
      } else {
        const a = upper[i % n], b = lower[(j + 1) % m], c = lower[j % m];
        triangle(a, b, c, color(a, b, c));
        j++;
      }
    }
  }

  const loop = (count: number, place: (angle: number, i: number) => Vector3): Ring =>
    Array.from({ length: count }, (_, i) => place(i / count * Math.PI * 2, i));

  // Meadow: concentric jittered rings following the hills, fanned to the centre.
  const meadow: Ring[] = [[new Vector3(0, heightAt(0, 0), 0)]];
  for (const s of MEADOW_RINGS) {
    const count = Math.max(6, Math.round(RIM_COUNT * s));
    const spacing = Math.PI * 2 / count;
    meadow.push(loop(count, (angle) => {
      const a = angle + (random() - 0.5) * spacing * 0.6;
      const r = radiusAt(a) * (s + (random() - 0.5) * 0.05);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      return new Vector3(x, heightAt(x, z), z);
    }));
  }
  const rim = loop(RIM_COUNT, (angle) => {
    const r = radiusAt(angle);
    return new Vector3(Math.cos(angle) * r, surfaceY, Math.sin(angle) * r);
  });
  meadow.push(rim);
  const grass = (a: Vector3, b: Vector3, c: Vector3) =>
    tint.copy(LOW_GRASS).lerp(HIGH_GRASS, Math.min(1, ((a.y + b.y + c.y) / 3 - surfaceY) / 1.2)).clone();
  for (let k = 0; k < meadow.length - 1; k++) stitch(meadow[k], meadow[k + 1], grass);

  // Grass hem hangs in rounded tongues, as if the lawn drips over the edge.
  const tongues = Array.from({ length: 11 }, (_, k) => ({
    angle: (k + random() * 0.7) / 11 * Math.PI * 2,
    width: 0.09 + random() * 0.08,
    depth: 0.3 + random() * 0.6,
  }));
  const hemDrop = (angle: number) => tongues.reduce((deepest, t) => {
    const d = Math.abs(Math.atan2(Math.sin(angle - t.angle), Math.cos(angle - t.angle))) / t.width;
    return Math.max(deepest, d < 1 ? t.depth * (1 - d * d) : 0);
  }, 0);
  const sides: { ring: Ring; color: string }[] = [{ ring: rim, color: RIM_COLOR }];
  for (const band of GRASS_LIP) {
    const ring = loop(RIM_COUNT, (angle) => {
      // The enlarged footprint gets a slightly wider soft grass lip, while
      // the actual rock depth remains deliberately much less scaled.
      const r = radiusAt(angle) + band.grow * ISLAND_SCALE;
      return new Vector3(Math.cos(angle) * r, surfaceY - band.drop - (band.hem ? hemDrop(angle) : 0), Math.sin(angle) * r);
    });
    sides.push({ ring, color: band.color });
  }

  // Strata undulate together; ledges between them step inward as the body tapers.
  const strata = [2, 3].map((k) => ({ k, phase: random() * Math.PI * 2 }));
  const undulate = (angle: number) => strata.reduce((sum, w) => sum + Math.sin(w.k * angle + w.phase), 0) * 0.14;
  // Shared by every ring, so bulges line up into vertical cliff ridges.
  const ridgeWaves = [5, 7, 11].map((k) => ({ k, phase: random() * Math.PI * 2 }));
  const ridges = (angle: number) => ridgeWaves.reduce((sum, w) => sum + Math.sin(w.k * angle + w.phase), 0) / 3;
  for (const band of ROCK_STRATA) {
    const rough = 0.2 + (1 - band.scale) * 0.6;
    sides.push({
      ring: loop(band.count, (angle) => {
        const r = radiusAt(angle) * band.scale + ridges(angle) * 0.45 * band.scale + (random() - 0.5) * rough;
        const y = surfaceY - band.drop + undulate(angle) + (random() - 0.5) * 0.08;
        return new Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
      }),
      color: band.color,
    });
  }
  // A broad rounded bottom closes the body; several separate rocks below add
  // the irregular silhouette instead of converging to one cone tip.
  const bottom = loop(40, (angle) => {
    const r = radiusAt(angle) * (0.5 + random() * 0.06);
    return new Vector3(Math.cos(angle) * r, surfaceY - TERRAIN_DEPTH, Math.sin(angle) * r);
  });
  sides.push({ ring: bottom, color: "#746b63" });
  for (let k = 0; k < sides.length - 1; k++) stitch(sides[k].ring, sides[k + 1].ring, () => sides[k].color);
  const bottomCenter = new Vector3(0, surfaceY - TERRAIN_DEPTH, 0);
  for (let index = 0; index < bottom.length; index++) triangle(bottomCenter, bottom[index], bottom[(index + 1) % bottom.length], "#746b63");

  // A chipped polyhedron (non-indexed, so every three corners are one face),
  // stretched, turned and moved into place; faces above `capAt` take the cap colour.
  function stone(center: Vector3, stretch: Vector3, turn: number, capAt: number, cap: string, side: string) {
    const shape = chisel(random() < 0.5 ? new IcosahedronGeometry(1, 0) : new DodecahedronGeometry(1, 0), random, 0.2);
    shape.scale(stretch.x, stretch.y, stretch.z).rotateY(turn).translate(center.x, center.y, center.z);
    const corner = shape.getAttribute("position");
    for (let i = 0; i < corner.count; i += 3) {
      const [a, b, c] = [0, 1, 2].map((j) => new Vector3().fromBufferAttribute(corner, i + j));
      triangle(a, b, c, (a.y + b.y + c.y) / 3 > capAt ? cap : side);
    }
    shape.dispose();
  }

  // A few pebbles float beside the cliff.
  for (let k = 0; k < 3; k++) {
    const angle = (k / 3 + random() * 0.2) * Math.PI * 2;
    const r = radiusAt(angle) + 2.4 + random() * 1.6;
    const size = 0.5 + random() * 0.55;
    const center = new Vector3(Math.cos(angle) * r, surfaceY - 2 - random() * 2.5, Math.sin(angle) * r);
    const stretch = new Vector3(size * (0.9 + random() * 0.4), size * (1 + random() * 0.5), size * (0.9 + random() * 0.4));
    stone(center, stretch, random() * Math.PI, center.y + size * 0.3, "#8DC152", "#9A8A80");
  }

  // Stones jut from the upper rock walls, half buried in the cliff.
  // They stay above the narrowing lower rock so the body still tapers.
  const wallScale = (drop: number) => {
    const next = ROCK_STRATA.findIndex((band) => band.drop >= drop);
    if (next <= 0) return ROCK_STRATA[Math.max(next, 0)].scale;
    const upper = ROCK_STRATA[next - 1], lower = ROCK_STRATA[next];
    return upper.scale + (lower.scale - upper.scale) * (drop - upper.drop) / (lower.drop - upper.drop);
  };
  for (let k = 0; k < 9; k++) {
    const angle = (k + random() * 0.6) / 9 * Math.PI * 2;
    const drop = 2.7 + random() * 3.1;
    const size = 0.45 + random() * 0.45;
    const scale = wallScale(drop);
    const r = radiusAt(angle) * scale + ridges(angle) * 0.45 * scale + size * 0.4;
    const center = new Vector3(Math.cos(angle) * r, surfaceY - drop + undulate(angle), Math.sin(angle) * r);
    const stretch = new Vector3(size * 1.25, size * (0.7 + random() * 0.3), size * 1.15);
    stone(center, stretch, -angle, center.y + size * 0.35, k % 3 ? "#B9AC9C" : "#8DC152", k % 2 ? "#8E8176" : "#9D9084");
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
