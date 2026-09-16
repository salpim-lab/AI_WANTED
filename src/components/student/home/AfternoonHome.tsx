// 담당: 이유민 (Claude 세션)
// 하교 홈. 선생님 편지·캐릭터 일러스트는 넣지 않는다.
import HomeIntro from "./HomeIntro";

export default function AfternoonHome({
  studentName,
  onNext,
}: {
  studentName: string;
  onNext: () => void;
}) {
  return (
    <>
      <HomeIntro
        title={
          <>
            <span className="text-[var(--sh-violet-light)]">{studentName}</span>아,
            <br />
            오늘 하루 어땠어?
          </>
        }
        subtitle="지금 네 마음을 들려줘!"
        onNext={onNext}
      />

      <p className="sh-hand absolute left-[3.4cqw] top-[44cqh] z-[2] text-[2.6cqh]">
        오늘도
        <br />
        수고했어! ☺
      </p>
      <p className="sh-hand absolute right-[3.2cqw] top-[38cqh] z-[2] text-right text-[2.6cqh]">
        내일도
        <br />
        좋은 하루가
        <br />될 거야! 💜
      </p>
    </>
  );
}
