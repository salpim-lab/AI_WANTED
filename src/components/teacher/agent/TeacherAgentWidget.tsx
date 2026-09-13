// 담당: 이지현
// 교사 화면 어디서나 떠 있는 플로팅 챗봇. (teacher)/layout.tsx 에서만 마운트할 것.
// 대화 상태는 layout이 탭 이동 시 리마운트되지 않는 특성을 이용해 로컬 state로 유지
// (전역 상태관리 라이브러리 불필요 — useAgentChat 훅 안에서 useState로 충분).

"use client";

import { useAgentChat } from "./useAgentChat";

export default function TeacherAgentWidget() {
  const chat = useAgentChat();

  // TODO(이지현): 플로팅 버튼 + 열리는 패널 + 입력창 → /api/ai/teacher-agent 호출
  return <div>{/* floating chat button */}</div>;
}
