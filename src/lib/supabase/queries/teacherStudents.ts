// 담당: 김현우 (단독 소유)
// 자리 배치도 · 아이 상세 · 상담 자료 리포트용 읽기 전용 쿼리. 쓰기 함수를 추가하지 말 것.
// 다른 담당자 테이블은 여기서 읽기만 한다 — checkin_sessions/conversation_messages(이유민), analysis_runs(이지현).
// 서버 전용 — Server Component / Server Action에서만 import한다 ("use client" 파일에서 import 금지).
// 모든 함수가 classId를 받는다: 서버는 service_role로 RLS를 우회하므로 담당 학급 범위를 코드에서 직접 건다.
//
// 지금은 mock 구현(raw/_mockTeacherData.ts)이다. Supabase 연결 시 함수 본문만 교체하고 시그니처는 유지한다.
// 예외 — 등하교 세션(색·대화 전문·발화 측정값)은 이미 실제 DB를 먼저 읽는다 (2026-09-19):
//   학생 화면이 checkin_sessions에 실제로 쓰고 있어서, 그 아이·그 날짜에 실제 세션이 있으면 실제를, 없으면 mock을 쓴다.
//   mock 명단 ↔ 시드 학급은 성 뺀 이름으로 잇는다(MOCK_DB_CLASS_ID). TEACHER_REAL_CHECKINS=off면 mock만 쓴다.
//   학생·자리   v_students_current (UI는 student_id, enrollment_id 변환은 이 파일 안에서만)
//   세션·대화   checkin_sessions(enrollment_id, session_date) ⨝ conversation_messages order by sequence
//   AI 분석     analysis_runs where analysis_type='session_summary' and source_type='session' and status='completed'

import { addDays } from "@/components/shared/datetime";
import { givenName } from "@/components/shared/names";
import { createAdminClient } from "@/lib/supabase/admin";
// 대시보드(진승혜) mock 스냅샷 — 상담 리포트의 어휘·관계 인사이트용 읽기 전용 참조.
// mock 단계 한정 크로스 참조다: 대시보드가 실제 쿼리(lib/supabase/queries/relationshipMap.ts 등)로
// 바뀌면 buildInsights()도 그쪽을 부르도록 바꾸고, 이 import는 없앤다.
import {
  DEFAULT_RELATION_PERIOD,
  dashboardToday,
  getDashboardSnapshot,
} from "@/components/teacher/dashboard/mockData";
import { listObservationLogsForStudent } from "@/lib/supabase/raw/observationLog";
import {
  MOCK_DB_CLASS_ID,
  MOCK_STUDENTS,
  mockAnalysisRuns,
  mockBriefingBadge,
  mockCheckinsFor,
  mockCommentDraft,
  mockFixtureDayAi,
  isLiveInMockScope,
  usesMockFixture,
  type FixtureDayAi,
  mockSeatLayouts,
  mockStudentIdFromNumber,
  type MockStudentRow,
} from "@/lib/supabase/raw/_mockTeacherData";
import type { SignalColor } from "@/lib/types/signal";
import type {
  AnalysisInputSession,
  ClassStudent,
  ColorHistoryDay,
  ConsultationReport,
  DailyAnalysisInput,
  DaySession,
  EvidenceRef,
  RelationInsight,
  SeatingStudent,
  StoredSessionProsody,
  VocabInsight,
} from "@/lib/types/teacherRecord";

/** 상담 리포트 기본 기간(교사가 시작~끝 날짜를 직접 고르지 않았을 때). 상담 기록 저장 시 evidence_refs도 이 기간으로 만든다 */
export const REPORT_DEFAULT_DAYS = 30;

function classRows(classId: string): MockStudentRow[] {
  // 교사가 자리 바꾸기로 저장한 자리가 있으면 그 자리를 쓴다 (Supabase 연결 시 v_students_current가 바로 최신 자리를 준다)
  const savedSeats = mockSeatLayouts()[classId]?.seats ?? {};
  return MOCK_STUDENTS.filter((s) => s.class_id === classId && s.status === "active")
    .map((s) => ({ ...s, ...savedSeats[s.enrollment_id] }))
    .sort(
    (a, b) => a.seat_row - b.seat_row || a.seat_col - b.seat_col,
  );
}

function findRow(classId: string, studentId: string): MockStudentRow | null {
  // 대시보드(진승혜) mock이 아직 1..N 번호를 studentId로 넘긴다 — mock 단계 한정 브리지.
  const id = /^\d+$/.test(studentId) ? mockStudentIdFromNumber(Number(studentId)) : studentId;
  return classRows(classId).find((s) => s.student_id === id) ?? null;
}

function toClassStudent(row: MockStudentRow): ClassStudent {
  return { studentId: row.student_id, name: row.display_name, seatRow: row.seat_row, seatCol: row.seat_col };
}

/** mock 등하교 세션 (실제 세션이 없는 날) */
function mockDaySessions(enrollmentId: string, date: string): AnalysisInputSession[] {
  const { sessions, messages } = mockCheckinsFor(enrollmentId, date);
  return sessions
    .map((s) => ({
      sessionId: s.id,
      period: s.period,
      attempt: s.attempt,
      color: s.mood_color,
      status: s.status,
      startedAt: s.started_at,
      turns: messages
        .filter((m) => m.session_id === s.id)
        .sort((a, b) => a.sequence - b.sequence)
        .map((m) => ({ messageId: m.id, speaker: m.speaker, content: m.content })),
      prosody: s.prosody,
    }))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

// ── 실제 등하교 세션 (Supabase checkin_sessions — 학생 화면이 쓴다, 여기서는 읽기만) ──────────────

/** 발화 측정값 기준선을 잡을 때 거슬러 보는 일수 */
const BASELINE_WINDOW_DAYS = 28;
const SIGNAL_SET = new Set<string>(["green", "yellow", "red", "navy"]);
const SPEAKERS = new Set<string>(["student", "assistant", "system"]);
const STATUSES = new Set<string>(["started", "completed", "stopped"]);

type RealRow = {
  id: string;
  enrollment_id: string;
  session_date: string;
  period: string;
  attempt: number;
  mood_color: string;
  status: string;
  started_at: string;
  transcript: unknown;
  prosody: unknown;
};

type RawUtterance = {
  duration_sec: number;
  response_delay_sec: number;
  silence_count: number;
  silence_total_sec: number;
  syllables_per_sec?: number;
  loudness_raw?: number;
};

const realCheckinsEnabled = () =>
  process.env.TEACHER_REAL_CHECKINS !== "off" &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

function rawUtterances(prosody: unknown): RawUtterance[] {
  const list = (prosody as { utterances?: unknown } | null)?.utterances;
  return Array.isArray(list) ? (list.filter((u) => u && typeof u === "object") as RawUtterance[]) : [];
}

/** 대화 전문(jsonb) → 화면용 대화 줄. 아직 저장 전(진행 중·중단)이면 빈 배열 */
function transcriptTurns(sessionId: string, transcript: unknown): DaySession["turns"] {
  if (!Array.isArray(transcript)) return [];
  const turns: DaySession["turns"] = [];
  transcript.forEach((m, i) => {
    const msg = m as { speaker?: unknown; content?: unknown };
    if (!SPEAKERS.has(String(msg.speaker)) || typeof msg.content !== "string") return;
    turns.push({
      messageId: `${sessionId}-t${i + 1}`,
      speaker: msg.speaker as DaySession["turns"][number]["speaker"],
      content: msg.content,
    });
  });
  return turns;
}

/**
 * 저장된 측정값(절대 음량 loudness_raw, baseline_days 0)을 교사 화면 해석용으로 바꾼다.
 * 학생 화면은 기준선을 모르므로(api/checkins/prosody) 여기서 그 아이의 이전 세션들로 채운다:
 *   기준선 일수 = 이전 28일 중 측정값이 있는 날 수, 음량은 그 평균 대비(-1~1).
 */
function interpretProsody(row: RealRow, history: RealRow[]): StoredSessionProsody | null {
  const utterances = rawUtterances(row.prosody);
  if (utterances.length === 0) return null;
  const windowStart = addDays(row.session_date, -BASELINE_WINDOW_DAYS);
  const past = history.filter(
    (h) =>
      h.enrollment_id === row.enrollment_id &&
      h.session_date < row.session_date &&
      h.session_date >= windowStart &&
      rawUtterances(h.prosody).length > 0,
  );
  const pastLoudness = past
    .flatMap((h) => rawUtterances(h.prosody).map((u) => u.loudness_raw ?? NaN))
    .filter(Number.isFinite);
  const mean = pastLoudness.length ? pastLoudness.reduce((sum, v) => sum + v, 0) / pastLoudness.length : 0;
  return {
    baseline_days: new Set(past.map((h) => h.session_date)).size,
    utterances: utterances.map((u, i) => ({
      index: i,
      duration_sec: u.duration_sec,
      response_delay_sec: u.response_delay_sec,
      silence_count: u.silence_count,
      silence_total_sec: u.silence_total_sec,
      ...(u.syllables_per_sec === undefined ? {} : { syllables_per_sec: u.syllables_per_sec }),
      ...(mean > 0 && Number.isFinite(u.loudness_raw)
        ? { loudness_rel: Math.max(-1, Math.min(1, +(((u.loudness_raw as number) - mean) / mean).toFixed(2))) }
        : {}),
    })),
  };
}

let warnedRealCheckins = false;

/**
 * rows × [from, to]의 실제 세션을 한 번에 읽는다. 키: `${mock enrollment_id}|${날짜}`.
 * 담당 학급 확인은 호출하는 쪽(findRow/classRows가 classId로 거른 행만 넘긴다)에서 끝난 상태다.
 * DB에 못 붙으면 빈 결과 — 화면은 mock으로 계속 간다.
 */
async function loadRealSessions(
  rows: MockStudentRow[],
  from: string,
  to: string,
): Promise<Map<string, AnalysisInputSession[]>> {
  const result = new Map<string, AnalysisInputSession[]>();
  if (!realCheckinsEnabled() || rows.length === 0) return result;
  try {
    const client = createAdminClient();
    const { data: enrollments, error: enrollmentError } = await client
      .from("enrollments")
      .select("id, students(display_name)")
      .eq("class_id", MOCK_DB_CLASS_ID)
      .is("ended_on", null);
    if (enrollmentError) throw enrollmentError;

    const dbIdByName = new Map<string, string>();
    for (const e of enrollments ?? []) {
      const name = (e.students as { display_name?: string } | null)?.display_name;
      if (name) dbIdByName.set(name, e.id);
    }
    const rowByDbId = new Map<string, MockStudentRow>();
    for (const row of rows) {
      // DB 이름이 성 포함("김민준")이든 성 뺀 이름("민준", 시드)이든 잇는다
      const dbId = dbIdByName.get(row.display_name) ?? dbIdByName.get(givenName(row.display_name));
      if (dbId) rowByDbId.set(dbId, row);
    }
    if (rowByDbId.size === 0) return result;

    const { data, error } = await client
      .from("checkin_sessions")
      .select("id, enrollment_id, session_date, period, attempt, mood_color, status, started_at, transcript, prosody")
      .in("enrollment_id", [...rowByDbId.keys()])
      .gte("session_date", addDays(from, -BASELINE_WINDOW_DAYS))
      .lte("session_date", to)
      .order("started_at");
    if (error) throw error;

    const history = (data ?? []) as RealRow[];
    for (const r of history) {
      if (r.session_date < from) continue; // 기준선 계산용으로만 읽은 날
      if (!SIGNAL_SET.has(r.mood_color) || (r.period !== "morning" && r.period !== "afternoon")) continue;
      const row = rowByDbId.get(r.enrollment_id);
      if (!row) continue;
      const key = `${row.enrollment_id}|${r.session_date}`;
      const list = result.get(key) ?? [];
      // 색만 고르고 대화를 마치지 않은 회차(started)는 교사 화면에 보여주지 않는다 — 진행 중이거나 중간에 나간 것이라
      // "그 시간대 기록"으로 읽히면 안 된다. 그래도 그날 실제 세션이 있었으니 키는 남겨 mock으로 채우지 않는다.
      if (r.status === "started") {
        result.set(key, list);
        continue;
      }
      list.push({
        sessionId: r.id,
        period: r.period,
        attempt: r.attempt,
        color: r.mood_color as SignalColor,
        status: (STATUSES.has(r.status) ? r.status : "started") as DaySession["status"],
        startedAt: r.started_at,
        turns: transcriptTurns(r.id, r.transcript),
        prosody: interpretProsody(r, history),
      });
      result.set(key, list);
    }
  } catch (error) {
    if (!warnedRealCheckins) {
      warnedRealCheckins = true;
      console.warn(
        "[teacherStudents] 실제 체크인 세션을 읽지 못해 mock으로 보여줍니다:",
        error instanceof Error ? error.message : error,
      );
    }
  }
  return result;
}

type SessionSource = (row: MockStudentRow, date: string) => AnalysisInputSession[];

/**
 * rows × [from, to] 세션 — 그 아이·그 날짜에 실제 세션이 하나라도 있으면 실제만, 없으면 mock (두 출처를 섞지 않는다).
 * 단 목업 범위(김현우 화면)에서는: 실제로 쓰는 아이(김민준)는 실제 기록만, 나머지 아이는 목업이 있는 날짜면 목업이 먼저다
 * (테스트로 쌓인 실제 기록이 목업 이야기를 덮지 않게).
 */
async function loadSessions(rows: MockStudentRow[], from: string, to: string): Promise<SessionSource> {
  const real = await loadRealSessions(rows, from, to);
  return (row, date) => {
    const key = `${row.enrollment_id}|${date}`;
    // 실제로 쓰는 아이(김민준)는 목업 범위에서 실제 체크인만 — 없는 날은 빈 날이다
    if (isLiveInMockScope(row.enrollment_id)) return real.get(key) ?? [];
    if (usesMockFixture(row.enrollment_id, date)) return mockDaySessions(row.enrollment_id, date);
    return real.get(key) ?? mockDaySessions(row.enrollment_id, date);
  };
}

/** 같은 날 같은 시간대에 재시도(attempt)가 있으면 마지막 시도의 색을 대표값으로 쓴다 */
function latestColor(sessions: DaySession[], period: DaySession["period"]): SignalColor | null {
  const matched = sessions.filter((s) => s.period === period).sort((a, b) => b.attempt - a.attempt);
  return matched[0]?.color ?? null;
}

function dateRange(to: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(to, i - (days - 1)));
}

/** from~to 사이 날짜를 하루씩 나열(둘 다 포함, 오래된 날 → 최근 날 순). from > to면 빈 배열 */
function dateRangeBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export async function listClassStudents(classId: string): Promise<ClassStudent[]> {
  return classRows(classId).map(toClassStudent);
}

export async function findClassStudent(classId: string, studentId: string): Promise<ClassStudent | null> {
  const row = findRow(classId, studentId);
  return row ? toClassStudent(row) : null;
}

export async function getSeatingChart(classId: string, date: string): Promise<SeatingStudent[]> {
  const rows = classRows(classId);
  const sessionsOf = await loadSessions(rows, date, date);
  return rows.map((row) => {
    const sessions = sessionsOf(row, date);
    return {
      ...toClassStudent(row),
      todayMorning: latestColor(sessions, "morning"),
      todayAfternoon: latestColor(sessions, "afternoon"),
      badge: mockBriefingBadge(row.enrollment_id),
    };
  });
}

export async function getStudentDaySessions(classId: string, studentId: string, date: string): Promise<DaySession[]> {
  const row = findRow(classId, studentId);
  if (!row) return [];
  return (await loadSessions([row], date, date))(row, date);
}

/**
 * AI 하루 분석(/api/ai/daily-analysis)의 입력 — 그날 세션별 색·대화 전문·발화 측정값 + 이름 치환용 학급 명단.
 * 실제 세션(checkin_sessions의 mood_color·transcript(1060)·prosody(1080))이 있으면 그걸, 없으면 mock.
 * prosody가 없으면 null — 분석은 그 경우 전문과 색만 쓴다.
 * 담당 학급 밖 학생이면 null.
 */
export async function getDailyAnalysisInput(
  classId: string,
  studentId: string,
  date: string,
): Promise<DailyAnalysisInput | null> {
  const row = findRow(classId, studentId);
  if (!row) return null;
  const sessionsOf = await loadSessions([row], addDays(date, -ANALYSIS_PAST_DAYS), date);
  const pastDays = dateRange(addDays(date, -1), ANALYSIS_PAST_DAYS).map((day) => {
    const sessions = sessionsOf(row, day);
    return {
      date: day,
      morning: latestColor(sessions, "morning"),
      afternoon: latestColor(sessions, "afternoon"),
      stateEstimate: latestStateEstimate(sessions.map((s) => s.sessionId)),
    };
  });
  return {
    student: toClassStudent(row),
    classmates: classRows(classId).map(toClassStudent),
    date,
    sessions: sessionsOf(row, date),
    pastDays,
  };
}

/** AI 하루 분석이 과거 흐름으로 함께 보는 일수 */
const ANALYSIS_PAST_DAYS = 7;

/**
 * 그날 세션들에 대해 이미 만든 AI 분석 중 가장 최근 것의 추정 상태.
 * Supabase 연결 시: analysis_runs where source_type='session' and source_id in (...) and status='completed'
 *   order by created_at desc limit 1 → result->>'stateEstimate'
 */
function latestStateEstimate(sessionIds: string[]): string | null {
  // 하루의 마지막 세션(하교)까지 본 분석을 우선 — 등교만 본 분석은 그게 없을 때만
  const coversLast = (sourceId: string) => sessionIds.indexOf(sourceId) === sessionIds.length - 1;
  const run = mockAnalysisRuns()
    .filter((r) => r.status === "completed" && sessionIds.includes(r.source_id))
    .sort(
      (a, b) =>
        Number(coversLast(b.source_id)) - Number(coversLast(a.source_id)) || b.created_at.localeCompare(a.created_at),
    )[0];
  const estimate = run?.result.stateEstimate;
  return typeof estimate === "string" && estimate.trim() ? estimate : null;
}

/** to를 마지막 날로 하는 최근 days 등교일치 색 이력 (오래된 날 → 최근 날 순). 주말도 등교일로 친다 */
export async function getColorHistory(
  classId: string,
  studentId: string,
  to: string,
  days: number,
): Promise<ColorHistoryDay[]> {
  const row = findRow(classId, studentId);
  if (!row) return [];
  const dates = dateRange(to, days);
  const sessionsOf = await loadSessions([row], dates[0] ?? to, to);
  return dates.map((date) => {
    const sessions = sessionsOf(row, date);
    return { date, morning: latestColor(sessions, "morning"), afternoon: latestColor(sessions, "afternoon") };
  });
}

/**
 * API 연결 전 화면 확인용 예시 (mock 단계 전용 — Supabase 연결 시 삭제).
 * 실제 AI 분석은 /api/ai/daily-analysis(이지현), 코멘트 초안은 /api/ai/comment-draft(이유민)가 돌려준다.
 */
export async function getMockAiPreview(
  classId: string,
  studentId: string,
  date: string,
): Promise<{ analysis: string | null; draft: string | null }> {
  const row = findRow(classId, studentId);
  if (!row) return { analysis: null, draft: null };
  const { analyses } = mockCheckinsFor(row.enrollment_id, date);
  return {
    analysis: analyses.at(-1)?.result.summary ?? null,
    draft: mockCommentDraft(row.enrollment_id, date),
  };
}

/**
 * 배포 전 목업(mock-data/out)에 미리 넣어 둔 그날 AI 분석·보낸 한마디. 목업 범위 밖이거나 목업에 없는 날짜면 null —
 * 그때 화면은 지금처럼 /api/ai/daily-analysis·comment-draft를 부른다.
 */
export async function getPrecomputedDayAi(classId: string, studentId: string, date: string): Promise<FixtureDayAi | null> {
  const row = findRow(classId, studentId);
  return row ? mockFixtureDayAi(row.enrollment_id, date) : null;
}

/**
 * 대시보드(진승혜) 스냅샷에서 이 아이의 감정 어휘·관계만 뽑는다.
 * 리포트 기간(from~to)과 무관하게 항상 "현재 기준" 스냅샷 하나만 쓴다 — 대시보드 mock이 날짜별
 * 이력이 아니라 오늘 시점 스냅샷이기 때문(감정 어휘 성장 카드도 화면에서 같은 방식으로 보여준다).
 */
function buildInsights(studentId: string): { vocab: VocabInsight; relation: RelationInsight } {
  const dashboardId = MOCK_STUDENTS.findIndex((s) => s.student_id === studentId) + 1;
  const snapshot = getDashboardSnapshot(dashboardToday());

  const vocabStudent = snapshot.vocab.students.find((s) => s.studentId === dashboardId);
  const classAverage =
    Math.round(
      (snapshot.vocab.students.reduce((sum, s) => sum + s.count, 0) / snapshot.vocab.students.length) * 10,
    ) / 10;

  // 대시보드는 기간 토글(1주/2주/4주/누적)로 관계를 보여주지만, 상담 리포트에는 고를 데가
  // 없으니 대시보드 기본값과 같은 기간을 쓴다.
  const relation = snapshot.relation[DEFAULT_RELATION_PERIOD];
  const connections = relation.edges
    .filter((e) => e.from === dashboardId || e.to === dashboardId)
    .map((e) => {
      const otherId = e.from === dashboardId ? e.to : e.from;
      const other = relation.nodes.find((n) => n.studentId === otherId);
      // relation.edges 의 from/to 는 실제 데이터(uuid 문자열)와 타입을 공유하느라 넓어졌지만,
      // 이 파일은 mock 스냅샷만 쓰므로 여기서는 늘 숫자다.
      return other ? { studentId: mockStudentIdFromNumber(Number(otherId)), name: other.name, kind: e.kind } : null;
    })
    .filter((c): c is { studentId: string; name: string; kind: "normal" | "conflict" } => c !== null);

  return {
    vocab: { studentCount: vocabStudent?.count ?? 0, classAverage },
    relation: { connections },
  };
}

/**
 * 그날 이미 만들어 둔 AI 분석 하나 (새로 만들지 않는다 — 생성은 아이 상세의 /api/ai/daily-analysis).
 * 하교까지 본 분석을 우선하고, 같은 조건이면 가장 최근 것. 아이 상세에서 아직 열어보지 않은 날은 기존 분석 행만 있다.
 * Supabase 연결 시: analysis_runs where analysis_type='session_summary' and source_type='session'
 *   and source_id in (그날 세션) and status='completed' — mock에서는 새로 만든 행(mockAnalysisRuns)과 시드 행을 합쳐 본다.
 */
function existingDayAnalysis(
  enrollmentId: string,
  date: string,
  sessions: DaySession[],
): ConsultationReport["analyses"][number] | null {
  const sessionIds = sessions.map((s) => s.sessionId);
  const lastSessionId = sessionIds.at(-1);
  const generated = mockAnalysisRuns()
    .filter(
      (r) =>
        r.analysis_type === "session_summary" &&
        r.status === "completed" &&
        sessionIds.includes(r.source_id) &&
        typeof r.result.summary === "string",
    )
    .sort(
      (a, b) =>
        Number(b.source_id === lastSessionId) - Number(a.source_id === lastSessionId) ||
        b.created_at.localeCompare(a.created_at),
    )[0];
  if (generated) {
    return { analysisId: generated.id, sessionId: generated.source_id, date, summary: String(generated.result.summary) };
  }
  const isMockDay = sessions.every((s) => s.sessionId.startsWith("mock-"));
  const seeded = isMockDay ? mockCheckinsFor(enrollmentId, date).analyses.at(-1) : undefined;
  return seeded ? { analysisId: seeded.id, sessionId: seeded.source_id, date, summary: seeded.result.summary } : null;
}

/** 학부모 상담 근거 자료 — 신호등 색 이력, AI 분석, 관찰일지 태그 항목. from~to는 교사가 고른 날짜 범위(둘 다 포함) */
export async function getConsultationReport(
  classId: string,
  studentId: string,
  from: string,
  to: string,
): Promise<ConsultationReport | null> {
  const row = findRow(classId, studentId);
  if (!row) return null;

  const dates = dateRangeBetween(from, to);
  const days = dates.length;
  const sessions: ConsultationReport["sessions"] = [];
  const analyses: ConsultationReport["analyses"] = [];

  const sessionsOf = await loadSessions([row], from, to);
  for (const date of dates) {
    const daily = sessionsOf(row, date);
    sessions.push(...daily.map((s) => ({ ...s, date })));
    const analysis = existingDayAnalysis(row.enrollment_id, date, daily);
    if (analysis) analyses.push(analysis);
  }

  const observations = await listObservationLogsForStudent(classId, studentId, to, days);

  const evidenceRefs: EvidenceRef[] = [
    ...sessions.map((s) => ({ table: "checkin_sessions" as const, id: s.sessionId })),
    ...analyses.map((a) => ({ table: "analysis_runs" as const, id: a.analysisId })),
    ...observations.map((o) => ({ table: "work_records" as const, id: o.id })),
  ];

  const { vocab, relation } = buildInsights(row.student_id);

  return {
    student: toClassStudent(row),
    from: dates[0] ?? from,
    to,
    sessions: sessions.reverse(),
    analyses: analyses.reverse(),
    observations,
    evidenceRefs,
    vocabInsight: vocab,
    relationInsight: relation,
  };
}
