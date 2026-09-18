// 담당: 이지현
// TeacherAgentWidget의 대화 상태/전송 로직. layout에서 한 번만 마운트되므로
// 탭을 넘나들어도 상태가 유지된다 (App Router layout 리마운트 없음 특성 활용).
//
// (2026-09-19) 그런데 F5로 새로고침하거나 탭을 닫았다가 다시 열면 React state는 그냥 사라진다 —
// 데모 중에 심사위원이 새로고침 한 번 하면 대화가 초기화돼서 "버그인가?" 하는 인상을 줄 수 있다.
// 서버(agent_threads)에 영구 저장하는 건 다음 단계(TODO, route.ts 참고)로 미뤄두고, 지금은
// sessionStorage에만 저장해서 "새로고침해도 안 사라지는" 정도만 우선 해결한다 — Supabase도
// 로그인도 필요 없는 가장 싼 수정. 탭을 완전히 닫으면(sessionStorage 특성상) 그때는 사라진다.
//
// 학생 범위 좁히기는 두 단계:
//   1) 지금 보고 있는 페이지가 특정 학생 화면이면(아래 STUDENT_ID_PATTERNS) 그걸 우선 사용.
//      "누적자료보기"(consultation/report/[id])는 새 탭으로 열리므로, 그 탭 안에서 물어볼 때만 잡힌다 —
//      새 탭은 확인용이고 원래 탭에서 계속 물어보는 경우가 많아서, 이것만으론 부족하다.
//   2) 그래서 페이지로 못 잡으면 서버(context.ts)가 질문 문장 안의 학생 이름으로 다시 찾는다.
//      "한지훈 학생 자료 요약해줘"처럼 페이지와 무관하게 이름만 말해도 그 학생으로 좁혀진다 —
//      이게 실제로 더 자주 맞는 경로라 studentId를 못 찾아도 항상 question은 그대로 보낸다.

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export type DomainFinding = { domain: string; label: string; finding: string; evidence: string[] };
type AgentMessage = {
  id: number;
  role: "user" | "agent";
  text: string;
  evidence?: string[];
  domainFindings?: DomainFinding[];
};

const STORAGE_KEY = "salpim-teacher-agent-messages";

let msgId = 0;

/** sessionStorage는 서버에 없고, 다른 탭/오래된 형식이 들어있을 수도 있어 매번 방어적으로 읃는다. */
function loadStoredMessages(): AgentMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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

  // 마운트 시 한 번만 sessionStorage에서 복원 — 서버 렌더에는 sessionStorage가 없어서
  // useState 초기값으로는 못 넣고, 마운트 후 effect에서 채운다(하이드레이션 불일치 방지).
  useEffect(() => {
    const stored = loadStoredMessages();
    if (stored.length === 0) return;
    // 서버 렌더 시점엔 sessionStorage가 없어서 초기 state로는 못 넣고, 마운트 후에만
    // 채울 수 있다 — 그래서 여기서 setState를 부르는 게 의도된 동작이다(하이드레이션
    // 시점엔 서버와 똑같이 빈 배열이라 불일치 없음. 그 다음 프레임에 복원됨).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(stored);
    // 복원된 메시지보다 낮은 id를 새로 발급하면 React key가 겹친다.
    msgId = Math.max(...stored.map((m) => m.id), -1) + 1;
  }, []);

  // 메시지가 바뀔 때마다 저장 — 빈 배열까지 저장해서, 다음에 열었을 때 지난 대화가
  // 남아있게 한다(리셋 없음. 대화 지우기 버튼은 아직 없어서 필요해지면 그때 추가).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // 저장 공간이 꽉 찼거나 프라이빗 모드 등 — 저장은 못 해도 화면은 그대로 동작해야 한다.
    }
  }, [messages]);

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
