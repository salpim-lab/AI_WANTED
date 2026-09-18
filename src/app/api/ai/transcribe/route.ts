// 담당: 이유민
// 역할: 녹음된 오디오를 받아 STT만 수행하고 텍스트만 반환한다.
//
// ⚠️ 원칙(기획안 §8.1): 음성은 저장하지 않는다.
//    오디오는 이 핸들러 안에서만 존재하고 응답과 함께 사라진다.
//    DB·Storage 에 오디오를 쓰는 코드를 여기에 추가하면 안 된다.
//
// 모델 선택 근거(2026-09-18 실측, 합성 한국어 아동 발화 9건):
//   gpt-4o-mini-transcribe  내용어 오류 0건, $0.003/분
//   whisper-1               내용어 오류 2건("피구"→"피고"), $0.006/분
// 회피 판정(gates.looksAvoidant)은 전사 텍스트를 그대로 읽으므로 내용어 정확도가
// 곧 대화 종료 판정의 정확도다. 다만 실제 아동 음성으로는 아직 검증하지 않았다.
// 그래서 STT_MODEL 로 교체 가능하게 둔다.
import { NextResponse } from "next/server";

import { CheckinAuthError, requireOwnStartedSession } from "@/lib/checkins/authorize";

export const runtime = "nodejs";
export const maxDuration = 60;

/** useVoiceRecorder 의 MAX_RECORDING_MS(60초)에 webm 여유를 둔 상한 */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

const fail = (code: string, message: string, status: number) =>
  NextResponse.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("INVALID_REQUEST", "오디오를 multipart/form-data 로 보내주세요.", 400);
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return fail("INVALID_REQUEST", "audio 파일이 필요합니다.", 400);
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return fail("AUDIO_TOO_LARGE", "녹음이 너무 깁니다.", 413);
  }

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return fail("AI_NOT_CONFIGURED", "OPENAI_API_KEY 설정이 필요합니다.", 503);

  try {
    // 남의 세션에 대고 전사를 돌려 과금시키지 못하게 막는다.
    await requireOwnStartedSession(form.get("session_id"));

    const upstream = new FormData();
    upstream.set("file", audio, "speech.webm");
    upstream.set("model", process.env.STT_MODEL || "gpt-4o-mini-transcribe");
    // 한국어를 명시하면 짧은 발화에서 언어를 잘못 잡는 일이 없어진다.
    upstream.set("language", "ko");
    upstream.set("response_format", "json");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: upstream,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 500);
      console.error("[transcribe] upstream", response.status, detail);
      return fail(
        "STT_REQUEST_FAILED",
        "말한 내용을 글로 옮기지 못했어. 다시 한 번 말해줄래?",
        response.status === 429 ? 429 : 502,
      );
    }

    const data = (await response.json()) as { text?: unknown };
    const text = typeof data.text === "string" ? data.text.trim() : "";
    // 빈 전사는 실패가 아니다. 아이가 말을 안 했거나 너무 작게 말한 것이다.
    return NextResponse.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CheckinAuthError) return fail(error.code, error.message, error.httpStatus);
    if (error instanceof Error && error.name === "TimeoutError") {
      return fail("STT_TIMEOUT", "말한 내용을 옮기는 데 너무 오래 걸렸어.", 504);
    }
    return fail("STT_FAILED", "말한 내용을 글로 옮기지 못했습니다.", 500);
  }
}
