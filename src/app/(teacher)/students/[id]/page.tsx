// 담당: 김현우
// 참고: docs/planning/PLANNING.md "[교사 화면] 탭 2. 아이 상세 페이지"
// 날짜 선택(기본값 당일) + 등/하교 신호등 색 + AI 대화 전문 + AI 분석 + 교사 코멘트 작성(저장 시 다음날 등교에 전달)

import StudentDetailPanel from "@/components/teacher/students/StudentDetailPanel";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <StudentDetailPanel studentId={id} />;
}
