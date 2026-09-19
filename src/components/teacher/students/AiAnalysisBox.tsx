// 담당: 김현우
// 아이 상세 "AI 분석". 분석 생성·저장은 /api/ai/daily-analysis가 한다 — 여기서는 fetch만.
// 요청: POST { studentId, date }  →  응답: 200 { morning: string | null, full: string | null }
// 한 카드 안에 위에는 "등교 기준"(등교 데이터만으로 추정), 선 아래에는 "등교·하교 기준"을 보여준다.
// 하교 전이면 등교 기준만 있다. 하교 뒤 다시 열면 아래 칸이 생긴다.
// 분석은 마음 기록이 있을 때만 보여준다 — 등교 기록이 없으면 등교 기준(과 예시)을, 등교·하교 중 하나라도
// 없으면 통합 분석을 응답에 와도 보여주지 않는다. 둘 다 없으면 부모가 이 상자 자체를 그리지 않는다.
// 라우트가 501(키 미설정·테스트 대상 아님)이면 서버가 넘겨준 mock 결과(fallback)를 그대로 보여준다 — 따로 "예시" 표시는 하지 않는다.
// 날짜가 바뀌면 부모가 key를 바꿔 새로 마운트한다 (이전 날짜 결과가 남지 않게).
// precomputed(배포 전 목업에 미리 넣어 둔 결과)가 오면 라우트를 부르지 않고 그 결과를 바로 보여준다 — 추론이 일어나지 않는다.

"use client";

import { useEffect, useState } from "react";

type AnalysisSection = { label: string | null; text: string };

type AnalysisState =
  | { status: "loading" }
  | { status: "ready"; sections: AnalysisSection[] }
  | { status: "empty" }
  | { status: "error" };

export default function AiAnalysisBox({
  studentId,
  date,
  fallback,
  hasMorning,
  hasAfternoon,
  precomputed = null,
}: {
  studentId: string;
  date: string;
  fallback: string | null;
  /** 미리 추론해 둔 결과 (목업) — 있으면 fetch하지 않는다 */
  precomputed?: { morning: string | null; full: string | null } | null;
  /** 그 날 등교 기록이 있는지 — 없으면 등교 기준 분석을 내지 않는다 */
  hasMorning: boolean;
  /** 그 날 하교 기록이 있는지 — 없으면 통합 분석을 내지 않는다 */
  hasAfternoon: boolean;
}) {
  const [state, setState] = useState<AnalysisState>(() =>
    precomputed ? readyState(precomputed, hasMorning, hasAfternoon) : { status: "loading" },
  );

  useEffect(() => {
    if (precomputed) return;
    const controller = new AbortController();

    fetch("/api/ai/daily-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, date }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 501) {
          setState(
            fallback && hasMorning
              ? { status: "ready", sections: [{ label: null, text: fallback }] }
              : { status: "empty" },
          );
          return;
        }
        if (!response.ok) throw new Error(`daily-analysis HTTP ${response.status}`);
        const data: { morning?: string | null; full?: string | null } = await response.json();
        setState(readyState({ morning: data.morning ?? null, full: data.full ?? null }, hasMorning, hasAfternoon));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[AiAnalysisBox]", error);
        setState({ status: "error" });
      });

    return () => controller.abort();
  }, [studentId, date, fallback, hasMorning, hasAfternoon, precomputed]);

  return (
    <section
      aria-live="polite"
      className="rounded-2xl border border-[#ded8ff] bg-[#f5f3ff] px-4 py-3.5 text-[13px] leading-[1.7] text-[#102a56]"
    >
      <div className="mb-1.5 flex items-center gap-1.5 font-[family-name:var(--font-cute)] text-[15px] text-[#635bff]">
        <span aria-hidden>✨</span>
        AI 분석
      </div>
      {state.status === "loading" && <p>분석을 불러오는 중…</p>}
      {state.status === "ready" && (
        <div className="divide-y divide-[#ded8ff]">
          {state.sections.map((section) => (
            <div key={section.label ?? "example"} className="py-2 first:pt-0 last:pb-0">
              {section.label && (
                <div className="mb-0.5 text-[11px] font-bold text-[#8b83ff]">{section.label}</div>
              )}
              <p>{section.text}</p>
            </div>
          ))}
        </div>
      )}
      {state.status === "empty" && <p>이 날은 AI 분석이 없어요.</p>}
      {state.status === "error" && <p>AI 분석을 불러오지 못했어요.</p>}
      <p className="mt-2 text-[10px] text-[#7d849b]">AI 요약은 참고용이에요. 판단 전에 위 대화 원문을 확인하세요.</p>
    </section>
  );
}

function readyState(
  result: { morning: string | null; full: string | null },
  hasMorning: boolean,
  hasAfternoon: boolean,
): AnalysisState {
  const sections: AnalysisSection[] = [];
  if (hasMorning && result.morning) sections.push({ label: "등교 기준", text: result.morning });
  if (hasMorning && hasAfternoon && result.full) sections.push({ label: "등교-하교 기준", text: result.full });
  return sections.length ? { status: "ready", sections } : { status: "empty" };
}
