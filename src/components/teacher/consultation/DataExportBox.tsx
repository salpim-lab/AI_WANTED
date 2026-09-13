// 담당: 김현우
// 상담 자료 추출: 신호등 색 이력, 등하교 대화 전문, AI 분석, 관찰일지 태그 항목을 파일로 생성
// 참고: docs/planning/PLANNING.md "탭 4. 학부모상담기록 — 상담 자료 추출 기능"
// 지금은 "생성 중..." 연출만 흉내 — 실제로는 서버에서 PDF/파일을 만들어 SendUserFile 등으로 전달할 것.

"use client";

import { useState } from "react";
import { DEFAULT_EXPORT_ITEMS, EXPORT_DATA } from "./mockData";

export default function DataExportBox({ studentName }: { studentName: string }) {
  const [status, setStatus] = useState<"idle" | "generating" | "done">("idle");
  const items = EXPORT_DATA[studentName] ?? DEFAULT_EXPORT_ITEMS;

  return (
    <div className="data-export-box show">
      <div className="data-export-label">📄 {studentName} 상담 자료 리포트</div>
      <div style={{ fontSize: 11, color: "#166534", marginBottom: 8 }}>
        아래 데이터를 취합해 PDF 파일로 생성합니다.
      </div>
      <ul className="data-export-items">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        style={{ marginTop: 12, width: "100%", background: status === "done" ? "#15803d" : undefined }}
        disabled={status !== "idle"}
        onClick={() => {
          setStatus("generating");
          setTimeout(() => setStatus("done"), 1400);
        }}
      >
        {status === "idle" && "📄 리포트 생성 · 파일 다운로드"}
        {status === "generating" && "⏳ 생성 중..."}
        {status === "done" && "✓ 리포트 생성 완료 · 다운로드됨"}
      </button>
    </div>
  );
}
