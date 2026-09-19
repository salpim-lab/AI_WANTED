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
import { addDays, todayKst } from "@/components/shared/datetime";
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

/** dateKey 를 포함해 거슬러 올라간 수업일 count 개 (오래된 날짜부터). 주말도 수업일이다 (2026-09-19 결정) */
function recentSchoolDays(dateKey: string, count: number): string[] {
  const out: string[] = [];
  const cursor = new Date(`${dateKey}T00:00:00Z`);
  while (out.length < count) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return out.reverse();
}

/** 오늘부터 거슬러 k 번째 수업일. schoolDayAgo(0) = 오늘 */
function schoolDayAgo(k: number): string {
  return recentSchoolDays(todayKst(), k + 1)[0];
}

/** "2026-09-18" → "9월 18일" — 갈등 기록 제목처럼 문장 안에 들어가는 표기 */
function monthDayLabel(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

/** from ~ to 사이의 수업일 (양끝 포함, 오래된 날 → 최근 날). 주말도 수업일이다 */
function schoolDaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/* ══ 선택 가능한 날짜 ════════════════════════════════════════════════
   mock 스냅샷은 특정 날짜에 묶여 있지 않다. "이번 달 1일부터 오늘까지" 전부에 얹는다.
   주말도 포함한다 — 예전에는 수업일만 뒀는데, 오늘이 토요일이면 대시보드의 "오늘"이
   금요일로 밀려서 상단 헤더(실제 오늘)와 날짜가 어긋났다. 주말에도 교사는 지난 한 주를 본다.
   자정을 넘겨도 맞아야 해서 상수가 아니라 함수다 — 서버 프로세스가 오래 떠 있어도 안전하다. */

/** 대시보드가 보여줄 수 있는 날짜 (오래된 날 → 오늘) */
export function dashboardDates(): string[] {
  const today = todayKst();
  const out: string[] = [];
  for (let cursor = `${today.slice(0, 8)}01`; cursor <= today; cursor = addDays(cursor, 1)) out.push(cursor);
  return out;
}

/** 대시보드의 "오늘" — 달력·헤더가 말하는 오늘과 같은 날이다 (주말도 그대로) */
export function dashboardToday(): string {
  return todayKst();
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
  // 목록에 없는 날은 가장 가까운 과거 날짜로
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
  /** 원 반지름. 자리(x·y)는 "얼마나 많이 불렸나", 크기는 "얼마나 살펴볼 일이 있나"를 말한다.
      둘을 같은 값으로 두면 가운데 큰 원이 곧 인기 많은 아이가 되는데, 지도가 찾아야 하는
      아이는 그 반대편(아무도 이름을 안 부른 아이)이라 기준을 갈라 뒀다 — attentionOf 참고. */
  r: number;
  /** 점선으로 그릴지(이름이 안 나온 아이) 여부. 원 아래 붙던 설명 한 줄은 뺐다 —
      아래 범례가 점선 하나로 같은 말을 하고 있었다 (RelationshipMap 참고). */
  tone: "normal" | "conflict" | "isolated";
};

export type RelationEdge = {
  from: number;
  to: number;
  kind: "normal" | "conflict";
  /** 그 기간에서 가장 자주 오간 짝을 1 로 둔 상대값 — 선 굵기에 쓴다 */
  strength: number;
};

/** 관계 지도에서 아이를 눌렀을 때 옆에 펼칠 내용. 아이 상세로 넘어가지 않고 여기서 끝난다. */
export type RelationDetail = {
  studentId: number;
  name: string;
  /** 다른 아이 대화에 이 아이 이름이 나온 횟수 — 지도의 원 크기와 같은 수 */
  mentionCount: number;
  /** 대화에서 이 아이 이름이 나온 대목. 실제로는 전사에서 그대로 잘라 온다 */
  quotes: { from: string; date: string; text: string }[];
  /** 이 아이가 낀 갈등 (최근 것부터) */
  conflicts: ConflictRow[];
};

/** 선 하나를 눌렀을 때 — "이 선이 왜 생겼나"에 답하는 데 필요한 것만. */
export type RelationPairDetail = {
  a: { studentId: number; name: string };
  b: { studentId: number; name: string };
  /** 두 아이가 서로를 말한 총 횟수 */
  mentionCount: number;
  quotes: { from: string; date: string; text: string }[];
  conflicts: ConflictRow[];
};

/** 아이 이름을 문장에 넣는 꼴. 받침이 있으면 "이"가 붙는다 — 민준이가 / 지우가. */
function callName(given: string): string {
  const last = given.charCodeAt(given.length - 1) - 0xac00;
  const hasFinalConsonant = last >= 0 && last <= 11171 && last % 28 !== 0;
  return hasFinalConsonant ? `${given}이` : given;
}

/** 또래 언급 발췌 — 실제로는 전사 원문이다. 해석하지 않고 그대로 보여주기 위한 자리. */
const MENTION_QUOTE = [
  "{to}랑 같이 놀았어요",
  "{to}가 도와줬어요",
  "쉬는 시간에 {to}랑 이야기했어요",
  "{to}가 먼저 말 걸어줬어요",
  "{to}랑 같은 모둠이었어요",
  "{to}가 제 물건을 안 돌려줬어요",
  "{to}한테 서운했어요",
];

/** 아이마다 또래 대화에 얼마나 자주 오르내리는지. 실제로는 전사에서 이름을 세면 나온다. */
const SOCIAL_WEIGHT: Record<number, number> = {
  1: 9, 2: 7, 3: 8, 4: 6, 5: 5, 6: 4, 7: 5, 8: 6, 9: 3, 10: 3,
  11: 5, 12: 3, 13: 8, 14: 3, 15: 2, 16: 2, 17: 0, 18: 3, 19: 4, 20: 2,
};

/** 관계 지도가 보는 기간. days 는 수업일 수다 (주말도 수업일이라 한 주 = 7일).
    "누적"은 한 학기 남짓을 잡는다 — 무제한으로 두면 3월 기록이 9월 관계를 흔든다. */
export const RELATION_PERIODS = [
  { id: "1w", label: "최근 1주", days: 7 },
  { id: "2w", label: "최근 2주", days: 14 },
  { id: "4w", label: "최근 4주", days: 28 },
  { id: "all", label: "누적", days: 90 },
] as const;

export type RelationPeriod = (typeof RELATION_PERIODS)[number]["id"];

/** 기본은 2주 — 한 주는 우연이 너무 크고, 4주는 이미 정리된 관계까지 끌고 온다. */
export const DEFAULT_RELATION_PERIOD: RelationPeriod = "2w";

export type RelationGraph = {
  nodes: RelationNode[];
  edges: RelationEdge[];
  details: Record<number, RelationDetail>;
  pairs: Record<string, RelationPairDetail>;
  /** 이 기간 안의 갈등 기록 — 아무도 고르지 않았을 때 옆 패널이 보여준다.
      기간 토글과 따로 놀면 "누적"으로 넓혀도 건수가 그대로라 토글이 거짓말을 한다. */
  conflicts: ConflictRow[];
};

/** 아이마다 자주 어울리는 무리. 교실은 스무 명이 골고루 섞이는 곳이 아니라 몇 덩어리로 나뉘고,
    지도가 찾아야 하는 것도 그 덩어리와 거기서 빠진 아이다.
    무리 없이 아무나 언급하게 두면 기간을 넓힐수록 모두가 모두와 이어져 지도가 뜻을 잃는다. */
const CLIQUE: Record<number, number> = {
  1: 0, 2: 0, 3: 0, 13: 0, 8: 0,
  4: 1, 5: 1, 7: 1, 11: 1, 19: 1,
  6: 2, 9: 2, 10: 2, 15: 2, 18: 2,
  12: 3, 14: 3, 16: 3, 20: 3, 17: 3,
};

/** 같은 무리를 말할 확률 */
const SAME_CLIQUE_CHANCE = 0.75;

/** 그날 대화에서 누가 누구를 말했는지. 실제로는 전사에 나온 또래 이름을 매칭한 결과다.
    아이마다 하루 0~2명을 언급하고, 대상은 무리 안에서 고르되 가끔 밖으로 나간다.
    누가 자주 불리는지는 SOCIAL_WEIGHT 로 기운다. */
function mentionsOn(date: string): { from: number; to: number }[] {
  const ids = Object.keys(STUDENT_NAMES).map(Number);
  const weighted = (candidates: number[]) =>
    candidates.flatMap((id) => Array<number>(SOCIAL_WEIGHT[id] ?? 1).fill(id));

  const out: { from: number; to: number }[] = [];
  for (const from of ids) {
    // 체크인을 안 한 날은 대화가 없으니 언급도 없다
    if (isAbsentOn(date, from)) continue;
    const howMany = hash01(date, from, 41) < 0.35 ? 0 : hash01(date, from, 43) < 0.75 ? 1 : 2;
    for (let i = 0; i < howMany; i++) {
      const inside = hash01(date, from, 71 + i) < SAME_CLIQUE_CHANCE;
      const pool = weighted(
        ids.filter((id) => id !== from && (inside ? CLIQUE[id] === CLIQUE[from] : CLIQUE[id] !== CLIQUE[from])),
      );
      if (!pool.length) continue;
      const to = pool[Math.floor(hash01(date, from, 51 + i) * pool.length)];
      if (!out.some((m) => m.from === from && m.to === to)) out.push({ from, to });
    }
  }
  return out;
}

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
  /** 막대 아래에는 학생 명단의 이름만 쓴다. */
  shortName?: string;
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
export type StudentRef = { studentId: string | number; name: string };

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
    vocabStep,
  };
}

function profileB(ref: string, vocabStep: number): DayNarrative {
  return {
    weatherSupport: "속상한 아이가 어제보다 한 명 더 있었어요.",
    classroomDelta: "하교에는 초록이 1명 늘었어요. 오후가 오전보다 나은 날이었어요.",
    recentWeather: ["sunny", "partly", "cloudy", "sunny", "partly"],
    vocabStep,
  };
}

function profileC(ref: string, vocabStep: number): DayNarrative {
  return {
    weatherSupport: "한 주를 가볍게 시작한 날이었어요.",
    classroomDelta: "등교와 하교의 색이 거의 같았어요. 큰 변화가 없던 날이에요.",
    recentWeather: ["partly", "sunny", "partly", "cloudy", "sunny"],
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
  /** 기간별 관계 그래프 — 화면의 토글이 골라 쓴다 */
  relation: Record<RelationPeriod, RelationGraph>;
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

/* ── 관계 지도 ───────────────────────────────────────────────────────
   반 전체가 나온다. 9명만 그리면 빠진 11명이 "관계가 없는 아이"인지 "안 그린 아이"인지
   교사가 알 수 없고, 정작 찾아야 할 조용한 아이가 거기 숨는다.

   원 크기 = 중요도. 최근 2주 동안
     · 다른 아이 대화에 이름이 오른 횟수 (발화 추출)
     · 업무기록에 이름이 오른 건수 (갈등·관찰) — 기록에 남은 건 더 무겁게 센다
   인기 순위가 아니다. "이 아이 이야기가 교실에서 얼마나 오갔나"의 양이다. */

/** 업무기록 한 건은 언급 몇 번만큼 무겁게 볼 것인가 */
const RECORD_WEIGHT = 3;
/** 선을 그릴 최소 언급 횟수. 기간과 무관하게 고정이다 —
    기간을 늘렸는데 선이 줄면 지도를 믿을 수 없게 된다. 넓게 볼수록 선은 늘어야 한다. */
const EDGE_MIN_MENTIONS = 2;

/** viewBox 0 0 660 380. 중요도 순으로 안쪽부터 채운다 — 가운데가 가장 많이 오르내린 아이다.
    고리를 조금씩 좁혔다(288→268, 152→142): RelationshipMap 이 원을 1.8 배로 키우면서
    바깥 고리 끝의 원이 지도 테두리를 넘어 잘렸다. */
const LAYOUT = { cx: 330, cy: 190, rings: [{ count: 6, rx: 148, ry: 82 }, { count: 13, rx: 268, ry: 142 }] };

/* 원 크기 (RelationshipMap 이 여기에 BASE_SCALE 1.8 을 곱해 그린다).
   살펴볼 일이 없는 아이를 12 까지 내렸다 — 16 일 때는 한 점 차이가 눈에 안 띄어
   "원이 클수록 살펴볼 일이 많다"는 규칙이 지도에서 읽히지 않았다.
   대신 한 점당 5 씩 벌려, 가장 작은 원과 가장 큰 원이 두 배 넘게 차이 나게 한다.
   점당 고정폭인 이유는 그대로다: 기간 토글(1주·2주·4주)을 오갈 때 같은 아이가
   같은 크기로 남아야 크기가 뜻을 갖는다. 최댓값에 맞춰 늘리면 기준이 기간마다 달라진다. */
const NODE_MIN_R = 12;
const NODE_MAX_R = 28;
const NODE_R_STEP = 5;
/** 아무도 이름을 부르지 않은 아이에게 주는 점수 — 갈등 두 건과 같은 무게로 둔다.
    소외는 갈등처럼 기록으로 남지 않아서, 세지 않으면 지도에서 가장 작게 그려진 채 묻힌다. */
const ISOLATED_ATTENTION = 2;
/** 갈등 건수는 여기서 멈춘다 */
const CONFLICT_ATTENTION_CAP = 3;

function buildRelation(dateKey: string, windowDays: number): RelationGraph {
  const window = recentSchoolDays(dateKey, windowDays);
  const ids = Object.keys(STUDENT_NAMES).map(Number);

  // 서로 언급한 횟수 (방향은 합친다 — 지도는 "이야기가 오갔다"만 보여준다)
  const pairCount = new Map<string, number>();
  const mentioned = new Map<number, number>(ids.map((id) => [id, 0]));
  // 말한 쪽도 따로 센다 — "친구 이야기를 하는데 아무도 내 이야기를 안 하는" 아이를
  // "아무와도 오가는 게 없는" 아이와 같이 묶으면, 정작 다른 상황인 둘을 놓친다.
  const mentioning = new Map<number, number>(ids.map((id) => [id, 0]));
  for (const date of window) {
    for (const { from, to } of mentionsOn(date)) {
      mentioned.set(to, (mentioned.get(to) ?? 0) + 1);
      mentioning.set(from, (mentioning.get(from) ?? 0) + 1);
      const key = from < to ? `${from}-${to}` : `${to}-${from}`;
      pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
    }
  }

  // 업무기록(갈등)에 이름이 오른 건수
  const oldest = window[0];
  const records = conflictLedger().filter((c) => c.date >= oldest && c.date <= dateKey);
  const recordCount = new Map<number, number>(ids.map((id) => [id, 0]));
  for (const c of records) for (const id of c.pairIds) recordCount.set(id, (recordCount.get(id) ?? 0) + 1);

  // 가운데 자리를 누구에게 줄지 — 이름이 많이 불린 순서다 (배치 전용)
  const weightOf = (id: number) => (mentioned.get(id) ?? 0) + (recordCount.get(id) ?? 0) * RECORD_WEIGHT;

  /* 원 크기는 정반대를 본다: "교사가 살펴볼 일이 얼마나 되나".
     언급이 많아 가운데 앉은 아이는 이미 눈에 띄고, 지도가 찾아 줘야 하는 건
     아무도 이름을 부르지 않은 아이와 갈등이 잦은 아이다. 그 둘을 크게 그린다.
     갈등은 건수를 세되 세 건에서 멈춘다 — 그 위로는 크기 차이가 뜻을 더하지 않고
     원이 이웃을 덮기만 한다. */
  const attentionOf = (id: number) =>
    ((mentioned.get(id) ?? 0) === 0 ? ISOLATED_ATTENTION : 0) +
    Math.min(recordCount.get(id) ?? 0, CONFLICT_ATTENTION_CAP);

  const conflictIds = new Set(records.flatMap((c) => c.pairIds));
  const isConflictPair = (a: number, b: number) =>
    records.some((c) => c.pairIds.includes(a) && c.pairIds.includes(b));

  // 중요도 높은 순으로 가운데부터. 동점이면 번호순이라 매일 자리가 흔들리지 않는다.
  const ranked = [...ids].sort((a, b) => weightOf(b) - weightOf(a) || a - b);

  const nodes: RelationNode[] = ranked.map((studentId, rank) => {
    const weight = weightOf(studentId);
    let x = LAYOUT.cx;
    let y = LAYOUT.cy;
    if (rank > 0) {
      const ring = rank <= LAYOUT.rings[0].count ? LAYOUT.rings[0] : LAYOUT.rings[1];
      const index = rank <= LAYOUT.rings[0].count ? rank - 1 : rank - 1 - LAYOUT.rings[0].count;
      // 안쪽 고리와 바깥 고리의 각도를 엇갈리게 둬서 노드가 한 줄로 겹쳐 보이지 않게 한다
      const offset = ring === LAYOUT.rings[0] ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / ring.count;
      const angle = offset + (index / ring.count) * Math.PI * 2;
      x = Math.round(LAYOUT.cx + Math.cos(angle) * ring.rx);
      y = Math.round(LAYOUT.cy + Math.sin(angle) * ring.ry);
    }
    return {
      studentId,
      name: STUDENT_NAMES[studentId],
      x,
      y,
      r: Math.min(NODE_MAX_R, NODE_MIN_R + attentionOf(studentId) * NODE_R_STEP),
      tone: weight === 0 ? "isolated" : conflictIds.has(studentId) ? "conflict" : "normal",
    };
  });

  // 선 굵기는 언급 횟수에 따른다. 기간이 길면 선이 많아지는데, 굵기가 다 같으면
  // 자주 오가는 사이와 어쩌다 한 번이 구분되지 않아 그냥 빽빽해 보이기만 한다.
  const strongest = Math.max(...pairCount.values(), 1);
  const edges: RelationEdge[] = [...pairCount]
    .filter(([, count]) => count >= EDGE_MIN_MENTIONS)
    .map(([key, count]) => {
      const [from, to] = key.split("-").map(Number);
      return {
        from,
        to,
        kind: isConflictPair(from, to) ? ("conflict" as const) : ("normal" as const),
        strength: count / strongest,
      };
    });

  // 갈등은 언급이 적어도 반드시 보여야 한다
  for (const c of records) {
    const [from, to] = c.pairIds;
    if (!edges.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from))) {
      edges.push({ from, to, kind: "conflict", strength: 0.5 });
    }
  }

  // 최근 것부터 — 옆 패널 카로셀이 첫 장에 가장 최근 건을 두게
  const conflicts = [...records].sort((a, b) => (a.date < b.date ? 1 : -1));
  return { nodes, edges, conflicts, ...buildRelationDetails(ids, window, records) };
}

/** 짝 키는 늘 작은 번호가 앞이다 — 방향이 달라도 같은 선을 가리키게 */
export const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** 아이별·짝별 관계 상세. 언급을 한 번만 모아서 두 갈래로 나눠 담는다. */
function buildRelationDetails(
  ids: number[],
  window: string[],
  records: ConflictRow[],
): { details: Record<number, RelationDetail>; pairs: Record<string, RelationPairDetail> } {
  const byStudent = new Map<number, RelationDetail["quotes"]>(ids.map((id) => [id, []]));
  const byPair = new Map<string, RelationPairDetail["quotes"]>();

  for (const date of window) {
    for (const { from, to } of mentionsOn(date)) {
      const template = MENTION_QUOTE[Math.floor(hash01(date, from * 100 + to, 61) * MENTION_QUOTE.length)];
      // 인용은 "말한 아이"의 발화다 — 그 안에 상대 이름이 들어간다
      const quote = {
        from: STUDENT_NAMES[from],
        date,
        text: template.replace("{to}", callName(STUDENT_NAMES[to].slice(1))),
      };
      byStudent.get(to)!.push(quote);
      const key = pairKey(from, to);
      if (!byPair.has(key)) byPair.set(key, []);
      byPair.get(key)!.push(quote);
    }
  }

  const details = Object.fromEntries(
    ids.map((studentId) => [
      studentId,
      {
        studentId,
        name: STUDENT_NAMES[studentId],
        mentionCount: byStudent.get(studentId)!.length,
        // 최근 것부터 3개까지 — 더 보여줘도 패널에서 읽히지 않는다
        quotes: byStudent.get(studentId)!.slice().reverse().slice(0, 3),
        conflicts: records.filter((c) => c.pairIds.includes(studentId)),
      },
    ]),
  );

  // 갈등만 있고 언급은 없는 짝도 선이 그려지므로, 그 짝의 상세도 있어야 한다
  const keys = new Set([...byPair.keys(), ...records.map((c) => pairKey(...c.pairIds))]);
  const pairs = Object.fromEntries(
    [...keys].map((key) => {
      const [a, b] = key.split("-").map(Number);
      const quotes = byPair.get(key) ?? [];
      return [
        key,
        {
          a: { studentId: a, name: STUDENT_NAMES[a] },
          b: { studentId: b, name: STUDENT_NAMES[b] },
          mentionCount: quotes.length,
          quotes: quotes.slice().reverse().slice(0, 4),
          conflicts: records.filter((c) => pairKey(...c.pairIds) === key),
        },
      ];
    }),
  );

  return { details, pairs };
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
    // 기간 토글이 바로 반응하도록 네 기간을 미리 만들어 둔다 (스무 명짜리라 가볍다)
    relation: Object.fromEntries(
      RELATION_PERIODS.map((p) => [p.id, buildRelation(key, p.days)]),
    ) as Record<RelationPeriod, RelationGraph>,
    /* 대시보드 밖(패턴 경고 등)에서 쓰는 전체 목록. 관계 카드의 옆 패널은
       기간 토글을 따르는 relation[period].conflicts 를 본다. */
    conflicts: conflictLedger().filter((c) => c.date <= key),
    vocab: buildVocab(snapshot),
  };
}

/** 실사용자로 잡아둔 아이 (mock 번호). 시드의 민준 = 개발 환경 체크인이 저장되는 학생이다.
    uuid 쪽 짝은 lib/vocab/liveVocab.ts 의 LIVE_VOCAB_STUDENT_ID. */
export const LIVE_VOCAB_STUDENT_NO = 1;

/**
 * 하드코딩된 감정 어휘에 "실제로 말한 표제어"를 얹는다 (민준이 한 칸만).
 *
 * 세는 규칙은 lib/vocab/aggregate.ts 의 정의를 그대로 따른다 —
 *   count = 쓴 표제어의 종류 수 / delta = 그중 이번 달에 처음 쓴 것
 * 그래서 이미 목록에 있는 말을 또 말해도 숫자는 늘지 않는다. 새 말만 목록 뒤에 붙는다.
 * 뒤에 붙이는 것이 중요하다 — VocabGrowthChart 가 목록의 마지막 delta 개를
 * "이번 달 새로 쓴 말"로 읽는다 (count - delta 부터).
 *
 * lemmas 가 비어 있으면(실데이터 없음·DB 미연결·추출 실패) 원본을 그대로 돌려준다.
 */
export function mergeLiveVocab(
  vocab: DashboardData["vocab"],
  lemmas: string[],
): DashboardData["vocab"] {
  if (!lemmas.length) return vocab;

  let changed = false;
  const students = vocab.students.map((student) => {
    if (student.studentId !== LIVE_VOCAB_STUDENT_NO) return student;
    const added = lemmas.filter((lemma) => !student.words.includes(lemma));
    if (!added.length) return student;
    changed = true;
    const words = [...student.words, ...added];
    return { ...student, count: words.length, delta: student.delta + added.length, words };
  });
  if (!changed) return vocab;

  // 이번 달 학급 평균은 민준이 숫자가 바뀌면 같이 바뀐다 (지난 달들은 이미 지나간 값이라 그대로).
  const average =
    Math.round((students.reduce((sum, s) => sum + s.count, 0) / students.length) * 10) / 10;
  const trend = vocab.trend.map((month, i) =>
    i === vocab.trend.length - 1 ? { ...month, average } : month,
  );

  return { students, trend };
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
