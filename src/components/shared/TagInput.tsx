// 담당: 김현우 (단독 소유)
// 글쓰기 시 "@아이이름" 태그 입력 (학생관찰일지에서 사용).
// 이름 문자열이 아니라 학생 id로 선택된다. name을 주면 선택된 id들을 hidden input으로 함께 제출한다
// (Server Action에서 formData.getAll(name)).
// 학급 명단(options)에 있는 아이만 태그할 수 있다 — 동명이인·오타로 엉뚱한 아이에게 기록이 붙지 않게.
// 입력창을 누르면 아직 태그하지 않은 아이 전체가 가나다 순으로 뜨고, 글자를 치면 그 이름으로 좁혀진다.
// 참고: docs/prototype/prototype-teacher.html #obs-tag-input

"use client";

import { useId, useState } from "react";
import { sortByKoreanName } from "@/components/shared/sortByKoreanName";

export type TagOption = { id: string; label: string };

export default function TagInput({
  options,
  value,
  onChange,
  name,
  inputId,
}: {
  options: TagOption[];
  value: TagOption[];
  onChange: (tags: TagOption[]) => void;
  /** 폼 제출용 hidden input 이름 */
  name?: string;
  /** 바깥 <label htmlFor>와 연결할 입력창 id */
  inputId?: string;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const hintId = useId();

  const selectedIds = new Set(value.map((tag) => tag.id));
  const term = query.trim().replace(/^@/, "");
  const candidates = sortByKoreanName(
    options.filter((option) => !selectedIds.has(option.id) && option.label.includes(term)),
    (option) => option.label,
  );

  function add(option: TagOption) {
    onChange([...value, option]);
    setQuery("");
  }

  function remove(id: string) {
    onChange(value.filter((tag) => tag.id !== id));
  }

  return (
    <div>
      <div className="flex min-h-10 cursor-text flex-wrap items-center gap-1.5 rounded-[9px] border-[1.5px] border-gray-200 px-3 py-2 transition-colors focus-within:border-indigo-500">
        {value.map((tag) => (
          <span
            key={tag.id}
            className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700"
          >
            @{tag.label}
            <button
              type="button"
              onClick={() => remove(tag.id)}
              aria-label={`${tag.label} 태그 삭제`}
              className="text-[11px] opacity-60 hover:opacity-100"
            >
              ✕
            </button>
            {name && <input type="hidden" name={name} value={tag.id} />}
          </span>
        ))}
        <input
          id={inputId}
          type="text"
          value={query}
          placeholder={value.length ? "" : "이름 입력…"}
          aria-describedby={hintId}
          autoComplete="off"
          className="min-w-20 flex-1 border-none text-xs outline-none"
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault(); // 태그 입력 중 Enter로 폼이 제출되지 않게
              const exact = candidates.find((option) => option.label === term);
              const pick = exact ?? (candidates.length === 1 ? candidates[0] : undefined);
              if (term && pick) add(pick);
            } else if (event.key === "Backspace" && !query && value.length > 0) {
              remove(value[value.length - 1].id);
            }
          }}
        />
      </div>
      {(focused || term) && (
        // 칩을 눌러도 입력창 포커스가 빠지지 않게 mousedown을 막는다 (안 그러면 누르는 순간 목록이 닫힌다)
        <div
          id={hintId}
          onMouseDown={(event) => event.preventDefault()}
          className="mt-1.5 flex max-h-28 flex-wrap items-center gap-1.5 overflow-y-auto"
        >
          {candidates.length === 0 ? (
            <span className="text-[11px] text-gray-500">
              {term ? "우리 반 명단에 없는 이름이에요." : "태그할 수 있는 아이를 모두 골랐어요."}
            </span>
          ) : (
            candidates.map((option) => (
              <button
                type="button"
                key={option.id}
                onClick={() => add(option)}
                className="rounded-full border-[1.5px] border-gray-200 bg-[#f8f7f4] px-2.5 py-[3px] text-[11px] font-semibold text-gray-500 transition-colors hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-500"
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
