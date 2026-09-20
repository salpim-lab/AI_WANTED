// 대시보드는 DB에서 명단·체크인·분석·갈등 기록을 모아 조립한 뒤에야 그려진다.
// 그동안 이전 화면이 멈춘 채로 남지 않게, 메뉴를 누르는 즉시 이 뼈대를 먼저 보여준다 (page.tsx와 같은 배치).
// 데이터에 의존하지 않는 가벼운 서버 컴포넌트다 — 여기서 DB를 읽지 않는다.

import "@/styles/prototype-teacher-dashboard.css";
import "@/styles/dashboard-tone.css";
import SalpimBackdrop from "@/components/shared/SalpimBackdrop";

function Block({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-2xl bg-slate-200/70 ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <SalpimBackdrop>
      <div className="page-dashboard" role="status" aria-live="polite" aria-busy="true">
        <header className="dashboard-head">
          <div>
            <h1 className="dashboard-title">대시보드</h1>
            <p className="dashboard-caption">우리 반 기록을 불러오고 있어요</p>
          </div>
        </header>

        <div className="dashboard-grid">
          <div className="col-4">
            <div className="card">
              <Block className="mb-4 h-6 w-32" />
              <Block className="mb-3 h-24 w-full" />
              <Block className="h-16 w-full" />
            </div>
          </div>
          <div className="col-8">
            <div className="card">
              <Block className="mb-4 h-6 w-40" />
              <Block className="mb-3 h-16 w-full" />
              <Block className="h-16 w-full" />
            </div>
          </div>
          <div className="col-12">
            <div className="card">
              <Block className="mb-4 h-6 w-36" />
              <Block className="h-64 w-full" />
            </div>
          </div>
          <div className="col-12">
            <div className="card">
              <Block className="mb-4 h-6 w-36" />
              <Block className="h-40 w-full" />
            </div>
          </div>
        </div>
      </div>
    </SalpimBackdrop>
  );
}
