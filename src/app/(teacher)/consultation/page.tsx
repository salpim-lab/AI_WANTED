// 담당: 김현우
// 참고: docs/planning/PLANNING.md "[교사 화면] 탭 4. 학부모상담기록"
// 게시판형, 수정 불가(무결성), 서버 타임스탬프, 학생 선택 시 누적 데이터를 상담 자료 리포트로 추출
// 목록·검색은 URL searchParams(date, q, student)를 받아 서버에서 조회한다. 쓰기는 ./actions.ts, 리포트는 ./report/[studentId]
// 날짜를 안 골랐으면(기본) "전체" — 예정·완료 상담을 기간 제한 없이 다 보여준다. 날짜(미래는 못 고름)를 고르면 예정된 상담은
// 그날부터 앞으로 잡힌 것 전부, 완료한 상담은 상담 일시가 그날인 것만 보여준다.
// 학생·키워드로 검색하면 완료한 상담은 학생관찰일지처럼 날짜 제한 없이 전체 기간에서 찾는다.
// 상담 대상이 "학생 본인"인 학생 상담은 이 화면에 넣지 않는다 (예정·완료 모두) — 대시보드 아침 브리핑에만 보인다.

import { redirect } from "next/navigation";
import ConsultationBoard from "@/components/teacher/consultation/ConsultationBoard";
import { isStudentSelfConsultation, parseConsultationTitle } from "@/components/teacher/consultation/consultationCardParts";
import { toKstDate, todayKst } from "@/components/shared/datetime";
import { dateParam, firstParam, invalidDateRedirect } from "@/components/shared/params";
import { listClassStudents, REPORT_DEFAULT_DAYS } from "@/lib/supabase/queries/teacherStudents";
import { getActingTeacher, withTeacherMockFixture } from "@/lib/supabase/raw/_mockTeacherData";
import { listConsultationLogs, listScheduledConsultations } from "@/lib/supabase/raw/consultationLog";
import SalpimBackdrop from "@/components/shared/SalpimBackdrop";
import type { ConsultationFilter } from "@/lib/types/teacherRecord";

// 목업 범위(withTeacherMockFixture) 안에서 조회·저장한다 — 에이전트·대시보드는 이 범위 밖이라 영향이 없다
export default async function ConsultationPage(...args: Parameters<typeof ConsultationPageInMockScope>) {
  return withTeacherMockFixture(() => ConsultationPageInMockScope(...args));
}

async function ConsultationPageInMockScope({ searchParams }: PageProps<"/consultation">) {
  const params = await searchParams;
  const teacher = await getActingTeacher();
  const students = await listClassStudents(teacher.classId);

  const today = todayKst();
  // 주소에 미래·잘못된 날짜를 손으로 넣으면 그 날짜를 뺀 주소로 돌려보낸다 (주소창도 바로잡힌다)
  const fixedUrl = invalidDateRedirect("/consultation", params, today);
  if (fixedUrl) redirect(fixedUrl);
  const requestedDate = dateParam(params.date);
  // 달력은 오늘까지만 고를 수 있고, 주소로 넣은 미래 날짜는 위에서 걸러진다
  const date = requestedDate && requestedDate <= today ? requestedDate : null;
  const studentId = firstParam(params.student);
  const filter: ConsultationFilter = {
    keyword: firstParam(params.q),
    studentId: students.some((s) => s.studentId === studentId) ? studentId : undefined,
  };
  // (2026-09-20, 이지현 제안) 공개 데모 방문자 격리 — teacher.id를 viewerTeacherId로.
  const [allEntries, allScheduled] = await Promise.all([
    listConsultationLogs(teacher.classId, date ? { ...filter, date } : filter, teacher.id),
    listScheduledConsultations(teacher.classId),
  ]);
  // 달력이 오늘까지라 미래 상담은 날짜로 못 찾는다 — 고른 날짜부터 앞으로 잡힌 예정 상담을 모두 보여준다
  const scheduled = allScheduled.filter(
    (c) => (!date || toKstDate(c.scheduledAt) >= date) && !isStudentSelfConsultation(c.counterpart),
  );
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
