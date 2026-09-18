// 담당: 이유민
// "이런 이야기로 시작해도 좋아요" 칩.
//
// 항상 떠 있으면 말하기 버튼과 같은 비중이 되어 주객이 바뀐다.
// 가이드는 "뭘 말해야 할지 모를 때" 쓰는 보조 수단이므로,
// AI 가 물어본 뒤 잠시 아무 반응이 없을 때만 올라온다.
import type { Reply } from "../mockScenarios";

export default function GuideChips({
  replies,
  replies2,
  onReply,
  onReply2,
}: {
  replies: Reply[] | null;
  replies2: { text: string; next2: string }[] | null;
  onReply: (r: Reply) => void;
  onReply2: (r: { text: string; next2: string }) => void;
}) {
  return (
    <div className="guide-chips">
      <p className="guide-chips__label">이런 이야기로 시작해도 좋아요!</p>
      <div className="guide-chips__row">
        {replies?.map((r) => (
          <button key={r.text} type="button" className="guide-chip" onClick={() => onReply(r)}>
            {r.text}
          </button>
        ))}
        {replies2?.map((r) => (
          <button key={r.text} type="button" className="guide-chip" onClick={() => onReply2(r)}>
            {r.text}
          </button>
        ))}
      </div>
    </div>
  );
}
