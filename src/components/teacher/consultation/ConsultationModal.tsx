// 담당: 김현우
// 학부모상담기록 글쓰기 모달. 아이 이름 클릭 시 <DataExportBox /> 로 상담 자료 노출.
// 참고: docs/prototype/prototype-teacher.html #modal-consult

import Modal from "@/components/shared/Modal";
import DataExportBox from "./DataExportBox";

export default function ConsultationModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      {/* TODO(김현우): 아이 선택 → <DataExportBox studentId={...} /> + 상담 내용 textarea */}
    </Modal>
  );
}
