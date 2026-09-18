// 담당: 김현우
// 자리 배치 편집용 순수 함수 — 클라이언트 편집기(SeatLayoutEditor)와 Server Action 검증이 함께 쓴다.
// 서버 전용 코드를 import하지 않는다. 모든 함수는 새 SeatLayout을 돌려주고 인자를 바꾸지 않는다.

import type { SeatLayout, SeatPlacement } from "@/lib/types/teacherRecord";

/** 교실 한 면에 놓을 수 있는 최대 행·열 수 */
export const SEAT_GRID_MAX = 10;

export const seatKey = (row: number, col: number) => `${row}-${col}`;

export function seatAt(layout: SeatLayout, row: number, col: number): SeatPlacement | undefined {
  return layout.seats.find((s) => s.row === row && s.col === col);
}

/** 아이를 (row, col)로 옮긴다. 그 자리에 다른 아이가 있으면 서로 자리를 맞바꾼다 */
export function placeStudent(layout: SeatLayout, studentId: string, row: number, col: number): SeatLayout {
  const moving = layout.seats.find((s) => s.studentId === studentId);
  if (!moving || (moving.row === row && moving.col === col)) return layout;
  const occupant = seatAt(layout, row, col);
  return {
    ...layout,
    seats: layout.seats.map((s) => {
      if (s.studentId === studentId) return { ...s, row, col };
      if (s.studentId === occupant?.studentId) return { ...s, row: moving.row, col: moving.col };
      return s;
    }),
  };
}

export function addRow(layout: SeatLayout): SeatLayout {
  return layout.rows >= SEAT_GRID_MAX ? layout : { ...layout, rows: layout.rows + 1 };
}

export function addCol(layout: SeatLayout): SeatLayout {
  return layout.cols >= SEAT_GRID_MAX ? layout : { ...layout, cols: layout.cols + 1 };
}

export const isRowEmpty = (layout: SeatLayout, row: number) => !layout.seats.some((s) => s.row === row);
export const isColEmpty = (layout: SeatLayout, col: number) => !layout.seats.some((s) => s.col === col);

/** 빈 행을 지우고 뒤쪽 행을 한 칸씩 당긴다. 아이가 앉아 있거나 마지막 한 행이면 그대로 둔다 */
export function removeRow(layout: SeatLayout, row: number): SeatLayout {
  if (layout.rows <= 1 || !isRowEmpty(layout, row)) return layout;
  return {
    ...layout,
    rows: layout.rows - 1,
    seats: layout.seats.map((s) => (s.row > row ? { ...s, row: s.row - 1 } : s)),
  };
}

/** 빈 열을 지우고 오른쪽 열을 한 칸씩 당긴다. 아이가 앉아 있거나 마지막 한 열이면 그대로 둔다 */
export function removeCol(layout: SeatLayout, col: number): SeatLayout {
  if (layout.cols <= 1 || !isColEmpty(layout, col)) return layout;
  return {
    ...layout,
    cols: layout.cols - 1,
    seats: layout.seats.map((s) => (s.col > col ? { ...s, col: s.col - 1 } : s)),
  };
}

export function isSameLayout(a: SeatLayout, b: SeatLayout): boolean {
  if (a.rows !== b.rows || a.cols !== b.cols || a.seats.length !== b.seats.length) return false;
  const bySeat = new Map(b.seats.map((s) => [s.studentId, seatKey(s.row, s.col)]));
  return a.seats.every((s) => bySeat.get(s.studentId) === seatKey(s.row, s.col));
}

const isGridSize = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= SEAT_GRID_MAX;

/**
 * 밖에서 들어온 값(Server Action 인자)을 검증한다. 문제가 없으면 null, 있으면 교사에게 보여줄 문구.
 * 학급 학생 전원이 격자 안에 정확히 한 번씩, 한 칸에 한 명만 앉아야 한다.
 */
export function validateSeatLayout(input: unknown, classStudentIds: string[]): string | null {
  if (typeof input !== "object" || input === null) return "자리 배치 형식이 올바르지 않아요.";
  const { rows, cols, seats } = input as Partial<SeatLayout>;
  if (!isGridSize(rows) || !isGridSize(cols)) return `행과 열은 1~${SEAT_GRID_MAX}칸 사이여야 해요.`;
  if (!Array.isArray(seats)) return "자리 배치 형식이 올바르지 않아요.";

  const expected = new Set(classStudentIds);
  const seenStudents = new Set<string>();
  const seenSeats = new Set<string>();
  for (const seat of seats as unknown[]) {
    const { studentId, row, col } = (seat ?? {}) as Partial<SeatPlacement>;
    if (typeof studentId !== "string" || !expected.has(studentId)) return "우리 반 아이만 자리에 앉힐 수 있어요.";
    if (!Number.isInteger(row) || !Number.isInteger(col) || row! < 1 || col! < 1 || row! > rows || col! > cols) {
      return "교실 밖으로 나간 자리가 있어요.";
    }
    if (seenStudents.has(studentId)) return "한 아이가 두 자리에 앉아 있어요.";
    const key = seatKey(row!, col!);
    if (seenSeats.has(key)) return "한 자리에 두 아이가 앉아 있어요.";
    seenStudents.add(studentId);
    seenSeats.add(key);
  }
  if (seenStudents.size !== expected.size) return "자리가 없는 아이가 있어요.";
  return null;
}
