// 담당: 이유민
// 첫 화면(학생/교사 고르는 페이지)으로 가는 버튼에 쓰는 집 아이콘.
// 학생 화면과 선생님 화면이 같은 그림을 쓰도록 한곳에 둔다.
export default function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9v10h11V9" />
      <path d="M10 19v-5h4v5" />
    </svg>
  );
}
