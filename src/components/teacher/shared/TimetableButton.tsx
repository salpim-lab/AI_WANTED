"use client";

// 담당: 진승혜
// 날짜 버튼 옆에 붙는 시간표 버튼. 교사 화면 어디서나 같은 모양으로 쓴다.
//
// 상시 노출하지 않는다 — 시간표는 "지금 3교시가 뭐였더라"를 확인할 때만 필요한 정보라
// 화면에 늘 깔아두면 정작 읽어야 할 카드를 밀어낸다.
//
// 올리면 열리고, 누르면 고정된다: 마우스로는 스치듯 보고, 키보드·터치에서는 눌러서 연다.
// 그래서 CSS :hover 만으로는 안 되고 열림 상태를 들고 있어야 한다.

import { useEffect, useRef, useState } from "react";
import {
  PERIOD_TIMES,
  TIMETABLE,
  WEEKDAYS,
  weekdayOfDate,
} from "@/lib/timetable/classTimetable";
import "@/styles/teacher-date-control.css";

export default function TimetableButton({ dateKey }: { dateKey?: string }) {
  const [pinned, setPinned] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 고정해 둔 동안에는 바깥을 누르거나 Esc 로 닫는다.
  useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setPinned(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pinned]);

  // 보고 있는 날짜의 요일을 세로로 강조한다. 주말이면 강조 없이 표만 보여준다.
  const activeWeekday = dateKey ? weekdayOfDate(dateKey) : null;

  return (
    <div className={"tt-wrap" + (pinned ? " pinned" : "")} ref={wrapRef}>
      <button
        type="button"
        className="tt-btn"
        aria-expanded={pinned}
        onClick={() => setPinned((v) => !v)}
      >
        <svg className="tt-icon" viewBox="0 0 24 24" aria-hidden focusable="false">
          <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
          <line x1="3.5" y1="9" x2="20.5" y2="9" />
          <line x1="9" y1="9" x2="9" y2="20.5" />
          <line x1="15" y1="9" x2="15" y2="20.5" />
        </svg>
        시간표
      </button>

      <div className="tt-panel" role="group" aria-label="우리 반 시간표">
        <div className="tt-panel-head">
          우리 반 시간표
          <span className="tt-panel-sub">3학년 2반 · 5교시(화요일만 6교시)</span>
        </div>

        <table className="tt-table">
          <thead>
            <tr>
              <th scope="col" className="tt-corner">
                <span className="sr-only">교시</span>
              </th>
              {WEEKDAYS.map((w) => (
                <th scope="col" key={w} className={w === activeWeekday ? "tt-on" : undefined}>
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIOD_TIMES.map((time, row) => (
              <tr key={time}>
                <th scope="row" className="tt-period">
                  {row + 1}교시
                  <em>{time}</em>
                </th>
                {WEEKDAYS.map((w) => {
                  // 5교시로 끝나는 날은 마지막 줄이 빈다 — 빈 칸은 과목 칸처럼 칠하지 않는다
                  const subject = TIMETABLE[w][row];
                  return (
                    <td
                      key={w}
                      className={
                        (subject ? "" : "tt-none ") + (w === activeWeekday ? "tt-on" : "")
                      }
                    >
                      {subject ?? ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
