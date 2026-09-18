// 담당: 김현우
// 학부모상담기록 "상담 기록" 버튼과 글쓰기 모달 — 예약 없이 이미 끝난 상담을 바로 완료로 적을 때 쓴다.
// 예약해 뒀다가 완료 처리하는 흐름은 ScheduleConsultationComposer/CompleteConsultationButton 쪽이다.
// 저장은 Server Action(createConsultation)으로만 한다.
// 학생은 @태그(TagInput, student_id로 제출)로 한 명 고른다. 고르면 <DataExportBox />로 상담 자료 리포트를 열 수 있다.
// 입력값은 controlled state로 들고 있다 — 검증 실패 시 쓰던 내용이 사라지지 않게.
// 참고: docs/prototype/prototype-teacher.html #modal-consult

"use client";

import { useActionState, useState } from "react";
import { createConsultation } from "@/app/(teacher)/consultation/actions";
import Modal from "@/components/shared/Modal";
import TagInput, { type TagOption } from "@/components/shared/TagInput";
import { errorText, fieldLabel, helperNote, textArea, textInput } from "@/components/shared/ui";
import type { ClassStudent, ConsultationMethod, FormActionState } from "@/lib/types/teacherRecord";
import DataExportBox from "./DataExportBox";
import MethodPicker from "./MethodPicker";

const INITIAL_STATE: FormActionState = { status: "idle", message: null, seq: 0 };
const MAX_COUNTERPART_LENGTH = 30;
const MAX_BODY_LENGTH = 5000;

export default function ConsultationComposer({ students, reportDays }: { students: ClassStudent[]; reportDays: number }) {
  const [open, setOpen] = useState(false);
  const [openedAtSeq, setOpenedAtSeq] = useState(0);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [counterpart, setCounterpart] = useState("");
  const [method, setMethod] = useState<ConsultationMethod>("phone");
  const [occurredAt, setOccurredAt] = useState("");
  const [body, setBody] = useState("");

  const [state, formAction, pending] = useActionState(async (previous: FormActionState, formData: FormData) => {
    const result = await createConsultation(formData);
    if (result.status === "success") {
      setOpen(false);
      setTags([]);
      setCounterpart("");
      setMethod("phone");
      setOccurredAt("");
      setBody("");
    }
    return { ...result, seq: previous.seq + 1 };
  }, INITIAL_STATE);

  const isFreshResult = state.seq > openedAtSeq;
  const studentId = tags[0]?.id ?? "";
  const selectedStudent = students.find((s) => s.studentId === studentId);

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
      <button type="button" className="btn btn-primary btn-sm" onClick={openModal}>
        상담 기록
      </button>

      <Modal open={open} title="학부모 상담 기록" onClose={closeModal}>
        <form action={formAction}>
          <label htmlFor="consultation-student" className={fieldLabel}>
            상담한 학생
          </label>
          {/* 한 상담은 아이 한 명 — 새로 태그하면 앞의 아이를 바꾼다 */}
          <TagInput
            options={students.map((s) => ({ id: s.studentId, label: s.name }))}
            value={tags}
            onChange={(next) => setTags(next.slice(-1))}
            name="studentId"
            inputId="consultation-student"
          />
          {selectedStudent && (
            <DataExportBox
              student={{ studentId: selectedStudent.studentId, name: selectedStudent.name }}
              days={reportDays}
            />
          )}

          <div className="grid gap-x-3 sm:grid-cols-2">
            <div>
              <label htmlFor="consultation-counterpart" className={fieldLabel}>
                상담 대상
              </label>
              <input
                id="consultation-counterpart"
                name="counterpart"
                value={counterpart}
                maxLength={MAX_COUNTERPART_LENGTH}
                placeholder="예: 어머니"
                onChange={(e) => setCounterpart(e.target.value)}
                className={`${textInput} h-9 w-full`}
              />
            </div>
            <MethodPicker id="consultation-method" value={method} onChange={setMethod} />
          </div>

          <label htmlFor="consultation-occurred-at" className={fieldLabel}>
            상담 일시 (선택)
          </label>
          <input
            id="consultation-occurred-at"
            type="datetime-local"
            name="occurredAt"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className={textInput}
          />

          <label htmlFor="consultation-body" className={fieldLabel}>
            상담 내용
          </label>
          <textarea
            id="consultation-body"
            name="body"
            rows={5}
            required
            value={body}
            maxLength={MAX_BODY_LENGTH}
            placeholder="상담에서 나눈 주요 내용과 이후 계획을 적어주세요…"
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
            <button
              type="submit"
              className="btn btn-primary"
              disabled={pending || !studentId || !counterpart.trim() || !body.trim()}
            >
              {pending ? "저장 중…" : "저장하기"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
