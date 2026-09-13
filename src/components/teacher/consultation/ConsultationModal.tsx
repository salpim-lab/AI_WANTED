// 담당: 김현우
// 학부모상담기록 글쓰기 모달. 아이 이름 클릭 시 <DataExportBox /> 로 상담 자료 노출.
// 참고: docs/prototype/prototype-teacher.html #modal-consult

"use client";

import { useState } from "react";
import Modal from "@/components/shared/Modal";
import DataExportBox from "./DataExportBox";
import { CONSULT_CANDIDATES } from "./mockData";

export default function ConsultationModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (entry: { studentName?: string; body: string }) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");

  function handleSave() {
    const trimmed = content.trim();
    if (!trimmed) return;
    onSave({ studentName: selected ?? undefined, body: trimmed });
    setContent("");
    setSelected(null);
  }

  return (
    <Modal open={open} title="학부모 상담 기록" onClose={onClose}>
      <div className="modal-label">관련 학생 선택</div>
      <div className="student-select-row">
        {CONSULT_CANDIDATES.map((name) => (
          <button
            key={name}
            type="button"
            className={"student-select-btn" + (selected === name ? " selected" : "")}
            onClick={() => setSelected(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {selected && <DataExportBox studentName={selected} />}

      <div className="modal-label">상담 내용</div>
      <textarea
        className="modal-textarea"
        rows={5}
        placeholder="상담 일시, 방식(전화/방문), 주요 내용을 적어주세요…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="modal-note">🔒 저장 후 수정할 수 없습니다. 서버 타임스탬프가 자동으로 찍힙니다.</div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          취소
        </button>
        <button className="btn btn-primary" onClick={handleSave}>
          저장하기
        </button>
      </div>
    </Modal>
  );
}
