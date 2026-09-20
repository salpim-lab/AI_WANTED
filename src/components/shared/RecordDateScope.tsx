// 담당: 김현우
// 게시판 머리줄의 날짜 칸 하나 — 기본은 "전체"(?date= 없음, 기간 제한 없음)이고, 달력에서 날짜를 고르면 ?date=YYYY-MM-DD로
// 그날만 본다. 달력 머리의 [전체] 버튼을 누르면 날짜를 지우고 돌아간다. 다른 쿼리(q, student 등)는 그대로 둔다.
// 공용 DateControl(진승혜 소유)은 "전체"를 넣을 수 없고 "오늘"을 고르면 ?date=를 지워 버리는(오늘이 기본값인 화면용) 구조라,
// 같은 모양(teacher-date-control.css의 .date-field·.cal 클래스)으로 이 화면용을 따로 둔다. CSS는 가져다 쓰기만 하고 고치지 않는다.
// 미래 날짜는 고를 수 없다 (maxDate = today).

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatKstDate } from "@/components/shared/datetime";
import "@/styles/teacher-date-control.css";

const WEEKDAY_HEAD = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-09-18" → { year: 2026, month: 9 } */
function partsOf(dateKey: string) {
  const [y, m] = dateKey.split("-").map(Number);
  return { year: y, month: m };
}

const keyOf = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** 그 달 1일의 요일(0=일)과 일수. UTC로만 계산해 타임존에 흔들리지 않게 한다. */
function monthShape(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  return {
    startWeekday: first.getUTCDay(),
    dayCount: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

function shiftMonth(year: number, month: number, by: number) {
  const d = new Date(Date.UTC(year, month - 1 + by, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export default function RecordDateScope({
  date,
  today,
  basePath,
  emptyLabel = "전체",
}: {
  /** 고른 날짜 "YYYY-MM-DD". null이면 전체 */
  date: string | null;
  /** 고를 수 있는 마지막 날짜 — 오늘 */
  today: string;
  basePath: string;
  emptyLabel?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => partsOf(date ?? today));
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function goTo(next: string | null) {
    setOpen(false);
    if (next === date || (next !== null && next > today)) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("date", next);
    else params.delete("date");
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath, { scroll: false });
  }

  const { startWeekday, dayCount } = monthShape(view.year, view.month);
  const next = shiftMonth(view.year, view.month, 1);
  const nextBlocked = keyOf(next.year, next.month, 1) > today;

  return (
    <div className="date-control" ref={wrapRef}>
      <button
        type="button"
        className="date-field"
        aria-expanded={open}
        aria-label="날짜 선택"
        onClick={() => {
          if (!open) setView(partsOf(date ?? today));
          setOpen((v) => !v);
        }}
      >
        <svg className="date-icon" viewBox="0 0 24 24" aria-hidden focusable="false">
          <rect x="3.5" y="5" width="17" height="15" rx="3" />
          <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
          <line x1="8" y1="3" x2="8" y2="6.5" />
          <line x1="16" y1="3" x2="16" y2="6.5" />
        </svg>
        <span className="date-text">
          {date === null ? emptyLabel : date === today ? (
            <>
              <em>오늘</em>
              {formatKstDate(date)}
            </>
          ) : (
            formatKstDate(date)
          )}
        </span>
      </button>

      {open && (
        <div className="cal" role="dialog" aria-label="날짜 선택 달력">
          <div className="cal-head">
            <button type="button" className="cal-nav" aria-label="이전 달" onClick={() => setView(shiftMonth(view.year, view.month, -1))}>
              ‹
            </button>
            <span className="cal-month">
              {view.year}년 {view.month}월
            </span>
            <button type="button" className="cal-nav" aria-label="다음 달" disabled={nextBlocked} onClick={() => setView(next)}>
              ›
            </button>
            <button type="button" className="cal-today" disabled={date === null} onClick={() => goTo(null)}>
              전체
            </button>
            <button type="button" className="cal-today" disabled={date === today} onClick={() => goTo(today)}>
              오늘
            </button>
          </div>

          <div className="cal-grid" role="grid">
            {WEEKDAY_HEAD.map((w, i) => (
              <span key={w} className={"cal-wd" + (i === 0 || i === 6 ? " weekend" : "")} role="columnheader">
                {w}
              </span>
            ))}

            {Array.from({ length: startWeekday }, (_, i) => (
              <span key={`pad-${i}`} className="cal-pad" />
            ))}

            {Array.from({ length: dayCount }, (_, i) => {
              const day = i + 1;
              const key = keyOf(view.year, view.month, day);
              const weekday = (startWeekday + i) % 7;
              const classes = [
                "cal-day",
                key === date ? "on" : "",
                key === today ? "is-today" : "",
                weekday === 0 || weekday === 6 ? "weekend" : "",
              ].filter(Boolean);
              return (
                <button
                  type="button"
                  key={key}
                  className={classes.join(" ")}
                  disabled={key > today}
                  aria-current={key === date ? "date" : undefined}
                  onClick={() => goTo(key)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
