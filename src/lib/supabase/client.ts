import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

/**
 * ⚠️ 브라우저 번들에서는 NEXT_PUBLIC_ 변수를 `process.env.NEXT_PUBLIC_이름` 형태로 **이름을 직접 써서** 참조해야
 * 빌드 때 값이 코드에 들어간다. `process.env[name]` 같은 동적 접근은 프로덕션 브라우저 번들에서 undefined가 된다
 * (개발 서버에서만 우연히 동작). 그래서 값은 아래처럼 정적으로 읽고, 검증 함수는 읽은 값만 받는다.
 * (2026-09-20 Vercel Preview에서 /demo-init이 "환경변수가 필요합니다"로 실패한 원인.)
 */
function requirePublicEnv(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  value: string | undefined,
) {
  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }

  return value;
}

/** 로그인 세션과 RLS가 적용되는 브라우저용 클라이언트. */
export function createClient() {
  return createBrowserClient<Database>(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  );
}
