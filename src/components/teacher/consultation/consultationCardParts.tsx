// 담당: 김현우
// 학부모상담기록 카드(예정·완료)가 같이 쓰는 표시 조각 — 방식 이름, 학생/학부모 상담 구분, ↗ 아이콘.
// 두 카드의 머리 모양(이름 + "학생/학부모 상담", 그 아래 "대상 - 방식")을 대시보드 아침 브리핑과 맞춘다.

export const METHOD_LABEL = { phone: "전화", visit: "방문", online: "온라인" } as const;

/** 대시보드 아침 브리핑과 같은 구분 — 상담 대상이 "학생 본인"이면 학생 상담 */
export function isStudentSelfConsultation(counterpart: string): boolean {
  return counterpart.trim() === "학생 본인";
}

export function consultationKindLabel(counterpart: string): string {
  return isStudentSelfConsultation(counterpart) ? "학생 상담" : "학부모 상담";
}

/**
 * 완료한 상담의 제목("어머니 - 방문 상담", 2026-09-19 이전 기록은 "어머니 · 방문 상담")에서
 * 대상과 "대상 - 방식" 한 줄을 읽는다. 완료한 상담은 대상·방식이 제목에만 확실히 남아 있다.
 */
export function parseConsultationTitle(title: string): { counterpart: string; line: string } {
  const withoutSuffix = title.trim().replace(/\s*상담$/, "");
  const [counterpart, ...rest] = withoutSuffix.split(/\s+[-·]\s+/);
  return { counterpart, line: [counterpart, ...rest].join(" - ") };
}

export function ArrowUpRightIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="ml-auto size-4 shrink-0 text-[#cbc5b9] transition-colors group-hover:text-[#7d849b]"
    >
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  );
}
