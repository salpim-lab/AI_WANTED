// 담당: 김현우 (단독 소유) — mock 전용 저장소. Supabase 연결이 끝나면 이 파일은 통째로 삭제한다.
// - 배럴(raw/index.ts)에 export하지 않는다. raw/{observationLog,consultationLog,viewLog}.ts,
//   queries/teacherStudents.ts, 그리고 인증 대용 getActingTeacher를 쓰는 곳에서만 import한다.
// - 행 모양은 DB 스키마 v0.3 컬럼(snake_case)을 그대로 흉내 낸다. 그래야 Supabase로 교체할 때
//   repository의 "행 → 화면 타입" 변환 코드가 그대로 살아남는다.
// - checkin_sessions / conversation_messages(이유민), analysis_runs(이지현) mock은 읽기 흉내용일 뿐이다.
//   실제 데이터는 그 담당자들의 파이프라인이 만든다.
// - 등장인물은 전부 가상 인물이다 (실제 아동 데이터 사용 금지).
// - 저장소는 globalThis에 둔다. dev 서버의 HMR이나 Server Action/Server Component 모듈 분리와 무관하게
//   같은 데이터를 보게 하려는 것. 서버를 재시작하면 새로 쓴 기록은 사라진다.

import type { SignalColor } from "@/lib/types/signal";
import type { EvidenceRef, WorkRecordType } from "@/lib/types/teacherRecord";
import { addDays, todayKst, weekdayKst } from "@/components/shared/datetime";

// ── 교사 (인증 연동 전 고정값) ──────────────────────────────

export const MOCK_TEACHER = {
  id: "20000000-0000-4000-8000-000000000001",
  classId: "30000000-0000-4000-8000-000000000302",
  displayName: "이선생님",
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

const mockUuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

/**
 * 대시보드(진승혜)의 mock 데이터가 아직 1..N 번호를 studentId로 쓴다 — 실제 student_id(UUID)는 모르기 때문.
 * mock 단계에서만 그 번호를 우리 학생 명단의 student_id로 풀어준다. Supabase 연결 시 양쪽 다 실제
 * student_id(UUID)를 쓰게 되므로 이 브리지는 그때 삭제한다.
 */
export const mockStudentIdFromNumber = (n: number) => mockUuid("00000000", n);

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
  ["김준혁", "yellow", "yellow", null],
  ["박수빈", "green", "green", null],
  ["최윤서", "yellow", "green", null],
  ["이채원", "yellow", "yellow", null],
  ["김다은", "green", "green", null],
  ["오성민", "green", "green", null],
  ["한지훈", "yellow", "red", null],
  ["정현우", "green", "green", null],
  ["이아린", "green", "yellow", null],
  ["김도현", "green", "green", null],
  ["오지안", "navy", "green", null],
  ["박민아", "yellow", "yellow", null],
  ["최은서", "green", "green", null],
  ["정우진", "green", "green", null],
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
      "민준아, 오늘 힘든 하루였는데도 끝까지 잘 버텨줘서 선생님이 고마워. 내일은 더 좋은 아침으로 시작하자. 선생님은 항상 민준이 편이야 😊",
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
    draft: "서연아, 오늘 필요한 시간을 가져서 다행이야. 언제든 선생님이랑 이야기하고 싶으면 찾아와도 돼 🙂",
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
    draft: "예린아, 오늘 힘든 일이 있었는데도 선생님한테 말해줘서 고마워. 앞으로도 무슨 일 있으면 꼭 얘기해줘.",
  },
};

const COLOR_POOL: SignalColor[] = ["green", "green", "green", "green", "yellow", "yellow", "red", "navy"];

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

/**
 * 한 아이의 하루치 등하교 세션·대화·분석을 결정적으로 만들어 낸다 (같은 입력 → 항상 같은 결과).
 * 실제로는 checkin_sessions / conversation_messages / analysis_runs 조회로 대체된다.
 */
export function mockCheckinsFor(
  enrollmentId: string,
  date: string,
): { sessions: MockSessionRow[]; messages: MockMessageRow[]; analyses: MockAnalysisRow[] } {
  const result = { sessions: [] as MockSessionRow[], messages: [] as MockMessageRow[], analyses: [] as MockAnalysisRow[] };
  const index = rosterIndexOf(enrollmentId);
  const today = todayKst();
  if (index < 0 || date > today || date < addDays(today, -HISTORY_DAYS)) return result;

  const [name, todayMorning, todayAfternoon] = ROSTER[index];
  const isToday = date === today;
  const detail = isToday ? TODAY_DETAIL[name] : undefined;

  for (const period of ["morning", "afternoon"] as const) {
    const color = isToday
      ? period === "morning"
        ? todayMorning
        : todayAfternoon
      : COLOR_POOL[hashString(`${enrollmentId}|${date}|${period}`) % COLOR_POOL.length];
    const sessionId = `mock-session-${index + 1}-${date}-${period}`;
    const startedAt = kstToIso(`${date}T${period === "morning" ? "08:40:00" : "14:30:00"}`);
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
   *  완료 처리 시 work_records.title("{counterpart} · {method} 상담")을 만드는 데 쓴다 */
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
    title: "점심시간 갈등 — 민준·서연 진술 청취",
    body: '점심 배식 줄에서 민준이와 서연이가 부딪혔다는 보고를 받고 각각 진술을 들었음. 민준이는 서연이가 먼저 밀었다고 했고, 서연이는 민준이가 자기 자리를 안 비켜줬다고 함. 두 진술이 달라 추가 관찰이 필요. 오늘 하교 시 양측 모두 "이제 괜찮다"고 했으나 지켜볼 예정.',
    tags: ["김민준", "이서연"],
  },
  {
    at: "2026-09-10T10:21:07",
    title: "체육 시간 관찰 — 민준 팀 구성 갈등",
    body: "체육 수업 팀 구성 시 민준이가 소외감을 느꼈다는 내용을 하교 때 알게 됨. 지훈이는 의도 없었다고 하나 민준이의 감정은 실제였음. 체육 시간 팀 구성 방식을 바꾸는 것을 고려할 필요 있음. 민준이에게 다음날 따로 이야기 나눌 것.",
    tags: ["김민준", "한지훈"],
  },
  {
    at: "2026-09-08T09:05:34",
    title: "서연 — 남색 3일 연속, 개별 관찰 시작",
    body: "서연이가 3일 연속 남색을 선택. 교실에서도 혼자 앉아있는 시간이 늘어난 것 같음. 억지로 말 걸지 않고 자연스럽게 관찰 중. 학부모 상담 시 가정 내 변화 여부 확인 필요.",
    tags: ["이서연"],
  },
];

// 프로토타입의 학부모상담기록 초기 목록
const SEED_CONSULTATIONS = [
  {
    at: "2026-09-11T17:30:00",
    student: "김민준",
    title: "어머니 · 전화 상담",
    body: "민준이가 최근 학교 이야기를 잘 안 한다고 걱정하심. 9월 초부터 빨강 선택 빈도가 늘었고 발화량도 줄었다는 내용 공유. 갈등 관련 사안은 학교에서 지속 관찰 중이며 큰 문제로 번지지 않도록 조치하고 있음을 안내. 다음 대면 상담 10/14 예약.",
  },
  {
    at: "2026-09-05T16:00:00",
    student: "이서연",
    title: "아버지 · 방문 상담",
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
  { at: "2026-09-22T18:00:00", student: "한지훈", counterpart: "아버지", method: "phone" },
];

/** 가장 가까운 지난 평일(오늘이 평일이면 오늘) — 대시보드 기본 날짜와 맞춘다 */
function latestWeekdayKst(): string {
  let date = todayKst();
  while (weekdayKst(date) === "토" || weekdayKst(date) === "일") date = addDays(date, -1);
  return date;
}

// 대시보드 아침 브리핑 확인용 — "오늘"에 얹는 예정 상담. 학생 상담은 상담 대상을 "학생 본인"으로 둔다
function todayScheduledSeeds(): typeof SEED_SCHEDULED_CONSULTATIONS {
  const day = latestWeekdayKst();
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
  globalForMock.__salpimTeacherRecordStore ??= seedStore();
  return globalForMock.__salpimTeacherRecordStore;
}
