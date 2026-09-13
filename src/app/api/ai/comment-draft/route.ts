// 담당: 김현우
// 역할: 당일 대화 기반 교사 코멘트 초안 자동 작성 (교사가 수정 후 저장해야만 학생에게 전달됨)
// 참고: docs/planning/PLANNING.md "탭 2. 아이 상세 — 하단: 교사 코멘트 작성"

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // TODO(김현우): { studentId, date } → 해당 일자 대화 조회 → OpenAI 초안 생성 → { draft } 반환
  return NextResponse.json({ message: "not implemented" }, { status: 501 });
}
