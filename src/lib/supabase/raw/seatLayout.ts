// 담당: 김현우 (자리 바꾸기용으로 추가. 자리 값 자체는 공통 기반 enrollments.seat_row/seat_col)
// 아이 상세 탭 자리 배치도의 조회·저장. 기록(원본)이 아니라 교실 배치 설정이라, 봉인 대상이 아니고 덮어쓴다.
// 서버 전용 — 저장은 students/actions.ts(Server Action)에서만 부른다. 검증(학급 전원·격자 범위·중복)은 액션이 먼저 한다.
//
// 지금은 mock 저장소(_mockTeacherData.ts) 구현이다. Supabase 연결 시 (팀 합의 필요):
//   - 자리: enrollments(class_id, seat_row, seat_col) 유니크 인덱스 때문에 맞바꾸기가 한 번에 안 된다 →
//     한 트랜잭션(RPC)에서 처리해야 한다. enrollments는 공통 기반 테이블이라 쓰기 권한을 먼저 맞춘다.
//   - 격자 크기(행·열 수): 스키마에 저장할 컬럼이 없다 (classes에 추가하는 안 등 협의).

import type { SeatLayout } from "@/lib/types/teacherRecord";
import { MOCK_STUDENTS, mockSeatLayouts } from "./_mockTeacherData";

function activeRows(classId: string) {
  return MOCK_STUDENTS.filter((s) => s.class_id === classId && s.status === "active");
}

/** 학급의 현재 자리 배치. 격자는 저장된 크기와 실제로 앉은 자리 중 큰 쪽으로 잡는다 */
export async function getSeatLayout(classId: string): Promise<SeatLayout> {
  const saved = mockSeatLayouts()[classId];
  const seats = activeRows(classId).map((row) => {
    const seat = saved?.seats[row.enrollment_id];
    return { studentId: row.student_id, row: seat?.seat_row ?? row.seat_row, col: seat?.seat_col ?? row.seat_col };
  });
  return {
    rows: Math.max(saved?.rows ?? 1, ...seats.map((s) => s.row)),
    cols: Math.max(saved?.cols ?? 1, ...seats.map((s) => s.col)),
    seats,
  };
}

/** 자리 배치 한 벌을 통째로 저장한다. layout은 액션에서 검증을 마친 값이어야 한다 */
export async function saveSeatLayout(classId: string, layout: SeatLayout): Promise<void> {
  const enrollmentOf = new Map(activeRows(classId).map((row) => [row.student_id, row.enrollment_id]));
  const seats: Record<string, { seat_row: number; seat_col: number }> = {};
  for (const seat of layout.seats) {
    const enrollmentId = enrollmentOf.get(seat.studentId);
    if (!enrollmentId) throw new Error(`학급에 없는 학생: ${seat.studentId}`);
    seats[enrollmentId] = { seat_row: seat.row, seat_col: seat.col };
  }
  mockSeatLayouts()[classId] = { rows: layout.rows, cols: layout.cols, seats };
}
