// 담당: 김현우
// 참고: docs/planning/PLANNING.md "[교사 화면] 탭 3. 학생관찰일지"
// 날짜를 안 골랐으면(기본) "전체" — 모든 기간의 관찰·학생상담 기록 피드를 보여주고, 날짜를 고르면 그날 하루의 기록만 보여준다.
// 위쪽 버튼으로 아이를 태그해 새 기록을 쓴다 (글쓰기 폼의 발생 일시 기본값은 고른 날짜, "전체"면 오늘).
// "관찰/상담/전체" 탭으로 거른다(상담 = 아이 본인과의 상담 — 학부모 상담과는 다른
// 화면/기록). 학생(?student=)·키워드(?q=)로 검색하면 날짜 제한 없이 전체 기간에서 찾는다. URL searchParams(date, type, student, q)를 서버에서 읽는다.
// ?consult=<student_id>&at=<ISO> 로 들어오면 학생 상담 기록 팝업이 그 아이·그 시각으로 채워진 채 바로 열린다
// (대시보드 "오늘 예정된 상담"의 학생 상담 줄에서 넘어오는 길이다).
// 쓰기는 ./actions.ts

import { redirect } from "next/navigation";
import ObservationBoard from "@/components/teacher/observation/ObservationBoard";
import type { WritePrefill } from "@/components/teacher/observation/ObservationWriteForm";
import { nowKstLocalInput, todayKst, toKstLocalInput } from "@/components/shared/datetime";
import { dateParam, firstParam, invalidDateRedirect } from "@/components/shared/params";
import { listClassStudents } from "@/lib/supabase/queries/teacherStudents";
import { getActingTeacher, withTeacherMockFixture } from "@/lib/supabase/raw/_mockTeacherData";
import { listObservationLogs } from "@/lib/supabase/raw/observationLog";
import SalpimBackdrop from "@/components/shared/SalpimBackdrop";
import type { RecordTypeFilter } from "@/lib/types/teacherRecord";

function parseType(value: string | undefined): RecordTypeFilter {
  return value === "observation" || value === "consultation" ? value : "all";
}

/** 예정 시각 ISO → 상담 일시 칸에 넣을 값.
    아직 오지 않은 시각이면 지금으로 당긴다 — 폼이 미래 시각을 거절하기 때문이다
    (datetime.parsePastKstLocalDateTime). 오후 3시 상담을 오전에 눌러 두는 경우가 그렇다. */
function occurredAtFrom(iso: string): string | undefined {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return undefined;
  return at.getTime() > Date.now() ? nowKstLocalInput() : toKstLocalInput(at);
}

// 목업 범위(withTeacherMockFixture) 안에서 조회·저장한다 — 에이전트·대시보드는 이 범위 밖이라 영향이 없다
export default async function ObservationPage(...args: Parameters<typeof ObservationPageInMockScope>) {
  return withTeacherMockFixture(() => ObservationPageInMockScope(...args));
}

async function ObservationPageInMockScope({ searchParams }: PageProps<"/observation">) {
  const params = await searchParams;
  const teacher = await getActingTeacher();
  const students = await listClassStudents(teacher.classId);

  const today = todayKst();
  // 주소에 미래·잘못된 날짜를 손으로 넣으면 그 날짜를 뺀 주소로 돌려보낸다 (주소창도 바로잡힌다)
  const fixedUrl = invalidDateRedirect("/observation", params, today);
  if (fixedUrl) redirect(fixedUrl);
  const requestedDate = dateParam(params.date);
  // 달력은 오늘까지만 고를 수 있고, 주소로 넣은 미래 날짜는 위에서 걸러진다
  const date = requestedDate && requestedDate <= today ? requestedDate : null;
  const type = parseType(firstParam(params.type));
  const keyword = firstParam(params.q);
  const requestedStudentId = firstParam(params.student);
  const studentId = students.some((s) => s.studentId === requestedStudentId) ? requestedStudentId : undefined;
  const searching = Boolean(keyword || studentId);

  // 예정된 상담에서 넘어온 경우 — 우리 반 아이이고 시각을 읽을 수 있을 때만 팝업을 연다
  const consultStudentId = firstParam(params.consult);
  const consultAt = firstParam(params.at);
  const occurredAt = consultAt ? occurredAtFrom(consultAt) : undefined;
  const consultPrefill: WritePrefill | undefined =
    consultStudentId && occurredAt && students.some((s) => s.studentId === consultStudentId)
      ? { studentIds: [consultStudentId], occurredAt }
      : undefined;

  // (2026-09-20, 이지현 제안) 공개 데모 방문자 격리 — teacher.id를 viewerTeacherId로 넘겨서
  // 다른 방문자가 새로 쓴 기록은 이 목록에 안 보이게 한다. 자세한 내용은 observationLog.ts 참고.
  const feedObservations = await listObservationLogs(
    teacher.classId,
    searching || !date ? { keyword, studentId } : { from: date, to: date },
    teacher.id,
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
        consultPrefill={consultPrefill}
      />
    </SalpimBackdrop>
  );
}
