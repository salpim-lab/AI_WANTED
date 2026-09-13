// 담당: 김현우
// 학생관찰일지 글쓰기 모달. @아이이름 태그(TagInput 재사용), 저장 후 수정 불가.
// 참고: docs/prototype/prototype-teacher.html #modal-obs

"use client";

import { useState } from "react";
import Modal from "@/components/shared/Modal";
import TagInput from "@/components/shared/TagInput";

export default function ObservationModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (entry: { body: string; tags: string[] }) => void;
}) {
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  function handleSave() {
    const trimmed = content.trim();
    if (!trimmed) return;
    onSave({ body: trimmed, tags });
    setContent("");
    setTags([]);
  }

  return (
    <Modal open={open} title="새 관찰 기록" onClose={onClose}>
      <div className="modal-label">내용</div>
      <textarea
        className="modal-textarea"
        rows={5}
        placeholder="오늘 관찰한 내용을 적어주세요…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="modal-label">관련 아이 태그</div>
      <TagInput tags={tags} onChange={setTags} />
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
