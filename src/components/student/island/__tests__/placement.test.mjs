import assert from "node:assert/strict";
import test from "node:test";
import { OrthographicCamera, Vector3 } from "three";
import { canPlaceAmongGifts, canPlaceGift, createIslandLayout, ISLAND_RADIUS, SURFACE_Y } from "../placement.ts";
import { screenSunPosition } from "../sunlight.ts";

const seeds = [17, 565, 900, 1233];
const around = (count) => Array.from({ length: count }, (_, i) => i / count * Math.PI * 2);

test("the rim is an organic oval: not a circle, smooth, and different per seed", () => {
  const profiles = seeds.map((seed) => {
    const { radiusAt } = createIslandLayout(seed);
    const radii = around(720).map(radiusAt);
    const mean = radii.reduce((a, b) => a + b) / radii.length;
    assert.ok(Math.abs(mean / ISLAND_RADIUS - 1) < 0.08, `mean radius ${mean}`);
    const ratio = Math.min(...radii) / Math.max(...radii);
    assert.ok(ratio > 0.62 && ratio < 0.9, `oval ratio ${ratio}`);
    radii.forEach((r, i) => assert.ok(Math.abs(r - radii[(i + 1) % radii.length]) < 0.12, "no jagged corners"));
    return radii;
  });
  assert.notDeepEqual(profiles[0], profiles[1]);
});

test("the meadow has gentle hills that settle onto the rim", () => {
  for (const seed of seeds) {
    const { radiusAt, heightAt } = createIslandLayout(seed);
    let highest = -Infinity;
    for (const angle of around(90)) {
      const r = radiusAt(angle);
      assert.ok(Math.abs(heightAt(Math.cos(angle) * r * 0.999, Math.sin(angle) * r * 0.999) - SURFACE_Y) < 0.01, "rim is level");
      for (let s = 0; s < 0.99; s += 0.05) {
        const x = Math.cos(angle) * r * s, z = Math.sin(angle) * r * s;
        const y = heightAt(x, z);
        highest = Math.max(highest, y);
        assert.ok(y >= SURFACE_Y - 1e-9);
        const slope = Math.hypot(heightAt(x + 0.05, z) - y, heightAt(x, z + 0.05) - y) / 0.05;
        assert.ok(slope < 0.4, `slope ${slope}`);
      }
    }
    assert.ok(highest > SURFACE_Y + 1 && highest < SURFACE_Y + 2.5, `hill top ${highest}`);
  }
});

test("the semester-sized island accepts placements across its open areas", () => {
  const layout = createIslandLayout(17);
  for (const [x, z] of [[0, 0], [3.8, 3.8], [-4.5, 2.5], [4.2, -3.8]]) {
    assert.equal(canPlaceGift(x, z, layout), true, `available position ${x}, ${z}`);
  }
  for (const [x, z] of [[30, 30], [0, 16], [-17, 0]]) {
    assert.equal(canPlaceGift(x, z, layout), false, `blocked position ${x}, ${z}`);
  }
  for (const angle of around(36)) {
    const r = layout.radiusAt(angle) - 0.3;
    assert.equal(canPlaceGift(Math.cos(angle) * r, Math.sin(angle) * r, layout), false, "the grass lip is not a placement spot");
  }
});

test("the shore garden reserves tree, pine, bushes, flowers, rocks and grass footprints", () => {
  for (const seed of seeds) {
    const layout = createIslandLayout(seed);
    assert.ok(layout.decorations.length < 20);
    assert.deepEqual(new Set(layout.decorations.map((detail) => detail.kind)), new Set(["tree", "pine", "bush", "flower", "grass", "rock"]));
    for (const detail of layout.decorations) {
      assert.equal(canPlaceGift(detail.x, detail.z, layout), false, `${detail.kind} footprint is reserved`);
      const reach = Math.hypot(detail.x, detail.z) + detail.radius;
      assert.ok(reach < layout.radiusAt(Math.atan2(detail.z, detail.x)), `${detail.kind} stays on the meadow`);
    }
  }
});

test("scattered tufts, blooms and pebbles fill only spots where items can't go", () => {
  for (const seed of seeds) {
    const layout = createIslandLayout(seed);
    assert.ok(layout.scatter.length > 80, `scatter ${layout.scatter.length}`);
    assert.deepEqual(new Set(layout.scatter.map((piece) => piece.kind)), new Set(["tuft", "bloom", "pebble"]));
    for (const piece of layout.scatter) {
      assert.equal(canPlaceGift(piece.x, piece.z, layout), false, `${piece.kind} at ${piece.x}, ${piece.z} takes open meadow`);
      assert.ok(Math.hypot(piece.x, piece.z) < layout.radiusAt(Math.atan2(piece.z, piece.x)), `${piece.kind} stays on the meadow`);
    }
  }
  assert.deepEqual(createIslandLayout(17).scatter, createIslandLayout(17).scatter);
});

test("garden clearance occupies at most 20% of the meadow and leaves the central field free", () => {
  for (const seed of seeds) {
    const layout = createIslandLayout(seed);
    let total = 0, reserved = 0;
    for (let x = -17; x < 17; x += 0.1) for (let z = -17; z < 17; z += 0.1) {
      if (Math.hypot(x, z) > layout.radiusAt(Math.atan2(z, x))) continue;
      total++;
      if (layout.decorations.some((d) => Math.hypot(d.x - x, d.z - z) < d.radius + 0.55)) reserved++;
      if (Math.hypot(x, z) < 6.5) assert.ok(canPlaceGift(x, z, layout), `central ${x}, ${z}`);
    }
    assert.ok(reserved / total <= 0.2, `reserved ${reserved / total}`);
  }
});

test("only confirmed items constrain the otherwise empty placement area", () => {
  const layout = createIslandLayout(17);
  const gifts = [{ id: "a", kind: "star", name: "별", x: 1, z: 1 }];
  assert.equal(canPlaceAmongGifts(1.1, 1, layout, gifts), false);
  assert.equal(canPlaceAmongGifts(2, 1, layout, gifts), true);
  assert.equal(canPlaceAmongGifts(1.1, 1, layout, gifts, "a"), true);
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
