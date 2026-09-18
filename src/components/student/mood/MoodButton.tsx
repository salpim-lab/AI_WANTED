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
  selected = false,
  locked = false,
}: {
  option: MoodOption;
  selected?: boolean;
  locked?: boolean;
  onSelect: (color: SignalColor) => void;
}) {
  return (
    <button
      type="button"
      className={`mood-btn mood-btn--${option.color}${selected ? " mood-btn--selected" : ""}`}
      aria-pressed={selected}
      aria-disabled={locked}
      onClick={() => { if (!locked) onSelect(option.color); }}
      aria-label={`${option.name} — ${option.desc}`}
    >
      <span className="mood-btn__bezel" aria-hidden="true">
        <span className="mood-btn__dome">
          <svg className="mood-btn__face" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" focusable="false">
            {option.color === "green" && <>
              <path d="M7 20 Q12 12 17 20 M31 20 Q36 12 41 20" />
              <path d="M11 28 Q24 31 37 28 Q33 40 24 40 Q15 40 11 28 Z" fill="currentColor" stroke="none" />
            </>}
            {option.color === "yellow" && <>
              <circle cx="12" cy="20" r="2.5" fill="currentColor" stroke="none" />
              <circle cx="36" cy="20" r="2.5" fill="currentColor" stroke="none" />
              <path d="M14 33 H34" />
            </>}
            {option.color === "red" && <>
              <path d="M7 14 L17 11 M31 11 L41 14" />
              <circle cx="12" cy="22" r="2" fill="currentColor" stroke="none" />
              <circle cx="36" cy="22" r="2" fill="currentColor" stroke="none" />
              <path d="M14 37 Q24 28 34 37" />
            </>}
            {option.color === "navy" && <>
              <path d="M7 21 Q12 24 17 21 M31 21 Q36 24 41 21 M19 33 H29" />
            </>}
          </svg>
        </span>
      </span>
      <span className="mood-btn__label">
        <span className="mood-btn__name">{option.name}</span>
        <span className="mood-btn__desc">{option.desc}</span>
      </span>
    </button>
  );
}
