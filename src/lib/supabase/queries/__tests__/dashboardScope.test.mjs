// dashboardScope.ts A/B 표적 회귀 테스트 — origin/main 병합 중 막은 두 구멍(상담 신청·갈등 기록)이 다시 열리지 않는지.
//   실행: npm run test:dashboard-scope   (공유 DB는 **읽기 전용 SELECT만** 한다. 어떤 행도 만들지 않는다. AI 아이템 생성 없음)
//
// 구성
//  1) 쿼리 모양 테스트(기록용 가짜 클라이언트) — 스코프가 켜져 있을 때 !inner 조인 + or 필터(공용 NULL + 현재 방문자)를 실제로 거는지
//  2) 갈등 기록 필터 순수 테스트 — 상대 방문자·시드 미확인 기록은 안 보이고, 공용(시드 확인)·본인 기록은 보이는 대조군 포함
//  3) 실제 DB 읽기 전용 테스트 — 기존 테스트 데이터(방문자 6명의 열린 상담 신청, 담임 시드 갈등 기록 4건)로 A/B를 대조
//     · 공용(시드 세션) 상담 신청 대조군은 공유 DB에 그런 신청이 0건이라 지금은 SKIP으로 표시된다(생기면 자동으로 실행).
//     · "상대 방문자의 갈등 기록이 안 보임"은 공유 DB에 방문자가 쓴 갈등 기록이 없어 실제 DB로는 못 보고 2)의 순수 테스트가 덮는다.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const jiti = createJiti(import.meta.url, {
  interopDefault: false,
  fsCache: false,
  alias: { "@": here("../../../../"), "server-only": here("./empty-stub.mjs"), "@/lib/supabase/server": here("./server-client-stub.mjs") },
});
const { loadOpenMeetingRequests, loadVisibleConflictRecords, filterVisibleConflictRecords } = await jiti.import("../dashboardScope.ts");
const { VERIFIED_EXTRA_RECORD_IDS } = await jiti.import("../../../demo/scope.ts");

const MINJUN_ENROLLMENT = "40000000-0000-4000-8000-000000000001";
const CLASS_ID = "20000000-0000-4000-8000-000000000001";
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const active = (viewerId) => ({ active: true, viewerId });
const INACTIVE = { active: false };

// ---------------------------------------------------------------------------------------------------------------------
// 1) 쿼리 모양 — 기록용 가짜 클라이언트
function recorder(result = { data: [], error: null }) {
  const calls = [];
  const builder = new Proxy({}, {
    get(_, method) {
      if (method === "then") return (resolve) => resolve(result);
      return (...args) => { calls.push([String(method), ...args]); return builder; };
    },
  });
  return { client: { from: (table) => { calls.push(["from", table]); return builder; } }, calls };
}
const call = (calls, name) => calls.find(([method]) => method === name);

test("상담 신청 쿼리: 스코프가 꺼져 있으면 기존 그대로(조인·or 없음)", async () => {
  const { client, calls } = recorder();
  await loadOpenMeetingRequests(client, [MINJUN_ENROLLMENT], INACTIVE);
  assert.ok(!call(calls, "select")[1].includes("checkin_sessions"), "스코프가 꺼졌는데 세션 조인을 걸면 안 된다");
  assert.equal(call(calls, "or"), undefined);
});

test("상담 신청 쿼리: 방문자 스코프는 부모 세션 !inner 조인 + (공용 NULL 또는 본인) 필터를 건다", async () => {
  const { client, calls } = recorder();
  const viewer = uuid(7);
  await loadOpenMeetingRequests(client, [MINJUN_ENROLLMENT], active(viewer));
  assert.match(call(calls, "select")[1], /checkin_sessions!inner/, "내부 조인이 아니면 세션 없는 신청이 방문자에게 섞인다");
  const [, filter, options] = call(calls, "or");
  assert.equal(filter, `demo_owner_id.is.null,demo_owner_id.eq.${viewer}`);
  assert.deepEqual(options, { referencedTable: "checkin_sessions" });
  assert.deepEqual(call(calls, "eq"), ["eq", "status", "requested"]);
});

test("상담 신청 쿼리: 방문자를 못 찾으면(viewerId null) 공용 세션만 — 절대 전부로 열리지 않는다(fail-closed)", async () => {
  const { client, calls } = recorder();
  await loadOpenMeetingRequests(client, [MINJUN_ENROLLMENT], active(null));
  assert.equal(call(calls, "or")[1], "demo_owner_id.is.null");
});

// ---------------------------------------------------------------------------------------------------------------------
// 2) 갈등 기록 필터 — 순수 테스트(대조군 포함)
const HOMEROOM = uuid(1), A = uuid(11), B = uuid(12);
const SEED_FIXED = "1a2b3c4d-0000-4000-8000-00000000abcd";       // 시드 스크립트의 고정 UUID 모양(…-0000-4000-8000-…)
const SEED_EXTRA = [...VERIFIED_EXTRA_RECORD_IDS][0];              // 팀이 명시적으로 승격한 기록
const UNVERIFIED = "f0e1d2c3-b4a5-4697-8879-a0b1c2d3e4f5";         // 담임이 썼지만 시드로 확인 안 된 랜덤 id
const rows = [
  { id: SEED_FIXED, created_by: HOMEROOM, title: "시드(고정 UUID)" },
  { id: SEED_EXTRA, created_by: HOMEROOM, title: "시드(승격)" },
  { id: UNVERIFIED, created_by: HOMEROOM, title: "담임 작성 미확인" },
  { id: uuid(101), created_by: A, title: "A가 쓴 갈등 기록" },
  { id: uuid(102), created_by: B, title: "B가 쓴 갈등 기록" },
];
const titles = (list) => list.map((row) => row.title).sort();

test("갈등 기록 A: 공용(시드 확인) + 내 것은 보이고(대조군), 상대 방문자·시드 미확인 기록은 안 보인다", () => {
  assert.deepEqual(titles(filterVisibleConflictRecords(rows, active(A), HOMEROOM)), ["A가 쓴 갈등 기록", "시드(고정 UUID)", "시드(승격)"].sort());
});

test("갈등 기록 B: 대칭 — B 것 + 공용만, A 것은 안 보인다", () => {
  assert.deepEqual(titles(filterVisibleConflictRecords(rows, active(B), HOMEROOM)), ["B가 쓴 갈등 기록", "시드(고정 UUID)", "시드(승격)"].sort());
});

test("갈등 기록: 방문자를 못 찾으면 공용(시드 확인)만, 스코프가 꺼져 있으면 기존처럼 전부", () => {
  assert.deepEqual(titles(filterVisibleConflictRecords(rows, active(null), HOMEROOM)), ["시드(고정 UUID)", "시드(승격)"].sort());
  assert.equal(filterVisibleConflictRecords(rows, INACTIVE, HOMEROOM).length, rows.length);
});

test("갈등 기록: 담임을 못 찾아도(homeroomId 빈 값) 남의 기록이 열리지 않는다(내 것만)", () => {
  assert.deepEqual(titles(filterVisibleConflictRecords(rows, active(A), "")), ["A가 쓴 갈등 기록"]);
});

// ---------------------------------------------------------------------------------------------------------------------
// 3) 실제 DB 읽기 전용
const envPath = here("../../../../../.env.local");
const env = fs.existsSync(envPath)
  ? Object.fromEntries(fs.readFileSync(envPath, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]))
  : {};
const haveDb = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SECRET_KEY);
let admin = null;
if (haveDb) {
  const { createClient } = createRequire(here("../../../../../package.json"))("@supabase/supabase-js");
  admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}
const dbTest = (name, fn) => test(name, { skip: haveDb ? false : ".env.local의 Supabase 키가 없어 실제 DB 테스트를 건너뜀" }, fn);

async function openRequestsWithOwner() {
  const { data, error } = await admin.from("meeting_requests")
    .select("id, source_session_id, checkin_sessions ( demo_owner_id )")
    .eq("enrollment_id", MINJUN_ENROLLMENT).eq("status", "requested");
  if (error) throw error;
  return data.map((row) => ({ id: row.id, hasSession: row.source_session_id !== null, owner: row.checkin_sessions?.demo_owner_id ?? null }));
}
const idsOf = (list) => list.map((row) => row.id).sort();

dbTest("실제 DB 상담 신청: 방문자 A·B가 각자 자기 신청만 보고 상대 신청은 안 보인다(대조군: 본인 신청은 보임)", async () => {
  const all = await openRequestsWithOwner();
  const owners = [...new Set(all.filter((r) => r.owner).map((r) => r.owner))];
  assert.ok(owners.length >= 2, `열린 신청이 있는 방문자가 2명 이상 필요(현재 ${owners.length}명)`);
  const [x, y] = owners;
  const publicIds = all.filter((r) => r.hasSession && r.owner === null).map((r) => r.id);
  const own = (owner) => all.filter((r) => r.owner === owner).map((r) => r.id);

  const forX = await loadOpenMeetingRequests(admin, [MINJUN_ENROLLMENT], active(x));
  const forY = await loadOpenMeetingRequests(admin, [MINJUN_ENROLLMENT], active(y));
  assert.ok(own(x).length >= 1 && own(y).length >= 1, "대조군: 각자 열린 신청이 1건 이상");
  assert.deepEqual(idsOf(forX), [...own(x), ...publicIds].sort(), "X는 본인 신청(+공용)만 본다");
  assert.deepEqual(idsOf(forY), [...own(y), ...publicIds].sort(), "Y는 본인 신청(+공용)만 본다");
  assert.ok(!forX.some((r) => own(y).includes(r.id)), "X에게 Y의 신청이 보이면 안 된다");
  assert.ok(!forY.some((r) => own(x).includes(r.id)), "Y에게 X의 신청이 보이면 안 된다");
  // 반환 행에 조인 필드(checkin_sessions)가 새지 않는다
  assert.ok(forX.every((r) => Object.keys(r).sort().join() === "enrollment_id,id,priority,requested_at"));
});

dbTest("실제 DB 상담 신청: 스코프 꺼짐은 전부, 방문자 미확인(null)은 공용 세션 것만, 세션 없는 신청은 방문자에게 안 보인다", async () => {
  const all = await openRequestsWithOwner();
  const everything = await loadOpenMeetingRequests(admin, [MINJUN_ENROLLMENT], INACTIVE);
  assert.equal(everything.length, all.length, "스코프가 꺼지면 기존처럼 열린 신청 전부");
  const anon = await loadOpenMeetingRequests(admin, [MINJUN_ENROLLMENT], active(null));
  assert.deepEqual(idsOf(anon), all.filter((r) => r.hasSession && r.owner === null).map((r) => r.id).sort(), "방문자를 못 찾으면 공용 세션 신청만");
  const visitor = [...new Set(all.filter((r) => r.owner).map((r) => r.owner))][0];
  const scoped = await loadOpenMeetingRequests(admin, [MINJUN_ENROLLMENT], active(visitor));
  const sessionless = all.filter((r) => !r.hasSession).map((r) => r.id);
  assert.ok(!scoped.some((r) => sessionless.includes(r.id)), "세션 없는 신청은 소유자를 못 가려 방문자에게 안 보인다");
});

dbTest("실제 DB 상담 신청 — 공용(시드 세션) 신청 대조군: 모든 방문자에게 보인다", async (t) => {
  const all = await openRequestsWithOwner();
  const publicIds = all.filter((r) => r.hasSession && r.owner === null).map((r) => r.id);
  if (publicIds.length === 0) return t.skip("공유 DB에 공용(시드 세션) 열린 상담 신청이 0건이라 대조군을 만들 수 없다(공용 신청이 생기면 자동 실행)");
  const owners = [...new Set(all.filter((r) => r.owner).map((r) => r.owner))];
  for (const owner of owners.slice(0, 2)) {
    const seen = idsOf(await loadOpenMeetingRequests(admin, [MINJUN_ENROLLMENT], active(owner)));
    for (const id of publicIds) assert.ok(seen.includes(id), "공용 신청은 모든 방문자에게 보여야 한다");
  }
});

dbTest("실제 DB 갈등 기록: 방문자에게 공용(담임 시드 확인) 기록이 보이고(대조군), 보이는 것은 규칙을 만족한다", async () => {
  const { data: all, error } = await admin.from("work_records").select("id, created_by").eq("class_id", CLASS_ID).eq("record_type", "conflict");
  if (error) throw error;
  const { data: homeroom } = await admin.from("class_teachers").select("teacher_id").eq("class_id", CLASS_ID).eq("role", "homeroom").limit(1).maybeSingle();
  const seedShape = /^[0-9a-f]{8}-0000-4000-8000-[0-9a-f]{12}$/i;
  const verified = (row) => row.created_by === homeroom.teacher_id && (seedShape.test(row.id) || VERIFIED_EXTRA_RECORD_IDS.has(row.id.toLowerCase()));
  const visitors = (await admin.from("class_teachers").select("teacher_id").eq("class_id", CLASS_ID).eq("role", "assistant").limit(2)).data.map((r) => r.teacher_id);
  assert.ok(all.length >= 1 && visitors.length >= 2);
  for (const viewer of visitors) {
    const seen = await loadVisibleConflictRecords(admin, CLASS_ID, active(viewer));
    assert.ok(seen.length >= 1 && seen.length === all.filter(verified).length, "대조군: 시드로 확인된 갈등 기록이 그대로 보인다");
    assert.ok(seen.every((row) => verified(row) || row.created_by === viewer), "확인 안 된 기록·상대 방문자 기록은 안 보인다");
  }
  assert.equal((await loadVisibleConflictRecords(admin, CLASS_ID, INACTIVE)).length, all.length, "스코프 꺼짐은 전부");
});
