// 담당: 김현우
// 아이 상세 페이지 본문: 등/하교 신호등 색, AI 대화 전문, AI 짧은 분석, 교사 코멘트 작성
// 참고: docs/planning/PLANNING.md "탭 2. 아이 상세 페이지"
// 지금은 STUDENT_DETAIL mock을 쓰고, 저장은 화면에만 반영됨 — 실제로는
// lib/supabase/interpretation/teacherComment.ts 로 upsert하고(저장 시 다음날 등교에 전달),
// 초안은 /api/ai/comment-draft, 분석은 /api/ai/daily-analysis 응답으로 대체할 것.

"use client";

import { useState } from "react";
import Link from "next/link";
import ColorBadge from "@/components/shared/ColorBadge";
import MiniCalendar from "./MiniCalendar";
import { STUDENTS, STUDENT_DETAIL } from "./mockData";

export default function StudentDetailPanel({ studentId }: { studentId: string }) {
  const id = Number(studentId);
  const student = STUDENTS.find((s) => s.id === id);
  const detail = STUDENT_DETAIL[id];

  const [draft, setDraft] = useState(detail?.draft ?? "");
  const [saved, setSaved] = useState(false);

  if (!student) {
    return (
      <div className="page-students">
        <p>학생을 찾을 수 없어요.</p>
        <Link href="/students" className="back-btn">
          ← 자리 배치도
        </Link>
      </div>
    );
  }

  return (
    <div className="page-students">
      <div className="student-detail-header">
        <Link href="/students" className="back-btn">
          ← 자리 배치도
        </Link>
        <div className="student-detail-name">{student.name}</div>
        <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
          <ColorBadge color={student.morning} prefix="등교 " />
          <ColorBadge color={student.afternoon} prefix="하교 " />
        </div>
      </div>

      <MiniCalendar />

      {!detail ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🌱</div>
          <div>아직 쌓인 기록이 없어요.</div>
        </div>
      ) : (
        <>
          <div className="conv-section">
            <div className="conv-section-title">
              <ColorBadge color={student.morning} prefix="등교 " /> 등교 대화
            </div>
            {detail.conv.morning.map((t, i) => (
              <div key={i} className={`conv-turn ${t.from === "ai" ? "ai-turn" : "student-turn"}`}>
                <div className="who">{t.from === "ai" ? "AI" : student.name.slice(1)}</div>
                <div className="bubble">{t.text}</div>
              </div>
            ))}
          </div>

          <div className="conv-section">
            <div className="conv-section-title">
              <ColorBadge color={student.afternoon} prefix="하교 " /> 하교 대화
            </div>
            {detail.conv.afternoon.map((t, i) => (
              <div key={i} className={`conv-turn ${t.from === "ai" ? "ai-turn" : "student-turn"}`}>
                <div className="who">{t.from === "ai" ? "AI" : student.name.slice(1)}</div>
                <div className="bubble">{t.text}</div>
              </div>
            ))}
          </div>

          <div className="ai-analysis">
            <div className="analysis-label">AI 분석</div>
            {detail.analysis}
          </div>

          <div className="comment-section">
            <div className="comment-section-title">내일 전달할 코멘트</div>
            <div className="comment-section-sub">
              AI가 초안을 작성했어요. 읽고 수정한 뒤 저장하면 내일 등교 시 {student.name}에게 전달돼요.
            </div>
            <div className="draft-box">
              <div className="draft-label">AI 초안</div>
              {detail.draft}
            </div>
            <textarea
              className="comment-textarea"
              rows={3}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setSaved(false);
              }}
            />
            <div className="comment-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setDraft(detail.draft);
                  setSaved(false);
                }}
              >
                초안으로 되돌리기
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saved}
                style={saved ? { background: "#22c55e" } : undefined}
                onClick={() => setSaved(true)}
              >
                {saved ? `✓ ${student.name}에게 전달 예정` : "저장 · 내일 전달"}
              </button>
              <span className="comment-note">자동 발송 없음 — 저장해야 전달됩니다</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
