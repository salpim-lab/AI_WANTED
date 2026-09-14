import assert from "node:assert/strict";
import test from "node:test";
import { canPlaceGift, classroomEdges, createPuzzleShape, insideOutline, TILE_SIZE } from "../puzzleGeometry.ts";

test("all classroom neighbors have complementary connectors and the outside is flat", () => {
  for (const [rows, cols] of [[3, 3], [4, 6], [1, 1]]) {
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const [north, east, south, west] = classroomEdges(row, col, rows, cols);
      if (row === 0) assert.equal(north, 0);
      if (row === rows - 1) assert.equal(south, 0);
      if (col === 0) assert.equal(west, 0);
      if (col === cols - 1) assert.equal(east, 0);
      if (col + 1 < cols) assert.equal(east + classroomEdges(row, col + 1, rows, cols)[3], 0);
      if (row + 1 < rows) assert.equal(south + classroomEdges(row + 1, col, rows, cols)[0], 0);
    }
  }
});

test("neighboring puzzle curves physically coincide at the nominal tile spacing", () => {
  for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
    const left = createPuzzleShape(classroomEdges(row, col)).getPoints(40);
    const right = createPuzzleShape(classroomEdges(row, col + 1)).getPoints(40);
    const boundary = left.filter((p) => p.x > TILE_SIZE / 2 - 0.8 && Math.abs(p.y) < 0.8);
    assert.ok(boundary.length > 10);
    for (const p of boundary) assert.ok(right.some((q) => Math.hypot(p.x - q.x - TILE_SIZE, p.y - q.y) < 0.00001));
  }
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const top = createPuzzleShape(classroomEdges(row, col)).getPoints(40);
    const bottom = createPuzzleShape(classroomEdges(row + 1, col)).getPoints(40);
    const boundary = top.filter((p) => p.y < -TILE_SIZE / 2 + 0.8 && Math.abs(p.x) < 0.8);
    assert.ok(boundary.length > 10);
    for (const p of boundary) assert.ok(bottom.some((q) => Math.hypot(p.x - q.x, p.y - q.y + TILE_SIZE) < 0.00001));
  }
});

test("placement stays on the lawn and avoids pond, cottage, trees, flowers and paths", () => {
  const points = createPuzzleShape(classroomEdges(1, 1)).getPoints(28);
  assert.equal(insideOutline(0, 0, points), true);
  assert.equal(canPlaceGift(-0.75, 1.3, points), true);
  assert.equal(canPlaceGift(-1.1, 0.7, points), true);
  for (const [x, z] of [[10, 10], [-0.94, -1.03], [1.05, 0.15], [1.65, -1.65], [-1.62, 1.03], [0.85, 2.4], [0, 2.45]]) {
    assert.equal(canPlaceGift(x, z, points), false, `blocked position ${x}, ${z}`);
  }
});
