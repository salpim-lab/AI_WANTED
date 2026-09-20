"use client";

// <a href> 는 호버하면 브라우저 왼쪽 아래에 이동 주소가 뜬다. href 없이 router.push 로 이동해 그걸 없앤다.
// ponytail: 새 탭 열기(휠클릭·⌘클릭)는 안 된다 — 필요한 곳은 next/link 를 그대로 쓴다.
import { useRouter } from "next/navigation";
import type { AnchorHTMLAttributes } from "react";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  scroll?: boolean;
};

export default function NavLink({ href, scroll, onClick, onKeyDown, onMouseEnter, style, ...rest }: Props) {
  const router = useRouter();
  const go = () => router.push(href, { scroll });
  return (
    <a
      role="link"
      tabIndex={0}
      {...rest}
      style={{ cursor: "pointer", ...style }}
      onMouseEnter={(e) => {
        onMouseEnter?.(e);
        router.prefetch(href);
      }}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) go();
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.key === "Enter") go();
      }}
    />
  );
}
