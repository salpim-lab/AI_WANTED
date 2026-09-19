"use client";

/**
 * 학생 흐름 2~5단계에서 서비스 첫 화면(학생/교사 고르는 페이지)으로 나가는 버튼. 프로필 오른쪽 모서리에 둔다.
 * 뒤로가기 버튼(StudentBackButton)과 같은 모양·크기로 맞춰 양쪽 모서리가 짝을 이룬다.
 */
export default function StudentHomeButton({ onHome }: { onHome: () => void }) {
  return (
    <button type="button" className="student-home-btn" onClick={onHome} aria-label="첫 화면으로 가기" title="첫 화면으로">
      <svg className="student-back__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 10.5 12 4l8 6.5" />
        <path d="M6.5 9v10h11V9" />
        <path d="M10 19v-5h4v5" />
      </svg>
    </button>
  );
}
