// 담당: 김현우 (단독 소유) — 교사 화면에서 쓰는 신호등 색 "표시용" 라벨·Tailwind 클래스.
// 색의 의미 문구(기분 좋아요 등)는 lib/constants/colors.ts(이유민)가 원본이다. 여기는 짧은 라벨과 스타일만.
// Tailwind가 찾을 수 있게 완성된 클래스 문자열로 적는다.

import type { SignalColor } from "@/lib/types/signal";

export const SIGNAL_LABEL: Record<SignalColor, string> = {
  green: "초록",
  yellow: "노랑",
  red: "빨강",
  navy: "남색",
};

export const SIGNAL_DOT: Record<SignalColor, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
  navy: "bg-indigo-500",
};

/** 자리 테두리. 빨강·남색은 바깥 링을 더한다 (ring은 카드 그림자와 겹쳐도 덮어쓰지 않고 합쳐진다) */
export const SIGNAL_SEAT_BORDER: Record<SignalColor, string> = {
  green: "border-green-200",
  yellow: "border-yellow-200",
  red: "border-red-200 ring-3 ring-red-500/10",
  navy: "border-indigo-200 ring-3 ring-indigo-500/10",
};

/** 자리 배치도 카드를 색으로 꽉 채울 때(SeatPlan 참고 레퍼런스) 배경+글자색 — 파스텔 톤 */
export const SIGNAL_SEAT_FILL: Record<SignalColor, string> = {
  green: "bg-green-200 text-green-900",
  yellow: "bg-yellow-200 text-yellow-900",
  red: "bg-red-200 text-red-900",
  navy: "bg-indigo-200 text-indigo-900",
};
