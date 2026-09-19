// 담당: 진승혜 (단독 소유)
// "오늘의 교실" 카드 안 참여 인원 줄 — 학급 단위 읽기 전용 집계.
// (단독 카드였던 전체 참여도는 뺐다. 같은 날의 같은 체크인 집계라 교실 카드 안으로 들어갔다.)
//
// 집계 기준: 해당 날짜의 checkin_sessions 중 status = 'completed' 인 세션을 가진
//            enrollment 수 / 그 반의 활성 enrollment 수.
// 대시보드는 읽기 전용이다 (살핌_DB_스키마_v0.3.md §13) — insert/update/delete 금지.
//
// UI/URL 에는 student_id 만 노출한다. enrollment_id 는 이 repository 안에서만 쓰고
// 바깥으로 내보내지 않는다.
//
// 반환 타입은 components/teacher/dashboard/mockData.ts 의 ParticipationSummary 와 같은 모양이라,
// 아래 TODO 를 구현하고 getDashboardSnapshot 안의 조립만 바꾸면 실데이터로 교체된다.

export type ParticipationSummary = {
  /** YYYY-MM-DD */
  date: string;
  /** 해당 날짜에 체크인을 완료한 학생 수 */
  completedCount: number;
  /** 반 전체 학생 수 */
  totalCount: number;
  /** 그날 체크인을 완료하지 않은 아이 (이름을 눌러 아이 상세로 간다) */
  absentStudents: { studentId: string | number; name: string }[];
};

// TODO(진승혜): getParticipationSummary(classId: string, date: string): Promise<ParticipationSummary>
//   supabase.from("checkin_sessions").select(...).eq("status", "completed") 기반 집계.
//   date 는 대시보드에서 선택한 날짜(YYYY-MM-DD).
