import assert from "node:assert/strict";
import test from "node:test";
import { createIslandLayout } from "../placement.ts";
import { createPuzzleLayout, getPuzzlePiecePolygon, puzzleAreaStats, PUZZLE_PIECE_COUNT } from "../puzzle.ts";

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
