// 담당: 이지현 (제안 — 공개 데모 방문자 격리의 "조회 범위" 단일 출처)
//
// service_role(admin 클라이언트)로 읽는 앱 경로는 RLS가 안 막는다(docs/데모_방문자_격리_적용_절차.md §-1).
// 그래서 체크인·분석·상담 신청처럼 방문자별로 갈리는 데이터를 읽는 서버 코드는 전부 이 스코프를 거친다:
//   "공용으로 확인된 데이터(demo_owner_id IS NULL) + 현재 방문자가 소유한 데이터"만 조회·집계·AI 입력에 쓴다.
//
// 규칙
//  - DEMO_MODE가 아니면 스코프를 걸지 않는다(기존 동작 그대로 — 실 서비스/로컬 개발).
//  - DEMO_MODE인데 현재 방문자를 못 찾으면 공용(NULL)만 본다(fail-closed) — 절대 "전부"로 열리지 않는다.
//  - 현재 방문자는 이 파일이 요청 쿠키의 Supabase 세션에서 직접 읽는다(호출부가 id를 넘기는 방식이 아니라서
//    "인자를 빠뜨려 필터가 생략되는" 일이 없다). 같은 요청 안에서는 한 번만 조회한다(React cache).
import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isDemoModeEnabled = () => process.env.DEMO_MODE === "true";

export type DemoScope = { active: false } | { active: true; viewerId: string | null };

/** 현재 요청의 조회 범위. 요청당 한 번만 Supabase Auth를 부른다. */
export const getDemoScope = cache(async (): Promise<DemoScope> => {
  if (!isDemoModeEnabled()) return { active: false };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { active: true, viewerId: user && UUID_RE.test(user.id) ? user.id : null };
  } catch {
    // 세션을 못 읽으면 공용만 — 열어주는 쪽으로 실패하지 않는다.
    return { active: true, viewerId: null };
  }
});

/**
 * PostgREST `.or()` 필터 — `demo_owner_id` 컬럼이 있는 테이블(checkin_sessions, analysis_runs)용.
 * 스코프가 꺼져 있으면 null(필터 없음).
 */
export function ownerOrFilter(scope: DemoScope): string | null {
  if (!scope.active) return null;
  return scope.viewerId ? `demo_owner_id.is.null,demo_owner_id.eq.${scope.viewerId}` : "demo_owner_id.is.null";
}

/** 새 행에 기록할 소유자 값 — DEMO_MODE의 방문자 id, 아니면 null(스코프 없음). */
export function ownerToStore(scope: DemoScope): string | null {
  return scope.active ? scope.viewerId : null;
}

/**
 * 서버 메모리(globalThis) 목업 저장소의 키에 방문자를 붙인다 — 저장소 자체는 전역이라 키에 방문자가 없으면
 * 한 방문자가 저장한 값(자리 배치 등)이 다른 방문자에게 그대로 보인다. 방문자를 못 찾으면 "공용" 키.
 */
export function scopedKey(scope: DemoScope, base: string): string {
  return scope.active ? `${base}|${scope.viewerId ?? "public"}` : base;
}

/** 이미 읽어온 행의 소유자 값이 이 스코프에서 보여도 되는가 (JS 후처리용). */
export function ownerVisible(scope: DemoScope, ownerId: string | null | undefined): boolean {
  if (!scope.active) return true;
  return ownerId == null || ownerId === scope.viewerId;
}

/**
 * work_records의 "검증된 공용 시드" 판별 — 담임이 썼다는 사실만으로 공용으로 보지 않는다.
 * 2026-09-20 조사: 시드 스크립트가 만든 46건 중 38건은 고정(결정적) UUID('…-0000-4000-8000-…'), 나머지 8건
 * (record_type='conflict', 9/19 16:18~16:19, 제목 4개가 2번씩 중복 생성)은 랜덤 UUID라 시드로 확인되지 않았다.
 * 시드로 확인되면 여기(그리고 1093 마이그레이션의 같은 규칙)에 id를 명시적으로 추가한다.
 */
const VERIFIED_SEED_RECORD_ID = /^[0-9a-f]{8}-0000-4000-8000-[0-9a-f]{12}$/i;
export const isVerifiedSeedRecordId = (id: string) => VERIFIED_SEED_RECORD_ID.test(id);

/** 작성자 기준 가시성: 내가 쓴 것이거나, (담임이 썼고 AND 시드로 확인된 것). */
export function recordVisible(
  scope: DemoScope,
  row: { id: string; created_by: string },
  homeroomId: string,
): boolean {
  if (!scope.active) return true;
  if (scope.viewerId && row.created_by === scope.viewerId) return true;
  return row.created_by === homeroomId && isVerifiedSeedRecordId(row.id);
}
