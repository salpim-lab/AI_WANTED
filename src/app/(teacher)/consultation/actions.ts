"use server";

// 담당: 김현우 (단독 소유)
// 학부모상담기록 쓰기 경로 — Server Action. 브라우저에서 DB로 직접 insert하지 않는다 (DB 스키마 v0.3 §1).
// Server Action은 화면 밖에서 POST로 직접 호출될 수도 있으므로, 교사 확인·학급 소속·입력값 검증을 매번 여기서 한다.
// 근거 자료 ID(evidence_refs)는 클라이언트가 보낸 값을 믿지 않고 서버에서 리포트를 다시 만들어 채운다.
// createConsultation/completeConsultationAction 모두 work_records는 insert만 하고 절대 수정하지 않는다.
// completeConsultationAction·rescheduleConsultationAction만 parent_consultations(일정 메타)를 갱신한다 — 이유는
// raw/consultationLog.ts 상단 주석 참고. work_records용 수정·삭제 액션은 앞으로도 만들지 않는다.

import { revalidatePath } from "next/cache";
import {
  addDays,
  parseKstLocalDateTime,
  parsePastKstLocalDateTime,
  toKstDate,
} from "@/components/shared/datetime";
import {
  findClassStudent,
  getConsultationReport,
  REPORT_DEFAULT_DAYS,
} from "@/lib/supabase/queries/teacherStudents";
import { getActingTeacher } from "@/lib/supabase/raw/_mockTeacherData";
import {
  completeScheduledConsultation,
  insertConsultationLog,
  rescheduleConsultation,
  scheduleConsultation,
} from "@/lib/supabase/raw/consultationLog";
import type { ActionResult } from "@/lib/types/teacherRecord";

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
      title: `${counterpart} · ${METHOD_LABEL[method]} 상담`,
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
