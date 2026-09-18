// 담당: 김현우
// 예정된 상담 카드의 "누적 자료 보기" — 새 탭 대신 상담 내용 작성과 같은 크기(wide) 팝업으로 상담 자료 리포트를 연다.
// 리포트는 열 때 Server Action(getConsultationReportAction)으로 받아 오고, 서버가 view_log를 남긴다.
// 기간을 바꾸면 다시 받아 온다. 인쇄도 팝업 안에서 한다 — 인쇄할 때만 리포트 본문(.report-print-root)과 그 조상만 남기고
// 나머지(교사 화면·팝업 머리줄·기간 칸)는 숨기며, 팝업의 fixed·높이 제한·스크롤을 풀어 A4에 전체가 찍히게 한다.

"use client";

import { useState, useTransition } from "react";
import { getConsultationReportAction } from "@/app/(teacher)/consultation/actions";
import Modal from "@/components/shared/Modal";
import { errorText, textInput } from "@/components/shared/ui";
import type { ConsultationReport, TaggedStudent } from "@/lib/types/teacherRecord";
import ConsultationReportBody from "./ConsultationReportBody";

const PRINT_STYLES = `
@media print {
  @page { size: A4; margin: 14mm; }
  body *:not(:has(.report-print-root)):not(.report-print-root):not(.report-print-root *) { display: none !important; }
  html, body, *:has(.report-print-root) {
    position: static !important; display: block !important; overflow: visible !important;
    width: auto !important; max-width: none !important; height: auto !important;
    min-height: 0 !important; max-height: none !important; margin: 0 !important; padding: 0 !important;
    background: #fff !important; box-shadow: none !important; backdrop-filter: none !important;
    transform: none !important; opacity: 1 !important; border-radius: 0 !important;
  }
  .report-print-root { opacity: 1 !important; }
  /* 감정 어휘 막대는 배경색으로 그려서, 배경 그래픽을 빼는 브라우저 기본값이면 사라진다 */
  .consultation-report, .consultation-report * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

type LoadState =
  | { status: "idle" }
  | { status: "ready"; report: ConsultationReport }
  | { status: "error" };

export default function ConsultationReportModal({
  student,
  className = "",
}: {
  student: TaggedStudent;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pending, startTransition] = useTransition();

  function load(nextFrom?: string, nextTo?: string) {
    startTransition(async () => {
      try {
        const report = await getConsultationReportAction(student.studentId, nextFrom, nextTo);
        if (!report) {
          setState({ status: "error" });
          return;
        }
        setState({ status: "ready", report });
        setFrom(report.from);
        setTo(report.to);
      } catch (error) {
        console.error("[ConsultationReportModal]", error);
        setState({ status: "error" });
      }
    });
  }

  function openModal() {
    setOpen(true);
    setState({ status: "idle" });
    load();
  }

  const report = state.status === "ready" ? state.report : null;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-[#ded8ff] bg-[#f5f3ff] px-3 py-1 text-[11px] font-semibold text-[#635bff] transition-colors hover:bg-[#ede9ff] ${className}`}
      >
        {student.name} 누적 자료 보기
      </button>

      <Modal open={open} title={`${student.name} 누적 자료`} onClose={() => setOpen(false)} size="wide">
        <style>{PRINT_STYLES}</style>
        <form
          aria-label="기간"
          className="mb-4 flex flex-wrap items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            load(from, to);
          }}
        >
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="시작 날짜"
            className={textInput}
          />
          <span className="text-xs text-[#aab0c4]">~</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="끝 날짜" className={textInput} />
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            적용
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!report || pending}
            className="btn btn-ghost btn-sm ml-auto"
          >
            🖨 인쇄 / PDF로 저장
          </button>
        </form>

        {state.status === "error" ? (
          <p role="alert" className={errorText}>
            누적 자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
          </p>
        ) : !report ? (
          <p className="py-10 text-center text-[13px] text-[#7d849b]">누적 자료를 모으는 중…</p>
        ) : (
          <div aria-busy={pending} className={`report-print-root ${pending ? "opacity-60 transition-opacity" : ""}`}>
            <ConsultationReportBody report={report} />
          </div>
        )}
      </Modal>
    </>
  );
}
