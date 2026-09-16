// 담당: 강윤지 — 완료된 상담 전문에서 소재·의미·크기를 추론한다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseTranscript } from "@/lib/supabase/raw/wholeTranscript";
import { inferItem, ItemAIError } from "@/lib/openai/inferItem";
import { ITEM_INFERENCE_PROMPT_VERSION } from "@/lib/openai/prompts/item-inference";
export const runtime = "nodejs";
export const maxDuration = 60;
const fail = (code: string, message: string, status: number) => NextResponse.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  let sessionId: string;
  try {
    const body = await request.json();
    if (!body || typeof body.session_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.session_id)) return fail("INVALID_REQUEST", "session_id가 필요합니다.", 400);
    sessionId = body.session_id;
  } catch { return fail("INVALID_REQUEST", "유효한 JSON을 보내주세요.", 400); }
  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return fail("UNAUTHORIZED", "학생 로그인이 필요합니다.", 401);
    const { data: session, error } = await client.from("checkin_sessions").select("enrollment_id, status, transcript").eq("id", sessionId).maybeSingle();
    if (error) return fail("DATABASE_ERROR", "상담 조회에 실패했습니다.", 500);
    if (!session) return fail("SESSION_NOT_FOUND", "상담을 찾을 수 없습니다.", 404);
    const { data: enrollment, error: enrollmentError } = await client.from("enrollments").select("student_id").eq("id", session.enrollment_id).single();
    if (enrollmentError) return fail("DATABASE_ERROR", "학생 정보를 조회하지 못했습니다.", 500);
    const { data: student, error: studentError } = await client.from("students").select("auth_user_id").eq("id", enrollment.student_id).single();
    if (studentError) return fail("DATABASE_ERROR", "학생 정보를 조회하지 못했습니다.", 500);
    if (student.auth_user_id !== user.id) return fail("FORBIDDEN", "본인의 상담만 사용할 수 있습니다.", 403);
    const { data: consents, error: consentError } = await client.from("consents").select("consent_type").eq("student_id", enrollment.student_id).order("consented_at", { ascending: false }).order("created_at", { ascending: false });
    if (consentError) return fail("DATABASE_ERROR", "동의 상태를 조회하지 못했습니다.", 500);
    const guardian = consents.find(c => c.consent_type === "guardian" || c.consent_type === "guardian_withdrawn");
    if (guardian?.consent_type !== "guardian" || !consents.some(c => c.consent_type === "school_approval")) return fail("CONSENT_REQUIRED", "유효한 보호자 동의와 학교 승인이 필요합니다.", 403);
    if (session.status === "started" || session.transcript === null) return fail("TRANSCRIPT_NOT_READY", "전문 저장을 먼저 완료해 주세요.", 409);
    if (!process.env.OPENAI_API_KEY?.trim()) return fail("AI_NOT_CONFIGURED", "OPENAI_API_KEY 설정 후 사용할 수 있습니다.", 503);
    const inference = await inferItem(parseTranscript(session.transcript));
    return NextResponse.json({ session_id: sessionId, promptVersion: ITEM_INFERENCE_PROMPT_VERSION, inference }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ItemAIError) return fail(e.code, e.message, e.httpStatus);
    return fail("ITEM_INFERENCE_FAILED", "아이템 추론을 준비하지 못했습니다.", 500);
  }
}
