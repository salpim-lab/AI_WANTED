// 담당: 이유민
// 대화에서 아이 이름을 불러 주기 위한 조회. 이름은 성 없이 쓴다(시드의 display_name 이 "민준" 꼴).
// 서버에서 세션으로 찾는다 — 브라우저가 보낸 이름을 쓰면 아무 이름이나 넣을 수 있다.
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** 못 찾으면 undefined — 이름 없이 대화한다. 이름 때문에 대화를 막지 않는다 */
export async function studentGivenName(enrollmentId: string): Promise<string | undefined> {
  try {
    const { data } = await createAdminClient()
      .from("enrollments")
      .select("students!inner ( display_name )")
      .eq("id", enrollmentId)
      .maybeSingle();
    const name = (data?.students as unknown as { display_name?: string } | null)?.display_name?.trim();
    return name || undefined;
  } catch (error) {
    console.warn("[studentName] 이름을 읽지 못했습니다", error);
    return undefined;
  }
}
