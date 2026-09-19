// 담당: 이지현 (단독 소유)
// 협진 챗봇이 답하기 전에 참고할 컨텍스트를 "정서 / 학교생활 관찰 / 가정 연계" 3개 도메인으로 나눠서
// 모은다 (DB 스키마 v0.3 §9.2 agent_messages.domain이 이미 'emotion'|'learning'|'home'으로 정의해둔
// 분류를 그대로 씀). route.ts가 도메인별로 각각 OpenAI를 병렬 호출한 뒤 합친다 (image.png 기술스택
// 메모 "3개 system prompt 병렬 호출 후 합치는 구조").
//
// 데이터는 김현우가 이미 만들어둔 조회 함수(getConsultationReport/getSeatingChart/listObservationLogs/
// listConsultationLogs/listClassStudents)를 그대로 가져다 쓴다 — 이 함수들은 "지금은 mock, Supabase
// 연결 시 시그니처 그대로 내부만 교체"라고 그쪽 파일에 적혀 있어서, 여기는 고칠 일이 없다. 남의 파일은
// 절대 이 안에서 수정하지 않는다.
//
// (2026-09-18) 학생 범위 좁히기는 페이지 URL로 못 찾으면 질문 문장에서 학급 명단과 대조해 이름으로
// 다시 찾는다(resolveStudentIdByName) — "누적자료보기"가 새 탭으로 열려서 원래 탭에서 물어보면
// URL만으로는 못 잡기 때문. 페이지가 어디든 이름만 말하면 그 학생으로 좁혀진다.
// 참고: docs/planning/살핌_DB_스키마_v0.3.md §9.3 get_student_context — 지금은 그 SQL 함수 대신
// mock 조회 함수 조합으로 같은 역할을 한다. Supabase 연결 후 그 RPC로 교체할 수 있지만 급하지 않다.

import "server-only";

import { addDays, todayKst } from "@/components/shared/datetime";
import { getActingTeacher } from "@/lib/supabase/raw/_mockTeacherData";
import { listObservationLogs } from "@/lib/supabase/raw/observationLog";
import { listConsultationLogs } from "@/lib/supabase/raw/consultationLog";
import {
  getConsultationReport,
  getSeatingChart,
  listClassStudents,
  REPORT_DEFAULT_DAYS,
} from "@/lib/supabase/queries/teacherStudents";
import type { SignalColor } from "@/lib/types/signal";

const COLOR_LABEL: Record<SignalColor, string> = { green: "초록", yellow: "노랑", red: "빨강", navy: "남색" };

export type AgentDomain = "emotion" | "learning" | "home";

export const DOMAIN_LABEL: Record<AgentDomain, string> = {
  emotion: "정서 (신호등·대화)",
  learning: "학교생활 관찰",
  home: "가정 연계 (학부모상담)",
};

export type DomainContext = {
  domain: AgentDomain;
  /** 그 도메인 system prompt에 붙일 컨텍스트. 참고할 게 없으면 빈 문자열 — route.ts가 이 경우 OpenAI 호출을 건너뛴다 */
  text: string;
  /** 화면에 보여줄 사람이 읽을 수 있는 근거 목록 (예: "학생관찰일지 · 2026-09-10") */
  evidence: string[];
};

export type AgentContextBundle = {
  classId: string;
  /** 특정 학생에 대한 질문이면 그 이름, 학급 전체 질문이면 null */
  studentName: string | null;
  domains: DomainContext[];
};

/**
 * studentId가 있으면 그 학생 한 명, 없으면 질문 문장에서 학생 이름을 찾아본다(페이지로 못 좁혔을 때의
 * 보조 경로 — 새 탭에서 연 리포트를 보며 원래 탭에서 물어보는 경우가 실제로 흔하다). 그래도 못 찾으면
 * 학급 전체 기준으로 3개 도메인 컨텍스트를 만든다.
 */
export async function buildAgentContext(studentId: string | null, question: string): Promise<AgentContextBundle> {
  const teacher = await getActingTeacher();
  const today = todayKst();

  const resolvedId = studentId ?? (await resolveStudentIdByName(teacher.classId, question));
  if (resolvedId) return buildStudentContext(teacher.classId, resolvedId, today);
  return buildClassContext(teacher.classId, today);
}

/**
 * 질문에 학급 학생 이름이 정확히 한 명만 등장하면 그 학생으로 본다 — 여러 명이 겹치면 함부로 안 좁힌다.
 *
 * (2026-09-19 수정) "민준이 오늘은 어때?"처럼 성 뺀 이름으로 부르면 전체 이름("김민준")과는 문자열이
 * 아예 안 겹쳐서 매칭에 실패했다 — 그러면 학급 전체 모드로 빠지는데, 그 상태에서 도메인별 컨텍스트를
 * 만들면 가정 연계 도메인은 필터 없이 "최근 학부모상담기록"을 가져와서 다른 학생(예: 이서연) 내용까지
 * 섞여 나온다. 전체 이름과 성 뺀 이름(3글자 이상일 때, interpretation/dailyAnalysis.ts의 buildNameMask와
 * 같은 방식) 둘 다 후보로 보되, 여러 학생이 겹치면 여전히 안 좁힌다(오매칭보다 안전한 쪽을 택함).
 */
async function resolveStudentIdByName(classId: string, question: string): Promise<string | null> {
  const students = await listClassStudents(classId);
  const matchedIds = new Set<string>();
  for (const s of students) {
    const surfaces = s.name.length >= 3 ? [s.name, s.name.slice(1)] : [s.name];
    if (surfaces.some((surface) => question.includes(surface))) matchedIds.add(s.studentId);
  }
  return matchedIds.size === 1 ? [...matchedIds][0] : null;
}

async function buildStudentContext(classId: string, studentId: string, today: string): Promise<AgentContextBundle> {
  const from = addDays(today, -(REPORT_DEFAULT_DAYS - 1));
  const report = await getConsultationReport(classId, studentId, from, today);
  if (!report) {
    return {
      classId,
      studentName: null,
      domains: [
        { domain: "emotion", text: "", evidence: [] },
        { domain: "learning", text: "", evidence: [] },
        { domain: "home", text: "", evidence: [] },
      ],
    };
  }

  const header = `[학생] ${report.student.name} (자리 ${report.student.seatRow}행 ${report.student.seatCol}열)`;

  // ── 정서: 신호등 색 + AI 대화 요약 + 감정 어휘 ─────────────────────
  const recentColors = report.sessions
    .slice(0, 6)
    .map((s) => `${s.date} ${s.period === "morning" ? "등교" : "하교"} ${COLOR_LABEL[s.color]}`);
  const recentAnalyses = report.analyses.slice(0, 3).map((a) => `- (${a.date}) ${a.summary}`);
  const emotionLines = [
    header,
    recentColors.length ? `[최근 신호등 색]\n${recentColors.join("\n")}` : "",
    recentAnalyses.length ? `[AI 대화 요약]\n${recentAnalyses.join("\n")}` : "",
    `[감정 어휘] 이 학생 ${report.vocabInsight.studentCount}개 · 학급 평균 ${report.vocabInsight.classAverage}개`,
  ].filter(Boolean);
  const emotionEvidence = [
    ...report.sessions.slice(0, 6).map((s) => `체크인 · ${s.date} ${s.period === "morning" ? "등교" : "하교"}`),
    ...report.analyses.slice(0, 3).map((a) => `AI 대화 요약 · ${a.date}`),
  ];

  // ── 학교생활 관찰: 학생관찰일지 ────────────────────────────────
  const recentObservations = report.observations
    .slice(0, 5)
    .map((o) => `- (${o.occurredAt.slice(0, 10)}) ${o.title ?? o.body.slice(0, 60)}`);
  const learningLines = [header, recentObservations.length ? `[학생관찰일지]\n${recentObservations.join("\n")}` : ""].filter(
    Boolean,
  );
  const learningEvidence = report.observations.slice(0, 5).map((o) => `학생관찰일지 · ${o.occurredAt.slice(0, 10)}`);

  // ── 가정 연계: 학부모상담기록 + 교우관계 ──────────────────────────
  const consultations = await listConsultationLogs(classId, { studentId: report.student.studentId });
  const recentConsultations = consultations
    .slice(0, 3)
    .map((c) => `- (${c.occurredAt.slice(0, 10)}) ${c.title}: ${c.body.slice(0, 80)}`);
  const relationLine = report.relationInsight.connections.length
    ? `[교우관계] ${report.relationInsight.connections.map((c) => `${c.name}${c.kind === "conflict" ? "(갈등 관계)" : ""}`).join(", ")}`
    : "";
  const homeLines = [
    header,
    recentConsultations.length ? `[학부모상담기록]\n${recentConsultations.join("\n")}` : "",
    relationLine,
  ].filter(Boolean);
  const homeEvidence = [
    ...consultations.slice(0, 3).map((c) => `학부모상담기록 · ${c.occurredAt.slice(0, 10)}`),
    ...(report.relationInsight.connections.length ? ["관계 지도 (대시보드 스냅샷)"] : []),
  ];

  return {
    classId,
    studentName: report.student.name,
    domains: [
      { domain: "emotion", text: emotionLines.join("\n\n"), evidence: emotionEvidence },
      { domain: "learning", text: learningLines.join("\n\n"), evidence: learningEvidence },
      { domain: "home", text: homeLines.join("\n\n"), evidence: homeEvidence },
    ],
  };
}

async function buildClassContext(classId: string, today: string): Promise<AgentContextBundle> {
  // ── 정서: 오늘 등교 색 현황 + 살펴볼 아이 ──────────────────────
  const seating = await getSeatingChart(classId, today);
  const colorCounts: Partial<Record<SignalColor, number>> = {};
  for (const s of seating) {
    if (s.todayMorning) colorCounts[s.todayMorning] = (colorCounts[s.todayMorning] ?? 0) + 1;
  }
  const colorLine = (Object.entries(colorCounts) as [SignalColor, number][])
    .map(([color, count]) => `${COLOR_LABEL[color]} ${count}명`)
    .join(", ");
  const watchList = seating.filter((s) => s.badge === "watch").map((s) => s.name);
  const emotionLines = [
    `[오늘(${today}) 등교 색 현황] ${colorLine || "기록 없음"}`,
    watchList.length ? `[오늘 살펴볼 아이] ${watchList.join(", ")}` : "",
  ].filter(Boolean);
  const emotionEvidence = [`오늘(${today}) 등교 체크인 집계`];

  // ── 학교생활 관찰: 최근 7일 학생관찰일지 ─────────────────────────
  const recentObservations = await listObservationLogs(classId, { from: addDays(today, -6), to: today });
  const obsLines = recentObservations
    .slice(0, 5)
    .map(
      (o) =>
        `- (${o.occurredAt.slice(0, 10)}) ${o.title ?? o.body.slice(0, 40)}${
          o.taggedStudents.length ? ` [${o.taggedStudents.map((t) => t.name).join(", ")}]` : ""
        }`,
    );
  const learningLines = obsLines.length ? [`[최근 7일 학생관찰일지]\n${obsLines.join("\n")}`] : [];
  const learningEvidence = recentObservations.slice(0, 5).map((o) => `학생관찰일지 · ${o.occurredAt.slice(0, 10)}`);

  // ── 가정 연계: 최근 학부모상담기록 ────────────────────────────
  // listConsultationLogs는 날짜 필터가 없어서(ConsultationFilter에 from/to 없음) 전체를 받아
  // occurredAt 기준으로 여기서 직접 최신순 정렬해 최근 것만 자른다.
  const consultations = await listConsultationLogs(classId, {});
  const sortedConsultations = [...consultations].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 3);
  const consultLines = sortedConsultations.map(
    (c) => `- (${c.occurredAt.slice(0, 10)}) ${c.student.name} · ${c.title}: ${c.body.slice(0, 60)}`,
  );
  const homeLines = consultLines.length ? [`[최근 학부모상담기록]\n${consultLines.join("\n")}`] : [];
  const homeEvidence = sortedConsultations.map((c) => `학부모상담기록 · ${c.occurredAt.slice(0, 10)} (${c.student.name})`);

  return {
    classId,
    studentName: null,
    domains: [
      { domain: "emotion", text: emotionLines.join("\n\n"), evidence: emotionEvidence },
      { domain: "learning", text: learningLines.join("\n\n"), evidence: learningEvidence },
      { domain: "home", text: homeLines.join("\n\n"), evidence: homeEvidence },
    ],
  };
}
