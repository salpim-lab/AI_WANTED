// 담당: 이지현
// 역할: 선생님 agent (협진 챗봇) — 교사 화면 어디서나 뜨는 전역 챗봇
// image.png 기술스택 메모: "협진 챗봇은 3개 system prompt 병렬 호출 후 합치는 구조"
// → 관찰일지 / 상담기록 / 학생 데이터(신호등·대화·분석) 등 서로 다른 도메인을
//   3개의 system prompt로 각각 병렬 조회·요약한 뒤 하나의 답변으로 합치는 구조로 설계할 것.
// 다른 팀원(진승혜: 대시보드 데이터, 김현우: 학생상세/관찰일지/상담기록)의 컴포넌트를
// 직접 참조하지 말고, lib/supabase의 공용 조회 함수만 사용할 것 (결합도 낮추기).

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // TODO(이지현): { question, teacherId } → 3개 system prompt 병렬 호출 → 합쳐서 { answer } 반환
  return NextResponse.json({ message: "not implemented" }, { status: 501 });
}
