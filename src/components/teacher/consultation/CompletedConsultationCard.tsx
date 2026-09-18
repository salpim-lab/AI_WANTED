// 담당: 김현우
// "완료한 상담" 카드 — 목록에서는 미리보기만 보여주고, 누르면 상담 내용 전체를 모달로 연다.
// 누적 자료 링크는 두지 않는다 — 예정된 상담 카드(ScheduledConsultationCard)에서만 연다.

"use client";

import { useState } from "react";
import { formatKstDateTime } from "@/components/shared/datetime";
import Modal from "@/components/shared/Modal";
import { card, clickableCard, immutableBadge, timestampText } from "@/components/shared/ui";
import type { ConsultationLog } from "@/lib/types/teacherRecord";
import { ArrowUpRightIcon, consultationKindLabel, parseConsultationTitle } from "./consultationCardParts";

const OCCURRED_AT_DISPLAY_THRESHOLD_MS = 60_000;

export default function CompletedConsultationCard({ entry }: { entry: ConsultationLog }) {
  const [open, setOpen] = useState(false);
  const showOccurredAt =
    Math.abs(new Date(entry.occurredAt).getTime() - new Date(entry.createdAt).getTime()) >=
    OCCURRED_AT_DISPLAY_THRESHOLD_MS;
  const heading = parseConsultationTitle(entry.title);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${card} ${clickableCard} group block w-full px-[18px] py-4 text-left`}
      >
        {/* 머리 모양은 예정된 상담 카드와 같다 — 이름 + "학생/학부모 상담", 그 아래 "대상 - 방식" */}
        <div className="flex items-start gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <strong className="text-sm font-extrabold tracking-[-0.2px] text-[#102a56]">{entry.student.name}</strong>
              <span className="text-xs font-bold text-[#7d849b]">{consultationKindLabel(heading.counterpart)}</span>
            </div>
            {entry.title && <p className="mt-0.5 text-[11.5px] text-[#7d849b]">{heading.line}</p>}
          </div>
          <span className={`${immutableBadge} shrink-0`}>🔒 수정 불가</span>
          <ArrowUpRightIcon />
        </div>

        <p className={`${timestampText} mt-2`}>상담 {formatKstDateTime(entry.occurredAt).slice(0, 16)}</p>
        <p className="mt-1.5 line-clamp-3 text-[13px] leading-[1.7] whitespace-pre-wrap text-[#33405f]">{entry.body}</p>
      </button>

      <Modal open={open} title={`${entry.student.name} 상담 내용`} onClose={() => setOpen(false)}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#ede9ff] px-[9px] py-0.5 text-xs font-bold text-[#3f37c9]">
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
        <p className="whitespace-pre-wrap text-[13px] leading-[1.8] text-[#102a56]">{entry.body}</p>

        {entry.evidenceRefs.length > 0 && (
          <p className="mt-4 border-t border-[#e6e2fb] pt-3 text-[11px] text-[#7d849b]">
            저장 당시 근거 기록 {entry.evidenceRefs.length}건 연결
          </p>
        )}
      </Modal>
    </>
  );
}
