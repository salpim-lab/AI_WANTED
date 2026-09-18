// 담당: 이유민 (Claude 세션)
// 좌측 상단 살핌 로고 + 태그라인.
//
// top 을 고정하지 않고 --sh-header-top 을 쓰는 이유: 홈은 스테이지 맨 위에서
// 시작하지만 마음·대화 화면은 진행 점 줄 아래에서 시작한다. 같은 값을 주면
// 홈에서만 위에 붙고 나머지는 점 줄 높이만큼 내려가 어긋난다.
import SalpimFace from "../SalpimFace";
export default function SalpimHeader() {
  return (
    <div
      className="absolute left-[2.4cqw] z-[2] flex items-center gap-[2.2cqw]"
      style={{ top: "var(--sh-header-top, 4.4cqh)" }}
    >
      <div className="flex items-end gap-[0.5cqw]">
        <span className="sh-cute text-[5.6cqh] leading-none tracking-tight text-[var(--sh-navy)]">
          살핌
        </span>
        <SalpimFace className="h-[5.6cqh]" />
      </div>
      <p className="text-[2.1cqh] font-medium leading-[1.45] text-[var(--sh-muted)]">
        오늘도,
        <br />
        너의 마음을 들어요
      </p>
    </div>
  );
}
