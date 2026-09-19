"use server";

// 담당: 김현우 (단독 소유)
// 아이 상세 탭 쓰기 경로 — 자리 배치 저장, 선생님의 한마디 보내기 Server Action. 브라우저에서 DB로 직접 쓰지 않는다.
// Server Action은 화면 밖에서 POST로 직접 호출될 수도 있으므로, 교사 확인·학급 소속·배치 검증을 매번 여기서 한다.

import { revalidatePath } from "next/cache";
import { isDateString, todayKst } from "@/components/shared/datetime";
import { validateSeatLayout } from "@/components/teacher/students/seatGrid";
import { sendFinalComment } from "@/lib/supabase/interpretation/teacherComment";
import { getStudentDaySessions, listClassStudents } from "@/lib/supabase/queries/teacherStudents";
import { getActingTeacher, withTeacherMockFixture } from "@/lib/supabase/raw/_mockTeacherData";
import { saveSeatLayout } from "@/lib/supabase/raw/seatLayout";
import type { ActionResult, SeatLayout } from "@/lib/types/teacherRecord";

// 목업 범위(withTeacherMockFixture) 안에서 조회·저장한다 — 에이전트·대시보드는 이 범위 밖이라 영향이 없다
export async function saveSeatLayoutAction(...args: Parameters<typeof saveSeatLayoutActionInMockScope>) {
  return withTeacherMockFixture(() => saveSeatLayoutActionInMockScope(...args));
}

async function saveSeatLayoutActionInMockScope(layout: SeatLayout): Promise<ActionResult> {
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

/** 선생님의 한마디 최대 길이 — CommentComposer 입력 제한과 같다 */
const MAX_COMMENT_LENGTH = 500;

/**
 * 선생님의 한마디를 보낸다 — 아이는 다음 날 등교 홈 "선생님 편지"로 본다.
 * 교사가 저장을 눌러야만 호출된다 (기획안 10장 AI 대필 금지: 자동 발송 없음).
 */
// 목업 범위(withTeacherMockFixture) 안에서 조회·저장한다 — 에이전트·대시보드는 이 범위 밖이라 영향이 없다
export async function sendTeacherCommentAction(...args: Parameters<typeof sendTeacherCommentActionInMockScope>) {
  return withTeacherMockFixture(() => sendTeacherCommentActionInMockScope(...args));
}

async function sendTeacherCommentActionInMockScope(input: {
  studentId: string;
  date: string;
  text: string;
}): Promise<ActionResult> {
  const teacher = await getActingTeacher();
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text) return { status: "error", message: "보낼 말을 적어주세요." };
  if (text.length > MAX_COMMENT_LENGTH) return { status: "error", message: `${MAX_COMMENT_LENGTH}자 이내로 적어주세요.` };
  if (typeof input.date !== "string" || !isDateString(input.date) || input.date > todayKst()) {
    return { status: "error", message: "날짜가 올바르지 않아요." };
  }

  // 담당 학급 학생인지 확인 — 명단에 없으면 보내지 않는다
  const classStudentIds = (await listClassStudents(teacher.classId)).map((s) => s.studentId);
  if (!classStudentIds.includes(input.studentId)) return { status: "error", message: "학생을 찾을 수 없어요." };

  try {
    const sessions = await getStudentDaySessions(teacher.classId, input.studentId, input.date);
    await sendFinalComment({ studentId: input.studentId, sessionIds: sessions.map((s) => s.sessionId), text });
  } catch (error) {
    console.error("[sendTeacherCommentAction] send failed", error);
    return { status: "error", message: "보내지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  return { status: "success", message: "내일 등교 때 전달돼요." };
}
