// 담당: 김현우
// 아이 상세 헤더 아래 최근 N일 날짜 칸 — Server Component. 선택은 URL(?date=)로 하므로 상태가 없다.
// 칸의 점은 그날 등교 색(없으면 하교 색). 그 이전 날짜는 헤더의 날짜 컨트롤(DateControl)로 고른다.
// 참고: docs/prototype/prototype-teacher.html #mini-calendar

import Link from "next/link";
import { weekdayKst } from "@/components/shared/datetime";
import { SIGNAL_DOT } from "@/components/shared/signalStyles";
import type { ColorHistoryDay } from "@/lib/types/teacherRecord";

export default function MiniCalendar({
  studentId,
  history,
  selectedDate,
  today,
}: {
  studentId: string;
  history: ColorHistoryDay[];
  selectedDate: string;
  today: string;
}) {
  return (
    <nav aria-label="최근 날짜" className="flex gap-1.5 overflow-x-auto pb-1">
      {history.map((day) => {
        const selected = day.date === selectedDate;
        const color = day.morning ?? day.afternoon;
        return (
          <Link
            key={day.date}
            href={day.date === today ? `/students/${studentId}` : `/students/${studentId}?date=${day.date}`}
            scroll={false}
            aria-current={selected ? "date" : undefined}
            aria-label={day.date}
            className={`min-w-10 flex-1 rounded-lg border-[1.5px] px-1 py-1.5 text-center transition-colors hover:border-indigo-500 ${
              selected ? "border-indigo-500 bg-indigo-50 text-indigo-500" : "border-gray-200"
            }`}
          >
            <div className="text-[10px] text-gray-400">{weekdayKst(day.date)}</div>
            <div className="text-sm font-bold">{Number(day.date.slice(8))}</div>
            <div className={`mx-auto mt-[3px] size-1.5 rounded-full ${color ? SIGNAL_DOT[color] : "bg-transparent"}`} />
          </Link>
        );
      })}
    </nav>
  );
}
