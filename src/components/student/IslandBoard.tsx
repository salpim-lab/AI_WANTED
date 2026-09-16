// 담당: 강윤지 — 기존 등/하교 페이지의 props를 유지하는 3D 섬 진입점.
"use client";

import IslandExperience from "./island/IslandExperience";
import type { Item } from "./mockScenarios";

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
  return <div className="screen active" id="s5">
    <IslandExperience compact incomingItem={item} studentName={studentName} baseItemCount={baseItemCount} onComplete={onComplete}/>
  </div>;
}
