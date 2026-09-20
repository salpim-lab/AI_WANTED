// 담당: 김현우
// 아이 상세 탭의 좌우 분할 화면. students/layout.tsx에서만 쓴다.
// 현재 URL에서 선택된 아이(/students/[id]의 id)를 useSelectedLayoutSegment로 읽어서
//   - 선택 없음: 자리 배치도 전체 폭
//   - 선택 있음: 자리 배치도는 왼쪽 좁은 열(넓은 화면에서 스크롤해도 고정), 오른쪽에 상세(children)
// 좁은 화면(lg 미만)에서는 선택 시 배치도를 숨기고 상세만 보여준다 (상세의 ✕로 돌아감).
// 살핌 학생 화면 톤: 바깥 틀은 SalpimBackdrop(교실 일러스트 배경·글꼴).
// 배치도의 오늘 색은 layout이 그린 시점 값이라, 교사가 다른 창(학생 화면 등)에 갔다가 돌아오면
// router.refresh()로 다시 불러온다 — 아이가 새로 누른 색이 새로고침 없이 반영된다.

"use client";

import { useEffect } from "react";
import { useRouter, useSelectedLayoutSegment } from "next/navigation";
import SalpimBackdrop from "@/components/shared/SalpimBackdrop";
import type { SeatGrid, SeatingStudent } from "@/lib/types/teacherRecord";
import SeatingChart from "./SeatingChart";

export default function StudentsSplitView({
  seats,
  grid,
  children,
}: {
  seats: SeatingStudent[];
  grid: SeatGrid;
  children: React.ReactNode;
}) {
  const selectedStudentId = useSelectedLayoutSegment();
  const isOpen = selectedStudentId !== null;
  const router = useRouter();

  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      // 탭 전환마다 연달아 부르지 않게 5초에 한 번까지
      if (document.visibilityState !== "visible" || Date.now() - last < 5000) return;
      last = Date.now();
      router.refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return (
    <SalpimBackdrop>
      <div className={`mx-auto flex flex-col ${isOpen ? "max-w-[1280px]" : "max-w-[1760px]"} gap-5 px-6 py-5 lg:flex-row lg:items-start`}>
        <aside
          aria-label="자리 배치도"
          className={`shrink-0 transition-[width] duration-300 ease-out lg:sticky lg:top-[72px] lg:max-h-[calc(100dvh-92px)] lg:overflow-y-auto ${
            isOpen ? "hidden lg:block lg:w-[340px]" : "w-full"
          }`}
        >
          <SeatingChart seats={seats} grid={grid} selectedStudentId={selectedStudentId} compact={isOpen} />
        </aside>

        {isOpen ? (
          <section
            aria-label="아이 상세"
            className="min-w-0 flex-1 transition duration-300 ease-out starting:translate-x-6 starting:opacity-0"
          >
            {children}
          </section>
        ) : (
          children
        )}
      </div>
    </SalpimBackdrop>
  );
}

