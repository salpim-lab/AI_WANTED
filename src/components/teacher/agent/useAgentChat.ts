// 담당: 이지현
// TeacherAgentWidget의 대화 상태/전송 로직. layout에서 한 번만 마운트되므로
// 탭을 넘나들어도 상태가 유지된다 (App Router layout 리마운트 없음 특성 활용).
// /students/[id] 페이지에 있을 때는 그 학생으로 질문 범위를 자동으로 좁힌다(usePathname으로 감지).

"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

type AgentMessage = { id: number; role: "user" | "agent"; text: string };

let msgId = 0;

function studentIdFromPathname(pathname: string | null): string | null {
  const match = pathname?.match(/^\/students\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function useAgentChat() {
  const pathname = usePathname();
  const studentId = studentIdFromPathname(pathname);

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [scopedStudentName, setScopedStudentName] = useState<string | null>(null);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { id: msgId++, role: "user", text }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/ai/teacher-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, studentId }),
      });
      const data = await res.json();
      if (res.ok) {
        setScopedStudentName(data.studentName ?? null);
        setMessages((prev) => [...prev, { id: msgId++, role: "agent", text: data.answer }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: msgId++, role: "agent", text: `오류: ${data.message ?? "답변을 받지 못했어요."}` },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: msgId++, role: "agent", text: "네트워크 오류로 답변을 받지 못했어요." },
      ]);
    } finally {
      setSending(false);
    }
  }

  return { messages, open, setOpen, input, setInput, send, sending, scopedStudentName, studentId };
}
