// 담당: 이지현 (신규 — 모든 라우트를 감싸는 루트급 파일이라 merge 전 팀 채널 공유 필요)
// 공개 데모(Vercel) 방문자 세션 갱신 + 접근 게이트.
//
// 역할은 딱 하나 — "기존 세션 쿠키 갱신 + 접근 확인"만 한다. 새 익명 계정 생성
// (signInAnonymously)은 절대 여기서 안 한다 — 여기서도 부르면 페이지 로드마다 여러 요청이
// 동시에 각자 새 계정을 만들어버리는 문제가 생긴다. 계정 생성은 브라우저의 /demo-init 화면 한 곳으로만
// 모은다(계획 문서 B항 "역할 확정표" 참고 — 서버 라우트에서 부르면 레이트리밋 IP가 서버 IP가 되고 캡차도 못 쓴다).
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
  // 비상 정지 — 이 값이 켜지면 아래 모든 데이터 경로가 세션과 무관하게 503이다. `DEMO_MODE=false`는 "안전한
  // 복구"가 아니다: 플래그를 끄면 방문자 격리(lib/demo/scope.ts)도 같이 꺼져서 교사 화면(세션 없이도 열려 있는
  // 기존 상태)에 방문자들의 체크인 대화가 그대로 노출된다. 방문자 데이터를 즉시 닫아야 하면 이걸 쓴다.
  if (process.env.DEMO_LOCKDOWN === "true") return lockdown(request);
  if (process.env.DEMO_MODE !== "true") return blockAnonymousWhenDemoOff(request);
  if (INIT_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) return NextResponse.next();

  return refreshSessionAndGate(request);
}

function deny(request: NextRequest, status: number, code: string, message: string) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });
  }
  return new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

function lockdown(request: NextRequest) {
  return deny(request, 503, "DEMO_LOCKDOWN", "지금은 점검 중이에요. 잠시 후 다시 시도해 주세요.");
}

/**
 * DEMO_MODE가 꺼져 있어도, 이미 발급된 익명(데모) 세션 쿠키를 들고 온 요청은 데이터 경로에서 막는다 —
 * 데모가 끝났는데 옛 방문자 세션이 계속 통한다면 안 된다. 세션 쿠키가 없거나 정식 로그인 사용자면 기존
 * 동작 그대로 통과(로컬 개발 흐름 유지). 인증 조회에 실패하면 이 경우에 한해 닫는다.
 */
async function blockAnonymousWhenDemoOff(request: NextRequest) {
  const hasSessionCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (!hasSessionCookie) return NextResponse.next();

  try {
    const supabase = createServerClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } },
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.is_anonymous) {
      return deny(request, 403, "DEMO_ENDED", "체험이 종료되었어요.");
    }
    return NextResponse.next();
  } catch {
    return deny(request, 503, "SESSION_CHECK_FAILED", "세션을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
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
  // /demo-init(브라우저)이 signInAnonymously()를 부르게 한다(계정 생성은 그쪽 책임).
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
    // 학생 섬 배치 조회·저장 — 방문자 세션 게이트(및 DEMO_LOCKDOWN/데모 종료 후 옛 세션 차단)를 다른 데이터 경로와 똑같이 적용한다.
    "/api/island/:path*",
  ],
};
