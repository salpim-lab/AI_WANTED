// 담당: 이지현
// 교사 화면 어디서나 떠 있는 플로팅 챗봇. (teacher)/layout.tsx 에서만 마운트할 것.
// 대화 상태는 layout이 탭 이동 시 리마운트되지 않는 특성을 이용해 로컬 state로 유지
// (전역 상태관리 라이브러리 불필요 — useAgentChat 훅 안에서 useState로 충분).
// 지금은 목업 응답만 돌려줌 — /api/ai/teacher-agent 붙이면 useAgentChat.sendMessage만 바꾸면 됨.

"use client";

import { useAgentChat } from "./useAgentChat";

export default function TeacherAgentWidget() {
  const { messages, open, setOpen, input, setInput, send, sending } = useAgentChat();

  return (
    <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 1500 }}>
      {open && (
        <div
          style={{
            width: 320,
            maxHeight: 420,
            background: "var(--surface, #fff)",
            borderRadius: 16,
            boxShadow: "0 20px 60px rgba(0,0,0,.2)",
            display: "flex",
            flexDirection: "column",
            marginBottom: 10,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              fontWeight: 800,
              fontSize: 13,
              borderBottom: "1px solid var(--border, #e5e7eb)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            🤖 살핌 도우미
            <button
              onClick={() => setOpen(false)}
              aria-label="닫기"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}
            >
              ✕
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {messages.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--muted, #6b7280)" }}>
                우리 반 아이들 기록에 대해 궁금한 걸 물어보세요. (예: &quot;오늘 살펴볼 아이 있어?&quot;)
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  background: m.role === "user" ? "#6366f1" : "#f3f4f6",
                  color: m.role === "user" ? "#fff" : "#111827",
                  borderRadius: 12,
                  padding: "8px 12px",
                  fontSize: 13,
                  maxWidth: "85%",
                }}
              >
                {m.text}
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid var(--border, #e5e7eb)" }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="질문을 입력하세요…"
              style={{
                flex: 1,
                border: "1.5px solid var(--border, #e5e7eb)",
                borderRadius: 9,
                padding: "6px 10px",
                fontSize: 13,
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="btn btn-primary btn-sm"
            >
              전송
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        aria-label="살핌 도우미 열기"
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          border: "none",
          background: "#6366f1",
          color: "#fff",
          fontSize: 22,
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(99,102,241,.4)",
        }}
      >
        {open ? "✕" : "🤖"}
      </button>
    </div>
  );
}
