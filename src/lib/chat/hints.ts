// 담당: 이유민
// "이런 이야기를 해도 좋아요" 힌트.
//
// ⚠️ 답변 문장이 아니라 **주제**다. 이게 규칙인 이유:
//    "네, 있어요" 처럼 완성된 답을 보여주면 아이는 그걸 그대로 읽는다.
//    그러면 우리가 받는 건 아이 말이 아니라 우리가 쓴 문장이고,
//    발화에서 감정을 읽겠다는 설계가 통째로 무너진다.
//    주제만 던지면 문장은 아이가 만든다.
//
// 그리고 답변형 힌트는 내용이 없다. "딱히 없어요" 는 아이에게 아무 도움이 안 되고
// 오히려 대화를 끝내는 쪽으로 민다.
import type { SignalColor } from "@/lib/types/signal";

// 힌트도 프롬프트와 같은 제약을 받는다:
//   - "누구와" 처럼 사실을 캐는 주제를 넣지 않는다. 유도 질문과 같은 효과를 낸다.
//   - 남색에 "혼자 있고 싶은 이유" 를 넣지 않는다. 요청을 받아들인다면서 이유를
//     캐묻는 셈이라 openers.ts 에서 이미 빼기로 한 것이다.

export type Flow = "checkin" | "checkout";

/** 등교: 어제·오늘 아침·지금, 어디서 온 마음이든 고를 수 있게 섞는다 */
const CHECKIN: Record<SignalColor, string[]> = {
  green: ["기분 좋았던 일", "자랑하고 싶은 것", "오늘 기대되는 일"],
  yellow: ["오늘 아침에 있었던 일", "어제 있었던 일", "그냥 드는 생각"],
  red: ["속상했던 일", "오늘 아침에 있었던 일", "지금 마음"],
  navy: ["지금 마음", "요즘 있었던 일", "하고 싶은 말"],
};

/** 하교: 오늘 하루를 닫는다 */
const CHECKOUT: Record<SignalColor, string[]> = {
  green: ["오늘 재밌었던 일", "친구랑 있었던 일", "칭찬받은 일"],
  yellow: ["수업 시간에 있었던 일", "쉬는 시간에 있었던 일", "급식 시간에 생겼던 일"],
  red: ["오늘 속상했던 일", "학교에서 있었던 일", "지금 마음"],
  navy: ["오늘 하루", "지금 마음", "하고 싶은 말"],
};

/**
 * 두 번째 턴 힌트. 색과 무관하다.
 *
 * 첫 턴 힌트를 그대로 다시 보여주면 아이는 "아까 그거 또?" 가 된다.
 * 이미 무슨 일이 있었는지는 말했으니, 두 번째는 그 일에 대한 마음과 지금 상태로 옮긴다.
 * 이건 프롬프트가 허용한 후속 질문 형태(그때 기분 / 지금 / 더 말하기)와 같은 결이다.
 */
const SECOND_TURN = ["그때 들었던 기분", "지금 마음", "더 하고 싶은 말"];

/** turn 은 아이가 이미 말한 횟수. 0 이면 첫 질문에 답할 차례다. */
/** 받침이 있는가 — 조사(이나/나, 을/를)를 고르는 데 쓴다 */
function hasBatchim(word: string): boolean {
  const code = word.trim().charCodeAt(word.trim().length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/**
 * 힌트 주제를 한 문장으로 이어지는 줄들로 만든다. 화면은 이 줄을 하나씩 흘려 보여준다.
 *   ["수업 시간에 있었던 일", "쉬는 시간에 있었던 일", "급식 시간에 생겼던 일"]
 *   → ["수업 시간에 있었던 일이나", "쉬는 시간에 있었던 일이나", "급식 시간에 생겼던 일을 이야기해도 좋아"]
 */
export function hintLines(topics: string[]): string[] {
  return topics.map((t, i) =>
    i < topics.length - 1
      ? `${t}${hasBatchim(t) ? "이나" : "나"}`
      : `${t}${hasBatchim(t) ? "을" : "를"} 이야기해도 좋아`,
  );
}

/**
 * 말풍선에 넣을 글. 한 줄로 이어 읽히게 앞은 쉼표, 가운데는 "이나/나", 마지막은 그대로 둔다.
 *   ["지금 마음", "요즘 있었던 일", "하고 싶은 말"] → ["지금 마음,", "요즘 있었던 일이나", "하고 싶은 말"]
 */
export function bubbleTexts(topics: string[]): string[] {
  const last = topics.length - 1;
  return topics.map((t, i) =>
    i === last ? t : i === 0 && last >= 2 ? `${t},` : `${t}${hasBatchim(t) ? "이나" : "나"}`,
  );
}

export function pickHints(flow: Flow, color: SignalColor | null, turn = 0): string[] {
  if (!color) return [];
  if (turn >= 1) return SECOND_TURN;
  return (flow === "checkin" ? CHECKIN : CHECKOUT)[color];
}
