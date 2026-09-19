// 담당: 김현우 (단독 소유)
// 학생 이름 목록을 가나다 순으로 — 학생 드롭다운·@태그 후보가 같이 쓴다. 원본 배열은 건드리지 않는다.
// (명단 원본 순서는 자리 순이라, 이름으로 찾는 목록에서만 이 정렬을 쓴다)

export function sortByKoreanName<T>(items: readonly T[], nameOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => nameOf(a).localeCompare(nameOf(b), "ko"));
}
