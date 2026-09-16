// 담당: 진승혜
// 대시보드 영역 2-①: 발화에서 추출한 아이들 간 언급 관계망 — 이 카드의 주인공이다.
// 외부 graph 패키지를 쓰지 않고 SVG 로 직접 그린다.
// 노드는 크림 바탕 + 얇은 컬러 링, 갈등 관계는 붉게 칠하지 않고 점선으로만 구분한다
// (위협적으로 보이지 않게 — 살핌_기획안.md 10. 가드레일)
//
// 노드(원+이름)만 링크다. 관계선은 클릭 대상이 아니다.
// SVG 구조를 유지한 채 <Link>(=SVG <a>)로 감싸서 키보드 포커스·스크린리더까지 링크로 잡히게 했다.
// URL 에는 studentId 만 쓴다 — enrollment_id 는 노출하지 않는다.
// 데이터: page.tsx 가 선택 날짜 시점의 관계로 조립해 props 로 내려준다.

import Link from "next/link";
import type { DashboardData, RelationNode } from "./mockData";

const NODE_STYLE: Record<RelationNode["tone"], { ring: string; text: string }> = {
  normal: { ring: "var(--rel-ring)", text: "var(--rel-text)" },
  conflict: { ring: "var(--rel-ring-conflict)", text: "var(--rel-text-conflict)" },
  isolated: { ring: "var(--rel-ring-isolated)", text: "var(--rel-text-muted)" },
};

export default function RelationshipMap({ nodes, edges }: DashboardData["relation"]) {
  const byId = new Map(nodes.map((n) => [n.studentId, n]));

  return (
    <div className="relation-pane">
      <div className="pane-title">
        관계 지도
        <span className="pane-sub">발화에서 추출 · 최근 4주</span>
      </div>

      <div className="relation-map-wrap">
        <svg viewBox="0 0 660 380" role="img" aria-label="학급 관계 지도" preserveAspectRatio="xMidYMid meet">
          {edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const conflict = e.kind === "conflict";
            return (
              <line
                key={`${e.from}-${e.to}`}
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
            return (
              <Link
                key={n.studentId}
                href={`/students/${n.studentId}`}
                className="relation-node"
                aria-label={`${n.name} 상세 보기`}
              >
                {/* 클릭·포커스 판정 영역 (원보다 살짝 넓게) */}
                <circle cx={n.x} cy={n.y} r={n.r + 4} fill="transparent" />
                <circle
                  className="relation-node-ring"
                  cx={n.x}
                  cy={n.y}
                  r={n.r}
                  fill="var(--rel-node-fill)"
                  stroke={style.ring}
                  strokeWidth={2}
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
        <span className="relation-hint">이름을 누르면 아이 상세로 이동해요</span>
      </div>
    </div>
  );
}
