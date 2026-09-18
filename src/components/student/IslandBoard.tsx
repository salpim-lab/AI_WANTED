// 담당: 강윤지 — 기존 등/하교 페이지의 props를 유지하는 3D 섬 진입점.
"use client";

import IslandExperience from "./island/IslandExperience";
import SalpimHeader from "./home/SalpimHeader";
import StudentProfile from "./home/StudentProfile";
import type { Item } from "./mockScenarios";
import { FALLBACK_ITEM_SPEC } from "@/lib/items/fallbackItem";
import { findCatalogItem } from "@/lib/items/itemCatalog";

export default function IslandBoard({
  active = true,
  item,
  baseItemCount = 0,
  studentName = "민준",
  studentFullName = "김민준",
  onComplete,
  preparing = false,
}: {
  active?: boolean;
  item: Item | null;
  baseItemCount?: number;
  studentName?: string;
  studentFullName?: string;
  onComplete?: () => void;
  preparing?: boolean;
}) {
  if (!active) return null;
  // The mock item only carries a name; give the island the same catalog model
  // the generation pipeline would pick, or its fallback gift box.
  const incoming = item && { ...item, assetFormat: "procedural" as const, geometrySpec: item.geometrySpec ?? findCatalogItem(item.name)?.spec ?? FALLBACK_ITEM_SPEC };
  // 대화 화면과 같은 머리(로고·프로필)를 섬 하늘 위에 얹는다. 아이템 이름은 섬 아래 버튼 위에 뜬다.
  return <div className="screen active island-screen" id="s5">
    <SalpimHeader />
    <StudentProfile name={studentFullName} />
    <IslandExperience compact incomingItem={incoming} studentName={studentName} baseItemCount={baseItemCount} preparing={preparing} onComplete={onComplete}/>
  </div>;
}
