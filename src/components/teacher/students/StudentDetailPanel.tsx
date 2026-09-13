// 담당: 김현우
// 아이 상세 페이지 본문: 등/하교 신호등 색, AI 대화 전문, AI 짧은 분석, 교사 코멘트 작성
// 참고: docs/planning/PLANNING.md "탭 2. 아이 상세 페이지"

export default function StudentDetailPanel({
  studentId,
  date,
}: {
  studentId: string;
  date?: string;
}) {
  return <div>{/* TODO(김현우): 기록 본문 + 교사 코멘트 작성(초안: /api/ai/comment-draft) */}</div>;
}
