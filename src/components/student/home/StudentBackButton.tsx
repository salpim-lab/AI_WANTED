"use client";

/** 학생 흐름 2~4단계에서 이전 화면으로 돌아가는 작은 보조 버튼. */
export default function StudentBackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="student-back" onClick={onBack} aria-label="이전 화면으로 돌아가기">
      <svg className="student-back__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m14.5 5-7 7 7 7" />
      </svg>
    </button>
  );
}
