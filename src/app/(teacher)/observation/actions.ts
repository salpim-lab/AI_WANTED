"use server";

// 담당: 김현우 (단독 소유)
// 학생관찰일지 쓰기 경로 — Server Action. 브라우저에서 DB로 직접 insert하지 않는다 (DB 스키마 v0.3 §1).
// Server Action은 화면 밖에서 POST로 직접 호출될 수도 있으므로, 교사 확인·학급 소속·입력값 검증을 매번 여기서 한다.
// 추가 전용 — 수정·삭제 액션은 만들지 않는다.

import { revalidatePath } from "next/cache";
import { parsePastKstLocalDateTime } from "@/components/shared/datetime";
import { getMockAiPreview, getStudentDaySessions, listClassStudents } from "@/lib/supabase/queries/teacherStudents";
import { getActingTeacher } from "@/lib/supabase/raw/_mockTeacherData";
import { insertObservationLog } from "@/lib/supabase/raw/observationLog";
import type { ActionResult } from "@/lib/types/teacherRecord";
import type { SignalColor } from "@/lib/types/signal";

const MAX_TITLE_LENGTH = 100;
const MAX_BODY_LENGTH = 5000;
const RECORD_TYPES = new Set(["general", "student_consultation"]);

function fail(message: string): ActionResult {
  return { status: "error", message };
}

export async function createObservation(formData: FormData): Promise<ActionResult> {
  const teacher = await getActingTeacher();

  const recordTypeRaw = String(formData.get("recordType") ?? "general");
  const recordType = (RECORD_TYPES.has(recordTypeRaw) ? recordTypeRaw : "general") as "general" | "student_consultation";
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const occurredAt = parsePastKstLocalDateTime(String(formData.get("occurredAt") ?? ""));
  const studentIds = [...new Set(formData.getAll("studentIds").map(String))];

  if (!body) return fail("내용을 입력해 주세요.");
  if (body.length > MAX_BODY_LENGTH) return fail(`내용은 ${MAX_BODY_LENGTH}자 이내로 적어 주세요.`);
  if (title.length > MAX_TITLE_LENGTH) return fail(`제목은 ${MAX_TITLE_LENGTH}자 이내로 적어 주세요.`);
  if (occurredAt === "invalid") return fail("발생 일시를 확인해 주세요. 미래 시각은 입력할 수 없어요.");
  if (recordType === "student_consultation" && studentIds.length === 0) {
    return fail("상담한 아이를 선택해 주세요.");
  }

  const classStudentIds = new Set((await listClassStudents(teacher.classId)).map((s) => s.studentId));
  if (studentIds.some((id) => !classStudentIds.has(id))) return fail("우리 반 아이만 태그할 수 있어요.");

  try {
    await insertObservationLog({
      classId: teacher.classId,
      createdBy: teacher.id,
      recordType,
      title: title || null,
      body,
      occurredAt,
      taggedStudentIds: studentIds,
    });
  } catch (error) {
    console.error("[createObservation] insert failed", error);
    return fail("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  revalidatePath("/observation");
  return {
    status: "success",
    message: recordType === "student_consultation" ? "학생 상담 기록을 저장했어요." : "관찰 기록을 저장했어요.",
  };
}

export type StudentDayContext = {
  morning: SignalColor | null;
  afternoon: SignalColor | null;
  /** AI가 요약한 그날 대화 참고용 한 줄 — 진단·판정이 아니라 기록 전 기억을 돕는 참고 자료 */
  aiSummary: string | null;
};

/**
 * 관찰 기록을 적기 전에 "그 아이가 그날 어땠는지" 잠깐 보여주기 위한 요약.
 * 아이 상세 탭과 같은 데이터(체크인 세션, AI 분석 미리보기)를 재사용한다 — 새 저장소를 만들지 않는다.
 */
export async function getStudentDayContext(studentId: string, date: string): Promise<StudentDayContext> {
  const teacher = await getActingTeacher();
  const sessions = await getStudentDaySessions(teacher.classId, studentId, date);
  const latest = (period: "morning" | "afternoon"): SignalColor | null =>
    [...sessions].filter((s) => s.period === period).sort((a, b) => b.attempt - a.attempt)[0]?.color ?? null;
  const { analysis } = await getMockAiPreview(teacher.classId, studentId, date);
  return { morning: latest("morning"), afternoon: latest("afternoon"), aiSummary: analysis };
}
