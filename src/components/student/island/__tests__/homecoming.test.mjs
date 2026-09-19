import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { Vector3 } from "three";
const jiti = createJiti(import.meta.url, { interopDefault: false, fsCache: false });
const { createIslandLayout } = await jiti.import("../placement.ts");
const { getPieceLandscape } = await jiti.import("../pieceLandscape.ts");
const { findHomePath } = await jiti.import("../homecoming.ts");
const { createLandscapeProps } = await jiti.import("../landscapeProps.ts");
const { PUZZLE_STUDENT_PIECE_MAP, getPuzzleTerrainMetrics } = await jiti.import("../puzzle.ts");
const { CHARACTER_MODEL_HEIGHT } = await jiti.import("../character.ts");
const layout = createIslandLayout(17), index = PUZZLE_STUDENT_PIECE_MAP[1];
const landscape = getPieceLandscape(layout, index);
const radius = getPuzzleTerrainMetrics(layout, index, "personal", 17).W / 2.75 * 0.1 / CHARACTER_MODEL_HEIGHT * 0.45;
const house = landscape.props.find((p) => p.kind === "house");
// The destination is the doorstep, including the door's offset on the facade.
const width = house.variant === 0 ? 2.3 : 1.85;
const depth = house.variant === 0 ? 2 : 1.6;
const doorX = (width - 0.2) * 0.18 * house.scale[0];
const doorZ = ((depth - 0.2) / 2 + 0.44) * house.scale[2];
const goal = { x: house.x + Math.cos(house.rotation) * doorX + Math.sin(house.rotation) * doorZ, z: house.z - Math.sin(house.rotation) * doorX + Math.cos(house.rotation) * doorZ };

test("home routes use stairs for terrace changes while crossing decorations", () => {
  let count = 0;
  for (let x = -10; x < 10; x += 2) for (let z = 5; z < 28; z += 2) {
    if (!landscape.canPlace(x, z, 0.5)) continue;
    const route = findHomePath(landscape, { x, z }, goal, radius);
    assert.ok(route, `no route from ${x}, ${z}`);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i];
      const samples = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.05);
      for (let t = 0; t <= samples; t++) assert.ok(landscape.canWalkHome(a.x + (b.x - a.x) * t / samples, a.z + (b.z - a.z) * t / samples, radius), JSON.stringify({from:{x,z},a,b,t,samples}));
    }
    count++;
  }
  assert.ok(count >= 20);
});

test("clear homecoming ground is one straight segment even when manual walking is blocked", () => {
  const ground = { ...landscape, canWalk: () => false, canWalkHome: () => true };
  const from = { x: -3, z: 8 }, to = { x: 4, z: 15 };
  assert.deepEqual(findHomePath(ground, from, to, radius), [from, to]);
});

test("main house has a separate hinge and a world-space doorway after asset replacement", () => {
  for (const library of [undefined, new Map()]) {
    const props = createLandscapeProps(landscape.props, library, true);
    const home = props.getObjectByName("homecoming-house");
    const door = props.getObjectByName("homecoming-door");
    assert.ok(home && door);
    assert.equal(door.parent, home);
    const knob = door.children[1];
    home.updateWorldMatrix(true, true);
    const before = knob.getWorldPosition(new Vector3());
    door.rotation.y = -Math.PI / 2;
    assert.ok(knob.getWorldPosition(new Vector3()).distanceTo(before) > 0.3);
    assert.ok(home.userData.doorway instanceof Vector3);
  }
});
