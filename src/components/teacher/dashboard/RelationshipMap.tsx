"use client";

// 담당: 진승혜
// 대시보드 영역 2-①: 발화에서 추출한 아이들 간 언급 관계망 — 이 카드의 주인공이다.
// 외부 graph 패키지를 쓰지 않고 SVG 로 직접 그린다.
// 원에는 색을 쓰지 않는다 — 스무 개 원이 저마다 다른 색을 띠면 그게 먼저 읽히고,
// 정작 이 지도가 보여주려는 것(누가 크고, 누가 어디에 붙어 있나)이 뒤로 밀린다.
// 원 크기는 딱 3단계뿐이다: 평소(1단계) · 소외·갈등이라 살펴볼 아이(2단계) ·
// 지금 고른 아이(3단계, tone 과 무관하게 항상 이 단계). 중간값을 두지 않는다 —
// 단계가 여러 개면 "이게 몇 단계짜리 큰 원이지"를 매번 옆 원과 비교해야 해서,
// 오히려 "평소인지 살펴볼 아이인지"가 한눈에 안 읽혔다. (TIER1/2/3_SCALE 참고)
// 갈등 관계는 붉게 칠하지 않고 점선으로만 구분한다 (살핌_기획안.md 10. 가드레일)
//
// 아이에 마우스를 올리면(또는 키보드로 포커스하면) 그 아이와 이어진 선·아이만 남기고
// 나머지를 흐리게 내린다. 선이 서른 개가 넘으면 누가 누구와 이어졌는지 눈으로 못 따라간다.
// 고른 아이는 원을 3단계로 부풀리고 그 아이에 닿은 선은 진하게 내린다 —
// 흐리게 내리는 것만으로는 스무 명 사이에서 "지금 보는 아이"가 어디 있는지 눈에 안 들어온다.
// 이 강조는 CSS 만으로는 못 한다 — 어떤 선이 "지금 올린 노드"에 닿는지는 데이터를 봐야 알 수 있다.
//
// 고른 것을 푸는 "닫기"는 지도 안 오른쪽 위에 둔다 — 고르는 자리와 푸는 자리가 같아야
// 눈이 옆 패널까지 건너갔다 오지 않는다.
//
// 아이를 누르면 그 아이의 관계가, 선을 누르면 "이 선이 왜 생겼는지"가 옆 패널에 뜬다.
// 페이지를 넘기지 않으므로(RelationBoard 참고) 노드도 선도 <Link> 가 아니라 <g role="button"> 이다.
// 이름은 성까지 다 쓴다: 같은 이름이 흔해서(민준/지훈) 성이 빠지면 누군지 헷갈린다.
// 원 아래 꼬리말("먼저 이야기하지만 이름이 안 나와요")은 뺐다 — 같은 이야기를
// 아래 범례가 점선 하나로 하고 있어서, 지도 위에 문장까지 얹으면 원만 가렸다.

import { useState } from "react";
import type { RelationGraph } from "./mockData";

/** 모든 원의 기준 반지름. 1·2·3단계는 전부 이 값의 배수로만 정해진다 —
    데이터(언급·갈등 건수)로 반지름을 촘촘히 계산하던 예전 방식은 단계가 사실상
    무한히 생겨서 "몇 단계짜리 큰 원인지"가 안 읽혔다.
    기준 반지름을 10 으로 올려 달라는 요청에 맞춰, LAYOUT(mockData.ts)의 두 고리 사이
    간격도 함께 넓혔다 (스무 명 기준 최소 간격 약 72px) — 2단계 원 둘이 그 간격에서
    만나도(2×10×3.0 + NODE_GAP = 67) 겹치지 않는 크기다. */
const NODE_UNIT_R = 10;
/** 1단계: 평소 아이 */
const TIER1_SCALE = 1.5;
/** 2단계: 소외·갈등이라 주의해서 봐야 할 아이 (tone !== "normal") */
const TIER2_SCALE = 3.0;
/** 3단계: 지금 고른 아이. tone 과 무관하게 이 단계다.
    다만 이 배수를 그대로 쓰지는 않는다 — 옆 원과 너무 가까우면 덮어 버렸다.
    아래 roomAround 로 "이웃까지 남은 자리"를 재서 둘 중 작은 쪽을 쓴다. */
const TIER3_SCALE = 4.0;

/** 이 아이가 지금(고르지 않은) 평소 반지름 — tone 하나로 1단계·2단계를 가른다 */
const restingR = (n: { tone: "normal" | "conflict" | "isolated" }) =>
  NODE_UNIT_R * (n.tone === "normal" ? TIER1_SCALE : TIER2_SCALE);

/** 원과 원 사이에 최소한 남겨 둘 틈 */
const NODE_GAP = 7;
/** 지도 테두리(viewBox)까지 남겨 둘 여백 */
const EDGE_PAD = 4;
const VIEW_W = 660;
const VIEW_H = 380;

/** 이름 글자는 원 크기를 따라가되, 대시보드 글자 크기 단계(--fs-*) 안에서만 움직인다.
    비율로 계산하면 12.3px 같은 값이 나와 차트만 다른 눈금을 쓰게 된다.
    실제로는 대부분 12px 이고, 크게 그려진 아이와 고른 아이만 14px 가 된다. */
const LABEL_STEPS: [min: number, size: number][] = [
  [46, 14],
  [28, 12],
  [22, 11],
  [0, 10.5],
];
const labelSize = (r: number) => LABEL_STEPS.find(([min]) => r >= min)![1];

/** 아이 하나이거나 짝 하나의 식별자 — mock 은 1~20 번호, 실제 데이터는 students.id(uuid) 문자열이다 */
type Id = string | number;

/** 지금 강조 중인 대상 — 아이 하나이거나 선 하나다.
    pair 는 원래 두 id(a·b)를 그대로 들고 다닌다 — key 문자열을 나중에 다시 쪼개 복원하지 않는다.
    uuid 는 "-"를 이미 포함하고 있어서 문자열을 쪼개 아이디를 되찾는 방식 자체가 안전하지 않다. */
export type MapFocus = { kind: "student"; id: Id } | { kind: "pair"; key: string; a: Id; b: Id } | null;

/** 두 id 를 늘 같은 순서로 이어 붙인 값 — 실제 계산(누가 이어졌는지)은 그대로고,
    문자열로 바뀌는 건 "짝을 가리키는 이름표" 하나뿐이다. */
const keyOf = (a: Id, b: Id) => (String(a) < String(b) ? `${a}::${b}` : `${b}::${a}`);

/** 선은 직선 대신 아주 살짝 휘게 긋는다.
    스무 명이 서른 개 넘는 직선으로 이어지면 자로 그은 거미줄처럼 보이고, 두 원 사이를
    지나가는 선과 그 원에 닿는 선이 구분되지 않는다. 같은 쪽으로만 휘게 해서(번호가 작은
    아이 → 큰 아이 기준) 볼 때마다 모양이 달라지지 않게 한다. 휘는 폭은 길이의 12%, 최대 26. */
const edgePath = (p: { x: number; y: number }, q: { x: number; y: number }) => {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(len * 0.12, 26);
  const cx = (p.x + q.x) / 2 + (-dy / len) * bow;
  const cy = (p.y + q.y) / 2 + (dx / len) * bow;
  return `M${p.x} ${p.y} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${q.x} ${q.y}`;
};

export default function RelationshipMap({
  nodes,
  edges,
  selected,
  onSelect,
  onClear,
}: Pick<RelationGraph, "nodes" | "edges"> & {
  selected: MapFocus;
  onSelect: (focus: NonNullable<MapFocus>) => void;
  onClear: () => void;
}) {
  const byId = new Map(nodes.map((n) => [n.studentId, n]));
  const [hover, setHover] = useState<MapFocus>(null);

  // 누른 대상이 있으면 계속 강조한다. 마우스를 올린 쪽이 우선.
  const active = hover ?? selected;

  // 강조할 아이들 — 아이를 짚으면 그 아이와 이어진 아이들, 선을 짚으면 그 선의 양쪽만.
  const litNodes = new Set<Id>();
  const isEdgeLit = (from: Id, to: Id) => {
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
    litNodes.add(active.a);
    litNodes.add(active.b);
  }

  /* 고른 아이만 3단계로 키운다. 나머지는 tone 그대로 1·2단계 반지름에 머무른다 —
     "겹치지 않는다"는 이 나머지가 고정값이라는 데서 나온다: 매번 지도를 그릴 때
     restingR(normal 1.2배 / 소외·갈등 1.8배)로만 움직이니, 고른 원 하나가 이웃의
     "평소" 반지름을 넘어서지 않게만 막으면 항상 안전하다. */
  /** 이 아이가 이웃·테두리에 닿지 않고 커질 수 있는 최대 반지름 */
  const roomAround = (n: (typeof nodes)[number]) => {
    const toEdge = Math.min(n.x, VIEW_W - n.x, n.y, VIEW_H - n.y) - EDGE_PAD;
    const toNeighbour = Math.min(
      ...nodes
        .filter((o) => o.studentId !== n.studentId)
        .map((o) => Math.hypot(o.x - n.x, o.y - n.y) - restingR(o) - NODE_GAP),
    );
    return Math.min(toEdge, toNeighbour);
  };

  const sized = nodes.map((n) => {
    const isActive = active?.kind === "student" && active.id === n.studentId;
    const lit = litNodes.has(n.studentId);
    const baseR = restingR(n);
    // 3단계로 키우되, 이웃까지 남은 자리를 넘지 않는다 (평소 크기 밑으로 작아지지는 않는다)
    const activeR = Math.max(baseR, Math.min(NODE_UNIT_R * TIER3_SCALE, roomAround(n)));
    return {
      n,
      isActive,
      lit,
      picked: selected?.kind === "student" && selected.id === n.studentId,
      shownR: Math.round(isActive ? activeR : baseR),
    };
  });

  return (
    <div className="relation-pane">
      <div className="pane-title">관계 지도</div>

      <div className="relation-map-wrap">
        {/* 무언가를 고른 동안에만 나온다. 지도 위에 겹쳐 뜨지만 노드가 없는 오른쪽 위 구석이다. */}
        {selected && (
          <button type="button" className="relation-clear" onClick={onClear}>
            닫기
          </button>
        )}
        <svg
          className={"relation-map" + (active ? " has-active" : "")}
          viewBox="0 0 660 380"
          role="group"
          aria-label="학급 관계 지도"
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={() => setHover(null)}
        >
          {/* 원은 납작한 흰 동그라미가 아니라 살짝 떠 있는 칩처럼 그린다 —
              위에서 아래로 옅어지는 면 + 부드러운 그림자. 색을 안 쓰기로 한 자리라
              입체감이 유일하게 남은 표현이다. */}
          <defs>
            <linearGradient id="relNodeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--rel-node-top)" }} />
              <stop offset="100%" style={{ stopColor: "var(--rel-node-bottom)" }} />
            </linearGradient>
            <filter id="relNodeShadow" x="-45%" y="-45%" width="190%" height="190%">
              <feDropShadow dy="2" stdDeviation="3.2" floodColor="#33407a" floodOpacity="0.14" />
            </filter>
            <filter id="relNodeShadowLift" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dy="4" stdDeviation="7" floodColor="#33407a" floodOpacity="0.22" />
            </filter>
          </defs>

          {edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const conflict = e.kind === "conflict";
            const key = keyOf(e.from, e.to);
            const focus = { kind: "pair", key, a: e.from, b: e.to } as const;
            // 휘는 방향을 번호 순서로 고정한다 (a→b 로 그리든 b→a 로 그리든 같은 모양)
            const [from, to] = e.from < e.to ? [a, b] : [b, a];
            const d = edgePath(from, to);
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
                {/* 선이 얇아 그대로는 못 누른다. 투명한 굵은 선을 겹쳐 누를 자리를 넓힌다. */}
                <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
                {/* 자주 오간 사이일수록 굵고 진하게. 기간을 넓히면 선이 늘어나는데,
                    굵기가 다 같으면 빽빽해 보이기만 하고 무리가 안 보인다. */}
                <path
                  className={"relation-edge" + (conflict ? " is-conflict" : "")}
                  d={d}
                  fill="none"
                  stroke={conflict ? "var(--rel-edge-conflict)" : "var(--rel-edge)"}
                  strokeWidth={conflict ? 2.2 : 1.2 + e.strength * 2.4}
                  strokeOpacity={conflict ? 1 : 0.4 + e.strength * 0.6}
                  strokeLinecap="round"
                  strokeDasharray={conflict ? "6 7" : undefined}
                />
              </g>
            );
          })}

          {sized.map(({ n, isActive, lit, picked, shownR }) => {
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
                {/* 클릭·포커스 판정 영역 (보이는 원보다 살짝 넓게) */}
                <circle cx={n.x} cy={n.y} r={shownR + 4} fill="transparent" />
                {/* 스무 개를 저마다 다른 색으로 칠하지는 않는다 — 그러면 색이 먼저 읽히고
                    크기(살펴볼 일)가 뒤로 밀린다. 대신 고른 아이 하나만 테두리에 색을 준다.
                    "이름이 안 나온 아이"는 그대로 점선이다 (색이 아니라 선 모양). */}
                <circle
                  className="relation-node-ring"
                  cx={n.x}
                  cy={n.y}
                  r={shownR}
                  fill="url(#relNodeFill)"
                  stroke={
                    isActive
                      ? "var(--rel-ring-active)"
                      : lit
                        ? "var(--rel-ring-lit)"
                        : n.tone === "isolated"
                          ? /* 점선은 같은 색으로 두면 끊긴 만큼 옅어져 사라진다 — 한 단 진하게 */
                            "var(--rel-ring-dashed)"
                          : "var(--rel-ring)"
                  }
                  strokeWidth={isActive ? 2.6 : lit ? 2.2 : 1.8}
                  strokeDasharray={n.tone === "isolated" ? "5 5" : undefined}
                  strokeLinecap="round"
                  filter={isActive ? "url(#relNodeShadowLift)" : "url(#relNodeShadow)"}
                />
                {/* 성까지 다 쓴다. 원이 작으면 글자를 줄이지 이름을 줄이지 않는다. */}
                <text
                  x={n.x}
                  y={n.y + 4}
                  textAnchor="middle"
                  fontSize={labelSize(shownR)}
                  fill="var(--rel-text)"
                >
                  {n.name}
                </text>
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
          <i className="legend-ring" /> 이름이 안 나온 아이 (점선)
        </span>
        <span>
          <i className="legend-big" /> 더 살펴볼 아이 (큰 원)
        </span>
      </div>
    </div>
  );
}
