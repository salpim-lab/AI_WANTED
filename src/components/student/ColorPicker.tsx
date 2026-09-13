// 담당: 이유민
// 4색 신호등 선택 (초록/노랑/빨강/남색) — 등교 2단계, 하교 1단계 공용
// 참고: docs/prototype/prototype-student.html #s2, src/lib/constants/colors.ts

export default function ColorPicker({
  onSelect,
}: {
  onSelect?: (color: "green" | "yellow" | "red" | "navy") => void;
}) {
  return <section>{/* TODO(이유민): 4개 원형 버튼 */}</section>;
}
