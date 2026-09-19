// 담당: 이유민
// 아이가 대화 끝에 누른 "선생님과의 대화 신청하기" 를 교사 화면으로 넘기는 읽기 경로.
//
// 경계:
//   쓰기(createMeetingRequest)  이유민 — 학생 화면에서 생성
//   읽기(여기)                  이유민 — 모양을 고정해 교사 화면에 넘긴다
//   화면                        진승혜(대시보드) / 김현우(아이 상세)
//
// 교사 화면 쪽은 이 함수나 GET /api/teacher/meeting-requests 를 부르고
// message 를 그대로 렌더하면 된다. 테이블 구조를 알 필요가 없고,
// 내가 컬럼을 바꿔도 이 모양만 유지하면 화면이 깨지지 않는다.
import "server-only";

import { getDemoScope, ownerOrFilter } from "@/lib/demo/scope";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SignalColor } from "@/lib/types/signal";

export type MeetingRequestCard = {
  id: string;
  studentId: string;
  studentName: string;
  /** 대시보드에 그대로 쓸 문장. "민준이에게 상담 신청이 도착했어요" */
  message: string;
  /** 아이 상세로 보낼 링크 대상 */
  href: string;
  requestedAt: string;
  /** 위험 신호로 종료된 대화에서 올라온 신청. 먼저 보여야 한다 */
  priority: "normal" | "high";
  status: string;
  /** 신청이 붙은 상담. 교사가 그 대화를 열어볼 때 쓴다 */
  sessionId: string | null;
  sessionDate: string | null;
  moodColor: SignalColor | null;
};

/** 조사 '이/가'. 받침이 있으면 '이'. */
function withSubjectParticle(name: string) {
  const last = name.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return `${name}에게`;
  // 한글 음절은 (초성*21 + 중성)*28 + 종성 구조다. 종성이 0이면 받침이 없다.
  const hasFinal = (code - 0xac00) % 28 !== 0;
  return hasFinal ? `${name}이에게` : `${name}에게`;
}

/**
 * 담당 학급에 아직 처리되지 않은 상담 신청.
 *
 * ⚠️ RLS 를 우회하는 admin 클라이언트를 쓴다. 호출하는 쪽에서 반드시
 *    "이 교사가 이 학급 담당인지" 를 먼저 확인할 것.
 */
export async function listOpenMeetingRequests(classIds: string[], limit = 20) {
  if (!classIds.length) return [];
  const admin = createAdminClient();

  // (2026-09-20, 이지현 제안) 공개 데모 방문자 격리 — 방문자는 전원이 담임 반 class_teachers(assistant)라서
  // 이 함수가 "그 반의 모든 신청"을 돌려주면 다른 방문자의 신청이 그대로 보이고(POST로 확인 처리까지 가능).
  // 신청은 source_session_id의 부모 세션 소유자로 구분한다: "공용 시드 세션 + 현재 방문자 세션"에 붙은 것만.
  // limit 뒤에 후처리로 거르면 다른 방문자 행이 자리를 채워 내 신청이 밀려나므로 쿼리 단계에서 좁힌다.
  // 세션이 없는(source_session_id NULL) 신청은 소유자를 못 가려서 방문자에게는 보이지 않는다(fail-closed).
  const scope = await getDemoScope();
  const scopeFilter = ownerOrFilter(scope);
  const sessionEmbed = scopeFilter ? "checkin_sessions!inner ( session_date, mood_color )" : "checkin_sessions ( session_date, mood_color )";

  let query = admin
    .from("meeting_requests")
    .select(
      `id, requested_at, priority, status, source_session_id,
       enrollments!inner ( class_id, student_id, students!inner ( id, display_name ) ),
       ${sessionEmbed}`,
    )
    .in("enrollments.class_id", classIds)
    .eq("status", "requested");
  if (scopeFilter) query = query.or(scopeFilter, { referencedTable: "checkin_sessions" });
  const { data, error } = await query
    // priority 는 text 라 DB 정렬로는 순서를 못 잡는다("normal" > "high").
    // 최신순으로만 받아 오고, high 를 앞으로 올리는 건 아래에서 한다.
    .order("requested_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const cards = (data ?? []).map((row): MeetingRequestCard => {
    const enrollment = row.enrollments as unknown as {
      student_id: string;
      students: { id: string; display_name: string };
    };
    const session = row.checkin_sessions as unknown as {
      session_date: string;
      mood_color: string;
    } | null;
    const name = enrollment.students.display_name;
    return {
      id: row.id,
      studentId: enrollment.student_id,
      studentName: name,
      message: `${withSubjectParticle(name)} 상담 신청이 도착했어요`,
      href: `/students/${enrollment.student_id}`,
      requestedAt: row.requested_at,
      priority: row.priority === "high" ? "high" : "normal",
      status: row.status,
      sessionId: row.source_session_id,
      sessionDate: session?.session_date ?? null,
      moodColor: (session?.mood_color as SignalColor) ?? null,
    };
  });

  // 위험 신호에서 올라온 신청이 먼저 보여야 한다. 같은 등급 안에서는 최신순을 유지한다.
  return cards.sort((a, b) => Number(b.priority === "high") - Number(a.priority === "high"));
}

/** 교사가 확인했다고 표시한다. 대시보드에서 사라지게 하는 용도. */
export async function acknowledgeMeetingRequest(id: string) {
  const { error } = await createAdminClient()
    .from("meeting_requests")
    .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "requested");
  if (error) throw error;
}
