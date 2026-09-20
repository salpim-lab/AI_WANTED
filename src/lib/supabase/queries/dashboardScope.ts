// 담당: 이지현 (제안) — 대시보드의 상담 신청·갈등 기록 조회에 거는 공개 데모 방문자 격리(2026-09-20, origin/main 병합 중 추가).
//
// dashboardSnapshot.ts는 admin(service_role) 클라이언트로 읽어서 RLS가 안 막는다(docs §-1). 방문자 전원이 같은 학생(민준)·같은 반을
// 공유하므로, 이 두 조회를 enrollment/class 단위로만 읽으면 다른 방문자의 데이터가 섞인다. 그래서 스코프를 인자로 받는 함수로 분리해
// (getDemoScope는 호출부가 한 번 읽어 넘긴다) 실제 DB 대조 테스트(__tests__/dashboardScope.test.mjs)를 걸 수 있게 했다.
import { ownerOrFilter, recordVisible, type DemoScope } from "@/lib/demo/scope";
import type { createAdminClient } from "@/lib/supabase/admin";

type Client = ReturnType<typeof createAdminClient>;

export type OpenMeetingRequest = { id: string; enrollment_id: string; requested_at: string; priority: string };

/**
 * 열린(status='requested') 상담 신청. 방문자 스코프에서는 source_session_id의 부모 세션 소유자로 구분한다:
 * "공용 시드 세션(demo_owner_id IS NULL) + 현재 방문자 세션"에 붙은 것만. 세션이 없는(source_session_id NULL) 신청은
 * 소유자를 못 가려서 방문자에게는 안 보인다(fail-closed). 스코프가 꺼져 있으면 기존 동작(전부).
 */
export async function loadOpenMeetingRequests(client: Client, enrollmentIds: string[], scope: DemoScope): Promise<OpenMeetingRequest[]> {
  const scopeFilter = ownerOrFilter(scope);
  let query = client.from("meeting_requests")
    .select(scopeFilter ? "id, enrollment_id, requested_at, priority, checkin_sessions!inner ( id )" : "id, enrollment_id, requested_at, priority")
    .in("enrollment_id", enrollmentIds).eq("status", "requested");
  if (scopeFilter) query = query.or(scopeFilter, { referencedTable: "checkin_sessions" });
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as OpenMeetingRequest[]).map(({ id, enrollment_id, requested_at, priority }) => ({ id, enrollment_id, requested_at, priority }));
}

/** 방문자에게 보여도 되는 갈등 기록만 남긴다: 내가 쓴 것 + (담임이 썼고 시드로 확인된 것). 스코프가 꺼져 있으면 전부. */
export function filterVisibleConflictRecords<T extends { id: string; created_by: string }>(records: T[], scope: DemoScope, homeroomId: string): T[] {
  return records.filter((record) => recordVisible(scope, { id: record.id, created_by: record.created_by }, homeroomId));
}

export type ConflictRecord = { id: string; title: string; body: string; occurred_at: string; created_by: string };

/** 반의 갈등 기록(record_type='conflict') 중 이 스코프에서 보여도 되는 것. */
export async function loadVisibleConflictRecords(client: Client, classId: string, scope: DemoScope): Promise<ConflictRecord[]> {
  const { data, error } = await client
    .from("work_records")
    .select("id, title, body, occurred_at, created_by")
    .eq("class_id", classId)
    .eq("record_type", "conflict")
    .order("occurred_at");
  if (error) throw error;
  let homeroomId = "";
  if (scope.active) {
    const { data: homeroom, error: homeroomError } = await client.from("class_teachers").select("teacher_id").eq("class_id", classId).eq("role", "homeroom").limit(1).maybeSingle();
    if (homeroomError) throw homeroomError;
    homeroomId = homeroom?.teacher_id ?? "";
  }
  return filterVisibleConflictRecords((data ?? []) as ConflictRecord[], scope, homeroomId);
}
