import * as THREE from "three";
import type { IslandLayout } from "./placement";
import { getPuzzleLayout, getPuzzlePiecePolygon, getPuzzleTerrainMetrics, getPuzzleTerrainRing, puzzlePieceContains, type PuzzlePoint, type PuzzleTerrainMode } from "./puzzle";
import { distanceToPuzzleRim } from "./puzzleDecorations";

// Grass rolling over the rim and hanging down the rock wall in uneven,
// round-ended tongues. Lengths are fractions of the exposed rock height.
export const SKIRT_LIP = 0.05;
export const SKIRT_MIN_LENGTH = 0.07;
export const SKIRT_MAX_LENGTH = 0.46;
// Tongue centres per world unit of rim, and their half-width range.
export const SKIRT_TONGUES_PER_UNIT = 1.9;
export const SKIRT_TONGUE_WIDTH = [0.14, 0.34] as const;
export const SKIRT_SAMPLE_SPACING = 0.07;
// The curtain sits just inside the outline and curls inward at its tips.
export const SKIRT_INSET = 0.012;
export const SKIRT_TIP_CURL = 0.05;
export const SKIRT_TONES = ["#93d05a", "#72b646", "#58993a", "#467f31"] as const;

type Piece = ReturnType<typeof getPuzzleLayout>["pieces"][number];

function inside(point: THREE.Vector3, piece: Piece) {
  return puzzlePieceContains(piece, { x: point.x, z: point.z });
}

// Every vertex of every curtain part is checked against the outline.
export function requireInsideOutline(points: THREE.Vector3[], piece: Piece, label: string) {
  for (const point of points) if (!inside(point, piece)) throw new Error(`${label} crosses puzzle outline on piece ${piece.index}`);
}

// Inward normal at each rim sample from the neighbouring outline direction,
// so the curtain follows every tab and socket instead of shrinking to a centre.
function inwardNormals(points: THREE.Vector3[], piece: Piece) {
  return points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length], next = points[(index + 1) % points.length];
    const normal = new THREE.Vector3(-(next.z - previous.z), 0, next.x - previous.x).normalize();
    const probe = point.clone().addScaledVector(normal, 0.03);
    return inside(probe, piece) ? normal : normal.negate();
  });
}

function insetPoint(point: THREE.Vector3, normal: THREE.Vector3, distance: number, piece: Piece, polygon: PuzzlePoint[]) {
  const ok = (p: THREE.Vector3) => inside(p, piece) && distanceToPuzzleRim(p, polygon) >= distance * 0.5;
  const result = point.clone().addScaledVector(normal, distance);
  // Concave tab corners: keep stepping inward until the requested clearance holds.
  for (let k = 0; k < 20 && !ok(result); k++) result.addScaledVector(normal, distance * 0.5);
  // A sharp corner can point the local normal at the opposite wall; fall
  // back to walking toward the piece's interior seed.
  if (!ok(result)) {
    result.copy(point);
    const toward = new THREE.Vector3(piece.seed.x - point.x, 0, piece.seed.z - point.z).normalize();
    for (let k = 0; k < 60 && !ok(result); k++) result.addScaledVector(toward, distance * 0.5);
  }
  if (!inside(result, piece)) throw new Error(`Unable to inset skirt on piece ${piece.index}`);
  return result;
}

function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function createGrassSkirt(layout: IslandLayout, pieceIndex: number, mode: PuzzleTerrainMode, _grassMaterial?: THREE.Material, singleLongEdge = false) {
  const piece = getPuzzleLayout(layout).pieces[pieceIndex];
  const polygon = getPuzzlePiecePolygon(piece);
  const metrics = getPuzzleTerrainMetrics(layout, pieceIndex, mode);
  const rim = getPuzzleTerrainRing(layout, pieceIndex, "grass", mode, 0);
  const lengths = [0];
  for (let i = 1; i <= rim.length; i++) lengths.push(lengths[i - 1] + rim[i - 1].distanceTo(rim[i % rim.length]));
  const perimeter = lengths[rim.length];
  const samples = Math.max(64, Math.round(perimeter / (SKIRT_SAMPLE_SPACING * (mode === "classroom" ? 1.7 : 1))));
  const points: THREE.Vector3[] = [];
  for (let i = 0, segment = 0; i < samples; i++) {
    const distance = i / samples * perimeter;
    while (segment < rim.length - 1 && lengths[segment + 1] < distance) segment++;
    const t = (distance - lengths[segment]) / Math.max(1e-6, lengths[segment + 1] - lengths[segment]);
    points.push(rim[segment].clone().lerp(rim[(segment + 1) % rim.length], t));
  }
  const normals = inwardNormals(points, piece);

  // Round-ended tongues: each adds an elliptical drop around its centre.
  const seed = pieceIndex * 97 + (mode === "classroom" ? 13 : 0);
  const tongueCount = Math.max(12, Math.round(perimeter * SKIRT_TONGUES_PER_UNIT));
  const tongues = Array.from({ length: tongueCount }, (_, k) => {
    const long = hash(seed + k * 3.1) < 0.12;
    return {
      centre: (k + 0.2 + hash(seed + k * 1.7) * 0.6) / tongueCount * perimeter,
      width: SKIRT_TONGUE_WIDTH[0] + hash(seed + k * 2.3) * (SKIRT_TONGUE_WIDTH[1] - SKIRT_TONGUE_WIDTH[0]),
      length: long ? SKIRT_MAX_LENGTH * (0.8 + hash(seed + k * 4.9) * 0.2) : SKIRT_MIN_LENGTH + hash(seed + k * 5.3) ** 1.4 * (SKIRT_MAX_LENGTH * 0.62 - SKIRT_MIN_LENGTH),
      tone: Math.floor(hash(seed + k * 6.7) * 3),
    };
  });
  const dropAt = (s: number) => {
    let drop = SKIRT_LIP;
    for (const tongue of tongues) {
      let d = Math.abs(s - tongue.centre);
      d = Math.min(d, perimeter - d);
      const u = d / tongue.width;
      if (u < 1) drop = Math.max(drop, SKIRT_LIP + (tongue.length - SKIRT_LIP) * Math.sqrt(1 - u * u));
    }
    return drop;
  };

  const selected = piece.edges.reduce((best, edge) => Math.hypot(edge.b.x - edge.a.x, edge.b.z - edge.a.z) > Math.hypot(best.b.x - best.a.x, best.b.z - best.a.z) ? edge : best);
  const edgeMid = new THREE.Vector3((selected.a.x + selected.b.x) / 2, 0, (selected.a.z + selected.b.z) / 2);
  const edgeRadius = Math.hypot(selected.b.x - selected.a.x, selected.b.z - selected.a.z) * 0.58;
  const top = points[0].y - 0.008;
  // Four rows per column: rim, upper, lower, rounded tip.
  const rows = [0, 0.4, 0.78, 1];
  const columns = points.map((point, i) => {
    const s = i / samples * perimeter;
    const drop = dropAt(s) * metrics.rock;
    return rows.map((f) => {
      const inset = SKIRT_INSET + SKIRT_TIP_CURL * f ** 3;
      const p = insetPoint(point, normals[i], inset, piece, polygon);
      p.y = top - metrics.grass * (f === 0 ? 0 : 1) - drop * f;
      return p;
    });
  });
  requireInsideOutline(columns.flat(), piece, "Grass skirt");

  const vertices: number[] = [], colors: number[] = [];
  const tone = new THREE.Color();
  const emit = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: string, shade: number) => {
    tone.set(color).multiplyScalar(shade);
    for (const p of [a, b, c]) { vertices.push(p.x, p.y, p.z); colors.push(tone.r, tone.g, tone.b); }
  };
  for (let i = 0; i < samples; i++) {
    const j = (i + 1) % samples;
    if (singleLongEdge && (points[i].distanceTo(edgeMid) > edgeRadius || points[j].distanceTo(edgeMid) > edgeRadius)) continue;
    const shade = 0.96 + hash(seed + i * 0.37) * 0.08;
    for (let r = 0; r < rows.length - 1; r++) {
      const color = SKIRT_TONES[Math.min(SKIRT_TONES.length - 1, r + (hash(seed + Math.floor(i / 5)) > 0.7 ? 1 : 0))];
      emit(columns[i][r], columns[j][r], columns[i][r + 1], color, shade);
      emit(columns[j][r], columns[j][r + 1], columns[i][r + 1], color, shade * 0.97);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "rounded-grass-curtain";
  mesh.castShadow = true; mesh.receiveShadow = true;
  const group = new THREE.Group(); group.name = "grass-curtain"; group.add(mesh);
  const longest = Math.max(...tongues.map((tongue) => tongue.length));
  group.userData.outlineCheck = { skirtVertices: columns.length * rows.length, tongues: tongueCount, passed: true };
  // Rock rows that start above this height are recessed behind the curtain.
  group.userData.curtainBottom = top - metrics.grass - longest * metrics.rock;
  return group;
}

// How far the stones must stay inside the outline so they sit behind the curtain.
export const SKIRT_STONE_CLEARANCE = SKIRT_INSET + SKIRT_TIP_CURL + 0.03;
