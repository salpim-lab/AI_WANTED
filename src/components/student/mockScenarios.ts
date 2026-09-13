// 담당: 이유민
// 프로토타입(docs/prototype/prototype-student.html)의 CHAT_SCENARIOS를 그대로 옮긴 임시 mock.
// 실제로는 여기 값 대신 /api/ai/chat, /api/ai/item-extract 응답으로 대체할 것.
// (색 선택 → AI 첫 질문 → 답변 옵션 → 후속 반응 → 아이템) 구조는 유지.

export type Item = { emoji: string; name: string; reason: string };

export type FollowUp = {
  ai?: string;
  item?: Item;
  done?: boolean;
  showConsult?: boolean;
  replies2?: { text: string; next2: string }[];
};

export type Reply = { text: string; next: string };

export type ColorScenario = {
  badgeLabel: string;
  badgeStyle: { background: string; color: string };
  item: Item;
  messages: { text: string; delay: number; isNavy?: boolean }[];
  replies: Reply[];
  followups: Record<string, FollowUp>;
  autoEnd?: boolean;
};

export const CHECKIN_SCENARIOS: Record<string, ColorScenario> = {
  green: {
    badgeLabel: "🟢 초록",
    badgeStyle: { background: "#dcfce7", color: "#15803d" },
    item: { emoji: "⭐", name: "반짝이 별", reason: '"좋은 기분"에서 만들어졌어' },
    messages: [
      {
        text: "초록이구나! 오늘 기분 좋은 것 같아서 나도 좋다 😊\n뭔가 좋은 일이 있었어? 자랑하고 싶은 거 있으면 말해줘!",
        delay: 600,
      },
    ],
    replies: [
      { text: "어제 게임에서 이겼어요!", next: "green_r1" },
      { text: "그냥 기분이 좋아요", next: "green_r2" },
      { text: "괜찮아요 (넘어가기)", next: "skip" },
    ],
    followups: {
      green_r1: {
        ai: "와, 게임에서 이겼구나! 대단한걸 👍\n오늘도 그 기세 이어가자!",
        item: { emoji: "🎮", name: "게임 컨트롤러", reason: '"게임에서 이겼어요"에서 만들어졌어' },
        done: true,
      },
      green_r2: {
        ai: "그냥 기분이 좋은 것도 정말 좋은 거야 🌟\n오늘도 좋은 하루 보내!",
        item: { emoji: "⭐", name: "반짝이 별", reason: '"기분이 좋은 날"에서 만들어졌어' },
        done: true,
      },
      skip: { done: true },
    },
  },
  yellow: {
    badgeLabel: "🟡 노랑",
    badgeStyle: { background: "#fef9c3", color: "#854d0e" },
    item: { emoji: "🌤", name: "구름 낀 해", reason: '"그저 그런 기분"에서 만들어졌어' },
    messages: [
      { text: "노랑이구나. 완전 좋지도 나쁘지도 않은 날이 있지.\n무슨 일인지 말해줄 수 있어?", delay: 700 },
    ],
    replies: [
      { text: "어제 친구랑 좀 싸웠어요", next: "yellow_r1" },
      { text: "그냥 좀 피곤해요", next: "yellow_r2" },
      { text: "말하기 싫어요", next: "skip" },
    ],
    followups: {
      yellow_r1: {
        ai: "친구랑 싸웠구나. 그런 날은 기분이 좀 가라앉지.\n지금은 좀 어때? 괜찮아졌어?",
        replies2: [
          { text: "조금 괜찮아졌어요", next2: "yellow_r1b" },
          { text: "아직도 기분이 좀 그래요", next2: "yellow_r1c" },
        ],
      },
      yellow_r1b: {
        ai: "그래, 다행이다. 오늘 학교에서 잘 풀리면 좋겠어 🙂",
        item: { emoji: "🤝", name: "악수하는 손", reason: '"친구랑 싸웠다"에서 만들어졌어' },
        done: true,
      },
      yellow_r1c: {
        ai: "그럼 선생님이 알고 계실 수 있게 해줄게. 오늘 힘들면 언제든 선생님한테 말해도 돼.",
        item: { emoji: "💛", name: "노란 하트", reason: '"힘든 마음"에서 만들어졌어' },
        done: true,
      },
      yellow_r2: {
        ai: "피곤하구나. 어젯밤에 잠을 못 잤어?\n오늘 쉬운 하루이길 바랄게 😴",
        item: { emoji: "😴", name: "졸린 얼굴", reason: '"피곤한 날"에서 만들어졌어' },
        done: true,
      },
      skip: { done: true },
    },
  },
  red: {
    badgeLabel: "🔴 빨강",
    badgeStyle: { background: "#fee2e2", color: "#b91c1c" },
    item: { emoji: "💗", name: "분홍 하트", reason: '"힘든 마음"에서 만들어졌어' },
    messages: [
      { text: "빨강이구나. 기분이 많이 안 좋은 것 같아.\n무슨 일 있었어? 말해줄 수 있으면 얘기해봐.", delay: 700 },
    ],
    replies: [
      { text: "아침에 엄마랑 싸웠어요", next: "red_r1" },
      { text: "그냥 다 싫어요", next: "red_r2" },
      { text: "말하기 싫어요", next: "skip" },
    ],
    followups: {
      red_r1: {
        ai: "아침부터 엄마랑 싸웠구나. 그러면 학교 오는 것도 힘들었겠다.\n오늘 선생님이 알고 있을게. 힘들면 언제든 말해줘.",
        item: { emoji: "🏠", name: "집", reason: '"엄마랑 싸웠어요"에서 만들어졌어' },
        done: true,
      },
      red_r2: {
        ai: "그런 날 있어. 다 싫은 것 같은 날.\n선생님한테 직접 얘기하고 싶으면 버튼 눌러줘.",
        showConsult: true,
        item: { emoji: "💗", name: "분홍 하트", reason: '"힘든 마음"에서 만들어졌어' },
        done: true,
      },
      skip: {
        ai: "알겠어. 말하기 싫을 때는 안 해도 돼.\n선생님이 오늘 옆에서 지켜볼게.",
        item: { emoji: "💗", name: "분홍 하트", reason: '"힘든 날"에서 만들어졌어' },
        done: true,
      },
    },
  },
  navy: {
    badgeLabel: "🔵 남색",
    badgeStyle: { background: "#e0e7ff", color: "#4338ca" },
    item: { emoji: "🌙", name: "달", reason: '"혼자만의 시간"에서 만들어졌어' },
    messages: [{ text: "알겠어. 오늘은 그냥 둘게.\n필요하면 언제든 눌러. 🔵", delay: 600, isNavy: true }],
    replies: [],
    followups: {},
    autoEnd: true,
  },
};

// 하교: 색은 고르되 질문은 매일 동일 (PLANNING.md "하교 흐름 2단계") — 갈등 포착 창구라 색별 분기 없음.
export const CHECKOUT_SCENARIO: ColorScenario = {
  badgeLabel: "",
  badgeStyle: { background: "#eef2ff", color: "#4338ca" },
  item: { emoji: "🌈", name: "무지개", reason: '"오늘 하루"에서 만들어졌어' },
  messages: [{ text: "오늘 학교에서 털어놓고 싶은 일 있어?", delay: 500 }],
  replies: [
    { text: "네, 있어요", next: "checkout_yes" },
    { text: "딱히 없어요", next: "skip" },
  ],
  followups: {
    checkout_yes: {
      ai: "얘기해줘서 고마워. 내일도 오늘처럼 잘 지내보자 🙂",
      item: { emoji: "🌈", name: "무지개", reason: '"오늘 하루 이야기"에서 만들어졌어' },
      done: true,
    },
    skip: { done: true },
  },
};

export function getCheckinScenario(color: string): ColorScenario {
  return CHECKIN_SCENARIOS[color] ?? CHECKIN_SCENARIOS.green;
}
