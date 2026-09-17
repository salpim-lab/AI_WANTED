// 담당: 이유민
// 살핌 브랜드 얼굴. 로고와 대화 아바타가 같은 얼굴을 써야 해서 여기로 뺐다.
// 한쪽만 고쳐서 달라지는 일이 없도록 이 파일만 고친다.
export default function SalpimFace({
  className,
  withSparkles = true,
}: {
  className?: string;
  withSparkles?: boolean;
}) {
  return (
    <svg viewBox="0 0 26 32" className={className} aria-hidden="true">
      {withSparkles && (
        <>
          <line x1="6" y1="8" x2="3.6" y2="2.4" stroke="var(--sh-violet)" strokeWidth="2.6" strokeLinecap="round" />
          <line x1="13" y1="5.6" x2="13" y2="0.8" stroke="var(--sh-violet)" strokeWidth="2.6" strokeLinecap="round" />
          <line x1="20" y1="8" x2="22.4" y2="2.8" stroke="var(--sh-violet)" strokeWidth="2.6" strokeLinecap="round" />
        </>
      )}
      <circle cx="13" cy="20.5" r="10.5" fill="var(--sh-violet)" />
      <circle cx="9.3" cy="18" r="1.8" fill="#fff" />
      <circle cx="16.7" cy="18" r="1.8" fill="#fff" />
      <path d="M9 23.2Q13 27.2 17 23.2" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
