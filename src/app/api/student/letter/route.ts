// 담당: 김현우 (2026-09-18 추가 — 학생 화면은 이유민 담당. PR에서 이유민 님과 협의)
// 학생 등교 홈의 "선생님 편지" 조회. 교사가 아이 상세에서 보낸 최종본(feedback_drafts.final_text, status='sent') 중
// 마지막 등교 이후에 보낸 1건을 돌려준다 (docs/planning/TEACHER_LETTER_LOGIC.md C안).
//
// 응답: GET → 200 { letter: { text, teacherName } | null }
//   - 어느 학생인지는 서버가 정한다(getActingStudent). 브라우저가 보낸 studentId를 받지 않는다 — 다른 아이 편지를 못 보게.
//   - AI 초안(draft_text)은 절대 내려보내지 않는다. 교사가 검토해 보낸 글만.
// 조회·판정은 lib/supabase/interpretation/teacherComment.ts.

import { NextResponse } from "next/server";
import { getLetterForStudent } from "@/lib/supabase/interpretation/teacherComment";
import { getActingStudent } from "@/lib/supabase/raw/_mockTeacherData";

export const runtime = "nodejs";

export async function GET() {
  try {
    const student = await getActingStudent();
    const letter = await getLetterForStudent(student.studentId);
    return NextResponse.json({ letter }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[student/letter]", error);
    return NextResponse.json({ message: "편지를 불러오지 못했습니다." }, { status: 500 });
  }
}
