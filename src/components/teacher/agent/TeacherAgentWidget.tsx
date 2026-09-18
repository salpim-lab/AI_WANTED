// 담당: 이지현
// 교사 화면 어디서나 떠 있는 플로팅 챗봇. (teacher)/layout.tsx 에서만 마운트할 것.
// 대화 상태는 layout이 탭 이동 시 리마운트되지 않는 특성을 이용해 로컬 state로 유지
// (전역 상태관리 라이브러리 불필요 — useAgentChat 훅 안에서 useState로 충분).
// /api/ai/teacher-agent(이지현)로 실제 요청을 보낸다. OPENAI_API_KEY가 없는 로컬 환경에서도
// 라우트가 컨텍스트 그대로 보여주는 개발용 응답을 주므로 화면은 끝까지 확인 가능하다.
// 답변마다 어떤 기록을 근거로 했는지 "📎 근거" 칩으로 같이 보여준다(DB 스키마 v0.3 §9.2
// agent_messages.evidence와 같은 취지 — 지금은 레코드 ID 대신 사람이 읽는 문자열로 표시).
//
// (2026-09-18) 최종 답변만 보이면 정서/학교생활 관찰/가정 연계 세 보조 중 누가 뭐라고 했는지 안
// 보인다는 피드백 — 답변 아래 "도메인별 소견 보기"를 펼치면 3개를 각각 따로 보여준다.

"use client";

import { useState } from "react";
import { useAgentChat, type DomainFinding } from "./useAgentChat";

const DOMAIN_ICON: Record<string, string> = { emotion: "💚", learning: "📔", home: "🏠" };

function EvidenceChips({ evidence }: { evidence: string[] }) {
  if (evidence.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {evidence.map((e, i) => (
        <span
          key={i}
          style={{
            fontSize: 10,
            color: "#4338ca",
            background: "#eef2ff",
            border: "1px solid #c7d2fe",
            borderRadius: 99,
            padding: "2px 8px",
          }}
        >
          📎 {e}
        </span>
      ))}
    </div>
  );
}

function DomainBreakdown({ findings }: { findings: DomainFinding[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ width: "100%" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 11,
          color: "#6366f1",
          fontWeight: 600,
          padding: "2px 0",
        }}
      >
        {open ? "▾ 도메인별 소견 접기" : "▸ 정서·학교생활·가정 각각 보기"}
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          {findings.map((f) => (
            <div
              key={f.domain}
              style={{
                background: "#fafafa",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "8px 10px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>
                {DOMAIN_ICON[f.domain] ?? "🔹"} {f.label}
              </div>
              <div style={{ fontSize: 12, color: "#111827", whiteSpace: "pre-line" }}>{f.finding}</div>
              <EvidenceChips evidence={f.evidence} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TeacherAgentWidget() {
  const { messages, open, setOpen, input, setInput, send, sending, scopedStudentName, studentId } = useAgentChat();

  return (
    <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 1500 }}>
      {open && (
        <div
          style={{
            width: 360,
            maxHeight: 480,
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
          {studentId && (
            <div
              style={{
                padding: "6px 14px",
                fontSize: 11,
                color: "#4338ca",
                background: "#eef2ff",
                borderBottom: "1px solid var(--border, #e5e7eb)",
              }}
            >
              📌 {scopedStudentName ?? "이 페이지의 학생"} 기준으로 답해요
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
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
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  maxWidth: m.role === "user" ? "85%" : "95%",
                }}
              >
                <div
                  style={{
                    background: m.role === "user" ? "#6366f1" : "#f3f4f6",
                    color: m.role === "user" ? "#fff" : "#111827",
                    borderRadius: 12,
                    padding: "8px 12px",
                    fontSize: 13,
                    whiteSpace: "pre-line",
                  }}
                >
                  {m.text}
                </div>
                {m.evidence && <EvidenceChips evidence={m.evidence} />}
                {m.domainFindings && m.domainFindings.length > 0 && <DomainBreakdown findings={m.domainFindings} />}
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
            <button type="submit" disabled={sending || !input.trim()} className="btn btn-primary btn-sm">
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
