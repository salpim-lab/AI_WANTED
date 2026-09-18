// 담당: 진승혜
// 참고: docs/planning/PLANNING.md "[교사 화면] 탭 1. 대시보드"
//
// 4개 영역 배치:
//   상단  아침 브리핑(8/12)       · 오늘의 교실(4/12)   ← 높이 동일
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
// 실데이터 연결 시에는 getDashboardSnapshot 자리를 lib/supabase/queries/*(date 인자) 호출로 바꾼다.
//
// ColorSummaryBar 는 "오늘의 교실" 카드가 같은 색 집계를 흡수하면서 대시보드에서 사용 중단 상태다.
// 컴포넌트 파일(ColorSummaryBar.tsx)은 지우지 않고 그대로 남겨둔다 — 다시 쓸 수 있게.
//
// 이 화면은 읽기 전용이다 (살핌_DB_스키마_v0.3.md §13): 어떤 원본 테이블에도 쓰지 않는다.

import "@/styles/prototype-teacher-dashboard.css";
import MorningBriefing from "@/components/teacher/dashboard/MorningBriefing";
import ClassroomToday from "@/components/teacher/dashboard/ClassroomToday";
import RelationshipMap from "@/components/teacher/dashboard/RelationshipMap";
import ConflictLog from "@/components/teacher/dashboard/ConflictLog";
import VocabGrowthChart from "@/components/teacher/dashboard/VocabGrowthChart";
import DateControl from "@/components/teacher/shared/DateControl";
import TimetableButton from "@/components/teacher/shared/TimetableButton";
import {
  dashboardMinDate,
  dashboardToday,
  getDashboardSnapshot,
  resolveDateKey,
} from "@/components/teacher/dashboard/mockData";

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { date } = await searchParams;
  const dateKey = resolveDateKey(date);
  const data = getDashboardSnapshot(dateKey);
  const { isToday } = data;

  return (
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
        <div className="col-8">
          <MorningBriefing watch={data.briefing.watch} isToday={isToday} />
        </div>
        <div className="col-4">
          <ClassroomToday
            classroom={data.classroom}
            participation={data.participation}
            isToday={isToday}
          />
        </div>

        <section className="card col-12 relation-conflict">
          <div className="card-title">
            우리 반 관계
            <span className="card-sub">발화·기록에서 본 아이들 사이</span>
          </div>
          <div className="relation-conflict-body">
            <RelationshipMap nodes={data.relation.nodes} edges={data.relation.edges} />
            <ConflictLog rows={data.conflicts} />
          </div>
        </section>

        <div className="col-12">
          <VocabGrowthChart students={data.vocab.students} trend={data.vocab.trend} />
        </div>
      </div>
    </div>
  );
}
