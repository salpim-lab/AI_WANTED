// 담당: 김현우
// 학부모상담기록 "예정된 상담" 카드. 카드 어디든 누르면 상담 내용 작성 모달이 열리고, 저장하면 완료로 넘어간다.
// 이 저장이 이 상담의 work_records 원문이 처음이자 마지막으로 생기는 순간이다(이후 수정 불가).
// 모양은 리스트 행 — 카드 테두리 안에 [이름 + "대상 - 방식" 위, 예정 일시 + ✎(일정 변경) 아래]를 두고 세로 가운데에 맞춘다. 누적 자료 보기는 오른쪽 끝, ↗(누르면 열린다는 표시)는 오른쪽 위 모서리에 둔다.
// 좁은 화면에서는 줄이 바뀐다.
// 누적 자료 보기는 카드에만 둔다 (작성 모달·완료한 상담 모달에는 없다).
// 누적 자료 보기는 새 탭이 아니라 작성 모달과 같은 크기의 팝업(ConsultationReportModal)으로 연다.
// 카드 전체를 덮는 버튼 위에 ✎ 버튼과 누적 자료 버튼을 z-10으로 띄운다 — 버튼 안에 버튼·링크를 넣을 수 없어서.

"use client";

import { useActionState, useState } from "react";
import { completeConsultationAction } from "@/app/(teacher)/consultation/actions";
import { formatKstDateTime, nowKstLocalInputQuarter, todayKst } from "@/components/shared/datetime";
import Modal from "@/components/shared/Modal";
import QuarterHourDateTimeInput from "@/components/shared/QuarterHourDateTimeInput";
import { card, clickableCard, errorText, fieldLabel, helperNote, textArea, timestampText } from "@/components/shared/ui";
import type { FormActionState, ScheduledConsultation } from "@/lib/types/teacherRecord";
import { ArrowUpRightIcon, METHOD_LABEL } from "./consultationCardParts";
import ConsultationReportModal from "./ConsultationReportModal";
import EditScheduledConsultationButton from "./EditScheduledConsultationButton";

const INITIAL_STATE: FormActionState = { status: "idle", message: null, seq: 0 };
const MAX_BODY_LENGTH = 5000;

export default function ScheduledConsultationCard({ consultation }: { consultation: ScheduledConsultation }) {
  const [open, setOpen] = useState(false);
  const [openedAtSeq, setOpenedAtSeq] = useState(0);
  const [body, setBody] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => nowKstLocalInputQuarter());

  const [state, formAction, pending] = useActionState(async (previous: FormActionState, formData: FormData) => {
    const result = await completeConsultationAction(formData);
    if (result.status === "success") {
      setOpen(false);
      setBody("");
    }
    return { ...result, seq: previous.seq + 1 };
  }, INITIAL_STATE);

  const isFreshResult = state.seq > openedAtSeq;
  const { student } = consultation;

  function openModal() {
    setOpenedAtSeq(state.seq);
    setOccurredAt(nowKstLocalInputQuarter());
    setOpen(true);
  }

  function closeModal() {
    if (!pending) setOpen(false);
  }

  return (
    <>
      <article className={`${card} ${clickableCard} group relative flex flex-wrap items-center gap-x-4 gap-y-2.5 py-3.5 pr-10 pl-[18px]`}>
        {/* 카드 전체를 누르는 영역 */}
        <button
          type="button"
          onClick={openModal}
          aria-label={`${student.name} 상담 내용 작성`}
          className="absolute inset-0 rounded-[inherit]"
        />

        {/* 위 줄: 이름 + "대상 - 방식" / 아래 줄: 예정 일시 + ✎(일정 변경, 시계 방향으로 90도 돌려 놓음). ✎은 카드 전체를 덮는 버튼 위로 z-10을 띄워 따로 눌리게 한다 */}
        <div className="shrink-0">
          <div className="flex items-baseline gap-2">
            <strong className="text-sm font-extrabold tracking-[-0.2px] text-[#102a56]">{student.name}</strong>
            <span className="text-xs font-bold text-[#7d849b]">
              {consultation.counterpart} - {METHOD_LABEL[consultation.method]}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-0.5">
            <p className={timestampText}>예정 {formatKstDateTime(consultation.scheduledAt).slice(0, 16)}</p>
            <EditScheduledConsultationButton
              consultation={consultation}
              variant="icon"
              className="relative z-10 -my-1.5 shrink-0 rotate-90"
            />
          </div>
        </div>

        <ConsultationReportModal student={student} className="relative z-10 ml-auto" />
        <span className="absolute top-3 right-3.5">
          <ArrowUpRightIcon />
        </span>
      </article>

      <Modal open={open} title={`${student.name} 상담 내용 작성`} onClose={closeModal} size="wide">
        <form action={formAction}>
          <input type="hidden" name="id" value={consultation.id} />
          <input type="hidden" name="studentId" value={student.studentId} />

          <p className="text-[13px] leading-[1.6] text-[#5d6580]">
            {student.name} - {consultation.counterpart} - {METHOD_LABEL[consultation.method]} 상담
            <br />
            예정 {formatKstDateTime(consultation.scheduledAt).slice(0, 16)}
          </p>

          <label htmlFor={`complete-occurred-at-${consultation.id}`} className={fieldLabel}>
            상담 일시
          </label>
          <QuarterHourDateTimeInput
            id={`complete-occurred-at-${consultation.id}`}
            name="occurredAt"
            value={occurredAt}
            onChange={setOccurredAt}
            required={false}
            max={todayKst()}
          />

          <label htmlFor={`complete-body-${consultation.id}`} className={fieldLabel}>
            실제 상담 내용
          </label>
          <textarea
            id={`complete-body-${consultation.id}`}
            name="body"
            rows={10}
            required
            value={body}
            maxLength={MAX_BODY_LENGTH}
            placeholder="학부모님과 실제로 나눈 이야기를 적어주세요…"
            onChange={(e) => setBody(e.target.value)}
            className={textArea}
          />
          <div className="mt-1 text-right text-[11px] text-[#aab0c4]">
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
