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
  if (state.sufficient) return { action: "close", reason: "sufficient" };

  return { action: "ask_followup" };
}

/** 하드 게이트에서 아이에게 하는 말. 캐묻지 않고 교사에게 넘긴다. */
export const HANDOFF_MESSAGE = "그건 선생님한테 직접 얘기해줄래?";

/**
 * 종료 인사. 사유에 따라 다르되 모두 "더 묻지 않는다"는 점은 같다.
 *
 * 한 줄이 아니라 여러 줄인 이유: 이 뒤에 아이템 추론(3~4초)이 돈다.
 * 빈 화면으로 기다리게 하는 대신 말풍선을 나눠 띄워 그 시간을 덮는다.
 * 다만 시간을 벌려고 빈말을 채우지는 않는다 — 두 번째 줄은 실제로 지금
 * 일어나는 일을 알려준다. 무슨 일이 벌어지는지 아는 기다림은 견딜 만하다.
 */
export const CLOSING_MESSAGES: Record<"sufficient" | "max_turns" | "avoidance", string[]> = {
  sufficient: ["이야기해줘서 고마워.", "오늘 이야기로 아이템을 만들고 있어!"],
  max_turns: ["이야기해줘서 고마워. 내일 또 들려줘!", "오늘 이야기로 아이템을 만들고 있어!"],
  avoidance: ["괜찮아. 말하고 싶을 때 언제든 얘기해줘.", "오늘 마음도 아이템으로 남겨둘게."],
};

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
