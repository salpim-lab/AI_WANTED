// 담당: 김현우
// "완료한 상담" 카드 — 목록에서는 미리보기만 보여주고, 누르면 상담 내용 전체를 모달로 연다.
// 누적 자료 링크는 상담 준비(예정 단계) 때 주로 쓰므로 여기서는 모달 안쪽으로 옮겨 부차적으로만 둔다.

"use client";

import Link from "next/link";
import { useState } from "react";
import { formatKstDateTime } from "@/components/shared/datetime";
import Modal from "@/components/shared/Modal";
import { card, immutableBadge, timestampText } from "@/components/shared/ui";
import type { ConsultationLog } from "@/lib/types/teacherRecord";

const OCCURRED_AT_DISPLAY_THRESHOLD_MS = 60_000;

export default function CompletedConsultationCard({ entry }: { entry: ConsultationLog }) {
  const [open, setOpen] = useState(false);
  const showOccurredAt =
    Math.abs(new Date(entry.occurredAt).getTime() - new Date(entry.createdAt).getTime()) >=
    OCCURRED_AT_DISPLAY_THRESHOLD_MS;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${card} block w-full px-[18px] py-4 text-left transition hover:shadow-[0_6px_16px_rgba(0,0,0,.1)]`}
      >
        <header className="mb-2 flex flex-wrap items-center gap-2">
          <span className={timestampText}>{formatKstDateTime(entry.createdAt).slice(0, 16)}</span>
          <span className="rounded-full bg-green-50 px-[9px] py-0.5 text-xs font-bold text-green-700">
            {entry.student.name}
          </span>
          {entry.title && (
            <span className="rounded-full bg-amber-100 px-[9px] py-0.5 text-xs font-bold text-amber-800">
              {entry.title}
            </span>
          )}
          <span className={immutableBadge}>🔒 수정 불가</span>
        </header>
        <p className="line-clamp-3 text-[13px] leading-[1.7] whitespace-pre-wrap text-gray-700">{entry.body}</p>
        <p className="mt-1.5 text-[11px] font-semibold text-indigo-600">상담 내용 전체 보기 →</p>
      </button>

      <Modal open={open} title={`${entry.student.name} 상담 내용`} onClose={() => setOpen(false)}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-green-50 px-[9px] py-0.5 text-xs font-bold text-green-700">
            {entry.student.name}
          </span>
          {entry.title && (
            <span className="rounded-full bg-amber-100 px-[9px] py-0.5 text-xs font-bold text-amber-800">
              {entry.title}
            </span>
          )}
          <span className={immutableBadge}>🔒 수정 불가</span>
        </div>
        <p className={`${timestampText} mb-1`}>기록 {formatKstDateTime(entry.createdAt)}</p>
        {showOccurredAt && (
          <p className={`${timestampText} mb-3`}>상담 일시 {formatKstDateTime(entry.occurredAt).slice(0, 16)}</p>
        )}
        <p className="whitespace-pre-wrap text-[13px] leading-[1.8] text-gray-800">{entry.body}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">
          <Link
            href={`/consultation/report/${entry.student.studentId}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700 transition-colors hover:bg-green-100"
          >
            📄 {entry.student.name} 누적 자료 보기
          </Link>
          {entry.evidenceRefs.length > 0 && (
            <span className="text-[11px] text-gray-500">저장 당시 근거 기록 {entry.evidenceRefs.length}건 연결</span>
          )}
        </div>
      </Modal>
    </>
  );
}
