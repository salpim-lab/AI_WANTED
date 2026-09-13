// 담당: 이유민 (※ 2026-09-13 재배정 — 아래 사유 참고)
// 역할: 당일 대화 기반 교사 코멘트 초안 자동 작성
// 참고: docs/planning/PLANNING.md "탭 2. 아이 상세 — 하단: 교사 코멘트 작성"
//       docs/planning/살핌_DB_스키마_v0.3.md §8.1 feedback_drafts, §13 담당자별 작업 경계
//
// 재배정 사유: 이 API가 쓰는 테이블 feedback_drafts는 DB 스키마 문서에서 이유민 담당으로
// 지정돼 있음(draft_text는 그날 대화 기반 AI 생성이라 이유민의 체크인 파이프라인과 같은 도메인).
// UI(교사가 초안을 고쳐서 저장하는 화면)는 여전히 김현우의 "아이 상세" 페이지에 있고,
// 김현우 쪽 컴포넌트는 이 라우트를 fetch로만 호출한다 — 이 파일을 직접 고치지 않는다.
// (교사가 수정한 최종본을 저장하는 쓰기 라우트도 이 파일 담당자가 추가할 것 — feedback_drafts.final_text)

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // TODO(이유민): { studentId, date } → 해당 일자 대화(conversation_messages) 조회 →
  // OpenAI 초안 생성 → feedback_drafts.draft_text insert → { draft } 반환
  return NextResponse.json({ message: "not implemented" }, { status: 501 });
}
