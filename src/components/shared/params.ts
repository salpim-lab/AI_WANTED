// 담당: 김현우 (단독 소유) — 페이지 searchParams 파싱 유틸 (Server Component 페이지에서 사용)

import { isDateString } from "./datetime";

type SearchParamValue = string | string[] | undefined;

/** 첫 번째 값만, 공백 제거 후 비어 있으면 undefined */
export function firstParam(value: SearchParamValue): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/** "YYYY-MM-DD" 형식의 유효한 날짜만 통과 */
export function dateParam(value: SearchParamValue): string | undefined {
  const raw = firstParam(value);
  return raw && isDateString(raw) ? raw : undefined;
}
