"use server";

// 담당: 김현우 (단독 소유)
// 아이 상세 탭 쓰기 경로 — 자리 배치 저장 Server Action. 브라우저에서 DB로 직접 쓰지 않는다.
// Server Action은 화면 밖에서 POST로 직접 호출될 수도 있으므로, 교사 확인·학급 소속·배치 검증을 매번 여기서 한다.

import { revalidatePath } from "next/cache";
import { validateSeatLayout } from "@/components/teacher/students/seatGrid";
import { listClassStudents } from "@/lib/supabase/queries/teacherStudents";
import { getActingTeacher } from "@/lib/supabase/raw/_mockTeacherData";
import { saveSeatLayout } from "@/lib/supabase/raw/seatLayout";
import type { ActionResult, SeatLayout } from "@/lib/types/teacherRecord";

export async function saveSeatLayoutAction(layout: SeatLayout): Promise<ActionResult> {
  const teacher = await getActingTeacher();
  const classStudentIds = (await listClassStudents(teacher.classId)).map((s) => s.studentId);

  const problem = validateSeatLayout(layout, classStudentIds);
  if (problem) return { status: "error", message: problem };

  try {
    // 검증을 통과한 필드만 골라 저장한다 (인자에 딸려 온 다른 값은 버린다)
    await saveSeatLayout(teacher.classId, {
      rows: layout.rows,
      cols: layout.cols,
      seats: layout.seats.map(({ studentId, row, col }) => ({ studentId, row, col })),
    });
  } catch (error) {
    console.error("[saveSeatLayoutAction] save failed", error);
    return { status: "error", message: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/students", "layout");
  return { status: "success", message: "자리 배치를 저장했어요." };
}
