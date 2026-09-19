// 담당: 이유민 (Claude 세션)
// 하교 홈. 선생님 편지·캐릭터 일러스트는 넣지 않는다.
//
// "교사 시점으로 전환하기": 공개 링크로 들어온 사람이 학생 흐름(등교 → 섬 → 하교)을 다 겪은 뒤
// 같은 데이터를 교사 쪽에서 보게 하는 출구다. 아이에게는 주 버튼이 아니므로 아래쪽에 조용한
// 보조 버튼으로 둔다 — 주 버튼("오늘의 마음 이야기하기")과 비중이 같아지면 안 된다.
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

      <Link href="/dashboard" className="sh-switch-teacher absolute bottom-[5cqh] left-1/2 z-[3] -translate-x-1/2">
        교사 시점으로 전환하기
      </Link>
    </>
  );
}
