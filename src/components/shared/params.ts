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

/**
 * 주소의 ?date=가 못 쓰는 값(형식 오류·빈 값·오늘보다 뒤)이면 그 날짜만 뺀 주소를 돌려준다 — 페이지가 redirect()로
 * 주소창까지 바로잡는 데 쓴다. 다른 쿼리(q, student, type …)는 그대로 둔다. 괜찮은 날짜이거나 ?date=가 없으면 null.
 * 달력은 이미 오늘까지만 고르게 막아 두었으니, 이건 주소를 손으로 고쳐 쓴 경우를 위한 것이다.
 */
export function invalidDateRedirect(
  basePath: string,
  params: Record<string, SearchParamValue>,
  today: string,
): string | null {
  const raw = params.date;
  if (raw === undefined) return null;
  const date = dateParam(raw);
  if (date && date <= today) return null;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "date" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  const queryString = query.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}
