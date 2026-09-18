// 담당: 이유민 (Claude 세션)
// 좌측 상단 살핌 로고 + 태그라인.
import SalpimFace from "../SalpimFace";
export default function SalpimHeader() {
  return (
    <div
      className="absolute left-[2.4cqw] top-[4.4cqh] z-[2] flex items-center gap-[2.2cqw]"
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
