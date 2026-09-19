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

/**
 * (2026-09-19) 도메인 소견이 실제로 인용한 근거만 화면에 보여주기 위한 태그 접두사.
 * 컨텍스트 각 줄 앞에 "[EM1]"처럼 붙이고, evidence[i]와 같은 순번으로 맞춰둔다 — 모델이
 * 답변 끝에 "[USED] EM1,EM3"로 실제 인용한 태그만 돌려주면 route.ts가 그것만 골라 근거로 보여준다.
 * 이전엔 컨텍스트로 넘긴 원본 전체(예: 최근 3일치 체크인 6개)를 항상 근거 칩으로 다 보여줘서,
 * "오늘은 어때?"처럼 하루만 물어도 근거가 9개씩 붙어 답변 내용과 근거가 따로 노는 문제가 있었다.
 * prompt.ts(buildDomainSystemPrompt/buildLightSystemPrompt)가 이 태그를 어떻게 쓰라고 지시하는지 참고.
 */
export const DOMAIN_TAG: Record<AgentDomain, string> = { emotion: "EM", learning: "EL", home: "EH" };

/** 태그("EM1" 등) → 사람이 읽는 근거 문자열 맵. domains 전체를 넘기면 라이트 모드처럼 여러 도메인이 섞인
 * 답변에서도 태그 하나로 바로 근거를 찾을 수 있다. */
export function buildEvidenceIndex(domains: DomainContext[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const d of domains) {
    d.evidence.forEach((label, i) => index.set(`${DOMAIN_TAG[d.domain]}${i + 1}`, label));
  }
  return index;
}

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
  if (resolvedId) return buildStudentContext(teacher.classId, resolvedId, today, teacher.id);
  return buildClassContext(teacher.classId, today, teacher.id);
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

async function buildStudentContext(
  classId: string,
  studentId: string,
  today: string,
  viewerTeacherId?: string,
): Promise<AgentContextBundle> {
  const from = addDays(today, -(REPORT_DEFAULT_DAYS - 1));
  // (2026-09-20) getConsultationReport(김현우 소유, queries/teacherStudents.ts)는 아직
  // viewerTeacherId를 안 받는다 — 내부에서 부르는 listObservationLogsForStudent에도 아직
  // 안 흘러간다. 공개 데모 방문자 격리가 이 경로까지 완전해지려면 그쪽도 같이 고쳐야 해서
  // PR에서 김현우와 같이 확인 필요(내 파일 밖이라 여기서 임의로 안 고침).
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

  // "오늘은 어때?"처럼 질문에 시점이 있으면 도메인 에이전트가 "오늘"이 어느 날짜인지 알아야
  // 최근 며칠치 기록 중에서 그 시점에 맞는 것만 골라 답할 수 있다 — 없으면 그냥 전체를 뭉뚱그려
  // 요약해버린다(2026-09-19 확인된 버그: 종합의견은 시점에 맞게 답했지만 각 도메인 소견은
  // "오늘"을 무시하고 최근 며칠을 통째로 요약했다).
  const header = `[학생] ${report.student.name} (자리 ${report.student.seatRow}행 ${report.student.seatCol}열)\n[오늘] ${today}`;

  // ── 정서: 신호등 색 + AI 대화 요약 + 감정 어휘 ─────────────────────
  // 각 줄 앞 [EM숫자] 태그는 emotionEvidence의 같은 순번과 짝이다 — 모델이 실제로 인용한
  // 태그만 [USED]로 돌려주면 route.ts가 evidence 배열에서 그만큼만 골라 보여준다.
  const emoTag = DOMAIN_TAG.emotion;
  const recentSessions = report.sessions.slice(0, 6);
  const recentColors = recentSessions.map(
    (s, i) => `[${emoTag}${i + 1}] ${s.date} ${s.period === "morning" ? "등교" : "하교"} ${COLOR_LABEL[s.color]}`,
  );
  const recentAnalysesRaw = report.analyses.slice(0, 3);
  const recentAnalyses = recentAnalysesRaw.map(
    (a, i) => `[${emoTag}${recentSessions.length + i + 1}] (${a.date}) ${a.summary}`,
  );
  const emotionLines = [
    header,
    recentColors.length ? `[최근 신호등 색]\n${recentColors.join("\n")}` : "",
    recentAnalyses.length ? `[AI 대화 요약]\n${recentAnalyses.join("\n")}` : "",
    `[감정 어휘] 이 학생 ${report.vocabInsight.studentCount}개 · 학급 평균 ${report.vocabInsight.classAverage}개`,
  ].filter(Boolean);
  const emotionEvidence = [
    ...recentSessions.map((s) => `체크인 · ${s.date} ${s.period === "morning" ? "등교" : "하교"}`),
    ...recentAnalysesRaw.map((a) => `AI 대화 요약 · ${a.date}`),
  ];

  // ── 학교생활 관찰: 학생관찰일지 ────────────────────────────────
  const lrnTag = DOMAIN_TAG.learning;
  const recentObservationsRaw = report.observations.slice(0, 5);
  const recentObservations = recentObservationsRaw.map(
    (o, i) => `[${lrnTag}${i + 1}] (${o.occurredAt.slice(0, 10)}) ${o.title ?? o.body.slice(0, 60)}`,
  );
  const learningLines = [header, recentObservations.length ? `[학생관찰일지]\n${recentObservations.join("\n")}` : ""].filter(
    Boolean,
  );
  const learningEvidence = recentObservationsRaw.map((o) => `학생관찰일지 · ${o.occurredAt.slice(0, 10)}`);

  // ── 가정 연계: 학부모상담기록 + 교우관계 ──────────────────────────
  const homeTag = DOMAIN_TAG.home;
  const consultations = await listConsultationLogs(classId, { studentId: report.student.studentId }, viewerTeacherId);
  const recentConsultationsRaw = consultations.slice(0, 3);
  const recentConsultations = recentConsultationsRaw.map(
    (c, i) => `[${homeTag}${i + 1}] (${c.occurredAt.slice(0, 10)}) ${c.title}: ${c.body.slice(0, 80)}`,
  );
  const relationLine = report.relationInsight.connections.length
    ? `[${homeTag}${recentConsultationsRaw.length + 1}] [교우관계] ${report.relationInsight.connections.map((c) => `${c.name}${c.kind === "conflict" ? "(갈등 관계)" : ""}`).join(", ")}`
    : "";
  const homeLines = [
    header,
    recentConsultations.length ? `[학부모상담기록]\n${recentConsultations.join("\n")}` : "",
    relationLine,
  ].filter(Boolean);
  const homeEvidence = [
    ...recentConsultationsRaw.map((c) => `학부모상담기록 · ${c.occurredAt.slice(0, 10)}`),
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

async function buildClassContext(classId: string, today: string, viewerTeacherId?: string): Promise<AgentContextBundle> {
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
    `[${DOMAIN_TAG.emotion}1] [오늘(${today}) 등교 색 현황] ${colorLine || "기록 없음"}`,
    watchList.length ? `[오늘 살펴볼 아이] ${watchList.join(", ")}` : "",
  ].filter(Boolean);
  const emotionEvidence = [`오늘(${today}) 등교 체크인 집계`];

  // ── 학교생활 관찰: 최근 7일 학생관찰일지 ─────────────────────────
  const lrnTag = DOMAIN_TAG.learning;
  const recentObservationsRaw = await listObservationLogs(classId, { from: addDays(today, -6), to: today }, viewerTeacherId);
  const recentObservations = recentObservationsRaw.slice(0, 5);
  const obsLines = recentObservations.map(
    (o, i) =>
      `[${lrnTag}${i + 1}] (${o.occurredAt.slice(0, 10)}) ${o.title ?? o.body.slice(0, 40)}${
        o.taggedStudents.length ? ` [${o.taggedStudents.map((t) => t.name).join(", ")}]` : ""
      }`,
  );
  const learningLines = obsLines.length ? [`[오늘] ${today}`, `[최근 7일 학생관찰일지]\n${obsLines.join("\n")}`] : [];
  const learningEvidence = recentObservations.map((o) => `학생관찰일지 · ${o.occurredAt.slice(0, 10)}`);

  // ── 가정 연계: 최근 학부모상담기록 ────────────────────────────
  // listConsultationLogs는 날짜 필터가 없어서(ConsultationFilter에 from/to 없음) 전체를 받아
  // occurredAt 기준으로 여기서 직접 최신순 정렬해 최근 것만 자른다.
  const homeTag = DOMAIN_TAG.home;
  const consultations = await listConsultationLogs(classId, {}, viewerTeacherId);
  const sortedConsultations = [...consultations].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 3);
  const consultLines = sortedConsultations.map(
    (c, i) => `[${homeTag}${i + 1}] (${c.occurredAt.slice(0, 10)}) ${c.student.name} · ${c.title}: ${c.body.slice(0, 60)}`,
  );
  const homeLines = consultLines.length ? [`[오늘] ${today}`, `[최근 학부모상담기록]\n${consultLines.join("\n")}`] : [];
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
