// 담당: 이유민
// 개발 전용 학생 로그인. 실제 로그인 화면이 나오기 전까지 대화 흐름을 직접 확인하기 위한 것.
//
// ⚠️ 프로덕션에서는 404 로 막힌다. 이 파일이 배포돼도 동작하지 않는다.
//    그래도 실제 로그인이 붙는 순간 이 라우트는 지울 것.
//
// 하는 일: 시드 학생 하나에 auth 사용자를 붙이고 그 계정으로 로그인해 쿠키를 심는다.
// 사용법: 브라우저에서 http://127.0.0.1:3000/api/dev/login 을 연 뒤 /checkin 으로 간다.
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * 시드의 첫 학생(민준). 바꾸는 법 두 가지.
 *   ?student=<uuid>  특정 학생
 *   ?n=2             시드의 n 번째 학생
 *
 * 왜 필요한가: 완료된 상담은 DB 트리거가 삭제를 막는다(원본 불변).
 * 그래서 같은 학생으로 같은 시간대를 하루에 두 번 테스트할 수 없다.
 * 흐름을 반복해서 보려면 학생을 바꾼다.
 */
const DEFAULT_STUDENT = "30000000-0000-4000-8000-000000000001";
const PASSWORD = "dev-salpim-local";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const n = Number(params.get("n"));
  const studentId =
    params.get("student") ??
    (Number.isInteger(n) && n >= 1 && n <= 99
      ? `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`
      : DEFAULT_STUDENT);
  const admin = createAdminClient();

  const { data: student, error } = await admin
    .from("students")
    .select("id, display_name, auth_user_id")
    .eq("id", studentId)
    .maybeSingle();
  if (error || !student) {
    return NextResponse.json({ error: "학생을 찾을 수 없습니다.", studentId }, { status: 404 });
  }

  const email = `dev-${student.id}@salpim.local`;
  let authUserId = student.auth_user_id;

  if (!authUserId) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (createError && !createError.message.includes("already been registered")) {
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }
    authUserId = created?.user?.id ?? null;

    // 이미 있던 계정이면 목록에서 찾는다.
    if (!authUserId) {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      authUserId = list?.users.find((u) => u.email === email)?.id ?? null;
    }
    if (!authUserId) return NextResponse.json({ error: "auth 사용자를 만들지 못했습니다." }, { status: 500 });

    const { error: linkError } = await admin
      .from("students")
      .update({ auth_user_id: authUserId })
      .eq("id", student.id);
    if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  // 쿠키를 심는 쪽은 사용자 클라이언트여야 한다. admin 으로는 세션이 생기지 않는다.
  const client = await createClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) return NextResponse.json({ error: signInError.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    student: student.display_name,
    student_id: student.id,
    next: "/checkin 또는 /checkout 으로 이동하세요.",
  });
}
