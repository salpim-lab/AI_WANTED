// 담당: 김현우 (단독 소유)
// 원본(불변) — 학생관찰일지 = work_records(record_type 'general'|'conflict'|'student_consultation') + work_record_students.
// student_consultation은 아이 본인과의 상담 — 학부모 상담(consultationLog.ts, record_type='consultation')과는
// 다른 기록이다. insert와 조회만 있다. update/delete 함수를 추가하지 말 것 (기획안 9장, DB 스키마 v0.3 §7.1·§10).
// 서버 전용 — Server Component / Server Action에서만 import한다 ("use client" 파일에서 import 금지).
// 모든 함수가 classId를 받는다: 서버는 service_role로 RLS를 우회하므로 담당 학급 범위를 코드에서 직접 건다.
//
// Supabase 연결 (2026-09-19). 앱의 mock 명단·교사 ↔ DB 행은 recordDb()(_mockTeacherData.ts)가 잇는다.
//   insert: work_records(status='sealed', sealed_at, created_at은 DB default) → work_record_students
//           TODO: 두 insert를 한 트랜잭션(RPC)으로 묶기 — 지금은 학생 확인을 insert 전에 끝내서 두 번째 실패 가능성만 줄였다
//   list:   work_records ⨝ work_record_students. 키워드·날짜 필터는 조회 후 코드에서 (학급 기록 수가 적은 동안)
// TODO(감사 로그): set_config('app.actor_id')를 심으려면 RPC가 필요하다 — 지금 audit_log.changed_by는 NULL로 남는다.

import { addDays, toKstDate, todayKst } from "@/components/shared/datetime";
import type { NewObservationLog, ObservationFilter, ObservationLog, WorkRecordType } from "@/lib/types/teacherRecord";
import { dbTeacherId, recordDb, type RecordDb } from "./_mockTeacherData";

const OBSERVATION_TYPES: WorkRecordType[] = ["general", "conflict", "student_consultation"];
const TITLE_FROM_BODY_LENGTH = 40;

type WorkRecordWithStudents = {
  id: string;
  record_type: string;
  title: string;
  body: string;
  occurred_at: string;
  created_at: string;
  supersedes_id: string | null;
  work_record_students: { enrollment_id: string }[];
};

const SELECT = "id, record_type, title, body, occurred_at, created_at, supersedes_id, work_record_students(enrollment_id)";

function toObservationLog(db: RecordDb, row: WorkRecordWithStudents): ObservationLog {
  const taggedStudents = row.work_record_students.flatMap((link) => {
    const student = db.studentByEnrollment.get(link.enrollment_id);
    return student ? [{ studentId: student.student_id, name: student.display_name }] : [];
  });

  return {
    id: row.id,
    recordType:
      row.record_type === "conflict" ? "conflict" : row.record_type === "student_consultation" ? "student_consultation" : "general",
    title: row.title,
    body: row.body,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    supersedesId: row.supersedes_id,
    taggedStudents,
  };
}

/** 공백으로 나눈 모든 단어가 들어 있어야 일치 (tsvector AND 검색 흉내) */
function matchesKeyword(log: ObservationLog, keyword: string): boolean {
  const haystack = [log.title ?? "", log.body, ...log.taggedStudents.map((t) => t.name)].join(" ").toLowerCase();
  return keyword
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

/** DB는 제목이 필수다 — 교사가 비워 두면 본문 첫 줄 앞부분을 제목으로 쓴다 */
function titleOrFromBody(title: string | null, body: string): string {
  if (title?.trim()) return title.trim();
  const firstLine = body.trim().split(/\r?\n/)[0];
  return firstLine.length > TITLE_FROM_BODY_LENGTH ? `${firstLine.slice(0, TITLE_FROM_BODY_LENGTH)}…` : firstLine;
}

/**
 * (2026-09-20, 이지현 제안) viewerTeacherId — 공개 데모 방문자 격리용. 안 주면(기존 호출부
 * 전부 해당) db.teacherId(시드 담임)만 보여서 지금까지 동작과 완전히 같다. DEMO_MODE에서
 * getActingTeacher()가 돌려준 방문자 본인 id를 넘기면, 공용 시드 + 그 방문자가 새로 쓴 것만
 * 보인다 — 다른 방문자가 쓴 건 후보 단계에서부터 제외된다(쿼리 자체의 조건).
 */
export async function listObservationLogs(
  classId: string,
  filter: ObservationFilter = {},
  viewerTeacherId?: string,
): Promise<ObservationLog[]> {
  const db = await recordDb(classId);
  if (!db) return [];

  const visibleAuthors = [db.teacherId, ...(viewerTeacherId && viewerTeacherId !== db.teacherId ? [viewerTeacherId] : [])];

  const { data, error } = await db.client
    .from("work_records")
    .select(SELECT)
    .eq("class_id", db.classId)
    .eq("status", "sealed")
    .in("record_type", OBSERVATION_TYPES)
    .in("created_by", visibleAuthors)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as WorkRecordWithStudents[])
    .map((row) => toObservationLog(db, row))
    .filter((log) => {
      if (filter.studentId && !log.taggedStudents.some((t) => t.studentId === filter.studentId)) return false;
      const occurredOn = toKstDate(log.occurredAt);
      // 미래 날짜로 미리 넣어 둔 목업(다른 아이들 배포 전 목업)이 실제 "오늘"보다 앞서 검색으로 새지 않게 항상 막는다
      if (occurredOn > todayKst()) return false;
      if (filter.from && occurredOn < filter.from) return false;
      if (filter.to && occurredOn > filter.to) return false;
      if (filter.keyword && !matchesKeyword(log, filter.keyword)) return false;
      return true;
    });
}

/** 한 아이가 태그된 관찰일지 — 상담 리포트용 (기간: from~to, 발생 시각 기준) */
export async function listObservationLogsForStudent(
  classId: string,
  studentId: string,
  to: string,
  days: number,
  viewerTeacherId?: string,
): Promise<ObservationLog[]> {
  return listObservationLogs(classId, { studentId, from: addDays(to, -(days - 1)), to }, viewerTeacherId);
}

export async function insertObservationLog(input: NewObservationLog): Promise<ObservationLog> {
  const db = await recordDb(input.classId);
  if (!db) throw new Error(`담당 학급이 아닙니다: ${input.classId}`);

  // 봉인된 기록은 되돌릴 수 없으니, 학생 확인은 insert 전에 끝낸다
  const enrollmentIds = [...new Set(input.taggedStudentIds)].map((studentId) => {
    const enrollmentId = db.enrollmentOf.get(studentId);
    if (!enrollmentId) throw new Error(`담당 학급에 없는 학생입니다: ${studentId}`);
    return enrollmentId;
  });

  // 기록 시각은 서버가 정한다 (created_at은 DB default now()). 클라이언트가 보낸 시각을 받지 않는다.
  const now = new Date().toISOString();
  const { data: record, error } = await db.client
    .from("work_records")
    .insert({
      class_id: db.classId,
      record_type: input.recordType,
      title: titleOrFromBody(input.title, input.body),
      body: input.body,
      occurred_at: input.occurredAt ?? now,
      created_by: dbTeacherId(db, input.createdBy),
      status: "sealed",
      sealed_at: now,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (enrollmentIds.length > 0) {
    const { error: linkError } = await db.client
      .from("work_record_students")
      .insert(enrollmentIds.map((enrollment_id) => ({ work_record_id: record.id, enrollment_id, participant_role: "participant" })));
    if (linkError) throw new Error(`기록은 봉인됐지만 태그한 아이를 잇지 못했습니다 (${record.id}): ${linkError.message}`);
  }

  const { data: saved, error: readError } = await db.client.from("work_records").select(SELECT).eq("id", record.id).single();
  if (readError) throw readError;
  return toObservationLog(db, saved as WorkRecordWithStudents);
}
