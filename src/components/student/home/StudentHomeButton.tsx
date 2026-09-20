"use client";

import HomeIcon from "@/components/shared/HomeIcon";

/**
 * 학생 화면에서 서비스 첫 화면(학생/교사 고르는 페이지)으로 나가는 버튼.
 * 프로필 알약 오른쪽에 같은 높이의 흰 원으로 둔다.
 */
export default function StudentHomeButton({ onHome }: { onHome: () => void }) {
  return (
    <button type="button" className="student-home-btn" onClick={onHome} aria-label="첫 화면으로 가기" title="첫 화면으로">
      <HomeIcon className="student-home-btn__icon" />
    </button>
  );
}
