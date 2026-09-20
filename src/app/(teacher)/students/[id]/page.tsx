// 담당: 김현우
// 참고: docs/planning/PLANNING.md "[교사 화면] 탭 2. 아이 상세 페이지"
// 날짜 선택(?date=YYYY-MM-DD, 기본값 당일) + 등/하교 신호등 색 + AI 대화 전문 + AI 분석 + 교사 코멘트 작성
// [id]는 student_id다. enrollment_id 변환은 queries/teacherStudents.ts 안에서만 한다.
// 상세 화면 열람은 응답 후 view_log에 1행 남긴다 (기획안 9장 열람 이력).

import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import StudentDetailPanel from "@/components/teacher/students/StudentDetailPanel";
import { todayKst } from "@/components/shared/datetime";
import { dateParam } from "@/components/shared/params";
import {
  findClassStudent,
  getColorHistory,
  getMockAiPreview,
  getPrecomputedDayAi,
  getStoredDayAnalyses,
  getStudentDaySessions,
} from "@/lib/supabase/queries/teacherStudents";
import { getActingTeacher, withTeacherMockFixture } from "@/lib/supabase/raw/_mockTeacherData";
import { recordView } from "@/lib/supabase/raw/viewLog";

/** 달력에 보여줄 최근 일수 */
const CALENDAR_DAYS = 14;

// 목업 범위(withTeacherMockFixture) 안에서 조회·저장한다 — 에이전트·대시보드는 이 범위 밖이라 영향이 없다
export default async function StudentDetailPage(...args: Parameters<typeof StudentDetailPageInMockScope>) {
  return withTeacherMockFixture(() => StudentDetailPageInMockScope(...args));
}

async function StudentDetailPageInMockScope({ params, searchParams }: PageProps<"/students/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const teacher = await getActingTeacher();

  const student = await findClassStudent(teacher.classId, id);
  if (!student) notFound();

  const today = todayKst();
  const requestedDate = dateParam(query.date);
  const date = requestedDate && requestedDate <= today ? requestedDate : today;

  // 대시보드 링크는 DB student_id로 온다 — 자리 배치도의 선택 표시가 URL의 id로 아이를 찾으니 명단 id 주소로 옮긴다
  if (student.studentId !== id) {
    redirect(`/students/${student.studentId}${requestedDate ? `?date=${requestedDate}` : ""}`);
  }

  // stored: 이미 DB에 저장된 그날 AI 요약 — 챗봇·상담 리포트와 같은 조회 함수(sessionSummaries)로 읽는다. 있으면 화면이 분석 API를 다시 부르지 않는다.
  const [sessions, history, preview, precomputed, stored] = await Promise.all([
    getStudentDaySessions(teacher.classId, student.studentId, date),
    getColorHistory(teacher.classId, student.studentId, today, CALENDAR_DAYS),
    getMockAiPreview(teacher.classId, student.studentId, date),
    getPrecomputedDayAi(teacher.classId, student.studentId, date),
    getStoredDayAnalyses(teacher.classId, student.studentId, date),
  ]);

  after(() => recordView({ viewerId: teacher.id, entityType: "student_detail", entityId: student.studentId }));

  return (
    <StudentDetailPanel
      student={student}
      date={date}
      today={today}
      sessions={sessions}
      history={history}
      preview={preview}
      precomputed={precomputed}
      stored={stored}
    />
  );
}
