// 담당: 김현우 — 아이 상세 / 학생관찰일지 / 학부모상담기록 화면용 도메인 타입. 이 파일은 김현우만 고친다.
// DB 행(snake_case) → 화면 타입(camelCase) 변환은 lib/supabase/{raw,queries}의 repository 함수 안에서만 한다.
// UI·URL·props에는 studentId만 쓴다. enrollment_id는 repository 밖으로 나오지 않는다 (DB 스키마 v0.3 §9.4).
// 참고: docs/planning/살핌_DB_스키마_v0.3.md §7 업무기록과 상담, §9.4 v_students_current

import type { SignalColor } from "./signal";

// ── 학생 ───────────────────────────────────────────────

/** v_students_current 한 행의 화면용 모양 */
export type ClassStudent = {
  studentId: string;
  name: string;
  seatRow: number;
  seatCol: number;
};

/** 자리 배치도 한 칸 */
export type SeatingStudent = ClassStudent & {
  todayMorning: SignalColor | null;
  todayAfternoon: SignalColor | null;
  /** 아침 브리핑(진승혜 대시보드) 결과 — 연동 전까지 mock */
  badge: "watch" | "unicorn" | null;
};

export type TaggedStudent = { studentId: string; name: string };

// ── 등하교 기록 (이유민 소유 테이블 — 읽기만) ─────────────

export type ConversationTurn = {
  messageId: string;
  speaker: "student" | "assistant" | "system";
  content: string;
};

/** checkin_sessions 한 행 + 그 세션의 conversation_messages */
export type DaySession = {
  sessionId: string;
  period: "morning" | "afternoon";
  attempt: number;
  color: SignalColor;
  status: "started" | "completed" | "stopped";
  startedAt: string; // ISO
  turns: ConversationTurn[];
};

export type ColorHistoryDay = {
  date: string; // YYYY-MM-DD (한국 시각 기준)
  morning: SignalColor | null;
  afternoon: SignalColor | null;
};

// ── 업무기록 (김현우 소유 테이블) ─────────────────────────

// student_consultation = 아이 본인과의 상담(학생관찰일지 "상담" 탭). 학부모 상담(아래 ConsultationLog,
// record_type='consultation')과는 다른 개념이라 별도 리터럴을 쓴다 — 절대 혼동해서 저장하지 않는다.
export type WorkRecordType = "general" | "conflict" | "consultation" | "conference" | "student_consultation";

/** 학생관찰일지 한 건 = work_records(record_type 'general'|'conflict'|'student_consultation', sealed) + work_record_students */
export type ObservationLog = {
  id: string;
  recordType: "general" | "conflict" | "student_consultation";
  title: string | null;
  body: string;
  /** 교사가 입력한 발생 시각. 입력하지 않았으면 기록 시각과 같다 */
  occurredAt: string; // ISO
  /** 서버가 찍은 기록 시각 — 불변 */
  createdAt: string; // ISO
  supersedesId: string | null;
  taggedStudents: TaggedStudent[];
};

export type ObservationFilter = {
  keyword?: string;
  studentId?: string;
  from?: string; // YYYY-MM-DD, 발생 시각 기준
  to?: string; // YYYY-MM-DD, 발생 시각 기준
};

/** 학생관찰일지 화면의 "관찰/상담/전체" 종류 탭 — 여기서 상담은 학생 본인과의 상담이다 */
export type RecordTypeFilter = "all" | "observation" | "consultation";

export type NewObservationLog = {
  classId: string;
  createdBy: string;
  /** 갈등(conflict)은 아직 입력 UI가 없어 여기서 받지 않는다 — CLAUDE.local.md 미결 사항 #3 */
  recordType: "general" | "student_consultation";
  title: string | null;
  body: string;
  occurredAt: string | null; // ISO, null이면 서버 시각
  taggedStudentIds: string[];
};

/** parent_consultations.evidence_refs 항목 — 원문을 복사하지 않고 근거 레코드 ID만 남긴다 */
export type EvidenceRef = {
  table: "checkin_sessions" | "analysis_runs" | "work_records";
  id: string;
};

/**
 * 학부모상담기록 한 건.
 * 상담 원문은 work_records(record_type 'consultation', sealed)에 봉인하고,
 * parent_consultations는 work_record_id로 원문을 가리키며 일시·근거자료만 담는다.
 */
export type ConsultationLog = {
  id: string; // parent_consultations.id
  workRecordId: string;
  student: TaggedStudent;
  /** 예: "어머니 · 전화 상담" */
  title: string;
  body: string;
  occurredAt: string; // ISO
  createdAt: string; // ISO, 서버 시각
  evidenceRefs: EvidenceRef[];
};

export type ConsultationFilter = {
  keyword?: string;
  studentId?: string;
};

export type NewConsultationLog = {
  classId: string;
  createdBy: string;
  studentId: string;
  title: string;
  body: string;
  occurredAt: string | null; // ISO, null이면 서버 시각
  evidenceRefs: EvidenceRef[];
};

export type ConsultationMethod = "phone" | "visit" | "online";

/**
 * 아직 안 한 상담 예약 — parent_consultations(status='preparing', work_record_id=null).
 * 내용(body)이 아직 없어서 work_records에는 아무것도 만들지 않는다 — 상담을 마치고 completeScheduledConsultation을
 * 부르면 그때 봉인된 work_record가 생기고 이 예약 건이 완료로 넘어간다.
 */
export type ScheduledConsultation = {
  id: string; // parent_consultations.id
  student: TaggedStudent;
  counterpart: string;
  method: ConsultationMethod;
  scheduledAt: string; // ISO
  createdAt: string; // ISO
};

export type NewScheduledConsultation = {
  classId: string;
  createdBy: string;
  studentId: string;
  counterpart: string;
  method: ConsultationMethod;
  scheduledAt: string; // ISO
};

/** 예정된 상담의 일정 변경 — 아직 상담 전(status='preparing')인 건만. 학생은 바꾸지 않는다(다른 상담이 된다) */
export type RescheduleConsultation = {
  id: string; // ScheduledConsultation.id
  classId: string;
  counterpart: string;
  method: ConsultationMethod;
  scheduledAt: string; // ISO
};

/** 예정된 상담을 완료 처리할 때 입력 — 이때 처음으로 work_records에 봉인된 원문이 생긴다 */
export type CompleteScheduledConsultation = {
  id: string; // ScheduledConsultation.id
  classId: string;
  createdBy: string;
  body: string;
  occurredAt: string | null; // ISO, null이면 서버 시각
  evidenceRefs: EvidenceRef[];
};

/** 감정 어휘 성장 — 대시보드(진승혜) 스냅샷에서 이 아이 값만 뽑은 것. 기간이 아니라 "현재 기준" 값이다 */
export type VocabInsight = {
  studentCount: number;
  classAverage: number;
};

/** 관계 지도 — 대시보드(진승혜) 스냅샷에서 이 아이와 직접 연결된 관계만 뽑은 것(자기 자신 제외) */
export type RelationInsight = {
  connections: { studentId: string; name: string; kind: "normal" | "conflict" }[];
};

/** 학부모 상담 근거 자료 리포트 */
export type ConsultationReport = {
  student: ClassStudent;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  /** 최근 → 오래된 순 */
  sessions: (DaySession & { date: string })[];
  /** 최근 → 오래된 순 */
  analyses: { analysisId: string; sessionId: string; date: string; summary: string }[];
  /** 최근 → 오래된 순 */
  observations: ObservationLog[];
  evidenceRefs: EvidenceRef[];
  vocabInsight: VocabInsight;
  relationInsight: RelationInsight;
};

// ── Server Action 결과 ───────────────────────────────────

export type ActionResult = {
  status: "success" | "error";
  message: string;
};

/** useActionState 상태 — seq는 클라이언트가 몇 번째 제출 결과인지 구분하는 용도 */
export type FormActionState = {
  status: "idle" | ActionResult["status"];
  message: string | null;
  seq: number;
};
