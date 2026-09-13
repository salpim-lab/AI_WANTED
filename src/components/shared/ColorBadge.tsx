// 공용 (학생/교사 화면 모두 사용) — 신호등 색 뱃지
// 참고: src/lib/constants/colors.ts 의 색-의미 매핑을 그대로 사용할 것 (여기저기 하드코딩 금지)

import type { SignalColor } from "@/lib/constants/colors";

export default function ColorBadge({ color }: { color: SignalColor }) {
  return <span>{/* TODO: 색상 원 + 라벨 */}</span>;
}
