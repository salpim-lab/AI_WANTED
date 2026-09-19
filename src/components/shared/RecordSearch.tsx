// 담당: 김현우
// 기록 게시판 머리줄의 검색 — [학생 ▾] [키워드] 순서. 학부모상담기록·학생관찰일지가 같이 쓴다.
// 검색 버튼 없이 고르거나 입력하는 대로 basePath의 URL(q, student)을 바꾸고, 서버가 목록을 다시 그린다.
// 다른 쿼리(date, type 등)는 그대로 둔다. 키워드는 입력이 잠깐 멈췄을 때(DEBOUNCE_MS)만 반영한다.
// 입력값은 이 컴포넌트가 들고 있어서 서버가 다시 그려도 입력 중인 글자·커서가 사라지지 않는다.

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sortByKoreanName } from "@/components/shared/sortByKoreanName";
import { boardControl } from "@/components/shared/ui";
import type { ClassStudent } from "@/lib/types/teacherRecord";

const DEBOUNCE_MS = 300;

export default function RecordSearch({
  basePath,
  students,
  filter,
}: {
  /** 예: "/consultation", "/observation" */
  basePath: string;
  students: ClassStudent[];
  filter: { keyword?: string; studentId?: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [keyword, setKeyword] = useState(filter.keyword ?? "");
  const [studentId, setStudentId] = useState(filter.studentId ?? "");
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function apply(nextKeyword: string, nextStudentId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("student");
    if (nextKeyword.trim()) params.set("q", nextKeyword.trim());
    if (nextStudentId) params.set("student", nextStudentId);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${basePath}?${query}` : basePath, { scroll: false });
    });
  }

  function handleKeyword(value: string) {
    setKeyword(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => apply(value, studentId), DEBOUNCE_MS);
  }

  function handleStudent(value: string) {
    setStudentId(value);
    if (timer.current) clearTimeout(timer.current);
    apply(keyword, value);
  }

  return (
    <div role="search" className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <select
        value={studentId}
        onChange={(e) => handleStudent(e.target.value)}
        aria-label="학생"
        className={boardControl}
      >
        <option value="">전체 학생</option>
        {sortByKoreanName(students, (s) => s.name).map((s) => (
          <option key={s.studentId} value={s.studentId}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        type="search"
        value={keyword}
        onChange={(e) => handleKeyword(e.target.value)}
        placeholder="키워드 검색…"
        aria-label="키워드"
        className={`${boardControl} w-40`}
      />
    </div>
  );
}
