// 담당: 김현우
// 아이 상세 탭의 교실 자리 배치도. StudentsSplitView(클라이언트)에서 렌더한다.
// 실제 교실처럼 행 × 열 격자(grid)에 아이를 앉힌다(seatRow/seatCol). 맨 아래가 교탁 쪽(마지막 행), 빈 칸은 빈자리.
// 등교/하교 버튼으로 기준 시간대를 고른다 — 기본값은 등교 (아침에 누가 아직 체크인 안 했는지 먼저 보이게).
// 카드 색 (마우스를 올리면 등교·하교 색을 함께 보여준다):
//   - 그 시간대 체크인(대화)을 마친 아이: 고른 색(4색 중 하나)으로 꽉 채운다
//   - 아직 안 한 아이: 흰 카드 — 누가 아직인지 한눈에 보이게. 머리말에 "몇 명 했는지"도 센다
//   compact=false: 탭 진입 화면 — 전체 폭. "자리 바꾸기"로 편집 모드(SeatLayoutEditor)를 연다
//   compact=true : 아이를 고른 뒤 왼쪽 좁은 열 — 같은 격자를 작게, 선택한 자리 강조. 편집은 안 된다
// 자리를 누르면 /students/[studentId] 로 이동한다 (scroll={false} — 화면이 위로 튀지 않게).

"use client";

import { useState } from "react";
import Link from "next/link";
import { formatKstDate } from "@/components/shared/datetime";
import { SIGNAL_DOT, SIGNAL_LABEL, SIGNAL_SEAT_FILL } from "@/components/shared/signalStyles";
import { card, emptyState } from "@/components/shared/ui";
import { SIGNAL_COLORS } from "@/lib/constants/colors";
import type { SeatGrid, SeatingStudent } from "@/lib/types/teacherRecord";
import type { SignalColor } from "@/lib/types/signal";
import ClassroomFront from "./ClassroomFront";
import SeatLayoutEditor from "./SeatLayoutEditor";
import { seatKey } from "./seatGrid";

/** 범례는 기분이 좋은 순 → 혼자 있고 싶은 순으로 설명한다 */
const LEGEND_ORDER: SignalColor[] = ["green", "yellow", "red", "navy"];
const PERIOD_LABEL = { morning: "등교", afternoon: "하교" } as const;
type Period = keyof typeof PERIOD_LABEL;

function colorOf(seat: SeatingStudent, period: Period): SignalColor | null {
  return period === "morning" ? seat.todayMorning : seat.todayAfternoon;
}


export default function SeatingChart({
  seats,
  grid,
  date,
  selectedStudentId,
  compact,
}: {
  seats: SeatingStudent[];
  grid: SeatGrid;
  date: string;
  selectedStudentId: string | null;
  compact: boolean;
}) {
  const [period, setPeriod] = useState<Period>("morning");
  const [editing, setEditing] = useState(false);
  const isEditing = editing && !compact;

  const bySeat = new Map(seats.map((s) => [seatKey(s.seatRow, s.seatCol), s]));
  const doneCount = seats.filter((s) => colorOf(s, period)).length;
  const rows = Array.from({ length: grid.rows }, (_, i) => i + 1);
  const cols = Array.from({ length: grid.cols }, (_, i) => i + 1);

  return (
    <div className={`${card} ${compact ? "p-5" : "px-7 py-6"}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className={compact ? "text-base font-extrabold" : "text-lg font-extrabold tracking-[-0.3px]"}>
            {isEditing ? "자리 바꾸기" : "우리 반"}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {isEditing ? (
              "바꾼 자리는 저장해야 반영돼요"
            ) : (
              <>
                {formatKstDate(date)} {PERIOD_LABEL[period]} ·{" "}
                <strong className="font-bold text-gray-700">
                  {doneCount}/{seats.length}명
                </strong>{" "}
                했어요
                {!compact && " · 자리를 누르면 오른쪽에 그 아이의 기록이 열려요"}
              </>
            )}
          </p>
        </div>
        {!isEditing && (
          <div className="flex shrink-0 items-center gap-2">
            <div role="group" aria-label="시간대" className="flex rounded-lg border border-gray-200 bg-white p-0.5">
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
            {!compact && seats.length > 0 && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>
                자리 바꾸기
              </button>
            )}
          </div>
        )}
      </div>

      {seats.length === 0 ? (
        <div className={emptyState}>담당 학급에 등록된 학생이 없어요.</div>
      ) : isEditing ? (
        <SeatLayoutEditor
          initial={{
            ...grid,
            seats: seats.map((s) => ({ studentId: s.studentId, row: s.seatRow, col: s.seatCol })),
          }}
          names={new Map(seats.map((s) => [s.studentId, s.name]))}
          onClose={() => setEditing(false)}
        />
      ) : (
        <div className={`rounded-2xl bg-gray-50 ${compact ? "p-3" : "p-5"}`}>
          <ol
            className={`grid ${compact ? "gap-1.5" : "gap-2.5"}`}
            style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}
          >
            {rows.flatMap((row) =>
              cols.map((col) => {
                const seat = bySeat.get(seatKey(row, col));
                const cellHeight = compact ? "h-10" : "h-14";
                if (!seat) {
                  return (
                    <li
                      key={seatKey(row, col)}
                      aria-hidden
                      className={`${cellHeight} rounded-xl border border-dashed border-gray-200`}
                    />
                  );
                }
                return (
                  <li key={seat.studentId}>
                    <SeatCard
                      seat={seat}
                      period={period}
                      selected={seat.studentId === selectedStudentId}
                      compact={compact}
                      className={cellHeight}
                    />
                  </li>
                );
              }),
            )}
          </ol>
          <ClassroomFront compact={compact} />
        </div>
      )}

      {!isEditing && (
        <div className="mt-4 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-gray-500">
          {LEGEND_ORDER.map((color) => (
            <span key={color} className="flex items-center gap-1">
              <span aria-hidden className={`inline-block size-2.5 rounded-full ${SIGNAL_DOT[color]}`} />
              {SIGNAL_COLORS[color].label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span aria-hidden className="inline-block size-2.5 rounded-full border border-gray-300 bg-white" />
            아직 안 했어요
          </span>
        </div>
      )}
    </div>
  );
}

function SeatCard({
  seat,
  period,
  selected,
  compact,
  className,
}: {
  seat: SeatingStudent;
  period: Period;
  selected: boolean;
  compact: boolean;
  className: string;
}) {
  const mainColor = colorOf(seat, period);
  const amLabel = seat.todayMorning ? SIGNAL_LABEL[seat.todayMorning] : "아직 안 함";
  const pmLabel = seat.todayAfternoon ? SIGNAL_LABEL[seat.todayAfternoon] : "아직 안 함";

  const tone = selected
    ? "bg-indigo-50 ring-2 ring-indigo-500 text-indigo-700"
    : mainColor
      ? `${SIGNAL_SEAT_FILL[mainColor]} shadow-[0_1px_2px_rgba(0,0,0,.06)]`
      : "border border-gray-200 bg-white text-gray-700 shadow-[0_1px_2px_rgba(0,0,0,.04)]";

  return (
    <Link
      href={`/students/${seat.studentId}`}
      scroll={false}
      aria-current={selected ? "page" : undefined}
      aria-label={`${seat.name} — 등교 ${amLabel}, 하교 ${pmLabel}`}
      title={`${seat.name} · 등교 ${amLabel} → 하교 ${pmLabel}`}
      className={`flex items-center justify-center px-1.5 text-center transition hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,.1)] ${
        compact ? "rounded-xl" : "rounded-2xl"
      } ${tone} ${className}`}
    >
      <span className={`min-w-0 truncate ${compact ? "text-xs font-semibold" : "text-[13px] font-bold"}`}>
        {seat.name}
      </span>
    </Link>
  );
}
