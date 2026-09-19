"use client";

import { useEffect, useState } from "react";
import IslandExperience from "@/components/student/island/IslandExperience";
import type { IslandGift } from "@/components/student/island/types";

/** 개발 전용: 공용 데모 섬 15종의 자동 배치(scripts/demo-island-seed/coords.json)를 화면으로 확인한다. DB에 쓰지 않는다. */
export default function DemoIslandPreviewPage() {
  const [state, setState] = useState<{ gifts: IslandGift[]; missing: string[] } | { error: string } | null>(null);
  useEffect(() => {
    fetch("/api/dev/demo-island-preview", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then(setState)
      .catch((error) => setState({ error: String(error) }));
  }, []);

  if (!state) return <main className="grid min-h-screen place-items-center bg-[#edf4ee] text-sm text-[#557564]">불러오는 중…</main>;
  if ("error" in state) return <main className="grid min-h-screen place-items-center bg-[#edf4ee] text-sm text-red-700">미리 보기를 불러오지 못했어요: {state.error}</main>;
  return (
    <main className="min-h-screen bg-[#edf4ee]">
      <p className="mx-auto max-w-[1440px] px-4 py-3 text-sm text-[#344332] lg:px-12">
        공용 데모 섬 미리 보기 — {state.gifts.length}개 배치{state.missing.length > 0 && ` · 자산을 못 찾은 항목: ${state.missing.join(", ")}`}. 이 화면은 저장하지 않아요.
      </p>
      <IslandExperience studentName="민준" placedGifts={state.gifts} />
    </main>
  );
}
