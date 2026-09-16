// 상담 전문 저장 후 생성 작업을 멱등적으로 접수하고 상태를 조회한다.
// 이 라우트는 작업을 오래 실행하지 않는다. 실제 inferItem → assembleItem 실행기는 워커 단계다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (code: string, message: string, status: number) => NextResponse.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });

async function sessionForUser(sessionId: string) {
  const client = await createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error("UNAUTHORIZED");
  const { data: session, error } = await client.from("checkin_sessions").select("id, enrollment_id, status, transcript").eq("id", sessionId).maybeSingle();
  if (error) throw new Error("DATABASE_ERROR");
  if (!session) throw new Error("SESSION_NOT_FOUND");
  const { data: enrollment, error: enrollmentError } = await client.from("enrollments").select("student_id").eq("id", session.enrollment_id).single();
  if (enrollmentError) throw new Error("DATABASE_ERROR");
  const { data: student, error: studentError } = await client.from("students").select("auth_user_id").eq("id", enrollment.student_id).single();
  if (studentError) throw new Error("DATABASE_ERROR");
  if (student.auth_user_id !== user.id) throw new Error("FORBIDDEN");
  if (session.status === "started" || session.transcript === null) throw new Error("TRANSCRIPT_NOT_READY");
  return session;
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "GENERATION_REQUEST_FAILED";
  const statuses: Record<string, number> = { UNAUTHORIZED: 401, SESSION_NOT_FOUND: 404, FORBIDDEN: 403, TRANSCRIPT_NOT_READY: 409, DATABASE_ERROR: 500 };
  return fail(code, code === "TRANSCRIPT_NOT_READY" ? "전문 저장을 먼저 완료해 주세요." : "생성 작업을 접수하지 못했습니다.", statuses[code] ?? 500);
}

export async function POST(request: Request) {
  let sessionId: string;
  try {
    const body = await request.json();
    if (!body || typeof body.session_id !== "string" || !uuid.test(body.session_id)) return fail("INVALID_REQUEST", "session_id가 필요합니다.", 400);
    sessionId = body.session_id;
  } catch { return fail("INVALID_REQUEST", "유효한 JSON을 보내주세요.", 400); }
  try {
    const session = await sessionForUser(sessionId);
    const admin = createAdminClient();
    // item_generation_jobs는 이번 마이그레이션으로 추가된 테이블이라 현재 생성 타입에 아직 없다.
    // database.types.ts is regenerated after the migration is merged.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;
    const { data: existing, error: readError } = await db.from("item_generation_jobs").select("id, status, attempt_count, max_attempts, fallback_asset_id, generated_asset_id, student_item_id").eq("source_session_id", session.id).maybeSingle();
    if (readError) return fail("DATABASE_ERROR", "생성 작업을 조회하지 못했습니다.", 500);
    if (existing) return NextResponse.json({ job: existing, reused: true }, { headers: { "Cache-Control": "no-store" } });
    const { data: job, error: insertError } = await db.from("item_generation_jobs").insert({ enrollment_id: session.enrollment_id, source_session_id: session.id, status: "queued", attempt_count: 0, max_attempts: 2 }).select("id, status, attempt_count, max_attempts, fallback_asset_id, generated_asset_id, student_item_id").single();
    if (insertError) return fail("DATABASE_ERROR", "생성 작업을 접수하지 못했습니다.", 500);
    return NextResponse.json({ job, reused: false }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId || !uuid.test(sessionId)) return fail("INVALID_REQUEST", "session_id가 필요합니다.", 400);
  try {
    const session = await sessionForUser(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: job, error } = await admin.from("item_generation_jobs").select("id, status, attempt_count, max_attempts, next_attempt_at, fallback_asset_id, generated_asset_id, student_item_id, completed_at").eq("source_session_id", session.id).maybeSingle();
    if (error) return fail("DATABASE_ERROR", "생성 작업을 조회하지 못했습니다.", 500);
    if (!job) return fail("JOB_NOT_FOUND", "생성 작업이 아직 접수되지 않았습니다.", 404);
    return NextResponse.json({ job }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
