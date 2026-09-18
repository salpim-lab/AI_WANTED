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
  // MVP: slots are acquisition sequence numbers, with no daily product limit.
  // Preserve the unique daily slot index and retry if another session takes our slot.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: latest, error: slotError } = await db.from("student_items").select("slot").eq("enrollment_id", input.enrollmentId).eq("earned_on", earnedOn).order("slot", { ascending: false }).limit(1).maybeSingle();
    if (slotError) throw slotError;
    const slot = (latest?.slot ?? 0) + 1;
    const { data: item, error } = await db.from("student_items").insert({ enrollment_id: input.enrollmentId, asset_id: input.assetId, source_session_id: input.sourceSessionId, earned_on: earnedOn, slot, is_core: false }).select("id, asset_id, slot, earned_on, is_core").single();
    if (!error) return item;
    if (error.code !== "23505") throw error;
    const { data: raced, error: raceError } = await db.from("student_items").select("id, asset_id, slot, earned_on, is_core").eq("source_session_id", input.sourceSessionId).maybeSingle();
    if (raceError) throw raceError;
    if (raced) return raced;
  }
  throw new Error("ITEM_SLOT_ALLOCATION_BUSY");
}
