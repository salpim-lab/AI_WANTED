// 담당: 이유민 (Claude 세션)
// 하교 홈. 선생님 편지·캐릭터 일러스트는 넣지 않는다.
//
// "교사 시점으로 전환하기": 공개 링크로 들어온 사람이 학생 흐름(등교 → 섬 → 하교)을 다 겪은 뒤
// 같은 데이터를 교사 쪽에서 보게 하는 출구다. 주 버튼과 같은 크기로 그 아래에 둔다.
// 주 버튼은 라벤더로 칠하고, 이 버튼은 프로필 알약과 같은 반투명 흰색이라 무엇이 먼저인지 구분된다.
import Link from "next/link";
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
        secondary={
          <Link href="/dashboard" className="sh-cta sh-cta--ghost px-[7cqh] py-[2.4cqh] text-[3.1cqh]">
            교사 시점으로 전환하기
          </Link>
        }
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
        <br />될 거야!
      </p>
    </>
  );
}
