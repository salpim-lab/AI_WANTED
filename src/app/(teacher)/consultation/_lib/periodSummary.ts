// 담당: 김현우
// 학부모 상담 리포트 맨 위 "기간 요약" — 기간 안의 날짜별 AI 분석과 그 아이가 태그된 학생 관찰일지를 모아 AI가 한 번 더 요약한다.
// 새 대화 원문은 보내지 않는다: 입력은 날짜별 분석 문장 + 그날 등교·하교 색 + 관찰일지(제목·본문)뿐이다.
// 이름 치환(기획안 8.9): 학급 명단의 이름을 [본인]/[친구N] 토큰으로 바꿔 보내고 응답은 되돌린다 (dailyAnalysis의 buildNameMask 재사용).
// 원본은 불변, 해석은 버전: 같은 학생·기간·입력 분석 묶음·prompt_version이면 저장된 결과를 재사용하고, 입력이 바뀌면 새 행을 추가한다.
// 서버 전용 — OPENAI_API_KEY를 쓴다. consultation/actions.ts에서만 import.
//
// 지금은 mock 저장소(mockAnalysisRuns)에 쓴다. Supabase 연결 시 analysis_runs
//   (analysis_type='consultation_period_summary', source_type='student', source_id=student_id) select/insert로 교체한다.

import "server-only";

import { SIGNAL_COLORS } from "@/lib/constants/colors";
import {
  DailyAnalysisUnavailableError,
  analysisModel,
  buildNameMask,
  callOpenAIJson,
} from "@/lib/supabase/interpretation/dailyAnalysis";
import { toKstDate } from "@/components/shared/datetime";
import { mockAnalysisRuns, type AnalysisRunRow } from "@/lib/supabase/raw/_mockTeacherData";
import type { ClassStudent, ConsultationReport } from "@/lib/types/teacherRecord";
import type { SignalColor } from "@/lib/types/signal";

export const PERIOD_SUMMARY_PROMPT_VERSION = "consultation-period-v2";
export { DailyAnalysisUnavailableError as PeriodSummaryUnavailableError };

const SYSTEM_PROMPT = `너는 초등학교 담임교사가 학부모 상담을 준비할 때 보는 자료의 "기간 요약"을 쓰는 보조다.
입력은 한 아이에 대해 날짜별로 이미 만들어 둔 AI 하루 요약, 그날 아이가 등교·하교 때 스스로 고른 마음 색,
그리고 담임교사가 그 아이를 태그해 남긴 학생 관찰일지(교사의 관찰, 아이와의 상담 기록)다.

요약 (3~4문장):
1. 기간 전체의 흐름 — 마음 색과 하루 요약에서 반복해서 나온 모습, 흐름이 달라진 시기가 있으면 그 변화.
2. 여러 날에 걸쳐 되풀이된 이야기(예: 친구 관계, 공부, 가정에서의 일)를 사실 위주로 묶는다.
   아이의 이야기(하루 요약)와 교사가 본 모습(관찰일지)이 같은 일을 가리키면 함께 엮고,
   교사 관찰은 "교실에서는 ~ 모습이 관찰됐습니다"처럼 출처가 드러나게 쓴다.
3. 마지막 문장: 상담에서 학부모와 함께 확인해볼 만한 점 하나 — "~를 함께 확인해보세요" 수준으로.

지켜야 할 선:
- 입력에 있는 내용만 쓴다. 없는 사건이나 원인을 지어내지 않는다. 가정·보호자를 탓하거나 원인을 단정하지 않는다.
- 상태는 추정으로만 쓴다. 진단명·점수·위험도·등급, "우울", "불안", "위험", "문제 행동" 같은 판정·임상 표현을 쓰지 않는다.
- 관찰일지에 나오는 갈등은 누가 옳은지 판단하지 않고 있었던 일로만 쓴다.
- 다른 아이와 비교하지 않는다. 특정 날짜를 나열하지 말고 "기간 초반", "최근 며칠"처럼 흐름으로 쓴다.
- 대괄호 토큰([본인], [친구1] 등)은 글자 그대로 옮긴다. 아이 본인은 주어를 생략한다.
- "~습니다" 체로 쓴다.`;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { summary: { type: "string" } },
  required: ["summary"],
};

export type PeriodSummary = { summary: string; analysisId: string };

type PeriodSummaryInput = {
  student: ClassStudent;
  classmates: ClassStudent[];
  from: string;
  to: string;
  /** 최근 → 오래된 순 (리포트 그대로) */
  analyses: ConsultationReport["analyses"];
  sessions: ConsultationReport["sessions"];
  /** 이 아이가 태그된 관찰일지 (리포트 그대로) */
  observations: ConsultationReport["observations"];
};

const OBSERVATION_KIND: Record<ConsultationReport["observations"][number]["recordType"], string> = {
  general: "교사 관찰",
  conflict: "교사 관찰(갈등)",
  student_consultation: "아이와의 상담",
};

const colorText = (color: SignalColor | null) => (color ? SIGNAL_COLORS[color].label : "기록 없음");

/** 날짜별로 그 시간대 마지막 시도의 색 */
function colorsByDate(sessions: PeriodSummaryInput["sessions"]) {
  const byDate = new Map<string, { morning: SignalColor | null; afternoon: SignalColor | null; attempts: Record<string, number> }>();
  for (const s of sessions) {
    const day = byDate.get(s.date) ?? { morning: null, afternoon: null, attempts: {} };
    if ((day.attempts[s.period] ?? 0) <= s.attempt) {
      day[s.period] = s.color;
      day.attempts[s.period] = s.attempt;
    }
    byDate.set(s.date, day);
  }
  return byDate;
}

function buildUserMessage(input: PeriodSummaryInput, mask: (text: string) => string): string {
  const colors = colorsByDate(input.sessions);
  const dates = [...new Set([...colors.keys(), ...input.analyses.map((a) => a.date)])].sort();
  const analysisByDate = new Map(input.analyses.map((a) => [a.date, a.summary]));
  const lines = dates.map((date) => {
    const day = colors.get(date);
    const summary = analysisByDate.get(date);
    return `- ${date} · 등교 ${colorText(day?.morning ?? null)} / 하교 ${colorText(day?.afternoon ?? null)}${
      summary ? ` · 하루 요약: ${mask(summary)}` : ""
    }`;
  });
  const observationLines = [...input.observations]
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((o) => {
      const text = [o.title, o.body].filter(Boolean).join(" / ").replace(/\s+/g, " ").trim();
      return `- ${toKstDate(o.occurredAt)} · ${OBSERVATION_KIND[o.recordType]}: ${mask(text)}`;
    });
  return [
    `[기간] ${input.from} ~ ${input.to}`,
    "[날짜별 마음 색과 하루 요약 (오래된 날 → 최근 날)]",
    ...(lines.length ? lines : ["- 없음"]),
    "",
    "[학생 관찰일지 - 담임교사 기록 (오래된 날 → 최근 날)]",
    ...(observationLines.length ? observationLines : ["- 없음"]),
  ].join("\n");
}

function sourceKey(input: PeriodSummaryInput): string {
  return [...input.analyses.map((a) => a.analysisId), ...input.observations.map((o) => `obs:${o.id}`)].sort().join(",");
}

async function findPeriodSummary(input: PeriodSummaryInput, key: string): Promise<AnalysisRunRow | null> {
  return (
    mockAnalysisRuns()
      .filter(
        (r) =>
          r.analysis_type === "consultation_period_summary" &&
          r.source_id === input.student.studentId &&
          r.prompt_version === PERIOD_SUMMARY_PROMPT_VERSION &&
          r.status === "completed" &&
          r.result.from === input.from &&
          r.result.to === input.to &&
          r.result.sourceKey === key,
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  );
}

/** 같은 입력에 대한 동시 요청(개발 모드 이중 effect 등)이 OpenAI를 두 번 부르지 않게 */
const globalForInflight = globalThis as typeof globalThis & {
  __salpimPeriodSummaryInflight?: Map<string, Promise<PeriodSummary | null>>;
};
const inflight = (globalForInflight.__salpimPeriodSummaryInflight ??= new Map());

/**
 * 기간 요약 하나를 돌려준다. 날짜별 분석도 관찰일지도 하나도 없으면 null (AI를 부르지 않는다).
 * 호출 전에 교사-학급 권한을 확인해야 한다 (getConsultationReport가 classId로 거른다).
 * 키가 없으면 PeriodSummaryUnavailableError.
 */
export async function getOrCreatePeriodSummary(input: PeriodSummaryInput): Promise<PeriodSummary | null> {
  if (input.analyses.length === 0 && input.observations.length === 0) return null;

  const key = sourceKey(input);
  const existing = await findPeriodSummary(input, key);
  if (existing) return { summary: String(existing.result.summary), analysisId: existing.id };

  const inflightKey = `${input.student.studentId}|${input.from}|${input.to}|${key}`;
  const pending = inflight.get(inflightKey);
  if (pending) return pending;

  const task = (async () => {
    const model = analysisModel();
    const mask = buildNameMask(input.student, input.classmates);
    const parsed = await callOpenAIJson({
      model,
      systemPrompt: SYSTEM_PROMPT,
      userMessage: buildUserMessage(input, mask.mask),
      schemaName: "consultation_period_summary",
      schema: OUTPUT_SCHEMA,
    });
    const raw = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    if (!raw) throw new Error("빈 요약을 받았습니다.");
    const summary = mask.unmask(raw);

    // created_at은 서버 시각 (Supabase에서는 DB default now())
    const saved: AnalysisRunRow = {
      id: crypto.randomUUID(),
      analysis_type: "consultation_period_summary",
      source_type: "student",
      source_id: input.student.studentId,
      provider: "openai",
      model,
      prompt_version: PERIOD_SUMMARY_PROMPT_VERSION,
      schema_version: 1,
      category_tags: [],
      moderation_flag: false,
      needs_followup: false,
      result: {
        summary,
        from: input.from,
        to: input.to,
        sourceKey: key,
        sourceAnalysisIds: input.analyses.map((a) => a.analysisId),
        sourceObservationIds: input.observations.map((o) => o.id),
        mentionedStudentIds: mask.mentionedStudentIds(),
      },
      status: "completed",
      error_message: null,
      created_at: new Date().toISOString(),
    };
    mockAnalysisRuns().push(saved);
    return { summary, analysisId: saved.id };
  })();

  inflight.set(inflightKey, task);
  try {
    return await task;
  } finally {
    inflight.delete(inflightKey);
  }
}
