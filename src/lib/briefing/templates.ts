// 담당: 진승혜
// 아침 브리핑 3단계 — 트리거를 교사가 읽을 문구로 옮긴다.
//
// LLM 을 쓰지 않는다. 입력이 이미 {종류, 날짜, 숫자} 라 문장을 "생성"할 일이 없고,
// 매일 같은 사실이 같은 문장으로 나와야 교사가 3초 만에 훑을 수 있다.
// 문구가 매번 달라지면 같은 뜻인지 다른 뜻인지 멈춰서 생각하게 된다.
//
// status = 무슨 일이 (짧은 명사형) / reason = 언제부터·얼마나 (문장)
// 표현 원칙(기획안 10 가드레일): 진단하지 않고, 단정하지 않고, 비교하지 않고, 예측하지 않는다.
//   BANNED_PATTERNS 가 이 원칙을 테스트로 고정한다 — 나중에 누가 문구를 고쳐도 걸린다.

import type { SignalColor } from "@/lib/types/signal";
import type { Trigger } from "./triggers";

const COLOR_LABEL: Record<SignalColor, string> = {
  green: "초록",
  yellow: "노랑",
  red: "빨강",
  navy: "남색",
};

/** "2026-09-16" → "9/16" */
const short = (dateKey: string) => {
  const [, m, d] = dateKey.split("-");
  return `${Number(m)}/${Number(d)}`;
};

export function statusOf(t: Trigger): string {
  switch (t.kind) {
    case "meetingRequest":
      return t.daysWaiting >= 1 ? `면담 대기 ${t.daysWaiting}일째` : "먼저 이야기하고 싶대요";
    case "drop":
    case "dip":
      return `${COLOR_LABEL[t.from]} → ${COLOR_LABEL[t.to]}`;
    case "baseline":
      return t.lastSeenOn ? `${short(t.lastSeenOn)} 이후 처음` : "평소와 달라요";
    case "afterConflict":
      return "어제 갈등 뒤";
    case "streak":
      return `${COLOR_LABEL[t.color]} ${t.days}일 연속`;
    case "quiet":
      return t.speech ? "말수가 줄었어요" : "대답이 느려졌어요";
    case "noCheckin":
      return t.days >= 2 ? `체크인 없음 ${t.days}일째` : "체크인 없음";
    case "noEmotionWord":
      return "기분 표현 없음";
    case "noPeerMention":
      return "친구 이야기 없음";
    case "navyRepeat":
      return t.consecutive >= 2 ? `남색 ${t.consecutive}일 연속` : `남색 2주 ${t.count}회`;
  }
}

export function reasonOf(t: Trigger): string {
  switch (t.kind) {
    case "meetingRequest":
      if (t.urgent) return "급한 일이라고 표시했어요";
      return t.daysWaiting >= 1
        ? `${short(t.requestedOn)}에 신청했고 아직 이야기하지 못했어요`
        : "오늘 등교하며 이야기를 신청했어요";
    case "drop":
      return `어제까지 ${COLOR_LABEL[t.from]}이었는데 오늘 크게 바뀌었어요`;
    case "dip":
      return "어제보다 한 단계 내려왔어요";
    case "baseline":
      if (t.rareWeeks !== null && t.rareWeeks >= 2) return `최근 ${t.rareWeeks}주 중 처음 고른 색이에요`;
      return "이 아이에게는 드문 색이에요";
    case "afterConflict":
      // " · " 를 문장 안에 쓰지 않는다 — renderBriefingLine 이 그 기호로 두 reason 을 잇는다.
      return t.resolved
        ? `${short(t.date)} 중재는 끝났지만 오늘 표정을 한 번 봐주세요`
        : `${short(t.date)} 기록이 있고 양측 진술을 아직 확인 중이에요`;
    case "streak":
      if (t.days >= 5) return "일주일 가까이 같은 색이에요";
      return t.days === 2 ? "어제부터 같은 색이에요" : `${short(t.since)}부터 같은 색이에요`;
    case "quiet":
      if (t.speech && t.latency) return "말수가 줄고 대답도 느려졌어요";
      return t.speech ? "평소의 절반 정도만 말했어요" : "대답까지 걸리는 시간이 길어졌어요";
    case "noCheckin":
      return t.days >= 2 ? `${short(t.since)}부터 기록이 없어요` : "오늘 아직 체크인을 하지 않았어요";
    case "noEmotionWord":
      return `최근 ${t.sessions}번의 대화에서 기분을 말하지 않았어요`;
    case "noPeerMention":
      return `${t.weeks}주째 대화에 친구 이름이 나오지 않았어요`;
    case "navyRepeat":
      return t.consecutive >= 2
        ? "오늘도 먼저 말을 걸지 않는 편이 좋겠어요"
        : "혼자 있을 시간을 반복해서 고르고 있어요";
  }
}

/** 트리거 목록 → 화면 한 줄. reason 은 최대 두 개까지만 잇는다 — 세 개면 읽히지 않는다. */
export function renderBriefingLine(triggers: Trigger[]): { status: string; reason: string } {
  return {
    status: statusOf(triggers[0]),
    reason: triggers.slice(0, 2).map(reasonOf).join(" · "),
  };
}

/* ── 가드레일 ────────────────────────────────────────────────────────
   이 화면의 문구는 아이 이름 옆에 붙어서 교사가 그 아이를 부를지 말지를 정한다.
   진단·추측·비교·예측이 섞이면 기록이 아니라 판정이 된다. */
export const BANNED_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "진단어", pattern: /우울|불안정|산만|공격적|문제아|예민|장애/ },
  { label: "추측·단정", pattern: /같습니다|같아요|보입니다|우려|의심/ },
  { label: "비교·순위", pattern: /가장|제일|최하위|보다 못|뒤처/ },
  { label: "예측", pattern: /예상|예측|위험|할 것 같/ },
];
