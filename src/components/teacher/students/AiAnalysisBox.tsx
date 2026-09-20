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
// stored(DB에 이미 저장된 요약 — 서버가 렌더 때 챗봇·상담 리포트와 같은 조회 함수로 읽어 온다)로 필요한 요약이 다 채워지면 마찬가지로
// 라우트를 부르지 않는다. 저장된 요약이 없거나 하나라도 모자랄 때만 라우트를 부르고, 라우트는 부족한 것만 만들어 DB에 저장한다.

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
  stored = null,
}: {
  studentId: string;
  date: string;
  fallback: string | null;
  /** 미리 추론해 둔 결과 (목업) — 있으면 fetch하지 않는다 */
  precomputed?: { morning: string | null; full: string | null } | null;
  /**
   * DB에 저장돼 있던 요약 — 있으면(필요한 만큼 다 있으면) fetch하지 않는다.
   * expects: 서버가 요약 생성과 같은 판정으로 "이 날 만들 수 있는 요약"을 알려 준다(없으면 화면의 등교·하교 기록 유무로 추측).
   */
  stored?: { morning: string | null; full: string | null; expects?: { morning: boolean; full: boolean } } | null;
  /** 그 날 등교 기록이 있는지 — 없으면 등교 기준 분석을 내지 않는다 */
  hasMorning: boolean;
  /** 그 날 하교 기록이 있는지 — 없으면 통합 분석을 내지 않는다 */
  hasAfternoon: boolean;
}) {
  // 저장된 요약이 "지금 보여줄 것"을 다 채우면 API를 부르지 않는다(등교 기준은 등교 기록이 있을 때, 통합은 등교·하교가 다 있을 때 필요).
  const expectsMorning = stored?.expects ? stored.expects.morning : hasMorning;
  const expectsFull = stored?.expects ? stored.expects.full : hasMorning && hasAfternoon;
  const storedComplete = Boolean(stored) && (!expectsMorning || Boolean(stored?.morning)) && (!expectsFull || Boolean(stored?.full));
  const [state, setState] = useState<AnalysisState>(() =>
    precomputed
      ? readyState(precomputed, hasMorning, hasAfternoon)
      : stored && storedComplete
        ? readyState(stored, hasMorning, hasAfternoon)
        : { status: "loading" },
  );

  useEffect(() => {
    if (precomputed || storedComplete) return;
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
  }, [studentId, date, fallback, hasMorning, hasAfternoon, precomputed, storedComplete]);

  return (
    <section
      aria-live="polite"
      className="rounded-2xl border border-[#ded8ff] bg-[#f5f3ff] px-4 py-3.5 text-[13px] leading-[1.7] text-[#102a56]"
    >
      <div className="mb-1.5 flex items-center gap-1.5 font-[family-name:var(--font-cute)] text-[15px] text-[#635bff]">
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
