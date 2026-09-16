"use client";

import IslandExperience from "@/components/student/island/IslandExperience";
import { FALLBACK_ITEM_SPEC } from "@/lib/items/fallbackItem";

/** Offline fixture: behaves like a completed procedural asset without OpenAI or Supabase. */
export default function ItemPipelineLabPage() {
  return (
    <main className="min-h-screen bg-[#edf4ee]">
      <IslandExperience
        studentName="테스트 학생"
        incomingItem={{
          emoji: "🎁",
          name: FALLBACK_ITEM_SPEC.name,
          reason: "API·DB 없이 procedural geometry_spec이 연결된 상황을 시험하는 선물",
          assetFormat: "procedural",
          geometrySpec: FALLBACK_ITEM_SPEC,
        }}
      />
    </main>
  );
}
