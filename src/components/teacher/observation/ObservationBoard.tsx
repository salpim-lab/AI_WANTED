// 담당: 김현우
// 학생관찰일지 목록(게시판형). 검색: 키워드/날짜범위/아이이름 (지금은 키워드+태그만 구현)
// 무결성 원칙: 수정 불가, 서버 타임스탬프 자동 부여 (수정 API를 만들지 말 것)
// 참고: docs/prototype/prototype-teacher.html #observation-list
// 지금은 화면 안 state로만 목록을 관리 — 실제로는 lib/supabase/raw/observationLog.ts로 insert 후 재조회.

"use client";

import { useState } from "react";
import ObservationModal from "./ObservationModal";
import { INITIAL_OBSERVATIONS, type ObservationEntry } from "./mockData";

let nextId = 100;

export default function ObservationBoard() {
  const [entries, setEntries] = useState<ObservationEntry[]>(INITIAL_OBSERVATIONS);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = entries.filter((e) => {
    const haystack = ((e.title ?? "") + e.body + e.tags.join(" ")).toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  function handleSave({ body, tags }: { body: string; tags: string[] }) {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    setEntries((prev) => [{ id: `obs-${nextId++}`, timestamp: now, body, tags }, ...prev]);
    setModalOpen(false);
  }

  return (
    <div className="page-board">
      <div className="board-toolbar">
        <h2>학생관찰일지</h2>
        <input
          className="search-input"
          type="text"
          placeholder="키워드, 아이 이름 검색…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          + 새 기록
        </button>
      </div>

      <div>
        {filtered.map((entry) => (
          <div className="board-entry" key={entry.id}>
            <div className="entry-header">
              <span className="timestamp">{entry.timestamp}</span>
              <span className="immutable-badge">🔒 수정 불가</span>
            </div>
            {entry.title && <div className="entry-title">{entry.title}</div>}
            <div className="entry-body">{entry.body}</div>
            {entry.tags.length > 0 && (
              <div className="entry-tags">
                {entry.tags.map((t) => (
                  <span className="entry-tag" key={t}>
                    @{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <ObservationModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} />
    </div>
  );
}
