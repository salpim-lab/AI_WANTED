// 상담 화면이 종료 시점에 호출하는 전문 저장 API.
// 종료 이벤트 자체(버튼/자동 전환)는 상담 UI가 결정하며 이 라우트는 시점을 가정하지 않는다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return fail("UNAUTHORIZED", "학생 로그인이 필요합니다.", 401);
    const { data: session, error } = await client.from("checkin_sessions").select("id, enrollment_id").eq("id", sessionId).maybeSingle();
    if (error) return fail("DATABASE_ERROR", "상담을 조회하지 못했습니다.", 500);
    if (!session) return fail("SESSION_NOT_FOUND", "상담을 찾을 수 없습니다.", 404);
    const { data: enrollment, error: enrollmentError } = await client.from("enrollments").select("student_id").eq("id", session.enrollment_id).single();
    if (enrollmentError) return fail("DATABASE_ERROR", "학생 정보를 조회하지 못했습니다.", 500);
    const { data: student, error: studentError } = await client.from("students").select("auth_user_id").eq("id", enrollment.student_id).single();
    if (studentError) return fail("DATABASE_ERROR", "학생 정보를 조회하지 못했습니다.", 500);
    if (student.auth_user_id !== user.id) return fail("FORBIDDEN", "본인의 상담만 저장할 수 있습니다.", 403);
    const savedId = await saveWholeTranscript(createAdminClient(), sessionId, body.transcript, status === "completed" ? { status } : { status, reason: body.reason as string });
    return NextResponse.json({ session_id: savedId, saved: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("이미 다른 내용") || message.includes("저장할 상담")) return fail("TRANSCRIPT_ALREADY_SAVED", "상담 전문이 이미 저장되었습니다.", 409);
    if (message.includes("최대") || message.includes("형식") || message.includes("메시지") || message.includes("너무 큽니다")) return fail("INVALID_TRANSCRIPT", "상담 전문 형식이 올바르지 않습니다.", 422);
    return fail("DATABASE_ERROR", "상담 전문을 저장하지 못했습니다.", 500);
  }
}
