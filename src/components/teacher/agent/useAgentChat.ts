// 담당: 이지현
// TeacherAgentWidget의 대화 상태/전송 로직. layout에서 한 번만 마운트되므로
// 탭을 넘나들어도 상태가 유지된다 (App Router layout 리마운트 없음 특성 활용).
//
// 학생 범위 좁히기는 두 단계:
//   1) 지금 보고 있는 페이지가 특정 학생 화면이면(아래 STUDENT_ID_PATTERNS) 그걸 우선 사용.
//      "누적자료보기"(consultation/report/[id])는 새 탭으로 열리므로, 그 탭 안에서 물어볼 때만 잡힌다 —
//      새 탭은 확인용이고 원래 탭에서 계속 물어보는 경우가 많아서, 이것만으론 부족하다.
//   2) 그래서 페이지로 못 잡으면 서버(context.ts)가 질문 문장 안의 학생 이름으로 다시 찾는다.
//      "한지훈 학생 자료 요약해줘"처럼 페이지와 무관하게 이름만 말해도 그 학생으로 좁혀진다 —
//      이게 실제로 더 자주 맞는 경로라 studentId를 못 찾아도 항상 question은 그대로 보낸다.

"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

export type DomainFinding = { domain: string; label: string; finding: string; evidence: string[] };
type AgentMessage = {
  id: number;
  role: "user" | "agent";
  text: string;
  evidence?: string[];
  domainFindings?: DomainFinding[];
};

let msgId = 0;

const STUDENT_ID_PATTERNS = [/^\/students\/([^/]+)$/, /^\/consultation\/report\/([^/]+)$/];

function studentIdFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  for (const pattern of STUDENT_ID_PATTERNS) {
    const match = pathname.match(pattern);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
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
        const evidence = Array.isArray(data.evidence) ? (data.evidence as string[]) : undefined;
        const domainFindings = Array.isArray(data.domainFindings) ? (data.domainFindings as DomainFinding[]) : undefined;
        setMessages((prev) => [
          ...prev,
          { id: msgId++, role: "agent", text: data.answer, evidence, domainFindings },
        ]);
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
