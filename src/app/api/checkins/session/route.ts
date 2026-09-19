// 담당: 이유민
// 색을 고른 직후 체크인 세션을 만든다.
//
// ⚠️ 1단계(홈)에서 부르면 안 된다. 등교 홈의 선생님 편지는 "마지막 등교 세션 이후에
//    보낸 편지"만 띄우는 방식으로 읽음 처리를 대신한다. 홈에서 세션을 만들면
//    편지가 뜨자마자 자기 세션 때문에 사라진다.
//    자세한 내용: docs/planning/TEACHER_LETTER_LOGIC.md
import { NextResponse } from "next/server";

import { CheckinAuthError, requireStudent } from "@/lib/checkins/authorize";
import {
  SignalCheckInRepositoryError,
  startSignalCheckIn,
  type CheckinPeriod,
} from "@/lib/supabase/raw/signalCheckIn";
import { SIGNAL_COLORS } from "@/lib/constants/colors";
import type { SignalColor } from "@/lib/types/signal";

export const runtime = "nodejs";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const fail = (code: string, message: string, status: number) => json({ code, message }, status);

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("INVALID_REQUEST", "유효한 JSON을 보내주세요.", 400);
  }

  const period = body.period === "morning" || body.period === "afternoon" ? body.period : null;
  if (!period) return fail("INVALID_REQUEST", "period는 morning 또는 afternoon이어야 합니다.", 400);

  const moodColor = String(body.mood_color);
  if (!(moodColor in SIGNAL_COLORS)) {
    return fail("INVALID_REQUEST", "mood_color가 올바르지 않습니다.", 400);
  }

  try {
    const { studentId, demoOwnerId } = await requireStudent();
    const session = await startSignalCheckIn({
      studentId,
      period: period as CheckinPeriod,
      moodColor: moodColor as SignalColor,
      demoOwnerId,
    });
    return json({ session_id: session.id, attempt: session.attempt });
  } catch (error) {
    if (error instanceof CheckinAuthError) return fail(error.code, error.message, error.httpStatus);
    if (error instanceof SignalCheckInRepositoryError) {
      // 같은 시간대에 이미 시작했다면 새로 만들지 않는다. 화면이 재시도하지 않도록 409로 구분한다.
      const status = error.code === "CHECKIN_ALREADY_EXISTS" ? 409 : 500;
      return fail(error.code ?? "DATABASE_ERROR", error.message, status);
    }
    return fail("DATABASE_ERROR", "체크인을 시작하지 못했습니다.", 500);
  }
}
