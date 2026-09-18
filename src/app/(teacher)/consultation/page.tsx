// 담당: 김현우
// 참고: docs/planning/PLANNING.md "[교사 화면] 탭 4. 학부모상담기록"
// 게시판형, 수정 불가(무결성), 서버 타임스탬프, 학생 선택 시 누적 데이터를 상담 자료 리포트로 추출
// 목록·검색은 URL searchParams(q, student)를 받아 서버에서 조회한다. 쓰기는 ./actions.ts, 리포트는 ./report/[studentId]

import ConsultationBoard from "@/components/teacher/consultation/ConsultationBoard";
import { firstParam } from "@/components/shared/params";
import { listClassStudents, REPORT_DEFAULT_DAYS } from "@/lib/supabase/queries/teacherStudents";
import { getActingTeacher } from "@/lib/supabase/raw/_mockTeacherData";
import { listConsultationLogs, listScheduledConsultations } from "@/lib/supabase/raw/consultationLog";
import SalpimBackdrop from "@/components/shared/SalpimBackdrop";
import type { ConsultationFilter } from "@/lib/types/teacherRecord";

export default async function ConsultationPage({ searchParams }: PageProps<"/consultation">) {
  const params = await searchParams;
  const teacher = await getActingTeacher();
  const students = await listClassStudents(teacher.classId);

  const studentId = firstParam(params.student);
  const filter: ConsultationFilter = {
    keyword: firstParam(params.q),
    studentId: students.some((s) => s.studentId === studentId) ? studentId : undefined,
  };
  const [entries, scheduled] = await Promise.all([
    listConsultationLogs(teacher.classId, filter),
    listScheduledConsultations(teacher.classId),
  ]);

  return (
    <SalpimBackdrop>
      <ConsultationBoard
        entries={entries}
        scheduled={scheduled}
        students={students}
        filter={filter}
        reportDays={REPORT_DEFAULT_DAYS}
      />
    </SalpimBackdrop>
  );
}
