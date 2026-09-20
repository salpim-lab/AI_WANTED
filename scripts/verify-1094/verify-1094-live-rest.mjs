// 1094 적용 후 실제 Supabase(PostgREST)에서 익명 방문자 2명의 직접 REST 격리를 확인한다. 앱 서버는 필요 없다.
// 실행: node scripts/verify-1094/verify-1094-live-rest.mjs
// 필요: .env.local 의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Anonymous Sign-Ins 켜짐 + 캡차 꺼짐.
// 부작용: 익명 계정 2개가 생긴다(demo-visitor-ab-test와 같음). 데이터 행은 만들지 않는다 — 쓰기 시도는 전부 거부되어야 한다.
// 공용 시드 INSERT 전에는 "방문자에게 보이는 것이 0건"이 정상이고, 시드 후에는 공용 15종이 보여야 한다(SEEDED=1).
// 토큰·키는 출력하지 않는다. 실패가 있으면 종료 코드 1.
import fs from "node:fs";
import { createRequire } from "node:module";

const ROOT = process.cwd();
const { createServerClient } = createRequire(`${ROOT}/package.json`)("@supabase/ssr");
const env = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL, PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SEEDED = process.env.SEEDED === "1"; // 공용 시드 INSERT 이후에 실행할 때 1
const SEED_COUNT = 15;
const FAKE = "00000000-0000-4000-8000-000000000001"; // 없는 id — 필터 없는 UPDATE/DELETE는 PostgREST가 400으로 막으므로 필터를 붙여 권한(403)을 확인한다
// 기존(레거시) 42건이 참조하는 자산 — 방문자가 직접 조회하면 안 된다(공용 시드 후에는 공용 15종 중 일부와 겹칠 수 있어 제외)
const KNOWN_ASSET_NAMES = ["선물 상자", "돌멩이", "귀마개", "피자"];

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

async function visitor(label) {
  const jar = new Map();
  const supabase = createServerClient(SUPA, PUB, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)) } });
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(`${label} 익명 로그인 실패: ${error.message}`);
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
    if (SEEDED && name === "피자") continue; // 공용 15종에 포함되는 이름
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

console.log(`\n결과: PASS ${pass} / FAIL ${fail}${SEEDED ? " (시드 후 모드)" : " (시드 전 모드)"}`);
process.exit(fail ? 1 : 0);
