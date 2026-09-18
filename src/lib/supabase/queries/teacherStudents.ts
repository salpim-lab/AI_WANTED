// 담당: 김현우 (단독 소유)
// 자리 배치도 · 아이 상세 · 상담 자료 리포트용 읽기 전용 쿼리. 쓰기 함수를 추가하지 말 것.
// 다른 담당자 테이블은 여기서 읽기만 한다 — checkin_sessions/conversation_messages(이유민), analysis_runs(이지현).
// 서버 전용 — Server Component / Server Action에서만 import한다 ("use client" 파일에서 import 금지).
// 모든 함수가 classId를 받는다: 서버는 service_role로 RLS를 우회하므로 담당 학급 범위를 코드에서 직접 건다.
//
// 지금은 mock 구현(raw/_mockTeacherData.ts)이다. Supabase 연결 시 함수 본문만 교체하고 시그니처는 유지한다.
//   학생·자리   v_students_current (UI는 student_id, enrollment_id 변환은 이 파일 안에서만)
//   세션·대화   checkin_sessions(enrollment_id, session_date) ⨝ conversation_messages order by sequence
//   AI 분석     analysis_runs where analysis_type='session_summary' and source_type='session' and status='completed'

import { addDays } from "@/components/shared/datetime";
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
  MOCK_STUDENTS,
  mockBriefingBadge,
  mockCheckinsFor,
  mockCommentDraft,
  mockStudentIdFromNumber,
  type MockStudentRow,
} from "@/lib/supabase/raw/_mockTeacherData";
import type { SignalColor } from "@/lib/types/signal";
import type {
  ClassStudent,
  ColorHistoryDay,
  ConsultationReport,
  DaySession,
  EvidenceRef,
  RelationInsight,
  SeatingStudent,
  VocabInsight,
} from "@/lib/types/teacherRecord";

/** 상담 리포트 기본 기간(교사가 시작~끝 날짜를 직접 고르지 않았을 때). 상담 기록 저장 시 evidence_refs도 이 기간으로 만든다 */
export const REPORT_DEFAULT_DAYS = 30;

function classRows(classId: string): MockStudentRow[] {
  return MOCK_STUDENTS.filter((s) => s.class_id === classId && s.status === "active").sort(
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

function daySessions(enrollmentId: string, date: string): DaySession[] {
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
    }))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
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
  return classRows(classId).map((row) => {
    const sessions = daySessions(row.enrollment_id, date);
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
  return row ? daySessions(row.enrollment_id, date) : [];
}

/** to를 마지막 날로 하는 days일치 색 이력 (오래된 날 → 최근 날 순) */
export async function getColorHistory(
  classId: string,
  studentId: string,
  to: string,
  days: number,
): Promise<ColorHistoryDay[]> {
  const row = findRow(classId, studentId);
  if (!row) return [];
  return dateRange(to, days).map((date) => {
    const sessions = daySessions(row.enrollment_id, date);
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
      return other ? { studentId: mockStudentIdFromNumber(otherId), name: other.name, kind: e.kind } : null;
    })
    .filter((c): c is { studentId: string; name: string; kind: "normal" | "conflict" } => c !== null);

  return {
    vocab: { studentCount: vocabStudent?.count ?? 0, classAverage },
    relation: { connections },
  };
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

  for (const date of dates) {
    const daily = daySessions(row.enrollment_id, date);
    sessions.push(...daily.map((s) => ({ ...s, date })));
    analyses.push(
      ...mockCheckinsFor(row.enrollment_id, date).analyses.map((a) => ({
        analysisId: a.id,
        sessionId: a.source_id,
        date,
        summary: a.result.summary,
      })),
    );
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
