// 담당: 김현우 (단독 소유)
// 글쓰기 시 "@아이이름" 태그 입력 (학생관찰일지, 학부모상담기록에서 사용)
// 참고: docs/prototype/prototype-teacher.html #obs-tag-input
// 이름 후보는 STUDENTS(components/teacher/students/mockData.ts)에서 가져올 것 — 지금은 프로토타입 목록 그대로.

"use client";

import { useState } from "react";

const SUGGESTIONS = ["김민준", "이서연", "박예린", "최하준", "정지우", "한지훈"];

export default function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [value, setValue] = useState("");

  function addTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    onChange([...tags, trimmed]);
  }

  function removeTag(name: string) {
    onChange(tags.filter((t) => t !== name));
  }

  return (
    <>
      <div className="tag-input-wrap">
        {tags.map((t) => (
          <div className="tag-pill" key={t}>
            @{t}
            <button
              type="button"
              className="remove"
              onClick={() => removeTag(t)}
              aria-label={`${t} 태그 삭제`}
            >
              ✕
            </button>
          </div>
        ))}
        <input
          type="text"
          value={value}
          placeholder="이름 입력…"
          style={{ border: "none", outline: "none", fontSize: 12, minWidth: 80, fontFamily: "inherit" }}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              e.preventDefault();
              addTag(value);
              setValue("");
            }
          }}
        />
      </div>
      <div className="tag-suggestions">
        {SUGGESTIONS.map((name) => (
          <span key={name} className="tag-suggestion" onClick={() => addTag(name)}>
            {name}
          </span>
        ))}
      </div>
    </>
  );
}
