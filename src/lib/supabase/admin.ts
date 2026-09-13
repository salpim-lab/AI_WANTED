import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

function requireAdminEnv(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY",
) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }

  return value;
}

/**
 * 검증을 끝낸 API Route의 쓰기 전용 클라이언트.
 * service_role은 RLS를 우회하므로 사용자·학급·동의 검증 뒤에만 사용한다.
 */
export function createAdminClient() {
  return createClient<Database>(
    requireAdminEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireAdminEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
