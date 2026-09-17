// 담당: 이유민
// AI 와 이야기하는 화면 — 등·하교 3단계.
//
// 앞 화면(홈·마음)과 통일하기 위해 지킨 것:
//   - 같은 스테이지(16:10) 위, 컨테이너 쿼리 단위로만 크기를 잡는다
//   - 상단 로고·프로필은 홈 컴포넌트를 그대로 재사용
//   - 배경은 마음 화면과 같은 밝은 그라데이션
//   - 진행 표시는 공용 점 5개 (목업의 2/2 알약 대신)
//   - 메신저 타임스탬프는 넣지 않는다
"use client";

import { useEffect, useRef, useState } from "react";
import SalpimHeader from "../home/SalpimHeader";
import StudentProfile from "../home/StudentProfile";
import type { ChatBubble as Bubble } from "../useCheckinFlow";
import type { Reply } from "../mockScenarios";
import ChatBubble from "./ChatBubble";
import GuideChips from "./GuideChips";
import TalkButton from "./TalkButton";

/** AI 가 물어본 뒤 이만큼 조용하면 가이드 칩을 올린다 */
const HESITATION_MS = 3500;

export default function ChatScreen({
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
  studentFullName = "김민준",
}: {
  active: boolean;
  badgeLabel: string;
  badgeStyle: { background: string; color: string };
  messages: Bubble[];
  typing: boolean;
  replies: Reply[] | null;
  replies2: { text: string; next2: string }[] | null;
  consultState: "hidden" | "shown" | "sent";
  onReply: (reply: Reply) => void;
  onReply2: (r: { text: string; next2: string }) => void;
  onRequestConsult: () => void;
  studentFullName?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showGuide, setShowGuide] = useState(false);

  const hasOptions = Boolean(replies?.length || replies2?.length);

  // 답할 차례가 오면 잠시 기다렸다가 가이드를 올린다.
  // 아이가 먼저 말하면(선택지가 사라지면) 가이드도 같이 내려간다.
  //
  // setState 는 전부 타이머·정리 함수 안에서만 부른다.
  // 이펙트 본문에서 동기로 부르면 연쇄 렌더가 난다.
  useEffect(() => {
    if (!hasOptions) return;
    const show = window.setTimeout(() => setShowGuide(true), HESITATION_MS);
    return () => {
      window.clearTimeout(show);
      setShowGuide(false);
    };
  }, [hasOptions, replies, replies2]);

  // 새 말풍선이 생기면 아래로 따라간다
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing, showGuide]);


  return (
    <section className={`chat-screen${active ? " active" : ""}`} aria-label="AI 와 이야기하기">
      <SalpimHeader />
      <StudentProfile name={studentFullName} />

      {badgeLabel && (
        <div className="chat-color-badge" style={badgeStyle}>
          {badgeLabel}
        </div>
      )}

      <div className="chat-scroll" ref={scrollRef}>
        {messages.map((m) => (
          <ChatBubble key={m.id} bubble={m} />
        ))}

        {typing && (
          <div className="chat-row chat-row--ai">
            <div className="chat-typing" aria-label="살핌이 입력 중">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {consultState !== "hidden" && (
          <div className="chat-row chat-row--ai">
            <button
              type="button"
              className="chat-consult"
              onClick={onRequestConsult}
              disabled={consultState === "sent"}
            >
              {consultState === "sent" ? "선생님께 전했어 ✓" : "선생님이랑 이야기하고 싶어"}
            </button>
          </div>
        )}
      </div>

      <div className="chat-bottom">
        {showGuide && hasOptions && (
          <GuideChips
            replies={replies}
            replies2={replies2}
            onReply={onReply}
            onReply2={onReply2}
          />
        )}
        <TalkButton onClick={() => setShowGuide(true)} disabled={!hasOptions} />
      </div>
    </section>
  );
}
