// 담당: 김현우
// 프로토타입(docs/prototype/prototype-teacher.html)의 STUDENTS/STUDENT_DETAIL을 그대로 옮긴 mock.
// 실제로는 lib/supabase/queries, lib/supabase/raw/signalCheckIn, interpretation/dailyAnalysis로 대체.

import type { SignalColor } from "@/lib/types/signal";

export type StudentRow = {
  id: number;
  name: string;
  morning: SignalColor;
  afternoon: SignalColor;
  role: "watch" | "unicorn" | null;
  watchReason?: string;
  unicornDays?: number;
};

export const STUDENTS: StudentRow[] = [
  { id: 1, name: "김민준", morning: "red", afternoon: "yellow", role: "watch", watchReason: "빨강 3일 연속" },
  { id: 2, name: "이서연", morning: "navy", afternoon: "green", role: "watch", watchReason: "남색 — 혼자 있을 시간" },
  { id: 3, name: "박예린", morning: "red", afternoon: "yellow", role: "watch", watchReason: "노랑→빨강 급변" },
  { id: 4, name: "최하준", morning: "green", afternoon: "green", role: "unicorn", unicornDays: 13 },
  { id: 5, name: "정지우", morning: "green", afternoon: "green", role: "unicorn", unicornDays: 16 },
  { id: 6, name: "이시아", morning: "green", afternoon: "yellow", role: "unicorn", unicornDays: 14 },
  { id: 7, name: "김준혁", morning: "yellow", afternoon: "yellow", role: null },
  { id: 8, name: "박수빈", morning: "green", afternoon: "green", role: null },
  { id: 9, name: "최윤서", morning: "yellow", afternoon: "green", role: null },
  { id: 10, name: "이채원", morning: "yellow", afternoon: "yellow", role: null },
  { id: 11, name: "김다은", morning: "green", afternoon: "green", role: null },
  { id: 12, name: "오성민", morning: "green", afternoon: "green", role: null },
  { id: 13, name: "한지훈", morning: "yellow", afternoon: "red", role: null },
  { id: 14, name: "정현우", morning: "green", afternoon: "green", role: null },
  { id: 15, name: "이아린", morning: "green", afternoon: "yellow", role: null },
  { id: 16, name: "김도현", morning: "green", afternoon: "green", role: null },
  { id: 17, name: "오지안", morning: "navy", afternoon: "green", role: null },
  { id: 18, name: "박민아", morning: "yellow", afternoon: "yellow", role: null },
  { id: 19, name: "최은서", morning: "green", afternoon: "green", role: null },
  { id: 20, name: "정우진", morning: "green", afternoon: "green", role: null },
];

export type ConvTurn = { from: "ai" | "student"; text: string };

export type StudentDetail = {
  conv: { morning: ConvTurn[]; afternoon: ConvTurn[] };
  analysis: string;
  draft: string;
};

export const STUDENT_DETAIL: Record<number, StudentDetail> = {
  1: {
    conv: {
      morning: [
        { from: "ai", text: "빨강이구나. 기분이 많이 안 좋은 것 같아. 무슨 일 있었어?" },
        { from: "student", text: "아침에 엄마랑 좀 싸웠어요..." },
        { from: "ai", text: "아침부터 힘들었겠다. 오늘 선생님이 알고 있을게." },
      ],
      afternoon: [
        { from: "ai", text: "오늘 학교에서 털어놓고 싶은 일 있어?" },
        { from: "student", text: "그냥 좀 피곤해요. 급식에 돈까스 나왔어요." },
        { from: "ai", text: "피곤한 하루였구나. 그래도 돈까스가 있었으니 다행이다 😄" },
      ],
    },
    analysis:
      "등교 시 발화 속도가 평소 대비 34% 감소했고 첫 응답 전 침묵이 4.2초였습니다. 아침 가정 갈등이 오전 내내 영향을 준 것으로 보이나, 하교 때는 다소 회복된 모습이었습니다.",
    draft:
      "민준아, 오늘 힘든 하루였는데도 끝까지 잘 버텨줘서 선생님이 고마워. 내일은 더 좋은 아침으로 시작하자. 선생님은 항상 민준이 편이야 😊",
  },
  2: {
    conv: {
      morning: [{ from: "ai", text: "알겠어. 오늘은 그냥 둘게. 필요하면 언제든 눌러. 🔵" }],
      afternoon: [
        { from: "ai", text: "오늘 학교에서 털어놓고 싶은 일 있어?" },
        { from: "student", text: "오늘은 괜찮아요." },
        { from: "ai", text: "다행이야. 오늘 쉬어가는 날이었으면 좋겠어." },
      ],
    },
    analysis:
      "등교 시 남색을 선택해 AI 대화를 원하지 않았고, 하교 때는 스스로 짧게 대화에 응했습니다. 혼자만의 시간을 충분히 가진 후 회복된 모습입니다.",
    draft: "서연아, 오늘 필요한 시간을 가져서 다행이야. 언제든 선생님이랑 이야기하고 싶으면 찾아와도 돼 🙂",
  },
  3: {
    conv: {
      morning: [
        { from: "ai", text: "빨강이구나. 무슨 일 있었어?" },
        { from: "student", text: "별로 말하고 싶지 않아요." },
        { from: "ai", text: "알겠어. 말하기 싫을 때는 안 해도 돼. 선생님이 알고 있을게." },
      ],
      afternoon: [
        { from: "ai", text: "오늘 학교에서 털어놓고 싶은 일 있어?" },
        { from: "student", text: "친구랑 좀 싸웠어요. 이제 괜찮아요." },
        { from: "ai", text: "그렇구나. 이제 괜찮다니 다행이야." },
      ],
    },
    analysis:
      "등교 시 회피 신호가 2회 감지되어 대화를 조기 종료했습니다. 하교 때는 자발적으로 갈등을 언급했고 스스로 해결된 상태임을 표현했습니다.",
    draft: "예린아, 오늘 힘든 일이 있었는데도 선생님한테 말해줘서 고마워. 앞으로도 무슨 일 있으면 꼭 얘기해줘.",
  },
};

// 미니 달력용 mock 색 이력 (최근 13일)
export const MOCK_CALENDAR_COLORS: SignalColor[] = [
  "green", "green", "yellow", "green", "red", "yellow", "green",
  "green", "yellow", "red", "green", "green", "green",
];
