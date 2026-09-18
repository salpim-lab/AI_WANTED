"use client";

// 담당: 진승혜
// 교사 화면 공용 날짜 컨트롤. 대시보드·아이 상세·학생관찰일지가 같은 모양을 쓴다.
//
// 날짜 "상태"는 여기서 들고 있지 않다 — URL 쿼리(?date=YYYY-MM-DD)가 단일 출처이고
// 각 화면의 서버 컴포넌트가 그걸 읽어 데이터를 내려준다. 그래서 새로고침·뒤로가기·링크 공유가 그냥 된다.
//
// 달력을 직접 그린다. 브라우저 기본 input[type=date] 를 쓰면 팝업이 DOM 밖 브라우저 UI라
// "지우기" 버튼을 없애거나 "오늘" 버튼 위치를 옮길 수가 없다 (CSS 가 닿지 않는다).
// 외부 date picker 패키지는 여전히 쓰지 않는다.
//
// 표시 문구는 아이 상세가 쓰던 formatKstDate ("9월 16일 (수)") 로 통일했다.

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

/** 그 달 1일의 요일(0=일)과 일수. UTC 로만 계산해 타임존에 흔들리지 않게 한다. */
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

export default function DateControl({
  dateKey,
  today,
  basePath,
  minDate,
  maxDate,
  label = "날짜 선택",
}: {
  dateKey: string;
  /** "오늘" 뱃지 기준. 이 날짜로 돌아가면 ?date= 를 URL 에서 지운다. maxDate 와 다를 수 있다. */
  today: string;
  /** 이동할 경로. 예: "/dashboard", "/students/abc" */
  basePath: string;
  minDate?: string;
  maxDate?: string;
  label?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isToday = dateKey === today;

  const [open, setOpen] = useState(false);
  /** 펼쳐 놓은 달. 열 때마다 선택된 날짜의 달로 되돌린다 (열려 있는 동안만 의미가 있다). */
  const [view, setView] = useState(() => partsOf(dateKey));
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

  // 주말은 고를 수 없다. 수업일에만 기록이 쌓이고, 대시보드도 주말을 직전 수업일로 되돌린다.
  const isWeekend = (key: string) => {
    const day = new Date(`${key}T00:00:00Z`).getUTCDay();
    return day === 0 || day === 6;
  };

  const outOfRange = (key: string) =>
    isWeekend(key) ||
    (maxDate !== undefined && key > maxDate) ||
    (minDate !== undefined && key < minDate);

  function goTo(next: string) {
    setOpen(false);
    if (!next || next === dateKey || outOfRange(next)) return;
    // 그 화면의 다른 필터(type, q 등)를 날리지 않는다.
    const params = new URLSearchParams(searchParams.toString());
    if (next === today) params.delete("date");
    else params.set("date", next);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
  }

  const { startWeekday, dayCount } = monthShape(view.year, view.month);
  const prev = shiftMonth(view.year, view.month, -1);
  const next = shiftMonth(view.year, view.month, 1);
  // 그 달에 고를 수 있는 날이 하나도 없으면 화살표를 막는다.
  const prevBlocked = minDate !== undefined && keyOf(prev.year, prev.month, monthShape(prev.year, prev.month).dayCount) < minDate;
  const nextBlocked = maxDate !== undefined && keyOf(next.year, next.month, 1) > maxDate;

  return (
    <div className="date-control" ref={wrapRef}>
      <button
        type="button"
        className="date-field"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          if (!open) setView(partsOf(dateKey));
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
          {isToday && <em>오늘</em>}
          {formatKstDate(dateKey)}
        </span>
      </button>

      {open && (
        <div className="cal" role="dialog" aria-label="날짜 선택 달력">
          <div className="cal-head">
            <button
              type="button"
              className="cal-nav"
              aria-label="이전 달"
              disabled={prevBlocked}
              onClick={() => setView(prev)}
            >
              ‹
            </button>
            <span className="cal-month">
              {view.year}년 {view.month}월
            </span>
            <button
              type="button"
              className="cal-nav"
              aria-label="다음 달"
              disabled={nextBlocked}
              onClick={() => setView(next)}
            >
              ›
            </button>
            <button
              type="button"
              className="cal-today"
              disabled={isToday || outOfRange(today)}
              onClick={() => goTo(today)}
            >
              오늘
            </button>
          </div>

          <div className="cal-grid" role="grid">
            {WEEKDAY_HEAD.map((w, i) => (
              <span
                key={w}
                className={"cal-wd" + (i === 0 || i === 6 ? " weekend" : "")}
                role="columnheader"
              >
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
                key === dateKey ? "on" : "",
                key === today ? "is-today" : "",
                weekday === 0 || weekday === 6 ? "weekend" : "",
              ].filter(Boolean);
              return (
                <button
                  type="button"
                  key={key}
                  className={classes.join(" ")}
                  disabled={outOfRange(key)}
                  aria-current={key === dateKey ? "date" : undefined}
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
