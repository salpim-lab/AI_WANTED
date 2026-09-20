// 1095 마이그레이션·롤백 로컬 검증 — 임베디드 Postgres(PGlite)에서 "1094 적용 직후" 스텁 스키마에 1095를 적용해 본다.
// 공유 DB에는 아무것도 하지 않는다. 실행: npm run test:1095-local
//
// 확인하는 것(DB 수준): 부분 유니크 인덱스(멱등), INSERT 가드(실제 세션·sourceSessionIds·대표 세션 포함·동일 소유자·공용/방문자 혼합 금지·
// 같은 학생/날짜·scope·summary·owner 직접 기입 금지 — **mock provider도 예외 없이 엄격 검증**), 이미 저장된 시드 행은 그대로 보존(가드는 새 INSERT에만),
// UPDATE 가드, 가드 함수 권한,
// 방문자 RLS(A 요약은 B에게 안 보임, 공용은 둘 다), 롤백이 1094 상태로 정확히 복원하는지.
// 스텁의 한계: 실제 Supabase(PostgREST, JWT 서명, 다른 소스 타입의 정책)는 재현하지 않는다. 진짜 동시 접속 경합은 단일 연결이라 못 만든다 —
//   유니크 인덱스가 두 번째 INSERT를 23505로 거부하는지로 대신 확인하고, 앱의 충돌 처리는 sessionSummaries 단위 테스트가 덮는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const BASE = read("./base-schema-1094.sql");
const MIGRATION = read("../../supabase/migrations/20260920090000_1095_session_summary_guard.sql");
const ROLLBACK = read("../../supabase/rollbacks/1095_session_summary_guard_rollback.sql");

const E = "40000000-0000-4000-8000-000000000001"; // 시드 enrollment(민준) — 방문자 전원이 공유한다
const E2 = "40000000-0000-4000-8000-000000000002";
const U = { A: "aaaaaaaa-0000-4000-8000-000000000001", B: "bbbbbbbb-0000-4000-8000-000000000002" };
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const S = {
  pubAm: uuid(1), pubPm: uuid(2), // 공용 시드, 같은 날(9/1)
  aAm: uuid(11), aPm: uuid(12), // 방문자 A, 9/20
  bAm: uuid(13), // 방문자 B, 9/20
  pubToday: uuid(3), // 공용 세션이지만 A와 같은 날(9/20) — 혼합 시도용
  otherEnr: uuid(21), // 다른 학생, 9/20 공용
  aOtherDay: uuid(14), // A, 다른 날(9/19)
};

async function baseDb() {
  const db = new PGlite();
  await db.exec(BASE);
  await db.query("insert into auth.users (id, email, is_anonymous) values ($1,null,true),($2,null,true)", [U.A, U.B]);
  await db.query(`insert into public.checkin_sessions (id, enrollment_id, demo_owner_id, session_date, period) values
    ($1,$9,null,'2026-09-01','morning'),($2,$9,null,'2026-09-01','afternoon'),
    ($3,$9,$10,'2026-09-20','morning'),($4,$9,$10,'2026-09-20','afternoon'),($5,$9,$11,'2026-09-20','morning'),
    ($6,$9,null,'2026-09-20','morning'),($7,$12,null,'2026-09-20','morning'),($8,$9,$10,'2026-09-19','morning')`,
    [S.pubAm, S.pubPm, S.aAm, S.aPm, S.bAm, S.pubToday, S.otherEnr, S.aOtherDay, E, U.A, U.B, E2]);
  // 1095 적용 "전"의 시드 요약 — 공유 DB 1,065건과 같은 모양: mock provider, sourceSessionIds 없음, scope 있거나 없음, 전부 공용 세션.
  await db.query(`insert into public.analysis_runs (analysis_type, source_type, source_id, provider, prompt_version, status, result) values
    ('session_summary','session',$1,'mock','mock-seed-2026-09','completed','{"summary":"시드 등교","scope":"morning","periods":["morning"]}'),
    ('session_summary','session',$2,'mock','mock-seed-2026-09','completed','{"summary":"시드 하교(범위 있음)","scope":"full","periods":["morning","afternoon"]}'),
    ('session_summary','session',$2,'mock','mock-seed-2026-09','completed','{"summary":"시드 하교(옛 형식, 범위 없음)"}')`, [S.pubAm, S.pubPm]);
  return db;
}

async function migratedDb() {
  const db = await baseDb();
  await db.exec(MIGRATION);
  return db;
}

async function as(db, who, fn) {
  await db.exec(`set role ${who.role}`);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(who.sub ? { sub: who.sub, is_anonymous: true } : {})]);
  try { return await fn(); } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}
const visitor = (sub) => ({ role: "authenticated", sub });

/** 앱이 만드는 행(provider=openai)의 result를 만든다. */
const appResult = (sourceIds, over = {}) => ({ summary: "요약", stateEstimate: "상태", scope: "morning", periods: ["morning"], sourceSessionIds: sourceIds, ...over });
async function insertRun(db, { source, result, provider = "openai", pv = "daily-summary-v7", status = "completed", type = "session_summary", sourceType = "session", owner = null }) {
  return db.query(
    "insert into public.analysis_runs (analysis_type, source_type, source_id, provider, prompt_version, status, result, demo_owner_id) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) returning id",
    [type, sourceType, source, provider, pv, status, JSON.stringify(result), owner],
  );
}
const rejected = (promise, pattern) => assert.rejects(promise, pattern ? { message: pattern } : undefined);
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? error.message; } };

let db;
before(async () => { db = await migratedDb(); });

// ============================================================================
test("1095 적용 + 자기 검증 통과, 기존 시드 행 3건은 손대지 않았다", async () => {
  const { rows } = await db.query("select count(*)::int n, count(*) filter (where provider='mock' and demo_owner_id is null and not (result ? 'sourceSessionIds'))::int seed from public.analysis_runs");
  assert.deepEqual(rows[0], { n: 3, seed: 3 });
  const idx = await db.query("select indexdef from pg_indexes where schemaname='public' and indexname='analysis_runs_session_summary_uniq'");
  const def = idx.rows[0].indexdef;
  assert.match(def, /^CREATE UNIQUE INDEX .* USING btree \(source_id, prompt_version, COALESCE\(\(result ->> 'scope'::text\), ''::text\)\)/);
  assert.match(def, /WHERE \(\(analysis_type = 'session_summary'::text\) AND \(source_type = 'session'::text\) AND \(status = 'completed'::text\)\)/);
});

test("적용 전에 중복 완료 요약이 이미 있으면 1095는 멈춘다(데이터를 바꾸지 않고 실패)", async () => {
  const dup = await baseDb();
  await dup.query(`insert into public.analysis_runs (analysis_type, source_type, source_id, provider, prompt_version, status, result)
    values ('session_summary','session',$1,'mock','mock-seed-2026-09','completed','{"summary":"중복"}')`, [S.pubAm]);
  await dup.query(`insert into public.analysis_runs (analysis_type, source_type, source_id, provider, prompt_version, status, result)
    values ('session_summary','session',$1,'mock','mock-seed-2026-09','completed','{"summary":"중복 2"}'),('session_summary','session',$1,'mock','mock-seed-2026-09','completed','{"summary":"중복 3"}')`, [S.pubPm]);
  await rejected(dup.exec(MIGRATION), /1095 중단/);
  assert.equal((await dup.query("select count(*)::int n from pg_indexes where indexname='analysis_runs_session_summary_uniq'")).rows[0].n, 0);
});

// ---- 기존 시드 행 보존 vs 신규 INSERT(예외 없음) -----------------------------------------------------------------------
test("보존: 1095 적용 전에 저장된 시드 행(mock, sourceSessionIds 없음)은 그대로 남는다 — 가드는 새 INSERT에만 걸린다", async () => {
  const { rows } = await db.query("select count(*)::int n from public.analysis_runs where provider='mock' and prompt_version='mock-seed-2026-09' and analysis_type='session_summary'");
  assert.equal(rows[0].n, 3);
  const same = await db.query("select count(*)::int n from public.analysis_runs where source_id = $1 and analysis_type='session_summary'", [S.pubPm]);
  assert.equal(same.rows[0].n, 2, "scope 있는 행과 없는 옛 형식 행이 같은 세션에 공존(coalesce로 서로 다른 키)");
});

test("신규 mock INSERT는 예외 없이 거부된다 — sourceSessionIds 없는 시드 모양은 공용 세션에도, 방문자 세션에도, 시드 버전이어도 안 된다", async () => {
  const seedShape = { summary: "새 시드", scope: "morning" };
  for (const source of [S.pubToday, S.otherEnr, S.pubAm, S.aAm]) {
    await rejected(insertRun(db, { source, provider: "mock", pv: "mock-seed-2026-09", result: seedShape }), /sourceSessionIds/);
    await rejected(insertRun(db, { source, provider: "mock", pv: "mock-other-version", result: seedShape }), /sourceSessionIds/);
  }
  await rejected(insertRun(db, { source: S.pubToday, provider: "mock", pv: "mock-seed-2026-09", result: { summary: "옛 형식(범위 없음)" } }), /sourceSessionIds/);
});

test("신규 mock INSERT도 엄격 검증을 통과하면(=예외가 아니라 같은 규칙) 저장되고, 혼합·방문자 세션 위장은 거부된다", async () => {
  await insertRun(db, { source: S.otherEnr, provider: "mock", pv: "mock-strict-ok", result: appResult([S.otherEnr]) });
  await rejected(insertRun(db, { source: S.aAm, provider: "mock", pv: "mock-mix", result: appResult([S.aAm, S.pubToday]) }), /소유자가 섞였다/);
});

// ---- 신규 앱 생성 행: 정상 ------------------------------------------------------------------------------------------------
test("정상: 방문자 A의 등교 요약(단일 세션)과 통합 요약(등교+하교)이 저장된다", async () => {
  await insertRun(db, { source: S.aAm, result: appResult([S.aAm]) });
  await insertRun(db, { source: S.aPm, result: appResult([S.aAm, S.aPm], { scope: "full", periods: ["morning", "afternoon"] }) });
});

test("정상: 공용 세션만으로 만든 앱 요약도 저장된다(공용 요약)", async () => {
  await insertRun(db, { source: S.pubToday, result: appResult([S.pubToday], { scope: "full" }), pv: "daily-summary-v7" });
});

test("정상: 다른 방문자 B는 자기 세션에 자기 요약을 저장한다", async () => {
  await insertRun(db, { source: S.bAm, result: appResult([S.bAm]) });
});

// ---- 거부 ------------------------------------------------------------------------------------------------------------
test("거부: 존재하지 않는 source_id", async () => {
  await rejected(insertRun(db, { source: uuid(999), result: appResult([uuid(999)]) }), /실제 checkin_sessions가 아니다/);
});

test("거부: sourceSessionIds 누락 / 배열 아님 / 빈 배열 / 21개", async () => {
  const noIds = { ...appResult([S.aAm]) }; delete noIds.sourceSessionIds;
  await rejected(insertRun(db, { source: S.aAm, pv: "t-missing", result: noIds }), /sourceSessionIds/);
  await rejected(insertRun(db, { source: S.aAm, pv: "t-notarray", result: appResult(S.aAm) }), /sourceSessionIds/);
  await rejected(insertRun(db, { source: S.aAm, pv: "t-empty", result: appResult([]) }), /sourceSessionIds/);
  await rejected(insertRun(db, { source: S.aAm, pv: "t-many", result: appResult(Array.from({ length: 21 }, (_, i) => uuid(500 + i))) }), /sourceSessionIds/);
});

test("거부: sourceSessionIds에 대표 세션(source_id)이 없음", async () => {
  await rejected(insertRun(db, { source: S.aAm, pv: "t-nosrc", result: appResult([S.aPm]) }), /대표 세션/);
});

test("거부: sourceSessionIds에 실제 세션이 아닌 id 또는 uuid가 아닌 값", async () => {
  await rejected(insertRun(db, { source: S.aAm, pv: "t-ghost", result: appResult([S.aAm, uuid(998)]) }), /실제 세션이 아닌 id/);
  await rejected(insertRun(db, { source: S.aAm, pv: "t-nonuuid", result: appResult([S.aAm, "not-a-uuid"]) }), /uuid가 아닌 값/);
  await rejected(insertRun(db, { source: S.aAm, pv: "t-number", result: appResult([S.aAm, 5]) }), /uuid가 아닌 값/);
});

test("거부: 공용 세션 + 방문자 세션 혼합(같은 학생·같은 날)", async () => {
  await rejected(insertRun(db, { source: S.aAm, pv: "t-mix1", result: appResult([S.aAm, S.pubToday]) }), /소유자가 섞였다/);
  await rejected(insertRun(db, { source: S.pubToday, pv: "t-mix2", result: appResult([S.pubToday, S.aAm]) }), /소유자가 섞였다/);
});

test("거부: 방문자 A + 방문자 B 혼합", async () => {
  await rejected(insertRun(db, { source: S.aAm, pv: "t-ab", result: appResult([S.aAm, S.bAm]) }), /소유자가 섞였다/);
});

test("거부: 다른 학생 또는 다른 날짜의 세션을 한 요약에 묶음", async () => {
  await rejected(insertRun(db, { source: S.pubToday, pv: "t-enr", result: appResult([S.pubToday, S.otherEnr]) }), /같은 학생·같은 날짜/);
  await rejected(insertRun(db, { source: S.aAm, pv: "t-date", result: appResult([S.aAm, S.aOtherDay]) }), /같은 학생·같은 날짜/);
});

test("거부: scope 누락·잘못된 값, 완료 행의 summary 누락·빈 문자열·숫자", async () => {
  const noScope = appResult([S.aAm]); delete noScope.scope;
  await rejected(insertRun(db, { source: S.aAm, pv: "t-scope1", result: noScope }), /result\.scope/);
  await rejected(insertRun(db, { source: S.aAm, pv: "t-scope2", result: appResult([S.aAm], { scope: "night" }) }), /result\.scope/);
  await rejected(insertRun(db, { source: S.aAm, pv: "t-sum1", result: appResult([S.aAm], { summary: undefined }) }), /result\.summary/);
  await rejected(insertRun(db, { source: S.aAm, pv: "t-sum2", result: appResult([S.aAm], { summary: "  " }) }), /result\.summary/);
  await rejected(insertRun(db, { source: S.aAm, pv: "t-sum3", result: appResult([S.aAm], { summary: 7 }) }), /result\.summary/);
});

test("거부: 소유자를 직접 기입(demo_owner_id) — 서버·클라이언트 어느 쪽도 소유자를 넣지 못한다", async () => {
  await rejected(insertRun(db, { source: S.aAm, pv: "t-owner", result: appResult([S.aAm]), owner: U.A }), /demo_owner_id를 직접 쓰지 않는다/);
  await rejected(insertRun(db, { source: S.aAm, pv: "t-owner2", result: appResult([S.aAm]), owner: U.B }), /demo_owner_id를 직접 쓰지 않는다/);
});

test("거부: session_summary인데 source_type이 session이 아님(student로 위장)", async () => {
  await rejected(insertRun(db, { source: S.aAm, pv: "t-type", sourceType: "student", result: appResult([S.aAm]) }), /source_type=session/);
});

test("가드는 다른 analysis_type(emotion_vocab 등)과 다른 source_type의 기존 흐름을 막지 않는다", async () => {
  await insertRun(db, { source: S.aAm, type: "emotion_vocab", pv: "2026-09-18.v1", result: { lemmas: [], evidence: [] } });
  await insertRun(db, { source: uuid(700), type: "consultation_period_summary", sourceType: "student", pv: "x", result: { summary: "기간 요약" } });
});

test("완료가 아닌(failed) 행은 summary 없이 저장되지만, 소유·혼합 검증은 그대로 적용된다", async () => {
  const ok = await db.query(
    "insert into public.analysis_runs (analysis_type, source_type, source_id, provider, prompt_version, status, error_message, result) values ('session_summary','session',$1,'openai','t-failed','failed','오류',$2::jsonb) returning id",
    [S.aAm, JSON.stringify(appResult([S.aAm], { summary: undefined }))],
  );
  assert.equal(ok.rows.length, 1);
  await rejected(db.query(
    "insert into public.analysis_runs (analysis_type, source_type, source_id, provider, prompt_version, status, error_message, result) values ('session_summary','session',$1,'openai','t-failed2','failed','오류',$2::jsonb)",
    [S.aAm, JSON.stringify(appResult([S.aAm, S.bAm], { summary: undefined }))],
  ), /소유자가 섞였다/);
});

// ---- 멱등성 ----------------------------------------------------------------------------------------------------------
test("멱등: 같은 (세션, prompt_version, scope) 완료 요약을 다시 넣으면 23505, 행은 1건", async () => {
  const key = { source: S.aAm, pv: "daily-summary-v7", result: appResult([S.aAm]) };
  assert.equal(await codeOf(insertRun(db, key)), "23505");
  const { rows } = await db.query("select count(*)::int n from public.analysis_runs where analysis_type='session_summary' and source_id=$1 and prompt_version='daily-summary-v7' and result->>'scope'='morning' and status='completed'", [S.aAm]);
  assert.equal(rows[0].n, 1);
});

test("멱등: scope가 다르면(등교/통합) 같은 세션에도 각각 1건씩, 프롬프트 버전이 다르면 공존", async () => {
  await insertRun(db, { source: S.aPm, pv: "daily-summary-v7", result: appResult([S.aPm], { scope: "morning" }) }).catch((e) => assert.fail(e.message));
  await insertRun(db, { source: S.aAm, pv: "daily-summary-v8", result: appResult([S.aAm]) });
  assert.equal(await codeOf(insertRun(db, { source: S.aAm, pv: "daily-summary-v8", result: appResult([S.aAm]) })), "23505");
});

test("멱등: 옛 시드 형식(scope 없음)의 키도 유니크 인덱스가 지킨다 — 가드를 잠시 우회(replica 모드)해도 같은 키는 23505", async () => {
  await db.exec("set session_replication_role = replica");
  try {
    assert.equal(await codeOf(insertRun(db, { source: S.pubPm, provider: "mock", pv: "mock-seed-2026-09", result: { summary: "또 옛 형식" } })), "23505");
  } finally { await db.exec("set session_replication_role = origin"); }
});

test("멱등: 완료가 아닌 행은 유니크 대상이 아니다(재시도 기록은 여러 건 가능)", async () => {
  for (let i = 0; i < 2; i += 1) {
    await db.query("insert into public.analysis_runs (analysis_type, source_type, source_id, provider, prompt_version, status, error_message, result) values ('session_summary','session',$1,'openai','t-retry','failed','시간 초과',$2::jsonb)", [S.bAm, JSON.stringify(appResult([S.bAm], { summary: undefined }))]);
  }
});

// ---- 수정·삭제 ---------------------------------------------------------------------------------------------------------
test("UPDATE 가드: 식별·내용 컬럼 변경은 거부, 플래그 3개만 허용", async () => {
  const { rows } = await db.query("select id from public.analysis_runs where source_id=$1 and prompt_version='daily-summary-v7' and result->>'scope'='morning' and status='completed'", [S.aAm]);
  const id = rows[0].id;
  await rejected(db.query("update public.analysis_runs set result = jsonb_set(result,'{summary}','\"바꿈\"') where id=$1", [id]), /수정할 수 없다/);
  await rejected(db.query("update public.analysis_runs set source_id=$2 where id=$1", [id, S.bAm]), /수정할 수 없다/);
  await rejected(db.query("update public.analysis_runs set provider='mock' where id=$1", [id]), /수정할 수 없다/);
  await rejected(db.query("update public.analysis_runs set status='failed', error_message='x' where id=$1", [id]), /수정할 수 없다/);
  await rejected(db.query("update public.analysis_runs set analysis_type='emotion_vocab' where id=$1", [id]), /수정할 수 없다/);
  await rejected(db.query("update public.analysis_runs set demo_owner_id=$2 where id=$1", [id, U.B]), /수정할 수 없다/);
  await db.query("update public.analysis_runs set needs_followup=true, category_tags=array['x'] where id=$1", [id]);
});

test("UPDATE 가드: 기존 시드 행도 내용 수정 불가(시드 불변), DELETE는 막지 않는다(테스트 잔재 정리용)", async () => {
  await rejected(db.query("update public.analysis_runs set result='{\"summary\":\"조작\"}' where provider='mock' and source_id=$1", [S.pubAm]), /수정할 수 없다/);
  const tmp = await insertRun(db, { source: S.otherEnr, pv: "t-delete", result: appResult([S.otherEnr]) });
  await db.query("delete from public.analysis_runs where id=$1", [tmp.rows[0].id]);
});

// ---- 권한 ------------------------------------------------------------------------------------------------------------
test("가드 함수는 anon/authenticated가 실행할 수 없고, 방문자는 analysis_runs에 직접 쓸 수 없다", async () => {
  const { rows } = await db.query(`select
    has_function_privilege('anon','public.analysis_runs_session_summary_insert_guard()','execute') as anon_ins,
    has_function_privilege('authenticated','public.analysis_runs_session_summary_insert_guard()','execute') as auth_ins,
    has_function_privilege('anon','public.analysis_runs_session_summary_update_guard()','execute') as anon_upd,
    has_function_privilege('authenticated','public.analysis_runs_session_summary_update_guard()','execute') as auth_upd`);
  assert.deepEqual(rows[0], { anon_ins: false, auth_ins: false, anon_upd: false, auth_upd: false });
  for (const who of [visitor(U.A), { role: "anon" }]) {
    await as(db, who, async () => {
      await rejected(insertRun(db, { source: S.aAm, pv: "t-direct", result: appResult([S.aAm]) }), /permission denied/);
    });
  }
});

// ---- RLS(읽기) ---------------------------------------------------------------------------------------------------------
test("RLS: A는 자기 요약+공용 요약, B는 자기 요약+공용 요약만 — A의 요약은 B에게 안 보인다(부모 세션 소유자로 파생)", async () => {
  const idsFor = async (who) => as(db, who, async () => {
    const { rows } = await db.query("select source_id from public.analysis_runs where analysis_type='session_summary' and status='completed'");
    return new Set(rows.map((r) => r.source_id));
  });
  const a = await idsFor(visitor(U.A));
  const b = await idsFor(visitor(U.B));
  assert.ok(a.has(S.aAm) && a.has(S.aPm), "A는 자기 요약이 보인다(대조군)");
  assert.ok(!b.has(S.aAm) && !b.has(S.aPm), "B에게 A의 요약이 보이면 안 된다");
  assert.ok(b.has(S.bAm) && !a.has(S.bAm), "B의 요약은 B만");
  for (const set of [a, b]) assert.ok(set.has(S.pubAm) && set.has(S.pubPm) && set.has(S.pubToday), "공용 시드·공용 요약은 둘 다 보인다(대조군)");
});

// ---- 롤백 ------------------------------------------------------------------------------------------------------------
test("롤백: 인덱스·트리거·함수만 정확히 제거하고 정책·행은 그대로(데이터 손실 없음), 다시 적용해도 통과", async () => {
  const before = (await db.query("select count(*)::int n from public.analysis_runs")).rows[0].n;
  const policiesBefore = (await db.query("select count(*)::int n from pg_policies where tablename='analysis_runs'")).rows[0].n;
  const result = await db.exec(ROLLBACK);
  const check = result.find((r) => r.rows?.[0] && "index_gone" in r.rows[0])?.rows[0];
  assert.deepEqual(check, { index_gone: true, no_triggers_left: true, functions_gone: true, policies_untouched: true });
  assert.equal((await db.query("select count(*)::int n from public.analysis_runs")).rows[0].n, before);
  assert.equal((await db.query("select count(*)::int n from pg_policies where tablename='analysis_runs'")).rows[0].n, policiesBefore);
  // 롤백 뒤에는 가드가 없다 — 시드 모양 행도 들어간다는 것 자체가 "롤백 후 앱 코드도 되돌려야" 하는 이유다.
  await insertRun(db, { source: S.aAm, provider: "mock", pv: "after-rollback", result: { summary: "가드 없음" } });
  await db.query("delete from public.analysis_runs where prompt_version = 'after-rollback'");
  // 재적용(중복이 없으면 다시 통과한다)
  await db.exec(MIGRATION);
  assert.equal((await db.query("select count(*)::int n from pg_indexes where indexname='analysis_runs_session_summary_uniq'")).rows[0].n, 1);
});
