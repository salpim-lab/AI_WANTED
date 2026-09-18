// 담당: 김현우
// 아이 상세 헤더 아래 최근 N일 날짜 칸 — Server Component. 선택은 URL(?date=)로 하므로 상태가 없다.
// 칸 아래 짧은 선: 왼쪽 절반은 그날 등교 색, 오른쪽 절반은 하교 색 (기록이 없으면 옅은 회색).
// 그 이전 날짜는 헤더의 날짜 컨트롤(DateControl)로 고른다.
// 참고: docs/prototype/prototype-teacher.html #mini-calendar

import Link from "next/link";
import { weekdayKst } from "@/components/shared/datetime";
import { SIGNAL_DOT, SIGNAL_LABEL } from "@/components/shared/signalStyles";
import type { ColorHistoryDay } from "@/lib/types/teacherRecord";
import type { SignalColor } from "@/lib/types/signal";

const NO_RECORD = "bg-gray-200";

const labelOf = (color: SignalColor | null) => (color ? SIGNAL_LABEL[color] : "기록 없음");

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
        return (
          <Link
            key={day.date}
            href={day.date === today ? `/students/${studentId}` : `/students/${studentId}?date=${day.date}`}
            scroll={false}
            aria-current={selected ? "date" : undefined}
            aria-label={`${day.date} — 등교 ${labelOf(day.morning)}, 하교 ${labelOf(day.afternoon)}`}
            title={`등교 ${labelOf(day.morning)} · 하교 ${labelOf(day.afternoon)}`}
            className={`min-w-10 flex-1 rounded-lg border-[1.5px] px-1 py-1.5 text-center transition-colors hover:border-indigo-500 ${
              selected ? "border-indigo-500 bg-indigo-50 text-indigo-500" : "border-gray-200"
            }`}
          >
            <div className="text-[10px] text-gray-400">{weekdayKst(day.date)}</div>
            <div className="text-sm font-bold">{Number(day.date.slice(8))}</div>
            <div aria-hidden className="mx-auto mt-1 flex h-1 w-5 gap-px overflow-hidden rounded-full">
              <span className={`flex-1 ${day.morning ? SIGNAL_DOT[day.morning] : NO_RECORD}`} />
              <span className={`flex-1 ${day.afternoon ? SIGNAL_DOT[day.afternoon] : NO_RECORD}`} />
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
