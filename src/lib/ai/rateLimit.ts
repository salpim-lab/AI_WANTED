// 담당: 이지현 (신규)
// 공개 데모(Vercel) AI 호출 비용 제한 — 방문자(auth.uid())당/IP당 시간창 안 호출 횟수를
// DB(원자적 Postgres 함수)로 센다. Vercel 서버리스는 인스턴스마다 메모리가 따로라 메모리
// 카운터로는 막을 수 없다(계획 문서 cozy-mixing-scone.md F항 참고).
// 마이그레이션: supabase/migrations/20260920020400_1091_ai_rate_limits.sql

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitOptions = {
  /** 시간창 길이(초) */
  windowSeconds: number;
  /** 그 시간창 안 허용 최대 호출 수 */
  maxCalls: number;
};

/**
 * subject(보통 방문자 auth.uid(), 없으면 IP 등 호출부가 정한 문자열) 기준으로 호출 횟수를
 * 원자적으로 늘리고, 한도 이내면 true를 돌려준다. DB 호출 자체가 실패하면(마이그레이션이
 * 아직 안 붙었거나 네트워크 문제 등) 데모가 완전히 막히는 것보다 통과시키는 쪽이 안전하다고
 * 보고 true를 반환한다 — console.warn으로 남긴다.
 */
export async function checkAndIncrementRateLimit(subject: string, options: RateLimitOptions): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("increment_ai_rate_limit", {
      p_subject: subject,
      p_window_seconds: options.windowSeconds,
      p_max_calls: options.maxCalls,
    });
    if (error) {
      console.warn("[rateLimit] increment_ai_rate_limit 호출 실패, 통과시킵니다:", error.message);
      return true;
    }
    return Boolean(data);
  } catch (error) {
    console.warn("[rateLimit] 예외 발생, 통과시킵니다:", error instanceof Error ? error.message : error);
    return true;
  }
}
