// 담당: 김현우
// 학생관찰일지 상단 "관찰일지 기록" 버튼 — 누르면 관찰한 아이를 태그하고 바로 적는 글쓰기 폼을
// 팝업(Modal, size="wide")으로 연다. 학생 상담 기록 버튼과 같은 자리·같은 패턴. 저장하면 팝업이 닫힌다.

"use client";

import { useState } from "react";
import Modal from "@/components/shared/Modal";
import type { ClassStudent } from "@/lib/types/teacherRecord";
import ObservationWriteForm from "./ObservationWriteForm";

export default function DailyObservationButton({
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
        관찰일지 기록
      </button>

      <Modal open={open} title="학생관찰일지 작성" onClose={() => setOpen(false)} size="wide">
        <ObservationWriteForm kind="observation" students={students} date={date} today={today} onSaved={() => setOpen(false)} />
      </Modal>
    </>
  );
}
