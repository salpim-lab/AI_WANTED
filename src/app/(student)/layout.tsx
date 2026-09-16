// 담당: 이유민 (섬 제외 학생 화면 전체)
// 학생 화면 공통 레이아웃 — 가로형 태블릿 스테이지 (16:10).
//
// 디벗은 단일 기종이 아니다 (아이패드 9세대 1.333 / 갤럭시탭 S7 FE 1.60 /
// 노트북형 약 1.78). 어떤 비율로 고정해도 나머지 기기에서 띠가 생기므로,
// 주력 기종인 갤럭시탭 기준 16:10 으로 잡고 얇은 태블릿 테두리를 그린다.
// 스테이지 안에서는 컨테이너 쿼리 단위로만 크기를 잡아, 화면이 커지거나
// 작아져도 구도가 통째로 스케일되고 요소가 따로 움직이지 않는다.
//
// ⚠️ 이 레이아웃은 강윤지님의 섬 화면(IslandBoard, checkin/checkout 5단계)도
//    감싼다. 여기를 바꾸면 섬 화면의 크기·비율도 함께 바뀐다.
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
