"use client";

// 담당: 진승혜
// "우리 반 관계" 카드 — 지도와 옆 패널이 선택 하나를 같이 본다.
// 상태가 둘 사이에 걸쳐 있어서 이 래퍼만 클라이언트 컴포넌트다.
// (선택은 URL 에 넣지 않는다. 날짜와 달리 공유하거나 되돌아올 값이 아니고,
//  지도를 훑는 동안 주소가 계속 바뀌면 뒤로가기가 쓸모없어진다.)

import { useState } from "react";
import RelationshipMap, { type MapFocus } from "./RelationshipMap";
import RelationDetailPane from "./RelationDetailPane";
import {
  DEFAULT_RELATION_PERIOD,
  RELATION_PERIODS,
  type DashboardData,
  type RelationPeriod,
} from "./mockData";

const sameFocus = (a: MapFocus, b: MapFocus) =>
  a?.kind === "student" && b?.kind === "student"
    ? a.id === b.id
    : a?.kind === "pair" && b?.kind === "pair"
      ? a.key === b.key
      : false;

export default function RelationBoard({
  relation,
}: {
  relation: DashboardData["relation"];
}) {
  const [selected, setSelected] = useState<MapFocus>(null);
  const [period, setPeriod] = useState<RelationPeriod>(DEFAULT_RELATION_PERIOD);

  const graph = relation[period];
  const label = RELATION_PERIODS.find((p) => p.id === period)!.label;

  return (
    <section className="card col-12 relation-conflict">
      <div className="card-title">
        우리 반 관계
        <span className="card-sub">발화|기록에서 본 아이들 사이</span>

        {/* 기간을 바꿔도 고른 아이·선은 그대로 둔다 — 같은 관계가 기간에 따라
            어떻게 달라지는지 보는 게 이 토글을 쓰는 이유다. */}
        <div className="rel-period" role="group" aria-label="관계 기간">
          {RELATION_PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={"rel-period-btn" + (p.id === period ? " on" : "")}
              aria-pressed={p.id === period}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relation-conflict-body">
        <RelationshipMap
          nodes={graph.nodes}
          edges={graph.edges}
          selected={selected}
          // 같은 걸 다시 누르면 닫힌다
          onSelect={(focus) => setSelected((current) => (sameFocus(current, focus) ? null : focus))}
          onClear={() => setSelected(null)}
        />
        <RelationDetailPane
          detail={selected?.kind === "student" ? (graph.details[selected.id] ?? null) : null}
          pair={selected?.kind === "pair" ? (graph.pairs[selected.key] ?? null) : null}
          periodLabel={label}
          /* 고른 기간 안의 갈등만 — "누적"으로 넓히면 건수도 같이 늘어난다 */
          fallbackConflicts={graph.conflicts}
        />
      </div>
    </section>
  );
}
