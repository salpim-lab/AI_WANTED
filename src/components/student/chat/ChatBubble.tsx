// 담당: 이유민
// 대화 말풍선. 목업의 메신저 타임스탬프는 넣지 않는다 —
// 초3~4 아이에게 필요 없고 화면만 복잡해진다. 교사 화면에서는 시각이 필요하지만
// 그건 교사 쪽 관심사다.
import type { ChatBubble as Bubble } from "../useCheckinFlow";

export default function ChatBubble({ bubble }: { bubble: Bubble }) {
  const mine = bubble.type === "user";
  return (
    <div className={`chat-row ${mine ? "chat-row--mine" : "chat-row--ai"}`}>
      <p className={`chat-bubble chat-bubble--${bubble.type}`}>
        {bubble.text.split("\n").map((line, i) => (
          <span key={i} className="block">
            {line}
          </span>
        ))}
      </p>
    </div>
  );
}
