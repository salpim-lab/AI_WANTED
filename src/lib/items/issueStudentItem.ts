import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const todayKst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

/** Creates one immutable student_items record, reusing the source-session record on retries. */
export async function issueStudentItem(input: { enrollmentId: string; sourceSessionId: string; assetId: string }) {
  // database.types.ts is regenerated after the job migrations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: existing, error: existingError } = await db.from("student_items").select("id, asset_id, slot, earned_on, is_core").eq("source_session_id", input.sourceSessionId).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;
  const earnedOn = todayKst();
  const { data: taken, error: takenError } = await db.from("student_items").select("slot").eq("enrollment_id", input.enrollmentId).eq("earned_on", earnedOn);
  if (takenError) throw takenError;
  const used = new Set((taken ?? []).map((row: { slot: number }) => row.slot));
  const slot = used.has(1) ? (used.has(2) ? null : 2) : 1;
  if (!slot) throw new Error("DAILY_ITEM_SLOTS_FULL");
  const { data: item, error } = await db.from("student_items").insert({ enrollment_id: input.enrollmentId, asset_id: input.assetId, source_session_id: input.sourceSessionId, earned_on: earnedOn, slot, is_core: false }).select("id, asset_id, slot, earned_on, is_core").single();
  if (error) {
    // A concurrent retry may have won the unique source/session or daily slot race.
    const { data: raced } = await db.from("student_items").select("id, asset_id, slot, earned_on, is_core").eq("source_session_id", input.sourceSessionId).maybeSingle();
    if (raced) return raced;
    throw error;
  }
  return item;
}
