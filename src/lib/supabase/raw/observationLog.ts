// 담당: 김현우 (단독 소유)
// 원본(불변) — 학생관찰일지 = work_records(record_type 'general'|'conflict'|'student_consultation') + work_record_students.
// student_consultation은 아이 본인과의 상담 — 학부모 상담(consultationLog.ts, record_type='consultation')과는
// 다른 기록이다. insert와 조회만 있다. update/delete 함수를 추가하지 말 것 (기획안 9장, DB 스키마 v0.3 §7.1·§10).
// 서버 전용 — Server Component / Server Action에서만 import한다 ("use client" 파일에서 import 금지).
// 모든 함수가 classId를 받는다: 서버는 service_role로 RLS를 우회하므로 담당 학급 범위를 코드에서 직접 건다.
//
// 지금은 mock 저장소(_mockTeacherData.ts) 구현이다. Supabase 연결 시 함수 본문만 교체하고 시그니처는 유지한다.
//   insert: work_records(status='sealed', sealed_at=now(), created_at은 DB default) + work_record_students
//           → 두 insert를 한 트랜잭션(RPC)으로 묶는다
//   list:   work_records ⨝ work_record_students ⨝ v_students_current,
//           키워드는 body_tsv(simple 설정) 전문검색, 날짜는 occurred_at 범위

import { addDays, toKstDate } from "@/components/shared/datetime";
import type { NewObservationLog, ObservationFilter, ObservationLog } from "@/lib/types/teacherRecord";
import { MOCK_STUDENTS, mockStore, type WorkRecordRow } from "./_mockTeacherData";

const OBSERVATION_TYPES: ReadonlySet<WorkRecordRow["record_type"]> = new Set([
  "general",
  "conflict",
  "student_consultation",
]);

function toObservationLog(row: WorkRecordRow): ObservationLog {
  const taggedStudents = mockStore()
    .workRecordStudents.filter((link) => link.work_record_id === row.id)
    .flatMap((link) => {
      const student = MOCK_STUDENTS.find((s) => s.enrollment_id === link.enrollment_id);
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

export async function listObservationLogs(classId: string, filter: ObservationFilter = {}): Promise<ObservationLog[]> {
  return mockStore()
    .workRecords.filter((row) => row.class_id === classId && row.status === "sealed" && OBSERVATION_TYPES.has(row.record_type))
    .map(toObservationLog)
    .filter((log) => {
      if (filter.studentId && !log.taggedStudents.some((t) => t.studentId === filter.studentId)) return false;
      const occurredOn = toKstDate(log.occurredAt);
      if (filter.from && occurredOn < filter.from) return false;
      if (filter.to && occurredOn > filter.to) return false;
      if (filter.keyword && !matchesKeyword(log, filter.keyword)) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 한 아이가 태그된 관찰일지 — 상담 리포트용 (기간: from~to, 발생 시각 기준) */
export async function listObservationLogsForStudent(
  classId: string,
  studentId: string,
  to: string,
  days: number,
): Promise<ObservationLog[]> {
  return listObservationLogs(classId, { studentId, from: addDays(to, -(days - 1)), to });
}

export async function insertObservationLog(input: NewObservationLog): Promise<ObservationLog> {
  const store = mockStore();

  const enrollmentIds = [...new Set(input.taggedStudentIds)].map((studentId) => {
    const student = MOCK_STUDENTS.find((s) => s.student_id === studentId && s.class_id === input.classId);
    if (!student) throw new Error(`담당 학급에 없는 학생입니다: ${studentId}`);
    return student.enrollment_id;
  });

  // 기록 시각은 서버가 정한다 (DB에서는 created_at default now()). 클라이언트가 보낸 시각을 받지 않는다.
  const now = new Date().toISOString();
  const row: WorkRecordRow = {
    id: crypto.randomUUID(),
    class_id: input.classId,
    record_type: input.recordType,
    title: input.title,
    body: input.body,
    occurred_at: input.occurredAt ?? now,
    created_by: input.createdBy,
    status: "sealed",
    sealed_at: now,
    supersedes_id: null,
    created_at: now,
  };

  store.workRecords.push(row);
  for (const enrollmentId of enrollmentIds) {
    store.workRecordStudents.push({ work_record_id: row.id, enrollment_id: enrollmentId, participant_role: "participant" });
  }
  return toObservationLog(row);
}
