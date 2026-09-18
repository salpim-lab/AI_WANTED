// 전문 저장과 병렬로 작업을 접수한다. 실행은 전문 저장 완료 후 워커가 담당한다.
// 이 라우트는 작업을 오래 실행하지 않는다. 실제 inferItem → assembleItem 실행기는 워커 단계다.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (code: string, message: string, status: number) => NextResponse.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });

// MVP has one demo student; this is the enrollment from supabase/seed.sql.
const MINJUN_ENROLLMENT_ID = "40000000-0000-4000-8000-000000000001";

async function sessionForMvp(sessionId: string) {
  const client = createAdminClient();
  const { data: session, error } = await client.from("checkin_sessions").select("id, enrollment_id, status, transcript").eq("id", sessionId).maybeSingle();
  if (error) throw new Error("DATABASE_ERROR");
  if (!session || session.enrollment_id !== MINJUN_ENROLLMENT_ID) throw new Error("SESSION_NOT_FOUND");
  return session;
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "GENERATION_REQUEST_FAILED";
  const statuses: Record<string, number> = { SESSION_NOT_FOUND: 404, DATABASE_ERROR: 500 };
  return fail(code, "생성 작업을 처리하지 못했습니다.", statuses[code] ?? 500);
}

export async function POST(request: Request) {
  let sessionId: string;
  try {
    const body = await request.json();
    if (!body || typeof body.session_id !== "string" || !uuid.test(body.session_id)) return fail("INVALID_REQUEST", "session_id가 필요합니다.", 400);
    sessionId = body.session_id;
  } catch { return fail("INVALID_REQUEST", "유효한 JSON을 보내주세요.", 400); }
  try {
    const session = await sessionForMvp(sessionId);
    const admin = createAdminClient();
    // item_generation_jobs는 이번 마이그레이션으로 추가된 테이블이라 현재 생성 타입에 아직 없다.
    // database.types.ts is regenerated after the migration is merged.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;
    const { data: existing, error: readError } = await db.from("item_generation_jobs").select("id, status, attempt_count, max_attempts, fallback_asset_id, generated_asset_id, student_item_id").eq("source_session_id", session.id).maybeSingle();
    if (readError) return fail("DATABASE_ERROR", "생성 작업을 조회하지 못했습니다.", 500);
    if (existing) return NextResponse.json({ job: existing, reused: true }, { headers: { "Cache-Control": "no-store" } });
    const { data: job, error: insertError } = await db.from("item_generation_jobs").insert({ enrollment_id: session.enrollment_id, source_session_id: session.id, status: "queued", attempt_count: 0, max_attempts: 2 }).select("id, status, attempt_count, max_attempts, fallback_asset_id, generated_asset_id, student_item_id").single();
    if (insertError) {
      // Simultaneous requests can both miss the first read. The unique session FK wins.
      if (insertError.code === "23505") {
        const { data: raced, error: raceError } = await db.from("item_generation_jobs").select("id, status, attempt_count, max_attempts, fallback_asset_id, generated_asset_id, student_item_id").eq("source_session_id", session.id).maybeSingle();
        if (!raceError && raced) return NextResponse.json({ job: raced, reused: true }, { headers: { "Cache-Control": "no-store" } });
      }
      return fail("DATABASE_ERROR", "생성 작업을 접수하지 못했습니다.", 500);
    }
    return NextResponse.json({ job, reused: false }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId || !uuid.test(sessionId)) return fail("INVALID_REQUEST", "session_id가 필요합니다.", 400);
  try {
    const session = await sessionForMvp(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: job, error } = await admin.from("item_generation_jobs").select("id, status, attempt_count, max_attempts, next_attempt_at, fallback_asset_id, generated_asset_id, student_item_id, inference_output, student_message, completed_at").eq("source_session_id", session.id).maybeSingle();
    if (error) return fail("DATABASE_ERROR", "생성 작업을 조회하지 못했습니다.", 500);
    if (!job) return fail("JOB_NOT_FOUND", "생성 작업이 아직 접수되지 않았습니다.", 404);
    return NextResponse.json({ job }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
