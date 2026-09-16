import * as THREE from "three";
import type { IslandLayout } from "./placement";
import { chisel } from "./islandTerrain";
import { getPuzzleLayout, getPuzzlePiecePolygon, getPuzzleTerrainMetrics, getPuzzleTerrainRing, puzzlePieceContains, type PuzzleTerrainMode, type PuzzlePoint } from "./puzzle";

// Courses of angular slabs stacked like strata. Row heights overlap slightly
// so the dark core never shows through as gaps.
export const ROCK_ROWS = 5;
export const ROCK_ROW_OVERLAP = [1.02, 1.3] as const;
export const ROCK_WIDTH_RANGE = [0.17, 0.34] as const;
export const ROCK_VARIANTS = 7;
export const ROCK_SPACING = 0.74;
// Top course (warm grey-brown) to bottom course (dark grey).
export const ROCK_PALETTE = ["#857c72", "#766f68", "#68635f", "#5a5754", "#4c4a4a"];
export const ROCK_ACCENTS = ["#7a6a5c", "#6c6f73", "#8d8479"];
// Set true to reproduce the reviewed one-long-edge prototype.
export const ROCK_SINGLE_EDGE = false;

// Corners alone are insufficient for concave tabs: reject any polygon boundary
// entering the rectangle as well. Thus the entire projected AABB is contained.
export function rockBoxInside(box: THREE.Box3, polygon: PuzzlePoint[], contains: (p: PuzzlePoint) => boolean) {
  for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) if (!contains({ x, z })) return false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    let lo = 0, hi = 1;
    for (const [start, delta, min, max] of [[a.x, b.x - a.x, box.min.x, box.max.x], [a.z, b.z - a.z, box.min.z, box.max.z]]) {
      if (Math.abs(delta) < 1e-12) { if (start <= min || start >= max) { hi = -1; break; } }
      else { const t1 = (min - start) / delta, t2 = (max - start) / delta; lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2)); }
    }
    if (lo < hi && hi > 0 && lo < 1) return false;
  }
  return true;
}

export function createRockCliff(layout: IslandLayout, pieceIndex: number, mode: PuzzleTerrainMode) {
  const piece = getPuzzleLayout(layout).pieces[pieceIndex];
  const polygon = getPuzzlePiecePolygon(piece);
  const contains = (p: PuzzlePoint) => puzzlePieceContains(piece, p);
  const metrics = getPuzzleTerrainMetrics(layout, pieceIndex, mode);
  const H = metrics.rock, top = layout.surfaceY + 0.015 - metrics.grass;
  const bottom = top - H;
  const random = layout.random(8910 + pieceIndex);
  const group = new THREE.Group(); group.name = "stacked-rock-cliff";
  const material = new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true, roughness: 0.94, metalness: 0, fog: false, transparent: false, opacity: 1 });
  const shapes = Array.from({ length: ROCK_VARIANTS }, (_, i) => {
    const g = chisel(i % 4 === 3 ? new THREE.DodecahedronGeometry(1, 0) : new THREE.BoxGeometry(1.5, 1.1 + (i % 3) * 0.15, 1.3, 2, 1, 1).toNonIndexed(), random, 0.1);
    g.computeBoundingBox(); const size = g.boundingBox!.getSize(new THREE.Vector3());
    g.center().scale(1 / size.x, 1 / size.y, 1 / size.z); g.deleteAttribute("uv"); g.computeBoundingBox(); return g;
  });
  const buckets: { matrix: THREE.Matrix4; color: string }[][] = shapes.map(() => []);
  const helper = new THREE.Object3D(), box = new THREE.Box3();
  let pushed = 0;
  function place(p: THREE.Vector3, inward: THREE.Vector3, width: number, height: number, depth: number, color: string, seam = false) {
    const variant = Math.floor(random() * shapes.length), g = shapes[variant];
    helper.position.copy(p).addScaledVector(inward, depth * (0.38 + random() * 0.14));
    helper.rotation.set((random() - 0.5) * 0.28, Math.atan2(inward.x, inward.z) + (random() - 0.5) * 0.45, (random() - 0.5) * 0.28);
    helper.scale.set(width, height, depth);
    // Stones fill the wall right out to the outline. The grass hangs in front
    // of them now (grassOverhang.ts), so no course has to be recessed.
    let fits = false;
    for (let attempt = 0; attempt < 160; attempt++) {
      helper.updateMatrix(); box.copy(g.boundingBox!).applyMatrix4(helper.matrix);
      if (rockBoxInside(box, polygon, contains)) { fits = true; break; }
      if (attempt < 3) helper.position.addScaledVector(inward, H * 0.015);
      else {
        // At a concave corner the local normal can meet the opposite wall;
        // move toward the known interior seed and recheck the complete box.
        helper.position.x += (piece.seed.x - helper.position.x) * 0.015;
        helper.position.z += (piece.seed.z - helper.position.z) * 0.015;
      }
      pushed++;
    }
    if (!fits) {
      // Very narrow outer classroom pieces need a smaller infill stone.
      // Search their interior explicitly; never upload an unchecked instance.
      const bounds = new THREE.Box3().setFromPoints(polygon.map(q => new THREE.Vector3(q.x, 0, q.z)));
      for (let shrink = 0; shrink < 10 && !fits; shrink++) {
        for (let ix = 1; ix < 16 && !fits; ix++) for (let iz = 1; iz < 16 && !fits; iz++) {
          helper.position.x = THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, ix / 16);
          helper.position.z = THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, iz / 16);
          helper.updateMatrix(); box.copy(g.boundingBox!).applyMatrix4(helper.matrix);
          fits = rockBoxInside(box, polygon, contains);
        }
        if (!fits) { helper.scale.x *= 0.8; helper.scale.z *= 0.8; }
      }
    }
    if (!fits) throw new Error(`Rock containment failed: piece ${pieceIndex}`);
    // Preserve the existing total depth exactly, including rotated stones.
    helper.position.y += Math.max(0, bottom - box.min.y);
    helper.position.y -= Math.max(0, box.max.y + Math.max(0, bottom - box.min.y) - (seam ? top + H * 0.07 : top));
    helper.updateMatrix(); buckets[variant].push({ matrix: helper.matrix.clone(), color });
  }
  const ring = getPuzzleTerrainRing(layout, pieceIndex, "rock", mode, 0);
  // A simple vertical, untextured core, behind the stones. Local edge normals
  // retain the tab curves instead of scaling the outline toward its centroid.
  const inset = H * 0.5;
  const normalAt = (a: THREE.Vector3, b: THREE.Vector3) => {
    const n = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize();
    const mid = a.clone().lerp(b, 0.5).addScaledVector(n, H * 0.001);
    return contains(mid) ? n : n.negate();
  };
  const coreRing = ring.map((p, i) => {
    const n = normalAt(ring[(i + ring.length - 1) % ring.length], p).add(normalAt(p, ring[(i + 1) % ring.length])).normalize();
    const q = p.clone().addScaledVector(n, inset);
    // Pull corner panels behind the adjoining stones too; otherwise the
    // vertical core can read as a broad black slab at the edge ends.
    q.x += (piece.seed.x - q.x) * 0.09;
    q.z += (piece.seed.z - q.z) * 0.09;
    return contains(q) ? q : p.clone().lerp(new THREE.Vector3(piece.seed.x, p.y, piece.seed.z), 0.12);
  });
  const positions: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => positions.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  coreRing.forEach((p, i) => {
    const q = coreRing[(i + 1) % coreRing.length];
    const a = p.clone().setY(p.y), b = q.clone().setY(q.y), c = p.clone().setY(bottom), d = q.clone().setY(bottom);
    tri(a, b, c); tri(b, d, c);
  });
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(coreRing.map(p => new THREE.Vector2(p.x, p.z)), [])) tri(coreRing[a].clone().setY(bottom), coreRing[b].clone().setY(bottom), coreRing[c].clone().setY(bottom));
  const coreGeometry = new THREE.BufferGeometry(); coreGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); coreGeometry.computeVertexNormals();
  const core = new THREE.Mesh(coreGeometry, new THREE.MeshStandardMaterial({ color: "#33373d", side: THREE.DoubleSide, roughness: 1, flatShading: true, fog: false }));
  core.name = "rock-gap-core"; group.add(core);

  const longest = piece.edges.reduce((best, edge) => Math.hypot(edge.b.x-edge.a.x, edge.b.z-edge.a.z) > Math.hypot(best.b.x-best.a.x, best.b.z-best.a.z) ? edge : best);
  const paths = ROCK_SINGLE_EDGE && mode === "personal" ? [longest] : piece.edges;
  for (const edge of paths) {
    const path = edge.internal ? edge.tab : [edge.a, edge.b];
    const lengths = [0]; for (let i = 1; i < path.length; i++) lengths.push(lengths[i-1] + Math.hypot(path[i].x-path[i-1].x, path[i].z-path[i-1].z));
    const length = lengths[lengths.length-1];
    const rowHeight = H / ROCK_ROWS;
    for (let row = 0; row < ROCK_ROWS; row++) {
      // Stagger the courses like laid stone.
      let distance = H * 0.025 + (row % 2) * H * 0.09;
      while (distance < length) {
        let k = 1; while (k < lengths.length-1 && lengths[k] < distance) k++;
        const t = (distance-lengths[k-1])/(lengths[k]-lengths[k-1]);
        const a = new THREE.Vector3(path[k-1].x, 0, path[k-1].z), b = new THREE.Vector3(path[k].x, 0, path[k].z);
        const p = a.clone().lerp(b, t), inward = normalAt(a,b);
        const height = rowHeight * (ROCK_ROW_OVERLAP[0] + random() * (ROCK_ROW_OVERLAP[1] - ROCK_ROW_OVERLAP[0]));
        const width = H * (ROCK_WIDTH_RANGE[0] + random() * (ROCK_WIDTH_RANGE[1] - ROCK_WIDTH_RANGE[0])), depth = H * (0.24 + random() * 0.12);
        p.y = top - rowHeight * (row + 0.5) + (random() - 0.5) * rowHeight * 0.18;
        const color = random() < 0.18 ? ROCK_ACCENTS[Math.floor(random() * ROCK_ACCENTS.length)] : ROCK_PALETTE[Math.min(ROCK_PALETTE.length - 1, row + (random() < 0.3 ? 1 : 0))];
        place(p, inward, width, height, depth, color);
        // Thin pale ledges mark some course boundaries (strata lines).
        if (row > 0 && random() < 0.16) place(p.clone().setY(top - rowHeight * row), inward, width * 0.9, rowHeight * 0.16, depth * 1.02, "#9a9088");
        if (row > 1 && random() < 0.05) place(p.clone().add(new THREE.Vector3(0, rowHeight * 0.4, 0)), inward, H * 0.12, H * 0.06, depth * 0.98, "#6e9a3c");
        distance += width * ROCK_SPACING;
      }
    }
  }
  buckets.forEach((items, i) => {
    const mesh = new THREE.InstancedMesh(shapes[i], material, items.length);
    items.forEach((item, j) => { mesh.setMatrixAt(j,item.matrix); mesh.setColorAt(j,new THREE.Color(item.color)); });
    mesh.name = `cliff-stone-variant-${i}`; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh);
  });
  group.userData.rockStats = { count: buckets.reduce((n,b)=>n+b.length,0), variants: ROCK_VARIANTS, rows: ROCK_ROWS, inwardCorrections: pushed };
  return group;
}
