// 담당: 김현우 (단독 소유)
// 살핌 학생 화면 톤의 화면 바깥 틀 — 아이 상세 · 학생관찰일지 · 학부모상담기록에서 쓴다 (상담 리포트 인쇄 페이지는 제외).
// 학생 등교 홈의 교실 일러스트를 뒤에 흐리게 깔고, 글꼴·글자색을 학생 화면과 맞춘다(ui.ts salpimScreen).
// 배경은 본문 영역 안에만 깐다(absolute). 화면 전체(fixed)에 깔면 왼쪽 메뉴 사이드바 위까지 덮어 메뉴가 흐려진다.
// 그림은 bg-fixed로 화면에 고정돼 스크롤해도 움직이지 않는다.

import { salpimScreen } from "./ui";

export default function SalpimBackdrop({ children }: { children: React.ReactNode }) {
  return (
    // 52px = 교사 화면 상단 헤더(.app-header) 높이 — 내용이 짧아도 배경이 화면 아래까지 찬다
    <div className={`relative isolate min-h-[calc(100vh-52px)] ${salpimScreen}`}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden print:hidden">
        <div
          className="absolute inset-0 bg-cover bg-fixed bg-center opacity-45"
          style={{ backgroundImage: "url('/brand/checkin_home-배경만.webp')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/55 via-[#f7f5ff]/75 to-[#f4f1ff]/90" />
      </div>
      {children}
    </div>
  );
}
