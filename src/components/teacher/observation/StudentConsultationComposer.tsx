// 담당: 김현우
// 학생관찰일지 "학생 상담 기록" 버튼 — 아이 본인과 나눈 상담 내용을 적는 팝업(Modal, size="wide")을 연다.
// 학부모 상담(ConsultationComposer, 학부모상담기록 화면)과는 다른 기록이다. 관찰일지 기록 버튼과 같은 글쓰기 폼
// (ObservationWriteForm, kind="student_consultation")을 같은 배치로 쓰고, 저장은 같은 Server Action(createObservation)에
// recordType="student_consultation"으로 표시해 관찰 기록과 구분한다. 저장하면 팝업이 닫힌다.

"use client";

import { useState } from "react";
import Modal from "@/components/shared/Modal";
import type { ClassStudent } from "@/lib/types/teacherRecord";
import ObservationWriteForm from "./ObservationWriteForm";

export default function StudentConsultationComposer({
  students,
  date,
  today,
}: {
  students: ClassStudent[];
  date: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn btn-primary btn-sm shrink-0" onClick={() => setOpen(true)}>
        학생 상담 기록
      </button>

      <Modal open={open} title="아이와 상담한 내용" onClose={() => setOpen(false)} size="wide">
        <ObservationWriteForm
          kind="student_consultation"
          students={students}
          date={date}
          today={today}
          onSaved={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
