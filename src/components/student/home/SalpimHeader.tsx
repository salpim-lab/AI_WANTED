// 담당: 이유민 (Claude 세션)
// 좌측 상단 살핌 로고 + 태그라인. 두 화면에서 위치가 같다.
export default function SalpimHeader() {
  return (
    <div className="absolute left-[2.4cqw] top-[4.4cqh] z-[2] flex items-center gap-[2.2cqw]">
      <div className="flex items-end gap-[0.5cqw]">
        <span className="sh-cute text-[5.6cqh] leading-none tracking-tight text-[var(--sh-navy)]">
          살핌
        </span>
        <svg viewBox="0 0 26 32" style={{ height: "5.6cqh" }} aria-hidden="true">
          <line x1="6" y1="8" x2="3.6" y2="2.4" stroke="var(--sh-violet)" strokeWidth="2.6" strokeLinecap="round" />
          <line x1="13" y1="5.6" x2="13" y2="0.8" stroke="var(--sh-violet)" strokeWidth="2.6" strokeLinecap="round" />
          <line x1="20" y1="8" x2="22.4" y2="2.8" stroke="var(--sh-violet)" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="13" cy="20.5" r="10.5" fill="var(--sh-violet)" />
          <circle cx="9.3" cy="18" r="1.8" fill="#fff" />
          <circle cx="16.7" cy="18" r="1.8" fill="#fff" />
          <path d="M9 23.2Q13 27.2 17 23.2" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-[2.1cqh] font-medium leading-[1.45] text-[var(--sh-muted)]">
        오늘도,
        <br />
        너의 마음을 들어요
      </p>
    </div>
  );
}
