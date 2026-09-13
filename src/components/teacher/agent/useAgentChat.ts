// 담당: 이지현
// TeacherAgentWidget의 대화 상태/전송 로직. layout에서 한 번만 마운트되므로
// 탭을 넘나들어도 상태가 유지된다 (App Router layout 리마운트 없음 특성 활용).
// 지금은 /api/ai/teacher-agent 대신 mock 응답 — 실제 연결 시 send() 안의 setTimeout 블록만 교체.

"use client";

import { useState } from "react";

type AgentMessage = { id: number; role: "user" | "agent"; text: string };

let msgId = 0;

export function useAgentChat() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  function send() {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { id: msgId++, role: "user", text }]);
    setInput("");
    setSending(true);

    // TODO(이지현): /api/ai/teacher-agent POST로 교체 (3개 system prompt 병렬 → 합치기)
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: msgId++, role: "agent", text: "아직 연결 전이에요 — 곧 실제 데이터로 답할 수 있게 될게요 🙂" },
      ]);
      setSending(false);
    }, 600);
  }

  return { messages, open, setOpen, input, setInput, send, sending };
}
