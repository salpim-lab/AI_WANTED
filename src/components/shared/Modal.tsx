// 담당: 김현우 (단독 소유)
// 관찰일지·상담기록 글쓰기 모달에서 재사용.
// 닫혀 있으면 아예 렌더하지 않는다 — 입력 상태는 부모가 관리한다. Esc 또는 바깥 클릭으로 닫힌다.
// size="wide"는 입력칸을 한 줄에 여럿 두는 등 폭이 더 필요한 내용(학생관찰일지·학생 상담 기록 작성 팝업)에 쓴다.
// 교사 화면 바깥 틀(.teacher-app, (teacher)/layout.tsx)에 포털로 그린다 — 버튼이 놓인 자리에 그대로 그리면, 조상에
// backdrop-blur(salpimCard 등)·transform이 있을 때 fixed 기준이 그 요소로 바뀌고 z-index도 그 안에 갇혀서 팝업이
// 카드 안 엉뚱한 자리에 뜬다. body가 아니라 .teacher-app인 이유: 공용 버튼 색(.btn-primary의 --accent 등)
// 변수가 .teacher-app에만 정의돼 있어서, 그 밖에 그리면 버튼 배경이 비어 투명하게 보인다.
// 참고: docs/prototype/prototype-teacher.html .modal-overlay

"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";

export default function Modal({
  open,
  title,
  onClose,
  size = "default",
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  size?: "default" | "wide";
  children?: React.ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // 닫혀 있거나 서버 렌더 중(document 없음)이면 그리지 않는다 — 팝업은 항상 클릭 뒤에 열린다
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/35 backdrop-blur-[3px] transition-opacity duration-150 starting:opacity-0"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`max-h-[90vh] ${size === "wide" ? "w-[900px]" : "w-[600px]"} max-w-[95vw] overflow-y-auto rounded-2xl bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,.2)] transition duration-200 starting:translate-y-4 starting:opacity-0`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-[17px] font-extrabold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-md px-1.5 py-0.5 text-xl text-gray-500 hover:bg-[#f8f7f4]"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.querySelector(".teacher-app") ?? document.body,
  );
}
