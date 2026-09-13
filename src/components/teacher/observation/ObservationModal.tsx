// 담당: 김현우
// 학생관찰일지 글쓰기 모달. @아이이름 태그(TagInput 재사용), 저장 후 수정 불가.
// 참고: docs/prototype/prototype-teacher.html #modal-obs

import Modal from "@/components/shared/Modal";
import TagInput from "@/components/shared/TagInput";

export default function ObservationModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      {/* TODO(김현우): 본문 textarea + <TagInput /> + 저장 버튼 */}
    </Modal>
  );
}
