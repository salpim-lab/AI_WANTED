// 담당: 김현우
// 아이 상세 탭 공통 레이아웃 — 자리 배치도를 여기서 한 번만 그린다.
//   /students        : 자리 배치도가 전체 폭
//   /students/[id]   : 자리 배치도가 왼쪽으로 작게 밀리고, 오른쪽에 그 아이 상세(page)가 열린다
// 레이아웃은 탭 안에서 이동해도 다시 마운트되지 않으므로 배치도가 유지되고 폭 전환 애니메이션이 이어진다.
// 단, 레이아웃은 이동할 때 다시 렌더되지 않으므로 배치도의 "오늘 색"은 이 탭에 들어온 시점 기준이다.
// 자리 바꾸기를 저장하면 Server Action이 revalidatePath("/students", "layout")로 이 레이아웃을 다시 그린다.

import { connection } from "next/server";
import StudentsSplitView from "@/components/teacher/students/StudentsSplitView";
import { todayKst } from "@/components/shared/datetime";
import { getSeatingChart } from "@/lib/supabase/queries/teacherStudents";
import { getActingTeacher } from "@/lib/supabase/raw/_mockTeacherData";
import { getSeatLayout } from "@/lib/supabase/raw/seatLayout";

export default async function StudentsLayout({ children }: LayoutProps<"/students">) {
  // "오늘" 색은 요청 시각 기준이어야 한다 — 빌드 시점 날짜로 굳지 않게 요청 시 렌더링
  await connection();
  const teacher = await getActingTeacher();
  const today = todayKst();
  const [seats, { rows, cols }] = await Promise.all([
    getSeatingChart(teacher.classId, today),
    getSeatLayout(teacher.classId),
  ]);

  return (
    <StudentsSplitView seats={seats} grid={{ rows, cols }} date={today}>
      {children}
    </StudentsSplitView>
  );
}
