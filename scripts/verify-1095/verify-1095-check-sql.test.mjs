// 1095 적용 직전·직후 검증 SQL(pre-apply-checks / post-apply-checks / post-apply-behavior-rolled-back)이 문법·판정 모두 맞는지
// **로컬 PGlite에서만** 리허설한다 — 공유 DB에는 접속하지 않는다. 실행: npm run test:1095-local
//   · 적용 전 스키마(1094 직후 스텁)에서 pre-apply-checks의 모든 ok가 true
//   · 1095 적용 후 스키마에서 post-apply-checks의 모든 ok가 true, 기존 행 fingerprint가 적용 전과 같다
//   · 행동 검증 스크립트가 롤백 트랜잭션 안에서 전 케이스 통과하고 잔재를 남기지 않는다
//   · 가드를 일부러 뺀 스키마에서는 행동 검증이 실패로 표시된다(검증 SQL이 공허하게 통과하지 않는다)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const BASE = read("./base-schema-1094.sql");
const MIGRATION = read("../../supabase/migrations/20260920063259_1095_session_summary_guard.sql");
const PRE = read("./pre-apply-checks.sql");
const POST = read("./post-apply-checks.sql");
const BEHAVIOR = read("./post-apply-behavior-rolled-back.sql");

const E = "40000000-0000-4000-8000-000000000001";
const U = { A: "aaaaaaaa-0000-4000-8000-000000000001", B: "bbbbbbbb-0000-4000-8000-000000000002" };
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function baseDb() {
  const db = new PGlite();
  await db.exec(BASE);
  await db.query("insert into auth.users (id, email, is_anonymous) values ($1,null,true),($2,null,true)", [U.A, U.B]);
  await db.query(`insert into public.checkin_sessions (id, enrollment_id, demo_owner_id, session_date, period) values
    ($1,$5,null,'2026-09-01','morning'),($2,$5,null,'2026-09-01','afternoon'),
    ($3,$5,$6,'2026-09-20','morning'),($4,$5,null,'2026-09-20','morning')`, [uuid(1), uuid(2), uuid(11), uuid(3), E, U.A]);
  await db.query(`insert into public.analysis_runs (analysis_type, source_type, source_id, provider, prompt_version, status, result) values
    ('session_summary','session',$1,'mock','mock-seed-2026-09','completed','{"summary":"시드 등교","scope":"morning"}'),
    ('session_summary','session',$2,'mock','mock-seed-2026-09','completed','{"summary":"시드 하교"}'),
    ('emotion_vocab','session',$2,'openai','2026-09-18.v1','completed','{"lemmas":[]}')`, [uuid(1), uuid(2)]);
  return db;
}

const lastRows = (results, marker) => results.find((r) => r.rows?.[0] && marker in r.rows[0])?.rows ?? [];

test("적용 직전 확인 SQL: 1094 직후 스키마에서 모든 항목이 ok", async () => {
  const db = await baseDb();
  const rows = lastRows(await db.exec(PRE), "expected");
  assert.equal(rows.length, 14);
  const bad = rows.filter((r) => r.ok !== true);
  assert.deepEqual(bad, [], `실패 항목: ${JSON.stringify(bad)}`);
  assert.equal(rows.find((r) => r.n === 14).actual, "2", "기록용: session_summary 2건");
});

test("적용 직전 확인 SQL: 중복 완료 요약이나 시드 아닌 요약이 있으면 해당 항목이 not ok로 잡는다(공허한 통과 방지)", async () => {
  const db = await baseDb();
  await db.query(`insert into public.analysis_runs (analysis_type, source_type, source_id, provider, prompt_version, status, result)
    values ('session_summary','session',$1,'mock','mock-seed-2026-09','completed','{"summary":"중복","scope":"morning"}'),
           ('session_summary','session',$2,'openai','daily-summary-v7','completed','{"summary":"앱이 만든 요약"}')`, [uuid(1), uuid(3)]);
  const rows = lastRows(await db.exec(PRE), "expected");
  const failed = rows.filter((r) => r.ok !== true).map((r) => r.n).sort((a, b) => a - b);
  assert.deepEqual(failed, [5, 6], "중복 그룹(5)과 시드 아닌 요약(6)이 잡혀야 한다");
});

test("적용 직후 확인 SQL: 1095 적용 후 모든 항목이 ok이고 기존 행 fingerprint가 적용 전과 같다", async () => {
  const db = await baseDb();
  const before = lastRows(await db.exec(PRE), "expected").find((r) => r.n === 13).actual;
  await db.exec(MIGRATION);
  const rows = lastRows(await db.exec(POST), "expected");
  assert.equal(rows.length, 13);
  const bad = rows.filter((r) => r.ok !== true);
  assert.deepEqual(bad, [], `실패 항목: ${JSON.stringify(bad)}`);
  assert.equal(rows.find((r) => r.n === 13).actual, before, "1095가 기존 행을 바꾸지 않았다");
});

test("적용 직후 확인 SQL: 1095를 적용하지 않은 스키마에서는 not ok로 잡는다", async () => {
  const db = await baseDb();
  const failed = lastRows(await db.exec(POST), "expected").filter((r) => r.ok !== true).map((r) => r.n);
  assert.ok(failed.includes(1) && failed.includes(2) && failed.includes(4), `적용 안 된 상태가 통과하면 안 된다: ${failed}`);
});

test("행동 검증 SQL: 롤백 트랜잭션 안에서 모든 케이스가 기대대로 동작하고 잔재를 남기지 않는다", async () => {
  const db = await baseDb();
  await db.exec(MIGRATION);
  const count = async () => (await db.query("select count(*)::int n from public.analysis_runs")).rows[0].n;
  const before = await count();
  const rows = lastRows(await db.exec(BEHAVIOR), "expected");
  assert.ok(rows.length >= 14, `케이스 수: ${rows.length}`);
  const bad = rows.filter((r) => r.ok !== true);
  assert.deepEqual(bad, [], `실패 케이스: ${JSON.stringify(bad)}`);
  assert.equal(await count(), before, "롤백으로 잔재가 없다");
  assert.equal((await db.query("select count(*)::int n from public.analysis_runs where prompt_version like 'pre-check-%'")).rows[0].n, 0);
});

test("행동 검증 SQL: 가드가 없는 스키마(1095 미적용)에서는 실패 케이스로 표시된다 — 공허하게 통과하지 않는다", async () => {
  const db = await baseDb(); // 1095 미적용
  const rows = lastRows(await db.exec(BEHAVIOR), "expected");
  const failed = rows.filter((r) => r.ok !== true).map((r) => r.name);
  assert.ok(failed.length >= 8, `가드가 없는데 통과하면 안 된다: ${failed.length}건 실패`);
  assert.ok(failed.includes("mock 시드 모양 신규 INSERT 거부(방문자 세션)"));
  assert.ok(failed.includes("같은 요약 재저장은 유니크 위반"));
});
