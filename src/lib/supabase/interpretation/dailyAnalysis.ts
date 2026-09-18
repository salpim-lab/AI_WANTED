// 담당: 김현우 (2026-09-18 구현 — 원래 이지현 배정. 담당 이관은 PR에서 이지현 님과 협의)
// 해석/버전 데이터 — 아이 상세 "AI 분석"(색·발화·대화를 엮어 그날 상태를 추정하는 2문장 요약)을 만들어 analysis_runs(analysis_type='session_summary')에 쌓는다.
// 참고: docs/planning/살핌_DB_스키마_v0.3.md §5.1 analysis_runs / 살핌_기획안.md 8.9 이름 치환, 10 가드레일
//
// 입력: 그날 등하교 세션의 아이가 고른 색 + 대화 전문 + 발화 측정값(checkin_sessions.prosody, 1080)
//   + 직전 7일의 색 흐름과 그날들의 추정 상태(과거 전문은 보내지 않는다).
//   측정값은 감정 판정이 아니라 관찰 근거다. 기준선이 2주 미만이면 숫자를 모델에 아예 보내지 않는다.
// 이름 치환: 학급 명단의 이름을 [본인]/[친구N] 토큰으로 바꿔서 보내고, 응답은 되돌린다.
//   토큰 ↔ student_id 연결표는 이 요청 안(서버 메모리)에만 있다. student_id 자체는 외부로 보내지 않는다.
// 원본은 불변, 해석은 버전: 같은 입력(마지막 세션 + prompt_version)에 대한 완료 행이 있으면 재사용하고,
//   하교 세션이 새로 생기는 등 입력이 바뀌면 새 행을 추가한다. 기존 행을 고치지 않는다.
//   → 등교만 있을 때는 등교 기준 분석(오늘 수업 중 살필 점), 하교가 들어오면 등교+하교 분석(내일 등교 때 살필 점)이 새로 생긴다.
// 서버 전용 — OPENAI_API_KEY를 쓴다. Route Handler에서만 import.
//
// 지금은 mock 저장소(_mockTeacherData.mockAnalysisRuns)에 쓴다. Supabase 연결 시 findDailyAnalysis/insertDailyAnalysis
// 본문만 analysis_runs select/insert로 교체한다.

import "server-only";

import { SIGNAL_COLORS } from "@/lib/constants/colors";
import { mockAnalysisRuns, type AnalysisRunRow } from "@/lib/supabase/raw/_mockTeacherData";
import type {
  AnalysisInputSession,
  ClassStudent,
  DailyAnalysisInput,
  StoredSessionProsody,
} from "@/lib/types/teacherRecord";

export const DAILY_ANALYSIS_PROMPT_VERSION = "daily-summary-v7";
const DEFAULT_MODEL = "gpt-4.1-mini";
const OPENAI_TIMEOUT_MS = 20_000;
/** 기획안: 기준선이 쌓이기 전(첫 2주)에는 측정값을 해석하지 않는다 */
const MIN_BASELINE_DAYS = 14;

/** OPENAI_API_KEY가 없을 때 — 라우트가 501로 돌려서 화면이 "API 연결 전 · 예시"를 보여주게 한다 */
export class DailyAnalysisUnavailableError extends Error {}

export type DailyAnalysis = {
  summary: string;
  analysisId: string;
  /** 분석에 들어간 시간대 — 등교만이면 ["morning"], 하교까지면 ["morning", "afternoon"] */
  periods: AnalysisInputSession["period"][];
};

// ── analysis_runs 조회·저장 (mock) ──────────────────────────

async function findDailyAnalysis(sourceSessionId: string): Promise<AnalysisRunRow | null> {
  return (
    mockAnalysisRuns()
      .filter(
        (r) =>
          r.source_id === sourceSessionId &&
          r.analysis_type === "session_summary" &&
          r.prompt_version === DAILY_ANALYSIS_PROMPT_VERSION &&
          r.status === "completed",
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  );
}

async function insertDailyAnalysis(row: Omit<AnalysisRunRow, "id" | "created_at">): Promise<AnalysisRunRow> {
  // created_at은 서버 시각 (Supabase에서는 DB default now())
  const saved: AnalysisRunRow = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  mockAnalysisRuns().push(saved);
  return saved;
}

// ── 이름 치환 (기획안 8.9) ─────────────────────────────────

export type NameMask = {
  mask: (text: string) => string;
  unmask: (text: string) => string;
  mentionedStudentIds: () => string[];
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 학급 명단의 전체 이름("김민준")과 성을 뺀 이름("민준")을 찾아 토큰으로 바꾼다. "민준이가"처럼 호칭·조사가
 * 붙어도 이름 부분만 바뀐다. 같은 이름이 두 명 이상이면 누구인지 단정하지 않고 [이름N] 토큰을 쓴다.
 * 되돌릴 때는 원문에 나온 표기로 돌려놓는다 — "지우개"의 "지우"처럼 이름이 아닌 곳이 잘못 잡혀도 원문이 복원된다.
 * 한계: 별명이나 명단에 없는 표기는 잡지 못한다. 반대로 "지우개"처럼 이름이 든 낱말은 과하게 가려진다
 *   (새는 것보다 과하게 가리는 쪽을 택했다). 그 경우 mentionedStudentIds에도 잘못 들어갈 수 있다.
 */
export function buildNameMask(subject: ClassStudent, classmates: ClassStudent[]): NameMask {
  const idsBySurface = new Map<string, string[]>();
  const add = (surface: string, studentId: string) => {
    const ids = idsBySurface.get(surface) ?? [];
    if (!ids.includes(studentId)) idsBySurface.set(surface, [...ids, studentId]);
  };
  for (const s of classmates) {
    add(s.name, s.studentId);
    if (s.name.length >= 3) add(s.name.slice(1), s.studentId);
  }
  const surfaces = [...idsBySurface.keys()].sort((a, b) => b.length - a.length);
  const pattern = surfaces.length ? new RegExp(surfaces.map(escapeRegExp).join("|"), "g") : null;

  const tokenByKey = new Map<string, string>();
  const surfaceByToken = new Map<string, string>();
  const mentioned = new Set<string>();
  let friendCount = 0;
  let ambiguousCount = 0;

  const tokenFor = (surface: string): string => {
    const ids = idsBySurface.get(surface) ?? [];
    const key = ids.length === 1 ? ids[0] : `ambiguous:${surface}`;
    let token = tokenByKey.get(key);
    if (!token) {
      if (ids.length !== 1) token = `[이름${++ambiguousCount}]`;
      else if (ids[0] === subject.studentId) token = "[본인]";
      else token = `[친구${++friendCount}]`;
      tokenByKey.set(key, token);
    }
    if (ids.length === 1 && ids[0] !== subject.studentId) mentioned.add(ids[0]);
    // 같은 아이를 "지훈"·"한지훈" 둘 다로 불렀으면 되돌릴 때는 긴 표기(전체 이름)를 쓴다
    if ((surfaceByToken.get(token)?.length ?? 0) < surface.length) surfaceByToken.set(token, surface);
    return token;
  };

  return {
    mask: (text) => (pattern ? text.replace(pattern, tokenFor) : text),
    unmask: (text) =>
      text.replace(/\[(본인|친구\d+|이름\d+)\]/g, (token) => {
        const surface = surfaceByToken.get(token);
        if (surface) return surface;
        // 모델이 입력에 없던 토큰을 만들어 냈으면 이름을 지어내지 않는다
        return token === "[본인]" ? subject.name.slice(-2) : "친구";
      }),
    mentionedStudentIds: () => [...mentioned],
  };
}

// ── 프롬프트 ──────────────────────────────────────────────

const PERIOD_LABEL: Record<AnalysisInputSession["period"], string> = { morning: "등교", afternoon: "하교" };
const SPEAKER_LABEL = { student: "아이", assistant: "도우미", system: "안내" } as const;

const SYSTEM_PROMPT = `너는 초등학교 담임교사가 보는 "아이 상세" 화면에 들어갈 하루 요약을 쓰는 보조다.
교사가 대화 원문을 다 읽지 않아도 오늘 이 아이의 마음 상태를 짐작할 수 있게, 근거를 엮어 "추정"해 준다.

입력:
- 마음 색: 아이가 등교·하교 때 스스로 고른 색. 괄호 안 문구는 그 색 버튼의 뜻이다(아이의 자기 보고).
- 대화 전문: 도우미와 아이가 나눈 말.
- 발화 측정값: 아이 목소리에서 잰 값. "음량 본인 평소 대비"만 그 아이의 평소와 비교한 값이고,
  첫 대답까지 걸린 시간·말 속도·중간 멈춤은 그날의 절대값이다. 절대값은 같은 날 등교와 하교끼리만 비교하고,
  "평소보다"라고 쓰지 않는다. 측정값이 없거나 "해석하지 않음"이면 측정값은 쓰지 않는다.
- 최근 며칠 흐름: 분석 날짜 전 며칠의 등교·하교 색과, 그날 이미 추정해 둔 상태(있을 때만).

[분석 시점]이 둘 중 하나로 주어진다:
- "등교 직후(하교 전)": 등교 데이터만 있다. 교사가 오늘 수업 중에 읽는다.
- "하교 후": 등교와 하교 데이터가 다 있다. 교사가 하교 뒤에 읽고 다음 날 아침을 준비한다.

추론 방법 (머릿속으로만 하고 문장에 늘어놓지 않는다):
- 색이 등교에서 하교로 어떻게 바뀌었는지, 발화가 그 색과 같은 방향인지 어긋나는지(예: 초록을 골랐지만 목소리가 작고 대답이 늦음)를
  대화 내용과 함께 엮어 그날 아이의 마음 상태와 그 변화를 추정한다.
- 최근 며칠 흐름과 견주어, 오늘이 며칠째 이어지는 흐름인지, 오늘 달라진 것인지를 본다.
  과거 흐름은 오늘을 읽는 배경일 뿐이다. 과거에 있었던 사건을 지어내지 않는다.

요약 (정확히 2문장):
1. 대화에 나온 일과 함께 추정되는 상태 — 반드시 추정으로 쓴다.
   - 등교 직후: 등교 때의 상태만 쓴다("~한 일로 마음이 가라앉은 채 등교한 것으로 추정됩니다"). 하교를 짐작하지 않는다.
   - 하교 후: 등교에서 하교로의 변화까지 쓴다("~한 일로 ~하다가 ~한 것으로 추정됩니다").
   최근 흐름과 이어지거나 달라진 점이 뚜렷하면 함께 쓴다(예: "며칠째 가라앉은 흐름이 이어지는 가운데", "어제까지와 달리").
2. 교사가 할 일 — 오늘 대화에 나온 구체적인 일을 짚는다.
   - 등교 직후: "오늘 수업 중에 ~를 살펴보세요/확인해보세요".
   - 하교 후: "내일 등교 때 ~를 살펴보세요/확인해보세요".
- 고른 색 이름, 측정값(초·음량·속도), 날짜, "발화", "측정값", "색과 일치" 같은 근거 설명은 문장에 쓰지 않는다. 근거는 추론에만 쓴다.

지켜야 할 선:
- 상태는 추정만 한다. 확정("~입니다", "~한 아이다")하지 않는다.
- 진단명·점수·위험도·등급, "우울", "불안장애", "위험", "문제 행동" 같은 판정·임상 표현을 쓰지 않는다.
  "마음이 가라앉아 있던", "지쳐 있던", "조금 풀린", "긴장한 듯한"처럼 일상어로 쓴다.
- 대화에 없는 사건을 지어내지 않는다. 추정은 색·측정값·아이가 한 말에서만 끌어낸다.
- 다른 아이와 비교하지 않는다.
- 대괄호 토큰([본인], [친구1], [이름1] 등)은 글자 그대로 옮긴다. 실제 이름을 추측해 넣지 않는다. 아이 본인은 주어를 생략한다.
- "~습니다" 체로 쓴다.
- state_estimate에는 추정 상태를 짧은 구로 넣는다(예: "아침에 가라앉았다가 하교 무렵 조금 풀린 상태").
- evidence_message_ids에는 근거가 된 대화 줄 번호(m1, m2 …)를 넣는다.

문체 예시(내용은 지어낸 예시이니 사실로 쓰지 말 것):
"며칠째 가라앉은 흐름이 이어지는 가운데, 아침에 [친구1]와 다툰 일로 마음이 더 무거웠다가 오후에는 조금 풀린 것으로 추정됩니다. 내일 등교 때 [친구1]와의 일이 잘 마무리됐는지 확인해보세요."`;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "state_estimate", "keywords", "evidence_message_ids"],
  properties: {
    summary: { type: "string", description: "추정 상태 + 살펴볼 점, 2문장" },
    state_estimate: { type: "string", description: "추정 상태 한 구절" },
    keywords: { type: "array", items: { type: "string" }, description: "대화에 나온 핵심 낱말 0~5개" },
    evidence_message_ids: { type: "array", items: { type: "string" } },
  },
} as const;

const signed = (value: number) => `${value > 0 ? "+" : ""}${Math.round(value * 100)}%`;

/** 측정값은 계산(코드)으로 정리하고, 모델에는 관찰 문장만 준다 (기획안 8.12 "이상징후 지표는 코드") */
function describeProsody(prosody: StoredSessionProsody | null): string {
  if (!prosody || prosody.utterances.length === 0) return "측정값 없음";
  if (prosody.baseline_days < MIN_BASELINE_DAYS) {
    return `기준선 ${prosody.baseline_days}일 — 2주 미만이라 해석하지 않음`;
  }
  const lines = prosody.utterances.map((u, i) => {
    const parts = [`첫 대답까지 ${u.response_delay_sec}초`, `발화 ${u.duration_sec}초`];
    if (u.syllables_per_sec !== undefined) parts.push(`초당 ${u.syllables_per_sec}음절`);
    parts.push(u.silence_count ? `중간 멈춤 ${u.silence_count}회(${u.silence_total_sec}초)` : "중간 멈춤 없음");
    if (u.loudness_rel !== undefined) parts.push(`음량 본인 평소 대비 ${signed(u.loudness_rel)}`);
    return `  - 아이 발화 ${i + 1}: ${parts.join(", ")}`;
  });
  return [`기준선 ${prosody.baseline_days}일`, ...lines].join("\n");
}

export function buildUserMessage(input: DailyAnalysisInput, mask: NameMask, lineIdToMessageId: Map<string, string>): string {
  let line = 0;
  const blocks = input.sessions.map((s) => {
    const color = SIGNAL_COLORS[s.color];
    const header = `[${PERIOD_LABEL[s.period]}${s.attempt > 1 ? ` ${s.attempt}번째 시도` : ""}] 고른 색: ${color.name}(${color.label})${
      s.status === "stopped" ? " · 대화가 중간에 멈춤" : ""
    }`;
    const turns = s.turns.map((t) => {
      const id = `m${++line}`;
      lineIdToMessageId.set(id, t.messageId);
      return `${id} ${SPEAKER_LABEL[t.speaker]}: ${mask.mask(t.content)}`;
    });
    return [header, ...turns, `[${PERIOD_LABEL[s.period]} 발화 측정값]`, describeProsody(s.prosody)].join("\n");
  });
  const phase = hasAfternoon(input) ? "하교 후" : "등교 직후(하교 전)";
  return `[날짜] ${input.date}\n[분석 시점] ${phase}\n\n${blocks.join("\n\n")}\n\n${describePastDays(input, mask)}`;
}

const hasAfternoon = (input: DailyAnalysisInput) => input.sessions.some((s) => s.period === "afternoon");

/** 분석에 들어간 시간대 — 화면에 "등교 기준" / "등교·하교 기준"으로 표시한다 */
function analysisPeriods(input: DailyAnalysisInput): AnalysisInputSession["period"][] {
  return (["morning", "afternoon"] as const).filter((p) => input.sessions.some((s) => s.period === p));
}

/** 직전 며칠의 색 흐름과, 그날 이미 만든 분석의 추정 상태. 과거 대화 전문은 보내지 않는다 (토큰·노출 최소화) */
function describePastDays(input: DailyAnalysisInput, mask: NameMask): string {
  const colorName = (color: DailyAnalysisInput["pastDays"][number]["morning"]) => (color ? SIGNAL_COLORS[color].name : "없음");
  const lines = input.pastDays.map((d) => {
    const estimate = d.stateEstimate ? ` · 그날 추정: ${mask.mask(d.stateEstimate)}` : "";
    return `- ${d.date} 등교 ${colorName(d.morning)} / 하교 ${colorName(d.afternoon)}${estimate}`;
  });
  return [`[최근 ${input.pastDays.length}일 흐름]`, ...lines].join("\n");
}

// ── OpenAI (Responses API, fetch 직접 호출 — 패키지 설치 없이) ──────────

type ModelOutput = { summary: string; state_estimate: string; keywords: string[]; evidence_message_ids: string[] };

/** 이 파일과 teacherComment.ts가 쓰는 모델 (기본 gpt-4.1-mini, OPENAI_ANALYSIS_MODEL로 바꿀 수 있음) */
export const analysisModel = () => process.env.OPENAI_ANALYSIS_MODEL?.trim() || DEFAULT_MODEL;

/** system + user 한 번 호출 → JSON Schema(strict)로 강제한 응답을 파싱해 돌려준다. 키가 없으면 DailyAnalysisUnavailableError */
export async function callOpenAIJson(options: {
  model: string;
  systemPrompt: string;
  userMessage: string;
  schemaName: string;
  schema: object;
  temperature?: number;
}): Promise<Record<string, unknown>> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new DailyAnalysisUnavailableError("OPENAI_API_KEY 설정이 필요합니다.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: options.model,
      input: [
        { role: "system", content: options.systemPrompt },
        { role: "user", content: options.userMessage },
      ],
      text: { format: { type: "json_schema", name: options.schemaName, strict: true, schema: options.schema } },
      temperature: options.temperature ?? 0.3,
      max_output_tokens: 500,
    }),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`OpenAI 호출 실패 (HTTP ${response.status}): ${detail}`);
  }

  type Body = { status?: string; output?: { type: string; content?: { type: string; text?: string }[] }[] };
  const data = (await response.json()) as Body;
  if (data.status && data.status !== "completed") throw new Error(`OpenAI 응답이 완료되지 않았습니다: ${data.status}`);
  const content = (data.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  if (content.some((c) => c.type === "refusal")) throw new Error("모델이 답변을 거부했습니다.");
  const text = content
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");
  return JSON.parse(text) as Record<string, unknown>;
}

async function callModel(model: string, userMessage: string): Promise<ModelOutput> {
  const parsed = (await callOpenAIJson({
    model,
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    schemaName: "daily_summary",
    schema: OUTPUT_SCHEMA,
  })) as Partial<ModelOutput>;
  if (typeof parsed.summary !== "string" || !parsed.summary.trim()) throw new Error("빈 요약을 받았습니다.");
  return {
    summary: parsed.summary.trim(),
    state_estimate: typeof parsed.state_estimate === "string" ? parsed.state_estimate.trim() : "",
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter((k) => typeof k === "string") : [],
    evidence_message_ids: Array.isArray(parsed.evidence_message_ids)
      ? parsed.evidence_message_ids.filter((k) => typeof k === "string")
      : [],
  };
}

// ── 진입점 ───────────────────────────────────────────────

/** 같은 세션에 대한 동시 요청(개발 모드 이중 effect 등)이 OpenAI를 두 번 부르지 않게 */
const globalForInflight = globalThis as typeof globalThis & {
  __salpimDailyAnalysisInflight?: Map<string, Promise<DailyAnalysis | null>>;
};
const inflight = (globalForInflight.__salpimDailyAnalysisInflight ??= new Map());

/**
 * 아이 상세 카드용 — 등교 기준 분석과 등교·하교 기준 분석을 함께 돌려준다.
 * - 하교 전: morning만 (full은 null)
 * - 하교 후: morning(등교 데이터만으로 추정) + full(등교+하교). 등교 분석을 하교 전에 만든 적이 없으면 이때 만든다.
 * 호출 전에 교사-학급 권한을 확인해야 한다 (getDailyAnalysisInput이 classId로 거른다).
 */
export async function getOrCreateDayAnalyses(
  input: DailyAnalysisInput,
): Promise<{ morning: DailyAnalysis | null; full: DailyAnalysis | null }> {
  const morningInput = { ...input, sessions: input.sessions.filter((s) => s.period === "morning") };
  const [morning, full] = await Promise.all([
    morningInput.sessions.length ? getOrCreateDailyAnalysis(morningInput) : null,
    hasAfternoon(input) ? getOrCreateDailyAnalysis(input) : null,
  ]);
  return { morning, full };
}

/**
 * 주어진 세션들로 요약 하나를 돌려준다. 이미 만든 게 있으면 재사용, 없으면 만들어서 저장한다.
 * 아이 음성 발화가 하나도 없으면(세션 없음, 남색만 등) 요약하지 않고 null.
 */
async function getOrCreateDailyAnalysis(input: DailyAnalysisInput): Promise<DailyAnalysis | null> {
  const hasStudentSpeech = input.sessions.some((s) => s.turns.some((t) => t.speaker === "student"));
  if (!hasStudentSpeech) return null;

  // 입력의 "버전" = 그날 마지막 세션. 하교 세션이 생기면 새 분석을 만든다.
  const source = input.sessions[input.sessions.length - 1];
  const existing = await findDailyAnalysis(source.sessionId);
  if (existing) return { summary: String(existing.result.summary), analysisId: existing.id, periods: analysisPeriods(input) };

  const pending = inflight.get(source.sessionId);
  if (pending) return pending;

  const task = (async () => {
    const model = analysisModel();
    const mask = buildNameMask(input.student, input.classmates);
    const lineIdToMessageId = new Map<string, string>();
    const output = await callModel(model, buildUserMessage(input, mask, lineIdToMessageId));

    const summary = mask.unmask(output.summary);
    const saved = await insertDailyAnalysis({
      analysis_type: "session_summary",
      source_type: "session",
      source_id: source.sessionId,
      provider: "openai",
      model,
      prompt_version: DAILY_ANALYSIS_PROMPT_VERSION,
      schema_version: 1,
      category_tags: [],
      moderation_flag: false,
      needs_followup: false,
      result: {
        summary,
        stateEstimate: mask.unmask(output.state_estimate),
        periods: analysisPeriods(input),
        keywords: output.keywords.map(mask.unmask),
        evidenceMessageIds: output.evidence_message_ids
          .map((id) => lineIdToMessageId.get(id))
          .filter((id): id is string => Boolean(id)),
        sourceSessionIds: input.sessions.map((s) => s.sessionId),
        mentionedStudentIds: mask.mentionedStudentIds(),
        prosodyUsed: input.sessions.some(
          (s) => s.prosody !== null && s.prosody.baseline_days >= MIN_BASELINE_DAYS && s.prosody.utterances.length > 0,
        ),
      },
      status: "completed",
      error_message: null,
    });
    return { summary, analysisId: saved.id, periods: analysisPeriods(input) };
  })();

  inflight.set(source.sessionId, task);
  try {
    return await task;
  } finally {
    inflight.delete(source.sessionId);
  }
}
