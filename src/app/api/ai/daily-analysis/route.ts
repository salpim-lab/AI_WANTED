// 담당: 이지현 (※ 2026-09-13 재배정 — 아래 사유 참고)
// 역할: 아이 상세 페이지의 "AI 짧은 분석" (당일 대화 기반 1~3문장)
// 참고: docs/planning/PLANNING.md "탭 2. 아이 상세 페이지 — 본문"
//       docs/planning/살핌_DB_스키마_v0.3.md §5.1 analysis_runs, §13 담당자별 작업 경계
//
// 재배정 사유: 이 분석은 DB 스키마상 범용 analysis_runs 테이블(analysis_type='session_summary')에
// 쓰는 건이고, analysis_runs/agent_threads/agent_messages는 DB 스키마 문서에서 이지현 담당으로
// 지정돼 있음(협진 agent와 같은 "AI 분석 결과" 도메인). UI는 여전히 김현우의 "아이 상세" 페이지에
// 있고, 김현우 쪽 컴포넌트는 이 라우트를 fetch로만 호출한다 — 이 파일을 직접 고치지 않는다.

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // TODO(이지현): { studentId, date } → 해당 세션 조회 → OpenAI 분석 →
  // analysis_runs(source_type='session', analysis_type='session_summary') insert → { analysis } 반환
  return NextResponse.json({ message: "not implemented" }, { status: 501 });
}
