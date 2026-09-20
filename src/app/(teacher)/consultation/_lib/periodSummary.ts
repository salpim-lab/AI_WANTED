// 담당: 김현우
// 학부모 상담 리포트 맨 위 "기간 요약" — 기간 안의 날짜별 AI 분석과 그 아이가 태그된 학생 관찰일지를 모아 AI가 한 번 더 요약한다.
// 새 대화 원문은 보내지 않는다: 입력은 날짜별 분석 문장 + 그날 등교·하교 색 + 관찰일지(제목·본문)뿐이다.
// 이름 치환(기획안 8.9): 학급 명단의 이름을 [본인]/[친구N] 토큰으로 바꿔 보내고 응답은 되돌린다 (dailyAnalysis의 buildNameMask 재사용).
// 원본은 불변, 해석은 버전: 같은 학생·기간·입력 분석 묶음·prompt_version이면 저장된 결과를 재사용하고, 입력이 바뀌면 새 행을 추가한다.
// 서버 전용 — OPENAI_API_KEY를 쓴다. consultation/actions.ts에서만 import.
//
// 저장: analysis_runs (analysis_type='consultation_period_summary', source_type='student',
//   source_id=DB student_id). DB를 못 읽는 환경(Supabase env 없음 등)에서는 예전처럼 서버 메모리
//   (mockAnalysisRuns)로 물러난다 — 시그니처는 그대로다.
// ⚠️ (2026-09-20, 이지현 제안대로 구현) demo_owner_id(1090 마이그레이션)를 반드시 채운다 —
//   source_type='student'는 모든 방문자가 같은 student_id를 공유해서 source_id만으로는 소유자를
//   가릴 수 없다. 안 채우면 1092의 analysis_runs_demo_owner_restrict가 이 행을 공용으로 취급해
//   다른 방문자에게도 보인다. select도 현재 방문자(공용 OR 본인)로 거른다.
//   방문자마다 입력(그 방문자가 만든 체크인·하루 요약)이 다르니 결과도 방문자별로 따로 쌓인다.
// 시드: 배포 전에 넣어 둔 아이별 기간 요약(provider='mock', prompt_version=SEED_PROMPT_VERSION)은
//   findSeedPeriodSummary로 따로 읽는다 — 아이 하나당 1행이고 기간·입력 묶음을 따지지 않는다(§findSeedPeriodSummary).

import "server-only";

import { SIGNAL_COLORS } from "@/lib/constants/colors";
import {
  DailyAnalysisUnavailableError,
  analysisModel,
  buildNameMask,
  callOpenAIJson,
} from "@/lib/supabase/interpretation/dailyAnalysis";
import { toKstDate } from "@/components/shared/datetime";
import { getDemoScope, ownerOrFilter, ownerToStore } from "@/lib/demo/scope";
import { SEED_PROMPT_VERSION } from "@/lib/supabase/queries/sessionSummaries";
import { MOCK_TEACHER, mockAnalysisRuns, recordDb, type AnalysisRunRow } from "@/lib/supabase/raw/_mockTeacherData";
import type { ClassStudent, ConsultationReport } from "@/lib/types/teacherRecord";
import type { SignalColor } from "@/lib/types/signal";

export const PERIOD_SUMMARY_PROMPT_VERSION = "consultation-period-v2";
export { DailyAnalysisUnavailableError as PeriodSummaryUnavailableError };

const ANALYSIS_TYPE = "consultation_period_summary";
/** 후보를 JS에서 거르므로 한 아이·한 버전당 읽어올 행 수 상한 */
const CANDIDATE_LIMIT = 50;

/**
 * 테스트 중 토큰 절약 — 목록이 설정돼 있으면 그 아이만 AI를 부른다
 * (/api/ai/daily-analysis와 같은 설정. 비어 있으면 제한 없음).
 */
function aiAllowedFor(studentId: string): boolean {
  const onlyIds = process.env.DAILY_ANALYSIS_ONLY_STUDENT_IDS?.split(",").map((id) => id.trim()).filter(Boolean);
  return !onlyIds?.length || onlyIds.includes(studentId);
}

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

/** 이 기간·이 입력 묶음으로 이미 만든 요약인가 */
const sameInput = (result: Record<string, unknown>, input: PeriodSummaryInput, key: string) =>
  result.from === input.from && result.to === input.to && result.sourceKey === key;

const summaryOf = (result: unknown): string =>
  typeof (result as { summary?: unknown } | null)?.summary === "string" ? String((result as { summary: string }).summary) : "";

/** DB 연결표 + 이 아이의 DB student_id. 둘 중 하나라도 없으면 null (메모리 경로로 물러난다) */
async function studentInDb(appStudentId: string) {
  try {
    const db = await recordDb(MOCK_TEACHER.classId);
    const dbStudentId = db?.dbStudentOf.get(appStudentId);
    return db && dbStudentId ? { db, dbStudentId } : null;
  } catch (error) {
    console.warn("[periodSummary] DB 연결표를 읽지 못했습니다:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * 배포 전에 넣어 둔 아이별 기간 요약 (analysis_runs, provider='mock', prompt_version=SEED_PROMPT_VERSION).
 * 실제로 쓰는 아이(민준)는 시드가 없어서 null이 나오고, 그때만 AI를 부른다.
 *
 * 기간·입력 묶음(sourceKey)을 따지지 않는다 — 시드는 아이 하나당 1행이고 result에 sourceKey가 없다.
 * 대신 요약이 실제로 설명하는 구간을 그대로 돌려주지 않고, 호출부가 리포트 기간을 "기록이 있는 범위"로
 * 좁혀 두기 때문에(queries/teacherStudents.ts getConsultationReport) 둘이 어긋나지 않는다.
 * 공용(demo_owner_id IS NULL) 행만 본다 — 방문자가 만든 행은 시드가 아니다.
 */
export async function findSeedPeriodSummary(appStudentId: string): Promise<PeriodSummary | null> {
  const found = await studentInDb(appStudentId);
  if (!found) return null;

  const { data, error } = await found.db.client
    .from("analysis_runs")
    .select("id, result")
    .eq("analysis_type", ANALYSIS_TYPE)
    .eq("source_type", "student")
    .eq("source_id", found.dbStudentId)
    .eq("provider", "mock")
    .eq("prompt_version", SEED_PROMPT_VERSION)
    .eq("status", "completed")
    .is("demo_owner_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[periodSummary] 시드 기간 요약을 읽지 못했습니다:", error.message);
    return null;
  }

  const summary = summaryOf(data?.result);
  return data && summary ? { summary, analysisId: data.id } : null;
}

async function findPeriodSummary(input: PeriodSummaryInput, key: string): Promise<PeriodSummary | null> {
  const found = await studentInDb(input.student.studentId);
  if (found) {
    const scope = await getDemoScope();
    let query = found.db.client
      .from("analysis_runs")
      .select("id, result")
      .eq("analysis_type", ANALYSIS_TYPE)
      .eq("source_type", "student")
      .eq("source_id", found.dbStudentId)
      .eq("prompt_version", PERIOD_SUMMARY_PROMPT_VERSION)
      .eq("status", "completed");
    // 방문자 격리 — 공용(NULL) + 현재 방문자 것만. 스코프가 꺼져 있으면 필터 없음
    const ownerFilter = ownerOrFilter(scope);
    if (ownerFilter) query = query.or(ownerFilter);

    const { data, error } = await query.order("created_at", { ascending: false }).limit(CANDIDATE_LIMIT);
    if (error) {
      console.warn("[periodSummary] 저장된 기간 요약을 읽지 못했습니다:", error.message);
    } else {
      const hit = (data ?? []).find(
        (row) => sameInput((row.result ?? {}) as Record<string, unknown>, input, key) && summaryOf(row.result),
      );
      if (hit) return { summary: summaryOf(hit.result), analysisId: hit.id };
      return null;
    }
  }

  // DB를 못 쓰는 환경 — 예전 메모리 저장소
  const mock =
    mockAnalysisRuns()
      .filter(
        (r) =>
          r.analysis_type === ANALYSIS_TYPE &&
          r.source_id === input.student.studentId &&
          r.prompt_version === PERIOD_SUMMARY_PROMPT_VERSION &&
          r.status === "completed" &&
          sameInput(r.result, input, key),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  return mock ? { summary: String(mock.result.summary), analysisId: mock.id } : null;
}

/** 같은 입력에 대한 동시 요청(개발 모드 이중 effect 등)이 OpenAI를 두 번 부르지 않게 */
const globalForInflight = globalThis as typeof globalThis & {
  __salpimPeriodSummaryInflight?: Map<string, Promise<PeriodSummary | null>>;
};
const inflight = (globalForInflight.__salpimPeriodSummaryInflight ??= new Map());

/**
 * AI 성공 뒤에만 부른다. analysis_runs에 1행 남기고, DB를 못 쓰면 서버 메모리로 물러난다
 * (이미 돈을 쓴 결과라 저장 실패로 버리지 않는다 — 다만 메모리는 인스턴스가 갈리면 사라진다).
 * demo_owner_id를 여기서 채우는 게 방문자 격리의 핵심이다 (파일 머리말 참고).
 */
async function savePeriodSummary(
  input: PeriodSummaryInput,
  key: string,
  model: string,
  result: Record<string, unknown> & { summary: string },
): Promise<PeriodSummary> {
  const found = await studentInDb(input.student.studentId);
  if (found) {
    const { data, error } = await found.db.client
      .from("analysis_runs")
      .insert({
        analysis_type: ANALYSIS_TYPE,
        source_type: "student",
        source_id: found.dbStudentId,
        demo_owner_id: ownerToStore(await getDemoScope()),
        provider: "openai",
        model,
        prompt_version: PERIOD_SUMMARY_PROMPT_VERSION,
        schema_version: 1,
        status: "completed",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result: result as any,
      })
      .select("id")
      .single();
    if (!error && data) return { summary: result.summary, analysisId: data.id };
    console.warn("[periodSummary] 기간 요약을 저장하지 못했습니다:", error?.message);
  }

  // created_at은 서버 시각 (DB 경로에서는 default now())
  const saved: AnalysisRunRow = {
    id: crypto.randomUUID(),
    analysis_type: ANALYSIS_TYPE,
    source_type: "student",
    source_id: input.student.studentId,
    provider: "openai",
    model,
    prompt_version: PERIOD_SUMMARY_PROMPT_VERSION,
    schema_version: 1,
    category_tags: [],
    moderation_flag: false,
    needs_followup: false,
    result: { ...result, sourceKey: key },
    status: "completed",
    error_message: null,
    created_at: new Date().toISOString(),
  };
  mockAnalysisRuns().push(saved);
  return { summary: result.summary, analysisId: saved.id };
}

/**
 * 기간 요약 하나를 돌려준다. 날짜별 분석도 관찰일지도 하나도 없으면 null (AI를 부르지 않는다).
 * 호출 전에 교사-학급 권한을 확인해야 한다 (getConsultationReport가 classId로 거른다).
 * 키가 없으면 PeriodSummaryUnavailableError.
 */
export async function getOrCreatePeriodSummary(input: PeriodSummaryInput): Promise<PeriodSummary | null> {
  if (input.analyses.length === 0 && input.observations.length === 0) return null;

  const key = sourceKey(input);
  const existing = await findPeriodSummary(input, key);
  if (existing) return existing;

  // 저장된 요약이 없을 때만 AI를 부른다 — 그래서 이 확인은 조회 뒤에 온다.
  // (조회 앞에 두면 이미 만들어 둔 공용 요약조차 대상 밖 아이에게 못 쓰이게 막힌다.)
  if (!aiAllowedFor(input.student.studentId)) {
    throw new DailyAnalysisUnavailableError("테스트 대상 학생이 아닙니다 (DAILY_ANALYSIS_ONLY_STUDENT_IDS).");
  }

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

    return savePeriodSummary(input, key, model, {
      summary,
      from: input.from,
      to: input.to,
      sourceKey: key,
      sourceAnalysisIds: input.analyses.map((a) => a.analysisId),
      sourceObservationIds: input.observations.map((o) => o.id),
      mentionedStudentIds: mask.mentionedStudentIds(),
    });
  })();

  inflight.set(inflightKey, task);
  try {
    return await task;
  } finally {
    inflight.delete(inflightKey);
  }
}
