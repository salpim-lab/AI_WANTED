// 담당: 이유민
// 교사 화면이 부르는 상담 신청 목록.
//
// 화면 쪽(진승혜 대시보드 / 김현우 아이 상세)은 이 응답의 items 를 받아
// message 를 그대로 띄우면 된다. 테이블·컬럼을 알 필요가 없다.
//
//   GET  /api/teacher/meeting-requests        → { items: MeetingRequestCard[] }
//   POST /api/teacher/meeting-requests        { id } → 확인 처리(목록에서 사라짐)
//
// 담당 학급 범위는 class_teachers 로 서버에서 건다. 쿼리 파라미터로 받지 않는다 —
// 받으면 남의 반 신청을 조회할 수 있다.
import { NextResponse } from "next/server";

import {
  acknowledgeMeetingRequest,
  listOpenMeetingRequests,
} from "@/lib/checkins/meetingRequests";
import { UUID } from "@/lib/checkins/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const fail = (code: string, message: string, status: number) =>
  NextResponse.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });

/** 로그인한 교사가 맡은 학급. 개발 중에는 로그인 없이 전 학급을 본다. */
async function teacherClassIds(): Promise<string[] | null> {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  const admin = createAdminClient();

  if (!user) {
    // 학생 쪽과 같은 이유로 둔 개발용 경로. 교사 로그인 화면도 아직 없다.
    if (process.env.NODE_ENV === "production") return null;
    console.warn("[auth] 개발 모드: 로그인 없이 전체 학급의 상담 신청을 보여줍니다.");
    const { data } = await admin.from("classes").select("id");
    return (data ?? []).map((c) => c.id);
  }

  const { data } = await admin.from("class_teachers").select("class_id").eq("teacher_id", user.id);
  return (data ?? []).map((c) => c.class_id);
}

export async function GET() {
  try {
    const classIds = await teacherClassIds();
    if (classIds === null) return fail("UNAUTHORIZED", "교사 로그인이 필요합니다.", 401);
    const items = await listOpenMeetingRequests(classIds);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[meeting-requests] 조회 실패", error);
    return fail("DATABASE_ERROR", "상담 신청을 불러오지 못했습니다.", 500);
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("INVALID_REQUEST", "유효한 JSON을 보내주세요.", 400);
  }
  const id = body.id;
  if (typeof id !== "string" || !UUID.test(id)) {
    return fail("INVALID_REQUEST", "id가 필요합니다.", 400);
  }

  try {
    const classIds = await teacherClassIds();
    if (classIds === null) return fail("UNAUTHORIZED", "교사 로그인이 필요합니다.", 401);
    // 남의 반 신청을 닫지 못하게, 내 학급 목록 안에 있는지 먼저 확인한다.
    const open = await listOpenMeetingRequests(classIds, 200);
    if (!open.some((item) => item.id === id)) {
      return fail("NOT_FOUND", "상담 신청을 찾을 수 없습니다.", 404);
    }
    await acknowledgeMeetingRequest(id);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[meeting-requests] 확인 처리 실패", error);
    return fail("DATABASE_ERROR", "확인 처리를 저장하지 못했습니다.", 500);
  }
}
