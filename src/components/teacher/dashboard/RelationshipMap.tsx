"use client";

// 담당: 진승혜
// 대시보드 영역 2-①: 발화에서 추출한 아이들 간 언급 관계망 — 이 카드의 주인공이다.
// 외부 graph 패키지를 쓰지 않고 SVG 로 직접 그린다.
// 노드는 크림 바탕 + 얇은 컬러 링, 갈등 관계는 붉게 칠하지 않고 점선으로만 구분한다
// (위협적으로 보이지 않게 — 살핌_기획안.md 10. 가드레일)
//
// 아이에 마우스를 올리면(또는 키보드로 포커스하면) 그 아이와 이어진 선·아이만 남기고
// 나머지를 흐리게 내린다. 선이 7개만 돼도 누가 누구와 이어졌는지 눈으로 못 따라간다.
// 이 강조는 CSS 만으로는 못 한다 — 어떤 선이 "지금 올린 노드"에 닿는지는 데이터를 봐야 알 수 있어서
// 이 컴포넌트만 클라이언트 컴포넌트다. (나머지 대시보드 카드는 서버 컴포넌트로 남는다)
// 강조는 읽기를 돕는 장치일 뿐이라, 마우스를 안 올린 기본 상태만으로도 지도는 그대로 읽힌다.
//
// 노드(원+이름)만 링크다. 관계선은 클릭 대상이 아니다.
// SVG 구조를 유지한 채 <Link>(=SVG <a>)로 감싸서 키보드 포커스·스크린리더까지 링크로 잡히게 했다.
// URL 에는 studentId 만 쓴다 — enrollment_id 는 노출하지 않는다.
// 데이터: page.tsx 가 선택 날짜 시점의 관계로 조립해 props 로 내려준다.

import Link from "next/link";
import { useState } from "react";
import type { DashboardData, RelationNode } from "./mockData";

const NODE_STYLE: Record<RelationNode["tone"], { ring: string; text: string }> = {
  normal: { ring: "var(--rel-ring)", text: "var(--rel-text)" },
  conflict: { ring: "var(--rel-ring-conflict)", text: "var(--rel-text-conflict)" },
  isolated: { ring: "var(--rel-ring-isolated)", text: "var(--rel-text-muted)" },
};

export default function RelationshipMap({ nodes, edges }: DashboardData["relation"]) {
  const byId = new Map(nodes.map((n) => [n.studentId, n]));
  const [activeId, setActiveId] = useState<number | null>(null);

  /** 올린 아이와 직접 이어진 아이들. 아무도 안 올렸으면 강조는 꺼진 상태다. */
  const peerIds = new Set<number>();
  if (activeId !== null) {
    for (const e of edges) {
      if (e.from === activeId) peerIds.add(e.to);
      if (e.to === activeId) peerIds.add(e.from);
    }
  }

  const mapClass = "relation-map" + (activeId !== null ? " has-active" : "");

  return (
    <div className="relation-pane">
      <div className="pane-title">
        관계 지도
        <span className="pane-sub">발화에서 추출 · 최근 4주</span>
      </div>

      <div className="relation-map-wrap">
        <svg
          className={mapClass}
          viewBox="0 0 660 380"
          role="img"
          aria-label="학급 관계 지도"
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={() => setActiveId(null)}
        >
          {edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const conflict = e.kind === "conflict";
            const on = activeId === e.from || activeId === e.to;
            return (
              <line
                key={`${e.from}-${e.to}`}
                className={"relation-edge" + (on ? " on" : "")}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={conflict ? "var(--rel-edge-conflict)" : "var(--rel-edge)"}
                strokeWidth={conflict ? 2.4 : 2}
                strokeLinecap="round"
                strokeDasharray={conflict ? "7 6" : undefined}
              />
            );
          })}

          {nodes.map((n) => {
            const style = NODE_STYLE[n.tone];
            const active = activeId === n.studentId;
            const peer = peerIds.has(n.studentId);
            const focus = () => setActiveId(n.studentId);
            return (
              <Link
                key={n.studentId}
                href={`/students/${n.studentId}`}
                className={
                  "relation-node" + (active ? " active" : peer ? " peer" : "")
                }
                aria-label={`${n.name} 상세 보기`}
                onMouseEnter={focus}
                onFocus={focus}
                onBlur={() => setActiveId(null)}
              >
                {/* 클릭·포커스 판정 영역 (원보다 살짝 넓게) */}
                <circle cx={n.x} cy={n.y} r={n.r + 4} fill="transparent" />
                <circle
                  className="relation-node-ring"
                  cx={n.x}
                  cy={n.y}
                  r={active ? n.r + 4 : peer ? n.r + 2 : n.r}
                  fill="var(--rel-node-fill)"
                  stroke={style.ring}
                  strokeWidth={active || peer ? 3 : 2}
                  strokeDasharray={n.tone === "isolated" ? "5 4" : undefined}
                />
                <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill={style.text}>
                  {n.name}
                </text>
                {n.note && (
                  <text
                    x={n.x}
                    y={n.y + n.r + 15}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--rel-text-muted)"
                  >
                    {n.note}
                  </text>
                )}
              </Link>
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
          <i className="legend-ring" /> 3주간 언급 없음
        </span>
        <span className="relation-hint">아이 위에 올리면 이어진 아이만 남아요</span>
      </div>
    </div>
  );
}
