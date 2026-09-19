// 담당: 이유민
// 서비스 로고 — "살핌" 글자 + 살핌 얼굴 + "오늘도, / 너의 마음을 들어요".
// 학생 화면 머리(components/student/home/SalpimHeader)가 기준이다. 첫 페이지·교사 화면 헤더도
// 같은 구성과 비율로 이 컴포넌트를 쓴다. 로고를 고칠 때는 두 곳을 같이 본다.
//
// 학생 화면은 태블릿 화면 비율(cqh) 단위라 이 컴포넌트를 직접 쓰지 않고, 비율만 똑같이 맞춘다.
//   글자 5.6 : 얼굴 5.6 : 문구 2.1 / 글자-얼굴 간격 = 글자의 0.14배, 로고-문구 간격 = 글자의 0.63배
// 색은 학생 화면 변수(--sh-*)를 쓰되, 그 변수가 없는 화면에서도 같은 색이 나오게 기본값을 둔다.
import SalpimFace from "@/components/student/SalpimFace";

export default function SalpimLogo({
  size = 26,
  tagline = true,
}: {
  /** "살핌" 글자 크기(px). 얼굴도 같은 높이다 */
  size?: number;
  /** 오른쪽 두 줄 문구를 보일지 */
  tagline?: boolean;
}) {
  return (
    <div className="flex items-center" style={{ gap: Math.round(size * 0.63) }}>
      <div className="flex items-end" style={{ gap: Math.round(size * 0.14) }}>
        <span
          style={{
            // 로고 글꼴(Jua)은 굵기가 하나뿐이다. 굵게를 걸면 가짜 굵기가 입혀져 학생 화면과 달라진다
            fontFamily: 'var(--font-cute), var(--font-sans-kr), "Apple SD Gothic Neo", sans-serif',
            fontWeight: 400,
            fontSize: size,
            lineHeight: 1,
            letterSpacing: "-0.025em",
            color: "var(--sh-navy, #102a56)",
          }}
        >
          살핌
        </span>
        <SalpimFace style={{ height: size, width: "auto", display: "block" }} />
      </div>
      {tagline && (
        <p
          style={{
            margin: 0,
            // 학생 화면 비율(글자의 0.375배)대로면 10px 이 안 돼 읽기 어렵다 — 11px 아래로는 내리지 않는다
            fontSize: Math.max(11, Math.round(size * 0.375)),
            fontWeight: 500,
            lineHeight: 1.45,
            color: "var(--sh-muted, #7d849b)",
            whiteSpace: "nowrap",
          }}
        >
          오늘도,
          <br />
          너의 마음을 들어요
        </p>
      )}
    </div>
  );
}
