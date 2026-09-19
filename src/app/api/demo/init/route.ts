// 담당: 이지현 (신규)
// 공개 데모(Vercel) 방문자 세션 초기화 — **이미 만들어진 익명 세션**에 프로필·담당 학급을 준비한다.
// 이 파일은 로그인을 하지 않는다: signInAnonymously()는 브라우저의 /demo-init 화면 한 곳에서만 부른다.
// (서버에서 부르면 Supabase가 보는 IP가 Vercel 서버 IP라 익명 로그인 레이트리밋을 전체 방문자가 공유하고,
//  캡차(Turnstile) 토큰도 브라우저에서만 얻을 수 있다 — 세션 없이 여기 오면 401.)
//
// 왜 진입점을 하나로 모으나: profiles upsert의 on conflict do nothing은 "같은 user id의 프로필
// 중복 생성"만 막아줄 뿐, "쿠키 없는 첫 접속에서 여러 요청이 각자 signInAnonymously()를 불러
// 서로 다른 user id를 여러 개 만드는 문제"는 못 막는다 — 그래서 공통 초기화 화면(/demo-init)이
// 로그인과 이 라우트 호출을 한 번만 하고, 그게 끝난 뒤에야 학생·교사 화면으로 넘어가는 흐름을 강제한다.
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

// 세션 쿠키를 발급·갱신하는 응답이라 중간 캐시에 남으면 안 된다(방문자 간 세션·메타데이터가 섞이는 문제 방지).
const NO_STORE = { "Cache-Control": "no-store" };
const respond = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST() {
  if (process.env.DEMO_MODE !== "true") {
    return respond({ error: "DEMO_MODE_DISABLED" }, 404);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 로그인은 /demo-init(브라우저)이 먼저 끝낸 뒤 이 라우트를 부른다. 세션이 없으면 계정을 만들지 않고 돌려보낸다.
  if (!user) {
    return respond({ error: "NO_SESSION" }, 401);
  }

  // ⚠️ 익명 세션에만 교사 프로필·담임 반 assistant 권한을 준다. 이미 정식 로그인된 계정(학생·교사)이 이 경로를
  // 부르면 그 계정에 권한이 얹히는 권한 상승이 되므로 거부한다.
  if (user.is_anonymous !== true) {
    return respond({ error: "NOT_ANONYMOUS_SESSION" }, 403);
  }

  // 교사 쪽 FK(work_records.created_by 등)를 만족시키기 위한 프로필 준비.
  // RLS 우회 admin 클라이언트로 — 이 시점엔 아직 profiles 행이 없어 RLS로는 자기 자신도
  // 못 만들 수 있다(정책이 존재를 전제하는 경우가 있어 admin으로 확실하게 처리).
  const admin = createAdminClient();
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: user.id, role: "teacher", display_name: "체험 선생님" }, { onConflict: "id", ignoreDuplicates: true });
  if (profileError) {
    console.error("[demo/init] 프로필 준비 실패", profileError.message);
    return respond({ error: "PROFILE_SETUP_FAILED" }, 502);
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
    console.error("[demo/init] 담당 학급 등록 실패", classTeacherError.message);
    return respond({ error: "CLASS_TEACHER_SETUP_FAILED" }, 502);
  }

  return respond({ ok: true });
}
