// 담당: 진승혜
// 역할: 요일·시간표 교차 이상징후 탐지 (예: 체육 있는 날 갈등 3회)
// 참고: docs/planning/PLANNING.md "5. 패턴 경고" / 살핌_기획안 "8.8 이상징후 지표는 코드로"
// 주의: 기획안 원칙상 판정 로직은 LLM이 아니라 코드(규칙 기반 집계)로 처리할 것.

import { NextResponse } from "next/server";

export async function GET() {
  // TODO(진승혜): 규칙 기반 집계 쿼리 → { alerts: [...] } 반환
  return NextResponse.json({ message: "not implemented" }, { status: 501 });
}
