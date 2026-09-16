import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { IslandLayout } from "./placement";
import { chisel, stylizedGrassColor, createMeadowMaterial, STYLIZED_PALETTE } from "./islandTerrain";
import { getPuzzleLayout, getPuzzlePiecePolygon, getPuzzleRimVertices, getPuzzleTerrainMetrics, getPuzzleTerrainRing, puzzlePieceContains, type PuzzlePoint, type PuzzleTerrainMode } from "./puzzle";
import { distanceToPuzzleRim } from "./puzzleDecorations";

// The meadow does not stop at the outline: its own cap edge rolls outward and
// down into a rounded rim, and the rim spills a little way onto the rock in
// round-ended lumps — mostly short, a few long, with bare stretches between.
// Shapes were modelled in Blender (assets/3d/exports/grass-overhang-kit.glb)
// and are rebuilt here from the same profile tables so the geometry stays
// deterministic and testable in Node.
//
// Everything below is expressed as a fraction of the piece's own terrain
// metrics, never in world units, so all 20 pieces read the same at any scale.
export const GRASS_OVERHANG = {
  // One seed per piece is derived from this; the island looks identical on
  // every reload and in both the personal and classroom views.
  seed: 4517,

  lip: {
    // How far the roll reaches past the outline, as a fraction of the block's
    // total thickness. Less than half the old shelf, so the rim reads as a
    // corner turned round rather than a ledge with a hard line under it.
    overhang: 0.02,
    // Cross section, walked from the meadow outward and down around the rim.
    // `out` is in units of `overhang`, `drop` in units of the grass band — two
    // different world lengths, and the grass band is by far the longer, so the
    // rows are spaced to make the first stretch a true quarter round of radius
    // `overhang` before the rest drops away as a skirt.
    //
    // Row 0 is the cap's own rim vertex — position and height both — so the two
    // meshes share that edge exactly and no seam can open between them. The
    // first step leaves it at about 13 degrees, which under flat shading is
    // near enough to the cap's own face that the join does not draw a line.
    profile: [
      { out: 0.00, drop: 0.00 },
      { out: 0.38, drop: 0.02 },
      { out: 0.72, drop: 0.07 },
      { out: 0.94, drop: 0.15 },
      { out: 1.00, drop: 0.26 },
      { out: 0.92, drop: 0.75 },
      { out: 0.62, drop: 1.35 },
      { out: 0.20, drop: 1.92 },
    ],
    // Vertex-colour ambient occlusion instead of a cast shadow: the shade runs
    // from 1 down to `shade` between `from` and the bottom of the roll, both as
    // a fraction of its total drop. It starts below the quarter round, so the
    // shoulder keeps the meadow's light and only the underside and the wall top
    // it covers darken, gradually.
    ao: { from: 0.18, shade: 0.7 },
  },

  drips: {
    // Candidate lumps per world unit of rim; the coverage field then decides
    // which of them actually grow.
    perUnit: 1.25,
    // Low and high ends of the coverage field. Well below 1 at the low end is
    // what produces the near-bare stretches.
    coverage: [0.04, 0.95] as const,
    // Hang length as a fraction of the exposed rock height.
    short: [0.10, 0.20] as const,
    long: [0.24, 0.35] as const,
    longRatio: 0.18,
    // Width as a multiple of the mean candidate spacing.
    width: [0.9, 2.2] as const,
    // Standoff from the wall, in units of the lip overhang.
    depth: 1.5,
    // Where the lump's top ring grips the roll, in units of the grass band.
    // Well above the roll's bottom edge, so the start of every lump is buried
    // behind the roll's own curve and never shows as a join.
    grip: 1.0,
    // The lump's back plane sits this fraction of the roll's reach out from
    // the outline at the grip; the rest of the roll's depth buries it.
    embed: 0.35,
    // Sideways lean, radians.
    tilt: (10 * Math.PI) / 180,
    // Lean out of the wall, radians: the top peels off the roll along its
    // tangent and the tip tucks back onto the rock, so a lump reads as poured
    // over the rim rather than hung from a rail under it.
    flow: (6 * Math.PI) / 180,
    // A rim turn sharper than this gets a corner lump that wraps both faces.
    cornerTurn: (34 * Math.PI) / 180,
  },

  // Meadow planting carried over the edge: tufts and small bushes seated on
  // the roll itself, so the cap's greenery does not stop dead at the outline.
  // Decoration only — excluded from the raycast, and no placement blocker.
  rim: {
    perUnit: 1.1,
    // Seat on the roll, in units of the grass band below the cap edge: on the
    // quarter-round shoulder, so a tuft reads as growing over the corner.
    seat: [0.01, 0.20] as const,
    // Size as a multiple of the grass band, matched to the meadow's blades.
    size: [1.5, 2.6] as const,
    // Outward lean at the root, radians.
    lean: [0.12, 0.5] as const,
    bushRatio: 0.3,
    bushSize: [1.2, 1.9] as const,
  },

  // Tufts tucked into the rock so the grass/rock line is not a clean cut.
  moss: {
    perEdge: [3, 6] as const,
    // Height band on the rock wall, 0 at the top of the rock.
    band: [0.12, 0.62] as const,
    // Tuft size as a fraction of the rock height.
    size: [0.05, 0.1] as const,
  },

  // One continuous ramp from the meadow down to the tip of a hanging lump.
  // `t` 0 is the cap, 1 is a tip; the roll owns the top `lipSpan` of it and the
  // lumps carry on from exactly where it leaves off, so the colour never
  // breaks at the join.
  tones: [
    { at: 0.0, color: "#8ec455" },
    { at: 0.22, color: "#79ab45" },
    { at: 0.45, color: "#5d8a38" },
    { at: 0.7, color: "#46682e" },
    { at: 1.0, color: "#3f5340" },
  ],
  lipSpan: 0.42,
  // Above this the roll is painted with the cap's own colour field rather than
  // the ramp, which is what carries the meadow's noise over the edge. It ends
  // above the grip, so lip and lump agree exactly where they meet.
  blend: 0.18,
} as const;

// Modelled in Blender, exported to assets/3d/exports/grass-overhang-kit.glb and
// transcribed here. Unit convention, following landscapeProps.ts: x is the
// width (half widths below), y hangs from 0 at the grip to -1 at the tip, and z
// is the standoff from the wall, which is the plane z = 0.
//
// `closed` cross sections are full rings that wrap an outline corner; the rest
// are half rings with a flat back pressed against the rock.
type DripVariant = "blob" | "curtain" | "strand" | "corner";
type DripProfile = { closed: boolean; columns: number; halfWidth: readonly number[]; depth: readonly number[] };

const DRIP_SHAPES: Record<DripVariant, DripProfile> = {
  // short rounded lump: the common case
  blob: { closed: false, columns: 5, halfWidth: [0.50, 0.56, 0.57, 0.50, 0.37, 0.21], depth: [0.30, 0.43, 0.47, 0.42, 0.30, 0.16] },
  // broad curtain that keeps its width most of the way down
  curtain: { closed: false, columns: 5, halfWidth: [0.50, 0.55, 0.56, 0.53, 0.47, 0.31], depth: [0.26, 0.35, 0.37, 0.34, 0.28, 0.16] },
  // long narrow strand with a bulb at the end
  strand: { closed: false, columns: 5, halfWidth: [0.50, 0.45, 0.35, 0.28, 0.31, 0.20], depth: [0.30, 0.28, 0.23, 0.20, 0.23, 0.14] },
  // sits on a corner bisector and wraps both faces
  corner: { closed: true, columns: 6, halfWidth: [0.52, 0.58, 0.58, 0.51, 0.38, 0.22], depth: [0.40, 0.48, 0.49, 0.43, 0.32, 0.18] },
};

// The personal island shows one piece up close; the classroom preview shows 20
// at once, where the narrow strands, the rim planting and the moss are
// sub-pixel.
const MODE_VARIANTS: Record<PuzzleTerrainMode, DripVariant[]> = {
  personal: ["blob", "curtain", "strand", "corner"],
  classroom: ["blob", "curtain"],
};

// Below this exterior weight a rim sample is part of a tab or socket that a
// neighbouring piece clips to, so nothing may hang there.
const SEAM_WEIGHT = 0.15;

type PuzzlePiece = ReturnType<typeof getPuzzleLayout>["pieces"][number];

function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Smooth noise that wraps seamlessly around the rim, so the field has no join
// at the walk's start. Returns -1..1.
function bands(s: number, perimeter: number, seed: number, harmonics: readonly (readonly [number, number])[]) {
  let value = 0, total = 0;
  for (const [k, amplitude] of harmonics) {
    value += Math.sin((s / perimeter) * Math.PI * 2 * k + hash(seed + k * 3.7) * Math.PI * 2) * amplitude;
    total += amplitude;
  }
  return value / total;
}

const COVERAGE_HARMONICS = [[2, 1], [5, 0.6], [11, 0.32]] as const;
const LENGTH_HARMONICS = [[3, 1], [7, 0.5], [17, 0.28]] as const;

const TONE_STOPS = GRASS_OVERHANG.tones.map((stop) => new THREE.Color(stop.color));
const luminance = (color: THREE.Color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
const MID_GRASS_LUMA = luminance(new THREE.Color(STYLIZED_PALETTE.grass[1]));
const LIP_BOTTOM = GRASS_OVERHANG.lip.profile[GRASS_OVERHANG.lip.profile.length - 1].drop;
// The grip in ramp coordinates. Lip and lump are painted from the same ramp at
// the same `t` here, which is why their colours meet without a step.
const GRIP_TONE = (GRASS_OVERHANG.drips.grip / LIP_BOTTOM) * GRASS_OVERHANG.lipSpan;

function toneAt(t: number, out = new THREE.Color()) {
  const stops = GRASS_OVERHANG.tones;
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped > stops[i + 1].at) continue;
    const span = stops[i + 1].at - stops[i].at;
    const f = span <= 0 ? 0 : (clamped - stops[i].at) / span;
    return out.copy(TONE_STOPS[i]).lerp(TONE_STOPS[i + 1], f);
  }
  return out.copy(TONE_STOPS[TONE_STOPS.length - 1]);
}

// The rim's colour anywhere on the roll: the meadow's own field at the top,
// easing into the moss ramp on the way down. At t = 0 this is exactly what the
// cap paints at the same point, so the cap and the roll are one surface.
const rampScratch = new THREE.Color();
function rimColor(t: number, x: number, z: number, y: number, out = new THREE.Color()) {
  stylizedGrassColor(x, z, y, out);
  return out.lerp(toneAt(t, rampScratch), THREE.MathUtils.smoothstep(t, 0, GRASS_OVERHANG.blend));
}

// Brightness of the meadow at a point, relative to the palette's mid tone. A
// hanging lump takes its hue from the ramp and only its light from here, so it
// tracks the cap above it without drifting green.
const fieldScratch = new THREE.Color();
function meadowShade(x: number, z: number) {
  return THREE.MathUtils.clamp(luminance(stylizedGrassColor(x, z, 0, fieldScratch)) / MID_GRASS_LUMA, 0.86, 1.14);
}

// puzzlePieceContains rebuilds the outline on every call, and the fit loop
// below runs tens of thousands of probes per piece, so walk one prepared
// polygon instead.
function insidePolygon(point: PuzzlePoint, polygon: PuzzlePoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index], b = polygon[previous];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

// Every distinct vertex of a shape, which is exactly the set the containment
// test walks. Bounding-box corners bound the shape, but the distance to an
// outline with sockets in it is not convex, so a box whose corners all pass can
// still hide a vertex reaching into the neighbouring piece.
const hullCache = new WeakMap<THREE.BufferGeometry, number[][]>();
function hullPoints(geometry: THREE.BufferGeometry) {
  let points = hullCache.get(geometry);
  if (!points) {
    const position = geometry.getAttribute("position");
    const seen = new Set<string>();
    points = [];
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points.push([x, y, z]);
    }
    hullCache.set(geometry, points);
  }
  return points;
}

// Every overhang vertex must stay inside the outline, or reach past it by no
// more than the lip's own overhang. Nothing may cross an internal tab or
// socket, so neighbouring pieces never intersect once the class assembles.
export function requireInsideOutline(points: THREE.Vector3[], piece: PuzzlePiece, label: string, budget = 0) {
  const polygon = getPuzzlePiecePolygon(piece);
  for (const point of points) {
    if (insidePolygon(point, polygon)) continue;
    if (budget > 0 && distanceToPuzzleRim(point, polygon) <= budget) continue;
    throw new Error(`${label} crosses puzzle outline on piece ${piece.index}`);
  }
}

type RimSample = { point: THREE.Vector3; outward: THREE.Vector3; weight: number; turn: number; index: number };

// The rim walk, subdivided so long straight edges get a smooth roll, but never
// resampled: every original rim vertex survives and the points between two of
// them sit on the straight segment the cap's own edge follows. That is what
// lets the roll's first row be the cap's edge rather than a band laid over it.
// Row 0 therefore coincides with getPuzzleTerrainRing(..., "grass", mode, 0).
function rimRing(layout: IslandLayout, pieceIndex: number, piece: PuzzlePiece, mode: PuzzleTerrainMode, spacing: number) {
  const rim = getPuzzleRimVertices(piece);
  const cap = getPuzzleTerrainRing(layout, pieceIndex, "grass", mode, 0);
  const samples: RimSample[] = [];
  const lengths: number[] = [];
  let perimeter = 0;
  for (let i = 0; i < rim.length; i++) {
    const a = rim[i], b = rim[(i + 1) % rim.length];
    const from = cap[i], to = cap[(i + 1) % rim.length];
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(span / spacing));
    for (let s = 0; s < steps; s++) {
      const f = s / steps;
      lengths.push(perimeter + span * f);
      samples.push({
        // f = 0 is the cap vertex itself, untouched; the rest interpolate the
        // same straight segment the cap's boundary runs along.
        point: from.clone().lerp(to, f),
        outward: new THREE.Vector3(),
        // The personal view shows the piece alone, so it may bulge all round;
        // the classroom view keeps the interlocking faces perfectly flush.
        weight: mode === "personal" ? 1 : a.exteriorWeight + (b.exteriorWeight - a.exteriorWeight) * f,
        turn: 0,
        index: samples.length,
      });
    }
    perimeter += span;
  }
  for (let i = 0; i < samples.length; i++) {
    const previous = samples[(i + samples.length - 1) % samples.length].point;
    const next = samples[(i + 1) % samples.length].point;
    const normal = new THREE.Vector3(next.z - previous.z, 0, -(next.x - previous.x)).normalize();
    const probe = samples[i].point.clone().addScaledVector(normal, 0.03);
    samples[i].outward.copy(puzzlePieceContains(piece, probe) ? normal.negate() : normal);
  }
  for (let i = 0; i < samples.length; i++) {
    const before = samples[(i + samples.length - 1) % samples.length].outward;
    const after = samples[(i + 1) % samples.length].outward;
    samples[i].turn = before.angleTo(after);
  }
  return { samples, perimeter, lengths };
}

// How far the roll's own surface reaches out at a given drop, in units of the
// overhang. Anything that has to start on the roll — a hanging lump's back
// plane, a tuft's root — is placed from this, so it sits on the curve rather
// than on a guessed offset from the outline.
function reachAtDrop(drop: number) {
  const profile = GRASS_OVERHANG.lip.profile;
  const clamped = THREE.MathUtils.clamp(drop, 0, profile[profile.length - 1].drop);
  for (let i = 0; i < profile.length - 1; i++) {
    if (clamped > profile[i + 1].drop) continue;
    const span = profile[i + 1].drop - profile[i].drop;
    return THREE.MathUtils.lerp(profile[i].out, profile[i + 1].out, span <= 0 ? 0 : (clamped - profile[i].drop) / span);
  }
  return profile[profile.length - 1].out;
}

// Shade under the roll. There is no cast shadow any more: the rim darkens into
// its own underside instead, which is what removes the hard line the old shelf
// drew on the rock. `at` is the row's share of the roll's total drop.
function occlusionAt(at: number) {
  const { from, shade } = GRASS_OVERHANG.lip.ao;
  return THREE.MathUtils.lerp(1, shade, THREE.MathUtils.smoothstep(at, from, 1));
}

// The rim roll: the cap's outer edge carried outward and down as one rounded
// band. Row 0 is the cap's own vertex, so this is a continuation of the meadow
// surface rather than a lip sitting on top of it.
function buildLip(ring: RimSample[], metrics: { grass: number; total: number }, top: number, reachAt: (index: number) => number) {
  const overhang = GRASS_OVERHANG.lip.overhang * metrics.total;
  const profile = GRASS_OVERHANG.lip.profile;
  const last = profile.length - 1;
  const rows = ring.map((sample, index) => {
    const weight = reachAt(index);
    return profile.map((row) => sample.point.clone()
      .addScaledVector(sample.outward, row.out * weight * overhang)
      .setY(top - row.drop * metrics.grass));
  });
  const tones = profile.map((row) => (row.drop / LIP_BOTTOM) * GRASS_OVERHANG.lipSpan);
  const occlusion = profile.map((row) => occlusionAt(row.drop / LIP_BOTTOM));
  const positions: number[] = [], colors: number[] = [];
  const tint = new THREE.Color();
  const push = (p: THREE.Vector3, r: number, shade: number) => {
    rimColor(tones[r], p.x, p.z, p.y, tint).multiplyScalar(shade * occlusion[r]);
    positions.push(p.x, p.y, p.z);
    colors.push(tint.r, tint.g, tint.b);
  };
  for (let i = 0; i < rows.length; i++) {
    const j = (i + 1) % rows.length;
    // A faint per-column shade keeps the flat-shaded band from reading as one
    // machined moulding. It eases in from nothing, so the shared row-0 vertices
    // keep exactly the colour the cap gives them and the join stays invisible.
    const column = 0.96 + hash(i * 0.37) * 0.08;
    const shade = (r: number) => 1 + (column - 1) * Math.min(1, r / 2);
    for (let r = 0; r < last; r++) {
      push(rows[i][r], r, shade(r)); push(rows[j][r], r, shade(r)); push(rows[i][r + 1], r + 1, shade(r + 1));
      push(rows[j][r], r, shade(r) * 0.98); push(rows[j][r + 1], r + 1, shade(r + 1) * 0.98); push(rows[i][r + 1], r + 1, shade(r + 1) * 0.98);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, rows };
}

// Rebuild a Blender-modelled lump from its profile table. Rings run down the
// hang, each a half or full ellipse; the last ring closes onto a single tip
// vertex so no lump ever ends in a point. Colours continue the rim ramp from
// the grip downward, so the first visible slice matches the roll above it.
function buildDripGeometry(variant: DripVariant) {
  const { closed, columns, halfWidth, depth } = DRIP_SHAPES[variant];
  const rings = halfWidth.length;
  const vertices: THREE.Vector3[] = [];
  const ringStart: number[] = [];
  for (let r = 0; r < rings; r++) {
    // Rings stop at 0.9 so the tip vertex can round the last stretch off.
    const y = -(r / (rings - 1)) * 0.9;
    ringStart.push(vertices.length);
    for (let c = 0; c < columns; c++) {
      const a = closed ? (c / columns) * Math.PI * 2 : (c / (columns - 1)) * Math.PI;
      vertices.push(closed
        ? new THREE.Vector3(halfWidth[r] * Math.sin(a), y, depth[r] * Math.cos(a))
        : new THREE.Vector3(-halfWidth[r] * Math.cos(a), y, depth[r] * Math.sin(a)));
    }
  }
  const tip = vertices.length;
  vertices.push(new THREE.Vector3(0, -1, depth[rings - 1] * 0.35));

  const positions: number[] = [], colors: number[] = [];
  const tone = new THREE.Color();
  const face = (...indices: number[]) => {
    for (const index of indices) {
      const v = vertices[index];
      positions.push(v.x, v.y, v.z);
      toneAt(GRIP_TONE + (1 - GRIP_TONE) * -v.y, tone);
      colors.push(tone.r, tone.g, tone.b);
    }
  };
  const span = closed ? columns : columns - 1;
  for (let r = 0; r < rings - 1; r++) {
    for (let c = 0; c < span; c++) {
      const a = ringStart[r] + c, b = ringStart[r] + ((c + 1) % columns);
      const d = ringStart[r + 1] + c, e = ringStart[r + 1] + ((c + 1) % columns);
      face(a, b, e); face(a, e, d);
    }
  }
  for (let c = 0; c < span; c++) face(ringStart[rings - 1] + c, ringStart[rings - 1] + ((c + 1) % columns), tip);
  if (!closed) {
    // Flat back, so the lump is watertight where it meets the rock.
    for (let r = 0; r < rings - 1; r++) {
      const a = ringStart[r], b = ringStart[r] + columns - 1;
      const d = ringStart[r + 1], e = ringStart[r + 1] + columns - 1;
      face(a, d, e); face(a, e, b);
    }
    face(ringStart[rings - 1], tip, ringStart[rings - 1] + columns - 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// A few blades fanned out of one root, pointing along +y. `root` and `tip` are
// ramp positions, so the same builder makes dark moss for the rock wall and
// meadow-green tufts for the roll.
function buildTuftGeometry(root: number, tip: number, salt = 0) {
  const blades = Array.from({ length: 5 }, (_, i) => {
    const lean = 0.45 + hash(salt + i * 5.1) * 0.5;
    const around = (i / 5) * Math.PI * 2 + hash(salt + i * 2.3);
    const height = 0.7 + hash(salt + i * 7.7) * 0.6;
    return new THREE.ConeGeometry(0.11, height, 3)
      .translate(0, height / 2, 0)
      .rotateX(lean)
      .rotateY(around);
  });
  const geometry = mergeGeometries(blades, false)!;
  blades.forEach((blade) => blade.dispose());
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const tone = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    toneAt(THREE.MathUtils.lerp(root, tip, THREE.MathUtils.clamp(position.getY(i), 0, 1)), tone);
    colors[i * 3] = tone.r; colors[i * 3 + 1] = tone.g; colors[i * 3 + 2] = tone.b;
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// A small chipped bush, in the same faceted idiom as the cap's shore garden,
// sized to sit on the roll rather than on flat ground.
function buildRimBushGeometry() {
  let n = 0;
  const random = () => hash(9137 + n++ * 3.71);
  const lobes = [[0, 0.42, 0], [-0.34, 0.3, 0.12], [0.3, 0.26, -0.14]].map(([x, y, z], i) => {
    const size = 0.46 - i * 0.07;
    return chisel(new THREE.IcosahedronGeometry(1, 0), random, 0.16)
      .scale(size, size * 0.82, size)
      .translate(x, y, z);
  });
  const geometry = mergeGeometries(lobes, false)!;
  lobes.forEach((lobe) => lobe.dispose());
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const tone = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    // Lit on top, settling into the rim ramp underneath.
    toneAt(0.24 - THREE.MathUtils.clamp(position.getY(i), 0, 0.9) * 0.22, tone);
    colors[i * 3] = tone.r; colors[i * 3 + 1] = tone.g; colors[i * 3 + 2] = tone.b;
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const UP = new THREE.Vector3(0, 1, 0);

// Place a lump so its back lies on the wall: local +z is the outward normal,
// +y is world up, `tilt` leans it sideways within the wall plane and `flow`
// leans it out of that plane, following the roll's tangent at the grip.
function lumpMatrix(position: THREE.Vector3, outward: THREE.Vector3, width: number, length: number, depth: number, tilt: number, flow: number) {
  const tangent = new THREE.Vector3().crossVectors(UP, outward).normalize();
  const matrix = new THREE.Matrix4().makeBasis(tangent, UP, outward);
  matrix.multiply(new THREE.Matrix4().makeRotationZ(tilt));
  matrix.multiply(new THREE.Matrix4().makeRotationX(flow));
  matrix.scale(new THREE.Vector3(width, length, depth));
  matrix.setPosition(position);
  return matrix;
}

export function createGrassOverhang(layout: IslandLayout, pieceIndex: number, mode: PuzzleTerrainMode, meadow?: THREE.MeshStandardMaterial) {
  const piece = getPuzzleLayout(layout).pieces[pieceIndex];
  const polygon = getPuzzlePiecePolygon(piece);
  const metrics = getPuzzleTerrainMetrics(layout, pieceIndex, mode);
  const top = layout.surfaceY + 0.015;
  const overhang = GRASS_OVERHANG.lip.overhang * metrics.total;
  const settings = GRASS_OVERHANG.drips;
  const seed = GRASS_OVERHANG.seed + pieceIndex * 97 + (mode === "classroom" ? 13 : 0);

  const group = new THREE.Group();
  group.name = "grass-overhang";
  // The cap hands its own material down, so the roll is literally the same
  // surface as the meadow it grows out of.
  const material = meadow ?? createMeadowMaterial();

  // Sampling is coarser for the classroom preview, where a piece is small.
  const spacing = (metrics.total * 0.06) * (mode === "classroom" ? 1.8 : 1);
  const { samples, perimeter, lengths } = rimRing(layout, pieceIndex, piece, mode, spacing);
  // How much of a lump the roll covers, between its grip and the roll's bottom.
  const hiddenByLip = (LIP_BOTTOM - settings.grip) * metrics.grass;

  // A piece's outward reach is capped by the lowest exterior weight anywhere
  // under its footprint, not just at its anchor. A wide lump centred on an
  // outer edge can still reach past the corner, where outward means straight
  // into the neighbouring piece. The rim is subdivided rather than evenly
  // resampled, so the window is walked by world distance, not index count.
  const safeWeight = (index: number, reach: number) => {
    let lowest = samples[index].weight;
    for (const step of [-1, 1]) {
      for (let d = 1; d < samples.length; d++) {
        const j = ((index + step * d) % samples.length + samples.length) % samples.length;
        if (samples[index].point.distanceTo(samples[j].point) > reach) break;
        lowest = Math.min(lowest, samples[j].weight);
      }
    }
    return lowest;
  };

  const lip = buildLip(samples, metrics, top, (index) => safeWeight(index, spacing * 1.5));
  requireInsideOutline(lip.rows.flat(), piece, "Grass lip", overhang * 1.02);
  const lipMesh = new THREE.Mesh(lip.geometry, material);
  lipMesh.name = "grass-lip";
  // The roll no longer casts: its own vertex-colour occlusion is the shading
  // under the rim, which stays soft where a cast shadow drew a hard edge.
  lipMesh.castShadow = false;
  lipMesh.receiveShadow = true;
  group.add(lipMesh);

  // --- hanging lumps -------------------------------------------------------
  const variants = MODE_VARIANTS[mode];
  type Instance = { matrix: THREE.Matrix4; shade: number };
  const buckets = new Map<DripVariant, Instance[]>(variants.map((variant) => [variant, []]));
  const candidates = Math.max(10, Math.round(perimeter * settings.perUnit));
  const meanSpacing = perimeter / candidates;
  const indexAt = (s: number) => {
    let index = 0;
    while (index < lengths.length - 1 && lengths[index + 1] <= s) index++;
    return index;
  };
  const corners = new Set<number>();
  if (variants.includes("corner")) {
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].turn < settings.cornerTurn || samples[i].weight < SEAM_WEIGHT) continue;
      // Keep one lump per corner: skip a turn that a neighbour already claimed.
      if (corners.has((i + samples.length - 1) % samples.length) || corners.has((i + samples.length - 2) % samples.length)) continue;
      corners.add(i);
    }
  }
  const checked: THREE.Vector3[] = [];
  const shapes = new Map(variants.map((variant) => [variant, buildDripGeometry(variant)]));

  // Slide a piece back along the wall normal, then narrow it, until its whole
  // bounding box is within the overhang budget. A wide lump on a convex
  // stretch of rim overshoots at its ends, because the outline curves away
  // from the chord it sits on; on a tab or socket the budget is zero, so
  // nothing can reach into a neighbouring piece. Returns the accepted matrix,
  // or null when that stretch of rim has to stay bare.
  const probe = new THREE.Vector3();
  function fitToWall(geometry: THREE.BufferGeometry, anchor: THREE.Vector3, outward: THREE.Vector3, budget: number, compose: (position: THREE.Vector3, narrow: number) => THREE.Matrix4) {
    const points = hullPoints(geometry);
    for (let shrink = 0; shrink < 6; shrink++) {
      const position = anchor.clone();
      for (let step = 0; step < 14; step++) {
        const matrix = compose(position, 1 - shrink * 0.15);
        let worst = 0;
        for (const [x, y, z] of points) {
          probe.set(x, y, z).applyMatrix4(matrix);
          if (!insidePolygon(probe, polygon)) worst = Math.max(worst, distanceToPuzzleRim(probe, polygon));
        }
        if (worst <= budget) {
          for (const [x, y, z] of points) checked.push(new THREE.Vector3(x, y, z).applyMatrix4(matrix));
          return matrix;
        }
        position.addScaledVector(outward, -(worst - budget) - overhang * 0.08);
      }
    }
    return null;
  }

  // Where the roll's own surface is at the grip, so a lump's back plane starts
  // on that curve and the roll's remaining depth buries its top ring.
  const gripOut = reachAtDrop(settings.grip) * settings.embed;

  const addLump = (variant: DripVariant, sample: RimSample, width: number, length: number, tilt: number) => {
    const bucket = buckets.get(variant), geometry = shapes.get(variant);
    if (!bucket || !geometry) return;
    const depth = settings.depth * overhang;
    const outward = sample.outward;
    // A seam sample may not reach out at all; an outer one gets the full roll.
    const weight = safeWeight(sample.index, width * 0.6);
    const budget = overhang * weight;
    const anchor = sample.point.clone()
      .addScaledVector(outward, gripOut * overhang * weight)
      .setY(top - settings.grip * metrics.grass);
    // `length` is the hang below the roll; the stretch the roll hides is added
    // back, or a short lump would never clear its own grip.
    const total = length + hiddenByLip;
    const matrix = fitToWall(geometry, anchor, outward, budget,
      (position, narrow) => lumpMatrix(position, outward, width * narrow, total, depth, tilt, settings.flow));
    if (matrix) bucket.push({ matrix, shade: meadowShade(sample.point.x, sample.point.z) });
  };

  for (const index of corners) {
    const sample = samples[index];
    const long = hash(seed + index * 11.3) < settings.longRatio;
    const range = long ? settings.long : settings.short;
    const length = (range[0] + hash(seed + index * 4.1) * (range[1] - range[0])) * metrics.rock;
    addLump("corner", sample, meanSpacing * (1.1 + hash(seed + index * 6.9) * 0.6), length, (hash(seed + index * 8.5) - 0.5) * settings.tilt);
  }

  for (let k = 0; k < candidates; k++) {
    // Jittered spacing, so the lumps never fall on a regular pitch.
    const s = ((k + 0.15 + hash(seed + k * 1.7) * 0.7) / candidates) * perimeter;
    const index = indexAt(s);
    const sample = samples[index];
    if (sample.weight < SEAM_WEIGHT) continue;
    // Corner lumps already cover their stretch of rim.
    const guard = Math.max(2, samples.length * 0.02);
    if ([...corners].some((c) => Math.min(Math.abs(c - index), samples.length - Math.abs(c - index)) < guard)) continue;
    // Long dense runs alternate with near-bare stretches.
    const coverageField = 0.5 + 0.5 * bands(s, perimeter, seed, COVERAGE_HARMONICS);
    const coverage = settings.coverage[0] + coverageField * (settings.coverage[1] - settings.coverage[0]);
    if (hash(seed + k * 3.3) > coverage * Math.sqrt(sample.weight)) continue;

    const long = hash(seed + k * 7.9) < settings.longRatio;
    const lengthField = 0.5 + 0.5 * bands(s, perimeter, seed + 41, LENGTH_HARMONICS);
    const range = long ? settings.long : settings.short;
    // The field keeps neighbouring lumps a similar length, so they read as one
    // fringe rather than independent teeth.
    const blended = long ? lengthField * 0.25 + hash(seed + k * 5.1) * 0.75
      : lengthField * 0.7 + hash(seed + k * 5.1) * 0.3;
    const length = (range[0] + blended * (range[1] - range[0])) * metrics.rock;
    const width = meanSpacing * (settings.width[0] + hash(seed + k * 2.9) * (settings.width[1] - settings.width[0]));
    const variant: DripVariant = long && variants.includes("strand") ? "strand"
      : width > meanSpacing * 1.6 ? "curtain" : "blob";
    addLump(variant, sample, width, length, (hash(seed + k * 9.7) - 0.5) * settings.tilt);
  }
  requireInsideOutline(checked, piece, "Grass overhang lump", overhang * 1.02);

  const addInstances = (geometry: THREE.BufferGeometry, instances: Instance[], name: string, casts: boolean) => {
    const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
    const shade = new THREE.Color();
    instances.forEach((instance, i) => {
      mesh.setMatrixAt(i, instance.matrix);
      mesh.setColorAt(i, shade.setScalar(instance.shade));
    });
    mesh.name = name;
    mesh.castShadow = casts;
    mesh.receiveShadow = true;
    mesh.userData.excludeFromRaycast = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
  };

  for (const [variant, instances] of buckets) {
    if (!instances.length) { shapes.get(variant)?.dispose(); continue; }
    // Per-lump shadows just noise up the rock wall; the ramp and the roll's
    // own occlusion carry the depth instead.
    addInstances(shapes.get(variant)!, instances, `grass-overhang-${variant}`, false);
  }

  // --- planting carried over the rim ---------------------------------------
  if (mode === "personal") {
    const rim = GRASS_OVERHANG.rim;
    const random = layout.random(5100 + pieceIndex);
    const tufts: Instance[] = [], bushes: Instance[] = [];
    const tuftShape = buildTuftGeometry(0.14, 0.02, 77), bushShape = buildRimBushGeometry();
    const count = Math.max(6, Math.round(perimeter * rim.perUnit));
    for (let k = 0; k < count; k++) {
      const s = ((k + random()) / count) * perimeter;
      const sample = samples[indexAt(s)];
      if (sample.weight < SEAM_WEIGHT) continue;
      const bush = random() < rim.bushRatio;
      const band = bush ? rim.bushSize : rim.size;
      const size = (band[0] + random() * (band[1] - band[0])) * metrics.grass;
      const seat = rim.seat[0] + random() * (rim.seat[1] - rim.seat[0]);
      const weight = safeWeight(sample.index, size);
      const anchor = sample.point.clone()
        .addScaledVector(sample.outward, reachAtDrop(seat) * overhang * weight)
        // Rooted just under the roll's surface, so no plant stands on a stalk.
        .setY(top - seat * metrics.grass - size * 0.18);
      const tangent = new THREE.Vector3().crossVectors(UP, sample.outward).normalize();
      const lean = rim.lean[0] + random() * (rim.lean[1] - rim.lean[0]);
      const spin = random() * Math.PI * 2;
      const shape = bush ? bushShape : tuftShape;
      const matrix = fitToWall(shape, anchor, sample.outward, overhang * weight, (position, narrow) => {
        const m = new THREE.Matrix4().makeBasis(tangent, UP, sample.outward)
          .multiply(new THREE.Matrix4().makeRotationX(lean))
          .multiply(new THREE.Matrix4().makeRotationY(spin))
          .scale(new THREE.Vector3(size * narrow, size * narrow, size * narrow));
        m.setPosition(position);
        return m;
      });
      if (matrix) (bush ? bushes : tufts).push({ matrix, shade: meadowShade(sample.point.x, sample.point.z) * (0.92 + random() * 0.16) });
    }
    requireInsideOutline(checked, piece, "Rim planting", overhang * 1.02);
    if (tufts.length) addInstances(tuftShape, tufts, "rim-grass-tufts", false); else tuftShape.dispose();
    if (bushes.length) addInstances(bushShape, bushes, "rim-bushes", false); else bushShape.dispose();
  }

  // --- moss in the rock ----------------------------------------------------
  if (mode === "personal") {
    const random = layout.random(3300 + pieceIndex);
    const rockTop = top - metrics.grass;
    const tufts: Instance[] = [];
    const moss = buildTuftGeometry(0.9, 0.45);
    for (const edge of piece.edges) {
      const count = GRASS_OVERHANG.moss.perEdge[0] + Math.floor(random() * (GRASS_OVERHANG.moss.perEdge[1] - GRASS_OVERHANG.moss.perEdge[0] + 1));
      for (let n = 0; n < count; n++) {
        const path = edge.internal ? edge.tab : [edge.a, edge.b];
        const along = random() * (path.length - 1);
        const a = path[Math.floor(along)], b = path[Math.min(path.length - 1, Math.floor(along) + 1)];
        const f = along - Math.floor(along);
        const point = { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
        const sample = samples.reduce((best, candidate) =>
          Math.hypot(candidate.point.x - point.x, candidate.point.z - point.z) < Math.hypot(best.point.x - point.x, best.point.z - point.z) ? candidate : best);
        if (sample.weight < SEAM_WEIGHT) continue;
        const size = (GRASS_OVERHANG.moss.size[0] + random() * (GRASS_OVERHANG.moss.size[1] - GRASS_OVERHANG.moss.size[0])) * metrics.rock;
        const drop = GRASS_OVERHANG.moss.band[0] + random() * (GRASS_OVERHANG.moss.band[1] - GRASS_OVERHANG.moss.band[0]);
        // Sunk into the wall so the tuft grows out of a crevice rather than
        // standing off the rock, and leaning up rather than straight out.
        const anchor = new THREE.Vector3(point.x, rockTop - drop * metrics.rock, point.z);
        const tangent = new THREE.Vector3().crossVectors(UP, sample.outward).normalize();
        const lean = Math.PI * 0.26 + (random() - 0.5) * 0.3;
        const roll = (random() - 0.5) * 0.5;
        const matrix = fitToWall(moss, anchor, sample.outward, overhang * safeWeight(sample.index, size), (position, narrow) => {
          const m = new THREE.Matrix4().makeBasis(tangent, UP, sample.outward)
            .multiply(new THREE.Matrix4().makeRotationX(lean))
            .multiply(new THREE.Matrix4().makeRotationY(roll))
            .scale(new THREE.Vector3(size * narrow, size * narrow, size * narrow));
          m.setPosition(position);
          return m;
        });
        if (matrix) tufts.push({ matrix, shade: 0.85 + hash(seed + tufts.length * 4.7) * 0.25 });
      }
    }
    requireInsideOutline(checked, piece, "Rock moss", overhang * 1.02);
    if (tufts.length) addInstances(moss, tufts, "rock-moss", false); else moss.dispose();
  }

  group.userData.overhangStats = {
    lumps: [...buckets.values()].reduce((sum, list) => sum + list.length, 0),
    corners: corners.size,
    drawCalls: group.children.length,
    maxOutward: overhang,
  };
  return group;
}
