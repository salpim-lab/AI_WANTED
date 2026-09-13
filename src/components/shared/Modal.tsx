// 담당: 김현우 (단독 소유)
// 관찰일지 글쓰기, 상담기록 글쓰기 모달에서 재사용
// 참고: docs/prototype/prototype-teacher.html .modal-overlay

export default function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={"modal-overlay" + (open ? " open" : "")}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-title">
          {title}
          <button className="modal-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
