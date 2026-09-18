"use client";

// 담당: 진승혜
// 대시보드 영역 2-①: 발화에서 추출한 아이들 간 언급 관계망 — 이 카드의 주인공이다.
// 외부 graph 패키지를 쓰지 않고 SVG 로 직접 그린다.
// 노드는 크림 바탕 + 얇은 컬러 링, 갈등 관계는 붉게 칠하지 않고 점선으로만 구분한다
// (위협적으로 보이지 않게 — 살핌_기획안.md 10. 가드레일)
//
// 아이에 마우스를 올리면(또는 키보드로 포커스하면) 그 아이와 이어진 선·아이만 남기고
// 나머지를 흐리게 내린다. 선이 서른 개가 넘으면 누가 누구와 이어졌는지 눈으로 못 따라간다.
// 이 강조는 CSS 만으로는 못 한다 — 어떤 선이 "지금 올린 노드"에 닿는지는 데이터를 봐야 알 수 있다.
//
// 아이를 누르면 그 아이의 관계가, 선을 누르면 "이 선이 왜 생겼는지"가 옆 패널에 뜬다.
// 페이지를 넘기지 않으므로(RelationBoard 참고) 노드도 선도 <Link> 가 아니라 <g role="button"> 이다.
// 이름은 성까지 다 쓴다: 같은 이름이 흔해서(민준/지훈) 성이 빠지면 누군지 헷갈린다.

import { useState } from "react";
import type { RelationGraph, RelationNode } from "./mockData";

const NODE_STYLE: Record<RelationNode["tone"], { ring: string; text: string }> = {
  normal: { ring: "var(--rel-ring)", text: "var(--rel-text)" },
  conflict: { ring: "var(--rel-ring-conflict)", text: "var(--rel-text-conflict)" },
  isolated: { ring: "var(--rel-ring-isolated)", text: "var(--rel-text-muted)" },
};

/** 지금 강조 중인 대상 — 아이 하나이거나 선 하나다 */
export type MapFocus = { kind: "student"; id: number } | { kind: "pair"; key: string } | null;

const keyOf = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export default function RelationshipMap({
  nodes,
  edges,
  periodLabel,
  selected,
  onSelect,
}: Pick<RelationGraph, "nodes" | "edges"> & {
  periodLabel: string;
  selected: MapFocus;
  onSelect: (focus: NonNullable<MapFocus>) => void;
}) {
  const byId = new Map(nodes.map((n) => [n.studentId, n]));
  const [hover, setHover] = useState<MapFocus>(null);

  // 누른 대상이 있으면 계속 강조한다. 마우스를 올린 쪽이 우선.
  const active = hover ?? selected;

  // 강조할 아이들 — 아이를 짚으면 그 아이와 이어진 아이들, 선을 짚으면 그 선의 양쪽만.
  const litNodes = new Set<number>();
  const isEdgeLit = (from: number, to: number) => {
    if (!active) return false;
    if (active.kind === "pair") return keyOf(from, to) === active.key;
    return from === active.id || to === active.id;
  };
  if (active?.kind === "student") {
    litNodes.add(active.id);
    for (const e of edges) {
      if (e.from === active.id) litNodes.add(e.to);
      if (e.to === active.id) litNodes.add(e.from);
    }
  } else if (active?.kind === "pair") {
    for (const id of active.key.split("-").map(Number)) litNodes.add(id);
  }

  return (
    <div className="relation-pane">
      <div className="pane-title">
        관계 지도
        <span className="pane-sub">발화·업무기록에서 추출 · {periodLabel}</span>
      </div>

      <div className="relation-map-wrap">
        <svg
          className={"relation-map" + (active ? " has-active" : "")}
          viewBox="0 0 660 380"
          role="group"
          aria-label="학급 관계 지도"
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={() => setHover(null)}
        >
          {edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const conflict = e.kind === "conflict";
            const key = keyOf(e.from, e.to);
            const focus = { kind: "pair", key } as const;
            return (
              <g
                key={key}
                className={
                  "relation-edge-hit" +
                  (isEdgeLit(e.from, e.to) ? " on" : "") +
                  (selected?.kind === "pair" && selected.key === key ? " picked" : "")
                }
                role="button"
                tabIndex={0}
                aria-label={`${a.name}과 ${b.name}의 관계 보기`}
                onMouseEnter={() => setHover(focus)}
                onFocus={() => setHover(focus)}
                onBlur={() => setHover(null)}
                onClick={() => onSelect(focus)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(focus);
                  }
                }}
              >
                {/* 선이 2px 라 그대로는 못 누른다. 투명한 굵은 선을 겹쳐 누를 자리를 넓힌다. */}
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={16} />
                {/* 자주 오간 사이일수록 굵고 진하게. 기간을 넓히면 선이 늘어나는데,
                    굵기가 다 같으면 빽빽해 보이기만 하고 무리가 안 보인다. */}
                <line
                  className="relation-edge"
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={conflict ? "var(--rel-edge-conflict)" : "var(--rel-edge)"}
                  strokeWidth={conflict ? 2.4 : 1 + e.strength * 2.2}
                  strokeOpacity={conflict ? 1 : 0.35 + e.strength * 0.65}
                  strokeLinecap="round"
                  strokeDasharray={conflict ? "7 6" : undefined}
                />
              </g>
            );
          })}

          {nodes.map((n) => {
            const style = NODE_STYLE[n.tone];
            const isActive = active?.kind === "student" && active.id === n.studentId;
            const lit = litNodes.has(n.studentId);
            const picked = selected?.kind === "student" && selected.id === n.studentId;
            const focus = { kind: "student", id: n.studentId } as const;
            return (
              <g
                key={n.studentId}
                className={
                  "relation-node" +
                  (isActive ? " active" : lit ? " peer" : "") +
                  (picked ? " picked" : "")
                }
                role="button"
                tabIndex={0}
                aria-pressed={picked}
                aria-label={`${n.name} 관계 상세 보기`}
                onMouseEnter={() => setHover(focus)}
                onFocus={() => setHover(focus)}
                onBlur={() => setHover(null)}
                onClick={() => onSelect(focus)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(focus);
                  }
                }}
              >
                {/* 클릭·포커스 판정 영역 (원보다 살짝 넓게) */}
                <circle cx={n.x} cy={n.y} r={n.r + 4} fill="transparent" />
                <circle
                  className="relation-node-ring"
                  cx={n.x}
                  cy={n.y}
                  r={isActive ? n.r + 4 : lit ? n.r + 2 : n.r}
                  fill="var(--rel-node-fill)"
                  stroke={style.ring}
                  strokeWidth={isActive || lit ? 3 : 2}
                  strokeDasharray={n.tone === "isolated" ? "5 4" : undefined}
                />
                {/* 성까지 다 쓴다. 원이 작으면 글자를 줄이지 이름을 줄이지 않는다. */}
                <text
                  x={n.x}
                  y={n.y + 4}
                  textAnchor="middle"
                  fontSize={n.r >= 28 ? 12.5 : n.r >= 22 ? 10.5 : n.r >= 17 ? 9 : 8}
                  fontWeight="700"
                  fill={style.text}
                >
                  {n.name}
                </text>
                {n.note && (
                  <text
                    x={n.x}
                    y={n.y + n.r + 14}
                    textAnchor="middle"
                    fontSize="9.5"
                    fill="var(--rel-text-muted)"
                  >
                    {n.note}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="relation-legend">
        <span>
          <i className="legend-line legend-line-conflict" /> 갈등으로 기록된 관계
        </span>
        <span>
          <i className="legend-line" /> 서로 언급한 관계
        </span>
        <span>
          <i className="legend-ring" /> 다른 아이 대화에 이름이 안 나온 아이
        </span>
        <span className="relation-hint">아이나 선을 누르면 옆에 펼쳐져요</span>
      </div>
    </div>
  );
}
