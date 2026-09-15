import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { createTerrainGeometry, TERRAIN_DEPTH } from "../islandTerrain.ts";
import { createIslandLayout, ISLAND_RADIUS, SURFACE_Y } from "../placement.ts";

const seeds = [17, 565, 900, 1233];
const build = (seed) => createTerrainGeometry(createIslandLayout(seed));

function triangles(geometry) {
  const position = geometry.getAttribute("position");
  const result = [];
  for (let i = 0; i < position.count; i += 3) {
    result.push([0, 1, 2].map((k) => new Vector3().fromBufferAttribute(position, i + k)));
  }
  return result;
}

test("terrain is generated deterministically from its seed", () => {
  const a = build(17).getAttribute("position").array;
  const b = build(17).getAttribute("position").array;
  const c = build(18).getAttribute("position").array;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("the island is a watertight, outward-facing solid", () => {
  for (const seed of seeds) {
    const edges = new Map();
    const key = (v) => `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    let volume = 0;
    for (const [a, b, c] of triangles(build(seed))) {
      volume += a.dot(b.clone().cross(c)) / 6;
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const forward = `${key(p)}|${key(q)}`;
        edges.set(forward, (edges.get(forward) ?? 0) + 1);
      }
    }
    assert.ok(volume > 0, "faces wind outward");
    for (const [edge, count] of edges) {
      const [p, q] = edge.split("|");
      assert.equal(count, 1, `edge ${edge} is used twice in the same direction`);
      assert.equal(edges.get(`${q}|${p}`), 1, `edge ${edge} has no opposite face`);
    }
  }
});

test("the meadow follows the gentle hills and covers the whole outline", () => {
  for (const seed of seeds) {
    const layout = createIslandLayout(seed);
    let area = 0;
    for (const [a, b, c] of triangles(createTerrainGeometry(layout))) {
      if (![a, b, c].every((v) => v.y >= SURFACE_Y - 1e-5)) continue;
      for (const v of [a, b, c]) {
        if (Math.hypot(v.x, v.z) < layout.radiusAt(Math.atan2(v.z, v.x)) - 1e-3) {
          assert.ok(Math.abs(v.y - layout.heightAt(v.x, v.z)) < 1e-4, "meadow vertex sits on heightAt");
        }
      }
      area += Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
    }
    let expected = 0;
    for (let i = 0; i < 3600; i++) expected += layout.radiusAt(i / 3600 * Math.PI * 2) ** 2 / 2 * (Math.PI * 2 / 3600);
    assert.ok(Math.abs(area - expected) / expected < 0.01, `meadow ${area} vs outline ${expected}`);
  }
});

test("a thick floating body: grass lip overhangs, the rock tapers to a hanging tip", () => {
  for (const seed of seeds) {
    const layout = createIslandLayout(seed);
    const vertices = triangles(createTerrainGeometry(layout)).flat();
    const minY = Math.min(...vertices.map((v) => v.y));
    const depth = SURFACE_Y - minY;
    assert.ok(Math.abs(depth - TERRAIN_DEPTH) < 1e-4, `depth ${depth}`);
    assert.ok(depth / ISLAND_RADIUS > 0.9 && depth / ISLAND_RADIUS < 1.3, `depth ratio ${depth / ISLAND_RADIUS}`);

    const reach = (from, to) => Math.max(...vertices
      .filter((v) => v.y < SURFACE_Y - from && v.y >= SURFACE_Y - to)
      .map((v) => Math.hypot(v.x, v.z) / layout.radiusAt(Math.atan2(v.z, v.x))));
    assert.ok(reach(0.1, 1.9) > 1.02, "grass lip rolls past the meadow rim");
    // Floating pebbles sit outside the body; measure the body within the rim.
    const body = (from, to) => Math.max(...vertices
      .filter((v) => v.y < SURFACE_Y - from && v.y >= SURFACE_Y - to && Math.hypot(v.x, v.z) < layout.radiusAt(Math.atan2(v.z, v.x)) * 1.05)
      .map((v) => Math.hypot(v.x, v.z) / layout.radiusAt(Math.atan2(v.z, v.x))));
    assert.ok(body(2.7, 4.1) > 0.9, "soil walls keep the body thick");
    assert.ok(body(8.4, 10) < 0.75, "rock narrows below the soil");
    assert.ok(body(12.5, 14.5) < 0.4, "rock tapers toward the tip");
  }
});
