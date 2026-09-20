// 담당: 진승혜
// 참고: docs/planning/PLANNING.md "[교사 화면] 탭 1. 대시보드"
//
// 4개 영역 배치:
//   상단  오늘의 교실(4/12)       · 아침 브리핑(8/12)   ← 높이 동일
//   중단  관계 지도 + 갈등 기록(전폭)
//   하단  감정 어휘 성장(전폭)
//
// 패턴 경고는 뺐다 — 브리핑과 축이 겹치지 않게 정리하고 나니 남는 게 적었고,
// 규칙 기반 판정을 제대로 만들기 전에는 카드 한 칸을 차지할 값이 없었다.
// 전체 참여도는 단독 카드에서 "오늘의 교실" 안 작은 줄로 옮겼다 (같은 날의 같은 집계라서).
//
// 날짜 상태는 URL 쿼리(?date=YYYY-MM-DD)가 단일 출처다.
// 이 서버 컴포넌트가 쿼리를 읽어 그 날짜의 데이터 한 벌을 조립하고 각 카드에 props 로 내려준다.
// → 카드들은 전부 서버 컴포넌트로 남고, 클라이언트 컴포넌트는 날짜 선택 컨트롤 하나뿐이다.
// 데이터는 lib/supabase/queries/dashboardSnapshot.ts에서 실제 학급 명단과 체크인 기록으로 조립한다.
//
// ColorSummaryBar 는 "오늘의 교실" 카드가 같은 색 집계를 흡수하면서 대시보드에서 사용 중단 상태다.
// 컴포넌트 파일(ColorSummaryBar.tsx)은 지우지 않고 그대로 남겨둔다 — 다시 쓸 수 있게.
//
// 이 화면은 읽기 전용이다 (살핌_DB_스키마_v0.3.md §13): 어떤 원본 테이블에도 쓰지 않는다.

import "@/styles/prototype-teacher-dashboard.css";
// 색·모서리·그림자는 여기가 덮어쓴다. 배치·크기는 위 파일이 그대로 정한다.
import "@/styles/dashboard-tone.css";
import MorningBriefing from "@/components/teacher/dashboard/MorningBriefing";
import ClassroomToday from "@/components/teacher/dashboard/ClassroomToday";
import RelationBoard from "@/components/teacher/dashboard/RelationBoard";
import VocabGrowthChart from "@/components/teacher/dashboard/VocabGrowthChart";
import DateControl from "@/components/teacher/shared/DateControl";
// 배경: 아이 상세·업무기록·학부모상담과 같은 교실 일러스트 (2026-09-18 김현우 추가 — 진승혜 님과 PR 협의)
import SalpimBackdrop from "@/components/shared/SalpimBackdrop";
import TimetableButton from "@/components/teacher/shared/TimetableButton";
import {
  dashboardMinDate,
  dashboardToday,
  getDashboardDataFromSupabase,
  resolveDashboardDate,
} from "@/lib/supabase/queries/dashboardSnapshot";
// 아침 브리핑의 "그날 예정된 상담" — 김현우 담당 상담 데이터(읽기만)
import { getActingTeacher } from "@/lib/supabase/raw/_mockTeacherData";
import { listScheduledConsultationsOn } from "@/lib/supabase/raw/consultationLog";

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { date } = await searchParams;
  const dateKey = resolveDashboardDate(date);
  const teacher = await getActingTeacher();
  // 대시보드 데이터와 그날 예정 상담은 서로 무관하다 — 차례로 기다리지 않고 동시에 읽는다
  const [data, consultations] = await Promise.all([
    getDashboardDataFromSupabase(teacher.classId, dateKey),
    listScheduledConsultationsOn(teacher.classId, dateKey),
  ]);
  const { isToday } = data;

  return (
    <SalpimBackdrop>
      <div className="page-dashboard">
        <header className="dashboard-head">
          <div>
            <h1 className="dashboard-title">대시보드</h1>
            <p className="dashboard-caption">
              {isToday ? "오늘 우리 반은 어떤가요?" : "지난 기록을 보고 있어요"}
            </p>
          </div>
          <div className="dashboard-head-controls">
            <DateControl
              dateKey={dateKey}
              today={dashboardToday()}
              basePath="/dashboard"
              minDate={dashboardMinDate()}
              maxDate={dashboardToday()}
              label="대시보드 날짜 선택"
            />
            <TimetableButton dateKey={dateKey} />
          </div>
        </header>

        <div className="dashboard-grid">
          {/* 교실(환경)을 먼저 보고 아이(개별)로 넘어가는 순서. 폭은 그대로 4 · 8 이다. */}
          <div className="col-4">
            <ClassroomToday
              classroom={data.classroom}
              participation={data.participation}
              isToday={isToday}
            />
          </div>
          <div className="col-8">
            <MorningBriefing watch={data.briefing.watch} consultations={consultations} isToday={isToday} />
          </div>

          {/* 갈등 기록은 카드 안 기간 토글을 따라간다 (relation[period].conflicts) */}
          <RelationBoard relation={data.relation} />

          <div className="col-12">
            <VocabGrowthChart students={data.vocab.students} trend={data.vocab.trend} />
          </div>
        </div>
      </div>
    </SalpimBackdrop>
  );
}
