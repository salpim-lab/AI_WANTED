// 담당: 이유민
// 4색 신호등 선택 (초록/노랑/빨강/남색) — 등교 2단계, 하교 1단계 공용
// 참고: docs/prototype/prototype-student.html #s2

import type { SignalColor } from "@/lib/types/signal";

const COLOR_OPTIONS: {
  color: SignalColor;
  className: string;
  emoji: string;
  name: string;
  desc: string;
}[] = [
  { color: "green", className: "green", emoji: "🟢", name: "초록", desc: "기분 좋아요" },
  { color: "yellow", className: "yellow", emoji: "🟡", name: "노랑", desc: "그저 그래요" },
  { color: "red", className: "red", emoji: "🔴", name: "빨강", desc: "기분이 안 좋아요" },
  { color: "navy", className: "navy", emoji: "🔵", name: "남색", desc: "혼자 있고 싶어요" },
];

export default function ColorPicker({
  onSelect,
  active = true,
}: {
  onSelect: (color: SignalColor) => void;
  active?: boolean;
}) {
  return (
    <div className={"screen" + (active ? " active" : "")} id="s2">
      <div className="s2-question">
        <div className="label">오늘의 기분</div>
        <h2>지금 기분은 어때?</h2>
        <div className="sub">가장 비슷한 색을 골라봐</div>
      </div>

      <div className="color-grid">
        {COLOR_OPTIONS.map((c) => (
          <button
            key={c.color}
            className={"color-btn " + c.className}
            onClick={() => onSelect(c.color)}
          >
            <span className="emoji">{c.emoji}</span>
            <span className="color-name">{c.name}</span>
            <span className="color-desc">{c.desc}</span>
          </button>
        ))}
      </div>

      <div className="s2-skip">색만 고르고 끝내도 괜찮아 🙂</div>
    </div>
  );
}
