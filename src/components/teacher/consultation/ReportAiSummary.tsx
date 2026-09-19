// 담당: 김현우
// 상담 리포트 맨 위 "기간 요약" 칸. 기간 안의 학생 관찰일지와 날짜별 AI 분석을 모아 AI가 한 번 더 요약한 문단을 보여준다.
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

  // 요약할 관찰일지·날짜별 분석이 없으면 칸 자체를 숨긴다 (아래 섹션들이 "없어요"를 보여준다)
  if (state.status === "empty") return null;

  return (
    <div
      aria-live="polite"
      className="mb-6 break-inside-avoid rounded-2xl border border-[#ded8ff] bg-[#f5f3ff] px-4 py-3.5 text-[13px] leading-[1.7] text-[#102a56] print:border-[#cfcafa] print:bg-white print:text-[#102a56]"
    >
      <div className="mb-1.5 flex items-center gap-1.5 font-[family-name:var(--font-cute)] text-[15px] text-[#635bff] print:text-[#5d6580]">
        기간 요약
      </div>
      {state.status === "loading" && <p className="text-[#7d849b]">관찰일지와 날짜별 분석을 모아 요약하는 중…</p>}
      {state.status === "ready" && <p>{state.summary}</p>}
      {state.status === "unavailable" && (
        <p className="text-[#7d849b]">AI 연결 전이라 기간 요약을 만들 수 없어요. 아래 2번 관찰일지와 3번 날짜별 분석을 참고하세요.</p>
      )}
      {state.status === "error" && <p className="text-[#7d849b]">기간 요약을 만들지 못했어요. 잠시 후 새로고침해 주세요.</p>}
    </div>
  );
}
