// 담당: 김현우 (단독 소유 — 진승혜/이유민은 import만 하고 내부 구현은 고치지 말 것.
// 수정이 필요하면 김현우에게 요청)
// 자리 배치도(SeatingChart)/아이 상세(StudentDetailPanel)/대시보드 색 현황에서 공용으로 사용
// 참고: src/lib/constants/colors.ts 의 색-의미 매핑을 그대로 사용할 것 (여기저기 하드코딩 금지)

import type { SignalColor } from "@/lib/constants/colors";

export default function ColorBadge({ color }: { color: SignalColor }) {
  return <span>{/* TODO: 색상 원 + 라벨 */}</span>;
}
