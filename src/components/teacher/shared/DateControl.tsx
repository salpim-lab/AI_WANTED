"use client";

// 담당: 진승혜
// 교사 화면 공용 날짜 컨트롤. 대시보드·아이 상세·학생관찰일지가 같은 모양을 쓴다.
// (원래 대시보드에만 있던 DashboardDatePicker 를 세 화면이 쓰도록 일반화한 것)
//
// 날짜 "상태"는 여기서 들고 있지 않다 — URL 쿼리(?date=YYYY-MM-DD)가 단일 출처이고
// 각 화면의 서버 컴포넌트가 그걸 읽어 데이터를 내려준다. 그래서 새로고침·뒤로가기·링크 공유가 그냥 된다.
//
// 표시 문구는 아이 상세가 쓰던 formatKstDate ("9월 16일 (수)") 로 통일했다.
//
// 외부 date picker 패키지를 설치하지 않고 브라우저 기본 input[type=date] 를 쓰되,
// 투명하게 덮어씌워 표시 문구만 현재 디자인 톤으로 보여준다.

import { useRouter, useSearchParams } from "next/navigation";
import { formatKstDate } from "@/components/shared/datetime";
import "@/styles/teacher-date-control.css";

export default function DateControl({
  dateKey,
  today,
  basePath,
  minDate,
  maxDate,
  label = "날짜 선택",
}: {
  dateKey: string;
  /** "오늘" 뱃지 기준. 이 날짜로 돌아가면 ?date= 를 URL 에서 지운다. maxDate 와 다를 수 있다. */
  today: string;
  /** 이동할 경로. 예: "/dashboard", "/students/abc" */
  basePath: string;
  minDate?: string;
  maxDate?: string;
  label?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isToday = dateKey === today;

  function goTo(next: string) {
    if (!next || next === dateKey) return;
    if (maxDate && next > maxDate) return;
    if (minDate && next < minDate) return;
    // 그 화면의 다른 필터(type, q 등)를 날리지 않는다.
    const params = new URLSearchParams(searchParams.toString());
    if (next === today) params.delete("date");
    else params.set("date", next);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
  }

  return (
    <div className="date-control">
      <label className="date-field">
        <svg className="date-icon" viewBox="0 0 24 24" aria-hidden focusable="false">
          <rect x="3.5" y="5" width="17" height="15" rx="3" />
          <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
          <line x1="8" y1="3" x2="8" y2="6.5" />
          <line x1="16" y1="3" x2="16" y2="6.5" />
        </svg>
        <span className="date-text">
          {isToday && <em>오늘</em>}
          {formatKstDate(dateKey)}
        </span>
        <input
          type="date"
          className="date-input"
          value={dateKey}
          min={minDate}
          max={maxDate}
          aria-label={label}
          onChange={(e) => goTo(e.target.value)}
        />
      </label>
    </div>
  );
}
