// 외부 cron/worker가 호출하는 단일 작업 실행 입구.
// 브라우저 사용자에게 노출하지 않으며, 한 요청에서 최대 한 작업만 처리한다.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runItemGenerationJob } from "@/lib/items/runItemGenerationJob";
import { ensurePresetAssetsSynced } from "@/lib/items/presetAssets";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const expected = process.env.ITEM_WORKER_SECRET?.trim();
  if (!expected) return NextResponse.json({ code: "WORKER_NOT_CONFIGURED" }, { status: 503 });
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!provided || provided !== expected) return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
  try {
    // Runs even when no job is pending, so a deploy updates already-placed catalog items.
    await ensurePresetAssetsSynced();
    // database.types.ts is regenerated after the job migrations.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const now = new Date().toISOString();
    const { data: job, error } = await admin.from("item_generation_jobs")
      .select("id")
      .in("status", ["queued", "retry_wait", "fallback"])
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ code: "DATABASE_ERROR" }, { status: 500 });
    if (!job) return NextResponse.json({ processed: false, reason: "NO_PENDING_JOB" }, { status: 200 });
    const result = await runItemGenerationJob(job.id);
    return NextResponse.json({ processed: true, job_id: job.id, result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "WORKER_FAILED" }, { status: 500 });
  }
}
