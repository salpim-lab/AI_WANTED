// 담당: 진승혜
// 감정 어휘 표제어 사전 — "감정 어휘 성장" 지표의 단위다.
// 참고: 살핌_기획안.md "7.3 감정 어휘 성장 — 측정 가능한 교육 성과"
//
// 왜 사전을 코드가 쥐고 있나:
//   지표가 "아이가 쓴 감정 어휘 종류 수"라서, 세는 단위가 매번 달라지면 숫자가 성과가 아니라 잡음이 된다.
//   LLM에게 단어를 자유롭게 만들게 하면 같은 발화에서 이번 달엔 "속상하다", 다음 달엔 "서운하다"가 나온다.
//   그래서 LLM은 이 목록 안의 표제어로 정규화만 하고, 목록에 없으면 null을 돌려준다(= 세지 않는다).
//   목록을 늘리는 건 사람이 커밋으로 한다 — 그래야 "4월엔 12개, 9월엔 18개"를 같은 자로 잰 값이라 말할 수 있다.
//
// variants 는 활용형 매칭용 어간이다. "속상" 하나로 속상해요/속상했어/속상함을 다 잡는다.
// tier 는 화면에 쓰지 않는다. 학급의 어휘가 기본형에만 머무는지 넓어지는지 보는 분석용 축이다.

export type EmotionFamily =
  | "기쁨" | "슬픔" | "분노" | "불안" | "놀람"
  | "부끄러움" | "편안" | "지침" | "관계";

/** 1 = 저학년도 쓰는 기본형, 2 = 확장, 3 = 미세한 결 */
export type VocabTier = 1 | 2 | 3;

export type EmotionLemma = {
  lemma: string;
  family: EmotionFamily;
  tier: VocabTier;
  /** 표기 변이를 잡는 어간. 조사·어미는 붙은 채로 매칭된다. */
  variants: string[];
};

export const EMOTION_LEXICON: EmotionLemma[] = [
  // ── 기쁨 ──
  { lemma: "좋다", family: "기쁨", tier: 1, variants: ["좋아", "좋았", "좋은", "좋네"] },
  { lemma: "기쁘다", family: "기쁨", tier: 1, variants: ["기뻐", "기쁘", "기뻤"] },
  { lemma: "재미있다", family: "기쁨", tier: 1, variants: ["재미있", "재밌", "재미없"] },
  { lemma: "신나다", family: "기쁨", tier: 2, variants: ["신나", "신났", "신남"] },
  { lemma: "뿌듯하다", family: "기쁨", tier: 2, variants: ["뿌듯"] },
  { lemma: "행복하다", family: "기쁨", tier: 2, variants: ["행복"] },
  { lemma: "설레다", family: "기쁨", tier: 3, variants: ["설레", "설렜", "두근"] },
  { lemma: "후련하다", family: "기쁨", tier: 3, variants: ["후련", "홀가분"] },
  { lemma: "자랑스럽다", family: "기쁨", tier: 3, variants: ["자랑스럽", "자랑스러"] },

  // ── 슬픔 ──
  { lemma: "슬프다", family: "슬픔", tier: 1, variants: ["슬퍼", "슬프", "슬펐"] },
  { lemma: "속상하다", family: "슬픔", tier: 2, variants: ["속상"] },
  { lemma: "서운하다", family: "슬픔", tier: 2, variants: ["서운"] },
  { lemma: "실망하다", family: "슬픔", tier: 2, variants: ["실망"] },
  { lemma: "외롭다", family: "슬픔", tier: 2, variants: ["외로", "외롭"] },
  { lemma: "서럽다", family: "슬픔", tier: 3, variants: ["서럽", "서러"] },
  { lemma: "허전하다", family: "슬픔", tier: 3, variants: ["허전"] },
  { lemma: "씁쓸하다", family: "슬픔", tier: 3, variants: ["씁쓸"] },

  // ── 분노 ──
  { lemma: "화나다", family: "분노", tier: 1, variants: ["화나", "화났", "화가 나"] },
  { lemma: "싫다", family: "분노", tier: 1, variants: ["싫어", "싫었", "싫은"] },
  { lemma: "짜증나다", family: "분노", tier: 2, variants: ["짜증"] },
  { lemma: "억울하다", family: "분노", tier: 2, variants: ["억울"] },
  { lemma: "답답하다", family: "분노", tier: 2, variants: ["답답"] },
  { lemma: "밉다", family: "분노", tier: 2, variants: ["미워", "미웠", "밉"] },
  { lemma: "귀찮다", family: "분노", tier: 2, variants: ["귀찮"] },
  { lemma: "분하다", family: "분노", tier: 3, variants: ["분해", "분했"] },

  // ── 불안 ──
  { lemma: "무섭다", family: "불안", tier: 1, variants: ["무서", "무섭", "무셔"] },
  { lemma: "걱정되다", family: "불안", tier: 2, variants: ["걱정"] },
  { lemma: "긴장되다", family: "불안", tier: 2, variants: ["긴장"] },
  { lemma: "불안하다", family: "불안", tier: 2, variants: ["불안"] },
  { lemma: "초조하다", family: "불안", tier: 3, variants: ["초조"] },
  { lemma: "조마조마하다", family: "불안", tier: 3, variants: ["조마조마"] },

  // ── 놀람 ──
  { lemma: "놀라다", family: "놀람", tier: 1, variants: ["놀라", "놀랐", "깜짝"] },
  { lemma: "신기하다", family: "놀람", tier: 2, variants: ["신기"] },
  { lemma: "당황하다", family: "놀람", tier: 3, variants: ["당황"] },
  { lemma: "황당하다", family: "놀람", tier: 3, variants: ["황당"] },

  // ── 부끄러움 ──
  { lemma: "부끄럽다", family: "부끄러움", tier: 2, variants: ["부끄럽", "부끄러", "쑥스"] },
  { lemma: "창피하다", family: "부끄러움", tier: 2, variants: ["창피"] },
  { lemma: "민망하다", family: "부끄러움", tier: 3, variants: ["민망"] },
  { lemma: "어색하다", family: "부끄러움", tier: 3, variants: ["어색"] },

  // ── 편안 ──
  { lemma: "편안하다", family: "편안", tier: 2, variants: ["편안", "편했", "편해"] },
  { lemma: "괜찮다", family: "편안", tier: 1, variants: ["괜찮"] },
  { lemma: "안심되다", family: "편안", tier: 3, variants: ["안심", "마음이 놓"] },
  { lemma: "뭉클하다", family: "편안", tier: 3, variants: ["뭉클"] },

  // ── 지침 ──
  { lemma: "피곤하다", family: "지침", tier: 1, variants: ["피곤"] },
  { lemma: "힘들다", family: "지침", tier: 1, variants: ["힘들", "힘든", "힘듦"] },
  { lemma: "심심하다", family: "지침", tier: 1, variants: ["심심"] },
  { lemma: "지치다", family: "지침", tier: 2, variants: ["지쳐", "지쳤", "지치"] },
  { lemma: "벅차다", family: "지침", tier: 3, variants: ["벅차", "벅찼"] },

  // ── 관계 ──
  { lemma: "고맙다", family: "관계", tier: 1, variants: ["고마", "고맙", "감사"] },
  { lemma: "미안하다", family: "관계", tier: 1, variants: ["미안"] },
  { lemma: "보고싶다", family: "관계", tier: 2, variants: ["보고 싶", "보고싶"] },
  { lemma: "질투나다", family: "관계", tier: 3, variants: ["질투", "부러"] },
  { lemma: "안쓰럽다", family: "관계", tier: 3, variants: ["안쓰럽", "안쓰러"] },
];

export const LEMMAS = EMOTION_LEXICON.map((e) => e.lemma);

const BY_LEMMA = new Map(EMOTION_LEXICON.map((e) => [e.lemma, e]));

/** 사전에 있는 표제어만 통과시킨다. 모르는 값은 null — 세지 않는다. */
export function canonicalize(value: unknown): string | null {
  return typeof value === "string" && BY_LEMMA.has(value) ? value : null;
}

export function familyOf(lemma: string): EmotionFamily | null {
  return BY_LEMMA.get(lemma)?.family ?? null;
}

/** 아이가 힘들다고 말한 쪽의 계열. 아침 브리핑이 "색과 말이 어긋났나"를 볼 때 쓴다.
    놀람·관계는 뺀다 — "신기했어요", "고마웠어요"는 힘든 마음이 아니다. */
const DISTRESS_FAMILIES: EmotionFamily[] = ["슬픔", "분노", "불안", "부끄러움", "지침"];

/** 계열은 힘든 쪽에 묶여 있지만 브리핑에 올릴 말은 아닌 것.
    "심심하다"는 기운이 낮다는 뜻이라 지침에 넣었을 뿐, 힘들다는 말이 아니다. */
const NOT_DISTRESS = new Set(["심심하다"]);

/** 이 말이 "힘든 마음"을 가리키는가. 계열만으로는 모자라서 예외를 하나 둔다. */
export function isDistressWord(lemma: string): boolean {
  if (NOT_DISTRESS.has(lemma)) return false;
  const family = familyOf(lemma);
  return family !== null && DISTRESS_FAMILIES.includes(family);
}
