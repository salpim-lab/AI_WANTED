// 담당: 이유민
// AI 호출 차단 스위치.
//
// 개발 중에 화면을 열어두거나 흐름을 반복해서 확인할 때 과금이 쌓이는 것을 막는다.
// 코드를 주석 처리하는 대신 환경변수로 두는 이유:
//   - 주석은 되돌릴 때 빠뜨리기 쉽고, 누가 껐는지 커밋을 봐야 안다
//   - 끈 상태로 배포되는 사고를 막으려면 코드가 아니라 설정이어야 한다
//
// 끄는 법: .env.local 에 AI_ENABLED=false 를 넣고 개발 서버를 다시 시작한다.
// 끄면 화면이 죽지 않고 목업 칩 흐름으로 되돌아간다 — 아이가 보는 화면은 그대로 동작한다.
import "server-only";

/** 명시적으로 "false" 일 때만 끈다. 설정을 빠뜨렸다고 조용히 꺼지면 더 헷갈린다. */
export function isAiEnabled() {
  return process.env.AI_ENABLED !== "false";
}

/** 라우트가 그대로 돌려주는 응답 본문. 화면은 이 코드를 보고 칩으로 되돌린다. */
export const AI_DISABLED = {
  code: "AI_DISABLED",
  message: "지금은 목소리 대신 아래에서 골라줄래?",
} as const;
