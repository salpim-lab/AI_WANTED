// 담당: 김현우
// "예정된 상담"의 일정 변경 버튼과 모달 — 예정 일시·상담 대상·방식을 바꾼다.
// 아직 상담 전(내용 없음)인 예약 메타데이터만 바꾸므로 봉인 원칙과 충돌하지 않는다. 학생은 바꾸지 않는다.
// 저장은 Server Action(rescheduleConsultationAction). 학부모상담기록 화면과 대시보드 아침 브리핑에서 함께 쓴다.
//   variant="button": 상담 카드 안의 일반 버튼  /  variant="icon": 브리핑 행 오른쪽의 작은 연필 버튼

"use client";

import { useActionState, useState } from "react";
import { rescheduleConsultationAction } from "@/app/(teacher)/consultation/actions";
import { toKstLocalInput } from "@/components/shared/datetime";
import Modal from "@/components/shared/Modal";
import { choicePill, errorText, fieldLabel, textInput } from "@/components/shared/ui";
import type { ConsultationMethod, FormActionState, ScheduledConsultation } from "@/lib/types/teacherRecord";

const INITIAL_STATE: FormActionState = { status: "idle", message: null, seq: 0 };
const METHODS: { value: ConsultationMethod; label: string }[] = [
  { value: "phone", label: "전화" },
  { value: "visit", label: "방문" },
  { value: "online", label: "온라인" },
];
const MAX_COUNTERPART_LENGTH = 30;

export default function EditScheduledConsultationButton({
  consultation,
  variant = "button",
  className,
}: {
  consultation: ScheduledConsultation;
  variant?: "button" | "icon";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [openedAtSeq, setOpenedAtSeq] = useState(0);
  const [counterpart, setCounterpart] = useState(consultation.counterpart);
  const [method, setMethod] = useState<ConsultationMethod>(consultation.method);
  const [scheduledAt, setScheduledAt] = useState(() => toKstLocalInput(consultation.scheduledAt));

  const [state, formAction, pending] = useActionState(async (previous: FormActionState, formData: FormData) => {
    const result = await rescheduleConsultationAction(formData);
    if (result.status === "success") setOpen(false);
    return { ...result, seq: previous.seq + 1 };
  }, INITIAL_STATE);

  const isFreshResult = state.seq > openedAtSeq;

  // 열 때마다 현재 저장된 값으로 채운다 — 다른 곳에서 바뀌었어도 최신 값에서 시작
  function openModal() {
    setOpenedAtSeq(state.seq);
    setCounterpart(consultation.counterpart);
    setMethod(consultation.method);
    setScheduledAt(toKstLocalInput(consultation.scheduledAt));
    setOpen(true);
  }

  function closeModal() {
    if (!pending) setOpen(false);
  }

  const label = `${consultation.student.name} 상담 일정 변경`;

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={openModal}
          aria-label={label}
          title="일정 변경"
          className={`grid size-7 place-items-center rounded-full text-[13px] text-gray-400 transition-colors hover:bg-white hover:text-gray-800 ${className ?? ""}`}
        >
          ✎
        </button>
      ) : (
        <button type="button" className={`btn btn-ghost btn-sm ${className ?? ""}`} onClick={openModal}>
          일정 변경
        </button>
      )}

      <Modal open={open} title={label} onClose={closeModal}>
        <form action={formAction}>
          <input type="hidden" name="id" value={consultation.id} />

          <label htmlFor={`reschedule-at-${consultation.id}`} className={fieldLabel}>
            예정 일시
          </label>
          <input
            id={`reschedule-at-${consultation.id}`}
            type="datetime-local"
            name="scheduledAt"
            required
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className={textInput}
          />

          <div className="grid gap-x-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`reschedule-counterpart-${consultation.id}`} className={fieldLabel}>
                상담 대상
              </label>
              <input
                id={`reschedule-counterpart-${consultation.id}`}
                name="counterpart"
                value={counterpart}
                maxLength={MAX_COUNTERPART_LENGTH}
                placeholder="예: 어머니, 학생 본인"
                onChange={(e) => setCounterpart(e.target.value)}
                className={`${textInput} w-full`}
              />
            </div>
            <fieldset>
              <legend className={fieldLabel}>상담 방식</legend>
              <div className="flex gap-1.5">
                {METHODS.map((m) => (
                  <label key={m.value}>
                    <input
                      type="radio"
                      name="method"
                      value={m.value}
                      checked={method === m.value}
                      onChange={() => setMethod(m.value)}
                      className="peer sr-only"
                    />
                    <span className={choicePill}>{m.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          {isFreshResult && state.status === "error" && (
            <p role="alert" className={errorText}>
              {state.message}
            </p>
          )}

          <div className="mt-[18px] flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={closeModal} disabled={pending}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending || !counterpart.trim() || !scheduledAt}>
              {pending ? "저장 중…" : "변경 저장"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
