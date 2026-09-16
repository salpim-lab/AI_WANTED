// 담당: 김현우 (단독 소유 — 진승혜/이유민은 import만 하고 내부 구현은 고치지 말 것.
// 수정이 필요하면 김현우에게 요청)
// 자리 배치도 / 아이 상세 / 상담 자료 리포트 / 대시보드 색 현황에서 공용으로 사용 — props 시그니처를 바꾸지 말 것.
// 짧은 색 라벨은 components/shared/signalStyles.ts, 색 의미 문구는 lib/constants/colors.ts가 원본 (여기저기 하드코딩 금지)
// 마크업은 공용 prototype-teacher-shared.css 의 .chip 클래스를 그대로 사용

import type { SignalColor } from "@/lib/types/signal";
import { SIGNAL_LABEL } from "./signalStyles";

export default function ColorBadge({
  color,
  prefix,
}: {
  color: SignalColor;
  /** "등교 " / "하교 " 처럼 뱃지 앞에 붙일 라벨 */
  prefix?: string;
}) {
  return (
    <span className={`chip chip-${color}`}>
      {prefix}
      {SIGNAL_LABEL[color]}
    </span>
  );
}
