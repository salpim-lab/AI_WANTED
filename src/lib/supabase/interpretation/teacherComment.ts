// 담당: 김현우 (2026-09-18 구현 — 원래 이유민 배정. 담당 이관은 PR에서 이유민 님과 협의)
// 해석/버전 데이터 — 아이 상세 "선생님의 한마디" AI 초안을 만들어 feedback_drafts(draft_text) + feedback_sources에 쌓는다.
// 참고: docs/planning/살핌_DB_스키마_v0.3.md §8.1 feedback_drafts, §8.2 feedback_sources / 살핌_기획안.md 8.9, 10
//
// 입력은 AI 하루 분석과 같다(그날 색·대화 전문·발화 측정값 + 최근 흐름). 이름 치환·OpenAI 호출도 dailyAnalysis.ts 것을 쓴다.
// 초안은 교사가 다음 날 아이에게 건넬 말의 "제안"일 뿐이다 (기획안 10장 AI 대필 금지):
//   draft_text는 불변으로 남기고, 교사가 고친 최종본(final_text) 저장은 별도 라우트 — 자동 발송·자동 저장 없음.
// 같은 입력(그날 마지막 세션)에 대한 초안이 있으면 재사용하고, 하교 세션이 생기면 새 초안을 추가한다.
// 서버 전용 — Route Handler에서만 import.
//
// 지금은 mock 저장소(_mockTeacherData.mockFeedback)에 쓴다. Supabase 연결 시 findDraft/insertDraft 본문만 교체한다.

import "server-only";

import {
  analysisModel,
  buildNameMask,
  buildUserMessage,
  callOpenAIJson,
} from "@/lib/supabase/interpretation/dailyAnalysis";
import { MOCK_STUDENTS, mockFeedback, type FeedbackDraftRow } from "@/lib/supabase/raw/_mockTeacherData";
import type { DailyAnalysisInput } from "@/lib/types/teacherRecord";

export const COMMENT_DRAFT_PROMPT_VERSION = "comment-draft-v4";
const MAX_DRAFT_LENGTH = 200;

// ── feedback_drafts 조회·저장 (mock) ────────────────────────

async function findDraft(sourceSessionId: string): Promise<FeedbackDraftRow | null> {
  const { drafts, sources } = mockFeedback();
  const ids = new Set(sources.filter((s) => s.session_id === sourceSessionId).map((s) => s.feedback_id));
  return (
    drafts
      .filter((d) => ids.has(d.id) && d.created_by === "ai" && d.prompt_version === COMMENT_DRAFT_PROMPT_VERSION)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  );
}

async function insertDraft(studentId: string, draftText: string, sessionIds: string[]): Promise<FeedbackDraftRow> {
  // enrollment_id 변환은 데이터 계층 안에서만 (Supabase에서는 v_students_current)
  const enrollmentId = MOCK_STUDENTS.find((s) => s.student_id === studentId)?.enrollment_id;
  if (!enrollmentId) throw new Error("학생을 찾을 수 없습니다.");
  const row: FeedbackDraftRow = {
    id: crypto.randomUUID(),
    enrollment_id: enrollmentId,
    draft_text: draftText,
    final_text: null,
    status: "pending",
    created_by: "ai",
    created_at: new Date().toISOString(), // 서버 시각 (Supabase에서는 DB default now())
    sent_at: null,
    prompt_version: COMMENT_DRAFT_PROMPT_VERSION,
  };
  const store = mockFeedback();
  store.drafts.push(row);
  store.sources.push(...sessionIds.map((sessionId) => ({ feedback_id: row.id, session_id: sessionId })));
  return row;
}

// ── 프롬프트 ──────────────────────────────────────────────

const SYSTEM_PROMPT = `너는 초등학교 담임교사가 반 아이에게 건넬 "선생님의 한마디" 초안을 쓰는 보조다.
교사는 이 초안을 읽고 고쳐서 저장하고, 아이는 다음 날 아침 등교할 때 이 말을 본다. 아이가 직접 읽는 글이다.

시점 — 아이가 읽는 "다음 날 아침"을 기준으로 쓴다:
- 입력 대화가 있었던 날은 "어제"다. "오늘 힘들었지", "오늘 잘 버텼어"처럼 쓰지 않는다.
- 첫 부분은 어제를 알아주고("어제 아침 마음이 무거웠을 텐데 끝까지 힘내 줘서 고마워"),
  끝 부분은 이제 시작하는 오늘을 응원한다("오늘은 ~ 하루가 되면 좋겠다", "오늘도 선생님이 기다리고 있을게").
- "내일"이라는 말은 쓰지 않는다.

입력: 그날 아이가 고른 마음 색(괄호 안은 색 버튼의 뜻), 도우미와 나눈 대화 전문, 목소리 측정값, 최근 며칠 흐름.
이걸로 그날(아이 입장에서 어제) 아이의 마음을 짐작하고, 그 마음을 알아주는 한마디를 쓴다.

쓰는 법:
- 2~3문장, 150자 안팎. 담임 선생님이 아이에게 말하듯 다정한 반말.
- 아이 이름을 부르는 말("○○아,")은 쓰지 않는다. 코드가 맨 앞에 붙인다. 본문만 쓴다.
- 따옴표로 감싸지 않는다.
- 어제 아이가 보여준 모습(버텨 준 것, 이야기해 준 것, 좋았던 일)을 구체적으로 알아주고, 오늘을 가볍게 응원한다.
- 이모지는 넣어도 끝에 하나까지.

지켜야 할 선 (아이가 읽는 글이다):
- 아이가 털어놓은 속상한 일(가족과 다툼, 친구와 갈등 등)을 구체적으로 되짚지 않는다. "어제 아침 힘들었지"처럼 마음만 알아준다.
  누구와 있었던 일인지(엄마·아빠·가족·친구 등)도 쓰지 않는다. 아이가 읽을 때 다른 사람 눈에 띄어도 괜찮은 말만 쓴다.
- 다른 아이 이름이나 [친구N]·[이름N] 토큰을 쓰지 않는다.
- 색, 측정값, 기록·분석·AI 이야기를 하지 않는다("목소리가 작았더라", "빨강을 골랐구나" 금지).
- 진단·평가·훈계·조건부 칭찬("~해야 해", "~하면 좋겠어")을 하지 않는다.
- 선생님이 지킬 수 없는 약속(비밀 보장, 항상 해결해 주겠다 등)을 하지 않는다.
- 대화에 없는 일이나 모습("웃었다", "밝아 보였다" 등 교사가 직접 보지 못한 장면)을 지어내지 않는다.
  아이가 대화에서 한 말만 짚는다.

예시(형식만 참고, 내용을 베끼지 말 것):
어제 아침 마음이 무거웠을 텐데 끝까지 힘내 줘서 선생님이 고마워. 급식 이야기 들려줘서 선생님도 반가웠어. 오늘도 선생님이 기다리고 있을게 😊`;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["draft"],
  properties: { draft: { type: "string", description: "아이에게 건넬 한마디 초안" } },
} as const;

/** 받침 여부 — "민준아" / "지우야", "민준이는" / "지우는" */
function hasFinalConsonant(word: string): boolean {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

/** "김민준" → "민준아", "정지우" → "지우야" */
function vocative(fullName: string): string {
  const given = fullName.length >= 3 ? fullName.slice(1) : fullName;
  return `${given}${hasFinalConsonant(given) ? "아" : "야"}`;
}

/** 초안 속 [본인] 토큰을 성을 뺀 이름 + 알맞은 호격·조사로 바꾼다 */
function fillSubjectName(text: string, fullName: string): string {
  const given = fullName.length >= 3 ? fullName.slice(1) : fullName;
  const batchim = hasFinalConsonant(given);
  return text
    .replace(/\[본인\]\s*[아야](?![가-힣])/g, `${given}${batchim ? "아" : "야"}`)
    .replace(/\[본인\]\s*이(?=[는가도를랑와])/g, `${given}${batchim ? "이" : ""}`)
    .replace(/\[본인\]/g, batchim ? `${given}이` : given);
}

// ── 진입점 ───────────────────────────────────────────────

const globalForInflight = globalThis as typeof globalThis & {
  __salpimCommentDraftInflight?: Map<string, Promise<string | null>>;
};
const inflight = (globalForInflight.__salpimCommentDraftInflight ??= new Map());

/**
 * 그날 대화로 만든 코멘트 초안. 이미 있으면 재사용, 없으면 만들어 저장한다.
 * 아이 음성 발화가 하나도 없으면 null. 호출 전에 교사-학급 권한을 확인해야 한다.
 */
export async function getOrCreateCommentDraft(input: DailyAnalysisInput): Promise<string | null> {
  const hasStudentSpeech = input.sessions.some((s) => s.turns.some((t) => t.speaker === "student"));
  if (!hasStudentSpeech) return null;

  const source = input.sessions[input.sessions.length - 1];
  const existing = await findDraft(source.sessionId);
  if (existing) return existing.draft_text;

  const pending = inflight.get(source.sessionId);
  if (pending) return pending;

  const task = (async () => {
    const mask = buildNameMask(input.student, input.classmates);
    const output = await callOpenAIJson({
      model: analysisModel(),
      systemPrompt: SYSTEM_PROMPT,
      userMessage: buildUserMessage(input, mask, new Map()),
      schemaName: "comment_draft",
      schema: OUTPUT_SCHEMA,
      temperature: 0.6,
    });
    const raw = typeof output.draft === "string" ? output.draft.trim() : "";
    if (!raw) throw new Error("빈 초안을 받았습니다.");
    // 다른 아이 토큰이 새어 나왔으면 이름으로 되돌리지 않고 "친구"로만 둔다 (아이가 읽는 글이라 실명 노출을 막는다).
    // 그 밖의 대괄호 토큰은 지우고, 호칭은 코드가 맨 앞에 붙인다.
    const body = fillSubjectName(raw.replace(/^["'“”‘’]+|["'“”‘’]+$/g, ""), input.student.name)
      .replace(/\[(친구|이름)\d+\]/g, "친구")
      .replace(/\[[^\]]*\]\s*[아야]?,?\s*/g, "")
      .trim();
    const draft = `${vocative(input.student.name)}, ${body}`.slice(0, MAX_DRAFT_LENGTH);
    await insertDraft(
      input.student.studentId,
      draft,
      input.sessions.map((s) => s.sessionId),
    );
    return draft;
  })();

  inflight.set(source.sessionId, task);
  try {
    return await task;
  } finally {
    inflight.delete(source.sessionId);
  }
}
