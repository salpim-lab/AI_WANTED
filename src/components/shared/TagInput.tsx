// 공용 — 글쓰기 시 "@아이이름" 태그 입력 (학생관찰일지, 학부모상담기록에서 사용)
// 참고: docs/prototype/prototype-teacher.html #obs-tag-input

export default function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  return <div>{/* TODO: 태그 칩 + 입력창 */}</div>;
}
