// 담당: 김현우 (2026-09-18 구현 — 원래 이지현 배정. 담당 이관은 PR에서 이지현 님과 협의)
// 역할: 아이 상세 페이지의 "AI 분석" — 마음 색 흐름 + 발화 측정값 + 대화 전문을 엮어 그날 상태를 추정하는 요약
// 참고: docs/planning/PLANNING.md "탭 2. 아이 상세 페이지 — 본문"
//       docs/planning/살핌_DB_스키마_v0.3.md §5.1 analysis_runs
//
// 요청: POST { studentId, date }  →  200 { morning: string | null, full: string | null, analysis: string | null }
//   morning: 등교 데이터만으로 추정한 요약 / full: 등교+하교 요약(하교 전이면 null) / analysis: full ?? morning
//   - 501: OPENAI_API_KEY 미설정 → 화면(AiAnalysisBox)이 "API 연결 전 · 예시"를 보여준다
//   - 404: 담당 학급 밖 학생
// 생성·저장·이름 치환은 lib/supabase/interpretation/dailyAnalysis.ts.

import { NextResponse } from "next/server";
import { isDateString, todayKst } from "@/components/shared/datetime";
import { DailyAnalysisUnavailableError, getOrCreateDayAnalyses } from "@/lib/supabase/interpretation/dailyAnalysis";
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

  // 인증 대용 — 교사의 담당 학급 안에서만 조회한다 (service_role은 RLS를 우회하므로 서버 코드에서 건다)
  const teacher = await getActingTeacher();
  const input = await getDailyAnalysisInput(teacher.classId, studentId, date);
  if (!input) return fail("학생을 찾을 수 없습니다.", 404);

  // 테스트 중 토큰 절약 — 설정돼 있으면 목록 속 아이만 OpenAI를 부르고, 나머지는 501(화면은 예시 문장)
  const onlyIds = process.env.DAILY_ANALYSIS_ONLY_STUDENT_IDS?.split(",").map((id) => id.trim()).filter(Boolean);
  if (onlyIds?.length && !onlyIds.includes(input.student.studentId)) {
    return fail("테스트 대상 학생이 아닙니다 (DAILY_ANALYSIS_ONLY_STUDENT_IDS).", 501);
  }

  try {
    const { morning, full } = await getOrCreateDayAnalyses(input);
    return NextResponse.json(
      {
        morning: morning?.summary ?? null,
        full: full?.summary ?? null,
        // 이전 형식 호환 — 가장 최신 기준의 요약 하나
        analysis: full?.summary ?? morning?.summary ?? null,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof DailyAnalysisUnavailableError) return fail(error.message, 501);
    console.error("[daily-analysis]", error);
    return fail("AI 분석을 만들지 못했습니다.", 502);
  }
}
