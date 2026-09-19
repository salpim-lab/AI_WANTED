// 담당: 김현우
// 학부모 상담 근거 자료 리포트 — 인쇄용 페이지. 브라우저 "인쇄 → PDF로 저장"으로 파일을 만든다.
// 기간은 ?from=YYYY-MM-DD&to=YYYY-MM-DD로 교사가 직접 고른다 (기본: 오늘까지 최근 REPORT_DEFAULT_DAYS일).
// 민감 데이터 열람이므로 응답 후 view_log에 1행 남긴다.
// 참고: docs/planning/PLANNING.md "탭 4. 학부모상담기록 — 상담 자료 추출 기능"

import { notFound } from "next/navigation";
import { after } from "next/server";
import ConsultationReportView from "@/components/teacher/consultation/ConsultationReportView";
import { dateParam } from "@/components/shared/params";
import { getConsultationReport } from "@/lib/supabase/queries/teacherStudents";
import { getActingTeacher, withTeacherMockFixture } from "@/lib/supabase/raw/_mockTeacherData";
import { recordView } from "@/lib/supabase/raw/viewLog";
import { resolveReportRange } from "../../_lib/reportRange";

// 목업 범위(withTeacherMockFixture) 안에서 조회·저장한다 — 에이전트·대시보드는 이 범위 밖이라 영향이 없다
export default async function ConsultationReportPage(...args: Parameters<typeof ConsultationReportPageInMockScope>) {
  return withTeacherMockFixture(() => ConsultationReportPageInMockScope(...args));
}

async function ConsultationReportPageInMockScope({
  params,
  searchParams,
}: PageProps<"/consultation/report/[studentId]">) {
  const [{ studentId }, query] = await Promise.all([params, searchParams]);
  const teacher = await getActingTeacher();
  const { from, to } = resolveReportRange(dateParam(query.from), dateParam(query.to));

  // (2026-09-20, 이지현 제안) 공개 데모 방문자 격리 — teacher.id를 viewerTeacherId로.
  const report = await getConsultationReport(teacher.classId, studentId, from, to, teacher.id);
  if (!report) notFound();

  after(() =>
    recordView({ viewerId: teacher.id, entityType: "consultation_report", entityId: report.student.studentId }),
  );

  return <ConsultationReportView report={report} />;
}
