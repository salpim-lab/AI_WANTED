// 담당: 이지현 (공개 데모 방문자 격리 — AI 하루 분석의 "무엇을 한 요약으로 묶는가" 단일 출처)
// 순수 함수만 둔다(DB·서버 의존 없음) — 분석을 만드는 쪽(dailyAnalysis.ts)과 저장된 요약을 화면에 미리 읽어 오는 쪽
// (teacherStudents.getStoredDayAnalyses)이 같은 규칙으로 "어느 세션에 붙은 요약을 찾을지"를 정하게 한다.
//
// 규칙 1: DEMO_MODE에서는 현재 방문자 본인의 세션을 **먼저** 고르고, 그 안에서 morning/full 대상을 정한다. 같은 날 더 늦은 공용 세션이 있어도
// 본인의 요약 대상이 공용 세션에 밀려 누락되지 않는다. 공용 세션의 요약은 별도로 조회하고(개인 요약이 "이미 있는 것"으로 대신 취급하지 않는다),
// 본인 세션이 하나도 없을 때만 공용 세션끼리 묶는다.
// 규칙 2: 한 요약의 입력 세션은 소유자(ownerId)가 전부 같아야 한다. 공용 시드 세션과 방문자 세션, 또는 서로 다른 방문자의 세션을
// 한 요약에 절대 섞지 않는다 — 섞으면 방문자의 발화로 만든 요약이 공용 세션에 붙어 다른 방문자에게 보일 수 있다.
// (DB 가드 트리거 analysis_runs_session_summary_insert_guard가 같은 규칙을 저장 시점에 한 번 더 검사한다.)
//
// 하루의 세션은 시작 시각 오름차순으로 온다고 가정한다(loadRealSessions가 started_at 순으로 읽는다). "마지막 세션"이 대표(source)다.

export type SummaryScope = "morning" | "full";

export type TargetSession = { sessionId: string; period: "morning" | "afternoon"; ownerId?: string | null };

export type AnalysisTarget = {
  scope: SummaryScope;
  /** 요약을 붙일 대표 세션 = 입력 세션 중 마지막 세션 (analysis_runs.source_id) */
  sourceId: string;
  /** 요약 입력이 되는 세션 전부(대표 포함, 소유자 동일) — result.sourceSessionIds로 저장된다 */
  sessionIds: string[];
};

const ownerOf = (session: { ownerId?: string | null }) => session.ownerId ?? null;

/** 마지막 세션과 소유자가 같은 세션만 남긴다(순서 유지). 공용(null)과 방문자, 서로 다른 방문자는 섞이지 않는다. */
export function sameOwnerAsLast<T extends { ownerId?: string | null }>(sessions: T[]): T[] {
  const last = sessions[sessions.length - 1];
  if (!last) return [];
  const owner = ownerOf(last);
  return sessions.filter((s) => ownerOf(s) === owner);
}

const targetOf = (group: TargetSession[], scope: SummaryScope): AnalysisTarget | null => {
  const source = group[group.length - 1];
  return source ? { scope, sourceId: source.sessionId, sessionIds: group.map((s) => s.sessionId) } : null;
};

/**
 * 이 요청에서 요약을 다룰 "한 부류"의 세션.
 *  - viewerId가 있고(DEMO_MODE의 현재 방문자) 본인 세션이 있으면 → 본인 세션만(공용 세션이 더 늦어도 본인 것이 우선)
 *  - 아니면 마지막 세션과 소유자가 같은 것끼리(방문자 없음·본인 세션 없음·정식 로그인 흐름 — 공용 또는 소유자 없는 세션)
 */
export function selectSessionGroup<T extends { ownerId?: string | null }>(sessions: T[], viewerId?: string | null): T[] {
  if (viewerId) {
    const own = sessions.filter((s) => ownerOf(s) === viewerId);
    if (own.length > 0) return own;
  }
  return sameOwnerAsLast(sessions);
}

/**
 * 그날 세션에서 만들 수 있는 요약 대상 두 가지 — 위 selectSessionGroup으로 고른 한 부류 안에서만.
 *  - morning: 그 부류의 등교 세션만으로 만드는 "등교 기준" 요약
 *  - full: 그 부류의 등교·하교를 합친 "등교·하교 기준" 요약 (그 부류에 하교 세션이 있을 때만)
 */
export function resolveAnalysisTargets(
  sessions: TargetSession[],
  viewerId?: string | null,
): { morning: AnalysisTarget | null; full: AnalysisTarget | null } {
  const group = selectSessionGroup(sessions, viewerId);
  return {
    morning: targetOf(group.filter((s) => s.period === "morning"), "morning"),
    full: group.some((s) => s.period === "afternoon") ? targetOf(group, "full") : null,
  };
}
