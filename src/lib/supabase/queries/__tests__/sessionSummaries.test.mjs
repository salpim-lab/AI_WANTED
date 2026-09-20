// AI 하루 요약의 DB 저장·조회(sessionSummaries.ts) + 그것을 쓰는 상세 화면·상담 리포트(=협진 챗봇 컨텍스트)·분석 생성 경로 검증.
//   실행: npm run test:session-summaries   (메모리 DB + 가짜 fetch — 공유 DB 접속·AI 호출·네트워크 없음)
//
// 검증 범위(앱 계층): 스코프·소유 검증(A/B/공용), 혼합·불완전 행 무시, 기존 시드 요약 호환, 멱등·동시 저장, 인스턴스가 바뀌어도 DB 재조회,
// 프롬프트 버전이 달라도 재사용(자동 재생성 없음), AI 실패 시 기존 요약 불변, 입력 세션 소유자 분리, 요약이 없거나 DB 오류일 때 색만으로 정상 동작,
// DEMO_MODE 꺼진 정식 흐름 회귀 없음. DB 수준(가드 트리거·유니크 인덱스)은 scripts/verify-1095의 PGlite 테스트가 진짜 Postgres로 덮는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { makeFakeDb } from "./fake-db.mjs";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

// 실제 키·주소가 아닌 자리 표시 값 — 네트워크로 나가지 않는다(fetch는 아래에서 가짜로 대체).
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://test.invalid";
process.env.SUPABASE_SECRET_KEY = "test-placeholder";
process.env.OPENAI_API_KEY = "test-placeholder";
delete process.env.TEACHER_REAL_CHECKINS;

const makeJiti = () =>
  createJiti(import.meta.url, {
    interopDefault: false,
    fsCache: false,
    moduleCache: false, // 호출마다 새 모듈 인스턴스 = "다른 서버 인스턴스"를 흉내 낸다
    alias: {
      "@": here("../../../../"),
      "server-only": here("./empty-stub.mjs"),
      "@/lib/supabase/admin": here("./stubs-summary.mjs"),
      "@/lib/supabase/server": here("./stubs-summary.mjs"),
      "@/lib/supabase/raw/observationLog": here("./observation-stub.mjs"),
    },
  });
const load = async (jiti = makeJiti()) => ({
  summaries: await jiti.import("../sessionSummaries.ts"),
  students: await jiti.import("../teacherStudents.ts"),
  daily: await jiti.import("../../interpretation/dailyAnalysis.ts"),
  mock: await jiti.import("../../raw/_mockTeacherData.ts"),
});
const base = await load();
const { validateStoredSummary, loadSessionSummaries, pickSummary, pickDayAnalysis, insertSessionSummary, isRealSessionId } = base.summaries;
const { MOCK_STUDENTS, MOCK_DB_CLASS_ID } = base.mock;
const STUDENT = MOCK_STUDENTS.find((s) => s.display_name === "김민준");

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ENR = "40000000-0000-4000-8000-000000000001";
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const D0 = "2026-09-10"; // 공용 시드 날짜
const D = "2026-09-20"; // 방문자 날짜
const S = { pubAm: uuid(1), pubPm: uuid(2), aAm: uuid(11), aPm: uuid(12), bAm: uuid(13), pubToday: uuid(3) };
const MARK = { A: "비공개발화-A-마커", B: "비공개발화-B-마커", PUB: "공용발화-마커" };

function session(id, date, period, owner, at, marker) {
  return {
    id, enrollment_id: ENR, session_date: date, period, attempt: 1, mood_color: "green", status: "completed", started_at: `${date}T${at}:00Z`,
    transcript: [{ speaker: "assistant", content: "오늘 어때?" }, { speaker: "student", content: marker }], prosody: null, demo_owner_id: owner,
  };
}
let seedCounter = 0;
const seedRun = (source, result) => ({
  id: uuid(800 + seedCounter++),
  analysis_type: "session_summary", source_type: "session", source_id: source, provider: "mock", prompt_version: "mock-seed-2026-09",
  status: "completed", created_at: "2026-09-18T00:00:00.000Z", result,
});
function freshDb(extraSessions = [], extraRuns = []) {
  return makeFakeDb({
    enrollments: [{ id: ENR, class_id: MOCK_DB_CLASS_ID, ended_on: null, students: { display_name: "민준" } }],
    checkin_sessions: [
      session(S.pubAm, D0, "morning", null, "01:00", MARK.PUB),
      session(S.pubPm, D0, "afternoon", null, "06:00", MARK.PUB),
      session(S.aAm, D, "morning", A, "01:00", MARK.A),
      session(S.aPm, D, "afternoon", A, "06:00", MARK.A),
      session(S.bAm, D, "morning", B, "01:30", MARK.B),
      ...extraSessions,
    ],
    analysis_runs: [
      // 공유 DB의 시드 요약과 같은 모양: mock provider, sourceSessionIds 없음, scope 있음/없음, 공용 세션
      seedRun(S.pubAm, { summary: "시드-등교-요약", scope: "morning", periods: ["morning"] }),
      seedRun(S.pubPm, { summary: "시드-하교-요약(범위 있음)", scope: "full", periods: ["morning", "afternoon"] }),
      seedRun(S.pubPm, { summary: "시드-하교-요약(옛 형식)" }),
      ...extraRuns,
    ],
  });
}

// ---- 가짜 OpenAI(fetch) — 실제 네트워크 호출 없음 ----------------------------------------------------------------------
let fetchBodies = [];
let fetchDelayMs = 0;
let fetchFails = false;
let summaryText = "AI-요약-문장";
const realFetch = globalThis.fetch;
function installFakeFetch() {
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses", "테스트에서 다른 주소로 나가는 요청은 없어야 한다");
    fetchBodies.push(String(init?.body ?? ""));
    if (fetchDelayMs) await new Promise((resolve) => setTimeout(resolve, fetchDelayMs));
    if (fetchFails) return new Response("boom", { status: 500 });
    const output = { summary: summaryText, state_estimate: "안정적", keywords: ["키워드"], evidence_message_ids: [] };
    return new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }] }), { status: 200 });
  };
}

let db;
beforeEach(() => {
  fetchBodies = []; fetchDelayMs = 0; fetchFails = false; summaryText = "AI-요약-문장";
  installFakeFetch();
  globalThis.__salpimDailyAnalysisInflight?.clear();
  process.env.DEMO_MODE = "true";
  globalThis.__TEST_VIEWER__ = A;
  db = freshDb();
  globalThis.__TEST_DB__ = db;
});
afterEach(() => { globalThis.fetch = realFetch; delete globalThis.__TEST_DB__; delete globalThis.__TEST_VIEWER__; delete process.env.DEMO_MODE; });

const scopeOf = (viewerId) => ({ active: true, viewerId });
const INACTIVE = { active: false };
const analysisFor = (report, date) => report.analyses.find((a) => a.date === date);

async function generateAs(viewer, date = D, mods = base) {
  globalThis.__TEST_VIEWER__ = viewer;
  const input = await mods.students.getDailyAnalysisInput(MOCK_DB_CLASS_ID, STUDENT.student_id, date);
  return mods.daily.getOrCreateDayAnalyses(input);
}
const reportAs = async (viewer, mods = base) => {
  globalThis.__TEST_VIEWER__ = viewer;
  return mods.students.getConsultationReport(MOCK_DB_CLASS_ID, STUDENT.student_id, "2026-09-01", D);
};
const storedAs = async (viewer, date, mods = base) => {
  globalThis.__TEST_VIEWER__ = viewer;
  return mods.students.getStoredDayAnalyses(MOCK_DB_CLASS_ID, STUDENT.student_id, date);
};
const summaryRows = () => db.data.analysis_runs.filter((r) => r.analysis_type === "session_summary" && r.provider === "openai");

// =====================================================================================================================
// 1) 순수 검증 — validateStoredSummary
const meta = (id, owner, extra = {}) => ({ id, demo_owner_id: owner, enrollment_id: ENR, session_date: D, period: "morning", ...extra });
const sessionsMap = (...metas) => new Map(metas.map((m) => [m.id, m]));
const run = (source, result, over = {}) => ({ id: uuid(900), source_id: source, provider: "openai", prompt_version: "daily-summary-v7", created_at: "2026-09-20T10:00:00.000Z", result, ...over });
const okResult = (ids, over = {}) => ({ summary: "요약", stateEstimate: "상태", scope: "morning", sourceSessionIds: ids, ...over });

test("검증: 방문자 A의 요약은 A 스코프·공용 아닌 정식 스코프에서만 보이고 B에게는 안 보인다", () => {
  const map = sessionsMap(meta(S.aAm, A));
  const row = run(S.aAm, okResult([S.aAm]));
  assert.ok(validateStoredSummary(row, map, scopeOf(A)));
  assert.equal(validateStoredSummary(row, map, scopeOf(B)), null, "B에게 A의 요약이 보이면 안 된다");
  assert.equal(validateStoredSummary(row, map, scopeOf(null)), null, "방문자를 못 찾으면 공용만(fail-closed)");
  assert.ok(validateStoredSummary(row, map, INACTIVE), "DEMO_MODE 꺼진 정식 흐름은 스코프를 걸지 않는다");
});

test("검증: 공용 세션 요약은 A·B·방문자 미확인 모두에게 같게 보인다", () => {
  const map = sessionsMap(meta(S.pubToday, null));
  const row = run(S.pubToday, okResult([S.pubToday]));
  for (const scope of [scopeOf(A), scopeOf(B), scopeOf(null), INACTIVE]) assert.equal(validateStoredSummary(row, map, scope)?.summary, "요약");
});

test("검증: 공용+방문자, A+B 혼합 행은 누구에게도 안 보인다(직접 저장돼 있더라도)", () => {
  const mixedPub = sessionsMap(meta(S.aAm, A), meta(S.pubToday, null));
  const mixedAB = sessionsMap(meta(S.aAm, A), meta(S.bAm, B));
  for (const scope of [scopeOf(A), scopeOf(B), scopeOf(null)]) {
    assert.equal(validateStoredSummary(run(S.aAm, okResult([S.aAm, S.pubToday])), mixedPub, scope), null);
    assert.equal(validateStoredSummary(run(S.aAm, okResult([S.aAm, S.bAm])), mixedAB, scope), null);
  }
});

test("검증: 잘못된 source_id·누락/잘못된 sourceSessionIds·대표 세션 미포함·존재하지 않는 세션·다른 학생/날짜는 거부", () => {
  const map = sessionsMap(meta(S.aAm, A), meta(S.aPm, A, { period: "afternoon" }), meta(uuid(50), A, { enrollment_id: "x" }), meta(uuid(51), A, { session_date: "2026-09-19" }));
  const s = scopeOf(A);
  assert.equal(validateStoredSummary(run(uuid(999), okResult([uuid(999)])), map, s), null, "존재하지 않는 대표 세션");
  const noIds = okResult([S.aAm]); delete noIds.sourceSessionIds;
  assert.equal(validateStoredSummary(run(S.aAm, noIds), map, s), null, "앱이 만든 행은 sourceSessionIds 필수");
  for (const bad of ["문자열", [], [5], ["not-a-uuid"], Array.from({ length: 21 }, (_, i) => uuid(300 + i))]) {
    assert.equal(validateStoredSummary(run(S.aAm, okResult(bad)), map, s), null, `잘못된 sourceSessionIds: ${JSON.stringify(bad).slice(0, 30)}`);
  }
  assert.equal(validateStoredSummary(run(S.aAm, okResult([S.aPm])), map, s), null, "대표 세션이 입력에 없음");
  assert.equal(validateStoredSummary(run(S.aAm, okResult([S.aAm, uuid(998)])), map, s), null, "존재하지 않는 세션이 섞임");
  assert.equal(validateStoredSummary(run(S.aAm, okResult([S.aAm, uuid(50)])), map, s), null, "다른 학생");
  assert.equal(validateStoredSummary(run(S.aAm, okResult([S.aAm, uuid(51)])), map, s), null, "다른 날짜");
  assert.equal(validateStoredSummary(run(S.aAm, okResult([S.aAm], { summary: "  " })), map, s), null, "빈 요약");
  assert.equal(validateStoredSummary(run(S.aAm, okResult([S.aAm], { scope: "night" })), map, s), null, "잘못된 scope");
  assert.ok(validateStoredSummary(run(S.aAm, okResult([S.aAm, S.aPm], { scope: "full" })), map, s), "정상 대조군");
});

test("호환: 기존 시드 요약(mock, sourceSessionIds 없음, 공용 세션)은 A·B에게 공용으로 보이고 scope는 시간대로 유추한다", () => {
  const map = sessionsMap(meta(S.pubAm, null), meta(S.pubPm, null, { period: "afternoon" }));
  const seedAm = run(S.pubAm, { summary: "시드" }, { provider: "mock", prompt_version: "mock-seed-2026-09" });
  const seedPm = run(S.pubPm, { summary: "시드 하교" }, { provider: "mock", prompt_version: "mock-seed-2026-09" });
  for (const scope of [scopeOf(A), scopeOf(B)]) {
    assert.deepEqual([validateStoredSummary(seedAm, map, scope)?.scope, validateStoredSummary(seedAm, map, scope)?.scopeDerived], ["morning", true]);
    assert.deepEqual([validateStoredSummary(seedPm, map, scope)?.scope, validateStoredSummary(seedPm, map, scope)?.scopeDerived], ["full", true]);
  }
});

test("시드 읽기 호환 범위: mock + 시드 버전(mock-seed-2026-09) + 공용 세션 + 완료일 때만 — 다른 버전·다른 provider·방문자 세션은 거부", () => {
  const map = sessionsMap(meta(S.aAm, A), meta(S.pubToday, null));
  const seed = { provider: "mock", prompt_version: "mock-seed-2026-09" };
  assert.ok(validateStoredSummary(run(S.pubToday, { summary: "시드", scope: "morning" }, seed), map, scopeOf(A)), "대조군: 정확한 시드 조건은 읽힌다");
  assert.equal(validateStoredSummary(run(S.pubToday, { summary: "시드" }, { provider: "mock", prompt_version: "mock-other-version" }), map, scopeOf(A)), null, "다른 mock 버전");
  assert.equal(validateStoredSummary(run(S.pubToday, { summary: "시드" }, { provider: "mock", prompt_version: "daily-summary-v7" }), map, scopeOf(A)), null, "mock이지만 시드 버전 아님");
  assert.equal(validateStoredSummary(run(S.pubToday, { summary: "시드" }, { provider: "openai", prompt_version: "mock-seed-2026-09" }), map, scopeOf(A)), null, "시드 버전 문자열이어도 provider가 mock이 아님");
  assert.equal(validateStoredSummary(run(S.aAm, { summary: "위장", scope: "morning" }, seed), map, scopeOf(A)), null, "방문자 세션에 붙은 mock은 호환 대상이 아님");
  assert.equal(validateStoredSummary(run(S.aAm, { summary: "위장", scope: "morning" }, { provider: "openai" }), map, scopeOf(A)), null, "sourceSessionIds 없는 앱 행은 거부");
});

// =====================================================================================================================
// 2) 배치 조회
test("조회: 같은 DB에서 A는 자기 요약+공용, B는 B 요약이 없어 공용만 — A 요약은 B에게 안 보인다", async () => {
  await insertSessionSummary(db.client, scopeOf(A), { sourceId: S.aAm, sessionIds: [S.aAm], scope: "morning", provider: "openai", model: "m", promptVersion: "daily-summary-v7", result: { summary: "A만의 요약" } });
  const all = [S.pubAm, S.pubPm, S.aAm, S.aPm, S.bAm];
  const forA = await loadSessionSummaries(db.client, all, scopeOf(A));
  const forB = await loadSessionSummaries(db.client, all, scopeOf(B));
  assert.ok(forA.some((r) => r.summary === "A만의 요약"), "대조군: A는 자기 요약이 보인다");
  assert.ok(!forB.some((r) => r.summary === "A만의 요약"), "B에게 A 요약이 보이면 안 된다");
  const pub = (rows) => rows.filter((r) => r.provider === "mock").map((r) => r.summary).sort();
  assert.deepEqual(pub(forA), pub(forB), "공용 요약은 A·B가 동일하게 본다");
  assert.equal(pub(forA).length, 3);
});

test("조회: 목업 id는 무시하고, 100개 넘는 id는 나눠서 읽고, DB 오류는 던진다", async () => {
  assert.equal(isRealSessionId("mock-1"), false);
  assert.deepEqual(await loadSessionSummaries(db.client, ["mock-1", "mock-2"], scopeOf(A)), []);
  const many = Array.from({ length: 230 }, (_, i) => uuid(2000 + i));
  await loadSessionSummaries(db.client, many, scopeOf(A));
  assert.equal(db.calls.select.filter(([table]) => table === "analysis_runs").length, 3, "230개 → 100+100+30 배치 3번");
  db.failSelectOn("analysis_runs");
  await assert.rejects(loadSessionSummaries(db.client, [S.pubAm], scopeOf(A)));
});

test("선택: 프롬프트 버전이 달라도 최신 유효 요약을 쓴다, 명시 scope가 유추 scope보다 우선, 하루 대표는 마지막 세션 요약 우선", async () => {
  const rows = await loadSessionSummaries(db.client, [S.pubAm, S.pubPm], scopeOf(A));
  assert.equal(pickSummary(rows, S.pubPm, "full")?.summary, "시드-하교-요약(범위 있음)", "명시 scope 행이 옛 형식(유추) 행보다 우선");
  const pubDay = [{ sessionId: S.pubAm, period: "morning", ownerId: null }, { sessionId: S.pubPm, period: "afternoon", ownerId: null }];
  assert.equal(pickDayAnalysis(rows, pubDay, A)?.sourceId, S.pubPm, "하루의 마지막 세션에 붙은 요약 우선");
  assert.equal(pickDayAnalysis(rows, pubDay.slice(0, 1), A)?.summary, "시드-등교-요약", "하교 세션이 없는 날은 등교 요약이 그날의 요약");
  assert.equal(pickDayAnalysis(rows.filter((r) => r.scope !== "full"), pubDay, A), null, "하교가 있는 날은 통합 요약이 없으면 등교 요약을 하루 요약으로 쓰지 않는다");
  assert.equal(pickDayAnalysis(rows.filter((r) => r.scope !== "full"), pubDay, A, { requireFullWhenAfternoon: false })?.summary, "시드-등교-요약", "다음 분석의 흐름 입력용(stateEstimate)은 등교 요약도 허용");
  assert.equal(pickSummary(rows, S.pubAm, "full"), null);
  const v6 = { id: uuid(910), analysis_type: "session_summary", source_type: "session", source_id: S.aAm, provider: "openai", prompt_version: "daily-summary-v6", status: "completed", created_at: "2026-09-19T00:00:00.000Z", result: okResult([S.aAm], { summary: "옛 버전" }) };
  const v7 = { ...v6, id: uuid(911), prompt_version: "daily-summary-v7", created_at: "2026-09-20T00:00:00.000Z", result: okResult([S.aAm], { summary: "새 버전" }) };
  const two = freshDb([], [v6, v7]);
  const picked = pickSummary(await loadSessionSummaries(two.client, [S.aAm], scopeOf(A)), S.aAm, "morning");
  assert.equal(picked.summary, "새 버전", "가장 최근 완료 요약");
  const onlyOld = freshDb([], [v6]);
  assert.equal(pickSummary(await loadSessionSummaries(onlyOld.client, [S.aAm], scopeOf(A)), S.aAm, "morning").summary, "옛 버전", "버전이 달라도 재사용");
});

// =====================================================================================================================
// 3) 저장 — 멱등·충돌·불변
const NEW_A = () => ({ sourceId: S.aAm, sessionIds: [S.aAm], scope: "morning", provider: "openai", model: "m", promptVersion: "daily-summary-v7", result: { summary: "첫 요약", stateEstimate: "상태" } });

test("저장: 소유자 값을 넣지 않고(demo_owner_id 없음), scope·sourceSessionIds를 결과에 기록하며, 기존 행은 수정·삭제하지 않는다", async () => {
  const { summary, created } = await insertSessionSummary(db.client, scopeOf(A), { ...NEW_A(), result: { summary: "첫 요약", demo_owner_id: B, scope: "full" } });
  assert.equal(created, true);
  const inserted = db.calls.insert.at(-1).row;
  assert.ok(!("demo_owner_id" in inserted), "클라이언트가 소유자를 넣을 경로가 없다");
  assert.equal(inserted.result.scope, "morning", "입력의 scope 값이 저장 scope를 덮지 못한다");
  assert.deepEqual(inserted.result.sourceSessionIds, [S.aAm]);
  assert.equal(summary.summary, "첫 요약");
  assert.equal(db.calls.update, 0);
  assert.equal(db.calls.delete, 0);
});

test("저장: 같은 요약을 다시 저장하면 23505 → 이긴 행을 다시 읽어 돌려주고 완료 행은 1건", async () => {
  const first = await insertSessionSummary(db.client, scopeOf(A), NEW_A());
  const second = await insertSessionSummary(db.client, scopeOf(A), { ...NEW_A(), result: { summary: "다른 문장(진 쪽)" } });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.summary.id, first.summary.id);
  assert.equal(second.summary.summary, "첫 요약", "진 쪽 문장이 이긴 행을 덮어쓰지 않는다");
  assert.equal(summaryRows().length, 1);
  assert.equal(db.calls.update + db.calls.delete, 0);
});

test("저장: 동시에 저장해도 완료 행은 1건이고 둘 다 같은 요약 id를 돌려받는다", async () => {
  const [x, y] = await Promise.all([insertSessionSummary(db.client, scopeOf(A), NEW_A()), insertSessionSummary(db.client, scopeOf(A), NEW_A())]);
  assert.equal(x.summary.id, y.summary.id);
  assert.equal(summaryRows().length, 1);
});

test("저장: 유니크 위반이 아닌 오류나 빈 요약은 조용히 넘기지 않고 던진다", async () => {
  db.failInsert({ code: "23514", message: "가드 트리거 거부(소유자 혼합 등)" });
  await assert.rejects(insertSessionSummary(db.client, scopeOf(A), NEW_A()), /가드 트리거 거부/);
  db.clearFailures();
  await assert.rejects(insertSessionSummary(db.client, scopeOf(A), { ...NEW_A(), result: { summary: " " } }), /비어 있습니다/);
  assert.equal(summaryRows().length, 0);
});

// =====================================================================================================================
// 4) 분석 생성 → 상세 화면·챗봇(상담 리포트) 읽기: 전 구간
test("A 상세 화면과 A 챗봇(상담 리포트)이 같은 저장 요약을 쓴다", async () => {
  const generated = await generateAs(A);
  assert.equal(generated.morning?.summary, "AI-요약-문장");
  assert.equal(generated.full?.summary, "AI-요약-문장");
  assert.equal(fetchBodies.length, 2, "등교 기준 + 통합 기준 = 2회 생성");

  const detail = await storedAs(A, D);
  const report = await reportAs(A);
  const chatbotAnalysis = analysisFor(report, D);
  assert.equal(detail.morning, "AI-요약-문장");
  assert.equal(detail.full, "AI-요약-문장");
  assert.equal(chatbotAnalysis?.summary, detail.full, "챗봇이 읽는 요약 = 상세 화면의 통합 요약(같은 DB 행)");
  const saved = summaryRows();
  assert.equal(saved.length, 2);
  assert.ok(saved.every((r) => r.demo_owner_id === undefined), "요약 행에는 소유자를 쓰지 않는다(부모 세션에서 파생)");
  assert.ok(saved.every((r) => Array.isArray(r.result.sourceSessionIds) && ["morning", "full"].includes(r.result.scope)));
  assert.equal(chatbotAnalysis.analysisId, saved.find((r) => r.result.scope === "full").id);
});

test("B는 A의 요약도 발화도 못 본다 — 상세·챗봇 어느 쪽에도 (색 정보는 B 자신의 것만)", async () => {
  await generateAs(A);
  const detailB = await storedAs(B, D);
  const reportB = await reportAs(B);
  assert.deepEqual(detailB, { morning: null, full: null });
  assert.equal(analysisFor(reportB, D), undefined, "B의 리포트에 A의 요약이 없다");
  const dump = JSON.stringify(reportB);
  assert.ok(!dump.includes("AI-요약-문장") && !dump.includes(MARK.A), "B의 결과에 A의 요약·발화가 섞이면 안 된다");
  assert.ok(reportB.sessions.some((s) => s.date === D && s.sessionId === S.bAm), "대조군: B는 B 자신의 세션(색)이 보인다");
  assert.ok(!reportB.sessions.some((s) => s.sessionId === S.aAm));
});

test("공용 시드 요약은 A·B에게 동일하게 보인다(상세·챗봇 모두)", async () => {
  const detailA = await storedAs(A, D0);
  const detailB = await storedAs(B, D0);
  assert.deepEqual(detailA, detailB);
  assert.equal(detailA.morning, "시드-등교-요약");
  assert.equal(detailA.full, "시드-하교-요약(범위 있음)");
  const reportA = analysisFor(await reportAs(A), D0);
  const reportB = analysisFor(await reportAs(B), D0);
  assert.equal(reportA?.summary, "시드-하교-요약(범위 있음)");
  assert.deepEqual(reportA, reportB);
});

test("서버 인스턴스가 바뀌어도(새 모듈 인스턴스) DB에서 다시 읽고, 다시 분석(AI 호출)하지 않는다", async () => {
  await generateAs(A);
  const calls = fetchBodies.length;
  const other = await load(makeJiti()); // 메모리 상태를 공유하지 않는 두 번째 "인스턴스"
  const detail = await storedAs(A, D, other);
  const report = await reportAs(A, other);
  assert.equal(detail.full, "AI-요약-문장");
  assert.equal(analysisFor(report, D)?.summary, "AI-요약-문장");
  const again = await generateAs(A, D, other);
  assert.equal(again.full?.summary, "AI-요약-문장");
  assert.equal(fetchBodies.length, calls, "저장된 요약이 있으면 AI를 다시 부르지 않는다");
  assert.equal(summaryRows().length, 2);
});

test("반복 분석: 같은 세션을 여러 번 분석해도 완료 행은 그대로(등교 1 + 통합 1)", async () => {
  await generateAs(A);
  await generateAs(A);
  await generateAs(A);
  assert.equal(summaryRows().length, 2);
  assert.equal(fetchBodies.length, 2);
});

test("동시 분석(같은 인스턴스): AI는 한 번만 부르고 완료 행은 1건", async () => {
  fetchDelayMs = 20;
  const results = await Promise.all([generateAs(A), generateAs(A)]);
  assert.equal(results[0].morning.analysisId, results[1].morning.analysisId);
  assert.equal(summaryRows().filter((r) => r.result.scope === "morning").length, 1);
  assert.equal(fetchBodies.length, 2, "등교 1 + 통합 1 (중복 호출 없음)");
});

test("동시 분석(서로 다른 인스턴스): 둘 다 AI를 불러도 DB에는 완료 행이 1건 — 진 쪽은 이긴 행을 돌려받는다", async () => {
  fetchDelayMs = 20;
  delete globalThis.__salpimDailyAnalysisInflight; // 새 모듈 인스턴스가 자기 in-flight 맵을 갖게 한다(서로 다른 프로세스 흉내)
  const other = await load(makeJiti());
  globalThis.__TEST_VIEWER__ = A;
  const inputA = await base.students.getDailyAnalysisInput(MOCK_DB_CLASS_ID, STUDENT.student_id, D);
  const inputB = await other.students.getDailyAnalysisInput(MOCK_DB_CLASS_ID, STUDENT.student_id, D);
  const p1 = base.daily.getOrCreateDayAnalyses(inputA);
  const p2 = other.daily.getOrCreateDayAnalyses(inputB);
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.ok(fetchBodies.length >= 3, "경합을 실제로 만들었다(AI가 중복 호출됨)");
  assert.equal(summaryRows().filter((r) => r.result.scope === "morning").length, 1);
  assert.equal(summaryRows().filter((r) => r.result.scope === "full").length, 1);
  assert.equal(r1.morning.analysisId, r2.morning.analysisId);
  assert.equal(r1.full.analysisId, r2.full.analysisId);
});

test("프롬프트 버전이 달라도 유효한 최신 완료 요약이 있으면 재사용한다 — 자동 재생성 없음", async () => {
  const old = { id: uuid(920), analysis_type: "session_summary", source_type: "session", source_id: S.aAm, provider: "openai", prompt_version: "daily-summary-v3", status: "completed", created_at: "2026-09-19T00:00:00.000Z", result: okResult([S.aAm], { summary: "v3 시절 요약" }) };
  db = freshDb([], [old]);
  globalThis.__TEST_DB__ = db;
  const out = await generateAs(A);
  assert.equal(out.morning.summary, "v3 시절 요약");
  assert.equal(out.morning.analysisId, uuid(920));
  assert.equal(fetchBodies.length, 1, "통합 요약만 새로 만들고 등교 요약은 재사용");
});

test("AI 실패: 기존 완료 요약은 수정·삭제되지 않고 새 행도 생기지 않는다", async () => {
  await generateAs(A);
  const before = JSON.stringify(summaryRows());
  // 통합 요약을 다시 만들 일은 없으니, 새 하교 세션(A)이 생긴 날을 만들어 "새로 만들어야 하는" 상황에서 AI를 실패시킨다.
  db.data.checkin_sessions.push({ ...session(uuid(15), D, "afternoon", A, "09:00", MARK.A) });
  fetchFails = true;
  globalThis.__salpimDailyAnalysisInflight?.clear();
  await assert.rejects(generateAs(A));
  assert.equal(JSON.stringify(summaryRows()), before, "기존 행 그대로, 새 행 없음");
  assert.equal(db.calls.update + db.calls.delete, 0);
  fetchFails = false;
  const detail = await storedAs(A, D);
  assert.equal(detail.morning, "AI-요약-문장", "기존 등교 요약은 여전히 읽힌다");
});

// ---- 방문자 본인 세션 우선 선택 + 공용 세션 분리 --------------------------------------------------------------------------
const publicSession = (id, period, at) => session(id, D, period, null, at, MARK.PUB);
const removeSessions = (...ids) => { db.data.checkin_sessions = db.data.checkin_sessions.filter((s) => !ids.includes(s.id)); };
const publicSummaryRow = (source, text = "공용요약-문장") => ({
  id: uuid(930), analysis_type: "session_summary", source_type: "session", source_id: source, provider: "openai", prompt_version: "daily-summary-v7",
  status: "completed", created_at: "2026-09-20T12:00:00.000Z", result: okResult([source], { summary: text, scope: "morning" }),
});
const noMixedOwners = () => {
  for (const row of summaryRows()) {
    const owners = new Set(row.result.sourceSessionIds.map((id) => db.data.checkin_sessions.find((x) => x.id === id).demo_owner_id ?? "public"));
    assert.equal(owners.size, 1, "요약 입력 세션의 소유자는 하나: " + [...owners]);
  }
};

test("방문자 요약 누락 방지 — 공용 세션이 A 등교보다 늦게(뒤에) 있어도 A의 등교 요약이 만들어지고 읽힌다", async () => {
  removeSessions(S.aPm, S.bAm);
  db.data.checkin_sessions.push(publicSession(S.pubToday, "morning", "03:00")); // A 등교(01:00) 뒤
  const out = await generateAs(A);
  assert.equal(out.morning?.summary, "AI-요약-문장");
  assert.equal(out.full, null, "A는 등교만 있다");
  const rows = summaryRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_id, S.aAm, "대표 세션은 A 본인의 등교 세션");
  assert.deepEqual(rows[0].result.sourceSessionIds, [S.aAm]);
  assert.ok(fetchBodies.every((body) => body.includes(MARK.A) && !body.includes(MARK.PUB)), "AI 입력에 공용 세션 발화가 없다");
  assert.equal((await storedAs(A, D)).morning, "AI-요약-문장", "상세 화면에서도 읽힌다");
  assert.equal(analysisFor(await reportAs(A), D)?.summary, "AI-요약-문장", "챗봇(상담 리포트)에서도 읽힌다");
  noMixedOwners();
});

test("방문자 요약 누락 방지 — 공용 세션이 A 등교보다 앞에 있어도 마찬가지", async () => {
  removeSessions(S.aPm, S.bAm);
  db.data.checkin_sessions.push(publicSession(S.pubToday, "morning", "00:30")); // A 등교(01:00) 앞
  const out = await generateAs(A);
  assert.equal(out.morning?.summary, "AI-요약-문장");
  assert.deepEqual(summaryRows().map((r) => r.source_id), [S.aAm]);
  assert.ok(fetchBodies.every((body) => !body.includes(MARK.PUB)));
  assert.equal((await storedAs(A, D)).morning, "AI-요약-문장");
  noMixedOwners();
});

test("A 등교만 있는 날(공용 세션 없음): 등교 요약만 만들어지고 통합 요약은 없다", async () => {
  removeSessions(S.aPm, S.bAm);
  const out = await generateAs(A);
  assert.ok(out.morning);
  assert.equal(out.full, null);
  assert.equal(summaryRows().length, 1);
  assert.deepEqual(await storedAs(A, D), { morning: "AI-요약-문장", full: null });
});

test("A 등교·하교가 있고 공용 세션이 앞·사이·뒤에 있어도: 등교 요약과 통합 요약이 둘 다 A 세션만으로 만들어진다", async () => {
  removeSessions(S.bAm);
  // 공용 세션: A 등교 앞(00:30) · 등교↔하교 사이(03:00) · 하교 뒤(08:00, 그날 가장 늦음)
  db.data.checkin_sessions.push(publicSession(uuid(41), "morning", "00:30"), publicSession(uuid(42), "morning", "03:00"), publicSession(uuid(43), "afternoon", "08:00"));
  const out = await generateAs(A);
  assert.ok(out.morning && out.full, "공용 세션이 가장 늦어도(뒤) 본인 요약이 누락되지 않는다");
  const byScope = new Map(summaryRows().map((r) => [r.result.scope, r]));
  assert.deepEqual(byScope.get("morning").result.sourceSessionIds, [S.aAm]);
  assert.deepEqual(byScope.get("full").result.sourceSessionIds, [S.aAm, S.aPm]);
  assert.equal(byScope.get("full").source_id, S.aPm, "통합 요약의 대표는 A의 하교 세션");
  assert.ok(fetchBodies.every((body) => body.includes(MARK.A) && !body.includes(MARK.PUB)), "공용 발화는 AI 입력에 들어가지 않는다");
  assert.deepEqual(await storedAs(A, D), { morning: "AI-요약-문장", full: "AI-요약-문장" });
  noMixedOwners();
});

test("공용 요약은 별도로 조회되고, 개인 요약이 이미 있는 것으로 대신 취급되지 않는다", async () => {
  removeSessions(S.aPm, S.bAm);
  db.data.checkin_sessions.push(publicSession(S.pubToday, "morning", "03:00"));
  db.data.analysis_runs.push(publicSummaryRow(S.pubToday)); // 같은 날 공용 세션에 이미 공용 요약이 있다
  assert.deepEqual(await storedAs(A, D), { morning: null, full: null }, "공용 요약이 있어도 A의 상세 화면은 A 본인 요약이 없으면 없는 것으로 본다");
  assert.equal(analysisFor(await reportAs(A), D), undefined, "챗봇도 공용 요약을 A의 요약으로 쓰지 않는다(색만)");
  const out = await generateAs(A);
  assert.equal(fetchBodies.length, 1, "개인 요약은 공용 요약과 무관하게 새로 만든다");
  assert.equal(out.morning.summary, "AI-요약-문장");
  assert.notEqual(out.morning.analysisId, uuid(930));
  // 만든 뒤에는 본인 요약이 공용 요약보다 우선한다(공용 세션이 더 늦어도)
  assert.equal(analysisFor(await reportAs(A), D)?.summary, "AI-요약-문장");
  assert.equal((await storedAs(A, D)).morning, "AI-요약-문장");
  // 공용 요약은 공용 조회로 따로 읽힌다: 본인 세션이 없는 방문자 B(그날 B 세션 없음)는 공용 요약만 본다
  const forB = await storedAs(B, D);
  assert.equal(forB.morning, "공용요약-문장");
  assert.ok(!JSON.stringify(forB).includes("AI-요약-문장"), "B에게 A의 요약은 없다");
});

test("방문자 본인 세션이 없으면(방문자 미확인·공용만 보임) 공용 세션끼리만 묶고 방문자 발화는 입력에 없다", async () => {
  db.data.checkin_sessions.push(publicSession(S.pubToday, "morning", "03:00"));
  const out = await generateAs(null); // 세션 없는 방문자 → 스코프 fail-closed(공용만)
  assert.ok(out.morning);
  const row = summaryRows()[0];
  assert.deepEqual(row.result.sourceSessionIds, [S.pubToday]);
  assert.ok(fetchBodies.every((body) => body.includes(MARK.PUB) && !body.includes(MARK.A) && !body.includes(MARK.B)));
  noMixedOwners();
});

// ---- 재사용 경계 ---------------------------------------------------------------------------------------------------------
test("재사용 경계 — 본인의 새 하교 세션이 추가되면 이전 등교 요약을 하루 전체 요약으로 재사용하지 않는다", async () => {
  removeSessions(S.aPm, S.bAm);
  await generateAs(A); // A 등교 요약 저장(v7)
  assert.equal(summaryRows().length, 1);
  assert.equal(analysisFor(await reportAs(A), D)?.summary, "AI-요약-문장", "하교 전에는 등교 요약이 그날의 요약이다");

  db.data.checkin_sessions.push(session(S.aPm, D, "afternoon", A, "06:00", MARK.A)); // A의 하교 세션이 새로 생김
  assert.deepEqual(await storedAs(A, D), { morning: "AI-요약-문장", full: null }, "통합(등교·하교) 슬롯은 비어 있다 — 등교 요약이 채우지 않는다");
  assert.equal(analysisFor(await reportAs(A), D), undefined, "챗봇은 통합 요약이 생기기 전까지 등교 요약을 하루 요약으로 쓰지 않는다(색만)");

  fetchBodies = [];
  summaryText = "통합-새요약";
  const out = await generateAs(A);
  assert.equal(fetchBodies.length, 1, "등교 요약은 재사용하고 통합 요약만 새로 만든다");
  assert.equal(out.morning.summary, "AI-요약-문장");
  assert.equal(out.full.summary, "통합-새요약");
  const full = summaryRows().find((r) => r.result.scope === "full");
  assert.deepEqual(full.result.sourceSessionIds, [S.aAm, S.aPm]);
  assert.equal(analysisFor(await reportAs(A), D)?.summary, "통합-새요약", "이제 챗봇의 하루 요약은 통합 요약");
  assert.equal(summaryRows().length, 2);
});

test("재사용 경계 — 프롬프트 버전만 다른 기존 등교·통합 요약은 그대로 재사용하고, 다시 만들지 않는다", async () => {
  const old = (id, source, scope, ids, text) => ({ id: uuid(id), analysis_type: "session_summary", source_type: "session", source_id: source, provider: "openai", prompt_version: "daily-summary-v3", status: "completed", created_at: "2026-09-19T00:00:00.000Z", result: okResult(ids, { summary: text, scope }) });
  removeSessions(S.bAm);
  db.data.analysis_runs.push(old(950, S.aAm, "morning", [S.aAm], "v3-등교"), old(951, S.aPm, "full", [S.aAm, S.aPm], "v3-통합"));
  const out = await generateAs(A);
  assert.equal(fetchBodies.length, 0, "프롬프트 버전이 달라도 유효한 최신 완료 요약이 있으면 AI를 부르지 않는다");
  assert.deepEqual([out.morning.summary, out.full.summary], ["v3-등교", "v3-통합"]);
  assert.equal(db.data.analysis_runs.filter((r) => r.provider === "openai").length, 2, "새 행이 생기지 않는다(자동 재생성 없음)");
  assert.equal(analysisFor(await reportAs(A), D)?.summary, "v3-통합");
});

// =====================================================================================================================
// 5) 요약이 없거나 저장소가 실패해도 — 챗봇은 색만으로 정상
test("요약이 없으면 챗봇 컨텍스트 원천(상담 리포트)은 색(세션)만 갖고 요약은 없다 — 원문은 챗봇이 쓰지 않는다", async () => {
  const report = await reportAs(A);
  assert.equal(analysisFor(report, D), undefined);
  const colors = report.sessions.filter((s) => s.date === D).map((s) => s.color);
  assert.deepEqual(colors, ["green", "green"], "A의 등교·하교 색은 그대로 나온다");
});

test("요약 조회가 DB 오류로 실패해도 리포트·상세는 죽지 않고 요약 없이 계속된다", async () => {
  await generateAs(A);
  db.failSelectOn("analysis_runs");
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const report = await reportAs(A);
    const detail = await storedAs(A, D);
    assert.equal(analysisFor(report, D), undefined);
    assert.deepEqual(detail, { morning: null, full: null });
    assert.equal(report.sessions.filter((s) => s.date === D).length, 2);
  } finally { console.warn = originalWarn; }
});

test("챗봇 컨텍스트 빌더는 대화 원문(turns·transcript)을 새로 쓰지 않는다(저장된 요약만)", () => {
  const source = readFileSync(here("../../../../components/teacher/agent/context.ts"), "utf8");
  assert.ok(!/\.turns\b|transcript/.test(source.replace(/\/\/.*$/gm, "")), "context.ts가 원문을 읽기 시작하면 이 테스트가 깨진다");
  assert.match(source, /report\.analyses/);
  assert.match(source, /getConsultationReport/);
});

test("상세 화면·상담 리포트·분석 생성은 모두 sessionSummaries.ts의 조회 함수를 쓴다(메모리 저장소 직접 조회 없음)", () => {
  const students = readFileSync(here("../teacherStudents.ts"), "utf8");
  const daily = readFileSync(here("../../interpretation/dailyAnalysis.ts"), "utf8");
  assert.match(students, /from "@\/lib\/supabase\/queries\/sessionSummaries"/);
  assert.match(daily, /from "@\/lib\/supabase\/queries\/sessionSummaries"/);
  assert.match(students, /loadSessionSummaries/);
  assert.match(daily, /loadSessionSummaries/);
});

// =====================================================================================================================
// 6) DEMO_MODE가 꺼진 정식 교사 흐름 — 회귀 없음
test("DEMO_MODE 꺼짐(정식 흐름): 스코프 없이 세션 id로만 읽고, 생성·저장·상세·리포트가 그대로 동작한다", async () => {
  delete process.env.DEMO_MODE;
  globalThis.__TEST_VIEWER__ = null;
  const D2 = "2026-09-15";
  db = freshDb([session(uuid(31), D2, "morning", null, "01:00", "정식-마커"), session(uuid(32), D2, "afternoon", null, "06:00", "정식-마커")]);
  globalThis.__TEST_DB__ = db;
  const input = await base.students.getDailyAnalysisInput(MOCK_DB_CLASS_ID, STUDENT.student_id, D2);
  const out = await base.daily.getOrCreateDayAnalyses(input);
  assert.ok(out.morning && out.full);
  const detail = await base.students.getStoredDayAnalyses(MOCK_DB_CLASS_ID, STUDENT.student_id, D2);
  assert.equal(detail.full, "AI-요약-문장");
  const report = await base.students.getConsultationReport(MOCK_DB_CLASS_ID, STUDENT.student_id, "2026-09-01", D);
  assert.equal(analysisFor(report, D2)?.summary, "AI-요약-문장");
  assert.equal(summaryRows().length, 2);
  // 스코프가 꺼져 있으면 방문자 세션도 필터하지 않는다(기존 동작): A의 요약도 읽힌다.
  const rowsAll = await loadSessionSummaries(db.client, [S.pubAm, S.pubPm], INACTIVE);
  assert.equal(rowsAll.length, 3);
});

// =====================================================================================================================
// 7) 요약 대상 결정(analysisTargets) — 방문자 본인 세션 우선, 소유자가 같은 세션끼리만
test("요약 대상: 등교만 있으면 morning만, 하교가 있으면 full도 — 대표는 묶음의 마지막 세션", async () => {
  const { resolveAnalysisTargets } = await makeJiti().import("../../interpretation/analysisTargets.ts");
  const am = { sessionId: "am", period: "morning", ownerId: A };
  const pm = { sessionId: "pm", period: "afternoon", ownerId: A };
  assert.deepEqual(resolveAnalysisTargets([am], A), { morning: { scope: "morning", sourceId: "am", sessionIds: ["am"] }, full: null });
  assert.deepEqual(resolveAnalysisTargets([am, pm], A), {
    morning: { scope: "morning", sourceId: "am", sessionIds: ["am"] },
    full: { scope: "full", sourceId: "pm", sessionIds: ["am", "pm"] },
  });
  assert.deepEqual(resolveAnalysisTargets([], A), { morning: null, full: null });
});

test("요약 대상: 현재 방문자 본인 세션을 먼저 고른다 — 공용 세션이 앞·뒤·사이에 있어도 본인 대상이 밀리지 않는다", async () => {
  const { resolveAnalysisTargets } = await makeJiti().import("../../interpretation/analysisTargets.ts");
  const pub = (id, period) => ({ sessionId: id, period, ownerId: null });
  const aAm = { sessionId: "aAm", period: "morning", ownerId: A };
  const aPm = { sessionId: "aPm", period: "afternoon", ownerId: A };
  for (const order of [[pub("p1", "morning"), aAm], [aAm, pub("p1", "morning")], [pub("p0", "morning"), aAm, pub("p1", "morning"), aPm, pub("p2", "afternoon")]]) {
    const targets = resolveAnalysisTargets(order, A);
    assert.deepEqual(targets.morning.sessionIds, ["aAm"]);
    assert.equal(targets.morning.sourceId, "aAm");
    if (order.includes(aPm)) assert.deepEqual(targets.full.sessionIds, ["aAm", "aPm"]);
    else assert.equal(targets.full, null, "A는 등교만 — 공용 하교 세션이 A의 통합 요약을 충족시키지 않는다");
  }
});

test("요약 대상: 본인 세션이 없거나 방문자를 모르면 마지막 세션과 소유자가 같은 것끼리 — 공용+방문자, A+B는 섞이지 않는다", async () => {
  const { resolveAnalysisTargets, sameOwnerAsLast } = await makeJiti().import("../../interpretation/analysisTargets.ts");
  const pubAm = { sessionId: "pubAm", period: "morning", ownerId: null };
  const aAm = { sessionId: "aAm", period: "morning", ownerId: A };
  const bPm = { sessionId: "bPm", period: "afternoon", ownerId: B };
  const mockAm = { sessionId: "mock-1", period: "morning" };
  assert.deepEqual(resolveAnalysisTargets([pubAm, aAm], null).morning.sessionIds, ["aAm"], "방문자를 모를 때: 마지막 세션의 소유 부류");
  assert.deepEqual(resolveAnalysisTargets([aAm, pubAm], null).morning.sessionIds, ["pubAm"]);
  assert.deepEqual(resolveAnalysisTargets([pubAm, aAm], B).morning.sessionIds, ["aAm"], "B에게 본인 세션이 없으면 마지막 세션 부류(B 스코프에서는 A 세션이 오지 않는다)");
  assert.deepEqual(resolveAnalysisTargets([aAm, bPm], A).full, null, "A는 등교만 — B의 하교와 묶이지 않는다");
  assert.deepEqual(resolveAnalysisTargets([aAm, bPm], null).full.sessionIds, ["bPm"]);
  assert.deepEqual(resolveAnalysisTargets([pubAm, mockAm]).morning.sessionIds, ["pubAm", "mock-1"], "목업(소유자 없음)과 공용(null)은 같은 부류(정식 흐름)");
  assert.deepEqual(sameOwnerAsLast([]), []);
});
