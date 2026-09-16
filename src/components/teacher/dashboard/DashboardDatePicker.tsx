// 담당: 진승혜
// 대시보드 헤더 우측의 작은 날짜 선택 컨트롤.
//
// 날짜 "상태"는 여기서 들고 있지 않다 — URL 쿼리(?date=YYYY-MM-DD)가 단일 출처이고,
// 서버 컴포넌트인 page.tsx 가 그걸 읽어 각 카드에 데이터를 내려준다.
// 그래서 대시보드에서 클라이언트 컴포넌트는 이 파일 하나뿐이다.
// (교사가 특정 날짜 대시보드 URL 을 그대로 다시 열 수 있다.)
//
// 외부 date picker 패키지를 설치하지 않고 브라우저 기본 input[type=date] 를 쓰되,
// 투명하게 덮어씌워 표시 문구만 현재 디자인 톤으로 보여준다.

"use client";

import { useRouter } from "next/navigation";
import { formatDotDate } from "./mockData";

export default function DashboardDatePicker({
  dateKey,
  isToday,
  minDate,
  maxDate,
}: {
  dateKey: string;
  isToday: boolean;
  minDate: string;
  maxDate: string;
}) {
  const router = useRouter();

  function goTo(next: string) {
    if (!next || next > maxDate || next < minDate) return;
    router.push(next === maxDate ? "/dashboard" : `/dashboard?date=${next}`, { scroll: false });
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
          {formatDotDate(dateKey)}
        </span>
        <input
          type="date"
          className="date-input"
          value={dateKey}
          min={minDate}
          max={maxDate}
          aria-label="대시보드 날짜 선택"
          onChange={(e) => goTo(e.target.value)}
        />
      </label>

      {!isToday && (
        <button type="button" className="date-today-btn" onClick={() => goTo(maxDate)}>
          오늘로 돌아가기
        </button>
      )}
    </div>
  );
}
