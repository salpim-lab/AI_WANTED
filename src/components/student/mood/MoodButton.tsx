// 담당: 이유민
// 마음 색 버튼 하나. 목업의 "누르는 물리 버튼" 질감을 CSS 로 만든다.
//   회색 받침(베젤) 안에 볼록한 색 돔이 얹힌 모양이고, 누르면 실제로 눌린다.
import type { SignalColor } from "@/lib/types/signal";

export type MoodOption = {
  color: SignalColor;
  name: string;
  desc: string;
};

export default function MoodButton({
  option,
  onSelect,
}: {
  option: MoodOption;
  onSelect: (color: SignalColor) => void;
}) {
  return (
    <button
      type="button"
      className={`mood-btn mood-btn--${option.color}`}
      onClick={() => onSelect(option.color)}
      aria-label={`${option.name} — ${option.desc}`}
    >
      <span className="mood-btn__bezel" aria-hidden="true">
        <span className="mood-btn__dome" />
      </span>
      <span className="mood-btn__label">
        <span className="mood-btn__name">{option.name}</span>
        <span className="mood-btn__desc">{option.desc}</span>
      </span>
    </button>
  );
}
