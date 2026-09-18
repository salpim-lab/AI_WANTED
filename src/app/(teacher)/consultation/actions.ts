"use server";

// 담당: 김현우 (단독 소유)
// 학부모상담기록 쓰기 경로 — Server Action. 브라우저에서 DB로 직접 insert하지 않는다 (DB 스키마 v0.3 §1).
// Server Action은 화면 밖에서 POST로 직접 호출될 수도 있으므로, 교사 확인·학급 소속·입력값 검증을 매번 여기서 한다.
// 근거 자료 ID(evidence_refs)는 클라이언트가 보낸 값을 믿지 않고 서버에서 리포트를 다시 만들어 채운다.
// createConsultation/completeConsultationAction 모두 work_records는 insert만 하고 절대 수정하지 않는다.
// completeConsultationAction·rescheduleConsultationAction만 parent_consultations(일정 메타)를 갱신한다 — 이유는
// raw/consultationLog.ts 상단 주석 참고. work_records용 수정·삭제 액션은 앞으로도 만들지 않는다.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  addDays,
  isDateString,
  parseKstLocalDateTime,
  parsePastKstLocalDateTime,
  toKstDate,
} from "@/components/shared/datetime";
import {
  findClassStudent,
  getConsultationReport,
  listClassStudents,
  REPORT_DEFAULT_DAYS,
} from "@/lib/supabase/queries/teacherStudents";
import { getOrCreatePeriodSummary, PeriodSummaryUnavailableError } from "./_lib/periodSummary";
import { resolveReportRange } from "./_lib/reportRange";
import { getActingTeacher } from "@/lib/supabase/raw/_mockTeacherData";
import {
  completeScheduledConsultation,
  insertConsultationLog,
  rescheduleConsultation,
  scheduleConsultation,
} from "@/lib/supabase/raw/consultationLog";
import { recordView } from "@/lib/supabase/raw/viewLog";
import type { ActionResult, ConsultationReport } from "@/lib/types/teacherRecord";

const METHOD_LABEL = { phone: "전화", visit: "방문", online: "온라인" } as const;
const MAX_COUNTERPART_LENGTH = 30;
const MAX_BODY_LENGTH = 5000;

function fail(message: string): ActionResult {
  return { status: "error", message };
}

function isMethod(value: string): value is keyof typeof METHOD_LABEL {
  return Object.hasOwn(METHOD_LABEL, value);
}

export async function createConsultation(formData: FormData): Promise<ActionResult> {
  const teacher = await getActingTeacher();

  const studentId = String(formData.get("studentId") ?? "");
  const counterpart = String(formData.get("counterpart") ?? "").trim();
  const method = String(formData.get("method") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const occurredAt = parsePastKstLocalDateTime(String(formData.get("occurredAt") ?? ""));

  if (!studentId) return fail("상담한 학생을 선택해 주세요.");
  const student = await findClassStudent(teacher.classId, studentId);
  if (!student) return fail("우리 반 학생만 선택할 수 있어요.");
  if (!counterpart) return fail("상담 대상(예: 어머니)을 적어 주세요.");
  if (counterpart.length > MAX_COUNTERPART_LENGTH) return fail(`상담 대상은 ${MAX_COUNTERPART_LENGTH}자 이내로 적어 주세요.`);
  if (!isMethod(method)) return fail("상담 방식을 선택해 주세요.");
  if (!body) return fail("상담 내용을 입력해 주세요.");
  if (body.length > MAX_BODY_LENGTH) return fail(`상담 내용은 ${MAX_BODY_LENGTH}자 이내로 적어 주세요.`);
  if (occurredAt === "invalid") return fail("상담 일시를 확인해 주세요. 미래 시각은 입력할 수 없어요.");

  // 상담 시점까지 쌓인 최근 REPORT_DEFAULT_DAYS일치 기록을 근거로 연결한다
  const reportEndDate = toKstDate(occurredAt ?? new Date());
  const reportStartDate = addDays(reportEndDate, -(REPORT_DEFAULT_DAYS - 1));
  const report = await getConsultationReport(teacher.classId, student.studentId, reportStartDate, reportEndDate);

  try {
    await insertConsultationLog({
      classId: teacher.classId,
      createdBy: teacher.id,
      studentId: student.studentId,
      title: `${counterpart} - ${METHOD_LABEL[method]} 상담`,
      body,
      occurredAt,
      evidenceRefs: report?.evidenceRefs ?? [],
    });
  } catch (error) {
    console.error("[createConsultation] insert failed", error);
    return fail("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  revalidatePath("/consultation");
  return { status: "success", message: "상담 기록을 저장했어요." };
}

export async function scheduleConsultationAction(formData: FormData): Promise<ActionResult> {
  const teacher = await getActingTeacher();

  const studentId = String(formData.get("studentId") ?? "");
  const counterpart = String(formData.get("counterpart") ?? "").trim();
  const method = String(formData.get("method") ?? "");
  const scheduledAt = parseKstLocalDateTime(String(formData.get("scheduledAt") ?? ""));

  if (!studentId) return fail("상담할 학생을 선택해 주세요.");
  const student = await findClassStudent(teacher.classId, studentId);
  if (!student) return fail("우리 반 학생만 선택할 수 있어요.");
  if (!counterpart) return fail("상담 대상(예: 어머니)을 적어 주세요.");
  if (counterpart.length > MAX_COUNTERPART_LENGTH) return fail(`상담 대상은 ${MAX_COUNTERPART_LENGTH}자 이내로 적어 주세요.`);
  if (!isMethod(method)) return fail("상담 방식을 선택해 주세요.");
  if (scheduledAt === "invalid") return fail("예정 일시를 확인해 주세요.");

  try {
    await scheduleConsultation({
      classId: teacher.classId,
      createdBy: teacher.id,
      studentId: student.studentId,
      counterpart,
      method,
      scheduledAt,
    });
  } catch (error) {
    console.error("[scheduleConsultationAction] insert failed", error);
    return fail("예약하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  revalidatePath("/consultation");
  return { status: "success", message: "상담을 예약했어요." };
}

export async function rescheduleConsultationAction(formData: FormData): Promise<ActionResult> {
  const teacher = await getActingTeacher();

  const id = String(formData.get("id") ?? "");
  const counterpart = String(formData.get("counterpart") ?? "").trim();
  const method = String(formData.get("method") ?? "");
  const scheduledAt = parseKstLocalDateTime(String(formData.get("scheduledAt") ?? ""));

  if (!id) return fail("예정된 상담을 다시 선택해 주세요.");
  if (!counterpart) return fail("상담 대상(예: 어머니)을 적어 주세요.");
  if (counterpart.length > MAX_COUNTERPART_LENGTH) return fail(`상담 대상은 ${MAX_COUNTERPART_LENGTH}자 이내로 적어 주세요.`);
  if (!isMethod(method)) return fail("상담 방식을 선택해 주세요.");
  if (scheduledAt === "invalid") return fail("예정 일시를 확인해 주세요.");

  try {
    await rescheduleConsultation({ id, classId: teacher.classId, counterpart, method, scheduledAt });
  } catch (error) {
    console.error("[rescheduleConsultationAction] update failed", error);
    return fail("일정을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  revalidatePath("/consultation");
  revalidatePath("/dashboard");
  return { status: "success", message: "상담 일정을 바꿨어요." };
}

export async function completeConsultationAction(formData: FormData): Promise<ActionResult> {
  const teacher = await getActingTeacher();

  const id = String(formData.get("id") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const occurredAt = parsePastKstLocalDateTime(String(formData.get("occurredAt") ?? ""));

  if (!id) return fail("예정된 상담을 다시 선택해 주세요.");
  if (!body) return fail("상담 내용을 입력해 주세요.");
  if (body.length > MAX_BODY_LENGTH) return fail(`상담 내용은 ${MAX_BODY_LENGTH}자 이내로 적어 주세요.`);
  if (occurredAt === "invalid") return fail("상담 일시를 확인해 주세요. 미래 시각은 입력할 수 없어요.");

  // 상담 시점까지 쌓인 최근 REPORT_DEFAULT_DAYS일치 기록을 근거로 연결한다
  const reportEndDate = toKstDate(occurredAt ?? new Date());
  const reportStartDate = addDays(reportEndDate, -(REPORT_DEFAULT_DAYS - 1));
  const report = studentId ? await getConsultationReport(teacher.classId, studentId, reportStartDate, reportEndDate) : null;

  try {
    await completeScheduledConsultation({
      id,
      classId: teacher.classId,
      createdBy: teacher.id,
      body,
      occurredAt,
      evidenceRefs: report?.evidenceRefs ?? [],
    });
  } catch (error) {
    console.error("[completeConsultationAction] update failed", error);
    return fail("완료 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  revalidatePath("/consultation");
  return { status: "success", message: "상담을 완료 처리했어요." };
}

export type ReportAiSummaryResult =
  | { status: "ready"; summary: string }
  /** 기간 안에 날짜별 AI 분석이 없어서 요약할 게 없음 */
  | { status: "empty" }
  /** OPENAI_API_KEY 미설정 또는 테스트 대상 학생이 아님 */
  | { status: "unavailable" }
  | { status: "error" };

/**
 * 상담 리포트 "AI 분석 요약"의 기간 요약 — 날짜별 AI 분석을 모아 한 번 더 요약한다.
 * 리포트를 서버에서 다시 만들어 입력으로 쓴다 (클라이언트가 보낸 분석 문장은 받지 않는다).
 * 같은 기간·같은 입력이면 저장된 결과를 재사용하므로 여러 번 불러도 AI는 한 번만 부른다.
 */
export async function getReportAiSummaryAction(
  studentId: string,
  from: string,
  to: string,
): Promise<ReportAiSummaryResult> {
  const teacher = await getActingTeacher();
  if (typeof studentId !== "string" || !isDateString(from) || !isDateString(to) || from > to) return { status: "error" };

  const report = await getConsultationReport(teacher.classId, studentId, from, to);
  if (!report) return { status: "error" };
  if (report.analyses.length === 0 && report.observations.length === 0) return { status: "empty" };

  // 테스트 중 토큰 절약 — /api/ai/daily-analysis와 같은 설정을 따른다
  const onlyIds = process.env.DAILY_ANALYSIS_ONLY_STUDENT_IDS?.split(",").map((id) => id.trim()).filter(Boolean);
  if (onlyIds?.length && !onlyIds.includes(report.student.studentId)) return { status: "unavailable" };

  try {
    const result = await getOrCreatePeriodSummary({
      student: report.student,
      classmates: await listClassStudents(teacher.classId),
      from: report.from,
      to: report.to,
      analyses: report.analyses,
      sessions: report.sessions,
      observations: report.observations,
    });
    return result ? { status: "ready", summary: result.summary } : { status: "empty" };
  } catch (error) {
    if (error instanceof PeriodSummaryUnavailableError) return { status: "unavailable" };
    console.error("[getReportAiSummaryAction]", error);
    return { status: "error" };
  }
}

/**
 * 예정된 상담 카드의 "누적 자료 보기" 팝업 — 인쇄용 페이지(report/[studentId])와 같은 리포트를 돌려준다.
 * 담당 학급 학생이 아니면 null. 민감 데이터 열람이므로 페이지와 똑같이 view_log에 1행 남긴다.
 */
export async function getConsultationReportAction(
  studentId: string,
  from?: string,
  to?: string,
): Promise<ConsultationReport | null> {
  const teacher = await getActingTeacher();
  if (typeof studentId !== "string") return null;
  const range = resolveReportRange(from, to);

  const report = await getConsultationReport(teacher.classId, studentId, range.from, range.to);
  if (!report) return null;

  after(() =>
    recordView({ viewerId: teacher.id, entityType: "consultation_report", entityId: report.student.studentId }),
  );
  return report;
}
