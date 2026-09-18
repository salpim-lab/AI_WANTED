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
//   감정 어휘는 app/api/ai/vocab-growth
//
// 대시보드는 읽기 전용이다 (살핌_DB_스키마_v0.3.md §13) — 어떤 원본 테이블에도 쓰지 않는다.
// UI/URL 에 노출하는 식별자는 student_id 다. enrollment_id 는 repository 내부 변환용.
//
// studentId 는 components/teacher/students/mockData.ts(김현우)의 STUDENTS 명단과 같은 번호를 쓴다
// — /students/[id] 링크가 실제로 열리게 하기 위함. (해당 파일은 import 하지 않는다: 소유자 분리)

import type { SignalColor } from "@/lib/types/signal";
// 헤더의 "오늘 날짜"(components/teacher/CurrentDate.tsx)와 같은 기준을 써야
// 상단 날짜와 대시보드의 "오늘"이 어긋나지 않는다. 둘 다 Asia/Seoul 기준이다.
import { todayKst } from "@/components/shared/datetime";
// 아침 브리핑 판정은 여기 없다 — 규칙과 문구는 lib/briefing, 조립은 queries/morningBriefing 이 갖는다.
import type { StudentFacts } from "@/lib/briefing/triggers";
import { isDistressWord } from "@/lib/vocab/lexicon";
import { BRIEFING_HISTORY_DAYS, buildBriefingRows, type BriefingRow } from "@/lib/supabase/queries/morningBriefing";

/* ══ 날짜 유틸 ═══════════════════════════════════════════════════════
   날짜 문자열 산술은 전부 UTC 기준으로 계산한다 (로컬 타임존에 흔들리지 않게).
   "지금이 며칠인가"만 todayKst() 로 한국 시각에서 가져온다. */

const KO_WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-09-16" → "수" */
export function weekdayOf(dateKey: string): string {
  return KO_WEEKDAY[new Date(`${dateKey}T00:00:00Z`).getUTCDay()];
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

/** 오늘부터 거슬러 k 번째 수업일. schoolDayAgo(0) = 오늘(주말이면 가장 가까운 지난 수업일) */
function schoolDayAgo(k: number): string {
  return recentSchoolDays(todayKst(), k + 1)[0];
}

/** "2026-09-18" → "9월 18일" — 갈등 기록 제목처럼 문장 안에 들어가는 표기 */
function monthDayLabel(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

/** from ~ to 사이의 수업일 (양끝 포함, 오래된 날 → 최근 날) */
function schoolDaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/* ══ 선택 가능한 날짜 ════════════════════════════════════════════════
   mock 스냅샷은 특정 날짜에 묶여 있지 않다. "이번 달 1일부터 오늘까지의 수업일" 전부에 얹는다.
   상단 헤더가 실제 오늘을 그리므로 여기가 멈춰 있으면 두 날짜가 어긋난다.
   자정을 넘겨도 맞아야 해서 상수가 아니라 함수다 — 서버 프로세스가 오래 떠 있어도 안전하다. */

/** 대시보드가 보여줄 수 있는 날짜 (오래된 날 → 오늘) */
export function dashboardDates(): string[] {
  const today = todayKst();
  const days = schoolDaysBetween(`${today.slice(0, 8)}01`, today);
  // 달이 주말로 시작하면 이번 달 수업일이 아직 없다 — 가장 가까운 지난 수업일 하나라도 둔다.
  return days.length ? days : [schoolDayAgo(0)];
}

export function dashboardToday(): string {
  return schoolDayAgo(0);
}

export function dashboardMinDate(): string {
  return dashboardDates()[0];
}

/** ?date= 쿼리를 안전한 dateKey 로 정규화. 모르는 값·미래 날짜는 전부 오늘로 되돌린다. */
export function resolveDateKey(raw?: string | string[]): string {
  const dates = dashboardDates();
  const today = dates[dates.length - 1];
  const min = dates[0];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return today;
  if (value > today) return today;
  if (value < min) return min;
  // 스냅샷이 없는 날(주말 등)은 가장 가까운 과거 스냅샷으로
  return [...dates].reverse().find((d) => d <= value) ?? today;
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
  pair: string;
  pairIds: [number, number];
  summary: string;
  status: string;
  statements: ConflictStatement[];
  warn?: string;
};

/** 갈등은 오늘 / 그저께 / 1주 전 / 2주 반 전에 있었던 일로 둔다 — 날짜가 today 를 따라 움직인다.
    가장 오래된 한 건은 달 초 날짜를 골라도 갈등 기록이 비지 않게 하려고 멀리 둔다. */
function conflictLedger(): ConflictRow[] {
  const [today, twoDaysAgo, older, oldest] = [
    schoolDayAgo(0),
    schoolDayAgo(2),
    schoolDayAgo(5),
    schoolDayAgo(12),
  ];
  return [
  {
    date: today,
    label: monthDayLabel(today),
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
    date: twoDaysAgo,
    label: monthDayLabel(twoDaysAgo),
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
    date: older,
    label: monthDayLabel(older),
    pair: "박예린 ↔ 김준혁",
    pairIds: [3, 7],
    summary: "역할 분담으로 다툼",
    status: "담임 중재 완료",
    statements: [
      { who: "박예린 (하교)", tone: "yellow", text: "준혁이가 자기 맡은 걸 안 해서 제가 다 했어요." },
      { who: "김준혁 (하교)", tone: "muted", text: "예린이가 제 몫까지 먼저 해버려서 할 게 없었어요." },
    ],
  },
  {
    date: oldest,
    label: monthDayLabel(oldest),
    pair: "한지훈 ↔ 박수빈",
    pairIds: [13, 8],
    summary: "놀이 규칙으로 다툼",
    status: "담임 중재 완료",
    statements: [
      { who: "한지훈 (하교)", tone: "yellow", text: "수빈이가 자꾸 규칙을 바꿔서 그만하자고 했어요." },
      { who: "박수빈 (하교)", tone: "muted", text: "처음에 정한 게 헷갈려서 다시 말한 거예요." },
    ],
  },
  ];
}

/* ── 감정 어휘 (누적값. 날짜별로는 스냅샷의 growthStep 만큼 낮춰 쓴다) ──
   → app/api/ai/vocab-growth/route.ts */
export type VocabStudent = {
  studentId: number;
  name: string;
  count: number;
  delta: number;
  /** 그 아이가 쓴 표제어 (먼저 쓴 순). 길이는 항상 count 와 같다 — 숫자와 명단이 어긋날 수 없다. */
  words: string[];
};
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

/** 아이들이 대체로 익히는 순서 (기본형 → 확장형). 값은 lib/vocab/lexicon.ts 의 표제어 그대로다
    — mock 과 실제 추출 결과가 같은 말을 써야 나중에 갈아끼울 때 화면이 안 바뀐다. */
const VOCAB_ORDER = [
  "좋다", "싫다", "재미있다", "화나다", "슬프다", "무섭다", "심심하다",
  "힘들다", "기쁘다", "속상하다", "짜증나다", "신나다", "걱정되다",
  "부끄럽다", "억울하다", "뿌듯하다", "고맙다", "답답하다", "외롭다", "긴장되다",
];

/** 아이마다 빠진 자리를 다르게 둬서 같은 개수라도 쓴 말이 겹치지 않게 한다. */
function vocabWordsFor(studentId: number, count: number): string[] {
  const skip = (studentId * 5) % 9;
  return VOCAB_ORDER.filter((_, i) => i % 9 !== skip).slice(0, count);
}

/** 지난 4달의 학급 평균 — 이미 지나간 값이라 선택 날짜와 무관하다.
    이번 달 누적보다 항상 낮아야 앞뒤가 맞는다. 달 이름은 오늘 기준으로 거슬러 붙인다. */
const VOCAB_TREND_AVERAGES = [4.8, 5.9, 6.7, 7.6];

function vocabTrendBase(): VocabMonth[] {
  const month = Number(todayKst().slice(5, 7));
  return VOCAB_TREND_AVERAGES.map((average, i) => ({
    // 4달 전부터 지난달까지. 1월이면 지난달이 12월이 되도록 12로 감싼다.
    month: `${((month - VOCAB_TREND_AVERAGES.length + i - 1 + 12) % 12) + 1}월`,
    average,
  }));
}

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

/* ── 교실 날씨 판정 ──────────────────────────────────────────────────
   그날 등교 체크인 색 분포 하나로 정한다. 손으로 적지 않는다 —
   mood 를 고치면 날씨도 따라 움직여야 "교실의 상태"를 보여준다고 말할 수 있다.

   남색은 계산에서 뺀다. "혼자 있을래요"는 나쁜 하루가 아니라 필요한 거리라서,
   부정으로 세면 조용한 아이가 많은 반은 늘 비가 온다.
   (살핌_기획안.md 8.5 "색 앵커: 초록/노랑/빨강 3단계 · 남색은 제외")

   점수 = (초록 + 노랑×0.5) / (초록+노랑+빨강),  0(전원 빨강) ~ 1(전원 초록)
     0.80 이상  맑음        0.70 이상  대체로 맑음
     0.55 이상  구름 조금   0.35 이상  흐림        그 미만  비

   빨강 비중 단서 조항: 초록이 많아도 속상한 아이가 몰려 있으면 맑다고 하지 않는다.
     빨강 30% 이상 → 최소 흐림,  45% 이상 → 비 */

export const WEATHER_QUESTION = "우리 반 마음에는 어떤 날씨가 찾아왔을까요?";

export function deriveWeather(mood: Record<SignalColor, number[]>): {
  kind: WeatherKind;
  headline: string;
} {
  const green = mood.green.length;
  const yellow = mood.yellow.length;
  const red = mood.red.length;
  const anchored = green + yellow + red;

  // 남색만 있거나 아무도 체크인하지 않은 날은 판정하지 않는다.
  if (anchored === 0) return { kind: "cloudy", headline: "아직 알 수 없음" };

  const score = (green + yellow * 0.5) / anchored;
  const redShare = red / anchored;

  let kind: WeatherKind =
    score >= 0.7 ? "sunny" : score >= 0.55 ? "partly" : score >= 0.35 ? "cloudy" : "rainy";
  if (redShare >= 0.45) kind = "rainy";
  else if (redShare >= 0.3 && (kind === "sunny" || kind === "partly")) kind = "cloudy";

  const headline =
    kind === "sunny" ? (score >= 0.8 ? "맑음" : "대체로 맑음")
    : kind === "partly" ? "구름 조금"
    : kind === "cloudy" ? "흐림"
    : "비";

  return { kind, headline };
}

export type ClassroomDay = {
  weekday: string;
  date: string;
  kind: WeatherKind;
  isToday?: boolean;
};

/** 아침 브리핑 행. status/reason 은 lib/briefing 의 규칙과 템플릿이 만든다 — 여기서 적지 않는다.
    이름 첫 글자 대신 색 동그라미만 쓴다: 교사가 훑을 때 읽어야 할 건 글자가 아니라 색이다. */
export type BriefingStudent = BriefingRow;

/** "오늘의 교실" 카드 안 참여 인원 줄 */
export type ParticipationSummary = {
  date: string;
  /** absentStudents 에서 파생된다 — 숫자와 명단이 어긋날 수 없다 */
  completedCount: number;
  totalCount: number;
  /** 그날 체크인을 완료하지 않은 아이들 */
  absentStudents: StudentRef[];
};

/* ══ 날짜별 스냅샷 ═══════════════════════════════════════════════════
   날짜마다 "다른 것"만 적는다. 나머지는 위 공통 데이터에서 파생시킨다. */

/** 하루치 중 "손으로 적는" 부분. 색 분포는 여기 없다 — 아래 moodOn 이 아이별 성향에서 만든다. */
type DayNarrative = {
  /** 날씨 아래 한 줄. kind/headline 은 mood 에서 유도하므로 여기 적지 않는다. */
  weatherSupport: string;
  classroomDelta: string;
  /** 스냅샷이 없는 과거 수업일의 날씨 (오래된 날 → 선택 날짜 순).
      SNAPSHOTS 에 있는 날은 이 값 대신 그날 mood 에서 유도한다. */
  recentWeather: WeatherKind[];
  /** 그날 기준 관계 지도에서 갈등으로 표시할 짝 */
  conflictPairs: [number, number][];
  /** 그 시점까지의 누적 어휘가 얼마나 적었는지 (오늘=0) */
  vocabStep: number;
};

type DaySnapshot = DayNarrative & {
  /** 감정 색별 학생 id — 체크인을 완료한 아이만 들어간다.
      합 + absentIds.length 가 반드시 CLASS_SIZE 여야 한다. */
  mood: Record<SignalColor, number[]>;
  /** 그날 체크인을 완료하지 않은 아이 id */
  participation: { absentIds: number[] };
};

/* 스냅샷은 특정 날짜에 묶여 있지 않다. 각자 "자기 날짜(ref)"를 받아서
   본문에 들어가는 날짜 문구까지 그 기준으로 만든다 — 오늘이 바뀌면 문구도 따라 움직인다. */

/** ref 에서 거슬러 k 번째 수업일 */
function schoolDayBefore(ref: string, k: number): string {
  return recentSchoolDays(ref, k + 1)[0];
}

function profileA(ref: string, vocabStep: number): DayNarrative {
  return {
    weatherSupport: "아이들 각자의 마음도 함께 살펴주세요.",
    classroomDelta: "오후에는 초록이 2명 줄고 속상해요가 1명 늘었어요.",
    recentWeather: ["partly", "cloudy", "sunny", "partly", "sunny"],
    conflictPairs: [
      [1, 2],
      [1, 13],
    ],
    vocabStep,
  };
}

function profileB(ref: string, vocabStep: number): DayNarrative {
  return {
    weatherSupport: "속상한 아이가 어제보다 한 명 더 있었어요.",
    classroomDelta: "하교에는 초록이 1명 늘었어요. 오후가 오전보다 나은 날이었어요.",
    recentWeather: ["sunny", "partly", "cloudy", "sunny", "partly"],
    conflictPairs: [
      [1, 13],
      [3, 7],
    ],
    vocabStep,
  };
}

function profileC(ref: string, vocabStep: number): DayNarrative {
  return {
    weatherSupport: "한 주를 가볍게 시작한 날이었어요.",
    classroomDelta: "등교와 하교의 색이 거의 같았어요. 큰 변화가 없던 날이에요.",
    recentWeather: ["partly", "sunny", "partly", "cloudy", "sunny"],
    conflictPairs: [
      [1, 13],
      [3, 7],
    ],
    vocabStep,
  };
}

/** 하루치 mock 을 세 가지 모양으로만 둔다 — 이번 달 수업일에 돌아가며 얹는다.
    (실데이터가 붙으면 이 배열 자리가 그날 쿼리 결과로 바뀐다) */
const DAY_PROFILES = [profileA, profileB, profileC];

/** 누적 어휘는 과거로 갈수록 적어야 한다. 수업일 2일마다 1개씩 낮춘다 (최소 3개는 남는다). */
function vocabStepFor(daysBack: number): number {
  return Math.min(6, Math.floor(daysBack / 2));
}

/* ── 그날 그 아이가 고른 색 ──────────────────────────────────────────
   색은 프로필에 적지 않고 아이별 성향에서 만든다.

   왜: 브리핑의 기준선 규칙은 "이 아이의 평소와 다른가"를 본다. 모든 아이가 매일 같은 색이면
   평소라는 게 없어서 규칙이 한 번도 걸리지 않고, 매일 같은 이름만 뜬다.
   아이마다 다른 분포로 흔들려야 "늘 초록이던 아이의 노랑"이 잡힌다.

   날짜+학생으로만 정해지는 해시라 같은 날을 몇 번 열어도 같은 색이 나온다. */

/** [초록, 노랑, 빨강, 남색] 가중치 — 아이마다 평소 색 분포가 다르다 */
const DISPOSITION: Record<number, [number, number, number, number]> = {
  1: [2, 3, 5, 0],   2: [5, 2, 1, 4],   3: [3, 4, 3, 0],   4: [9, 1, 0, 0],
  5: [7, 2, 1, 0],   6: [6, 3, 1, 0],   7: [4, 4, 2, 0],   8: [7, 2, 1, 0],
  9: [6, 3, 1, 0],  10: [3, 6, 1, 0],  11: [8, 2, 0, 0],  12: [6, 3, 1, 0],
  13: [4, 3, 3, 0], 14: [7, 2, 1, 0],  15: [6, 3, 1, 0],  16: [5, 3, 2, 0],
  17: [4, 3, 1, 4], 18: [3, 5, 2, 0],  19: [8, 2, 0, 0],  20: [5, 4, 1, 0],
};

/** 날짜+학생 → 0~1. 같은 입력이면 항상 같은 값 (mulberry 계열의 아주 단순한 형태). */
function hash01(date: string, studentId: number, salt = 0): number {
  let h = 2166136261 ^ salt;
  const key = `${date}#${studentId}`;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** 그날 체크인을 안 한 아이인지 — 하루에 대략 2명 */
function isAbsentOn(date: string, studentId: number): boolean {
  return hash01(date, studentId, 7) < 0.1;
}

/** 그날 그 아이가 고른 색. 체크인을 안 했으면 null */
function colorOn(date: string, studentId: number): SignalColor | null {
  if (isAbsentOn(date, studentId)) return null;
  const weights = DISPOSITION[studentId] ?? [6, 3, 1, 0];
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = hash01(date, studentId) * total;
  for (let i = 0; i < SIGNAL_ORDER.length; i++) {
    roll -= weights[i];
    if (roll < 0) return SIGNAL_ORDER[i];
  }
  return "green";
}

/** 그날 반 전체의 색 분포 + 미참여 명단 */
function moodOn(date: string): { mood: Record<SignalColor, number[]>; absentIds: number[] } {
  const mood: Record<SignalColor, number[]> = { green: [], yellow: [], red: [], navy: [] };
  const absentIds: number[] = [];
  for (const id of Object.keys(STUDENT_NAMES).map(Number)) {
    const color = colorOn(date, id);
    if (color === null) absentIds.push(id);
    else mood[color].push(id);
  }
  return { mood, absentIds };
}

/** 아무 수업일이나 그날 스냅샷. 화면에 뜨는 이번 달뿐 아니라, 기준선 계산용으로
    달 이전까지 거슬러 올라가며 만들어야 해서 날짜만으로 결정되어야 한다. */
function snapshotOn(date: string): DaySnapshot {
  const daysBack = Math.max(0, schoolDaysBetween(date, dashboardToday()).length - 1);
  const { mood, absentIds } = moodOn(date);
  return {
    ...DAY_PROFILES[daysBack % DAY_PROFILES.length](date, vocabStepFor(daysBack)),
    mood,
    participation: { absentIds },
  };
}

/** 이번 달 1일부터 오늘까지의 모든 수업일에 스냅샷을 얹는다. */
function buildSnapshots(): Record<string, DaySnapshot> {
  const out: Record<string, DaySnapshot> = {};
  for (const date of dashboardDates()) out[date] = snapshotOn(date);
  return out;
}

/* ── 아침 브리핑 입력 ────────────────────────────────────────────────
   판정은 lib/briefing 이 한다. 여기서는 그 규칙이 읽을 사실만 스냅샷에서 긁어 담는다
   — 실데이터로 바꿀 때 lib/supabase/queries/morningBriefing.ts 가 같은 모양을 만들면 된다. */

/** 그날 대화에서 뽑힌 감정 표제어 — 실제로는 analysis_runs(emotion_vocab)의 result 다.
    그 아이가 쓸 줄 아는 말(vocabWordsFor) 중에서 그날 한두 개를 고른 것으로 흉내 낸다. */
function lemmasOn(date: string, studentId: number): { lemma: string; quote?: string }[] {
  const known = vocabWordsFor(studentId, VOCAB_BASE.find((v) => v.studentId === studentId)?.count ?? 8);
  // 절반 정도의 날은 기분을 말하지 않고 지나간다.
  if (!known.length || hash01(date, studentId, 21) < 0.5) return [];
  const hard = known.filter(isDistressWord);
  const soft = known.filter((w) => !isDistressWord(w));
  // 힘든 말은 드물게 나온다. 여기를 높이면 "색과 말이 달라요"가 브리핑을 다 덮어버린다
  // — 그런 반이라면 규칙이 아니라 교실에 먼저 손을 써야 한다.
  const pool = hash01(date, studentId, 27) < 0.15 && hard.length ? hard : soft.length ? soft : hard;
  const pick = pool[Math.floor(hash01(date, studentId, 33) * pool.length)];
  return [{ lemma: pick, quote: MOCK_QUOTE[pick] }];
}

/** 근거 인용 — 실제로는 추출기가 학생 발화에서 그대로 잘라 온 문장이다. */
const MOCK_QUOTE: Record<string, string> = {
  속상하다: "진짜 속상했어요",
  억울하다: "저만 혼나서 억울했어요",
  외롭다: "쉬는 시간에 혼자 있었어요",
  답답하다: "말이 잘 안 나왔어요",
  힘들다: "오늘은 좀 힘들었어요",
  부끄럽다: "애들이 다 봐서 부끄러웠어요",
  걱정되다: "내일 발표가 걱정돼요",
  무섭다: "조금 무서웠어요",
  짜증나다: "계속 안 돼서 짜증났어요",
};

/** 색 말고는 mock 에 근거가 없는 신호들 — 화면에서 규칙이 도는 걸 보려고 몇 개만 심어둔다. */
const MOCK_SIGNALS: Record<number, { speechRatio?: number; peerMentionGapWeeks?: number; emotionWordGap?: number }> = {
  1: { speechRatio: 0.6 },        // 김민준 — 말수가 줄었다
  17: { peerMentionGapWeeks: 3 }, // 오지안 — 3주째 친구 이름이 안 나온다
  13: { emotionWordGap: 3 },      // 한지훈 — 최근 세 번의 대화에서 기분을 말하지 않았다
};

function buildBriefingFacts(dateKey: string): StudentFacts[] {
  const pastDays = recentSchoolDays(schoolDayBefore(dateKey, 1), BRIEFING_HISTORY_DAYS);
  const ledger = conflictLedger();

  return Object.entries(STUDENT_NAMES).map(([id, name]) => {
    const studentId = Number(id);
    const history = pastDays
      .map((date) => ({ date, color: colorOn(date, studentId) }))
      .filter((h): h is { date: string; color: SignalColor } => h.color !== null);

    const lastConflict = ledger.find((c) => c.date <= dateKey && c.pairIds.includes(studentId));
    const todayLemmas = lemmasOn(dateKey, studentId);

    return {
      studentId,
      name,
      todayColor: colorOn(dateKey, studentId),
      history,
      // 최근 2주 = 수업일 10일
      navyCountLast2Weeks: history.slice(-10).filter((h) => h.color === "navy").length,
      lastConflict: lastConflict && { date: lastConflict.date, resolved: lastConflict.status !== "진술 확인 중" },
      prosody: MOCK_SIGNALS[studentId]?.speechRatio ? { speechRatio: MOCK_SIGNALS[studentId].speechRatio } : undefined,
      peerMentionGapWeeks: MOCK_SIGNALS[studentId]?.peerMentionGapWeeks ?? null,
      emotionWordGap: MOCK_SIGNALS[studentId]?.emotionWordGap ?? 0,
      todayLemmas,
      // 오늘 쓴 말 중 지난 30일에 한 번도 안 나온 것 = 오늘 처음 쓴 말
      newLemmas: todayLemmas
        .map((w) => w.lemma)
        .filter((lemma) => !pastDays.some((d) => lemmasOn(d, studentId).some((w) => w.lemma === lemma))),
    };
  });
}

/* ══ 조립 ════════════════════════════════════════════════════════════ */

export type DashboardData = {
  dateKey: string;
  isToday: boolean;
  briefing: { watch: BriefingStudent[] };
  classroom: {
    weather: ClassroomWeather;
    delta: string;
    mood: MoodShare[];
    recentDays: ClassroomDay[];
  };
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
  const students: VocabStudent[] = VOCAB_BASE.map((v) => {
    const count = Math.max(3, v.count - snapshot.vocabStep);
    return {
      studentId: v.studentId,
      name: STUDENT_NAMES[v.studentId],
      count,
      delta: Math.max(0, v.delta - snapshot.vocabStep),
      words: vocabWordsFor(v.studentId, count),
    };
  });
  const average =
    Math.round((students.reduce((sum, s) => sum + s.count, 0) / students.length) * 10) / 10;
  const thisMonth = `${Number(todayKst().slice(5, 7))}월`;
  return { students, trend: [...vocabTrendBase(), { month: thisMonth, average }] };
}

/** 선택한 날짜의 대시보드 데이터 한 벌. 실데이터 연결 시 이 함수 안만 쿼리 호출로 바꾸면 된다. */
export function getDashboardSnapshot(dateKey: string): DashboardData {
  const snapshots = buildSnapshots();
  const today = dashboardToday();
  const key = snapshots[dateKey] ? dateKey : today;
  const snapshot = snapshots[key];
  const schoolDays = recentSchoolDays(key, 5);

  return {
    dateKey: key,
    isToday: key === today,
    briefing: { watch: buildBriefingRows(buildBriefingFacts(key), key) },
    classroom: {
      weather: {
        ...deriveWeather(snapshot.mood),
        question: WEATHER_QUESTION,
        support: snapshot.weatherSupport,
      },
      delta: snapshot.classroomDelta,
      mood: buildMood(snapshot),
      // 스냅샷이 있는 날은 큰 아이콘과 같은 규칙으로 유도한다 — 둘이 어긋나면 안 된다.
      recentDays: schoolDays.map((date, i) => ({
        date: shortDate(date),
        weekday: weekdayOf(date),
        kind: snapshots[date] ? deriveWeather(snapshots[date].mood).kind : snapshot.recentWeather[i],
        isToday: date === key,
      })),
    },
    participation: {
      date: key,
      completedCount: CLASS_SIZE - snapshot.participation.absentIds.length,
      totalCount: CLASS_SIZE,
      absentStudents: snapshot.participation.absentIds.map((studentId) => ({
        studentId,
        name: STUDENT_NAMES[studentId],
      })),
    },
    relation: buildRelation(snapshot),
    conflicts: conflictLedger().filter((c) => c.date <= key).slice(0, 2),
    vocab: buildVocab(snapshot),
  };
}

/* ── 사용 중단 (기존 ColorSummaryBar.tsx 가 아직 import 하고 있어 유지) ──
   대시보드에서는 "오늘의 교실" 카드가 같은 집계를 흡수했다. */
export function colorStats() {
  const mood = getDashboardSnapshot(dashboardToday()).classroom.mood.map((m) => ({
    color: m.color,
    count: m.count,
    pct: m.pct,
  }));
  return { morning: mood, afternoon: mood };
}
