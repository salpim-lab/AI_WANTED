// 담당: 진승혜 (단독 소유 — layout.tsx에서 분리해둠)
// 상단 탭바 → 왼쪽 사이드바로 변경 (2026-09 대시보드 개편).
// 메뉴 4개: 대시보드 / 아이 상세 / 업무기록 / 학부모상담
// route 는 기존 그대로 유지한다 (/dashboard, /students, /observation, /consultation).
// active 판정도 기존 usePathname 로직을 그대로 쓴다.
//
// 스타일은 styles/prototype-teacher-sidebar.css(내 소유). 공용 shared.css 는 건드리지 않는다.
// 아이콘 없이 텍스트만 — 차분한 톤 유지 (참고 이미지의 여백/밀도 기준).
//
// 여닫이 (2026-09-18 김현우 추가 — 진승혜 님과 PR 협의):
//   맨 위 버튼으로 사이드바를 접는다. 접으면 좁은 줄에 메뉴 아이콘만 남아 이동은 계속 된다.
//   펼친 상태는 원래대로 글자만 — 아이콘은 접었을 때만 보인다.
//   열림/닫힘은 이 브라우저에 기억한다(localStorage — 개인 편의 설정이라 서버에 두지 않는다).
//   좁은 화면(가로 메뉴)에서는 접을 필요가 없어 버튼을 숨긴다(CSS).

"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "@/styles/prototype-teacher-sidebar.css";

const TABS = [
  { href: "/dashboard", label: "대시보드", icon: "dashboard" },
  { href: "/students", label: "아이 상세", icon: "student" },
  { href: "/observation", label: "업무 기록", icon: "note" },
  { href: "/consultation", label: "학부모 상담", icon: "talk" },
] as const;

/** 접힌 사이드바의 메뉴 아이콘 — 선 하나 굵기로 차분하게 */
const ICON_PATHS: Record<(typeof TABS)[number]["icon"], React.ReactNode> = {
  // 대시보드: 네 칸 격자
  dashboard: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" />
    </>
  ),
  // 아이 상세: 사람
  student: (
    <>
      <circle cx="10" cy="7" r="3.2" />
      <path d="M4 17c.8-3.2 3.2-5 6-5s5.2 1.8 6 5" />
    </>
  ),
  // 업무기록: 노트와 연필
  note: (
    <>
      <path d="M13 3H5.5A1.5 1.5 0 0 0 4 4.5v11A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V9" />
      <path d="M7 8h4M7 11h5M7 14h3" />
      <path d="M15.5 2.8l1.7 1.7-5 5-2.2.5.5-2.2z" />
    </>
  ),
  // 학부모상담: 말풍선 둘
  talk: (
    <>
      <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h6A2.5 2.5 0 0 1 14 5.5v3a2.5 2.5 0 0 1-2.5 2.5H8l-3 2.5V11h0A2.5 2.5 0 0 1 3 8.5z" />
      <path d="M16.5 8.5A2.5 2.5 0 0 1 17 10v2.5a2.5 2.5 0 0 1-2 2.45V17l-2.6-2h-1.9a2.5 2.5 0 0 1-2.1-1.1" />
    </>
  ),
};

const STORAGE_KEY = "salpim.sideNavCollapsed";
const CHANGE_EVENT = "salpim:side-nav";

// localStorage는 막혀 있거나(사생활 보호 모드) 없을 수 있다 — 실패하면 펼친 상태로 둔다
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // 기억하지 못해도 이번 화면에서는 바뀐다
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange); // 다른 탭에서 바꾼 것도 따라간다
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export default function TabNav() {
  const pathname = usePathname();
  // 서버 렌더와 첫 화면은 펼친 상태 — 저장된 값은 브라우저에서 읽는다 (hydration 불일치 없음)
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);

  return (
    <nav
      id="teacher-side-nav"
      className={"side-nav" + (collapsed ? " side-nav--collapsed" : "")}
      aria-label="교사 메뉴"
    >
      <div className="side-nav-top">
        <div className="side-nav-label">메뉴</div>
        <button
          type="button"
          className="side-nav-toggle"
          onClick={() => writeCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-controls="teacher-side-nav"
          aria-label={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
          title={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
        >
          <svg aria-hidden viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? <path d="M8 5l5 5-5 5" /> : <path d="M12 5l-5 5 5 5" />}
          </svg>
        </button>
      </div>
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname?.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            aria-label={collapsed ? tab.label : undefined}
            title={collapsed ? tab.label : undefined}
            className={"side-nav-item" + (active ? " active" : "")}
          >
            <span className="side-nav-icon" aria-hidden>
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                {ICON_PATHS[tab.icon]}
              </svg>
            </span>
            <span className="side-nav-text">{tab.label}</span>
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
