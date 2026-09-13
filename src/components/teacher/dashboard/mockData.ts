// 담당: 진승혜
// 프로토타입(docs/prototype/prototype-teacher.html) 대시보드 섹션의 mock 데이터를 그대로 옮김.
// 실제로는 lib/supabase/queries/* 응답으로 대체.

export const COLOR_STATS = {
  morning: [
    { color: "green", count: 12, pct: 60 },
    { color: "yellow", count: 5, pct: 25 },
    { color: "red", count: 2, pct: 10 },
    { color: "navy", count: 1, pct: 5 },
  ],
  afternoon: [
    { color: "green", count: 10, pct: 50 },
    { color: "yellow", count: 6, pct: 30 },
    { color: "red", count: 3, pct: 15 },
    { color: "navy", count: 1, pct: 5 },
  ],
} as const;

export const BRIEFING_STUDENTS = [
  {
    id: 1,
    name: "김민준",
    avatarClass: "briefing-avatar-red",
    initial: "민",
    reason: "빨강 3일 연속 · 발화 속도 −34% · 침묵 4.2초",
  },
  {
    id: 2,
    name: "이서연",
    avatarClass: "briefing-avatar-navy",
    initial: "서",
    reason: "남색 — 오늘 말 걸지 않는 게 좋아요",
  },
  {
    id: 3,
    name: "박예린",
    avatarClass: "briefing-avatar-red",
    initial: "예",
    reason: "노랑→빨강 급변 · 침묵 2.8초↑",
  },
];

export const CONFLICT_ROWS = [
  {
    date: "9월 12일 · 점심시간",
    pair: "김민준 ↔ 이서연",
    statements: [
      { who: "김민준 (하교)", color: "var(--red)", text: "서연이가 먼저 밀었어요. 제가 지나가는데 갑자기 밀었어요." },
      { who: "이서연 (하교)", color: "var(--navy)", text: "민준이가 제 자리에 앉아서 비키라고 했는데 계속 안 비켰어요." },
    ],
    warn: "⚠ 두 진술이 서로 다릅니다. 판단 전 양측 원본을 확인하세요.",
  },
  {
    date: "9월 10일 · 체육 시간",
    pair: "김민준 ↔ 한지훈",
    statements: [
      { who: "김민준 (하교)", color: "var(--red)", text: "지훈이가 팀 고를 때 저만 안 뽑았어요." },
      { who: "한지훈 (하교)", color: "var(--muted)", text: "뽑으려고 했는데 이미 팀이 다 찼어요." },
    ],
  },
];

export const PATTERN_ROWS = [
  {
    icon: "⚽",
    name: "김민준 · 체육 있는 날",
    desc: "체육 수업이 있는 날 갈등 기록이 3회 있었습니다. (9/3, 9/10, 9/12)\n오늘 3교시 체육 수업이 있습니다.",
    chip: { label: "오늘 체육", className: "chip-red" },
  },
  {
    icon: "📅",
    name: "이채원 · 월요일 패턴",
    desc: "월요일마다 노랑 또는 빨강을 선택하는 경향이 있습니다. (4주 연속)",
    chip: { label: "월요일", className: "chip-yellow" },
  },
];

export const CLASSROOM_DELTA =
  "초록이 2명 줄고 빨강이 1명 늘었습니다. 오후에 교실 분위기가 다소 가라앉은 날이었습니다.";

export const VOCAB_DATA = [
  { name: "김민준", count: 8 },
  { name: "이서연", count: 13 },
  { name: "박예린", count: 6 },
  { name: "최하준", count: 15 },
  { name: "정지우", count: 11 },
  { name: "이시아", count: 9 },
  { name: "김준혁", count: 7 },
  { name: "박수빈", count: 14 },
  { name: "최윤서", count: 10 },
  { name: "이채원", count: 8 },
  { name: "김다은", count: 16 },
  { name: "오성민", count: 12 },
  { name: "한지훈", count: 5 },
  { name: "정현우", count: 11 },
  { name: "이아린", count: 9 },
  { name: "김도현", count: 12 },
  { name: "오지안", count: 7 },
  { name: "박민아", count: 8 },
  { name: "최은서", count: 14 },
  { name: "정우진", count: 10 },
];
