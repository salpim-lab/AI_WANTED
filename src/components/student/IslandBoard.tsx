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

// 등교 섬에서 시작한 배치 저장. 등교 → 하교로 화면이 바뀌어도(컴포넌트가 새로 마운트돼도) 이어서 기다릴 수 있게 모듈에 둔다.
const pendingSaves = new Set<Promise<unknown>>();
const SAVE_RETRY_DELAYS_MS = [400, 1200, 2500];
const SAVE_WAIT_BEFORE_LEAVE_MS = 6000;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const settled = () => Promise.allSettled([...pendingSaves]);

/** 일시 오류(네트워크·5xx)는 다시 시도한다. 서버가 거절한 것(4xx: 겹침·소유자 등)은 다시 해도 같으니 바로 멈춘다. */
async function postPlacement(body: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch("/api/island", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (response.ok) return;
      if (response.status < 500) { console.warn("[island] 배치를 저장하지 못했어요", response.status, await response.json().catch(() => null)); return; }
    } catch (error) {
      if (attempt >= SAVE_RETRY_DELAYS_MS.length) { console.warn("[island] 배치 저장 요청 실패", error); return; }
    }
    if (attempt >= SAVE_RETRY_DELAYS_MS.length) { console.warn("[island] 배치를 저장하지 못했어요(재시도 소진)"); return; }
    await delay(SAVE_RETRY_DELAYS_MS[attempt]);
  }
}

async function fetchIsland(signal: AbortSignal): Promise<RemoteIsland | null> {
  // 방금 놓은 아이템의 저장이 끝나기 전에 조회하면 그 아이템이 빠진 섬을 받는다.
  await Promise.race([settled(), delay(SAVE_WAIT_BEFORE_LEAVE_MS)]);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal.aborted) return null;
    try {
      const response = await fetch("/api/island", { cache: "no-store", signal });
      if (response.ok) {
        const data = await response.json();
        return { persisted: data.persisted === true, gifts: Array.isArray(data.gifts) ? data.gifts : [] };
      }
    } catch { if (signal.aborted) return null; }
    await delay(500 * (attempt + 1));
  }
  return null;
}

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
    // 섬 조회 실패는 화면을 막지 않는다 — 몇 번 다시 시도하고, 그래도 안 되면 빈 섬으로 계속한다(remote가 null이면 아무 배치도 그리지 않는다)
    void fetchIsland(controller.signal).then((data) => { if (data && !controller.signal.aborted) setRemote(data); });
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
    const save = postPlacement(JSON.stringify({ student_item_id: incomingItemId, x: gift.x, z: gift.z }));
    pendingSaves.add(save);
    void save.finally(() => pendingSaves.delete(save));
  }, [remote?.persisted, incomingItemId]);

  // 저장이 아직 끝나지 않았으면 잠깐 기다린 뒤 다음 화면(하교)으로 넘긴다 — 넘어가며 요청이 끊기거나 조회가 먼저 나가는 것을 막는다.
  const completeAfterSave = useCallback(() => {
    if (!onComplete) return;
    if (!pendingSaves.size) { onComplete(); return; }
    void Promise.race([settled(), delay(SAVE_WAIT_BEFORE_LEAVE_MS)]).then(() => onComplete());
  }, [onComplete]);

  if (!active) return null;
  // The mock item only carries a name; give the island the same catalog model
  // the generation pipeline would pick, or its fallback gift box.
  const incoming = item && { ...item, assetFormat: "procedural" as const, geometrySpec: item.geometrySpec ?? findCatalogItem(item.name)?.spec ?? FALLBACK_ITEM_SPEC };
  // 대화 화면과 같은 머리(로고·프로필)를 섬 하늘 위에 얹는다. 아이템 이름은 섬 아래 버튼 위에 뜬다.
  return <div className={`screen active island-screen${preparing ? " island-screen--preparing" : ""}`} id="s5">
    <SalpimHeader />
    <StudentProfile name={studentFullName} />
    <IslandExperience flow={flow} compact incomingItem={incoming} studentName={studentName} placedGifts={placedGifts} baseItemCount={baseItemCount} preparing={preparing} onPlaced={savePlacement} onComplete={completeAfterSave}/>
  </div>;
}
