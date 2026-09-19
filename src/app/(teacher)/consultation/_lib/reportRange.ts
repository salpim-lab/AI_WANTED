// 담당: 김현우
// 상담 자료 리포트 기간 — 인쇄용 페이지(report/[studentId])와 누적 자료 팝업(getConsultationReportAction)이 같이 쓴다.
// 기본: 오늘까지 최근 REPORT_DEFAULT_DAYS일. 끝 날짜는 오늘을 넘지 않고, 앞뒤가 바뀌면 바로잡는다.

import { addDays, isDateString, todayKst } from "@/components/shared/datetime";
import { REPORT_DEFAULT_DAYS } from "@/lib/supabase/queries/teacherStudents";

/** 최대로 한 번에 조회할 수 있는 기간(하루씩 순회하는 mock 조회가 너무 오래 걸리지 않게) */
const MAX_RANGE_DAYS = 366;

export function resolveReportRange(fromInput?: string, toInput?: string): { from: string; to: string } {
  const today = todayKst();
  const defaultFrom = addDays(today, -(REPORT_DEFAULT_DAYS - 1));

  const toParam = toInput && isDateString(toInput) ? toInput : undefined;
  let to = toParam && toParam <= today ? toParam : today;
  let from = fromInput && isDateString(fromInput) ? fromInput : defaultFrom;
  if (from > to) [from, to] = [to, from];
  if (addDays(from, MAX_RANGE_DAYS) < to) from = addDays(to, -MAX_RANGE_DAYS);

  return { from, to };
}
