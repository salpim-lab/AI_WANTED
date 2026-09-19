import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { interopDefault: false, fsCache: false });
const { createIslandLayout } = await jiti.import("../placement.ts");
const { getPieceLandscape } = await jiti.import("../pieceLandscape.ts");
const { findWalkingPath } = await jiti.import("../walkingPath.ts");
const { getPuzzleTerrainMetrics, PUZZLE_STUDENT_PIECE_MAP } = await jiti.import("../puzzle.ts");
const { CHARACTER_MODEL_HEIGHT } = await jiti.import("../character.ts");
const layout = createIslandLayout(17), index = PUZZLE_STUDENT_PIECE_MAP[1];
const landscape = getPieceLandscape(layout, index);
const radius = getPuzzleTerrainMetrics(layout, index, "personal", 17).W / 2.75 * 0.1 / CHARACTER_MODEL_HEIGHT * 0.45;

const stairPoint = (stair, along, across = 0) => ({
  x: stair.x + Math.sin(stair.rotation) * along + Math.cos(stair.rotation) * across,
  z: stair.z + Math.cos(stair.rotation) * along - Math.sin(stair.rotation) * across,
});
const samples = (from, to) => {
  const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.03));
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: from.x + (to.x - from.x) * i / count,
    z: from.z + (to.z - from.z) * i / count,
  }));
};

test("a click on another level detours through stairs rather than crossing the bank", () => {
  for (const stair of landscape.props.filter((prop) => prop.kind === "stairs")) {
    const from = stairPoint(stair, -stair.scale[2] / 2 - 0.8, 0.8);
    const to = stairPoint(stair, stair.scale[2] / 2 + 0.8, 0.8);
    assert.ok(landscape.canWalk(from.x, from.z, radius));
    assert.ok(landscape.canWalk(to.x, to.z, radius));
    assert.ok(samples(from, to).some((p) => !landscape.canWalk(p.x, p.z, radius)), "straight movement would hit the bank");
    for (const [start, end] of [[from, to], [to, from]]) {
      const route = findWalkingPath(landscape, start, end, radius);
      assert.ok(route && route.length > 2, "stair detour exists in both directions");
      assert.deepEqual(route[0], start);
      assert.deepEqual(route.at(-1), end);
      for (let i = 1; i < route.length; i++) {
        for (const p of samples(route[i - 1], route[i])) {
          assert.ok(landscape.canWalk(p.x, p.z, radius), "every point on the animated route is walkable");
        }
      }
    }
  }
});

test("same-level clear ground keeps a direct route", () => {
  const stair = landscape.props.find((prop) => prop.kind === "stairs");
  const from = stairPoint(stair, -stair.scale[2] / 2 - 1);
  const to = stairPoint(stair, -stair.scale[2] / 2 - 0.8);
  assert.deepEqual(findWalkingPath(landscape, from, to, radius), [from, to]);
});

test("unreachable or occupied click targets cannot start walking", () => {
  const stair = landscape.props.find((prop) => prop.kind === "stairs");
  const from = stairPoint(stair, -stair.scale[2] / 2 - 1);
  assert.equal(findWalkingPath(landscape, from, { x: 10000, z: 10000 }, radius), null);
  assert.equal(findWalkingPath(landscape, from, from, radius, () => false), null);
});

test("cross-level routes traverse each stair from one full landing to the other", () => {
  for (const stair of landscape.props.filter((prop) => prop.kind === "stairs")) {
    const upper = stairPoint(stair, -stair.scale[2] / 2 - 0.8, 0.8);
    const lower = stairPoint(stair, stair.scale[2] / 2 + 0.8, 0.8);
    for (const [from, to] of [[upper, lower], [lower, upper]]) {
      const route = findWalkingPath(landscape, from, to, radius);
      assert.ok(route);
      const upperLanding = stairPoint(stair, -stair.scale[2] / 2 - 0.5);
      const lowerLanding = stairPoint(stair, stair.scale[2] / 2 + 0.5);
      const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < 0.05;
      const up = route.findIndex((p) => near(p, upperLanding));
      const down = route.findIndex((p) => near(p, lowerLanding));
      assert.ok(up >= 0 && down >= 0, "both full stair landings must remain in the route");
      assert.equal(up < down, from === upper, "stair flight is traversed in the correct order");
    }
  }
});

test("a journey across two levels keeps the complete flights of both stairs", () => {
  const stairs = landscape.props.filter((prop) => prop.kind === "stairs")
    .sort((a, b) => b.y - a.y);
  assert.equal(stairs.length, 2);
  const from = stairPoint(stairs[0], -stairs[0].scale[2] / 2 - 0.8, 0.8);
  const to = stairPoint(stairs[1], stairs[1].scale[2] / 2 + 0.8, 0.8);
  const route = findWalkingPath(landscape, from, to, radius);
  assert.ok(route);
  for (const stair of stairs) {
    const upper = stairPoint(stair, -stair.scale[2] / 2 - 0.5);
    const lower = stairPoint(stair, stair.scale[2] / 2 + 0.5);
    const index = route.findIndex((p) => Math.hypot(p.x - upper.x, p.z - upper.z) < 0.05);
    assert.ok(index >= 0);
    assert.ok(Math.hypot(route[index + 1].x - lower.x, route[index + 1].z - lower.z) < 0.05,
      "each full flight stays an uninterrupted segment between its two landings");
  }
});

test("automatic homecoming also retains a whole stair flight while ignoring decorations", () => {
  const stair = landscape.props.find((prop) => prop.kind === "stairs");
  const from = stairPoint(stair, stair.scale[2] / 2 + 0.8, 0.8);
  const to = stairPoint(stair, -stair.scale[2] / 2 - 0.8, 0.8);
  const route = findWalkingPath({ ...landscape, canWalk: landscape.canWalkHome }, from, to, radius);
  assert.ok(route);
  const lower = stairPoint(stair, stair.scale[2] / 2 + 0.5);
  const upper = stairPoint(stair, -stair.scale[2] / 2 - 0.5);
  const entry = route.findIndex((p) => Math.hypot(p.x - lower.x, p.z - lower.z) < 0.05);
  assert.ok(entry >= 0);
  assert.ok(Math.hypot(route[entry + 1].x - upper.x, route[entry + 1].z - upper.z) < 0.05);
});
