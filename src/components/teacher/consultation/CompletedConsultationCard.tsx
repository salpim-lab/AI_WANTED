// 담당: 김현우
// "완료한 상담" 카드 — 학생관찰일지 피드 카드(ObservationFeedCard)와 같은 모양이다:
// 종류 태그 · 시각 · 🔒 수정 불가 → 제목 → 본문 미리보기 → @아이 태그. 목록에서는 미리보기만 보여주고, 누르면 상담 내용 전체를 모달로 연다.
// @아이 태그는 아이 상세로 가는 링크라 버튼 안에 넣을 수 없다 — 카드 전체를 덮는 버튼 위에 태그를 z-10으로 띄운다.
// 누적 자료 링크는 두지 않는다 — 예정된 상담 카드(ScheduledConsultationCard)에서만 연다.

"use client";

import Link from "next/link";
import { useState } from "react";
import { formatKstDateTime } from "@/components/shared/datetime";
import Modal from "@/components/shared/Modal";
import RecordDetail from "@/components/shared/RecordDetail";
import { card, clickableCard, immutableBadge, studentTagLink, timestampText } from "@/components/shared/ui";
import type { ConsultationLog } from "@/lib/types/teacherRecord";
import { consultationKindLabel, isStudentSelfConsultation, parseConsultationTitle } from "./consultationCardParts";

/** 상담 일시가 기록 시각과 이만큼 이상 다를 때만 따로 표시 */
const OCCURRED_AT_DISPLAY_THRESHOLD_MS = 60_000;

const KIND_TAG = {
  parent: "bg-amber-50 text-amber-700",
  student: "bg-violet-50 text-violet-700",
} as const;

export default function CompletedConsultationCard({ entry, showDate }: { entry: ConsultationLog; showDate: boolean }) {
  const [open, setOpen] = useState(false);
  const showOccurredAt =
    Math.abs(new Date(entry.occurredAt).getTime() - new Date(entry.createdAt).getTime()) >=
    OCCURRED_AT_DISPLAY_THRESHOLD_MS;
  const counterpart = parseConsultationTitle(entry.title).counterpart;
  const kindLabel = consultationKindLabel(counterpart);
  const kindTag = isStudentSelfConsultation(counterpart) ? KIND_TAG.student : KIND_TAG.parent;

  return (
    <>
      <article className={`${card} ${clickableCard} relative h-full px-[18px] py-4`}>
        {/* 카드 전체를 누르는 영역 */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${entry.student.name} ${kindLabel} 내용 전체 보기`}
          className="absolute inset-0 rounded-[inherit]"
        />

        <header className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${kindTag}`}>{kindLabel}</span>
          <time dateTime={entry.createdAt} className={timestampText}>
            {showDate ? formatKstDateTime(entry.createdAt).slice(0, 16) : formatKstDateTime(entry.createdAt).slice(11, 16)}
          </time>
          {showOccurredAt && (
            <time dateTime={entry.occurredAt} className={timestampText}>
              - 상담 {formatKstDateTime(entry.occurredAt).slice(0, 16)}
            </time>
          )}
          <span className={immutableBadge}>🔒 수정 불가</span>
        </header>
        {entry.title && <h3 className="mb-1.5 text-sm font-bold">{entry.title}</h3>}
        <p className="line-clamp-3 text-[13px] leading-[1.7] whitespace-pre-wrap">{entry.body}</p>
        <StudentTag entry={entry} className="relative z-10 mt-2.5" />
      </article>

      <Modal open={open} title={`${entry.student.name} 상담 내용`} onClose={() => setOpen(false)}>
        <RecordDetail
          kind={kindLabel}
          kindClassName={kindTag}
          fields={[
            ...(entry.title ? [{ label: "상담 대상 · 방식", value: parseConsultationTitle(entry.title).line, wide: true }] : []),
            { label: "기록 시각", value: formatKstDateTime(entry.createdAt) },
            ...(showOccurredAt ? [{ label: "상담 일시", value: formatKstDateTime(entry.occurredAt).slice(0, 16) }] : []),
          ]}
          bodyLabel="상담 내용"
          body={entry.body}
          footer={<StudentTag entry={entry} className="" />}
        />
      </Modal>
    </>
  );
}

function StudentTag({ entry, className }: { entry: ConsultationLog; className: string }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      <Link href={`/students/${entry.student.studentId}`} className={studentTagLink}>
        @{entry.student.name}
      </Link>
    </div>
  );
}
