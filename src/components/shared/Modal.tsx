// 공용 모달 — 관찰일지 글쓰기, 상담기록 글쓰기 등에서 재사용
// 참고: docs/prototype/prototype-teacher.html .modal-overlay

export default function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  if (!open) return null;
  return <div role="dialog">{children}</div>;
}
