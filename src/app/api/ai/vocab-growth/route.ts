// 담당: 진승혜
// 역할: 월별 아이별 감정 어휘 종류 증가 추이 (대시보드 6번째 섹션)
// 참고: docs/planning/PLANNING.md "6. 감정 어휘 성장"

import { NextResponse } from "next/server";

export async function GET() {
  // TODO(진승혜): 월별 어휘 집계 → { series: [...] } 반환
  return NextResponse.json({ message: "not implemented" }, { status: 501 });
}
