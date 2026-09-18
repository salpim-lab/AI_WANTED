// 상담 화면이 종료 시점에 호출하는 전문 저장 API.
// 종료 이벤트 자체(버튼/자동 전환)는 상담 UI가 결정하며 이 라우트는 시점을 가정하지 않는다.
//
// 2026-09-18 이유민: 로그인·소유 확인을 lib/checkins/authorize 의 공용 헬퍼로 바꿨다.
//   - 같은 확인을 네 라우트가 각자 하고 있어 한 곳만 고치면 어긋난다.
//   - 실제로 어긋났다: 학생 로그인 화면이 아직 없어 개발 중에는 우회 경로를 쓰는데,
//     이 라우트만 그 경로를 타지 않아 대화는 되는데 전문만 401 로 저장되지 않았다.
// 돌려주는 코드(UNAUTHORIZED/SESSION_NOT_FOUND/FORBIDDEN/DATABASE_ERROR)와
// 상태 코드는 이전과 같다. 강윤지님 확인 후 이 주석은 지워도 된다.
import { NextResponse } from "next/server";
import { CheckinAuthError, requireOwnSession } from "@/lib/checkins/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveWholeTranscript } from "@/lib/supabase/raw/wholeTranscript";

export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (code: string, message: string, status: number) => NextResponse.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail("INVALID_REQUEST", "유효한 JSON을 보내주세요.", 400); }
  const sessionId = body.session_id;
  if (typeof sessionId !== "string" || !uuid.test(sessionId)) return fail("INVALID_REQUEST", "session_id가 필요합니다.", 400);
  const status = body.status === "stopped" ? "stopped" : body.status === "completed" ? "completed" : null;
  if (!status) return fail("INVALID_REQUEST", "status는 completed 또는 stopped여야 합니다.", 400);
  if (status === "stopped" && (typeof body.reason !== "string" || !body.reason.trim())) return fail("INVALID_REQUEST", "중단 이유가 필요합니다.", 400);
  try {
    const session = await requireOwnSession(sessionId);
    const savedId = await saveWholeTranscript(createAdminClient(), session.id, body.transcript, status === "completed" ? { status } : { status, reason: body.reason as string });
    return NextResponse.json({ session_id: savedId, saved: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CheckinAuthError) return fail(error.code, error.message, error.httpStatus);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("이미 다른 내용") || message.includes("저장할 상담")) return fail("TRANSCRIPT_ALREADY_SAVED", "상담 전문이 이미 저장되었습니다.", 409);
    if (message.includes("최대") || message.includes("형식") || message.includes("메시지") || message.includes("너무 큽니다")) return fail("INVALID_TRANSCRIPT", "상담 전문 형식이 올바르지 않습니다.", 422);
    return fail("DATABASE_ERROR", "상담 전문을 저장하지 못했습니다.", 500);
  }
}
