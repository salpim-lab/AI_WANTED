// 담당: 김현우
// 날짜 + 오전/오후 + 시 + 분(15분 단위)을 따로 고르는 일시 입력. 상담 예약·일정 변경이 쓴다.
// <input type="datetime-local">은 분을 1분 단위로 받고 오전/오후 표기도 기기 언어에 따라 달라서 쓰지 않는다.
// 값은 datetime-local과 같은 "2026-09-12T14:15"(한국 시각) 문자열이라 서버 쪽(parseKstLocalDateTime)은 그대로다.
// 값이 빈 문자열이면 날짜가 아직 안 골라진 상태다 — 시각 칸은 미리 채워 두고, 날짜를 고르는 순간 값이 만들어진다.
// 이미 저장된 일정의 분이 15분 단위가 아니면(예: 14:10) 그 분도 선택지에 남겨서 다른 칸만 바꿔도 시각이 슬며시 바뀌지 않게 한다.

"use client";

import { useState } from "react";
import { textInput } from "./ui";

const LOCAL_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;
const MINUTE_STEP = 15;
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);

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

export default function QuarterHourDateTimeInput({
  id,
  name,
  value,
  onChange,
}: {
  /** 날짜 칸의 id — <label htmlFor>와 짝 */
  id: string;
  /** 폼으로 제출할 이름 (숨은 input에 "YYYY-MM-DDTHH:mm"으로 담긴다) */
  name: string;
  /** "YYYY-MM-DDTHH:mm" (한국 시각). 아직 안 골랐으면 "" */
  value: string;
  onChange: (next: string) => void;
}) {
  const parsed = parseValue(value);
  // 날짜가 비어 있는 동안(값 "")의 시각 선택을 붙들어 둔다
  const [draft, setDraft] = useState<TimeParts>(DEFAULT_TIME);
  const time = parsed ?? draft;
  const date = parsed?.date ?? "";

  const minutes = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);
  if (!minutes.includes(time.minute)) minutes.push(time.minute);
  minutes.sort((a, b) => a - b);

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
        required
        value={date}
        onChange={(e) => update(e.target.value, time)}
        className={`${textInput} h-9`}
      />
      <select
        aria-label="오전/오후"
        value={time.meridiem}
        onChange={(e) => update(date, { ...time, meridiem: e.target.value as Meridiem })}
        className={selectClass}
      >
        <option value="am">오전</option>
        <option value="pm">오후</option>
      </select>
      <div className="flex items-center gap-1.5">
        <select
          aria-label="시"
          value={time.hour12}
          onChange={(e) => update(date, { ...time, hour12: Number(e.target.value) })}
          className={selectClass}
        >
          {HOURS_12.map((h) => (
            <option key={h} value={h}>
              {h}시
            </option>
          ))}
        </select>
        <select
          aria-label="분"
          value={time.minute}
          onChange={(e) => update(date, { ...time, minute: Number(e.target.value) })}
          className={selectClass}
        >
          {minutes.map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, "0")}분
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
