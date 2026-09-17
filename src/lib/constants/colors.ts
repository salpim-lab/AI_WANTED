// 4색 신호등 상수 — 여기 값만 고치면 전체 앱에 반영되도록, 색 의미를 하드코딩하지 말고 항상 이걸 참조할 것.
// 타입은 lib/types/signal.ts가 원본(SSOT) — 여기서 다시 정의하지 않고 가져다 쓴다.
// 참고: docs/planning/PLANNING.md "2단계: 색 선택(신호등)"

import type { SignalColor } from "@/lib/types/signal";

export type { SignalColor };

export const SIGNAL_COLORS: Record<
  SignalColor,
  { name: string; label: string; hex: string }
> = {
  // name  — 색 이름 (마음 버튼에 표시)
  // label — 마음 설명. 버튼과 대화 화면 뱃지가 **같은 문구**를 써야 한다.
  //         아이가 버튼에서 본 말이 대화 중에도 그대로 보여야 "내가 왜 이 기분이지?"
  //         를 떠올리며 말할 수 있다.
  green: { name: "초록", label: "기분 좋아요", hex: "#22c55e" },
  yellow: { name: "노랑", label: "그저 그래요", hex: "#eab308" },
  red: { name: "빨강", label: "기분이 안 좋아요", hex: "#ef4444" },
  navy: { name: "남색", label: "혼자 있고 싶어요", hex: "#1e3a8a" },
};
