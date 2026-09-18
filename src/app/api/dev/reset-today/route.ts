// 담당: 이유민
// 개발 전용. 같은 학생으로 같은 흐름을 몇 번이고 다시 테스트하기 위한 것.
//
// ⚠️ 프로덕션에서는 404. 실제 로그인이 붙으면 /api/dev/* 를 통째로 지울 것.
//
// 완료된 상담은 지우지 않는다. 트리거 checkin_transcript_guard 가 전문이 있는 행의
// DELETE 와 전문 UPDATE 를 막는다(원본 불변, 기획안 §8.3). 옳은 보호라 우회하지 않는다.
//
// 대신 session_date 만 과거로 옮긴다. 트리거가 막지 않는 컬럼이고, 기록은 그대로
// 남으므로 잃는 것이 없다. 오늘 자리가 비므로 같은 학생으로 다시 시작할 수 있다.
// 덤으로 과거 세션이 쌓여 나중에 기준선 계산을 시험해 볼 자료가 된다.
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const DEFAULT_STUDENT = "30000000-0000-4000-8000-000000000001";

function seoulDate(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(d);
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const studentId = new URL(request.url).searchParams.get("student") ?? DEFAULT_STUDENT;
  const today = seoulDate();
  const admin = createAdminClient();

  const { data: enrollments, error } = await admin
    .from("enrollments")
    .select("id")
    .eq("student_id", studentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (enrollments ?? []).map((e) => e.id);
  if (!ids.length) {
    return NextResponse.json({ error: "재학 정보가 없습니다.", studentId }, { status: 404 });
  }

  // ① 전문이 없는 세션(시작만 하고 만 것)은 그냥 지운다.
  const { data: deleted, error: deleteError } = await admin
    .from("checkin_sessions")
    .delete()
    .in("enrollment_id", ids)
    .eq("session_date", today)
    .is("transcript", null)
    .select("id");
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  // ② 전문이 있는 세션은 과거로 옮긴다.
  //    unique(enrollment_id, session_date, period, attempt) 때문에 하루에 하나씩 떨어뜨린다.
  const { data: saved, error: readError } = await admin
    .from("checkin_sessions")
    .select("id")
    .in("enrollment_id", ids)
    .eq("session_date", today)
    .not("transcript", "is", null);
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  const moved: string[] = [];
  for (const [i, row] of (saved ?? []).entries()) {
    const { error: moveError } = await admin
      .from("checkin_sessions")
      .update({ session_date: seoulDate(-100 - i) })
      .eq("id", row.id);
    if (moveError) return NextResponse.json({ error: moveError.message, at: row.id }, { status: 500 });
    moved.push(row.id);
  }

  return NextResponse.json({
    ok: true,
    date: today,
    deleted: deleted?.length ?? 0,
    moved_to_past: moved.length,
    note: "오늘 자리를 비웠습니다. 같은 학생으로 다시 테스트하세요.",
  });
}
