// 담당: 이지현 (신규)
// 공개 데모(Vercel) 방문자 세션 초기화 — 익명 계정 생성 + 프로필 준비를 이 한 곳으로 모은다.
// signInAnonymously()를 부르는 곳은 이 파일이 유일하다(proxy.ts는 세션 갱신만, 계정 생성은 안 함).
//
// 왜 한 곳으로 모으나: profiles upsert의 on conflict do nothing은 "같은 user id의 프로필
// 중복 생성"만 막아줄 뿐, "쿠키 없는 첫 접속에서 여러 요청이 각자 signInAnonymously()를 불러
// 서로 다른 user id를 여러 개 만드는 문제"는 못 막는다 — 그래서 공통 초기화 화면(/demo-init)이
// 이 라우트 하나만 호출하고, 그게 끝난 뒤에야 학생·교사 화면으로 넘어가는 흐름을 강제한다.
//
// 학생 쪽은 여기서 따로 준비할 게 없다 — checkin_sessions.demo_owner_id에 auth.uid()를 그대로
// 쓰기 때문에(민준 한 명을 공유, 계획 문서 "핵심 모델" 참고) 별도 연결 행이 필요 없다.
// 교사 쪽은 work_records.created_by / parent_consultations.teacher_id가 profiles(id)를
// FK로 참조하므로, 그 제약을 만족시키기 위해 profiles(+class_teachers) 행을 미리 만들어둔다.
//
// ⚠️ DEMO_MODE=true 환경변수 뒤에 게이트한다 — 실제 로그인이 붙는 배포에서 이 특수 경로가
// 실수로 같이 켜지지 않게 하기 위함(proxy.ts와 동일한 게이트).

import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 시드 데이터의 고정값(supabase/seed.sql "3학년 2반"). _mockTeacherData.ts의
// MOCK_TEACHER.classId / MOCK_DB_CLASS_ID와 같은 값이다 — 이 데모 흐름은 "모두 민준으로,
// 같은 반으로" 체험하는 것이 목표라 학생/학급 자체는 바꾸지 않는다.
const DEMO_CLASS_ID = "20000000-0000-4000-8000-000000000001";

export async function POST() {
  if (process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "DEMO_MODE_DISABLED" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user: existingUser },
  } = await supabase.auth.getUser();

  let user = existingUser;
  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      return NextResponse.json({ error: "ANONYMOUS_SIGNIN_FAILED" }, { status: 502 });
    }
    user = data.user;
  }

  // 교사 쪽 FK(work_records.created_by 등)를 만족시키기 위한 프로필 준비.
  // RLS 우회 admin 클라이언트로 — 이 시점엔 아직 profiles 행이 없어 RLS로는 자기 자신도
  // 못 만들 수 있다(정책이 존재를 전제하는 경우가 있어 admin으로 확실하게 처리).
  const admin = createAdminClient();
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: user.id, role: "teacher", display_name: "체험 선생님" }, { onConflict: "id", ignoreDuplicates: true });
  if (profileError) {
    return NextResponse.json({ error: "PROFILE_SETUP_FAILED", detail: profileError.message }, { status: 502 });
  }

  // role은 'homeroom'을 쓰면 안 된다 — _mockTeacherData.ts의 recordDb()가
  // class_teachers.role='homeroom'을 "그 반의 유일한 진짜 담임"으로 보고 limit(1)로
  // 찾아 쓴다(dbTeacherId 번역표의 기준점). 방문자마다 homeroom 행을 늘리면 그 조회가
  // 방문자 중 아무나를 담임으로 집어버려 기존 번역표가 깨진다. 'assistant'로 안전하게 등록.
  const { error: classTeacherError } = await admin
    .from("class_teachers")
    .upsert(
      { class_id: DEMO_CLASS_ID, teacher_id: user.id, role: "assistant" },
      { onConflict: "class_id,teacher_id", ignoreDuplicates: true },
    );
  if (classTeacherError) {
    return NextResponse.json({ error: "CLASS_TEACHER_SETUP_FAILED", detail: classTeacherError.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
