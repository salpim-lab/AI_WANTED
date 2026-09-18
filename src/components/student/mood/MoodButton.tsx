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
          <svg className="mood-btn__face" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" focusable="false">
            {option.color === "green" && <>
              <path d="M9 20 Q14 12 19 20 M29 20 Q34 12 39 20" />
              <path d="M13 28 Q24 31 35 28 Q32 40 24 40 Q16 40 13 28 Z" fill="currentColor" stroke="none" />
            </>}
            {option.color === "yellow" && <>
              <circle cx="14" cy="20" r="2.5" fill="currentColor" stroke="none" />
              <circle cx="34" cy="20" r="2.5" fill="currentColor" stroke="none" />
              <path d="M16 33 H32" />
            </>}
            {option.color === "red" && <>
              <path d="M9 14 L19 11 M29 11 L39 14" />
              <circle cx="14" cy="22" r="2" fill="currentColor" stroke="none" />
              <circle cx="34" cy="22" r="2" fill="currentColor" stroke="none" />
              <path d="M16 37 Q24 28 32 37" />
            </>}
            {option.color === "navy" && <>
              <path d="M9 21 Q14 24 19 21 M29 21 Q34 24 39 21 M21 33 H27" />
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
