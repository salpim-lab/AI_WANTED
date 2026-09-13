// 담당: 강윤지
// 등/하교 5단계: 나만의 섬에 아이템 드래그 배치. 지금은 SVG/CSS, 여유 되면 Three.js로 업그레이드.
// 프로토타입의 mousedown/touchstart 분리 로직은 Pointer Events로 통합해 다시 짬(마우스/터치 동시 대응).
// 참고: docs/prototype/prototype-student.html #s5 (.island-scene)
// 아이템은 누적만 됨 — 삭제/스트릭 소멸 로직 추가 금지.

"use client";

import { useRef, useState } from "react";
import type { Item } from "./mockScenarios";

// 기존에 배치되어 있던 아이템들 (mock — 실제로는 학생별 누적 아이템 목록을 서버에서 가져올 것)
const PLACED_ITEMS = [
  { emoji: "🌸", left: 148, top: 220, size: 22 },
  { emoji: "⭐", left: 196, top: 224, size: 20 },
  { emoji: "🍎", left: 162, top: 240, size: 18 },
  { emoji: "📚", left: 215, top: 238, size: 20 },
  { emoji: "🎨", left: 130, top: 235, size: 18 },
  { emoji: "🐶", left: 178, top: 248, size: 16 },
];

export default function IslandBoard({
  active = true,
  item,
  baseItemCount = 47,
  studentName = "민준",
  onComplete,
}: {
  active?: boolean;
  item: Item | null;
  baseItemCount?: number;
  studentName?: string;
  onComplete?: () => void;
}) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const islandSvgRef = useRef<SVGSVGElement>(null);
  const offsetRef = useRef({ x: 0, y: 0 });

  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [placed, setPlaced] = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  const emoji = item?.emoji ?? "⚽";
  const itemCount = baseItemCount + (placed ? 1 : 0);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (placed) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    offsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || !sceneRef.current) return;
    const sceneRect = sceneRef.current.getBoundingClientRect();
    let x = e.clientX - sceneRect.left - offsetRef.current.x;
    let y = e.clientY - sceneRect.top - offsetRef.current.y;
    x = Math.max(0, Math.min(sceneRect.width - 50, x));
    y = Math.max(0, Math.min(sceneRect.height - 50, y));
    setPos({ x, y });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    if (placed || !islandSvgRef.current) return;
    const svgRect = islandSvgRef.current.getBoundingClientRect();
    const isOnIsland =
      e.clientY > svgRect.top &&
      e.clientY < svgRect.bottom &&
      e.clientX > svgRect.left &&
      e.clientX < svgRect.right;
    if (isOnIsland) setPlaced(true);
  }

  const dragStyle: React.CSSProperties = pos ? { left: pos.x, top: pos.y, transform: "none" } : {};

  return (
    <div className={"screen" + (active ? " active" : "")} id="s5">
      <div className="island-header">
        <div>
          <div className="title">{studentName}이의 섬 🏝</div>
          <div className="subtitle">아이템을 섬 위에 올려봐</div>
        </div>
        <div className="count-badge">{itemCount}개 모음</div>
      </div>

      <div className="island-scene" ref={sceneRef}>
        <div className="sea" />

        <svg
          ref={islandSvgRef}
          className="island-svg"
          viewBox="0 0 340 160"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <ellipse cx="170" cy="148" rx="130" ry="14" fill="rgba(0,0,0,.08)" />
          <ellipse cx="170" cy="120" rx="130" ry="42" fill="#86efac" />
          <ellipse cx="170" cy="112" rx="130" ry="40" fill="#4ade80" />
          <ellipse cx="170" cy="115" rx="90" ry="24" fill="#fde68a" />
          <ellipse cx="170" cy="118" rx="88" ry="20" fill="#fef3c7" />
          <rect x="118" y="60" width="5" height="52" rx="2" fill="#92400e" />
          <ellipse cx="120" cy="62" rx="22" ry="14" fill="#16a34a" transform="rotate(-15 120 62)" />
          <ellipse cx="120" cy="60" rx="18" ry="11" fill="#22c55e" transform="rotate(10 120 60)" />
          <rect x="218" y="68" width="4" height="44" rx="2" fill="#92400e" />
          <ellipse cx="220" cy="70" rx="18" ry="12" fill="#16a34a" transform="rotate(20 220 70)" />
        </svg>

        {PLACED_ITEMS.map((p, i) => (
          <div
            key={i}
            className="placed-item"
            style={{ left: p.left, top: p.top, fontSize: p.size }}
          >
            {p.emoji}
          </div>
        ))}

        {!placed && <div className="island-hint">⬇ 아이템을 잡아서 섬 위에 올려봐</div>}

        <div
          className={"new-item-drag" + (dragging ? " dragging" : "") + (placed ? " placed" : "")}
          style={dragStyle}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {emoji}
        </div>

        {showComplete && (
          <div className="island-complete-overlay show">
            <div className="complete-emoji">🎉</div>
            <div className="complete-title">오늘 체크인 완료!</div>
            <div className="complete-sub">오늘도 이야기해줘서 고마워 ☺️</div>
          </div>
        )}
      </div>

      <div className="island-bottom-bar">
        <div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3 }}>
            지금까지 모은 아이템
          </div>
          <div className="prev-items">
            {PLACED_ITEMS.map((p, i) => (
              <span key={i}>{p.emoji}</span>
            ))}
          </div>
        </div>
        <button
          className={"done-btn" + (placed ? " enabled" : "")}
          onClick={() => {
            setShowComplete(true);
            onComplete?.();
          }}
        >
          완료 ✓
        </button>
      </div>
    </div>
  );
}
