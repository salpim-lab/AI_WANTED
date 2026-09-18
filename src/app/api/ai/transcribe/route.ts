// 담당: 이유민
// 역할: 녹음된 오디오를 받아 STT만 수행하고 텍스트만 반환한다.
//
// ⚠️ 원칙(기획안 §8.1): 음성은 저장하지 않는다.
//    오디오는 이 핸들러 안에서만 존재하고 응답과 함께 사라진다.
//    DB·Storage 에 오디오를 쓰는 코드를 여기에 추가하면 안 된다.
//
// 모델 선택 근거 — 두 번 쟀고, 두 번째 결과로 뒤집었다.
//
// 1차(내용어 9건): mini-transcribe 오류 0건 / whisper-1 2건 → mini 선택
// 2차(고유명사 18개): mini 11/18 · mini+힌트 14/18 · whisper 16/18 · whisper+힌트 18/18
//
// 1차에서 잰 것이 틀렸다. 이 제품에서 가장 중요한 전사 대상은 일반 내용어가 아니라
// **반 친구 이름**이다. 교사 화면의 관계 지도와 갈등 기록이 전문에서 이름을 읽기 때문에,
// 이름이 틀리면 그 기능이 통째로 어긋난다. 그래서 whisper-1 + 반 명단 힌트로 간다.
// 비용은 분당 $0.003 → $0.006 이지만 세션당 1센트가 안 된다.
//
// 실제 아동 음성으로는 여전히 미검증이다. STT_MODEL 로 바꿀 수 있게 둔다.
import { NextResponse } from "next/server";

import { AI_DISABLED, isAiEnabled } from "@/lib/ai/enabled";
import { CheckinAuthError, requireOwnStartedSession } from "@/lib/checkins/authorize";
import { buildSttPrompt } from "@/lib/checkins/classRoster";

export const runtime = "nodejs";
export const maxDuration = 60;

/** useVoiceRecorder 의 MAX_RECORDING_MS(60초)에 webm 여유를 둔 상한 */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

/**
 * OpenAI 는 파일 이름의 확장자로 포맷을 판단한다. 내용이 아니라 이름을 본다.
 * 그래서 확장자를 고정하면 안 된다 — MediaRecorder 가 만드는 타입이 브라우저마다 다르다.
 * 크롬은 audio/webm, 사파리는 audio/mp4 를 낸다. webm 으로 못박으면 아이패드에서 전부 실패한다.
 */
const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
};

function fileName(audio: File) {
  // "audio/webm;codecs=opus" 처럼 파라미터가 붙어 온다.
  const mime = (audio.type || "").split(";")[0].trim().toLowerCase();
  const fromName = audio.name?.includes(".") ? audio.name.split(".").pop()!.toLowerCase() : "";
  const ext = EXTENSIONS[mime] ?? (fromName || "webm");
  return `speech.${ext}`;
}

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

  // 스위치가 꺼져 있으면 키를 읽기도 전에 돌려보낸다.
  if (!isAiEnabled()) return fail(AI_DISABLED.code, AI_DISABLED.message, 503);

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return fail("AI_NOT_CONFIGURED", "OPENAI_API_KEY 설정이 필요합니다.", 503);

  try {
    // 남의 세션에 대고 전사를 돌려 과금시키지 못하게 막는다.
    const session = await requireOwnStartedSession(form.get("session_id"));

    const upstream = new FormData();
    upstream.set("file", audio, fileName(audio));
    upstream.set("model", process.env.STT_MODEL || "whisper-1");
    // 한국어를 명시하면 짧은 발화에서 언어를 잘못 잡는 일이 없어진다.
    upstream.set("language", "ko");
    upstream.set("response_format", "json");

    // 같은 반 아이 이름과 교실 어휘를 힌트로 넘긴다.
    // ⚠️ 이건 인식을 돕는 것이지 결과를 고치는 것이 아니다.
    //    전사 결과를 명단에 맞춰 바꿔 쓰면, 아이가 하지 않은 이름이 기록에 남는다.
    const hint = await buildSttPrompt(session.enrollment_id);
    if (hint) upstream.set("prompt", hint);

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
