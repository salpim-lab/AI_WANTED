// 담당: 김현우 (단독 소유)
// 원본(불변) — 학부모상담기록.
//   상담 원문: work_records(record_type 'consultation', status 'sealed')에 봉인 — 절대 수정·삭제하지 않는다.
//   상담 메타: parent_consultations(work_record_id로 원문 연결, scheduled_at, evidence_refs, status)
// 예정(status='preparing', work_record_id=null) → 완료(status='completed', work_record_id 연결) 두 단계로 나눈다.
// work_records는 내용이 생기는 "완료" 순간에만, 그것도 한 번만 insert한다(그 뒤로는 절대 안 바뀐다).
// parent_consultations는 일정 메타데이터라 예정→완료 전이를 위해 갱신한다 — 이건 work_records의 "수정 금지"
// 원칙과 다른 대상이다(스키마 v0.3가 이 테이블에 status/updated_at을 둔 이유이기도 하다. CLAUDE.local.md
// 미결 사항 #1 참고). work_records에는 여전히 update/delete 함수를 추가하지 않는다.
// 서버 전용 — Server Component / Server Action에서만 import한다.
//
// 지금은 mock 저장소(_mockTeacherData.ts) 구현이다. Supabase 연결 시 함수 본문만 교체하고 시그니처는 유지한다.

import type {
  CompleteScheduledConsultation,
  ConsultationFilter,
  ConsultationLog,
  ConsultationMethod,
  NewConsultationLog,
  NewScheduledConsultation,
  RescheduleConsultation,
  ScheduledConsultation,
} from "@/lib/types/teacherRecord";
import { toKstDate } from "@/components/shared/datetime";
import { MOCK_STUDENTS, mockStore, type ParentConsultationRow, type WorkRecordRow } from "./_mockTeacherData";

const METHOD_LABEL: Record<ConsultationMethod, string> = { phone: "전화", visit: "방문", online: "온라인" };

function toConsultationLog(row: ParentConsultationRow): ConsultationLog | null {
  const record = mockStore().workRecords.find((w) => w.id === row.work_record_id);
  const student = MOCK_STUDENTS.find((s) => s.enrollment_id === row.enrollment_id);
  if (!record || !student) return null;

  return {
    id: row.id,
    workRecordId: record.id,
    student: { studentId: student.student_id, name: student.display_name },
    title: record.title ?? "",
    body: record.body,
    occurredAt: row.scheduled_at ?? record.occurred_at,
    createdAt: record.created_at,
    evidenceRefs: row.evidence_refs,
  };
}

function toScheduledConsultation(row: ParentConsultationRow): ScheduledConsultation | null {
  const student = MOCK_STUDENTS.find((s) => s.enrollment_id === row.enrollment_id);
  if (!student || !row.scheduled_at || !row.counterpart || !row.method) return null;

  return {
    id: row.id,
    student: { studentId: student.student_id, name: student.display_name },
    counterpart: row.counterpart,
    method: row.method,
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
  };
}

function matchesKeyword(log: ConsultationLog, keyword: string): boolean {
  const haystack = [log.title, log.body, log.student.name].join(" ").toLowerCase();
  return keyword
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

/** 완료한 상담만 — status='completed' */
export async function listConsultationLogs(classId: string, filter: ConsultationFilter = {}): Promise<ConsultationLog[]> {
  const classEnrollmentIds = new Set(MOCK_STUDENTS.filter((s) => s.class_id === classId).map((s) => s.enrollment_id));

  return mockStore()
    .parentConsultations.filter((row) => row.status === "completed" && classEnrollmentIds.has(row.enrollment_id))
    .map(toConsultationLog)
    .filter((log): log is ConsultationLog => log !== null)
    .filter((log) => {
      if (filter.studentId && log.student.studentId !== filter.studentId) return false;
      if (filter.keyword && !matchesKeyword(log, filter.keyword)) return false;
      if (filter.date && toKstDate(log.occurredAt) !== filter.date) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 예정된(아직 안 한) 상담 — status='preparing', 예정 일시가 가까운 순 */
export async function listScheduledConsultations(classId: string): Promise<ScheduledConsultation[]> {
  const classEnrollmentIds = new Set(MOCK_STUDENTS.filter((s) => s.class_id === classId).map((s) => s.enrollment_id));

  return mockStore()
    .parentConsultations.filter((row) => row.status === "preparing" && classEnrollmentIds.has(row.enrollment_id))
    .map(toScheduledConsultation)
    .filter((log): log is ScheduledConsultation => log !== null)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

/** 특정 날짜(KST, "YYYY-MM-DD")에 예정된 상담 — 대시보드 아침 브리핑의 "그날 예정된 상담"에 쓴다 */
export async function listScheduledConsultationsOn(classId: string, date: string): Promise<ScheduledConsultation[]> {
  const scheduled = await listScheduledConsultations(classId);
  return scheduled.filter((c) => toKstDate(c.scheduledAt) === date);
}

/** 상담을 예약만 해 둔다 — 아직 내용이 없으니 work_records는 만들지 않는다 */
export async function scheduleConsultation(input: NewScheduledConsultation): Promise<ScheduledConsultation> {
  const student = MOCK_STUDENTS.find((s) => s.student_id === input.studentId && s.class_id === input.classId);
  if (!student) throw new Error(`담당 학급에 없는 학생입니다: ${input.studentId}`);

  const now = new Date().toISOString();
  const row: ParentConsultationRow = {
    id: crypto.randomUUID(),
    enrollment_id: student.enrollment_id,
    teacher_id: input.createdBy,
    work_record_id: null,
    scheduled_at: input.scheduledAt,
    status: "preparing",
    counterpart: input.counterpart,
    method: input.method,
    notes: null,
    evidence_refs: [],
    updated_at: now,
    created_at: now,
  };
  mockStore().parentConsultations.push(row);

  const scheduled = toScheduledConsultation(row);
  if (!scheduled) throw new Error("예정된 상담 변환에 실패했습니다");
  return scheduled;
}

/**
 * 예정된 상담의 일시·상담 대상·방식을 바꾼다 — parent_consultations(일정 메타)만 갱신한다.
 * 아직 상담 전이라 work_records가 없는 건만 허용하고, 완료된 상담(봉인된 원문이 있는 건)은 거부한다.
 */
export async function rescheduleConsultation(input: RescheduleConsultation): Promise<ScheduledConsultation> {
  const row = mockStore().parentConsultations.find((r) => r.id === input.id);
  if (!row) throw new Error("예정된 상담을 찾을 수 없습니다");
  if (row.status !== "preparing" || row.work_record_id) throw new Error("완료된 상담은 바꿀 수 없습니다");

  const student = MOCK_STUDENTS.find((s) => s.enrollment_id === row.enrollment_id && s.class_id === input.classId);
  if (!student) throw new Error("담당 학급의 예정된 상담이 아닙니다");

  row.scheduled_at = input.scheduledAt;
  row.counterpart = input.counterpart;
  row.method = input.method;
  row.updated_at = new Date().toISOString();

  const scheduled = toScheduledConsultation(row);
  if (!scheduled) throw new Error("예정된 상담 변환에 실패했습니다");
  return scheduled;
}

/**
 * 예정된 상담을 완료로 넘긴다 — 이 시점에 work_records를 딱 한 번 insert해서 봉인하고(이후 절대 수정 안 함),
 * parent_consultations 행을 그 기록에 연결하며 status를 완료로 바꾼다.
 */
export async function completeScheduledConsultation(input: CompleteScheduledConsultation): Promise<ConsultationLog> {
  const store = mockStore();
  const row = store.parentConsultations.find((r) => r.id === input.id);
  if (!row) throw new Error("예정된 상담을 찾을 수 없습니다");
  if (row.status === "completed") throw new Error("이미 완료 처리된 상담입니다");

  const student = MOCK_STUDENTS.find((s) => s.enrollment_id === row.enrollment_id && s.class_id === input.classId);
  if (!student) throw new Error("담당 학급의 예정된 상담이 아닙니다");

  const now = new Date().toISOString();
  const method = row.method ?? "phone";
  const record: WorkRecordRow = {
    id: crypto.randomUUID(),
    class_id: input.classId,
    record_type: "consultation",
    title: `${row.counterpart ?? "보호자"} - ${METHOD_LABEL[method]} 상담`,
    body: input.body,
    occurred_at: input.occurredAt ?? now,
    created_by: input.createdBy,
    status: "sealed",
    sealed_at: now,
    supersedes_id: null,
    created_at: now,
  };
  store.workRecords.push(record);
  store.workRecordStudents.push({
    work_record_id: record.id,
    enrollment_id: row.enrollment_id,
    participant_role: "participant",
  });

  row.work_record_id = record.id;
  row.status = "completed";
  row.evidence_refs = input.evidenceRefs;
  row.updated_at = now;

  const log = toConsultationLog(row);
  if (!log) throw new Error("상담 기록 변환에 실패했습니다");
  return log;
}

/** 예정 없이 이미 끝난 상담을 바로 기록할 때 (걸어와서 얘기한 경우 등) */
export async function insertConsultationLog(input: NewConsultationLog): Promise<ConsultationLog> {
  const store = mockStore();
  const student = MOCK_STUDENTS.find((s) => s.student_id === input.studentId && s.class_id === input.classId);
  if (!student) throw new Error(`담당 학급에 없는 학생입니다: ${input.studentId}`);

  // 기록 시각은 서버가 정한다. 클라이언트가 보낸 시각을 받지 않는다.
  const now = new Date().toISOString();
  const record: WorkRecordRow = {
    id: crypto.randomUUID(),
    class_id: input.classId,
    record_type: "consultation",
    title: input.title,
    body: input.body,
    occurred_at: input.occurredAt ?? now,
    created_by: input.createdBy,
    status: "sealed",
    sealed_at: now,
    supersedes_id: null,
    created_at: now,
  };
  const consultation: ParentConsultationRow = {
    id: crypto.randomUUID(),
    enrollment_id: student.enrollment_id,
    teacher_id: input.createdBy,
    work_record_id: record.id,
    scheduled_at: input.occurredAt ?? now,
    status: "completed",
    counterpart: null,
    method: null,
    notes: null,
    evidence_refs: input.evidenceRefs,
    updated_at: now,
    created_at: now,
  };

  store.workRecords.push(record);
  store.workRecordStudents.push({ work_record_id: record.id, enrollment_id: student.enrollment_id, participant_role: "participant" });
  store.parentConsultations.push(consultation);

  const log = toConsultationLog(consultation);
  if (!log) throw new Error("상담 기록 변환에 실패했습니다");
  return log;
}
