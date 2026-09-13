import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

function requirePublicEnv(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }

  return value;
}

/** 로그인 세션과 RLS가 적용되는 브라우저용 클라이언트. */
export function createClient() {
  return createBrowserClient<Database>(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  );
}
