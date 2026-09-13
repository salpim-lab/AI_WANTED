// 담당: 이유민
// AI 꼬리질문(등교)/고정질문(하교) 대화 화면.
// 지금은 답장칩(reply-chip, 프로토타입 그대로)을 눌러 진행하고, 마이크 버튼은 자리표시자.
// 실제 서비스에서는 답장칩 대신(또는 같이) 녹음 → /api/ai/transcribe → /api/ai/chat 흐름으로 대체.
// 참고: docs/prototype/prototype-student.html #s3

import type { ChatBubble } from "./useCheckinFlow";
import type { Reply } from "./mockScenarios";
import VoiceRecorder from "./VoiceRecorder";

export default function ChatPanel({
  active,
  badgeLabel,
  badgeStyle,
  messages,
  typing,
  replies,
  replies2,
  consultState,
  onReply,
  onReply2,
  onRequestConsult,
}: {
  active: boolean;
  badgeLabel: string;
  badgeStyle: { background: string; color: string };
  messages: ChatBubble[];
  typing: boolean;
  replies: Reply[] | null;
  replies2: { text: string; next2: string }[] | null;
  consultState: "hidden" | "shown" | "sent";
  onReply: (reply: Reply) => void;
  onReply2: (r: { text: string; next2: string }) => void;
  onRequestConsult: () => void;
}) {
  const showReplyBar = (replies && replies.length > 0) || (replies2 && replies2.length > 0);

  return (
    <div className={"screen" + (active ? " active" : "")} id="s3">
      <div className="s3-header">
        <div className="ai-avatar">🤖</div>
        <div className="ai-info">
          <div className="ai-name">살핌</div>
          <div className="ai-sub">선생님은 내용을 볼 수 있어요</div>
        </div>
        {badgeLabel && (
          <div className="s3-color-badge" style={badgeStyle}>
            {badgeLabel}
          </div>
        )}
      </div>

      <div className="chat-area">
        {messages.map((m) => (
          <div key={m.id} className={"chat-bubble " + m.type}>
            {m.text}
          </div>
        ))}
        {typing && (
          <div className="typing-indicator">
            <span />
            <span />
            <span />
          </div>
        )}
        {consultState !== "hidden" && (
          <button
            type="button"
            className={"consult-request-btn" + (consultState === "sent" ? " sent" : "")}
            onClick={onRequestConsult}
            disabled={consultState === "sent"}
          >
            {consultState === "sent" ? "✓ 신청했어요" : "선생님께 직접 얘기하고 싶어요"}
          </button>
        )}
      </div>

      {showReplyBar && (
        <div className="reply-options" style={{ display: "flex" }}>
          <div className="reply-label">답장하기</div>
          <div className="reply-options-row">
            {replies?.map((r) => (
              <button key={r.text} className="reply-chip" onClick={() => onReply(r)}>
                {r.text}
              </button>
            ))}
            {replies2?.map((r) => (
              <button key={r.text} className="reply-chip" onClick={() => onReply2(r)}>
                {r.text}
              </button>
            ))}
          </div>
          <VoiceRecorder />
        </div>
      )}
    </div>
  );
}
