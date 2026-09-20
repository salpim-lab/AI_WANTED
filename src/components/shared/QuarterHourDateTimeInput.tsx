// 담당: 김현우
// 날짜 + 오전/오후 + 시 + 분(15분 단위)을 따로 고르는 일시 입력. 상담 예약·일정 변경이 쓴다.
// <input type="datetime-local">은 분을 1분 단위로 받고 오전/오후 표기도 기기 언어에 따라 달라서 쓰지 않는다.
// 값은 datetime-local과 같은 "2026-09-12T14:15"(한국 시각) 문자열이라 서버 쪽(parseKstLocalDateTime)은 그대로다.
// 오전/오후·시·분 목록은 브라우저 기본 <select>(열리는 방향·모양을 못 정한다) 대신 직접 그린 목록(DropdownSelect)이라 항상 입력칸 아래로 열린다.
// 값이 빈 문자열이면 날짜가 아직 안 골라진 상태다 — 시각 칸은 미리 채워 두고, 날짜를 고르는 순간 값이 만들어진다.
// 이미 저장된 일정의 분이 15분 단위가 아니면(예: 14:10) 그 분도 선택지에 남겨서 다른 칸만 바꿔도 시각이 슬며시 바뀌지 않게 한다.

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { textInput } from "./ui";

const LOCAL_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;
const MINUTE_STEP = 15;
const HOUR_OPTIONS_12 = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}시` }));
const MERIDIEM_OPTIONS = [
  { value: "am", label: "오전" },
  { value: "pm", label: "오후" },
];

type Meridiem = "am" | "pm";
type TimeParts = { meridiem: Meridiem; hour12: number; minute: number };

/** 날짜를 안 골랐을 때 미리 보여 주는 시각 — 방과 후 상담이 많아서 오후 3시 */
const DEFAULT_TIME: TimeParts = { meridiem: "pm", hour12: 3, minute: 0 };

function parseValue(value: string): (TimeParts & { date: string }) | null {
  const match = LOCAL_DATETIME_RE.exec(value);
  if (!match) return null;
  const hour24 = Number(match[2]);
  return {
    date: match[1],
    meridiem: hour24 < 12 ? "am" : "pm",
    hour12: hour24 % 12 || 12,
    minute: Number(match[3]),
  };
}

function buildValue(date: string, time: TimeParts): string {
  const hour24 = (time.hour12 % 12) + (time.meridiem === "pm" ? 12 : 0);
  return `${date}T${String(hour24).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

const selectClass = `${textInput} h-9`;

type SelectOption = { value: string; label: string };

/** 입력칸 아래로 열리는 목록 선택 — 열면 고른 항목이 보이는 자리까지 스크롤하고, ↑↓로 옮기고 Esc·바깥 클릭으로 닫는다 */
function DropdownSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const wrap = wrapRef.current;
    wrap?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    const onPointerDown = (event: PointerEvent) => {
      if (!wrap?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function handleKeyDown(event: React.KeyboardEvent) {
    // Esc는 여기서 끝낸다 — 그대로 올라가면 팝업(Modal) 전체가 닫힌다
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    if (!open) {
      setOpen(true);
      return;
    }
    const index = options.findIndex((o) => o.value === value);
    const next = options[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (next) onChange(next.value);
  }

  return (
    <div ref={wrapRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={`${selectClass} flex min-w-[68px] cursor-pointer items-center justify-between gap-2 text-left`}
      >
        <span>{selected?.label}</span>
        {/* 학생 드롭다운(StudentSelect)과 같은 꺾쇠. 열리면 뒤집힌다 */}
        <svg viewBox="0 0 12 12" aria-hidden className={`size-3 shrink-0 text-[#aab0c4] transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute top-full left-0 z-10 mt-1 max-h-56 min-w-full overflow-y-auto rounded-xl border border-[#e6e2fb] bg-white py-1 shadow-[0_8px_24px_rgba(16,42,86,.14)]"
        >
          {options.map((option) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`cursor-pointer px-3 py-1.5 text-[13px] whitespace-nowrap hover:bg-[#f5f3ff] ${
                option.value === value ? "bg-[#ede9ff] font-bold text-[#3f37c9]" : "text-[#102a56]"
              }`}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function QuarterHourDateTimeInput({
  id,
  name,
  value,
  onChange,
  required = true,
  max,
}: {
  /** 날짜 칸의 id — <label htmlFor>와 짝 */
  id: string;
  /** 폼으로 제출할 이름 (숨은 input에 "YYYY-MM-DDTHH:mm"으로 담긴다) */
  name: string;
  /** "YYYY-MM-DDTHH:mm" (한국 시각). 아직 안 골랐으면 "" */
  value: string;
  onChange: (next: string) => void;
  /** 날짜 필수 여부 (기본 true). 상담 일시처럼 비워 두면 서버 시각을 쓰는 칸은 false */
  required?: boolean;
  /** 고를 수 있는 마지막 날짜 "YYYY-MM-DD" — 이미 끝난 상담을 적는 칸은 오늘 */
  max?: string;
}) {
  const parsed = parseValue(value);
  // 날짜가 비어 있는 동안(값 "")의 시각 선택을 붙들어 둔다
  const [draft, setDraft] = useState<TimeParts>(DEFAULT_TIME);
  const time = parsed ?? draft;
  const date = parsed?.date ?? "";

  const minutes = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);
  if (!minutes.includes(time.minute)) minutes.push(time.minute);
  minutes.sort((a, b) => a - b);
  const minuteOptions = minutes.map((m) => ({ value: String(m), label: `${String(m).padStart(2, "0")}분` }));

  function update(nextDate: string, nextTime: TimeParts) {
    setDraft(nextTime);
    onChange(nextDate ? buildValue(nextDate, nextTime) : "");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="hidden" name={name} value={value} />
      <input
        id={id}
        type="date"
        required={required}
        max={max}
        value={date}
        onChange={(e) => update(e.target.value, time)}
        className={`${textInput} h-9`}
      />
      <DropdownSelect
        label="오전/오후"
        value={time.meridiem}
        options={MERIDIEM_OPTIONS}
        onChange={(next) => update(date, { ...time, meridiem: next as Meridiem })}
      />
      <div className="flex items-center gap-1.5">
        <DropdownSelect
          label="시"
          value={String(time.hour12)}
          options={HOUR_OPTIONS_12}
          onChange={(next) => update(date, { ...time, hour12: Number(next) })}
        />
        <DropdownSelect
          label="분"
          value={String(time.minute)}
          options={minuteOptions}
          onChange={(next) => update(date, { ...time, minute: Number(next) })}
        />
      </div>
    </div>
  );
}
