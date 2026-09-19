// 담당: 김현우
// 학부모상담기록 "예정된 상담" 칼럼의 "상담 예약" 버튼과 모달. 아직 상담 전이라 내용은 받지 않고
// 학생(@태그, 한 명)·상담 대상·방식·예정 일시만 받는다 — 저장은 Server Action(scheduleConsultationAction).
// 참고: docs/prototype/prototype-teacher.html #modal-consult

"use client";

import { useActionState, useState } from "react";
import { scheduleConsultationAction } from "@/app/(teacher)/consultation/actions";
import Modal from "@/components/shared/Modal";
import TagInput, { type TagOption } from "@/components/shared/TagInput";
import { boardActionButton, errorText, fieldLabel, textInput } from "@/components/shared/ui";
import type { ClassStudent, ConsultationMethod, FormActionState } from "@/lib/types/teacherRecord";
import MethodPicker from "./MethodPicker";

const INITIAL_STATE: FormActionState = { status: "idle", message: null, seq: 0 };
const MAX_COUNTERPART_LENGTH = 30;

export default function ScheduleConsultationComposer({ students }: { students: ClassStudent[] }) {
  const [open, setOpen] = useState(false);
  const [openedAtSeq, setOpenedAtSeq] = useState(0);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [counterpart, setCounterpart] = useState("");
  const [method, setMethod] = useState<ConsultationMethod>("phone");
  const [scheduledAt, setScheduledAt] = useState("");

  const [state, formAction, pending] = useActionState(async (previous: FormActionState, formData: FormData) => {
    const result = await scheduleConsultationAction(formData);
    if (result.status === "success") {
      setOpen(false);
      setTags([]);
      setCounterpart("");
      setMethod("phone");
      setScheduledAt("");
    }
    return { ...result, seq: previous.seq + 1 };
  }, INITIAL_STATE);

  const isFreshResult = state.seq > openedAtSeq;
  const studentId = tags[0]?.id ?? "";

  function openModal() {
    setOpenedAtSeq(state.seq);
    setOpen(true);
  }

  function closeModal() {
    if (!pending) setOpen(false);
  }

  return (
    <>
      {!open && isFreshResult && state.status === "success" && (
        <span role="status" className="text-xs font-semibold text-green-700">
          ✓ {state.message}
        </span>
      )}
      <button type="button" className={boardActionButton} onClick={openModal}>
        상담 예약
      </button>

      <Modal open={open} title="상담 예약하기" onClose={closeModal}>
        <form action={formAction}>
          <label htmlFor="schedule-student" className={fieldLabel}>
            상담할 학생
          </label>
          {/* 한 상담은 아이 한 명 — 새로 태그하면 앞의 아이를 바꾼다 */}
          <TagInput
            options={students.map((s) => ({ id: s.studentId, label: s.name }))}
            value={tags}
            onChange={(next) => setTags(next.slice(-1))}
            name="studentId"
            inputId="schedule-student"
          />

          <div className="grid gap-x-3 sm:grid-cols-2">
            <div>
              <label htmlFor="schedule-counterpart" className={fieldLabel}>
                상담 대상
              </label>
              <input
                id="schedule-counterpart"
                name="counterpart"
                value={counterpart}
                maxLength={MAX_COUNTERPART_LENGTH}
                placeholder="예: 어머니"
                onChange={(e) => setCounterpart(e.target.value)}
                className={`${textInput} h-9 w-full`}
              />
            </div>
            <MethodPicker id="schedule-method" value={method} onChange={setMethod} />
          </div>

          <label htmlFor="schedule-at" className={fieldLabel}>
            예정 일시
          </label>
          <input
            id="schedule-at"
            type="datetime-local"
            name="scheduledAt"
            required
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className={textInput}
          />

          {isFreshResult && state.status === "error" && (
            <p role="alert" className={errorText}>
              {state.message}
            </p>
          )}

          <div className="mt-[18px] flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={closeModal} disabled={pending}>
              취소
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={pending || !studentId || !counterpart.trim() || !scheduledAt}
            >
              {pending ? "저장 중…" : "예약하기"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
