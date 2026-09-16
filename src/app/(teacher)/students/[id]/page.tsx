// 담당: 김현우
// 참고: docs/planning/PLANNING.md "[교사 화면] 탭 2. 아이 상세 페이지"
// 날짜 선택(?date=YYYY-MM-DD, 기본값 당일) + 등/하교 신호등 색 + AI 대화 전문 + AI 분석 + 교사 코멘트 작성
// [id]는 student_id다. enrollment_id 변환은 queries/teacherStudents.ts 안에서만 한다.
// 상세 화면 열람은 응답 후 view_log에 1행 남긴다 (기획안 9장 열람 이력).

import { notFound } from "next/navigation";
import { after } from "next/server";
import StudentDetailPanel from "@/components/teacher/students/StudentDetailPanel";
import { todayKst } from "@/components/shared/datetime";
import { dateParam } from "@/components/shared/params";
import {
  findClassStudent,
  getColorHistory,
  getMockAiPreview,
  getStudentDaySessions,
} from "@/lib/supabase/queries/teacherStudents";
import { getActingTeacher } from "@/lib/supabase/raw/_mockTeacherData";
import { recordView } from "@/lib/supabase/raw/viewLog";

/** 달력에 보여줄 최근 일수 */
const CALENDAR_DAYS = 14;

export default async function StudentDetailPage({ params, searchParams }: PageProps<"/students/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const teacher = await getActingTeacher();

  const student = await findClassStudent(teacher.classId, id);
  if (!student) notFound();

  const today = todayKst();
  const requestedDate = dateParam(query.date);
  const date = requestedDate && requestedDate <= today ? requestedDate : today;

  const [sessions, history, preview] = await Promise.all([
    getStudentDaySessions(teacher.classId, student.studentId, date),
    getColorHistory(teacher.classId, student.studentId, today, CALENDAR_DAYS),
    getMockAiPreview(teacher.classId, student.studentId, date),
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
    />
  );
}
