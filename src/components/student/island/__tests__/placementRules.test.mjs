import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: false, fsCache: false, alias: { "@": fileURLToPath(new URL("../../../../", import.meta.url)) } });
const { getPlacementRules } = await jiti.import("../placementRules.ts");
const { createIslandLayout } = await jiti.import("../placement.ts");
const P = await jiti.import("../puzzle.ts");
const { createGiftModel, GIFT_MODEL_HEIGHT } = await jiti.import("../islandModel.ts");

const rules = getPlacementRules();
const medium = { assetFormat: "procedural", geometrySpec: {} };
const small = { assetFormat: "procedural", geometrySpec: { sizeClass: "small" } };
const centre = { x: (rules.bounds.minX + rules.bounds.maxX) / 2, z: (rules.bounds.minZ + rules.bounds.maxZ) / 2 };

// 씬(IslandScene)과 같은 식으로 독립적으로 다시 계산한 값 — placementRules가 씬 규칙과 같은 반경을 쓰는지 확인한다.
test("점유 반경은 씬의 itemRadius × sizeScale과 같다", () => {
  const layout = createIslandLayout(17);
  const metrics = P.getPuzzleTerrainMetrics(layout, P.PUZZLE_STUDENT_PIECE_MAP[1], "personal", 17);
  const base = createGiftModel("star").userData.baseDiameter;
  const expected = (base * ((metrics.W / 2.75) * 0.07 / GIFT_MODEL_HEIGHT)) / 2;
  assert.ok(Math.abs(rules.radiusOf(medium) - expected) < 1e-12);
  assert.ok(rules.radiusOf(small) < rules.radiusOf(medium), "small 아이템은 반경이 더 작다");
});

test("조각 밖·비정상 좌표는 거부한다", () => {
  assert.equal(rules.canPlace(Number.NaN, 0, medium, []), false);
  assert.equal(rules.canPlace(Infinity, 0, medium, []), false);
  assert.equal(rules.canPlace(rules.bounds.maxX + 5, centre.z, medium, []), false);
  assert.equal(rules.canPlace(0, 999, medium, []), false);
});

test("조각 안 빈 자리는 통과하고, 다른 아이템과 반경이 겹치면 거부한다(이동 시 자기 자신은 제외)", () => {
  let spot = null;
  for (let x = rules.bounds.minX; x <= rules.bounds.maxX && !spot; x += 0.2) {
    for (let z = rules.bounds.minZ; z <= rules.bounds.maxZ; z += 0.2) if (rules.canPlace(x, z, medium, [])) { spot = { x, z }; break; }
  }
  assert.ok(spot, "조각 안에 놓을 수 있는 자리가 있어야 한다");
  const other = { id: "other", x: spot.x, z: spot.z, ...medium };
  assert.equal(rules.canPlace(spot.x, spot.z, medium, [other]), false, "같은 자리는 겹친다");
  assert.equal(rules.canPlace(spot.x, spot.z, medium, [other], "other"), true, "자기 자신(이동)은 겹침 판정에서 뺀다");
  const gap = rules.radiusOf(medium) * 2 + 0.05;
  const near = rules.canPlace(spot.x + gap, spot.z, medium, [other]);
  const overlapping = rules.canPlace(spot.x + rules.radiusOf(medium), spot.z, medium, [other]);
  assert.equal(overlapping, false, "반경 합보다 가까우면 거부");
  assert.equal(typeof near, "boolean");
});
