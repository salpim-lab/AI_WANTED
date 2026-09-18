// 담당: 김현우 (2026-09-18 구현 — 원래 이유민 배정. 담당 이관은 PR에서 이유민 님과 협의)
// 역할: 아이 상세 "선생님의 한마디" AI 초안 — 그날 등하교 색·대화·발화 기반
// 참고: docs/planning/PLANNING.md "탭 2. 아이 상세 — 하단: 교사 코멘트 작성"
//       docs/planning/살핌_DB_스키마_v0.3.md §8.1 feedback_drafts
//
// 요청: POST { studentId, date }  →  200 { draft: string | null }
//   - 501: OPENAI_API_KEY 미설정 또는 테스트 대상 아님 → 화면이 mock 예시 초안을 쓴다
//   - 404: 담당 학급 밖 학생
// 초안 생성·저장은 lib/supabase/interpretation/teacherComment.ts.
// 교사 최종본(final_text) 저장 라우트는 아직 없다 — 초안은 제안일 뿐, 자동 발송·자동 저장 없음.

import { NextResponse } from "next/server";
import { isDateString, todayKst } from "@/components/shared/datetime";
import { DailyAnalysisUnavailableError } from "@/lib/supabase/interpretation/dailyAnalysis";
import { getOrCreateCommentDraft } from "@/lib/supabase/interpretation/teacherComment";
import { getActingTeacher } from "@/lib/supabase/raw/_mockTeacherData";
import { getDailyAnalysisInput } from "@/lib/supabase/queries/teacherStudents";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (message: string, status: number) => NextResponse.json({ message }, { status, headers: NO_STORE });

export async function POST(request: Request) {
  let body: { studentId?: unknown; date?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("유효한 JSON을 보내주세요.", 400);
  }

  const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  const date = typeof body.date === "string" ? body.date.trim() : "";
  if (!studentId) return fail("studentId가 필요합니다.", 400);
  if (!isDateString(date) || date > todayKst()) return fail("date는 오늘 이전의 YYYY-MM-DD여야 합니다.", 400);

  // 인증 대용 — 교사의 담당 학급 안에서만 조회한다
  const teacher = await getActingTeacher();
  const input = await getDailyAnalysisInput(teacher.classId, studentId, date);
  if (!input) return fail("학생을 찾을 수 없습니다.", 404);

  // 테스트 중 토큰 절약 — AI 하루 분석과 같은 목록을 쓴다
  const onlyIds = process.env.DAILY_ANALYSIS_ONLY_STUDENT_IDS?.split(",").map((id) => id.trim()).filter(Boolean);
  if (onlyIds?.length && !onlyIds.includes(input.student.studentId)) {
    return fail("테스트 대상 학생이 아닙니다 (DAILY_ANALYSIS_ONLY_STUDENT_IDS).", 501);
  }

  try {
    const draft = await getOrCreateCommentDraft(input);
    return NextResponse.json({ draft }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof DailyAnalysisUnavailableError) return fail(error.message, 501);
    console.error("[comment-draft]", error);
    return fail("초안을 만들지 못했습니다.", 502);
  }
}
