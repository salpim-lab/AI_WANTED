// 담당: 김현우
// 학부모 상담 근거 자료 리포트 인쇄용 페이지 — Server Component. 본문은 ConsultationReportBody(누적 자료 팝업과 공유).
// 표현의 선(기획안 9·10장): 진단·점수·위험도·판정 표현을 쓰지 않는다. 원본을 있는 그대로 모아 보여준다.
// 상담 직전에 훑어보고 쓸 내용만 고르는 화면이라, 과거 신호등 색은 요약만 보여주고(길게 나열하지 않음)
// 관찰일지 태그 기록처럼 정리된 내용만 보여준다. 등하교 대화 전문은 길고 상담 준비에 바로 쓰기 어렵다는
// 피드백으로 리포트에서 뺐다 — 전문이 필요하면 아이 상세 탭에서 그날 대화를 볼 수 있다. "선생님이 남긴
// 코멘트" 섹션도 뺐다 — 실제 저장 라우트가 없어 예시 데이터만 보여주던 상태였다.
// 항목별 체크박스로 인쇄 대상을 고르던 기능도 같은 이유로 없앴다 — 이제 보이는 내용이 곧 인쇄 내용이다.
// 인쇄 시 교사 화면 헤더·탭바·챗봇 위젯은 이 페이지에만 들어가는 print 스타일로 숨긴다
// (공용 layout/CSS 파일은 건드리지 않는다).

import Form from "next/form";
import NavLink from "@/components/shared/NavLink";
import { backButton, card, pageContainer, textInput } from "@/components/shared/ui";
import type { ConsultationReport } from "@/lib/types/teacherRecord";
import ConsultationReportBody from "./ConsultationReportBody";
import PrintButton from "./PrintButton";

const PRINT_STYLES = `
@media print {
  @page { size: A4; margin: 14mm; }
  .teacher-app { background: #fff !important; min-height: 0 !important; }
  .teacher-app .app-header,
  .teacher-app .side-nav,
  .teacher-app > div:not(.app) { display: none !important; }
  /* 브라우저는 인쇄할 때 배경색을 기본으로 빼서 감정 어휘 막대(배경색으로 그림)가 사라진다 — 리포트 안은 색을 그대로 찍는다 */
  .consultation-report, .consultation-report * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

export default function ConsultationReportView({ report }: { report: ConsultationReport }) {
  return (
    <div className={`${pageContainer} print:max-w-none print:p-0`}>
      <style>{PRINT_STYLES}</style>

      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <NavLink href="/consultation" className={backButton}>
          ← 학부모상담기록
        </NavLink>
        <Form
          action={`/consultation/report/${report.student.studentId}`}
          aria-label="기간"
          className="ml-auto flex flex-wrap items-center gap-1.5"
        >
          <input type="date" name="from" defaultValue={report.from} aria-label="시작 날짜" className={textInput} />
          <span className="text-xs text-[#aab0c4]">~</span>
          <input type="date" name="to" defaultValue={report.to} aria-label="끝 날짜" className={textInput} />
          <button type="submit" className="btn btn-primary btn-sm">
            적용
          </button>
        </Form>
        <PrintButton />
      </div>

      <ConsultationReportBody report={report} className={`${card} p-6 print:rounded-none print:shadow-none`} />
    </div>
  );
}
