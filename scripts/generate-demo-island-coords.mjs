// 공용 데모 섬 15종의 좌표를 결정적으로 자동 배치해 JSON 파일로만 만든다(DB에는 아무것도 하지 않는다).
// 실행: npm run demo-island:coords  →  scripts/demo-island-seed/coords.json
//
// 규칙은 씬과 같은 src/components/student/island/placementRules.ts를 쓴다(조각 안·테두리 여유·지형·아이템 겹침).
// 알고리즘: 조각 안 유효 격자점 중 "가운데(캐릭터·오늘의 아이템이 서는 자리) 주변 제외 + 바깥 테두리 제외" 고리 안에서
// 이미 고른 점들과 가장 먼 점을 차례로 고른다(maximin). 시드 고정이라 실행마다 같은 결과다.
// ⚠️ 이 좌표는 화면에서 확인(/item-lab/demo-island-preview)하기 전까지 DB에 적용하지 않는다.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createJiti } from "jiti";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const jiti = createJiti(import.meta.url, { interopDefault: false, fsCache: false, alias: { "@": here("../src") } });

const GRID_STEP = 0.1;
const INNER_KEEP_OUT = 0.18; // 조각 중심에서 이만큼(× 반지름 근사) 안쪽은 비운다 — 캐릭터와 오늘의 아이템 자리
const OUTER_LIMIT = 0.8;     // 바깥 테두리 쪽은 이 비율까지만 쓴다
const round3 = (value) => Math.round(value * 1000) / 1000;

export async function generateCoords() {
  const { getPlacementRules } = await jiti.import("../src/components/student/island/placementRules.ts");
  const rules = getPlacementRules();
  const { candidates } = JSON.parse(readFileSync(here("./demo-island-seed/candidates.json"), "utf8"));
  const assetOf = ({ sizeClass }) => ({ assetFormat: "procedural", geometrySpec: sizeClass ? { sizeClass } : {} });

  const { minX, maxX, minZ, maxZ } = rules.bounds;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const half = Math.min(maxX - minX, maxZ - minZ) / 2;
  const widest = candidates.map(assetOf).reduce((a, b) => (rules.radiusOf(a) >= rules.radiusOf(b) ? a : b));

  // 가장 큰 후보도 들어가는 격자점만 후보로 둔다(어느 아이템을 어디에 배정해도 유효하도록).
  const valid = [];
  for (let x = minX; x <= maxX; x += GRID_STEP) {
    for (let z = minZ; z <= maxZ; z += GRID_STEP) {
      const distance = Math.hypot(x - cx, z - cz);
      if (distance < half * INNER_KEEP_OUT || distance > half * OUTER_LIMIT) continue;
      if (rules.canPlace(x, z, widest, [])) valid.push({ x: round3(x), z: round3(z) });
    }
  }
  if (valid.length < candidates.length) throw new Error(`유효한 격자점이 부족하다: ${valid.length}개`);

  // maximin: 첫 점은 가운데에서 가장 가까운(고리 안쪽) 점, 이후는 이미 고른 점들과의 최소거리가 가장 큰 점.
  const picked = [];
  const keepOut = { x: cx, z: cz };
  let first = valid[0];
  for (const point of valid) if (Math.hypot(point.x - cx, point.z - cz) < Math.hypot(first.x - cx, first.z - cz)) first = point;
  picked.push(first);
  while (picked.length < candidates.length) {
    let best = null, bestScore = -1;
    for (const point of valid) {
      const score = Math.min(Math.hypot(point.x - keepOut.x, point.z - keepOut.z), ...picked.map((other) => Math.hypot(point.x - other.x, point.z - other.z)));
      if (score > bestScore) { best = point; bestScore = score; }
    }
    picked.push(best);
  }

  const placements = candidates.map((candidate, index) => ({
    dedupKey: candidate.dedupKey,
    name: candidate.name,
    x: picked[index].x,
    z: picked[index].z,
    radius: round3(rules.radiusOf(assetOf(candidate))),
  }));

  // 반올림한 좌표로 처음부터 다시 차례로 놓아 보며 모든 배치가 규칙을 통과하는지 확인한다.
  const placed = [];
  for (const placement of placements) {
    const candidate = candidates.find((entry) => entry.dedupKey === placement.dedupKey);
    if (!rules.canPlace(placement.x, placement.z, assetOf(candidate), placed)) throw new Error(`배치 검증 실패: ${placement.name} (${placement.x}, ${placement.z})`);
    placed.push({ id: placement.dedupKey, x: placement.x, z: placement.z, ...assetOf(candidate) });
  }

  return {
    note: "자동 배치 결과 — 화면 확인 전에는 DB에 적용하지 않는다. 생성: npm run demo-island:coords (결정적). 좌표는 섬 데이터 좌표(IslandGift.x/z)이고 radius는 island_placements.footprint_radius에 넣는다.",
    algorithm: { gridStep: GRID_STEP, innerKeepOut: INNER_KEEP_OUT, outerLimit: OUTER_LIMIT, method: "maximin" },
    bounds: { minX: round3(minX), maxX: round3(maxX), minZ: round3(minZ), maxZ: round3(maxZ) },
    validGridPoints: valid.length,
    placements,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await generateCoords();
  writeFileSync(here("./demo-island-seed/coords.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(`coords.json 생성: ${result.placements.length}개, 유효 격자점 ${result.validGridPoints}개`);
}
