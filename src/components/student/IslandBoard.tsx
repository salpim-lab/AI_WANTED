// 담당: 강윤지 — 기존 등/하교 페이지의 props를 유지하는 3D 섬 진입점.
"use client";

import IslandExperience from "./island/IslandExperience";
import type { Item } from "./mockScenarios";
import { FALLBACK_ITEM_SPEC } from "@/lib/items/fallbackItem";
import { findCatalogItem } from "@/lib/items/itemCatalog";

export default function IslandBoard({
  active = true,
  item,
  baseItemCount = 0,
  studentName = "민준",
  onComplete,
}: {
  active?: boolean;
  item: Item | null;
  baseItemCount?: number;
  studentName?: string;
  onComplete?: () => void;
}) {
  if (!active) return null;
  // The mock item only carries a name; give the island the same catalog model
  // the generation pipeline would pick, or its fallback gift box.
  const incoming = item && { ...item, assetFormat: "procedural" as const, geometrySpec: findCatalogItem(item.name)?.spec ?? FALLBACK_ITEM_SPEC };
  return <div className="screen active" id="s5">
    <IslandExperience compact incomingItem={incoming} studentName={studentName} baseItemCount={baseItemCount} onComplete={onComplete}/>
  </div>;
}
