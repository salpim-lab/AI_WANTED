// 담당: 김현우
// 아이 상세 헤더 오른쪽 날짜 선택. 날짜를 바꾸면 ?date= 로 이동하고 서버가 그 날짜 기록을 다시 조회한다.
// 오늘 이후 날짜는 고를 수 없다 (서버에서도 오늘로 되돌린다).

"use client";

import { useRouter } from "next/navigation";
import { textInput } from "@/components/shared/ui";

export default function StudentDatePicker({
  studentId,
  date,
  today,
}: {
  studentId: string;
  date: string;
  today: string;
}) {
  const router = useRouter();

  return (
    <input
      type="date"
      aria-label="기록 날짜 선택"
      value={date}
      max={today}
      onChange={(event) => {
        const next = event.target.value;
        if (!next || next === date) return;
        router.push(next === today ? `/students/${studentId}` : `/students/${studentId}?date=${next}`, {
          scroll: false,
        });
      }}
      className={`${textInput} py-2`}
    />
  );
}
