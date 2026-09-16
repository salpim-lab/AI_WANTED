// 담당: 없음(공용 헤더 조각) — (teacher)/layout.tsx 와 같은 성격의 파일이다.
// 헤더 오른쪽의 "오늘 날짜" 한 조각만 담당한다.
//
// 왜 클라이언트 컴포넌트인가:
//   layout 에서 new Date() 를 읽으면 그 값이 빌드 시각에 고정되고, 이를 피하려면
//   layout 전체를 요청 시점 렌더링으로 바꿔야 한다 → 교사 화면 4개가 전부 Dynamic 이 된다.
//   날짜 한 줄 때문에 그 영향을 감수할 이유가 없어서, 이 조각만 브라우저에서 그린다.
//
// hydration mismatch 방지:
//   useSyncExternalStore 의 서버 스냅샷을 빈 문자열로 둔다. 프리렌더된 HTML 과
//   클라이언트 첫 렌더가 모두 빈 문자열이라 어긋날 일이 없고, hydration 이 끝난 뒤
//   클라이언트 스냅샷(실제 오늘 날짜)으로 교체된다.
//   하루가 지나면 새로고침 시 당일 날짜가 나오므로 setInterval 은 필요 없다.

"use client";

import { useSyncExternalStore } from "react";

// 포매터는 렌더마다 새로 만들지 않도록 모듈 스코프에 한 번만 둔다.
const SEOUL_DATE_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

/** "2026년 9월 16일 (수)" */
function formatSeoulDate(now: Date) {
  const parts = Object.fromEntries(
    SEOUL_DATE_FORMAT.formatToParts(now).map((p) => [p.type, p.value]),
  );
  return `${parts.year}년 ${parts.month}월 ${parts.day}일 (${parts.weekday})`;
}

// 구독할 외부 변화가 없다(새로고침 때만 갱신되면 충분). 구독 해제도 할 일이 없다.
const subscribe = () => () => {};

// 같은 날 안에서는 항상 같은 문자열이라 스냅샷이 안정적이다.
const getSnapshot = () => formatSeoulDate(new Date());
const getServerSnapshot = () => "";

export default function CurrentDate() {
  const today = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // 헤더 마크업을 바꾸지 않도록 텍스트 노드만 돌려준다.
  return <>{today}</>;
}
