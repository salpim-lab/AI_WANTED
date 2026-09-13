// 담당: 이유민
// 역할: 색 선택에 따른 AI 꼬리질문 대화 (등교) / 고정 질문 대화 (하교)
// 참고: docs/planning/PLANNING.md "3단계: AI 꼬리 질문(색에 따라 분기)"
// 종료 규칙: 회피 신호 2회 또는 2턴 도달 시 무조건 종료 (서버에서 판단해 응답에 포함시킬 것)

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // TODO(이유민): { color, flow: "checkin" | "checkout", transcript, turnCount } 입력
  // → OpenAI 호출 → { reply, shouldEnd } 반환
  return NextResponse.json({ message: "not implemented" }, { status: 501 });
}
