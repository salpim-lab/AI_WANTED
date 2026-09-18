"use client";

import { useCallback, useState } from "react";
import "@/styles/prototype-student-shared.css";
import "@/styles/prototype-student-chat.css";
import ItemPreparation from "@/components/student/ItemPreparation";
import type { Item } from "@/components/student/mockScenarios";

const DEMO_ITEM: Item = { emoji: "⚽", name: "축구공", reason: "오늘 축구에서 골을 넣은 이야기를 담았어." };

export default function WaitPreviewPage() {
  const [round, setRound] = useState(0);
  const enterIsland = useCallback(() => {}, []);
  return <main style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#f5f8ef" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", fontSize: 13, color: "#47694b" }}>
      <span>대기 화면 미리보기 · 2초마다 안내 변경 → 12초 후 섬 진입</span>
      <button className="btn-ghost" onClick={() => { setRound(v => v + 1); }}>처음부터 보기</button>
    </div>
    <ItemPreparation key={round} sessionId={null} item={DEMO_ITEM} onReady={enterIsland} />
  </main>;
}
