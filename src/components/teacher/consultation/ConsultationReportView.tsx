// 담당: 김현우
// 학부모 상담 근거 자료 리포트 본문 — Server Component, 인쇄 친화 레이아웃.
// 표현의 선(기획안 9·10장): 진단·점수·위험도·판정 표현을 쓰지 않는다. 원본을 있는 그대로 모아 보여준다.
// 상담 직전에 훑어보고 쓸 내용만 고르는 화면이라, 과거 신호등 색은 요약만 보여주고(길게 나열하지 않음)
// 관찰일지 태그 기록처럼 정리된 내용만 보여준다. 등하교 대화 전문은 길고 상담 준비에 바로 쓰기 어렵다는
// 피드백으로 리포트에서 뺐다 — 전문이 필요하면 아이 상세 탭에서 그날 대화를 볼 수 있다. "선생님이 남긴
// 코멘트" 섹션도 뺐다 — 실제 저장 라우트가 없어 예시 데이터만 보여주던 상태였다.
// 항목별 체크박스로 인쇄 대상을 고르던 기능도 같은 이유로 없앴다 — 이제 보이는 내용이 곧 인쇄 내용이다.
// 인쇄 시 교사 화면 헤더·탭바·챗봇 위젯은 이 페이지에만 들어가는 print 스타일로 숨긴다
// (공용 layout/CSS 파일은 건드리지 않는다).

import Form from "next/form";
import Link from "next/link";
import { daysBetween, formatKstDate, formatKstDateTime, toKstDate } from "@/components/shared/datetime";
import { backButton, card, pageContainer, textInput, timestampText } from "@/components/shared/ui";
import type { ConsultationReport, RelationInsight, VocabInsight } from "@/lib/types/teacherRecord";
import PrintButton from "./PrintButton";
import ReportAiSummary from "./ReportAiSummary";

const PRINT_STYLES = `
@media print {
  @page { size: A4; margin: 14mm; }
  .teacher-app { background: #fff !important; min-height: 0 !important; }
  .teacher-app .app-header,
  .teacher-app .side-nav,
  .teacher-app > div:not(.app) { display: none !important; }
}
`;

export default function ConsultationReportView({ report }: { report: ConsultationReport }) {
  const generatedAt = new Date().toISOString();
  const dayCount = daysBetween(report.from, report.to) + 1;

  return (
    <div className={`${pageContainer} print:max-w-none print:p-0`}>
      <style>{PRINT_STYLES}</style>

      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/consultation" className={backButton}>
          ← 학부모상담기록
        </Link>
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

      <article className={`${card} p-6 print:rounded-none print:shadow-none`}>
        <header className="mb-6 border-b border-[#e6e2fb] pb-4">
          <h1 className="font-[family-name:var(--font-cute)] text-[26px] font-normal text-[#102a56]">{report.student.name} 상담 자료</h1>
          <p className="mt-1 text-[13px] text-[#33405f]">
            기간 {formatKstDate(report.from)} ~ {formatKstDate(report.to)} ({dayCount}일)
          </p>
          <p className={`${timestampText} mt-1`}>생성 {formatKstDateTime(generatedAt)} (서버 시각 기준)</p>
        </header>

        <ReportSection title="1. 감정 어휘 · 관계 (오늘 기준)">
          <div className="grid gap-3 sm:grid-cols-2">
            <VocabInsightPanel studentName={report.student.name} insight={report.vocabInsight} />
            <RelationInsightPanel studentName={report.student.name} insight={report.relationInsight} />
          </div>
          <p className="mt-2 text-[11px] text-[#7d849b]">
            대시보드의 오늘 기준 스냅샷이에요. 기간별 이력이 아니라 지금 시점의 위치를 참고용으로 보여줘요.
          </p>
        </ReportSection>

        <ReportSection title="2. 학생관찰일지 태그 기록">
          {report.observations.length === 0 ? (
            <Empty>이 기간에 태그된 관찰 기록이 없어요.</Empty>
          ) : (
            <ul className="space-y-3">
              {report.observations.map((observation) => (
                <li key={observation.id} className="break-inside-avoid">
                  <div className={timestampText}>
                    발생 {formatKstDate(toKstDate(observation.occurredAt))} · 기록 {formatKstDateTime(observation.createdAt)}
                  </div>
                  {observation.title && <div className="text-[13px] font-bold">{observation.title}</div>}
                  <p className="text-[13px] leading-[1.7] whitespace-pre-wrap">{observation.body}</p>
                </li>
              ))}
            </ul>
          )}
        </ReportSection>

        <ReportSection title="3. AI 분석 요약">
          {report.analyses.length > 0 && (
            <ReportAiSummary
              key={`${report.from}|${report.to}`}
              studentId={report.student.studentId}
              from={report.from}
              to={report.to}
            />
          )}
          {report.analyses.length > 0 && <div className="mb-1.5 text-[11px] font-bold text-[#7d849b]">날짜별 분석</div>}
          {report.analyses.length === 0 ? (
            <Empty>이 기간에 AI 분석이 없어요.</Empty>
          ) : (
            <ul className="space-y-2" aria-label="날짜별 분석">
              {report.analyses.map((analysis) => (
                <li key={analysis.analysisId} className="break-inside-avoid text-[13px] leading-[1.6]">
                  <span className="mr-2 font-semibold">{formatKstDate(analysis.date)}</span>
                  {analysis.summary}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-[#7d849b]">AI 분석은 대화를 요약한 참고 자료이며 진단이나 판정이 아닙니다.</p>
        </ReportSection>

        <footer className="mt-6 border-t border-[#e6e2fb] pt-3 text-[11px] leading-[1.6] text-[#7d849b]">
          이 자료는 생성 시각 기준으로 원본 기록을 모은 것입니다. 원본 기록은 저장 이후 수정되지 않습니다.
        </footer>
      </article>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2.5 font-[family-name:var(--font-cute)] text-[17px] font-normal text-[#102a56]">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-[#aab0c4]">{children}</p>;
}

function VocabInsightPanel({ studentName, insight }: { studentName: string; insight: VocabInsight }) {
  const { studentCount, classAverage } = insight;
  const maxValue = Math.max(studentCount, classAverage, 1);
  const bars = [
    { label: studentName, value: studentCount, highlight: true },
    { label: "학급 평균", value: classAverage, highlight: false },
  ];

  return (
    <div className="flex h-full flex-col rounded-[10px] bg-[#f5f3ff] px-3.5 py-3 break-inside-avoid">
      <div className="mb-3 text-xs font-bold text-[#7d849b]">감정 어휘 성장 · 누적</div>

      <div className="flex flex-1 items-center justify-center">
        <div className="flex h-28 items-end justify-center gap-10">
          {bars.map((b) => (
            <div key={b.label} className="flex flex-col items-center gap-1.5">
              <span className={`text-sm font-extrabold ${b.highlight ? "text-[#635bff]" : "text-[#7d849b]"}`}>
                {b.value}
              </span>
              <div className="flex h-20 w-10 items-end rounded-md bg-black/5">
                <div
                  className={`w-full rounded-md ${b.highlight ? "bg-[#8b83ff]" : "bg-[#cfcafa]"}`}
                  style={{ height: `${Math.max(8, Math.round((b.value / maxValue) * 100))}%` }}
                />
              </div>
              <span className="text-[11px] font-medium text-[#5d6580]">{b.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RelationInsightPanel({ studentName, insight }: { studentName: string; insight: RelationInsight }) {
  const { connections } = insight;
  if (connections.length === 0) {
    return (
      <div className="rounded-[10px] bg-[#f5f3ff] px-3.5 py-3 break-inside-avoid">
        <div className="mb-2 text-xs font-bold text-[#7d849b]">관계 지도</div>
        <Empty>최근 4주간 언급을 주고받은 관계가 없어요.</Empty>
      </div>
    );
  }

  const cx = 140;
  const cy = 96;
  const ring = 66;
  const points = connections.map((c, i) => {
    const angle = (2 * Math.PI * i) / connections.length - Math.PI / 2;
    return { ...c, x: cx + ring * Math.cos(angle), y: cy + ring * Math.sin(angle) };
  });

  return (
    <div className="rounded-[10px] bg-[#f5f3ff] px-3.5 py-3 break-inside-avoid">
      <div className="mb-2 text-xs font-bold text-[#7d849b]">관계 지도 · {studentName} 중심</div>
      <svg viewBox="0 0 280 190" role="img" aria-label={`${studentName} 관계 지도`} className="w-full">
        {points.map((p) => (
          <line
            key={`${p.studentId}-line`}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke={p.kind === "conflict" ? "#f43f5e" : "#b7bfc9"}
            strokeWidth={p.kind === "conflict" ? 2 : 1.5}
            strokeDasharray={p.kind === "conflict" ? "5 4" : undefined}
          />
        ))}
        <circle cx={cx} cy={cy} r={24} fill="#eef2ff" stroke="#818cf8" strokeWidth={2} />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#3730a3">
          {studentName}
        </text>
        {points.map((p) => (
          <g key={p.studentId}>
            <circle cx={p.x} cy={p.y} r={18} fill="#fff" stroke="#c7d2df" strokeWidth={1.5} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="10" fontWeight="600" fill="#374151">
              {p.name}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-1 text-[11px] text-[#7d849b]">점선 · 붉은 선은 갈등으로 기록된 관계예요.</p>
    </div>
  );
}
