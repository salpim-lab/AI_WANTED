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
  // 소유자는 부모 체크인 세션에서 그대로 옮긴다(1094: DB 트리거가 세션·생성 job의 소유자와 일치하는지 검증한다).
  // 슬롯은 소유자별로 센다 — 방문자 전원이 같은 enrollment(민준)를 공유하므로 enrollment 단위로 세면 서로 경합한다.
  const { data: session, error: sessionError } = await db.from("checkin_sessions").select("demo_owner_id").eq("id", input.sourceSessionId).single();
  if (sessionError) throw sessionError;
  const demoOwnerId: string | null = session.demo_owner_id ?? null;
  const earnedOn = todayKst();
  // MVP: slots are acquisition sequence numbers, with no daily product limit.
  // Preserve the unique daily slot index and retry if another session takes our slot.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slotQuery = db.from("student_items").select("slot").eq("enrollment_id", input.enrollmentId).eq("earned_on", earnedOn);
    const { data: latest, error: slotError } = await (demoOwnerId ? slotQuery.eq("demo_owner_id", demoOwnerId) : slotQuery.is("demo_owner_id", null).eq("is_public_demo", false)).order("slot", { ascending: false }).limit(1).maybeSingle();
    if (slotError) throw slotError;
    const slot = (latest?.slot ?? 0) + 1;
    const { data: item, error } = await db.from("student_items").insert({ enrollment_id: input.enrollmentId, asset_id: input.assetId, source_session_id: input.sourceSessionId, demo_owner_id: demoOwnerId, earned_on: earnedOn, slot, is_core: false }).select("id, asset_id, slot, earned_on, is_core").single();
    if (!error) return item;
    if (error.code !== "23505") throw error;
    const { data: raced, error: raceError } = await db.from("student_items").select("id, asset_id, slot, earned_on, is_core").eq("source_session_id", input.sourceSessionId).maybeSingle();
    if (raceError) throw raceError;
    if (raced) return raced;
  }
  throw new Error("ITEM_SLOT_ALLOCATION_BUSY");
}
