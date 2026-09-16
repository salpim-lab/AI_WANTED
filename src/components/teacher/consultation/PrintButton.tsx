// 담당: 김현우
// 상담 자료 리포트 인쇄 버튼 — 브라우저 인쇄 창에서 "PDF로 저장"을 고르면 파일이 된다.

"use client";

export default function PrintButton() {
  return (
    <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
      🖨 인쇄 · PDF로 저장
    </button>
  );
}
