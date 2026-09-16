// 담당: 이유민 (Claude 세션)
// 등교·하교가 공유하는 중앙 인사 블록 (제목 + 부제 + CTA).
//
// 하교 홈: 처음부터 이 화면
// 등교 홈: 편지를 X 로 닫으면 이 화면이 된다
//
// 세 요소를 한 덩어리로 묶어야 뒤에 깔리는 빛 무리(sh-intro-glow)가
// 제목부터 버튼까지 한 번에 덮는다. 등교 배경의 칠판처럼 어두운 면 위에서도
// 글자가 읽히게 하려는 장치다.
import CtaButton from "./CtaButton";

export default function HomeIntro({
  title,
  subtitle,
  onNext,
}: {
  /** 제목. 강조할 이름 부분은 <span> 으로 감싸 넘긴다 */
  title: React.ReactNode;
  subtitle: string;
  onNext: () => void;
}) {
  return (
    <div className="sh-intro absolute left-1/2 top-[25cqh] z-[2] flex -translate-x-1/2 flex-col items-center text-center">
      <h1 className="sh-cute text-[8cqh] leading-[1.3] tracking-tight text-[var(--sh-navy)]">
        {title}
      </h1>
      <p className="mt-[2cqh] text-[3.2cqh] font-bold text-[var(--sh-muted)]">
        {subtitle}
      </p>
      <div className="mt-[5.5cqh]">
        <CtaButton onClick={onNext} />
      </div>
    </div>
  );
}
