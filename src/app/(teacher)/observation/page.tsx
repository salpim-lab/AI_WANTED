// 담당: 김현우
// 참고: docs/planning/PLANNING.md "[교사 화면] 탭 3. 학생관찰일지"
// 하루 단위 작업 화면 — 날짜(기본 오늘)를 고르면 그날의 관찰·학생상담 기록 피드를 보여주고,
// 위쪽 버튼으로 아이를 태그해 새 기록을 쓴다. "관찰/상담/전체" 탭으로 거른다(상담 = 아이 본인과의 상담 — 학부모 상담과는 다른
// 화면/기록). 학생(?student=)·키워드(?q=)로 검색하면 날짜 제한 없이 전체 기간에서 찾는다. URL searchParams(date, type, student, q)를 서버에서 읽는다.
// 쓰기는 ./actions.ts

import ObservationBoard from "@/components/teacher/observation/ObservationBoard";
import { todayKst } from "@/components/shared/datetime";
import { dateParam, firstParam } from "@/components/shared/params";
import { listClassStudents } from "@/lib/supabase/queries/teacherStudents";
import { getActingTeacher } from "@/lib/supabase/raw/_mockTeacherData";
import { listObservationLogs } from "@/lib/supabase/raw/observationLog";
import SalpimBackdrop from "@/components/shared/SalpimBackdrop";
import type { RecordTypeFilter } from "@/lib/types/teacherRecord";

function parseType(value: string | undefined): RecordTypeFilter {
  return value === "observation" || value === "consultation" ? value : "all";
}

export default async function ObservationPage({ searchParams }: PageProps<"/observation">) {
  const params = await searchParams;
  const teacher = await getActingTeacher();
  const students = await listClassStudents(teacher.classId);

  const today = todayKst();
  const requestedDate = dateParam(params.date);
  const date = requestedDate && requestedDate <= today ? requestedDate : today;
  const type = parseType(firstParam(params.type));
  const keyword = firstParam(params.q);
  const requestedStudentId = firstParam(params.student);
  const studentId = students.some((s) => s.studentId === requestedStudentId) ? requestedStudentId : undefined;
  const searching = Boolean(keyword || studentId);

  const feedObservations = await listObservationLogs(
    teacher.classId,
    searching ? { keyword, studentId } : { from: date, to: date },
  );

  return (
    <SalpimBackdrop>
      <ObservationBoard
        students={students}
        date={date}
        today={today}
        type={type}
        keyword={keyword}
        studentId={studentId}
        observations={feedObservations}
      />
    </SalpimBackdrop>
  );
}
