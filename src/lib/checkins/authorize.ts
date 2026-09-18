// 담당: 이유민
// 학생 라우트 공통 검증. 네 라우트가 같은 확인을 반복하므로 한 곳에 모은다.
//
// admin 클라이언트(RLS 우회)를 쓰기 전에 반드시 여기를 통과시킬 것.
// 여기가 뚫리면 다른 아이의 상담을 읽고 쓸 수 있다.
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 개발 환경에서 로그인 없이 쓰는 학생. 시드의 민준이다.
 *
 * ⚠️ 프로덕션에서는 절대 쓰이지 않는다 — NODE_ENV 로 막는다.
 *    로그인 화면이 아직 없어서 두는 임시 장치이고, 로그인이 붙으면 지운다.
 *    DEV_STUDENT_ID=off 로 끄면 개발 환경에서도 401 을 그대로 본다.
 */
const DEV_STUDENT_FALLBACK = "30000000-0000-4000-8000-000000000001";

function devStudentId() {
  if (process.env.NODE_ENV === "production") return null;
  const configured = process.env.DEV_STUDENT_ID;
  if (configured === "off") return null;
  return configured || DEV_STUDENT_FALLBACK;
}

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
  } = await client.auth.getUser();

  if (!user) {
    // 로그인 화면이 없는 동안, 개발 환경에서만 시드 학생으로 진행한다.
    const devId = devStudentId();
    if (!devId) throw new CheckinAuthError("UNAUTHORIZED", 401, "학생 로그인이 필요합니다.");

    // 로그인 세션이 없으니 RLS 를 통과할 수 없다. 이 경로에서만 admin 으로 읽는다.
    const admin = createAdminClient();
    const { data: devStudent } = await admin
      .from("students")
      .select("id, status")
      .eq("id", devId)
      .maybeSingle();
    if (!devStudent || devStudent.status !== "active") {
      throw new CheckinAuthError("UNAUTHORIZED", 401, "개발용 학생을 찾을 수 없습니다.");
    }
    // 매 요청 남긴다. 조용히 동작하면 언젠가 이게 켜진 줄 모르고 배포한다.
    console.warn(`[auth] 개발 모드: 로그인 없이 학생 ${devId} 로 진행합니다.`);
    return { client: admin, studentId: devStudent.id, authUserId: null };
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

/** 소유만 확인한다. 상태는 보지 않는다 — 면담 신청처럼 종료 뒤에 하는 동작용. */
export async function requireOwnSession(sessionId: unknown): Promise<Session> {
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
  return session;
}

/**
 * 소유 + 아직 진행 중임을 확인한다.
 * `started` 만 허용하는 이유: 종료된 세션에 전사·파생 수치를 덧붙이면
 * 전문 저장의 쓰기 1회 보장(saveWholeTranscript)이 무의미해진다.
 */
export async function requireOwnStartedSession(sessionId: unknown): Promise<Session> {
  const session = await requireOwnSession(sessionId);
  if (session.status !== "started") {
    throw new CheckinAuthError("SESSION_ALREADY_FINISHED", 409, "이미 종료된 상담입니다.");
  }
  return session;
}
