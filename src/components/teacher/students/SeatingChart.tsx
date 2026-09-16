// 담당: 김현우
// 아이 상세 탭의 교실 자리 배치도. StudentsSplitView(클라이언트)에서 렌더한다.
// 실제 물리적 자리(seat_row/seat_col) 대신 "지금 보고 있는 시간대" 색 순서(남색 → 빨강 → 노랑 → 초록,
// 기록 없음은 맨 뒤)로 한 줄로 쭉 정렬한다 — 카드 모양은 그대로 두고 순서만 바꾼다.
// 등교/하교 버튼으로 기준 시간대를 고른다 — 교사는 보통 하교 이후에 이 화면을 보므로 기본값은 하교.
// 카드는 고른 시간대 색으로 꽉 채운다. 등교색과 하교색이 다르면(=오늘 바뀌었으면) 카드 위에 작은 동그라미로
// "다른 시간대에는 이 색이었다"를 보여준다 — 예: 하교 기준으로 보는데 등교가 빨강이었으면 동그라미가 빨강.
// 어느 쪽이 더 낫다는 판정은 하지 않고 "달라졌다"는 사실만 표시한다.
//   compact=false: 탭 진입 화면 — 전체 폭, 이름 전체, 기록 있으면 색으로 꽉 채운 카드
//   compact=true : 아이를 고른 뒤 왼쪽 좁은 열 — 이름(성 제외)만, 선택한 자리 강조
// 자리를 누르면 /students/[studentId] 로 이동한다 (scroll={false} — 화면이 위로 튀지 않게).
// 참고: 교실 배치도 인포그래픽류 레퍼런스 — 회색 "바닥" 위에 파스텔 톤 카드, 가운데 아이 이름만.

"use client";

import { useState } from "react";
import Link from "next/link";
import { formatKstDate } from "@/components/shared/datetime";
import { givenName } from "@/components/shared/names";
import { SIGNAL_DOT, SIGNAL_LABEL, SIGNAL_SEAT_FILL } from "@/components/shared/signalStyles";
import { card, emptyState } from "@/components/shared/ui";
import { SIGNAL_COLORS } from "@/lib/constants/colors";
import type { SeatingStudent } from "@/lib/types/teacherRecord";
import type { SignalColor } from "@/lib/types/signal";

const COLOR_ORDER: SignalColor[] = ["navy", "red", "yellow", "green"];
/** 범례는 기분이 좋은 순 → 혼자 있고 싶은 순으로 설명한다 (카드 정렬 순서와는 별개) */
const LEGEND_ORDER: SignalColor[] = ["green", "yellow", "red", "navy"];
const PERIOD_LABEL = { morning: "등교", afternoon: "하교" } as const;
type Period = keyof typeof PERIOD_LABEL;

function colorOf(seat: SeatingStudent, period: Period): SignalColor | null {
  return period === "morning" ? seat.todayMorning : seat.todayAfternoon;
}

function otherPeriodOf(period: Period): Period {
  return period === "morning" ? "afternoon" : "morning";
}

/** 고른 시간대 색 순서(남색 → 빨강 → 노랑 → 초록)로 한 줄 정렬. 기록 없는 아이는 맨 뒤 */
function sortByColor(seats: SeatingStudent[], period: Period): SeatingStudent[] {
  const rank = (color: SignalColor | null) => (color ? COLOR_ORDER.indexOf(color) : COLOR_ORDER.length);
  return [...seats].sort((a, b) => rank(colorOf(a, period)) - rank(colorOf(b, period)));
}

export default function SeatingChart({
  seats,
  date,
  selectedStudentId,
  compact,
}: {
  seats: SeatingStudent[];
  date: string;
  selectedStudentId: string | null;
  compact: boolean;
}) {
  const [period, setPeriod] = useState<Period>("afternoon");

  return (
    <div className={`${card} ${compact ? "p-5" : "px-7 py-6"}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className={compact ? "text-base font-extrabold" : "text-lg font-extrabold tracking-[-0.3px]"}>
            우리 반 자리 배치도
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {seats.length}명 · {formatKstDate(date)} {PERIOD_LABEL[period]} 색
            {!compact && " · 자리를 누르면 오른쪽에 그 아이의 기록이 열려요"}
          </p>
        </div>
        <div role="group" aria-label="시간대" className="flex shrink-0 rounded-lg border border-gray-200 bg-white p-0.5">
          {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                period === p ? "bg-indigo-50 text-indigo-600" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mb-4 w-3/4 rounded-xl bg-indigo-50 py-1.5 text-center text-xs font-semibold text-indigo-400">
        칠판 / 교탁
      </div>

      {seats.length === 0 ? (
        <div className={emptyState}>담당 학급에 등록된 학생이 없어요.</div>
      ) : (
        <ol
          className={`grid gap-2.5 rounded-2xl bg-gray-50 ${compact ? "grid-cols-2 p-3" : "grid-cols-5 p-5"}`}
        >
          {sortByColor(seats, period).map((seat) => {
            const selected = seat.studentId === selectedStudentId;
            const mainColor = colorOf(seat, period);
            const otherColor = colorOf(seat, otherPeriodOf(period));
            const fill = mainColor ? SIGNAL_SEAT_FILL[mainColor] : "bg-white text-gray-700";
            const hasRecord = Boolean(mainColor);
            const amLabel = seat.todayMorning ? SIGNAL_LABEL[seat.todayMorning] : "기록 없음";
            const pmLabel = seat.todayAfternoon ? SIGNAL_LABEL[seat.todayAfternoon] : "기록 없음";
            const changed = Boolean(mainColor) && Boolean(otherColor) && mainColor !== otherColor;

            return (
              <li key={seat.studentId}>
                <Link
                  href={`/students/${seat.studentId}`}
                  scroll={false}
                  aria-current={selected ? "page" : undefined}
                  aria-label={`${seat.name} — 등교 ${amLabel}, 하교 ${pmLabel}${changed ? " (오늘 색이 바뀜)" : ""}`}
                  title={`${seat.name} · 등교 ${amLabel} → 하교 ${pmLabel}`}
                  className={`relative block text-center transition hover:-translate-y-0.5 ${
                    compact ? "rounded-xl px-1.5 py-2.5" : "rounded-2xl px-2.5 py-4"
                  } ${
                    !compact &&
                    (hasRecord
                      ? "shadow-[0_1px_2px_rgba(0,0,0,.06)] hover:shadow-[0_6px_16px_rgba(0,0,0,.1)]"
                      : "border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,.04)] hover:shadow-[0_6px_16px_rgba(0,0,0,.1)]")
                  } ${selected ? "bg-indigo-50 ring-2 ring-indigo-500 text-indigo-700" : fill}`}
                >
                  {changed && otherColor && (
                    <span
                      aria-hidden
                      title={`${PERIOD_LABEL[otherPeriodOf(period)]} ${SIGNAL_LABEL[otherColor]}`}
                      className={`absolute -top-[5px] -right-[5px] size-4 rounded-full border-2 border-white ${SIGNAL_DOT[otherColor]}`}
                    />
                  )}
                  {compact ? (
                    <div className="truncate text-xs font-semibold">{givenName(seat.name)}</div>
                  ) : (
                    <div className="truncate text-[13px] font-bold">{seat.name}</div>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-4 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-gray-500">
        {LEGEND_ORDER.map((color) => (
          <span key={color} className="flex items-center gap-1">
            <span aria-hidden className={`inline-block size-2.5 rounded-full ${SIGNAL_DOT[color]}`} />
            {SIGNAL_COLORS[color].label}
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gray-500">
        <span aria-hidden className="size-3.5 rounded-full border-2 border-gray-300 bg-white" />
        카드 위 작은 동그라미 = 다른 시간대에는 이 색이었어요 (등교·하교 색이 달라진 아이만 표시)
      </div>
    </div>
  );
}
