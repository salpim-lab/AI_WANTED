// 담당: 진승혜 (단독 소유 — layout.tsx에서 분리해둠)
// 4개 탭: 대시보드 / 아이 상세 / 학생관찰일지 / 학부모상담기록
// 참고: docs/prototype/prototype-teacher.html .tab-bar

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/students", label: "아이 상세" },
  { href: "/observation", label: "학생관찰일지" },
  { href: "/consultation", label: "학부모상담기록" },
];

export default function TabNav() {
  const pathname = usePathname();

  return (
    <nav className="tab-bar">
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname?.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={"tab-btn" + (active ? " active" : "")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
