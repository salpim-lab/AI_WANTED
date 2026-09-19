import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { interopDefault: false, fsCache: false });
const { createIslandLayout } = await jiti.import("../placement.ts");
const { getPieceLandscape } = await jiti.import("../pieceLandscape.ts");
const { getPuzzleDisplayRotation, createIslandCoordinates, getPuzzleTerrainMetrics, PUZZLE_STUDENT_PIECE_MAP } = await jiti.import("../puzzle.ts");
const landscape = getPieceLandscape(createIslandLayout(17), PUZZLE_STUDENT_PIECE_MAP[1]);
const { CHARACTER_MODEL_HEIGHT } = await jiti.import("../character.ts");
const radius = getPuzzleTerrainMetrics(createIslandLayout(17), PUZZLE_STUDENT_PIECE_MAP[1], "personal", 17).W
  / 2.75 * 0.1 / CHARACTER_MODEL_HEIGHT * 0.45;
const walkable = (x, z) => landscape.canWalk(x, z, radius);

test("held movement continues across a dirt path reserved against item placement", () => {
  const path = landscape.blockers.find((candidate) => candidate.id.startsWith("path")
    && landscape.blockers.every((other) => other.id.startsWith("path")
      || Math.hypot(candidate.x - other.x, candidate.z - other.z) > other.r + radius + 0.25)
    && (!landscape.water || landscape.water.sdf(candidate.x, candidate.z) > 1));
  assert.ok(path, "a clear section of dirt path exists on Minjun's island");
  assert.equal(landscape.canPlace(path.x, path.z, radius), false, "items still cannot occupy paths");
  for (let frame = 0; frame < 120; frame++) {
    const x = path.x - 0.15 + frame / 119 * 0.3;
    assert.ok(walkable(x, path.z), `held input stopped at frame ${frame} on the dirt path`);
  }
});

test("walking still stops outside the island and at solid props", () => {
  assert.equal(walkable(10000, 10000), false);
  const house = landscape.blockers.find((blocker) => blocker.id.startsWith("house"));
  assert.ok(house);
  assert.equal(walkable(house.x, house.z), false);
});

test("stairs connect both terrace levels for held movement in either direction", () => {
  const stairs = landscape.props.filter((prop) => prop.kind === "stairs");
  assert.ok(stairs.length > 0);
  for (const stair of stairs) {
    for (const side of [-1, 1]) {
      const landingZ = side * (stair.scale[2] / 2 + 0.3);
      assert.ok(walkable(stair.x + Math.sin(stair.rotation) * landingZ,
        stair.z + Math.cos(stair.rotation) * landingZ), "both stair landings connect to terrain");
    }
    const beside = stair.scale[0] * 0.45 + radius + 0.1;
    const bankZ = -stair.scale[2] / 2 + 0.15;
    assert.equal(walkable(stair.x + Math.cos(stair.rotation) * beside + Math.sin(stair.rotation) * bankZ,
      stair.z - Math.sin(stair.rotation) * beside + Math.cos(stair.rotation) * bankZ), false,
      "terrace bank beside the upper steps stays blocked");
    let previousHeight = Infinity;
    for (let frame = 0; frame <= 120; frame++) {
      const localZ = -stair.scale[2] / 2 + stair.scale[2] * frame / 120;
      const x = stair.x + Math.sin(stair.rotation) * localZ;
      const z = stair.z + Math.cos(stair.rotation) * localZ;
      assert.ok(walkable(x, z), `stairs stopped at frame ${frame}`);
      assert.equal(landscape.canPlace(x, z, radius), false, "stairs remain reserved against gifts");
      const height = landscape.walkHeightAt(x, z);
      assert.ok(height <= previousHeight + 1e-6, "height descends along the steps");
      previousHeight = height;
    }
    assert.ok(previousHeight < stair.y + stair.scale[1] / 2, "character reaches the lower steps");
  }
});


test("actual-size character can approach, descend and leave stairs without an invisible collision gap", () => {
  for (const stair of landscape.props.filter((prop) => prop.kind === "stairs")) {
    const halfRun = stair.scale[2] / 2;
    for (let frame = 0; frame <= 240; frame++) {
      const localZ = -halfRun - 1 + (stair.scale[2] + 2) * frame / 240;
      const x = stair.x + Math.sin(stair.rotation) * localZ;
      const z = stair.z + Math.cos(stair.rotation) * localZ;
      assert.ok(walkable(x, z), `blocked approaching or leaving stairs at ${localZ.toFixed(2)}`);
    }
  }
});


test("holding screen down follows the angled stair flight to the lower landing", () => {
  const rotation = getPuzzleDisplayRotation(createIslandLayout(17), PUZZLE_STUDENT_PIECE_MAP[1], 17);
  const coordinates = createIslandCoordinates(rotation);
  const down = coordinates.fromDisplayedWorld(new Vector3(0, 0, 1));
  for (const stair of landscape.props.filter((prop) => prop.kind === "stairs")) {
    const axis = { x: Math.sin(stair.rotation), z: Math.cos(stair.rotation) };
    const position = { x: stair.x - axis.x * (stair.scale[2] / 2 + 0.5),
      z: stair.z - axis.z * (stair.scale[2] / 2 + 0.5) };
    for (let frame = 0; frame < 600; frame++) {
      const direction = landscape.walkDirectionAt(position.x, position.z, down, radius);
      const next = { x: position.x + direction.x * 0.01, z: position.z + direction.z * 0.01 };
      assert.ok(walkable(next.x, next.z), `screen-down input got stuck at frame ${frame}`);
      Object.assign(position, next);
      const along = (position.x - stair.x) * axis.x + (position.z - stair.z) * axis.z;
      if (along > stair.scale[2] / 2 + 0.3) break;
      assert.ok(frame < 599, "down input reaches the lower landing");
    }
  }
});

test("stair traversal changes height continuously including both landings", () => {
  for (const stair of landscape.props.filter((prop) => prop.kind === "stairs")) {
    let previous;
    const distance = stair.scale[2] + 0.4;
    for (let frame = 0; frame <= 240; frame++) {
      const along = -stair.scale[2] / 2 - 0.2 + distance * frame / 240;
      const x = stair.x + Math.sin(stair.rotation) * along;
      const z = stair.z + Math.cos(stair.rotation) * along;
      const height = landscape.walkHeightAt(x, z);
      if (previous !== undefined) {
        const maxChange = stair.scale[1] / stair.scale[2] * distance / 240 + 1e-6;
        assert.ok(Math.abs(height - previous) <= maxChange, `height jumps at frame ${frame}`);
      }
      previous = height;
    }
  }
});
