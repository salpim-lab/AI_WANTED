// 담당: 김현우
// 참고: docs/planning/PLANNING.md "[교사 화면] 탭 3. 학생관찰일지"
// 게시판형, 글쓰기만 가능(수정 불가, 무결성), 서버 타임스탬프, @아이이름 태그, 키워드/날짜/아이이름 검색

import "@/styles/prototype-teacher-board.css";
import ObservationBoard from "@/components/teacher/observation/ObservationBoard";

export default function ObservationPage() {
  return <ObservationBoard />;
}
