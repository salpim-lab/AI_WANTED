// 담당: 이유민
// 개발 전용. 오늘 만든 체크인 세션을 지워 같은 흐름을 다시 테스트할 수 있게 한다.
//
// ⚠️ 프로덕션에서는 404. 실제 로그인이 붙으면 /api/dev/* 와 함께 지울 것.
//    아이 데이터를 지우는 동작이므로 개발 학생(dev-*)의 오늘 행만 건드린다.
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const DEFAULT_STUDENT = "30000000-0000-4000-8000-000000000001";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }
  const studentId = new URL(request.url).searchParams.get("student") ?? DEFAULT_STUDENT;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  const admin = createAdminClient();

  const { data: enrollments, error } = await admin
    .from("enrollments")
    .select("id")
    .eq("student_id", studentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (enrollments ?? []).map((e) => e.id);
  if (!ids.length) return NextResponse.json({ error: "재학 정보가 없습니다.", studentId }, { status: 404 });

  // 전문이 저장된 상담은 DB 트리거가 삭제를 막는다(원본 불변, 기획안 §8.3).
  // 그건 올바른 보호이므로 우회하지 않는다. 지울 수 있는 것만 지우고 나머지는 알려준다.
  const { data: deleted, error: deleteError } = await admin
    .from("checkin_sessions")
    .delete()
    .in("enrollment_id", ids)
    .eq("session_date", today)
    .neq("status", "completed")
    .select("id");
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const { data: kept } = await admin
    .from("checkin_sessions")
    .select("period")
    .in("enrollment_id", ids)
    .eq("session_date", today)
    .eq("status", "completed");

  return NextResponse.json({
    ok: true,
    date: today,
    deleted: deleted?.length ?? 0,
    completed_kept: (kept ?? []).map((k) => k.period),
    note: kept?.length
      ? "완료된 상담은 원본 보호로 지울 수 없습니다. /api/dev/login?n=2 처럼 다른 학생으로 테스트하세요."
      : undefined,
  });
}
