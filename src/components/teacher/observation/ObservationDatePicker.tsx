// 담당: 김현우
// 학생관찰일지 상단 — 날짜 선택. 바꾸면 ?date= 로 이동하고(다른 파라미터는 그대로 유지) 서버가 그 날짜
// 기록을 다시 조회한다. 오늘 이후 날짜는 고를 수 없다 (서버에서도 오늘로 되돌린다).

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { textInput } from "@/components/shared/ui";

export default function ObservationDatePicker({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <input
      type="date"
      aria-label="날짜 선택"
      value={date}
      max={today}
      onChange={(e) => {
        const next = e.target.value;
        if (!next) return;
        const params = new URLSearchParams(searchParams.toString());
        params.set("date", next);
        const qs = params.toString();
        router.push(qs ? `/observation?${qs}` : "/observation", { scroll: false });
      }}
      className={`${textInput} shrink-0 py-[5px]`}
    />
  );
}
