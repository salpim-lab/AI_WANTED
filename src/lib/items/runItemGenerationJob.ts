import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTranscript } from "@/lib/supabase/raw/wholeTranscript";
import { inferItem, ItemAIError } from "@/lib/openai/inferItem";
import { assembleItem } from "@/lib/openai/assembleItem";
import { parseLabItem, type AssembledItemSpec } from "./assembledItem";
import { FALLBACK_ITEM_SPEC } from "./fallbackItem";
import { issueStudentItem } from "./issueStudentItem";

type Job = { id: string; enrollment_id: string; source_session_id: string; status: string; attempt_count: number; max_attempts: number; fallback_asset_id: string | null };
// database.types.ts is regenerated after the procedural-asset migration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any;

const STYLE_VERSION = "procedural-v2";
const FALLBACK_KEY = `fallback:gift-box:${STYLE_VERSION}`;

function canonicalAssetKey(subject: string) {
  // The subject, rather than the student-specific name or appearance text, is
  // the reuse boundary. This keeps every soccer ball a soccer ball and makes
  // colour/wording changes unable to create duplicate assets.
  const normalized = subject.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^가-힣a-z0-9]+/g, "").trim();
  if (!normalized) throw new Error("INVALID_ITEM_SUBJECT");
  return `item:${normalized}:${STYLE_VERSION}`;
}

function canonicalPalette(subject: string) {
  const normalized = subject.normalize("NFKC").toLocaleLowerCase("ko-KR");
  if (/축구공|soccer/.test(normalized)) return ["#F7F7F2", "#20252B"];
  if (/사과|apple/.test(normalized)) return ["#D95C59", "#5E8A3A", "#6B4938"];
  if (/별|star/.test(normalized)) return ["#F2C54E", "#FFF1A8"];
  return ["#D9E7DF", "#6E9A7C", "#E6B86A"];
}

function applyCanonicalPalette(spec: AssembledItemSpec, subject: string): AssembledItemSpec {
  const palette = canonicalPalette(subject);
  return { ...spec, parts: spec.parts.map((part, index) => ({ ...part, color: palette[index % palette.length] })) };
}

async function findReadyAsset(dedupKey: string) {
  const { data, error } = await db().from("asset_catalog")
    .select("id")
    .eq("dedup_key", dedupKey)
    .eq("style_version", STYLE_VERSION)
    .eq("asset_type", "item")
    .eq("asset_format", "procedural")
    .eq("status", "ready")
    .maybeSingle();
  if (error) throw error;
  return data?.id as string | undefined;
}

async function saveProceduralAsset(spec: AssembledItemSpec, job: Job, kind: "fallback" | "generated", dedupKey?: string) {
  const client = db();
  const metadata = { kind, geometrySpecVersion: spec.version, jobId: job.id };
  const key = kind === "fallback" ? FALLBACK_KEY : dedupKey ?? `item-job:${job.id}:${STYLE_VERSION}`;
  const existingId = await findReadyAsset(key);
  if (existingId) return existingId;
  const { data, error } = await client.from("asset_catalog").insert({ dedup_key: key, style_version: STYLE_VERSION, asset_type: "item", name: spec.name, model_url: `procedural://${key}`, source: kind === "fallback" ? "preset" : "generated", generation_metadata: metadata, asset_format: "procedural", geometry_spec: spec, status: "ready" }).select("id").single();
  if (error) {
    // Another worker may have inserted the same canonical asset concurrently.
    const racedId = await findReadyAsset(key);
    if (racedId) return racedId;
    throw error;
  }
  if (!data) throw new Error("에셋을 저장하지 못했습니다.");
  return data.id as string;
}

async function replacePlacedAsset(studentItemId: string, assetId: string) {
  const { error } = await db().from("island_placements").update({ current_asset_id: assetId, updated_at: new Date().toISOString() }).eq("student_item_id", studentItemId);
  if (error) throw error;
}

async function updateJob(id: string, values: Record<string, unknown>) {
  const { error } = await db().from("item_generation_jobs").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

/** One bounded worker invocation. Scheduler/queue calls this with a job id. */
export async function runItemGenerationJob(jobId: string) {
  const client = db();
  const { data: job, error } = await client.from("item_generation_jobs").select("id, enrollment_id, source_session_id, status, attempt_count, max_attempts, fallback_asset_id").eq("id", jobId).maybeSingle() as { data: Job | null; error: Error | null };
  if (error) throw error;
  if (!job || !["queued", "retry_wait", "fallback"].includes(job.status)) return { skipped: true, status: job?.status ?? "missing" };
  if (job.attempt_count >= job.max_attempts) return { skipped: true, status: job.status };
  const nextAttempt = job.attempt_count + 1;
  const { data: claimed, error: claimError } = await client.from("item_generation_jobs").update({ status: "generating", attempt_count: nextAttempt, started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id).in("status", ["queued", "retry_wait", "fallback"]).eq("attempt_count", job.attempt_count).select("id").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { skipped: true, status: "claimed_by_other_worker" };
  try {
    const { data: session, error: sessionError } = await client.from("checkin_sessions").select("transcript, status").eq("id", job.source_session_id).single();
    if (sessionError || !session || session.transcript === null || session.status === "started") throw new Error("TRANSCRIPT_NOT_READY");
    const inference = await inferItem(parseTranscript(session.transcript));
    const dedupKey = canonicalAssetKey(inference.subject);
    let assetId = await findReadyAsset(dedupKey);
    if (!assetId) {
      const spec = parseLabItem(await assembleItem(inference));
      if ("shape" in spec) throw new Error("ASSEMBLY_NOT_COMPOSITE");
      assetId = await saveProceduralAsset(applyCanonicalPalette(spec, inference.subject), job, "generated", dedupKey);
    }
    const studentItem = await issueStudentItem({ enrollmentId: job.enrollment_id, sourceSessionId: job.source_session_id, assetId });
    await replacePlacedAsset(studentItem.id, assetId);
    await updateJob(job.id, { status: "completed", generated_asset_id: assetId, student_item_id: studentItem.id, last_error_code: null, completed_at: new Date().toISOString() });
    return { status: "completed", assetId, studentItemId: studentItem.id };
  } catch (error) {
    const code = error instanceof ItemAIError ? error.code : error instanceof Error ? error.message : "GENERATION_FAILED";
    if (code === "TRANSCRIPT_NOT_READY") {
      const fallbackId = await saveProceduralAsset(FALLBACK_ITEM_SPEC, job, "fallback");
      const studentItem = await issueStudentItem({ enrollmentId: job.enrollment_id, sourceSessionId: job.source_session_id, assetId: fallbackId });
      await replacePlacedAsset(studentItem.id, fallbackId);
      await updateJob(job.id, { status: "fallback_final", fallback_asset_id: fallbackId, student_item_id: studentItem.id, last_error_code: code, last_error_at: new Date().toISOString(), fallback_at: new Date().toISOString() });
      return { status: "fallback_final", assetId: fallbackId, studentItemId: studentItem.id, reason: code };
    }
    const fallbackId = await saveProceduralAsset(FALLBACK_ITEM_SPEC, job, "fallback");
    const studentItem = await issueStudentItem({ enrollmentId: job.enrollment_id, sourceSessionId: job.source_session_id, assetId: fallbackId });
    await replacePlacedAsset(studentItem.id, fallbackId);
    const terminal = nextAttempt >= job.max_attempts;
    await updateJob(job.id, { status: terminal ? "fallback_final" : "fallback", fallback_asset_id: fallbackId, student_item_id: studentItem.id, next_attempt_at: terminal ? null : new Date(Date.now() + 30_000).toISOString(), last_error_code: code, last_error_at: new Date().toISOString(), fallback_at: new Date().toISOString() });
    return { status: terminal ? "fallback_final" : "fallback", assetId: fallbackId, studentItemId: studentItem.id, reason: code };
  }
}
