// 담당: 김현우
// 학생관찰일지 피드 카드 — 목록에서는 미리보기만 보여주고, 누르면 기록 전체를 모달로 연다.
// 학부모상담기록의 "완료한 상담" 카드(CompletedConsultationCard)와 같은 방식이다.
// @아이 태그는 아이 상세로 가는 링크라 버튼 안에 넣을 수 없다 — 카드 전체를 덮는 버튼 위에 태그 줄을 z-10으로 띄운다.
// 무결성 원칙: 수정·삭제 UI 없음. "기록" 시각은 서버가 찍은 created_at만 표시한다.

"use client";

import Link from "next/link";
import { useState } from "react";
import { formatKstDateTime } from "@/components/shared/datetime";
import Modal from "@/components/shared/Modal";
import { card, clickableCard, immutableBadge, timestampText } from "@/components/shared/ui";
import type { ObservationLog, TaggedStudent } from "@/lib/types/teacherRecord";

// 이 화면의 종류는 "관찰"과 "상담" 둘뿐이다 — 갈등 기록(record_type 'conflict')은 관찰로 보여준다 (갈등 입력은 보류라 여기서 새로 만들 수 없고,
// 대시보드·DB에서 들어온 갈등 기록도 관찰 탭에 잡힌다: ObservationBoard.matchesType).
const RECORD_TYPE_TAG: Record<ObservationLog["recordType"], string> = {
  general: "bg-sky-50 text-sky-700",
  conflict: "bg-sky-50 text-sky-700",
  student_consultation: "bg-violet-50 text-violet-700",
};

const RECORD_TYPE_LABEL: Record<ObservationLog["recordType"], string> = {
  general: "관찰",
  conflict: "관찰",
  student_consultation: "상담",
};

/** 발생 시각이 기록 시각과 이만큼 이상 다를 때만 따로 표시 */
const OCCURRED_AT_DISPLAY_THRESHOLD_MS = 60_000;

export default function ObservationFeedCard({ entry, showDate }: { entry: ObservationLog; showDate: boolean }) {
  const [open, setOpen] = useState(false);
  const showOccurredAt =
    Math.abs(new Date(entry.occurredAt).getTime() - new Date(entry.createdAt).getTime()) >=
    OCCURRED_AT_DISPLAY_THRESHOLD_MS;
  const typeLabel = RECORD_TYPE_LABEL[entry.recordType];

  return (
    <>
      <article className={`${card} ${clickableCard} relative h-full px-[18px] py-4`}>
        {/* 카드 전체를 누르는 영역 */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${typeLabel} 기록 전체 보기`}
          className="absolute inset-0 rounded-[inherit]"
        />

        <header className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${RECORD_TYPE_TAG[entry.recordType]}`}>
            {typeLabel}
          </span>
          <time dateTime={entry.createdAt} className={timestampText}>
            {showDate ? formatKstDateTime(entry.createdAt).slice(0, 16) : formatKstDateTime(entry.createdAt).slice(11, 16)}
          </time>
          {showOccurredAt && (
            <time dateTime={entry.occurredAt} className={timestampText}>
              - 발생 {formatKstDateTime(entry.occurredAt).slice(0, 16)}
            </time>
          )}
          <span className={immutableBadge}>🔒 수정 불가</span>
        </header>
        {entry.title && <h3 className="mb-1.5 text-sm font-bold">{entry.title}</h3>}
        <p className="line-clamp-3 text-[13px] leading-[1.7] whitespace-pre-wrap">{entry.body}</p>
        {entry.taggedStudents.length > 0 && (
          <TagLinks tags={entry.taggedStudents} className="relative z-10 mt-2.5" />
        )}
      </article>

      <Modal open={open} title={entry.title ?? `${typeLabel} 기록`} onClose={() => setOpen(false)}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${RECORD_TYPE_TAG[entry.recordType]}`}>
            {typeLabel}
          </span>
          <span className={immutableBadge}>🔒 수정 불가</span>
        </div>
        <p className={`${timestampText} mb-1`}>기록 {formatKstDateTime(entry.createdAt)}</p>
        {showOccurredAt && (
          <p className={`${timestampText} mb-3`}>발생 {formatKstDateTime(entry.occurredAt).slice(0, 16)}</p>
        )}
        <p className="whitespace-pre-wrap text-[13px] leading-[1.8] text-[#102a56]">{entry.body}</p>
        {entry.taggedStudents.length > 0 && (
          <TagLinks tags={entry.taggedStudents} className="mt-4 border-t border-[#e6e2fb] pt-3" />
        )}
      </Modal>
    </>
  );
}

function TagLinks({ tags, className }: { tags: TaggedStudent[]; className: string }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {tags.map((tag) => (
        <Link
          key={tag.studentId}
          href={`/students/${tag.studentId}`}
          className="rounded-full bg-[#ede9ff] px-2 py-0.5 text-[11px] font-semibold text-[#3f37c9] transition-colors hover:bg-[#ded8ff]"
        >
          @{tag.name}
        </Link>
      ))}
    </div>
  );
}
