// 담당: 김현우 (단독 소유)
// 원본(불변) — 학부모상담기록.
//   상담 원문: work_records(record_type 'consultation', status 'sealed')에 봉인 — 절대 수정·삭제하지 않는다.
//   상담 메타: parent_consultations(work_record_id로 원문 연결, scheduled_at, evidence_refs, status)
// 예정(status='preparing', work_record_id=null) → 완료(status='completed', work_record_id 연결) 두 단계로 나눈다.
// work_records는 내용이 생기는 "완료" 순간에만, 그것도 한 번만 insert한다(그 뒤로는 절대 안 바뀐다).
// parent_consultations는 일정 메타데이터라 예정→완료 전이를 위해 갱신한다 — 이건 work_records의 "수정 금지"
// 원칙과 다른 대상이다(스키마 v0.3가 이 테이블에 status/updated_at을 둔 이유이기도 하다. CLAUDE.local.md
// 미결 사항 #1 참고). 완료된 행은 DB 트리거(parent_consultations_guard)가 수정·삭제를 막는다.
// work_records에는 여전히 update/delete 함수를 추가하지 않는다.
// 서버 전용 — Server Component / Server Action에서만 import한다.
//
// Supabase 연결 (2026-09-19). 앱의 mock 명단·교사 ↔ DB 행은 recordDb()(_mockTeacherData.ts)가 잇는다.
// TODO: 완료 처리의 insert 여러 개를 한 트랜잭션(RPC)으로 묶기. 지금은 확인을 모두 insert 전에 끝내 둔다.
// TODO(감사 로그): set_config('app.actor_id')를 심으려면 RPC가 필요하다 — 지금 audit_log.changed_by는 NULL로 남는다.

import type {
  CompleteScheduledConsultation,
  ConsultationFilter,
  ConsultationLog,
  ConsultationMethod,
  EvidenceRef,
  NewConsultationLog,
  NewScheduledConsultation,
  RescheduleConsultation,
  ScheduledConsultation,
} from "@/lib/types/teacherRecord";
import { toKstDate, todayKst } from "@/components/shared/datetime";
import { dbTeacherId, recordDb, type RecordDb } from "./_mockTeacherData";

const METHOD_LABEL: Record<ConsultationMethod, string> = { phone: "전화", visit: "방문", online: "온라인" };
const METHODS = new Set<string>(Object.keys(METHOD_LABEL));

type ConsultationRow = {
  id: string;
  enrollment_id: string;
  work_record_id: string | null;
  scheduled_at: string | null;
  status: string;
  counterpart: string | null;
  method: string | null;
  evidence_refs: unknown;
  created_at: string;
  work_records: { id: string; title: string; body: string; occurred_at: string; created_at: string } | null;
};

const SELECT =
  "id, enrollment_id, work_record_id, scheduled_at, status, counterpart, method, evidence_refs, created_at, work_records(id, title, body, occurred_at, created_at)";

function toConsultationLog(db: RecordDb, row: ConsultationRow): ConsultationLog | null {
  const record = row.work_records;
  const student = db.studentByEnrollment.get(row.enrollment_id);
  if (!record || !student) return null;

  return {
    id: row.id,
    workRecordId: record.id,
    student: { studentId: student.student_id, name: student.display_name },
    title: record.title,
    body: record.body,
    occurredAt: row.scheduled_at ?? record.occurred_at,
    createdAt: record.created_at,
    evidenceRefs: Array.isArray(row.evidence_refs) ? (row.evidence_refs as EvidenceRef[]) : [],
  };
}

function toScheduledConsultation(db: RecordDb, row: ConsultationRow): ScheduledConsultation | null {
  const student = db.studentByEnrollment.get(row.enrollment_id);
  if (!student || !row.scheduled_at || !row.counterpart || !row.method || !METHODS.has(row.method)) return null;

  return {
    id: row.id,
    student: { studentId: student.student_id, name: student.display_name },
    counterpart: row.counterpart,
    method: row.method as ConsultationMethod,
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

/**
 * (2026-09-20, 이지현 제안) viewerTeacherId — 공개 데모 방문자 격리용, listObservationLogs와
 * 같은 방식. 안 주면 db.teacherId(시드 담임)만 보여서 기존 동작과 같다.
 */
async function listByStatus(
  db: RecordDb,
  status: "preparing" | "completed",
  viewerTeacherId?: string,
): Promise<ConsultationRow[]> {
  const visibleAuthors = [db.teacherId, ...(viewerTeacherId && viewerTeacherId !== db.teacherId ? [viewerTeacherId] : [])];
  const { data, error } = await db.client
    .from("parent_consultations")
    .select(SELECT)
    .eq("status", status)
    .in("teacher_id", visibleAuthors)
    .in("enrollment_id", [...db.studentByEnrollment.keys()]);
  if (error) throw error;
  return (data ?? []) as ConsultationRow[];
}

/** 담당 학급의 상담 한 건 — 다른 학급 건이면 null */
async function findClassConsultation(db: RecordDb, id: string): Promise<ConsultationRow | null> {
  const { data, error } = await db.client.from("parent_consultations").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  const row = data as ConsultationRow | null;
  return row && db.studentByEnrollment.has(row.enrollment_id) ? row : null;
}

/** 봉인된 상담 원문 1건 + 그 아이 연결. 호출 전에 모든 확인을 끝내 둘 것 (봉인 뒤에는 되돌릴 수 없다) */
async function insertSealedConsultationRecord(
  db: RecordDb,
  input: { enrollmentId: string; title: string; body: string; occurredAt: string; createdBy: string },
): Promise<string> {
  const now = new Date().toISOString();
  const { data: record, error } = await db.client
    .from("work_records")
    .insert({
      class_id: db.classId,
      record_type: "consultation",
      title: input.title,
      body: input.body,
      occurred_at: input.occurredAt,
      created_by: input.createdBy,
      status: "sealed",
      sealed_at: now,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: linkError } = await db.client
    .from("work_record_students")
    .insert({ work_record_id: record.id, enrollment_id: input.enrollmentId, participant_role: "participant" });
  if (linkError) throw new Error(`상담 원문은 봉인됐지만 아이를 잇지 못했습니다 (${record.id}): ${linkError.message}`);
  return record.id;
}

/** 완료한 상담만 — status='completed' */
export async function listConsultationLogs(
  classId: string,
  filter: ConsultationFilter = {},
  viewerTeacherId?: string,
): Promise<ConsultationLog[]> {
  const db = await recordDb(classId);
  if (!db) return [];

  return (await listByStatus(db, "completed", viewerTeacherId))
    .map((row) => toConsultationLog(db, row))
    .filter((log): log is ConsultationLog => log !== null)
    .filter((log) => {
      if (filter.studentId && log.student.studentId !== filter.studentId) return false;
      if (filter.keyword && !matchesKeyword(log, filter.keyword)) return false;
      if (filter.date && toKstDate(log.occurredAt) !== filter.date) return false;
      // 미래 날짜로 미리 넣어 둔 목업(다른 아이들 배포 전 목업)이 실제 "오늘"보다 앞서 검색으로 새지 않게 항상 막는다
      if (toKstDate(log.occurredAt) > todayKst()) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 예정된(아직 안 한) 상담 — status='preparing', 예정 일시가 가까운 순 */
export async function listScheduledConsultations(classId: string): Promise<ScheduledConsultation[]> {
  const db = await recordDb(classId);
  if (!db) return [];

  return (await listByStatus(db, "preparing"))
    .map((row) => toScheduledConsultation(db, row))
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
  const db = await recordDb(input.classId);
  const enrollmentId = db?.enrollmentOf.get(input.studentId);
  if (!db || !enrollmentId) throw new Error(`담당 학급에 없는 학생입니다: ${input.studentId}`);

  const { data, error } = await db.client
    .from("parent_consultations")
    .insert({
      enrollment_id: enrollmentId,
      teacher_id: dbTeacherId(db, input.createdBy),
      scheduled_at: input.scheduledAt,
      status: "preparing",
      counterpart: input.counterpart,
      method: input.method,
    })
    .select(SELECT)
    .single();
  if (error) throw error;

  const scheduled = toScheduledConsultation(db, data as ConsultationRow);
  if (!scheduled) throw new Error("예정된 상담 변환에 실패했습니다");
  return scheduled;
}

/**
 * 예정된 상담의 일시·상담 대상·방식을 바꾼다 — parent_consultations(일정 메타)만 갱신한다.
 * 아직 상담 전이라 work_records가 없는 건만 허용하고, 완료된 상담(봉인된 원문이 있는 건)은 거부한다.
 */
export async function rescheduleConsultation(input: RescheduleConsultation): Promise<ScheduledConsultation> {
  const db = await recordDb(input.classId);
  const row = db ? await findClassConsultation(db, input.id) : null;
  if (!db || !row) throw new Error("담당 학급의 예정된 상담이 아닙니다");
  if (row.status !== "preparing" || row.work_record_id) throw new Error("완료된 상담은 바꿀 수 없습니다");

  // updated_at은 DB 트리거가 채운다. 그 사이 완료로 넘어갔으면 0행이 바뀌어 아래에서 거부된다
  const { data, error } = await db.client
    .from("parent_consultations")
    .update({ scheduled_at: input.scheduledAt, counterpart: input.counterpart, method: input.method })
    .eq("id", row.id)
    .eq("status", "preparing")
    .is("work_record_id", null)
    .select(SELECT)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("완료된 상담은 바꿀 수 없습니다");

  const scheduled = toScheduledConsultation(db, data as ConsultationRow);
  if (!scheduled) throw new Error("예정된 상담 변환에 실패했습니다");
  return scheduled;
}

/**
 * 예정된 상담을 완료로 넘긴다 — 이 시점에 work_records를 딱 한 번 insert해서 봉인하고(이후 절대 수정 안 함),
 * parent_consultations 행을 그 기록에 연결하며 status를 완료로 바꾼다.
 */
export async function completeScheduledConsultation(input: CompleteScheduledConsultation): Promise<ConsultationLog> {
  const db = await recordDb(input.classId);
  const row = db ? await findClassConsultation(db, input.id) : null;
  if (!db || !row) throw new Error("담당 학급의 예정된 상담이 아닙니다");
  if (row.status === "completed" || row.work_record_id) throw new Error("이미 완료 처리된 상담입니다");

  const method = row.method && METHODS.has(row.method) ? (row.method as ConsultationMethod) : "phone";
  const workRecordId = await insertSealedConsultationRecord(db, {
    enrollmentId: row.enrollment_id,
    title: `${row.counterpart ?? "보호자"} - ${METHOD_LABEL[method]} 상담`,
    body: input.body,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    createdBy: dbTeacherId(db, input.createdBy),
  });

  const { data, error } = await db.client
    .from("parent_consultations")
    .update({ work_record_id: workRecordId, status: "completed", evidence_refs: input.evidenceRefs })
    .eq("id", row.id)
    .eq("status", "preparing")
    .select(SELECT)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`이미 완료 처리된 상담입니다 (방금 봉인한 원문 ${workRecordId}는 연결되지 않았습니다)`);

  const log = toConsultationLog(db, data as ConsultationRow);
  if (!log) throw new Error("상담 기록 변환에 실패했습니다");
  return log;
}

/** 예정 없이 이미 끝난 상담을 바로 기록할 때 (걸어와서 얘기한 경우 등) */
export async function insertConsultationLog(input: NewConsultationLog): Promise<ConsultationLog> {
  const db = await recordDb(input.classId);
  const enrollmentId = db?.enrollmentOf.get(input.studentId);
  if (!db || !enrollmentId) throw new Error(`담당 학급에 없는 학생입니다: ${input.studentId}`);

  // 기록 시각은 서버가 정한다. 클라이언트가 보낸 시각을 받지 않는다.
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const teacherId = dbTeacherId(db, input.createdBy);
  const workRecordId = await insertSealedConsultationRecord(db, {
    enrollmentId,
    title: input.title,
    body: input.body,
    occurredAt,
    createdBy: teacherId,
  });

  const { data, error } = await db.client
    .from("parent_consultations")
    .insert({
      enrollment_id: enrollmentId,
      teacher_id: teacherId,
      work_record_id: workRecordId,
      scheduled_at: occurredAt,
      status: "completed",
      evidence_refs: input.evidenceRefs,
    })
    .select(SELECT)
    .single();
  if (error) throw new Error(`상담 원문은 봉인됐지만 상담 목록에 잇지 못했습니다 (${workRecordId}): ${error.message}`);

  const log = toConsultationLog(db, data as ConsultationRow);
  if (!log) throw new Error("상담 기록 변환에 실패했습니다");
  return log;
}
