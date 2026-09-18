// 담당: 김현우
// 자리 배치도 "자리 바꾸기" 편집기. SeatingChart가 편집 모드일 때(넓은 화면)만 렌더한다 — 머리말(제목·안내)까지 여기서 그린다.
// [취소]/[자리 저장]은 자리 판 오른쪽 아래, 행·열 추가 줄 끝에 둔다.
// - 끌어서 놓기: Pointer Events로 직접 구현한다 (HTML5 drag는 태블릿 터치에서 동작하지 않고, 패키지 설치 금지).
//   빈자리에 놓으면 옮기고, 다른 아이 위에 놓으면 서로 자리를 맞바꾼다.
//   끄는 동안 손가락을 따라다니는 이름표는 document.body에 포털로 그린다 — 카드의 backdrop-blur가
//   position: fixed의 기준을 카드로 바꿔서, 카드 안에 그리면 포인터보다 한참 아래에 보인다.
// - 누르기로 바꾸기: 아이를 누르고 → 다른 아이나 빈자리를 누르면 같은 동작 (키보드·드래그가 불편할 때).
// - 행·열: "+ 행/열 추가"는 맨 아래(교탁 쪽)/오른쪽에 붙이고, 아이가 없는 행·열은 머리의 ✕로 지운다.
// 고르기·끌기 표시는 회색 톤이다 (보라·파랑은 저장 버튼 등 주요 동작에만).
// 편집 중에는 초안만 바뀌고, 저장을 눌러야 Server Action(saveSeatLayoutAction)으로 한 번에 저장한다.

"use client";

import { Fragment, startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { saveSeatLayoutAction } from "@/app/(teacher)/students/actions";
import { givenName } from "@/components/shared/names";
import { errorText, salpimMuted, salpimTitle, seatBoard, seatCellHeight } from "@/components/shared/ui";
import type { FormActionState, SeatLayout } from "@/lib/types/teacherRecord";
import ClassroomFront from "./ClassroomFront";
import StudentAvatar from "./StudentAvatar";
import {
  SEAT_GRID_MAX,
  addCol,
  addRow,
  isColEmpty,
  isRowEmpty,
  isSameLayout,
  placeStudent,
  removeCol,
  removeRow,
  seatAt,
  seatKey,
} from "./seatGrid";

const INITIAL_STATE: FormActionState = { status: "idle", message: null, seq: 0 };
/** 이만큼 움직여야 끌기로 본다 — 그보다 짧으면 누르기 */
const DRAG_THRESHOLD_PX = 5;

type Drag = { studentId: string; x: number; y: number };

function cellAtPoint(x: number, y: number): { row: number; col: number } | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-seat-row]");
  if (!el) return null;
  return { row: Number(el.dataset.seatRow), col: Number(el.dataset.seatCol) };
}

export default function SeatLayoutEditor({
  initial,
  names,
  onClose,
}: {
  initial: SeatLayout;
  names: Map<string, string>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [picked, setPicked] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const pointerStart = useRef<{ studentId: string; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const [state, save, pending] = useActionState(async (previous: FormActionState, layout: SeatLayout) => {
    const result = await saveSeatLayoutAction(layout);
    if (result.status === "success") onClose();
    return { ...result, seq: previous.seq + 1 };
  }, INITIAL_STATE);

  const dirty = !isSameLayout(draft, initial);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPicked(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function moveTo(studentId: string, row: number, col: number) {
    setDraft((current) => placeStudent(current, studentId, row, col));
    setPicked(null);
  }

  // ── 끌어서 놓기 ──
  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>, studentId: string) {
    if (e.button !== 0 || pending) return;
    suppressClick.current = false;
    pointerStart.current = { studentId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const start = pointerStart.current;
    if (!start) return;
    if (!drag && Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD_PX) return;
    setDrag({ studentId: start.studentId, x: e.clientX, y: e.clientY });
    const cell = cellAtPoint(e.clientX, e.clientY);
    setHoverKey(cell ? seatKey(cell.row, cell.col) : null);
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    if (drag) {
      // 끌기가 끝나면 바로 이어서 오는 click은 "누르기"로 치지 않는다.
      // click이 안 오는 경우(다른 곳에서 손을 뗌)도 있으니 이번 이벤트 처리가 끝나면 풀어 둔다.
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      const cell = cellAtPoint(e.clientX, e.clientY);
      if (cell) moveTo(drag.studentId, cell.row, cell.col);
    }
    resetPointer();
  }

  function resetPointer() {
    pointerStart.current = null;
    setDrag(null);
    setHoverKey(null);
  }

  // ── 누르기로 바꾸기 ──
  function handleStudentClick(studentId: string, row: number, col: number) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (!picked) setPicked(studentId);
    else if (picked === studentId) setPicked(null);
    else moveTo(picked, row, col);
  }

  function handleEmptyClick(row: number, col: number) {
    if (picked) moveTo(picked, row, col);
  }

  const rows = Array.from({ length: draft.rows }, (_, i) => i + 1);
  const cols = Array.from({ length: draft.cols }, (_, i) => i + 1);
  const pickedName = picked ? names.get(picked) : null;

  return (
    <div>
      <div className="mb-4 flex min-w-0 flex-wrap items-baseline gap-x-2.5">
        <h2 className={`${salpimTitle} text-[22px]`}>자리 바꾸기</h2>
        <p className={`text-xs ${salpimMuted}`} aria-live="polite">
          {pickedName
            ? `${pickedName}을(를) 골랐어요. 바꿀 아이나 빈자리를 눌러 주세요. (Esc로 취소)`
            : "아이를 끌어서 옮기거나, 두 아이를 차례로 눌러 자리를 바꿔요. 아이가 앉은 행·열은 지울 수 없어요."}
        </p>
      </div>

      <div className={`${seatBoard} p-5`}>
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: `24px repeat(${draft.cols}, minmax(0, 1fr))` }}
        >
          {/* 열 머리: 아이가 없는 열만 ✕로 지울 수 있다 */}
          <div aria-hidden />
          {cols.map((col) => (
            <div key={`col-${col}`} className="flex h-6 items-center justify-center">
              {draft.cols > 1 && isColEmpty(draft, col) && (
                <button
                  type="button"
                  onClick={() => setDraft((current) => removeCol(current, col))}
                  aria-label={`${col}번째 열 지우기`}
                  title="빈 열 지우기"
                  className="grid size-6 place-items-center rounded-full text-xs text-gray-400 hover:bg-red-50 hover:text-red-500"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          {rows.map((row) => (
            <Fragment key={`row-${row}`}>
              <div className="flex items-center justify-center">
                {draft.rows > 1 && isRowEmpty(draft, row) && (
                  <button
                    type="button"
                    onClick={() => setDraft((current) => removeRow(current, row))}
                    aria-label={`${row}번째 행 지우기`}
                    title="빈 행 지우기"
                    className="grid size-6 place-items-center rounded-full text-xs text-gray-400 hover:bg-red-50 hover:text-red-500"
                  >
                    ✕
                  </button>
                )}
              </div>
              {cols.map((col) => {
                const key = seatKey(row, col);
                const seat = seatAt(draft, row, col);
                const isHover = hoverKey === key;
                const name = seat ? (names.get(seat.studentId) ?? "") : "";
                return (
                  <div key={key} data-seat-row={row} data-seat-col={col} className={seatCellHeight}>
                    {seat ? (
                      <button
                        type="button"
                        onPointerDown={(e) => handlePointerDown(e, seat.studentId)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={resetPointer}
                        onClick={() => handleStudentClick(seat.studentId, row, col)}
                        aria-pressed={picked === seat.studentId}
                        aria-label={`${name} — ${row}행 ${col}열`}
                        className={`flex size-full cursor-grab touch-none [-webkit-tap-highlight-color:transparent] flex-col items-center justify-center gap-1 rounded-2xl border px-2 select-none transition active:cursor-grabbing ${
                          picked === seat.studentId
                            ? "border-[#9aa0ae] bg-[#eef0f3] text-[#33405f] ring-2 ring-[#9aa0ae]"
                            : "border-[#e6e2fb] bg-white text-[#102a56] shadow-[0_1px_2px_rgba(16,42,86,.05)] hover:border-[#c4c8d1]"
                        } ${drag?.studentId === seat.studentId ? "opacity-30" : ""} ${
                          isHover && drag?.studentId !== seat.studentId ? "ring-2 ring-[#c4c8d1]" : ""
                        }`}
                      >
                        <StudentAvatar name={name} initial={givenName(name).slice(0, 1)} size="sm" />
                        <span className="max-w-full min-w-0 truncate text-[13px] font-bold">{name}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleEmptyClick(row, col)}
                        disabled={!picked}
                        aria-label={`빈자리 — ${row}행 ${col}열`}
                        className={`size-full rounded-2xl border-2 border-dashed text-[11px] transition-colors ${
                          isHover
                            ? "border-[#9aa0ae] bg-[#eef0f3] text-[#5d6580]"
                            : picked
                              ? "border-[#d5d8e0] text-[#7d849b] hover:bg-[#f1f2f5]"
                              : "border-[#e6e2fb] text-[#cfcafa]"
                        }`}
                      >
                        빈자리
                      </button>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
        {/* 왼쪽 행 머리(✕) 칸만큼 밀어서 자리 격자 가운데에 맞춘다 */}
        <div className="pl-[34px]">
          <ClassroomFront />
        </div>

        <div className="mt-3 flex flex-wrap gap-2 pl-[34px]">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setDraft(addRow)}
            disabled={draft.rows >= SEAT_GRID_MAX}
          >
            + 행 추가
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setDraft(addCol)}
            disabled={draft.cols >= SEAT_GRID_MAX}
          >
            + 열 추가
          </button>
          <span className="self-center text-[11px] text-[#7d849b]">
            {draft.rows}행 × {draft.cols}열 - 최대 {SEAT_GRID_MAX}칸씩
          </span>
          {/* 자리 판 안쪽 오른쪽 끝 — 마지막 열 카드의 오른쪽 끝선에 맞춰진다 */}
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={pending}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => startTransition(() => save(draft))}
              disabled={!dirty || pending}
            >
              {pending ? "저장 중…" : "자리 저장"}
            </button>
          </div>
        </div>
      </div>

      {state.status === "error" && <p className={errorText}>{state.message}</p>}

      {drag &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#33405f] shadow-[0_8px_24px_rgba(16,42,86,.18)] ring-2 ring-[#9aa0ae]"
            style={{ left: drag.x, top: drag.y }}
          >
            {names.get(drag.studentId)}
          </div>,
          document.body,
        )}
    </div>
  );
}
