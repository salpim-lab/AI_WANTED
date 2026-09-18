// 담당: 김현우
// 아이 상세 "AI 분석". 분석 생성·저장은 /api/ai/daily-analysis가 한다 — 여기서는 fetch만.
// 요청: POST { studentId, date }  →  응답: 200 { morning: string | null, full: string | null }
// 한 카드 안에 위에는 "등교 기준"(등교 데이터만으로 추정), 선 아래에는 "등교·하교 기준"을 보여준다.
// 하교 전이면 등교 기준만 있다. 하교 뒤 다시 열면 아래 칸이 생긴다.
// 라우트가 501(키 미설정·테스트 대상 아님)이면 서버가 넘겨준 mock 예시(fallback)를 "예시" 표시와 함께 보여준다.
// 날짜가 바뀌면 부모가 key를 바꿔 새로 마운트한다 (이전 날짜 결과가 남지 않게).

"use client";

import { useEffect, useState } from "react";

type AnalysisSection = { label: string | null; text: string };

type AnalysisState =
  | { status: "loading" }
  | { status: "ready"; sections: AnalysisSection[]; isExample: boolean }
  | { status: "empty" }
  | { status: "error" };

export default function AiAnalysisBox({
  studentId,
  date,
  fallback,
}: {
  studentId: string;
  date: string;
  fallback: string | null;
}) {
  const [state, setState] = useState<AnalysisState>({ status: "loading" });

  useEffect(() => {
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
            fallback
              ? { status: "ready", sections: [{ label: null, text: fallback }], isExample: true }
              : { status: "empty" },
          );
          return;
        }
        if (!response.ok) throw new Error(`daily-analysis HTTP ${response.status}`);
        const data: { morning?: string | null; full?: string | null } = await response.json();
        const sections: AnalysisSection[] = [];
        if (data.morning) sections.push({ label: "등교 기준", text: data.morning });
        if (data.full) sections.push({ label: "등교·하교 기준", text: data.full });
        setState(sections.length ? { status: "ready", sections, isExample: false } : { status: "empty" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[AiAnalysisBox]", error);
        setState({ status: "error" });
      });

    return () => controller.abort();
  }, [studentId, date, fallback]);

  return (
    <section
      aria-live="polite"
      className="rounded-[10px] border-[1.5px] border-green-200 bg-green-50 px-3.5 py-3 text-xs leading-[1.6] text-green-700"
    >
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.5px] text-green-600">
        AI 분석
        {state.status === "ready" && state.isExample && (
          <span className="rounded bg-white/70 px-1.5 py-px font-semibold text-amber-700">API 연결 전 · 예시</span>
        )}
      </div>
      {state.status === "loading" && <p>분석을 불러오는 중…</p>}
      {state.status === "ready" && (
        <div className="divide-y divide-green-200">
          {state.sections.map((section) => (
            <div key={section.label ?? "example"} className="py-2 first:pt-0 last:pb-0">
              {section.label && (
                <div className="mb-0.5 text-[10px] font-bold text-green-600">{section.label}</div>
              )}
              <p>{section.text}</p>
            </div>
          ))}
        </div>
      )}
      {state.status === "empty" && <p>이 날은 AI 분석이 없어요.</p>}
      {state.status === "error" && <p>AI 분석을 불러오지 못했어요.</p>}
      <p className="mt-1.5 text-[10px] text-green-600/80">AI 요약은 참고용이에요. 판단 전에 위 대화 원문을 확인하세요.</p>
    </section>
  );
}
