// 담당: 김현우
// 상담 리포트 "AI 분석 요약"의 기간 요약 칸. 날짜별 AI 분석을 모아 AI가 한 번 더 요약한 문단을 보여준다.
// 생성은 Server Action(getReportAiSummaryAction)이 한다 — 서버가 리포트를 다시 만들어 입력으로 쓰고, 같은 입력이면 저장된 결과를 재사용한다.
// 페이지를 늦추지 않게 화면이 뜬 뒤에 불러온다. 기간이 바뀌면 부모가 key를 바꿔 새로 마운트한다. 학부모에게 보여줄 수 있는 자료라 키가 없을 때 예시 문장을 대신 넣지 않는다.

"use client";

import { useEffect, useState } from "react";
import { getReportAiSummaryAction, type ReportAiSummaryResult } from "@/app/(teacher)/consultation/actions";

type State = { status: "loading" } | ReportAiSummaryResult;

export default function ReportAiSummary({ studentId, from, to }: { studentId: string; from: string; to: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getReportAiSummaryAction(studentId, from, to)
      .then((result) => {
        if (!cancelled) setState(result);
      })
      .catch((error: unknown) => {
        console.error("[ReportAiSummary]", error);
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, from, to]);

  // 요약할 날짜별 분석이 없으면 칸 자체를 숨긴다 (아래 목록이 "분석이 없어요"를 보여준다)
  if (state.status === "empty") return null;

  return (
    <div
      aria-live="polite"
      className="mb-3 break-inside-avoid rounded-[10px] border-[1.5px] border-green-200 bg-green-50 px-3.5 py-3 text-[13px] leading-[1.7] text-green-800 print:border-gray-300 print:bg-white print:text-gray-900"
    >
      <div className="mb-1 text-[11px] font-extrabold tracking-[0.5px] text-green-600 print:text-gray-600">
        기간 요약
      </div>
      {state.status === "loading" && <p className="text-green-700/80">날짜별 분석을 모아 요약하는 중…</p>}
      {state.status === "ready" && <p>{state.summary}</p>}
      {state.status === "unavailable" && (
        <p className="text-green-700/80">AI 연결 전이라 기간 요약을 만들 수 없어요. 아래 날짜별 분석을 참고하세요.</p>
      )}
      {state.status === "error" && <p className="text-green-700/80">기간 요약을 만들지 못했어요. 잠시 후 새로고침해 주세요.</p>}
    </div>
  );
}
