// 담당: 김현우 (단독 소유) — 교사 화면 이름 표시 유틸

/** "김민준" → "민준" (성 빼고 부르기). 두 글자 이하 이름은 그대로 */
export function givenName(name: string): string {
  return name.length >= 3 ? name.slice(1) : name;
}
