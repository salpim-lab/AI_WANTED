// 담당: 이유민
// 대화 말풍선.
//
// 목업의 메신저 타임스탬프는 넣지 않는다 — 초3~4 아이에게 필요 없고 화면만 복잡해진다.
// 시각이 필요한 건 교사 화면이지 아이 화면이 아니다.
//
// 아바타는 연속된 살핌 말풍선 중 첫 번째에만 붙인다.
// 매 말풍선마다 붙이면 같은 얼굴이 반복돼 시끄럽다.
import SalpimFace from "../SalpimFace";
import type { ChatBubble as Bubble } from "../useCheckinFlow";

export default function ChatBubble({
  bubble,
  showAvatar,
}: {
  bubble: Bubble;
  showAvatar: boolean;
}) {
  const mine = bubble.type === "user";
  return (
    <div className={`chat-row ${mine ? "chat-row--mine" : "chat-row--ai"}`}>
      {!mine &&
        (showAvatar ? (
          <span className="chat-avatar" aria-hidden="true">
            <SalpimFace className="chat-avatar__face" withSparkles={false} />
          </span>
        ) : (
          // 아바타가 없는 줄도 같은 자리에서 시작하도록 자리만 비워둔다
          <span className="chat-avatar chat-avatar--empty" aria-hidden="true" />
        ))}

      {/* 전사를 기다리는 자리. 아이 쪽에 먼저 나타나 "내 말이 들어갔다"를 보여준다 */}
      {bubble.pending ? (
        <p className="chat-bubble chat-bubble--user chat-bubble--pending" aria-label="옮기는 중">
          <span />
          <span />
          <span />
        </p>
      ) : (
        <p className={`chat-bubble chat-bubble--${bubble.type}`}>
          {bubble.text.split("\n").map((line, i) => (
            <span key={i} className="block">
              {line}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
