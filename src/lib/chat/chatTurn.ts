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
import { CHAT_TURN_PROMPT } from "./prompt";

export type ChatTurnOutput = {
  /** 아이에게 보여줄 다음 질문. 종료면 빈 문자열 */
  reply: string;
  /** 충분히 이야기했는지. 게이트가 이 값으로 종료를 판단한다 */
  sufficient: boolean;
  /** 위험 표시. 판정이 아니라 "교사에게 넘길지" 의 플래그다 */
  risk: RiskLevel;
};

/** Structured Outputs 스키마. strict 모드라 모든 필드가 required 여야 한다. */
export const CHAT_TURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "sufficient", "risk"],
  properties: {
    reply: { type: "string", maxLength: 120 },
    sufficient: { type: "boolean" },
    risk: { type: "string", enum: ["none", "flag"] },
  },
} as const;

export type ChatTurnInput = {
  flow: "checkin" | "checkout";
  color: SignalColor;
  transcript: TranscriptMessage[];
  turnCount: number;
  /** 최근 며칠 맥락 요약. 유도 질문에만 쓴다 — 여기는 어차피 LLM 을 부르므로 추가 비용이 없다 */
  recentContext?: string;
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
    // 벤더 대시보드에 응답을 남기지 않는다. 학습 사용 차단과는 별개 설정이다.
    store: false,
  };
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
  if (typeof o.reply !== "string" || typeof o.sufficient !== "boolean") {
    throw new ChatTurnError("INVALID_AI_OUTPUT", 502, "응답 필드가 잘못되었습니다.");
  }
  if (o.risk !== "none" && o.risk !== "flag") {
    throw new ChatTurnError("INVALID_AI_OUTPUT", 502, "위험 표시 값이 잘못되었습니다.");
  }
  // 위험 표시가 붙으면 AI 가 만든 문장은 쓰지 않는다.
  // 캐묻거나 위로하는 말이 섞이면 진술이 오염되고, 그건 우리가 판단할 일이 아니다.
  if (o.risk === "flag") return { reply: "", sufficient: true, risk: "flag" };
  return { reply: o.reply.trim(), sufficient: o.sufficient, risk: "none" };
}
