// 담당: 김현우
// 학생관찰일지 "상담" 탭의 "학생 상담 기록" 버튼과 글쓰기 모달. 아이 본인과 나눈 상담 내용을 적는다 —
// 학부모 상담(ConsultationComposer, 학부모상담기록 화면)과는 다른 기록이다. 저장은 같은 Server
// Action(createObservation)을 쓰되 recordType="student_consultation"으로 표시해 관찰 기록과 구분한다.

"use client";

import { useActionState, useState } from "react";
import { createObservation } from "@/app/(teacher)/observation/actions";
import { nowKstLocalInput } from "@/components/shared/datetime";
import Modal from "@/components/shared/Modal";
import { choicePill, errorText, fieldLabel, helperNote, textArea, textInput } from "@/components/shared/ui";
import type { ClassStudent, FormActionState } from "@/lib/types/teacherRecord";

const INITIAL_STATE: FormActionState = { status: "idle", message: null, seq: 0 };
const MAX_BODY_LENGTH = 5000;

export default function StudentConsultationComposer({ students }: { students: ClassStudent[] }) {
  const [open, setOpen] = useState(false);
  const [openedAtSeq, setOpenedAtSeq] = useState(0);
  const [studentId, setStudentId] = useState("");
  const [body, setBody] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => nowKstLocalInput());

  const [state, formAction, pending] = useActionState(async (previous: FormActionState, formData: FormData) => {
    const result = await createObservation(formData);
    if (result.status === "success") {
      setOpen(false);
      setStudentId("");
      setBody("");
      setOccurredAt(nowKstLocalInput());
    }
    return { ...result, seq: previous.seq + 1 };
  }, INITIAL_STATE);

  const isFreshResult = state.seq > openedAtSeq;

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
      <button type="button" className="btn btn-primary btn-sm shrink-0" onClick={openModal}>
        학생 상담 기록
      </button>

      <Modal open={open} title="아이와 상담한 내용" onClose={closeModal}>
        <form action={formAction}>
          <input type="hidden" name="recordType" value="student_consultation" />

          <fieldset>
            <legend className={fieldLabel}>상담한 아이</legend>
            <div className="flex flex-wrap gap-1.5">
              {students.map((s) => (
                <label key={s.studentId}>
                  <input
                    type="radio"
                    name="studentIds"
                    value={s.studentId}
                    checked={studentId === s.studentId}
                    onChange={() => setStudentId(s.studentId)}
                    className="peer sr-only"
                  />
                  <span className={choicePill}>{s.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label htmlFor="student-consult-occurred-at" className={fieldLabel}>
            상담 일시 (기본값: 지금 — 필요하면 수정)
          </label>
          <input
            id="student-consult-occurred-at"
            type="datetime-local"
            name="occurredAt"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className={textInput}
          />

          <label htmlFor="student-consult-body" className={fieldLabel}>
            상담 내용
          </label>
          <textarea
            id="student-consult-body"
            name="body"
            rows={6}
            required
            value={body}
            maxLength={MAX_BODY_LENGTH}
            placeholder="아이와 나눈 이야기와 상담 내용을 적어주세요…"
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
            <button type="submit" className="btn btn-primary" disabled={pending || !studentId || !body.trim()}>
              {pending ? "저장 중…" : "저장하기"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
