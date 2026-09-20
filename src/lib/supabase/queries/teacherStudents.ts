// 담당: 김현우 (단독 소유)
// 자리 배치도 · 아이 상세 · 상담 자료 리포트용 읽기 전용 쿼리. 쓰기 함수를 추가하지 말 것.
// 다른 담당자 테이블은 여기서 읽기만 한다 — checkin_sessions/conversation_messages(이유민), analysis_runs(이지현).
// 서버 전용 — Server Component / Server Action에서만 import한다 ("use client" 파일에서 import 금지).
// 모든 함수가 classId를 받는다: 서버는 service_role로 RLS를 우회하므로 담당 학급 범위를 코드에서 직접 건다.
//
// 등하교 세션(색·대화 전문·발화 측정값)·자리·AI 하루 요약·리포트 인사이트는 실제 DB를 읽는다 (2026-09-20):
//   env가 있으면 그날 세션이 없는 날은 "빈 날"이다 — mock으로 채우지 않는다. mock은 DB를 못 읽는 환경
//   (env 없음·TEACHER_REAL_CHECKINS=off)의 대체일 뿐이다. mock 명단 ↔ 시드 학급은 성 뺀 이름으로 잇는다(MOCK_DB_CLASS_ID).
//   명단·student_id 자체는 아직 mock 명단(00000000-…)이다 — v_students_current 명단으로 옮기는 건 별도 작업.
//   학생·자리   v_students_current (UI는 student_id, enrollment_id 변환은 이 파일 안에서만)
//   세션·대화   checkin_sessions(enrollment_id, session_date) ⨝ conversation_messages order by sequence
//   AI 분석     analysis_runs where analysis_type='session_summary' and source_type='session' and status='completed'

import { cache } from "react";
import { addDays, toKstDate } from "@/components/shared/datetime";
import { givenName } from "@/components/shared/names";
import { listOpenMeetingRequests } from "@/lib/checkins/meetingRequests";
import { getDemoScope, ownerOrFilter, scopedKey } from "@/lib/demo/scope";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasStudentSpeech,
  resolveAnalysisTargets,
  selectSessionGroup,
} from "@/lib/supabase/interpretation/analysisTargets";
import {
  isRealSessionId,
  loadSessionSummaries,
  pickDayAnalysis,
  pickSummary,
  type StoredSessionSummary,
} from "@/lib/supabase/queries/sessionSummaries";
// 대시보드(진승혜) 스냅샷 — 상담 리포트의 어휘·관계 인사이트용 읽기 전용 참조.
// DB를 읽는 환경에서는 대시보드가 쓰는 실제 조립 함수(getDashboardDataFromSupabase)를 그대로 부른다(대시보드와 같은 숫자).
// mock 스냅샷은 DB를 못 읽는 환경(env 없음)의 대체일 뿐이다.
import { getDashboardDataFromSupabase } from "@/lib/supabase/queries/dashboardSnapshot";
import {
  dashboardToday,
  getDashboardSnapshot,
} from "@/components/teacher/dashboard/mockData";
import { listObservationLogsForStudent } from "@/lib/supabase/raw/observationLog";
import {
  MOCK_DB_CLASS_ID,
  MOCK_STUDENTS,
  loadDbSeats,
  recordDb,
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

async function classRows(classId: string): Promise<MockStudentRow[]> {
  // 자리: DB(v_students_current)가 기본, 교사가 자리 바꾸기로 저장한 자리가 있으면 그 자리가 이긴다
  // (자리 저장은 아직 서버 메모리다 — enrollments 쓰기 권한·유니크 인덱스 협의 전, raw/seatLayout.ts 참고)
  const savedSeats = mockSeatLayouts()[scopedKey(await getDemoScope(), classId)]?.seats ?? {};
  const dbSeats = await loadDbSeats(classId);
  return MOCK_STUDENTS.filter((s) => s.class_id === classId && s.status === "active")
    .map((s) => ({ ...s, ...dbSeats?.get(s.student_id), ...savedSeats[s.enrollment_id] }))
    .sort(
    (a, b) => a.seat_row - b.seat_row || a.seat_col - b.seat_col,
  );
}

async function findRow(classId: string, studentId: string): Promise<MockStudentRow | null> {
  // 대시보드(진승혜) mock이 아직 1..N 번호를 studentId로 넘긴다 — mock 단계 한정 브리지.
  const id = /^\d+$/.test(studentId) ? mockStudentIdFromNumber(Number(studentId)) : studentId;
  const rows = await classRows(classId);
  const direct = rows.find((s) => s.student_id === id);
  if (direct) return direct;

  // 대시보드는 DB의 student_id(30000000-…)로 링크를 만든다 — 이 화면의 명단 id(00000000-…)로 바꿔 찾는다.
  // 명단 자체가 DB로 옮겨지면(v_students_current) 이 변환은 필요 없어진다.
  const appId = await appStudentIdOfDbId(classId, id);
  return appId ? (rows.find((s) => s.student_id === appId) ?? null) : null;
}

async function appStudentIdOfDbId(classId: string, dbStudentId: string): Promise<string | null> {
  if (!realCheckinsEnabled()) return null;
  try {
    const db = await recordDb(classId);
    if (!db) return null;
    for (const [appId, dbId] of db.dbStudentOf) if (dbId === dbStudentId) return appId;
  } catch (error) {
    console.warn("[teacherStudents] DB student_id를 명단 id로 바꾸지 못했습니다:", error instanceof Error ? error.message : error);
  }
  return null;
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
  demo_owner_id: string | null;
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

    // (2026-09-20, 이지현 제안) 공개 데모 방문자 격리 — 이 함수 결과가 학생 상세·AI 분석 입력·상담 리포트
    // 근거(evidenceRefs)로 전부 흘러간다. 후보 단계에서 "공용 시드 + 현재 방문자 것"만 읽는다(lib/demo/scope.ts).
    let sessionQuery = client
      .from("checkin_sessions")
      .select("id, enrollment_id, session_date, period, attempt, mood_color, status, started_at, transcript, prosody, demo_owner_id")
      .in("enrollment_id", [...rowByDbId.keys()])
      .gte("session_date", addDays(from, -BASELINE_WINDOW_DAYS))
      .lte("session_date", to);
    const scopeFilter = ownerOrFilter(await getDemoScope());
    if (scopeFilter) sessionQuery = sessionQuery.or(scopeFilter);
    const { data, error } = await sessionQuery.order("started_at");
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
        ownerId: r.demo_owner_id ?? null,
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

/** DEMO_MODE의 현재 방문자 id. 스코프가 꺼졌거나 방문자를 못 찾으면 null. */
const viewerIdOf = (scope: Awaited<ReturnType<typeof getDemoScope>>): string | null => (scope.active ? scope.viewerId : null);

let warnedStoredSummaries = false;

/**
 * 세션들의 저장된 AI 하루 요약(analysis_runs) — 상세 화면·상담 리포트·협진 챗봇이 **같은 함수(sessionSummaries.loadSessionSummaries)**로 읽는다.
 * 스코프(공용 + 현재 방문자)와 sourceSessionIds 전체 검증은 그 함수가 한다. DB를 못 읽으면 빈 결과 — 화면과 챗봇은 요약 없이(색만) 계속 간다.
 */
async function loadStoredSummaries(sessionIds: string[]): Promise<StoredSessionSummary[]> {
  const real = sessionIds.filter(isRealSessionId);
  if (real.length === 0 || !realCheckinsEnabled()) return [];
  try {
    return await loadSessionSummaries(createAdminClient(), real, await getDemoScope());
  } catch (error) {
    if (!warnedStoredSummaries) {
      warnedStoredSummaries = true;
      console.warn("[teacherStudents] 저장된 AI 요약을 읽지 못해 요약 없이 보여줍니다:", error instanceof Error ? error.message : error);
    }
    return [];
  }
}

type SessionSource = (row: MockStudentRow, date: string) => AnalysisInputSession[];

/**
 * rows × [from, to] 세션 — DB를 읽는 환경에서는 실제 세션만(없는 날은 빈 날). mock은 DB를 못 읽는 환경의 대체일 뿐이다.
 * 목업 범위(TEACHER_MOCK_FIXTURE=on, 로컬 전용)에서만: 실제로 쓰는 아이(김민준)는 실제 기록만, 나머지 아이는 목업이 있는 날짜면 목업이 먼저다.
 */
async function loadSessions(rows: MockStudentRow[], from: string, to: string): Promise<SessionSource> {
  const real = await loadRealSessions(rows, from, to);
  return (row, date) => {
    const key = `${row.enrollment_id}|${date}`;
    // 실제로 쓰는 아이(김민준)는 목업 범위에서 실제 체크인만 — 없는 날은 빈 날이다
    if (isLiveInMockScope(row.enrollment_id)) return real.get(key) ?? [];
    if (usesMockFixture(row.enrollment_id, date)) return mockDaySessions(row.enrollment_id, date);
    // DB를 읽는 환경에서는 그날 세션이 없으면 빈 날이다 — 없는 기록을 mock으로 만들어 채우지 않는다.
    // (DB를 못 읽는 환경 — env 없음·TEACHER_REAL_CHECKINS=off — 에서만 예전 mock으로 화면을 채운다)
    if (realCheckinsEnabled()) return real.get(key) ?? [];
    return mockDaySessions(row.enrollment_id, date);
  };
}

/**
 * 같은 날 같은 시간대에 회차가 여럿이면 가장 최근에 시작한 것의 색을 대표값으로 쓴다.
 * attempt만 보면 안 된다 — attempt는 (방문자·학생·날짜·시간대)마다 1부터 다시 세서, 서로 다른 방문자가 남긴 회차는 전부 1이라
 * 동점이 되고 가장 오래된 것이 뽑힌다. 대시보드(dashboardSnapshot.latestColor)와 같은 기준(시작 시각 → attempt)이다.
 */
function latestColor(sessions: DaySession[], period: DaySession["period"]): SignalColor | null {
  const matched = sessions
    .filter((s) => s.period === period)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.attempt - a.attempt);
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
  return (await classRows(classId)).map(toClassStudent);
}

export async function findClassStudent(classId: string, studentId: string): Promise<ClassStudent | null> {
  const row = await findRow(classId, studentId);
  return row ? toClassStudent(row) : null;
}

export async function getSeatingChart(classId: string, date: string): Promise<SeatingStudent[]> {
  const rows = await classRows(classId);
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
  const row = await findRow(classId, studentId);
  if (!row) return [];
  return (await loadSessions([row], date, date))(row, date);
}

/**
 * AI 요약의 입력 세션 — 시간대(등교/하교)마다 가장 최근 회차 **하나**. 여러 회차를 묶어 요약하지 않는다.
 * 같은 시간대에 회차를 여럿 남겨도(다시 하기·테스트) 상세 화면은 가장 최근 회차만 보여주니, 요약도 그 회차만 본다.
 * "가장 최근"은 shownSession(상세 화면)과 같은 기준이다: 아이 발화가 있는 가장 최근 회차, 없으면 가장 최근 회차(시작 시각 → attempt).
 * 소유자 부류(공개 데모 방문자 격리)는 resolveAnalysisTargets와 같은 selectSessionGroup으로 먼저 고르고, 그 안에서 고른다.
 * 결과는 시작 시각 오름차순이다(analysisTargets가 기대하는 순서).
 */
function pickAnalysisSessions<T extends DaySession>(sessions: T[], viewerId: string | null): T[] {
  const group = selectSessionGroup(sessions, viewerId);
  const picked: T[] = [];
  for (const period of ["morning", "afternoon"] as const) {
    const latestFirst = group
      .filter((s) => s.period === period)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.attempt - a.attempt);
    const one = latestFirst.find((s) => hasStudentSpeech(s)) ?? latestFirst[0];
    if (one) picked.push(one);
  }
  return picked.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.attempt - b.attempt);
}

/**
 * 상세 화면이 렌더 때 미리 읽는 "이미 저장된" 그날 AI 요약(등교 기준·등교-하교 기준). 새로고침해도 같은 DB 요약이 보이고,
 * 저장된 게 없을 때만 화면이 분석 API를 부른다. 챗봇·상담 리포트와 같은 loadSessionSummaries를 쓴다(요약 대상 세션 선택 규칙도 같다).
 * 목업 세션(uuid 아님)의 요약은 DB에 없으므로 null — 그 경우 화면은 기존처럼 분석 API를 부른다.
 */
export async function getStoredDayAnalyses(
  classId: string,
  studentId: string,
  date: string,
): Promise<{ morning: string | null; full: string | null; expects: { morning: boolean; full: boolean } }> {
  const row = await findRow(classId, studentId);
  if (!row) return { morning: null, full: null, expects: { morning: false, full: false } };
  const demoScope = await getDemoScope();
  const viewerId = demoScope.active ? demoScope.viewerId : null;
  const targets = resolveAnalysisTargets(pickAnalysisSessions((await loadSessions([row], date, date))(row, date), viewerId), viewerId);
  const sourceIds = [targets.morning?.sourceId, targets.full?.sourceId].filter((id): id is string => Boolean(id));
  const stored = await loadStoredSummaries(sourceIds);
  return {
    morning: targets.morning ? (pickSummary(stored, targets.morning.sourceId, "morning")?.summary ?? null) : null,
    full: targets.full ? (pickSummary(stored, targets.full.sourceId, "full")?.summary ?? null) : null,
    // 만들 수 있는 요약(=분석 대상)이 있는가 — 생성 경로와 같은 판정(resolveAnalysisTargets). 화면이 "다 찼는지"를 추측하지 않고 이것으로 판단한다.
    expects: { morning: targets.morning !== null, full: targets.full !== null },
  };
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
  const row = await findRow(classId, studentId);
  if (!row) return null;
  const sessionsOf = await loadSessions([row], addDays(date, -ANALYSIS_PAST_DAYS), date);
  const pastSessions = dateRange(addDays(date, -1), ANALYSIS_PAST_DAYS).map((day) => ({ day, sessions: sessionsOf(row, day) }));
  // 과거 7일의 저장된 요약을 한 번에(배치로) 읽는다 — 그날 추정 상태를 다음 분석의 흐름 입력으로 쓴다.
  const stored = await loadStoredSummaries(pastSessions.flatMap(({ sessions }) => sessions.map((s) => s.sessionId)));
  const viewerId = viewerIdOf(await getDemoScope());
  const pastDays = pastSessions.map(({ day, sessions }) => ({
    date: day,
    morning: latestColor(sessions, "morning"),
    afternoon: latestColor(sessions, "afternoon"),
    stateEstimate: latestStateEstimate(sessions, stored, viewerId),
  }));
  return {
    student: toClassStudent(row),
    classmates: (await classRows(classId)).map(toClassStudent),
    date,
    // 그날 요약의 입력 — 시간대마다 가장 최근 회차 하나(여러 회차를 묶어 요약하지 않는다)
    sessions: pickAnalysisSessions(sessionsOf(row, date), viewerId),
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
function latestStateEstimate(sessions: DaySession[], stored: StoredSessionSummary[], viewerId: string | null): string | null {
  const sessionIds = sessions.map((s) => s.sessionId);
  // 실제 세션은 DB 요약에서(현재 방문자 본인 세션 우선, 그 부류의 마지막 세션에 붙은 것 우선, 그다음 최신 — 다음 분석의 흐름 입력이라
  // 하교 전 등교 요약도 허용한다). 목업 세션만 아래 서버 메모리 경로.
  const fromDb = pickDayAnalysis(stored.filter((r) => r.stateEstimate), pickAnalysisSessions(sessions, viewerId), viewerId, {
    requireFullWhenAfternoon: false,
  })?.stateEstimate;
  if (fromDb) return fromDb;
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
  const row = await findRow(classId, studentId);
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
  const row = await findRow(classId, studentId);
  if (!row) return { analysis: null, draft: null };
  // DB를 읽는 환경에서는 예시를 만들지 않는다 — 저장된 요약은 getStoredDayAnalyses가, 없으면 API가 채운다
  if (realCheckinsEnabled()) return { analysis: null, draft: null };
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
  const row = await findRow(classId, studentId);
  return row ? mockFixtureDayAi(row.enrollment_id, date) : null;
}

/** 같은 요청 안에서 대시보드 조립을 한 번만 돌린다 (리포트 화면이 여러 함수에서 부른다) */
const dashboardOf = cache((classId: string, date: string) => getDashboardDataFromSupabase(classId, date));

type Insights = { vocab: VocabInsight; relation: RelationInsight };

/**
 * 대시보드(진승혜)에서 이 아이의 감정 어휘·관계만 뽑는다.
 * 리포트 기간(from~to)과 무관하게 항상 "현재 기준" 하나만 쓴다 — 대시보드 카드도 화면에서 같은 방식으로 보여준다.
 * DB를 읽는 환경에서는 실제 대시보드 데이터, 못 읽으면 mock 스냅샷.
 */
async function buildInsights(classId: string, studentId: string): Promise<Insights> {
  if (realCheckinsEnabled()) {
    try {
      const db = await recordDb(classId);
      const dbId = db?.dbStudentOf.get(studentId);
      if (db && dbId) {
        const data = await dashboardOf(db.classId, dashboardToday());
        // 대시보드는 DB student_id, 이 화면은 앱 student_id를 쓴다 — 관계 상대는 되돌려서 넘긴다
        const appIdOf = new Map([...db.dbStudentOf].map(([appId, dbStudentId]) => [dbStudentId, appId]));
        const students = data.vocab.students;
        const relation = data.relation.all;
        const connections = relation.edges
          .filter((e) => e.from === dbId || e.to === dbId)
          .map((e) => {
            const otherDbId = String(e.from === dbId ? e.to : e.from);
            const other = relation.nodes.find((n) => String(n.studentId) === otherDbId);
            const appId = appIdOf.get(otherDbId);
            return other && appId ? { studentId: appId, name: other.name, kind: e.kind } : null;
          })
          .filter((c): c is { studentId: string; name: string; kind: "normal" | "conflict" } => c !== null);
        return {
          vocab: {
            studentCount: students.find((s) => s.studentId === dbId)?.count ?? 0,
            classAverage: students.length ? Math.round((students.reduce((sum, s) => sum + s.count, 0) / students.length) * 10) / 10 : 0,
          },
          relation: { connections },
        };
      }
    } catch (error) {
      console.warn("[teacherStudents] 대시보드 데이터를 읽지 못해 어휘·관계를 비웁니다:", error instanceof Error ? error.message : error);
      return { vocab: { studentCount: 0, classAverage: 0 }, relation: { connections: [] } };
    }
  }
  return mockInsights(studentId);
}

/** 대시보드 mock 스냅샷 기반 — DB를 못 읽는 환경 전용 */
function mockInsights(studentId: string): Insights {
  const dashboardId = MOCK_STUDENTS.findIndex((s) => s.student_id === studentId) + 1;
  const snapshot = getDashboardSnapshot(dashboardToday());

  const vocabStudent = snapshot.vocab.students.find((s) => s.studentId === dashboardId);
  const classAverage =
    Math.round(
      (snapshot.vocab.students.reduce((sum, s) => sum + s.count, 0) / snapshot.vocab.students.length) * 10,
    ) / 10;

  // 대시보드는 기간 토글(1주/2주/4주/누적)로 관계를 보여주지만, 상담 리포트에는 고를 데가
  // 없고 "누적 자료"이므로 가장 넓은 누적 기간을 쓴다(짧은 기간이면 오래된 갈등선이 빠진다).
  const relation = snapshot.relation.all;
  const connections = relation.edges
    .filter((e) => e.from === dashboardId || e.to === dashboardId)
    .map((e) => {
      const otherId = e.from === dashboardId ? e.to : e.from;
      const other = relation.nodes.find((n) => n.studentId === otherId);
      // relation.edges 의 from/to 는 실제 데이터(uuid 문자열)와 타입을 공유하느라 넓어졌지만,
      // 이 함수는 mock 스냅샷만 쓰므로 여기서는 늘 숫자다.
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
  stored: StoredSessionSummary[],
  viewerId: string | null,
): ConsultationReport["analyses"][number] | null {
  const sessionIds = sessions.map((s) => s.sessionId);
  // 실제 세션의 요약은 DB(스코프·소유 검증을 거친 것)에서 — 상세 화면과 같은 함수가 읽어 온 결과다. 목업 세션만 아래 메모리·시드 경로.
  // 현재 방문자 본인 세션이 있으면 본인 요약만(공용 요약이 대신하지 않음), 하교가 있는 날은 통합 요약만 하루 요약으로 쓴다.
  const fromDb = pickDayAnalysis(stored, pickAnalysisSessions(sessions, viewerId), viewerId);
  if (fromDb) return { analysisId: fromDb.id, sessionId: fromDb.sourceId, date, summary: fromDb.summary };
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
  // 세션이 하나도 없는 날은 목업 날이 아니다(빈 배열의 every는 true라서 따로 막는다)
  const isMockDay = sessions.length > 0 && sessions.every((s) => s.sessionId.startsWith("mock-"));
  const seeded = isMockDay ? mockCheckinsFor(enrollmentId, date).analyses.at(-1) : undefined;
  return seeded ? { analysisId: seeded.id, sessionId: seeded.source_id, date, summary: seeded.result.summary } : null;
}

/**
 * 학부모 상담 근거 자료 — 신호등 색 이력, AI 분석, 관찰일지 태그 항목. from~to는 교사가 고른 날짜 범위(둘 다 포함)
 * (2026-09-20, 이지현 제안) viewerTeacherId — 공개 데모 방문자 격리용, listObservationLogs와
 * 같은 방식(observationLog.ts 참고). 안 주면 기존과 동일하게 시드 담임 것만 보인다. 이 파일의
 * 다른 호출부(consultation/actions.ts 등, 김현우 소유)는 아직 안 건드렸다 — teacher.id를
 * 갖고 있으니 필요하면 같은 방식으로 넘기면 된다.
 */
export async function getConsultationReport(
  classId: string,
  studentId: string,
  from: string,
  to: string,
  viewerTeacherId?: string,
): Promise<ConsultationReport | null> {
  const row = await findRow(classId, studentId);
  if (!row) return null;

  const dates = dateRangeBetween(from, to);
  const days = dates.length;
  const sessions: ConsultationReport["sessions"] = [];
  const analyses: ConsultationReport["analyses"] = [];

  const sessionsOf = await loadSessions([row], from, to);
  const perDate = dates.map((date) => ({ date, daily: sessionsOf(row, date) }));
  // 기간 전체의 저장된 요약을 한 번에(배치로) 읽는다 — 날짜마다 조회하지 않는다.
  const stored = await loadStoredSummaries(perDate.flatMap(({ daily }) => daily.map((s) => s.sessionId)));
  const viewerId = viewerIdOf(await getDemoScope());
  for (const { date, daily } of perDate) {
    sessions.push(...daily.map((s) => ({ ...s, date })));
    const analysis = existingDayAnalysis(row.enrollment_id, date, daily, stored, viewerId);
    if (analysis) analyses.push(analysis);
  }

  const observations = await listObservationLogsForStudent(classId, studentId, to, days, viewerTeacherId);

  const evidenceRefs: EvidenceRef[] = [
    ...sessions.map((s) => ({ table: "checkin_sessions" as const, id: s.sessionId })),
    ...analyses.map((a) => ({ table: "analysis_runs" as const, id: a.analysisId })),
    ...observations.map((o) => ({ table: "work_records" as const, id: o.id })),
  ];

  const { vocab, relation } = await buildInsights(classId, row.student_id);

  // 리포트에 찍히는 기간은 "조회한 창"이 아니라 "실제로 기록이 있는 범위"다.
  // 기본 30일로 조회하면 앞뒤에 기록 없는 날이 남는데, 그러면 AI 기간 요약이 말하는 "기간 초반"과
  // 머리글 날짜가 어긋난다 (학부모에게 보여주는 자료라 맞춘다).
  // 기록이 하나도 없으면 조회한 창을 그대로 쓴다. 좁힌 범위로 이 함수를 다시 불러도 결과는 같다(멱등).
  const coveredDates = [
    ...sessions.map((s) => s.date),
    ...analyses.map((a) => a.date),
    ...observations.map((o) => toKstDate(o.occurredAt)),
  ].sort();
  const coveredFrom = coveredDates[0];
  const coveredTo = coveredDates[coveredDates.length - 1];

  return {
    student: toClassStudent(row),
    from: coveredFrom ?? dates[0] ?? from,
    to: coveredTo ?? to,
    sessions: sessions.reverse(),
    analyses: analyses.reverse(),
    observations,
    evidenceRefs,
    vocabInsight: vocab,
    relationInsight: relation,
  };
}

// ── 학생이 낸 상담 신청 (협진 챗봇 컨텍스트용, 읽기 전용) ──────────────────────

export type OpenStudentRequest = {
  /** 이 화면들이 쓰는 명단 student_id (DB student_id가 아니다) */
  studentId: string;
  name: string;
  /** ISO — 아이가 신청한 시각(서버 기록) */
  requestedAt: string;
  priority: "normal" | "high";
};

/**
 * 아이가 대화 끝에 낸 "선생님과 이야기하고 싶어요" 중 아직 처리되지 않은 것 (meeting_requests, status='requested').
 * 조회와 방문자 격리("공용 시드 세션 + 현재 방문자 세션"만)는 lib/checkins/meetingRequests.ts(이유민)가 이미 걸어 두었다 —
 * 여기서는 그 결과의 DB student_id를 이 화면들이 쓰는 명단 id로 바꿔서 돌려줄 뿐이다. 최신순, 급한 것(high)이 앞.
 * DB를 못 읽는 환경이면 빈 목록이다 — 챗봇이 이 조회 하나 때문에 답을 못 하게 되지 않도록 실패를 삼킨다.
 */
export async function listOpenStudentRequests(classId: string): Promise<OpenStudentRequest[]> {
  if (!realCheckinsEnabled()) return [];
  try {
    const db = await recordDb(classId);
    if (!db) return [];
    const appIdOfDbId = new Map([...db.dbStudentOf].map(([appId, dbId]) => [dbId, appId] as const));
    const cards = await listOpenMeetingRequests([db.classId]);
    return cards.flatMap((card) => {
      const studentId = appIdOfDbId.get(card.studentId);
      return studentId ? [{ studentId, name: card.studentName, requestedAt: card.requestedAt, priority: card.priority }] : [];
    });
  } catch (error) {
    console.warn("[teacherStudents] 학생 상담 신청을 읽지 못했습니다:", error instanceof Error ? error.message : error);
    return [];
  }
}
