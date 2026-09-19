// 담당: 이유민
// 아이가 대화를 마친 뒤 "선생님과의 대화 신청하기" 를 누르면 여기로 온다.
//
// 대화가 끝난 뒤에 누르는 동작이므로 세션은 이미 completed 다.
// 그래서 started 를 요구하지 않는다.
//
// 위험 신호(risk=flag)로 넘어온 경우는 priority=high 로 올린다. 아이가 누른 것과
// 시스템이 넘긴 것을 구분해야 교사가 무엇을 먼저 볼지 정할 수 있다.
import { NextResponse } from "next/server";

import { CheckinAuthError, requireOwnSession } from "@/lib/checkins/authorize";
import {
  createMeetingRequest,
  SignalCheckInRepositoryError,
} from "@/lib/supabase/raw/signalCheckIn";

export const runtime = "nodejs";

const fail = (code: string, message: string, status: number) =>
  NextResponse.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("INVALID_REQUEST", "유효한 JSON을 보내주세요.", 400);
  }

  const requestedBy = body.requested_by === "system" ? "system" : "student";
  const priority = body.priority === "high" ? "high" : "normal";

  try {
    const session = await requireOwnSession(body.session_id);
    const meeting = await createMeetingRequest({
      sessionId: session.id,
      requestedBy,
      priority,
      note: typeof body.note === "string" ? body.note.slice(0, 500) : undefined,
    });
    return NextResponse.json(
      { meeting_request_id: meeting.id, status: meeting.status },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CheckinAuthError) return fail(error.code, error.message, error.httpStatus);
    if (error instanceof SignalCheckInRepositoryError) {
      return fail(error.code ?? "DATABASE_ERROR", error.message, 500);
    }
    return fail("DATABASE_ERROR", "면담 신청을 저장하지 못했습니다.", 500);
  }
}
