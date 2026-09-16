// 담당: 진승혜 (단독 소유 — layout.tsx에서 분리해둠)
// 상단 탭바 → 왼쪽 사이드바로 변경 (2026-09 대시보드 개편).
// 메뉴 4개: 대시보드 / 아이 상세 / 업무기록 / 학부모상담
// route 는 기존 그대로 유지한다 (/dashboard, /students, /observation, /consultation).
// active 판정도 기존 usePathname 로직을 그대로 쓴다.
//
// 스타일은 styles/prototype-teacher-sidebar.css(내 소유). 공용 shared.css 는 건드리지 않는다.
// 아이콘 없이 텍스트만 — 차분한 톤 유지 (참고 이미지의 여백/밀도 기준).

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import "@/styles/prototype-teacher-sidebar.css";

const TABS = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/students", label: "아이 상세" },
  { href: "/observation", label: "업무기록" },
  { href: "/consultation", label: "학부모상담" },
];

export default function TabNav() {
  const pathname = usePathname();

  return (
    <nav className="side-nav" aria-label="교사 메뉴">
      <div className="side-nav-label">메뉴</div>
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname?.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={"side-nav-item" + (active ? " active" : "")}
          >
            {tab.label}
          </Link>
        );
      })}
      <div className="side-nav-foot">
        기록은 평가가 아니라
        <br />
        먼저 살펴보기 위한 것입니다.
      </div>
    </nav>
  );
}
