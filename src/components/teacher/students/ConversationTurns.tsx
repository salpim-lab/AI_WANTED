// 담당: 김현우
// 등하교 대화 전문 한 세션 — 아이 상세에서 쓴다.
// 원문을 그대로 보여준다 (요약·수정하지 않음).
// 모양은 학생 화면 대화(/checkin/talk, components/student/chat/ChatBubble + styles/student-chat.css)와 같은 메신저 모양이다 —
// 살핌(AI)은 왼쪽 흰 말풍선, 아이는 오른쪽 연보라 말풍선, 꼬리와 동그란 얼굴은 연속된 말풍선의 첫 줄에만 붙인다.
// 학생 화면 CSS는 화면 높이 비율(cqh) 단위라 교사 화면에서 그대로 못 쓴다 — 같은 색·모양을 고정 크기 Tailwind로 옮겼다.
// 말풍선 사이 간격은 예전 그대로다 (space-y-2).

import type { ConversationTurn } from "@/lib/types/teacherRecord";
import StudentAvatar from "./StudentAvatar";

const BUBBLE_BASE =
  "relative max-w-[75%] rounded-[20px] px-3.5 py-2.5 text-[13px] leading-[1.6] font-medium whitespace-pre-wrap after:absolute after:bottom-[7px] after:size-3 after:bg-inherit after:content-['']";
/** 살핌(AI): 흰 말풍선 — 그림자로 띄운다. 꼬리는 왼쪽 */
const BUBBLE_AI = `${BUBBLE_BASE} bg-white text-[#2f3560] shadow-[0_4px_12px_rgba(60,68,110,.13)] after:-left-[3px] after:[clip-path:polygon(100%_0,100%_100%,0_78%)]`;
/** 안내(시스템): 살핌보다 살짝 푸른 흰색 */
const BUBBLE_NOTICE = `${BUBBLE_BASE} bg-[#fbfbff] text-[#2f3560] shadow-[0_4px_12px_rgba(60,68,110,.13)] after:-left-[3px] after:[clip-path:polygon(100%_0,100%_100%,0_78%)]`;
/** 아이: 연보라 말풍선. 꼬리는 오른쪽 */
const BUBBLE_STUDENT = `${BUBBLE_BASE} bg-[#ebe8fd] text-[#2f2a63] shadow-[0_3px_10px_rgba(96,88,200,.16)] after:-right-[3px] after:[clip-path:polygon(0_0,0_100%,100%_78%)]`;

const AVATAR_SLOT = "size-9 shrink-0";

export default function ConversationTurns({ turns, studentName }: { turns: ConversationTurn[]; studentName: string }) {
  if (turns.length === 0) {
    return <p className="text-xs text-[#aab0c4]">대화 없이 색만 기록했어요.</p>;
  }

  const initial = studentName.trim().slice(-1) || "나";

  return (
    <ol className="space-y-2">
      {turns.map((turn, index) => {
        const mine = turn.speaker === "student";
        // 같은 쪽 말이 이어지면 첫 말풍선에만 얼굴을 붙이고, 나머지는 빈 칸으로 시작 위치를 맞춘다
        const showAvatar = turns[index - 1]?.speaker !== turn.speaker;
        const avatar = mine ? (
          showAvatar ? <StudentAvatar name={studentName} initial={initial} size="chat" /> : <span aria-hidden className={AVATAR_SLOT} />
        ) : showAvatar ? (
          // 동그라미로 자르지 않고 아바타 그림 그대로 보인다
          <img src="/brand/salpim-chatbot-avatar.png" alt="" aria-hidden className={`${AVATAR_SLOT} object-contain`} />
        ) : (
          <span aria-hidden className={AVATAR_SLOT} />
        );

        return (
          <li
            key={turn.messageId}
            aria-label={mine ? "아이의 말" : turn.speaker === "system" ? "안내" : "AI의 말"}
            className={`flex items-end gap-2 break-inside-avoid ${mine ? "justify-end" : "justify-start"}`}
          >
            {!mine && avatar}
            <p className={mine ? BUBBLE_STUDENT : turn.speaker === "system" ? BUBBLE_NOTICE : BUBBLE_AI}>
              {turn.speaker === "system" && <span className="mb-0.5 block text-[10px] font-bold text-[#7d849b]">안내</span>}
              {turn.content}
            </p>
            {mine && avatar}
          </li>
        );
      })}
    </ol>
  );
}
