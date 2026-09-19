// 담당: 김현우 (단독 소유) — mock 전용 저장소. Supabase 연결이 끝나면 이 파일은 통째로 삭제한다.
// - 배럴(raw/index.ts)에 export하지 않는다. raw/{observationLog,consultationLog,viewLog}.ts,
//   queries/teacherStudents.ts, 그리고 인증 대용 getActingTeacher를 쓰는 곳에서만 import한다.
// - 행 모양은 DB 스키마 v0.3 컬럼(snake_case)을 그대로 흉내 낸다. 그래야 Supabase로 교체할 때
//   repository의 "행 → 화면 타입" 변환 코드가 그대로 살아남는다.
// - checkin_sessions / conversation_messages(이유민) mock은 읽기 흉내용일 뿐이다. 실제 데이터는 그 담당자들의
//   파이프라인이 만든다. checkin_sessions.prosody(발화 측정값)는 아직 저장 코드가 없어서 여기서 결정적으로 만든다.
// - analysis_runs 중 AI 하루 분석(/api/ai/daily-analysis)이 새로 쓰는 행은 mockAnalysisRuns()에,
//   교사 코멘트 AI 초안(/api/ai/comment-draft)은 mockFeedback()에 쌓는다.
// - 등장인물은 전부 가상 인물이다 (실제 아동 데이터 사용 금지).
// - 저장소는 globalThis에 둔다. dev 서버의 HMR이나 Server Action/Server Component 모듈 분리와 무관하게
//   같은 데이터를 보게 하려는 것. 서버를 재시작하면 새로 쓴 기록은 사라진다.
// - 배포 전 목업 데이터(루트 mock-data/out/*.json, 로컬 전용)는 "목업 범위" 안에서만 쓴다 — withTeacherMockFixture.
//   김현우 화면(아이 상세·관찰일지·학부모상담)의 페이지·Server Action만 이 범위로 감싸서 조회한다.
//   같은 조회 함수를 쓰는 에이전트·대시보드는 범위 밖이라 지금까지의 mock을 그대로 본다.
//   파일이 없거나(다른 팀원 PC) TEACHER_MOCK_FIXTURE=off면 범위 안에서도 예전 mock을 쓴다.
//   단 실제로 쓰는 아이(DAILY_ANALYSIS_ONLY_STUDENT_IDS, 지금은 김민준)는 범위 안에서도 목업을 쓰지 않는다 —
//   실제 체크인만 보고, AI 분석·누적 자료 요약도 실제 AI로 만든다. 나머지 아이는 AI 결과까지 목업을 쓴다.

import { givenName } from "@/components/shared/names";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SignalColor } from "@/lib/types/signal";
import type { EvidenceRef, StoredSessionProsody, WorkRecordType } from "@/lib/types/teacherRecord";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { addDays, todayKst } from "@/components/shared/datetime";

// ── 교사 (인증 연동 전 고정값) ──────────────────────────────

export const MOCK_TEACHER = {
  id: "20000000-0000-4000-8000-000000000001",
  classId: "20000000-0000-4000-8000-000000000001",
  displayName: "선생님",
} as const;

/**
 * 현재 요청의 교사와 담당 학급.
 * 모든 페이지 조회와 Server Action의 첫 줄에서 호출한다.
 * TODO(인증 연동): Supabase Auth 세션 → profiles + class_teachers로 교사·담당 학급을 확인하고, 실패하면 throw.
 * TODO(감사 로그): 쓰기 전에 set_config('app.actor_id', teacher.id)를 심는다 (DB 스키마 v0.3 §10.3).
 */
export async function getActingTeacher() {
  return MOCK_TEACHER;
}

/**
 * 현재 요청의 학생 (학생 화면 인증 연동 전 고정값 — 김민준).
 * 학생 화면용 조회는 브라우저가 보낸 studentId를 믿지 않고 이 함수로 학생을 정한다 (다른 아이 편지를 못 보게).
 * TODO(학생 인증 연동): Supabase Auth 세션 → students.auth_user_id → 현재 enrollment.
 */
export async function getActingStudent() {
  return { studentId: "00000000-0000-4000-8000-000000000001", classId: MOCK_TEACHER.classId };
}

const mockUuid = (prefix: string, n: number) =>`${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

/**
 * 대시보드(진승혜)의 mock 데이터가 아직 1..N 번호를 studentId로 쓴다 — 실제 student_id(UUID)는 모르기 때문.
 * mock 단계에서만 그 번호를 우리 학생 명단의 student_id로 풀어준다. Supabase 연결 시 양쪽 다 실제
 * student_id(UUID)를 쓰게 되므로 이 브리지는 그때 삭제한다.
 */
export const mockStudentIdFromNumber = (n: number) => mockUuid("00000000", n);

/**
 * 교사 화면 mock 학급과 짝지을 Supabase 시드 학급 (supabase/seed.sql "3학년 2반").
 * 학생 화면은 이미 실제 DB(checkin_sessions)에 쓰므로, 교사 화면은 이 학급의 실제 세션을 읽어
 * mock 명단의 같은 이름(성 뺀 이름: 김민준 ↔ 민준) 아이에게 붙인다 — queries/teacherStudents.ts.
 * 교사 화면 명단까지 DB로 옮기면(v_students_current) 이 연결표는 삭제한다.
 */
export const MOCK_DB_CLASS_ID = "20000000-0000-4000-8000-000000000001";

/**
 * 업무기록(관찰일지·상담)·열람 기록을 실제 DB에 읽고 쓸 때 쓰는 mock ↔ DB 연결표.
 * 앱은 아직 mock 교사·mock 명단(student_id)을 쓰고, DB에는 시드 학급·시드 교사·시드 enrollment가 있다.
 *   - 학급: MOCK_TEACHER.classId → MOCK_DB_CLASS_ID (그 외 학급은 null — 담당 학급이 아니다)
 *   - 교사: MOCK_TEACHER.id → DB 학급의 담임(class_teachers.role='homeroom')
 *   - 학생: mock 이름(성 포함) ↔ DB 이름(성 뺀 이름)
 * 인증이 붙으면(getActingTeacher가 실제 교사를 돌려주면) 이 연결표는 삭제하고 v_students_current를 직접 쓴다.
 */
export type RecordDb = {
  client: ReturnType<typeof createAdminClient>;
  classId: string;
  teacherId: string;
  /** DB enrollment_id → mock 명단 행 */
  studentByEnrollment: Map<string, MockStudentRow>;
  /** mock student_id → DB enrollment_id / student_id */
  enrollmentOf: Map<string, string>;
  dbStudentOf: Map<string, string>;
};

const RECORD_DB_TTL_MS = 5 * 60 * 1000;
const globalForRecordDb = globalThis as typeof globalThis & {
  __salpimRecordDb?: { at: number; value: Promise<Omit<RecordDb, "client">> };
};

async function loadRecordDb(client: RecordDb["client"]): Promise<Omit<RecordDb, "client">> {
  const [{ data: students, error: studentError }, { data: teachers, error: teacherError }] = await Promise.all([
    client.from("v_students_current").select("student_id, enrollment_id, display_name").eq("class_id", MOCK_DB_CLASS_ID),
    client.from("class_teachers").select("teacher_id").eq("class_id", MOCK_DB_CLASS_ID).eq("role", "homeroom").limit(1),
  ]);
  if (studentError) throw studentError;
  if (teacherError) throw teacherError;
  const teacherId = teachers?.[0]?.teacher_id;
  if (!teacherId) throw new Error("DB 학급에 담임 교사가 없습니다 (class_teachers)");

  const dbByName = new Map((students ?? []).map((s) => [s.display_name, s]));
  const studentByEnrollment = new Map<string, MockStudentRow>();
  const enrollmentOf = new Map<string, string>();
  const dbStudentOf = new Map<string, string>();
  for (const mock of MOCK_STUDENTS) {
    const db = dbByName.get(givenName(mock.display_name));
    if (!db?.enrollment_id || !db.student_id) continue;
    studentByEnrollment.set(db.enrollment_id, mock);
    enrollmentOf.set(mock.student_id, db.enrollment_id);
    dbStudentOf.set(mock.student_id, db.student_id);
  }
  return { classId: MOCK_DB_CLASS_ID, teacherId, studentByEnrollment, enrollmentOf, dbStudentOf };
}

/** 앱 학급 id로 DB 연결표를 얻는다. 담당 학급이 아니면 null. 명단·담임은 5분 동안 재사용한다 */
export async function recordDb(appClassId: string): Promise<RecordDb | null> {
  if (appClassId !== MOCK_TEACHER.classId) return null;
  const client = createAdminClient();
  const cached = globalForRecordDb.__salpimRecordDb;
  if (!cached || Date.now() - cached.at > RECORD_DB_TTL_MS) {
    const value = loadRecordDb(client);
    globalForRecordDb.__salpimRecordDb = { at: Date.now(), value };
    // 실패한 조회는 캐시에 남기지 않는다 — 다음 요청에서 다시 시도
    value.catch(() => {
      if (globalForRecordDb.__salpimRecordDb?.value === value) globalForRecordDb.__salpimRecordDb = undefined;
    });
  }
  return { client, ...(await globalForRecordDb.__salpimRecordDb!.value) };
}

/** 앱 교사 id → DB 교사 id. mock 교사만 DB 담임으로 바꾼다 (그 외는 그대로 — 인증 연동 후의 실제 교사 id) */
export function dbTeacherId(db: RecordDb, appTeacherId: string): string {
  return appTeacherId === MOCK_TEACHER.id ? db.teacherId : appTeacherId;
}

const kstToIso = (localDateTime: string) => new Date(`${localDateTime}+09:00`).toISOString();

// ── v_students_current ───────────────────────────────────

export type MockStudentRow = {
  student_id: string;
  enrollment_id: string;
  class_id: string;
  display_name: string;
  seat_row: number;
  seat_col: number;
  status: "active" | "inactive";
};

type Badge = "watch" | "unicorn" | null;

// [이름, 오늘 등교 색, 오늘 하교 색, 아침 브리핑 배지] — 프로토타입 STUDENTS 그대로
const ROSTER: [string, SignalColor, SignalColor, Badge][] = [
  ["김민준", "red", "yellow", "watch"],
  ["이서연", "navy", "green", "watch"],
  ["박예린", "red", "yellow", "watch"],
  ["최하준", "green", "green", "unicorn"],
  ["정지우", "green", "green", "unicorn"],
  ["이시아", "green", "yellow", "unicorn"],
  ["김준서", "yellow", "yellow", null],
  ["박건우", "green", "green", null],
  ["최윤아", "yellow", "green", null],
  ["이은채", "yellow", "yellow", null],
  ["김다올", "green", "green", null],
  ["오서준", "green", "green", null],
  ["한지호", "yellow", "red", null],
  ["정현우", "green", "green", null],
  ["이나윤", "green", "yellow", null],
  ["김도윤", "green", "green", null],
  ["오태연", "navy", "green", null],
  ["박지민", "yellow", "yellow", null],
  ["최수아", "green", "green", null],
  ["정연우", "green", "green", null],
];

const SEATS_PER_ROW = 4;

export const MOCK_STUDENTS: MockStudentRow[] = ROSTER.map(([name], i) => ({
  student_id: mockUuid("00000000", i + 1),
  enrollment_id: mockUuid("10000000", i + 1),
  class_id: MOCK_TEACHER.classId,
  display_name: name,
  seat_row: Math.floor(i / SEATS_PER_ROW) + 1,
  seat_col: (i % SEATS_PER_ROW) + 1,
  status: "active",
}));

// ── 자리 배치 (enrollments.seat_row/seat_col + 격자 크기) ──────
// 교사가 자리 바꾸기로 저장한 값. 격자 크기(행·열 수)는 아직 스키마에 저장할 곳이 없어 mock에만 있다.

export type MockSeatLayoutRow = {
  rows: number;
  cols: number;
  /** enrollment_id → 자리 */
  seats: Record<string, { seat_row: number; seat_col: number }>;
};

const globalForSeats = globalThis as typeof globalThis & { __salpimSeatLayouts?: Record<string, MockSeatLayoutRow> };

/** classId → 저장된 자리 배치. 아직 저장한 적 없는 학급은 MOCK_STUDENTS의 초기 자리를 쓴다 */
export function mockSeatLayouts(): Record<string, MockSeatLayoutRow> {
  globalForSeats.__salpimSeatLayouts ??= {};
  return globalForSeats.__salpimSeatLayouts;
}

function rosterIndexOf(enrollmentId: string): number {
  return MOCK_STUDENTS.findIndex((s) => s.enrollment_id === enrollmentId);
}

/** 아침 브리핑 배지 — 진승혜 대시보드(아침 브리핑) 결과로 교체될 자리 */
export function mockBriefingBadge(enrollmentId: string): Badge {
  const index = rosterIndexOf(enrollmentId);
  return index < 0 ? null : ROSTER[index][3];
}

// ── checkin_sessions / conversation_messages / analysis_runs (읽기 흉내) ──

export type MockSessionRow = {
  id: string;
  enrollment_id: string;
  session_date: string;
  period: "morning" | "afternoon";
  attempt: number;
  mood_color: SignalColor;
  status: "started" | "completed" | "stopped";
  stop_reason: string | null;
  started_at: string;
  completed_at: string | null;
  prosody: StoredSessionProsody | null;
};

export type MockMessageRow = {
  id: string;
  session_id: string;
  sequence: number;
  speaker: "student" | "assistant" | "system";
  content: string;
  input_method: "voice" | "text" | "fixed";
  created_at: string;
};

export type MockAnalysisRow = {
  id: string;
  analysis_type: "session_summary";
  source_type: "session";
  source_id: string;
  status: "completed";
  result: { summary: string };
  created_at: string;
};

type Turn = [MockMessageRow["speaker"], string];

const MORNING_TURNS: Record<SignalColor, Turn[]> = {
  green: [
    ["assistant", "초록이구나! 뭐가 좋았어? 자랑하고 싶은 일 있어?"],
    ["student", "어제 친구랑 축구했어요."],
    ["assistant", "재밌었겠다! 오늘도 좋은 하루 보내."],
  ],
  yellow: [
    ["assistant", "왜 기분이 좀 그런지 얘기해줄 수 있어?"],
    ["student", "그냥 좀 졸려요."],
    ["assistant", "그럴 때도 있지. 천천히 시작하자."],
  ],
  red: [
    ["assistant", "무슨 일 있었어? 말해줄 수 있으면 얘기해봐."],
    ["student", "아침에 기분이 좀 안 좋았어요."],
    ["assistant", "그랬구나. 선생님이 알고 있을게."],
  ],
  navy: [["assistant", "알겠어. 오늘은 그냥 둘게. 필요하면 언제든 눌러."]],
};

const AFTERNOON_TURNS: Record<SignalColor, Turn[]> = {
  green: [
    ["assistant", "오늘 학교에서 털어놓고 싶은 일 있어?"],
    ["student", "오늘은 괜찮았어요."],
    ["assistant", "다행이야. 내일 또 만나!"],
  ],
  yellow: [
    ["assistant", "오늘 학교에서 털어놓고 싶은 일 있어?"],
    ["student", "수학이 좀 어려웠어요."],
    ["assistant", "어려운 걸 끝까지 해냈구나."],
  ],
  red: [
    ["assistant", "오늘 학교에서 털어놓고 싶은 일 있어?"],
    ["student", "쉬는 시간에 친구랑 좀 다퉜어요."],
    ["assistant", "속상했겠다. 얘기해줘서 고마워."],
  ],
  navy: [["assistant", "오늘은 조용히 마무리할게. 수고했어."]],
};

/** 빨강 하교 대화에 붙는 예시 요약 — 판정·위험도 표현 없이 사실만 */
const RED_AFTERNOON_SUMMARY = "하교 대화에서 쉬는 시간에 친구와 다툰 일을 이야기했고, 말하고 난 뒤 조금 편해졌다고 표현했습니다.";

// 오늘 대화가 구체적으로 준비된 아이 — 프로토타입 STUDENT_DETAIL 그대로
const TODAY_DETAIL: Record<string, { morning: Turn[]; afternoon: Turn[]; analysis: string; draft: string }> = {
  김민준: {
    morning: [
      ["assistant", "빨강이구나. 기분이 많이 안 좋은 것 같아. 무슨 일 있었어?"],
      ["student", "아침에 엄마랑 좀 싸웠어요..."],
      ["assistant", "아침부터 힘들었겠다. 오늘 선생님이 알고 있을게."],
    ],
    afternoon: [
      ["assistant", "오늘 학교에서 털어놓고 싶은 일 있어?"],
      ["student", "그냥 좀 피곤해요. 급식에 돈까스 나왔어요."],
      ["assistant", "피곤한 하루였구나. 그래도 돈까스가 있었으니 다행이다 😄"],
    ],
    analysis:
      "등교 때 아침에 가족과 다툰 일을 이야기했고, 하교 때는 피곤하다고 하면서도 급식 이야기를 먼저 꺼냈습니다. 오전보다 하교 무렵 대화가 조금 가벼워졌습니다.",
    draft:
      "민준아, 어제 힘든 하루였는데도 끝까지 잘 버텨줘서 선생님이 고마워. 오늘은 더 좋은 아침으로 시작하자. 선생님은 항상 민준이 편이야 😊",
  },
  이서연: {
    morning: [["assistant", "알겠어. 오늘은 그냥 둘게. 필요하면 언제든 눌러. 🔵"]],
    afternoon: [
      ["assistant", "오늘 학교에서 털어놓고 싶은 일 있어?"],
      ["student", "오늘은 괜찮아요."],
      ["assistant", "다행이야. 오늘 쉬어가는 날이었으면 좋겠어."],
    ],
    analysis:
      "등교 때 남색을 골라 대화 없이 지나갔고, 하교 때는 스스로 짧게 대화에 응했습니다. 혼자만의 시간을 가진 뒤 괜찮다고 표현했습니다.",
    draft: "서연아, 어제 필요한 시간을 가져서 다행이야. 오늘도 선생님이랑 이야기하고 싶으면 언제든 찾아와도 돼 🙂",
  },
  박예린: {
    morning: [
      ["assistant", "빨강이구나. 무슨 일 있었어?"],
      ["student", "별로 말하고 싶지 않아요."],
      ["assistant", "알겠어. 말하기 싫을 때는 안 해도 돼. 선생님이 알고 있을게."],
    ],
    afternoon: [
      ["assistant", "오늘 학교에서 털어놓고 싶은 일 있어?"],
      ["student", "친구랑 좀 싸웠어요. 이제 괜찮아요."],
      ["assistant", "그렇구나. 이제 괜찮다니 다행이야."],
    ],
    analysis:
      "등교 때는 이야기하고 싶지 않다고 해서 대화를 짧게 마쳤습니다. 하교 때는 친구와 다툰 일을 스스로 꺼냈고, 지금은 괜찮다고 표현했습니다.",
    draft: "예린아, 어제 힘든 일이 있었는데도 선생님한테 말해줘서 고마워. 오늘도 무슨 일 있으면 꼭 얘기해줘.",
  },
};

const COLOR_POOL: SignalColor[] = ["green", "green", "green", "green", "yellow", "yellow", "red", "navy"];

/** 발화 측정값 기준선이 아직 2주가 안 된 아이 — "기준선 부족이면 해석하지 않는다" 확인용 */
const SHORT_BASELINE_NAMES = new Set(["최수아", "정연우"]);

/** 색별 측정값 범위 [최소, 최대] — 화면 확인용 가상 수치. 실제 값은 학생 화면 녹음(이유민)이 만든다 */
const PROSODY_RANGE: Record<
  SignalColor,
  { delay: [number, number]; sps: [number, number]; silences: [number, number]; loudness: [number, number] }
> = {
  green: { delay: [0.8, 1.6], sps: [3.6, 4.6], silences: [0, 1], loudness: [0, 0.2] },
  yellow: { delay: [1.5, 2.6], sps: [3.0, 3.8], silences: [1, 2], loudness: [-0.12, 0.05] },
  red: { delay: [2.6, 4.2], sps: [2.2, 3.0], silences: [2, 3], loudness: [-0.38, -0.15] },
  navy: { delay: [3.0, 4.5], sps: [2.0, 2.8], silences: [2, 3], loudness: [-0.4, -0.2] },
};

/** mock 기록을 보관하는 기간 (오늘 기준 과거 일수) */
const HISTORY_DAYS = 120;

function hashString(value: string): number {
  let hash = 2166136261;
  for (const ch of value) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 오늘 하교 세션 시작 시각 (한국 시각) */
const AFTERNOON_START = "14:30:00";

/**
 * 오늘 하교 세션이 이미 있었는지 — 기본은 한국 시각 14:30 이후.
 * 테스트용으로 .env.local의 MOCK_TODAY_AFTERNOON=done|pending 으로 고정할 수 있다.
 */
function todayAfternoonDone(today: string): boolean {
  const override = process.env.MOCK_TODAY_AFTERNOON?.trim();
  if (override === "done") return true;
  if (override === "pending") return false;
  return Date.now() >= new Date(kstToIso(`${today}T${AFTERNOON_START}`)).getTime();
}

/** 시드 문자열 → [min, max] 사이 결정적 값 */
function seeded(seed: string, [min, max]: [number, number], digits = 2): number {
  const unit = hashString(seed) / 0xffffffff;
  return +(min + (max - min) * unit).toFixed(digits);
}

/** 학생 음성 발화마다 측정값 1건. 음성 발화가 없으면(남색 등) null — 실제로도 측정할 게 없다 */
function mockProsody(sessionId: string, name: string, color: SignalColor, studentLines: string[]): StoredSessionProsody | null {
  if (studentLines.length === 0) return null;
  const range = PROSODY_RANGE[color];
  return {
    utterances: studentLines.map((line, index) => {
      const seed = `${sessionId}|${index}`;
      const syllables = (line.match(/[가-힣]/g) ?? []).length;
      const sps = seeded(`${seed}|sps`, range.sps);
      const silenceCount = Math.round(seeded(`${seed}|sc`, range.silences, 0));
      const silenceTotal = silenceCount === 0 ? 0 : seeded(`${seed}|st`, [0.8 * silenceCount, 1.6 * silenceCount]);
      return {
        index,
        duration_sec: +(syllables / sps + silenceTotal).toFixed(2),
        response_delay_sec: seeded(`${seed}|delay`, range.delay),
        silence_count: silenceCount,
        silence_total_sec: silenceTotal,
        syllables_per_sec: sps,
        loudness_rel: seeded(`${seed}|loud`, range.loudness),
      };
    }),
    baseline_days: SHORT_BASELINE_NAMES.has(name) ? 5 : 14 + (hashString(name) % 20),
  };
}

/**
 * 한 아이의 하루치 등하교 세션·대화·분석을 결정적으로 만들어 낸다 (같은 입력 → 항상 같은 결과).
 * 실제로는 checkin_sessions / conversation_messages / analysis_runs 조회로 대체된다.
 */
export function mockCheckinsFor(
  enrollmentId: string,
  date: string,
): { sessions: MockSessionRow[]; messages: MockMessageRow[]; analyses: MockAnalysisRow[] } {
  const fixture = activeFixture();
  if (fixture && isLiveEnrollment(enrollmentId)) return { sessions: [], messages: [], analyses: [] };
  if (fixture?.dates.has(date)) return fixture.checkinsFor(enrollmentId, date);

  const result = { sessions: [] as MockSessionRow[], messages: [] as MockMessageRow[], analyses: [] as MockAnalysisRow[] };
  const index = rosterIndexOf(enrollmentId);
  const today = todayKst();
  if (index < 0 || date > today || date < addDays(today, -HISTORY_DAYS)) return result;

  const [name, todayMorning, todayAfternoon] = ROSTER[index];
  const isToday = date === today;
  const detail = isToday ? TODAY_DETAIL[name] : undefined;

  for (const period of ["morning", "afternoon"] as const) {
    // 오늘 하교 전이면 하교 세션은 아직 없다
    if (isToday && period === "afternoon" && !todayAfternoonDone(today)) continue;
    const color = isToday
      ? period === "morning"
        ? todayMorning
        : todayAfternoon
      : COLOR_POOL[hashString(`${enrollmentId}|${date}|${period}`) % COLOR_POOL.length];
    const sessionId = `mock-session-${index + 1}-${date}-${period}`;
    const startedAt = kstToIso(`${date}T${period === "morning" ? "08:40:00" : AFTERNOON_START}`);
    const startedMs = new Date(startedAt).getTime();
    const turns = detail?.[period] ?? (period === "morning" ? MORNING_TURNS : AFTERNOON_TURNS)[color];

    result.sessions.push({
      id: sessionId,
      enrollment_id: enrollmentId,
      session_date: date,
      period,
      attempt: 1,
      mood_color: color,
      status: "completed",
      stop_reason: null,
      started_at: startedAt,
      completed_at: new Date(startedMs + 60_000).toISOString(),
      prosody: mockProsody(
        sessionId,
        name,
        color,
        turns.filter(([speaker]) => speaker === "student").map(([, content]) => content),
      ),
    });

    turns.forEach(([speaker, content], i) => {
      result.messages.push({
        id: `${sessionId}-m${i + 1}`,
        session_id: sessionId,
        sequence: i + 1,
        speaker,
        content,
        input_method: speaker === "student" ? "voice" : "fixed",
        created_at: new Date(startedMs + i * 10_000).toISOString(),
      });
    });

    const summary = detail && period === "afternoon" ? detail.analysis : period === "afternoon" && color === "red" ? RED_AFTERNOON_SUMMARY : null;
    if (summary) {
      result.analyses.push({
        id: `mock-analysis-${index + 1}-${date}`,
        analysis_type: "session_summary",
        source_type: "session",
        source_id: sessionId,
        status: "completed",
        result: { summary },
        created_at: new Date(startedMs + 5 * 60_000).toISOString(),
      });
    }
  }
  return result;
}

/** 교사 코멘트 AI 초안 예시 — /api/ai/comment-draft(이유민) 연결 전 화면 확인용 */
export function mockCommentDraft(enrollmentId: string, date: string): string | null {
  const index = rosterIndexOf(enrollmentId);
  if (index < 0 || date !== todayKst()) return null;
  return TODAY_DETAIL[ROSTER[index][0]]?.draft ?? null;
}

// ── work_records / work_record_students / parent_consultations / view_log (김현우 소유) ──

export type WorkRecordRow = {
  id: string;
  class_id: string;
  record_type: WorkRecordType;
  title: string | null;
  body: string;
  occurred_at: string;
  created_by: string;
  status: "draft" | "sealed";
  sealed_at: string | null;
  supersedes_id: string | null;
  created_at: string;
};

export type WorkRecordStudentRow = {
  work_record_id: string;
  enrollment_id: string;
  participant_role: "participant" | "witness" | null;
};

export type ParentConsultationRow = {
  id: string;
  enrollment_id: string;
  teacher_id: string;
  work_record_id: string | null;
  scheduled_at: string | null;
  status: "preparing" | "in_progress" | "completed";
  /** status='preparing'일 때만 쓴다 — work_record가 없어서 제목을 못 만드니 여기 따로 들고 있다가
   *  완료 처리 시 work_records.title("{counterpart} - {method} 상담")을 만드는 데 쓴다 */
  counterpart: string | null;
  method: "phone" | "visit" | "online" | null;
  notes: string | null;
  evidence_refs: EvidenceRef[];
  updated_at: string;
  created_at: string;
};

export type ViewLogRow = {
  id: string;
  viewer_id: string;
  entity_type: string;
  entity_id: string;
  viewed_at: string;
};

export type MockStore = {
  workRecords: WorkRecordRow[];
  workRecordStudents: WorkRecordStudentRow[];
  parentConsultations: ParentConsultationRow[];
  viewLog: ViewLogRow[];
};

function enrollmentIdByName(name: string): string {
  const student = MOCK_STUDENTS.find((s) => s.display_name === name);
  if (!student) throw new Error(`mock 학생을 찾을 수 없습니다: ${name}`);
  return student.enrollment_id;
}

// 프로토타입의 관찰일지 초기 목록
const SEED_OBSERVATIONS = [
  {
    at: "2026-09-12T14:03:22",
    title: "점심시간 갈등 - 민준·서연 진술 청취",
    body: '점심 배식 줄에서 민준이와 서연이가 부딪혔다는 보고를 받고 각각 진술을 들었음. 민준이는 서연이가 먼저 밀었다고 했고, 서연이는 민준이가 자기 자리를 안 비켜줬다고 함. 두 진술이 달라 추가 관찰이 필요. 오늘 하교 시 양측 모두 "이제 괜찮다"고 했으나 지켜볼 예정.',
    tags: ["김민준", "이서연"],
  },
  {
    at: "2026-09-10T10:21:07",
    title: "체육 시간 관찰 - 민준 팀 구성 갈등",
    body: "체육 수업 팀 구성 시 민준이가 소외감을 느꼈다는 내용을 하교 때 알게 됨. 지호는 의도 없었다고 하나 민준이의 감정은 실제였음. 체육 시간 팀 구성 방식을 바꾸는 것을 고려할 필요 있음. 민준이에게 다음날 따로 이야기 나눌 것.",
    tags: ["김민준", "한지호"],
  },
  {
    at: "2026-09-08T09:05:34",
    title: "서연 - 남색 3일 연속, 개별 관찰 시작",
    body: "서연이가 3일 연속 남색을 선택. 교실에서도 혼자 앉아있는 시간이 늘어난 것 같음. 억지로 말 걸지 않고 자연스럽게 관찰 중. 학부모 상담 시 가정 내 변화 여부 확인 필요.",
    tags: ["이서연"],
  },
];

// 프로토타입의 학부모상담기록 초기 목록
const SEED_CONSULTATIONS = [
  {
    at: "2026-09-11T17:30:00",
    student: "김민준",
    title: "어머니 - 전화 상담",
    body: "민준이가 최근 학교 이야기를 잘 안 한다고 걱정하심. 9월 초부터 빨강 선택 빈도가 늘었고 발화량도 줄었다는 내용 공유. 갈등 관련 사안은 학교에서 지속 관찰 중이며 큰 문제로 번지지 않도록 조치하고 있음을 안내. 다음 대면 상담 10/14 예약.",
  },
  {
    at: "2026-09-05T16:00:00",
    student: "이서연",
    title: "아버지 - 방문 상담",
    body: "서연이가 최근 남색 선택이 잦아졌다는 내용 공유. 아버지는 집에서도 혼자 방에 있는 시간이 늘었다고 하심. 학교에서는 특별한 갈등보다는 내향적으로 자기 에너지를 충전하는 것으로 보임. 부모님도 억지로 말 걸지 않고 기다려 주시기로 함.",
  },
];

// 프로토타입의 "예정된 상담" 초기 목록 — 아직 상담 전이라 내용(body)이 없다
const SEED_SCHEDULED_CONSULTATIONS: {
  at: string;
  student: string;
  counterpart: string;
  method: "phone" | "visit" | "online";
}[] = [
  { at: "2026-09-19T16:30:00", student: "박예린", counterpart: "어머니", method: "visit" },
  { at: "2026-09-22T18:00:00", student: "한지호", counterpart: "아버지", method: "phone" },
];

// 대시보드 아침 브리핑 확인용 — "오늘"에 얹는 예정 상담. 학생 상담은 상담 대상을 "학생 본인"으로 둔다.
// 대시보드가 주말도 오늘로 세게 되면서(mockData.dashboardToday) 여기도 실제 오늘에 얹는다 —
// 직전 수업일에 얹으면 토·일에는 브리핑의 상담 줄이 비어 버린다.
function todayScheduledSeeds(): typeof SEED_SCHEDULED_CONSULTATIONS {
  const day = todayKst();
  return [
    { at: `${day}T12:40:00`, student: "이서연", counterpart: "학생 본인", method: "visit" },
    { at: `${day}T15:30:00`, student: "김민준", counterpart: "어머니", method: "phone" },
  ];
}

function seedStore(): MockStore {
  const store: MockStore = { workRecords: [], workRecordStudents: [], parentConsultations: [], viewLog: [] };

  SEED_OBSERVATIONS.forEach((seed, i) => {
    const id = mockUuid("50000000", i + 1);
    const at = kstToIso(seed.at);
    store.workRecords.push({
      id,
      class_id: MOCK_TEACHER.classId,
      record_type: "general",
      title: seed.title,
      body: seed.body,
      occurred_at: at,
      created_by: MOCK_TEACHER.id,
      status: "sealed",
      sealed_at: at,
      supersedes_id: null,
      created_at: at,
    });
    for (const name of seed.tags) {
      store.workRecordStudents.push({ work_record_id: id, enrollment_id: enrollmentIdByName(name), participant_role: "participant" });
    }
  });

  SEED_CONSULTATIONS.forEach((seed, i) => {
    const workRecordId = mockUuid("50000000", 100 + i + 1);
    const enrollmentId = enrollmentIdByName(seed.student);
    const at = kstToIso(seed.at);
    store.workRecords.push({
      id: workRecordId,
      class_id: MOCK_TEACHER.classId,
      record_type: "consultation",
      title: seed.title,
      body: seed.body,
      occurred_at: at,
      created_by: MOCK_TEACHER.id,
      status: "sealed",
      sealed_at: at,
      supersedes_id: null,
      created_at: at,
    });
    store.workRecordStudents.push({ work_record_id: workRecordId, enrollment_id: enrollmentId, participant_role: "participant" });
    store.parentConsultations.push({
      id: mockUuid("60000000", i + 1),
      enrollment_id: enrollmentId,
      teacher_id: MOCK_TEACHER.id,
      work_record_id: workRecordId,
      scheduled_at: at,
      status: "completed",
      counterpart: null,
      method: null,
      notes: null,
      evidence_refs: [],
      updated_at: at,
      created_at: at,
    });
  });

  // 예정된(아직 안 한) 상담 예시 — 화면 확인용
  [...SEED_SCHEDULED_CONSULTATIONS, ...todayScheduledSeeds()].forEach((seed, i) => {
    const at = kstToIso(seed.at);
    store.parentConsultations.push({
      id: mockUuid("60000000", 900 + i + 1),
      enrollment_id: enrollmentIdByName(seed.student),
      teacher_id: MOCK_TEACHER.id,
      work_record_id: null,
      scheduled_at: at,
      status: "preparing",
      counterpart: seed.counterpart,
      method: seed.method,
      notes: null,
      evidence_refs: [],
      updated_at: at,
      created_at: at,
    });
  });

  return store;
}

const globalForMock = globalThis as typeof globalThis & { __salpimTeacherRecordStore?: MockStore };

export function mockStore(): MockStore {
  const fixture = activeFixture();
  if (fixture) return fixture.store;
  globalForMock.__salpimTeacherRecordStore ??= seedStore();
  return globalForMock.__salpimTeacherRecordStore;
}

// ── analysis_runs (AI 하루 분석이 새로 쓰는 행) ──────────────

export type AnalysisRunRow = {
  id: string;
  /** session_summary: 하루 분석(source=session) / consultation_period_summary: 상담 리포트 기간 요약(source=student) */
  analysis_type: "session_summary" | "consultation_period_summary";
  source_type: "session" | "student";
  source_id: string;
  provider: string;
  model: string | null;
  prompt_version: string;
  schema_version: number;
  category_tags: string[];
  moderation_flag: boolean;
  needs_followup: boolean;
  result: Record<string, unknown>;
  status: "pending" | "completed" | "failed";
  error_message: string | null;
  created_at: string;
};

const globalForAnalysis = globalThis as typeof globalThis & { __salpimAnalysisRuns?: AnalysisRunRow[] };

export function mockAnalysisRuns(): AnalysisRunRow[] {
  globalForAnalysis.__salpimAnalysisRuns ??= [];
  return globalForAnalysis.__salpimAnalysisRuns;
}

// ── feedback_drafts + feedback_sources (교사 코멘트 AI 초안) ──────

export type FeedbackDraftRow = {
  id: string;
  enrollment_id: string;
  /** AI 초안. 불변 */
  draft_text: string;
  final_text: string | null;
  status: "pending" | "dismissed" | "sent";
  created_by: "ai" | "teacher";
  created_at: string;
  sent_at: string | null;
  /** mock 전용 — 스키마에는 없다. 프롬프트를 고치는 동안 예전 초안을 재사용하지 않으려고 둔다 */
  prompt_version: string;
};

export type FeedbackSourceRow = { feedback_id: string; session_id: string };

const globalForFeedback = globalThis as typeof globalThis & {
  __salpimFeedback?: { drafts: FeedbackDraftRow[]; sources: FeedbackSourceRow[] };
};

export function mockFeedback(): { drafts: FeedbackDraftRow[]; sources: FeedbackSourceRow[] } {
  globalForFeedback.__salpimFeedback ??= { drafts: [], sources: [] };
  return globalForFeedback.__salpimFeedback;
}

// ── 배포 전 목업 데이터 (mock-data/out/*.json) ─────────────────────
// mock-data/build.mjs가 DB 스키마 v0.3 행 모양으로 만든 JSON을 읽는다. 행 id 규칙(학생·enrollment)은 이 파일과 같다.

type FixtureSessionRow = Omit<MockSessionRow, "prosody"> & { transcript: unknown };
type FixtureAnalysisRow = {
  id: string;
  source_id: string;
  status: "completed";
  /** scope가 있으면 아이 상세 "AI 분석"(등교 기준 morning / 등교·하교 기준 full), 없으면 하루 요약 */
  analysis_type: string;
  result: { summary: string; scope?: "morning" | "full" };
  created_at: string;
};
type FixtureFeedbackRow = { enrollment_id: string; draft_text: string; final_text: string; created_at: string; sent_at: string };

/** 목업에 미리 넣어 둔 그날 AI 결과 — 화면은 AI를 부르지 않고 이걸 보여준다 */
export type FixtureDayAi = {
  morning: string | null;
  full: string | null;
  /** 선생님이 그날 보낸 한마디 (아이는 다음 등교일 아침에 읽는다) */
  letter: { draft: string; final: string; sentAt: string } | null;
};

type TeacherMockFixture = {
  /** 목업에 들어 있는 날짜 — 이 날짜들은 자동 생성 대신 목업만 쓴다 (체크인이 없는 아이는 빈 날) */
  dates: Set<string>;
  checkinsFor: (enrollmentId: string, date: string) => ReturnType<typeof mockCheckinsFor>;
  dayAi: (enrollmentId: string, date: string) => FixtureDayAi;
  /** 누적 자료(상담 리포트) "AI 분석 요약" — 아이별로 미리 넣어 둔 기간 요약 (student_id → 요약) */
  periodSummaries: Map<string, string>;
  /** 목업 관찰일지·상담으로 시작하는 저장소. 범위 안에서 새로 쓴 기록도 여기에 쌓인다 */
  store: MockStore;
};

const fixtureScope = new AsyncLocalStorage<boolean>();
const FIXTURE_DIR = path.join(process.cwd(), "mock-data", "out");
const globalForFixture = globalThis as typeof globalThis & {
  __salpimTeacherFixture?: { fixture: TeacherMockFixture | null; version: string };
};

/** 실제로 쓰는 아이 — 실제 체크인·실제 AI로 돈다 (DAILY_ANALYSIS_ONLY_STUDENT_IDS와 같은 목록) */
export function isLiveStudent(studentId: string): boolean {
  const ids = process.env.DAILY_ANALYSIS_ONLY_STUDENT_IDS?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
  return ids.includes(studentId);
}

function isLiveEnrollment(enrollmentId: string): boolean {
  const student = MOCK_STUDENTS.find((s) => s.enrollment_id === enrollmentId);
  return student ? isLiveStudent(student.student_id) : false;
}

/** 목업 범위 안에서 이 아이·날짜를 목업으로 보여줄지 — 실제로 쓰는 아이는 아니고, 목업에 있는 날짜일 때 */
export function usesMockFixture(enrollmentId: string, date: string): boolean {
  const fixture = activeFixture();
  return Boolean(fixture?.dates.has(date)) && !isLiveEnrollment(enrollmentId);
}

/** 목업 범위 안의 실제로 쓰는 아이 — 실제 체크인만 보고 목업·자동 생성 데이터로 채우지 않는다 */
export function isLiveInMockScope(enrollmentId: string): boolean {
  return activeFixture() !== null && isLiveEnrollment(enrollmentId);
}

/** 누적 자료 "AI 분석 요약" 목업 — 실제로 쓰는 아이거나 목업이 없으면 null (그때는 실제 AI를 부른다) */
export function mockFixturePeriodSummary(studentId: string): string | null {
  if (isLiveStudent(studentId)) return null;
  return activeFixture()?.periodSummaries.get(studentId) ?? null;
}

/** 목업 범위 안이고 그 날짜가 목업에 있으면 미리 넣어 둔 AI 결과, 아니면 null (평소처럼 AI를 부른다) */
export function mockFixtureDayAi(enrollmentId: string, date: string): FixtureDayAi | null {
  const fixture = activeFixture();
  return fixture && usesMockFixture(enrollmentId, date) ? fixture.dayAi(enrollmentId, date) : null;
}

/** 김현우 화면의 페이지·Server Action에서 조회를 이 안에서 한다 — 목업 데이터가 있으면 그걸 본다 */
export function withTeacherMockFixture<T>(fn: () => Promise<T>): Promise<T> {
  return fixtureScope.run(true, fn);
}

function activeFixture(): TeacherMockFixture | null {
  if (!fixtureScope.getStore() || process.env.TEACHER_MOCK_FIXTURE === "off") return null;
  // mock-data/build.mjs를 다시 돌리면 서버 재시작 없이 새 목업을 읽는다 (그동안 범위 안에서 새로 쓴 기록은 버려진다)
  const version = fixtureVersion();
  const cached = globalForFixture.__salpimTeacherFixture;
  if (!cached || cached.version !== version) globalForFixture.__salpimTeacherFixture = { fixture: loadFixture(), version };
  return globalForFixture.__salpimTeacherFixture!.fixture;
}

function fixtureVersion(): string {
  try {
    return String(fs.statSync(path.join(FIXTURE_DIR, "checkin_sessions.json")).mtimeMs);
  } catch {
    return "missing";
  }
}

function loadFixture(): TeacherMockFixture | null {
  const read = <T,>(table: string): T[] => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${table}.json`), "utf8")) as T[];
  try {
    const sessions = read<FixtureSessionRow>("checkin_sessions");
    const messages = read<MockMessageRow>("conversation_messages");
    const analyses = read<FixtureAnalysisRow>("analysis_runs");

    const feedback = read<FixtureFeedbackRow>("feedback_drafts");

    const messagesBySession = Map.groupBy(messages, (m) => m.session_id);
    // 하루 요약(scope 없음)만 세션 분석으로 붙인다 — AI 분석(scope 있음)은 dayAi로 따로 준다
    const periodSummaryRows = analyses.filter((a) => a.analysis_type === "consultation_period_summary");
    const dayRows = analyses.filter((a) => a.analysis_type !== "consultation_period_summary");
    const analysisBySession = new Map(dayRows.filter((a) => !a.result.scope).map((a) => [a.source_id, a]));
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const dayKey = (enrollmentId: string, date: string) => `${enrollmentId}|${date}`;
    const dayAnalyses = new Map<string, { morning: string | null; full: string | null }>();
    for (const a of dayRows) {
      const session = a.result.scope ? sessionById.get(a.source_id) : undefined;
      if (!session || !a.result.scope) continue;
      const key = dayKey(session.enrollment_id, session.session_date);
      const entry = dayAnalyses.get(key) ?? { morning: null, full: null };
      entry[a.result.scope] = a.result.summary;
      dayAnalyses.set(key, entry);
    }
    // 편지는 그날 하교 뒤에 쓴다 — created_at의 KST 날짜가 그날이다
    const kstDateOf = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
    const letterByDay = new Map(
      feedback.map((f) => [dayKey(f.enrollment_id, kstDateOf(f.created_at)), { draft: f.draft_text, final: f.final_text, sentAt: f.sent_at }]),
    );
    const sessionsByKey = Map.groupBy(sessions, (s) => `${s.enrollment_id}|${s.session_date}`);
    const nameOf = new Map(MOCK_STUDENTS.map((s) => [s.enrollment_id, s.display_name]));

    return {
      dates: new Set(sessions.map((s) => s.session_date)),
      checkinsFor(enrollmentId, date) {
        const result = { sessions: [] as MockSessionRow[], messages: [] as MockMessageRow[], analyses: [] as MockAnalysisRow[] };
        for (const row of sessionsByKey.get(`${enrollmentId}|${date}`) ?? []) {
          const sessionMessages = (messagesBySession.get(row.id) ?? []).toSorted((a, b) => a.sequence - b.sequence);
          const studentLines = sessionMessages.filter((m) => m.speaker === "student").map((m) => m.content);
          result.sessions.push({
            id: row.id,
            enrollment_id: row.enrollment_id,
            session_date: row.session_date,
            period: row.period,
            attempt: row.attempt,
            mood_color: row.mood_color,
            status: row.status,
            stop_reason: row.stop_reason,
            started_at: row.started_at,
            completed_at: row.completed_at,
            prosody: mockProsody(row.id, nameOf.get(enrollmentId) ?? "", row.mood_color, studentLines),
          });
          result.messages.push(...sessionMessages);
          const analysis = analysisBySession.get(row.id);
          if (analysis) {
            result.analyses.push({
              id: analysis.id,
              analysis_type: "session_summary",
              source_type: "session",
              source_id: analysis.source_id,
              status: "completed",
              result: analysis.result,
              created_at: analysis.created_at,
            });
          }
        }
        return result;
      },
      periodSummaries: new Map(periodSummaryRows.map((a) => [a.source_id, a.result.summary])),
      dayAi(enrollmentId, date) {
        const analysis = dayAnalyses.get(dayKey(enrollmentId, date));
        return {
          morning: analysis?.morning ?? null,
          full: analysis?.full ?? null,
          letter: letterByDay.get(dayKey(enrollmentId, date)) ?? null,
        };
      },
      store: {
        workRecords: read<WorkRecordRow>("work_records"),
        workRecordStudents: read<WorkRecordStudentRow>("work_record_students"),
        parentConsultations: read<ParentConsultationRow>("parent_consultations"),
        viewLog: [],
      },
    };
  } catch (error) {
    console.warn(
      "[mockTeacherData] mock-data/out 목업을 읽지 못해 예전 mock을 씁니다:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
