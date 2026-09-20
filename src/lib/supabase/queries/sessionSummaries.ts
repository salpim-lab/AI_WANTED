// 담당: 이지현 (공개 데모 방문자 격리 — AI 하루 분석 요약(analysis_runs, analysis_type='session_summary')의 저장·조회 단일 출처)
//
// 왜 이 파일이 있나: 요약을 서버 메모리에만 두면 Vercel처럼 인스턴스가 바뀌는 환경에서 "상세 화면엔 보이는데 챗봇은 모르는" 일이 생긴다.
// 상세 화면(AiAnalysisBox의 저장 요약 미리 읽기·/api/ai/daily-analysis)과 상담 리포트·협진 챗봇(getConsultationReport)이
// **전부 이 파일의 loadSessionSummaries로 읽고 insertSessionSummary로 쓴다.** 챗봇에는 대화 원문(transcript)을 넣지 않고 여기서 읽은 요약만 간다.
//
// 격리 규칙
//  - 요약은 반드시 원본 checkin_session.id(analysis_runs.source_id)에 연결된다. enrollment_id+날짜만으로 찾지 않는다(방문자 전원이 같은 학생을 공유).
//  - 소유자는 요약 행에 쓰지 않는다(demo_owner_id는 NULL). 부모 세션의 demo_owner_id에서 그때그때 파생한다 — 클라이언트가 넘긴 값은 받지도 믿지도 않는다.
//  - 읽을 때 result.sourceSessionIds에 적힌 세션 **전부**가 현재 스코프(공용 + 현재 방문자)에서 보이고, 전부 같은 소유 부류일 때만 돌려준다.
//    (한 세션이라도 안 보이거나 소유자가 섞였으면 그 요약은 없는 것으로 친다 — 안전한 쪽으로 실패.)
//  - 기존 시드 요약(provider='mock', sourceSessionIds 없음, 공용 세션)은 호환 경로로 읽는다: 대표 세션만 입력으로 보고, 공용일 때만 허용한다.
//  - 프롬프트 버전이 달라도 유효한 최신 완료 요약이 있으면 재사용한다(자동 재생성 없음).
// 서버 전용 — service_role 클라이언트가 RLS를 우회하므로 이 스코프 검사가 앱 쪽 방어선이다.

import "server-only";

import { ownerVisible, type DemoScope } from "@/lib/demo/scope";
import type { createAdminClient } from "@/lib/supabase/admin";
import { selectSessionGroup, type SummaryScope, type TargetSession } from "@/lib/supabase/interpretation/analysisTargets";

export type SummaryDb = Pick<ReturnType<typeof createAdminClient>, "from">;

export const SESSION_SUMMARY_TYPE = "session_summary";
/** IN 조건 한 번에 넘기는 id 수 — URL 길이 한도를 넘지 않게 */
const BATCH = 100;
const MAX_SOURCE_SESSIONS = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 기존 시드 요약(공유 DB 1,065건)의 "읽기" 호환 조건 — 정확히 이 버전의 mock 행만. 신규 INSERT에는 이런 예외가 없다(1095 가드는 mock도 엄격 검증).
 * 다른 mock 버전이나 다른 provider가 sourceSessionIds 없이 저장돼 있어도 호환 경로로 읽지 않는다.
 */
export const SEED_PROMPT_VERSION = "mock-seed-2026-09";

/** 목업 세션 id("mock-…")는 DB에 저장할 수 없다(source_id는 uuid) — 그런 세션은 기존 메모리 경로를 그대로 쓴다. */
export const isRealSessionId = (id: string) => UUID_RE.test(id);

export type StoredSessionSummary = {
  id: string;
  /** 요약을 붙인 대표 세션 */
  sourceId: string;
  scope: SummaryScope;
  /** scope가 저장된 값이 아니라 대표 세션의 시간대로 유추한 값(옛 시드 형식) — 같은 세션에 명시 scope 행이 있으면 그쪽이 우선한다 */
  scopeDerived: boolean;
  summary: string;
  stateEstimate: string | null;
  provider: string;
  promptVersion: string;
  createdAt: string;
  sourceSessionIds: string[];
};

type RawRun = { id: string; source_id: string; provider: string; prompt_version: string; created_at: string; result: unknown };
export type SessionMeta = { id: string; demo_owner_id: string | null; enrollment_id: string; session_date: string; period: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const chunk = <T,>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

/**
 * 저장된 행 하나가 이 스코프에서 유효한 요약인지 판정한다(순수 함수 — 단위 테스트 대상).
 * 유효하지 않으면 null. 엄격 검증 대상: 앱이 만든 행(provider≠mock) 또는 sourceSessionIds가 있는 행. 호환 대상: mock + sourceSessionIds 없음.
 */
export function validateStoredSummary(row: RawRun, sessions: Map<string, SessionMeta>, scope: DemoScope): StoredSessionSummary | null {
  const result = isObject(row.result) ? row.result : null;
  if (!result) return null;
  const summary = typeof result.summary === "string" ? result.summary.trim() : "";
  if (!summary) return null;

  const source = sessions.get(row.source_id);
  if (!source) return null; // 대표 세션이 실제로 없다

  const rawIds = result.sourceSessionIds;
  const legacySeed = rawIds === undefined;
  let refs: string[];
  if (legacySeed) {
    // 읽기 호환은 확인된 시드 버전의 mock 행만. 그 밖의 행은 sourceSessionIds가 필수(엄격 검증).
    if (row.provider !== "mock" || row.prompt_version !== SEED_PROMPT_VERSION) return null;
    refs = [row.source_id];
  } else {
    if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > MAX_SOURCE_SESSIONS) return null;
    if (rawIds.some((id) => typeof id !== "string" || !UUID_RE.test(id))) return null;
    refs = [...new Set(rawIds as string[])];
    if (!refs.includes(row.source_id)) return null; // 대표 세션이 입력에 없다
  }

  const metas = refs.map((id) => sessions.get(id));
  if (metas.some((meta) => !meta)) return null; // 실제로 없는 세션이 섞여 있다
  const found = metas as SessionMeta[];

  const owners = new Set(found.map((meta) => meta.demo_owner_id ?? null));
  if (owners.size !== 1) return null; // 공용+방문자 또는 A+B 혼합
  const owner = [...owners][0];
  if (legacySeed && owner !== null) return null; // 호환 경로는 공용 세션에만
  if (new Set(found.map((meta) => meta.enrollment_id)).size !== 1 || new Set(found.map((meta) => meta.session_date)).size !== 1) return null;
  if (!ownerVisible(scope, owner)) return null; // 현재 스코프에서 안 보이는 세션의 요약

  let summaryScope: SummaryScope;
  let scopeDerived = false;
  if (result.scope === "morning" || result.scope === "full") summaryScope = result.scope;
  else if (legacySeed) {
    summaryScope = source.period === "afternoon" ? "full" : "morning";
    scopeDerived = true;
  } else return null;

  return {
    id: row.id,
    sourceId: row.source_id,
    scope: summaryScope,
    scopeDerived,
    summary,
    stateEstimate: typeof result.stateEstimate === "string" && result.stateEstimate.trim() ? result.stateEstimate : null,
    provider: row.provider,
    promptVersion: row.prompt_version,
    createdAt: row.created_at,
    sourceSessionIds: refs,
  };
}

/** 가장 최근 것이 앞으로 — 같은 시각이면 명시 scope 행이 유추 scope 행보다 앞 */
const newestFirst = (a: StoredSessionSummary, b: StoredSessionSummary) =>
  Number(a.scopeDerived) - Number(b.scopeDerived) || b.createdAt.localeCompare(a.createdAt);

/**
 * 세션 id들의 저장된 요약을 한 번에(배치로) 읽는다. 현재 스코프에서 유효한 요약만, 최신순으로.
 * 목업 id는 무시한다. DB 오류는 던진다(호출부가 "요약 없음"으로 낮출지 정한다).
 */
export async function loadSessionSummaries(client: SummaryDb, sessionIds: string[], scope: DemoScope): Promise<StoredSessionSummary[]> {
  const ids = [...new Set(sessionIds.filter(isRealSessionId))];
  if (ids.length === 0) return [];

  const runs: RawRun[] = [];
  for (const part of chunk(ids, BATCH)) {
    const { data, error } = await client
      .from("analysis_runs")
      .select("id, source_id, provider, prompt_version, created_at, result")
      .eq("analysis_type", SESSION_SUMMARY_TYPE)
      .eq("source_type", "session")
      .eq("status", "completed")
      .in("source_id", part)
      .order("created_at", { ascending: false });
    if (error) throw error;
    runs.push(...((data ?? []) as RawRun[]));
  }
  if (runs.length === 0) return [];

  // 대표 세션 + 입력 세션 전부의 소유 정보를 한 번에 읽는다 — 이 소유 정보가 스코프 판정의 근거다.
  const refIds = new Set<string>();
  for (const run of runs) {
    refIds.add(run.source_id);
    const listed = isObject(run.result) ? run.result.sourceSessionIds : undefined;
    if (Array.isArray(listed)) for (const id of listed.slice(0, MAX_SOURCE_SESSIONS + 1)) if (typeof id === "string" && isRealSessionId(id)) refIds.add(id);
  }
  const metas = new Map<string, SessionMeta>();
  for (const part of chunk([...refIds], BATCH)) {
    const { data, error } = await client
      .from("checkin_sessions")
      .select("id, demo_owner_id, enrollment_id, session_date, period")
      .in("id", part);
    if (error) throw error;
    for (const meta of (data ?? []) as SessionMeta[]) metas.set(meta.id, meta);
  }

  return runs.flatMap((run) => {
    const valid = validateStoredSummary(run, metas, scope);
    return valid ? [valid] : [];
  }).sort(newestFirst);
}

/** 대표 세션과 범위(morning|full)에 맞는 최신 유효 요약. 프롬프트 버전은 따지지 않는다(재생성 없음). */
export function pickSummary(rows: StoredSessionSummary[], sourceId: string, scope: SummaryScope): StoredSessionSummary | null {
  return rows.filter((r) => r.sourceId === sourceId && r.scope === scope).sort(newestFirst)[0] ?? null;
}

/**
 * 하루(세션 목록)의 대표 요약 하나 — 상담 리포트·협진 챗봇용. 시작 시각 오름차순 세션을 받는다.
 *  - 현재 방문자 본인의 세션이 있으면 그 세션들의 요약만 본다(더 늦은 공용 세션의 요약이 본인 요약을 밀어내지 않고, 공용 요약이 본인 요약을
 *    대신하지도 않는다 — 본인 요약이 없으면 없는 것). 본인 세션이 없으면 공용 세션끼리(selectSessionGroup).
 *  - 그 부류의 마지막 세션에 붙은 요약을 우선, 그다음 명시 scope·최신순.
 *  - 그 부류에 하교 세션이 있으면(requireFullWhenAfternoon, 기본) "등교 기준" 요약은 하루 요약으로 쓰지 않는다 — 하교가 생긴 뒤에는
 *    통합(full) 요약이 만들어지기 전까지 요약 없음(챗봇은 색만). 등교 요약을 하루 전체 요약처럼 재사용하지 않기 위해서다.
 */
export function pickDayAnalysis(
  rows: StoredSessionSummary[],
  sessions: TargetSession[],
  viewerId?: string | null,
  { requireFullWhenAfternoon = true }: { requireFullWhenAfternoon?: boolean } = {},
): StoredSessionSummary | null {
  const group = selectSessionGroup(sessions, viewerId);
  const ids = group.map((s) => s.sessionId);
  const last = ids[ids.length - 1];
  const needsFull = requireFullWhenAfternoon && group.some((s) => s.period === "afternoon");
  return (
    rows
      .filter((r) => ids.includes(r.sourceId) && (!needsFull || r.scope === "full"))
      .sort((a, b) => Number(b.sourceId === last) - Number(a.sourceId === last) || newestFirst(a, b))[0] ?? null
  );
}

export type NewSessionSummary = {
  /** 대표 세션 = 입력 세션 중 마지막 */
  sourceId: string;
  /** 입력 세션 전부(소유자 동일, 대표 포함) — 서버가 방금 스코프 안에서 읽은 세션이어야 한다. 클라이언트 값이 아니다 */
  sessionIds: string[];
  scope: SummaryScope;
  provider: string;
  model: string | null;
  promptVersion: string;
  /** summary·stateEstimate·keywords 등. scope·sourceSessionIds는 여기서 덮어쓴다 */
  result: Record<string, unknown>;
};

type PgError = { code?: string; message?: string } | null;

/**
 * AI 성공 뒤에만 부른다. 완료 요약을 INSERT하고, 같은 (세션, 버전, scope)를 다른 요청이 먼저 저장했으면(유니크 위반 23505)
 * 이긴 쪽 행을 다시 읽어 돌려준다 — 중복 행이 생기지 않고 기존 요약도 건드리지 않는다. UPDATE·DELETE는 하지 않는다.
 * demo_owner_id는 넣지 않는다(부모 세션에서 파생, DB 가드도 직접 기입을 거부한다).
 */
export async function insertSessionSummary(
  client: SummaryDb,
  scope: DemoScope,
  input: NewSessionSummary,
): Promise<{ summary: StoredSessionSummary; created: boolean }> {
  const result: Record<string, unknown> = { ...input.result, scope: input.scope, sourceSessionIds: input.sessionIds };
  const summaryText = typeof result.summary === "string" ? result.summary.trim() : "";
  if (!summaryText) throw new Error("저장할 요약이 비어 있습니다.");

  const { data, error } = (await client
    .from("analysis_runs")
    .insert({
      analysis_type: SESSION_SUMMARY_TYPE,
      source_type: "session",
      source_id: input.sourceId,
      provider: input.provider,
      model: input.model,
      prompt_version: input.promptVersion,
      schema_version: 1,
      category_tags: [],
      moderation_flag: false,
      needs_followup: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: result as any,
      status: "completed",
      error_message: null,
    })
    .select("id, created_at")
    .single()) as { data: { id: string; created_at: string } | null; error: PgError };

  if (!error && data) {
    return {
      created: true,
      summary: {
        id: data.id,
        sourceId: input.sourceId,
        scope: input.scope,
        scopeDerived: false,
        summary: summaryText,
        stateEstimate: typeof result.stateEstimate === "string" && result.stateEstimate.trim() ? result.stateEstimate : null,
        provider: input.provider,
        promptVersion: input.promptVersion,
        createdAt: data.created_at,
        sourceSessionIds: input.sessionIds,
      },
    };
  }

  if (error?.code === "23505") {
    const winner = pickSummary(await loadSessionSummaries(client, [input.sourceId], scope), input.sourceId, input.scope);
    if (winner) return { summary: winner, created: false };
  }
  throw new Error(`분석 요약을 저장하지 못했습니다: ${error?.message ?? "알 수 없는 오류"}`);
}
