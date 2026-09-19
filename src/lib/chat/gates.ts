// 담당: 이유민
// 대화 종료 게이트. 기획안 §8.6 "후속 질문 중단 정책 — 가장 중요한 기술 설계".
//
//   에이전트 설계에서 보통 "무엇을 물을지"를 고민한다. 이 제품에서는
//   "언제 묻지 않을지"가 훨씬 중요하다.
//
// 유도 질문은 증거를 파괴한다. 학대·학교폭력 사안에서 아동 진술의 신빙성은
// 유도 질문 여부로 다투어지므로, AI 가 더 캐묻는 순간 기록이 무가치해진다.
//
// 그래서 이 판단은 LLM 이 아니라 코드가 한다. 위험 신호 감지만 LLM 이 표시하고,
// 그 뒤 "무엇을 할지"는 여기서 결정한다.

/** 한 세션에서 아이가 말할 수 있는 최대 횟수 */
export const MAX_TURNS = 2;
/**
 * sufficient 로 끝낼 수 있는 최소 턴 수.
 *
 * 모델은 "그냥 좀 별로였어요" 같은 한마디에도 sufficient=true 를 자주 낸다.
 * 그러면 한 턴 만에 대화가 끝나고, 그 세션에서 남는 재료가 거의 없다.
 * 이 대화는 뒤따르는 모든 화면(감정 추론·아이템·관계 지도)의 원재료라
 * 한 마디로 닫히면 그날 기록이 사실상 비는 셈이다.
 *
 * 그래서 첫 턴은 sufficient 로 닫지 않고 한 번 더 묻는다.
 * 말하기 싫어하는 아이는 이 규칙이 아니라 회피 게이트가 먼저 막는다.
 */
export const MIN_TURNS_BEFORE_SUFFICIENT = 2;
/** 회피 신호가 이만큼 쌓이면 종료 */
export const MAX_AVOIDANCE = 2;

/** LLM 이 표시하는 위험 수준. 판정이 아니라 "교사에게 넘길지" 의 플래그다. */
export type RiskLevel = "none" | "flag";

export type TurnState = {
  /** 아이가 말한 횟수 */
  turnCount: number;
  /** 회피 신호 누적 */
  avoidanceCount: number;
  /** LLM 이 이번 발화에 붙인 위험 표시 */
  risk: RiskLevel;
  /** LLM 이 "충분히 이야기했다" 고 본 경우 */
  sufficient: boolean;
};

export type GateDecision =
  | { action: "ask_followup" }
  | { action: "close"; reason: "sufficient" | "max_turns" | "avoidance" }
  | { action: "handoff_to_teacher" };

/**
 * 다음에 무엇을 할지 정한다. 순서가 곧 우선순위다.
 *
 * 위험 신호가 가장 먼저다 — 다른 어떤 조건보다 우선한다.
 * "2턴이 안 됐으니 한 번 더 물어보자" 같은 판단이 끼어들면 안 된다.
 */
export function decideNext(state: TurnState): GateDecision {
  // ① 하드 게이트. 후속 질문 전면 중단 → 교사에게 넘긴다.
  //    AI 는 위로도 상담도 하지 않는다. 캐물으면 진술이 오염된다.
  if (state.risk === "flag") return { action: "handoff_to_teacher" };

  // ② 회피 신호 2회 — 말하고 싶지 않다는 뜻이다. 더 묻지 않는다.
  if (state.avoidanceCount >= MAX_AVOIDANCE) return { action: "close", reason: "avoidance" };

  // ③ 2턴 도달 — 무조건 종료. 하루 두 번 하는 대화라 길어지면 안 된다.
  if (state.turnCount >= MAX_TURNS) return { action: "close", reason: "max_turns" };

  // ④ 충분히 이야기했다면 더 묻지 않는다.
  //    단 첫 턴에는 적용하지 않는다 — 한마디에 sufficient 가 붙어 대화가
  //    한 턴 만에 끝나는 일이 잦았다. 2턴이 상한이니 한 번은 더 물을 여유가 있다.
  if (state.sufficient && state.turnCount >= MIN_TURNS_BEFORE_SUFFICIENT) {
    return { action: "close", reason: "sufficient" };
  }

  return { action: "ask_followup" };
}

/** 하드 게이트에서 아이에게 하는 말. 캐묻지 않고 교사에게 넘긴다. */
export const HANDOFF_MESSAGE = "그건 선생님한테 직접 얘기해줄래?";

/**
 * 종료 인사. 사유와 등하교에 따라 다르되 모두 "더 묻지 않는다"는 점은 같다.
 *
 * 첫 줄은 이야기를 들려준 데 대한 고마움, 둘째 줄은 안부·응원이다.
 * 예전 둘째 줄은 "오늘 이야기로 아이템을 만들고 있어!" 였는데, 아이템을 만드는 시간을 덮으려는
 * 안내라 마무리 인사처럼 들리지 않았다. 등교는 하루를 여는 응원, 하교는 수고했다는 인사로 닫는다.
 *
 * ⚠️ 대화 중 AI 는 위로·평가를 하지 않지만(prompt.ts), 여기는 이야기가 끝난 뒤의 고정 인사라
 *    응원까지는 둔다. 다만 "괜찮아질 거야" 처럼 결과를 약속하는 말은 쓰지 않는다.
 */
export type CloseReason = "sufficient" | "max_turns" | "avoidance";

const CLOSING: Record<"checkin" | "checkout", Record<CloseReason, string[]>> = {
  checkin: {
    sufficient: ["이야기해줘서 고마워.", "오늘 하루도 응원할게. 좋은 하루 보내!"],
    max_turns: ["솔직하게 들려줘서 고마워.", "오늘 하루도 응원할게. 좋은 하루 보내!"],
    avoidance: ["괜찮아. 말하고 싶을 때 언제든 얘기해줘.", "오늘도 좋은 하루 보내!"],
  },
  checkout: {
    sufficient: ["오늘 이야기 들려줘서 고마워.", "오늘 하루도 정말 수고 많았어!"],
    max_turns: ["솔직하게 들려줘서 고마워.", "오늘 하루도 정말 수고 많았어!"],
    avoidance: ["괜찮아. 말하고 싶을 때 언제든 얘기해줘.", "오늘 하루 수고했어. 푹 쉬어!"],
  },
};

export function closingLines(reason: CloseReason, flow: "checkin" | "checkout"): string[] {
  return CLOSING[flow][reason];
}

/**
 * 회피 신호. 전사 텍스트에서 코드로 판단한다 — 기획안 §8.8 "지표는 코드로".
 * LLM 을 부를 필요가 없고, 규칙이 명시적이라 교사에게 설명할 수 있다.
 */
const AVOIDANCE_PATTERNS = [
  "말하기 싫", "얘기하기 싫", "모르겠", "몰라", "그냥", "없어", "안 할래", "안할래", "패스",
];

export function looksAvoidant(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return true;
  // 짧은 한 마디면서 회피 표현이면 회피로 본다.
  // 길게 설명하면서 "그냥"을 쓴 경우까지 회피로 잡으면 오탐이다.
  if (t.length > 20) return false;
  return AVOIDANCE_PATTERNS.some((p) => t.includes(p));
}
