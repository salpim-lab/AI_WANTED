// 담당: 김현우
// 참고: docs/planning/PLANNING.md "[교사 화면] 탭 4. 학부모상담기록"
// 게시판형, 수정 불가(무결성), 서버 타임스탬프, 학생 선택 시 누적 데이터를 상담 자료 리포트로 추출
// 목록·검색은 URL searchParams(date, q, student)를 받아 서버에서 조회한다. 쓰기는 ./actions.ts, 리포트는 ./report/[studentId]
// 날짜(기본 오늘)를 고르면 예정된 상담은 예정 일시, 완료한 상담은 상담 일시가 그날인 것만 보여준다.
// 학생·키워드로 검색하면 완료한 상담은 학생관찰일지처럼 날짜 제한 없이 전체 기간에서 찾는다.
// 상담 대상이 "학생 본인"인 학생 상담은 이 화면에 넣지 않는다 (예정·완료 모두) — 대시보드 아침 브리핑에만 보인다.

import ConsultationBoard from "@/components/teacher/consultation/ConsultationBoard";
import { isStudentSelfConsultation, parseConsultationTitle } from "@/components/teacher/consultation/consultationCardParts";
import { todayKst } from "@/components/shared/datetime";
import { dateParam, firstParam } from "@/components/shared/params";
import { listClassStudents, REPORT_DEFAULT_DAYS } from "@/lib/supabase/queries/teacherStudents";
import { getActingTeacher } from "@/lib/supabase/raw/_mockTeacherData";
import { listConsultationLogs, listScheduledConsultationsOn } from "@/lib/supabase/raw/consultationLog";
import SalpimBackdrop from "@/components/shared/SalpimBackdrop";
import type { ConsultationFilter } from "@/lib/types/teacherRecord";

export default async function ConsultationPage({ searchParams }: PageProps<"/consultation">) {
  const params = await searchParams;
  const teacher = await getActingTeacher();
  const students = await listClassStudents(teacher.classId);

  const today = todayKst();
  const date = dateParam(params.date) ?? today;
  const studentId = firstParam(params.student);
  const filter: ConsultationFilter = {
    keyword: firstParam(params.q),
    studentId: students.some((s) => s.studentId === studentId) ? studentId : undefined,
  };
  const searching = Boolean(filter.keyword || filter.studentId);
  const [allEntries, allScheduled] = await Promise.all([
    listConsultationLogs(teacher.classId, searching ? filter : { ...filter, date }),
    listScheduledConsultationsOn(teacher.classId, date),
  ]);
  const scheduled = allScheduled.filter((c) => !isStudentSelfConsultation(c.counterpart));
  const entries = allEntries.filter((e) => !(e.title && isStudentSelfConsultation(parseConsultationTitle(e.title).counterpart)));

  return (
    <SalpimBackdrop>
      <ConsultationBoard
        entries={entries}
        scheduled={scheduled}
        students={students}
        filter={filter}
        date={date}
        today={today}
        reportDays={REPORT_DEFAULT_DAYS}
      />
    </SalpimBackdrop>
  );
}
