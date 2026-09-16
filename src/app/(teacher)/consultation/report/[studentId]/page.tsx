// 담당: 김현우
// 학부모 상담 근거 자료 리포트 — 인쇄용 페이지. 브라우저 "인쇄 → PDF로 저장"으로 파일을 만든다.
// 기간은 ?from=YYYY-MM-DD&to=YYYY-MM-DD로 교사가 직접 고른다 (기본: 오늘까지 최근 REPORT_DEFAULT_DAYS일).
// 민감 데이터 열람이므로 응답 후 view_log에 1행 남긴다.
// 참고: docs/planning/PLANNING.md "탭 4. 학부모상담기록 — 상담 자료 추출 기능"

import { notFound } from "next/navigation";
import { after } from "next/server";
import ConsultationReportView from "@/components/teacher/consultation/ConsultationReportView";
import { addDays, todayKst } from "@/components/shared/datetime";
import { dateParam } from "@/components/shared/params";
import { getConsultationReport, REPORT_DEFAULT_DAYS } from "@/lib/supabase/queries/teacherStudents";
import { getActingTeacher } from "@/lib/supabase/raw/_mockTeacherData";
import { recordView } from "@/lib/supabase/raw/viewLog";

/** 최대로 한 번에 조회할 수 있는 기간(하루씩 순회하는 mock 조회가 너무 오래 걸리지 않게) */
const MAX_RANGE_DAYS = 366;

function parseDateRange(query: { from?: string | string[]; to?: string | string[] }): { from: string; to: string } {
  const today = todayKst();
  const defaultFrom = addDays(today, -(REPORT_DEFAULT_DAYS - 1));

  const toParam = dateParam(query.to);
  let to = toParam && toParam <= today ? toParam : today;
  let from = dateParam(query.from) ?? defaultFrom;
  if (from > to) [from, to] = [to, from];
  if (addDays(from, MAX_RANGE_DAYS) < to) from = addDays(to, -MAX_RANGE_DAYS);

  return { from, to };
}

export default async function ConsultationReportPage({
  params,
  searchParams,
}: PageProps<"/consultation/report/[studentId]">) {
  const [{ studentId }, query] = await Promise.all([params, searchParams]);
  const teacher = await getActingTeacher();
  const { from, to } = parseDateRange(query);

  const report = await getConsultationReport(teacher.classId, studentId, from, to);
  if (!report) notFound();

  after(() =>
    recordView({ viewerId: teacher.id, entityType: "consultation_report", entityId: report.student.studentId }),
  );

  return <ConsultationReportView report={report} />;
}
