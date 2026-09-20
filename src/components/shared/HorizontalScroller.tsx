// 담당: 김현우 (단독 소유)
// 가로로 쌓이는 목록을 옆으로 넘기는 래퍼 — 넘칠 때만 양 끝에 ‹ › 버튼과 흐림 가장자리가 나타난다.
// 트랙패드·터치 스크롤은 그대로 두고, 스크롤바는 숨긴다. 버튼 한 번에 보이는 폭의 약 80%씩 넘긴다.
// 자식은 <li>로 넘긴다 (listClassName의 <ul> 안에 그대로 들어간다).

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export default function HorizontalScroller({
  listClassName,
  label,
  showArrows = true,
  children,
}: {
  listClassName?: string;
  label: string;
  /** false 면 넘쳐도 ‹ › 버튼을 숨긴다 (항목이 1개뿐인 줄 등) */
  showArrows?: boolean;
  children: ReactNode;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 1);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [update]);

  const scrollByPage = (direction: 1 | -1) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const arrow =
    "absolute top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-gray-200 bg-white text-base leading-none text-gray-500 shadow-sm transition hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2";
  const fade = "pointer-events-none absolute inset-y-0 w-10 transition-opacity duration-200";

  return (
    <div className="relative min-w-0">
      <ul ref={listRef} aria-label={label} className={`${listClassName ?? ""} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
        {children}
      </ul>

      <div
        aria-hidden
        className={`${fade} left-0 bg-gradient-to-r from-[var(--surface)] to-transparent ${canPrev ? "opacity-100" : "opacity-0"}`}
      />
      <div
        aria-hidden
        className={`${fade} right-0 bg-gradient-to-l from-[var(--surface)] to-transparent ${canNext ? "opacity-100" : "opacity-0"}`}
      />

      {showArrows && canPrev && (
        <button type="button" onClick={() => scrollByPage(-1)} aria-label={`${label} 이전`} className={`${arrow} -left-3`}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6.5 1.5 3 5l3.5 3.5" /></svg>
        </button>
      )}
      {showArrows && canNext && (
        <button type="button" onClick={() => scrollByPage(1)} aria-label={`${label} 다음`} className={`${arrow} -right-3`}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 1.5 7 5 3.5 8.5" /></svg>
        </button>
      )}
    </div>
  );
}
