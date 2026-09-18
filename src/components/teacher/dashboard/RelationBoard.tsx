"use client";

// 담당: 진승혜
// "우리 반 관계" 카드 — 지도와 옆 패널이 선택 하나를 같이 본다.
// 상태가 둘 사이에 걸쳐 있어서 이 래퍼만 클라이언트 컴포넌트다.
// (선택은 URL 에 넣지 않는다. 날짜와 달리 공유하거나 되돌아올 값이 아니고,
//  지도를 훑는 동안 주소가 계속 바뀌면 뒤로가기가 쓸모없어진다.)

import { useState } from "react";
import RelationshipMap, { type MapFocus } from "./RelationshipMap";
import RelationDetailPane from "./RelationDetailPane";
import type { ConflictRow, DashboardData } from "./mockData";

const sameFocus = (a: MapFocus, b: MapFocus) =>
  a?.kind === "student" && b?.kind === "student"
    ? a.id === b.id
    : a?.kind === "pair" && b?.kind === "pair"
      ? a.key === b.key
      : false;

export default function RelationBoard({
  relation,
  conflicts,
}: {
  relation: DashboardData["relation"];
  conflicts: ConflictRow[];
}) {
  const [selected, setSelected] = useState<MapFocus>(null);

  return (
    <section className="card col-12 relation-conflict">
      <div className="card-title">
        우리 반 관계
        <span className="card-sub">발화·기록에서 본 아이들 사이</span>
      </div>
      <div className="relation-conflict-body">
        <RelationshipMap
          nodes={relation.nodes}
          edges={relation.edges}
          selected={selected}
          // 같은 걸 다시 누르면 닫힌다
          onSelect={(focus) => setSelected((current) => (sameFocus(current, focus) ? null : focus))}
        />
        <RelationDetailPane
          detail={selected?.kind === "student" ? (relation.details[selected.id] ?? null) : null}
          pair={selected?.kind === "pair" ? (relation.pairs[selected.key] ?? null) : null}
          fallbackConflicts={conflicts}
          onClear={() => setSelected(null)}
        />
      </div>
    </section>
  );
}
