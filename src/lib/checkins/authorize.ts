// 담당: 이유민
// 학생 라우트 공통 검증. 네 라우트가 같은 확인을 반복하므로 한 곳에 모은다.
//
// admin 클라이언트(RLS 우회)를 쓰기 전에 반드시 여기를 통과시킬 것.
// 여기가 뚫리면 다른 아이의 상담을 읽고 쓸 수 있다.
import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export class CheckinAuthError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Session = Database["public"]["Tables"]["checkin_sessions"]["Row"];

/** 로그인한 학생의 students.id. 교사 계정은 여기서 걸러진다. */
export async function requireStudent() {
  const client = await createClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user) {
    throw new CheckinAuthError("UNAUTHORIZED", 401, "학생 로그인이 필요합니다.");
  }

  const { data: student, error } = await client
    .from("students")
    .select("id, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) {
    throw new CheckinAuthError("DATABASE_ERROR", 500, "학생 정보를 조회하지 못했습니다.");
  }
  if (!student || student.status !== "active") {
    throw new CheckinAuthError("FORBIDDEN", 403, "활성 상태인 학생만 사용할 수 있습니다.");
  }
  return { client, studentId: student.id, authUserId: user.id };
}

/**
 * 세션이 로그인한 학생 본인의 것인지 확인한다.
 * `started` 만 허용하는 이유: 종료된 세션에 전사·파생 수치를 덧붙이면
 * 전문 저장의 쓰기 1회 보장(saveWholeTranscript)이 무의미해진다.
 */
export async function requireOwnStartedSession(sessionId: unknown): Promise<Session> {
  if (typeof sessionId !== "string" || !UUID.test(sessionId)) {
    throw new CheckinAuthError("INVALID_REQUEST", 400, "session_id가 필요합니다.");
  }
  const { client, studentId } = await requireStudent();

  const { data: session, error } = await client
    .from("checkin_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) {
    throw new CheckinAuthError("DATABASE_ERROR", 500, "상담을 조회하지 못했습니다.");
  }
  if (!session) {
    throw new CheckinAuthError("SESSION_NOT_FOUND", 404, "상담을 찾을 수 없습니다.");
  }

  const { data: enrollment, error: enrollmentError } = await client
    .from("enrollments")
    .select("student_id")
    .eq("id", session.enrollment_id)
    .single();
  if (enrollmentError) {
    throw new CheckinAuthError("DATABASE_ERROR", 500, "학생 정보를 조회하지 못했습니다.");
  }
  if (enrollment.student_id !== studentId) {
    throw new CheckinAuthError("FORBIDDEN", 403, "본인의 상담만 사용할 수 있습니다.");
  }
  if (session.status !== "started") {
    throw new CheckinAuthError("SESSION_ALREADY_FINISHED", 409, "이미 종료된 상담입니다.");
  }
  return session;
}
