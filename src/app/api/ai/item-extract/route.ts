// 담당: 이유민
// 역할: 대화 텍스트에서 사물 1개를 추출해 아이템 생성 (감정이 아닌 사물 기반)
// 참고: docs/planning/PLANNING.md "4단계: 아이템 생성"

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // TODO(이유민): { transcript } → OpenAI 호출 → { emoji, name, reason } 반환
  return NextResponse.json({ message: "not implemented" }, { status: 501 });
}
