// 담당: 김현우
// 학생관찰일지 상단 "관찰일지 기록" 버튼 — 누르면 그날 쓸 아이를 고르고 바로 적는 워크스페이스를
// 팝업(Modal, size="wide")으로 연다. 학생 상담 기록 버튼과 같은 자리·같은 패턴.
// 팝업을 열 때마다 key={date}로 워크스페이스를 새로 마운트해서 선택 상태를 그 날짜 기준으로 다시 시작한다.

"use client";

import { useState } from "react";
import Modal from "@/components/shared/Modal";
import type { ClassStudent } from "@/lib/types/teacherRecord";
import DailyObservationWorkspace from "./DailyObservationWorkspace";

export default function DailyObservationButton({
  students,
  recordedStudentIds,
  date,
  today,
}: {
  students: ClassStudent[];
  recordedStudentIds: string[];
  date: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-sm shrink-0"
        title={`${recordedStudentIds.length}/${students.length}명 기록함`}
        onClick={() => setOpen(true)}
      >
        관찰일지 기록
      </button>

      <Modal open={open} title="학생관찰일지 작성" onClose={() => setOpen(false)} size="wide">
        <DailyObservationWorkspace
          key={date}
          students={students}
          recordedStudentIds={recordedStudentIds}
          date={date}
          today={today}
        />
      </Modal>
    </>
  );
}
