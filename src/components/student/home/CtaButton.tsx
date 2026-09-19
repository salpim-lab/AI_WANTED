// 담당: 이유민 (Claude 세션)
// 등교·하교가 공유하는 CTA. 목업 크기에 맞춘다.
export default function CtaButton({ onClick, arrow = true }: { onClick: () => void; arrow?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="sh-cta px-[7cqh] py-[2.4cqh] text-[3.1cqh]">
      오늘의 마음 이야기하기
      {/* 버튼이 둘 나란히 있을 때는 화살표를 뺀다 — 둘 다 같은 화살표면 어느 쪽이 먼저인지 흐려진다 */}
      {/* 중간 길이 화살표 — 처음 것은 글자보다 눈에 먼저 들어왔고, 너무 짧으면 화살표로 안 읽혔다 */}
      {arrow && (
        <svg viewBox="0 0 18 14" style={{ height: "2.2cqh" }} aria-hidden="true">
          <path d="M1.5 7h14M11 2.5 15.5 7 11 11.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
