// 담당: 이유민
// 역할: 대화 텍스트에서 대표 사물 1개를 추론해 item_candidates에 저장할 후보 생성
// 참고: docs/planning/PLANNING.md "4단계: 아이템 생성"

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // TODO(이유민): { transcript } → OpenAI 호출 → { emoji, name, reason } 반환
  return NextResponse.json({ message: "not implemented" }, { status: 501 });
}
