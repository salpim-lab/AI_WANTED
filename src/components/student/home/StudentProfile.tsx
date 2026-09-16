// 담당: 이유민 (Claude 세션)
// 우측 상단 프로필 pill. 사진은 나중에 업로드하므로 지금은 빈 원형이다.
export default function StudentProfile({
  name,
  photoSrc,
}: {
  name: string;
  photoSrc?: string;
}) {
  return (
    <div className="sh-profile absolute right-[2.2cqw] top-[4.2cqh] z-[2] gap-[1.2cqw] py-[0.9cqh] pl-[0.9cqh] pr-[1.8cqw]">
      {photoSrc ? (
        <img src={photoSrc} alt="" className="sh-avatar" style={{ width: "5.4cqh", height: "5.4cqh" }} />
      ) : (
        <span className="sh-avatar block" style={{ width: "5.4cqh", height: "5.4cqh" }} aria-hidden="true" />
      )}
      <span className="sh-cute text-[2.7cqh] text-[var(--sh-navy)]">{name}</span>
      <svg viewBox="0 0 8 14" style={{ height: "2.2cqh" }} aria-hidden="true">
        <path d="M1.5 1 6.5 7l-5 6" stroke="#9aa2ba" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
