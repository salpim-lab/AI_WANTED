// 담당: 강윤지 — 기존 등/하교 페이지의 props를 유지하는 3D 섬 진입점.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import IslandExperience from "./island/IslandExperience";
import SalpimHeader from "./home/SalpimHeader";
import StudentProfile from "./home/StudentProfile";
import type { IslandGift } from "./island/types";
import type { Item } from "./mockScenarios";
import { FALLBACK_ITEM_SPEC } from "@/lib/items/fallbackItem";
import { findCatalogItem } from "@/lib/items/itemCatalog";
import { MINJUN_DEMO_GIFTS } from "@/lib/items/minjunDemoIsland";

type RemoteIsland = { persisted: boolean; gifts: IslandGift[] };

export default function IslandBoard({
  active = true,
  flow = "checkin",
  item,
  baseItemCount = 0,
  studentName = "민준",
  studentFullName = "김민준",
  onComplete,
  preparing = false,
}: {
  active?: boolean;
  flow?: "checkin" | "checkout";
  item: Item | null;
  baseItemCount?: number;
  studentName?: string;
  studentFullName?: string;
  onComplete?: () => void;
  preparing?: boolean;
}) {
  // 서버(/api/island)가 주는 섬: 공용 데모 배치(locked) + 이 방문자의 개인 배치(체크인 여러 번 누적). DEMO_MODE가 아니면 persisted=false.
  const [remote, setRemote] = useState<RemoteIsland | null>(null);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    fetch("/api/island", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (data) setRemote({ persisted: data.persisted === true, gifts: Array.isArray(data.gifts) ? data.gifts : [] }); })
      .catch(() => { /* 섬 조회 실패는 화면을 막지 않는다 — 빈 섬으로 계속한다(remote가 null이면 아무 배치도 그리지 않는다) */ });
    return () => controller.abort();
  }, [active]);

  const incomingItemId = item?.studentItemId;
  const placedGifts = useMemo(() => {
    // 아직 모름(조회 중이거나 실패): 아무것도 그리지 않는다 — DEMO_MODE에서 main의 코드 기반 배치가 잠깐이라도 비치면 안 된다.
    if (!remote) return undefined;
    // DEMO_MODE: DB의 공용 15종 + 현재 방문자 개인 아이템만 그린다. main의 코드 기반 민준 18개(MINJUN_DEMO_GIFTS)와는 합치지 않는다
    // (결정 2026-09-20). 지금 놓으려는(또는 다시 놓는) 아이템은 씬이 따로 그리므로 이미 저장된 배치에서는 뺀다.
    if (remote.persisted) return remote.gifts.filter((gift) => gift.id !== incomingItemId);
    // DEMO_MODE=false(서버가 persisted:false로 확인해 준 경우)에서만 main의 민준 데모 섬을 유지한다.
    return studentName === "민준" || studentName === "김민준" ? MINJUN_DEMO_GIFTS : undefined;
  }, [remote, incomingItemId, studentName]);

  // 내려놓은 자리를 서버에 저장한다. 서버가 소유자·좌표(공용+내 배치와 겹침)를 다시 검증한다. 실패해도 화면은 계속된다.
  const savePlacement = useCallback((gift: IslandGift) => {
    if (remote?.persisted === false || !incomingItemId) return;
    fetch("/api/island", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student_item_id: incomingItemId, x: gift.x, z: gift.z }) })
      .then(async (response) => { if (!response.ok) console.warn("[island] 배치를 저장하지 못했어요", response.status, await response.json().catch(() => null)); })
      .catch((error) => console.warn("[island] 배치 저장 요청 실패", error));
  }, [remote?.persisted, incomingItemId]);

  if (!active) return null;
  // The mock item only carries a name; give the island the same catalog model
  // the generation pipeline would pick, or its fallback gift box.
  const incoming = item && { ...item, assetFormat: "procedural" as const, geometrySpec: item.geometrySpec ?? findCatalogItem(item.name)?.spec ?? FALLBACK_ITEM_SPEC };
  // 대화 화면과 같은 머리(로고·프로필)를 섬 하늘 위에 얹는다. 아이템 이름은 섬 아래 버튼 위에 뜬다.
  return <div className={`screen active island-screen${preparing ? " island-screen--preparing" : ""}`} id="s5">
    <SalpimHeader />
    <StudentProfile name={studentFullName} />
    <IslandExperience flow={flow} compact incomingItem={incoming} studentName={studentName} placedGifts={placedGifts} baseItemCount={baseItemCount} preparing={preparing} onPlaced={savePlacement} onComplete={onComplete}/>
  </div>;
}
