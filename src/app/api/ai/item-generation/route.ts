// 전문 저장과 병렬로 작업을 접수한다. 실행은 전문 저장 완료 후 워커가 담당한다.
// 응답은 바로 돌려준다. 학생 화면이 조회하는 동안 실행 가능한 작업은 응답 뒤(after)에 실행한다.
import { after, NextResponse } from "next/server";
import { CheckinAuthError, requireOwnSession } from "@/lib/checkins/authorize";
import { isDemoModeEnabled } from "@/lib/demo/scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { runItemGenerationJob } from "@/lib/items/runItemGenerationJob";

export const runtime = "nodejs";
// after()로 실행하는 작업(추론 + 조립)이 이 시간 안에 끝나야 한다. 워커 라우트와 같다.
export const maxDuration = 180;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (code: string, message: string, status: number) => NextResponse.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });

// MVP has one demo student; this is the enrollment from supabase/seed.sql.
const MINJUN_ENROLLMENT_ID = "40000000-0000-4000-8000-000000000001";

async function sessionForMvp(sessionId: string) {
  // (2026-09-20, 이지현 제안) 이 라우트는 원래 소유권 확인이 없었다(MVP 단일 학생 가정) — 공개 데모에서는 모든
  // 방문자가 같은 학생이라, session_id만 알면 남의 세션으로 아이템 생성 작업(AI 비용)을 접수하고 그 결과(아이템·
  // 학생 메시지)를 읽을 수 있었다. DEMO_MODE에서는 현재 방문자 소유 세션만 허용한다.
  if (isDemoModeEnabled()) await requireOwnSession(sessionId);
  const client = createAdminClient();
  const { data: session, error } = await client.from("checkin_sessions").select("id, enrollment_id, status, transcript").eq("id", sessionId).maybeSingle();
  if (error) throw new Error("DATABASE_ERROR");
  if (!session || session.enrollment_id !== MINJUN_ENROLLMENT_ID) throw new Error("SESSION_NOT_FOUND");
  return session;
}

function errorResponse(error: unknown) {
  if (error instanceof CheckinAuthError) return fail(error.code, error.message, error.httpStatus);
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
    // ponytail: cron 결정 전까지 학생이 기다리는 동안의 조회가 워커를 대신한다. 학생이 화면을 떠나면
    // fallback 재시도는 다음 조회까지 멈춘다. cron이 정해지면 워커 라우트를 주기 호출하면 된다.
    // 같은 작업을 동시에 여러 번 호출해도 runItemGenerationJob의 원자적 claim이 한 번만 실행한다.
    const runnable = ["queued", "retry_wait", "fallback"].includes(job.status) && job.attempt_count < job.max_attempts && (!job.next_attempt_at || new Date(job.next_attempt_at) <= new Date());
    if (runnable && session.status !== "started" && session.transcript !== null) {
      after(() => runItemGenerationJob(job.id).catch(error => console.error("[item-generation] 작업 실행 실패", job.id, error)));
    }
    const assetId = job.generated_asset_id ?? job.fallback_asset_id;
    if (assetId && job.student_item_id) {
      const { data: asset, error: assetError } = await admin.from("asset_catalog").select("name, asset_format, geometry_spec").eq("id", assetId).eq("status", "ready").maybeSingle();
      if (assetError) return fail("DATABASE_ERROR", "아이템을 조회하지 못했습니다.", 500);
      job.asset = asset;
    }
    return NextResponse.json({ job }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
