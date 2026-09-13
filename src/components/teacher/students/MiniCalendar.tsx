// 담당: 김현우
// 아이 상세 페이지 상단: 날짜 선택용 작은 달력 (기본값: 당일)
// 지금은 최근 13일 mock 색 이력만 보여줌 — 실제로는 studentId 기준 색 이력 쿼리로 교체.
// 참고: docs/prototype/prototype-teacher.html #mini-calendar

"use client";

import { useState } from "react";
import { MOCK_CALENDAR_COLORS } from "./mockData";

export default function MiniCalendar({
  onSelectDate,
}: {
  onSelectDate?: (dayIndex: number) => void;
}) {
  const [selected, setSelected] = useState(12); // 마지막 칸 = 오늘(mock)

  const days = Array.from({ length: 13 }, (_, i) => 13 - i); // 13 ~ 1

  return (
    <div className="mini-calendar">
      {days.map((dayNum, i) => {
        const isToday = i === selected;
        const color = MOCK_CALENDAR_COLORS[i] ?? "green";
        return (
          <button
            key={dayNum}
            type="button"
            className={`cal-day has-${color}` + (isToday ? " today" : "")}
            onClick={() => {
              setSelected(i);
              onSelectDate?.(i);
            }}
          >
            <div className="day-num">{dayNum}</div>
            <div className="day-dot" />
          </button>
        );
      })}
    </div>
  );
}
