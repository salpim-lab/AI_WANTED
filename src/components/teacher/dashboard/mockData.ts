// 담당: 진승혜
// 대시보드 mock 데이터 + 날짜별 스냅샷. 컴포넌트에는 데이터를 하드코딩하지 않고 전부 여기서 읽는다.
//
// 구조: "공통 데이터(거의 안 변하는 것) + 날짜별 override(SNAPSHOTS)".
//   getDashboardSnapshot(dateKey) 하나가 그 날짜의 화면 데이터를 통째로 조립해 돌려준다.
//   page.tsx(서버 컴포넌트)가 이걸 호출해 각 컴포넌트에 props 로 내려준다.
//
// 실데이터 교체 지점 — getDashboardSnapshot 안을 아래 쿼리 호출로 바꾸면 컴포넌트는 그대로다:
//   lib/supabase/queries/{colorSummary,morningBriefing,relationshipMap,conflictLog,
//                          classroomToday,participation}.ts  (전부 date 인자를 받는다)
//   감정 어휘는 app/api/ai/vocab-growth, 패턴 경고는 app/api/ai/pattern-alert
//
// 대시보드는 읽기 전용이다 (살핌_DB_스키마_v0.3.md §13) — 어떤 원본 테이블에도 쓰지 않는다.
// UI/URL 에 노출하는 식별자는 student_id 다. enrollment_id 는 repository 내부 변환용.
//
// studentId 는 components/teacher/students/mockData.ts(김현우)의 STUDENTS 명단과 같은 번호를 쓴다
// — /students/[id] 링크가 실제로 열리게 하기 위함. (해당 파일은 import 하지 않는다: 소유자 분리)

import type { SignalColor } from "@/lib/types/signal";

/* ══ 날짜 유틸 ═══════════════════════════════════════════════════════
   서버에서만 실행되지만, 로컬 타임존에 따라 결과가 흔들리지 않도록 전부 UTC 기준으로 계산한다. */

const KO_WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-09-16" → "수" */
export function weekdayOf(dateKey: string): string {
  return KO_WEEKDAY[new Date(`${dateKey}T00:00:00Z`).getUTCDay()];
}

/** "2026-09-16" → "2026. 09. 16." */
export function formatDotDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  return `${y}. ${m}. ${d}.`;
}

/** "2026-09-16" → "9/16" */
export function shortDate(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** dateKey 를 포함해 거슬러 올라가며 주말을 건너뛴 수업일 count 개 (오래된 날짜부터) */
function recentSchoolDays(dateKey: string, count: number): string[] {
  const out: string[] = [];
  const cursor = new Date(`${dateKey}T00:00:00Z`);
  while (out.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return out.reverse();
}

/* ══ 선택 가능한 날짜 ════════════════════════════════════════════════ */

/** 대시보드가 보여줄 수 있는 날짜 (mock 스냅샷이 있는 날) */
export const DASHBOARD_DATES = ["2026-09-14", "2026-09-15", "2026-09-16"] as const;
export const DASHBOARD_TODAY = DASHBOARD_DATES[DASHBOARD_DATES.length - 1];
export const DASHBOARD_MIN_DATE = DASHBOARD_DATES[0];

/** ?date= 쿼리를 안전한 dateKey 로 정규화. 모르는 값·미래 날짜는 전부 오늘로 되돌린다. */
export function resolveDateKey(raw?: string | string[]): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return DASHBOARD_TODAY;
  if (value > DASHBOARD_TODAY) return DASHBOARD_TODAY;
  if (value < DASHBOARD_MIN_DATE) return DASHBOARD_MIN_DATE;
  // 스냅샷이 없는 날(주말 등)은 가장 가까운 과거 스냅샷으로
  const known = [...DASHBOARD_DATES].reverse().find((d) => d <= value);
  return known ?? DASHBOARD_TODAY;
}

/* ══ 공통 데이터 ═════════════════════════════════════════════════════ */

/* ── 감정 신호 표시 라벨 ────────────────────────────────────────────
   값의 원본은 lib/constants/colors.ts(이유민 소유)지만, 거기 라벨은 학생 화면용 문장이라
   대시보드에서는 교사가 한눈에 읽을 짧은 라벨을 따로 둔다. 색상 의미 자체는 동일.
   실제 색상 값은 prototype-teacher-dashboard.css 의 .page-dashboard 스코프에서
   채도를 낮춘 톤으로 재정의한다 (공용 shared.css 는 건드리지 않는다). */
export const SIGNAL_DISPLAY: Record<SignalColor, { label: string; cssVar: string }> = {
  green: { label: "좋아요", cssVar: "var(--green)" },
  yellow: { label: "그저 그래요", cssVar: "var(--yellow)" },
  red: { label: "속상해요", cssVar: "var(--red)" },
  navy: { label: "혼자 있을래요", cssVar: "var(--navy)" },
};

export const SIGNAL_ORDER: SignalColor[] = ["green", "yellow", "red", "navy"];

/** 우리 반 명단 — 실제로는 v_students_current 조회 결과 */
export const STUDENT_NAMES: Record<number, string> = {
  1: "김민준", 2: "이서연", 3: "박예린", 4: "최하준", 5: "정지우",
  6: "이시아", 7: "김준혁", 8: "박수빈", 9: "최윤서", 10: "이채원",
  11: "김다은", 12: "오성민", 13: "한지훈", 14: "정현우", 15: "이아린",
  16: "김도현", 17: "오지안", 18: "박민아", 19: "최은서", 20: "정우진",
};

export const CLASS_SIZE = Object.keys(STUDENT_NAMES).length;

/* ── 관계 지도 (최근 4주 누적이라 날짜별로 크게 변하지 않는다) ─────────
   → lib/supabase/queries/relationshipMap.ts
   좌표는 mock. 외부 graph 패키지를 쓰지 않고 SVG 로 직접 그린다. */
export type RelationNode = {
  studentId: number;
  name: string;
  x: number;
  y: number;
  r: number;
  tone: "normal" | "conflict" | "isolated";
  note?: string;
};

export type RelationEdge = {
  from: number;
  to: number;
  kind: "normal" | "conflict";
};

/** viewBox 0 0 660 380 기준 좌표 — 노드 사이 간격을 넉넉히 둔다 */
const RELATION_NODE_BASE: Omit<RelationNode, "tone">[] = [
  { studentId: 1, name: "김민준", x: 300, y: 190, r: 34 },
  { studentId: 2, name: "이서연", x: 150, y: 96, r: 31 },
  { studentId: 13, name: "한지훈", x: 460, y: 108, r: 30 },
  { studentId: 3, name: "박예린", x: 262, y: 312, r: 29 },
  { studentId: 4, name: "최하준", x: 600, y: 60, r: 28 },
  { studentId: 5, name: "정지우", x: 604, y: 236, r: 28 },
  { studentId: 7, name: "김준혁", x: 96, y: 296, r: 28 },
  { studentId: 8, name: "박수빈", x: 452, y: 318, r: 28 },
  { studentId: 17, name: "오지안", x: 86, y: 196, r: 28, note: "3주 언급 없음" },
];

const RELATION_EDGE_BASE: { from: number; to: number }[] = [
  { from: 1, to: 2 },
  { from: 1, to: 13 },
  { from: 1, to: 3 },
  { from: 13, to: 4 },
  { from: 13, to: 5 },
  { from: 3, to: 8 },
  { from: 3, to: 7 },
];

const ISOLATED_IDS = [17];

/* ── 갈등 기록 (날짜순 원장. 선택 날짜 이하만 최근 것부터 보여준다) ────
   → lib/supabase/queries/conflictLog.ts (work_records / conflict_statements 읽기 전용)
   쓰기는 김현우 담당 — 대시보드에서는 절대 쓰지 않는다. */
export type ConflictStatement = { who: string; tone: SignalColor | "muted"; text: string };

export type ConflictRow = {
  /** YYYY-MM-DD — 선택 날짜 필터에 쓴다 */
  date: string;
  label: string;
  context: string;
  pair: string;
  pairIds: [number, number];
  summary: string;
  status: string;
  statements: ConflictStatement[];
  warn?: string;
};

const CONFLICT_LEDGER: ConflictRow[] = [
  {
    date: "2026-09-16",
    label: "9월 16일",
    context: "점심시간",
    pair: "김민준 ↔ 이서연",
    pairIds: [1, 2],
    summary: "자리 문제로 다툼",
    status: "진술 확인 중",
    statements: [
      { who: "김민준 (하교)", tone: "red", text: "서연이가 먼저 밀었어요. 제가 지나가는데 갑자기 밀었어요." },
      { who: "이서연 (하교)", tone: "navy", text: "민준이가 제 자리에 앉아서 비키라고 했는데 계속 안 비켰어요." },
    ],
    warn: "두 진술이 서로 다릅니다. 판단 전 양측 원본을 확인하세요.",
  },
  {
    date: "2026-09-14",
    label: "9월 14일",
    context: "체육 시간",
    pair: "김민준 ↔ 한지훈",
    pairIds: [1, 13],
    summary: "팀 편성으로 다툼",
    status: "담임 중재 완료",
    statements: [
      { who: "김민준 (하교)", tone: "red", text: "지훈이가 팀 고를 때 저만 안 뽑았어요." },
      { who: "한지훈 (하교)", tone: "muted", text: "뽑으려고 했는데 이미 팀이 다 찼어요." },
    ],
  },
  {
    date: "2026-09-09",
    label: "9월 9일",
    context: "모둠 활동",
    pair: "박예린 ↔ 김준혁",
    pairIds: [3, 7],
    summary: "역할 분담으로 다툼",
    status: "담임 중재 완료",
    statements: [
      { who: "박예린 (하교)", tone: "yellow", text: "준혁이가 자기 맡은 걸 안 해서 제가 다 했어요." },
      { who: "김준혁 (하교)", tone: "muted", text: "예린이가 제 몫까지 먼저 해버려서 할 게 없었어요." },
    ],
  },
];

/* ── 감정 어휘 (누적값. 날짜별로는 스냅샷의 growthStep 만큼 낮춰 쓴다) ──
   → app/api/ai/vocab-growth/route.ts */
export type VocabStudent = { studentId: number; name: string; count: number; delta: number };
export type VocabMonth = { month: string; average: number };

const VOCAB_BASE: { studentId: number; count: number; delta: number }[] = [
  { studentId: 1, count: 8, delta: 1 },
  { studentId: 2, count: 13, delta: 2 },
  { studentId: 3, count: 6, delta: 0 },
  { studentId: 4, count: 15, delta: 3 },
  { studentId: 5, count: 11, delta: 1 },
  { studentId: 6, count: 9, delta: 2 },
  { studentId: 7, count: 7, delta: 1 },
  { studentId: 8, count: 14, delta: 2 },
  { studentId: 9, count: 10, delta: 1 },
  { studentId: 10, count: 8, delta: 0 },
  { studentId: 11, count: 16, delta: 4 },
  { studentId: 12, count: 12, delta: 2 },
  { studentId: 13, count: 5, delta: 0 },
  { studentId: 14, count: 11, delta: 1 },
  { studentId: 15, count: 9, delta: 1 },
  { studentId: 16, count: 12, delta: 2 },
  { studentId: 17, count: 7, delta: 2 },
  { studentId: 18, count: 8, delta: 1 },
  { studentId: 19, count: 14, delta: 3 },
  { studentId: 20, count: 10, delta: 1 },
];

/** 지난 달들의 학급 평균 — 이미 지나간 값이라 선택 날짜와 무관하게 고정이다.
    9월 누적(선택 날짜에 따라 8.3~10.3)보다 항상 낮아야 앞뒤가 맞는다. */
const VOCAB_TREND_BASE: VocabMonth[] = [
  { month: "5월", average: 4.8 },
  { month: "6월", average: 5.9 },
  { month: "7월", average: 6.7 },
  { month: "8월", average: 7.6 },
];

/* ══ 화면 타입 ═══════════════════════════════════════════════════════ */

/** 화면에 이름을 띄우고 /students/[id] 로 보내기 위한 최소 참조 */
export type StudentRef = { studentId: number; name: string };

/** 한 감정 색의 집계 — count 는 students.length 에서 파생되므로 숫자와 명단이 항상 일치한다 */
export type MoodShare = {
  color: SignalColor;
  count: number;
  pct: number;
  students: StudentRef[];
};

export type WeatherKind = "sunny" | "partly" | "cloudy" | "rainy";

export type ClassroomWeather = {
  kind: WeatherKind;
  headline: string;
  question: string;
  support: string;
};

export type ClassroomDay = {
  weekday: string;
  date: string;
  kind: WeatherKind;
  isToday?: boolean;
};

export type BriefingStudent = {
  studentId: number;
  name: string;
  initial: string;
  tone: SignalColor | "star";
  status: string;
  reason: string;
};

export type PatternTone = "check" | "repeat" | "watch";

export type PatternRow = {
  student: string;
  /** 반복 패턴을 한 덩어리로 빠르게 읽히게 — 카드에 보여주는 건 여기까지 */
  pattern: string;
  /** 근거(날짜 등). 카드에는 펼치지 않고 툴팁으로만 둔다 — 아이 상세에서 쓸 값 */
  detail: string;
  tone: PatternTone;
};

export const PATTERN_TONE_LABEL: Record<PatternTone, string> = {
  check: "확인 필요",
  repeat: "최근 반복된 변화",
  watch: "지켜보는 중",
};

export const PATTERN_FOOTNOTE =
  "반복해서 기록된 신호를 모아둔 것입니다. 아이에 대한 판단이 아니라, 한 번 더 살펴볼 지점입니다.";

export type ParticipationDay = { weekday: string; date: string; rate: number; isToday?: boolean };

export type ParticipationSummary = {
  date: string;
  /** absentStudents 에서 파생된다 — 숫자와 명단이 어긋날 수 없다 */
  completedCount: number;
  totalCount: number;
  weeklyAverageRate: number;
  /** 그날 체크인을 완료하지 않은 아이들 */
  absentStudents: StudentRef[];
  recentDays: ParticipationDay[];
};

/* ══ 날짜별 스냅샷 ═══════════════════════════════════════════════════
   날짜마다 "다른 것"만 적는다. 나머지는 위 공통 데이터에서 파생시킨다. */

type DaySnapshot = {
  weather: ClassroomWeather;
  classroomDelta: string;
  /** 최근 5수업일 날씨 (오래된 날 → 선택 날짜 순) */
  recentWeather: WeatherKind[];
  /** 감정 색별 학생 id — 체크인을 완료한 아이만 들어간다.
      합 + absentIds.length 가 반드시 CLASS_SIZE 여야 한다. */
  mood: Record<SignalColor, number[]>;
  watch: BriefingStudent[];
  praise: BriefingStudent[];
  patterns: PatternRow[];
  participation: { absentIds: number[]; weeklyAverageRate: number; recentRates: number[] };
  /** 그날 기준 관계 지도에서 갈등으로 표시할 짝 */
  conflictPairs: [number, number][];
  /** 그 시점까지의 누적 어휘가 얼마나 적었는지 (오늘=0) */
  vocabStep: number;
};

const SNAPSHOTS: Record<string, DaySnapshot> = {
  "2026-09-16": {
    weather: {
      kind: "sunny",
      headline: "대체로 맑음",
      question: "우리 반 마음에는 어떤 날씨가 찾아왔을까요?",
      support: "아이들 각자의 마음도 함께 살펴주세요.",
    },
    classroomDelta: "오후에는 초록이 2명 줄고 속상해요가 1명 늘었어요.",
    recentWeather: ["partly", "cloudy", "sunny", "partly", "sunny"],
    mood: {
      green: [4, 5, 6, 8, 9, 11, 12, 14, 17, 19],
      yellow: [7, 10, 13, 15, 18],
      red: [1, 3],
      navy: [2],
    },
    watch: [
      { studentId: 1, name: "김민준", initial: "민", tone: "red", status: "빨강 3일 연속", reason: "발화 속도가 줄고 말수가 적어졌어요" },
      { studentId: 2, name: "이서연", initial: "서", tone: "navy", status: "혼자 있을 시간이 필요해요", reason: "오늘은 먼저 말을 걸지 않는 편이 좋아요" },
      { studentId: 3, name: "박예린", initial: "예", tone: "red", status: "노랑 → 빨강 급변", reason: "어제 하교 이후 색이 크게 바뀌었어요" },
    ],
    praise: [
      { studentId: 4, name: "최하준", initial: "하", tone: "star", status: "13일 연속 초록", reason: "친구 이야기를 꺼내는 날이 늘었어요" },
      { studentId: 11, name: "김다은", initial: "다", tone: "star", status: "감정 어휘 16개", reason: "이번 달 우리 반에서 가장 많이 늘었어요" },
      { studentId: 17, name: "오지안", initial: "지", tone: "star", status: "남색 → 초록", reason: "오랜만에 먼저 말을 꺼냈어요" },
    ],
    patterns: [
      { student: "김민준", pattern: "빨강 3일 연속", detail: "9/14, 9/15, 9/16 등교", tone: "check" },
      { student: "박예린", pattern: "최근 5일 중 4일 부정 신호", detail: "노랑 2회 · 빨강 2회", tone: "check" },
      { student: "이서연", pattern: "남색 응답 반복", detail: "최근 2주 4회 · 혼자 있을 시간을 요청", tone: "watch" },
      { student: "한지훈", pattern: "면담 필요 신호 반복", detail: "9/9, 9/11, 9/15 대화에서 기록", tone: "repeat" },
      { student: "김민준", pattern: "체육 있는 날 관계 신호 반복", detail: "9/9, 9/14, 9/16 · 오늘 3교시 체육", tone: "repeat" },
    ],
    participation: { absentIds: [16, 20], weeklyAverageRate: 87, recentRates: [80, 95, 85, 95, 90] },
    conflictPairs: [
      [1, 2],
      [1, 13],
    ],
    vocabStep: 0,
  },

  "2026-09-15": {
    weather: {
      kind: "partly",
      headline: "구름 조금",
      question: "우리 반 마음에는 어떤 날씨가 찾아왔을까요?",
      support: "속상한 아이가 어제보다 한 명 더 있었어요.",
    },
    classroomDelta: "하교에는 초록이 1명 늘었어요. 오후가 오전보다 나은 날이었어요.",
    recentWeather: ["sunny", "partly", "cloudy", "sunny", "partly"],
    mood: {
      green: [4, 5, 6, 8, 11, 12, 14, 17, 19],
      yellow: [7, 9, 10, 15, 18, 20],
      red: [1, 3, 13],
      navy: [2],
    },
    watch: [
      { studentId: 1, name: "김민준", initial: "민", tone: "red", status: "빨강 2일 연속", reason: "어제부터 같은 색을 고르고 있어요" },
      { studentId: 13, name: "한지훈", initial: "지", tone: "red", status: "면담 필요 신호", reason: "대화에서 도움을 요청하는 표현이 있었어요" },
      { studentId: 3, name: "박예린", initial: "예", tone: "yellow", status: "노랑 유지", reason: "며칠째 같은 자리에 머물러 있어요" },
    ],
    praise: [
      { studentId: 4, name: "최하준", initial: "하", tone: "star", status: "12일 연속 초록", reason: "모둠 활동에서 친구를 챙겼어요" },
      { studentId: 8, name: "박수빈", initial: "수", tone: "star", status: "감정 어휘 +2", reason: "이번 주에 새로운 표현을 썼어요" },
      { studentId: 5, name: "정지우", initial: "정", tone: "star", status: "노랑 → 초록", reason: "하교 때 표정이 밝아졌어요" },
    ],
    patterns: [
      { student: "김민준", pattern: "빨강 2일 연속", detail: "9/14, 9/15 등교", tone: "check" },
      { student: "한지훈", pattern: "면담 필요 신호 반복", detail: "9/9, 9/11, 9/15 대화에서 기록", tone: "check" },
      { student: "이서연", pattern: "남색 응답 반복", detail: "최근 2주 3회", tone: "watch" },
      { student: "박예린", pattern: "노랑 4일 연속", detail: "9/10 ~ 9/15", tone: "repeat" },
    ],
    participation: { absentIds: [16], weeklyAverageRate: 88, recentRates: [95, 85, 95, 80, 95] },
    conflictPairs: [
      [1, 13],
      [3, 7],
    ],
    vocabStep: 1,
  },

  "2026-09-14": {
    weather: {
      kind: "sunny",
      headline: "맑음",
      question: "우리 반 마음에는 어떤 날씨가 찾아왔을까요?",
      support: "한 주를 가볍게 시작한 날이었어요.",
    },
    classroomDelta: "등교와 하교의 색이 거의 같았어요. 큰 변화가 없던 날이에요.",
    recentWeather: ["partly", "sunny", "partly", "cloudy", "sunny"],
    mood: {
      green: [2, 4, 5, 6, 7, 8, 11, 12, 14, 15, 19],
      yellow: [3, 10, 13, 18],
      red: [1],
      navy: [17],
    },
    watch: [
      { studentId: 1, name: "김민준", initial: "민", tone: "red", status: "빨강 선택", reason: "주말 이후 첫 등교에서 색이 바뀌었어요" },
      { studentId: 17, name: "오지안", initial: "지", tone: "navy", status: "혼자 있을 시간이 필요해요", reason: "3주째 친구 이야기가 나오지 않았어요" },
    ],
    praise: [
      { studentId: 2, name: "이서연", initial: "서", tone: "star", status: "남색 → 초록", reason: "지난주보다 말수가 늘었어요" },
      { studentId: 4, name: "최하준", initial: "하", tone: "star", status: "11일 연속 초록", reason: "꾸준히 자기 기분을 설명해요" },
      { studentId: 11, name: "김다은", initial: "다", tone: "star", status: "감정 어휘 +3", reason: "지난주에 표현이 크게 늘었어요" },
    ],
    patterns: [
      { student: "오지안", pattern: "3주간 친구 언급 없음", detail: "8/24 이후 대화에서 또래 이름이 나오지 않음", tone: "check" },
      { student: "박예린", pattern: "노랑 3일 연속", detail: "9/10, 9/11, 9/14", tone: "repeat" },
      { student: "이서연", pattern: "남색 응답 반복", detail: "최근 2주 2회", tone: "watch" },
    ],
    participation: { absentIds: [9, 16, 20], weeklyAverageRate: 85, recentRates: [85, 95, 80, 95, 85] },
    conflictPairs: [
      [1, 13],
      [3, 7],
    ],
    vocabStep: 2,
  },
};

/* ══ 조립 ════════════════════════════════════════════════════════════ */

export type DashboardData = {
  dateKey: string;
  isToday: boolean;
  briefing: { watch: BriefingStudent[]; praise: BriefingStudent[] };
  classroom: {
    weather: ClassroomWeather;
    delta: string;
    mood: MoodShare[];
    recentDays: ClassroomDay[];
  };
  patterns: PatternRow[];
  participation: ParticipationSummary;
  relation: { nodes: RelationNode[]; edges: RelationEdge[] };
  conflicts: ConflictRow[];
  vocab: { students: VocabStudent[]; trend: VocabMonth[] };
};

function buildMood(snapshot: DaySnapshot): MoodShare[] {
  const checkedIn = CLASS_SIZE - snapshot.participation.absentIds.length;
  return SIGNAL_ORDER.map((color) => {
    const ids = snapshot.mood[color];
    return {
      color,
      count: ids.length,
      pct: Math.round((ids.length / checkedIn) * 1000) / 10,
      students: ids.map((studentId) => ({ studentId, name: STUDENT_NAMES[studentId] })),
    };
  });
}

function buildRelation(snapshot: DaySnapshot): DashboardData["relation"] {
  const isConflict = (a: number, b: number) =>
    snapshot.conflictPairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

  const conflictIds = new Set(snapshot.conflictPairs.flat());

  return {
    nodes: RELATION_NODE_BASE.map((n) => ({
      ...n,
      tone: ISOLATED_IDS.includes(n.studentId)
        ? "isolated"
        : conflictIds.has(n.studentId)
          ? "conflict"
          : "normal",
    })),
    edges: RELATION_EDGE_BASE.map((e) => ({
      ...e,
      kind: isConflict(e.from, e.to) ? "conflict" : "normal",
    })),
  };
}

function buildVocab(snapshot: DaySnapshot): DashboardData["vocab"] {
  const students: VocabStudent[] = VOCAB_BASE.map((v) => ({
    studentId: v.studentId,
    name: STUDENT_NAMES[v.studentId],
    count: Math.max(3, v.count - snapshot.vocabStep),
    delta: Math.max(0, v.delta - snapshot.vocabStep),
  }));
  const average =
    Math.round((students.reduce((sum, s) => sum + s.count, 0) / students.length) * 10) / 10;
  return { students, trend: [...VOCAB_TREND_BASE, { month: "9월", average }] };
}

/** 선택한 날짜의 대시보드 데이터 한 벌. 실데이터 연결 시 이 함수 안만 쿼리 호출로 바꾸면 된다. */
export function getDashboardSnapshot(dateKey: string): DashboardData {
  const key = SNAPSHOTS[dateKey] ? dateKey : DASHBOARD_TODAY;
  const snapshot = SNAPSHOTS[key];
  const schoolDays = recentSchoolDays(key, 5);

  return {
    dateKey: key,
    isToday: key === DASHBOARD_TODAY,
    briefing: { watch: snapshot.watch, praise: snapshot.praise },
    classroom: {
      weather: snapshot.weather,
      delta: snapshot.classroomDelta,
      mood: buildMood(snapshot),
      recentDays: schoolDays.map((date, i) => ({
        date: shortDate(date),
        weekday: weekdayOf(date),
        kind: snapshot.recentWeather[i],
        isToday: date === key,
      })),
    },
    patterns: snapshot.patterns,
    participation: {
      date: key,
      completedCount: CLASS_SIZE - snapshot.participation.absentIds.length,
      totalCount: CLASS_SIZE,
      weeklyAverageRate: snapshot.participation.weeklyAverageRate,
      absentStudents: snapshot.participation.absentIds.map((studentId) => ({
        studentId,
        name: STUDENT_NAMES[studentId],
      })),
      recentDays: schoolDays.map((date, i) => ({
        date: shortDate(date),
        weekday: weekdayOf(date),
        rate: snapshot.participation.recentRates[i],
        isToday: date === key,
      })),
    },
    relation: buildRelation(snapshot),
    conflicts: CONFLICT_LEDGER.filter((c) => c.date <= key).slice(0, 2),
    vocab: buildVocab(snapshot),
  };
}

/* ── 사용 중단 (기존 ColorSummaryBar.tsx 가 아직 import 하고 있어 유지) ──
   대시보드에서는 "오늘의 교실" 카드가 같은 집계를 흡수했다. */
export const COLOR_STATS = {
  morning: getDashboardSnapshot(DASHBOARD_TODAY).classroom.mood.map((m) => ({
    color: m.color,
    count: m.count,
    pct: m.pct,
  })),
  afternoon: getDashboardSnapshot(DASHBOARD_TODAY).classroom.mood.map((m) => ({
    color: m.color,
    count: m.count,
    pct: m.pct,
  })),
};
