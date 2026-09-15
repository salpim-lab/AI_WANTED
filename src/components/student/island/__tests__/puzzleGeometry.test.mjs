import assert from "node:assert/strict";
import test from "node:test";
import { OrthographicCamera, Vector3 } from "three";
import { canPlaceAmongGifts, canPlaceGift, classroomEdges, createPuzzleShape, insideOutline, NATURAL_DECORATIONS, TILE_SIZE } from "../puzzleGeometry.ts";
import { screenSunPosition } from "../sunlight.ts";

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
    const boundary = left.filter((point) => point.x > TILE_SIZE / 2 - 1.2 && Math.abs(point.y) < 2);
    assert.ok(boundary.length > 10);
    for (const point of boundary) {
      assert.ok(right.some((neighbor) => Math.hypot(point.x - neighbor.x - TILE_SIZE, point.y - neighbor.y) < 0.00001));
    }
  }
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const top = createPuzzleShape(classroomEdges(row, col)).getPoints(40);
    const bottom = createPuzzleShape(classroomEdges(row + 1, col)).getPoints(40);
    const boundary = top.filter((point) => point.y < -TILE_SIZE / 2 + 1.2 && Math.abs(point.x) < 2);
    assert.ok(boundary.length > 10);
    for (const point of boundary) {
      assert.ok(bottom.some((neighbor) => Math.hypot(point.x - neighbor.x, point.y - neighbor.y + TILE_SIZE) < 0.00001));
    }
  }
});

test("the semester-sized island accepts placements across its open areas", () => {
  const outline = createPuzzleShape(classroomEdges(1, 1)).getPoints(32);
  assert.equal(TILE_SIZE, 22);
  assert.equal(insideOutline(0, 0, outline), true);
  for (const [x, z] of [[0, 0], [3.8, 3.8], [-4.5, 2.5], [4.2, -3.8]]) {
    assert.equal(canPlaceGift(x, z, outline), true, `available position ${x}, ${z}`);
  }
  for (const [x, z] of [[30, 30], [0, 13], [-14, 0]]) {
    assert.equal(canPlaceGift(x, z, outline), false, `blocked position ${x}, ${z}`);
  }
});

test("sparse flowers, rocks and grass reserve only their own small footprints", () => {
  const outline = createPuzzleShape(classroomEdges(1, 1)).getPoints(32);
  assert.ok(NATURAL_DECORATIONS.length < 20);
  assert.deepEqual(new Set(NATURAL_DECORATIONS.map((detail) => detail.kind)), new Set(["flower", "grass", "rock"]));
  for (const detail of NATURAL_DECORATIONS) {
    assert.equal(canPlaceGift(detail.x, detail.z, outline), false, `${detail.kind} footprint is reserved`);
  }
  assert.equal(canPlaceGift(0, 0, outline), true);
});

test("only confirmed items constrain the otherwise empty placement area", () => {
  const outline = createPuzzleShape(classroomEdges(1, 1)).getPoints(32);
  const gifts = [{ id: "a", kind: "star", name: "별", x: 1, z: 1 }];
  assert.equal(canPlaceAmongGifts(1.1, 1, outline, gifts), false);
  assert.equal(canPlaceAmongGifts(2, 1, outline, gifts), true);
  assert.equal(canPlaceAmongGifts(1.1, 1, outline, gifts, "a"), true);
});

test("sun stays at screen upper left and above ground across orbit angles", () => {
  const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  const target = new Vector3(0, 1.12, 0);
  for (const elevation of [0.08, 0.6, Math.PI / 2 - 0.035]) {
    for (let azimuth = 0; azimuth < Math.PI * 2; azimuth += Math.PI / 4) {
      camera.position.set(Math.cos(azimuth) * Math.cos(elevation) * 20, Math.sin(elevation) * 20, Math.sin(azimuth) * Math.cos(elevation) * 20).add(target);
      camera.lookAt(target);
      camera.updateMatrixWorld(true);
      const sun = screenSunPosition(camera, target, 1.5);
      assert.ok(sun.y > target.y);
      const projected = sun.clone().project(camera);
      assert.ok(projected.x < 0 && projected.y > 0);
      const groundShadow = new Vector3(-sun.x, 0, -sun.z).multiplyScalar(1 / (sun.y - target.y)).add(target).project(camera);
      assert.ok(groundShadow.x > 0 && groundShadow.y < 0);
    }
  }
});
