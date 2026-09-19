"use client";

import { useMemo, useState } from "react";
import IslandExperience from "@/components/student/island/IslandExperience";
import { ITEM_CATALOG } from "@/lib/items/itemCatalog";
import { MINJUN_DEMO_ITEMS, MINJUN_DEMO_PLACEMENTS, placementsToGifts, type DemoPlacement } from "@/lib/items/minjunDemoIsland";

/** 개발 전용: 민준 데모 아이템을 하나씩 실제 배치 흐름으로 놓고, 자리를 JSON 파일로 저장한다. */
export default function MinjunIslandPage() {
  const [placements, setPlacements] = useState<DemoPlacement[]>(MINJUN_DEMO_PLACEMENTS);
  const [itemId, setItemId] = useState<string>(MINJUN_DEMO_ITEMS[0].itemId);
  const [round, setRound] = useState(0);
  const [status, setStatus] = useState("");
  const item = ITEM_CATALOG.find(entry => entry.id === itemId)!;
  const reason = MINJUN_DEMO_ITEMS.find(entry => entry.itemId === itemId)?.reason;
  const others = useMemo(() => placementsToGifts(placements.filter(p => p.itemId !== itemId)), [placements, itemId]);
  const isPlaced = (id: string) => placements.some(p => p.itemId === id);
  const next = (id: string) => { setItemId(id); setRound(r => r + 1); };

  async function save() {
    const res = await fetch("/api/dev/demo-placements", { method: "POST", body: JSON.stringify(placements) });
    setStatus(res.ok ? `저장했어요 (${placements.length}개)` : "저장하지 못했어요");
  }

  return (
    <main className="min-h-screen bg-[#edf4ee]">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-4 py-3 text-sm text-[#344332] lg:px-12">
        {MINJUN_DEMO_ITEMS.map(({ itemId: id, date, period }) => <button key={id} aria-pressed={id === itemId} onClick={() => next(id)}
          className={`rounded-xl border px-3 py-2 ${id === itemId ? "border-[#47694b] bg-[#edf5eb]" : "bg-white"}`}>
          {date} {period} · {ITEM_CATALOG.find(entry => entry.id === id)?.displayName}{isPlaced(id) && " ✓"}
        </button>)}
        <button onClick={() => { setPlacements(current => current.filter(p => p.itemId !== itemId)); setRound(r => r + 1); }} disabled={!isPlaced(itemId)} className="rounded-xl border bg-white px-3 py-2 disabled:opacity-40">이 아이템 치우기</button>
        <button onClick={save} className="rounded-xl bg-[#47694b] px-4 py-2 text-white">배치 저장</button>
        <span className="text-[#71816a]">{status || `놓은 아이템 ${placements.length}/${MINJUN_DEMO_ITEMS.length}개 · 놓은 뒤 “배치 저장”을 눌러야 파일에 기록돼요. 다시 놓으면 자리가 바뀌어요.`}</span>
      </div>
      <IslandExperience
        key={round}
        studentName="민준"
        placedGifts={others}
        incomingItem={{ emoji: "🎁", name: item.displayName, reason: reason ?? item.displayName, assetFormat: "procedural", geometrySpec: item.spec }}
        onComplete={gift => {
          if (!gift) return;
          setPlacements(current => [...current.filter(p => p.itemId !== itemId), { itemId, x: gift.x, z: gift.z }]);
          setStatus("");
          const nextItem = MINJUN_DEMO_ITEMS.find(({ itemId: id }) => id !== itemId && !placements.some(p => p.itemId === id));
          next(nextItem?.itemId ?? itemId);
        }}
      />
    </main>
  );
}
