"use client";

import { useState } from "react";
import IslandExperience from "@/components/student/island/IslandExperience";
import type { IslandGift } from "@/components/student/island/types";
import { FALLBACK_ITEM_SPEC } from "@/lib/items/fallbackItem";
import { ITEM_CATALOG } from "@/lib/items/itemCatalog";

const FALLBACK_ID = "fallback";
const categories = [...new Set(ITEM_CATALOG.map(item => item.category))];

/** Offline fixture: the real student placement flow with catalog assets, without OpenAI or Supabase. */
export default function ItemPipelineLabPage() {
  const [itemId, setItemId] = useState(ITEM_CATALOG[0].id);
  const [placed, setPlaced] = useState<IslandGift[]>([]);
  const [round, setRound] = useState(0);
  const catalogItem = ITEM_CATALOG.find(item => item.id === itemId);
  const spec = catalogItem?.spec ?? FALLBACK_ITEM_SPEC;

  const next = (id: string) => { setItemId(id); setRound(r => r + 1); };
  const random = () => next(ITEM_CATALOG[Math.floor(Math.random() * ITEM_CATALOG.length)].id);

  return (
    <main className="min-h-screen bg-[#edf4ee]">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-4 py-3 text-sm text-[#344332] lg:px-12">
        <label htmlFor="pipeline-item" className="font-semibold">놓을 아이템</label>
        <select id="pipeline-item" value={itemId} onChange={event => next(event.target.value)} className="rounded-xl border border-[#d6e3d7] bg-white px-3 py-2">
          {categories.map(category => <optgroup key={category} label={category}>
            {ITEM_CATALOG.filter(item => item.category === category).map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}
          </optgroup>)}
          <option value={FALLBACK_ID}>기본 선물 (실패 시)</option>
        </select>
        <button onClick={random} className="rounded-xl border bg-white px-3 py-2">무작위</button>
        <button onClick={() => { setPlaced([]); setRound(r => r + 1); }} disabled={!placed.length} className="rounded-xl border bg-white px-3 py-2 disabled:opacity-40">놓은 아이템 모두 지우기</button>
        <span className="text-[#71816a]">놓은 아이템 {placed.length}개 · “배치 종료”를 누르면 고른 아이템이 다시 준비돼요. 새로고침하면 초기화돼요.</span>
      </div>
      <IslandExperience
        key={round}
        studentName="테스트 학생"
        placedGifts={placed}
        incomingItem={{
          emoji: "🎁",
          name: spec.name,
          reason: "API·DB 없이 카탈로그 geometry_spec으로 실제 배치 흐름을 시험하는 아이템",
          assetFormat: "procedural",
          geometrySpec: spec,
        }}
        onComplete={gift => {
          if (!gift) return;
          setPlaced(current => [...current, { ...gift, id: `lab-${current.length + 1}` }]);
          setRound(r => r + 1);
        }}
      />
    </main>
  );
}
