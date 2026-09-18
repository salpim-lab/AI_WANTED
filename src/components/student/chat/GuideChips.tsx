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

export default function GuideChips({
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
  replies: Reply[] | null;
  replies2: { text: string; next2: string }[] | null;
  selectable?: boolean;
  onReply?: (r: Reply) => void;
  onReply2?: (r: { text: string; next2: string }) => void;
}) {
  if (!replies?.length && !replies2?.length) return null;

  if (!selectable) {
    const hints = [...(replies ?? []), ...(replies2 ?? [])].map((r) => r.text);
    return (
      <div className="guide-chips">
        <p className="guide-chips__label">이런 이야기를 해도 좋아요</p>
        <ul className="guide-chips__row">
          {hints.map((text) => (
            <li key={text} className="guide-chip">
              {text}
            </li>
          ))}
        </ul>
      </div>
    );
  }

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
