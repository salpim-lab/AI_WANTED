// 4색 신호등 상수 — 여기 값만 고치면 전체 앱에 반영되도록, 색 의미를 하드코딩하지 말고 항상 이걸 참조할 것.
// 참고: docs/planning/PLANNING.md "2단계: 색 선택(신호등)"

export type SignalColor = "green" | "yellow" | "red" | "navy";

export const SIGNAL_COLORS: Record<
  SignalColor,
  { label: string; hex: string }
> = {
  green: { label: "기분 좋아요", hex: "#22c55e" },
  yellow: { label: "그저 그래요", hex: "#eab308" },
  red: { label: "오늘은 좀 기분이 안 좋아요", hex: "#ef4444" },
  navy: { label: "오늘 나 조금 혼자 있을 시간이 필요해요", hex: "#1e3a8a" },
};
