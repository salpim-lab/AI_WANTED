// 담당: 진승혜
// 아침 브리핑 1단계 — "이 아이의 평소와 다른가"를 재는 개인 기준선.
// 참고: 살핌_기획안.md "8.5 개인 기준선 — LLM이 아니라 산수"
//
// 왜 학급 절대값이 아니라 개인 기준선인가:
//   빨강을 자주 고르는 아이는 절대값으로 고르면 매일 걸린다. 그러면 브리핑에 같은 이름 셋이
//   계속 뜨고, 교사는 일주일이면 카드를 안 보게 된다.
//   늘 초록이던 아이의 노랑이, 늘 빨강인 아이의 빨강보다 알려야 할 일이다.
//
// 평균·표준편차가 아니라 중앙값 + MAD 를 쓴다. 표본이 20~30일로 작고 튀는 날이 섞여 있어서,
// 평균을 쓰면 하루 크게 나쁜 날이 기준선 자체를 끌어내린다.

import type { SignalColor } from "@/lib/types/signal";

/** 색 앵커는 3단계다. 남색은 뺀다 — "혼자 있을래요"는 나쁜 하루가 아니라 아이가 요청한 거리다.
    (기획안 8.5 "색 앵커: 초록/노랑/빨강 3단계 · 남색은 제외") */
export const COLOR_SCORE = { green: 3, yellow: 2, red: 1 } as const;

export type AnchorColor = keyof typeof COLOR_SCORE;

export function isAnchor(color: SignalColor): color is AnchorColor {
  return color !== "navy";
}

export function scoreOf(color: SignalColor): number | null {
  return isAnchor(color) ? COLOR_SCORE[color] : null;
}

/** 기준선을 띄우기 위한 최소 기록 일수. 이보다 적으면 지표를 아예 계산하지 않는다.
    (기획안 8.5 "콜드스타트를 정직하게. 첫 2주는 지표를 띄우지 않는다") */
export const BASELINE_MIN_DAYS = 14;

/** 늘 같은 색만 골라온 아이(MAD=0)가 다른 색을 고른 날의 편차값. 나눗셈이 정의되지 않아 상수로 둔다. */
const FLAT_HISTORY_DEVIATION = 3.5;

export function median(values: number[]): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 중앙값 절대편차 — 각 값이 중앙값에서 얼마나 떨어져 있는지의 중앙값 */
export function mad(values: number[]): number {
  const med = median(values);
  return median(values.map((v) => Math.abs(v - med)));
}

/**
 * 오늘 값이 그 아이의 평소에서 얼마나 벗어났는지. 음수면 평소보다 낮은(=나쁜) 쪽이다.
 * 기록이 모자라면 null — 억지로 숫자를 내면 오탐이 된다.
 *
 * 편차 = 0.6745 × (오늘값 − 중앙값) / MAD   (기획안 8.5)
 */
export function deviation(today: number, history: number[]): number | null {
  if (history.length < BASELINE_MIN_DAYS) return null;
  const med = median(history);
  const spread = mad(history);
  // 지금까지 한 가지 색만 골라온 아이라면, 다른 색이 나온 것 자체가 가장 이례적인 날이다.
  if (spread === 0) {
    if (today === med) return 0;
    return today < med ? -FLAT_HISTORY_DEVIATION : FLAT_HISTORY_DEVIATION;
  }
  return (0.6745 * (today - med)) / spread;
}

/** 기준선이 아직 없을 때 화면에 띄울 진행 상황 ("기준선 수집 중 9일 / 14일") */
export function baselineProgress(historyDays: number): { ready: boolean; have: number; need: number } {
  return {
    ready: historyDays >= BASELINE_MIN_DAYS,
    have: Math.min(historyDays, BASELINE_MIN_DAYS),
    need: BASELINE_MIN_DAYS,
  };
}
