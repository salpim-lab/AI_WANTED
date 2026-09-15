import assert from "node:assert/strict";
import test from "node:test";
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { createIslandLayout } from "../placement.ts";
import { createPuzzleLayout, createPuzzlePieceLayerGeometry, getPuzzlePiecePolygon, puzzleAreaStats, puzzlePieceContains, PUZZLE_PIECE_COUNT, PUZZLE_STUDENT_PIECE_MAP } from "../puzzle.ts";

test("rendered piece and raycast hits use the same XZ direction as puzzle data", () => {
  const island = createIslandLayout(17);
  const piece = createPuzzleLayout(island).pieces[PUZZLE_STUDENT_PIECE_MAP[1]];
  const geometry = createPuzzlePieceLayerGeometry(island, piece.index, 0.38);
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  mesh.position.y = island.surfaceY + 0.015;
  mesh.updateMatrixWorld(true);
  const raycaster = new Raycaster();
  const samples = [piece.seed, { x: piece.seed.x + 0.35, z: piece.seed.z }, { x: piece.seed.x, z: piece.seed.z - 0.35 }];
  for (const sample of samples) {
    assert.equal(puzzlePieceContains(piece, sample), true);
    raycaster.set(new Vector3(sample.x, 10, sample.z), new Vector3(0, -1, 0));
    const hit = raycaster.intersectObject(mesh)[0];
    assert.ok(hit, `world XZ ${sample.x}, ${sample.z} hits rendered piece`);
    assert.equal(puzzlePieceContains(piece, { x: hit.point.x, z: hit.point.z }), true);
  }
  geometry.dispose();
  mesh.material.dispose();
});

test("20 rendered pieces keep one surface hit on each side of shared seams", () => {
  const island = createIslandLayout(17);
  const layout = createPuzzleLayout(island);
  const material = new MeshBasicMaterial();
  const meshes = layout.pieces.map((piece) => {
    const mesh = new Mesh(createPuzzlePieceLayerGeometry(island, piece.index, 0.38), material);
    mesh.position.y = island.surfaceY + 0.015;
    mesh.updateMatrixWorld(true);
    return mesh;
  });
  const raycaster = new Raycaster();
  const hitCount = (point) => {
    raycaster.set(new Vector3(point.x, 10, point.z), new Vector3(0, -1, 0));
    return raycaster.intersectObjects(meshes).length;
  };
  for (const piece of layout.pieces) assert.equal(hitCount(piece.seed), 1, `seed ${piece.index} has exactly one surface`);
  const seams = layout.pieces.flatMap((piece) => piece.edges.filter((edge) => edge.internal)).slice(0, 10);
  for (const edge of seams) {
    const path = edge.tab;
    const midpoint = path[Math.floor(path.length / 2)];
    const dx = edge.b.x - edge.a.x, dz = edge.b.z - edge.a.z;
    const length = Math.hypot(dx, dz);
    for (const direction of [-1, 1]) {
      const point = { x: midpoint.x + direction * -dz / length * 0.03, z: midpoint.z + direction * dx / length * 0.03 };
      assert.equal(hitCount(point), 1, `shared seam side has exactly one surface`);
    }
  }
  meshes.forEach((mesh) => mesh.geometry.dispose());
  material.dispose();
});

test("the half-island is a deterministic 20-piece organic Voronoi layout", () => {
  const layout = createPuzzleLayout(createIslandLayout(17), 20260915);
  assert.equal(layout.pieces.length, PUZZLE_PIECE_COUNT);
  assert.deepEqual(layout, createPuzzleLayout(createIslandLayout(17), 20260915));
  assert.ok(puzzleAreaStats(layout).ratio <= 1.5, `area ratio ${puzzleAreaStats(layout).ratio}`);
  assert.ok(layout.pieces.every((piece) => getPuzzlePiecePolygon(piece).length >= 4));
});

test("internal puzzle edges are shared by two pieces with the same curved path", () => {
  const layout = createPuzzleLayout(createIslandLayout(17), 20260915);
  const edges = new Map();
  for (const piece of layout.pieces) for (const edge of piece.edges) {
    if (!edge.internal) continue;
    const id = [
      `${edge.a.x.toFixed(4)},${edge.a.z.toFixed(4)}`,
      `${edge.b.x.toFixed(4)},${edge.b.z.toFixed(4)}`,
    ].sort().join("|");
    const path = edge.tab.map((point) => [point.x.toFixed(4), point.z.toFixed(4)]);
    const previous = edges.get(id);
    if (previous) assert.deepEqual(path, previous.path);
    else edges.set(id, { path });
  }
  assert.ok(edges.size >= 15, `internal edges ${edges.size}`);
});
