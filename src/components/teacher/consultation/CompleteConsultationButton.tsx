// 담당: 김현우
// "예정된 상담" 항목의 "상담 완료 처리" 버튼과 모달 — 실제 상담 내용을 적어 완료로 넘긴다.
// 이 저장이 이 상담의 work_records 원문이 처음이자 마지막으로 생기는 순간이다(이후 수정 불가).
// 준비 단계에서 봤던 누적 자료를 다시 열어볼 수 있는 링크도 같이 둔다.

"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { completeConsultationAction } from "@/app/(teacher)/consultation/actions";
import { formatKstDateTime, nowKstLocalInput } from "@/components/shared/datetime";
import Modal from "@/components/shared/Modal";
import { errorText, fieldLabel, helperNote, textArea, textInput } from "@/components/shared/ui";
import type { ConsultationMethod, FormActionState, ScheduledConsultation } from "@/lib/types/teacherRecord";

const INITIAL_STATE: FormActionState = { status: "idle", message: null, seq: 0 };
const MAX_BODY_LENGTH = 5000;
const METHOD_LABEL: Record<ConsultationMethod, string> = { phone: "전화", visit: "방문", online: "온라인" };

export default function CompleteConsultationButton({ consultation }: { consultation: ScheduledConsultation }) {
  const [open, setOpen] = useState(false);
  const [openedAtSeq, setOpenedAtSeq] = useState(0);
  const [body, setBody] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => nowKstLocalInput());

  const [state, formAction, pending] = useActionState(async (previous: FormActionState, formData: FormData) => {
    const result = await completeConsultationAction(formData);
    if (result.status === "success") {
      setOpen(false);
      setBody("");
    }
    return { ...result, seq: previous.seq + 1 };
  }, INITIAL_STATE);

  const isFreshResult = state.seq > openedAtSeq;

  function openModal() {
    setOpenedAtSeq(state.seq);
    setOccurredAt(nowKstLocalInput());
    setOpen(true);
  }

  function closeModal() {
    if (!pending) setOpen(false);
  }

  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={openModal}>
        상담 완료 처리
      </button>

      <Modal open={open} title={`${consultation.student.name} 상담 완료 처리`} onClose={closeModal}>
        <form action={formAction}>
          <input type="hidden" name="id" value={consultation.id} />
          <input type="hidden" name="studentId" value={consultation.student.studentId} />

          <p className="text-[13px] leading-[1.6] text-gray-600">
            {consultation.student.name} · {consultation.counterpart} · {METHOD_LABEL[consultation.method]} 상담
            <br />
            예정 {formatKstDateTime(consultation.scheduledAt).slice(0, 16)}
          </p>

          <Link
            href={`/consultation/report/${consultation.student.studentId}`}
            target="_blank"
            rel="noopener"
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700 transition-colors hover:bg-green-100"
          >
            📄 {consultation.student.name} 누적 자료 보기
          </Link>

          <label htmlFor="complete-occurred-at" className={fieldLabel}>
            상담 일시 (기본값: 지금 — 필요하면 수정)
          </label>
          <input
            id="complete-occurred-at"
            type="datetime-local"
            name="occurredAt"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className={textInput}
          />

          <label htmlFor="complete-body" className={fieldLabel}>
            실제 상담 내용
          </label>
          <textarea
            id="complete-body"
            name="body"
            rows={6}
            required
            value={body}
            maxLength={MAX_BODY_LENGTH}
            placeholder="학부모님과 실제로 나눈 이야기를 적어주세요…"
            onChange={(e) => setBody(e.target.value)}
            className={textArea}
          />
          <div className="mt-1 text-right text-[11px] text-gray-400">
            {body.length} / {MAX_BODY_LENGTH}
          </div>

          <p className={helperNote}>🔒 저장 후 수정할 수 없습니다.</p>
          {isFreshResult && state.status === "error" && (
            <p role="alert" className={errorText}>
              {state.message}
            </p>
          )}

          <div className="mt-[18px] flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={closeModal} disabled={pending}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending || !body.trim()}>
              {pending ? "저장 중…" : "완료 저장"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
