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

// 학생이 처음 신호등을 고르는 마음 색 버튼(styles/student-mood.css의 --dome)과 같은 색 — 아이가 고른 색을 교사 화면에서도 똑같이 본다.
// Tailwind가 찾도록 클래스 문자열로 풀어 적었다. 학생 쪽 색이 바뀌면 여기도 같이 고친다.
export const SIGNAL_DOT: Record<SignalColor, string> = {
  green: "bg-[#15c656]",
  yellow: "bg-[#f5c518]",
  red: "bg-[#f0403f]",
  navy: "bg-[#26398c]",
};

/** 자리 테두리. 빨강·남색은 바깥 링을 더한다 (ring은 카드 그림자와 겹쳐도 덮어쓰지 않고 합쳐진다) */
export const SIGNAL_SEAT_BORDER: Record<SignalColor, string> = {
  green: "border-green-200",
  yellow: "border-yellow-200",
  red: "border-red-200 ring-3 ring-red-500/10",
  navy: "border-indigo-200 ring-3 ring-indigo-500/10",
};

/** 대시보드 "오늘의 교실"에 쓰는 마음 이름 — 자리 배치도 범례·툴팁이 같은 말을 쓴다 (원본: dashboard/mockData.ts SIGNAL_DISPLAY) */
export const SIGNAL_MOOD_LABEL: Record<SignalColor, string> = {
  green: "좋아요",
  yellow: "그저 그래요",
  red: "속상해요",
  navy: "혼자 있을래요",
};

/** 자리 배치도 카드 배경+글자색 — 대시보드 "오늘의 교실"과 같은 색(SIGNAL_DOT)을 50% 투명하게 깐다. 글자는 색과 상관없이 모두 검정 */
export const SIGNAL_SEAT_FILL: Record<SignalColor, string> = {
  green: "bg-[#15c656]/50 text-black",
  yellow: "bg-[#f5c518]/50 text-black",
  red: "bg-[#f0403f]/50 text-black",
  navy: "bg-[#26398c]/50 text-black",
};

/** 자리를 골랐을 때 — 같은 색이 투명 없이 꽉 차서 평소(50%)보다 확 진해진다. 테두리는 쓰지 않는다.
 *  남색은 원래 색(#26398c)을 꽉 채우면 검정 글자가 안 읽혀서 한 단계 밝은 남색(student-mood.css --dome-light)을 쓴다 */
export const SIGNAL_SEAT_FILL_SELECTED: Record<SignalColor, string> = {
  green: "bg-[#15c656] text-black",
  yellow: "bg-[#f5c518] text-black",
  red: "bg-[#f0403f] text-black",
  navy: "bg-[#4560bd] text-black",
};
