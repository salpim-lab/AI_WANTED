// 담당: 진승혜
// 대시보드 영역 1: 아침 브리핑 — 대시보드에서 가장 먼저 읽혀야 하는 카드다.
// "아침 브리핑" 이라는 제목 줄은 없앴다. 카드 이름을 한 번 읽히게 하려고 한 단을 쓰고
// 정작 볼 것("살펴볼 아이", "예정된 상담")을 아래로 밀어내던 구조였다.
// 이제 그 두 묶음이 카드 제목과 같은 층위에 나란히 선다 — 박스는 지금처럼 하나 그대로다.
// 감정 신호(색) 축만 담당한다: 오늘 색이 걸리는 아이를 한 줄로 보여준다.
//   - 칭찬("한마디 돌려줄 아이") 열은 뺐다. 아침에 교사가 쓸 시간은 살펴볼 아이에게 간다.
//   - 요일·시간표 교차 같은 반복 패턴은 여기가 아니라 패턴 경고 카드가 맡는다.
// 경고창처럼 보이지 않게: 테두리·경고색 대신 부드러운 배경 row + 이름/상태/이유의 3단 위계.
// 목록은 아래로 길어지지 않게 가로로 쌓고, 넘치면 ‹ › 버튼·스크롤로 옆으로 넘긴다 (HorizontalScroller).
// 그날 예정된 상담은 학생 상담 한 줄, 학부모 상담 한 줄로 갈라 쌓는다 — 데이터는 김현우 담당 상담기록.
// 섞어 두면 "오늘 학부모 전화가 몇 건인지"를 시각 순서를 따라가며 세어야 했다.
// 줄마다 위 "살펴볼 아이"와 같은 가로 카로셀이라, 한 종류가 네 건이어도 옆으로 넘어간다.
// 상담 행의 ✎ 버튼으로 예정 일시·대상·방식을 바꿀 수 있다 (저장은 김현우 담당 Server Action).
// 행을 누르면 가는 곳이 종류마다 다르다: 학생 상담은 업무기록의 "학생 상담 기록" 팝업이
// 그 아이·그 시각으로 채워진 채 열리고(?consult=&at=), 학부모 상담은 학부모상담기록 화면으로 간다.
// 참고: 살핌_기획안.md "6.2 아침 브리핑"
// 데이터: page.tsx 가 선택 날짜의 morning checkin 기준으로 조립해 props 로 내려준다.
// 링크는 기존 /students/[id], /consultation 유지 (김현우 담당 화면 — 구현은 건드리지 않는다)

import Link from "next/link";
import { toKstDate } from "@/components/shared/datetime";
import HorizontalScroller from "@/components/shared/HorizontalScroller";
// 오른쪽 위로 나가는 화살표 — 학부모상담기록 카드와 똑같은 SVG 를 그대로 쓴다 (김현우 담당 공용 조각)
import { ArrowUpRightIcon } from "@/components/teacher/consultation/consultationCardParts";
import EditScheduledConsultationButton from "@/components/teacher/consultation/EditScheduledConsultationButton";
import type { BriefingStudent } from "./mockData";
import type { ConsultationMethod, ScheduledConsultation } from "@/lib/types/teacherRecord";

const TONE_CLASS: Record<BriefingStudent["tone"], string> = {
  green: "tone-green",
  yellow: "tone-yellow",
  red: "tone-red",
  navy: "tone-navy",
};

const METHOD_LABEL: Record<ConsultationMethod, string> = { phone: "전화", visit: "방문", online: "온라인" };

// 상담 대상이 "학생 본인"이면 학생 상담, 그 밖(어머니·아버지 등)은 학부모 상담
const isStudentConsultation = (c: ScheduledConsultation) => c.counterpart === "학생 본인";

function formatKstTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" });
}

/** 상담 한 줄 — 위 "살펴볼 아이"와 같은 가로 카로셀이다 (넘치면 ‹ › 로 옆으로 넘어간다).
    한 종류가 없는 날에도 줄은 남긴다: 두 줄의 자리가 날마다 바뀌면 "학부모 상담은 아래 줄"이라는
    눈의 기억이 깨져서, 매번 어느 줄이 무엇인지 다시 읽어야 한다.
    줄 이름은 작은 소제목으로 왼쪽에 세워 둔다 — 한쪽이 비는 날(학부모 상담만 있는 날)에
    행만 덩그러니 남으면 그게 어느 줄인지 알 수 없고, 빈 줄은 그냥 빈칸으로 읽힌다.
    카드 안 행마다 "학생 상담"을 또 적지는 않는다: 소제목이 그 줄 전체를 이미 말한다. */
/** 학생 상담은 업무기록의 상담 기록 팝업으로, 학부모 상담은 학부모상담기록 화면으로 */
function hrefFor(c: ScheduledConsultation): string {
  if (!isStudentConsultation(c)) return "/consultation";
  const query = new URLSearchParams({
    date: toKstDate(c.scheduledAt),
    consult: c.student.studentId,
    at: c.scheduledAt,
  });
  return `/observation?${query.toString()}`;
}

function ConsultationRow({ kind, rows }: { kind: string; rows: ScheduledConsultation[] }) {
  return (
    <div className="briefing-consult-row">
      <div className="briefing-row-label">
        {kind}
        <span className="briefing-row-count">{rows.length}건</span>
      </div>
      {rows.length === 0 ? <p className="briefing-row-empty">예정된 일정이 없어요</p> : <Rows kind={kind} rows={rows} />}
    </div>
  );
}

function Rows({ kind, rows }: { kind: string; rows: ScheduledConsultation[] }) {
  return (
    <HorizontalScroller listClassName="briefing-list" label={`예정된 ${kind}`}>
      {rows.map((c) => (
        <li key={c.id} className="briefing-consult-item">
          <Link href={hrefFor(c)} className="briefing-row briefing-consult">
            <span className="briefing-time">{formatKstTime(c.scheduledAt)}</span>
            <span className="briefing-info">
              <span className="briefing-line">
                <strong className="bname">{c.student.name}</strong>
                <span className="bstatus">{METHOD_LABEL[c.method]}</span>
              </span>
              <span className="breason">{c.counterpart}</span>
            </span>
          </Link>
          <EditScheduledConsultationButton consultation={c} variant="icon" className="briefing-edit" />
        </li>
      ))}
    </HorizontalScroller>
  );
}

export default function MorningBriefing({
  watch,
  consultations,
  isToday,
}: {
  watch: BriefingStudent[];
  consultations: ScheduledConsultation[];
  isToday: boolean;
}) {
  // 대상이 "학생 본인"인 건만 학생 상담 줄로 간다. 두 줄 다 시각 순서는 원본 그대로다.
  const studentConsultations = consultations.filter(isStudentConsultation);
  const parentConsultations = consultations.filter((c) => !isStudentConsultation(c));

  return (
    <section className="card briefing-card">
      <div className="card-title">{isToday ? "오늘 먼저 살펴볼 아이" : "먼저 살펴본 아이"}</div>

      <HorizontalScroller listClassName="briefing-list" label="먼저 살펴볼 아이">
        {watch.map((s) => (
          <li key={s.studentId}>
            <Link href={`/students/${s.studentId}`} className={`briefing-row group ${TONE_CLASS[s.tone]}`}>
              <span className="briefing-avatar" aria-hidden />
              <span className="briefing-info">
                <span className="briefing-line">
                  <strong className="bname">{s.name}</strong>
                  <span className="bstatus">{s.status}</span>
                </span>
                <span className="breason">{s.reason}</span>
              </span>
              {/* 같은 화면 안에서 옆으로 가는 게 아니라 아이 상세로 빠져나간다 — 학부모상담기록과 같은 화살표 */}
              <ArrowUpRightIcon />
            </Link>
          </li>
        ))}
      </HorizontalScroller>

      <div className="card-title briefing-title-next">
        {isToday ? "오늘 예정된 상담" : "이 날 예정된 상담"}
        {/* 종류별 건수는 아래 두 줄의 소제목이 말한다 — 여기서 또 세지 않는다 */}
        <span className="card-sub">{consultations.length}건</span>
      </div>

      {consultations.length === 0 ? (
        <p className="briefing-empty">예정된 상담이 없어요</p>
      ) : (
        <div className="briefing-consult-rows">
          <ConsultationRow kind="학생 상담" rows={studentConsultations} />
          <ConsultationRow kind="학부모 상담" rows={parentConsultations} />
        </div>
      )}
    </section>
  );
}
