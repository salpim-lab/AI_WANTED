// 담당: 김현우
// 상담 자료 리포트 안내 + 열기 링크 (학부모상담기록 글쓰기 모달 안).
// 리포트는 /consultation/report/[studentId] 인쇄용 페이지에서 서버가 원본 기록을 모아 만들고,
// 브라우저 "인쇄 → PDF로 저장"으로 파일을 만든다 (PDF 라이브러리 설치 없이).
// 참고: docs/planning/PLANNING.md "탭 4. 학부모상담기록 — 상담 자료 추출 기능"

import Link from "next/link";
import type { TaggedStudent } from "@/lib/types/teacherRecord";

const REPORT_ITEMS = [
  "신호등 색 요약 (등교·하교)",
  "감정 어휘 · 관계 지도 (오늘 기준)",
  "학생관찰일지에 태그된 기록",
  "AI 분석 요약",
];

export default function DataExportBox({ student, days }: { student: TaggedStudent; days: number }) {
  return (
    <div className="mt-2.5 rounded-[10px] border-[1.5px] border-green-200 bg-green-50 px-3.5 py-3">
      <div className="mb-1.5 text-[11px] font-bold tracking-[0.5px] text-green-700">📄 {student.name} 상담 자료 리포트</div>
      <p className="mb-2 text-[11px] text-green-800">
        최근 {days}일 원본 기록을 정리해서 보여줘요. 그대로 PDF로 뽑아 상담에 쓸 수 있어요(등하교 대화 전문은 빠져요 —
        필요하면 아이 상세 탭에서 확인하세요). 상담 기록을 저장하면 이 기간 근거 기록의 ID가 함께 남습니다.
      </p>
      <ul className="ml-3.5 list-disc text-xs leading-[1.8] text-green-800">
        {REPORT_ITEMS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <Link
        href={`/consultation/report/${student.studentId}`}
        target="_blank"
        rel="noopener"
        className="btn btn-primary btn-sm mt-3 block w-full text-center"
      >
        📄 리포트 열기 · PDF로 저장
      </Link>
      <p className="mt-1.5 text-[11px] text-green-700">리포트 화면에서 기간을 직접 바꿀 수 있어요.</p>
    </div>
  );
}
