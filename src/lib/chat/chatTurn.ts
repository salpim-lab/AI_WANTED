// 담당: 이유민
// 후속 질문 LLM 호출의 계약. 벤더 의존이 없는 부분이다.
//
// 강윤지님 아이템 파이프라인과 같은 방식으로 나눈다:
//   buildRequest()  요청 객체만 만드는 순수 함수 (네트워크 없음)
//   SCHEMA          출력 스키마
//   parse()         응답 검증·파싱
//   ─────────────────────────────────
//   실제 fetch      벤더가 정해지면 이 부분만 작성한다
//
// 덕분에 API 없이도 오프라인 테스트가 가능하다.
import type { SignalColor } from "@/lib/types/signal";
import type { TranscriptMessage } from "@/lib/supabase/raw/wholeTranscript";
import type { RiskLevel } from "./gates";
import { CHAT_TURN_PROMPT, RISK_CHECK_PROMPT } from "./prompt";

export type ChatTurnOutput = {
  /** 아이에게 보여줄 후속 질문 한 줄(받아주는 말 + 질문). 위험 표시면 빈 문자열 */
  reply: string;
  /** 충분히 이야기했는지. 게이트가 이 값으로 종료를 판단한다 */
  sufficient: boolean;
  /** 위험 표시. 판정이 아니라 "교사에게 넘길지" 의 플래그다 */
  risk: RiskLevel;
};

/**
 * Structured Outputs 스키마. strict 모드라 모든 필드가 required 여야 한다.
 *
 * 받아주는 말(ack)과 질문(question)을 나눠 받는다. 예전에는 reply 한 칸이었는데,
 * 모델이 sufficient=true 를 낼 때 reply 에 마무리 인사("이겼던 거 정말 기분 좋았겠네")를
 * 썼고, 게이트가 첫 턴의 sufficient 를 무시하고 대화를 이어가면서 그 인사가 질문 자리에
 * 그대로 나갔다. 아이는 질문 없는 말을 받고 무엇을 해야 할지 몰랐다.
 * 이제 question 은 sufficient 와 상관없이 항상 쓴다. 쓸지 말지는 게이트가 정한다.
 *
 * missing: 아이 말에서 빠진 조각(무슨 일 / 마음 / 계기 / 다 있으면 detail).
 * 후속 질문은 한 번뿐이라, 아무 질문이나 하지 않고 빠진 조각을 채우게 한다(prompt.ts).
 */
export const CHAT_TURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  // missing 을 맨 앞에 둔다 — 모델은 칸 순서대로 쓰므로, 무엇을 물을지 먼저 정하고 질문을 쓰게 된다
  required: ["missing", "ack", "question", "sufficient", "risk"],
  properties: {
    missing: { type: "string", enum: ["situation", "feeling", "cause", "detail"] },
    ack: { type: "string", maxLength: 60 },
    question: { type: "string", maxLength: 80 },
    sufficient: { type: "boolean" },
    risk: { type: "string", enum: ["none", "flag"] },
  },
} as const;

/**
 * 모델이 질문을 빠뜨리거나 물음표 없는 문장을 냈을 때 대신 쓰는 질문.
 * 여섯 갈래 중 ①(더 말해달라)이다. 어떤 이야기 뒤에 붙어도 어색하지 않고, 캐묻지 않는다.
 */
export const FALLBACK_QUESTION = "그 얘기 조금만 더 해줄래?";

const isQuestion = (text: string) => /[?？]\s*$/.test(text.trim());

/** 내용 없이 끄덕이기만 하는 맞장구 */
const isFiller = (line: string) => /^(그랬구나|그렇구나|그랬어|알겠어|응|그래)[.!~]*$/.test(line.trim());

/** "재미있었어, 아니면 다른 기분이었어?" 처럼 답을 골라 주는 질문. 아이 말이 아니라 우리 말이 된다 */
const isChoiceQuestion = (text: string) => /아니면|[어야],\s*\S+[어야][?？]\s*$/.test(text);

export type ChatTurnInput = {
  flow: "checkin" | "checkout";
  color: SignalColor;
  transcript: TranscriptMessage[];
  turnCount: number;
  /** 최근 며칠 맥락 요약. 유도 질문에만 쓴다 — 여기는 어차피 LLM 을 부르므로 추가 비용이 없다 */
  recentContext?: string;
  /** 아이 이름(성 없이, 예: "민준"). 받아주는 말에서 이름을 불러 줄 때 쓴다 */
  studentName?: string;
};

/**
 * 요청 객체를 만든다. 네트워크를 타지 않으므로 테스트에서 그대로 검증할 수 있다.
 * 모델은 환경변수로 바꿀 수 있게 둔다 — 벤더·모델 결정이 코드 수정 없이 반영되도록.
 */
export function buildChatTurnRequest(input: ChatTurnInput) {
  return {
    model: process.env.CHAT_MODEL || "gpt-4o-mini",
    instructions: CHAT_TURN_PROMPT,
    input: [
      {
        role: "user" as const,
        content: JSON.stringify({
          flow: input.flow,
          color: input.color,
          turn_count: input.turnCount,
          recent_context: input.recentContext ?? null,
          student_name: input.studentName ?? null,
          transcript: input.transcript,
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema" as const,
        name: "chat_turn",
        strict: true,
        schema: CHAT_TURN_SCHEMA,
      },
    },
    // 짧게 답하도록 강제한다. 아이가 읽을 분량이고 비용도 여기서 갈린다.
    max_output_tokens: 200,
    // 기본값(1)은 같은 말에도 매번 다르게 굴어서, 사람마다 테스트 결과가 갈렸다.
    // 질문 문장은 조금씩 달라도 되지만 형식은 흔들리면 안 된다.
    temperature: 0.5,
    // 벤더 대시보드에 응답을 남기지 않는다. 학습 사용 차단과는 별개 설정이다.
    store: false,
  };
}

/**
 * 위험 판단만 하는 요청. 후속 질문 호출과 **따로** 나간다.
 *
 * 왜 나눴나: 후속 질문 호출에는 최근 며칠 맥락이 들어간다. 며칠치를 합쳐 보면
 * 평범한 친구 다툼도 계속되는 괴롭힘처럼 읽혀서, "옆자리 친구가 뭐라 했는데
 * 그래도 괜찮았어요" 가 flag 로 넘어갔다. 같은 문장을 맥락 없이 넣으면 flag 가
 * 나오지 않았다. 그래서 위험은 **오늘 발화만** 보고 정한다.
 *
 * 두 호출은 동시에 보낸다. 지연은 늘지 않고 비용은 세션당 1센트 아래다.
 */
export function buildRiskCheckRequest(input: Pick<ChatTurnInput, "transcript">) {
  return {
    model: process.env.CHAT_MODEL || "gpt-4o-mini",
    instructions: RISK_CHECK_PROMPT,
    input: [
      {
        role: "user" as const,
        // 오늘 대화만. recent_context 를 넣지 않는다.
        content: JSON.stringify({ transcript: input.transcript }),
      },
    ],
    text: {
      format: {
        type: "json_schema" as const,
        name: "risk_check",
        strict: true,
        schema: RISK_CHECK_SCHEMA,
      },
    },
    max_output_tokens: 50,
    // 분류다. 같은 말에는 같은 판정이 나와야 한다.
    temperature: 0,
    store: false,
  };
}

export const RISK_CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["risk"],
  properties: { risk: { type: "string", enum: ["none", "flag"] } },
} as const;

/** 위험 판단 응답. 읽지 못하면 안전한 쪽(flag)이 아니라 none 으로 둔다 —
 *  파싱 실패로 아이 대화를 끊는 것이 더 자주 일어날 일이라서다. */
export function parseRiskCheck(raw: unknown): RiskLevel {
  if (raw && typeof raw === "object") {
    const v = (raw as Record<string, unknown>).risk;
    if (v === "flag") return "flag";
  }
  return "none";
}

export class ChatTurnError extends Error {
  constructor(public code: string, public httpStatus: number, message: string) {
    super(message);
  }
}

/** 응답 검증. 스키마를 믿지 않고 한 번 더 확인한다 — strict 모드도 거부(refusal)가 올 수 있다. */
export function parseChatTurn(raw: unknown): ChatTurnOutput {
  if (!raw || typeof raw !== "object") {
    throw new ChatTurnError("INVALID_AI_OUTPUT", 502, "응답 형식이 잘못되었습니다.");
  }
  const o = raw as Record<string, unknown>;
  if (
    typeof o.ack !== "string" ||
    typeof o.question !== "string" ||
    typeof o.sufficient !== "boolean"
  ) {
    throw new ChatTurnError("INVALID_AI_OUTPUT", 502, "응답 필드가 잘못되었습니다.");
  }
  if (o.risk !== "none" && o.risk !== "flag") {
    throw new ChatTurnError("INVALID_AI_OUTPUT", 502, "위험 표시 값이 잘못되었습니다.");
  }
  // 위험 표시가 붙으면 AI 가 만든 문장은 쓰지 않는다.
  // 캐묻거나 위로하는 말이 섞이면 진술이 오염되고, 그건 우리가 판단할 일이 아니다.
  if (o.risk === "flag") return { reply: "", sufficient: true, risk: "flag" };

  // 질문이 없거나 물음표로 끝나지 않으면 기본 질문으로 바꾼다.
  // 후속 질문 자리에는 반드시 질문이 가야 한다.
  // 질문은 하나만. 실측에서 모델이 ack 칸에도 질문을 넣어 "기분이 안 좋아진 일이 있었어?
  // 어떤 일이 있어서 그런 기분이 들었어?" 처럼 두 번 묻거나, "재미있었어, 아니면 다른 기분이었어?"
  // 처럼 감정 선택지를 줬다. 두 칸의 질문 문장을 모두 모아, 선택지가 아닌 첫 질문 하나만 쓴다.
  const sentences = (text: string) => text.trim().split(/(?<=[.!?？])\s+/).filter(Boolean);
  const all = [...sentences(o.ack), ...sentences(o.question)];
  const asked = all.filter(isQuestion);
  const question = asked.find((q) => !isChoiceQuestion(q)) ?? FALLBACK_QUESTION;
  // 받아주는 말은 ack 칸의 서술문만. question 칸에 섞여 온 서술문("정말 기분 좋았겠네.")은 버린다 —
  // 그건 대개 마무리 인사처럼 쓴 공감이라 질문 앞에 붙이면 말이 길어지고 끝맺는 느낌이 난다.
  // 맞장구("그랬구나.")로 먼저 끄덕이고 아이 말을 또 "~구나" 로 받으면 두 번 끄덕이는 말투가 된다.
  // 뒤에 내용 있는 문장이 이어질 때만 떼어낸다(맞장구 하나뿐이면 그대로 둔다).
  const ackLines = sentences(o.ack).filter((line) => !isQuestion(line));
  const trimmedAck = ackLines.length > 1 && isFiller(ackLines[0]) ? ackLines.slice(1) : ackLines;
  const ack = trimmedAck.join(" ");
  return {
    reply: ack ? `${ack} ${question}` : question,
    sufficient: o.sufficient,
    risk: "none",
  };
}
