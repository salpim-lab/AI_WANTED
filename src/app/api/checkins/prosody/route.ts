// 담당: 이유민
// 발화 파생 수치를 세션에 저장한다. 음성 자체는 저장하지 않는다(기획안 §8.1).
//
// 전문 저장(/api/checkins/transcript)과 왜 분리했나:
//   saveWholeTranscript 는 "같은 전문 재시도는 통과, 다른 전문은 409" 라는
//   쓰기 1회 규칙을 지킨다. 여기에 prosody 를 얹으면 "전문은 같은데 prosody 만
//   다른 재시도" 라는 판단이 하나 더 생겨 그 규칙이 흐려진다.
//   prosody 가 없으면 교사 화면의 근거 숫자가 안 뜰 뿐 세션은 멀쩡하므로,
//   원자적으로 묶을 값이 아니다.
//
// 호출 순서: 이 라우트를 **먼저**, 전문 저장을 나중에.
// 세션이 아직 started 일 때만 쓰므로, 반대로 하면 저장할 자리가 없다.
import { NextResponse } from "next/server";

import { CheckinAuthError, requireOwnStartedSession } from "@/lib/checkins/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SessionProsody, UtteranceProsody } from "@/lib/chat/prosody";

export const runtime = "nodejs";

/** 마이그레이션 1080 의 제약과 같은 값 */
const MAX_UTTERANCES = 50;

const fail = (code: string, message: string, status: number) =>
  NextResponse.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });

const finite = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

function parseProsody(value: unknown): SessionProsody {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("prosody는 객체여야 합니다.");
  }
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.utterances) || !v.utterances.length || v.utterances.length > MAX_UTTERANCES) {
    throw new Error("utterances 형식이 잘못되었습니다.");
  }
  const utterances = v.utterances.map((raw, i): UtteranceProsody => {
    const u = raw as Record<string, unknown>;
    const ok =
      finite(u.duration_sec, 0, 600) &&
      finite(u.response_delay_sec, 0, 600) &&
      finite(u.silence_count, 0, 200) &&
      finite(u.silence_total_sec, 0, 600) &&
      finite(u.loudness_raw, 0, 1) &&
      (u.syllables_per_sec === undefined || finite(u.syllables_per_sec, 0, 50));
    if (!ok) throw new Error("파생 수치 값이 범위를 벗어났습니다.");
    return {
      index: i,
      duration_sec: u.duration_sec as number,
      response_delay_sec: u.response_delay_sec as number,
      silence_count: u.silence_count as number,
      silence_total_sec: u.silence_total_sec as number,
      loudness_raw: u.loudness_raw as number,
      ...(u.syllables_per_sec === undefined
        ? {}
        : { syllables_per_sec: u.syllables_per_sec as number }),
    };
  });
  // 기준선 일수는 화면이 알 수 없다. 교사 화면이 해석할 때 과거 세션을 세서 채운다.
  return { utterances, baseline_days: 0 };
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("INVALID_REQUEST", "유효한 JSON을 보내주세요.", 400);
  }

  let prosody: SessionProsody;
  try {
    prosody = parseProsody(body.prosody);
  } catch (error) {
    return fail("INVALID_PROSODY", error instanceof Error ? error.message : "prosody가 잘못되었습니다.", 422);
  }

  try {
    const session = await requireOwnStartedSession(body.session_id);

    const { error } = await createAdminClient()
      .from("checkin_sessions")
      // prosody 는 마이그레이션 1080 으로 추가한 컬럼이다.
      // database.types.ts 를 다시 생성하기 전까지 타입에 없어 캐스팅한다.
      .update({ prosody } as never)
      .eq("id", session.id)
      .eq("status", "started");
    if (error) {
      console.error("[prosody] update", error.message);
      return fail("DATABASE_ERROR", "파생 수치를 저장하지 못했습니다.", 500);
    }
    return NextResponse.json(
      { session_id: session.id, saved: true, utterances: prosody.utterances.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CheckinAuthError) return fail(error.code, error.message, error.httpStatus);
    return fail("DATABASE_ERROR", "파생 수치를 저장하지 못했습니다.", 500);
  }
}
