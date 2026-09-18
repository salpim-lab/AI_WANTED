// 담당: 김현우
// 등하교 대화 전문 한 세션 — 아이 상세와 상담 자료 리포트에서 공용.
// 원문을 그대로 보여준다 (요약·수정하지 않음).

import { givenName } from "@/components/shared/names";
import type { ConversationTurn } from "@/lib/types/teacherRecord";

const SPEAKER_LABEL = { assistant: "AI", system: "안내" } as const;

export default function ConversationTurns({ turns, studentName }: { turns: ConversationTurn[]; studentName: string }) {
  if (turns.length === 0) {
    return <p className="text-xs text-[#aab0c4]">대화 없이 색만 기록했어요.</p>;
  }

  return (
    <ol className="space-y-2">
      {turns.map((turn) => (
        <li key={turn.messageId} className="flex gap-2 break-inside-avoid">
          <span
            className={`min-w-10 pt-[3px] text-[11px] font-bold ${
              turn.speaker === "student" ? "text-[#7d849b]" : "text-[#635bff]"
            }`}
          >
            {turn.speaker === "student" ? givenName(studentName) : SPEAKER_LABEL[turn.speaker]}
          </span>
          <p
            className={`flex-1 rounded-2xl px-3 py-2 text-[13px] leading-[1.6] ${
              turn.speaker === "student" ? "border border-[#ece0c9] bg-[#fdf9ef]" : "bg-[#efedff]"
            }`}
          >
            {turn.content}
          </p>
        </li>
      ))}
    </ol>
  );
}
