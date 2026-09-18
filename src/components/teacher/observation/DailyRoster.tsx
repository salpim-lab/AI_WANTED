// 담당: 김현우
// 학생관찰일지 상단 워크스페이스의 왼쪽 명단 — 그 날짜에 관찰 기록을 적었는지를 색으로만 구분한다
// (초록 점 = 오늘 기록 있음, 빈 테두리 = 아직 없음). 텍스트 배지 대신 점만 써서 한눈에 훑기 쉽게 한다.
// 이름은 성까지 전체로 보여준다 — 동명이인 구분, 아이 상세 자리배치도 등 다른 화면과 표기 통일.

"use client";

import type { ClassStudent } from "@/lib/types/teacherRecord";

export default function DailyRoster({
  students,
  recordedStudentIds,
  selectedStudentId,
  onSelect,
}: {
  students: ClassStudent[];
  recordedStudentIds: Set<string>;
  selectedStudentId: string | null;
  onSelect: (studentId: string) => void;
}) {
  return (
    <div>
      <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-0.5">
        {students.map((student) => {
          const recorded = recordedStudentIds.has(student.studentId);
          const selected = student.studentId === selectedStudentId;
          return (
            <li key={student.studentId}>
              <button
                type="button"
                onClick={() => onSelect(student.studentId)}
                aria-current={selected ? "true" : undefined}
                aria-label={`${student.name} — ${recorded ? "오늘 기록 있음" : "아직 기록 없음"}`}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold transition-colors ${
                  selected ? "bg-[#ede9ff] text-[#3f37c9]" : "text-[#33405f] hover:bg-[#f5f3ff]"
                }`}
              >
                <span
                  aria-hidden
                  className={
                    recorded
                      ? "inline-block size-2.5 shrink-0 rounded-full bg-green-500"
                      : "inline-block size-2.5 shrink-0 rounded-full border-[1.5px] border-[#cfcafa]"
                  }
                />
                <span className="truncate">{student.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
