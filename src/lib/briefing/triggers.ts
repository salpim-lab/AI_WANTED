// 담당: 진승혜
// 아침 브리핑 2단계 — "오늘 누구를 올릴 것인가"를 정하는 규칙.
//
// 여기는 LLM 을 부르지 않는다. 교사가 "얘가 왜 떴어?" 하고 물었을 때 근거를 댈 수 있어야 하고,
// 같은 데이터면 몇 번을 돌려도 같은 아이가 나와야 한다.
// (기획안 8.8 "이상징후 지표는 코드로")
//
// 규칙은 전부 "사실 제시"다. 예측하거나 진단하지 않는다 — 기획안 10(가드레일).
//
// 입력(StudentFacts)은 DB 조회 결과를 이 모듈이 읽을 수 있는 모양으로 옮겨 담은 것이다.
// 그래서 이 파일은 Supabase 를 모르고, 테스트에서 그냥 객체를 넣어 돌릴 수 있다.

import type { SignalColor } from "@/lib/types/signal";
import { isDistressWord } from "@/lib/vocab/lexicon";
import { deviation, isAnchor, scoreOf } from "./baseline";

export type TriggerKind =
  | "meetingRequest"
  | "colorWordGap"
  | "drop"
  | "dip"
  | "baseline"
  | "afterConflict"
  | "streak"
  | "firstHardWord"
  | "quiet"
  | "noCheckin"
  | "noEmotionWord"
  | "noPeerMention"
  | "navyRepeat";

/** 먼저 읽혀야 하는 순서. 앞에 있을수록 먼저다.
    아이가 직접 손 든 것(면담 요청)이 어떤 집계보다 앞선다.
    streak 이 baseline 보다 앞이다: 이어진 첫날은 drop/baseline 이 잡고(연속은 2일부터 발화한다),
    사흘째에는 "빨강 3일 연속"이 "이 아이에게는 드문 색이에요"보다 교사에게 알려주는 게 많다. */
export const TRIGGER_ORDER: TriggerKind[] = [
  "meetingRequest",
  // 색과 말이 어긋난 날은 어떤 색 집계보다 먼저다 — 색은 버튼 한 번이고 대화가 더 많이 말한다.
  "colorWordGap",
  "drop",
  "streak",
  "baseline",
  "afterConflict",
  "dip",
  "firstHardWord",
  "quiet",
  "noCheckin",
  "noEmotionWord",
  "noPeerMention",
  "navyRepeat",
];

/** 같은 축에서 둘 이상 발화하면 하나만 남긴다 — 같은 사실을 두 번 말하지 않기 위해.
    색 변화(drop/dip/baseline/streak)는 전부 "오늘 고른 색" 축이다. */
const COLOR_AXIS: TriggerKind[] = ["drop", "dip", "baseline", "streak"];

export type Trigger =
  | { kind: "meetingRequest"; requestedOn: string; daysWaiting: number; urgent: boolean }
  | { kind: "colorWordGap"; color: SignalColor; lemma: string; quote?: string }
  | { kind: "firstHardWord"; lemma: string; quote?: string }
  | { kind: "drop"; from: SignalColor; to: SignalColor }
  | { kind: "dip"; from: SignalColor; to: SignalColor }
  | { kind: "baseline"; rareWeeks: number | null; lastSeenOn: string | null }
  | { kind: "afterConflict"; date: string; resolved: boolean }
  | { kind: "streak"; color: SignalColor; days: number; since: string }
  | { kind: "quiet"; speech: boolean; latency: boolean }
  | { kind: "noCheckin"; days: number; since: string }
  | { kind: "noEmotionWord"; sessions: number }
  | { kind: "noPeerMention"; weeks: number }
  | { kind: "navyRepeat"; count: number; consecutive: number };

/** 규칙이 읽는 아이 한 명의 사실 묶음. DB 조회 결과를 이 모양으로 옮겨 담는다. */
export type StudentFacts = {
  /** 화면·DB 모두에서 students.id를 그대로 쓴다. */
  studentId: string | number;
  name: string;
  /** 오늘 등교 때 고른 색. 체크인을 안 했으면 null */
  todayColor: SignalColor | null;
  /** 오늘 이전 기록 (오래된 날 → 최근 날). 기준선과 연속일 계산에 쓴다 */
  history: { date: string; color: SignalColor }[];
  /** 아직 처리되지 않은 면담 요청 */
  meetingRequest?: { requestedOn: string; priority: "normal" | "high" };
  /** 그 아이의 평소 대비 배수. 1.0 이면 평소와 같다 */
  prosody?: { speechRatio?: number; latencyRatio?: number };
  /** 가장 최근 갈등 기록 */
  lastConflict?: { date: string; resolved: boolean };
  /** 최근 연속 몇 번의 대화에서 감정 표제어가 하나도 안 나왔는지 */
  emotionWordGap?: number;
  /** 오늘 대화에서 뽑힌 감정 표제어와 근거 인용. lib/vocab 추출 결과(analysis_runs)를 그대로 옮긴다.
      인용은 추출기가 "실제 학생 발화에 있는 문장"인지 검증한 것이라 그대로 화면에 쓸 수 있다. */
  todayLemmas?: { lemma: string; quote?: string }[];
  /** 그중 그 아이가 처음 쓴 표제어 */
  newLemmas?: string[];
  /** 대화에 또래 이름이 안 나온 기간(주). 없으면 null */
  peerMentionGapWeeks?: number | null;
  /** 최근 2주 남색 횟수 */
  navyCountLast2Weeks?: number;
};

/* ── 임계값 ──────────────────────────────────────────────────────────
   숫자를 여기 모아둔다. 교사 피드백을 받으면 여기만 만진다. */
export const THRESHOLD = {
  /** 며칠 이상 같은 색이면 연속으로 볼 것인가 */
  streakDays: 2,
  /** 기준선에서 이만큼 아래로 벗어나면 이례적으로 본다 (음수 방향) */
  baselineDeviation: -1.5,
  /** 발화 길이·응답 지연이 평소의 몇 배부터 "달라졌다"고 볼 것인가 */
  speechRatio: 0.7,
  latencyRatio: 1.4,
  /** 갈등 기록을 며칠까지 따라볼 것인가 (수업일 아님, 달력일) */
  conflictWithinDays: 2,
  /** 감정 표제어가 안 나온 대화가 몇 번 이어지면 */
  emotionWordGap: 3,
  /** 또래 이름이 몇 주 안 나오면 */
  peerMentionWeeks: 3,
  /** 최근 2주 남색 몇 회부터 */
  navyCount: 3,
} as const;

const daysBetween = (from: string, to: string) =>
  Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
  );

/** 오늘 색이 이어진 날수와 시작일. 오늘 포함. */
function streakOf(todayColor: SignalColor, history: StudentFacts["history"]) {
  let days = 1;
  let since = "";
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].color !== todayColor) break;
    days += 1;
    since = history[i].date;
  }
  return { days, since };
}

/** 그 색을 마지막으로 고른 날 (오늘 이전). 없으면 null */
function lastSeen(color: SignalColor, history: StudentFacts["history"]): string | null {
  for (let i = history.length - 1; i >= 0; i--) if (history[i].color === color) return history[i].date;
  return null;
}

export function detectTriggers(facts: StudentFacts, today: string): Trigger[] {
  const found: Trigger[] = [];
  const { todayColor, history } = facts;

  if (facts.meetingRequest) {
    const { requestedOn, priority } = facts.meetingRequest;
    found.push({
      kind: "meetingRequest",
      requestedOn,
      daysWaiting: daysBetween(requestedOn, today),
      urgent: priority === "high",
    });
  }

  if (todayColor === null) {
    // 침묵도 신호다. 색이 없으니 색 규칙은 전부 건너뛴다.
    const last = history[history.length - 1];
    const since = last ? last.date : today;
    found.push({ kind: "noCheckin", days: Math.max(1, daysBetween(since, today)), since });
  } else {
    const prev = history[history.length - 1]?.color ?? null;
    const todayScore = scoreOf(todayColor);
    const prevScore = prev ? scoreOf(prev) : null;

    // 색 앵커끼리만 비교한다. 남색은 점수가 없어 "내려갔다"고 말할 수 없다.
    if (prev && todayScore !== null && prevScore !== null) {
      const fall = prevScore - todayScore;
      if (fall >= 2) found.push({ kind: "drop", from: prev, to: todayColor });
      else if (fall === 1) found.push({ kind: "dip", from: prev, to: todayColor });
    }

    if (todayScore !== null) {
      const anchored = history.filter((h) => isAnchor(h.color)).map((h) => scoreOf(h.color)!);
      const dev = deviation(todayScore, anchored);
      if (dev !== null && dev <= THRESHOLD.baselineDeviation) {
        const seen = lastSeen(todayColor, history);
        found.push({
          kind: "baseline",
          lastSeenOn: seen,
          rareWeeks: seen ? Math.floor(daysBetween(seen, today) / 7) : null,
        });
      }
    }

    const streak = streakOf(todayColor, history);
    if (streak.days >= THRESHOLD.streakDays && todayColor !== "green") {
      found.push({ kind: "streak", color: todayColor, days: streak.days, since: streak.since });
    }
  }

  // 색과 말이 어긋난 날. 초록만 본다 — "좋아요"를 누르고 힘든 말을 한 것이 가장 분명한 간극이고,
  // 노랑("그저 그래요")까지 넓히면 평범한 날이 거의 다 걸린다.
  const hardWords = (facts.todayLemmas ?? []).filter((w) => isDistressWord(w.lemma));
  if (todayColor === "green" && hardWords.length) {
    found.push({ kind: "colorWordGap", color: todayColor, ...hardWords[0] });
  }

  // 그 아이가 처음 쓴 힘든 말. 어휘가 늘어난 건 좋은 일이지만, 처음 꺼낸 말이
  // "외롭다"라면 교사가 한 번은 들여다볼 일이다.
  const firstHard = (facts.newLemmas ?? []).find(isDistressWord);
  if (firstHard) {
    found.push({
      kind: "firstHardWord",
      lemma: firstHard,
      quote: hardWords.find((w) => w.lemma === firstHard)?.quote,
    });
  }

  const speech = (facts.prosody?.speechRatio ?? 1) <= THRESHOLD.speechRatio;
  const latency = (facts.prosody?.latencyRatio ?? 1) >= THRESHOLD.latencyRatio;
  if (speech || latency) found.push({ kind: "quiet", speech, latency });

  if (facts.lastConflict && daysBetween(facts.lastConflict.date, today) <= THRESHOLD.conflictWithinDays) {
    found.push({ kind: "afterConflict", ...facts.lastConflict });
  }

  if ((facts.emotionWordGap ?? 0) >= THRESHOLD.emotionWordGap) {
    found.push({ kind: "noEmotionWord", sessions: facts.emotionWordGap! });
  }

  if ((facts.peerMentionGapWeeks ?? 0) >= THRESHOLD.peerMentionWeeks) {
    found.push({ kind: "noPeerMention", weeks: facts.peerMentionGapWeeks! });
  }

  if ((facts.navyCountLast2Weeks ?? 0) >= THRESHOLD.navyCount) {
    const consecutive = todayColor === "navy" ? streakOf("navy", history).days : 0;
    found.push({ kind: "navyRepeat", count: facts.navyCountLast2Weeks!, consecutive });
  }

  return rank(found);
}

/** 우선순위로 정렬하고, 같은 축은 앞선 것 하나만 남긴다. */
function rank(triggers: Trigger[]): Trigger[] {
  const sorted = [...triggers].sort(
    (a, b) => TRIGGER_ORDER.indexOf(a.kind) - TRIGGER_ORDER.indexOf(b.kind),
  );
  let colorAxisTaken = false;
  return sorted.filter((t) => {
    if (!COLOR_AXIS.includes(t.kind)) return true;
    if (colorAxisTaken) return false;
    colorAxisTaken = true;
    return true;
  });
}

/** 트리거가 하나라도 있는 아이를 우선순위 순으로. 정원(limit)까지만. */
export function selectBriefing(
  everyone: StudentFacts[],
  today: string,
  limit = 4,
): { facts: StudentFacts; triggers: Trigger[] }[] {
  return everyone
    .map((facts) => ({ facts, triggers: detectTriggers(facts, today) }))
    .filter((row) => row.triggers.length > 0)
    .sort((a, b) => {
      const rankOf = (r: typeof a) => TRIGGER_ORDER.indexOf(r.triggers[0].kind);
      // 같은 순위면 이름순 — 매일 순서가 흔들리지 않게 한다.
      return rankOf(a) - rankOf(b) || a.facts.name.localeCompare(b.facts.name, "ko");
    })
    .slice(0, limit);
}
