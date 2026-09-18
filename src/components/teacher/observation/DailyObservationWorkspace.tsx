// 담당: 김현우
// 학생관찰일지 "관찰일지 기록" 팝업 안 — 그날 쓸 아이를 고르고(왼쪽 명단) 바로 적는(오른쪽 패널) 워크스페이스.
// DailyObservationButton이 이 컴포넌트를 팝업(Modal)에 넣어서 연다 — 열고 닫는 건 그 버튼이 관리하고,
// 여기는 팝업이 열려 있는 동안의 내용만 그린다. 부모가 key={date}로 이 컴포넌트를 새로 마운트시켜준다면
// 날짜가 바뀔 때 선택 상태가 그 날짜의 "아직 안 적은 첫 아이"로 다시 시작된다.
// 저장 직후 "다음 아이"는 서버가 다시 내려주는 recordedStudentIds를 기다리지 않고, 방금 저장한 아이를
// 클라이언트가 이미 아는 목록에 바로 더해서 계산한다 — revalidatePath가 끝나길 기다리면 한 박자 늦다.

"use client";

import { useMemo, useState } from "react";
import { formatKstDate } from "@/components/shared/datetime";
import { card } from "@/components/shared/ui";
import type { ClassStudent } from "@/lib/types/teacherRecord";
import DailyRoster from "./DailyRoster";
import DailyWritePanel from "./DailyWritePanel";

export default function DailyObservationWorkspace({
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
  const recordedSet = useMemo(() => new Set(recordedStudentIds), [recordedStudentIds]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    () => students.find((s) => !recordedSet.has(s.studentId))?.studentId ?? null,
  );

  function handleSaved(savedStudentId: string) {
    const after = new Set(recordedSet);
    after.add(savedStudentId);
    const next = students.find((s) => !after.has(s.studentId));
    setSelectedStudentId(next ? next.studentId : null);
  }

  const selectedStudent = students.find((s) => s.studentId === selectedStudentId) ?? null;

  if (students.length === 0) return null;

  return (
    <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
      <DailyRoster
        students={students}
        recordedStudentIds={recordedSet}
        selectedStudentId={selectedStudentId}
        onSelect={setSelectedStudentId}
      />
      {selectedStudent ? (
        <DailyWritePanel
          key={`${selectedStudent.studentId}-${date}`}
          student={selectedStudent}
          otherStudents={students.filter((s) => s.studentId !== selectedStudent.studentId)}
          date={date}
          today={today}
          onSaved={handleSaved}
        />
      ) : (
        <div className={`${card} flex h-full min-h-[280px] flex-col items-center justify-center px-4 py-8 text-center`}>
          <span
            aria-hidden
            className="mb-2.5 flex size-8 items-center justify-center rounded-full bg-[#ede9ff] text-[#635bff]"
          >
            <CheckIcon />
          </span>
          <p className="text-[13px] font-bold text-[#33405f]">
            {formatKstDate(date)}, 학생 {students.length}명 모두 관찰 기록을 남겼어요
          </p>
          <p className="mt-1 text-xs text-[#7d849b]">명단에서 아이를 다시 누르면 내용을 더 적을 수 있어요.</p>
        </div>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}
