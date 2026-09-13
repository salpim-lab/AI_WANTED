// 담당: 김현우
// 학부모상담기록 목록(게시판형). 무결성 원칙: 수정 불가, 서버 타임스탬프.
// 참고: docs/prototype/prototype-teacher.html #consultation-list
// 지금은 화면 안 state로만 목록을 관리 — 실제로는 lib/supabase/raw/consultationLog.ts로 insert 후 재조회.

"use client";

import { useState } from "react";
import ConsultationModal from "./ConsultationModal";
import { INITIAL_CONSULTATIONS, type ConsultationEntry } from "./mockData";

let nextId = 100;

export default function ConsultationBoard() {
  const [entries, setEntries] = useState<ConsultationEntry[]>(INITIAL_CONSULTATIONS);
  const [modalOpen, setModalOpen] = useState(false);

  function handleSave({ studentName, body }: { studentName?: string; body: string }) {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    setEntries((prev) => [{ id: `consult-${nextId++}`, timestamp: now, studentName, body }, ...prev]);
    setModalOpen(false);
  }

  return (
    <div className="page-board">
      <div className="board-toolbar">
        <h2>학부모상담기록</h2>
        <input className="search-input" type="text" placeholder="학생 이름, 키워드 검색…" />
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          + 상담 기록
        </button>
      </div>

      <div>
        {entries.map((entry) => (
          <div className="consult-entry" key={entry.id}>
            <div className="consult-meta">
              <span className="timestamp">{entry.timestamp}</span>
              {entry.studentName && <span className="student-tag">{entry.studentName}</span>}
              {entry.parentTag && <span className="parent-tag">{entry.parentTag}</span>}
              <span className="immutable-badge">🔒 수정 불가</span>
            </div>
            <div className="consult-body">{entry.body}</div>
            {entry.studentName && (
              <div className="consult-file-chip">📄 {entry.studentName} 누적 자료 (자동 생성됨)</div>
            )}
          </div>
        ))}
      </div>

      <ConsultationModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} />
    </div>
  );
}
