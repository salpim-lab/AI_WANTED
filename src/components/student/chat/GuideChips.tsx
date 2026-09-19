// 담당: 이유민
// "이런 이야기를 해도 좋아요" 힌트.
//
// ⚠️ 이건 답변 버튼이 아니다. 누르면 답이 되는 선택지가 아니라,
//    뭘 말해야 할지 모르는 아이에게 보여주는 예시일 뿐이다.
//    아이는 이걸 보고 **직접 말한다**.
//
//    선택지로 만들면 안 되는 이유: 고르기가 말하기보다 쉬우니 아이는 늘 고르게 되고,
//    그러면 우리가 받는 건 아이 말이 아니라 우리가 미리 쓴 문장이다.
//    발화에서 감정을 읽겠다는 설계 전체가 무너진다.
//
// 항상 떠 있으면 말하기 버튼과 비중이 같아져 주객이 바뀐다.
// 그래서 AI 가 물어본 뒤 잠시 아무 반응이 없을 때만 올라온다.
import type { Reply } from "../mockScenarios";
import { useEffect, useState } from "react";
import { hintLines } from "@/lib/chat/hints";

/** 한 줄이 떠올라 머물다 사라지는 시간 */
const LINE_MS = 2600;

/**
 * 힌트를 한 문장으로 이어 한 줄씩 **한 번만** 흘린 뒤, 주제마다 구름 말풍선으로 흩어 둔다.
 * 계속 흘리면 같은 말이 반복돼 피로했다. 다 흐른 뒤에는 말풍선들이 조용히 떠 있다.
 * 줄마다 key 를 바꿔 등장 애니메이션을 처음부터 다시 틀게 한다.
 */
function HintFlow({ topics }: { topics: string[] }) {
  const lines = hintLines(topics);
  // index: 지금 흘리는 줄. lines.length 에 닿으면 말풍선으로 정리된 상태
  const [index, setIndex] = useState(0);
  const settled = index >= lines.length;
  useEffect(() => {
    if (settled) return;
    const id = window.setTimeout(() => setIndex((i) => i + 1), LINE_MS);
    return () => window.clearTimeout(id);
  }, [index, settled]);

  if (settled) {
    // 주제마다 구름 말풍선. 누르는 것이 아니다.
    return (
      <div className="guide-chips" role="note">
        <span className="sr-only">{lines.join(" ")}</span>
        <ul className="guide-chips__row" aria-hidden="true">
          {topics.map((t) => (
            <li key={t} className="guide-chip guide-chip--hint">
              {t}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="guide-flow" role="note">
      <span className="sr-only">{lines.join(" ")}</span>
      <div className="guide-flow__stage" aria-hidden="true">
        <p key={index} className="guide-flow__line">
          {lines[index]}
        </p>
      </div>
    </div>
  );
}

export default function GuideChips({
  hints,
  replies,
  replies2,
  /**
   * 음성을 쓸 수 없을 때만 true. 그때는 힌트가 아니라 고를 수 있는 선택지가 된다.
   * 마이크가 막혔거나 로그인 없는 데모라서 말해도 전사되지 않는 상황이다.
   * 이 경우까지 "말로 하라"고 하면 아이가 아무것도 못 하고 멈춘다.
   */
  selectable = false,
  onReply,
  onReply2,
}: {
  /** 주제 힌트. 답변 문장이 아니다 */
  hints: string[];
  replies: Reply[] | null;
  replies2: { text: string; next2: string }[] | null;
  selectable?: boolean;
  onReply?: (r: Reply) => void;
  onReply2?: (r: { text: string; next2: string }) => void;
}) {
  if (!selectable) {
    if (!hints.length) return null;
    return <HintFlow topics={hints} />;
  }

  if (!replies?.length && !replies2?.length) return null;
  return (
    <div className="guide-chips">
      <p className="guide-chips__label">눌러서 골라줘</p>
      <div className="guide-chips__row">
        {replies?.map((r) => (
          <button
            key={r.text}
            type="button"
            className="guide-chip guide-chip--pick"
            onClick={() => onReply?.(r)}
          >
            {r.text}
          </button>
        ))}
        {replies2?.map((r) => (
          <button
            key={r.text}
            type="button"
            className="guide-chip guide-chip--pick"
            onClick={() => onReply2?.(r)}
          >
            {r.text}
          </button>
        ))}
      </div>
    </div>
  );
}
