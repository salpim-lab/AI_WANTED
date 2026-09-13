// 담당: 김현우 (단독 소유)
// 관찰일지 글쓰기, 상담기록 글쓰기 모달에서 재사용
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
