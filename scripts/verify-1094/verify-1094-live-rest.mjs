// 1094 적용 후 실제 Supabase(PostgREST)에서 익명 방문자 2명의 직접 REST 격리를 확인한다. 앱 서버는 필요 없다.
// 실행: node scripts/verify-1094/verify-1094-live-rest.mjs
// 필요: .env.local 의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Anonymous Sign-Ins 켜짐 + 캡차 꺼짐,
//       그리고 **앱 서버(DEMO_MODE=true, 기본 http://localhost:3000; 인자로 주소 지정)** — 방문자마다 /api/demo/init을 불러 실제 방문자처럼
//       담당 학급에 등록한다. 등록이 안 된 익명 계정은 기존 permissive 읽기 정책(반 교사/학생만)에 걸려 공용 행도 0건으로 보인다
//       (2026-09-20 시드 직후 첫 실행이 이 이유로 실패했다: 미등록 계정 → 15개가 0건).
// 부작용: 익명 계정 2개가 생긴다(demo-visitor-ab-test와 같음). 데이터 행은 만들지 않는다 — 쓰기 시도는 전부 거부되어야 한다.
// 공용 시드 INSERT 전에는 "방문자에게 보이는 것이 0건"이 정상이고, 시드 후에는 공용 15종이 보여야 한다(SEEDED=1).
// 토큰·키는 출력하지 않는다. 실패가 있으면 종료 코드 1.
import fs from "node:fs";
import { createRequire } from "node:module";

const ROOT = process.cwd();
const { createServerClient } = createRequire(`${ROOT}/package.json`)("@supabase/ssr");
const env = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL, PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const BASE = process.argv[2] || "http://localhost:3000";
const SEEDED = process.env.SEEDED === "1"; // 공용 시드 INSERT 이후에 실행할 때 1
const SEED_COUNT = 15;
const FAKE = "00000000-0000-4000-8000-000000000001"; // 없는 id — 필터 없는 UPDATE/DELETE는 PostgREST가 400으로 막으므로 필터를 붙여 권한(403)을 확인한다
// 기존(레거시) 42건이 참조하는 자산 — 방문자가 직접 조회하면 안 된다(공용 시드 후에는 공용 15종과 이름이 겹치는 것은 건너뛴다)
const KNOWN_ASSET_NAMES = ["선물 상자", "돌멩이", "귀마개", "피자"];

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

async function visitor(label) {
  const jar = new Map();
  const supabase = createServerClient(SUPA, PUB, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)) } });
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(`${label} 익명 로그인 실패: ${error.message}`);
  const cookie = [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
  // 실제 방문자와 같은 초기화(프로필·담당 학급 등록). 앱 서버가 없으면 여기서 멈춘다.
  const init = await fetch(`${BASE}/api/demo/init`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
  if (!init || init.status !== 200) throw new Error(`${label} /api/demo/init 실패(${init ? init.status : "서버 없음"}) — DEMO_MODE=true 앱 서버가 ${BASE} 에서 떠 있어야 한다`);
  return { label, uid: data.user.id, token: data.session.access_token };
}
const rest = (v, path, init = {}) => fetch(`${SUPA}/rest/v1/${path}`, { ...init, headers: { apikey: PUB, Authorization: `Bearer ${v.token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
const rows = async (v, path) => { const r = await rest(v, path); const body = await r.json().catch(() => null); return { status: r.status, rows: Array.isArray(body) ? body : null }; };

const A = await visitor("A"), B = await visitor("B");
check("익명 방문자 2명(서로 다른 uid)", A.uid !== B.uid);

for (const v of [A, B]) {
  const items = await rows(v, "student_items?select=id,demo_owner_id,is_public_demo,source_session_id");
  check(`${v.label}: student_items — 레거시 42건이 안 보인다${SEEDED ? `, 공용 ${SEED_COUNT}개만` : " (공용 시드 전이라 0건)"}`,
    items.rows !== null && items.rows.length === (SEEDED ? SEED_COUNT : 0) && items.rows.every((r) => r.is_public_demo && r.source_session_id === null && r.demo_owner_id === null), `n=${items.rows?.length}`);
  const assets = await rows(v, "asset_catalog?select=id,name");
  check(`${v.label}: asset_catalog — 공용/내 아이템이 참조하는 자산만${SEEDED ? `(공용 ${SEED_COUNT}종)` : " (0건 — 1094 전에는 전체 조회됐다)"}`, assets.rows !== null && assets.rows.length === (SEEDED ? SEED_COUNT : 0), `n=${assets.rows?.length}`);
  for (const name of KNOWN_ASSET_NAMES) {
    const byName = await rows(v, `asset_catalog?select=id&name=eq.${encodeURIComponent(name)}`);
    // 시드 후에는 공용 15종에 든 이름(돌멩이·귀마개·피자)은 방문자에게 보이는 것이 정상이다 — 공용에 없는 이름(선물 상자)만 0건이어야 한다.
    if (SEEDED && (assets.rows || []).some((row) => row.name === name)) continue;
    check(`${v.label}: asset_catalog를 name=${name}으로 직접 조회 → 0건`, byName.rows !== null && byName.rows.length === 0);
  }
  const islands = await rows(v, "islands?select=id"), placements = await rows(v, "island_placements?select=student_item_id");
  check(`${v.label}: islands/island_placements — ${SEEDED ? `공용 섬 1개·배치 ${SEED_COUNT}개` : "0건"}`, islands.rows !== null && islands.rows.length === (SEEDED ? 1 : 0) && placements.rows !== null && placements.rows.length === (SEEDED ? SEED_COUNT : 0), `islands=${islands.rows?.length} placements=${placements.rows?.length}`);
  const jobs = await rows(v, "item_generation_jobs?select=id");
  check(`${v.label}: item_generation_jobs 0건(부모 job 비공개)`, jobs.rows !== null && jobs.rows.length === 0);
  const sessions = await rows(v, "checkin_sessions?select=id,demo_owner_id&demo_owner_id=not.is.null");
  check(`${v.label}: checkin_sessions — 다른 방문자 것이 안 보인다`, sessions.rows !== null && sessions.rows.every((r) => r.demo_owner_id === v.uid));
  // 쓰기 시도는 전부 거부되어야 한다(권한 단계)
  const denied = [401, 403];
  check(`${v.label}: student_items 수정/삭제/삽입 시도 → 차단`, denied.includes((await rest(v, `student_items?id=eq.${FAKE}`, { method: "PATCH", body: JSON.stringify({ slot: 9 }) })).status)
    && denied.includes((await rest(v, `student_items?id=eq.${FAKE}`, { method: "DELETE" })).status)
    && denied.includes((await rest(v, "student_items", { method: "POST", body: JSON.stringify({ slot: 1, is_public_demo: true }) })).status));
  check(`${v.label}: islands/island_placements 수정/삭제/삽입 시도 → 차단`, denied.includes((await rest(v, "islands", { method: "POST", body: JSON.stringify({ name: "x", theme: "y", is_public_demo: true }) })).status)
    && denied.includes((await rest(v, `islands?id=eq.${FAKE}`, { method: "DELETE" })).status)
    && denied.includes((await rest(v, `island_placements?student_item_id=eq.${FAKE}`, { method: "PATCH", body: JSON.stringify({ position_x: 0 }) })).status)
    && denied.includes((await rest(v, `island_placements?student_item_id=eq.${FAKE}`, { method: "DELETE" })).status));
  const rpc = async (fn, body) => (await rest(v, `rpc/${fn}`, { method: "POST", body: JSON.stringify(body) })).status;
  const fake = FAKE;
  check(`${v.label}: RPC place_demo_item / remove_demo_placement 직접 호출 → 차단`, [401, 403, 404].includes(await rpc("place_demo_item", { p_owner_id: v.uid, p_item_id: fake, p_x: 0, p_z: 0, p_radius: 0.1 }))
    && [401, 403, 404].includes(await rpc("remove_demo_placement", { p_owner_id: v.uid, p_item_id: fake })));
}

// ---- 시드 후 전용: 공용 15종이 A·B에게 동일하고, 공용 행 수정·삭제가 실제 REST에서 차단되며 데이터가 그대로인지 ----
if (SEEDED) {
  const snapshot = async (v) => ({
    items: (await rows(v, "student_items?select=id,asset_id,slot&order=slot")).rows,
    placements: (await rows(v, "island_placements?select=student_item_id,position_x,position_z,footprint_radius,island_id&order=student_item_id")).rows,
    assets: (await rows(v, "asset_catalog?select=id,name&order=id")).rows,
    islands: (await rows(v, "islands?select=id,is_public_demo,demo_owner_id")).rows,
  });
  const sa = await snapshot(A), sb = await snapshot(B);
  check("A·B가 동일한 공용 아이템 15개(id·asset_id·slot)를 조회", sa.items?.length === SEED_COUNT && JSON.stringify(sa.items) === JSON.stringify(sb.items));
  check("A·B가 동일한 공용 배치 15개(id·좌표·반경)를 조회", sa.placements?.length === SEED_COUNT && JSON.stringify(sa.placements) === JSON.stringify(sb.placements));
  check("A·B가 동일한 자산 15종(id·name)을 조회하고 공용 아이템의 asset_id와 일치", sa.assets?.length === SEED_COUNT && JSON.stringify(sa.assets) === JSON.stringify(sb.assets)
    && new Set(sa.items.map((r) => r.asset_id)).size === SEED_COUNT && sa.items.every((r) => sa.assets.some((a) => a.id === r.asset_id)));
  check("공용 섬 1개(is_public_demo, 소유자 없음)를 조회", sa.islands?.length === 1 && sa.islands[0].is_public_demo === true && sa.islands[0].demo_owner_id === null && JSON.stringify(sa.islands) === JSON.stringify(sb.islands));
  const blocked = [401, 403];
  if (!sa.items?.length || !sa.islands?.length) { check("공용 행이 조회되지 않아 수정/삭제 차단 검사를 진행할 수 없다", false, "방문자가 담당 학급에 등록됐는지(/api/demo/init) 확인"); }
  else {
  const itemId = sa.items[0].id, islandId = sa.islands[0].id;
  for (const v of [A, B]) {
    check(v.label + ": 실제 공용 아이템 수정/삭제 → 차단", blocked.includes((await rest(v, "student_items?id=eq." + itemId, { method: "PATCH", body: JSON.stringify({ slot: 99 }) })).status)
      && blocked.includes((await rest(v, "student_items?id=eq." + itemId, { method: "DELETE" })).status));
    check(v.label + ": 실제 공용 배치 수정(좌표 이동)/삭제 → 차단", blocked.includes((await rest(v, "island_placements?student_item_id=eq." + itemId, { method: "PATCH", body: JSON.stringify({ position_x: 0, position_z: 0 }) })).status)
      && blocked.includes((await rest(v, "island_placements?student_item_id=eq." + itemId, { method: "DELETE" })).status));
    check(v.label + ": 실제 공용 섬 수정/삭제 → 차단", blocked.includes((await rest(v, "islands?id=eq." + islandId, { method: "PATCH", body: JSON.stringify({ name: "바꿈" }) })).status)
      && blocked.includes((await rest(v, "islands?id=eq." + islandId, { method: "DELETE" })).status));
  }
  const after = await snapshot(A);
  check("차단 시도 뒤에도 공용 아이템·배치·섬·자산이 그대로다", JSON.stringify(after) === JSON.stringify(sa));
  }
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}${SEEDED ? " (시드 후 모드)" : " (시드 전 모드)"}`);
process.exit(fail ? 1 : 0);
