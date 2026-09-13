// 담당: 김현우
// 역할: 아이 상세 페이지의 "AI 짧은 분석" (당일 대화 기반 1~3문장)
// 참고: docs/planning/PLANNING.md "탭 2. 아이 상세 페이지 — 본문"

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // TODO(김현우): { studentId, date } → { analysis: string } 반환
  return NextResponse.json({ message: "not implemented" }, { status: 501 });
}
