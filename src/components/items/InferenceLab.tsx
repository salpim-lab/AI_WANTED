"use client";

import { useState } from "react";
import type { ItemInference } from "@/lib/items/itemInference";
import type { LabItemSpec } from "@/lib/items/assembledItem";

const SAMPLE = `AI: 오늘 하루는 어땠어?
학생: 쉬는 시간에 화단에서 달팽이를 찾아서 친구들이랑 한참 봤어요.
AI: 달팽이를 봤구나! 어떤 점이 기억에 남아?
학생: 더듬이를 건드리면 쏙 들어갔다가 다시 나오는 게 신기했어요.
AI: 자세히 관찰했네. 이야기해줘서 고마워.`;

// "AI:" 줄은 assistant, 그 외("학생:" 또는 접두사 없음)는 student 발화로 본다.
const toTranscript = (text: string) => text.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
  const ai = /^AI\s*:/i.test(line);
  return { speaker: ai ? "assistant" : "student", content: line.replace(/^(AI|학생)\s*:\s*/i, ""), input_method: "text" };
});

type Result = { inference: ItemInference; source: string; spec: LabItemSpec | null; detail?: unknown };

/** 개발 전용: 상담을 입력해 실제 OpenAI 추론·조립 결과를 3D 뷰어로 보낸다. */
export default function InferenceLab({ onSpec }: { onSpec: (spec: LabItemSpec) => void }) {
  const [text, setText] = useState(SAMPLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/dev/item-inference", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: toTranscript(text) }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data ? `${data.code}: ${data.message}${data.detail ? `\n${JSON.stringify(data.detail)}` : ""}` : `HTTP ${response.status}`);
      setResult(data);
      if (data.spec) onSpec(data.spec);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const r = result?.inference;
  return <div className="mt-4 rounded-2xl border border-[#dce3d6] bg-white p-4">
    <label htmlFor="inference-transcript" className="text-sm font-semibold">상담으로 아이템 만들기 (실제 OpenAI 호출 · 저장 안 함)</label>
    <p className="mt-1 text-xs text-[#71816a]">한 줄에 한 발화. “AI:”로 시작하면 AI 발화, 나머지는 학생 발화예요.</p>
    <textarea id="inference-transcript" value={text} onChange={e => setText(e.target.value)} className="mt-2 h-40 w-full rounded-xl border border-[#dce3d6] p-3 text-sm" />
    <button onClick={run} disabled={busy || !text.trim()} className="mt-2 rounded-xl bg-[#47694b] px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "추론 중… (조립까지 최대 1분)" : "아이템 추론하기"}</button>
    {error && <p role="alert" className="mt-3 whitespace-pre-wrap text-sm text-red-700">{error}</p>}
    {r && <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="text-[#71816a]">아이템</dt><dd className="font-semibold">{r.itemName} · {r.sizeClass}</dd>
      <dt className="text-[#71816a]">3D 출처</dt><dd>{result.source}</dd>
      <dt className="text-[#71816a]">핵심 경험</dt><dd>{r.coreExperience}</dd>
      <dt className="text-[#71816a]">근거</dt><dd>{r.evidence.map(q => `“${q}”`).join(" ")}</dd>
      <dt className="text-[#71816a]">대상</dt><dd>{r.subject}</dd>
      <dt className="text-[#71816a]">선택 이유</dt><dd>{r.selectionReason}</dd>
      <dt className="text-[#71816a]">학생 설명</dt><dd>{r.studentMessage}</dd>
      <dt className="text-[#71816a]">외형</dt><dd>{r.appearance.join(" / ")}</dd>
    </dl>}
  </div>;
}
