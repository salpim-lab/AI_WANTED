// 담당: 이지현
// TeacherAgentWidget의 대화 상태/전송 로직. layout에서 한 번만 마운트되므로
// 탭을 넘나들어도 상태가 유지된다 (App Router layout 리마운트 없음 특성 활용).

"use client";

import { useState } from "react";

export function useAgentChat() {
  const [messages, setMessages] = useState<
    { role: "user" | "agent"; text: string }[]
  >([]);
  const [open, setOpen] = useState(false);

  // TODO(이지현): sendMessage(text) → /api/ai/teacher-agent POST → messages에 append
  return { messages, open, setOpen };
}
