// 담당: 이지현 (단독 소유)
// 협진 챗봇이 답하기 전에 참고할 컨텍스트를 모은다.
// 데이터는 김현우가 이미 만들어둔 조회 함수(getConsultationReport/getSeatingChart/listObservationLogs/
// listConsultationLogs)를 그대로 가져다 쓴다 — 이 함수들은 "지금은 mock, Supabase 연결 시 시그니처
// 그대로 내부만 교체"라고 그쪽 파일에 적혀 있어서, 여기는 고칠 일이 없다. 남의 파일은 절대 이 안에서
// 수정하지 않는다.
//
// (2026-09-18 수정) getConsultationReport는 이름과 달리 학부모상담기록(parent_consultations)을
// 담지 않는다 — 이름은 "상담 자료 리포트"이고 실제로는 신호등/대화/관찰일지/어휘/관계만 모은다.
// 학부모상담기록은 별도 함수(listConsultationLogs)라서 빠뜨렸었다. Supabase 연동 문제가 아니라
// 이 파일에서 그 함수를 안 부르고 있었던 것 — 아래에서 직접 추가해서 가져온다.
// 참고: docs/planning/살핌_DB_스키마_v0.3.md §9.3 get_student_context — 지금은 그 SQL 함수 대신
// 이미 동작하는 mock 조회 함수 조합으로 같은 역할을 한다. Supabase 연결 후 get_student_context RPC로
// 교체할 수 있지만, 급하지 않다 — 아래 3곳(신호등/관찰기록/어휘·관계)을 이미 한 번에 주는
// getConsultationReport가 있어서 학생 지정 질문은 사실상 그거면 충분하다.

import "server-only";

import { addDays, todayKst } from "@/components/shared/datetime";
import { getActingTeacher } from "@/lib/supabase/raw/_mockTeacherData";
import { listObservationLogs } from "@/lib/supabase/raw/observationLog";
import { listConsultationLogs } from "@/lib/supabase/raw/consultationLog";
import { getConsultationReport, getSeatingChart, REPORT_DEFAULT_DAYS } from "@/lib/supabase/queries/teacherStudents";
import type { SignalColor } from "@/lib/types/signal";

const COLOR_LABEL: Record<SignalColor, string> = { green: "초록", yellow: "노랑", red: "빨강", navy: "남색" };

export type AgentContext = {
  classId: string;
  /** 특정 학생에 대한 질문이면 그 이름, 학급 전체 질문이면 null */
  studentName: string | null;
  /** system prompt에 그대로 붙이는 컨텍스트 텍스트 */
  contextText: string;
};

/** studentId가 있으면 그 학생 한 명, 없으면 학급 전체 기준으로 컨텍스트를 만든다. */
export async function buildAgentContext(studentId: string | null): Promise<AgentContext> {
  const teacher = await getActingTeacher();
  const today = todayKst();

  if (studentId) return buildStudentContext(teacher.classId, studentId, today);
  return buildClassContext(teacher.classId, today);
}

async function buildStudentContext(classId: string, studentId: string, today: string): Promise<AgentContext> {
  const from = addDays(today, -(REPORT_DEFAULT_DAYS - 1));
  const report = await getConsultationReport(classId, studentId, from, today);
  if (!report) {
    return { classId, studentName: null, contextText: "요청한 학생 정보를 찾지 못했습니다." };
  }

  const lines: string[] = [`[학생] ${report.student.name} (자리 ${report.student.seatRow}행 ${report.student.seatCol}열)`];

  const recentColors = report.sessions
    .slice(0, 6)
    .map((s) => `${s.date} ${s.period === "morning" ? "등교" : "하교"} ${COLOR_LABEL[s.color]}`);
  if (recentColors.length) lines.push(`[최근 신호등 색]\n${recentColors.join("\n")}`);

  const recentAnalyses = report.analyses.slice(0, 3).map((a) => `- (${a.date}) ${a.summary}`);
  if (recentAnalyses.length) lines.push(`[AI 대화 요약]\n${recentAnalyses.join("\n")}`);

  const recentObservations = report.observations
    .slice(0, 3)
    .map((o) => `- (${o.occurredAt.slice(0, 10)}) ${o.title ?? o.body.slice(0, 60)}`);
  if (recentObservations.length) lines.push(`[학생관찰일지]\n${recentObservations.join("\n")}`);

  const consultations = await listConsultationLogs(classId, { studentId: report.student.studentId });
  const recentConsultations = consultations
    .slice(0, 3)
    .map((c) => `- (${c.occurredAt.slice(0, 10)}) ${c.title}: ${c.body.slice(0, 80)}`);
  if (recentConsultations.length) lines.push(`[학부모상담기록]\n${recentConsultations.join("\n")}`);

  lines.push(`[감정 어휘] 이 학생 ${report.vocabInsight.studentCount}개 · 학급 평균 ${report.vocabInsight.classAverage}개`);

  if (report.relationInsight.connections.length) {
    const rel = report.relationInsight.connections
      .map((c) => `${c.name}${c.kind === "conflict" ? "(갈등 관계)" : ""}`)
      .join(", ");
    lines.push(`[관계] ${rel}`);
  }

  return { classId, studentName: report.student.name, contextText: lines.join("\n\n") };
}

async function buildClassContext(classId: string, today: string): Promise<AgentContext> {
  const seating = await getSeatingChart(classId, today);

  const colorCounts: Partial<Record<SignalColor, number>> = {};
  for (const s of seating) {
    if (s.todayMorning) colorCounts[s.todayMorning] = (colorCounts[s.todayMorning] ?? 0) + 1;
  }
  const colorLine = (Object.entries(colorCounts) as [SignalColor, number][])
    .map(([color, count]) => `${COLOR_LABEL[color]} ${count}명`)
    .join(", ");

  const watchList = seating.filter((s) => s.badge === "watch").map((s) => s.name);

  const recentObservations = await listObservationLogs(classId, { from: addDays(today, -6), to: today });
  const obsLines = recentObservations
    .slice(0, 5)
    .map(
      (o) =>
        `- (${o.occurredAt.slice(0, 10)}) ${o.title ?? o.body.slice(0, 40)}${
          o.taggedStudents.length ? ` [${o.taggedStudents.map((t) => t.name).join(", ")}]` : ""
        }`,
    );

  // listConsultationLogs는 날짜 필터가 없어서(ConsultationFilter에 from/to 없음) 전체를 받아
  // occurredAt 기준으로 여기서 직접 최신순 정렬해 최근 것만 자른다.
  const consultations = await listConsultationLogs(classId, {});
  const consultLines = [...consultations]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 3)
    .map((c) => `- (${c.occurredAt.slice(0, 10)}) ${c.student.name} · ${c.title}: ${c.body.slice(0, 60)}`);

  const lines = [
    `[오늘(${today}) 등교 색 현황] ${colorLine || "기록 없음"}`,
    watchList.length ? `[오늘 살펴볼 아이] ${watchList.join(", ")}` : "",
    obsLines.length ? `[최근 7일 학생관찰일지]\n${obsLines.join("\n")}` : "",
    consultLines.length ? `[최근 학부모상담기록]\n${consultLines.join("\n")}` : "",
  ].filter(Boolean);

  return { classId, studentName: null, contextText: lines.join("\n\n") };
}
