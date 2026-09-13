// 담당: 이유민
// 역할: 녹음된 오디오를 받아 STT만 수행하고 텍스트만 반환한다.
// 원칙(살핌_기획안 8.1): 음성은 저장하지 않는다 — 오디오는 이 핸들러 안에서만 존재하고
// 처리 직후 폐기할 것. DB/Storage에 오디오 blob을 쓰는 코드는 여기 추가하면 안 됨.

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // TODO(이유민): request(오디오 FormData/Blob) → OpenAI STT 호출 → { text } 반환
  // 오디오는 변수 스코프를 벗어나기 전에 참조 해제, 별도 저장 로직 추가 금지
  return NextResponse.json({ message: "not implemented" }, { status: 501 });
}
