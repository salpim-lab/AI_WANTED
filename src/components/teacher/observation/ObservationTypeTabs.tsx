// 담당: 김현우
// 학생관찰일지 상단 — "전체/관찰/상담" 종류 탭(상담 = 학생 본인과의 상담). 바꾸면 ?type= 으로 이동하고
// (다른 파라미터는 그대로 유지) 서버가 그 종류로 다시 걸러 보여준다.

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { RecordTypeFilter } from "@/lib/types/teacherRecord";

const TYPE_OPTIONS: { value: RecordTypeFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "observation", label: "관찰" },
  { value: "consultation", label: "상담" },
];

export default function ObservationTypeTabs({ type }: { type: RecordTypeFilter }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(next: RecordTypeFilter) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("type");
    else params.set("type", next);
    const qs = params.toString();
    router.push(qs ? `/observation?${qs}` : "/observation", { scroll: false });
  }

  return (
    <div role="group" aria-label="기록 종류" className="flex shrink-0 rounded-lg border border-gray-200 bg-white p-0.5">
      {TYPE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => navigate(opt.value)}
          aria-pressed={type === opt.value}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            type === opt.value ? "bg-indigo-50 text-indigo-600" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
