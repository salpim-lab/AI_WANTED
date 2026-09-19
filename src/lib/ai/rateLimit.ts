// 담당: 이지현 (신규)
// 공개 데모(Vercel) AI 호출 비용 제한 — 방문자(auth.uid())당/IP당 시간창 안 호출 횟수를
// DB(원자적 Postgres 함수)로 센다. Vercel 서버리스는 인스턴스마다 메모리가 따로라 메모리
// 카운터로는 막을 수 없다(계획 문서 cozy-mixing-scone.md F항 참고).
// 마이그레이션: supabase/migrations/20260919184555_1091_ai_rate_limits.sql

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitOptions = {
  /** 시간창 길이(초) */
  windowSeconds: number;
  /** 그 시간창 안 허용 최대 호출 수 */
  maxCalls: number;
};

export class RateLimitCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitCheckError";
  }
}

/**
 * subject(보통 방문자 auth.uid(), 없으면 IP 등 호출부가 정한 문자열) 기준으로 호출 횟수를
 * 원자적으로 늘리고, 한도 이내면 true를 돌려준다.
 *
 * (2026-09-20 수정) 처음엔 DB 호출 자체가 실패하면(마이그레이션 미적용 등) 통과시켰는데 —
 * "AI 호출은 막되 재시도 가능한 오류로 처리하라"는 요구로 바꿨다. 이 함수는 이제 실패를
 * 삼키지 않고 RateLimitCheckError를 던진다 — 호출부(route.ts)가 그걸 잡아 502로 응답한다.
 * DB가 죽었을 때 "호출은 계속 통과시키되 카운트만 안 됨(사실상 무제한)"보다는, AI 호출
 * 자체를 멈추는 쪽이 비용 통제 목적에 맞다.
 */
export async function checkAndIncrementRateLimit(subject: string, options: RateLimitOptions): Promise<boolean> {
  let result: { data: unknown; error: { message: string } | null };
  try {
    const admin = createAdminClient();
    result = await admin.rpc("increment_ai_rate_limit", {
      p_subject: subject,
      p_window_seconds: options.windowSeconds,
      p_max_calls: options.maxCalls,
    });
  } catch (error) {
    throw new RateLimitCheckError(
      `호출 제한 확인 중 오류: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (result.error) {
    throw new RateLimitCheckError(`호출 제한 확인 중 오류: ${result.error.message}`);
  }
  return Boolean(result.data);
}
