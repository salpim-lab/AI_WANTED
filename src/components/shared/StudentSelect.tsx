// 담당: 김현우 (단독 소유)
// 머리줄의 "전체 학생 ▾" 드롭다운. 브라우저 기본 <select>는 OS마다 화살표·팝업 모양이 달라서
// (macOS는 자체 메뉴로 그린다) 직접 그렸다 — 어느 컴퓨터에서 봐도 같은 모양이다.
// 이름은 가나다 순. 값은 student_id, 빈 문자열이 "전체 학생".
// 키보드: 버튼에서 ↑↓/Enter/Space로 열고, 열린 뒤 ↑↓로 옮기고 Enter로 고른다. Esc·바깥 클릭으로 닫는다.

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { sortByKoreanName } from "@/components/shared/sortByKoreanName";
import { boardControl } from "@/components/shared/ui";
import type { ClassStudent } from "@/lib/types/teacherRecord";

const ALL_LABEL = "전체 학생";

export default function StudentSelect({
  students,
  value,
  onChange,
}: {
  students: ClassStudent[];
  /** 고른 student_id — 빈 문자열이면 전체 학생 */
  value: string;
  onChange: (studentId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const options = [{ value: "", label: ALL_LABEL }, ...sortByKoreanName(students, (s) => s.name).map((s) => ({ value: s.studentId, label: s.name }))];
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // 열릴 때와 방향키로 옮길 때 고른 줄이 보이게 스크롤한다
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  function openList() {
    setActive(selectedIndex);
    setOpen(true);
  }

  function choose(index: number) {
    setOpen(false);
    if (options[index].value !== value) onChange(options[index].value);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openList();
      setActive((i) => Math.min(options.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) choose(active);
      else openList();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        role="combobox"
        aria-label="학생"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
        className={`${boardControl} inline-flex min-w-[124px] cursor-pointer items-center justify-between gap-2 whitespace-nowrap`}
      >
        {options[selectedIndex].label}
        <svg viewBox="0 0 12 12" aria-hidden className={`size-3 shrink-0 text-[#7d849b] transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="학생 선택"
          className="absolute left-0 top-[calc(100%+6px)] z-30 max-h-64 min-w-full overflow-y-auto rounded-xl border border-[#e6e2fb] bg-white p-1 shadow-[0_10px_28px_rgba(99,91,255,.16)]"
        >
          {options.map((option, index) => (
            <li
              key={option.value || "all"}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === value}
              // 눌러도 버튼의 포커스가 빠지지 않게 mousedown을 막는다
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
              className={`cursor-pointer whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] ${
                option.value === value ? "font-bold text-[#635bff]" : "font-medium text-[#102a56]"
              } ${index === active ? "bg-[#f5f3ff]" : ""}`}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
