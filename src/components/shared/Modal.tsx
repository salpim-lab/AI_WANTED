// 담당: 김현우 (단독 소유)
// 관찰일지·상담기록 글쓰기 모달에서 재사용.
// 닫혀 있으면 아예 렌더하지 않는다 — 입력 상태는 부모가 관리한다. Esc 또는 바깥 클릭으로 닫힌다.
// size="wide"는 명단+입력창처럼 폭이 더 필요한 내용(학생관찰일지 작성 팝업)에 쓴다.
// 참고: docs/prototype/prototype-teacher.html .modal-overlay

"use client";

import { useEffect, useId } from "react";

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

  if (!open) return null;

  return (
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
    </div>
  );
}
