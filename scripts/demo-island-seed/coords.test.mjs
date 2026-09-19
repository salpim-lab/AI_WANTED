// 공용 데모 섬 좌표 JSON 검증 — 커밋된 coords.json이 생성 스크립트의 결정적 결과와 같고, 모든 배치가 씬 규칙을 통과하는지.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { generateCoords } from "../generate-demo-island-coords.mjs";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const jiti = createJiti(import.meta.url, { interopDefault: false, fsCache: false, alias: { "@": here("../../src") } });
const { getPlacementRules } = await jiti.import("../../src/components/student/island/placementRules.ts");
const committed = JSON.parse(readFileSync(here("./coords.json"), "utf8"));
const { candidates } = JSON.parse(readFileSync(here("./candidates.json"), "utf8"));

test("커밋된 coords.json은 생성 스크립트의 결정적 결과와 같다(재실행해도 안 바뀐다)", async () => {
  assert.deepEqual(await generateCoords(), committed);
});

test("공용 15종: 후보와 1:1, 중복 없음, 폴백(선물 상자)을 포함하지 않는다", () => {
  assert.equal(committed.placements.length, 15);
  assert.deepEqual(committed.placements.map((p) => p.dedupKey).sort(), candidates.map((c) => c.dedupKey).sort());
  assert.equal(new Set(committed.placements.map((p) => p.dedupKey)).size, 15);
  assert.ok(!committed.placements.some((p) => p.dedupKey.includes("fallback") || p.name === "선물 상자"));
});

test("모든 배치가 조각 안·지형·아이템 겹침 규칙을 통과한다(처음부터 차례로 놓아 확인)", () => {
  const rules = getPlacementRules();
  const placed = [];
  for (const placement of committed.placements) {
    const candidate = candidates.find((c) => c.dedupKey === placement.dedupKey);
    const asset = { assetFormat: "procedural", geometrySpec: candidate.sizeClass ? { sizeClass: candidate.sizeClass } : {} };
    assert.ok(rules.canPlace(placement.x, placement.z, asset, placed), `${placement.name} (${placement.x}, ${placement.z})`);
    assert.ok(Math.abs(rules.radiusOf(asset) - placement.radius) < 0.001, `${placement.name}의 radius가 규칙과 다르다`);
    placed.push({ id: placement.dedupKey, x: placement.x, z: placement.z, ...asset });
  }
});

test("서로 충분히 떨어져 있다(최소 간격이 두 반경의 합보다 크다)", () => {
  let min = Infinity;
  for (const [i, a] of committed.placements.entries()) for (const b of committed.placements.slice(i + 1)) {
    min = Math.min(min, Math.hypot(a.x - b.x, a.z - b.z) - (a.radius + b.radius));
  }
  assert.ok(min > 0.5, `최소 여유 ${min.toFixed(3)}`);
});
