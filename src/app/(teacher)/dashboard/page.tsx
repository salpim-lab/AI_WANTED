// 담당: 진승혜
// 참고: docs/planning/PLANNING.md "[교사 화면] 탭 1. 대시보드"
// 섹션 순서: 아침 브리핑 → 관계 지도 → 갈등 기록 → 패턴 경고 → 오늘의 교실 → 감정 어휘 성장

import "@/styles/prototype-teacher-dashboard.css";
import ColorSummaryBar from "@/components/teacher/dashboard/ColorSummaryBar";
import MorningBriefing from "@/components/teacher/dashboard/MorningBriefing";
import RelationshipMap from "@/components/teacher/dashboard/RelationshipMap";
import ConflictLog from "@/components/teacher/dashboard/ConflictLog";
import PatternAlert from "@/components/teacher/dashboard/PatternAlert";
import ClassroomToday from "@/components/teacher/dashboard/ClassroomToday";
import VocabGrowthChart from "@/components/teacher/dashboard/VocabGrowthChart";

export default function DashboardPage() {
  return (
    <div className="page-dashboard">
      <ColorSummaryBar />
      <MorningBriefing />
      <RelationshipMap />
      <ConflictLog />
      <PatternAlert />
      <ClassroomToday />
      <VocabGrowthChart />
    </div>
  );
}
