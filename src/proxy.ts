// 담당: 이지현 (신규 — 모든 라우트를 감싸는 루트급 파일이라 merge 전 팀 채널 공유 필요)
// 공개 데모(Vercel) 방문자 세션 갱신 + 접근 게이트.
//
// 역할은 딱 하나 — "기존 세션 쿠키 갱신 + 접근 확인"만 한다. 새 익명 계정 생성
// (signInAnonymously)은 절대 여기서 안 한다 — 여기서도 부르면 페이지 로드마다 여러 요청이
// 동시에 각자 새 계정을 만들어버리는 문제가 생긴다. 계정 생성은 /api/demo/init 한 곳으로만
// 모은다(계획 문서 B항 "역할 확정표" 참고).
//
// Next.js 16에서 middleware.ts가 proxy.ts로 이름이 바뀌었다(공식 문서 확인 완료:
// https://nextjs.org/docs/app/api-reference/file-conventions/proxy — 파일명·함수명·config
// export 전부 이 문서 기준으로 작성).
//
// (2026-09-20) DEMO_MODE 플래그로 이 파일 전체를 게이트한다 — 나중에 진짜 학생 로그인이
// 붙는 배포에서 이 익명 세션 로직이 실수로 같이 켜지지 않게 하기 위함.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/demo/init(계정 생성 자체)과 공통 초기화 화면은 세션이 없어도 통과해야 한다 —
// "세션을 만들려는 요청"이 "세션이 있어야 통과"하는 게이트에 막히면 안 된다.
const INIT_PATHS = ["/demo-init", "/api/demo/init"];

function requireEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

export function proxy(request: NextRequest) {
  if (process.env.DEMO_MODE !== "true") return NextResponse.next();
  if (INIT_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) return NextResponse.next();

  return refreshSessionAndGate(request);
}

async function refreshSessionAndGate(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // 세션이 있으면(익명이든 아니든) 이 호출이 만료된 토큰을 갱신하고 위 setAll로 쿠키를 다시 쓴다.
  // 세션이 아예 없으면 계정을 만들지 않고 그대로 둔다 — /demo-init 화면으로 보내서
  // /api/demo/init이 signInAnonymously()를 부르게 한다(계정 생성은 그쪽 책임).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/demo-init";
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // 학생 경로만이 아니라 교사 경로도 포함한다 — 교사 화면으로 먼저 들어온 방문자도
  // 빠짐없이 세션 게이트를 통과하게 한다(이전 설계에서 "학생 경로만" 매처였던 구멍을 막음).
  matcher: [
    "/checkin/:path*",
    "/checkout/:path*",
    "/dashboard/:path*",
    "/students/:path*",
    "/observation/:path*",
    "/consultation/:path*",
    "/demo-init",
    "/api/checkins/:path*",
    "/api/ai/:path*",
    "/api/student/:path*",
    "/api/students/:path*",
    "/api/teacher/:path*",
    "/api/demo/:path*",
  ],
};
