import assert from "node:assert/strict";
import test from "node:test";
import { ShapeUtils, Vector3 } from "three";
import { createTerrainGeometry, terrainProportions } from "../islandTerrain.ts";
import { classroomEdges, createPuzzleShape, insideOutline, SURFACE_Y, TILE_SIZE } from "../puzzleGeometry.ts";

const pieces = [[1, 1, 17], [0, 0, 17], [2, 1, 565], [1, 2, 900]];
const build = (row, col, seed) => createTerrainGeometry(createPuzzleShape(classroomEdges(row, col)), { tileSize: TILE_SIZE, surfaceY: SURFACE_Y, seed });

function triangles(geometry) {
  const position = geometry.getAttribute("position");
  const result = [];
  for (let i = 0; i < position.count; i += 3) {
    result.push([0, 1, 2].map((k) => new Vector3().fromBufferAttribute(position, i + k)));
  }
  return result;
}

test("terrain is generated deterministically from its seed", () => {
  const a = build(1, 1, 17).getAttribute("position").array;
  const b = build(1, 1, 17).getAttribute("position").array;
  const c = build(1, 1, 18).getAttribute("position").array;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("the flat meadow covers exactly the puzzle outline", () => {
  for (const [row, col, seed] of pieces) {
    const shape = createPuzzleShape(classroomEdges(row, col));
    let area = 0;
    for (const [a, b, c] of triangles(build(row, col, seed))) {
      if ([a, b, c].every((v) => Math.abs(v.y - SURFACE_Y) < 1e-6)) area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    }
    const expected = Math.abs(ShapeUtils.area(shape.getPoints(64)));
    assert.ok(Math.abs(area - expected) / expected < 0.002, `meadow ${area} vs outline ${expected}`);
  }
});

test("the base is a closed, outward-facing solid with diorama proportions", () => {
  const size = terrainProportions(TILE_SIZE);
  assert.ok(size.grass / TILE_SIZE >= 0.015 && size.grass / TILE_SIZE <= 0.025);
  assert.ok(size.soil / TILE_SIZE >= 0.015 && size.soil / TILE_SIZE <= 0.03);
  for (const [row, col, seed] of pieces) {
    let volume = 0, minY = Infinity;
    for (const [a, b, c] of triangles(build(row, col, seed))) {
      volume += a.dot(b.clone().cross(c)) / 6;
      minY = Math.min(minY, a.y, b.y, c.y);
    }
    assert.ok(volume > 0, "faces wind outward");
    const depth = (SURFACE_Y - minY) / TILE_SIZE;
    assert.ok(depth >= 0.11 && depth <= 0.16, `side depth ${(depth * 100).toFixed(1)}% of a tile`);
  }
});

test("soil, rock and boulders stay tucked under the grass cap", () => {
  const belowDrips = SURFACE_Y - terrainProportions(TILE_SIZE).grass * 1.85;
  for (const [row, col, seed] of pieces) {
    const outline = createPuzzleShape(classroomEdges(row, col)).getPoints(64);
    for (const [a, b, c] of triangles(build(row, col, seed))) {
      const center = a.clone().add(b).add(c).divideScalar(3);
      for (const point of [a, b, c, center]) {
        if (point.y < belowDrips) assert.ok(insideOutline(point.x, point.z, outline), `${point.toArray()} pokes out of the cap`);
      }
    }
  }
});
