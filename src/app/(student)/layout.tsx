// 담당: 이유민 (섬 제외 학생 화면 전체)
// 학생 화면 공통 레이아웃 — 가로형 태블릿 4:3 스테이지.
//
// 목업의 기준 화면이 4:3 landscape 이므로, 스테이지를 4:3 으로 고정하고
// 그 안에서 컨테이너 쿼리 단위로 크기를 잡는다. 화면이 커지거나 작아져도
// 구도가 통째로 스케일되어 요소가 따로 움직이지 않는다.
//
// 공용 prototype-student-shared.css 는 강윤지님 섬 화면과 공유하므로 유지하되,
// 홈 화면 스타일은 student-home.css 에 따로 둔다.
import "@/styles/prototype-student-shared.css";
import "@/styles/student-home.css";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="tablet-stage-fit">
      <div className="tablet-bezel">
        <div className="tablet-stage">{children}</div>
      </div>
    </div>
  );
}
